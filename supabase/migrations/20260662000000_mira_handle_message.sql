-- SSOT: wa_pro_handle_message elimina duplicacao dashboard/n8n
-- Fluxo completo dentro de uma RPC: sanitize → auth → rate limit →
-- intent parse → permission check → execute → format → context → log
--
-- Chamada via REST: POST /rpc/wa_pro_handle_message { p_phone, p_text }

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
  v_rpc_res    jsonb;
  v_ctx        record;
  v_elapsed    int;
  v_area       text;
  v_param      text;
BEGIN
  -- F7: Sanitize input (trim, max 500 chars, strip control)
  v_text := TRIM(COALESCE(p_text, ''));
  IF LENGTH(v_text) > 500 THEN v_text := LEFT(v_text, 500); END IF;
  v_text := REGEXP_REPLACE(v_text, '[\u0000-\u001f\u007f]', '', 'g');

  IF v_text = '' THEN
    RETURN jsonb_build_object('ok', false, 'response', '🤔 Mensagem vazia.', 'intent', 'empty');
  END IF;

  -- Auth (usa wa_pro_authenticate que ja tem tudo)
  v_auth := (SELECT row_to_json(a)::jsonb FROM (
    SELECT wa_pro_authenticate(p_phone) AS res
  ) a);
  v_auth := v_auth->'res';

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

  -- Rate limit (dia + minuto)
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

  -- Intent parse (ordem importa)
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

  -- Permissao por area
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
    -- Executa a intent (rota)
    v_response := wa_pro_execute_and_format(v_intent, v_text, p_phone, v_prof_name);
  END IF;

  -- Salva contexto (10min TTL)
  INSERT INTO public.wa_pro_context (phone, clinic_id, professional_id, last_intent, last_query, turns, expires_at, updated_at)
  VALUES (p_phone, v_clinic_id, v_prof_id, v_intent, v_text, 1, now() + interval '10 minutes', now())
  ON CONFLICT (phone) DO UPDATE
    SET last_intent = EXCLUDED.last_intent,
        last_query  = EXCLUDED.last_query,
        turns       = CASE WHEN wa_pro_context.expires_at > now() THEN wa_pro_context.turns + 1 ELSE 1 END,
        expires_at  = now() + interval '10 minutes',
        updated_at  = now();

  v_elapsed := EXTRACT(epoch FROM (clock_timestamp() - v_started_at))::int * 1000;

  -- Audit log (F13: response_ms agora existe)
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
    'quota',       jsonb_build_object(
      'used', (v_rl->>'count')::int,
      'max',  (v_rl->>'max')::int
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_handle_message(text, text) TO authenticated, anon;


-- ============================================================
-- Dispatcher: executa intent e retorna texto formatado
-- Separado pra manter handle_message limpo
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
AS $$
DECLARE
  v_data   jsonb;
  v_first_name text := SPLIT_PART(COALESCE(p_prof_name, 'Doutor(a)'), ' ', 1);
  v_start  date;
  v_end    date;
  v_period_label text;
  v_patient_q text;
BEGIN
  -- Help dinamico (F15): mostra quota atual junto
  IF p_intent = 'help' THEN
    RETURN 'Oi ' || v_first_name || E'! 👋\n\n' ||
           E'Tenho 3 areas:\n' ||
           E'📋 *Pacientes* — busca, saldo, historico\n' ||
           E'📅 *Agenda* — sua agenda, horarios livres\n' ||
           E'💰 *Financeiro* — receita, comissao, pagamentos\n\n' ||
           E'Exemplos do que posso entender:\n' ||
           E'• "tenho agenda hoje?" / "tenho amanha?"\n' ||
           E'• "quem e Maria Silva?"\n' ||
           E'• "quanto a Camila me deve?"\n' ||
           E'• "quanto faturei essa semana?"\n' ||
           E'• "quem me pagou essa semana?"\n' ||
           E'• "minha comissao do mes"\n' ||
           E'• "minha quota"';
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

  IF p_intent = 'unknown' THEN
    RETURN E'🤔 Nao entendi ainda.\n\n' ||
           E'Exemplos:\n' ||
           E'• "tenho agenda hoje?"\n' ||
           E'• "quanto faturei essa semana?"\n' ||
           E'• "quem me pagou esse mes"\n\n' ||
           E'Digite */ajuda* pra lista completa.';
  END IF;

  -- Helpers de data
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

  -- PACIENTES (extrai nome via regex simples)
  v_patient_q := TRIM(REGEXP_REPLACE(p_text, '\b(quem|e|é|paciente|cliente|telefone|contato|whats|whatsapp|de|do|da|quanto|saldo|deve|devendo|me|a|o|esta|está|eh)\b', ' ', 'gi'));
  v_patient_q := REGEXP_REPLACE(v_patient_q, '[?!.]+', '', 'g');
  v_patient_q := TRIM(REGEXP_REPLACE(v_patient_q, '\s+', ' ', 'g'));

  IF p_intent = 'patient_lookup' THEN
    IF LENGTH(v_patient_q) < 2 THEN
      RETURN '🔍 Diga o nome do paciente. Ex: "quem e Maria Silva?"';
    END IF;
    v_data := wa_pro_patient_search(p_phone, v_patient_q, 5);
    RETURN _fmt_patient_list(v_data);
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
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_execute_and_format(text, text, text, text) TO authenticated, anon;

-- ============================================================
-- Formatters como funcoes SQL (reusaveis)
-- ============================================================
CREATE OR REPLACE FUNCTION public._money(n numeric) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN n IS NULL THEN 'R$ 0,00'
              ELSE 'R$ ' || REPLACE(REPLACE(TO_CHAR(ROUND(n, 2), 'FM999G999G990D00'), '.', '#'), ',', '.') END
        -- FM999G999G990D00 usa , como decimal e . como milhar em pt-BR
$$;

CREATE OR REPLACE FUNCTION public._br_date(d text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN d IS NULL THEN '' ELSE TO_CHAR(d::date, 'DD/MM') END
$$;

CREATE OR REPLACE FUNCTION public._fmt_agenda(p jsonb, p_label text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_out text;
  v_item jsonb;
  v_status text;
  v_line text;
BEGIN
  IF p IS NULL OR jsonb_array_length(COALESCE(p->'appointments', '[]'::jsonb)) = 0 THEN
    RETURN '📅 *Agenda — ' || p_label || E'*\n\nNenhum agendamento.';
  END IF;

  v_out := '📅 *Agenda — ' || p_label || E'*\n─────────────';

  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'appointments') LOOP
    v_status := CASE v_item->>'status' WHEN 'finalizado' THEN '✅' WHEN 'cancelado' THEN '❌' ELSE '⏳' END;
    v_line := v_status || ' *' || LEFT(COALESCE(v_item->>'time', ''), 5) || '* — ' || COALESCE(v_item->>'patient', 'Sem nome');
    IF NULLIF(v_item->>'procedure', '') IS NOT NULL THEN
      v_line := v_line || ' · ' || (v_item->>'procedure');
    END IF;
    v_out := v_out || E'\n' || v_line;
  END LOOP;

  v_out := v_out || E'\n─────────────\n' ||
           'Total: *' || COALESCE((p->>'total')::text, '0') || '* · Finalizados: ' ||
           COALESCE((p->>'finalized')::text, '0') || ' · Pendentes: ' || COALESCE((p->>'pending')::text, '0');
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public._fmt_free_slots(p jsonb, p_label text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_out text;
  v_item jsonb;
BEGIN
  IF p IS NULL OR jsonb_array_length(COALESCE(p->'busy', '[]'::jsonb)) = 0 THEN
    RETURN '🟢 *Horarios — ' || p_label || E'*\n\nDia totalmente livre.';
  END IF;
  v_out := '📅 *Ocupados — ' || p_label || E'*\n─────────────';
  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'busy') LOOP
    v_out := v_out || E'\n🔴 *' || LEFT(COALESCE(v_item->>'start_time', ''), 5) ||
             CASE WHEN v_item->>'end_time' IS NOT NULL THEN '–' || LEFT(v_item->>'end_time', 5) ELSE '' END ||
             '* — ' || COALESCE(v_item->>'patient', 'Reservado');
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public._fmt_patient_list(p jsonb) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_out text;
  v_item jsonb;
  v_i int := 0;
BEGIN
  IF p IS NULL OR jsonb_array_length(COALESCE(p->'results', '[]'::jsonb)) = 0 THEN
    RETURN '🔍 Nenhum paciente encontrado para "' || COALESCE(p->>'query', '') || '".';
  END IF;
  v_out := E'👥 *Pacientes encontrados*\n─────────────';
  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'results') LOOP
    v_i := v_i + 1;
    v_out := v_out || E'\n' || v_i || '. *' || COALESCE(v_item->>'name', '(sem nome)') || '*';
    IF NULLIF(v_item->>'phone', '') IS NOT NULL THEN
      v_out := v_out || ' · ' || (v_item->>'phone');
    END IF;
    IF NULLIF(v_item->>'phase', '') IS NOT NULL THEN
      v_out := v_out || E'\n   fase: ' || (v_item->>'phase');
    END IF;
  END LOOP;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public._fmt_patient_balance(p jsonb) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_out text;
  v_item jsonb;
  v_i int := 0;
BEGIN
  IF p IS NULL OR (p->>'ok') = 'false' THEN
    IF p->>'error' = 'patient_not_found' THEN
      RETURN '🔍 Paciente "' || COALESCE(p->>'query', '') || '" nao encontrado.';
    END IF;
    RETURN '⚠️ ' || COALESCE(p->>'error', 'erro');
  END IF;

  -- F10: Multiple matches → pede desambiguacao
  IF (p->>'multiple_matches')::boolean IS TRUE THEN
    v_out := '🤔 Encontrei *' || jsonb_array_length(p->'matches') || '* pacientes com "' || (p->>'query') || E'". Qual?\n─────────────';
    FOR v_item IN SELECT * FROM jsonb_array_elements(p->'matches') LOOP
      v_i := v_i + 1;
      v_out := v_out || E'\n' || v_i || '. *' || COALESCE(v_item->>'name', '?') || '*' ||
               CASE WHEN v_item->>'phone' IS NOT NULL THEN ' · ' || (v_item->>'phone') ELSE '' END;
    END LOOP;
    v_out := v_out || E'\n─────────────\nReformule com o nome completo pra ver o saldo exato.';
    RETURN v_out;
  END IF;

  v_out := '💰 *Saldo — ' || (p->'patient'->>'name') || E'*\n─────────────\n' ||
           'Total: *' || _money((p->>'total')::numeric) || E'*\n' ||
           'Pago: ' || _money((p->>'paid')::numeric) || E'\n' ||
           'Saldo devedor: *' || _money((p->>'balance')::numeric) || '*';

  IF jsonb_array_length(COALESCE(p->'appointments', '[]'::jsonb)) > 0 THEN
    v_out := v_out || E'\n─────────────\n*Atendimentos:*';
    v_i := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(p->'appointments') LOOP
      v_i := v_i + 1;
      IF v_i > 5 THEN EXIT; END IF;
      v_out := v_out || E'\n• ' || _br_date(v_item->>'date') || ' — ' ||
               COALESCE(NULLIF(v_item->>'procedure', ''), 's/proc') || ' · ' ||
               _money((v_item->>'value')::numeric);
    END LOOP;
  END IF;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public._fmt_finance_summary(p jsonb, p_label text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_out text;
  v_delta numeric;
BEGIN
  IF p IS NULL THEN RETURN 'Sem dados financeiros.'; END IF;
  v_out := '💰 *Receita — ' || p_label || E'*\n─────────────\n' ||
           'Bruto: *' || _money((p->>'bruto')::numeric) || E'*\n' ||
           'Atendimentos: ' || COALESCE(p->>'qtd', '0') || E'\n' ||
           'Ticket medio: ' || _money(COALESCE((p->>'ticket_medio')::numeric, 0));
  IF p->>'delta_pct' IS NOT NULL THEN
    v_delta := (p->>'delta_pct')::numeric;
    v_out := v_out || E'\n' || CASE WHEN v_delta >= 0 THEN '📈' ELSE '📉' END ||
             ' vs anterior: ' || CASE WHEN v_delta >= 0 THEN '+' ELSE '' END ||
             REPLACE(ROUND(v_delta, 1)::text, '.', ',') || '% (' ||
             _money(COALESCE((p->>'previous_bruto')::numeric, 0)) || ')';
  END IF;
  RETURN v_out;
END;
$$;

CREATE OR REPLACE FUNCTION public._fmt_finance_commission(p jsonb, p_label text) RETURNS text
LANGUAGE plpgsql AS $$
BEGIN
  IF p IS NULL THEN RETURN 'Sem dados de comissao.'; END IF;
  RETURN '💼 *Comissao — ' || p_label || E'*\n─────────────\n' ||
         'Bruto gerado: ' || _money((p->>'bruto')::numeric) || E'\n' ||
         'Comissao: *' || _money((p->>'comissao')::numeric) || E'*\n' ||
         'Percentual efetivo: ' || REPLACE(ROUND(COALESCE((p->>'percentual')::numeric, 0), 1)::text, '.', ',') || '%';
END;
$$;

CREATE OR REPLACE FUNCTION public._fmt_payments_list(p jsonb, p_label text) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_out text;
  v_item jsonb;
  v_i int := 0;
  v_n int;
BEGIN
  v_n := jsonb_array_length(COALESCE(p->'payments', '[]'::jsonb));
  IF p IS NULL OR v_n = 0 THEN
    RETURN '💸 *Pagamentos — ' || p_label || E'*\n\nNenhum pagamento no periodo.';
  END IF;
  v_out := '💸 *Pagamentos — ' || p_label || E'*\n─────────────';
  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'payments') LOOP
    v_i := v_i + 1;
    IF v_i > 15 THEN EXIT; END IF;
    v_out := v_out || E'\n• ' || _br_date(v_item->>'date') || ' *' ||
             _money((v_item->>'value')::numeric) || '*' ||
             CASE WHEN v_item->>'method' IS NOT NULL THEN ' · ' || (v_item->>'method') ELSE '' END ||
             ' — ' || COALESCE(v_item->>'patient', '?');
  END LOOP;
  IF v_n > 15 THEN
    v_out := v_out || E'\n... e mais ' || (v_n - 15);
  END IF;
  v_out := v_out || E'\n─────────────\nTotal: *' || _money((p->>'sum')::numeric) || '* em ' ||
           (p->>'total') || ' pagamento(s)';
  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public._money(numeric) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public._br_date(text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public._fmt_agenda(jsonb, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public._fmt_free_slots(jsonb, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public._fmt_patient_list(jsonb) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public._fmt_patient_balance(jsonb) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public._fmt_finance_summary(jsonb, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public._fmt_finance_commission(jsonb, text) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public._fmt_payments_list(jsonb, text) TO authenticated, anon;
