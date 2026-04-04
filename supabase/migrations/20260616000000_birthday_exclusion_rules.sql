-- ============================================================
-- Migration: Birthday Campaign Exclusion Rules
-- Toggle per-lead, auto-exclusion, monthly control
-- ============================================================

-- 1. Add exclusion columns
ALTER TABLE wa_birthday_campaigns ADD COLUMN IF NOT EXISTS is_excluded boolean DEFAULT false;
ALTER TABLE wa_birthday_campaigns ADD COLUMN IF NOT EXISTS exclude_reason text;
ALTER TABLE wa_birthday_campaigns ADD COLUMN IF NOT EXISTS excluded_at timestamptz;
ALTER TABLE wa_birthday_campaigns ADD COLUMN IF NOT EXISTS excluded_by text;

CREATE INDEX IF NOT EXISTS idx_bday_excluded ON wa_birthday_campaigns (is_excluded) WHERE is_excluded = true;

-- 2. Toggle individual lead
CREATE OR REPLACE FUNCTION wa_birthday_toggle_lead(
  p_campaign_id uuid,
  p_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  IF p_active THEN
    IF EXISTS (
      SELECT 1 FROM wa_birthday_campaigns c
      JOIN leads l ON l.id = c.lead_id
      WHERE c.id = p_campaign_id
        AND (l.wa_opt_in = false OR l.phone IS NULL OR l.phone = '')
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Lead sem WhatsApp ativo');
    END IF;
  END IF;

  UPDATE wa_birthday_campaigns
  SET is_excluded = NOT p_active,
      exclude_reason = CASE WHEN NOT p_active THEN 'manual' ELSE NULL END,
      excluded_at = CASE WHEN NOT p_active THEN now() ELSE NULL END,
      excluded_by = CASE WHEN NOT p_active THEN 'manual' ELSE NULL END,
      status = CASE
        WHEN NOT p_active THEN 'cancelled'
        WHEN p_active AND status = 'cancelled' THEN 'pending'
        ELSE status
      END
  WHERE id = p_campaign_id AND clinic_id = v_clinic_id;

  IF NOT p_active THEN
    UPDATE wa_birthday_messages SET status = 'cancelled'
    WHERE campaign_id = p_campaign_id AND status IN ('pending', 'paused');
  ELSE
    UPDATE wa_birthday_messages SET status = 'pending'
    WHERE campaign_id = p_campaign_id AND status = 'cancelled'
      AND scheduled_at > now();
  END IF;

  RETURN jsonb_build_object('ok', true, 'active', p_active);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_toggle_lead(uuid, boolean) TO anon, authenticated;

-- 3. Auto-exclude based on rules
CREATE OR REPLACE FUNCTION wa_birthday_auto_exclude()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_excluded int := 0;
  v_campaign record;
  v_reason text;
BEGIN
  FOR v_campaign IN
    SELECT c.id, c.lead_id
    FROM wa_birthday_campaigns c
    WHERE c.clinic_id = v_clinic_id
      AND c.status IN ('pending', 'sending')
      AND c.is_excluded = false
  LOOP
    v_reason := NULL;

    -- Rule 1: Open budget
    IF v_reason IS NULL AND EXISTS (
      SELECT 1 FROM budgets b
      WHERE b.lead_id = v_campaign.lead_id
        AND b.status NOT IN ('approved', 'lost', 'cancelled')
    ) THEN v_reason := 'open_budget'; END IF;

    -- Rule 2: Recent procedure (30 days)
    BEGIN
      IF v_reason IS NULL AND EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.patient_id = v_campaign.lead_id
          AND a.scheduled_date > now() - interval '30 days'
          AND a.status = 'completed'
      ) THEN v_reason := 'recent_procedure'; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL;
    END;

    -- Rule 3: Upcoming appointment (7 days)
    BEGIN
      IF v_reason IS NULL AND EXISTS (
        SELECT 1 FROM appointments a
        WHERE a.patient_id = v_campaign.lead_id
          AND a.scheduled_date BETWEEN now() AND now() + interval '7 days'
          AND a.status NOT IN ('cancelado', 'no_show')
      ) THEN v_reason := 'upcoming_appointment'; END IF;
    EXCEPTION WHEN undefined_table THEN NULL; WHEN undefined_column THEN NULL;
    END;

    -- Rule 4: Human channel active
    IF v_reason IS NULL AND EXISTS (
      SELECT 1 FROM leads l
      WHERE l.id = v_campaign.lead_id AND l.channel_mode IS NOT NULL AND l.channel_mode != 'whatsapp'
    ) THEN v_reason := 'human_channel'; END IF;

    -- Apply exclusion
    IF v_reason IS NOT NULL THEN
      UPDATE wa_birthday_campaigns
      SET is_excluded = true, exclude_reason = v_reason,
          excluded_at = now(), excluded_by = 'auto'
      WHERE id = v_campaign.id;

      UPDATE wa_birthday_messages SET status = 'cancelled'
      WHERE campaign_id = v_campaign.id AND status IN ('pending', 'paused');

      v_excluded := v_excluded + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'excluded', v_excluded);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_auto_exclude() TO anon, authenticated;

-- 4. Update enqueue to skip excluded
DROP FUNCTION IF EXISTS wa_birthday_enqueue();
CREATE OR REPLACE FUNCTION wa_birthday_enqueue()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_msg record;
  v_outbox_id uuid;
  v_enqueued int := 0;
  v_cancelled int := 0;
BEGIN
  FOR v_msg IN
    SELECT m.*, c.lead_id, c.lead_phone, c.status AS camp_status, c.is_excluded
    FROM wa_birthday_messages m
    JOIN wa_birthday_campaigns c ON c.id = m.campaign_id
    WHERE m.status = 'pending'
      AND m.scheduled_at <= now()
      AND c.status NOT IN ('cancelled', 'responded')
      AND c.is_excluded = false
    ORDER BY m.scheduled_at
  LOOP
    IF v_msg.camp_status IN ('cancelled', 'responded') OR v_msg.is_excluded THEN
      UPDATE wa_birthday_messages SET status = 'cancelled' WHERE id = v_msg.id;
      v_cancelled := v_cancelled + 1;
      CONTINUE;
    END IF;

    INSERT INTO wa_outbox (
      clinic_id, lead_id, phone, content, content_type,
      media_url, priority, status, scheduled_at
    ) VALUES (
      v_clinic_id, v_msg.lead_id, v_msg.lead_phone, v_msg.content,
      CASE WHEN v_msg.media_url IS NOT NULL THEN 'image' ELSE 'text' END,
      v_msg.media_url, 5, 'pending', now()
    )
    RETURNING id INTO v_outbox_id;

    UPDATE wa_birthday_messages
    SET status = 'queued', outbox_id = v_outbox_id
    WHERE id = v_msg.id;

    UPDATE wa_birthday_campaigns
    SET status = 'sending', started_at = COALESCE(started_at, now())
    WHERE id = v_msg.campaign_id AND status = 'pending';

    v_enqueued := v_enqueued + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'enqueued', v_enqueued, 'cancelled', v_cancelled);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_enqueue() TO anon, authenticated;

-- 5. Update list to include exclusion fields
DROP FUNCTION IF EXISTS wa_birthday_list(text, text, int);
CREATE OR REPLACE FUNCTION wa_birthday_list(
  p_segment text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_month int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.birth_date), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      c.id, c.lead_id, c.lead_name, c.lead_phone,
      c.birth_date, c.campaign_year, c.segment, c.status,
      c.has_open_budget, c.budget_total, c.budget_title,
      c.queixas, c.started_at, c.responded_at,
      c.is_excluded, c.exclude_reason, c.excluded_by,
      EXTRACT(YEAR FROM age(c.birth_date, (SELECT l.birth_date::date FROM leads l WHERE l.id = c.lead_id)))::int + 1 AS age_turning,
      (SELECT count(*) FROM wa_birthday_messages m WHERE m.campaign_id = c.id) AS total_messages,
      (SELECT count(*) FROM wa_birthday_messages m WHERE m.campaign_id = c.id AND m.status IN ('sent','delivered','read')) AS sent_messages
    FROM wa_birthday_campaigns c
    WHERE c.clinic_id = v_clinic_id
      AND (p_segment IS NULL OR c.segment = p_segment)
      AND (p_status IS NULL OR c.status = p_status)
      AND (p_month IS NULL OR EXTRACT(MONTH FROM c.birth_date) = p_month)
  ) t;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_list(text, text, int) TO anon, authenticated;

-- 6. Update stats to count excluded
DROP FUNCTION IF EXISTS wa_birthday_stats(int);
CREATE OR REPLACE FUNCTION wa_birthday_stats(p_year int DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_year int := COALESCE(p_year, EXTRACT(YEAR FROM now())::int);
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'year', v_year,
    'total_campaigns', count(*),
    'pending', count(*) FILTER (WHERE status = 'pending' AND is_excluded = false),
    'sending', count(*) FILTER (WHERE status = 'sending'),
    'paused', count(*) FILTER (WHERE status = 'paused'),
    'completed', count(*) FILTER (WHERE status = 'completed'),
    'responded', count(*) FILTER (WHERE status = 'responded'),
    'cancelled', count(*) FILTER (WHERE status = 'cancelled' AND is_excluded = false),
    'excluded', count(*) FILTER (WHERE is_excluded = true),
    'excluded_auto', count(*) FILTER (WHERE is_excluded = true AND excluded_by = 'auto'),
    'excluded_manual', count(*) FILTER (WHERE is_excluded = true AND excluded_by = 'manual'),
    'with_open_budget', count(*) FILTER (WHERE has_open_budget = true),
    'segment_paciente', count(*) FILTER (WHERE segment = 'paciente'),
    'segment_orcamento', count(*) FILTER (WHERE segment = 'orcamento'),
    'segment_paciente_orcamento', count(*) FILTER (WHERE segment = 'paciente_orcamento'),
    'is_paused', (count(*) FILTER (WHERE status = 'paused')) > 0,
    'response_rate', CASE WHEN count(*) FILTER (WHERE status NOT IN ('pending','paused','cancelled') AND is_excluded = false) > 0
      THEN round((count(*) FILTER (WHERE status = 'responded')::numeric / count(*) FILTER (WHERE status NOT IN ('pending','paused','cancelled') AND is_excluded = false)) * 100)
      ELSE 0 END,
    'upcoming_30d', (
      SELECT count(*) FROM leads l
      WHERE l.clinic_id = v_clinic_id AND l.deleted_at IS NULL
        AND l.birth_date IS NOT NULL AND l.birth_date != ''
        AND l.wa_opt_in = true
        AND make_date(v_year, EXTRACT(MONTH FROM l.birth_date::date)::int, EXTRACT(DAY FROM l.birth_date::date)::int)
            BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
    )
  ) INTO v_result
  FROM wa_birthday_campaigns
  WHERE clinic_id = v_clinic_id AND campaign_year = v_year;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_stats(int) TO anon, authenticated;
