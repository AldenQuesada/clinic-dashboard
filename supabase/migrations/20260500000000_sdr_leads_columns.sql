-- ============================================================
-- Migration: 001 — SDR: Novas colunas na tabela leads
-- Sprint 8 — SDR Module Foundation
--
-- IMPORTANTE: rodar em dois passos separados no SQL Editor
--   Passo 1: ADD COLUMN (este arquivo)
--   Passo 2: UPDATE defaults (ver comentário no final)
--
-- Colunas adicionadas:
--   phase              → posição macro no funil
--   temperature        → temperatura comercial do lead
--   priority           → prioridade operacional
--   day_bucket         → coluna no Kanban 7 Dias (1-7 ou NULL)
--   channel_mode       → canal preferencial de contato
--   assigned_to        → responsável SDR (uuid de profiles)
--   is_in_recovery     → lead resgatado de lost
--   phase_updated_at   → quando a fase foi alterada pela última vez
--   phase_updated_by   → quem alterou a fase
--   phase_origin       → origem da mudança: auto_transition | manual_override
-- ============================================================

-- Passo 1: ADD COLUMN
-- Execute este bloco primeiro, aguarde confirmar, depois rode o UPDATE

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS phase           text NOT NULL DEFAULT 'captacao',
  ADD COLUMN IF NOT EXISTS temperature     text NOT NULL DEFAULT 'cold',
  ADD COLUMN IF NOT EXISTS priority        text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS day_bucket      int,
  ADD COLUMN IF NOT EXISTS channel_mode    text NOT NULL DEFAULT 'whatsapp',
  ADD COLUMN IF NOT EXISTS assigned_to     uuid,
  ADD COLUMN IF NOT EXISTS is_in_recovery  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS phase_updated_at timestamptz,
  ADD COLUMN IF NOT EXISTS phase_updated_by uuid,
  ADD COLUMN IF NOT EXISTS phase_origin    text;

-- CHECK constraints para validação no banco
ALTER TABLE public.leads
  ADD CONSTRAINT chk_leads_phase
    CHECK (phase IN ('captacao', 'agendamento', 'paciente', 'orcamento')),
  ADD CONSTRAINT chk_leads_temperature
    CHECK (temperature IN ('cold', 'warm', 'hot')),
  ADD CONSTRAINT chk_leads_priority
    CHECK (priority IN ('normal', 'high', 'urgent')),
  ADD CONSTRAINT chk_leads_channel_mode
    CHECK (channel_mode IN ('whatsapp', 'phone', 'email', 'in_person')),
  ADD CONSTRAINT chk_leads_phase_origin
    CHECK (phase_origin IN ('auto_transition', 'manual_override') OR phase_origin IS NULL),
  ADD CONSTRAINT chk_leads_day_bucket
    CHECK (day_bucket IS NULL OR (day_bucket >= 1 AND day_bucket <= 7));

-- Índices para filtros rápidos nas telas SDR
CREATE INDEX IF NOT EXISTS idx_leads_phase          ON public.leads (phase) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_temperature    ON public.leads (temperature) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_priority       ON public.leads (priority) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_day_bucket     ON public.leads (day_bucket) WHERE deleted_at IS NULL AND day_bucket IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_leads_assigned_to    ON public.leads (assigned_to) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_clinic_phase   ON public.leads (clinic_id, phase) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_leads_is_in_recovery ON public.leads (is_in_recovery) WHERE is_in_recovery = true AND deleted_at IS NULL;

-- ============================================================
-- Passo 2: Populando leads existentes (rodar SEPARADO, depois do Passo 1)
-- ============================================================
-- Cole e execute este bloco em um segundo run no SQL Editor:
--
-- UPDATE public.leads
-- SET phase = CASE
--   WHEN status IN ('attending', 'patient')                    THEN 'paciente'
--   WHEN status IN ('scheduled')                               THEN 'agendamento'
--   WHEN status IN ('new', 'qualified', 'warm', 'hot', 'cold') THEN 'captacao'
--   ELSE 'captacao'
-- END,
-- temperature = CASE
--   WHEN status IN ('hot', 'attending')  THEN 'hot'
--   WHEN status IN ('warm', 'qualified') THEN 'warm'
--   ELSE 'cold'
-- END,
-- phase_updated_at = NOW(),
-- phase_origin = 'auto_transition'
-- WHERE deleted_at IS NULL;
--
-- ============================================================
-- VERIFICAÇÃO (rodar após ambos os passos):
-- SELECT phase, temperature, COUNT(*) FROM public.leads
-- WHERE deleted_at IS NULL GROUP BY phase, temperature ORDER BY 1, 2;
-- ============================================================
