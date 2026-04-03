-- ============================================================
-- Migration: 008 — SDR: Orçamentos
-- Sprint 11 — Messages + Budgets
--
-- Tabela criada:
--   budgets       → proposta comercial para o lead/paciente
--   budget_items  → itens do orçamento (procedimentos)
--
-- Quando budget é criado para um lead:
--   → trigger muda lead.phase para 'orcamento' (ver migration 011)
--
-- IMPORTANTE: leads.id é TEXT (não uuid)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.budgets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

  -- leads.id é text
  lead_id        text NOT NULL,

  -- vínculo com paciente (se já convertido)
  patient_id     text,                  -- patients.id é text (schema legado)

  -- número sequencial amigável por clínica
  number         text,                  -- ex: "ORC-2024-001"

  status         text NOT NULL DEFAULT 'draft',
  -- draft | sent | viewed | followup | negotiation | approved | lost

  title          text,                  -- ex: "Orçamento Implante + Clareamento"
  notes          text,                  -- observações internas

  -- valores
  subtotal       numeric(12,2) NOT NULL DEFAULT 0,
  discount       numeric(12,2) NOT NULL DEFAULT 0,
  total          numeric(12,2) NOT NULL DEFAULT 0,

  -- datas de controle
  sent_at        timestamptz,
  viewed_at      timestamptz,
  valid_until    date,
  approved_at    timestamptz,
  lost_at        timestamptz,
  lost_reason    text,

  created_by     uuid REFERENCES auth.users(id),
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.budgets
  ADD CONSTRAINT chk_budgets_status
    CHECK (status IN ('draft', 'sent', 'viewed', 'followup', 'negotiation', 'approved', 'lost')),
  ADD CONSTRAINT chk_budgets_total
    CHECK (total >= 0 AND subtotal >= 0 AND discount >= 0);

-- ── Tabela: budget_items ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.budget_items (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  budget_id    uuid NOT NULL REFERENCES public.budgets(id) ON DELETE CASCADE,

  description  text NOT NULL,          -- ex: "Implante Dentário"
  quantity     int NOT NULL DEFAULT 1,
  unit_price   numeric(12,2) NOT NULL,
  total_price  numeric(12,2) NOT NULL, -- quantity * unit_price

  sort_order   int NOT NULL DEFAULT 0
);

ALTER TABLE public.budget_items
  ADD CONSTRAINT chk_bi_quantity
    CHECK (quantity > 0),
  ADD CONSTRAINT chk_bi_price
    CHECK (unit_price >= 0 AND total_price >= 0);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_budgets_lead
  ON public.budgets (lead_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_budgets_clinic_status
  ON public.budgets (clinic_id, status) WHERE status NOT IN ('approved', 'lost');

CREATE INDEX IF NOT EXISTS idx_budgets_patient
  ON public.budgets (patient_id) WHERE patient_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_budget_items_budget
  ON public.budget_items (budget_id, sort_order);

-- ── Trigger: updated_at ───────────────────────────────────────
CREATE TRIGGER trg_budgets_updated_at
  BEFORE UPDATE ON public.budgets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_sdr();

-- ============================================================
-- VERIFICAÇÃO:
-- SELECT status, COUNT(*) FROM public.budgets GROUP BY status;
-- ============================================================
