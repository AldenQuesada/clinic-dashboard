-- ============================================================
-- Migration: 004 — SDR: Posições dos Leads nos Pipelines
-- Sprint 8 — SDR Module Foundation
--
-- Tabela criada:
--   lead_pipeline_positions → posição atual de cada lead em cada pipeline
--
-- IMPORTANTE: leads.id é TEXT (não uuid)
-- Um lead pode estar em múltiplos pipelines simultaneamente
-- (ex: Kanban 7 Dias + Kanban Evolução ao mesmo tempo)
--
-- Histórico de movimentações é registrado em phase_history
-- separadamente para não inflar esta tabela.
-- ============================================================

-- ── Tabela: lead_pipeline_positions ──────────────────────────
CREATE TABLE IF NOT EXISTS public.lead_pipeline_positions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- leads.id é text — FK sem tipo uuid
  lead_id      text NOT NULL,
  pipeline_id  uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,
  stage_id     uuid NOT NULL REFERENCES public.pipeline_stages(id) ON DELETE RESTRICT,

  -- auditoria de movimentação
  entered_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  moved_by     uuid REFERENCES auth.users(id),
  origin       text NOT NULL DEFAULT 'auto', -- auto | drag | rule | import

  -- um lead só tem uma posição por pipeline
  UNIQUE (lead_id, pipeline_id)
);

ALTER TABLE public.lead_pipeline_positions
  ADD CONSTRAINT chk_lpp_origin
    CHECK (origin IN ('auto', 'drag', 'rule', 'import'));

-- ── Tabela: phase_history ─────────────────────────────────────
-- Auditoria completa de mudanças de fase e status
-- Separada de lead_pipeline_positions para preservar histórico
CREATE TABLE IF NOT EXISTS public.phase_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id        text NOT NULL,          -- leads.id é text

  -- estado anterior
  from_phase     text,
  from_status    text,

  -- estado novo
  to_phase       text NOT NULL,
  to_status      text,

  -- contexto da mudança
  origin         text NOT NULL,          -- auto_transition | manual_override | rule
  triggered_by   text,                   -- slug da regra ou 'user'
  changed_by     uuid REFERENCES auth.users(id),
  reason         text,                   -- motivo opcional (campo livre)

  created_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.phase_history
  ADD CONSTRAINT chk_ph_to_phase
    CHECK (to_phase IN ('captacao', 'agendamento', 'paciente', 'orcamento')),
  ADD CONSTRAINT chk_ph_origin
    CHECK (origin IN ('auto_transition', 'manual_override', 'rule'));

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_lpp_lead
  ON public.lead_pipeline_positions (lead_id);

CREATE INDEX IF NOT EXISTS idx_lpp_pipeline_stage
  ON public.lead_pipeline_positions (pipeline_id, stage_id);

CREATE INDEX IF NOT EXISTS idx_phase_history_lead
  ON public.phase_history (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_phase_history_origin
  ON public.phase_history (origin, created_at DESC);

-- ── Trigger: updated_at ───────────────────────────────────────
CREATE TRIGGER trg_lpp_updated_at
  BEFORE UPDATE ON public.lead_pipeline_positions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_sdr();

-- ============================================================
-- VERIFICAÇÃO:
-- SELECT lpp.lead_id, p.slug AS pipeline, s.label AS stage, lpp.origin
-- FROM public.lead_pipeline_positions lpp
-- JOIN public.pipelines p ON p.id = lpp.pipeline_id
-- JOIN public.pipeline_stages s ON s.id = lpp.stage_id
-- LIMIT 10;
-- ============================================================
