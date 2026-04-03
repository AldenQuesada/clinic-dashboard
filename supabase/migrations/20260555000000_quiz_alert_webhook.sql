-- ============================================================================
-- Quiz Alert Webhook — Dispara webhook com resumo de alertas para WhatsApp
-- ============================================================================
-- Chamado pelo cron após quiz_generate_alerts.
-- Para cada quiz com webhook_url configurado, faz POST com o resumo.
-- Compatível com: n8n, Make, Zapier, Evolution API, qualquer endpoint.
-- ============================================================================

-- Habilitar extensão http para chamadas externas
CREATE EXTENSION IF NOT EXISTS http;

-- ── Formatar mensagem de texto para WhatsApp ────────────────────────────────
CREATE OR REPLACE FUNCTION _quiz_format_wa_message(
  p_quiz_title text,
  p_alert_type text,
  p_alerts     jsonb
)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_msg       text;
  v_alert     RECORD;
  v_type_label text;
  v_icon       text;
  v_has_action boolean := false;
BEGIN
  -- Label do tipo
  IF p_alert_type = 'daily' THEN v_type_label := 'Resumo Diário';
  ELSIF p_alert_type = 'weekly' THEN v_type_label := 'Resumo Semanal';
  ELSIF p_alert_type = 'monthly' THEN v_type_label := 'Fechamento Mensal';
  ELSE v_type_label := 'Alerta'; END IF;

  v_msg := v_type_label || ' - ' || p_quiz_title || E'\n';
  v_msg := v_msg || to_char(now(), 'DD/MM/YYYY HH24:MI') || E'\n\n';

  FOR v_alert IN SELECT * FROM jsonb_to_recordset(p_alerts)
    AS x(severity text, metric text, title text, description text, variation text)
  LOOP
    -- Ícone por severidade
    IF v_alert.severity = 'critical' THEN v_icon := '!!!'; v_has_action := true;
    ELSIF v_alert.severity = 'warning' THEN v_icon := '!!'; v_has_action := true;
    ELSIF v_alert.severity = 'positive' THEN v_icon := '+';
    ELSE v_icon := '-'; END IF;

    v_msg := v_msg || v_icon || ' ' || v_alert.title || E'\n';
    v_msg := v_msg || '  ' || v_alert.description || E'\n\n';
  END LOOP;

  IF v_has_action THEN
    v_msg := v_msg || 'Acao necessaria: Abra o painel de Alertas do quiz para ver as recomendacoes.';
  ELSE
    v_msg := v_msg || 'Tudo em dia. Continue monitorando.';
  END IF;

  RETURN v_msg;
END;
$$;

-- ── Disparar webhook para cada quiz com URL configurada ─────────────────────
CREATE OR REPLACE FUNCTION quiz_dispatch_webhooks(
  p_alert_type text DEFAULT 'daily'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_quiz       RECORD;
  v_alerts     jsonb;
  v_phones     text;
  v_webhook    text;
  v_msg        text;
  v_phones_arr jsonb;
  v_payload    jsonb;
  v_count      int := 0;
BEGIN
  FOR v_quiz IN
    SELECT id, clinic_id, title, schema
    FROM quiz_templates
    WHERE active = true
      AND schema -> 'notifications' ->> 'webhook_url' IS NOT NULL
      AND schema -> 'notifications' ->> 'webhook_url' != ''
  LOOP
    v_webhook := v_quiz.schema -> 'notifications' ->> 'webhook_url';
    v_phones  := v_quiz.schema -> 'notifications' ->> 'whatsapp_numbers';

    -- Buscar alertas pendentes gerados hoje
    SELECT coalesce(jsonb_agg(row_to_json(a)), '[]'::jsonb)
    INTO v_alerts
    FROM (
      SELECT severity, metric, title, description,
             data ->> 'variation' as variation,
             data ->> 'current' as current_val,
             data ->> 'previous' as previous_val,
             recommendation
      FROM quiz_alerts
      WHERE quiz_id = v_quiz.id AND clinic_id = v_quiz.clinic_id
        AND alert_type = p_alert_type
        AND status = 'pending'
        AND created_at >= date_trunc('day', now())
      ORDER BY
        CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END
    ) a;

    -- Pular se não há alertas
    IF v_alerts = '[]'::jsonb THEN CONTINUE; END IF;

    -- Formatar mensagem de texto
    v_msg := _quiz_format_wa_message(v_quiz.title, p_alert_type, v_alerts);

    -- Converter números para array JSON
    v_phones_arr := '[]'::jsonb;
    IF v_phones IS NOT NULL AND v_phones != '' THEN
      SELECT jsonb_agg(trim(p))
      INTO v_phones_arr
      FROM unnest(string_to_array(v_phones, ',')) AS p
      WHERE trim(p) != '';
    END IF;

    -- Montar payload
    v_payload := jsonb_build_object(
      'quiz_id',     v_quiz.id,
      'quiz_title',  v_quiz.title,
      'alert_type',  p_alert_type,
      'phones',      v_phones_arr,
      'message',     v_msg,
      'alerts',      v_alerts,
      'generated_at', now()
    );

    -- Disparar webhook via http extension
    BEGIN
      PERFORM http_post(
        v_webhook,
        v_payload::text,
        'application/json'
      );
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      -- Log error silently, não bloqueia outros quizzes
      RAISE WARNING 'Webhook failed for quiz %: %', v_quiz.id, SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'webhooks_sent', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION quiz_dispatch_webhooks(text) TO anon;
GRANT EXECUTE ON FUNCTION quiz_dispatch_webhooks(text) TO authenticated;

-- ── Função combinada: gera alertas + dispara webhooks ───────────────────────
CREATE OR REPLACE FUNCTION quiz_alerts_and_notify(
  p_alert_type text DEFAULT 'daily'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_gen jsonb;
  v_wh  jsonb;
BEGIN
  v_gen := quiz_generate_alerts(p_alert_type);
  v_wh  := quiz_dispatch_webhooks(p_alert_type);

  RETURN jsonb_build_object(
    'alerts', v_gen,
    'webhooks', v_wh
  );
END;
$$;

GRANT EXECUTE ON FUNCTION quiz_alerts_and_notify(text) TO anon;
GRANT EXECUTE ON FUNCTION quiz_alerts_and_notify(text) TO authenticated;
