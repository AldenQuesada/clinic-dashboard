-- ============================================================
-- Migration: Dedup de automations on_tag (lead-based)
-- Data: 2026-04-16
-- Objetivo: previne re-envio ao reaplicar mesma tag no mesmo dia.
-- Engine chama wa_automation_try_mark_sent() antes de disparar.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.wa_automation_sent (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  lead_id    text NOT NULL,
  rule_id    uuid NOT NULL REFERENCES wa_agenda_automations(id) ON DELETE CASCADE,
  sent_at    timestamptz NOT NULL DEFAULT now(),
  sent_date  date GENERATED ALWAYS AS ((sent_at AT TIME ZONE 'America/Recife')::date) STORED
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_auto_sent_daily
  ON public.wa_automation_sent(clinic_id, lead_id, rule_id, sent_date);

CREATE INDEX IF NOT EXISTS idx_wa_auto_sent_lookup
  ON public.wa_automation_sent(clinic_id, lead_id, sent_at DESC);

COMMENT ON TABLE public.wa_automation_sent IS
  'Rastreio de disparos on_tag para prevenir duplicacao. Unique por (clinic_id, lead_id, rule_id, sent_date).';

-- RLS
ALTER TABLE public.wa_automation_sent ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_auto_sent_clinic ON public.wa_automation_sent;
CREATE POLICY wa_auto_sent_clinic ON public.wa_automation_sent
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001');

-- ─── RPC: tenta marcar como enviado, retorna true se primeira vez ─

CREATE OR REPLACE FUNCTION public.wa_automation_try_mark_sent(
  p_lead_id text,
  p_rule_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF p_lead_id IS NULL OR p_lead_id = '' OR p_rule_id IS NULL THEN
    RETURN true; -- sem id nao dedup (comportamento fallback seguro)
  END IF;
  BEGIN
    INSERT INTO wa_automation_sent (clinic_id, lead_id, rule_id)
    VALUES (v_clinic_id, p_lead_id, p_rule_id);
    RETURN true;
  EXCEPTION WHEN unique_violation THEN
    RETURN false;
  END;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.wa_automation_try_mark_sent(text, uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';

COMMIT;
