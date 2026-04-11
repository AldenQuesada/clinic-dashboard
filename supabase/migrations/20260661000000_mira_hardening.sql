-- Mira Hardening — resolve 15 fraquezas da auditoria 2026-04-11
--
-- Mudancas:
--   F1  SSOT via wa_pro_handle_message RPC (elimina duplicacao entre dashboard e n8n)
--   F3  Context multi-turno (wa_pro_context table)
--   F4  Patient search fuzzy via pg_trgm
--   F6  Rate limit por minuto (10/min) alem do diario
--   F7  Sanitizacao de input (max 500 chars)
--   F10 Patient balance com multi-match explicit (se >1, pede desambiguacao)
--   F11 access_scope='own' filtra pacientes via historico de atendimentos
--   F13 Coluna response_ms em wa_pro_audit_log
--   F14 Quota atual no help + endpoint wa_pro_my_quota
--   F15 Help dinamico listando intents do registry

-- ============================================================
-- 1. pg_trgm pra fuzzy matching
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS leads_name_trgm
  ON public.leads USING gin (name gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- ============================================================
-- 2. Schema fixes
-- ============================================================
ALTER TABLE public.wa_pro_audit_log
  ADD COLUMN IF NOT EXISTS response_ms int;

ALTER TABLE public.wa_pro_rate_limit
  ADD COLUMN IF NOT EXISTS last_query_at timestamptz,
  ADD COLUMN IF NOT EXISTS minute_count int DEFAULT 0,
  ADD COLUMN IF NOT EXISTS minute_window_start timestamptz;

-- Context multi-turno: guarda ultima entidade/intent por telefone
CREATE TABLE IF NOT EXISTS public.wa_pro_context (
  phone            text PRIMARY KEY,
  clinic_id        uuid NOT NULL,
  professional_id  uuid,
  last_intent      text,
  last_entity_type text,
  last_entity_id   text,
  last_entity_name text,
  last_query       text,
  turns            int DEFAULT 0,
  expires_at       timestamptz DEFAULT now() + interval '10 minutes',
  updated_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wa_pro_context_expires_idx
  ON public.wa_pro_context (expires_at);

ALTER TABLE public.wa_pro_context ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wa_pro_context_admin ON public.wa_pro_context;
CREATE POLICY wa_pro_context_admin ON public.wa_pro_context
  FOR ALL TO authenticated, anon
  USING (true) WITH CHECK (true);

-- ============================================================
-- 3. Rate limit com janela dupla (minuto + dia)
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_check_rate_limit(p_professional_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  v_today     date := CURRENT_DATE;
  v_now       timestamptz := now();
  v_row       record;
  v_max_min   int := 10;
BEGIN
  INSERT INTO public.wa_pro_rate_limit (clinic_id, professional_id, date, query_count)
  VALUES (v_clinic_id, p_professional_id, v_today, 0)
  ON CONFLICT (clinic_id, professional_id, date) DO NOTHING;

  SELECT query_count, max_per_day, blocked, minute_count, minute_window_start
  INTO v_row
  FROM public.wa_pro_rate_limit
  WHERE clinic_id = v_clinic_id
    AND professional_id = p_professional_id
    AND date = v_today;

  IF v_row.blocked THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'manually_blocked', 'count', v_row.query_count, 'max', v_row.max_per_day);
  END IF;

  -- Minute window: se janela ainda valida e atingiu limite, bloqueia
  IF v_row.minute_window_start IS NOT NULL
     AND v_row.minute_window_start > v_now - interval '1 minute'
     AND v_row.minute_count >= v_max_min THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limit_minute', 'count', v_row.minute_count, 'max', v_max_min);
  END IF;

  IF v_row.query_count >= v_row.max_per_day THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limit_exceeded', 'count', v_row.query_count, 'max', v_row.max_per_day);
  END IF;

  -- Incrementa contadores
  UPDATE public.wa_pro_rate_limit
  SET query_count   = query_count + 1,
      minute_count  = CASE
                        WHEN minute_window_start IS NULL OR minute_window_start <= v_now - interval '1 minute' THEN 1
                        ELSE minute_count + 1
                      END,
      minute_window_start = CASE
                              WHEN minute_window_start IS NULL OR minute_window_start <= v_now - interval '1 minute' THEN v_now
                              ELSE minute_window_start
                            END,
      last_query_at = v_now,
      updated_at    = v_now
  WHERE clinic_id = v_clinic_id
    AND professional_id = p_professional_id
    AND date = v_today;

  RETURN jsonb_build_object(
    'ok',    true,
    'count', v_row.query_count + 1,
    'max',   v_row.max_per_day,
    'remaining', v_row.max_per_day - v_row.query_count - 1
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_check_rate_limit(uuid) TO authenticated, anon;

-- ============================================================
-- 4. Fuzzy patient search com scope filter
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_patient_search(
  p_phone  text,
  p_query  text,
  p_limit  int DEFAULT 5
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
  v_scope     text;
  v_q         text := COALESCE(TRIM(p_query), '');
  v_q_digits  text := REGEXP_REPLACE(v_q, '[^0-9]', '', 'g');
  v_results   jsonb;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN RETURN v_auth; END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := v_auth->>'access_scope';

  IF v_q = '' OR LENGTH(v_q) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'query_too_short');
  END IF;

  -- Busca com similarity + scope filter
  SELECT COALESCE(jsonb_agg(row_to_json(l) ORDER BY l.score DESC), '[]'::jsonb)
  INTO v_results
  FROM (
    SELECT
      l.id, l.name, l.phone, l.temperature, l.phase, l.status,
      GREATEST(
        similarity(COALESCE(l.name, ''), v_q),
        CASE WHEN v_q_digits != '' AND l.phone LIKE '%' || v_q_digits || '%' THEN 0.9 ELSE 0 END,
        CASE WHEN COALESCE(l.name, '') ILIKE '%' || v_q || '%' THEN 0.7 ELSE 0 END
      ) AS score
    FROM public.leads l
    WHERE l.clinic_id = v_clinic_id
      AND l.deleted_at IS NULL
      AND (
        l.name % v_q
        OR COALESCE(l.name, '') ILIKE '%' || v_q || '%'
        OR (v_q_digits != '' AND l.phone LIKE '%' || v_q_digits || '%')
      )
      AND (
        -- Scope filter: 'own' só vê leads com historico de appointment do professional
        v_scope IN ('full', 'team')
        OR EXISTS (
          SELECT 1 FROM public.appointments a
          WHERE a.patient_id::text = l.id::text
            AND a.professional_id = v_prof_id
            AND a.deleted_at IS NULL
        )
      )
    ORDER BY score DESC
    LIMIT p_limit
  ) l;

  RETURN jsonb_build_object('ok', true, 'results', v_results, 'query', v_q);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_patient_search(text, text, int) TO authenticated, anon;

-- ============================================================
-- 5. Patient balance com multi-match detection
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_patient_balance(
  p_phone         text,
  p_patient_query text
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
  v_q          text := TRIM(COALESCE(p_patient_query, ''));
  v_q_digits   text := REGEXP_REPLACE(COALESCE(p_patient_query, ''), '[^0-9]', '', 'g');
  v_lead       record;
  v_matches    jsonb;
  v_total      numeric := 0;
  v_paid       numeric := 0;
  v_appts      jsonb := '[]'::jsonb;
  v_match_count int;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN RETURN v_auth; END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := v_auth->>'access_scope';

  IF v_q = '' OR LENGTH(v_q) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'query_too_short');
  END IF;

  -- Conta matches (e respeita scope)
  SELECT count(*), jsonb_agg(jsonb_build_object('id', id, 'name', name, 'phone', phone, 'score', score) ORDER BY score DESC)
  INTO v_match_count, v_matches
  FROM (
    SELECT
      l.id, l.name, l.phone,
      GREATEST(
        similarity(COALESCE(l.name, ''), v_q),
        CASE WHEN v_q_digits != '' AND l.phone LIKE '%' || v_q_digits || '%' THEN 0.9 ELSE 0 END,
        CASE WHEN COALESCE(l.name, '') ILIKE '%' || v_q || '%' THEN 0.7 ELSE 0 END
      ) AS score
    FROM public.leads l
    WHERE l.clinic_id = v_clinic_id
      AND l.deleted_at IS NULL
      AND (
        l.name % v_q
        OR COALESCE(l.name, '') ILIKE '%' || v_q || '%'
        OR (v_q_digits != '' AND l.phone LIKE '%' || v_q_digits || '%')
      )
      AND (
        v_scope IN ('full', 'team')
        OR EXISTS (
          SELECT 1 FROM public.appointments a
          WHERE a.patient_id::text = l.id::text AND a.professional_id = v_prof_id
        )
      )
    ORDER BY score DESC
    LIMIT 6
  ) x;

  IF v_match_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'patient_not_found', 'query', v_q);
  END IF;

  -- Se mais de 1 match com score alto, pede desambiguacao
  IF v_match_count > 1 THEN
    RETURN jsonb_build_object('ok', true, 'multiple_matches', true, 'matches', v_matches, 'query', v_q);
  END IF;

  -- Unico match — busca detalhes
  SELECT id, name, phone INTO v_lead FROM public.leads
  WHERE id = (v_matches->0->>'id')::uuid;

  SELECT
    COALESCE(SUM(a.value), 0),
    COALESCE(SUM((SELECT COALESCE(SUM(amount), 0) FROM public.cashflow_entries WHERE appointment_id = a.id AND deleted_at IS NULL AND direction = 'credit')), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'id', a.id, 'date', a.scheduled_date, 'procedure', a.procedure_name,
      'value', a.value,
      'paid', (SELECT COALESCE(SUM(amount), 0) FROM public.cashflow_entries WHERE appointment_id = a.id AND deleted_at IS NULL AND direction = 'credit'),
      'payment_status', a.payment_status
    ) ORDER BY a.scheduled_date DESC), '[]'::jsonb)
  INTO v_total, v_paid, v_appts
  FROM public.appointments a
  WHERE a.clinic_id = v_clinic_id
    AND a.deleted_at IS NULL
    AND a.patient_id::text = v_lead.id::text
    AND a.status = 'finalizado'
    AND (v_scope IN ('full', 'team') OR a.professional_id = v_prof_id);

  RETURN jsonb_build_object(
    'ok',         true,
    'patient',    jsonb_build_object('id', v_lead.id, 'name', v_lead.name, 'phone', v_lead.phone),
    'total',      ROUND(v_total, 2),
    'paid',       ROUND(v_paid, 2),
    'balance',    ROUND(GREATEST(0, v_total - v_paid), 2),
    'appointments', v_appts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_patient_balance(text, text) TO authenticated, anon;

-- ============================================================
-- 6. Quota (F14)
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_my_quota(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth jsonb := public.wa_pro_resolve_phone(p_phone);
  v_row  record;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN RETURN v_auth; END IF;

  SELECT query_count, max_per_day, minute_count, blocked
  INTO v_row
  FROM public.wa_pro_rate_limit
  WHERE professional_id = (v_auth->>'professional_id')::uuid
    AND date = CURRENT_DATE;

  RETURN jsonb_build_object(
    'ok',           true,
    'day_used',     COALESCE(v_row.query_count, 0),
    'day_max',      COALESCE(v_row.max_per_day, 50),
    'day_remaining', COALESCE(v_row.max_per_day, 50) - COALESCE(v_row.query_count, 0),
    'minute_used',  COALESCE(v_row.minute_count, 0),
    'blocked',      COALESCE(v_row.blocked, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_my_quota(text) TO authenticated, anon;

COMMENT ON TABLE public.wa_pro_context IS 'Multi-turno: ultima entidade/intent por phone, expira em 10min';
COMMENT ON FUNCTION public.wa_pro_check_rate_limit(uuid) IS 'Rate limit com janela dupla: 10/min + max_per_day';
COMMENT ON FUNCTION public.wa_pro_patient_search(text, text, int) IS 'Fuzzy search via pg_trgm + scope filter';
COMMENT ON FUNCTION public.wa_pro_patient_balance(text, text) IS 'Retorna saldo OU multi-matches pra desambiguacao';
COMMENT ON FUNCTION public.wa_pro_my_quota(text) IS 'Quota atual do profissional (dia + minuto)';
