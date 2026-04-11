-- F12: Markdown toggle por profissional.
-- Alguns WhatsApps mobile renderizam *negrito* literal (sem formatacao).
-- Adiciona flag wa_numbers.permissions->>'markdown' (default true).
-- Se false, handle_message strip os asteriscos antes de retornar.

-- Helper: strip markdown WhatsApp-style
CREATE OR REPLACE FUNCTION public._strip_markdown(p_text text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_text IS NULL THEN NULL
    ELSE REGEXP_REPLACE(
           REGEXP_REPLACE(
             REGEXP_REPLACE(p_text, '\*([^*]+)\*', '\1', 'g'),
             '_([^_]+)_', '\1', 'g'
           ),
           '~([^~]+)~', '\1', 'g'
         )
  END
$$;

GRANT EXECUTE ON FUNCTION public._strip_markdown(text) TO authenticated, anon;

-- Envolve wa_pro_handle_message pra aplicar strip se permissions.markdown = false
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
BEGIN
  v_text := TRIM(COALESCE(p_text, ''));
  IF LENGTH(v_text) > 500 THEN v_text := LEFT(v_text, 500); END IF;
  v_text := REGEXP_REPLACE(v_text, '[\u0000-\u001f\u007f]', '', 'g');

  IF v_text = '' THEN
    RETURN jsonb_build_object('ok', false, 'response', '🤔 Mensagem vazia.', 'intent', 'empty');
  END IF;

  v_auth := wa_pro_authenticate(p_phone);
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object(
      'ok', false,
      'response', '🚫 Numero nao autorizado. Peca ao admin pra cadastrar.',
      'intent', 'unauthorized'
    );
  END IF;

  v_clinic_id := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_prof_name := v_auth->>'name';
  v_scope     := v_auth->>'access_scope';
  v_perms     := v_auth->'permissions';
  v_wa_id     := (v_auth->>'wa_number_id')::uuid;

  -- F12: default true se nao configurado
  v_markdown := COALESCE((v_perms->>'markdown')::boolean, true);

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

  v_intent := CASE
    WHEN v_text ~* '^\s*(/?ajuda|/?help|comandos|menu|opcoes|opções)\s*$'                                    THEN 'help'
    WHEN v_text ~* '^\s*(oi|ola|olá|bom dia|boa tarde|boa noite|hey|hello|e ai)\s*[!?.]*\s*$'               THEN 'greeting'
    WHEN v_text ~* '(agenda|horario|atendimento).*(hoje|do dia)|tenho hoje|tenho agenda hoje|quem.*hoje'     THEN 'agenda_today'
    WHEN v_text ~* '(agenda|horario|atendimento).*(amanha|amanhã)|tenho amanha|tenho amanhã'                 THEN 'agenda_tomorrow'
    WHEN v_text ~* '(agenda|horario).*(semana|esta semana)|minha semana'                                    THEN 'agenda_week'
    WHEN v_text ~* '(horario|horarios).*(livre|livres|disponivel|disponiveis|vazio)|tem horario|esta livre' THEN 'agenda_free'
    WHEN v_text ~* '(quem|quais)\s+(me\s+)?(fez|fizeram|pag\w*).*(hoje|semana|mes|mês)|pagamentos?|quem\s+me\s+pag\w+' THEN 'payments_list'
    WHEN v_text ~* '(faturei|faturamento|receita|fatura|recebi).*(hoje|semana|mes|mês)|receita.*(semana|mes|mês|hoje)' THEN 'finance_revenue'
    WHEN v_text ~* '(minha\s+)?(comissao|comissão)|quanto\s+ganhei'                                         THEN 'finance_commission'
    WHEN v_text ~* '(quanto\s+(a\s+|o\s+)?[a-zA-Z]+\s+(me\s+)?deve|saldo\s+(do|da|de)\s+[a-zA-Z]+|devendo\s+[a-zA-Z]+)' THEN 'patient_balance'
    WHEN v_text ~* '(paciente|cliente|quem\s+(e|é|eh))\s+[a-zA-Z]+'                                         THEN 'patient_lookup'
    WHEN v_text ~* '^\s*(minha\s+)?quota\s*$'                                                               THEN 'quota'
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

  -- F12: strip markdown se desabilitado
  IF NOT v_markdown THEN
    v_response := _strip_markdown(v_response);
  END IF;

  INSERT INTO public.wa_pro_context (phone, clinic_id, professional_id, last_intent, last_query, turns, expires_at, updated_at)
  VALUES (p_phone, v_clinic_id, v_prof_id, v_intent, v_text, 1, now() + interval '10 minutes', now())
  ON CONFLICT (phone) DO UPDATE
    SET last_intent = EXCLUDED.last_intent,
        last_query  = EXCLUDED.last_query,
        turns       = CASE WHEN wa_pro_context.expires_at > now() THEN wa_pro_context.turns + 1 ELSE 1 END,
        expires_at  = now() + interval '10 minutes',
        updated_at  = now();

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
    'ok',          true,
    'response',    v_response,
    'intent',      v_intent,
    'professional', v_prof_name,
    'elapsed_ms',  v_elapsed,
    'markdown',    v_markdown,
    'quota',       jsonb_build_object(
      'used', (v_rl->>'count')::int,
      'max',  (v_rl->>'max')::int
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_handle_message(text, text) TO authenticated, anon;
