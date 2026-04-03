-- ============================================================
-- ClinicAI — Módulo Financeiro (Sprint 4)
-- Metas mensais · Gastos · Procedimentos · Planejamento anual
--
-- Estratégia de schema:
--   fin_goals       — uma linha por mês/clínica (meta + realizado)
--   fin_config      — configuração fixa da clínica (gastos + procs)
--   fin_annual_plan — planejamento anual por ano/clínica
--
-- Todas as operações passam por RPCs SECURITY DEFINER.
-- Somente admin/owner podem salvar; qualquer membro pode ler.
-- ============================================================

-- ── Tabelas ──────────────────────────────────────────────────

-- Metas mensais
CREATE TABLE IF NOT EXISTS public.fin_goals (
  clinic_id  uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  year       int  NOT NULL,
  month      int  NOT NULL CHECK (month BETWEEN 1 AND 12),
  meta_data  jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (clinic_id, year, month)
);

-- Configuração financeira da clínica (gastos + procedimentos + demografico)
CREATE TABLE IF NOT EXISTS public.fin_config (
  clinic_id  uuid PRIMARY KEY REFERENCES public.clinics(id) ON DELETE CASCADE,
  gastos     jsonb NOT NULL DEFAULT '{"fixos":[],"variaveis":[]}',
  procs      jsonb NOT NULL DEFAULT '[]',
  demo       jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now()
);

-- Planejamento anual
CREATE TABLE IF NOT EXISTS public.fin_annual_plan (
  clinic_id  uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  year       int  NOT NULL,
  plan_data  jsonb NOT NULL DEFAULT '{}',
  updated_at timestamptz DEFAULT now(),
  PRIMARY KEY (clinic_id, year)
);

-- Triggers de updated_at (reutiliza função criada no passo 5)
DROP TRIGGER IF EXISTS fin_goals_updated_at       ON public.fin_goals;
DROP TRIGGER IF EXISTS fin_config_updated_at      ON public.fin_config;
DROP TRIGGER IF EXISTS fin_annual_plan_updated_at ON public.fin_annual_plan;

CREATE TRIGGER fin_goals_updated_at
  BEFORE UPDATE ON public.fin_goals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER fin_config_updated_at
  BEFORE UPDATE ON public.fin_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER fin_annual_plan_updated_at
  BEFORE UPDATE ON public.fin_annual_plan
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.fin_goals       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_config      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_annual_plan ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer membro da clínica
CREATE POLICY "fin_goals_read"       ON public.fin_goals       FOR SELECT USING (clinic_id = app_clinic_id());
CREATE POLICY "fin_config_read"      ON public.fin_config      FOR SELECT USING (clinic_id = app_clinic_id());
CREATE POLICY "fin_annual_plan_read" ON public.fin_annual_plan FOR SELECT USING (clinic_id = app_clinic_id());

-- Escrita: somente admin/owner (as RPCs validam isso via SECURITY DEFINER)
CREATE POLICY "fin_goals_write"       ON public.fin_goals       FOR ALL USING (clinic_id = app_clinic_id() AND app_role() IN ('admin','owner'));
CREATE POLICY "fin_config_write"      ON public.fin_config      FOR ALL USING (clinic_id = app_clinic_id() AND app_role() IN ('admin','owner'));
CREATE POLICY "fin_annual_plan_write" ON public.fin_annual_plan FOR ALL USING (clinic_id = app_clinic_id() AND app_role() IN ('admin','owner'));

-- ── RPC: fin_get_all_data ────────────────────────────────────
-- Retorna goal do mês + configuração (gastos/procs/demo) em uma chamada.
CREATE OR REPLACE FUNCTION public.fin_get_all_data(
  p_year  int,
  p_month int
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_goal      jsonb;
  v_config    jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Meta do mês (pode não existir ainda)
  SELECT meta_data INTO v_goal
    FROM public.fin_goals
   WHERE clinic_id = v_clinic_id AND year = p_year AND month = p_month;

  -- Configuração (gastos + procs + demo)
  SELECT jsonb_build_object(
    'gastos', COALESCE(gastos, '{"fixos":[],"variaveis":[]}'),
    'procs',  COALESCE(procs,  '[]'),
    'demo',   COALESCE(demo,   '{}')
  ) INTO v_config
    FROM public.fin_config
   WHERE clinic_id = v_clinic_id;

  RETURN jsonb_build_object(
    'goal',   COALESCE(v_goal,   '{}'),
    'config', COALESCE(v_config, '{"gastos":{"fixos":[],"variaveis":[]},"procs":[],"demo":{}}')
  );
END;
$$;

-- ── RPC: fin_save_month_goal ─────────────────────────────────
-- Upsert da meta mensal. Requer admin/owner.
CREATE OR REPLACE FUNCTION public.fin_save_month_goal(
  p_year      int,
  p_month     int,
  p_meta_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_role NOT IN ('admin','owner') THEN RAISE EXCEPTION 'Permissão insuficiente'; END IF;

  INSERT INTO public.fin_goals (clinic_id, year, month, meta_data)
    VALUES (v_clinic_id, p_year, p_month, p_meta_data)
  ON CONFLICT (clinic_id, year, month)
    DO UPDATE SET meta_data = EXCLUDED.meta_data;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── RPC: fin_save_config ─────────────────────────────────────
-- Upsert de gastos + procedimentos + demografico. Requer admin/owner.
CREATE OR REPLACE FUNCTION public.fin_save_config(
  p_gastos jsonb DEFAULT NULL,
  p_procs  jsonb DEFAULT NULL,
  p_demo   jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_role NOT IN ('admin','owner') THEN RAISE EXCEPTION 'Permissão insuficiente'; END IF;

  INSERT INTO public.fin_config (clinic_id, gastos, procs, demo)
    VALUES (
      v_clinic_id,
      COALESCE(p_gastos, '{"fixos":[],"variaveis":[]}'),
      COALESCE(p_procs,  '[]'),
      COALESCE(p_demo,   '{}')
    )
  ON CONFLICT (clinic_id) DO UPDATE SET
    gastos = CASE WHEN p_gastos IS NOT NULL THEN EXCLUDED.gastos ELSE fin_config.gastos END,
    procs  = CASE WHEN p_procs  IS NOT NULL THEN EXCLUDED.procs  ELSE fin_config.procs  END,
    demo   = CASE WHEN p_demo   IS NOT NULL THEN EXCLUDED.demo   ELSE fin_config.demo   END;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── RPC: fin_get_annual_plan ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_get_annual_plan(p_year int)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_data      jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT plan_data INTO v_data
    FROM public.fin_annual_plan
   WHERE clinic_id = v_clinic_id AND year = p_year;

  RETURN COALESCE(v_data, '{}');
END;
$$;

-- ── RPC: fin_save_annual_plan ────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_save_annual_plan(
  p_year      int,
  p_plan_data jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_role NOT IN ('admin','owner') THEN RAISE EXCEPTION 'Permissão insuficiente'; END IF;

  INSERT INTO public.fin_annual_plan (clinic_id, year, plan_data)
    VALUES (v_clinic_id, p_year, p_plan_data)
  ON CONFLICT (clinic_id, year)
    DO UPDATE SET plan_data = EXCLUDED.plan_data;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── Permissões ───────────────────────────────────────────────
REVOKE ALL ON FUNCTION public.fin_get_all_data(int, int)         FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fin_save_month_goal(int, int, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fin_save_config(jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fin_get_annual_plan(int)            FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fin_save_annual_plan(int, jsonb)    FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.fin_get_all_data(int, int)          TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_save_month_goal(int, int, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_save_config(jsonb, jsonb, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_get_annual_plan(int)             TO authenticated;
GRANT EXECUTE ON FUNCTION public.fin_save_annual_plan(int, jsonb)     TO authenticated;
