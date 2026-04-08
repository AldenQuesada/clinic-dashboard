-- ============================================================
-- Migration: Add Alexa channel to Agenda Automations
-- Adiciona campos Alexa na tabela wa_agenda_automations
-- ============================================================

-- ── Novas colunas ────────────────────────────────────────────
ALTER TABLE public.wa_agenda_automations
  ADD COLUMN IF NOT EXISTS alexa_message text,
  ADD COLUMN IF NOT EXISTS alexa_target  text DEFAULT 'sala';
  -- alexa_target: 'recepcao' | 'sala' | 'profissional' | 'todos' | UUID do device

-- ── Atualizar RPC upsert para aceitar campos alexa ──────────
CREATE OR REPLACE FUNCTION public.wa_agenda_auto_upsert(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
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
      name              = trim(v_name),
      description       = nullif(trim(coalesce(p_data->>'description', '')), ''),
      category          = coalesce(p_data->>'category', 'before'),
      sort_order        = coalesce((p_data->>'sort_order')::int, 0),
      is_active         = coalesce((p_data->>'is_active')::boolean, true),
      trigger_type      = coalesce(p_data->>'trigger_type', 'on_status'),
      trigger_config    = coalesce(p_data->'trigger_config', '{}'::jsonb),
      recipient_type    = coalesce(p_data->>'recipient_type', 'patient'),
      channel           = coalesce(p_data->>'channel', 'whatsapp'),
      content_template  = nullif(trim(coalesce(p_data->>'content_template', '')), ''),
      alert_title       = nullif(trim(coalesce(p_data->>'alert_title', '')), ''),
      alert_type        = coalesce(p_data->>'alert_type', 'info'),
      task_title        = nullif(trim(coalesce(p_data->>'task_title', '')), ''),
      task_assignee     = coalesce(p_data->>'task_assignee', 'sdr'),
      task_priority     = coalesce(p_data->>'task_priority', 'normal'),
      task_deadline_hours = coalesce((p_data->>'task_deadline_hours')::int, 24),
      alexa_message     = nullif(trim(coalesce(p_data->>'alexa_message', '')), ''),
      alexa_target      = coalesce(nullif(trim(coalesce(p_data->>'alexa_target', '')), ''), 'sala'),
      updated_at        = now()
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
      alexa_message, alexa_target
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
      nullif(trim(coalesce(p_data->>'content_template', '')), ''),
      nullif(trim(coalesce(p_data->>'alert_title', '')), ''),
      coalesce(p_data->>'alert_type', 'info'),
      nullif(trim(coalesce(p_data->>'task_title', '')), ''),
      coalesce(p_data->>'task_assignee', 'sdr'),
      coalesce(p_data->>'task_priority', 'normal'),
      coalesce((p_data->>'task_deadline_hours')::int, 24),
      nullif(trim(coalesce(p_data->>'alexa_message', '')), ''),
      coalesce(nullif(trim(coalesce(p_data->>'alexa_target', '')), ''), 'sala')
    );
  END IF;

  RETURN jsonb_build_object('ok', true, 'data', v_id);
END;
$$;

-- ── Atualizar RPC list para retornar campos alexa ───────────
DROP FUNCTION IF EXISTS public.wa_agenda_auto_list();
CREATE OR REPLACE FUNCTION public.wa_agenda_auto_list()
RETURNS jsonb[]
LANGUAGE plpgsql SECURITY DEFINER STABLE
AS $$
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
      'created_at',          a.created_at,
      'updated_at',          a.updated_at
    )
    FROM public.wa_agenda_automations a
    WHERE a.clinic_id = app_clinic_id()
    ORDER BY a.sort_order, a.category, a.name
  );
END;
$$;

-- ── Seed: 2 regras Alexa default para na_clinica ────────────
INSERT INTO public.wa_agenda_automations (
  id, clinic_id, name, description, category, sort_order, is_active,
  trigger_type, trigger_config, recipient_type, channel,
  alexa_message, alexa_target
) VALUES
(
  gen_random_uuid(), app_clinic_id(),
  'Alexa: Boas-vindas Recepcao',
  'Alexa da recepcao da boas-vindas ao paciente quando chega na clinica',
  'during', 10, true,
  'on_status', '{"status":"na_clinica"}'::jsonb,
  'patient', 'alexa',
  'Bem-vinda, {{nome}}! Fique a vontade, em breve voce sera atendida.',
  'recepcao'
),
(
  gen_random_uuid(), app_clinic_id(),
  'Alexa: Aviso Dra Mirian',
  'Notifica na Alexa da sala que a proxima paciente esta na recepcao',
  'during', 11, true,
  'on_status', '{"status":"na_clinica"}'::jsonb,
  'professional', 'alexa',
  'Dra Mirian, sua proxima paciente {{nome}} esta na recepcao.',
  'sala'
)
ON CONFLICT DO NOTHING;
