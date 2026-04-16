-- ============================================================
-- Migration: Patch RPC wa_agenda_auto_upsert para persistir attachment_url
-- Data: 2026-04-16
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.wa_agenda_auto_upsert(p_data jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path = 'public' AS $fn$
DECLARE
  v_id   uuid;
  v_name text;
BEGIN
  v_name := p_data->>'name';
  IF v_name IS NULL OR trim(v_name) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nome obrigatorio');
  END IF;

  v_id := (p_data->>'id')::uuid;

  IF v_id IS NOT NULL THEN
    UPDATE public.wa_agenda_automations SET
      name                = trim(v_name),
      description         = nullif(trim(coalesce(p_data->>'description', '')), ''),
      category            = coalesce(p_data->>'category', 'before'),
      sort_order          = coalesce((p_data->>'sort_order')::int, 0),
      is_active           = coalesce((p_data->>'is_active')::boolean, true),
      trigger_type        = coalesce(p_data->>'trigger_type', 'on_status'),
      trigger_config      = coalesce(p_data->'trigger_config', '{}'::jsonb),
      recipient_type      = coalesce(p_data->>'recipient_type', 'patient'),
      channel             = coalesce(p_data->>'channel', 'whatsapp'),
      content_template    = coalesce(nullif(trim(coalesce(p_data->>'content_template', '')), ''), ''),
      alert_title         = nullif(trim(coalesce(p_data->>'alert_title', '')), ''),
      alert_type          = coalesce(p_data->>'alert_type', 'info'),
      task_title          = nullif(trim(coalesce(p_data->>'task_title', '')), ''),
      task_assignee       = coalesce(p_data->>'task_assignee', 'sdr'),
      task_priority       = coalesce(p_data->>'task_priority', 'normal'),
      task_deadline_hours = coalesce((p_data->>'task_deadline_hours')::int, 24),
      alexa_message       = nullif(trim(coalesce(p_data->>'alexa_message', '')), ''),
      alexa_target        = coalesce(nullif(trim(coalesce(p_data->>'alexa_target', '')), ''), 'sala'),
      attachment_url      = nullif(trim(coalesce(p_data->>'attachment_url', '')), ''),
      updated_at          = now()
    WHERE id = v_id AND clinic_id = app_clinic_id()
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Regra nao encontrada');
    END IF;
  ELSE
    v_id := gen_random_uuid();
    INSERT INTO public.wa_agenda_automations (
      id, clinic_id, name, description, category, sort_order, is_active,
      trigger_type, trigger_config, recipient_type, channel,
      content_template, alert_title, alert_type,
      task_title, task_assignee, task_priority, task_deadline_hours,
      alexa_message, alexa_target, attachment_url
    ) VALUES (
      v_id, app_clinic_id(), trim(v_name),
      nullif(trim(coalesce(p_data->>'description', '')), ''),
      coalesce(p_data->>'category', 'before'),
      coalesce((p_data->>'sort_order')::int, 0),
      coalesce((p_data->>'is_active')::boolean, true),
      coalesce(p_data->>'trigger_type', 'on_status'),
      coalesce(p_data->'trigger_config', '{}'::jsonb),
      coalesce(p_data->>'recipient_type', 'patient'),
      coalesce(p_data->>'channel', 'whatsapp'),
      coalesce(nullif(trim(coalesce(p_data->>'content_template', '')), ''), ''),
      nullif(trim(coalesce(p_data->>'alert_title', '')), ''),
      coalesce(p_data->>'alert_type', 'info'),
      nullif(trim(coalesce(p_data->>'task_title', '')), ''),
      coalesce(p_data->>'task_assignee', 'sdr'),
      coalesce(p_data->>'task_priority', 'normal'),
      coalesce((p_data->>'task_deadline_hours')::int, 24),
      nullif(trim(coalesce(p_data->>'alexa_message', '')), ''),
      coalesce(nullif(trim(coalesce(p_data->>'alexa_target', '')), ''), 'sala'),
      nullif(trim(coalesce(p_data->>'attachment_url', '')), '')
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$fn$;

COMMIT;
