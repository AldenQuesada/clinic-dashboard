-- Novo paciente (primeira consulta) recebe link da ficha de anamnese na
-- mensagem de confirmacao. Retorno nao recebe.
--
-- Regra:
--   - Conta appointments finalizados anteriores do patient
--   - Se == 0 → paciente novo → adiciona link da ficha
--   - Se > 0  → retorno → mensagem normal sem link

-- Helper: gera o token + URL completa no formato que a clinica usa
CREATE OR REPLACE FUNCTION public._anamnese_link(
  p_appt_id text,
  p_lead_id text
)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_raw text;
  v_token text;
BEGIN
  IF p_appt_id IS NULL OR p_lead_id IS NULL THEN RETURN NULL; END IF;
  v_raw := p_appt_id || '|' || p_lead_id || '|' || (EXTRACT(epoch FROM now()) * 1000)::bigint::text;
  -- base64 sem quebras de linha
  v_token := REGEXP_REPLACE(encode(convert_to(v_raw, 'UTF8'), 'base64'), '\s', '', 'g');
  RETURN 'https://clinicai-dashboard.px1hdq.easypanel.host/anamnese?t=' || v_token;
END;
$$;

GRANT EXECUTE ON FUNCTION public._anamnese_link(text, text) TO authenticated, anon;


-- Atualiza fire_appointment_automations pra detectar new patient + anexar bloco
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
  v_is_new     boolean := true;
  v_prior_count int;
  v_anamnese_block text := '';
BEGIN
  SELECT * INTO v_appt FROM public.appointments WHERE id = p_appt_id AND deleted_at IS NULL;
  IF v_appt.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found');
  END IF;

  IF v_appt.patient_id IS NOT NULL THEN
    SELECT phone INTO v_patient_phone FROM public.leads
    WHERE id = v_appt.patient_id::text AND deleted_at IS NULL;
    v_lead_id := v_appt.patient_id::text;
  END IF;

  IF v_patient_phone IS NULL OR v_patient_phone = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'patient_phone_not_found', 'appt_id', p_appt_id);
  END IF;

  v_patient_phone := REGEXP_REPLACE(v_patient_phone, '[^0-9]', '', 'g');
  v_appt_dt := (v_appt.scheduled_date::text || ' ' || v_appt.start_time::text)::timestamp
               AT TIME ZONE 'America/Sao_Paulo';

  -- ═══════════════════════════════════════
  -- Detecta se eh primeira consulta do paciente
  -- ═══════════════════════════════════════
  SELECT count(*) INTO v_prior_count
  FROM public.appointments
  WHERE clinic_id = v_appt.clinic_id
    AND deleted_at IS NULL
    AND patient_id = v_appt.patient_id
    AND status = 'finalizado'
    AND id != p_appt_id;

  v_is_new := (v_prior_count = 0);

  -- Bloco de anamnese so pra paciente novo
  IF v_is_new THEN
    v_anamnese_block := E'\n\n' ||
      'Para agilizar, preencha sua *Ficha de Anamnese* antes da consulta (≈5 min):' || E'\n\n' ||
      '👉 ' || _anamnese_link(p_appt_id, v_lead_id) || E'\n\n' ||
      'Isso ajuda a gente a entender seu historico e oferecer o melhor atendimento. 💜';
  END IF;

  -- ═══════════════════════════════════════
  -- 1. on_status 'agendado' → Confirmacao (NOW) + anamnese_block se novo
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
    -- Paciente NOVO: anexa bloco de anamnese so na confirmacao inicial
    IF v_is_new AND v_anamnese_block != '' THEN
      v_content := v_content || v_anamnese_block;
    END IF;

    INSERT INTO public.wa_outbox (
      clinic_id, lead_id, phone, content, content_type,
      scheduled_at, business_hours, priority, max_attempts, status, appt_ref
    ) VALUES (
      v_appt.clinic_id, v_lead_id, v_patient_phone, v_content, 'text',
      now(), true, 1, 3, 'queued', p_appt_id
    );
    v_count := v_count + 1;
    v_results := v_results || jsonb_build_object(
      'rule', v_rule.name,
      'scheduled_at', now(),
      'has_anamnese_link', v_is_new
    );
  END LOOP;

  -- ═══════════════════════════════════════
  -- 2. d_before (D-1) + d_zero (Chegou o Dia) — sem anamnese (ja foi na confirmacao)
  -- ═══════════════════════════════════════
  FOR v_rule IN
    SELECT * FROM public.wa_agenda_automations
    WHERE clinic_id = v_appt.clinic_id
      AND is_active = true
      AND trigger_type IN ('d_before', 'd_zero')
      AND recipient_type = 'patient'
      AND channel = 'whatsapp'
  LOOP
    IF v_rule.trigger_type = 'd_before' THEN
      v_scheduled := (v_appt_dt::date - COALESCE((v_rule.trigger_config->>'days')::int, 1))::date
                     + (COALESCE((v_rule.trigger_config->>'hour')::int, 9) || ' hours')::interval
                     + (COALESCE((v_rule.trigger_config->>'minute')::int, 0) || ' minutes')::interval;
    ELSIF v_rule.trigger_type = 'd_zero' THEN
      v_scheduled := v_appt_dt::date
                     + (COALESCE((v_rule.trigger_config->>'hour')::int, 8) || ' hours')::interval
                     + (COALESCE((v_rule.trigger_config->>'minute')::int, 0) || ' minutes')::interval;
    END IF;

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
    'is_new_patient', v_is_new,
    'prior_visits', v_prior_count,
    'queued_count', v_count,
    'rules', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_fire_appointment_automations(text) TO authenticated, anon;

COMMENT ON FUNCTION public._anamnese_link(text, text) IS 'Gera URL da ficha de anamnese com token base64(appt_id|lead_id|ts)';
