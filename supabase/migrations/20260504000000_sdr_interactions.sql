-- ============================================================
-- Migration: 005 — SDR: Interações
-- Sprint 8 — SDR Module Foundation
--
-- Tabela criada:
--   interactions → log de todas as interações com o lead
--
-- Tipos de interação:
--   note        → anotação manual do SDR
--   call        → ligação telefônica
--   whatsapp    → mensagem WhatsApp
--   email       → e-mail enviado/recebido
--   meeting     → reunião presencial ou online
--   system      → evento automático do sistema
--
-- IMPORTANTE: leads.id é TEXT (não uuid)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.interactions (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

  -- leads.id é text
  lead_id        text NOT NULL,

  -- vínculo opcional com agendamento
  appointment_id text REFERENCES public.appointments(id) ON DELETE SET NULL,

  type           text NOT NULL,         -- note | call | whatsapp | email | meeting | system
  direction      text,                  -- inbound | outbound | NULL para notes/system

  content        text,                  -- corpo da mensagem ou conteúdo da nota
  outcome        text,                  -- resultado: respondeu | não atendeu | agendou | etc

  -- duração para calls/meetings (em segundos)
  duration_sec   int,

  -- metadados extras (ex: template usado, id mensagem WhatsApp)
  metadata       jsonb,

  -- auditoria
  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.interactions
  ADD CONSTRAINT chk_interactions_type
    CHECK (type IN ('note', 'call', 'whatsapp', 'email', 'meeting', 'system')),
  ADD CONSTRAINT chk_interactions_direction
    CHECK (direction IN ('inbound', 'outbound') OR direction IS NULL);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_interactions_lead
  ON public.interactions (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interactions_clinic_type
  ON public.interactions (clinic_id, type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_interactions_appointment
  ON public.interactions (appointment_id) WHERE appointment_id IS NOT NULL;

-- ============================================================
-- VERIFICAÇÃO:
-- SELECT type, COUNT(*) FROM public.interactions GROUP BY type;
-- ============================================================
