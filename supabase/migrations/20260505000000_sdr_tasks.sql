-- ============================================================
-- Migration: 006 — SDR: Tasks (Tarefas e Lembretes)
-- Sprint 8 — SDR Module Foundation
--
-- Tabela criada:
--   tasks → lembretes, follow-ups e alertas operacionais
--
-- Tipos:
--   followup    → ação de retorno planejada pelo SDR
--   reminder    → lembrete automático (ex: 24h sem resposta)
--   alert       → alerta de atenção (ex: risco de no-show)
--   task        → tarefa manual livre
--
-- IMPORTANTE: leads.id é TEXT (não uuid)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

  -- leads.id é text
  lead_id        text NOT NULL,

  type           text NOT NULL,         -- followup | reminder | alert | task
  title          text NOT NULL,         -- ex: "Ligar para confirmar consulta"
  description    text,                  -- detalhes opcionais

  status         text NOT NULL DEFAULT 'pending', -- pending | done | cancelled | snoozed

  due_at         timestamptz NOT NULL,  -- quando deve ser feita
  done_at        timestamptz,           -- quando foi concluída
  snoozed_until  timestamptz,           -- se adiada, até quando

  assigned_to    uuid REFERENCES auth.users(id),
  created_by     uuid REFERENCES auth.users(id),

  -- rastreabilidade: qual regra gerou esta task (NULL se manual)
  triggered_by   text,                  -- slug da automation_rule ou NULL

  -- vínculo opcional com appointment
  appointment_id uuid REFERENCES public.appointments(id) ON DELETE SET NULL,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks
  ADD CONSTRAINT chk_tasks_type
    CHECK (type IN ('followup', 'reminder', 'alert', 'task')),
  ADD CONSTRAINT chk_tasks_status
    CHECK (status IN ('pending', 'done', 'cancelled', 'snoozed'));

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tasks_lead
  ON public.tasks (lead_id, due_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tasks_clinic_pending
  ON public.tasks (clinic_id, due_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tasks_assigned
  ON public.tasks (assigned_to, due_at) WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_tasks_overdue
  ON public.tasks (clinic_id, due_at) WHERE status = 'pending' AND due_at < now();

-- ── Trigger: updated_at ───────────────────────────────────────
CREATE TRIGGER trg_tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_sdr();

-- ============================================================
-- VERIFICAÇÃO:
-- SELECT type, status, COUNT(*) FROM public.tasks GROUP BY type, status;
-- ============================================================
