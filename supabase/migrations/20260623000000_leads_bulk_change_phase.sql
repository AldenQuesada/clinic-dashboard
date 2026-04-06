-- RPC: leads_bulk_change_phase
-- Muda a fase de multiplos leads de uma vez (bulk move).
CREATE OR REPLACE FUNCTION public.leads_bulk_change_phase(
  p_ids    text[],
  p_phase  text
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_moved     int := 0;
  v_uid       uuid;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado');
  END IF;

  v_uid := auth.uid();

  IF p_phase NOT IN ('lead','agendado','reagendado','compareceu','paciente','orcamento','perdido') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Fase invalida: ' || p_phase);
  END IF;

  -- Registrar historico ANTES do update (captura from_phase)
  INSERT INTO public.phase_history (lead_id, from_phase, to_phase, origin, changed_by, reason)
  SELECT l.id, l.phase, p_phase, 'manual_override', v_uid, 'bulk_move'
  FROM public.leads l
  WHERE l.id = ANY(p_ids)
    AND l.clinic_id  = v_clinic_id
    AND l.deleted_at IS NULL
    AND l.phase IS DISTINCT FROM p_phase;

  -- Atualizar fase dos leads
  UPDATE public.leads
  SET phase            = p_phase,
      phase_updated_at = now(),
      updated_at       = now()
  WHERE id = ANY(p_ids)
    AND clinic_id  = v_clinic_id
    AND deleted_at IS NULL
    AND phase IS DISTINCT FROM p_phase;

  GET DIAGNOSTICS v_moved = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'moved', v_moved);
END;
$$;
