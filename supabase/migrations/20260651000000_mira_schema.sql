-- ============================================================
-- Migration: Mira Schema — WhatsApp Assistente Interno
-- Modular, isolada da Lara: tabelas com prefixo wa_pro_* e
-- extensao minimal de wa_numbers (so 3 colunas novas, opcionais)
-- ============================================================

-- ── 1. Extensao wa_numbers (3 colunas opcionais) ────────────

ALTER TABLE public.wa_numbers
  ADD COLUMN IF NOT EXISTS number_type     text NOT NULL DEFAULT 'clinic_official'
    CHECK (number_type IN ('clinic_official', 'professional_private')),
  ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES public.professional_profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS access_scope    text NOT NULL DEFAULT 'own'
    CHECK (access_scope IN ('own','team','full'));

CREATE INDEX IF NOT EXISTS idx_wa_numbers_type
  ON public.wa_numbers (clinic_id, number_type)
  WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_wa_numbers_professional
  ON public.wa_numbers (professional_id)
  WHERE professional_id IS NOT NULL;

-- ── 2. Tabela wa_pro_messages (mensagens da Mira, isolada) ──

CREATE TABLE IF NOT EXISTS public.wa_pro_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  wa_number_id    uuid REFERENCES public.wa_numbers(id) ON DELETE SET NULL,
  professional_id uuid REFERENCES public.professional_profiles(id) ON DELETE SET NULL,
  phone           text NOT NULL,
  direction       text NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  content         text NOT NULL,
  intent          text,
  intent_data     jsonb DEFAULT '{}'::jsonb,
  status          text DEFAULT 'sent' CHECK (status IN ('sent','failed','blocked')),
  error_message   text,
  tokens_used     int DEFAULT 0,
  response_ms     int,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_pro_msg_prof
  ON public.wa_pro_messages (clinic_id, professional_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_pro_msg_phone
  ON public.wa_pro_messages (clinic_id, phone, created_at DESC);

ALTER TABLE public.wa_pro_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_pro_msg_admin ON public.wa_pro_messages;

CREATE POLICY wa_pro_msg_admin ON public.wa_pro_messages
  FOR ALL TO authenticated
  USING (clinic_id = public._sdr_clinic_id() AND public.is_admin())
  WITH CHECK (clinic_id = public._sdr_clinic_id() AND public.is_admin());

-- ── 3. Tabela wa_pro_audit_log (auditoria de queries) ──────

CREATE TABLE IF NOT EXISTS public.wa_pro_audit_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  professional_id uuid REFERENCES public.professional_profiles(id) ON DELETE SET NULL,
  phone           text NOT NULL,
  query           text NOT NULL,
  intent          text,
  rpc_called      text,
  result_summary  text,
  success         boolean NOT NULL DEFAULT true,
  error_message   text,
  ip_address      inet,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_pro_audit_prof
  ON public.wa_pro_audit_log (clinic_id, professional_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wa_pro_audit_date
  ON public.wa_pro_audit_log (clinic_id, created_at DESC);

ALTER TABLE public.wa_pro_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_pro_audit_admin ON public.wa_pro_audit_log;

CREATE POLICY wa_pro_audit_admin ON public.wa_pro_audit_log
  FOR ALL TO authenticated
  USING (clinic_id = public._sdr_clinic_id() AND public.is_admin())
  WITH CHECK (clinic_id = public._sdr_clinic_id() AND public.is_admin());

-- ── 4. Tabela wa_pro_rate_limit (controle por dia) ─────────

CREATE TABLE IF NOT EXISTS public.wa_pro_rate_limit (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  professional_id uuid NOT NULL REFERENCES public.professional_profiles(id) ON DELETE CASCADE,
  date            date NOT NULL DEFAULT CURRENT_DATE,
  query_count     int  NOT NULL DEFAULT 0,
  max_per_day     int  NOT NULL DEFAULT 50,
  blocked         boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, professional_id, date)
);

ALTER TABLE public.wa_pro_rate_limit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS wa_pro_rate_admin ON public.wa_pro_rate_limit;

CREATE POLICY wa_pro_rate_admin ON public.wa_pro_rate_limit
  FOR ALL TO authenticated
  USING (clinic_id = public._sdr_clinic_id() AND public.is_admin())
  WITH CHECK (clinic_id = public._sdr_clinic_id() AND public.is_admin());

-- ── 5. Marca instancia Mih (existente) como clinic_official ─

UPDATE public.wa_numbers
SET number_type = 'clinic_official', access_scope = 'full'
WHERE label = 'Mih' OR phone LIKE '%Mih%' OR instance_id = 'Mih';

-- ── Comentarios ─────────────────────────────────────────────

COMMENT ON TABLE  public.wa_pro_messages   IS 'Mensagens da Mira (assistente interno). Isolada de wa_messages (que e da Lara).';
COMMENT ON TABLE  public.wa_pro_audit_log  IS 'Auditoria de queries dos profissionais via Mira. Owner pode auditar quem consultou o que e quando.';
COMMENT ON TABLE  public.wa_pro_rate_limit IS 'Rate limit diario por profissional. Default 50 queries/dia, configuravel.';
COMMENT ON COLUMN public.wa_numbers.number_type IS 'clinic_official = Lara/atendimento. professional_private = Mira/interno.';
COMMENT ON COLUMN public.wa_numbers.access_scope IS 'own = so seus dados | team = equipe | full = clinica toda';
