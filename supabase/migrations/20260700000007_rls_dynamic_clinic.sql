-- ============================================================
-- Migration: RLS dinamico via app_clinic_id()
-- Data: 2026-04-16
-- Objetivo: tabelas de automations usam app_clinic_id() em vez
-- de UUID hardcoded. Multi-tenant-ready.
-- app_clinic_id() le JWT claim 'clinic_id' com fallback para
-- clinica default (compat com sistema atual mono-tenant).
-- ============================================================

BEGIN;

-- ─── wa_agenda_automations ──────────────────────────────────

DROP POLICY IF EXISTS "wa_agenda_auto_clinic" ON wa_agenda_automations;
CREATE POLICY "wa_agenda_auto_clinic" ON wa_agenda_automations
  FOR ALL
  USING (clinic_id = app_clinic_id())
  WITH CHECK (clinic_id = app_clinic_id());

-- ─── wa_automation_sent ─────────────────────────────────────

DROP POLICY IF EXISTS wa_auto_sent_clinic ON wa_automation_sent;
CREATE POLICY wa_auto_sent_clinic ON wa_automation_sent
  FOR ALL
  USING (clinic_id = app_clinic_id())
  WITH CHECK (clinic_id = app_clinic_id());

-- ─── Atualiza RPC dedup para usar app_clinic_id() ───────────

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
  v_clinic_id uuid := app_clinic_id();
BEGIN
  IF p_lead_id IS NULL OR p_lead_id = '' OR p_rule_id IS NULL THEN
    RETURN true;
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

NOTIFY pgrst, 'reload schema';

COMMIT;
