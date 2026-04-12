-- Fire agenda automations quando appointment criado via Mira.
-- A engine de automations vive no frontend JS — replicar server-side pra Mira.
--
-- Cobre:
--   on_status (agendado) → Confirmacao Agendamento (envia NOW)
--   d_before             → Confirmacao D-1 (agenda)
--   d_zero               → Chegou o Dia (agenda)
--   min_before           → 30 Min Antes / 10 Min Antes (agenda)
--
-- Tasks + alertas + Alexa NAO sao enviados por aqui (seriam do JS engine).
-- Pros pacientes, só mensagens WhatsApp, que e o core.

CREATE OR REPLACE FUNCTION public._render_appt_template(
  p_template text,
  p_appt     record
)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_out text := p_template;
  v_date_br text;
  v_time_br text;
  v_prof_name text;
BEGIN
  v_date_br := TO_CHAR(p_appt.scheduled_date, 'DD/MM/YYYY');
  v_time_br := LEFT(p_appt.start_time::text, 5);
  v_prof_name := COALESCE((
    SELECT display_name FROM professional_profiles WHERE id = p_appt.professional_id
  ), 'nossa equipe');

  v_out := REPLACE(v_out, '{{nome}}', COALESCE(p_appt.patient_name, 'paciente'));
  v_out := REPLACE(v_out, '{{data}}', v_date_br);
  v_out := REPLACE(v_out, '{{hora}}', v_time_br);
  v_out := REPLACE(v_out, '{{profissional}}', v_prof_name);
  v_out := REPLACE(v_out, '{{procedimento}}', COALESCE(NULLIF(p_appt.procedure_name, ''), 'Consulta'));
  v_out := REPLACE(v_out, '{{clinica}}', 'Clinica Mirian de Paula');

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public._render_appt_template(text, record) TO authenticated, anon;


CREATE OR REPLACE FUNCTION public.wa_pro_fire_appointment_automations(p_appt_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_appt       record;
  v_lead_id    text;
  v_patient_phone text;
  v_rule       record;
  v_content    text;
  v_scheduled  timestamptz;
  v_appt_dt    timestamptz;
  v_count      int := 0;
  v_results    jsonb := '[]'::jsonb;
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appt_id AND deleted_at IS NULL;
  IF v_appt.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  -- Resolve phone do paciente via lead (patient_id → leads.id)
  IF v_appt.patient_id IS NOT NULL THEN
    SELECT phone INTO v_patient_phone FROM public.leads
    WHERE id = v_appt.patient_id::text AND deleted_at IS NULL;
    v_lead_id := v_appt.patient_id::text;
  END IF;

  IF v_patient_phone IS NULL OR v_patient_phone = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'patient_phone_not_found',
                              'appt_id', p_appt_id);
  END IF;

  v_patient_phone := REGEXP_REPLACE(v_patient_phone, '[^0-9]', '', 'g');

  -- Timestamp do appointment (data + hora inicio)
  v_appt_dt := (v_appt.scheduled_date::text || ' ' || v_appt.start_time::text)::timestamp
               AT TIME ZONE 'America/Sao_Paulo';

  -- ═══════════════════════════════════════
  -- 1. on_status rules (fire NOW)
  -- ═══════════════════════════════════════
  FOR v_rule IN
    SELECT * FROM public.wa_agenda_automations
    WHERE clinic_id = v_appt.clinic_id
      AND is_active = true
      AND trigger_type = 'on_status'
      AND recipient_type = 'patient'
      AND channel = 'whatsapp'
      AND trigger_config->>'status' = v_appt.status
  LOOP
    v_content := _render_appt_template(v_rule.content_template, v_appt);

    INSERT INTO public.wa_outbox (
      clinic_id, lead_id, phone, content, content_type,
      scheduled_at, business_hours, priority, max_attempts, status, appt_ref
    ) VALUES (
      v_appt.clinic_id, v_lead_id, v_patient_phone, v_content, 'text',
      now(), true, 1, 3, 'queued', p_appt_id
    );

    v_count := v_count + 1;
    v_results := v_results || jsonb_build_object('rule', v_rule.name, 'scheduled_at', now());
  END LOOP;

  -- ═══════════════════════════════════════
  -- 2. d_before, d_zero, min_before
  -- ═══════════════════════════════════════
  FOR v_rule IN
    SELECT * FROM public.wa_agenda_automations
    WHERE clinic_id = v_appt.clinic_id
      AND is_active = true
      AND trigger_type IN ('d_before', 'd_zero', 'min_before')
      AND recipient_type = 'patient'
      AND channel = 'whatsapp'
  LOOP
    -- Calcula scheduled_at baseado no tipo
    IF v_rule.trigger_type = 'd_before' THEN
      -- trigger_config = {days: 1} → envia 1 dia antes às 9h
      v_scheduled := (v_appt_dt::date - COALESCE((v_rule.trigger_config->>'days')::int, 1))::date
                     + interval '9 hours';
    ELSIF v_rule.trigger_type = 'd_zero' THEN
      -- dia do appointment às 8h
      v_scheduled := v_appt_dt::date + interval '8 hours';
    ELSIF v_rule.trigger_type = 'min_before' THEN
      -- N minutos antes do appointment
      v_scheduled := v_appt_dt - (COALESCE((v_rule.trigger_config->>'minutes')::int, 30) || ' minutes')::interval;
    ELSE
      CONTINUE;
    END IF;

    -- Skip se o horario ja passou
    IF v_scheduled < now() THEN CONTINUE; END IF;

    v_content := _render_appt_template(v_rule.content_template, v_appt);

    INSERT INTO public.wa_outbox (
      clinic_id, lead_id, phone, content, content_type,
      scheduled_at, business_hours, priority, max_attempts, status, appt_ref
    ) VALUES (
      v_appt.clinic_id, v_lead_id, v_patient_phone, v_content, 'text',
      v_scheduled, true, 2, 3, 'queued', p_appt_id
    );

    v_count := v_count + 1;
    v_results := v_results || jsonb_build_object('rule', v_rule.name, 'scheduled_at', v_scheduled);
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'appt_id', p_appt_id,
    'patient_phone', v_patient_phone,
    'queued_count', v_count,
    'rules', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_fire_appointment_automations(text) TO authenticated, anon;

-- ============================================================
-- Atualiza confirm_pending pra disparar as automations
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_confirm_pending(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $fn$
DECLARE
  v_pending record;
  v_new_id text;
  v_end_time text;
  v_automations jsonb;
BEGIN
  SELECT * INTO v_pending FROM public.wa_pro_pending_actions
  WHERE phone = p_phone AND confirmed_at IS NULL AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

  IF v_pending.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_pending',
      'response', '🤔 Nao tem nada pendente de confirmacao.');
  END IF;

  IF v_pending.action_type = 'create_appointment' THEN
    v_new_id := 'appt_mira_' || EXTRACT(EPOCH FROM now())::bigint || '_' ||
                SUBSTRING(MD5(random()::text), 1, 6);
    v_end_time := LPAD((SPLIT_PART(v_pending.payload->>'time', ':', 1)::int + 1)::text, 2, '0') ||
                  ':' || SPLIT_PART(v_pending.payload->>'time', ':', 2);

    INSERT INTO public.appointments (
      id, clinic_id, patient_id, patient_name, professional_id,
      scheduled_date, start_time, end_time, procedure_name,
      status, origem
    ) VALUES (
      v_new_id,
      v_pending.clinic_id,
      (v_pending.payload->>'patient_id')::uuid,
      v_pending.payload->>'patient_name',
      v_pending.professional_id,
      (v_pending.payload->>'date')::date,
      (v_pending.payload->>'time')::time,
      v_end_time::time,
      'Consulta',
      'agendado',
      'mira'
    );

    -- 🎯 Dispara automations (envia confirmacao + agenda lembretes)
    v_automations := wa_pro_fire_appointment_automations(v_new_id);

    UPDATE public.wa_pro_pending_actions
    SET confirmed_at = now(), executed_at = now(),
        result = jsonb_build_object(
          'appointment_id', v_new_id,
          'automations', v_automations
        )
    WHERE id = v_pending.id;

    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_new_id,
      'automations_fired', COALESCE(v_automations->>'queued_count', '0'),
      'response', E'✅ *Agendamento criado!*\n─────────────\n*' ||
                  (v_pending.payload->>'patient_name') || E'*\n📆 ' ||
                  TO_CHAR((v_pending.payload->>'date')::date, 'DD/MM') || E'\n⏰ ' ||
                  (v_pending.payload->>'time') || E'\n\n' ||
                  '_Ja esta na agenda._ ' ||
                  CASE WHEN (v_automations->>'ok')::boolean AND (v_automations->>'queued_count')::int > 0
                       THEN '📨 Confirmacao enviada ao paciente.'
                       ELSE CASE WHEN v_automations->>'error' = 'patient_phone_not_found'
                                 THEN '⚠️ Paciente sem telefone cadastrado — confirmacao nao enviada.'
                                 ELSE '' END
                  END
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'unknown_action_type');
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.wa_pro_confirm_pending(text) TO authenticated, anon;

COMMENT ON FUNCTION public.wa_pro_fire_appointment_automations(text)
  IS 'Enfileira mensagens WhatsApp do outbox pros triggers de agenda (on_status + d_before + d_zero + min_before)';
