-- ============================================================
-- Migration: 007 — SDR: Motor de Automação (base)
-- Sprint 8 — SDR Module Foundation (estrutura)
-- Sprint 9 — SDR Rule Engine (implementação completa)
--
-- Tabela criada:
--   automation_rules → regras declarativas de automação
--
-- Princípio:
--   trigger_event → conditions (jsonb) → actions (jsonb array)
--
-- Esta migration cria apenas a estrutura.
-- As funções SQL de avaliação vêm na migration 011.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.automation_rules (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

  slug           text NOT NULL,         -- identificador único: 'lead_sem_resposta_24h'
  name           text NOT NULL,         -- "Lead sem resposta por 24h"
  description    text,

  -- quando esta regra é avaliada
  trigger_event  text NOT NULL,
  -- tag_added | tag_removed | status_changed | phase_changed
  -- time_elapsed | appointment_created | appointment_attended
  -- budget_created | manual

  -- condições em JSON declarativo
  -- ex: [{"field": "phase", "op": "eq", "value": "captacao"},
  --       {"field": "temperature", "op": "eq", "value": "cold"}]
  conditions     jsonb NOT NULL DEFAULT '[]',

  -- ações a executar em sequência
  -- ex: [{"type": "add_tag", "tag_slug": "lead.sem_resposta_24h"},
  --       {"type": "create_task", "title": "Fazer follow-up", "offset_hours": 24}]
  actions        jsonb NOT NULL DEFAULT '[]',

  -- controle de execução
  is_active      boolean NOT NULL DEFAULT true,
  priority       int NOT NULL DEFAULT 0, -- menor = executa primeiro
  max_executions int,                    -- NULL = sem limite por lead
  cooldown_hours int,                    -- horas entre execuções para o mesmo lead

  -- estatísticas
  last_run_at    timestamptz,
  run_count      bigint NOT NULL DEFAULT 0,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),

  UNIQUE (clinic_id, slug)
);

ALTER TABLE public.automation_rules
  ADD CONSTRAINT chk_ar_trigger_event
    CHECK (trigger_event IN (
      'tag_added', 'tag_removed', 'status_changed', 'phase_changed',
      'time_elapsed', 'appointment_created', 'appointment_attended',
      'budget_created', 'manual'
    ));

-- ── Tabela: rule_executions ───────────────────────────────────
-- Log de execuções para auditoria e cooldown
CREATE TABLE IF NOT EXISTS public.rule_executions (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_id      uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  lead_id      text NOT NULL,           -- leads.id é text
  executed_at  timestamptz NOT NULL DEFAULT now(),
  success      boolean NOT NULL DEFAULT true,
  actions_run  jsonb,                   -- snapshot das ações executadas
  error        text                     -- mensagem de erro se success=false
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_ar_clinic_active
  ON public.automation_rules (clinic_id, priority) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_ar_trigger
  ON public.automation_rules (trigger_event) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_rule_exec_rule_lead
  ON public.rule_executions (rule_id, lead_id, executed_at DESC);

CREATE INDEX IF NOT EXISTS idx_rule_exec_lead
  ON public.rule_executions (lead_id, executed_at DESC);

-- ── Trigger: updated_at ───────────────────────────────────────
CREATE TRIGGER trg_ar_updated_at
  BEFORE UPDATE ON public.automation_rules
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_sdr();

-- ============================================================
-- VERIFICAÇÃO:
-- SELECT slug, trigger_event, is_active, priority
-- FROM public.automation_rules ORDER BY priority;
-- ============================================================
