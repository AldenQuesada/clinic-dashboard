-- 🔥 Ações de escrita: criar appointment, marcar pago
--
-- Pattern: 2-step write com confirmação
-- 1. User diz "marca Maria amanha 14h"
-- 2. Mira extrai dados, cria preview em wa_pro_pending_actions, pede confirmação
-- 3. User diz "sim" ou "ok" → executa e responde
--
-- Security: nada é executado sem confirmação explicita.

CREATE TABLE IF NOT EXISTS public.wa_pro_pending_actions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  professional_id uuid NOT NULL,
  phone           text NOT NULL,
  action_type     text NOT NULL,   -- 'create_appointment' | 'mark_paid' | ...
  payload         jsonb NOT NULL,  -- dados parseados prontos pra execucao
  preview         text NOT NULL,   -- descricao humana do que vai rolar
  expires_at      timestamptz DEFAULT now() + interval '5 minutes',
  confirmed_at    timestamptz,
  executed_at     timestamptz,
  result          jsonb,
  created_at      timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_pro_pending_actions_phone_idx
  ON public.wa_pro_pending_actions (phone, expires_at)
  WHERE confirmed_at IS NULL;

ALTER TABLE public.wa_pro_pending_actions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_pro_pending_actions_service ON public.wa_pro_pending_actions;
CREATE POLICY wa_pro_pending_actions_service ON public.wa_pro_pending_actions
  FOR ALL TO authenticated
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');
REVOKE ALL ON public.wa_pro_pending_actions FROM anon;

-- ============================================================
-- Parser: extrai dados de "marca Maria amanha 14h"
-- ============================================================
CREATE OR REPLACE FUNCTION public._parse_create_appointment(p_text text)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_t       text := LOWER(COALESCE(p_text, ''));
  v_today   date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_date    date;
  v_hour    int := 9;
  v_minute  int := 0;
  v_name    text;
BEGIN
  -- Data
  IF v_t ~ '[[:<:]](hoje)[[:>:]]' THEN v_date := v_today;
  ELSIF v_t ~ '[[:<:]](amanha|amanhã)[[:>:]]' THEN v_date := v_today + 1;
  ELSIF v_t ~ 'depois de amanha' THEN v_date := v_today + 2;
  ELSIF v_t ~ '[[:<:]]segunda[[:>:]]' THEN v_date := v_today + ((1 - EXTRACT(dow FROM v_today)::int + 7) % 7 + (CASE WHEN EXTRACT(dow FROM v_today)::int = 1 THEN 7 ELSE 0 END))::int;
  ELSIF v_t ~ '[[:<:]](terca|terça)[[:>:]]' THEN v_date := v_today + ((2 - EXTRACT(dow FROM v_today)::int + 7) % 7 + (CASE WHEN EXTRACT(dow FROM v_today)::int = 2 THEN 7 ELSE 0 END))::int;
  ELSIF v_t ~ '[[:<:]]quarta[[:>:]]' THEN v_date := v_today + ((3 - EXTRACT(dow FROM v_today)::int + 7) % 7 + (CASE WHEN EXTRACT(dow FROM v_today)::int = 3 THEN 7 ELSE 0 END))::int;
  ELSIF v_t ~ '[[:<:]]quinta[[:>:]]' THEN v_date := v_today + ((4 - EXTRACT(dow FROM v_today)::int + 7) % 7 + (CASE WHEN EXTRACT(dow FROM v_today)::int = 4 THEN 7 ELSE 0 END))::int;
  ELSIF v_t ~ '[[:<:]]sexta[[:>:]]' THEN v_date := v_today + ((5 - EXTRACT(dow FROM v_today)::int + 7) % 7 + (CASE WHEN EXTRACT(dow FROM v_today)::int = 5 THEN 7 ELSE 0 END))::int;
  ELSIF v_t ~ '([0-9]{1,2})/([0-9]{1,2})' THEN
    v_date := MAKE_DATE(
      EXTRACT(year FROM v_today)::int,
      (REGEXP_MATCH(v_t, '([0-9]{1,2})/([0-9]{1,2})'))[2]::int,
      (REGEXP_MATCH(v_t, '([0-9]{1,2})/([0-9]{1,2})'))[1]::int
    );
  ELSIF v_t ~ '[[:<:]]dia\s+([0-9]{1,2})[[:>:]]' THEN
    -- "dia 17" → dia N do mes atual (ou proximo se ja passou)
    DECLARE v_day int := (REGEXP_MATCH(v_t, '[[:<:]]dia\s+([0-9]{1,2})[[:>:]]'))[1]::int;
    BEGIN
      v_date := MAKE_DATE(EXTRACT(year FROM v_today)::int, EXTRACT(month FROM v_today)::int, v_day);
      IF v_date < v_today THEN v_date := v_date + interval '1 month'; END IF;
    END;
  ELSE
    v_date := v_today + 1;  -- default: amanha
  END IF;

  -- Hora
  IF v_t ~ '([0-9]{1,2}):([0-9]{2})' THEN
    v_hour := (REGEXP_MATCH(v_t, '([0-9]{1,2}):([0-9]{2})'))[1]::int;
    v_minute := (REGEXP_MATCH(v_t, '([0-9]{1,2}):([0-9]{2})'))[2]::int;
  ELSIF v_t ~ '([0-9]{1,2})\s*h(oras?)?' THEN
    v_hour := (REGEXP_MATCH(v_t, '([0-9]{1,2})\s*h(oras?)?'))[1]::int;
  ELSIF v_t ~ '[[:<:]]manha[[:>:]]|de manha' THEN v_hour := 9;
  ELSIF v_t ~ '[[:<:]](tarde)[[:>:]]|a tarde' THEN v_hour := 14;
  ELSIF v_t ~ '[[:<:]](noite)[[:>:]]' THEN v_hour := 19;
  END IF;

  -- Nome: remove trigger + data + hora + preps
  v_name := REGEXP_REPLACE(v_t, '^(marca|marcar|agenda|agendar|criar consulta|criar appointment|nova consulta|novo agendamento)[\s:]+((uma?|a|o)\s+)?(paciente|consulta)?\s*(,\s*)?(a\s+|o\s+|da\s+|do\s+)?', '', 'i');
  v_name := REGEXP_REPLACE(v_name, '[[:<:]](hoje|amanha|amanhã|depois de amanha|segunda|terca|terça|quarta|quinta|sexta|sabado|sábado)[[:>:]]', '', 'gi');
  v_name := REGEXP_REPLACE(v_name, '[0-9]{1,2}\s*[:h]?(oras?)?\s*[0-9]{0,2}', '', 'g');
  v_name := REGEXP_REPLACE(v_name, '[[:<:]](pra|para|as|às|no|na|da|de|do|dia|de manha|a tarde|a noite)[[:>:]]', '', 'gi');
  v_name := REGEXP_REPLACE(v_name, '[,.;!?]', '', 'g');
  v_name := TRIM(REGEXP_REPLACE(v_name, '\s+', ' ', 'g'));
  IF LENGTH(v_name) > 0 THEN
    v_name := UPPER(SUBSTRING(v_name, 1, 1)) || SUBSTRING(v_name, 2);
  END IF;

  RETURN jsonb_build_object(
    'name', NULLIF(v_name, ''),
    'date', v_date,
    'time', LPAD(v_hour::text, 2, '0') || ':' || LPAD(v_minute::text, 2, '0')
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public._parse_create_appointment(text) TO authenticated, anon;

-- ============================================================
-- RPC: wa_pro_stage_create_appointment
-- Cria pending action, não executa
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
  IF jsonb_array_length(COALESCE(v_match_list->'results', '[]'::jsonb)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'patient_not_found',
      'response', '🔍 Paciente "' || v_name || '" nao encontrado.');
  END IF;

  -- Pega o primeiro match
  DECLARE
    v_patient_id text := v_match_list->'results'->0->>'id';
    v_patient_name text := v_match_list->'results'->0->>'name';
    v_conflict_name text;
  BEGIN
    -- Checa conflito de horario (qualquer profissional da clinica —
    -- agenda compartilhada, e quem manda msg pode nao ser o pro alvo)
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
-- RPC: wa_pro_confirm_pending (user disse "sim")
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_confirm_pending(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending   record;
  v_new_id    text;
  v_result    jsonb;
  v_end_time  text;
  v_patient   record;
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

    -- End time = start + 1h (default)
    v_end_time := LPAD((SPLIT_PART(v_pending.payload->>'time', ':', 1)::int + 1)::text, 2, '0') ||
                  ':' || SPLIT_PART(v_pending.payload->>'time', ':', 2);

    INSERT INTO public.appointments (
      id, clinic_id, patient_id, patient_name, professional_id,
      scheduled_date, start_time, end_time, procedure_name,
      status, origem
    ) VALUES (
      v_new_id,
      v_pending.clinic_id,
      (v_pending.payload->>'patient_id'),
      v_pending.payload->>'patient_name',
      v_pending.professional_id,
      (v_pending.payload->>'date')::date,
      (v_pending.payload->>'time')::time,
      v_end_time::time,
      'Consulta',
      'agendado',
      'mira'
    );

    UPDATE public.wa_pro_pending_actions
    SET confirmed_at = now(), executed_at = now(),
        result = jsonb_build_object('appointment_id', v_new_id)
    WHERE id = v_pending.id;

    RETURN jsonb_build_object(
      'ok', true,
      'appointment_id', v_new_id,
      'response', '✅ *Agendamento criado!*' || E'\n─────────────\n' ||
                  '*' || (v_pending.payload->>'patient_name') || '*' || E'\n' ||
                  '📆 ' || TO_CHAR((v_pending.payload->>'date')::date, 'DD/MM') || E'\n' ||
                  '⏰ ' || (v_pending.payload->>'time') || E'\n\n' ||
                  '_Ja esta na sua agenda._'
    );
  END IF;

  RETURN jsonb_build_object('ok', false, 'error', 'unknown_action_type');
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_confirm_pending(text) TO authenticated, anon;

-- ============================================================
-- RPC: wa_pro_cancel_pending
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_cancel_pending(p_phone text)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.wa_pro_pending_actions
  SET expires_at = now()
  WHERE phone = p_phone AND confirmed_at IS NULL AND expires_at > now();
  SELECT jsonb_build_object('ok', true, 'response', '❌ Cancelado. Nada foi alterado.');
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_cancel_pending(text) TO authenticated, anon;

COMMENT ON TABLE public.wa_pro_pending_actions IS '2-step write com confirmacao';
COMMENT ON FUNCTION public.wa_pro_stage_create_appointment(text, text) IS 'Stage: cria preview, pede confirmacao';
COMMENT ON FUNCTION public.wa_pro_confirm_pending(text) IS 'Execute: user confirmou, executa acao';
