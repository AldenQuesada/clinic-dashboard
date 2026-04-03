-- ============================================================================
-- Quiz Events — Tracking de interações do lead com o quiz
-- ============================================================================
-- Rastreia: quiz_start, step_view, quiz_complete, whatsapp_click, btn_click
-- Permite análise de funil, pontos de saída, conversão e comportamento.
-- ============================================================================

CREATE TABLE IF NOT EXISTS quiz_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id       uuid NOT NULL REFERENCES quiz_templates(id) ON DELETE CASCADE,
  clinic_id     uuid NOT NULL,
  session_id    text NOT NULL,                          -- fingerprint único por sessão do lead
  event_type    text NOT NULL CHECK (event_type IN (
    'quiz_start',       -- clicou "Começar"
    'step_view',        -- visualizou um step (pergunta, contato, lgpd)
    'quiz_complete',    -- confirmou LGPD e submeteu
    'whatsapp_click',   -- clicou no botão WhatsApp na tela final
    'btn_click'         -- clicou no botão personalizado na tela final
  )),
  step_index    int DEFAULT NULL,                       -- índice do step (0..N-1 perguntas, N=contato, N+1=lgpd)
  step_label    text DEFAULT NULL,                      -- label legível (título da pergunta ou 'Contato'/'LGPD')
  contact_name  text DEFAULT NULL,
  contact_phone text DEFAULT NULL,
  utm_source    text DEFAULT NULL,
  utm_medium    text DEFAULT NULL,
  utm_campaign  text DEFAULT NULL,
  metadata      jsonb DEFAULT '{}',                     -- dados extras (resposta parcial, user-agent, etc.)
  created_at    timestamptz DEFAULT now()
);

-- Índices para queries de analytics
CREATE INDEX IF NOT EXISTS idx_quiz_events_quiz_id      ON quiz_events(quiz_id);
CREATE INDEX IF NOT EXISTS idx_quiz_events_session_id   ON quiz_events(session_id);
CREATE INDEX IF NOT EXISTS idx_quiz_events_event_type   ON quiz_events(event_type);
CREATE INDEX IF NOT EXISTS idx_quiz_events_created_at   ON quiz_events(created_at);
CREATE INDEX IF NOT EXISTS idx_quiz_events_clinic_id    ON quiz_events(clinic_id);

-- RLS: anon pode inserir eventos (fire-and-forget do quiz público)
ALTER TABLE quiz_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anon_insert_quiz_events"
  ON quiz_events FOR INSERT
  TO anon
  WITH CHECK (true);

-- Authenticated pode ler eventos da sua clínica
CREATE POLICY "auth_read_quiz_events"
  ON quiz_events FOR SELECT
  TO authenticated
  USING (clinic_id = (auth.jwt() ->> 'clinic_id')::uuid);

-- ============================================================================
-- RPC: quiz_analytics — Retorna métricas agregadas para um quiz
-- ============================================================================
CREATE OR REPLACE FUNCTION quiz_analytics(
  p_quiz_id   uuid,
  p_clinic_id uuid,
  p_from      timestamptz DEFAULT (now() - interval '30 days'),
  p_to        timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result jsonb;
  v_started     int;
  v_completed   int;
  v_wa_clicks   int;
  v_btn_clicks  int;
BEGIN
  -- KPIs básicos
  SELECT count(*) INTO v_started
    FROM quiz_events
   WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
     AND event_type = 'quiz_start'
     AND created_at BETWEEN p_from AND p_to;

  SELECT count(*) INTO v_completed
    FROM quiz_events
   WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
     AND event_type = 'quiz_complete'
     AND created_at BETWEEN p_from AND p_to;

  SELECT count(*) INTO v_wa_clicks
    FROM quiz_events
   WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
     AND event_type = 'whatsapp_click'
     AND created_at BETWEEN p_from AND p_to;

  SELECT count(*) INTO v_btn_clicks
    FROM quiz_events
   WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
     AND event_type = 'btn_click'
     AND created_at BETWEEN p_from AND p_to;

  -- Funil por step (quantos viram cada step)
  -- Leads por dia (para gráfico de linha)
  -- Pontos de saída (último step visto por sessões que não completaram)
  result := jsonb_build_object(
    'started',   v_started,
    'completed', v_completed,
    'wa_clicks', v_wa_clicks,
    'btn_clicks', v_btn_clicks,
    'conversion_rate', CASE WHEN v_started > 0
      THEN round((v_completed::numeric / v_started::numeric) * 100, 1)
      ELSE 0 END,

    'funnel', (
      SELECT coalesce(jsonb_agg(row_to_json(f)), '[]'::jsonb)
        FROM (
          SELECT step_index, step_label, count(DISTINCT session_id) as views
            FROM quiz_events
           WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
             AND event_type = 'step_view'
             AND created_at BETWEEN p_from AND p_to
           GROUP BY step_index, step_label
           ORDER BY step_index
        ) f
    ),

    'leads_per_day', (
      SELECT coalesce(jsonb_agg(row_to_json(d)), '[]'::jsonb)
        FROM (
          SELECT date_trunc('day', created_at)::date as day, count(*) as total
            FROM quiz_events
           WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
             AND event_type = 'quiz_complete'
             AND created_at BETWEEN p_from AND p_to
           GROUP BY date_trunc('day', created_at)::date
           ORDER BY day
        ) d
    ),

    'exit_points', (
      SELECT coalesce(jsonb_agg(row_to_json(e)), '[]'::jsonb)
        FROM (
          SELECT last_step, last_label, count(*) as exits
            FROM (
              SELECT session_id,
                     max(step_index) as last_step,
                     (array_agg(step_label ORDER BY step_index DESC))[1] as last_label
                FROM quiz_events
               WHERE quiz_id = p_quiz_id AND clinic_id = p_clinic_id
                 AND event_type = 'step_view'
                 AND created_at BETWEEN p_from AND p_to
                 AND session_id NOT IN (
                   SELECT session_id FROM quiz_events
                    WHERE quiz_id = p_quiz_id AND event_type = 'quiz_complete'
                      AND created_at BETWEEN p_from AND p_to
                 )
               GROUP BY session_id
            ) abandoned
           GROUP BY last_step, last_label
           ORDER BY exits DESC
        ) e
    )
  );

  RETURN result;
END;
$$;

-- Grant execute para authenticated
GRANT EXECUTE ON FUNCTION quiz_analytics(uuid, uuid, timestamptz, timestamptz) TO authenticated;

-- ============================================================================
-- RPC: insert_quiz_event — Inserção segura de eventos (anon-safe)
-- ============================================================================
CREATE OR REPLACE FUNCTION insert_quiz_event(
  p_quiz_id       uuid,
  p_clinic_id     uuid,
  p_session_id    text,
  p_event_type    text,
  p_step_index    int DEFAULT NULL,
  p_step_label    text DEFAULT NULL,
  p_contact_name  text DEFAULT NULL,
  p_contact_phone text DEFAULT NULL,
  p_utm_source    text DEFAULT NULL,
  p_utm_medium    text DEFAULT NULL,
  p_utm_campaign  text DEFAULT NULL,
  p_metadata      jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO quiz_events (
    quiz_id, clinic_id, session_id, event_type,
    step_index, step_label, contact_name, contact_phone,
    utm_source, utm_medium, utm_campaign, metadata
  ) VALUES (
    p_quiz_id, p_clinic_id, p_session_id, p_event_type,
    p_step_index, p_step_label, p_contact_name, p_contact_phone,
    p_utm_source, p_utm_medium, p_utm_campaign, p_metadata
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION insert_quiz_event(uuid, uuid, text, text, int, text, text, text, text, text, text, jsonb) TO anon;
GRANT EXECUTE ON FUNCTION insert_quiz_event(uuid, uuid, text, text, int, text, text, text, text, text, text, jsonb) TO authenticated;
