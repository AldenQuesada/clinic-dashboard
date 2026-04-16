-- ============================================================
-- Migration: Deliverability tracking por regra
-- Data: 2026-04-16
-- Adiciona rule_id em wa_outbox + RPC de agregacao.
-- ============================================================

BEGIN;

ALTER TABLE wa_outbox
  ADD COLUMN IF NOT EXISTS rule_id uuid;

CREATE INDEX IF NOT EXISTS idx_wa_outbox_rule_id
  ON wa_outbox(rule_id, status)
  WHERE rule_id IS NOT NULL;

COMMENT ON COLUMN wa_outbox.rule_id IS
  'Regra de automation que originou o envio. Nulo se envio manual ou legacy.';

-- ─── RPC schedule atualizada com rule_id ────────────────────

CREATE OR REPLACE FUNCTION public.wa_outbox_schedule_automation(
  p_phone       text,
  p_content     text,
  p_lead_id     text DEFAULT ''::text,
  p_lead_name   text DEFAULT ''::text,
  p_scheduled_at timestamptz DEFAULT now(),
  p_appt_ref    text DEFAULT NULL,
  p_rule_id     uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_id uuid;
BEGIN
  BEGIN
    INSERT INTO public.wa_outbox (
      clinic_id, lead_id, phone, content,
      scheduled_at, status, priority, appt_ref, rule_id
    ) VALUES (
      v_clinic_id, COALESCE(NULLIF(p_lead_id,''), ''), p_phone, p_content,
      p_scheduled_at, 'pending', 3, p_appt_ref, p_rule_id
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    v_id := NULL;
  END;
  RETURN v_id;
END;
$function$;

-- ─── RPC de deliverability agregado por regra ───────────────

CREATE OR REPLACE FUNCTION public.wa_rule_deliverability(
  p_days int DEFAULT 30
)
RETURNS TABLE (
  rule_id     uuid,
  rule_name   text,
  channel     text,
  is_active   boolean,
  total       bigint,
  sent        bigint,
  failed      bigint,
  pending     bigint,
  scheduled   bigint,
  delivery_rate numeric,
  last_sent_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    r.id AS rule_id,
    r.name AS rule_name,
    r.channel,
    r.is_active,
    count(o.id) AS total,
    count(o.id) FILTER (WHERE o.status = 'sent') AS sent,
    count(o.id) FILTER (WHERE o.status = 'failed') AS failed,
    count(o.id) FILTER (WHERE o.status = 'pending') AS pending,
    count(o.id) FILTER (WHERE o.status = 'scheduled') AS scheduled,
    CASE
      WHEN count(o.id) FILTER (WHERE o.status IN ('sent','failed')) = 0 THEN NULL
      ELSE round(
        count(o.id) FILTER (WHERE o.status = 'sent')::numeric
        / count(o.id) FILTER (WHERE o.status IN ('sent','failed'))::numeric * 100,
        1
      )
    END AS delivery_rate,
    max(o.sent_at) AS last_sent_at
  FROM wa_agenda_automations r
  LEFT JOIN wa_outbox o ON o.rule_id = r.id
    AND o.created_at > now() - (p_days || ' days')::interval
  WHERE r.clinic_id = app_clinic_id()
  GROUP BY r.id, r.name, r.channel, r.is_active
  ORDER BY count(o.id) DESC, r.name ASC;
$fn$;

GRANT EXECUTE ON FUNCTION public.wa_rule_deliverability(int) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
