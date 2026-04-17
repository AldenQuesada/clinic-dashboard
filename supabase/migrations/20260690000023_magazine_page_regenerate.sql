-- ============================================================================
-- Beauty & Health Magazine — Page Regenerate (B3) + Autofix (B5)
-- ============================================================================
-- RPC magazine_page_regenerate: recebe page_id + slots gerados pela IA,
-- valida com magazine_validate_section, atualiza a pagina.
-- RPC magazine_validate_autofix: aplica um lote de correcoes num page em batch.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RPC magazine_page_update_slots — atualiza slots de uma pagina existente
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_page_update_slots(
  p_page_id uuid,
  p_slots   jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_page public.magazine_pages%ROWTYPE;
  v_validation jsonb;
BEGIN
  SELECT pg.* INTO v_page FROM public.magazine_pages pg
    JOIN public.magazine_editions ed ON ed.id = pg.edition_id
   WHERE pg.id = p_page_id AND ed.clinic_id = v_clinic_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagina nao encontrada ou sem permissao';
  END IF;

  -- Valida antes de persistir
  v_validation := public.magazine_validate_section(v_page.template_slug, COALESCE(p_slots,'{}'::jsonb));

  UPDATE public.magazine_pages
     SET slots = COALESCE(p_slots, '{}'::jsonb)
   WHERE id = p_page_id;

  INSERT INTO public.magazine_audit_log (clinic_id, actor, action, subject, meta)
  VALUES (v_clinic_id, COALESCE(auth.uid()::text,'system'), 'page_update_slots', p_page_id::text,
          jsonb_build_object('template', v_page.template_slug, 'validation', v_validation));

  RETURN jsonb_build_object('ok', true, 'validation', v_validation);
END $$;

REVOKE ALL ON FUNCTION public.magazine_page_update_slots(uuid,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_page_update_slots(uuid,jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) RPC magazine_page_get — retorna pagina completa pra regeneracao client-side
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_page_get(p_page_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_result jsonb;
BEGIN
  SELECT to_jsonb(p) INTO v_result
    FROM (
      SELECT pg.id, pg.edition_id, pg.order_index, pg.template_slug,
             pg.slots, pg.segment_scope
        FROM public.magazine_pages pg
        JOIN public.magazine_editions ed ON ed.id = pg.edition_id
       WHERE pg.id = p_page_id AND ed.clinic_id = v_clinic_id
    ) p;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.magazine_page_get(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_page_get(uuid) TO authenticated;

-- ============================================================================
-- Validacao:
--   SELECT public.magazine_page_get('<page_id>'::uuid);
-- ============================================================================
