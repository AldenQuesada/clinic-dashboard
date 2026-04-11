-- F2: Tier 2 Haiku fallback via tool use.
-- RPC wa_pro_execute_tool recebe { tool_name, args } e roteia pra RPC correta.
-- Usada pelo n8n quando Tier 1 (regex) retorna intent='unknown' e Claude Haiku
-- decide qual tool chamar.

CREATE OR REPLACE FUNCTION public.wa_pro_execute_tool(
  p_phone     text,
  p_tool_name text,
  p_args      jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_auth       jsonb := public.wa_pro_resolve_phone(p_phone);
  v_prof_name  text;
  v_data       jsonb;
  v_response   text;
  v_start_d    date;
  v_end_d      date;
  v_period_lbl text;
  v_intent     text;
  v_period     text;
  v_offset     int;
  v_elapsed    int;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'response', '🚫 Nao autorizado.', 'intent', 'unauthorized');
  END IF;

  v_prof_name := COALESCE((
    SELECT display_name FROM professional_profiles WHERE id = (v_auth->>'professional_id')::uuid
  ), 'Doutor(a)');

  -- Parse period arg (default: mes)
  v_period := COALESCE(p_args->>'period', 'mes');
  v_offset := COALESCE((p_args->>'date_offset')::int, 0);

  IF v_period = 'hoje' OR v_period = 'today' THEN
    v_start_d := CURRENT_DATE; v_end_d := CURRENT_DATE; v_period_lbl := 'hoje';
  ELSIF v_period = 'semana' OR v_period = 'week' THEN
    v_start_d := CURRENT_DATE - ((EXTRACT(dow FROM CURRENT_DATE)::int + 6) % 7);
    v_end_d   := v_start_d + 6;
    v_period_lbl := 'essa semana';
  ELSE
    v_start_d := date_trunc('month', CURRENT_DATE)::date;
    v_end_d   := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date;
    v_period_lbl := 'esse mes';
  END IF;

  -- Dispatcher
  CASE p_tool_name
    WHEN 'get_agenda' THEN
      v_data := wa_pro_agenda(p_phone, CURRENT_DATE + v_offset);
      v_response := _fmt_agenda(v_data, CASE v_offset WHEN 0 THEN 'hoje' WHEN 1 THEN 'amanha' WHEN -1 THEN 'ontem' ELSE (CURRENT_DATE + v_offset)::text END);
      v_intent := 'tool:get_agenda';

    WHEN 'get_free_slots' THEN
      v_data := wa_pro_agenda_free_slots(p_phone, CURRENT_DATE + v_offset);
      v_response := _fmt_free_slots(v_data, CASE v_offset WHEN 0 THEN 'hoje' ELSE (CURRENT_DATE + v_offset)::text END);
      v_intent := 'tool:get_free_slots';

    WHEN 'search_patients' THEN
      v_data := wa_pro_patient_search(p_phone, p_args->>'query', 5);
      v_response := _fmt_patient_list(v_data);
      v_intent := 'tool:search_patients';

    WHEN 'get_patient_balance' THEN
      v_data := wa_pro_patient_balance(p_phone, p_args->>'name');
      v_response := _fmt_patient_balance(v_data);
      v_intent := 'tool:get_patient_balance';

    WHEN 'get_finance_summary' THEN
      v_data := wa_pro_finance_summary(p_phone, v_start_d, v_end_d);
      v_response := _fmt_finance_summary(v_data, v_period_lbl);
      v_intent := 'tool:get_finance_summary';

    WHEN 'get_commission' THEN
      v_data := wa_pro_finance_commission(p_phone, v_start_d, v_end_d);
      v_response := _fmt_finance_commission(v_data, v_period_lbl);
      v_intent := 'tool:get_commission';

    WHEN 'list_payments' THEN
      v_data := wa_pro_recent_payments(p_phone, v_start_d, v_end_d);
      v_response := _fmt_payments_list(v_data, v_period_lbl);
      v_intent := 'tool:list_payments';

    WHEN 'get_quota' THEN
      v_data := wa_pro_my_quota(p_phone);
      v_response := E'📊 *Sua quota hoje*\n─────────────\n' ||
                    'Usadas: *' || (v_data->>'day_used') || '/' || (v_data->>'day_max') || E'*\n' ||
                    'Restantes: ' || (v_data->>'day_remaining');
      v_intent := 'tool:get_quota';

    ELSE
      v_response := '⚠️ Tool desconhecida: ' || p_tool_name;
      v_intent := 'tool:unknown';
  END CASE;

  v_elapsed := EXTRACT(epoch FROM (clock_timestamp() - v_started_at))::int * 1000;

  -- Audit log (Tier 2 logado separado)
  INSERT INTO public.wa_pro_audit_log (
    clinic_id, professional_id, phone, query, intent, rpc_called,
    result_summary, success, response_ms
  ) VALUES (
    (v_auth->>'clinic_id')::uuid,
    (v_auth->>'professional_id')::uuid,
    p_phone,
    'tier2:' || p_tool_name || ' ' || COALESCE(p_args::text, '{}'),
    v_intent,
    p_tool_name,
    LEFT(v_response, 500),
    true,
    v_elapsed
  );

  RETURN jsonb_build_object(
    'ok',       true,
    'response', v_response,
    'intent',   v_intent,
    'tool',     p_tool_name,
    'elapsed_ms', v_elapsed
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_execute_tool(text, text, jsonb) TO authenticated, anon;

COMMENT ON FUNCTION public.wa_pro_execute_tool(text, text, jsonb) IS 'Tier 2: executa tool escolhida pelo Claude Haiku';

-- Config table pra armazenar Claude API key (se alguma vez precisar pg_net direto)
CREATE TABLE IF NOT EXISTS public.wa_pro_config (
  key   text PRIMARY KEY,
  value text NOT NULL,
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.wa_pro_config ENABLE ROW LEVEL SECURITY;
