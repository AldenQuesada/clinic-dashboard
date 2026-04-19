/* ============================================================
 * apply-lp-analytics.cjs
 *
 * RPC lp_analytics_global — agrega métricas de todas as LPs
 * numa única resposta JSON pra popular o dashboard.
 *
 * Idempotente. Depende de lp_pages + lp_leads (já criadas).
 *
 * Uso:
 *   node apply-lp-analytics.cjs
 * ============================================================ */

const { Client } = require('pg')

const sql = `
CREATE OR REPLACE FUNCTION public.lp_analytics_global(
  p_period_days int DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_since timestamptz := now() - (GREATEST(1, p_period_days) || ' days')::interval;
  v_totals    jsonb;
  v_by_page   jsonb;
  v_by_day    jsonb;
  v_top_views jsonb;
  v_top_rate  jsonb;
  v_status    jsonb;
BEGIN
  -- TOTAIS globais (pages publicadas + soma de views/conversions + count de leads no periodo)
  WITH p AS (
    SELECT id, slug, views, conversions, status
      FROM public.lp_pages
     WHERE status <> 'archived'
  ),
  l AS (
    SELECT page_slug, status, count(*) AS n
      FROM public.lp_leads
     WHERE created_at >= v_since
     GROUP BY page_slug, status
  ),
  l_total AS (
    SELECT count(*) AS n FROM public.lp_leads WHERE created_at >= v_since
  )
  SELECT jsonb_build_object(
    'pages',              (SELECT count(*) FROM p WHERE status = 'published'),
    'pages_draft',        (SELECT count(*) FROM p WHERE status = 'draft'),
    'views',              COALESCE((SELECT sum(views) FROM p), 0),
    'conversions',        COALESCE((SELECT sum(conversions) FROM p), 0),
    'leads',              COALESCE((SELECT n FROM l_total), 0),
    'conversion_rate_pct', CASE
      WHEN COALESCE((SELECT sum(views) FROM p), 0) > 0
      THEN ROUND((COALESCE((SELECT sum(conversions) FROM p), 0)::numeric /
                  (SELECT sum(views) FROM p)::numeric) * 100, 2)
      ELSE 0
    END
  ) INTO v_totals;

  -- POR PÁGINA
  SELECT COALESCE(jsonb_agg(row ORDER BY row->>'views' DESC NULLS LAST), '[]'::jsonb) INTO v_by_page
    FROM (
      SELECT jsonb_build_object(
        'id',           p.id,
        'slug',         p.slug,
        'title',        p.title,
        'status',       p.status,
        'views',        p.views,
        'conversions',  p.conversions,
        'rate',         CASE WHEN p.views > 0
                             THEN ROUND((p.conversions::numeric / p.views::numeric) * 100, 2)
                             ELSE 0 END,
        'leads_period', COALESCE(
          (SELECT count(*) FROM public.lp_leads
             WHERE page_slug = p.slug AND created_at >= v_since), 0),
        'leads_new',    COALESCE(
          (SELECT count(*) FROM public.lp_leads
             WHERE page_slug = p.slug AND status = 'new' AND created_at >= v_since), 0),
        'updated_at',   p.updated_at
      ) AS row
      FROM public.lp_pages p
      WHERE p.status <> 'archived'
    ) sub;

  -- POR DIA (leads) — usa created_at dos leads
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('date', d, 'leads', n) ORDER BY d
  ), '[]'::jsonb) INTO v_by_day
    FROM (
      SELECT date_trunc('day', created_at)::date AS d, count(*) AS n
        FROM public.lp_leads
       WHERE created_at >= v_since
       GROUP BY 1
    ) sub;

  -- TOP 5 por views
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('slug', slug, 'title', title, 'views', views)
    ORDER BY views DESC
  ), '[]'::jsonb) INTO v_top_views
    FROM (
      SELECT slug, title, views
        FROM public.lp_pages
       WHERE status = 'published'
         AND views > 0
       ORDER BY views DESC
       LIMIT 5
    ) sub;

  -- TOP 5 por conversion rate
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object('slug', slug, 'title', title, 'rate', rate, 'views', views)
    ORDER BY rate DESC
  ), '[]'::jsonb) INTO v_top_rate
    FROM (
      SELECT slug, title, views,
             CASE WHEN views > 0
                  THEN ROUND((conversions::numeric / views::numeric) * 100, 2)
                  ELSE 0 END AS rate
        FROM public.lp_pages
       WHERE status = 'published'
         AND views >= 10  -- mínimo de views pra ser significativo
       ORDER BY rate DESC, views DESC
       LIMIT 5
    ) sub;

  -- Distribuição de leads por status
  SELECT COALESCE(jsonb_object_agg(status, n), '{}'::jsonb) INTO v_status
    FROM (
      SELECT status, count(*) AS n
        FROM public.lp_leads
       WHERE created_at >= v_since
       GROUP BY status
    ) sub;

  RETURN jsonb_build_object(
    'period_days', p_period_days,
    'since',       v_since,
    'totals',      v_totals,
    'by_page',     v_by_page,
    'by_day',      v_by_day,
    'top_views',   v_top_views,
    'top_rate',    v_top_rate,
    'by_status',   v_status
  );
END $$;

GRANT EXECUTE ON FUNCTION public.lp_analytics_global(int) TO anon, authenticated;
`

const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

;(async () => {
  try {
    await c.connect()
    await c.query(sql)
    await c.query("NOTIFY pgrst, 'reload schema'")
    console.log('[lp-analytics] RPC criada')

    var r = await c.query(`SELECT public.lp_analytics_global(30) AS result`)
    console.log('[lp-analytics] smoke test (30d):')
    console.log('  pages:', r.rows[0].result.totals && r.rows[0].result.totals.pages)
    console.log('  views:', r.rows[0].result.totals && r.rows[0].result.totals.views)
    console.log('  leads:', r.rows[0].result.totals && r.rows[0].result.totals.leads)
  } catch (e) {
    console.error('ERROR:', e.message); process.exit(1)
  } finally {
    await c.end()
  }
})()
