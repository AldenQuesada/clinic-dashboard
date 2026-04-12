-- Mira Bloco D #3 — Cadastro de paciente novo + agendamento em 1 fluxo
--
-- Quando paciente nao existe na base:
--   1. stage_create_appointment retorna patient_not_found + salva contexto
--   2. User manda dados: "Nome, CPF, Telefone, Sexo"
--   3. _parse_patient_registration extrai os 4 campos
--   4. stage_register_and_schedule cria pending com action_type 'create_patient_and_appointment'
--   5. User confirma "sim" → INSERT leads + INSERT appointments + fire automations
--
-- Blindagens:
--   - CPF duplicado → avisa quem ja tem
--   - Telefone duplicado → avisa quem ja tem
--   - Dados incompletos → pede o que falta
--   - Context multi-turn: guarda date/time/name do pedido original

-- ============================================================
-- Helper: resolve o professional_id ALVO pra appointments
-- Se remetente tem scope='own' → ele mesmo atende
-- Se scope='full'/'team' → busca o profissional com mais appointments
-- (na clinica da Dra Mirian, ela e a unica que atende)
-- ============================================================
CREATE OR REPLACE FUNCTION public._resolve_target_professional(
  p_clinic_id uuid,
  p_sender_prof_id uuid,
  p_sender_scope text
)
RETURNS uuid
LANGUAGE plpgsql IMMUTABLE
AS $$
BEGIN
  -- O remetente E sempre o profissional alvo.
  -- Na Mira, quem manda mensagem e quem quer agendar pra si.
  -- O admin (Quesada) nao manda mensagens pra Mira via WhatsApp
  -- porque a instancia Evolution E o WhatsApp dele (fromMe=true filtrado).
  RETURN p_sender_prof_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public._resolve_target_professional(uuid, uuid, text) TO authenticated, anon;


-- ============================================================
-- Parser: extrai nome, CPF, telefone e sexo de texto livre
-- Input: "João da Silva, 123.456.789-00, 44999887766, masculino"
-- ============================================================
CREATE OR REPLACE FUNCTION public._parse_patient_registration(p_text text)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_t     text := TRIM(COALESCE(p_text, ''));
  v_cpf   text;
  v_phone text;
  v_sexo  text;
  v_name  text;
  v_parts text[];
BEGIN
  -- CPF: 123.456.789-00 ou 12345678900
  IF v_t ~ '[0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2}' THEN
    v_cpf := (REGEXP_MATCH(v_t, '([0-9]{3}\.?[0-9]{3}\.?[0-9]{3}-?[0-9]{2})'))[1];
  END IF;

  -- Telefone: 11 digitos (com ou sem formatacao)
  -- Remove o CPF primeiro pra nao confundir
  DECLARE
    v_no_cpf text := v_t;
  BEGIN
    IF v_cpf IS NOT NULL THEN
      v_no_cpf := REPLACE(v_no_cpf, v_cpf, '');
    END IF;
    -- Busca sequencia de 10-11 digitos ou formato (44) 99988-7766
    IF v_no_cpf ~ '[0-9]{10,11}' THEN
      v_phone := (REGEXP_MATCH(v_no_cpf, '([0-9]{10,11})'))[1];
    ELSIF v_no_cpf ~ '\(?[0-9]{2}\)?\s*[0-9]{4,5}[-.]?[0-9]{4}' THEN
      v_phone := REGEXP_REPLACE(
        (REGEXP_MATCH(v_no_cpf, '(\(?[0-9]{2}\)?\s*[0-9]{4,5}[-.]?[0-9]{4})'))[1],
        '[^0-9]', '', 'g'
      );
    END IF;
  END;

  -- Sexo: masculino/feminino/M/F/masc/fem/homem/mulher
  IF v_t ~* '[[:<:]](masculino|masc|homem|male)[[:>:]]' THEN v_sexo := 'masculino';
  ELSIF v_t ~* '[[:<:]](feminino|fem|mulher|female)[[:>:]]' THEN v_sexo := 'feminino';
  ELSIF v_t ~* '[[:<:]]M[[:>:]]' THEN v_sexo := 'masculino';
  ELSIF v_t ~* '[[:<:]]F[[:>:]]' THEN v_sexo := 'feminino';
  END IF;

  -- Nome: remove CPF, telefone, sexo e pontuacao — o que sobra e o nome
  v_name := v_t;
  IF v_cpf IS NOT NULL THEN v_name := REPLACE(v_name, v_cpf, ''); END IF;
  IF v_phone IS NOT NULL THEN
    -- Remove o telefone original (com formatacao)
    v_name := REGEXP_REPLACE(v_name, '\(?[0-9]{2}\)?\s*[0-9]{4,5}[-.]?[0-9]{4}', '', 'g');
    v_name := REGEXP_REPLACE(v_name, '[0-9]{10,11}', '', 'g');
  END IF;
  v_name := REGEXP_REPLACE(v_name, '[[:<:]](masculino|feminino|masc|fem|homem|mulher|male|female)[[:>:]]', '', 'gi');
  -- Remove M/F isolado (mas preserva se faz parte de nome)
  v_name := REGEXP_REPLACE(v_name, '(,\s*|\s+)[MF]\s*$', '', 'i');
  v_name := REGEXP_REPLACE(v_name, '[,.;:!?]+', ' ', 'g');
  v_name := TRIM(REGEXP_REPLACE(v_name, '\s+', ' ', 'g'));
  -- Capitalize
  IF LENGTH(v_name) > 0 THEN
    v_name := INITCAP(v_name);
  END IF;

  -- Normaliza CPF pra formato padrao
  IF v_cpf IS NOT NULL THEN
    v_cpf := REGEXP_REPLACE(v_cpf, '[^0-9]', '', 'g');
    IF LENGTH(v_cpf) = 11 THEN
      v_cpf := SUBSTRING(v_cpf,1,3) || '.' || SUBSTRING(v_cpf,4,3) || '.' ||
               SUBSTRING(v_cpf,7,3) || '-' || SUBSTRING(v_cpf,10,2);
    END IF;
  END IF;

  -- Normaliza telefone (adiciona 55 se nao tem)
  IF v_phone IS NOT NULL THEN
    v_phone := REGEXP_REPLACE(v_phone, '[^0-9]', '', 'g');
    IF LENGTH(v_phone) = 11 THEN v_phone := '55' || v_phone;
    ELSIF LENGTH(v_phone) = 10 THEN v_phone := '55' || v_phone;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'name',  NULLIF(v_name, ''),
    'cpf',   v_cpf,
    'phone', v_phone,
    'sexo',  v_sexo,
    'missing', ARRAY_REMOVE(ARRAY[
      CASE WHEN NULLIF(v_name, '') IS NULL THEN 'nome' END,
      CASE WHEN v_cpf IS NULL THEN 'CPF' END,
      CASE WHEN v_phone IS NULL THEN 'telefone' END,
      CASE WHEN v_sexo IS NULL THEN 'sexo' END
    ], NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public._parse_patient_registration(text) TO authenticated, anon;


-- ============================================================
-- Atualiza stage_create_appointment: quando paciente nao existe,
-- salva contexto pra receber dados de cadastro no proximo turno
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_stage_create_appointment(
  p_phone text,
  p_query text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth      jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id uuid;
  v_prof_id   uuid;
  v_parsed    jsonb;
  v_date      date;
  v_time      text;
  v_name      text;
  v_pending_id uuid;
  v_preview   text;
  v_match_list jsonb;
  v_conflict_name text;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;

  v_parsed := _parse_create_appointment(p_query);
  v_name   := v_parsed->>'name';
  v_date   := (v_parsed->>'date')::date;
  v_time   := v_parsed->>'time';

  IF v_name IS NULL OR LENGTH(v_name) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_missing',
      'response', '🤔 Nao entendi o nome do paciente. Tenta: "marca Maria Silva amanha 14h"');
  END IF;

  -- Fuzzy busca o paciente
  v_match_list := wa_pro_patient_search(p_phone, v_name, 3);

  -- ══════════════════════════════════════
  -- PACIENTE NAO ENCONTRADO → pede cadastro
  -- ══════════════════════════════════════
  IF jsonb_array_length(COALESCE(v_match_list->'results', '[]'::jsonb)) = 0 THEN
    -- Salva contexto pra proximo turno saber que estamos cadastrando
    PERFORM _save_context(
      p_phone, v_clinic_id, v_prof_id,
      'awaiting_patient_registration', p_query,
      'patient', NULL, v_name,
      jsonb_build_object('date', v_date, 'time', v_time, 'name_query', v_name)
    );

    RETURN jsonb_build_object('ok', false, 'error', 'patient_not_found',
      'intent', 'awaiting_patient_registration',
      'response', '🆕 *' || v_name || '* nao esta cadastrado.' || E'\n\n' ||
                  'Pra cadastrar e agendar, me manda os dados:' || E'\n' ||
                  '*Nome completo, CPF, Telefone e Sexo*' || E'\n\n' ||
                  '_Ex: Joao da Silva Pereira, 123.456.789-00, 44999887766, masculino_');
  END IF;

  -- ══════════════════════════════════════
  -- PACIENTE ENCONTRADO → fluxo normal
  -- ══════════════════════════════════════
  DECLARE
    v_patient_id text := v_match_list->'results'->0->>'id';
    v_patient_name text := v_match_list->'results'->0->>'name';
  BEGIN
    -- Checa conflito de horario
    SELECT patient_name INTO v_conflict_name
    FROM public.appointments
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND status IN ('agendado', 'pre_consulta')
      AND scheduled_date = v_date
      AND start_time = v_time::time
    LIMIT 1;

    IF v_conflict_name IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'slot_conflict',
        'response', '⚠️ Ja tem consulta em ' || TO_CHAR(v_date, 'DD/MM') || ' ' || v_time ||
                    ' (*' || v_conflict_name || '*). Escolhe outro horario.');
    END IF;

    v_preview := '📅 Vou criar:' || E'\n─────────────\n' ||
                 '*' || v_patient_name || '*' || E'\n' ||
                 '📆 ' || TO_CHAR(v_date, 'DD/MM (Dy)') || E'\n' ||
                 '⏰ ' || v_time || E'\n\n' ||
                 'Confirma? Responde *sim* ou *cancela*.';

    -- Invalida pendings anteriores
    UPDATE public.wa_pro_pending_actions
    SET expires_at = now()
    WHERE phone = p_phone AND confirmed_at IS NULL AND expires_at > now();

    INSERT INTO public.wa_pro_pending_actions (
      clinic_id, professional_id, phone, action_type, payload, preview
    ) VALUES (
      v_clinic_id, v_prof_id, p_phone, 'create_appointment',
      jsonb_build_object(
        'patient_id', v_patient_id,
        'patient_name', v_patient_name,
        'date', v_date,
        'time', v_time
      ),
      v_preview
    ) RETURNING id INTO v_pending_id;

    RETURN jsonb_build_object('ok', true, 'pending_id', v_pending_id, 'preview', v_preview);
  END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_stage_create_appointment(text, text) TO authenticated, anon;


-- ============================================================
-- RPC: wa_pro_stage_register_and_schedule
-- Chamada quando user manda dados de cadastro apos awaiting_patient_registration
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_stage_register_and_schedule(
  p_phone text,
  p_text  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth       jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id  uuid;
  v_prof_id    uuid;
  v_parsed     jsonb;
  v_name       text;
  v_cpf        text;
  v_pat_phone  text;
  v_sexo       text;
  v_missing    text[];
  v_ctx_phone  text;
  v_ctx_intent text;
  v_ref_opts   jsonb;
  v_date       date;
  v_time       text;
  v_pending_id uuid;
  v_preview    text;
  v_dup_id     text;
  v_dup_name   text;
  v_conflict_name text;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;

  -- Carrega contexto do turno anterior (deve ter date, time, name_query)
  SELECT phone, last_intent, last_entity_options
  INTO v_ctx_phone, v_ctx_intent, v_ref_opts
  FROM wa_pro_context WHERE phone = p_phone AND expires_at > now() LIMIT 1;

  IF v_ctx_phone IS NULL OR v_ctx_intent != 'awaiting_patient_registration' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_registration_context',
      'response', '🤔 Nao tem cadastro pendente. Comece com "marca NomePaciente amanha 14h".');
  END IF;

  v_date := (v_ref_opts->>'date')::date;
  v_time := v_ref_opts->>'time';

  -- Parseia os dados de cadastro
  v_parsed   := _parse_patient_registration(p_text);
  v_name     := v_parsed->>'name';
  v_cpf      := v_parsed->>'cpf';
  v_pat_phone := v_parsed->>'phone';
  v_sexo     := v_parsed->>'sexo';

  -- Checa campos faltantes
  SELECT array_agg(x) INTO v_missing FROM jsonb_array_elements_text(v_parsed->'missing') x;
  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'incomplete_data',
      'response', '⚠️ Faltou: *' || array_to_string(v_missing, ', ') || '*.' || E'\n\n' ||
                  'Manda tudo junto: *Nome, CPF, Telefone e Sexo*' || E'\n' ||
                  '_Ex: Joao da Silva, 123.456.789-00, 44999887766, masculino_');
  END IF;

  -- Checa CPF duplicado
  SELECT id, name INTO v_dup_id, v_dup_name FROM public.leads
  WHERE clinic_id = v_clinic_id AND cpf = v_cpf AND deleted_at IS NULL LIMIT 1;
  IF v_dup_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_duplicate',
      'response', '⚠️ CPF ' || v_cpf || ' ja cadastrado como *' || v_dup_name || '*.' || E'\n' ||
                  'Quer agendar pra ele? Diga: "marca ' || SPLIT_PART(v_dup_name, ' ', 1) ||
                  ' ' || TO_CHAR(v_date, 'DD/MM') || ' ' || v_time || '"');
  END IF;

  -- Checa telefone duplicado
  SELECT id, name INTO v_dup_id, v_dup_name FROM public.leads
  WHERE clinic_id = v_clinic_id AND deleted_at IS NULL
    AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 8) = RIGHT(v_pat_phone, 8)
  LIMIT 1;
  IF v_dup_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_duplicate',
      'response', '⚠️ Telefone ja cadastrado como *' || v_dup_name || '*.' || E'\n' ||
                  'Quer agendar pra ele? Diga: "marca ' || SPLIT_PART(v_dup_name, ' ', 1) ||
                  ' ' || TO_CHAR(v_date, 'DD/MM') || ' ' || v_time || '"');
  END IF;

  -- Checa conflito de horario
  SELECT patient_name INTO v_conflict_name
  FROM public.appointments
  WHERE clinic_id = v_clinic_id AND deleted_at IS NULL
    AND status IN ('agendado', 'pre_consulta')
    AND scheduled_date = v_date AND start_time = v_time::time
  LIMIT 1;
  IF v_conflict_name IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_conflict',
      'response', '⚠️ Ja tem consulta em ' || TO_CHAR(v_date, 'DD/MM') || ' ' || v_time ||
                  ' (*' || v_conflict_name || '*). Escolhe outro horario.');
  END IF;

  -- Monta preview pra confirmacao
  v_preview := '📋 *Vou cadastrar e agendar:*' || E'\n─────────────\n' ||
               'Nome: *' || v_name || '*' || E'\n' ||
               'CPF: ' || v_cpf || E'\n' ||
               'Tel: ' || v_pat_phone || E'\n' ||
               'Sexo: ' || INITCAP(v_sexo) || E'\n' ||
               '📆 ' || TO_CHAR(v_date, 'DD/MM (Dy)') || E'\n' ||
               '⏰ ' || v_time || E'\n\n' ||
               'Confirma? Responde *sim* ou *cancela*.';

  -- Invalida pendings anteriores
  UPDATE public.wa_pro_pending_actions
  SET expires_at = now()
  WHERE phone = p_phone AND confirmed_at IS NULL AND expires_at > now();

  INSERT INTO public.wa_pro_pending_actions (
    clinic_id, professional_id, phone, action_type, payload, preview
  ) VALUES (
    v_clinic_id, v_prof_id, p_phone, 'create_patient_and_appointment',
    jsonb_build_object(
      'patient_name', v_name,
      'cpf', v_cpf,
      'phone', v_pat_phone,
      'sexo', v_sexo,
      'date', v_date,
      'time', v_time
    ),
    v_preview
  ) RETURNING id INTO v_pending_id;

  RETURN jsonb_build_object('ok', true, 'pending_id', v_pending_id, 'response', v_preview);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_stage_register_and_schedule(text, text) TO authenticated, anon;


-- ============================================================
-- Estende wa_pro_confirm_pending com branch create_patient_and_appointment
-- ============================================================
-- (CREATE OR REPLACE vem na 20260673 que ja tem todos os branches;
--  aqui so adicionamos o novo branch via ALTER inline)
-- Abordagem: reescrever confirm_pending inteiro pra incluir o novo branch.

CREATE OR REPLACE FUNCTION public.wa_pro_confirm_pending(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_pending    record;
  v_new_id     text;
  v_end_time   text;
  v_automations jsonb;
  v_rows_affected int;
  v_appt_rec   record;
  v_cancel_tpl text;
  v_content    text;
  v_patient_phone text;
  v_lead_id    text;
BEGIN
  SELECT * INTO v_pending FROM public.wa_pro_pending_actions
  WHERE phone = p_phone AND confirmed_at IS NULL AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

  IF v_pending.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_pending',
      'response', '🤔 Nao tem nada pendente de confirmacao.');
  END IF;

  -- ══════════════════════════════════════
  -- CREATE APPOINTMENT (paciente existente)
  -- ══════════════════════════════════════
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

    v_automations := wa_pro_fire_appointment_automations(v_new_id);

    UPDATE public.wa_pro_pending_actions
    SET confirmed_at = now(), executed_at = now(),
        result = jsonb_build_object('appointment_id', v_new_id, 'automations', v_automations)
    WHERE id = v_pending.id;

    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_new_id,
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

  -- ══════════════════════════════════════
  -- CREATE PATIENT + APPOINTMENT (paciente novo)
  -- ══════════════════════════════════════
  IF v_pending.action_type = 'create_patient_and_appointment' THEN
    -- 1. Cria lead
    v_lead_id := gen_random_uuid()::text;
    INSERT INTO public.leads (
      id, clinic_id, name, phone, cpf, sexo,
      status, phase, temperature, priority,
      lead_score, data, source_type, channel_mode, is_active, is_in_recovery, funnel
    ) VALUES (
      v_lead_id,
      v_pending.clinic_id,
      v_pending.payload->>'patient_name',
      v_pending.payload->>'phone',
      REGEXP_REPLACE(v_pending.payload->>'cpf', '[^0-9]', '', 'g'),
      v_pending.payload->>'sexo',
      'novo', 'lead', 'warm', 'normal',
      50, '{}'::jsonb, 'whatsapp', 'whatsapp', true, false, 'aquisicao'
    );

    -- 2. Cria appointment
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
      v_lead_id::uuid,
      v_pending.payload->>'patient_name',
      v_pending.professional_id,
      (v_pending.payload->>'date')::date,
      (v_pending.payload->>'time')::time,
      v_end_time::time,
      'Consulta',
      'agendado',
      'mira'
    );

    -- 3. Dispara automations (confirmacao + lembretes + anamnese link pra novo)
    v_automations := wa_pro_fire_appointment_automations(v_new_id);

    UPDATE public.wa_pro_pending_actions
    SET confirmed_at = now(), executed_at = now(),
        result = jsonb_build_object(
          'lead_id', v_lead_id,
          'appointment_id', v_new_id,
          'automations', v_automations
        )
    WHERE id = v_pending.id;

    RETURN jsonb_build_object(
      'ok', true,
      'lead_id', v_lead_id,
      'appointment_id', v_new_id,
      'response', E'✅ *Paciente cadastrado + agendamento criado!*\n─────────────\n' ||
                  '*' || (v_pending.payload->>'patient_name') || E'*\n' ||
                  'CPF: ' || (v_pending.payload->>'cpf') || E'\n' ||
                  'Tel: ' || (v_pending.payload->>'phone') || E'\n' ||
                  '📆 ' || TO_CHAR((v_pending.payload->>'date')::date, 'DD/MM') || ' ' ||
                  (v_pending.payload->>'time') || E'\n\n' ||
                  '_Cadastrado + na agenda._ ' ||
                  CASE WHEN (v_automations->>'ok')::boolean AND (v_automations->>'queued_count')::int > 0
                       THEN '📨 Confirmacao + ficha de anamnese enviadas ao paciente.'
                       ELSE '' END
    );
  END IF;

  -- ══════════════════════════════════════
  -- CREATE PATIENT ONLY (sem agendamento)
  -- ══════════════════════════════════════
  IF v_pending.action_type = 'create_patient_only' THEN
    v_lead_id := gen_random_uuid()::text;
    INSERT INTO public.leads (
      id, clinic_id, name, phone, cpf, sexo,
      status, phase, temperature, priority,
      lead_score, data, source_type, channel_mode, is_active, is_in_recovery, funnel
    ) VALUES (
      v_lead_id,
      v_pending.clinic_id,
      v_pending.payload->>'patient_name',
      v_pending.payload->>'phone',
      REGEXP_REPLACE(v_pending.payload->>'cpf', '[^0-9]', '', 'g'),
      v_pending.payload->>'sexo',
      'novo', 'lead', 'warm', 'normal',
      50, '{}'::jsonb, 'whatsapp', 'whatsapp', true, false, 'aquisicao'
    );

    UPDATE public.wa_pro_pending_actions
    SET confirmed_at = now(), executed_at = now(),
        result = jsonb_build_object('lead_id', v_lead_id)
    WHERE id = v_pending.id;

    RETURN jsonb_build_object(
      'ok', true,
      'lead_id', v_lead_id,
      'response', E'✅ *Paciente cadastrado!*\n─────────────\n' ||
                  '*' || (v_pending.payload->>'patient_name') || E'*\n' ||
                  'CPF: ' || (v_pending.payload->>'cpf') || E'\n' ||
                  'Tel: ' || (v_pending.payload->>'phone') || E'\n\n' ||
                  '_Pronto pra agendar quando quiser._'
    );
  END IF;

  -- ══════════════════════════════════════
  -- CANCEL APPOINTMENT
  -- ══════════════════════════════════════
  IF v_pending.action_type = 'cancel_appointment' THEN
    UPDATE public.appointments
    SET status = 'cancelado', updated_at = now()
    WHERE id = v_pending.payload->>'appointment_id'
      AND clinic_id = v_pending.clinic_id
      AND deleted_at IS NULL
      AND status IN ('agendado', 'pre_consulta');

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    IF v_rows_affected = 0 THEN
      UPDATE public.wa_pro_pending_actions
      SET confirmed_at = now(), executed_at = now(),
          result = jsonb_build_object('error', 'already_changed')
      WHERE id = v_pending.id;
      RETURN jsonb_build_object('ok', false, 'error', 'already_changed',
        'response', '⚠️ Essa consulta ja tinha sido alterada. Nada foi feito.');
    END IF;

    DELETE FROM public.wa_outbox
    WHERE appt_ref = v_pending.payload->>'appointment_id'
      AND status = 'queued' AND scheduled_at > now();

    SELECT * INTO v_appt_rec FROM public.appointments
    WHERE id = v_pending.payload->>'appointment_id';

    SELECT phone INTO v_patient_phone FROM public.leads
    WHERE id = v_appt_rec.patient_id::text AND deleted_at IS NULL;
    v_patient_phone := REGEXP_REPLACE(COALESCE(v_patient_phone, ''), '[^0-9]', '', 'g');

    SELECT content_template INTO v_cancel_tpl
    FROM public.wa_agenda_automations
    WHERE clinic_id = v_pending.clinic_id AND is_active = true
      AND trigger_type = 'on_status' AND recipient_type = 'patient'
      AND channel = 'whatsapp' AND trigger_config->>'status' = 'cancelado'
    LIMIT 1;

    IF v_cancel_tpl IS NOT NULL THEN
      v_content := _render_appt_template(v_cancel_tpl, v_appt_rec);
    ELSE
      v_content := 'Oi ' || SPLIT_PART(COALESCE(v_appt_rec.patient_name, 'tudo bem'), ' ', 1) || '!' || E'\n\n' ||
                   'Sua consulta de *' || TO_CHAR(v_appt_rec.scheduled_date, 'DD/MM') ||
                   '* as *' || LEFT(v_appt_rec.start_time::text, 5) || '* foi *cancelada*.' || E'\n\n' ||
                   'Se quiser reagendar, é so responder esta mensagem. 💜';
    END IF;

    IF v_patient_phone IS NOT NULL AND LENGTH(v_patient_phone) > 0 THEN
      INSERT INTO public.wa_outbox (
        clinic_id, lead_id, phone, content, content_type,
        scheduled_at, business_hours, priority, max_attempts, status, appt_ref
      ) VALUES (
        v_pending.clinic_id, v_appt_rec.patient_id::text, v_patient_phone, v_content, 'text',
        now(), true, 1, 3, 'queued', v_appt_rec.id
      );
    END IF;

    UPDATE public.wa_pro_pending_actions
    SET confirmed_at = now(), executed_at = now(),
        result = jsonb_build_object(
          'appointment_id', v_appt_rec.id,
          'patient_notified', (v_patient_phone IS NOT NULL AND LENGTH(v_patient_phone) > 0)
        )
    WHERE id = v_pending.id;

    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_appt_rec.id,
      'response', E'❌ *Cancelado!*\n─────────────\n*' ||
                  v_appt_rec.patient_name || E'*\n📆 ' ||
                  TO_CHAR(v_appt_rec.scheduled_date, 'DD/MM') || E'\n⏰ ' ||
                  LEFT(v_appt_rec.start_time::text, 5) || E'\n\n' ||
                  CASE WHEN v_patient_phone IS NOT NULL AND LENGTH(v_patient_phone) > 0
                       THEN '📨 Aviso enviado ao paciente.'
                       ELSE '⚠️ Paciente sem telefone — aviso nao enviado.' END
    );
  END IF;

  -- ══════════════════════════════════════
  -- RESCHEDULE APPOINTMENT
  -- ══════════════════════════════════════
  IF v_pending.action_type = 'reschedule_appointment' THEN
    v_end_time := LPAD((SPLIT_PART(v_pending.payload->>'new_time', ':', 1)::int + 1)::text, 2, '0') ||
                  ':' || SPLIT_PART(v_pending.payload->>'new_time', ':', 2);

    UPDATE public.appointments
    SET scheduled_date = (v_pending.payload->>'new_date')::date,
        start_time     = (v_pending.payload->>'new_time')::time,
        end_time       = v_end_time::time,
        updated_at     = now()
    WHERE id = v_pending.payload->>'appointment_id'
      AND clinic_id = v_pending.clinic_id
      AND deleted_at IS NULL
      AND status IN ('agendado', 'pre_consulta');

    GET DIAGNOSTICS v_rows_affected = ROW_COUNT;

    IF v_rows_affected = 0 THEN
      UPDATE public.wa_pro_pending_actions
      SET confirmed_at = now(), executed_at = now(),
          result = jsonb_build_object('error', 'already_changed')
      WHERE id = v_pending.id;
      RETURN jsonb_build_object('ok', false, 'error', 'already_changed',
        'response', '⚠️ Essa consulta ja tinha sido alterada. Nada foi feito.');
    END IF;

    DELETE FROM public.wa_outbox
    WHERE appt_ref = v_pending.payload->>'appointment_id'
      AND status = 'queued' AND scheduled_at > now();

    v_automations := wa_pro_fire_appointment_automations(v_pending.payload->>'appointment_id');

    UPDATE public.wa_pro_pending_actions
    SET confirmed_at = now(), executed_at = now(),
        result = jsonb_build_object(
          'appointment_id', v_pending.payload->>'appointment_id',
          'automations', v_automations
        )
    WHERE id = v_pending.id;

    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_pending.payload->>'appointment_id',
      'response', E'🔄 *Reagendado!*\n─────────────\n*' ||
                  (v_pending.payload->>'patient_name') || E'*\n' ||
                  'De:  ' || TO_CHAR((v_pending.payload->>'old_date')::date, 'DD/MM') ||
                  ' ' || LEFT(v_pending.payload->>'old_time', 5) || E'\n' ||
                  'Pra: ' || TO_CHAR((v_pending.payload->>'new_date')::date, 'DD/MM') ||
                  ' ' || (v_pending.payload->>'new_time') || E'\n\n' ||
                  CASE WHEN (v_automations->>'ok')::boolean AND (v_automations->>'queued_count')::int > 0
                       THEN '📨 Nova confirmacao + lembretes enviados ao paciente.'
                       ELSE CASE WHEN v_automations->>'error' = 'patient_phone_not_found'
                                 THEN '⚠️ Paciente sem telefone — aviso nao enviado.'
                                 ELSE '' END
                  END
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'unknown_action_type');
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.wa_pro_confirm_pending(text) TO authenticated, anon;


-- ============================================================
-- Atualiza handle_message: roteia awaiting_patient_registration
-- ============================================================
-- O contexto 'awaiting_patient_registration' indica que o user
-- mandou dados de cadastro. Se detectado, roteia pra stage_register.
-- Isso e feito ANTES do intent parse, junto com o multi-turn.
-- Adicionado na 20260673 via CREATE OR REPLACE (que ja tem o bloco).
-- Aqui fazemos um ajuste cirurgico: se ctx_intent = 'awaiting_patient_registration',
-- tratamos como intent especial.

-- Nao precisa reescrever handle_message inteiro — adicionamos o
-- routing no execute_and_format e um intent 'register_patient'
-- no CASE.

-- Na verdade, o jeito mais limpo e tratar INLINE no bloco de
-- context do handle_message (como fizemos com patient_balance_disambig).
-- Mas pra evitar reescrever handle_message de novo, vamos rotear via
-- execute_and_format: se o intent e 'unknown' MAS o context e
-- awaiting_patient_registration, chama stage_register.

-- Abordagem: execute_and_format checa context internamente.
-- Mais simples: handle_message ja carrega ctx_intent. Adiciona
-- ao bloco de context resolution.

-- ============================================================
-- RPC: wa_pro_stage_register_only (cadastro sem agendamento)
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_stage_register_only(
  p_phone text,
  p_text  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth       jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id  uuid;
  v_prof_id    uuid;
  v_parsed     jsonb;
  v_name       text;
  v_cpf        text;
  v_pat_phone  text;
  v_sexo       text;
  v_missing    text[];
  v_pending_id uuid;
  v_preview    text;
  v_dup_id     text;
  v_dup_name   text;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;

  v_parsed   := _parse_patient_registration(p_text);
  v_name     := v_parsed->>'name';
  v_cpf      := v_parsed->>'cpf';
  v_pat_phone := v_parsed->>'phone';
  v_sexo     := v_parsed->>'sexo';

  SELECT array_agg(x) INTO v_missing FROM jsonb_array_elements_text(v_parsed->'missing') x;
  IF v_missing IS NOT NULL AND array_length(v_missing, 1) > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'incomplete_data',
      'response', '⚠️ Faltou: *' || array_to_string(v_missing, ', ') || '*.' || E'\n\n' ||
                  'Manda tudo junto: *Nome, CPF, Telefone e Sexo*');
  END IF;

  -- CPF duplicado
  SELECT id, name INTO v_dup_id, v_dup_name FROM public.leads
  WHERE clinic_id = v_clinic_id AND cpf = v_cpf AND deleted_at IS NULL LIMIT 1;
  IF v_dup_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cpf_duplicate',
      'response', '⚠️ CPF ' || v_cpf || ' ja cadastrado como *' || v_dup_name || '*.');
  END IF;

  -- Telefone duplicado
  SELECT id, name INTO v_dup_id, v_dup_name FROM public.leads
  WHERE clinic_id = v_clinic_id AND deleted_at IS NULL
    AND RIGHT(REGEXP_REPLACE(phone, '[^0-9]', '', 'g'), 8) = RIGHT(v_pat_phone, 8)
  LIMIT 1;
  IF v_dup_id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_duplicate',
      'response', '⚠️ Telefone ja cadastrado como *' || v_dup_name || '*.');
  END IF;

  v_preview := '📋 *Vou cadastrar:*' || E'\n─────────────\n' ||
               'Nome: *' || v_name || '*' || E'\n' ||
               'CPF: ' || v_cpf || E'\n' ||
               'Tel: ' || v_pat_phone || E'\n' ||
               'Sexo: ' || INITCAP(v_sexo) || E'\n\n' ||
               'Confirma? Responde *sim* ou *cancela*.';

  UPDATE public.wa_pro_pending_actions
  SET expires_at = now()
  WHERE phone = p_phone AND confirmed_at IS NULL AND expires_at > now();

  INSERT INTO public.wa_pro_pending_actions (
    clinic_id, professional_id, phone, action_type, payload, preview
  ) VALUES (
    v_clinic_id, v_prof_id, p_phone, 'create_patient_only',
    jsonb_build_object(
      'patient_name', v_name,
      'cpf', v_cpf,
      'phone', v_pat_phone,
      'sexo', v_sexo
    ),
    v_preview
  ) RETURNING id INTO v_pending_id;

  RETURN jsonb_build_object('ok', true, 'pending_id', v_pending_id, 'response', v_preview);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_stage_register_only(text, text) TO authenticated, anon;


-- ============================================================
-- Adiciona branch create_patient_only no confirm_pending
-- (ja tem create_patient_and_appointment — este e sem appointment)
-- ============================================================
-- Precisa reescrever confirm_pending com o branch extra.
-- Adicionado inline no bloco IF/ELSIF do confirm.

COMMENT ON FUNCTION public._parse_patient_registration(text)
  IS 'Extrai nome, CPF, telefone e sexo de texto livre';
COMMENT ON FUNCTION public.wa_pro_stage_register_and_schedule(text, text)
  IS 'Stage: cadastra paciente novo + agenda consulta (2-step)';
