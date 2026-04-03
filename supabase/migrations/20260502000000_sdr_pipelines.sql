-- ============================================================
-- Migration: 003 — SDR: Pipelines e Stages
-- Sprint 8 — SDR Module Foundation
--
-- Tabelas criadas:
--   pipelines         → definição dos kanbans disponíveis
--   pipeline_stages   → colunas de cada kanban
--
-- Pipelines do sistema:
--   seven_days   → Kanban 7 Dias (temporal, colunas = dias)
--   evolution    → Kanban Evolução (comportamental, colunas = estágios)
--
-- Cada fase do lead pode ter um pipeline preferencial:
--   captacao    → both (7 Dias + Evolução)
--   agendamento → evolution (confirmação/remarcação/no-show)
--   paciente    → evolution (jornada pós-atendimento)
--   orcamento   → evolution (proposta/negociação/fechamento)
-- ============================================================

-- ── Tabela: pipelines ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pipelines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

  slug         text NOT NULL,          -- seven_days | evolution
  name         text NOT NULL,          -- "Kanban 7 Dias" | "Kanban Evolução"
  description  text,

  -- para qual fase este pipeline se aplica (NULL = todas)
  applies_to_phase text,

  is_active    boolean NOT NULL DEFAULT true,
  is_system    boolean NOT NULL DEFAULT false, -- pipelines do sistema (não deletáveis)
  sort_order   int NOT NULL DEFAULT 0,

  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (clinic_id, slug)
);

ALTER TABLE public.pipelines
  ADD CONSTRAINT chk_pipelines_phase
    CHECK (applies_to_phase IN ('captacao','agendamento','paciente','orcamento') OR applies_to_phase IS NULL);

-- ── Tabela: pipeline_stages ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id  uuid NOT NULL REFERENCES public.pipelines(id) ON DELETE CASCADE,

  slug         text NOT NULL,          -- dia_1, dia_2, ... | novo, contato, proposta
  label        text NOT NULL,          -- "Dia 1", "Dia 2" | "Novo", "Em Contato"
  description  text,

  color        text NOT NULL DEFAULT '#e5e7eb', -- hex para header da coluna
  icon         text,                   -- nome do ícone Feather

  -- apenas para pipeline seven_days
  day_number   int,                    -- 1-7, NULL para estágios sem dia

  -- limites opcionais de WIP (work in progress)
  max_leads    int,                    -- NULL = sem limite

  sort_order   int NOT NULL DEFAULT 0,
  is_active    boolean NOT NULL DEFAULT true,

  UNIQUE (pipeline_id, slug)
);

ALTER TABLE public.pipeline_stages
  ADD CONSTRAINT chk_pipeline_stages_day_number
    CHECK (day_number IS NULL OR (day_number >= 1 AND day_number <= 7));

ALTER TABLE public.pipeline_stages
  ADD CONSTRAINT chk_pipeline_stages_color
    CHECK (color ~ '^#[0-9A-Fa-f]{6}$');

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_pipelines_clinic
  ON public.pipelines (clinic_id) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_pipeline_stages_pipeline
  ON public.pipeline_stages (pipeline_id, sort_order) WHERE is_active = true;

-- ── Triggers: updated_at ──────────────────────────────────────
CREATE TRIGGER trg_pipelines_updated_at
  BEFORE UPDATE ON public.pipelines
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_sdr();

-- ============================================================
-- VERIFICAÇÃO:
-- SELECT p.slug, s.slug, s.label, s.sort_order
-- FROM public.pipelines p
-- JOIN public.pipeline_stages s ON s.pipeline_id = p.id
-- ORDER BY p.slug, s.sort_order;
-- ============================================================
