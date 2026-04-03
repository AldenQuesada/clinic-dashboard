-- ============================================================
-- Migration: Lead Status System
-- Atualiza o sistema de fases do lead para 6 valores:
--   lead, agendado, reagendado, paciente, orcamento, perdido
--
-- Renomeia:
--   captacao    -> lead
--   agendamento -> agendado
--
-- Adiciona:
--   reagendado  (auto: ao reagendar appointment)
--   perdido     (manual: profissional + motivo obrigatorio)
--
-- Campos novos em leads:
--   lost_reason, lost_at, lost_by
--
-- SEGURANCA:
--   1. Migra dados ANTES de trocar constraints
--   2. DROP constraint antigo -> UPDATE dados -> ADD constraint novo
--   3. Cada objeto DROP IF EXISTS antes de recriar
-- ============================================================

-- ============================================================
-- PASSO 1: Adicionar colunas de "perdido" na tabela leads
-- ============================================================
ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS lost_reason text,
  ADD COLUMN IF NOT EXISTS lost_at     timestamptz,
  ADD COLUMN IF NOT EXISTS lost_by     uuid;

-- Indice para consultas de leads perdidos
CREATE INDEX IF NOT EXISTS idx_leads_lost
  ON public.leads (clinic_id, lost_at DESC)
  WHERE phase = 'perdido' AND deleted_at IS NULL;

-- ============================================================
-- PASSO 2: Remover CHECK constraints antigos
-- (precisam sair ANTES do UPDATE de dados)
-- ============================================================
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS chk_leads_phase;

ALTER TABLE public.phase_history
  DROP CONSTRAINT IF EXISTS chk_ph_to_phase;

-- ============================================================
-- PASSO 3: Migrar dados existentes para novos nomes
-- ============================================================
UPDATE public.leads
SET phase = 'lead'
WHERE phase = 'captacao';

UPDATE public.leads
SET phase = 'agendado'
WHERE phase = 'agendamento';

UPDATE public.phase_history
SET to_phase = 'lead'
WHERE to_phase = 'captacao';

UPDATE public.phase_history
SET to_phase = 'agendado'
WHERE to_phase = 'agendamento';

UPDATE public.phase_history
SET from_phase = 'lead'
WHERE from_phase = 'captacao';

UPDATE public.phase_history
SET from_phase = 'agendado'
WHERE from_phase = 'agendamento';

-- ============================================================
-- PASSO 4: Adicionar CHECK constraints novos (6 valores)
-- ============================================================
ALTER TABLE public.leads
  ADD CONSTRAINT chk_leads_phase
    CHECK (phase IN ('lead', 'agendado', 'reagendado', 'paciente', 'orcamento', 'perdido'));

ALTER TABLE public.phase_history
  ADD CONSTRAINT chk_ph_to_phase
    CHECK (to_phase IN ('lead', 'agendado', 'reagendado', 'paciente', 'orcamento', 'perdido'));

-- ============================================================
-- PASSO 5: Alterar DEFAULT da coluna phase
-- ============================================================
ALTER TABLE public.leads
  ALTER COLUMN phase SET DEFAULT 'lead';

-- ============================================================
-- PASSO 6: Atualizar phase_origin para aceitar 'rule' tambem
-- (ja usado no phase_history.origin mas leads.phase_origin nao aceitava)
-- ============================================================
ALTER TABLE public.leads
  DROP CONSTRAINT IF EXISTS chk_leads_phase_origin;

ALTER TABLE public.leads
  ADD CONSTRAINT chk_leads_phase_origin
    CHECK (phase_origin IN ('auto_transition', 'manual_override', 'rule') OR phase_origin IS NULL);

-- ============================================================
-- PASSO 7: Atualizar funcao auxiliar _sdr_record_phase_change
-- (usada por todos os triggers automaticos)
-- ============================================================
CREATE OR REPLACE FUNCTION public._sdr_record_phase_change(
  p_lead_id    text,
  p_to_phase   text,
  p_triggered  text,
  p_changed_by uuid DEFAULT NULL
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_from_phase  text;
  v_from_status text;
BEGIN
  SELECT phase, status INTO v_from_phase, v_from_status
  FROM public.leads WHERE id = p_lead_id;

  -- So registra se a fase vai mudar de fato
  IF v_from_phase IS NOT DISTINCT FROM p_to_phase THEN RETURN; END IF;

  -- Atualiza o lead
  UPDATE public.leads
  SET phase            = p_to_phase,
      phase_updated_at = now(),
      phase_updated_by = p_changed_by,
      phase_origin     = 'auto_transition'
  WHERE id = p_lead_id;

  -- Registra no historico
  INSERT INTO public.phase_history
    (lead_id, from_phase, from_status, to_phase, origin, triggered_by, changed_by)
  VALUES
    (p_lead_id, v_from_phase, v_from_status, p_to_phase, 'auto_transition', p_triggered, p_changed_by);
END;
$$;

-- ============================================================
-- PASSO 8: Atualizar triggers para usar novos nomes de fase
-- ============================================================

-- Trigger 1: appointment criado -> phase = 'agendado' (era 'agendamento')
CREATE OR REPLACE FUNCTION public.trg_appointment_created_phase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.lead_id IS NULL OR NEW.status = 'cancelled' THEN
    RETURN NEW;
  END IF;

  PERFORM public._sdr_record_phase_change(
    NEW.lead_id::text,
    'agendado',
    'appointment_created',
    auth.uid()
  );

  RETURN NEW;
END;
$$;

-- Trigger 2: appointment attended -> phase = 'paciente' (sem mudanca)
-- (mantido como esta, nao precisa recriar)

-- Trigger 3: budget criado -> phase = 'orcamento' (sem mudanca)
-- (mantido como esta, nao precisa recriar)

-- ============================================================
-- PASSO 9: Novo trigger — appointment reagendado -> phase = 'reagendado'
-- Detecta quando um appointment existente muda de data/hora
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_appointment_rescheduled_phase()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;

  -- So age se a data/hora mudou (reagendamento real)
  IF OLD.date IS NOT DISTINCT FROM NEW.date
     AND OLD.time IS NOT DISTINCT FROM NEW.time THEN
    RETURN NEW;
  END IF;

  -- So reagenda se o status nao e cancelado
  IF NEW.status = 'cancelled' THEN RETURN NEW; END IF;

  -- Verifica se o lead esta em fase que faz sentido reagendar
  -- (agendado ou reagendado — nao reagenda se ja e paciente/orcamento)
  IF EXISTS (
    SELECT 1 FROM public.leads
    WHERE id = NEW.lead_id::text
      AND phase IN ('agendado', 'reagendado')
  ) THEN
    PERFORM public._sdr_record_phase_change(
      NEW.lead_id::text,
      'reagendado',
      'appointment_rescheduled',
      auth.uid()
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_lead_phase_on_appointment_rescheduled ON public.appointments;
CREATE TRIGGER trg_lead_phase_on_appointment_rescheduled
  AFTER UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.trg_appointment_rescheduled_phase();

-- ============================================================
-- PASSO 10: Atualizar RPC sdr_change_phase
-- - Aceita 6 valores
-- - Perdido exige reason obrigatorio
-- - Preenche lost_reason, lost_at, lost_by automaticamente
-- - Limpa campos lost_* se sair de perdido
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

  -- Validar fase
  IF p_to_phase NOT IN ('lead', 'agendado', 'reagendado', 'paciente', 'orcamento', 'perdido') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Fase invalida: ' || p_to_phase);
  END IF;

  -- Perdido exige motivo
  IF p_to_phase = 'perdido' AND (p_reason IS NULL OR trim(p_reason) = '') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Motivo obrigatorio para marcar como perdido');
  END IF;

  -- Verifica que o lead pertence a clinica
  SELECT phase, status INTO v_from_phase, v_from_status
  FROM public.leads
  WHERE id = p_lead_id AND clinic_id = v_clinic_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lead nao encontrado');
  END IF;

  -- Nao permite mudar se ja esta na mesma fase
  IF v_from_phase = p_to_phase THEN
    RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object(
      'lead_id', p_lead_id, 'phase', p_to_phase, 'unchanged', true
    ));
  END IF;

  -- Atualiza o lead
  UPDATE public.leads
  SET phase            = p_to_phase,
      phase_updated_at = now(),
      phase_updated_by = auth.uid(),
      phase_origin     = 'manual_override',
      -- Campos de perdido
      lost_reason      = CASE WHEN p_to_phase = 'perdido' THEN p_reason ELSE NULL END,
      lost_at          = CASE WHEN p_to_phase = 'perdido' THEN now()    ELSE NULL END,
      lost_by          = CASE WHEN p_to_phase = 'perdido' THEN auth.uid() ELSE NULL END,
      -- Se sai de perdido, marca recovery
      is_in_recovery   = CASE WHEN v_from_phase = 'perdido' AND p_to_phase <> 'perdido' THEN true
                               ELSE is_in_recovery END
  WHERE id = p_lead_id;

  -- Registra historico
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
-- PASSO 11: Atualizar submit_quiz_response para usar 'lead'
-- ============================================================
CREATE OR REPLACE FUNCTION submit_quiz_response(
  p_quiz_id       uuid,
  p_clinic_id     uuid,
  p_answers       jsonb,
  p_score         int,
  p_temperature   text,
  p_contact_name  text,
  p_contact_phone text,
  p_contact_email text,
  p_utm_source    text,
  p_utm_medium    text,
  p_utm_campaign  text,
  p_kanban_target text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_response_id uuid;
  v_lead_id     text;
  v_is_new      boolean := false;
  v_phone       text;
  v_pipeline_id uuid;
  v_stage_id    uuid;
BEGIN
  v_phone := trim(COALESCE(p_contact_phone, ''));

  INSERT INTO quiz_responses (
    quiz_id, clinic_id, answers, score, temperature,
    contact_name, contact_phone, contact_email,
    utm_source, utm_medium, utm_campaign
  ) VALUES (
    p_quiz_id, p_clinic_id, p_answers, p_score, p_temperature,
    p_contact_name, v_phone, NULLIF(trim(COALESCE(p_contact_email, '')), ''),
    p_utm_source, p_utm_medium, p_utm_campaign
  )
  RETURNING id INTO v_response_id;

  IF v_phone != '' THEN
    INSERT INTO leads (
      id, name, phone, email,
      clinic_id, temperature, phase, day_bucket,
      status, lead_score, birth_date, data
    ) VALUES (
      gen_random_uuid()::text,
      COALESCE(p_contact_name, ''),
      v_phone,
      COALESCE(NULLIF(trim(COALESCE(p_contact_email, '')), ''), ''),
      p_clinic_id,
      p_temperature,
      'lead',
      1,
      'new',
      0,
      '',
      '{}'::jsonb
    )
    ON CONFLICT (clinic_id, phone)
    DO UPDATE SET
      temperature = EXCLUDED.temperature,
      name  = COALESCE(NULLIF(leads.name, ''), EXCLUDED.name),
      email = COALESCE(leads.email, EXCLUDED.email)
    RETURNING id INTO v_lead_id;

    v_is_new := (v_lead_id IS NOT NULL);

    IF v_lead_id IS NULL THEN
      SELECT id INTO v_lead_id
      FROM leads
      WHERE phone = v_phone
        AND clinic_id = p_clinic_id
        AND deleted_at IS NULL
      LIMIT 1;
    END IF;

    IF v_lead_id IS NOT NULL THEN
      UPDATE quiz_responses
      SET lead_id = v_lead_id::uuid
      WHERE id = v_response_id;
    END IF;

    IF v_lead_id IS NOT NULL THEN
      FOR v_pipeline_id IN
        SELECT p.id FROM pipelines p
        WHERE p.clinic_id = p_clinic_id AND p.is_active = true
      LOOP
        SELECT ps.id INTO v_stage_id
        FROM pipeline_stages ps
        WHERE ps.pipeline_id = v_pipeline_id
          AND ps.is_active = true
        ORDER BY ps.sort_order ASC
        LIMIT 1;

        IF v_stage_id IS NOT NULL THEN
          INSERT INTO lead_pipeline_positions (lead_id, pipeline_id, stage_id, origin)
          VALUES (v_lead_id, v_pipeline_id, v_stage_id, 'auto')
          ON CONFLICT (lead_id, pipeline_id) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'quiz_response_id', v_response_id,
    'lead_id',          v_lead_id,
    'is_new',           v_is_new
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_quiz_response(
  uuid, uuid, jsonb, int, text,
  text, text, text, text, text, text, text
) TO anon;

-- ============================================================
-- VERIFICACAO pos-migration:
--
-- SELECT phase, count(*) FROM leads
-- WHERE deleted_at IS NULL GROUP BY phase ORDER BY 1;
--
-- SELECT to_phase, count(*) FROM phase_history GROUP BY to_phase ORDER BY 1;
-- ============================================================
