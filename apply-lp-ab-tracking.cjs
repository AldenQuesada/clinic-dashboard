/* ============================================================
 * apply-lp-ab-tracking.cjs
 *
 *   · Adiciona ab_variant_slug + tracking jsonb em lp_pages
 *   · RPC lp_page_duplicate(source_id, new_slug, new_title)
 *   · RPC lp_page_set_tracking(p_id, p_tracking)
 *   · RPC lp_page_set_ab_variant(p_id, p_variant_slug)
 *   · Atualiza lp_page_resolve pra retornar tracking + ab_variant_slug
 *
 * Idempotente.
 *
 * Uso:
 *   node apply-lp-ab-tracking.cjs
 * ============================================================ */

const { Client } = require('pg')

const sql = `
ALTER TABLE public.lp_pages
  ADD COLUMN IF NOT EXISTS ab_variant_slug text;

ALTER TABLE public.lp_pages
  ADD COLUMN IF NOT EXISTS tracking jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_lp_pages_ab ON public.lp_pages (ab_variant_slug)
  WHERE ab_variant_slug IS NOT NULL;

-- Resolve atualizado: inclui tracking e ab_variant_slug no retorno publico
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
    'ab_variant_slug', v_page.ab_variant_slug
  );
END $$;

-- Duplicate page
CREATE OR REPLACE FUNCTION public.lp_page_duplicate(
  p_source_id uuid,
  p_new_slug  text,
  p_new_title text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_src public.lp_pages%ROWTYPE;
  v_id  uuid;
BEGIN
  IF p_new_slug IS NULL OR length(trim(p_new_slug)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'slug_required');
  END IF;

  SELECT * INTO v_src FROM public.lp_pages WHERE id = p_source_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'source_not_found');
  END IF;

  INSERT INTO public.lp_pages (
    slug, title, blocks, tokens_override, status,
    meta_title, meta_description, og_image_url, tracking, ab_variant_slug
  ) VALUES (
    p_new_slug,
    COALESCE(p_new_title, v_src.title || ' (cópia)'),
    v_src.blocks,
    v_src.tokens_override,
    'draft',                    -- sempre cria como rascunho
    v_src.meta_title,
    v_src.meta_description,
    v_src.og_image_url,
    v_src.tracking,
    NULL                        -- não copia AB variant (evita loop)
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'slug_already_exists');
END $$;

-- Set tracking
CREATE OR REPLACE FUNCTION public.lp_page_set_tracking(
  p_id uuid,
  p_tracking jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_tracking IS NULL OR jsonb_typeof(p_tracking) <> 'object' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'tracking_invalid');
  END IF;
  UPDATE public.lp_pages
     SET tracking = p_tracking,
         updated_at = now()
   WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Set AB variant
CREATE OR REPLACE FUNCTION public.lp_page_set_ab_variant(
  p_id uuid,
  p_variant_slug text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.lp_pages
     SET ab_variant_slug = NULLIF(trim(COALESCE(p_variant_slug, '')), ''),
         updated_at = now()
   WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

-- Atualiza lp_page_list pra incluir tracking flag + ab_variant_slug
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
        'ab_variant_slug', p.ab_variant_slug
      ) ORDER BY p.updated_at DESC
    )
    FROM public.lp_pages p
    WHERE p.clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND p.status <> 'archived'
  ), '[]'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_page_duplicate(uuid, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lp_page_set_tracking(uuid, jsonb)    TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lp_page_set_ab_variant(uuid, text)   TO anon, authenticated;

COMMENT ON COLUMN public.lp_pages.ab_variant_slug IS 'Slug da variant B pra split 50/50 · null = sem AB test';
COMMENT ON COLUMN public.lp_pages.tracking IS 'Pixels/tags: { ga4_id, fb_pixel_id, gtm_id, custom_head_html }';
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
    console.log('[ab-tracking] migration aplicada')

    var fn = await c.query(`
      SELECT proname FROM pg_proc
      WHERE proname IN ('lp_page_duplicate','lp_page_set_tracking','lp_page_set_ab_variant','lp_page_list','lp_page_resolve')
      ORDER BY proname
    `)
    console.log('[ab-tracking] RPCs:', fn.rows.map(r => r.proname).join(', '))
  } catch (e) {
    console.error('ERROR:', e.message); process.exit(1)
  } finally {
    await c.end()
  }
})()
