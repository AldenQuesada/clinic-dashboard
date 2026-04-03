-- ============================================================
-- Migration: 011 — SDR: Triggers de Mudança de Fase
-- Sprint 8 — SDR Module Foundation
--
-- Triggers automáticos que mudam lead.phase por eventos reais:
--
--   1. appointments INSERT → lead.phase = 'agendamento'
--      (quando appointment é criado para um lead)
--
--   2. appointments UPDATE status='attended' → lead.phase = 'paciente'
--      (quando atendimento é confirmado)
--
--   3. budgets INSERT → lead.phase = 'orcamento'
--      (quando orçamento é criado para um lead)
--
-- Todos os eventos registram em phase_history com origin='auto_transition'
--
-- IMPORTANTE: leads.id é TEXT
-- ============================================================

-- ── Função auxiliar: registrar mudança de fase ────────────────
CREATE OR REPLACE FUNCTION public._sdr_record_phase_change(
  p_lead_id    text,
  p_to_phase   text,
  p_triggered  text,   -- ex: 'appointment_created'
  p_changed_by uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from_phase  text;
  v_from_status text;
BEGIN
  -- Captura estado atual
  SELECT phase, status INTO v_from_phase, v_from_status
  FROM public.leads WHERE id = p_lead_id;

  -- Só registra se a fase vai mudar de fato
  IF v_from_phase = p_to_phase THEN RETURN; END IF;

  -- Atualiza o lead
  UPDATE public.leads
  SET phase            = p_to_phase,
      phase_updated_at = now(),
      phase_updated_by = p_changed_by,
      phase_origin     = 'auto_transition'
  WHERE id = p_lead_id;

  -- Registra no histórico
  INSERT INTO public.phase_history
    (lead_id, from_phase, from_status, to_phase, origin, triggered_by, changed_by)
  VALUES
    (p_lead_id, v_from_phase, v_from_status, p_to_phase, 'auto_transition', p_triggered, p_changed_by);
END;
$$;

-- ── Trigger 1: appointment criado → phase = agendamento ───────
CREATE OR REPLACE FUNCTION public.trg_appointment_created_phase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Só age se o appointment tem lead_id e status não é cancelled
  IF NEW.lead_id IS NULL OR NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  PERFORM public._sdr_record_phase_change(
    NEW.lead_id::text,
    'agendamento',
    'appointment_created',
    auth.uid()
  );

  RETURN NEW;
END;
$$;

-- Remove trigger anterior se existir, recria
DROP TRIGGER IF EXISTS trg_lead_phase_on_appointment_created ON public.appointments;
CREATE TRIGGER trg_lead_phase_on_appointment_created
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_appointment_created_phase();

-- ── Trigger 2: appointment attended → phase = paciente ────────
CREATE OR REPLACE FUNCTION public.trg_appointment_attended_phase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Só age se status mudou para 'attended' e tem lead_id
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;
  IF OLD.status = NEW.status THEN RETURN NEW; END IF;
  IF NEW.status <> 'attended' THEN RETURN NEW; END IF;

  PERFORM public._sdr_record_phase_change(
    NEW.lead_id::text,
    'paciente',
    'appointment_attended',
    auth.uid()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_phase_on_appointment_attended ON public.appointments;
CREATE TRIGGER trg_lead_phase_on_appointment_attended
  AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_appointment_attended_phase();

-- ── Trigger 3: budget criado → phase = orcamento ──────────────
CREATE OR REPLACE FUNCTION public.trg_budget_created_phase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;

  PERFORM public._sdr_record_phase_change(
    NEW.lead_id,
    'orcamento',
    'budget_created',
    auth.uid()
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_phase_on_budget_created ON public.budgets;
CREATE TRIGGER trg_lead_phase_on_budget_created
  AFTER INSERT ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.trg_budget_created_phase();

-- ── RPC: mudança manual de fase ───────────────────────────────
-- Chamada quando SDR draga no kanban ou muda manualmente
DROP FUNCTION IF EXISTS public.sdr_change_phase(text, text, text);
CREATE OR REPLACE FUNCTION public.sdr_change_phase(
  p_lead_id  text,
  p_to_phase text,
  p_reason   text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_clinic_id  uuid;
  v_from_phase text;
  v_from_status text;
BEGIN
  v_clinic_id := public._sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuário não autenticado');
  END IF;

  IF p_to_phase NOT IN ('captacao', 'agendamento', 'paciente', 'orcamento') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Fase inválida: ' || p_to_phase);
  END IF;

  -- Verifica que o lead pertence à clínica
  SELECT phase, status INTO v_from_phase, v_from_status
  FROM public.leads
  WHERE id = p_lead_id AND clinic_id = v_clinic_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lead não encontrado');
  END IF;

  -- Atualiza o lead
  UPDATE public.leads
  SET phase            = p_to_phase,
      phase_updated_at = now(),
      phase_updated_by = auth.uid(),
      phase_origin     = 'manual_override'
  WHERE id = p_lead_id;

  -- Registra histórico com origem manual
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

-- ── RPC: buscar histórico de fase ─────────────────────────────
DROP FUNCTION IF EXISTS public.sdr_get_phase_history(text);
CREATE OR REPLACE FUNCTION public.sdr_get_phase_history(
  p_lead_id text
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER AS $$
DECLARE
  v_clinic_id uuid;
  v_result    jsonb;
BEGIN
  v_clinic_id := public._sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuário não autenticado');
  END IF;

  -- Verifica que o lead pertence à clínica
  IF NOT EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = p_lead_id AND clinic_id = v_clinic_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lead não encontrado');
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'from_phase',   ph.from_phase,
    'to_phase',     ph.to_phase,
    'origin',       ph.origin,
    'triggered_by', ph.triggered_by,
    'reason',       ph.reason,
    'created_at',   ph.created_at
  ) ORDER BY ph.created_at DESC)
  INTO v_result
  FROM public.phase_history ph
  WHERE ph.lead_id = p_lead_id;

  RETURN jsonb_build_object('ok', true, 'data', COALESCE(v_result, '[]'::jsonb));
END;
$$;

-- ============================================================
-- TESTE:
-- INSERT INTO public.appointments (lead_id, ...) VALUES ('<lead_id>', ...);
-- SELECT phase FROM public.leads WHERE id = '<lead_id>';
-- -- deve retornar 'agendamento'
-- ============================================================
