-- ============================================================================
-- Beauty & Health Magazine — RPCs Admin
-- ============================================================================
-- Funcoes chamadas pelo editor admin. Todas SECURITY DEFINER + check de clinic_id.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- magazine_create_edition: cria edicao nova em status draft
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_create_edition(
  p_title      text,
  p_slug       text,
  p_theme      text DEFAULT NULL,
  p_subtitle   text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_edition_id uuid;
  v_next_number int;
BEGIN
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'clinic_id nao encontrado no contexto do usuario';
  END IF;

  SELECT COALESCE(MAX(edition_number), 0) + 1 INTO v_next_number
  FROM public.magazine_editions
  WHERE clinic_id = v_clinic_id;

  INSERT INTO public.magazine_editions (
    clinic_id, slug, title, subtitle, theme, edition_number, status, created_by
  ) VALUES (
    v_clinic_id, p_slug, p_title, p_subtitle, p_theme, v_next_number, 'draft', auth.uid()
  )
  RETURNING id INTO v_edition_id;

  RETURN v_edition_id;
END $$;

-- ----------------------------------------------------------------------------
-- magazine_add_page: adiciona pagina ao final da edicao
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_add_page(
  p_edition_id    uuid,
  p_template_slug text,
  p_slots         jsonb DEFAULT '{}'::jsonb,
  p_segment_scope text[] DEFAULT ARRAY['all']::text[]
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_page_id uuid;
  v_next_order int;
BEGIN
  -- valida ownership
  IF NOT EXISTS (
    SELECT 1 FROM public.magazine_editions
    WHERE id = p_edition_id AND clinic_id = v_clinic_id
  ) THEN
    RAISE EXCEPTION 'Edicao nao encontrada ou sem permissao';
  END IF;

  -- valida template existe
  IF NOT EXISTS (
    SELECT 1 FROM public.magazine_templates WHERE slug = p_template_slug AND active = true
  ) THEN
    RAISE EXCEPTION 'Template % nao existe ou inativo', p_template_slug;
  END IF;

  SELECT COALESCE(MAX(order_index), -1) + 1 INTO v_next_order
  FROM public.magazine_pages
  WHERE edition_id = p_edition_id;

  INSERT INTO public.magazine_pages (
    edition_id, order_index, template_slug, slots, segment_scope
  ) VALUES (
    p_edition_id, v_next_order, p_template_slug, p_slots, p_segment_scope
  )
  RETURNING id INTO v_page_id;

  RETURN v_page_id;
END $$;

-- ----------------------------------------------------------------------------
-- magazine_reorder_pages: reordena todas as paginas da edicao
-- ----------------------------------------------------------------------------
-- Recebe array de uuids na ordem desejada. Atomico.
CREATE OR REPLACE FUNCTION public.magazine_reorder_pages(
  p_edition_id uuid,
  p_page_ids   uuid[]
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_id uuid;
  v_idx int := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.magazine_editions
    WHERE id = p_edition_id AND clinic_id = v_clinic_id
  ) THEN
    RAISE EXCEPTION 'Sem permissao para reordenar esta edicao';
  END IF;

  -- usa UNIQUE DEFERRABLE para permitir swap sem conflito
  SET CONSTRAINTS magazine_pages_order_uk DEFERRED;

  FOREACH v_id IN ARRAY p_page_ids LOOP
    UPDATE public.magazine_pages
       SET order_index = v_idx
     WHERE id = v_id AND edition_id = p_edition_id;
    v_idx := v_idx + 1;
  END LOOP;
END $$;

-- ----------------------------------------------------------------------------
-- magazine_publish: publica edicao e dispara dispatch
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_publish(
  p_edition_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_edition public.magazine_editions%ROWTYPE;
  v_page_count int;
BEGIN
  SELECT * INTO v_edition
  FROM public.magazine_editions
  WHERE id = p_edition_id AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Edicao nao encontrada';
  END IF;

  IF v_edition.status = 'published' THEN
    RAISE EXCEPTION 'Edicao ja publicada';
  END IF;

  SELECT COUNT(*) INTO v_page_count
  FROM public.magazine_pages
  WHERE edition_id = p_edition_id;

  IF v_page_count < 3 THEN
    RAISE EXCEPTION 'Edicao precisa de pelo menos 3 paginas para publicar';
  END IF;

  UPDATE public.magazine_editions
     SET status = 'published',
         published_at = now()
   WHERE id = p_edition_id;

  -- Dispatch via n8n eh disparado por trigger separado ou webhook externo
  -- (ver migration 20260690000006_magazine_dispatch_hook.sql quando criada)

  RETURN jsonb_build_object(
    'edition_id', p_edition_id,
    'slug', v_edition.slug,
    'page_count', v_page_count,
    'published_at', now()
  );
END $$;

-- ----------------------------------------------------------------------------
-- magazine_archive_edition
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_archive_edition(
  p_edition_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
BEGIN
  UPDATE public.magazine_editions
     SET status = 'archived',
         archived_at = now()
   WHERE id = p_edition_id
     AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Edicao nao encontrada';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Permissoes: admin autenticado usa tudo
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.magazine_create_edition(text,text,text,text) FROM public, anon;
REVOKE ALL ON FUNCTION public.magazine_add_page(uuid,text,jsonb,text[]) FROM public, anon;
REVOKE ALL ON FUNCTION public.magazine_reorder_pages(uuid,uuid[]) FROM public, anon;
REVOKE ALL ON FUNCTION public.magazine_publish(uuid) FROM public, anon;
REVOKE ALL ON FUNCTION public.magazine_archive_edition(uuid) FROM public, anon;

GRANT EXECUTE ON FUNCTION public.magazine_create_edition(text,text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.magazine_add_page(uuid,text,jsonb,text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.magazine_reorder_pages(uuid,uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.magazine_publish(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.magazine_archive_edition(uuid) TO authenticated;
