-- ============================================================================
-- Quiz Alerts — Sistema de alertas e notificações por quiz
-- ============================================================================

CREATE TABLE IF NOT EXISTS quiz_alerts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id         uuid NOT NULL REFERENCES quiz_templates(id) ON DELETE CASCADE,
  clinic_id       uuid NOT NULL,
  alert_type      text NOT NULL CHECK (alert_type IN ('daily', 'weekly', 'monthly', 'event')),
  severity        text NOT NULL CHECK (severity IN ('info', 'warning', 'critical', 'positive')),
  metric          text NOT NULL,
  title           text NOT NULL,
  description     text NOT NULL DEFAULT '',
  recommendation  text NOT NULL DEFAULT '',
  data            jsonb NOT NULL DEFAULT '{}',
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'done')),
  done_by         text DEFAULT NULL,
  done_at         timestamptz DEFAULT NULL,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX idx_quiz_alerts_quiz_id ON quiz_alerts(quiz_id);
CREATE INDEX idx_quiz_alerts_status ON quiz_alerts(status);
CREATE INDEX idx_quiz_alerts_created_at ON quiz_alerts(created_at);
CREATE INDEX idx_quiz_alerts_clinic_quiz ON quiz_alerts(clinic_id, quiz_id);

ALTER TABLE quiz_alerts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth_read_quiz_alerts"
  ON quiz_alerts FOR SELECT
  TO authenticated
  USING (clinic_id = (auth.jwt() ->> 'clinic_id')::uuid);

CREATE POLICY "auth_update_quiz_alerts"
  ON quiz_alerts FOR UPDATE
  TO authenticated
  USING (clinic_id = (auth.jwt() ->> 'clinic_id')::uuid);

-- Anon pode inserir (para edge functions / cron)
CREATE POLICY "anon_insert_quiz_alerts"
  ON quiz_alerts FOR INSERT
  TO anon
  WITH CHECK (true);

-- ============================================================================
-- RPC: quiz_get_alerts — Lista alertas de um quiz com filtros
-- ============================================================================
CREATE OR REPLACE FUNCTION quiz_get_alerts(
  p_quiz_id   uuid,
  p_clinic_id uuid,
  p_status    text DEFAULT NULL,
  p_limit     int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT coalesce(jsonb_agg(row_to_json(r)), '[]'::jsonb)
    FROM (
      SELECT id, alert_type, severity, metric, title, description,
             recommendation, data, status, done_by, done_at, created_at
      FROM quiz_alerts
      WHERE quiz_id = p_quiz_id
        AND clinic_id = p_clinic_id
        AND (p_status IS NULL OR status = p_status)
      ORDER BY
        CASE WHEN status = 'pending' THEN 0 ELSE 1 END,
        CASE severity
          WHEN 'critical' THEN 0
          WHEN 'warning' THEN 1
          WHEN 'positive' THEN 2
          ELSE 3 END,
        created_at DESC
      LIMIT p_limit
    ) r
  );
END;
$$;

GRANT EXECUTE ON FUNCTION quiz_get_alerts(uuid, uuid, text, int) TO authenticated;

-- ============================================================================
-- RPC: quiz_mark_alert_done — Marca alerta como feito
-- ============================================================================
CREATE OR REPLACE FUNCTION quiz_mark_alert_done(
  p_alert_id  uuid,
  p_done_by   text DEFAULT 'sdr'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE quiz_alerts
  SET status = 'done',
      done_by = p_done_by,
      done_at = now()
  WHERE id = p_alert_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION quiz_mark_alert_done(uuid, text) TO authenticated;

-- ============================================================================
-- RPC: quiz_alert_counts — Contagem de alertas pendentes por quiz
-- ============================================================================
CREATE OR REPLACE FUNCTION quiz_alert_counts(
  p_quiz_id   uuid,
  p_clinic_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN (
    SELECT jsonb_build_object(
      'total',    count(*),
      'critical', count(*) FILTER (WHERE severity = 'critical'),
      'warning',  count(*) FILTER (WHERE severity = 'warning'),
      'info',     count(*) FILTER (WHERE severity = 'info'),
      'positive', count(*) FILTER (WHERE severity = 'positive')
    )
    FROM quiz_alerts
    WHERE quiz_id = p_quiz_id
      AND clinic_id = p_clinic_id
      AND status = 'pending'
  );
END;
$$;

GRANT EXECUTE ON FUNCTION quiz_alert_counts(uuid, uuid) TO authenticated;
