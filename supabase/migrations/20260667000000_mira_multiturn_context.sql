-- 🧠 Multi-turn context: handler consome wa_pro_context pra resolver
-- referencias como "ela", "ele", "1", "2", "primeira" apos um multi-match
-- ou lookup de paciente.
--
-- Fluxo:
--   T1: "quem e Maria Silva" → multi_matches [Maria A, Maria B, Maria C]
--       Mira: "Encontrei 3. Qual? 1) Maria A 2) Maria B 3) Maria C"
--       Context guardado: last_intent=patient_lookup_disambiguation,
--                         last_entity_options=[A, B, C]
--   T2: "2" ou "a segunda" ou "Maria B"
--       Handler detecta referencia numerica → usa context.options[1]
--       → substitui text por "quanto Maria B me deve" → executa
--
-- Estado atualizado do context:
ALTER TABLE public.wa_pro_context
  ADD COLUMN IF NOT EXISTS last_entity_options jsonb,
  ADD COLUMN IF NOT EXISTS last_response_preview text;

-- Helper pra salvar context com options
CREATE OR REPLACE FUNCTION public._save_context(
  p_phone        text,
  p_clinic_id    uuid,
  p_professional uuid,
  p_intent       text,
  p_query        text,
  p_entity_type  text DEFAULT NULL,
  p_entity_id    text DEFAULT NULL,
  p_entity_name  text DEFAULT NULL,
  p_options      jsonb DEFAULT NULL
)
RETURNS void
LANGUAGE sql AS $$
  INSERT INTO public.wa_pro_context (
    phone, clinic_id, professional_id, last_intent, last_query,
    last_entity_type, last_entity_id, last_entity_name, last_entity_options,
    turns, expires_at, updated_at
  ) VALUES (
    p_phone, p_clinic_id, p_professional, p_intent, p_query,
    p_entity_type, p_entity_id, p_entity_name, p_options,
    1, now() + interval '10 minutes', now()
  )
  ON CONFLICT (phone) DO UPDATE
    SET last_intent = EXCLUDED.last_intent,
        last_query  = EXCLUDED.last_query,
        last_entity_type    = COALESCE(EXCLUDED.last_entity_type, wa_pro_context.last_entity_type),
        last_entity_id      = COALESCE(EXCLUDED.last_entity_id, wa_pro_context.last_entity_id),
        last_entity_name    = COALESCE(EXCLUDED.last_entity_name, wa_pro_context.last_entity_name),
        last_entity_options = EXCLUDED.last_entity_options,
        turns       = CASE WHEN wa_pro_context.expires_at > now() THEN wa_pro_context.turns + 1 ELSE 1 END,
        expires_at  = now() + interval '10 minutes',
        updated_at  = now();
$$;

GRANT EXECUTE ON FUNCTION public._save_context(text,uuid,uuid,text,text,text,text,text,jsonb) TO authenticated, anon;

-- Helper: resolve referencia ("2", "segunda", "ela") usando context
CREATE OR REPLACE FUNCTION public._resolve_reference(
  p_text    text,
  p_context record
)
RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_num int;
  v_options jsonb;
  v_option jsonb;
BEGIN
  -- Se nao tem context ou ja expirou, nao resolve
  IF p_context IS NULL OR p_context.last_entity_options IS NULL THEN
    RETURN NULL;
  END IF;
  v_options := p_context.last_entity_options;

  -- Caso 1: numero puro "1", "2", "3" ou "1." ou com espacos
  IF p_text ~* '^\s*[0-9]+\.?\s*$' THEN
    v_num := (REGEXP_REPLACE(p_text, '[^0-9]', '', 'g'))::int;
    IF v_num >= 1 AND v_num <= jsonb_array_length(v_options) THEN
      RETURN v_options -> (v_num - 1);
    END IF;
  END IF;

  -- Caso 2: "primeiro/primeira", "segundo/segunda", etc
  IF p_text ~* '(primeir[oa]|a\s+1)' AND jsonb_array_length(v_options) >= 1 THEN
    RETURN v_options -> 0;
  END IF;
  IF p_text ~* '(segund[oa])' AND jsonb_array_length(v_options) >= 2 THEN
    RETURN v_options -> 1;
  END IF;
  IF p_text ~* '(terceir[oa])' AND jsonb_array_length(v_options) >= 3 THEN
    RETURN v_options -> 2;
  END IF;

  RETURN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public._resolve_reference(text, record) TO authenticated, anon;

-- Atualiza handle_message pra:
-- 1. Ler context antes de processar
-- 2. Se texto for referencia ("2", "segunda") e ultimo intent=patient_disambiguation,
--    resolve pra nome real e re-roda patient_balance
-- 3. Salvar context enriquecido apos patient_balance multi-match
CREATE OR REPLACE FUNCTION public.wa_pro_handle_message(
  p_phone text,
  p_text  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
BEGIN
  -- F7: Sanitize
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

  -- 🧠 MULTI-TURN: load context se existir e nao expirou
  SELECT * INTO v_context FROM public.wa_pro_context
  WHERE phone = p_phone AND expires_at > now()
  LIMIT 1;

  -- Se texto eh uma referencia e o ultimo intent esperava desambiguacao
  IF v_context IS NOT NULL AND v_context.last_intent = 'patient_balance_disambig' THEN
    v_resolved := _resolve_reference(v_text, v_context);
    IF v_resolved IS NOT NULL THEN
      -- Resolveu! Re-executa patient_balance com o nome escolhido
      v_rewritten := v_resolved->>'name';
      v_text := 'quanto ' || v_rewritten || ' me deve';  -- reescrever pro proximo passo
    END IF;
  END IF;

  -- Intent parse
  v_intent := CASE
    WHEN v_text ~* '^\s*(/?ajuda|/?help|comandos|menu|opcoes|opções)\s*$' THEN 'help'
    WHEN v_text ~* '^\s*(oi|ola|olá|bom dia|boa tarde|boa noite|hey|hello|e ai)\s*[!?.]*\s*$' THEN 'greeting'
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

  v_area := CASE v_intent
    WHEN 'agenda_today'    THEN 'agenda'
    WHEN 'agenda_tomorrow' THEN 'agenda'
    WHEN 'agenda_week'     THEN 'agenda'
    WHEN 'agenda_free'     THEN 'agenda'
    WHEN 'patient_lookup'  THEN 'pacientes'
    WHEN 'patient_balance' THEN 'pacientes'
    WHEN 'finance_revenue'    THEN 'financeiro'
    WHEN 'finance_commission' THEN 'financeiro'
    WHEN 'payments_list'      THEN 'financeiro'
    ELSE NULL
  END;

  IF v_area IS NOT NULL AND v_perms IS NOT NULL
     AND (v_perms->>v_area)::boolean IS NOT DISTINCT FROM false THEN
    v_response := '🔒 Voce nao tem permissao para consultar ' || v_area;
    v_intent := 'no_permission';
  ELSE
    v_response := wa_pro_execute_and_format(v_intent, v_text, p_phone, v_prof_name);
  END IF;

  IF NOT v_markdown THEN
    v_response := _strip_markdown(v_response);
  END IF;

  -- 🧠 Salva context — se foi patient_balance multi-match, guarda as options
  v_options_to_save := NULL;
  v_entity_id := NULL;
  v_entity_name := NULL;

  IF v_intent = 'patient_balance' THEN
    -- Chama patient_balance de novo so pra pegar os matches
    -- (otimizacao: poderia guardar nos metadados da resposta)
    v_patient_data := wa_pro_patient_balance(p_phone,
      TRIM(REGEXP_REPLACE(v_text, '[[:<:]](quem|e|é|paciente|cliente|telefone|contato|whats|whatsapp|de|do|da|quanto|saldo|deve|devendo|me|a|o|esta|está|eh)[[:>:]]', ' ', 'gi'))
    );
    IF (v_patient_data->>'multiple_matches')::boolean IS TRUE THEN
      v_options_to_save := v_patient_data->'matches';
      v_intent := 'patient_balance_disambig'; -- flag especial pro proximo turno
    ELSIF v_patient_data->'patient' IS NOT NULL THEN
      v_entity_id := v_patient_data->'patient'->>'id';
      v_entity_name := v_patient_data->'patient'->>'name';
    END IF;
  END IF;

  PERFORM _save_context(
    p_phone, v_clinic_id, v_prof_id, v_intent, v_text,
    'patient', v_entity_id, v_entity_name, v_options_to_save
  );

  v_elapsed := EXTRACT(epoch FROM (clock_timestamp() - v_started_at))::int * 1000;

  INSERT INTO public.wa_pro_audit_log (
    clinic_id, professional_id, phone, query, intent,
    result_summary, success, response_ms
  ) VALUES (
    v_clinic_id, v_prof_id, p_phone, v_text, v_intent,
    LEFT(v_response, 500), v_intent NOT IN ('unauthorized','rate_limited','unknown','empty'),
    v_elapsed
  );

  RETURN jsonb_build_object(
    'ok', true,
    'response', v_response,
    'intent', v_intent,
    'professional', v_prof_name,
    'elapsed_ms', v_elapsed,
    'markdown', v_markdown,
    'has_context', v_context IS NOT NULL,
    'quota', jsonb_build_object('used', (v_rl->>'count')::int, 'max', (v_rl->>'max')::int)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_handle_message(text, text) TO authenticated, anon;
