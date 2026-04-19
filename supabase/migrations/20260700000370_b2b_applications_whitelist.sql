-- ============================================================
-- Migration: B2B Applications + Whitelist (Fluxo A da Mira)
--
-- Candidatura de parceria via WhatsApp:
--   - parceiro novo envia mensagem → Mira coleta dados → grava como 'pending'
--   - Alden aprova pelo WA → cria b2b_partnership + adiciona à whitelist
--   - Mirian é notificada de cada aprovação/rejeição
--
-- Whitelist: só telefones autorizados podem pedir vouchers via Mira.
--
-- Idempotente. RLS permissiva.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.b2b_partnership_applications (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id            uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,

  -- Dados coletados no onboarding
  name                 text NOT NULL,
  category             text NULL,
  instagram            text NULL,
  contact_name         text NULL,
  contact_phone        text NULL,
  address              text NULL,
  notes                text NULL,

  -- Quem cadastrou (telefone de origem)
  requested_by_phone   text NOT NULL,

  -- Governance
  status               text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','approved','rejected','archived')),
  approval_note        text NULL,
  rejection_reason     text NULL,
  partnership_id       uuid NULL REFERENCES public.b2b_partnerships(id) ON DELETE SET NULL,

  -- Follow-up
  last_follow_up_at    timestamptz NULL,
  follow_up_count      int NOT NULL DEFAULT 0,

  -- Audit
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  resolved_at          timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_b2b_apps_status
  ON public.b2b_partnership_applications (clinic_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_apps_phone
  ON public.b2b_partnership_applications (requested_by_phone);

ALTER TABLE public.b2b_partnership_applications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_applications_all" ON public.b2b_partnership_applications;
CREATE POLICY "b2b_applications_all" ON public.b2b_partnership_applications
  FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_b2b_apps_upd ON public.b2b_partnership_applications;
CREATE TRIGGER trg_b2b_apps_upd
  BEFORE UPDATE ON public.b2b_partnership_applications
  FOR EACH ROW EXECUTE FUNCTION public._b2b_set_updated_at();


-- ════════════════════════════════════════════════════════════
-- Whitelist
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.b2b_partnership_wa_senders (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  partnership_id   uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  phone            text NOT NULL,
  phone_last8      text GENERATED ALWAYS AS (
    right(regexp_replace(phone, '\D', '', 'g'), 8)
  ) STORED,
  role             text NOT NULL DEFAULT 'owner' CHECK (role IN ('owner','operator')),
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, phone_last8, partnership_id)
);

CREATE INDEX IF NOT EXISTS idx_b2b_senders_phone
  ON public.b2b_partnership_wa_senders (clinic_id, phone_last8) WHERE active = true;

ALTER TABLE public.b2b_partnership_wa_senders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_wa_senders_all" ON public.b2b_partnership_wa_senders;
CREATE POLICY "b2b_wa_senders_all" ON public.b2b_partnership_wa_senders
  FOR ALL USING (true) WITH CHECK (true);


-- ════════════════════════════════════════════════════════════
-- Grants básicos (RPCs específicas vêm na 372)
-- ════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_partnership_applications TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_partnership_wa_senders   TO anon, authenticated, service_role;
