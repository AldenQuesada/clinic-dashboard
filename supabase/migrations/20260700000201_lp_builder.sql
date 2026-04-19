-- ============================================================
-- Migration: LP Builder — Landing Pages profissionais editaveis
--
-- Sistema separado do page_templates (que serve p.html?s=).
-- LPs = paginas premium com schema fixo de blocos canonicos
-- (hero-split, problema, cards-2col, faq, cta-final, etc.).
--
-- Tabelas:
--   lp_pages     — uma linha por LP (slug, title, blocks jsonb, tokens override)
--   lp_revisions — snapshots pra undo/historico
--
-- RPCs:
--   public:  lp_page_resolve, lp_page_track_view, lp_page_track_conversion
--   admin:   lp_page_list, lp_page_get, lp_page_save, lp_page_delete,
--            lp_page_publish, lp_revision_create, lp_revision_restore,
--            lp_revision_list
--
-- Idempotente. clinic_id hardcoded (mesma convencao do projeto).
-- ============================================================

-- ── 1. TABELAS ──────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.lp_pages (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  slug                text NOT NULL,
  title               text NOT NULL,
  status              text NOT NULL DEFAULT 'draft',  -- draft | published | archived
  -- conteudo: array de blocos { type, props }
  blocks              jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- tokens override: substitui valores do design system por LP
  -- ex: { "colors.champagne": "#D4B896", "typography.h1.size.mobile": 28 }
  tokens_override     jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- meta opcionais
  meta_title          text,
  meta_description    text,
  og_image_url        text,
  -- analytics
  views               int  NOT NULL DEFAULT 0,
  conversions         int  NOT NULL DEFAULT 0,
  -- referencia pra revision atual (opcional, util pra rollback rapido)
  current_revision_id uuid,
  -- timestamps
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  published_at        timestamptz,
  CONSTRAINT lp_pages_slug_clinic_uq UNIQUE (clinic_id, slug),
  CONSTRAINT lp_pages_status_chk     CHECK (status IN ('draft','published','archived'))
);

CREATE INDEX IF NOT EXISTS idx_lp_pages_slug    ON public.lp_pages (slug);
CREATE INDEX IF NOT EXISTS idx_lp_pages_status  ON public.lp_pages (status);
CREATE INDEX IF NOT EXISTS idx_lp_pages_updated ON public.lp_pages (updated_at DESC);

CREATE TABLE IF NOT EXISTS public.lp_revisions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  page_id     uuid NOT NULL REFERENCES public.lp_pages(id) ON DELETE CASCADE,
  -- snapshot completo: { blocks, tokens_override, title, meta_*, og_image_url }
  snapshot    jsonb NOT NULL,
  -- label opcional ("antes-publish", "auto-save", "before-ai-rewrite", etc.)
  label       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  created_by  text  -- 'admin' | 'auto' | 'ai' (livre, sem FK)
);

CREATE INDEX IF NOT EXISTS idx_lp_revisions_page ON public.lp_revisions (page_id, created_at DESC);

-- ── 2. RLS ──────────────────────────────────────────────────

ALTER TABLE public.lp_pages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lp_revisions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS lp_pages_clinic     ON public.lp_pages;
DROP POLICY IF EXISTS lp_revisions_clinic ON public.lp_revisions;

CREATE POLICY lp_pages_clinic ON public.lp_pages
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE POLICY lp_revisions_clinic ON public.lp_revisions
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- ── 3. TRIGGER updated_at ───────────────────────────────────

CREATE OR REPLACE FUNCTION public._lp_pages_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_lp_pages_updated ON public.lp_pages;
CREATE TRIGGER trg_lp_pages_updated
  BEFORE UPDATE ON public.lp_pages
  FOR EACH ROW EXECUTE FUNCTION public._lp_pages_set_updated_at();

-- ============================================================
-- 4. RPCs PUBLICAS (renderer e tracking)
-- ============================================================

-- Resolve LP por slug (apenas publicadas)
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
    'tokens_override', v_page.tokens_override
  );
END $$;

GRANT EXECUTE ON FUNCTION public.lp_page_resolve(text) TO anon, authenticated;

-- Track view (incrementa contador, fire-and-forget)
CREATE OR REPLACE FUNCTION public.lp_page_track_view(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.lp_pages
     SET views = views + 1
   WHERE slug = p_slug AND status = 'published';
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_page_track_view(text) TO anon, authenticated;

-- Track conversion (incrementa conversions, ao clicar CTA WA)
CREATE OR REPLACE FUNCTION public.lp_page_track_conversion(p_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.lp_pages
     SET conversions = conversions + 1
   WHERE slug = p_slug AND status = 'published';
  RETURN jsonb_build_object('ok', true);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_page_track_conversion(text) TO anon, authenticated;

-- ============================================================
-- 5. RPCs ADMIN
-- ============================================================

-- List paginas (sem o blocks pra payload menor)
CREATE OR REPLACE FUNCTION public.lp_page_list()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',           p.id,
        'slug',         p.slug,
        'title',        p.title,
        'status',       p.status,
        'views',        p.views,
        'conversions',  p.conversions,
        'updated_at',   p.updated_at,
        'published_at', p.published_at,
        'block_count',  jsonb_array_length(p.blocks)
      ) ORDER BY p.updated_at DESC
    )
    FROM public.lp_pages p
    WHERE p.clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
      AND p.status <> 'archived'
  ), '[]'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_page_list() TO anon, authenticated;

-- Get single page (com blocks completos)
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
    'created_at',       v_row.created_at,
    'updated_at',       v_row.updated_at,
    'published_at',     v_row.published_at
  );
END $$;

GRANT EXECUTE ON FUNCTION public.lp_page_get(uuid) TO anon, authenticated;

-- Save (upsert) — todos os campos opcionais (so atualiza nao-nulos)
CREATE OR REPLACE FUNCTION public.lp_page_save(
  p_id              uuid    DEFAULT NULL,
  p_slug            text    DEFAULT NULL,
  p_title           text    DEFAULT NULL,
  p_blocks          jsonb   DEFAULT NULL,
  p_tokens_override jsonb   DEFAULT NULL,
  p_status          text    DEFAULT NULL,
  p_meta_title      text    DEFAULT NULL,
  p_meta_description text   DEFAULT NULL,
  p_og_image_url    text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_id IS NOT NULL THEN
    UPDATE public.lp_pages SET
      slug             = COALESCE(p_slug,             slug),
      title            = COALESCE(p_title,            title),
      blocks           = COALESCE(p_blocks,           blocks),
      tokens_override  = COALESCE(p_tokens_override,  tokens_override),
      status           = COALESCE(p_status,           status),
      meta_title       = COALESCE(p_meta_title,       meta_title),
      meta_description = COALESCE(p_meta_description, meta_description),
      og_image_url     = COALESCE(p_og_image_url,     og_image_url),
      published_at     = CASE WHEN p_status = 'published' AND status <> 'published'
                              THEN now() ELSE published_at END
    WHERE id = p_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'page_not_found');
    END IF;
  ELSE
    -- INSERT
    IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'slug_required');
    END IF;

    INSERT INTO public.lp_pages (
      slug, title, blocks, tokens_override, status,
      meta_title, meta_description, og_image_url, published_at
    ) VALUES (
      p_slug,
      COALESCE(p_title, 'Nova Landing Page'),
      COALESCE(p_blocks, '[]'::jsonb),
      COALESCE(p_tokens_override, '{}'::jsonb),
      COALESCE(p_status, 'draft'),
      p_meta_title,
      p_meta_description,
      p_og_image_url,
      CASE WHEN p_status = 'published' THEN now() ELSE NULL END
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
EXCEPTION WHEN unique_violation THEN
  RETURN jsonb_build_object('ok', false, 'reason', 'slug_already_exists');
END $$;

GRANT EXECUTE ON FUNCTION public.lp_page_save(
  uuid, text, text, jsonb, jsonb, text, text, text, text
) TO anon, authenticated;

-- Delete (soft via archive, ou hard se forcar)
CREATE OR REPLACE FUNCTION public.lp_page_delete(p_id uuid, p_hard bool DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_hard THEN
    DELETE FROM public.lp_pages WHERE id = p_id;
  ELSE
    UPDATE public.lp_pages SET status = 'archived' WHERE id = p_id;
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_page_delete(uuid, bool) TO anon, authenticated;

-- Publish (atalho seguro)
CREATE OR REPLACE FUNCTION public.lp_page_publish(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.lp_pages
     SET status = 'published',
         published_at = now()
   WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_page_publish(uuid) TO anon, authenticated;

-- ============================================================
-- 6. REVISIONS (undo / historico)
-- ============================================================

-- Cria snapshot da pagina atual
CREATE OR REPLACE FUNCTION public.lp_revision_create(
  p_page_id uuid,
  p_label   text DEFAULT NULL,
  p_by      text DEFAULT 'auto'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_page public.lp_pages%ROWTYPE;
  v_id   uuid;
BEGIN
  SELECT * INTO v_page FROM public.lp_pages WHERE id = p_page_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'page_not_found');
  END IF;

  INSERT INTO public.lp_revisions (page_id, snapshot, label, created_by)
  VALUES (
    p_page_id,
    jsonb_build_object(
      'title',            v_page.title,
      'blocks',           v_page.blocks,
      'tokens_override',  v_page.tokens_override,
      'meta_title',       v_page.meta_title,
      'meta_description', v_page.meta_description,
      'og_image_url',     v_page.og_image_url,
      'status',           v_page.status
    ),
    p_label,
    p_by
  )
  RETURNING id INTO v_id;

  -- atualiza ponteiro current_revision_id
  UPDATE public.lp_pages SET current_revision_id = v_id WHERE id = p_page_id;

  -- limpa revisions antigas (mantem ultimas 50 por pagina)
  DELETE FROM public.lp_revisions
   WHERE page_id = p_page_id
     AND id NOT IN (
       SELECT id FROM public.lp_revisions
        WHERE page_id = p_page_id
        ORDER BY created_at DESC
        LIMIT 50
     );

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_revision_create(uuid, text, text) TO anon, authenticated;

-- Restaura uma revision (sobrescreve a pagina atual)
CREATE OR REPLACE FUNCTION public.lp_revision_restore(p_revision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rev public.lp_revisions%ROWTYPE;
BEGIN
  SELECT * INTO v_rev FROM public.lp_revisions WHERE id = p_revision_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'revision_not_found');
  END IF;

  -- snapshot antes de restaurar (pra undo do undo)
  PERFORM public.lp_revision_create(v_rev.page_id, 'before-restore', 'system');

  UPDATE public.lp_pages SET
    title            = COALESCE(v_rev.snapshot->>'title',            title),
    blocks           = COALESCE(v_rev.snapshot->'blocks',            blocks),
    tokens_override  = COALESCE(v_rev.snapshot->'tokens_override',   tokens_override),
    meta_title       = v_rev.snapshot->>'meta_title',
    meta_description = v_rev.snapshot->>'meta_description',
    og_image_url     = v_rev.snapshot->>'og_image_url'
  WHERE id = v_rev.page_id;

  RETURN jsonb_build_object('ok', true, 'page_id', v_rev.page_id);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_revision_restore(uuid) TO anon, authenticated;

-- Lista revisions de uma pagina (sem snapshot pra payload menor)
CREATE OR REPLACE FUNCTION public.lp_revision_list(p_page_id uuid, p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',          r.id,
        'label',       r.label,
        'created_by',  r.created_by,
        'created_at',  r.created_at
      ) ORDER BY r.created_at DESC
    )
    FROM (
      SELECT * FROM public.lp_revisions
       WHERE page_id = p_page_id
       ORDER BY created_at DESC
       LIMIT GREATEST(1, LEAST(p_limit, 100))
    ) r
  ), '[]'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.lp_revision_list(uuid, int) TO anon, authenticated;

-- ── FK do current_revision_id (pos-criacao das duas tabelas) ─
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE constraint_name = 'lp_pages_current_revision_fk'
       AND table_name = 'lp_pages'
  ) THEN
    ALTER TABLE public.lp_pages
      ADD CONSTRAINT lp_pages_current_revision_fk
      FOREIGN KEY (current_revision_id)
      REFERENCES public.lp_revisions(id) ON DELETE SET NULL;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[lp_builder] FK current_revision_id skipped: %', SQLERRM;
END $$;

-- ── Comentarios ─────────────────────────────────────────────
COMMENT ON TABLE  public.lp_pages     IS 'Landing pages premium editaveis pelo LP Builder';
COMMENT ON TABLE  public.lp_revisions IS 'Snapshots historicos pra undo (max 50 por pagina)';
COMMENT ON COLUMN public.lp_pages.blocks IS 'Array de { type, props } — schema em LPBSchema (lpb-schema.js)';
COMMENT ON COLUMN public.lp_pages.tokens_override IS 'Overrides do design system: { "colors.champagne": "#X", "typography.h1.size.mobile": 28 }';
