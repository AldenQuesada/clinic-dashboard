-- ============================================================
-- Migration: Birthday Enqueue with mid-sequence guard checks
-- Cancels remaining messages if lead responded, got budget, or changed channel
-- ============================================================

DROP FUNCTION IF EXISTS wa_birthday_enqueue();

CREATE OR REPLACE FUNCTION wa_birthday_enqueue()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_msg record;
  v_outbox_id uuid;
  v_enqueued int := 0;
  v_cancelled int := 0;
  v_guard_reason text;
BEGIN
  FOR v_msg IN
    SELECT m.*, c.lead_id, c.lead_phone, c.status AS camp_status,
           c.is_excluded, c.started_at AS camp_started
    FROM wa_birthday_messages m
    JOIN wa_birthday_campaigns c ON c.id = m.campaign_id
    WHERE m.status = 'pending'
      AND m.scheduled_at <= now()
      AND c.status NOT IN ('cancelled', 'responded')
      AND c.is_excluded = false
    ORDER BY m.scheduled_at
  LOOP
    -- Skip already resolved
    IF v_msg.camp_status IN ('cancelled', 'responded') OR v_msg.is_excluded THEN
      UPDATE wa_birthday_messages SET status = 'cancelled' WHERE id = v_msg.id;
      v_cancelled := v_cancelled + 1;
      CONTINUE;
    END IF;

    -- ── GUARD CHECKS ─────────────────────────────────────
    v_guard_reason := NULL;

    -- Guard 1: Lead responded on WhatsApp after campaign started
    IF v_msg.camp_started IS NOT NULL AND v_guard_reason IS NULL THEN
      PERFORM 1 FROM wa_conversations wc
      JOIN wa_messages wm ON wm.conversation_id = wc.id
      WHERE wc.lead_id = v_msg.lead_id
        AND wm.direction = 'inbound'
        AND wm.sent_at > v_msg.camp_started
      LIMIT 1;
      IF FOUND THEN v_guard_reason := 'responded'; END IF;
    END IF;

    -- Guard 2: Budget created after campaign started
    IF v_msg.camp_started IS NOT NULL AND v_guard_reason IS NULL THEN
      PERFORM 1 FROM budgets b
      WHERE b.lead_id = v_msg.lead_id
        AND b.created_at > v_msg.camp_started
      LIMIT 1;
      IF FOUND THEN v_guard_reason := 'new_budget'; END IF;
    END IF;

    -- Guard 3: Channel not whatsapp (in_person, phone, email = being attended)
    IF v_guard_reason IS NULL THEN
      PERFORM 1 FROM leads l
      WHERE l.id = v_msg.lead_id
        AND l.channel_mode IS NOT NULL
        AND l.channel_mode != 'whatsapp'
      LIMIT 1;
      IF FOUND THEN v_guard_reason := 'human_channel'; END IF;
    END IF;

    -- If guard triggered → cancel campaign + remaining messages
    IF v_guard_reason IS NOT NULL THEN
      UPDATE wa_birthday_campaigns
      SET status = CASE WHEN v_guard_reason = 'responded' THEN 'responded' ELSE 'cancelled' END,
          exclude_reason = v_guard_reason,
          is_excluded = true,
          excluded_at = now(),
          excluded_by = 'auto_guard',
          completed_at = now()
      WHERE id = v_msg.campaign_id;

      UPDATE wa_birthday_messages SET status = 'cancelled'
      WHERE campaign_id = v_msg.campaign_id AND status = 'pending';

      v_cancelled := v_cancelled + 1;
      CONTINUE;
    END IF;

    -- ── ALL GUARDS PASSED → ENQUEUE ──────────────────────
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
$fn$;

GRANT EXECUTE ON FUNCTION wa_birthday_enqueue() TO anon, authenticated;
