-- ============================================================
-- Migration: 20260600000000 — Analytics Dashboard RPCs
--
-- Power BI-level analytics for WhatsApp messaging system.
-- All RPCs use SECURITY DEFINER with hardcoded clinic_id.
--
-- RPCs created:
--   wa_analytics_overview(p_days)   -- KPIs and totals
--   wa_analytics_funnel(p_days)     -- Conversion funnel by funnel type
--   wa_analytics_daily(p_days)      -- Daily time-series metrics
--   wa_analytics_cadence(p_days)    -- Cadence template performance
--   wa_analytics_top_tags(p_days)   -- Most common conversation tags
-- ============================================================

-- ── Helpers ──────────────────────────────────────────────────

-- Hardcoded clinic for single-tenant deployment
CREATE OR REPLACE FUNCTION _analytics_clinic_id()
RETURNS uuid
LANGUAGE sql IMMUTABLE PARALLEL SAFE
AS $$ SELECT '00000000-0000-0000-0000-000000000001'::uuid $$;


-- ═════════════════════════════════════════════════════════════
-- 1. wa_analytics_overview
--    High-level KPIs for the dashboard header cards.
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION wa_analytics_overview(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic  uuid := _analytics_clinic_id();
  v_since   timestamptz := now() - (p_days || ' days')::interval;
  v_result  jsonb;
BEGIN
  SELECT jsonb_build_object(
    -- Conversation metrics
    'total_conversations',      COALESCE((
      SELECT count(*) FROM wa_conversations
      WHERE clinic_id = v_clinic AND created_at >= v_since
    ), 0),

    'active_conversations',     COALESCE((
      SELECT count(*) FROM wa_conversations
      WHERE clinic_id = v_clinic AND status = 'active'
    ), 0),

    'urgent_count',             COALESCE((
      SELECT count(*) FROM wa_conversations
      WHERE clinic_id = v_clinic
        AND (tags @> ARRAY['precisa_humano'] OR tags @> ARRAY['emergencia'])
    ), 0),

    'resolved_count',           COALESCE((
      SELECT count(*) FROM wa_conversations
      WHERE clinic_id = v_clinic
        AND status IN ('closed', 'archived')
        AND updated_at >= v_since
    ), 0),

    -- Message metrics
    'total_messages_inbound',   COALESCE((
      SELECT count(*) FROM wa_messages
      WHERE clinic_id = v_clinic AND direction = 'inbound' AND sent_at >= v_since
    ), 0),

    'total_messages_outbound',  COALESCE((
      SELECT count(*) FROM wa_messages
      WHERE clinic_id = v_clinic AND direction = 'outbound' AND sent_at >= v_since
    ), 0),

    'total_ai_messages',        COALESCE((
      SELECT count(*) FROM wa_messages
      WHERE clinic_id = v_clinic AND ai_generated = true AND sent_at >= v_since
    ), 0),

    'total_secretary_messages', COALESCE((
      SELECT count(*) FROM wa_messages
      WHERE clinic_id = v_clinic AND sender = 'humano' AND sent_at >= v_since
    ), 0),

    'total_tokens_used',        COALESCE((
      SELECT sum(ai_tokens_used) FROM wa_messages
      WHERE clinic_id = v_clinic AND ai_tokens_used IS NOT NULL AND sent_at >= v_since
    ), 0),

    -- Average response time: time between an inbound msg and the next outbound msg
    -- in the same conversation
    'avg_response_time_seconds', COALESCE((
      SELECT round(avg(response_seconds))
      FROM (
        SELECT EXTRACT(EPOCH FROM (
          (SELECT min(m2.sent_at)
           FROM wa_messages m2
           WHERE m2.conversation_id = m1.conversation_id
             AND m2.direction = 'outbound'
             AND m2.sent_at > m1.sent_at)
          - m1.sent_at
        )) AS response_seconds
        FROM wa_messages m1
        WHERE m1.clinic_id = v_clinic
          AND m1.direction = 'inbound'
          AND m1.sent_at >= v_since
      ) sub
      WHERE response_seconds IS NOT NULL
        AND response_seconds > 0
        AND response_seconds < 86400  -- ignore gaps > 24h (stale conversations)
    ), 0),

    -- Lead metrics
    'total_leads_created',      COALESCE((
      SELECT count(*) FROM leads
      WHERE clinic_id = v_clinic AND created_at >= v_since
        AND (deleted_at IS NULL)
    ), 0),

    'total_leads_whatsapp',     COALESCE((
      SELECT count(*) FROM leads
      WHERE clinic_id = v_clinic AND source_type = 'whatsapp'
        AND created_at >= v_since AND (deleted_at IS NULL)
    ), 0)

  ) INTO v_result;

  RETURN v_result;
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- 2. wa_analytics_funnel
--    Conversion funnel breakdown by funnel type.
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION wa_analytics_funnel(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic  uuid := _analytics_clinic_id();
  v_since   timestamptz := now() - (p_days || ' days')::interval;
  v_result  jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(f)::jsonb)
  INTO v_result
  FROM (
    SELECT
      COALESCE(l.funnel, 'sem_funil')               AS funnel_name,

      -- Stage 1: total leads in this funnel
      count(DISTINCT l.id)                           AS total_leads,

      -- Stage 2: leads that have at least 1 conversation
      count(DISTINCT CASE
        WHEN EXISTS (
          SELECT 1 FROM wa_conversations c
          WHERE c.clinic_id = v_clinic AND c.lead_id = l.id::text
        ) THEN l.id
      END)                                           AS contacted,

      -- Stage 3: conversations with more than 3 messages (qualified)
      count(DISTINCT CASE
        WHEN EXISTS (
          SELECT 1 FROM wa_conversations c
          WHERE c.clinic_id = v_clinic AND c.lead_id = l.id::text
            AND (SELECT count(*) FROM wa_messages m
                 WHERE m.conversation_id = c.id) > 3
        ) THEN l.id
      END)                                           AS qualified,

      -- Stage 4: conversations tagged as interested
      count(DISTINCT CASE
        WHEN EXISTS (
          SELECT 1 FROM wa_conversations c
          WHERE c.clinic_id = v_clinic AND c.lead_id = l.id::text
            AND (c.tags @> ARRAY['pronto_agendar'] OR c.tags @> ARRAY['qualificado'])
        ) THEN l.id
      END)                                           AS interested,

      -- Stage 5: leads with phase = agendado
      count(DISTINCT CASE
        WHEN l.phase = 'agendado' THEN l.id
      END)                                           AS scheduled,

      -- Stage 6: leads converted
      count(DISTINCT CASE
        WHEN l.phase IN ('atendido', 'orcamento', 'convertido') THEN l.id
      END)                                           AS converted,

      -- Conversion rate
      CASE
        WHEN count(DISTINCT l.id) > 0
        THEN round(
          count(DISTINCT CASE WHEN l.phase IN ('atendido', 'orcamento', 'convertido') THEN l.id END)::numeric
          / count(DISTINCT l.id) * 100, 2
        )
        ELSE 0
      END                                            AS conversion_rate

    FROM leads l
    WHERE l.clinic_id = v_clinic
      AND l.created_at >= v_since
      AND l.deleted_at IS NULL
    GROUP BY l.funnel
    ORDER BY total_leads DESC
  ) f;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- 3. wa_analytics_daily
--    Daily time-series for charts (line/bar graphs).
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION wa_analytics_daily(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic  uuid := _analytics_clinic_id();
  v_since   timestamptz := now() - (p_days || ' days')::interval;
  v_result  jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(d)::jsonb ORDER BY d.date)
  INTO v_result
  FROM (
    SELECT
      ds.date::date                                  AS date,

      -- New conversations that day
      COALESCE((
        SELECT count(*) FROM wa_conversations
        WHERE clinic_id = v_clinic AND created_at::date = ds.date
      ), 0)                                          AS new_conversations,

      -- Inbound messages
      COALESCE((
        SELECT count(*) FROM wa_messages
        WHERE clinic_id = v_clinic AND direction = 'inbound' AND sent_at::date = ds.date
      ), 0)                                          AS messages_inbound,

      -- Outbound messages
      COALESCE((
        SELECT count(*) FROM wa_messages
        WHERE clinic_id = v_clinic AND direction = 'outbound' AND sent_at::date = ds.date
      ), 0)                                          AS messages_outbound,

      -- Tokens consumed
      COALESCE((
        SELECT sum(ai_tokens_used) FROM wa_messages
        WHERE clinic_id = v_clinic AND ai_tokens_used IS NOT NULL AND sent_at::date = ds.date
      ), 0)                                          AS tokens_used,

      -- Leads created
      COALESCE((
        SELECT count(*) FROM leads
        WHERE clinic_id = v_clinic AND created_at::date = ds.date AND deleted_at IS NULL
      ), 0)                                          AS leads_created,

      -- Average response time for that day
      COALESCE((
        SELECT round(avg(response_seconds))
        FROM (
          SELECT EXTRACT(EPOCH FROM (
            (SELECT min(m2.sent_at)
             FROM wa_messages m2
             WHERE m2.conversation_id = m1.conversation_id
               AND m2.direction = 'outbound'
               AND m2.sent_at > m1.sent_at)
            - m1.sent_at
          )) AS response_seconds
          FROM wa_messages m1
          WHERE m1.clinic_id = v_clinic
            AND m1.direction = 'inbound'
            AND m1.sent_at::date = ds.date
        ) sub
        WHERE response_seconds IS NOT NULL
          AND response_seconds > 0
          AND response_seconds < 86400
      ), 0)                                          AS avg_response_time_seconds

    FROM generate_series(
      v_since::date,
      now()::date,
      '1 day'::interval
    ) AS ds(date)
  ) d;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- 4. wa_analytics_cadence
--    Cadence template performance (sent vs response rate).
--    Joins wa_outbox -> wa_message_templates via template_id.
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION wa_analytics_cadence(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic  uuid := _analytics_clinic_id();
  v_since   timestamptz := now() - (p_days || ' days')::interval;
  v_result  jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(c)::jsonb ORDER BY c.sent_count DESC)
  INTO v_result
  FROM (
    SELECT
      t.slug                                         AS template_slug,
      t.name                                         AS template_name,

      -- How many were successfully sent
      count(*) FILTER (WHERE o.status = 'sent')      AS sent_count,

      -- How many got a response: conversation had an inbound message after the send
      count(*) FILTER (
        WHERE o.status = 'sent'
          AND EXISTS (
            SELECT 1 FROM wa_messages m
            WHERE m.conversation_id = o.conversation_id
              AND m.direction = 'inbound'
              AND m.sent_at > o.processed_at
          )
      )                                              AS response_count,

      -- Response rate as percentage
      CASE
        WHEN count(*) FILTER (WHERE o.status = 'sent') > 0
        THEN round(
          count(*) FILTER (
            WHERE o.status = 'sent'
              AND EXISTS (
                SELECT 1 FROM wa_messages m
                WHERE m.conversation_id = o.conversation_id
                  AND m.direction = 'inbound'
                  AND m.sent_at > o.processed_at
              )
          )::numeric
          / count(*) FILTER (WHERE o.status = 'sent') * 100, 2
        )
        ELSE 0
      END                                            AS response_rate

    FROM wa_outbox o
    JOIN wa_message_templates t ON t.id = o.template_id
    WHERE o.clinic_id = v_clinic
      AND o.created_at >= v_since
      AND o.template_id IS NOT NULL
    GROUP BY t.slug, t.name
    HAVING count(*) FILTER (WHERE o.status = 'sent') > 0
  ) c;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- 5. wa_analytics_top_tags
--    Most common conversation tags (unnested & counted).
-- ═════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION wa_analytics_top_tags(p_days int DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic  uuid := _analytics_clinic_id();
  v_since   timestamptz := now() - (p_days || ' days')::interval;
  v_result  jsonb;
BEGIN
  SELECT jsonb_agg(row_to_json(t)::jsonb)
  INTO v_result
  FROM (
    SELECT
      tag                                            AS tag_name,
      count(*)                                       AS count
    FROM wa_conversations c,
         unnest(c.tags) AS tag
    WHERE c.clinic_id = v_clinic
      AND c.created_at >= v_since
      AND array_length(c.tags, 1) > 0
    GROUP BY tag
    ORDER BY count DESC
    LIMIT 15
  ) t;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;


-- ═════════════════════════════════════════════════════════════
-- Grants: allow anon/authenticated to call analytics RPCs
-- ═════════════════════════════════════════════════════════════

GRANT EXECUTE ON FUNCTION _analytics_clinic_id()          TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_analytics_overview(int)      TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_analytics_funnel(int)        TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_analytics_daily(int)         TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_analytics_cadence(int)       TO anon, authenticated;
GRANT EXECUTE ON FUNCTION wa_analytics_top_tags(int)      TO anon, authenticated;
