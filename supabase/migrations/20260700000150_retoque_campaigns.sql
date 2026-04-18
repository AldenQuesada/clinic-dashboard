-- ============================================================
-- Migration: Retoque Campaigns Module
-- Sistema de sugestao e acompanhamento de retoques pos-procedimento.
-- Tabela isolada (sem cruzar com appointments) — vinculo via FKs.
--
-- Padrao herdado de wa_birthday_campaigns:
--   - clinic_id default 00000000-0000-0000-0000-000000000001
--   - RLS por clinic_id
--   - lead_id como text (compativel com schema atual)
--   - snapshots de campos (lead_name, procedure_label, etc) para historico
-- ============================================================

CREATE TABLE IF NOT EXISTS retoque_campaigns (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Vinculo
  lead_id                  text NOT NULL,
  lead_name                text,
  lead_phone               text,
  source_appointment_id    uuid,                    -- procedimento que originou a sugestao
  scheduled_appointment_id uuid,                    -- preenchido quando vira agendamento real

  -- Snapshot do procedimento (preserva historico mesmo se appointment for alterado)
  procedure_label          text NOT NULL,
  professional_id          uuid,
  professional_name        text,

  -- Sugestao
  suggested_at             timestamptz NOT NULL DEFAULT now(),
  suggested_by_user_id     uuid,
  suggested_offset_days    int NOT NULL,            -- 14, 30, 60, ou custom
  suggested_target_date    date NOT NULL,           -- data sugerida para o retoque
  suggestion_notes         text,

  -- Estado
  -- suggested  : criado, aguardando contato/resposta
  -- contacted  : mensagem enviada para a paciente
  -- confirmed  : paciente confirmou via WhatsApp
  -- scheduled  : retoque virou appointment real
  -- completed  : retoque foi finalizado
  -- missed     : data passou sem agendamento
  -- cancelled  : sugestao removida (pelo profissional ou paciente)
  status                   text NOT NULL DEFAULT 'suggested',
  status_changed_at        timestamptz NOT NULL DEFAULT now(),
  status_changed_by        uuid,
  status_notes             text,

  -- Metricas de resposta
  patient_response         text,                    -- yes | no | silence
  patient_responded_at     timestamptz,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE retoque_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "retoque_campaigns_clinic" ON retoque_campaigns
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Indices
CREATE INDEX IF NOT EXISTS idx_retoque_lead          ON retoque_campaigns (lead_id);
CREATE INDEX IF NOT EXISTS idx_retoque_target_active ON retoque_campaigns (suggested_target_date)
  WHERE status IN ('suggested', 'contacted', 'confirmed');
CREATE INDEX IF NOT EXISTS idx_retoque_clinic_status ON retoque_campaigns (clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_retoque_source_appt   ON retoque_campaigns (source_appointment_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION retoque_campaigns_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS retoque_campaigns_updated_at ON retoque_campaigns;
CREATE TRIGGER retoque_campaigns_updated_at
  BEFORE UPDATE ON retoque_campaigns
  FOR EACH ROW EXECUTE FUNCTION retoque_campaigns_set_updated_at();

-- ============================================================
-- RPCs
-- ============================================================

-- 1. Criar nova sugestao de retoque (chamado do popup pos-finalize)
CREATE OR REPLACE FUNCTION retoque_create(
  p_lead_id              text,
  p_lead_name            text,
  p_lead_phone           text,
  p_source_appointment_id uuid,
  p_procedure_label      text,
  p_professional_id      uuid,
  p_professional_name    text,
  p_offset_days          int,
  p_notes                text DEFAULT NULL
) RETURNS uuid AS $$
DECLARE
  v_id uuid;
  v_target_date date;
BEGIN
  v_target_date := (now()::date + (p_offset_days || ' days')::interval)::date;

  INSERT INTO retoque_campaigns (
    lead_id, lead_name, lead_phone,
    source_appointment_id, procedure_label,
    professional_id, professional_name,
    suggested_offset_days, suggested_target_date, suggestion_notes,
    status, status_changed_at
  ) VALUES (
    p_lead_id, p_lead_name, p_lead_phone,
    p_source_appointment_id, p_procedure_label,
    p_professional_id, p_professional_name,
    p_offset_days, v_target_date, p_notes,
    'suggested', now()
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Atualizar status (transicao de estado)
CREATE OR REPLACE FUNCTION retoque_update_status(
  p_campaign_id uuid,
  p_new_status  text,
  p_notes       text DEFAULT NULL
) RETURNS boolean AS $$
BEGIN
  UPDATE retoque_campaigns
  SET status = p_new_status,
      status_changed_at = now(),
      status_notes = COALESCE(p_notes, status_notes)
  WHERE id = p_campaign_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Vincular ao agendamento real (quando vira appointment)
CREATE OR REPLACE FUNCTION retoque_link_appointment(
  p_campaign_id    uuid,
  p_appointment_id uuid
) RETURNS boolean AS $$
BEGIN
  UPDATE retoque_campaigns
  SET scheduled_appointment_id = p_appointment_id,
      status = 'scheduled',
      status_changed_at = now()
  WHERE id = p_campaign_id;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Listar com filtros (para futuro dashboard)
-- Retorna agregado por status + flag de "atrasado" para alertas
CREATE OR REPLACE FUNCTION retoque_list(
  p_status_filter text DEFAULT NULL,    -- NULL = todos
  p_lead_id       text DEFAULT NULL,
  p_from_date     date DEFAULT NULL,
  p_to_date       date DEFAULT NULL
) RETURNS TABLE (
  id uuid,
  lead_id text,
  lead_name text,
  lead_phone text,
  procedure_label text,
  professional_name text,
  suggested_at timestamptz,
  suggested_target_date date,
  status text,
  status_changed_at timestamptz,
  source_appointment_id uuid,
  scheduled_appointment_id uuid,
  is_overdue boolean,
  days_until_target int
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    rc.id, rc.lead_id, rc.lead_name, rc.lead_phone,
    rc.procedure_label, rc.professional_name,
    rc.suggested_at, rc.suggested_target_date,
    rc.status, rc.status_changed_at,
    rc.source_appointment_id, rc.scheduled_appointment_id,
    (rc.status IN ('suggested','contacted','confirmed')
      AND rc.suggested_target_date < now()::date) AS is_overdue,
    (rc.suggested_target_date - now()::date)::int AS days_until_target
  FROM retoque_campaigns rc
  WHERE (p_status_filter IS NULL OR rc.status = p_status_filter)
    AND (p_lead_id IS NULL OR rc.lead_id = p_lead_id)
    AND (p_from_date IS NULL OR rc.suggested_at >= p_from_date)
    AND (p_to_date IS NULL OR rc.suggested_at <= p_to_date)
  ORDER BY rc.suggested_target_date ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT ALL ON retoque_campaigns TO anon, authenticated;
GRANT EXECUTE ON FUNCTION retoque_create        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION retoque_update_status TO anon, authenticated;
GRANT EXECUTE ON FUNCTION retoque_link_appointment TO anon, authenticated;
GRANT EXECUTE ON FUNCTION retoque_list          TO anon, authenticated;
