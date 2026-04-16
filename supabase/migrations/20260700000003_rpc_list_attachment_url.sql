-- ============================================================
-- Migration: Patch wa_agenda_auto_list para retornar attachment_url
-- Data: 2026-04-16
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.wa_agenda_auto_list()
RETURNS jsonb[] LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = 'public' AS $fn$
BEGIN
  RETURN ARRAY(
    SELECT jsonb_build_object(
      'id',                  a.id,
      'name',                a.name,
      'description',         a.description,
      'category',            a.category,
      'sort_order',          a.sort_order,
      'is_active',           a.is_active,
      'trigger_type',        a.trigger_type,
      'trigger_config',      a.trigger_config,
      'recipient_type',      a.recipient_type,
      'channel',             a.channel,
      'content_template',    a.content_template,
      'alert_title',         a.alert_title,
      'alert_type',          a.alert_type,
      'task_title',          a.task_title,
      'task_assignee',       a.task_assignee,
      'task_priority',       a.task_priority,
      'task_deadline_hours', a.task_deadline_hours,
      'alexa_message',       a.alexa_message,
      'alexa_target',        a.alexa_target,
      'attachment_url',      a.attachment_url,
      'created_at',          a.created_at,
      'updated_at',          a.updated_at
    )
    FROM public.wa_agenda_automations a
    WHERE a.clinic_id = app_clinic_id()
    ORDER BY a.category, a.sort_order, a.name
  );
END;
$fn$;

COMMIT;
