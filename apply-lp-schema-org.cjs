/* ============================================================
 * apply-lp-schema-org.cjs
 *
 * Adiciona coluna schema_org jsonb em lp_pages + RPC lp_page_set_schema.
 * Atualiza lp_page_resolve e lp_page_list pra retornarem schema_org.
 *
 * Idempotente.
 *
 * Uso:
 *   node apply-lp-schema-org.cjs
 * ============================================================ */

const { Client } = require('pg')

const sql = `
ALTER TABLE public.lp_pages
  ADD COLUMN IF NOT EXISTS schema_org jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE OR REPLACE FUNCTION public.lp_page_set_schema(
  p_id   uuid,
  p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_data IS NULL OR jsonb_typeof(p_data) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'data_invalid');
  END IF;
  UPDATE public.lp_pages
     SET schema_org = p_data,
         updated_at = now()
   WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_page_set_schema(uuid, jsonb) TO anon, authenticated;

-- Atualiza lp_page_resolve
CREATE OR REPLACE FUNCTION public.lp_page_resolve(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_page public.lp_pages%ROWTYPE;
BEGIN
  SELECT * INTO v_page
    FROM public.lp_pages
   WHERE slug = p_slug AND status = 'published'
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
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
    'schema_org',      COALESCE(v_page.schema_org, '{}'::jsonb)
  );
END $$;

-- Atualiza lp_page_get pra retornar schema_org (+ tracking e ab_variant_slug, que faltavam)
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
    'created_at',       v_row.created_at,
    'updated_at',       v_row.updated_at,
    'published_at',     v_row.published_at
  );
END $$;

GRANT EXECUTE ON FUNCTION public.lp_page_get(uuid) TO anon, authenticated;

-- Atualiza lp_page_list pra incluir schema_org flag
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
        'schema_org',      COALESCE(p.schema_org, '{}'::jsonb)
      ) ORDER BY p.updated_at DESC
    )
    FROM public.lp_pages p
    WHERE p.clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND p.status <> 'archived'
  ), '[]'::jsonb);
END $$;

COMMENT ON COLUMN public.lp_pages.schema_org IS 'Dados manuais pra Schema.org JSON-LD (clinic info). O resto é inferido dos blocks.';
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
    console.log('[schema-org] migration aplicada')
  } catch (e) {
    console.error('ERROR:', e.message); process.exit(1)
  } finally {
    await c.end()
  }
})()
