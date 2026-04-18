-- ============================================================
-- Migration: B2B Cron — Fase 2
--
-- Operação mensal automatizada. 5 gatilhos por parceria + recalc saúde
-- + meta mensal + scout scheduler. Todos via pg_cron.
--
-- Fila de tarefas persistida em b2b_tasks (admin vê o que está pendente).
-- WhatsApp: enfileira em wa_outbox_schedule_automation (se existir);
-- se não, só registra na tarefa e admin dispara manual.
--
-- Idempotente. Recria todos os jobs.
-- ============================================================

-- ── Fila de tarefas ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_tasks (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  partnership_id uuid NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  kind           text NOT NULL,
  -- kind: 'brief_monthly' | 'content_checkin' | 'mid_month' | 'sazonal'
  --     | 'monthly_report' | 'scout_scan' | 'meta_alert' | 'health_alert'
  title          text NOT NULL,
  description    text NULL,
  due_date       date NULL,
  payload        jsonb NULL,
  status         text NOT NULL DEFAULT 'open'
                 CHECK (status IN ('open','done','dismissed','auto_resolved')),
  resolved_at    timestamptz NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_tasks_status
  ON public.b2b_tasks (clinic_id, status, due_date);
CREATE INDEX IF NOT EXISTS idx_b2b_tasks_partnership
  ON public.b2b_tasks (partnership_id, kind);

ALTER TABLE public.b2b_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_tasks_all" ON public.b2b_tasks;
CREATE POLICY "b2b_tasks_all" ON public.b2b_tasks FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_b2b_tasks_upd ON public.b2b_tasks;
CREATE TRIGGER trg_b2b_tasks_upd
  BEFORE UPDATE ON public.b2b_tasks
  FOR EACH ROW EXECUTE FUNCTION public._b2b_set_updated_at();


-- ═══════════════ Funções de cron ═══════════════

-- Helper: cria task se não existir outra "open" do mesmo kind+partnership+mes
CREATE OR REPLACE FUNCTION public._b2b_task_create_unique(
  p_partnership_id uuid, p_kind text, p_title text,
  p_description text, p_due_date date, p_payload jsonb
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_id        uuid;
  v_month_ref date := date_trunc('month', now())::date;
BEGIN
  SELECT id INTO v_id FROM public.b2b_tasks
   WHERE clinic_id = v_clinic_id
     AND partnership_id IS NOT DISTINCT FROM p_partnership_id
     AND kind = p_kind
     AND status = 'open'
     AND created_at >= v_month_ref
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.b2b_tasks (
    clinic_id, partnership_id, kind, title, description, due_date, payload
  ) VALUES (
    v_clinic_id, p_partnership_id, p_kind, p_title, p_description, p_due_date, p_payload
  ) RETURNING id INTO v_id;
  RETURN v_id;
END $$;


-- ── Dia 01: Brief mensal para cada parceria ativa ───────────
CREATE OR REPLACE FUNCTION public.b2b_cron_day01_briefs()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_row       record;
  v_count     int := 0;
BEGIN
  FOR v_row IN
    SELECT id, name, contact_phone, contrapartida_cadence
      FROM public.b2b_partnerships
     WHERE clinic_id = v_clinic_id AND status IN ('active','contract','review')
  LOOP
    PERFORM public._b2b_task_create_unique(
      v_row.id, 'brief_monthly',
      'Brief mensal · ' || v_row.name,
      'Mensagem de kickoff do mês para o parceiro. Revise e envie.',
      (date_trunc('month', now()) + interval '2 days')::date,
      jsonb_build_object('contact_phone', v_row.contact_phone, 'cadence', v_row.contrapartida_cadence)
    );
    v_count := v_count + 1;
  END LOOP;

  -- Meta mensal: cria linha pro mês atual se não existir
  INSERT INTO public.b2b_monthly_targets (clinic_id, month, target_count, tier_focus)
  VALUES (v_clinic_id, date_trunc('month', now())::date, 2, ARRAY[1]::int[])
  ON CONFLICT (clinic_id, month) DO NOTHING;

  RETURN jsonb_build_object('ok', true, 'briefs_created', v_count);
END $$;


-- ── Dia 05: Scout varre categorias em falta (se scout_enabled) ─
-- Cria tasks 'scout_scan' pra edge function consumir
CREATE OR REPLACE FUNCTION public.b2b_cron_day05_scout()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_enabled   boolean;
  v_categories text[];
  v_cat       text;
  v_count     int := 0;
BEGIN
  SELECT scout_enabled INTO v_enabled FROM public.b2b_scout_config WHERE clinic_id = v_clinic_id;
  IF NOT COALESCE(v_enabled, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'scout_disabled');
  END IF;

  -- Categorias a priorizar: nenhuma parceria ativa ainda no pilar/categoria
  -- Lista estática com Tier 1 por ora (expandir em migration de dados)
  v_categories := ARRAY[
    'salao_premium','endocrino_menopausa','acim_confraria',
    'fotografo_casamento','joalheria','perfumaria_nicho',
    'psicologia_40plus','ortomolecular'
  ];

  FOREACH v_cat IN ARRAY v_categories LOOP
    -- Só enfileira se não tem parceria na categoria
    IF NOT EXISTS (SELECT 1 FROM public.b2b_partnerships
                    WHERE clinic_id = v_clinic_id AND category = v_cat AND status != 'closed') THEN
      PERFORM public._b2b_task_create_unique(
        NULL, 'scout_scan',
        'Scout: varrer ' || v_cat,
        'Edge function deve chamar Apify + Claude para essa categoria.',
        (date_trunc('month', now()) + interval '5 days')::date,
        jsonb_build_object('category', v_cat)
      );
      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'scans_queued', v_count);
END $$;


-- ── Dia 10: Check-in conteúdo (parceiros que deveriam ter postado) ─
CREATE OR REPLACE FUNCTION public.b2b_cron_day10_content_checkin()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_row       record;
  v_count     int := 0;
BEGIN
  FOR v_row IN
    SELECT id, name FROM public.b2b_partnerships
     WHERE clinic_id = v_clinic_id AND status = 'active'
       AND contrapartida_cadence IN ('monthly')
  LOOP
    PERFORM public._b2b_task_create_unique(
      v_row.id, 'content_checkin',
      'Conteúdo mensal · ' || v_row.name,
      'Confirmar se conteúdo co-criado desse mês foi entregue. Se não, cobrar.',
      (date_trunc('month', now()) + interval '10 days')::date,
      NULL
    );
    v_count := v_count + 1;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'checkins_created', v_count);
END $$;


-- ── Dia 15: Mid-month — atualiza progresso, alerta metas baixas ─
CREATE OR REPLACE FUNCTION public.b2b_cron_day15_midmonth()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_meta      record;
  v_current_ct int;
BEGIN
  -- Atualiza actual_count da meta do mês (parcerias que viraram active esse mês)
  SELECT * INTO v_meta FROM public.b2b_monthly_targets
   WHERE clinic_id = v_clinic_id AND month = date_trunc('month', now())::date;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'no_meta_for_month');
  END IF;

  SELECT COUNT(*)::int INTO v_current_ct FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id
     AND status IN ('active','contract','review')
     AND updated_at >= date_trunc('month', now());

  UPDATE public.b2b_monthly_targets
     SET actual_count = v_current_ct, updated_at = now()
   WHERE id = v_meta.id;

  -- Alerta se está abaixo de 50% na metade do mês
  IF v_current_ct < (v_meta.target_count / 2.0) THEN
    PERFORM public._b2b_task_create_unique(
      NULL, 'meta_alert',
      'Meta mensal em risco',
      'Meta: ' || v_meta.target_count || ' · atual: ' || v_current_ct ||
      '. Revise candidatos ou abra nova varredura.',
      (date_trunc('month', now()) + interval '16 days')::date,
      jsonb_build_object('meta_id', v_meta.id, 'actual', v_current_ct, 'target', v_meta.target_count)
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'actual', v_current_ct, 'target', v_meta.target_count);
END $$;


-- ── Dia 25: Sazonal — ampliação automática ─────────────────
CREATE OR REPLACE FUNCTION public.b2b_cron_day25_sazonal()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_mes       int := EXTRACT(MONTH FROM now() + interval '1 month')::int;
  v_saz_key   text;
  v_row       record;
  v_count     int := 0;
BEGIN
  -- Map mês -> chave sazonal (dia 25 do mês anterior prepara o próximo)
  v_saz_key := CASE v_mes
    WHEN 3  THEN 'dia_das_mulheres'
    WHEN 5  THEN 'dia_das_maes'
    WHEN 10 THEN 'outubro_rosa'
    WHEN 11 THEN 'black_friday'
    WHEN 12 THEN 'natal'
    WHEN 6  THEN 'dia_dos_namorados'
    ELSE NULL
  END;
  IF v_saz_key IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'reason', 'no_sazonal_next_month');
  END IF;

  FOR v_row IN
    SELECT id, name FROM public.b2b_partnerships
     WHERE clinic_id = v_clinic_id AND status = 'active'
       AND v_saz_key = ANY(sazonais)
  LOOP
    PERFORM public._b2b_task_create_unique(
      v_row.id, 'sazonal',
      'Preparar campanha sazonal · ' || v_saz_key || ' · ' || v_row.name,
      'Mes seguinte. Confirme ampliação de voucher e arte conjunta.',
      (date_trunc('month', now()) + interval '27 days')::date,
      jsonb_build_object('sazonal_key', v_saz_key)
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'campaigns_prepared', v_count, 'sazonal', v_saz_key);
END $$;


-- ── Último dia: relatório + recalc saúde ───────────────────
CREATE OR REPLACE FUNCTION public.b2b_cron_monthend_report()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_row       record;
  v_count     int := 0;
  v_health    jsonb;
BEGIN
  -- Recalc todos primeiro (cor atualizada entra no relatório)
  PERFORM public.b2b_partnership_health_recalc_all();

  FOR v_row IN
    SELECT id, name FROM public.b2b_partnerships
     WHERE clinic_id = v_clinic_id AND status IN ('active','review')
  LOOP
    PERFORM public._b2b_task_create_unique(
      v_row.id, 'monthly_report',
      'Relatório mensal · ' || v_row.name,
      'Gerar PDF com KPIs vs metas, evolução, próximos passos. Enviar ao parceiro.',
      (now() + interval '1 day')::date,
      NULL
    );
    v_count := v_count + 1;
  END LOOP;

  -- Fecha meta do mês como achieved/missed
  UPDATE public.b2b_monthly_targets
     SET status = CASE WHEN actual_count >= target_count THEN 'achieved' ELSE 'missed' END,
         updated_at = now()
   WHERE clinic_id = v_clinic_id
     AND month = date_trunc('month', now())::date
     AND status = 'active';

  v_health := public.b2b_health_snapshot();
  RETURN jsonb_build_object('ok', true, 'reports_queued', v_count, 'health_snapshot', v_health);
END $$;


-- ═══════════════ Tasks RPCs (lista + resolução) ═══════════════

CREATE OR REPLACE FUNCTION public.b2b_tasks_list(
  p_status text DEFAULT 'open',
  p_kind   text DEFAULT NULL,
  p_limit  int DEFAULT 200
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    to_jsonb(t) || jsonb_build_object('partnership_name',
      (SELECT name FROM public.b2b_partnerships WHERE id = t.partnership_id))
    ORDER BY due_date ASC NULLS LAST, created_at DESC
  ), '[]'::jsonb)
  INTO v_out
  FROM public.b2b_tasks t
  WHERE t.clinic_id = v_clinic_id
    AND (p_status IS NULL OR t.status = p_status)
    AND (p_kind   IS NULL OR t.kind = p_kind)
  LIMIT GREATEST(1, p_limit);
  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.b2b_task_resolve(p_id uuid, p_status text DEFAULT 'done')
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF p_status NOT IN ('done','dismissed','auto_resolved') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;
  UPDATE public.b2b_tasks
     SET status = p_status, resolved_at = now(), updated_at = now()
   WHERE clinic_id = v_clinic_id AND id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;


-- ═══════════════ Jobs pg_cron ═══════════════

-- Limpa jobs B2B antigos (idempotente)
DO $$
DECLARE
  job_name text;
BEGIN
  FOR job_name IN
    SELECT jobname FROM cron.job WHERE jobname LIKE 'b2b_cron_%'
  LOOP
    PERFORM cron.unschedule(job_name);
  END LOOP;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Agenda (horários em UTC · 11 UTC = 08 BRT)
DO $$
BEGIN
  PERFORM cron.schedule('b2b_cron_day01_briefs',        '0 11 1  * *', 'SELECT public.b2b_cron_day01_briefs()');
  PERFORM cron.schedule('b2b_cron_day05_scout',         '0 11 5  * *', 'SELECT public.b2b_cron_day05_scout()');
  PERFORM cron.schedule('b2b_cron_day10_checkin',       '0 11 10 * *', 'SELECT public.b2b_cron_day10_content_checkin()');
  PERFORM cron.schedule('b2b_cron_day15_midmonth',      '0 11 15 * *', 'SELECT public.b2b_cron_day15_midmonth()');
  PERFORM cron.schedule('b2b_cron_day25_sazonal',       '0 11 25 * *', 'SELECT public.b2b_cron_day25_sazonal()');
  PERFORM cron.schedule('b2b_cron_monthend_report',     '0 11 28 * *', 'SELECT public.b2b_cron_monthend_report()');
  PERFORM cron.schedule('b2b_cron_health_daily',        '0 12 *  * *', 'SELECT public.b2b_partnership_health_recalc_all()');
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE '[b2b_cron] pg_cron nao disponivel — execute os cron functions manualmente se precisar';
END $$;


GRANT EXECUTE ON FUNCTION public.b2b_cron_day01_briefs()              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_cron_day05_scout()               TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_cron_day10_content_checkin()     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_cron_day15_midmonth()            TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_cron_day25_sazonal()             TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_cron_monthend_report()           TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_tasks_list(text, text, int)      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_task_resolve(uuid, text)         TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_tasks              TO anon, authenticated, service_role;
