-- ============================================================
-- Sprint 3: Database Hardening
-- 1. RLS em tabelas birthday (gap identificado na auditoria)
-- 2. Indices para buscas por email e phone normalizado
-- 3. Trigger de auditoria para soft-delete de leads
-- ============================================================

-- ── 1. RLS nas tabelas de birthday ──────────────────────────

ALTER TABLE public.wa_birthday_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bday_templates_clinic_all" ON public.wa_birthday_templates
  FOR ALL USING (clinic_id = public._sdr_clinic_id());

ALTER TABLE public.wa_birthday_campaigns ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bday_campaigns_clinic_all" ON public.wa_birthday_campaigns
  FOR ALL USING (clinic_id = public._sdr_clinic_id());

ALTER TABLE public.wa_birthday_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "bday_messages_clinic_all" ON public.wa_birthday_messages
  FOR ALL USING (
    campaign_id IN (
      SELECT id FROM public.wa_birthday_campaigns
      WHERE clinic_id = public._sdr_clinic_id()
    )
  );

-- ── 2. Indices para buscas frequentes ───────────────────────

-- Email (usado em leads_list ILIKE)
CREATE INDEX IF NOT EXISTS idx_leads_email
  ON public.leads (clinic_id, email)
  WHERE email IS NOT NULL AND email != '';

-- Phone normalizado (right 8 digits, usado em RPCs de dedup)
CREATE INDEX IF NOT EXISTS idx_leads_phone_right8
  ON public.leads (clinic_id, right(phone, 8))
  WHERE phone IS NOT NULL;

-- Appointments por patient_id (join frequente)
CREATE INDEX IF NOT EXISTS idx_appt_patient_id
  ON public.appointments (patient_id)
  WHERE patient_id IS NOT NULL;

-- ── 3. Auditoria de soft-delete ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.leads_audit (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id     text NOT NULL,
  clinic_id   uuid,
  action      text NOT NULL,        -- 'soft_delete' | 'restore' | 'phase_change'
  old_data    jsonb,                 -- snapshot antes da mudanca
  changed_by  uuid,                 -- auth.uid()
  reason      text,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_audit_lead
  ON public.leads_audit (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_leads_audit_clinic
  ON public.leads_audit (clinic_id, created_at DESC);

ALTER TABLE public.leads_audit ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leads_audit_clinic_all" ON public.leads_audit
  FOR ALL USING (clinic_id = public._sdr_clinic_id());

-- Trigger: registra soft-delete automaticamente
CREATE OR REPLACE FUNCTION public._audit_lead_soft_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  -- Detecta soft-delete (deleted_at mudou de NULL para valor)
  IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    INSERT INTO public.leads_audit (lead_id, clinic_id, action, old_data, changed_by)
    VALUES (
      OLD.id,
      OLD.clinic_id,
      'soft_delete',
      jsonb_build_object(
        'name', OLD.name,
        'phone', OLD.phone,
        'email', OLD.email,
        'phase', OLD.phase,
        'status', OLD.status
      ),
      auth.uid()
    );
  END IF;

  -- Detecta restore (deleted_at mudou de valor para NULL)
  IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    INSERT INTO public.leads_audit (lead_id, clinic_id, action, changed_by)
    VALUES (OLD.id, OLD.clinic_id, 'restore', auth.uid());
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_leads_audit_soft_delete ON public.leads;
CREATE TRIGGER trg_leads_audit_soft_delete
  BEFORE UPDATE ON public.leads
  FOR EACH ROW
  WHEN (OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
  EXECUTE FUNCTION public._audit_lead_soft_delete();
