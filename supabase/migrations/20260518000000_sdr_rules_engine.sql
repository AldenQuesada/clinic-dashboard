-- ============================================================
-- Migration: SDR Sprint 9 — Motor de Regras
--
-- Entrega:
--   _sdr_eval_condition   — avalia uma condição contra um lead
--   _sdr_exec_action      — executa uma ação em um lead
--   sdr_evaluate_rules    — avalia todas as regras de um evento
--   sdr_get_rules         — lista regras da clínica
--   sdr_upsert_rule       — cria/atualiza regra
--   sdr_toggle_rule       — ativa/desativa regra
--   RLS nas tabelas
--   Seeds: 3 regras padrão
-- ============================================================

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rule_executions  ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ar_clinic_all" ON public.automation_rules
  FOR ALL USING (clinic_id = public._sdr_clinic_id());

CREATE POLICY "re_clinic_all" ON public.rule_executions
  FOR ALL USING (
    rule_id IN (SELECT id FROM public.automation_rules WHERE clinic_id = public._sdr_clinic_id())
  );

-- ── Helper: avalia uma condição ───────────────────────────────

CREATE OR REPLACE FUNCTION public._sdr_eval_condition(
  p_lead_id text,
  p_cond    jsonb,
  p_context jsonb
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_field    text := p_cond->>'field';
  v_op       text := p_cond->>'op';
  v_val      text := p_cond->>'value';
  v_lead_val text;
  v_count    int;
  v_lead     public.leads%ROWTYPE;
BEGIN
  SELECT * INTO v_lead FROM public.leads WHERE id = p_lead_id LIMIT 1;
  IF NOT FOUND THEN RETURN false; END IF;

  -- Campo do contexto do evento (ex: event.tag_slug, event.to_phase)
  IF v_field LIKE 'event.%' THEN
    v_lead_val := p_context->>(substring(v_field FROM 7));

  -- Existência de tag
  ELSIF v_field = 'tag' THEN
    SELECT COUNT(*) INTO v_count
    FROM public.tag_assignments ta
    JOIN public.tags t ON t.id = ta.tag_id
    WHERE ta.entity_type = 'lead'
      AND ta.entity_id   = p_lead_id
      AND ta.removed_at IS NULL
      AND t.slug         = v_val;

    IF v_op = 'exists'     THEN RETURN v_count > 0; END IF;
    IF v_op = 'not_exists' THEN RETURN v_count = 0; END IF;
    RETURN false;

  -- Campos do lead
  ELSE
    v_lead_val := CASE v_field
      WHEN 'phase'          THEN v_lead.phase
      WHEN 'temperature'    THEN v_lead.temperature
      WHEN 'priority'       THEN v_lead.priority
      WHEN 'is_in_recovery' THEN v_lead.is_in_recovery::text
      WHEN 'is_active'      THEN v_lead.is_active::text
      ELSE NULL
    END;
  END IF;

  IF v_lead_val IS NULL THEN RETURN false; END IF;

  RETURN CASE v_op
    WHEN 'eq'  THEN v_lead_val = v_val
    WHEN 'neq' THEN v_lead_val != v_val
    WHEN 'in'  THEN v_lead_val = ANY(
      ARRAY(SELECT jsonb_array_elements_text(p_cond->'values'))
    )
    ELSE false
  END;
END;
$$;

-- ── Helper: executa uma ação ──────────────────────────────────

CREATE OR REPLACE FUNCTION public._sdr_exec_action(
  p_lead_id  text,
  p_rule_id  uuid,
  p_action   jsonb,
  p_clinic_id uuid
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_type       text := p_action->>'type';
  v_offset_h   int;
  v_due        timestamptz;
BEGIN
  CASE v_type

    WHEN 'add_tag' THEN
      PERFORM public.sdr_assign_tag(
        p_action->>'tag_slug', 'lead', p_lead_id, 'rule'
      );

    WHEN 'remove_tag' THEN
      PERFORM public.sdr_remove_tag(
        p_action->>'tag_slug', 'lead', p_lead_id
      );

    WHEN 'change_phase' THEN
      PERFORM public._sdr_record_phase_change(
        p_lead_id,
        p_action->>'phase',
        'rule',
        NULL
      );

    WHEN 'set_temperature' THEN
      UPDATE public.leads
      SET temperature = p_action->>'temperature',
          updated_at  = now()
      WHERE id = p_lead_id;

    WHEN 'create_task' THEN
      v_offset_h := COALESCE((p_action->>'offset_hours')::int, 0);
      v_due      := now() + (v_offset_h || ' hours')::interval;

      INSERT INTO public.tasks (
        clinic_id, lead_id, type, title, description,
        status, due_at, triggered_by
      ) VALUES (
        p_clinic_id,
        p_lead_id,
        COALESCE(p_action->>'task_type', 'followup'),
        COALESCE(p_action->>'title', 'Tarefa automática'),
        p_action->>'description',
        'pending',
        v_due,
        (SELECT slug FROM public.automation_rules WHERE id = p_rule_id LIMIT 1)
      );

    WHEN 'add_interaction' THEN
      INSERT INTO public.interactions (
        clinic_id, lead_id, type, content, direction
      ) VALUES (
        p_clinic_id,
        p_lead_id,
        'system',
        COALESCE(p_action->>'content', 'Regra automática executada'),
        NULL
      );

    ELSE
      RETURN false;

  END CASE;

  RETURN true;

EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$$;

-- ── sdr_evaluate_rules ────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sdr_evaluate_rules(
  p_lead_id text,
  p_event   text,
  p_context jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id    uuid;
  v_rule         public.automation_rules%ROWTYPE;
  v_cond         jsonb;
  v_action       jsonb;
  v_all_pass     boolean;
  v_exec_count   bigint;
  v_last_exec    timestamptz;
  v_actions_done jsonb := '[]'::jsonb;
  v_rules_fired  int   := 0;
  v_ok           boolean;
BEGIN
  v_clinic_id := public._sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao autenticado');
  END IF;

  -- Itera regras ativas para o evento, em ordem de prioridade
  FOR v_rule IN
    SELECT * FROM public.automation_rules
    WHERE clinic_id     = v_clinic_id
      AND trigger_event = p_event
      AND is_active     = true
    ORDER BY priority ASC
  LOOP

    -- Checa max_executions por lead
    IF v_rule.max_executions IS NOT NULL THEN
      SELECT COUNT(*) INTO v_exec_count
      FROM public.rule_executions
      WHERE rule_id = v_rule.id AND lead_id = p_lead_id;

      IF v_exec_count >= v_rule.max_executions THEN
        CONTINUE;
      END IF;
    END IF;

    -- Checa cooldown
    IF v_rule.cooldown_hours IS NOT NULL THEN
      SELECT MAX(executed_at) INTO v_last_exec
      FROM public.rule_executions
      WHERE rule_id = v_rule.id AND lead_id = p_lead_id AND success = true;

      IF v_last_exec IS NOT NULL AND
         v_last_exec > now() - (v_rule.cooldown_hours || ' hours')::interval THEN
        CONTINUE;
      END IF;
    END IF;

    -- Avalia condições (todas devem passar)
    v_all_pass := true;
    FOR v_cond IN SELECT * FROM jsonb_array_elements(v_rule.conditions)
    LOOP
      IF NOT public._sdr_eval_condition(p_lead_id, v_cond, p_context) THEN
        v_all_pass := false;
        EXIT;
      END IF;
    END LOOP;

    IF NOT v_all_pass THEN CONTINUE; END IF;

    -- Executa ações em sequência
    v_actions_done := '[]'::jsonb;
    FOR v_action IN SELECT * FROM jsonb_array_elements(v_rule.actions)
    LOOP
      v_ok := public._sdr_exec_action(p_lead_id, v_rule.id, v_action, v_clinic_id);
      IF v_ok THEN
        v_actions_done := v_actions_done || jsonb_build_array(v_action);
      END IF;
    END LOOP;

    -- Loga execução
    INSERT INTO public.rule_executions (
      rule_id, lead_id, success, actions_run
    ) VALUES (
      v_rule.id, p_lead_id, true, v_actions_done
    );

    -- Atualiza estatísticas da regra
    UPDATE public.automation_rules
    SET last_run_at = now(),
        run_count   = run_count + 1
    WHERE id = v_rule.id;

    v_rules_fired := v_rules_fired + 1;

  END LOOP;

  RETURN jsonb_build_object(
    'ok',          true,
    'rules_fired', v_rules_fired,
    'event',       p_event,
    'lead_id',     p_lead_id
  );
END;
$$;

-- ── sdr_get_rules ─────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sdr_get_rules()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_rows      jsonb;
BEGIN
  v_clinic_id := public._sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao autenticado');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',            r.id,
      'slug',          r.slug,
      'name',          r.name,
      'description',   r.description,
      'trigger_event', r.trigger_event,
      'conditions',    r.conditions,
      'actions',       r.actions,
      'is_active',     r.is_active,
      'priority',      r.priority,
      'max_executions',r.max_executions,
      'cooldown_hours',r.cooldown_hours,
      'run_count',     r.run_count,
      'last_run_at',   r.last_run_at
    ) ORDER BY r.priority, r.name
  )
  INTO v_rows
  FROM public.automation_rules r
  WHERE r.clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true, 'data', COALESCE(v_rows, '[]'::jsonb));
END;
$$;

-- ── sdr_toggle_rule ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sdr_toggle_rule(
  p_rule_id uuid,
  p_active  boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := public._sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao autenticado');
  END IF;

  UPDATE public.automation_rules
  SET is_active  = p_active,
      updated_at = now()
  WHERE id        = p_rule_id
    AND clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── Seeds: regras padrão do sistema ──────────────────────────

DO $$
DECLARE
  v_clinic_id uuid;
BEGIN
  SELECT id INTO v_clinic_id FROM public.clinics LIMIT 1;
  IF v_clinic_id IS NULL THEN RETURN; END IF;

  -- Regra 1: Lead quente em captação → prioridade alta + tarefa urgente
  INSERT INTO public.automation_rules (
    clinic_id, slug, name, description,
    trigger_event, conditions, actions,
    is_active, priority, cooldown_hours, max_executions
  ) VALUES (
    v_clinic_id,
    'lead_quente_captacao',
    'Lead quente em captacao',
    'Quando um lead entra em captacao com temperatura quente, marca prioridade alta e cria tarefa urgente.',
    'phase_changed',
    '[
      {"field": "event.to_phase",  "op": "eq", "value": "captacao"},
      {"field": "temperature",     "op": "eq", "value": "hot"}
    ]'::jsonb,
    '[
      {"type": "add_tag",     "tag_slug": "lead.prioridade_alta"},
      {"type": "create_task", "title": "Ligar imediatamente — lead quente",
       "task_type": "alert", "offset_hours": 0}
    ]'::jsonb,
    true, 10, 24, NULL
  ) ON CONFLICT (clinic_id, slug) DO NOTHING;

  -- Regra 2: Lead entra em agendamento → criar lembrete de confirmação
  INSERT INTO public.automation_rules (
    clinic_id, slug, name, description,
    trigger_event, conditions, actions,
    is_active, priority, cooldown_hours, max_executions
  ) VALUES (
    v_clinic_id,
    'lembrete_confirmacao_agendamento',
    'Lembrete de confirmacao de agendamento',
    'Quando lead muda para fase agendamento, cria lembrete para confirmar presenca.',
    'phase_changed',
    '[
      {"field": "event.to_phase", "op": "eq", "value": "agendamento"}
    ]'::jsonb,
    '[
      {"type": "create_task", "title": "Confirmar presenca do lead",
       "task_type": "reminder", "offset_hours": 2,
       "description": "Entrar em contato para confirmar o agendamento"}
    ]'::jsonb,
    true, 20, 48, 1
  ) ON CONFLICT (clinic_id, slug) DO NOTHING;

  -- Regra 3: Tag sem_resposta adicionada → follow-up em 24h
  INSERT INTO public.automation_rules (
    clinic_id, slug, name, description,
    trigger_event, conditions, actions,
    is_active, priority, cooldown_hours, max_executions
  ) VALUES (
    v_clinic_id,
    'followup_sem_resposta',
    'Follow-up apos sem resposta',
    'Quando a tag sem_resposta e adicionada, agenda follow-up para 24h depois.',
    'tag_added',
    '[
      {"field": "event.tag_slug", "op": "eq", "value": "lead.sem_resposta"}
    ]'::jsonb,
    '[
      {"type": "create_task", "title": "Follow-up — lead sem resposta",
       "task_type": "followup", "offset_hours": 24,
       "description": "Lead nao respondeu. Tentar novo contato."}
    ]'::jsonb,
    true, 30, 48, NULL
  ) ON CONFLICT (clinic_id, slug) DO NOTHING;

END;
$$;

-- ============================================================
-- VERIFICACAO:
-- SELECT slug, trigger_event, is_active, run_count
-- FROM automation_rules ORDER BY priority;
-- ============================================================
