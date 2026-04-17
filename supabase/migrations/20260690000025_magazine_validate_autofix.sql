-- ============================================================================
-- Beauty & Health Magazine — Validate Autofix (B5)
-- ============================================================================
-- RPC magazine_validate_autofix: recebe page_id + array de errors (strings)
-- e retorna a lista de correcoes sugeridas (a execucao real da IA eh
-- client-side via Edge Function magazine-ai-generate mode=fix).
-- ============================================================================

-- Helper: extrai field_key do error message ("titulo > 40 chars", "lede > 200 chars", "beneficios > 6")
CREATE OR REPLACE FUNCTION public._magazine_err_field(p_err text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT split_part(p_err, ' ', 1);
$$;

-- Helper: classifica erro em tipo de fix
CREATE OR REPLACE FUNCTION public._magazine_err_kind(p_err text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_err ~ '> \d+ chars' THEN 'char_limit'
    WHEN p_err ~ '> \d+ palavras' THEN 'word_limit'
    WHEN p_err ~ '< \d+ palavras' THEN 'word_min'
    WHEN p_err ~ '< \d+ chars' THEN 'char_min'
    WHEN p_err ~ 'precisa >= \d+' THEN 'list_min'
    WHEN p_err ~ '> \d+( itens| pares)' THEN 'list_max'
    WHEN p_err ~ 'deve ser array' THEN 'type_array'
    WHEN p_err ~ 'template_slug desconhecido' THEN 'slug_unknown'
    ELSE 'missing'
  END;
$$;

CREATE OR REPLACE FUNCTION public.magazine_validate_autofix_plan(
  p_page_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_page public.magazine_pages%ROWTYPE;
  v_validation jsonb;
  v_errors jsonb;
  v_err text;
  v_plan jsonb := '[]'::jsonb;
BEGIN
  SELECT pg.* INTO v_page FROM public.magazine_pages pg
    JOIN public.magazine_editions ed ON ed.id = pg.edition_id
   WHERE pg.id = p_page_id AND ed.clinic_id = v_clinic_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Pagina nao encontrada';
  END IF;

  v_validation := public.magazine_validate_section(v_page.template_slug, COALESCE(v_page.slots, '{}'::jsonb));
  v_errors := v_validation->'errors';
  IF v_errors IS NULL OR jsonb_typeof(v_errors) <> 'array' THEN v_errors := '[]'::jsonb; END IF;

  FOR v_err IN SELECT value::text FROM jsonb_array_elements_text(v_errors)
  LOOP
    v_plan := v_plan || jsonb_build_object(
      'error', v_err,
      'field', public._magazine_err_field(v_err),
      'kind',  public._magazine_err_kind(v_err)
    );
  END LOOP;

  RETURN jsonb_build_object(
    'page_id', p_page_id,
    'template_slug', v_page.template_slug,
    'slots', v_page.slots,
    'validation', v_validation,
    'plan', v_plan
  );
END $$;

REVOKE ALL ON FUNCTION public.magazine_validate_autofix_plan(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_validate_autofix_plan(uuid) TO authenticated;

-- ============================================================================
-- Validacao:
--   SELECT public.magazine_validate_autofix_plan('<page_id>'::uuid);
-- ============================================================================
