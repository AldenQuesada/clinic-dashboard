-- ============================================================
-- Migration: Mira Auth RPCs — autenticacao + rate limit + audit
-- Todas as RPCs prefixadas wa_pro_* (modular, isolada)
-- ============================================================

-- ── 1. wa_pro_authenticate ──────────────────────────────────
-- Match phone → professional_profiles + permissoes via wa_numbers

CREATE OR REPLACE FUNCTION public.wa_pro_authenticate(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  v_phone     text := REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  v_prof      record;
  v_wa_number record;
BEGIN
  IF v_phone = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_required');
  END IF;

  -- 1. Procura por wa_number cadastrado como professional_private
  SELECT n.id, n.professional_id, n.access_scope, n.label
  INTO v_wa_number
  FROM public.wa_numbers n
  WHERE n.clinic_id = v_clinic_id
    AND n.number_type = 'professional_private'
    AND n.is_active = true
    AND REGEXP_REPLACE(n.phone, '[^0-9]', '', 'g') = v_phone
  LIMIT 1;

  IF v_wa_number.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'unauthorized',
      'message', 'Numero nao registrado como profissional. Peca ao admin pra cadastrar.'
    );
  END IF;

  -- 2. Carrega o profissional
  SELECT id, display_name, specialty, is_active
  INTO v_prof
  FROM public.professional_profiles
  WHERE id = v_wa_number.professional_id
    AND clinic_id = v_clinic_id;

  IF v_prof.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'professional_not_found');
  END IF;

  IF NOT v_prof.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'professional_inactive');
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'professional_id', v_prof.id,
    'name',            v_prof.display_name,
    'specialty',       v_prof.specialty,
    'access_scope',    v_wa_number.access_scope,
    'wa_number_id',    v_wa_number.id,
    'label',           v_wa_number.label
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_authenticate(text) TO authenticated, anon;

-- ── 2. wa_pro_check_rate_limit ──────────────────────────────
-- Verifica e incrementa o contador diario do profissional

CREATE OR REPLACE FUNCTION public.wa_pro_check_rate_limit(p_professional_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  v_today     date := CURRENT_DATE;
  v_row       record;
BEGIN
  -- Insert se nao existir, retorna o registro
  INSERT INTO public.wa_pro_rate_limit (clinic_id, professional_id, date, query_count)
  VALUES (v_clinic_id, p_professional_id, v_today, 0)
  ON CONFLICT (clinic_id, professional_id, date) DO NOTHING;

  SELECT query_count, max_per_day, blocked
  INTO v_row
  FROM public.wa_pro_rate_limit
  WHERE clinic_id = v_clinic_id
    AND professional_id = p_professional_id
    AND date = v_today;

  IF v_row.blocked THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'manually_blocked', 'count', v_row.query_count, 'max', v_row.max_per_day);
  END IF;

  IF v_row.query_count >= v_row.max_per_day THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limit_exceeded', 'count', v_row.query_count, 'max', v_row.max_per_day);
  END IF;

  -- Incrementa
  UPDATE public.wa_pro_rate_limit
  SET query_count = query_count + 1, updated_at = now()
  WHERE clinic_id = v_clinic_id
    AND professional_id = p_professional_id
    AND date = v_today;

  RETURN jsonb_build_object('ok', true, 'count', v_row.query_count + 1, 'max', v_row.max_per_day);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_check_rate_limit(uuid) TO authenticated, anon;

-- ── 3. wa_pro_log_query ─────────────────────────────────────
-- Registra a query no audit log + na tabela de mensagens

CREATE OR REPLACE FUNCTION public.wa_pro_log_query(
  p_phone           text,
  p_professional_id uuid,
  p_wa_number_id    uuid,
  p_query           text,
  p_intent          text,
  p_response        text,
  p_success         boolean DEFAULT true,
  p_error           text DEFAULT NULL,
  p_tokens_used     int DEFAULT 0,
  p_response_ms     int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
BEGIN
  -- Audit log
  INSERT INTO public.wa_pro_audit_log (
    clinic_id, professional_id, phone, query, intent, success, error_message
  ) VALUES (
    v_clinic_id, p_professional_id, p_phone, p_query, p_intent, p_success, p_error
  );

  -- Mensagem inbound
  INSERT INTO public.wa_pro_messages (
    clinic_id, wa_number_id, professional_id, phone, direction, content, intent, status
  ) VALUES (
    v_clinic_id, p_wa_number_id, p_professional_id, p_phone, 'inbound', p_query, p_intent, 'sent'
  );

  -- Mensagem outbound (resposta)
  IF p_response IS NOT NULL AND p_response != '' THEN
    INSERT INTO public.wa_pro_messages (
      clinic_id, wa_number_id, professional_id, phone, direction, content, intent, status, tokens_used, response_ms
    ) VALUES (
      v_clinic_id, p_wa_number_id, p_professional_id, p_phone, 'outbound', p_response, p_intent,
      CASE WHEN p_success THEN 'sent' ELSE 'failed' END,
      p_tokens_used, p_response_ms
    );
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_log_query(text, uuid, uuid, text, text, text, boolean, text, int, int) TO authenticated, anon;

-- ── 4. wa_pro_register_number ───────────────────────────────
-- Owner cadastra um numero como professional_private

CREATE OR REPLACE FUNCTION public.wa_pro_register_number(
  p_phone           text,
  p_professional_id uuid,
  p_label           text DEFAULT NULL,
  p_access_scope    text DEFAULT 'own'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_id        uuid;
  v_phone     text := REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF v_clinic_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  IF v_phone = '' OR p_professional_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_data');
  END IF;

  INSERT INTO public.wa_numbers (
    clinic_id, phone, label, instance_id, is_active,
    number_type, professional_id, access_scope
  ) VALUES (
    v_clinic_id, v_phone, COALESCE(p_label, 'Mira ' || v_phone), 'mira-' || v_phone, true,
    'professional_private', p_professional_id, COALESCE(p_access_scope, 'own')
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_register_number(text, uuid, text, text) TO authenticated;

-- ── 5. wa_pro_list_numbers ──────────────────────────────────

CREATE OR REPLACE FUNCTION public.wa_pro_list_numbers()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_result    jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',              n.id,
    'phone',           n.phone,
    'label',           n.label,
    'number_type',     n.number_type,
    'access_scope',    n.access_scope,
    'professional_id', n.professional_id,
    'professional_name', p.display_name,
    'is_active',       n.is_active,
    'created_at',      n.created_at
  ) ORDER BY n.number_type, p.display_name), '[]'::jsonb)
  INTO v_result
  FROM public.wa_numbers n
  LEFT JOIN public.professional_profiles p ON p.id = n.professional_id
  WHERE n.clinic_id = v_clinic_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_list_numbers() TO authenticated;

COMMENT ON FUNCTION public.wa_pro_authenticate    IS 'Mira: autentica telefone do profissional. Retorna prof_id, nome, scope ou error.';
COMMENT ON FUNCTION public.wa_pro_check_rate_limit IS 'Mira: verifica e incrementa rate limit diario (default 50/dia).';
COMMENT ON FUNCTION public.wa_pro_log_query        IS 'Mira: registra query no audit log + tabela de mensagens.';
COMMENT ON FUNCTION public.wa_pro_register_number  IS 'Mira: cadastra um numero como professional_private (admin only).';
COMMENT ON FUNCTION public.wa_pro_list_numbers     IS 'Mira: lista todos os wa_numbers da clinica com info de profissional.';
