-- ============================================================================
-- FIX: lp_leads tem coluna 'data' jsonb (nao 'meta'), com phone/name/source dentro.
-- Atualiza trigger + orquestrador pra ler do lugar certo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public._tr_anatomy_quiz_dispatch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(NEW.data->>'source','') = 'anatomy_quiz' THEN
    PERFORM public.process_anatomy_quiz_lead(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.process_anatomy_quiz_lead(p_lp_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead       record;
  v_phone      text;
  v_phone_raw  text;
  v_name       text;
  v_phone8     text;
  v_areas_arr  text[];
  v_complaints jsonb;
  v_lifecycle  jsonb;
  v_status     text;
  v_template   text;
  v_recent     int := 0;
  v_dispatch_id uuid;
BEGIN
  SELECT id, data INTO v_lead
  FROM public.lp_leads
  WHERE id = p_lp_lead_id;

  IF v_lead.id IS NULL THEN RETURN NULL; END IF;
  IF coalesce(v_lead.data->>'source','') <> 'anatomy_quiz' THEN RETURN NULL; END IF;

  v_phone_raw := COALESCE(v_lead.data->>'telefone', v_lead.data->>'phone', v_lead.data->>'tel', '');
  v_name      := COALESCE(v_lead.data->>'nome',     v_lead.data->>'name', '');
  v_phone     := regexp_replace(v_phone_raw, '\D', '', 'g');
  v_phone8    := right(v_phone, 8);
  IF length(v_phone8) < 8 THEN RETURN NULL; END IF;

  -- Areas do quiz (data.anatomy.areas)
  SELECT array_agg(value::text) INTO v_areas_arr
  FROM jsonb_array_elements_text(coalesce(v_lead.data->'anatomy'->'areas', '[]'::jsonb));
  IF v_areas_arr IS NULL OR array_length(v_areas_arr,1) IS NULL THEN
    v_areas_arr := ARRAY[]::text[];
  END IF;
  v_complaints := _aq_top_complaints(v_areas_arr);

  v_lifecycle := _aq_lookup_lifecycle(v_phone);
  v_status := v_lifecycle->>'status';

  SELECT count(*) INTO v_recent
  FROM public.anatomy_quiz_lara_dispatch
  WHERE phone = v_phone
    AND created_at > now() - interval '24 hours'
    AND status IN ('pending','dispatched','processing');
  IF v_recent > 0 THEN
    v_template := 'aq_requiz_recente';
  ELSE
    v_template := CASE v_status
      WHEN 'paciente_ativo'    THEN 'aq_paciente_ativo'
      WHEN 'agendado_futuro'   THEN 'aq_agendado_futuro'
      WHEN 'orcamento_aberto'  THEN 'aq_orcamento_aberto'
      WHEN 'lead_existente'    THEN 'aq_lead_frio'
      ELSE                          'aq_novo_lead'
    END;
  END IF;

  INSERT INTO public.anatomy_quiz_lara_dispatch (
    lp_lead_id, phone, phone_raw, name,
    template_key, lifecycle, queixas, context
  ) VALUES (
    v_lead.id, v_phone, v_phone_raw, v_name,
    v_template,
    v_status,
    v_complaints,
    jsonb_build_object(
      'lifecycle', v_lifecycle,
      'all_areas', to_jsonb(v_areas_arr),
      'requiz_count', v_recent
    )
  ) RETURNING id INTO v_dispatch_id;

  RETURN v_dispatch_id;
END;
$$;

-- Backfill: processa leads anatomy_quiz que ja existem mas nao geraram dispatch
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT l.id FROM public.lp_leads l
    WHERE l.data->>'source' = 'anatomy_quiz'
      AND NOT EXISTS (
        SELECT 1 FROM public.anatomy_quiz_lara_dispatch d
        WHERE d.lp_lead_id = l.id
      )
    ORDER BY l.created_at DESC
    LIMIT 10
  LOOP
    PERFORM public.process_anatomy_quiz_lead(r.id);
  END LOOP;
END $$;
