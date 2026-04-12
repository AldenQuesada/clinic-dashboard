-- 🥉 Voice → Task infrastructure
--
-- Feature: Mira cria tasks quando profissional pede via WhatsApp (texto ou voz).
-- Exemplos:
--   "me lembra de ligar pra Pamela amanha de manha"
--   "criar task: comprar seringas"
--   "lembra de revisar orcamento da Maria sexta"
--
-- Time parsing via heuristica SQL (sem LLM). Coverage:
--   - "hoje a tarde" → hoje 14h
--   - "amanha" → amanha 9h
--   - "amanha de manha/tarde/noite" → horarios especificos
--   - "em N horas" / "em N dias"
--   - "sexta", "segunda", etc → proximo dia da semana
--   - fallback: +1 dia 9h

CREATE TABLE IF NOT EXISTS public.wa_pro_tasks (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  professional_id uuid NOT NULL,
  title           text NOT NULL,
  description     text,
  due_at          timestamptz NOT NULL,
  remind_at       timestamptz NOT NULL,
  created_at      timestamptz DEFAULT now(),
  done_at         timestamptz,
  done_by         uuid,
  dismissed_at    timestamptz,
  created_via     text DEFAULT 'text',  -- 'text' | 'voice' | 'dashboard'
  original_query  text,                  -- o texto original
  reminder_sent_at timestamptz,          -- quando o cron ja mandou o lembrete
  deleted_at      timestamptz
);

CREATE INDEX IF NOT EXISTS wa_pro_tasks_remind_idx
  ON public.wa_pro_tasks (remind_at)
  WHERE done_at IS NULL AND dismissed_at IS NULL AND deleted_at IS NULL AND reminder_sent_at IS NULL;

CREATE INDEX IF NOT EXISTS wa_pro_tasks_prof_idx
  ON public.wa_pro_tasks (professional_id, due_at DESC)
  WHERE deleted_at IS NULL;

ALTER TABLE public.wa_pro_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_pro_tasks_service ON public.wa_pro_tasks;
CREATE POLICY wa_pro_tasks_service ON public.wa_pro_tasks
  FOR ALL TO authenticated
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');
REVOKE ALL ON public.wa_pro_tasks FROM anon;

-- ============================================================
-- Time parser heuristico (sem LLM)
-- ============================================================
CREATE OR REPLACE FUNCTION public._parse_task_time(p_text text, p_now timestamptz DEFAULT NULL)
RETURNS timestamptz
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_now   timestamptz := COALESCE(p_now, now() AT TIME ZONE 'America/Sao_Paulo' AT TIME ZONE 'America/Sao_Paulo');
  v_text  text := LOWER(COALESCE(p_text, ''));
  v_num   int;
  v_today date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_base  date := v_today;
  v_hour  int;
  v_minute int := 0;
  v_period text;  -- 'manha' | 'tarde' | 'noite'
  v_days_ahead int := 0;
BEGIN
  -- Detecta dia base
  IF v_text ~ 'hoje' THEN
    v_base := v_today;
  ELSIF v_text ~ '(amanha|amanhã)' THEN
    v_base := v_today + 1;
  ELSIF v_text ~ 'depois de amanha|depois de amanhã' THEN
    v_base := v_today + 2;
  ELSIF v_text ~ 'em ([0-9]+) dias?' THEN
    v_num := (REGEXP_MATCH(v_text, 'em ([0-9]+) dias?'))[1]::int;
    v_base := v_today + v_num;
  ELSIF v_text ~ 'em ([0-9]+) horas?' THEN
    v_num := (REGEXP_MATCH(v_text, 'em ([0-9]+) horas?'))[1]::int;
    RETURN v_now + (v_num || ' hours')::interval;
  ELSIF v_text ~ 'em ([0-9]+) minutos?' THEN
    v_num := (REGEXP_MATCH(v_text, 'em ([0-9]+) minutos?'))[1]::int;
    RETURN v_now + (v_num || ' minutes')::interval;
  ELSIF v_text ~ 'segunda' THEN
    v_days_ahead := (1 - EXTRACT(dow FROM v_today)::int + 7) % 7;
    IF v_days_ahead = 0 THEN v_days_ahead := 7; END IF;
    v_base := v_today + v_days_ahead;
  ELSIF v_text ~ 'terca|terça' THEN
    v_days_ahead := (2 - EXTRACT(dow FROM v_today)::int + 7) % 7;
    IF v_days_ahead = 0 THEN v_days_ahead := 7; END IF;
    v_base := v_today + v_days_ahead;
  ELSIF v_text ~ 'quarta' THEN
    v_days_ahead := (3 - EXTRACT(dow FROM v_today)::int + 7) % 7;
    IF v_days_ahead = 0 THEN v_days_ahead := 7; END IF;
    v_base := v_today + v_days_ahead;
  ELSIF v_text ~ 'quinta' THEN
    v_days_ahead := (4 - EXTRACT(dow FROM v_today)::int + 7) % 7;
    IF v_days_ahead = 0 THEN v_days_ahead := 7; END IF;
    v_base := v_today + v_days_ahead;
  ELSIF v_text ~ 'sexta' THEN
    v_days_ahead := (5 - EXTRACT(dow FROM v_today)::int + 7) % 7;
    IF v_days_ahead = 0 THEN v_days_ahead := 7; END IF;
    v_base := v_today + v_days_ahead;
  ELSIF v_text ~ 'sabado|sábado' THEN
    v_days_ahead := (6 - EXTRACT(dow FROM v_today)::int + 7) % 7;
    IF v_days_ahead = 0 THEN v_days_ahead := 7; END IF;
    v_base := v_today + v_days_ahead;
  ELSE
    v_base := v_today + 1;  -- default: amanha
  END IF;

  -- Detecta periodo do dia
  IF v_text ~ '([0-9]{1,2}):([0-9]{2})' THEN
    v_hour := (REGEXP_MATCH(v_text, '([0-9]{1,2}):([0-9]{2})'))[1]::int;
    v_minute := (REGEXP_MATCH(v_text, '([0-9]{1,2}):([0-9]{2})'))[2]::int;
  ELSIF v_text ~ '([0-9]{1,2})h' THEN
    v_hour := (REGEXP_MATCH(v_text, '([0-9]{1,2})h'))[1]::int;
  ELSIF v_text ~ 'de manha|de manhã|pela manha|pela manhã|cedo' THEN
    v_hour := 9;
  ELSIF v_text ~ 'de tarde|a tarde|à tarde|a tarde' THEN
    v_hour := 14;
  ELSIF v_text ~ 'de noite|a noite|à noite|de noite' THEN
    v_hour := 19;
  ELSIF v_text ~ 'meio dia|meio-dia' THEN
    v_hour := 12;
  ELSE
    v_hour := 9;  -- default: 9h manha
  END IF;

  RETURN (v_base + (v_hour || ' hours ' || v_minute || ' minutes')::interval)::timestamp
         AT TIME ZONE 'America/Sao_Paulo';
END;
$$;

GRANT EXECUTE ON FUNCTION public._parse_task_time(text, timestamptz) TO authenticated, anon;

-- ============================================================
-- Task title extractor (remove time phrases + keep content)
-- ============================================================
CREATE OR REPLACE FUNCTION public._extract_task_title(p_text text)
RETURNS text
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_t text := LOWER(COALESCE(p_text, ''));
BEGIN
  -- Remove trigger phrases
  v_t := REGEXP_REPLACE(v_t, '^(me\s+lembra|lembrar|lembrete|criar\s+task|criar\s+lembrete|task|nota|anota|pode\s+anotar)[\s:]+(de\s+|que\s+)?', '', 'i');
  v_t := REGEXP_REPLACE(v_t, '^(de\s+|que\s+)', '', 'i');

  -- Remove time phrases
  v_t := REGEXP_REPLACE(v_t, '\b(hoje|amanha|amanhã|depois de amanha|em [0-9]+ (horas?|dias?|minutos?))\b', '', 'gi');
  v_t := REGEXP_REPLACE(v_t, '\b(segunda|terca|terça|quarta|quinta|sexta|sabado|sábado)( feira)?\b', '', 'gi');
  v_t := REGEXP_REPLACE(v_t, '\b(de manha|de manhã|pela manha|pela manhã|de tarde|a tarde|à tarde|de noite|a noite|à noite|meio dia|meio-dia|cedo)\b', '', 'gi');
  v_t := REGEXP_REPLACE(v_t, '\b([0-9]{1,2}):([0-9]{2})|[0-9]{1,2}h[0-9]{0,2}\b', '', 'g');

  -- Clean whitespace + punctuation
  v_t := REGEXP_REPLACE(v_t, '[,.;!?]', '', 'g');
  v_t := REGEXP_REPLACE(v_t, '\s+', ' ', 'g');
  v_t := TRIM(v_t);

  -- Capitalize primeira letra
  IF LENGTH(v_t) > 0 THEN
    v_t := UPPER(SUBSTRING(v_t, 1, 1)) || SUBSTRING(v_t, 2);
  END IF;

  RETURN NULLIF(v_t, '');
END;
$$;

GRANT EXECUTE ON FUNCTION public._extract_task_title(text) TO authenticated, anon;

-- ============================================================
-- RPC: wa_pro_create_task
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_create_task(
  p_phone      text,
  p_query      text,
  p_created_via text DEFAULT 'text'
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
  v_title     text;
  v_due_at    timestamptz;
  v_task_id   uuid;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;

  v_title  := _extract_task_title(p_query);
  v_due_at := _parse_task_time(p_query);

  IF v_title IS NULL OR LENGTH(v_title) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'title_too_short', 'hint', 'Diga o que voce quer lembrar');
  END IF;

  INSERT INTO public.wa_pro_tasks (
    clinic_id, professional_id, title, due_at, remind_at,
    created_via, original_query
  ) VALUES (
    v_clinic_id, v_prof_id, v_title, v_due_at, v_due_at,
    p_created_via, p_query
  ) RETURNING id INTO v_task_id;

  RETURN jsonb_build_object(
    'ok', true,
    'task_id', v_task_id,
    'title', v_title,
    'due_at', v_due_at,
    'via', p_created_via
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_create_task(text, text, text) TO authenticated, anon;

-- ============================================================
-- RPC: wa_pro_list_tasks (pra helper e /tasks)
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_list_tasks(p_phone text, p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth jsonb := public.wa_pro_resolve_phone(p_phone);
  v_prof_id uuid;
  v_list jsonb;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_prof_id := (v_auth->>'professional_id')::uuid;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', t.id, 'title', t.title, 'due_at', t.due_at,
    'created_via', t.created_via, 'done', t.done_at IS NOT NULL
  ) ORDER BY t.due_at ASC), '[]'::jsonb)
  INTO v_list
  FROM public.wa_pro_tasks t
  WHERE t.professional_id = v_prof_id
    AND t.deleted_at IS NULL
    AND t.done_at IS NULL
    AND t.due_at > now()
  LIMIT p_limit;

  RETURN jsonb_build_object('ok', true, 'tasks', v_list);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_list_tasks(text, int) TO authenticated, anon;

-- ============================================================
-- RPC: wa_pro_pending_task_reminders (cron iterator)
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_pending_task_reminders()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'task_id', t.id,
    'phone', n.phone,
    'instance_id', n.instance_id,
    'title', t.title,
    'due_at', t.due_at
  )), '[]'::jsonb)
  FROM public.wa_pro_tasks t
  JOIN public.wa_numbers n ON n.professional_id = t.professional_id
    AND n.number_type = 'professional_private'
    AND n.is_active = true
  WHERE t.deleted_at IS NULL
    AND t.done_at IS NULL
    AND t.dismissed_at IS NULL
    AND t.reminder_sent_at IS NULL
    AND t.remind_at <= now() + interval '5 minutes'
    AND t.remind_at >= now() - interval '1 hour'
  LIMIT 50;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_pending_task_reminders() TO authenticated, anon;

-- ============================================================
-- RPC: wa_pro_mark_reminder_sent (idempotente)
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_mark_reminder_sent(p_task_id uuid)
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.wa_pro_tasks
  SET reminder_sent_at = now()
  WHERE id = p_task_id AND reminder_sent_at IS NULL
  RETURNING jsonb_build_object('ok', true, 'id', id);
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_mark_reminder_sent(uuid) TO authenticated, anon;

COMMENT ON TABLE public.wa_pro_tasks IS '🥉 Tasks criadas pela Mira via texto ou voz';
COMMENT ON FUNCTION public.wa_pro_create_task(text, text, text) IS 'Cria task com parse heuristico de titulo + tempo';
COMMENT ON FUNCTION public.wa_pro_pending_task_reminders() IS 'Lista tasks prontas pra lembrete (cron a cada 5min)';
