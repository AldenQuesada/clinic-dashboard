-- ============================================================================
-- Quiz Alert Generator — Geração automática de alertas comparando períodos
-- ============================================================================
-- Compara KPIs do período atual vs anterior e gera alertas com recomendações.
-- Chamado pelo cron às 18h (diário), sexta 18h (semanal), fim do mês (mensal).
-- ============================================================================

-- ── Função auxiliar: calcula KPIs para um período ───────────────────────────
CREATE OR REPLACE FUNCTION _quiz_kpis_for_period(
  p_quiz_id   uuid,
  p_clinic_id uuid,
  p_from      timestamptz,
  p_to        timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_page_views int;
  v_started    int;
  v_completed  int;
  v_wa_clicks  int;
  v_abandoned  int;
BEGIN
  SELECT count(*) INTO v_page_views
    FROM quiz_events WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
    AND event_type = 'page_view' AND created_at BETWEEN p_from AND p_to;

  SELECT count(*) INTO v_started
    FROM quiz_events WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
    AND event_type = 'quiz_start' AND created_at BETWEEN p_from AND p_to;

  SELECT count(*) INTO v_completed
    FROM quiz_responses WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
    AND submitted_at BETWEEN p_from AND p_to;

  SELECT count(*) INTO v_wa_clicks
    FROM quiz_events WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
    AND event_type = 'whatsapp_click' AND created_at BETWEEN p_from AND p_to;

  SELECT count(DISTINCT session_id) INTO v_abandoned
    FROM quiz_events WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
    AND event_type = 'step_view' AND created_at BETWEEN p_from AND p_to
    AND session_id NOT IN (
      SELECT session_id FROM quiz_events
      WHERE quiz_id = p_quiz_id AND event_type = 'quiz_complete'
      AND created_at BETWEEN p_from AND p_to
    );

  -- Fallback: se não tem eventos mas tem respostas
  IF v_started = 0 AND v_completed > 0 THEN v_started := v_completed; END IF;
  IF v_page_views = 0 AND v_started > 0 THEN v_page_views := v_started; END IF;

  RETURN jsonb_build_object(
    'page_views', v_page_views,
    'started',    v_started,
    'completed',  v_completed,
    'wa_clicks',  v_wa_clicks,
    'abandoned',  v_abandoned,
    'engagement', CASE WHEN v_page_views > 0 THEN round((v_started::numeric / v_page_views) * 100, 1) ELSE 0 END,
    'conversion', CASE WHEN v_started > 0 THEN round((v_completed::numeric / v_started) * 100, 1) ELSE 0 END,
    'wa_rate',    CASE WHEN v_completed > 0 THEN round((v_wa_clicks::numeric / v_completed) * 100, 1) ELSE 0 END
  );
END;
$$;

-- ── Função principal: gera alertas para todos os quizzes ativos ─────────────
CREATE OR REPLACE FUNCTION quiz_generate_alerts(
  p_alert_type text DEFAULT 'daily'  -- 'daily' | 'weekly' | 'monthly'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quiz       RECORD;
  v_now        timestamptz := now();
  v_current    jsonb;
  v_previous   jsonb;
  v_from_cur   timestamptz;
  v_to_cur     timestamptz;
  v_from_prev  timestamptz;
  v_to_prev    timestamptz;
  v_metric     text;
  v_cur_val    numeric;
  v_prev_val   numeric;
  v_variation  numeric;
  v_severity   text;
  v_title      text;
  v_desc       text;
  v_rec        text;
  v_count      int := 0;
  v_metrics    text[] := ARRAY['page_views', 'engagement', 'conversion', 'wa_rate', 'abandoned'];
  v_labels     text[] := ARRAY['Visualizações', 'Engajamento', 'Conversão', 'WhatsApp', 'Abandonos'];
  v_recs_down  text[] := ARRAY[
    'Revise a campanha de tráfego. Verifique se o link do quiz está ativo e se o orçamento de ads não foi pausado.',
    'A tela inicial não está atraindo. Teste trocar o título, a imagem ou o texto do botão CTA.',
    'Leads estão desistindo no meio. Veja Pontos de Saída e simplifique a pergunta com mais abandonos.',
    'Teste mudar o vídeo, a foto ou a oferta da tela final para incentivar o clique no WhatsApp.',
    'Mais leads estão desistindo. Reduza o número de perguntas ou simplifique as opções.'
  ];
BEGIN
  -- Calcular períodos
  IF p_alert_type = 'daily' THEN
    v_from_cur  := date_trunc('day', v_now);
    v_to_cur    := v_now;
    v_from_prev := v_from_cur - interval '1 day';
    v_to_prev   := v_from_cur;
  ELSIF p_alert_type = 'weekly' THEN
    v_from_cur  := date_trunc('week', v_now);
    v_to_cur    := v_now;
    v_from_prev := v_from_cur - interval '7 days';
    v_to_prev   := v_from_cur;
  ELSIF p_alert_type = 'monthly' THEN
    v_from_cur  := date_trunc('month', v_now);
    v_to_cur    := v_now;
    v_from_prev := v_from_cur - interval '1 month';
    v_to_prev   := v_from_cur;
  END IF;

  -- Iterar sobre todos os quizzes ativos
  FOR v_quiz IN
    SELECT id, clinic_id, title, schema
    FROM quiz_templates
    WHERE active = true
  LOOP
    -- Calcular KPIs para período atual e anterior
    v_current  := _quiz_kpis_for_period(v_quiz.id, v_quiz.clinic_id, v_from_cur, v_to_cur);
    v_previous := _quiz_kpis_for_period(v_quiz.id, v_quiz.clinic_id, v_from_prev, v_to_prev);

    -- Gerar alerta para cada métrica
    FOR i IN 1..array_length(v_metrics, 1) LOOP
      v_metric  := v_metrics[i];
      v_cur_val := COALESCE((v_current ->> v_metric)::numeric, 0);
      v_prev_val := COALESCE((v_previous ->> v_metric)::numeric, 0);

      -- Calcular variação
      IF v_prev_val > 0 THEN
        v_variation := round(((v_cur_val - v_prev_val) / v_prev_val) * 100, 1);
      ELSIF v_cur_val > 0 THEN
        v_variation := 100;
      ELSE
        v_variation := 0;
      END IF;

      -- Determinar severidade e mensagem
      -- Para abandonos, lógica invertida (aumento = ruim)
      IF v_metric = 'abandoned' THEN
        IF v_variation > 20 THEN
          v_severity := 'critical';
          v_title := v_labels[i] || ' aumentaram ' || abs(v_variation) || '% — ' || v_quiz.title;
          v_desc := 'Hoje: ' || v_cur_val || ' | Anterior: ' || v_prev_val;
          v_rec := v_recs_down[i];
        ELSIF v_variation > 0 THEN
          v_severity := 'warning';
          v_title := v_labels[i] || ' subiram ' || abs(v_variation) || '% — ' || v_quiz.title;
          v_desc := 'Hoje: ' || v_cur_val || ' | Anterior: ' || v_prev_val;
          v_rec := v_recs_down[i];
        ELSIF v_variation < -10 THEN
          v_severity := 'positive';
          v_title := v_labels[i] || ' diminuíram ' || abs(v_variation) || '% — ' || v_quiz.title;
          v_desc := 'Hoje: ' || v_cur_val || ' | Anterior: ' || v_prev_val;
          v_rec := '';
        ELSE
          v_severity := 'info';
          v_title := v_labels[i] || ' estáveis — ' || v_quiz.title;
          v_desc := 'Hoje: ' || v_cur_val || ' | Anterior: ' || v_prev_val;
          v_rec := '';
        END IF;
      ELSE
        -- Métricas normais (queda = ruim)
        IF v_variation < -20 THEN
          v_severity := 'critical';
          v_title := v_labels[i] || ' caíram ' || abs(v_variation) || '% — ' || v_quiz.title;
          v_desc := 'Hoje: ' || v_cur_val || ' | Anterior: ' || v_prev_val;
          v_rec := v_recs_down[i];
        ELSIF v_variation < 0 THEN
          v_severity := 'warning';
          v_title := v_labels[i] || ' caíram ' || abs(v_variation) || '% — ' || v_quiz.title;
          v_desc := 'Hoje: ' || v_cur_val || ' | Anterior: ' || v_prev_val;
          v_rec := v_recs_down[i];
        ELSIF v_variation > 10 THEN
          v_severity := 'positive';
          v_title := v_labels[i] || ' subiram ' || abs(v_variation) || '% — ' || v_quiz.title;
          v_desc := 'Hoje: ' || v_cur_val || ' | Anterior: ' || v_prev_val;
          v_rec := '';
        ELSE
          v_severity := 'info';
          v_title := v_labels[i] || ' estáveis — ' || v_quiz.title;
          v_desc := 'Hoje: ' || v_cur_val || ' | Anterior: ' || v_prev_val;
          v_rec := '';
        END IF;
      END IF;

      -- Inserir alerta (só se tiver dados, não gera para quizzes sem atividade)
      IF v_cur_val > 0 OR v_prev_val > 0 THEN
        INSERT INTO quiz_alerts (
          quiz_id, clinic_id, alert_type, severity, metric,
          title, description, recommendation, data
        ) VALUES (
          v_quiz.id, v_quiz.clinic_id, p_alert_type, v_severity, v_metric,
          v_title, v_desc, v_rec,
          jsonb_build_object(
            'current', v_cur_val,
            'previous', v_prev_val,
            'variation', v_variation,
            'period_from', v_from_cur,
            'period_to', v_to_cur
          )
        );
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'alerts_generated', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION quiz_generate_alerts(text) TO anon;
GRANT EXECUTE ON FUNCTION quiz_generate_alerts(text) TO authenticated;

-- ── Função para retornar dados para WhatsApp (resumo formatado) ──────────────
CREATE OR REPLACE FUNCTION quiz_whatsapp_summary(
  p_quiz_id   uuid,
  p_clinic_id uuid,
  p_alert_type text DEFAULT 'daily'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quiz_title text;
  v_phones     text;
  v_alerts     jsonb;
BEGIN
  -- Buscar título e números de notificação
  SELECT title, schema -> 'notifications' ->> 'whatsapp_numbers'
  INTO v_quiz_title, v_phones
  FROM quiz_templates
  WHERE id = p_quiz_id AND clinic_id = p_clinic_id;

  -- Buscar alertas pendentes do tipo solicitado (gerados hoje)
  SELECT coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb)
  INTO v_alerts
  FROM (
    SELECT severity, metric, title, description, data ->> 'variation' as variation
    FROM quiz_alerts
    WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
      AND alert_type = p_alert_type
      AND status = 'pending'
      AND created_at >= date_trunc('day', now())
    ORDER BY
      CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END
  ) a;

  RETURN jsonb_build_object(
    'quiz_title', v_quiz_title,
    'whatsapp_numbers', v_phones,
    'alert_type', p_alert_type,
    'alerts', v_alerts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION quiz_whatsapp_summary(uuid, uuid, text) TO authenticated;
