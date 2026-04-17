-- ============================================================
-- Migration: Rastreamento SIM/NAO na D-1
-- ============================================================
-- Adiciona colunas granulares de resposta ao lembrete D-1:
--   appointments.d1_response      text  ('confirmed' | 'declined')
--   appointments.d1_response_at   timestamptz
--
-- Atualiza trigger wa_auto_confirm_appointment para popular as colunas
-- em paralelo ao update de status (nao substitui — complementa).
--
-- Adiciona RPC sdr_d1_tracking_metrics(p_days) com taxas agregadas.
-- ============================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS d1_response text
  CHECK (d1_response IS NULL OR d1_response IN ('confirmed', 'declined'));
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS d1_response_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_appointments_d1_response ON appointments(d1_response) WHERE d1_response IS NOT NULL;

-- ── Atualiza trigger ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_auto_confirm_appointment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $fn$
DECLARE
  v_phone text;
  v_content text;
  v_appt record;
  v_is_confirm boolean;
  v_is_cancel boolean;
  v_tpl_content text;
  v_reply text;
  v_clinica text;
BEGIN
  IF NEW.direction != 'inbound' THEN RETURN NEW; END IF;

  v_phone := NEW.phone;
  v_content := lower(trim(COALESCE(NEW.content, '')));
  IF length(v_content) > 50 THEN RETURN NEW; END IF;

  v_is_confirm := v_content IN (
    'sim', 'si', 'yes', 'ok', 'confirmo', 'confirmado', 'confirmada',
    'vou sim', 'estarei la', 'pode confirmar', 'tudo certo',
    'com certeza', 'claro', 'positivo', 's', '1'
  ) OR v_content LIKE 'sim%' OR v_content LIKE 'confirm%';

  v_is_cancel := v_content IN (
    'nao', 'não', 'no', 'cancela', 'cancelar', 'cancelado',
    'nao vou', 'nao posso', 'desmarcar', 'remarcar', 'n', '2'
  ) OR v_content LIKE 'nao%' OR v_content LIKE 'não%' OR v_content LIKE 'cancel%';

  IF NOT v_is_confirm AND NOT v_is_cancel THEN RETURN NEW; END IF;

  SELECT a.* INTO v_appt FROM appointments a
  WHERE a.patient_phone IS NOT NULL
    AND right(a.patient_phone, 8) = right(v_phone, 8)
    AND a.status IN ('agendado', 'aguardando_confirmacao')
    AND a.scheduled_date >= CURRENT_DATE
  ORDER BY a.scheduled_date ASC, a.start_time ASC LIMIT 1;

  IF v_appt.id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE((data->>'nome'), 'Clinica') INTO v_clinica
  FROM clinic_data WHERE key = 'clinicai_clinic_settings' LIMIT 1;

  IF v_is_confirm THEN
    UPDATE appointments SET
      status         = 'confirmado',
      d1_response    = 'confirmed',
      d1_response_at = now(),
      updated_at     = now()
    WHERE id = v_appt.id;
    SELECT content INTO v_tpl_content FROM wa_message_templates
    WHERE slug = 'auto_reply_confirmed' AND is_active = true LIMIT 1;
    v_reply := COALESCE(v_tpl_content, 'Confirmado! Te esperamos.');
  END IF;

  IF v_is_cancel THEN
    UPDATE appointments SET
      status         = 'cancelado',
      d1_response    = 'declined',
      d1_response_at = now(),
      updated_at     = now()
    WHERE id = v_appt.id;
    SELECT content INTO v_tpl_content FROM wa_message_templates
    WHERE slug = 'auto_reply_cancelled' AND is_active = true LIMIT 1;
    v_reply := COALESCE(v_tpl_content, 'Sem problemas! Se quiser remarcar, e so avisar.');
  END IF;

  v_reply := replace(v_reply, '{nome}',         COALESCE(v_appt.patient_name, ''));
  v_reply := replace(v_reply, '{data}',         to_char(v_appt.scheduled_date, 'DD/MM'));
  v_reply := replace(v_reply, '{hora}',         COALESCE(v_appt.start_time::text, ''));
  v_reply := replace(v_reply, '{clinica}',      v_clinica);
  v_reply := replace(v_reply, '{profissional}', COALESCE(v_appt.professional_name, ''));

  INSERT INTO wa_outbox (clinic_id, lead_id, phone, content, status, scheduled_at, priority, appt_ref)
  VALUES (v_appt.clinic_id, COALESCE(v_appt.patient_id::text, ''), v_phone, v_reply, 'pending', now(), 1, v_appt.id);

  RETURN NEW;
END;
$fn$;

-- ── RPC de tracking agregado ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdr_d1_tracking_metrics(
  p_days int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_from date;
  v_result jsonb;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao autenticado');
  END IF;

  IF p_days IS NULL OR p_days <= 0 THEN p_days := 30; END IF;
  IF p_days > 365 THEN p_days := 365; END IF;

  v_from := (now() - make_interval(days => p_days))::date;

  WITH d1_sent AS (
    -- Disparos considerados D-1: rules com trigger_type='d_before' e days=1
    SELECT DISTINCT o.appt_ref, o.sent_at
    FROM wa_outbox o
    JOIN wa_agenda_automations r ON r.id = o.rule_id
    WHERE r.trigger_type = 'd_before'
      AND (r.trigger_config->>'days')::int = 1
      AND o.status = 'sent'
      AND o.sent_at::date >= v_from
      AND o.clinic_id = v_clinic_id
      AND o.appt_ref IS NOT NULL
  ),
  scoped AS (
    SELECT a.id, a.status, a.d1_response, a.d1_response_at, a.scheduled_date, s.sent_at
    FROM d1_sent s
    JOIN appointments a ON a.id::text = s.appt_ref
    WHERE a.clinic_id = v_clinic_id
  ),
  daily AS (
    SELECT
      a.scheduled_date AS appt_date,
      count(*) FILTER (WHERE true) AS total,
      count(*) FILTER (WHERE a.d1_response = 'confirmed') AS confirmed,
      count(*) FILTER (WHERE a.d1_response = 'declined')  AS declined,
      count(*) FILTER (WHERE a.d1_response IS NULL)        AS silent
    FROM scoped a
    GROUP BY a.scheduled_date
    ORDER BY a.scheduled_date DESC
    LIMIT 30
  )
  SELECT jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      'period_days', p_days,
      'totals', jsonb_build_object(
        'sent',      (SELECT count(*) FROM scoped),
        'confirmed', (SELECT count(*) FROM scoped WHERE d1_response = 'confirmed'),
        'declined',  (SELECT count(*) FROM scoped WHERE d1_response = 'declined'),
        'silent',    (SELECT count(*) FROM scoped WHERE d1_response IS NULL),
        'avg_response_hours', (
          SELECT round(avg(extract(epoch FROM (d1_response_at - sent_at)) / 3600.0)::numeric, 2)
          FROM scoped WHERE d1_response_at IS NOT NULL AND sent_at IS NOT NULL
        )
      ),
      'daily', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'date',      appt_date,
        'total',     total,
        'confirmed', confirmed,
        'declined',  declined,
        'silent',    silent
      )) FROM daily), '[]'::jsonb)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.sdr_d1_tracking_metrics(int) TO authenticated;

COMMENT ON FUNCTION public.sdr_d1_tracking_metrics(int) IS
  'Tracking agregado da resposta SIM/NAO ao lembrete D-1 (rules d_before+days=1).';
