-- ============================================================
-- Migration: 20260523000000 -- SDR: Motor de Regras
-- Sprint 9
--
-- Cria 5 objetos:
--   _sdr_eval_conditions  -- avalia conditions[] de uma regra (privada)
--   _sdr_exec_action      -- executa uma action de uma regra (privada)
--   sdr_evaluate_rules    -- entry point publico: avalia regras por evento
--   sdr_get_rules         -- lista regras da clinica
--   sdr_toggle_rule       -- ativa/desativa uma regra
--
-- Seeds: 3 regras demonstrativas (inativas por padrao)
--
-- Blindagens:
--   - origin = 'rule' em todas as acoes disparadas (anti-loop)
--   - cooldown_hours: ignora re-execucao dentro da janela
--   - max_executions: limita disparos por lead
--   - campo desconhecido em condition/action -> falha graceful (nao quebra)
--   - EXCEPTION em cada acao -> log de erro, continua proxima regra
-- ============================================================

-- ============================================================
-- 1. _sdr_eval_conditions
--    Avalia se um lead satisfaz o array de conditions de uma regra.
--    Logica AND: todas as condicoes devem passar.
--    Retorna TRUE se sem condicoes (regra universal).
-- ============================================================

DROP FUNCTION IF EXISTS public._sdr_eval_conditions(text, uuid, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public._sdr_eval_conditions(
  p_lead_id   text,
  p_clinic_id uuid,
  p_conds     jsonb,
  p_ctx       jsonb DEFAULT '{}'
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_lead  leads%ROWTYPE;
  cond    jsonb;
  v_field text;
  v_op    text;
  v_val   text;
  v_lhs   text;
BEGIN
  -- Sem condicoes = passa sempre
  IF p_conds IS NULL OR jsonb_array_length(p_conds) = 0 THEN
    RETURN true;
  END IF;

  SELECT * INTO v_lead
  FROM leads
  WHERE id = p_lead_id AND clinic_id = p_clinic_id;

  IF NOT FOUND THEN RETURN false; END IF;

  FOR cond IN SELECT value FROM jsonb_array_elements(p_conds) AS t(value)
  LOOP
    v_field := cond->>'field';
    v_op    := cond->>'op';
    v_val   := cond->>'value';

    -- ---- Campos especiais com logica propria ----

    -- tag: verifica presenca/ausencia de tag ativa no lead
    IF v_field = 'tag' THEN
      IF v_op = 'has' THEN
        IF NOT EXISTS (
          SELECT 1 FROM tag_assignments ta
          JOIN tags t ON ta.tag_id = t.id
          WHERE ta.entity_id   = p_lead_id
            AND ta.entity_type = 'lead'
            AND t.slug         = v_val
            AND ta.removed_at  IS NULL
        ) THEN RETURN false; END IF;
      ELSIF v_op = 'not_has' THEN
        IF EXISTS (
          SELECT 1 FROM tag_assignments ta
          JOIN tags t ON ta.tag_id = t.id
          WHERE ta.entity_id   = p_lead_id
            AND ta.entity_type = 'lead'
            AND t.slug         = v_val
            AND ta.removed_at  IS NULL
        ) THEN RETURN false; END IF;
      ELSE
        RETURN false; -- op invalido para campo tag
      END IF;
      CONTINUE;
    END IF;

    -- ---- Resolver LHS (left-hand side) para campos escalares ----
    CASE v_field
      WHEN 'phase'         THEN v_lhs := v_lead.phase;
      WHEN 'temperature'   THEN v_lhs := v_lead.temperature;
      WHEN 'priority'      THEN v_lhs := v_lead.priority;
      WHEN 'tag_slug'      THEN v_lhs := p_ctx->>'tag_slug';
      WHEN 'to_phase'      THEN v_lhs := p_ctx->>'to_phase';
      WHEN 'days_in_phase' THEN
        v_lhs := EXTRACT(
          EPOCH FROM (now() - COALESCE(v_lead.phase_updated_at, v_lead.created_at))
        )::text;
        -- converte para dias na comparacao numerica abaixo
        v_lhs := (v_lhs::numeric / 86400.0)::text;
      ELSE
        RETURN false; -- campo desconhecido = condicao falha
    END CASE;

    -- ---- Avaliar op ----
    CASE v_op
      WHEN 'eq'  THEN
        IF v_lhs IS DISTINCT FROM v_val THEN RETURN false; END IF;
      WHEN 'neq' THEN
        IF v_lhs IS NOT DISTINCT FROM v_val THEN RETURN false; END IF;
      WHEN 'gt'  THEN
        BEGIN
          IF v_lhs::numeric <= v_val::numeric THEN RETURN false; END IF;
        EXCEPTION WHEN OTHERS THEN RETURN false;
        END;
      WHEN 'lt'  THEN
        BEGIN
          IF v_lhs::numeric >= v_val::numeric THEN RETURN false; END IF;
        EXCEPTION WHEN OTHERS THEN RETURN false;
        END;
      WHEN 'in'  THEN
        BEGIN
          IF NOT (v_lhs = ANY(ARRAY(SELECT jsonb_array_elements_text(v_val::jsonb)))) THEN
            RETURN false;
          END IF;
        EXCEPTION WHEN OTHERS THEN RETURN false;
        END;
      ELSE
        RETURN false; -- op desconhecido
    END CASE;

  END LOOP;

  RETURN true;
END;
$$;


-- ============================================================
-- 2. _sdr_exec_action
--    Executa uma unica action de uma regra.
--    Todas as acoes que atribuem tags usam origin='rule'
--    para evitar loop de avaliacao de regras.
--    Retorna jsonb { ok, error? }.
-- ============================================================

DROP FUNCTION IF EXISTS public._sdr_exec_action(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION public._sdr_exec_action(
  p_clinic_id uuid,
  p_lead_id   text,
  p_action    jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_type   text;
  v_due_at timestamptz;
BEGIN
  v_type := p_action->>'type';

  CASE v_type

    -- ---- Atribuir tag (origin='rule' bloqueia dispatch e avaliacao de regras) ----
    WHEN 'add_tag' THEN
      PERFORM sdr_assign_tag(
        p_action->>'tag_slug',
        'lead',
        p_lead_id,
        'rule'
      );
      RETURN jsonb_build_object('ok', true);

    -- ---- Remover tag ----
    WHEN 'remove_tag' THEN
      UPDATE tag_assignments ta
      SET removed_at = now(), removed_by = auth.uid()
      WHERE ta.entity_type = 'lead'
        AND ta.entity_id   = p_lead_id
        AND ta.removed_at  IS NULL
        AND ta.tag_id IN (
          SELECT id FROM tags
          WHERE clinic_id = p_clinic_id
            AND slug      = p_action->>'tag_slug'
        );
      RETURN jsonb_build_object('ok', true);

    -- ---- Mudar fase ----
    WHEN 'change_phase' THEN
      PERFORM sdr_change_phase(p_lead_id, p_action->>'phase', 'regra_automatica');
      RETURN jsonb_build_object('ok', true);

    -- ---- Criar tarefa operacional ----
    WHEN 'create_task' THEN
      v_due_at := CASE
        WHEN (p_action->>'offset_hours') IS NOT NULL
          THEN now() + ((p_action->>'offset_hours')::numeric * interval '1 hour')
        ELSE now() + interval '24 hours'
      END;

      INSERT INTO tasks (
        clinic_id, lead_id, type, title, description,
        status, due_at, triggered_by
      ) VALUES (
        p_clinic_id,
        p_lead_id,
        'task',
        COALESCE(p_action->>'title', 'Tarefa automatica'),
        p_action->>'description',
        'pending',
        v_due_at,
        'rule:' || COALESCE(p_action->>'rule_slug', 'unknown')
      );
      RETURN jsonb_build_object('ok', true);

    -- ---- Criar alerta interno ----
    WHEN 'create_alert' THEN
      INSERT INTO internal_alerts (
        clinic_id, entity_type, entity_id, template_slug,
        titulo, corpo, tipo, para
      ) VALUES (
        p_clinic_id,
        'lead',
        p_lead_id,
        p_action->>'template_slug',
        COALESCE(p_action->>'titulo', 'Alerta automatico'),
        p_action->>'corpo',
        COALESCE(p_action->>'tipo', 'info'),
        COALESCE(p_action->>'para', 'recepcao')
      );
      RETURN jsonb_build_object('ok', true);

    ELSE
      RETURN jsonb_build_object('ok', false, 'error', 'Tipo de acao desconhecido: ' || COALESCE(v_type, 'null'));

  END CASE;

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END;
$$;


-- ============================================================
-- 3. sdr_evaluate_rules (entry point publico)
--    Avalia todas as regras ativas da clinica para o evento
--    dado, em ordem de prioridade (ASC).
--
--    Para cada regra:
--      1. Verifica cooldown
--      2. Verifica max_executions por lead
--      3. Avalia conditions via _sdr_eval_conditions
--      4. Executa actions via _sdr_exec_action
--      5. Grava rule_executions
--      6. Atualiza last_run_at / run_count
--
--    Retorna { ok, rules_fired }.
-- ============================================================

DROP FUNCTION IF EXISTS public.sdr_evaluate_rules(text, text, jsonb);

CREATE OR REPLACE FUNCTION public.sdr_evaluate_rules(
  p_lead_id text,
  p_event   text,
  p_context jsonb DEFAULT '{}'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id   uuid;
  v_rule        automation_rules%ROWTYPE;
  v_action      jsonb;
  v_act_result  jsonb;
  v_actions_run jsonb;
  v_exec_ok     boolean;
  v_rules_fired int := 0;
  v_in_cooldown boolean;
  v_over_limit  boolean;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado ou sem clinica');
  END IF;

  FOR v_rule IN
    SELECT * FROM automation_rules
    WHERE clinic_id     = v_clinic_id
      AND is_active     = true
      AND trigger_event = p_event
    ORDER BY priority ASC, created_at ASC
  LOOP

    -- ---- 1. Cooldown ----
    IF v_rule.cooldown_hours IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM rule_executions
        WHERE rule_id    = v_rule.id
          AND lead_id    = p_lead_id
          AND executed_at > now() - (v_rule.cooldown_hours * interval '1 hour')
          AND success    = true
      ) INTO v_in_cooldown;

      IF v_in_cooldown THEN CONTINUE; END IF;
    END IF;

    -- ---- 2. Max executions por lead ----
    IF v_rule.max_executions IS NOT NULL THEN
      SELECT (COUNT(*) >= v_rule.max_executions)
      FROM rule_executions
      WHERE rule_id = v_rule.id AND lead_id = p_lead_id AND success = true
      INTO v_over_limit;

      IF v_over_limit THEN CONTINUE; END IF;
    END IF;

    -- ---- 3. Avaliar conditions ----
    IF NOT _sdr_eval_conditions(p_lead_id, v_clinic_id, v_rule.conditions, p_context) THEN
      CONTINUE;
    END IF;

    -- ---- 4. Executar actions em sequencia ----
    v_actions_run := '[]'::jsonb;
    v_exec_ok     := true;

    FOR v_action IN SELECT value FROM jsonb_array_elements(v_rule.actions) AS t(value)
    LOOP
      -- Injeta rule_slug na action para rastreabilidade em triggered_by
      v_act_result := _sdr_exec_action(
        v_clinic_id,
        p_lead_id,
        v_action || jsonb_build_object('rule_slug', v_rule.slug)
      );

      v_actions_run := v_actions_run || jsonb_build_array(
        jsonb_build_object(
          'type',  v_action->>'type',
          'ok',    (v_act_result->>'ok')::boolean,
          'error', v_act_result->>'error'
        )
      );

      -- Acao critica falhou: interrompe sequencia desta regra
      IF (v_act_result->>'ok')::boolean = false THEN
        v_exec_ok := false;
        EXIT;
      END IF;
    END LOOP;

    -- ---- 5. Log de execucao ----
    INSERT INTO rule_executions (rule_id, lead_id, success, actions_run, error)
    VALUES (
      v_rule.id,
      p_lead_id,
      v_exec_ok,
      v_actions_run,
      CASE WHEN NOT v_exec_ok THEN 'Acao falhou — ver actions_run' ELSE NULL END
    );

    -- ---- 6. Atualizar estatisticas ----
    UPDATE automation_rules
    SET last_run_at = now(),
        run_count   = run_count + 1
    WHERE id = v_rule.id;

    IF v_exec_ok THEN
      v_rules_fired := v_rules_fired + 1;
    END IF;

  END LOOP;

  RETURN jsonb_build_object('ok', true, 'rules_fired', v_rules_fired);
END;
$$;


-- ============================================================
-- 4. sdr_get_rules
--    Lista todas as regras da clinica (ativas e inativas),
--    ordenadas por priority ASC.
-- ============================================================

DROP FUNCTION IF EXISTS public.sdr_get_rules();

CREATE OR REPLACE FUNCTION public.sdr_get_rules()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado ou sem clinica');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',             r.id,
          'slug',           r.slug,
          'name',           r.name,
          'description',    r.description,
          'trigger_event',  r.trigger_event,
          'conditions',     r.conditions,
          'actions',        r.actions,
          'is_active',      r.is_active,
          'priority',       r.priority,
          'max_executions', r.max_executions,
          'cooldown_hours', r.cooldown_hours,
          'last_run_at',    r.last_run_at,
          'run_count',      r.run_count,
          'created_at',     r.created_at
        ) ORDER BY r.priority ASC, r.created_at ASC
      )
      FROM automation_rules r
      WHERE r.clinic_id = v_clinic_id
    ), '[]'::jsonb)
  );
END;
$$;


-- ============================================================
-- 5. sdr_toggle_rule
--    Ativa ou desativa uma regra da clinica.
-- ============================================================

DROP FUNCTION IF EXISTS public.sdr_toggle_rule(uuid, boolean);

CREATE OR REPLACE FUNCTION public.sdr_toggle_rule(
  p_rule_id uuid,
  p_active  boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado ou sem clinica');
  END IF;

  UPDATE automation_rules
  SET is_active = p_active
  WHERE id = p_rule_id AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Regra nao encontrada');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;


-- ============================================================
-- SEEDS: 3 regras demonstrativas (inativas por padrao)
-- Ativar via Settings > Automacoes ou sdr_toggle_rule().
-- ============================================================

DO $$
DECLARE
  v_clinic_id uuid;
BEGIN
  SELECT id INTO v_clinic_id FROM public.clinics ORDER BY created_at ASC LIMIT 1;
  IF v_clinic_id IS NULL THEN RETURN; END IF;

  -- Regra 1: Lead sem resposta -> tarefa follow-up em 24h
  INSERT INTO public.automation_rules (
    clinic_id, slug, name, description,
    trigger_event, conditions, actions,
    is_active, priority, cooldown_hours
  ) VALUES (
    v_clinic_id,
    'sem_resposta_followup_24h',
    'Lead sem resposta: follow-up em 24h',
    'Quando a tag "sem resposta" e atribuida, cria tarefa de follow-up para 24h depois.',
    'tag_added',
    '[{"field": "tag_slug", "op": "eq", "value": "lead_sem_resposta"}]',
    '[{"type": "create_task", "title": "Follow-up: lead sem resposta", "description": "Lead marcado como sem resposta. Entrar em contato para reativar.", "offset_hours": 24}]',
    false,
    10,
    48
  ) ON CONFLICT (clinic_id, slug) DO NOTHING;

  -- Regra 2: Lead quente -> tarefa urgente em 1h
  INSERT INTO public.automation_rules (
    clinic_id, slug, name, description,
    trigger_event, conditions, actions,
    is_active, priority, cooldown_hours
  ) VALUES (
    v_clinic_id,
    'lead_quente_contato_urgente',
    'Lead quente: contato urgente em 1h',
    'Quando um lead recebe a tag "quente", cria tarefa urgente para contato em 1 hora.',
    'tag_added',
    '[{"field": "tag_slug", "op": "eq", "value": "lead_quente"}]',
    '[{"type": "create_task", "title": "Contato urgente: lead quente", "description": "Lead classificado como quente. Ligar ou enviar mensagem em ate 1 hora.", "offset_hours": 1}]',
    false,
    5,
    24
  ) ON CONFLICT (clinic_id, slug) DO NOTHING;

  -- Regra 3: Fase mudou para agendamento -> alerta interno para recepcao
  INSERT INTO public.automation_rules (
    clinic_id, slug, name, description,
    trigger_event, conditions, actions,
    is_active, priority
  ) VALUES (
    v_clinic_id,
    'fase_agendamento_alerta_recepcao',
    'Fase agendamento: alerta para recepcao',
    'Quando um lead avanca para a fase de agendamento, envia alerta interno para a recepcao.',
    'phase_changed',
    '[{"field": "to_phase", "op": "eq", "value": "agendamento"}]',
    '[{"type": "create_alert", "titulo": "Lead agendado", "corpo": "Um lead avancou para a fase de agendamento e esta aguardando confirmacao.", "tipo": "sucesso", "para": "recepcao"}]',
    false,
    20
  ) ON CONFLICT (clinic_id, slug) DO NOTHING;

END $$;

-- ============================================================
-- VERIFICACAO:
-- SELECT slug, trigger_event, is_active, priority, run_count
-- FROM public.automation_rules ORDER BY priority;
--
-- SELECT rule_id, lead_id, success, actions_run, executed_at
-- FROM public.rule_executions ORDER BY executed_at DESC LIMIT 20;
-- ============================================================
