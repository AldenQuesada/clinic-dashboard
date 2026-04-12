-- Mira Bloco D #1 — Cancelamento + Reagendamento via WhatsApp
--
-- Pattern: stage -> confirm (reusa wa_pro_pending_actions da 20260669)
-- Novos action_types: 'cancel_appointment' | 'reschedule_appointment'
--
-- Blindagens:
--  - Idempotencia: UPDATE com guard de status (agendado|pre_consulta)
--  - Scope enforcement: _find_target respeita access_scope
--  - Outbox cleanup: DELETE apenas status='queued' AND scheduled_at > now()
--  - Atomicidade: cada RPC e uma funcao PL/pgSQL = transacao implicita
--  - Disambiguacao: >1 match retorna ambiguous com enumeracao
--  - Cancel <24h nao bloqueado nesse sprint (politica futura)
--  - Token de anamnese sobrevive ao reschedule (mesmo appointment.id)

-- ============================================================
-- Helper: encontra appointments futuros alvo (aplica scope)
-- Retorna { count, items: [{id, date, time, status, procedure, patient_name}] }
-- ============================================================
CREATE OR REPLACE FUNCTION public._find_target_appointments(
  p_clinic_id      uuid,
  p_patient_id     text,
  p_professional_id uuid,
  p_scope          text,   -- 'own' | 'team' | 'full'
  p_ref_date       date DEFAULT NULL  -- se informado, filtra exato
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_items jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(a)::jsonb ORDER BY a.scheduled_date, a.start_time), '[]'::jsonb)
  INTO v_items
  FROM (
    SELECT
      ap.id,
      ap.scheduled_date,
      ap.start_time,
      ap.end_time,
      ap.status,
      ap.procedure_name,
      ap.patient_name,
      ap.professional_id
    FROM public.appointments ap
    WHERE ap.clinic_id = p_clinic_id
      AND ap.deleted_at IS NULL
      AND ap.patient_id::text = p_patient_id
      AND ap.status IN ('agendado', 'pre_consulta')
      AND ap.scheduled_date >= v_today
      AND (p_ref_date IS NULL OR ap.scheduled_date = p_ref_date)
      AND (
        p_scope = 'full'
        OR p_scope = 'team'
        OR (p_scope = 'own' AND ap.professional_id = p_professional_id)
      )
    ORDER BY ap.scheduled_date, ap.start_time
  ) a;

  RETURN jsonb_build_object(
    'count', jsonb_array_length(COALESCE(v_items, '[]'::jsonb)),
    'items', COALESCE(v_items, '[]'::jsonb)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public._find_target_appointments(uuid, text, uuid, text, date) TO authenticated, anon;


-- ============================================================
-- Parser: extrai nome + ref_date opcional de "cancela a Maria amanha"
-- ============================================================
CREATE OR REPLACE FUNCTION public._parse_cancel_appointment(p_text text)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_t      text := LOWER(COALESCE(p_text, ''));
  v_today  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_date   date;
  v_name   text;
  v_has_date boolean := false;
BEGIN
  -- Remove verbo inicial
  v_t := REGEXP_REPLACE(v_t,
    '^\s*(cancela|cancelar|desmarca|desmarcar|remove|remover|tira|tirar)\s+',
    '', 'i');
  -- Remove conectores comuns
  v_t := REGEXP_REPLACE(v_t,
    '^(a\s+|o\s+|as\s+|os\s+)?(consulta|consultas|agendamento|agendamentos|appointment|appointments)?\s*(da|do|de|das|dos)?\s*',
    '', 'i');

  -- Data
  IF v_t ~ '[[:<:]](hoje)[[:>:]]' THEN v_date := v_today; v_has_date := true;
  ELSIF v_t ~ '[[:<:]](amanha|amanhã)[[:>:]]' THEN v_date := v_today + 1; v_has_date := true;
  ELSIF v_t ~ 'depois de amanha|depois de amanhã' THEN v_date := v_today + 2; v_has_date := true;
  ELSIF v_t ~ '[[:<:]]segunda[[:>:]]' THEN
    v_date := v_today + ((1 - EXTRACT(dow FROM v_today)::int + 7) % 7 +
      (CASE WHEN EXTRACT(dow FROM v_today)::int = 1 THEN 7 ELSE 0 END))::int;
    v_has_date := true;
  ELSIF v_t ~ '[[:<:]](terca|terça)[[:>:]]' THEN
    v_date := v_today + ((2 - EXTRACT(dow FROM v_today)::int + 7) % 7 +
      (CASE WHEN EXTRACT(dow FROM v_today)::int = 2 THEN 7 ELSE 0 END))::int;
    v_has_date := true;
  ELSIF v_t ~ '[[:<:]]quarta[[:>:]]' THEN
    v_date := v_today + ((3 - EXTRACT(dow FROM v_today)::int + 7) % 7 +
      (CASE WHEN EXTRACT(dow FROM v_today)::int = 3 THEN 7 ELSE 0 END))::int;
    v_has_date := true;
  ELSIF v_t ~ '[[:<:]]quinta[[:>:]]' THEN
    v_date := v_today + ((4 - EXTRACT(dow FROM v_today)::int + 7) % 7 +
      (CASE WHEN EXTRACT(dow FROM v_today)::int = 4 THEN 7 ELSE 0 END))::int;
    v_has_date := true;
  ELSIF v_t ~ '[[:<:]]sexta[[:>:]]' THEN
    v_date := v_today + ((5 - EXTRACT(dow FROM v_today)::int + 7) % 7 +
      (CASE WHEN EXTRACT(dow FROM v_today)::int = 5 THEN 7 ELSE 0 END))::int;
    v_has_date := true;
  ELSIF v_t ~ '([0-9]{1,2})/([0-9]{1,2})' THEN
    v_date := MAKE_DATE(
      EXTRACT(year FROM v_today)::int,
      (REGEXP_MATCH(v_t, '([0-9]{1,2})/([0-9]{1,2})'))[2]::int,
      (REGEXP_MATCH(v_t, '([0-9]{1,2})/([0-9]{1,2})'))[1]::int
    );
    -- Se ja passou, assume proximo ano
    IF v_date < v_today THEN v_date := v_date + interval '1 year'; END IF;
    v_has_date := true;
  ELSIF v_t ~ '[[:<:]]dia\s+([0-9]{1,2})[[:>:]]' THEN
    DECLARE v_day_c int := (REGEXP_MATCH(v_t, '[[:<:]]dia\s+([0-9]{1,2})[[:>:]]'))[1]::int;
    BEGIN
      v_date := MAKE_DATE(EXTRACT(year FROM v_today)::int, EXTRACT(month FROM v_today)::int, v_day_c);
      IF v_date < v_today THEN v_date := v_date + interval '1 month'; END IF;
    END;
    v_has_date := true;
  END IF;

  -- Nome: remove tokens de data, hora, preposicoes
  v_name := v_t;
  v_name := REGEXP_REPLACE(v_name,
    '[[:<:]](hoje|amanha|amanhã|depois de amanha|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)[[:>:]]',
    '', 'gi');
  v_name := REGEXP_REPLACE(v_name, '([0-9]{1,2})/([0-9]{1,2})(/[0-9]{2,4})?', '', 'g');
  v_name := REGEXP_REPLACE(v_name, '[0-9]{1,2}\s*[:h]?(oras?)?\s*[0-9]{0,2}', '', 'g');
  v_name := REGEXP_REPLACE(v_name,
    '(de manha|da manha|da tarde|da noite|a tarde|a noite)[[:>:]]',
    '', 'gi');
  v_name := REGEXP_REPLACE(v_name,
    '[[:<:]](pra|para|as|às|no|na|dia)[[:>:]]',
    '', 'gi');
  v_name := REGEXP_REPLACE(v_name, '[,.;!?]', '', 'g');
  v_name := TRIM(REGEXP_REPLACE(v_name, '\s+', ' ', 'g'));
  IF LENGTH(v_name) > 0 THEN
    v_name := UPPER(SUBSTRING(v_name, 1, 1)) || SUBSTRING(v_name, 2);
  END IF;

  RETURN jsonb_build_object(
    'name', NULLIF(v_name, ''),
    'ref_date', CASE WHEN v_has_date THEN v_date ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public._parse_cancel_appointment(text) TO authenticated, anon;


-- ============================================================
-- Parser: "reagenda a Maria pra terca 15h"
-- Retorna {name, new_date, new_time}
-- ============================================================
CREATE OR REPLACE FUNCTION public._parse_reschedule_appointment(p_text text)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_t      text := LOWER(COALESCE(p_text, ''));
  v_today  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_left   text;
  v_right  text;
  v_date   date;
  v_hour   int;
  v_minute int := 0;
  v_name   text;
BEGIN
  -- Remove verbo inicial
  v_t := REGEXP_REPLACE(v_t,
    '^\s*(reagenda|reagendar|remarca|remarcar|remarque|muda|mudar|mover|move)\s+',
    '', 'i');

  -- Split por "pra/para"
  IF v_t ~ '[[:<:]](pra|para)[[:>:]]' THEN
    v_left  := REGEXP_REPLACE(v_t, '\s+(pra|para)\s+.*$', '', 'i');
    v_right := REGEXP_REPLACE(v_t, '^.*?\s+(pra|para)\s+', '', 'i');
  ELSE
    -- Sem "pra": tenta detectar data no final
    v_left  := v_t;
    v_right := v_t;
  END IF;

  -- Data do destino (do lado direito)
  IF v_right ~ '[[:<:]](ontem)[[:>:]]' THEN v_date := v_today - 1;
  ELSIF v_right ~ '[[:<:]](hoje)[[:>:]]' THEN v_date := v_today;
  ELSIF v_right ~ '[[:<:]](amanha|amanhã)[[:>:]]' THEN v_date := v_today + 1;
  ELSIF v_right ~ 'depois de amanha|depois de amanhã' THEN v_date := v_today + 2;
  ELSIF v_right ~ '[[:<:]]segunda[[:>:]]' THEN
    v_date := v_today + ((1 - EXTRACT(dow FROM v_today)::int + 7) % 7 +
      (CASE WHEN EXTRACT(dow FROM v_today)::int = 1 THEN 7 ELSE 0 END))::int;
  ELSIF v_right ~ '[[:<:]](terca|terça)[[:>:]]' THEN
    v_date := v_today + ((2 - EXTRACT(dow FROM v_today)::int + 7) % 7 +
      (CASE WHEN EXTRACT(dow FROM v_today)::int = 2 THEN 7 ELSE 0 END))::int;
  ELSIF v_right ~ '[[:<:]]quarta[[:>:]]' THEN
    v_date := v_today + ((3 - EXTRACT(dow FROM v_today)::int + 7) % 7 +
      (CASE WHEN EXTRACT(dow FROM v_today)::int = 3 THEN 7 ELSE 0 END))::int;
  ELSIF v_right ~ '[[:<:]]quinta[[:>:]]' THEN
    v_date := v_today + ((4 - EXTRACT(dow FROM v_today)::int + 7) % 7 +
      (CASE WHEN EXTRACT(dow FROM v_today)::int = 4 THEN 7 ELSE 0 END))::int;
  ELSIF v_right ~ '[[:<:]]sexta[[:>:]]' THEN
    v_date := v_today + ((5 - EXTRACT(dow FROM v_today)::int + 7) % 7 +
      (CASE WHEN EXTRACT(dow FROM v_today)::int = 5 THEN 7 ELSE 0 END))::int;
  ELSIF v_right ~ '([0-9]{1,2})/([0-9]{1,2})' THEN
    v_date := MAKE_DATE(
      EXTRACT(year FROM v_today)::int,
      (REGEXP_MATCH(v_right, '([0-9]{1,2})/([0-9]{1,2})'))[2]::int,
      (REGEXP_MATCH(v_right, '([0-9]{1,2})/([0-9]{1,2})'))[1]::int
    );
    IF v_date < v_today THEN v_date := v_date + interval '1 year'; END IF;
  ELSIF v_right ~ '[[:<:]]dia\s+([0-9]{1,2})[[:>:]]' THEN
    DECLARE v_day_r int := (REGEXP_MATCH(v_right, '[[:<:]]dia\s+([0-9]{1,2})[[:>:]]'))[1]::int;
    BEGIN
      v_date := MAKE_DATE(EXTRACT(year FROM v_today)::int, EXTRACT(month FROM v_today)::int, v_day_r);
      IF v_date < v_today THEN v_date := v_date + interval '1 month'; END IF;
    END;
  END IF;

  -- Hora do destino (do lado direito)
  IF v_right ~ '([0-9]{1,2}):([0-9]{2})' THEN
    v_hour   := (REGEXP_MATCH(v_right, '([0-9]{1,2}):([0-9]{2})'))[1]::int;
    v_minute := (REGEXP_MATCH(v_right, '([0-9]{1,2}):([0-9]{2})'))[2]::int;
  ELSIF v_right ~ '([0-9]{1,2})\s*h(oras?)?' THEN
    v_hour := (REGEXP_MATCH(v_right, '([0-9]{1,2})\s*h(oras?)?'))[1]::int;
  ELSIF v_right ~ '[[:<:]]manha[[:>:]]|de manha|da manha' THEN v_hour := 9;
  ELSIF v_right ~ '[[:<:]](tarde)[[:>:]]|a tarde|da tarde' THEN v_hour := 14;
  ELSIF v_right ~ '[[:<:]](noite)[[:>:]]|a noite|da noite' THEN v_hour := 19;
  ELSIF v_right ~ '[[:<:]](meio[- ]?dia)[[:>:]]' THEN v_hour := 12;
  ELSIF v_right ~ '[[:<:]](uma|1)\s+(da tarde|hora)' THEN v_hour := 13;
  ELSIF v_right ~ '[[:<:]](duas|2)\s+(da tarde|horas)' THEN v_hour := 14;
  ELSIF v_right ~ '[[:<:]](tres|três|3)\s+(da tarde|horas)' THEN v_hour := 15;
  ELSIF v_right ~ '[[:<:]](quatro|4)\s+(da tarde|horas)' THEN v_hour := 16;
  ELSIF v_right ~ '[[:<:]](cinco|5)\s+(da tarde|horas)' THEN v_hour := 17;
  END IF;

  -- Nome: do lado esquerdo, limpa tokens
  v_name := v_left;
  v_name := REGEXP_REPLACE(v_name,
    '^(a\s+|o\s+|as\s+|os\s+)?(consulta|consultas|agendamento|agendamentos)?\s*(da|do|de|das|dos)?\s*',
    '', 'i');
  v_name := REGEXP_REPLACE(v_name,
    '[[:<:]](hoje|amanha|amanhã|depois de amanha|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado|domingo)[[:>:]]',
    '', 'gi');
  v_name := REGEXP_REPLACE(v_name, '([0-9]{1,2})/([0-9]{1,2})(/[0-9]{2,4})?', '', 'g');
  v_name := REGEXP_REPLACE(v_name, '[0-9]{1,2}\s*[:h]?(oras?)?\s*[0-9]{0,2}', '', 'g');
  v_name := REGEXP_REPLACE(v_name,
    '(de manha|da manha|da tarde|da noite|a tarde|a noite)[[:>:]]',
    '', 'gi');
  v_name := REGEXP_REPLACE(v_name,
    '[[:<:]](pra|para|as|às|no|na|dia)[[:>:]]',
    '', 'gi');
  v_name := REGEXP_REPLACE(v_name, '[,.;!?]', '', 'g');
  v_name := TRIM(REGEXP_REPLACE(v_name, '\s+', ' ', 'g'));
  IF LENGTH(v_name) > 0 THEN
    v_name := UPPER(SUBSTRING(v_name, 1, 1)) || SUBSTRING(v_name, 2);
  END IF;

  RETURN jsonb_build_object(
    'name',     NULLIF(v_name, ''),
    'new_date', v_date,
    'new_time', CASE WHEN v_hour IS NOT NULL
                     THEN LPAD(v_hour::text, 2, '0') || ':' || LPAD(v_minute::text, 2, '0')
                     ELSE NULL END
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public._parse_reschedule_appointment(text) TO authenticated, anon;


-- ============================================================
-- Render: lista de appointments enumerada (para disambiguacao)
-- ============================================================
CREATE OR REPLACE FUNCTION public._render_appt_choices(p_items jsonb, p_patient_name text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_out text;
  v_item jsonb;
  v_i int := 0;
  v_date_br text;
  v_dow text;
BEGIN
  v_out := '🤔 Encontrei *' || jsonb_array_length(p_items) || '* consultas futuras de *' ||
           p_patient_name || E'*:\n─────────────';
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_i := v_i + 1;
    v_date_br := TO_CHAR((v_item->>'scheduled_date')::date, 'DD/MM');
    v_dow := TO_CHAR((v_item->>'scheduled_date')::date, 'Dy');
    v_out := v_out || E'\n' || v_i || '. *' || v_date_br || ' (' || v_dow || ') ' ||
             LEFT(COALESCE(v_item->>'start_time', ''), 5) || '*' ||
             CASE WHEN NULLIF(v_item->>'procedure_name','') IS NOT NULL
                  THEN ' · ' || (v_item->>'procedure_name')
                  ELSE '' END;
  END LOOP;
  v_out := v_out || E'\n─────────────\n' ||
           '_Reformule com a data, ex: "cancela a ' || p_patient_name || ' 20/04"_';
  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public._render_appt_choices(jsonb, text) TO authenticated, anon;


-- ============================================================
-- RPC: wa_pro_stage_cancel_appointment
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_stage_cancel_appointment(
  p_phone text,
  p_query text
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
  v_scope      text;
  v_parsed     jsonb;
  v_name       text;
  v_ref_date   date;
  v_match_list jsonb;
  v_patient_id text;
  v_patient_name text;
  v_targets    jsonb;
  v_appt       jsonb;
  v_preview    text;
  v_pending_id uuid;
  v_appt_date_br text;
  v_appt_dow text;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized',
      'response', '🚫 Numero nao autorizado.');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := COALESCE(v_auth->>'access_scope', 'own');

  v_parsed   := _parse_cancel_appointment(p_query);
  v_name     := v_parsed->>'name';
  v_ref_date := NULLIF(v_parsed->>'ref_date','')::date;

  IF v_name IS NULL OR LENGTH(v_name) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_missing',
      'response', '🤔 De qual paciente? Ex: "cancela a Maria Silva amanha"');
  END IF;

  -- Fuzzy busca o paciente
  v_match_list := wa_pro_patient_search(p_phone, v_name, 3);
  IF jsonb_array_length(COALESCE(v_match_list->'results', '[]'::jsonb)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'patient_not_found',
      'response', '🔍 Paciente "' || v_name || '" nao encontrado.');
  END IF;

  v_patient_id   := v_match_list->'results'->0->>'id';
  v_patient_name := v_match_list->'results'->0->>'name';

  -- Busca appointments futuros
  v_targets := _find_target_appointments(v_clinic_id, v_patient_id, v_prof_id, v_scope, v_ref_date);

  IF (v_targets->>'count')::int = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found',
      'response', '🔍 Nenhuma consulta futura de *' || v_patient_name ||
                  CASE WHEN v_ref_date IS NOT NULL
                       THEN '* em ' || TO_CHAR(v_ref_date, 'DD/MM') || '.'
                       ELSE '* encontrada.' END);
  END IF;

  -- Disambiguacao: >1 match → salva context pra multi-turn
  IF (v_targets->>'count')::int > 1 THEN
    PERFORM _save_context(
      p_phone, v_clinic_id, v_prof_id,
      'cancel_disambig', p_query,
      'patient', v_patient_id, v_patient_name,
      v_targets->'items'
    );
    RETURN jsonb_build_object('ok', false, 'error', 'ambiguous',
      'intent', 'cancel_disambig',
      'response', _render_appt_choices(v_targets->'items', v_patient_name));
  END IF;

  -- Single match: monta preview + pending
  v_appt := v_targets->'items'->0;
  v_appt_date_br := TO_CHAR((v_appt->>'scheduled_date')::date, 'DD/MM');
  v_appt_dow := TO_CHAR((v_appt->>'scheduled_date')::date, 'Dy');

  DECLARE
    v_appt_at timestamptz := ((v_appt->>'scheduled_date')::date::text || ' ' || (v_appt->>'start_time'))::timestamp
                             AT TIME ZONE 'America/Sao_Paulo';
    v_hours_until numeric := EXTRACT(epoch FROM (v_appt_at - now())) / 3600;
    v_urgency_warn text := '';
  BEGIN
    IF v_hours_until < 24 AND v_hours_until > 0 THEN
      v_urgency_warn := E'\n⚠️ _Faltam menos de 24h pra consulta!_\n';
    END IF;

  v_preview := '❌ *Vou cancelar:*' || E'\n─────────────\n' ||
               '*' || v_patient_name || '*' || E'\n' ||
               '📆 ' || v_appt_date_br || ' (' || v_appt_dow || ')' || E'\n' ||
               '⏰ ' || LEFT(v_appt->>'start_time', 5) ||
               v_urgency_warn || E'\n' ||
               'Confirma? Responde *sim* ou *cancela*.';

  -- Invalida pendings anteriores
  UPDATE public.wa_pro_pending_actions
  SET expires_at = now()
  WHERE phone = p_phone AND confirmed_at IS NULL AND expires_at > now();

  INSERT INTO public.wa_pro_pending_actions (
    clinic_id, professional_id, phone, action_type, payload, preview
  ) VALUES (
    v_clinic_id, v_prof_id, p_phone, 'cancel_appointment',
    jsonb_build_object(
      'appointment_id', v_appt->>'id',
      'patient_id',     v_patient_id,
      'patient_name',   v_patient_name,
      'date',           v_appt->>'scheduled_date',
      'time',           v_appt->>'start_time'
    ),
    v_preview
  ) RETURNING id INTO v_pending_id;

  RETURN jsonb_build_object(
    'ok', true,
    'pending_id', v_pending_id,
    'response', v_preview
  );
  END; -- fecha DECLARE v_urgency_warn
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_stage_cancel_appointment(text, text) TO authenticated, anon;


-- ============================================================
-- RPC: wa_pro_stage_reschedule_appointment
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_stage_reschedule_appointment(
  p_phone text,
  p_query text
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
  v_scope      text;
  v_parsed     jsonb;
  v_name       text;
  v_new_date   date;
  v_new_time   text;
  v_new_at     timestamptz;
  v_today      date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_now_br     timestamptz := now();
  v_match_list jsonb;
  v_patient_id text;
  v_patient_name text;
  v_targets    jsonb;
  v_appt       jsonb;
  v_preview    text;
  v_pending_id uuid;
  v_old_date_br text;
  v_new_date_br text;
  v_new_dow text;
  v_conflict int;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized',
      'response', '🚫 Numero nao autorizado.');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := COALESCE(v_auth->>'access_scope', 'own');

  v_parsed   := _parse_reschedule_appointment(p_query);
  v_name     := v_parsed->>'name';
  v_new_date := NULLIF(v_parsed->>'new_date','')::date;
  v_new_time := v_parsed->>'new_time';

  IF v_name IS NULL OR LENGTH(v_name) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_missing',
      'response', '🤔 Quem? Ex: "reagenda a Maria pra terca 15h"');
  END IF;

  IF v_new_date IS NULL OR v_new_time IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'destination_missing',
      'response', '🤔 Pra quando? Ex: "reagenda a Maria *pra terca 15h*"');
  END IF;

  -- Valida: novo horario nao pode ser no passado
  v_new_at := (v_new_date::text || ' ' || v_new_time)::timestamp
              AT TIME ZONE 'America/Sao_Paulo';
  IF v_new_at <= v_now_br THEN
    RETURN jsonb_build_object('ok', false, 'error', 'past_date',
      'response', '⏱️ Nao da pra reagendar pro passado. Escolha data/hora futura.');
  END IF;

  -- Fuzzy busca o paciente
  v_match_list := wa_pro_patient_search(p_phone, v_name, 3);
  IF jsonb_array_length(COALESCE(v_match_list->'results', '[]'::jsonb)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'patient_not_found',
      'response', '🔍 Paciente "' || v_name || '" nao encontrado.');
  END IF;

  v_patient_id   := v_match_list->'results'->0->>'id';
  v_patient_name := v_match_list->'results'->0->>'name';

  -- Busca appointments futuros (sem ref_date — pega todos)
  v_targets := _find_target_appointments(v_clinic_id, v_patient_id, v_prof_id, v_scope, NULL);

  IF (v_targets->>'count')::int = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'appointment_not_found',
      'response', '🔍 *' || v_patient_name || '* nao tem consultas futuras pra reagendar.');
  END IF;

  IF (v_targets->>'count')::int > 1 THEN
    PERFORM _save_context(
      p_phone, v_clinic_id, v_prof_id,
      'reschedule_disambig', p_query,
      'patient', v_patient_id, v_patient_name,
      jsonb_build_object('items', v_targets->'items', 'new_date', v_new_date, 'new_time', v_new_time)
    );
    RETURN jsonb_build_object('ok', false, 'error', 'ambiguous',
      'intent', 'reschedule_disambig',
      'response', _render_appt_choices(v_targets->'items', v_patient_name));
  END IF;

  v_appt := v_targets->'items'->0;

  -- Checa conflito no novo horario (qualquer profissional da clinica — agenda compartilhada)
  SELECT COUNT(*) INTO v_conflict
  FROM public.appointments
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND status IN ('agendado', 'pre_consulta')
    AND id != (v_appt->>'id')
    AND scheduled_date = v_new_date
    AND start_time = v_new_time::time;

  IF v_conflict > 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slot_conflict',
      'response', '⚠️ Ja tem consulta marcada em ' ||
                  TO_CHAR(v_new_date, 'DD/MM') || ' ' || v_new_time ||
                  '. Escolhe outro horario.');
  END IF;

  v_old_date_br := TO_CHAR((v_appt->>'scheduled_date')::date, 'DD/MM');
  v_new_date_br := TO_CHAR(v_new_date, 'DD/MM');
  v_new_dow     := TO_CHAR(v_new_date, 'Dy');

  v_preview := '🔄 *Vou reagendar:*' || E'\n─────────────\n' ||
               '*' || v_patient_name || '*' || E'\n' ||
               'De:  ' || v_old_date_br || ' ' || LEFT(v_appt->>'start_time', 5) || E'\n' ||
               'Pra: ' || v_new_date_br || ' (' || v_new_dow || ') ' || v_new_time || E'\n\n' ||
               'Confirma? Responde *sim* ou *cancela*.';

  -- Invalida pendings anteriores
  UPDATE public.wa_pro_pending_actions
  SET expires_at = now()
  WHERE phone = p_phone AND confirmed_at IS NULL AND expires_at > now();

  INSERT INTO public.wa_pro_pending_actions (
    clinic_id, professional_id, phone, action_type, payload, preview
  ) VALUES (
    v_clinic_id, v_prof_id, p_phone, 'reschedule_appointment',
    jsonb_build_object(
      'appointment_id', v_appt->>'id',
      'patient_id',     v_patient_id,
      'patient_name',   v_patient_name,
      'old_date',       v_appt->>'scheduled_date',
      'old_time',       v_appt->>'start_time',
      'new_date',       v_new_date,
      'new_time',       v_new_time
    ),
    v_preview
  ) RETURNING id INTO v_pending_id;

  RETURN jsonb_build_object(
    'ok', true,
    'pending_id', v_pending_id,
    'response', v_preview
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_stage_reschedule_appointment(text, text) TO authenticated, anon;


-- ============================================================
-- wa_pro_confirm_pending — extende com cancel + reschedule branches
-- (mantem o branch create_appointment + auto-fire automations)
-- ============================================================
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
  v_resched_tpl text;
  v_content    text;
  v_patient_phone text;
BEGIN
  SELECT * INTO v_pending FROM public.wa_pro_pending_actions
  WHERE phone = p_phone AND confirmed_at IS NULL AND expires_at > now()
  ORDER BY created_at DESC LIMIT 1;

  IF v_pending.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_pending',
      'response', '🤔 Nao tem nada pendente de confirmacao.');
  END IF;

  -- ══════════════════════════════════════
  -- CREATE APPOINTMENT (ja existente)
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
  -- CANCEL APPOINTMENT (novo)
  -- Idempotente: guard de status
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
        'response', '⚠️ Essa consulta ja tinha sido alterada (cancelada, finalizada ou excluida). Nada foi feito.');
    END IF;

    -- Remove msgs futuras da outbox
    DELETE FROM public.wa_outbox
    WHERE appt_ref = v_pending.payload->>'appointment_id'
      AND status = 'queued'
      AND scheduled_at > now();

    -- Busca dados do appointment pra render msg ao paciente
    SELECT * INTO v_appt_rec FROM public.appointments
    WHERE id = v_pending.payload->>'appointment_id';

    SELECT phone INTO v_patient_phone FROM public.leads
    WHERE id = v_appt_rec.patient_id::text AND deleted_at IS NULL;
    v_patient_phone := REGEXP_REPLACE(COALESCE(v_patient_phone, ''), '[^0-9]', '', 'g');

    -- Busca template de cancelamento (se existir)
    SELECT content_template INTO v_cancel_tpl
    FROM public.wa_agenda_automations
    WHERE clinic_id = v_pending.clinic_id
      AND is_active = true
      AND trigger_type = 'on_status'
      AND recipient_type = 'patient'
      AND channel = 'whatsapp'
      AND trigger_config->>'status' = 'cancelado'
    LIMIT 1;

    IF v_cancel_tpl IS NOT NULL THEN
      v_content := _render_appt_template(v_cancel_tpl, v_appt_rec);
    ELSE
      -- Fallback hardcoded
      v_content := 'Oi ' || SPLIT_PART(COALESCE(v_appt_rec.patient_name, 'tudo bem'), ' ', 1) || '!' || E'\n\n' ||
                   'Sua consulta de *' || TO_CHAR(v_appt_rec.scheduled_date, 'DD/MM') ||
                   '* as *' || LEFT(v_appt_rec.start_time::text, 5) || '* foi *cancelada*.' || E'\n\n' ||
                   'Se quiser reagendar, é so responder esta mensagem. 💜';
    END IF;

    -- Enfileira msg ao paciente (se tiver phone)
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
  -- RESCHEDULE APPOINTMENT (novo)
  -- UPDATE no mesmo id + DELETE outbox futuras + fire_automations
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

    -- Remove msgs futuras da outbox (D-1 + D-zero com datas antigas)
    DELETE FROM public.wa_outbox
    WHERE appt_ref = v_pending.payload->>'appointment_id'
      AND status = 'queued'
      AND scheduled_at > now();

    -- Re-fire automations pra regerar D-1 + D-zero com datas novas
    -- (nao dispara confirmacao inicial outra vez — fire_automations respeita on_status=agendado,
    --  que ja existe como historico; mas como agendamento continua 'agendado' vai disparar de novo.
    --  Solucao: marcar origem 'mira_reschedule' pra fire_automations detectar se quiser. Por ora,
    --  o user recebera uma nova confirmacao + novos lembretes — que e o comportamento correto de reschedule.)
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
-- wa_pro_handle_message — preserva TUDO da 20260667 (multi-turn,
-- markdown toggle, _save_context) + adiciona os novos write intents.
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_handle_message(
  p_phone text,
  p_text  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_clinic_id  uuid;
  v_prof_id    uuid;
  v_prof_name  text;
  v_scope      text;
  v_perms      jsonb;
  v_wa_id      uuid;
  v_text       text;
  v_intent     text;
  v_response   text;
  v_auth       jsonb;
  v_rl         jsonb;
  v_elapsed    int;
  v_area       text;
  v_markdown   boolean;
  v_context    record;
  v_resolved   jsonb;
  v_rewritten  text;
  v_patient_data jsonb;
  v_options_to_save jsonb;
  v_entity_id  text;
  v_entity_name text;
  v_ref_num    int;
  v_ref_opts   jsonb;
  v_ctx_intent text;
  v_ctx_phone  text;
  v_ctx_resolved boolean := false;
BEGIN
  -- Sanitize
  v_text := TRIM(COALESCE(p_text, ''));
  IF LENGTH(v_text) > 500 THEN v_text := LEFT(v_text, 500); END IF;
  v_text := REGEXP_REPLACE(v_text, '[\u0000-\u001f\u007f]', '', 'g');

  IF v_text = '' THEN
    RETURN jsonb_build_object('ok', false, 'response', '🤔 Mensagem vazia.', 'intent', 'empty');
  END IF;

  -- Auth
  v_auth := wa_pro_authenticate(p_phone);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false,
      'response', '🚫 Numero nao autorizado. Peca ao admin pra cadastrar.',
      'intent', 'unauthorized');
  END IF;

  v_clinic_id := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_prof_name := v_auth->>'name';
  v_scope     := v_auth->>'access_scope';
  v_perms     := v_auth->'permissions';
  v_wa_id     := (v_auth->>'wa_number_id')::uuid;
  v_markdown  := COALESCE((v_perms->>'markdown')::boolean, true);

  -- Rate limit
  v_rl := wa_pro_check_rate_limit(v_prof_id);
  IF NOT (v_rl->>'ok')::boolean THEN
    IF v_rl->>'reason' = 'rate_limit_minute' THEN
      RETURN jsonb_build_object('ok', false,
        'response', '⏱️ Voce esta mandando muito rapido. Respira e tenta em 1 minuto.',
        'intent', 'rate_limited_minute');
    END IF;
    RETURN jsonb_build_object('ok', false,
      'response', '⛔ Voce atingiu o limite de ' || (v_rl->>'max') || ' queries hoje.',
      'intent', 'rate_limited');
  END IF;

  -- 🧠 MULTI-TURN: carrega context (ttl 10min)
  SELECT * INTO v_context FROM public.wa_pro_context
  WHERE phone = p_phone AND expires_at > now()
  LIMIT 1;

  -- Se texto eh uma referencia e ultimo intent esperava desambiguacao
  -- (SELECT campos individuais — record PG nao propaga nullable corretamente)
  SELECT phone, last_intent, last_entity_options
  INTO v_ctx_phone, v_ctx_intent, v_ref_opts
  FROM wa_pro_context WHERE phone = p_phone AND expires_at > now() LIMIT 1;

  IF v_ctx_phone IS NOT NULL AND v_ctx_intent = 'patient_balance_disambig' THEN

    IF v_ref_opts IS NOT NULL THEN
      IF v_text ~* '^\s*[0-9]+\.?\s*$' THEN
        v_ref_num := (REGEXP_REPLACE(v_text, '[^0-9]', '', 'g'))::int;
        IF v_ref_num >= 1 AND v_ref_num <= jsonb_array_length(v_ref_opts) THEN
          v_resolved := v_ref_opts -> (v_ref_num - 1);
        END IF;
      ELSIF v_text ~* '(primeir[oa])' AND jsonb_array_length(v_ref_opts) >= 1 THEN
        v_resolved := v_ref_opts -> 0;
      ELSIF v_text ~* '(segund[oa])' AND jsonb_array_length(v_ref_opts) >= 2 THEN
        v_resolved := v_ref_opts -> 1;
      ELSIF v_text ~* '(terceir[oa])' AND jsonb_array_length(v_ref_opts) >= 3 THEN
        v_resolved := v_ref_opts -> 2;
      END IF;
    END IF;

    IF v_resolved IS NOT NULL THEN
      v_patient_data := wa_pro_patient_balance(p_phone, v_resolved->>'name', v_resolved->>'id');
      v_response := _fmt_patient_balance(v_patient_data);
      v_intent := 'patient_balance';
      v_entity_id := v_resolved->>'id';
      v_entity_name := v_resolved->>'name';
      v_ctx_resolved := true;
    END IF;
  END IF;

  -- Se contexto anterior era awaiting_patient_registration,
  -- trata a mensagem como dados de cadastro
  IF NOT v_ctx_resolved AND v_ctx_phone IS NOT NULL
     AND v_ctx_intent = 'awaiting_patient_registration' THEN
    DECLARE v_reg_result jsonb;
    BEGIN
      v_reg_result := wa_pro_stage_register_and_schedule(p_phone, v_text);
      v_response := COALESCE(v_reg_result->>'response', '⚠️ ' || COALESCE(v_reg_result->>'error', 'erro'));
      v_intent := CASE WHEN (v_reg_result->>'ok')::boolean THEN 'register_patient' ELSE 'register_patient_error' END;
      v_ctx_resolved := true;
    END;
  END IF;

  -- Multi-turn: cancel/reschedule disambig ("1", "2", "primeira")
  IF NOT v_ctx_resolved AND v_ctx_phone IS NOT NULL
     AND v_ctx_intent IN ('cancel_disambig', 'reschedule_disambig') THEN
    DECLARE
      v_disambig_opts jsonb;
      v_disambig_num int;
      v_disambig_item jsonb;
      v_disambig_result jsonb;
    BEGIN
      SELECT last_entity_options INTO v_disambig_opts
      FROM wa_pro_context WHERE phone = p_phone LIMIT 1;

      -- Resolve items (cancel_disambig tem array direto, reschedule tem {items, new_date, new_time})
      DECLARE v_items jsonb;
      BEGIN
        IF jsonb_typeof(v_disambig_opts) = 'array' THEN
          v_items := v_disambig_opts;
        ELSE
          v_items := v_disambig_opts->'items';
        END IF;

        IF v_items IS NOT NULL AND v_text ~* '^\s*[0-9]+\.?\s*$' THEN
          v_disambig_num := (REGEXP_REPLACE(v_text, '[^0-9]', '', 'g'))::int;
          IF v_disambig_num >= 1 AND v_disambig_num <= jsonb_array_length(v_items) THEN
            v_disambig_item := v_items -> (v_disambig_num - 1);
          END IF;
        ELSIF v_items IS NOT NULL AND v_text ~* '(primeir[oa])' AND jsonb_array_length(v_items) >= 1 THEN
          v_disambig_item := v_items -> 0;
        ELSIF v_items IS NOT NULL AND v_text ~* '(segund[oa])' AND jsonb_array_length(v_items) >= 2 THEN
          v_disambig_item := v_items -> 1;
        ELSIF v_items IS NOT NULL AND v_text ~* '(terceir[oa])' AND jsonb_array_length(v_items) >= 3 THEN
          v_disambig_item := v_items -> 2;
        END IF;

        IF v_disambig_item IS NOT NULL THEN
          IF v_ctx_intent = 'cancel_disambig' THEN
            -- Stage cancel direto com o appointment escolhido
            v_disambig_result := wa_pro_stage_cancel_appointment(p_phone,
              'cancela ' || (v_disambig_item->>'patient_name') || ' ' ||
              TO_CHAR((v_disambig_item->>'scheduled_date')::date, 'DD/MM'));
          ELSE
            -- Reschedule: usa new_date/new_time do context
            v_disambig_result := wa_pro_stage_reschedule_appointment(p_phone,
              'reagenda ' || (v_disambig_item->>'patient_name') || ' pra ' ||
              TO_CHAR((v_disambig_opts->>'new_date')::date, 'DD/MM') || ' ' ||
              (v_disambig_opts->>'new_time'));
          END IF;
          v_response := COALESCE(v_disambig_result->>'response', '⚠️ erro');
          v_intent := CASE v_ctx_intent WHEN 'cancel_disambig' THEN 'cancel_appointment' ELSE 'reschedule_appointment' END;
          v_ctx_resolved := true;
        END IF;
      END;
    END;
  END IF;

  -- Cadastro avulso (sem agendamento)
  IF NOT v_ctx_resolved AND v_ctx_phone IS NOT NULL
     AND v_ctx_intent = 'awaiting_patient_registration_only' THEN
    DECLARE v_reg_result jsonb;
    BEGIN
      v_reg_result := wa_pro_stage_register_only(p_phone, v_text);
      v_response := COALESCE(v_reg_result->>'response', '⚠️ ' || COALESCE(v_reg_result->>'error', 'erro'));
      v_intent := CASE WHEN (v_reg_result->>'ok')::boolean THEN 'register_patient' ELSE 'register_patient_error' END;
      v_ctx_resolved := true;
    END;
  END IF;

  IF NOT v_ctx_resolved THEN
  -- Intent parse (ordem importa!)
  v_intent := CASE
    WHEN v_text ~* '^\s*(/?ajuda|/?help|comandos|menu|opcoes|opções)\s*$'                                    THEN 'help'
    WHEN v_text ~* '^\s*(oi|ola|olá|bom dia|boa tarde|boa noite|hey|hello|e ai)\s*[!?.]*\s*$'               THEN 'greeting'

    -- Confirmacao/negacao curtas (2-step com pending)
    WHEN v_text ~* '^\s*(sim|ok|confirma|confirmar|confirmado|pode|pode ser|isso|isso mesmo|yes|👍|ja)\s*[!?.]*\s*$' THEN 'confirm_pending'
    WHEN v_text ~* '^\s*(n|nao|não|negativo|aborta|esquece|deixa|deixa pra la|deixa pra lá)\s*[!?.]*\s*$' THEN 'cancel_pending'

    -- Write: cadastro avulso (sem agendamento)
    WHEN v_text ~* '(cadastr|novo\s+paciente|nova\s+paciente|registr)' THEN 'register_patient_start'

    -- Write: verbo + objeto
    WHEN v_text ~* '^\s*(cancela|cancelar|desmarca|desmarcar|remove\s+a|remover\s+a|tira|tirar)\s+\S' THEN 'cancel_appointment'
    WHEN v_text ~* '^\s*(reagenda|reagendar|remarca|remarcar|remarque|muda|mudar|mover|move)\s+\S' THEN 'reschedule_appointment'
    WHEN v_text ~* '^\s*(marca|marcar|agendar|criar consulta|criar appointment|nova consulta|novo agendamento|agendar\s+uma?\s+(paciente|consulta))\s*[,.]?\s*\S' THEN 'create_appointment'

    -- WOW features (antes dos reads pra nao ser mascarado)
    WHEN v_text ~* '(como\s+foi|resumo|relatorio).*(dia|hoje)|meu\s+dia' THEN 'day_summary'
    WHEN v_text ~* '(proximo|próximo)\s+(paciente|consulta|atendimento)|quem\s+.*(proximo|próximo)' THEN 'next_patient'
    WHEN v_text ~* '(quem\s+fez|pacientes?\s+de|fizeram)\s+\w' THEN 'patients_by_procedure'
    WHEN v_text ~* '(devedores|quem\s+me\s+deve[^n])' THEN 'debtors'
    WHEN v_text ~* '(uso\s+da\s+mira|consumo|quanto\s+gastei\s+de\s+voz|dashboard\s+mira)' THEN 'mira_usage'
    WHEN v_text ~* '(liga|ligar|chamar|telefonar|whatsapp)\s+(pra|para|pro|a|o|da|do)?\s*[a-zA-ZÀ-ú]' THEN 'call_patient'

    -- Reads
    WHEN v_text ~* '(agenda|horario|atendimento).*(hoje|do dia)|tenho hoje|tenho agenda hoje|quem.*hoje' THEN 'agenda_today'
    WHEN v_text ~* '(agenda|horario|atendimento).*(amanha|amanhã)|tenho amanha|tenho amanhã' THEN 'agenda_tomorrow'
    WHEN v_text ~* '(agenda|horario).*(semana|esta semana)|minha semana' THEN 'agenda_week'
    WHEN v_text ~* '(horario|horarios).*(livre|livres|disponivel|disponiveis|vazio)|tem horario|esta livre' THEN 'agenda_free'
    WHEN v_text ~* '(quem|quais)\s+(me\s+)?(fez|fizeram|pag\w*).*(hoje|semana|mes|mês)|pagamentos?|quem\s+me\s+pag\w+' THEN 'payments_list'
    WHEN v_text ~* '(faturei|faturamento|receita|fatura|recebi).*(hoje|semana|mes|mês)|receita.*(semana|mes|mês|hoje)' THEN 'finance_revenue'
    WHEN v_text ~* '(minha\s+)?(comissao|comissão)|quanto\s+ganhei' THEN 'finance_commission'
    WHEN v_text ~* '(quanto\s+(a\s+|o\s+)?[a-zA-Z]+\s+(me\s+)?deve|saldo\s+(do|da|de)\s+[a-zA-Z]+|devendo\s+[a-zA-Z]+)' THEN 'patient_balance'
    WHEN v_text ~* '(paciente|cliente|quem\s+(e|é|eh))\s+[a-zA-Z]+' THEN 'patient_lookup'
    WHEN v_text ~* '^\s*(minha\s+)?quota\s*$' THEN 'quota'

    ELSE 'unknown'
  END;

  -- Permissao por area (writes tambem exigem 'agenda')
  v_area := CASE v_intent
    WHEN 'agenda_today'           THEN 'agenda'
    WHEN 'agenda_tomorrow'        THEN 'agenda'
    WHEN 'agenda_week'            THEN 'agenda'
    WHEN 'agenda_free'            THEN 'agenda'
    WHEN 'create_appointment'     THEN 'agenda'
    WHEN 'cancel_appointment'     THEN 'agenda'
    WHEN 'reschedule_appointment' THEN 'agenda'
    WHEN 'register_patient_start'  THEN 'pacientes'
    WHEN 'patient_lookup'         THEN 'pacientes'
    WHEN 'patient_balance'        THEN 'pacientes'
    WHEN 'finance_revenue'        THEN 'financeiro'
    WHEN 'finance_commission'     THEN 'financeiro'
    WHEN 'payments_list'          THEN 'financeiro'
    ELSE NULL
  END;

  IF v_area IS NOT NULL AND v_perms IS NOT NULL
     AND (v_perms->>v_area)::boolean IS NOT DISTINCT FROM false THEN
    v_response := '🔒 Voce nao tem permissao para consultar ' || v_area;
    v_intent := 'no_permission';
  ELSE
    v_response := wa_pro_execute_and_format(v_intent, v_text, p_phone, v_prof_name);
  END IF;
  END IF; -- NOT v_ctx_resolved

  IF NOT v_markdown THEN
    v_response := _strip_markdown(v_response);
  END IF;

  -- 🧠 Salva context enriquecido
  v_options_to_save := NULL;

  -- Se stage_create_appointment salvou awaiting_patient_registration,
  -- preserva esse contexto (nao sobrescreve)
  IF v_intent IN ('create_appointment', 'register_patient_start', 'cancel_appointment', 'reschedule_appointment') THEN
    SELECT last_intent INTO v_ctx_intent
    FROM wa_pro_context WHERE phone = p_phone LIMIT 1;
    IF v_ctx_intent IN ('awaiting_patient_registration', 'awaiting_patient_registration_only',
                        'cancel_disambig', 'reschedule_disambig') THEN
      -- Stage ja salvou o contexto certo, nao sobrescrever
      NULL;
    ELSE
      PERFORM _save_context(
        p_phone, v_clinic_id, v_prof_id, v_intent, v_text,
        'patient', v_entity_id, v_entity_name, NULL
      );
    END IF;
  ELSIF v_intent = 'patient_balance' AND NOT v_ctx_resolved THEN
    v_patient_data := wa_pro_patient_balance(p_phone,
      TRIM(REGEXP_REPLACE(v_text, '[[:<:]](quem|e|é|paciente|cliente|telefone|contato|whats|whatsapp|de|do|da|quanto|saldo|deve|devendo|me|a|o|esta|está|eh)[[:>:]]', ' ', 'gi'))
    );
    IF (v_patient_data->>'multiple_matches')::boolean IS TRUE THEN
      v_options_to_save := v_patient_data->'matches';
      v_intent := 'patient_balance_disambig';
    ELSIF v_patient_data->'patient' IS NOT NULL THEN
      v_entity_id := v_patient_data->'patient'->>'id';
      v_entity_name := v_patient_data->'patient'->>'name';
    END IF;
    PERFORM _save_context(
      p_phone, v_clinic_id, v_prof_id, v_intent, v_text,
      'patient', v_entity_id, v_entity_name, v_options_to_save
    );
  ELSE
    PERFORM _save_context(
      p_phone, v_clinic_id, v_prof_id, v_intent, v_text,
      'patient', v_entity_id, v_entity_name, NULL
    );
  END IF;

  v_elapsed := EXTRACT(epoch FROM (clock_timestamp() - v_started_at))::int * 1000;

  INSERT INTO public.wa_pro_audit_log (
    clinic_id, professional_id, phone, query, intent,
    result_summary, success, response_ms
  ) VALUES (
    v_clinic_id, v_prof_id, p_phone, v_text, v_intent,
    LEFT(v_response, 500),
    v_intent NOT IN ('unauthorized','rate_limited','unknown','empty','no_permission'),
    v_elapsed
  );

  RETURN jsonb_build_object(
    'ok',          true,
    'response',    v_response,
    'intent',      v_intent,
    'professional', v_prof_name,
    'elapsed_ms',  v_elapsed,
    'markdown',    v_markdown,
    'has_context', v_context.phone IS NOT NULL,
    'resolved_from_context', v_ctx_resolved,
    'quota', jsonb_build_object(
      'used', (v_rl->>'count')::int,
      'max',  (v_rl->>'max')::int
    )
  );
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.wa_pro_handle_message(text, text) TO authenticated, anon;


-- ============================================================
-- wa_pro_execute_and_format — roteia os 5 write intents
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_execute_and_format(
  p_intent    text,
  p_text      text,
  p_phone     text,
  p_prof_name text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_data   jsonb;
  v_first_name text := SPLIT_PART(COALESCE(p_prof_name, 'Doutor(a)'), ' ', 1);
  v_start  date;
  v_end    date;
  v_period_label text;
  v_patient_q text;
BEGIN
  IF p_intent = 'help' THEN
    RETURN 'Oi ' || v_first_name || E'! 👋 Sou a Mira.\n\n' ||
           E'📅 *Agenda*\n' ||
           E'• "tenho agenda hoje?"\n' ||
           E'• "tenho amanha?"\n' ||
           E'• "tem horario livre?"\n' ||
           E'• "qual meu proximo paciente?"\n\n' ||
           E'📋 *Pacientes*\n' ||
           E'• "quem e Maria Silva?"\n' ||
           E'• "quanto a Maria me deve?"\n' ||
           E'• "quem fez botox esse mes?"\n' ||
           E'• "quem me deve mais de 500?"\n\n' ||
           E'💰 *Financeiro*\n' ||
           E'• "quanto faturei essa semana?"\n' ||
           E'• "minha comissao do mes"\n' ||
           E'• "quem me pagou essa semana?"\n' ||
           E'• "como foi meu dia?"\n\n' ||
           E'✏️ *Agendar / Cancelar / Reagendar*\n' ||
           E'• "marca a Maria amanha 14h"\n' ||
           E'• "cancela a Maria amanha"\n' ||
           E'• "reagenda a Maria pra terca 15h"\n' ||
           E'• "cadastrar novo paciente"\n\n' ||
           E'🎙️ _Funciona por texto e por voz!_\n' ||
           E'📊 "uso da mira" — ver consumo';
  END IF;

  IF p_intent = 'greeting' THEN
    RETURN 'Oi ' || v_first_name || '! Sou a Mira, sua assistente. Diga */ajuda* pra ver o que posso fazer.';
  END IF;

  IF p_intent = 'quota' THEN
    v_data := wa_pro_my_quota(p_phone);
    RETURN E'📊 *Sua quota hoje*\n─────────────\n' ||
           'Usadas: *' || (v_data->>'day_used') || '/' || (v_data->>'day_max') || E'*\n' ||
           'Restantes: ' || (v_data->>'day_remaining') || E'\n' ||
           'Ultimos 60s: ' || COALESCE(v_data->>'minute_used', '0') || '/10';
  END IF;

  -- ═══════ WRITE INTENTS ═══════
  IF p_intent = 'create_appointment' THEN
    v_data := wa_pro_stage_create_appointment(p_phone, p_text);
    RETURN COALESCE(v_data->>'response', v_data->>'preview',
      '⚠️ ' || COALESCE(v_data->>'error', 'erro'));
  END IF;

  IF p_intent = 'register_patient_start' THEN
    -- Salva contexto pra receber dados no proximo turno (sem date/time)
    PERFORM _save_context(
      p_phone,
      COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid),
      (wa_pro_resolve_phone(p_phone)->>'professional_id')::uuid,
      'awaiting_patient_registration_only', p_text,
      'patient', NULL, NULL,
      jsonb_build_object('standalone', true)
    );
    RETURN '📋 Pra cadastrar, me manda os dados:' || E'\n' ||
           '*Nome completo, CPF, Telefone e Sexo*' || E'\n\n' ||
           '_Ex: Joao da Silva Pereira, 123.456.789-00, 44999887766, masculino_';
  END IF;

  IF p_intent = 'cancel_appointment' THEN
    v_data := wa_pro_stage_cancel_appointment(p_phone, p_text);
    RETURN COALESCE(v_data->>'response', '⚠️ ' || COALESCE(v_data->>'error', 'erro'));
  END IF;

  IF p_intent = 'reschedule_appointment' THEN
    v_data := wa_pro_stage_reschedule_appointment(p_phone, p_text);
    RETURN COALESCE(v_data->>'response', '⚠️ ' || COALESCE(v_data->>'error', 'erro'));
  END IF;

  IF p_intent = 'confirm_pending' THEN
    v_data := wa_pro_confirm_pending(p_phone);
    RETURN COALESCE(v_data->>'response', '⚠️ ' || COALESCE(v_data->>'error', 'erro'));
  END IF;

  IF p_intent = 'cancel_pending' THEN
    v_data := wa_pro_cancel_pending(p_phone);
    RETURN COALESCE(v_data->>'response', '❌ Cancelado.');
  END IF;

  -- ═══════ WOW FEATURES ═══════
  IF p_intent = 'day_summary' THEN
    v_data := wa_pro_day_summary(p_phone);
    RETURN _fmt_day_summary(v_data);
  END IF;

  IF p_intent = 'next_patient' THEN
    v_data := wa_pro_next_patient(p_phone);
    RETURN _fmt_next_patient(v_data);
  END IF;

  IF p_intent = 'patients_by_procedure' THEN
    -- Extrai nome do procedimento do texto
    DECLARE v_proc_q text;
    BEGIN
      v_proc_q := TRIM(REGEXP_REPLACE(p_text,
        '[[:<:]](quem|fez|fizeram|pacientes?|de|do|da|esse|esta|este|nesse|neste|nesta|mes|mês|semana|hoje|faz)[[:>:]]',
        '', 'gi'));
      v_proc_q := TRIM(REGEXP_REPLACE(v_proc_q, '[?!.]+', '', 'g'));
      IF LENGTH(v_proc_q) < 2 THEN v_proc_q := 'consulta'; END IF;
      v_data := wa_pro_patients_by_procedure(p_phone, v_proc_q);
      RETURN _fmt_patients_by_procedure(v_data);
    END;
  END IF;

  IF p_intent = 'debtors' THEN
    -- Extrai valor minimo se mencionado ("quem me deve mais de 500")
    DECLARE v_min numeric := 0;
    BEGIN
      IF p_text ~ '([0-9]+)' THEN
        v_min := (REGEXP_MATCH(p_text, '([0-9]+)'))[1]::numeric;
      END IF;
      v_data := wa_pro_debtors(p_phone, v_min);
      RETURN _fmt_debtors(v_data);
    END;
  END IF;

  IF p_intent = 'mira_usage' THEN
    v_data := wa_pro_mira_usage(p_phone);
    RETURN _fmt_mira_usage(v_data);
  END IF;

  IF p_intent = 'call_patient' THEN
    -- Extrai nome do paciente
    DECLARE
      v_call_name text;
      v_call_data jsonb;
      v_call_phone text;
    BEGIN
      v_call_name := TRIM(REGEXP_REPLACE(p_text,
        '[[:<:]](liga|ligar|chamar|telefonar|whatsapp|pra|para|pro|a|o|da|do|no|na)[[:>:]]',
        '', 'gi'));
      v_call_name := TRIM(REGEXP_REPLACE(v_call_name, '[?!.]+', '', 'g'));
      IF LENGTH(v_call_name) < 2 THEN
        RETURN '🔍 Qual paciente? Ex: "liga pra Maria"';
      END IF;
      v_call_data := wa_pro_patient_search(p_phone, v_call_name, 1);
      IF jsonb_array_length(COALESCE(v_call_data->'results', '[]'::jsonb)) = 0 THEN
        RETURN '🔍 Paciente "' || v_call_name || '" nao encontrado.';
      END IF;
      v_call_phone := v_call_data->'results'->0->>'phone';
      IF v_call_phone IS NULL OR LENGTH(v_call_phone) < 10 THEN
        RETURN '⚠️ *' || (v_call_data->'results'->0->>'name') || '* nao tem telefone cadastrado.';
      END IF;
      -- Gera link wa.me clicavel
      RETURN '📞 *' || (v_call_data->'results'->0->>'name') || E'*\n' ||
             'Tel: ' || v_call_phone || E'\n\n' ||
             '👉 https://wa.me/' || REGEXP_REPLACE(v_call_phone, '[^0-9]', '', 'g');
    END;
  END IF;

  IF p_intent = 'unknown' THEN
    RETURN E'🤔 Nao entendi.\n\n' ||
           E'Exemplos:\n' ||
           E'• "tenho agenda hoje?"\n' ||
           E'• "marca a Maria amanha 14h"\n' ||
           E'• "cancela a Maria amanha"\n' ||
           E'• "reagenda a Maria pra terca 15h"\n\n' ||
           E'Digite */ajuda* pra lista completa.';
  END IF;

  -- Helpers de data pra leituras
  IF p_text ~* '(hoje|do dia)' THEN
    v_start := CURRENT_DATE; v_end := CURRENT_DATE; v_period_label := 'hoje';
  ELSIF p_text ~* 'semana' THEN
    v_start := CURRENT_DATE - ((EXTRACT(dow FROM CURRENT_DATE)::int + 6) % 7);
    v_end   := v_start + 6;
    v_period_label := 'essa semana';
  ELSE
    v_start := date_trunc('month', CURRENT_DATE)::date;
    v_end   := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date;
    v_period_label := 'esse mes';
  END IF;

  -- AGENDA
  IF p_intent = 'agenda_today' THEN
    v_data := wa_pro_agenda(p_phone, CURRENT_DATE);
    RETURN _fmt_agenda(v_data, 'hoje');
  END IF;
  IF p_intent = 'agenda_tomorrow' THEN
    v_data := wa_pro_agenda(p_phone, CURRENT_DATE + 1);
    RETURN _fmt_agenda(v_data, 'amanha');
  END IF;
  IF p_intent = 'agenda_week' THEN
    v_data := wa_pro_agenda(p_phone, CURRENT_DATE);
    RETURN _fmt_agenda(v_data, 'hoje');
  END IF;
  IF p_intent = 'agenda_free' THEN
    v_data := wa_pro_agenda_free_slots(p_phone, CURRENT_DATE);
    RETURN _fmt_free_slots(v_data, 'hoje');
  END IF;

  -- PACIENTES
  v_patient_q := TRIM(REGEXP_REPLACE(p_text, '[[:<:]](quem|e|é|paciente|cliente|telefone|contato|whats|whatsapp|de|do|da|quanto|saldo|deve|devendo|me|a|o|esta|está|eh)[[:>:]]', ' ', 'gi'));
  v_patient_q := REGEXP_REPLACE(v_patient_q, '[?!.]+', '', 'g');
  v_patient_q := TRIM(REGEXP_REPLACE(v_patient_q, '\s+', ' ', 'g'));

  IF p_intent = 'patient_lookup' THEN
    IF LENGTH(v_patient_q) < 2 THEN
      RETURN '🔍 Diga o nome do paciente. Ex: "quem e Maria Silva?"';
    END IF;
    v_data := wa_pro_patient_search(p_phone, v_patient_q, 5);
    IF jsonb_array_length(COALESCE(v_data->'results', '[]'::jsonb)) = 0 THEN
      RETURN '🔍 Nenhum paciente encontrado para "' || v_patient_q || '".';
    END IF;
    -- Sempre mostra perfil completo do primeiro match
    DECLARE
      v_profile jsonb;
      v_result text;
      v_n int := jsonb_array_length(v_data->'results');
      v_other jsonb;
      v_i int := 0;
    BEGIN
      v_profile := wa_pro_patient_profile(p_phone, v_data->'results'->0->>'id');
      v_result := _fmt_patient_profile(v_profile);
      -- Se tem mais matches, lista os outros abaixo
      IF v_n > 1 THEN
        v_result := v_result || E'\n\n───\nTambem encontrei: ';
        FOR v_other IN SELECT * FROM jsonb_array_elements(v_data->'results') OFFSET 1 LOOP
          v_i := v_i + 1;
          IF v_i > 4 THEN EXIT; END IF;
          IF v_i > 1 THEN v_result := v_result || ', '; END IF;
          v_result := v_result || '*' || (v_other->>'name') || '*';
        END LOOP;
      END IF;
      RETURN v_result;
    END;
  END IF;

  IF p_intent = 'patient_balance' THEN
    IF LENGTH(v_patient_q) < 2 THEN
      RETURN '🔍 Diga o nome do paciente.';
    END IF;
    v_data := wa_pro_patient_balance(p_phone, v_patient_q);
    RETURN _fmt_patient_balance(v_data);
  END IF;

  -- FINANCEIRO
  IF p_intent = 'finance_revenue' THEN
    v_data := wa_pro_finance_summary(p_phone, v_start, v_end);
    RETURN _fmt_finance_summary(v_data, v_period_label);
  END IF;
  IF p_intent = 'finance_commission' THEN
    v_data := wa_pro_finance_commission(p_phone, v_start, v_end);
    RETURN _fmt_finance_commission(v_data, v_period_label);
  END IF;
  IF p_intent = 'payments_list' THEN
    v_data := wa_pro_recent_payments(p_phone, v_start, v_end);
    RETURN _fmt_payments_list(v_data, v_period_label);
  END IF;

  RETURN '🤔 Intent nao implementada: ' || p_intent;
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.wa_pro_execute_and_format(text, text, text, text) TO authenticated, anon;


COMMENT ON FUNCTION public.wa_pro_stage_cancel_appointment(text, text)
  IS 'Stage: cria preview de cancelamento (2-step com confirmacao)';
COMMENT ON FUNCTION public.wa_pro_stage_reschedule_appointment(text, text)
  IS 'Stage: cria preview de reagendamento (2-step com confirmacao)';
COMMENT ON FUNCTION public._find_target_appointments(uuid, text, uuid, text, date)
  IS 'Encontra appointments futuros do paciente respeitando access_scope';
