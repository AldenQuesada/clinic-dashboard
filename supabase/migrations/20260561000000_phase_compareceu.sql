-- ============================================================
-- Migration: Adicionar fase 'compareceu' ao funil de leads
--
-- Fluxo: Lead -> Agendado -> Compareceu -> Paciente
--                                       -> Orcamento -> Paciente
--
-- O trigger de appointment attended agora seta 'compareceu'
-- em vez de 'paciente'. O profissional decide apos a consulta
-- se o lead vira Paciente ou Orcamento.
-- ============================================================

-- ============================================================
-- PASSO 1: Atualizar CHECK constraints
-- ============================================================
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS chk_leads_phase;

ALTER TABLE public.leads
  ADD CONSTRAINT chk_leads_phase
    CHECK (phase IN ('lead', 'agendado', 'reagendado', 'compareceu', 'paciente', 'orcamento', 'perdido'));

ALTER TABLE public.phase_history
  DROP CONSTRAINT IF EXISTS chk_ph_to_phase;

ALTER TABLE public.phase_history
  ADD CONSTRAINT chk_ph_to_phase
    CHECK (to_phase IN ('lead', 'agendado', 'reagendado', 'compareceu', 'paciente', 'orcamento', 'perdido'));

-- ============================================================
-- PASSO 2: Atualizar trigger appointment attended
-- Agora seta 'compareceu' em vez de 'paciente'
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_appointment_attended_phase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'attended' THEN RETURN NEW; END IF;

  PERFORM public._sdr_record_phase_change(
    NEW.lead_id::text,
    'compareceu',
    'appointment_attended',
    auth.uid()
  );

  RETURN NEW;
END;
$$;

-- ============================================================
-- PASSO 3: Atualizar RPC sdr_change_phase para aceitar 'compareceu'
-- ============================================================
DROP FUNCTION IF EXISTS public.sdr_change_phase(text, text, text);
CREATE OR REPLACE FUNCTION public.sdr_change_phase(
  p_lead_id  text,
  p_to_phase text,
  p_reason   text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id   uuid;
  v_from_phase  text;
  v_from_status text;
BEGIN
  v_clinic_id := public._sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado');
  END IF;

  IF p_to_phase NOT IN ('lead', 'agendado', 'reagendado', 'compareceu', 'paciente', 'orcamento', 'perdido') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Fase invalida: ' || p_to_phase);
  END IF;

  IF p_to_phase = 'perdido' AND (p_reason IS NULL OR trim(p_reason) = '') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Motivo obrigatorio para marcar como perdido');
  END IF;

  SELECT phase, status INTO v_from_phase, v_from_status
  FROM public.leads
  WHERE id = p_lead_id AND clinic_id = v_clinic_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lead nao encontrado');
  END IF;

  IF v_from_phase = p_to_phase THEN
    RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'lead_id', p_lead_id, 'phase', p_to_phase, 'unchanged', true
    ));
  END IF;

  UPDATE public.leads
  SET phase            = p_to_phase,
      phase_updated_at = now(),
      phase_updated_by = auth.uid(),
      phase_origin     = 'manual_override',
      lost_reason      = CASE WHEN p_to_phase = 'perdido' THEN p_reason ELSE NULL END,
      lost_at          = CASE WHEN p_to_phase = 'perdido' THEN now()    ELSE NULL END,
      lost_by          = CASE WHEN p_to_phase = 'perdido' THEN auth.uid() ELSE NULL END,
      is_in_recovery   = CASE WHEN v_from_phase = 'perdido' AND p_to_phase <> 'perdido' THEN true
                               ELSE is_in_recovery END
  WHERE id = p_lead_id;

  INSERT INTO public.phase_history
    (lead_id, from_phase, from_status, to_phase, origin, triggered_by, changed_by, reason)
  VALUES
    (p_lead_id, v_from_phase, v_from_status, p_to_phase,
     'manual_override', 'user', auth.uid(), p_reason);

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
    'lead_id',    p_lead_id,
    'from_phase', v_from_phase,
    'to_phase',   p_to_phase,
    'origin',     'manual_override'
  ));
END;
$$;

-- ============================================================
-- VERIFICACAO:
--
-- SELECT unnest(enum_range(NULL::text)) -- check constraint values
-- SELECT phase, count(*) FROM leads WHERE deleted_at IS NULL GROUP BY phase;
-- ============================================================
