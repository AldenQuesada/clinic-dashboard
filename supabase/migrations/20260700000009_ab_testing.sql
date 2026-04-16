-- ============================================================
-- Migration: A/B testing de copy
-- Data: 2026-04-16
-- Adiciona ab_variant_template em wa_agenda_automations e
-- ab_variant em wa_outbox. Engine sorteia 50/50.
-- ============================================================

BEGIN;

ALTER TABLE wa_agenda_automations
  ADD COLUMN IF NOT EXISTS ab_variant_template text;

COMMENT ON COLUMN wa_agenda_automations.ab_variant_template IS
  'Variante B do content_template. Se preenchido, engine sorteia 50/50 entre A (content_template) e B (este campo).';

ALTER TABLE wa_outbox
  ADD COLUMN IF NOT EXISTS ab_variant char(1);

CREATE INDEX IF NOT EXISTS idx_wa_outbox_ab
  ON wa_outbox(rule_id, ab_variant)
  WHERE ab_variant IS NOT NULL;

COMMENT ON COLUMN wa_outbox.ab_variant IS
  'A ou B. Identifica qual variante foi enviada neste registro.';

-- ─── RPC schedule atualizada com ab_variant ─────────────────

CREATE OR REPLACE FUNCTION public.wa_outbox_schedule_automation(
  p_phone       text,
  p_content     text,
  p_lead_id     text DEFAULT ''::text,
  p_lead_name   text DEFAULT ''::text,
  p_scheduled_at timestamptz DEFAULT now(),
  p_appt_ref    text DEFAULT NULL,
  p_rule_id     uuid DEFAULT NULL,
  p_ab_variant  char(1) DEFAULT NULL
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
      scheduled_at, status, priority, appt_ref, rule_id, ab_variant
    ) VALUES (
      v_clinic_id, COALESCE(NULLIF(p_lead_id,''), ''), p_phone, p_content,
      p_scheduled_at, 'pending', 3, p_appt_ref, p_rule_id, p_ab_variant
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    v_id := NULL;
  END;
  RETURN v_id;
END;
$function$;

-- ─── RPC A/B results ─────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_rule_ab_results(
  p_rule_id uuid,
  p_days int DEFAULT 30
)
RETURNS TABLE (
  variant char(1),
  total bigint,
  sent  bigint,
  failed bigint,
  delivery_rate numeric
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT
    ab_variant AS variant,
    count(*) AS total,
    count(*) FILTER (WHERE status = 'sent') AS sent,
    count(*) FILTER (WHERE status = 'failed') AS failed,
    CASE
      WHEN count(*) FILTER (WHERE status IN ('sent','failed')) = 0 THEN NULL
      ELSE round(
        count(*) FILTER (WHERE status = 'sent')::numeric
        / count(*) FILTER (WHERE status IN ('sent','failed'))::numeric * 100,
        1
      )
    END AS delivery_rate
  FROM wa_outbox
  WHERE clinic_id = app_clinic_id()
    AND rule_id = p_rule_id
    AND ab_variant IS NOT NULL
    AND created_at > now() - (p_days || ' days')::interval
  GROUP BY ab_variant
  ORDER BY ab_variant;
$fn$;

GRANT EXECUTE ON FUNCTION public.wa_rule_ab_results(uuid, int) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
