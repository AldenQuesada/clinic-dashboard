-- ============================================================
-- Migration: Server-side appointment automations
-- Move WhatsApp automations from localStorage to wa_outbox
-- so messages are sent even when the browser is closed.
-- ============================================================

-- 1. Add appt_ref column to track which appointment owns each message
ALTER TABLE wa_outbox ADD COLUMN IF NOT EXISTS appt_ref text;
CREATE INDEX IF NOT EXISTS idx_wa_outbox_appt_ref
  ON wa_outbox(appt_ref) WHERE appt_ref IS NOT NULL;

-- 2. RPC: Schedule a single automation message for future delivery
CREATE OR REPLACE FUNCTION wa_outbox_schedule_automation(
  p_phone        text,
  p_content      text,
  p_lead_id      text    DEFAULT '',
  p_lead_name    text    DEFAULT '',
  p_scheduled_at timestamptz DEFAULT now(),
  p_appt_ref     text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_id uuid;
BEGIN
  INSERT INTO wa_outbox (
    clinic_id, lead_id, phone, content,
    scheduled_at, status, priority, appt_ref
  ) VALUES (
    v_clinic_id, COALESCE(NULLIF(p_lead_id,''), ''), p_phone, p_content,
    p_scheduled_at, 'pending', 3, p_appt_ref
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION wa_outbox_schedule_automation(text,text,text,text,timestamptz,text) TO anon, authenticated;

-- 3. RPC: Cancel all pending automations for an appointment
CREATE OR REPLACE FUNCTION wa_outbox_cancel_by_appt(p_appt_ref text)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  UPDATE wa_outbox
  SET status = 'cancelled'
  WHERE appt_ref = p_appt_ref
    AND status IN ('pending');

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION wa_outbox_cancel_by_appt(text) TO anon, authenticated;
