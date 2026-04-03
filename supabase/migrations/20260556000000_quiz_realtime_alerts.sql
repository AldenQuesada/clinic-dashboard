-- ============================================================================
-- Quiz Realtime Alerts — Alertas de eventos em tempo real
-- ============================================================================
-- Fase 5: alertas disparados no momento em que acontecem, não pelo cron.
--
-- Eventos detectados:
--   1. lead_new         — lead novo entrou via quiz
--   2. lead_duplicate   — mesmo telefone submeteu novamente
--   3. lead_recovered   — lead que tinha abandonado voltou e completou
--   4. temp_changed     — temperatura do lead mudou (ex: cold → hot)
--
-- Pico de abandonos detectado via trigger na tabela quiz_events.
-- ============================================================================

-- ── 1. Função que gera alertas de evento dentro do submit ────────────────────
CREATE OR REPLACE FUNCTION _quiz_event_alerts(
  p_quiz_id       uuid,
  p_clinic_id     uuid,
  p_quiz_title    text,
  p_contact_name  text,
  p_contact_phone text,
  p_temperature   text,
  p_is_new_lead   boolean,
  p_old_temp      text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_name       text;
  v_was_abandoned boolean := false;
  v_temp_labels  jsonb := '{"hot":"Quente","warm":"Morno","cold":"Frio"}'::jsonb;
BEGIN
  v_name := COALESCE(NULLIF(trim(p_contact_name), ''), 'Lead');

  -- 1. Lead novo
  IF p_is_new_lead THEN
    INSERT INTO quiz_alerts (quiz_id, clinic_id, alert_type, severity, metric, title, description, recommendation, data)
    VALUES (
      p_quiz_id, p_clinic_id, 'event', 'info', 'lead_new',
      'Novo lead: ' || v_name || ' — ' || p_quiz_title,
      'Telefone: ' || COALESCE(p_contact_phone, '-') || ' | Temperatura: ' || (v_temp_labels ->> p_temperature),
      'Faça contato em até 5 minutos. Leads quentes que recebem resposta rápida convertem 3x mais.',
      jsonb_build_object('name', v_name, 'phone', p_contact_phone, 'temperature', p_temperature)
    );
  END IF;

  -- 2. Lead duplicado (não é novo, telefone já existia)
  IF NOT p_is_new_lead THEN
    INSERT INTO quiz_alerts (quiz_id, clinic_id, alert_type, severity, metric, title, description, recommendation, data)
    VALUES (
      p_quiz_id, p_clinic_id, 'event', 'warning', 'lead_duplicate',
      'Lead repetido: ' || v_name || ' — ' || p_quiz_title,
      'Este lead já respondeu o quiz antes. Telefone: ' || COALESCE(p_contact_phone, '-'),
      'O lead pode estar indeciso. Reforce a proposta com uma abordagem diferente ou ofereça um benefício exclusivo.',
      jsonb_build_object('name', v_name, 'phone', p_contact_phone)
    );
  END IF;

  -- 3. Lead recuperado (tinha abandonado antes e agora completou)
  IF p_contact_phone IS NOT NULL AND trim(p_contact_phone) != '' THEN
    SELECT EXISTS(
      SELECT 1 FROM quiz_events e
      WHERE e.quiz_id = p_quiz_id
        AND e.contact_phone = p_contact_phone
        AND e.event_type = 'step_view'
        AND e.session_id NOT IN (
          SELECT session_id FROM quiz_events
          WHERE quiz_id = p_quiz_id AND event_type = 'quiz_complete'
        )
      LIMIT 1
    ) INTO v_was_abandoned;

    IF v_was_abandoned THEN
      INSERT INTO quiz_alerts (quiz_id, clinic_id, alert_type, severity, metric, title, description, recommendation, data)
      VALUES (
        p_quiz_id, p_clinic_id, 'event', 'positive', 'lead_recovered',
        'Lead recuperado: ' || v_name || ' — ' || p_quiz_title,
        v_name || ' tinha abandonado o quiz antes e voltou para completar.',
        'Priorize o contato. Lead recuperado tem alto interesse — a persistência mostra intenção real.',
        jsonb_build_object('name', v_name, 'phone', p_contact_phone)
      );
    END IF;
  END IF;

  -- 4. Temperatura mudou
  IF p_old_temp IS NOT NULL AND p_old_temp != p_temperature THEN
    INSERT INTO quiz_alerts (quiz_id, clinic_id, alert_type, severity, metric, title, description, recommendation, data)
    VALUES (
      p_quiz_id, p_clinic_id, 'event',
      CASE WHEN p_temperature = 'hot' THEN 'positive' WHEN p_temperature = 'cold' THEN 'warning' ELSE 'info' END,
      'temp_changed',
      'Temperatura mudou: ' || v_name || ' — ' || (v_temp_labels ->> p_old_temp) || ' → ' || (v_temp_labels ->> p_temperature),
      'Telefone: ' || COALESCE(p_contact_phone, '-'),
      CASE
        WHEN p_temperature = 'hot' THEN 'Lead esquentou! Priorize o atendimento — o interesse aumentou.'
        WHEN p_temperature = 'cold' THEN 'Lead esfriou. Revise a abordagem ou ofereça um incentivo para reengajar.'
        ELSE 'Temperatura mudou. Ajuste a prioridade do atendimento.'
      END,
      jsonb_build_object('name', v_name, 'phone', p_contact_phone, 'from', p_old_temp, 'to', p_temperature)
    );
  END IF;
END;
$$;

-- ── 2. Atualizar submit_quiz_response para gerar alertas ─────────────────────
CREATE OR REPLACE FUNCTION submit_quiz_response(
  p_quiz_id       uuid,
  p_clinic_id     uuid,
  p_answers       jsonb,
  p_score         int,
  p_temperature   text,
  p_contact_name  text,
  p_contact_phone text,
  p_contact_email text,
  p_utm_source    text,
  p_utm_medium    text,
  p_utm_campaign  text,
  p_kanban_target text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_response_id uuid;
  v_lead_id     text;
  v_is_new      boolean := false;
  v_phone       text;
  v_pipeline_id uuid;
  v_stage_id    uuid;
  v_old_temp    text := NULL;
  v_quiz_title  text;
BEGIN
  v_phone := trim(COALESCE(p_contact_phone, ''));

  -- Buscar título do quiz para os alertas
  SELECT title INTO v_quiz_title FROM quiz_templates WHERE id = p_quiz_id;

  -- 1. Inserir em quiz_responses
  INSERT INTO quiz_responses (
    quiz_id, clinic_id, answers, score, temperature,
    contact_name, contact_phone, contact_email,
    utm_source, utm_medium, utm_campaign
  ) VALUES (
    p_quiz_id, p_clinic_id, p_answers, p_score, p_temperature,
    p_contact_name, v_phone, NULLIF(trim(COALESCE(p_contact_email, '')), ''),
    p_utm_source, p_utm_medium, p_utm_campaign
  )
  RETURNING id INTO v_response_id;

  -- 2. Criar ou atualizar lead
  IF v_phone != '' THEN
    -- Verificar temperatura anterior (para detectar mudança)
    SELECT temperature INTO v_old_temp
    FROM leads
    WHERE phone = v_phone AND clinic_id = p_clinic_id AND deleted_at IS NULL
    LIMIT 1;

    INSERT INTO leads (
      id, name, phone, email,
      clinic_id, temperature, phase, day_bucket,
      status, lead_score, birth_date, data
    ) VALUES (
      gen_random_uuid()::text,
      COALESCE(p_contact_name, ''),
      v_phone,
      COALESCE(NULLIF(trim(COALESCE(p_contact_email, '')), ''), ''),
      p_clinic_id,
      p_temperature,
      'captacao',
      1,
      'new',
      0,
      '',
      '{}'::jsonb
    )
    ON CONFLICT (clinic_id, phone)
    DO UPDATE SET
      temperature = EXCLUDED.temperature,
      name  = COALESCE(NULLIF(leads.name, ''), EXCLUDED.name),
      email = COALESCE(leads.email, EXCLUDED.email)
    RETURNING id INTO v_lead_id;

    -- Detectar se é novo (v_old_temp NULL = não existia)
    v_is_new := (v_old_temp IS NULL);

    IF v_lead_id IS NULL THEN
      SELECT id INTO v_lead_id
      FROM leads
      WHERE phone = v_phone AND clinic_id = p_clinic_id AND deleted_at IS NULL
      LIMIT 1;
    END IF;

    -- 3. Vincular quiz_response ao lead
    IF v_lead_id IS NOT NULL THEN
      UPDATE quiz_responses
      SET lead_id = v_lead_id::uuid
      WHERE id = v_response_id;
    END IF;

    -- 4. Posicionar em todos os pipelines ativos
    IF v_lead_id IS NOT NULL THEN
      FOR v_pipeline_id IN
        SELECT p.id FROM pipelines p
        WHERE p.clinic_id = p_clinic_id AND p.is_active = true
      LOOP
        SELECT ps.id INTO v_stage_id
        FROM pipeline_stages ps
        WHERE ps.pipeline_id = v_pipeline_id AND ps.is_active = true
        ORDER BY ps.sort_order ASC
        LIMIT 1;

        IF v_stage_id IS NOT NULL THEN
          INSERT INTO lead_pipeline_positions (lead_id, pipeline_id, stage_id, origin)
          VALUES (v_lead_id, v_pipeline_id, v_stage_id, 'auto')
          ON CONFLICT (lead_id, pipeline_id) DO NOTHING;
        END IF;
      END LOOP;
    END IF;

    -- 5. Gerar alertas de evento em tempo real
    PERFORM _quiz_event_alerts(
      p_quiz_id, p_clinic_id, COALESCE(v_quiz_title, ''),
      p_contact_name, v_phone, p_temperature,
      v_is_new, v_old_temp
    );
  END IF;

  RETURN jsonb_build_object(
    'quiz_response_id', v_response_id,
    'lead_id',          v_lead_id,
    'is_new',           v_is_new
  );
END;
$$;

GRANT EXECUTE ON FUNCTION submit_quiz_response(
  uuid, uuid, jsonb, int, text,
  text, text, text, text, text, text, text
) TO anon;

-- ── 3. Trigger para detectar pico de abandonos ──────────────────────────────
CREATE OR REPLACE FUNCTION _quiz_check_abandon_spike()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_abandon_count int;
  v_threshold     int := 5;  -- alertar se >= 5 abandonos no mesmo step em 24h
  v_quiz_title    text;
  v_existing      int;
BEGIN
  -- Só processa step_view events
  IF NEW.event_type != 'step_view' THEN RETURN NEW; END IF;

  -- Contar abandonos neste step nas últimas 24h
  SELECT count(DISTINCT e.session_id) INTO v_abandon_count
  FROM quiz_events e
  WHERE e.quiz_id = NEW.quiz_id
    AND e.step_index = NEW.step_index
    AND e.event_type = 'step_view'
    AND e.created_at >= now() - interval '24 hours'
    AND e.session_id NOT IN (
      SELECT session_id FROM quiz_events
      WHERE quiz_id = NEW.quiz_id AND event_type = 'quiz_complete'
      AND created_at >= now() - interval '24 hours'
    );

  -- Se atingiu o threshold e não tem alerta recente para este step
  IF v_abandon_count >= v_threshold THEN
    SELECT count(*) INTO v_existing
    FROM quiz_alerts
    WHERE quiz_id = NEW.quiz_id
      AND metric = 'abandon_spike'
      AND (data ->> 'step_index')::int = NEW.step_index
      AND created_at >= now() - interval '24 hours';

    IF v_existing = 0 THEN
      SELECT title INTO v_quiz_title FROM quiz_templates WHERE id = NEW.quiz_id;

      INSERT INTO quiz_alerts (quiz_id, clinic_id, alert_type, severity, metric, title, description, recommendation, data)
      VALUES (
        NEW.quiz_id, NEW.clinic_id, 'event', 'critical', 'abandon_spike',
        'Pico de abandonos: "' || COALESCE(NEW.step_label, 'Step ' || NEW.step_index) || '" — ' || COALESCE(v_quiz_title, ''),
        v_abandon_count || ' leads abandonaram nesta pergunta nas últimas 24h.',
        'Ação urgente: simplifique, reescreva ou remova esta pergunta. Ela está bloqueando o funil.',
        jsonb_build_object('step_index', NEW.step_index, 'step_label', NEW.step_label, 'count', v_abandon_count)
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Criar trigger (executa após cada INSERT em quiz_events)
DROP TRIGGER IF EXISTS trg_quiz_abandon_spike ON quiz_events;
CREATE TRIGGER trg_quiz_abandon_spike
  AFTER INSERT ON quiz_events
  FOR EACH ROW
  EXECUTE FUNCTION _quiz_check_abandon_spike();
