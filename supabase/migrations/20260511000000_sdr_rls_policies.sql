-- ============================================================
-- Migration: 012 — SDR: RLS Policies
-- Sprint 8 — SDR Module Foundation
--
-- Habilita RLS em todas as novas tabelas.
-- Padrão uniforme: clinic_id = perfil do usuário logado.
--
-- Padrão da clínica: todos os membros da clínica têm acesso
-- às tabelas operacionais (leads, tags, pipelines, etc).
-- Restrições de permissão por role são feitas na camada de serviço.
-- ============================================================

-- ── Helper: verifica se usuário pertence à clínica ─────────────
-- Reutiliza _sdr_clinic_id() já criado na migration 009
-- SELECT public._sdr_clinic_id() retorna o clinic_id do usuário atual

-- ── tags ─────────────────────────────────────────────────────
ALTER TABLE public.tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tags_clinic_select" ON public.tags
  FOR SELECT USING (clinic_id = public._sdr_clinic_id());

CREATE POLICY "tags_clinic_insert" ON public.tags
  FOR INSERT WITH CHECK (clinic_id = public._sdr_clinic_id());

CREATE POLICY "tags_clinic_update" ON public.tags
  FOR UPDATE USING (clinic_id = public._sdr_clinic_id());

-- Tags de sistema não podem ser deletadas
CREATE POLICY "tags_clinic_delete" ON public.tags
  FOR DELETE USING (clinic_id = public._sdr_clinic_id() AND is_system = false);

-- ── tag_assignments ───────────────────────────────────────────
ALTER TABLE public.tag_assignments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tag_assignments_clinic_all" ON public.tag_assignments
  FOR ALL USING (
    tag_id IN (
      SELECT id FROM public.tags WHERE clinic_id = public._sdr_clinic_id()
    )
  );

-- ── tag_conflicts ─────────────────────────────────────────────
ALTER TABLE public.tag_conflicts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tag_conflicts_clinic_all" ON public.tag_conflicts
  FOR ALL USING (clinic_id = public._sdr_clinic_id());

-- ── pipelines ─────────────────────────────────────────────────
ALTER TABLE public.pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipelines_clinic_select" ON public.pipelines
  FOR SELECT USING (clinic_id = public._sdr_clinic_id());

CREATE POLICY "pipelines_clinic_insert" ON public.pipelines
  FOR INSERT WITH CHECK (clinic_id = public._sdr_clinic_id());

CREATE POLICY "pipelines_clinic_update" ON public.pipelines
  FOR UPDATE USING (clinic_id = public._sdr_clinic_id());

-- Pipelines de sistema não podem ser deletados
CREATE POLICY "pipelines_clinic_delete" ON public.pipelines
  FOR DELETE USING (clinic_id = public._sdr_clinic_id() AND is_system = false);

-- ── pipeline_stages ───────────────────────────────────────────
ALTER TABLE public.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pipeline_stages_clinic_all" ON public.pipeline_stages
  FOR ALL USING (
    pipeline_id IN (
      SELECT id FROM public.pipelines WHERE clinic_id = public._sdr_clinic_id()
    )
  );

-- ── lead_pipeline_positions ───────────────────────────────────
ALTER TABLE public.lead_pipeline_positions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "lpp_clinic_all" ON public.lead_pipeline_positions
  FOR ALL USING (
    pipeline_id IN (
      SELECT id FROM public.pipelines WHERE clinic_id = public._sdr_clinic_id()
    )
  );

-- ── phase_history ─────────────────────────────────────────────
ALTER TABLE public.phase_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "phase_history_clinic_select" ON public.phase_history
  FOR SELECT USING (
    lead_id IN (
      SELECT id FROM public.leads WHERE clinic_id = public._sdr_clinic_id()
    )
  );

-- Apenas INSERT — histórico é imutável (sem UPDATE/DELETE)
CREATE POLICY "phase_history_clinic_insert" ON public.phase_history
  FOR INSERT WITH CHECK (
    lead_id IN (
      SELECT id FROM public.leads WHERE clinic_id = public._sdr_clinic_id()
    )
  );

-- ── interactions ──────────────────────────────────────────────
ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interactions_clinic_all" ON public.interactions
  FOR ALL USING (clinic_id = public._sdr_clinic_id());

-- ── tasks ─────────────────────────────────────────────────────
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tasks_clinic_all" ON public.tasks
  FOR ALL USING (clinic_id = public._sdr_clinic_id());

-- ── automation_rules ──────────────────────────────────────────
ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_clinic_all" ON public.automation_rules
  FOR ALL USING (clinic_id = public._sdr_clinic_id());

-- ── rule_executions ───────────────────────────────────────────
ALTER TABLE public.rule_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rule_exec_clinic_all" ON public.rule_executions
  FOR ALL USING (
    rule_id IN (
      SELECT id FROM public.automation_rules WHERE clinic_id = public._sdr_clinic_id()
    )
  );

-- ── budgets ───────────────────────────────────────────────────
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budgets_clinic_all" ON public.budgets
  FOR ALL USING (clinic_id = public._sdr_clinic_id());

-- ── budget_items ──────────────────────────────────────────────
ALTER TABLE public.budget_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "budget_items_clinic_all" ON public.budget_items
  FOR ALL USING (
    budget_id IN (
      SELECT id FROM public.budgets WHERE clinic_id = public._sdr_clinic_id()
    )
  );

-- ============================================================
-- VERIFICAÇÃO:
-- SELECT tablename, rowsecurity FROM pg_tables
-- WHERE schemaname = 'public'
-- AND tablename IN ('tags','tag_assignments','pipelines','pipeline_stages',
--                   'lead_pipeline_positions','phase_history','interactions',
--                   'tasks','automation_rules','budgets','budget_items');
-- ============================================================
