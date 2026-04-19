/* ============================================================
 * apply-lp-schedule.cjs (Onda 23)
 *
 *   · colunas lp_pages.publish_at / unpublish_at timestamptz
 *   · RPC lp_page_set_schedule(id, publish_at, unpublish_at)
 *   · RPC lp_page_clear_schedule(id)
 *   · Função lp_pages_apply_schedule() — promove draft→published e
 *     published→archived conforme datas
 *   · pg_cron job 'lp_schedule_apply' rodando a cada 5min (se extension disponível)
 *
 * Idempotente. Uso: node apply-lp-schedule.cjs
 * ============================================================ */

const { Client } = require('pg')

const sql = `
ALTER TABLE public.lp_pages
  ADD COLUMN IF NOT EXISTS publish_at   timestamptz,
  ADD COLUMN IF NOT EXISTS unpublish_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_lp_pages_publish_at   ON public.lp_pages (publish_at)   WHERE publish_at   IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_lp_pages_unpublish_at ON public.lp_pages (unpublish_at) WHERE unpublish_at IS NOT NULL;

-- ── Set schedule ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lp_page_set_schedule(
  p_id           uuid,
  p_publish_at   timestamptz DEFAULT NULL,
  p_unpublish_at timestamptz DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_publish_at IS NOT NULL AND p_unpublish_at IS NOT NULL
     AND p_unpublish_at <= p_publish_at THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unpublish_before_publish');
  END IF;
  UPDATE public.lp_pages
     SET publish_at   = p_publish_at,
         unpublish_at = p_unpublish_at,
         updated_at   = now()
   WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_page_set_schedule(uuid, timestamptz, timestamptz) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.lp_page_clear_schedule(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.lp_pages
     SET publish_at   = NULL,
         unpublish_at = NULL,
         updated_at   = now()
   WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_page_clear_schedule(uuid) TO anon, authenticated;

-- ── Aplicador (chamado por cron) ─────────────────────────
CREATE OR REPLACE FUNCTION public.lp_pages_apply_schedule()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_published int;
  v_archived  int;
BEGIN
  -- draft/scheduled → published quando publish_at <= now()
  WITH up AS (
    UPDATE public.lp_pages
       SET status       = 'published',
           published_at = COALESCE(published_at, now()),
           updated_at   = now()
     WHERE status IN ('draft', 'scheduled')
       AND publish_at IS NOT NULL
       AND publish_at <= now()
       AND (unpublish_at IS NULL OR unpublish_at > now())
    RETURNING 1
  )
  SELECT count(*) INTO v_published FROM up;

  -- published → archived quando unpublish_at <= now()
  WITH dn AS (
    UPDATE public.lp_pages
       SET status     = 'archived',
           updated_at = now()
     WHERE status = 'published'
       AND unpublish_at IS NOT NULL
       AND unpublish_at <= now()
    RETURNING 1
  )
  SELECT count(*) INTO v_archived FROM dn;

  RETURN jsonb_build_object(
    'ok',         true,
    'published',  v_published,
    'archived',   v_archived,
    'ran_at',     now()
  );
END $$;

GRANT EXECUTE ON FUNCTION public.lp_pages_apply_schedule() TO anon, authenticated;

-- ── pg_cron job (se extension disponível) ────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- remove job antigo se existir, recria
    PERFORM cron.unschedule(jobid)
      FROM cron.job WHERE jobname = 'lp_schedule_apply';
    PERFORM cron.schedule(
      'lp_schedule_apply',
      '*/5 * * * *',
      $cron$ SELECT public.lp_pages_apply_schedule(); $cron$
    );
  END IF;
END $$;

-- ── Atualiza lp_page_resolve para checar agenda em runtime
-- (fallback quando cron ainda não rodou)
CREATE OR REPLACE FUNCTION public.lp_page_resolve(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_page public.lp_pages%ROWTYPE;
BEGIN
  SELECT * INTO v_page
    FROM public.lp_pages
   WHERE slug = p_slug
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Checa schedule em runtime (cobre janela entre cron runs)
  IF v_page.status = 'archived' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_page.unpublish_at IS NOT NULL AND v_page.unpublish_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;
  IF v_page.status <> 'published' THEN
    -- só serve published OU scheduled-com-publish-passado
    IF NOT (v_page.publish_at IS NOT NULL AND v_page.publish_at <= now()) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_published');
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'id',              v_page.id,
    'slug',            v_page.slug,
    'title',           v_page.title,
    'meta_title',      v_page.meta_title,
    'meta_description',v_page.meta_description,
    'og_image_url',    v_page.og_image_url,
    'blocks',          v_page.blocks,
    'tokens_override', v_page.tokens_override,
    'tracking',        COALESCE(v_page.tracking, '{}'::jsonb),
    'ab_variant_slug', v_page.ab_variant_slug,
    'schema_org',      COALESCE(v_page.schema_org, '{}'::jsonb),
    'lgpd_config',     COALESCE(v_page.lgpd_config, '{}'::jsonb)
  );
END $$;

-- Atualiza lp_page_get pra retornar publish_at/unpublish_at
CREATE OR REPLACE FUNCTION public.lp_page_get(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_row public.lp_pages%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.lp_pages WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false); END IF;
  RETURN jsonb_build_object(
    'ok',               true,
    'id',               v_row.id,
    'slug',             v_row.slug,
    'title',            v_row.title,
    'status',           v_row.status,
    'blocks',           v_row.blocks,
    'tokens_override',  v_row.tokens_override,
    'meta_title',       v_row.meta_title,
    'meta_description', v_row.meta_description,
    'og_image_url',     v_row.og_image_url,
    'views',            v_row.views,
    'conversions',      v_row.conversions,
    'tracking',         COALESCE(v_row.tracking, '{}'::jsonb),
    'ab_variant_slug',  v_row.ab_variant_slug,
    'schema_org',       COALESCE(v_row.schema_org, '{}'::jsonb),
    'lgpd_config',      COALESCE(v_row.lgpd_config, '{}'::jsonb),
    'publish_at',       v_row.publish_at,
    'unpublish_at',     v_row.unpublish_at,
    'created_at',       v_row.created_at,
    'updated_at',       v_row.updated_at,
    'published_at',     v_row.published_at
  );
END $$;
GRANT EXECUTE ON FUNCTION public.lp_page_get(uuid) TO anon, authenticated;

-- Atualiza lp_page_list pra incluir agendamento
CREATE OR REPLACE FUNCTION public.lp_page_list()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',              p.id,
        'slug',            p.slug,
        'title',           p.title,
        'status',          p.status,
        'views',           p.views,
        'conversions',     p.conversions,
        'updated_at',      p.updated_at,
        'published_at',    p.published_at,
        'block_count',     jsonb_array_length(p.blocks),
        'tracking',        COALESCE(p.tracking, '{}'::jsonb),
        'ab_variant_slug', p.ab_variant_slug,
        'schema_org',      COALESCE(p.schema_org, '{}'::jsonb),
        'lgpd_config',     COALESCE(p.lgpd_config, '{}'::jsonb),
        'publish_at',      p.publish_at,
        'unpublish_at',    p.unpublish_at
      ) ORDER BY p.updated_at DESC
    )
    FROM public.lp_pages p
    WHERE p.clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND p.status <> 'archived'
  ), '[]'::jsonb);
END $$;

COMMENT ON COLUMN public.lp_pages.publish_at   IS 'Data agendada pra publicar automaticamente (Onda 23)';
COMMENT ON COLUMN public.lp_pages.unpublish_at IS 'Data agendada pra arquivar automaticamente (campanhas sazonais)';
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
    console.log('[schedule] migration aplicada')
  } catch (e) {
    console.error('ERROR:', e.message); process.exit(1)
  } finally {
    await c.end()
  }
})()
