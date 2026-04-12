-- ============================================================
-- Migration: fix wa_outbox_enqueue_appt — adiciona p_appt_ref e p_lead_id
-- ============================================================
-- A RPC existia com 3 params (p_phone, p_content, p_lead_name).
-- O frontend agora passa p_appt_ref (para rastreio) e p_lead_id (para contexto).
-- ============================================================

-- Drop a versao antiga (3 params)
DROP FUNCTION IF EXISTS public.wa_outbox_enqueue_appt(text, text, text);

CREATE OR REPLACE FUNCTION public.wa_outbox_enqueue_appt(
  p_phone     text,
  p_content   text,
  p_lead_name text DEFAULT '',
  p_appt_ref  text DEFAULT NULL,
  p_lead_id   text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_id uuid;
BEGIN
  INSERT INTO wa_outbox (
    clinic_id, lead_id, phone, content, lead_name,
    scheduled_at, status, priority, appt_ref
  ) VALUES (
    v_clinic_id,
    COALESCE(NULLIF(p_lead_id, ''), ''),
    p_phone,
    p_content,
    COALESCE(p_lead_name, ''),
    now(),
    'pending',
    1,
    p_appt_ref
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('id', v_id, 'status', 'queued');
END;
$$;

NOTIFY pgrst, 'reload schema';
