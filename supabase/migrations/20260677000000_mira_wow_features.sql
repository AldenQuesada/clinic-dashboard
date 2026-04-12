-- Mira Sprint WOW — 5 features de alto impacto
--
-- 1. "Como foi meu dia?" — resumo executivo on-demand
-- 2. "Qual meu proximo?" — proximo paciente agendado
-- 3. "Quem fez botox esse mes?" — busca por procedimento
-- 4. "Quem me deve mais de 500?" — lista de devedores
-- 5. "Quanto gastei de voz?" — dashboard de uso Mira/Whisper

-- ============================================================
-- 1. RESUMO DO DIA (on-demand)
-- "como foi meu dia?" / "resumo do dia" / "meu dia"
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_day_summary(
  p_phone text,
  p_date  date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth     jsonb := wa_pro_resolve_phone(p_phone);
  v_clinic_id uuid;
  v_prof_id  uuid;
  v_scope    text;
  v_target   date;
  v_stats    record;
  v_top_proc record;
  v_no_shows int;
  v_revenue  numeric;
  v_appts    jsonb;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := COALESCE(v_auth->>'access_scope', 'own');
  v_target    := COALESCE(p_date, (now() AT TIME ZONE 'America/Sao_Paulo')::date);

  SELECT
    count(*)::int AS total,
    count(*) FILTER (WHERE status = 'finalizado')::int AS finalizados,
    count(*) FILTER (WHERE status = 'agendado')::int AS pendentes,
    count(*) FILTER (WHERE status = 'cancelado')::int AS cancelados,
    count(*) FILTER (WHERE status = 'no_show' OR no_show_em IS NOT NULL)::int AS no_shows,
    COALESCE(SUM(value) FILTER (WHERE status = 'finalizado'), 0) AS receita,
    MIN(start_time) FILTER (WHERE status IN ('agendado','pre_consulta','finalizado')) AS primeiro_horario,
    MAX(end_time) FILTER (WHERE status = 'finalizado') AS ultimo_horario
  INTO v_stats
  FROM appointments
  WHERE clinic_id = v_clinic_id AND deleted_at IS NULL
    AND scheduled_date = v_target
    AND (v_scope = 'full' OR v_scope = 'team' OR professional_id = v_prof_id);

  -- Top procedimento do dia
  SELECT procedure_name, count(*)::int as qtd INTO v_top_proc
  FROM appointments
  WHERE clinic_id = v_clinic_id AND deleted_at IS NULL
    AND scheduled_date = v_target AND status = 'finalizado'
    AND procedure_name IS NOT NULL AND procedure_name != ''
    AND (v_scope = 'full' OR v_scope = 'team' OR professional_id = v_prof_id)
  GROUP BY procedure_name ORDER BY count(*) DESC LIMIT 1;

  -- Lista de pendentes (ainda agendados)
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'time', LEFT(a.start_time::text, 5),
      'patient', a.patient_name,
      'procedure', COALESCE(NULLIF(a.procedure_name,''), 'Consulta')
    ) ORDER BY a.start_time
  ), '[]'::jsonb) INTO v_appts
  FROM appointments a
  WHERE a.clinic_id = v_clinic_id AND a.deleted_at IS NULL
    AND a.scheduled_date = v_target AND a.status = 'agendado'
    AND (v_scope = 'full' OR v_scope = 'team' OR a.professional_id = v_prof_id);

  RETURN jsonb_build_object(
    'ok', true,
    'date', v_target,
    'total', v_stats.total,
    'finalizados', v_stats.finalizados,
    'pendentes', v_stats.pendentes,
    'cancelados', v_stats.cancelados,
    'no_shows', v_stats.no_shows,
    'receita', v_stats.receita,
    'primeiro_horario', v_stats.primeiro_horario,
    'ultimo_horario', v_stats.ultimo_horario,
    'top_procedimento', v_top_proc.procedure_name,
    'top_qtd', v_top_proc.qtd,
    'pendentes_lista', v_appts
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_day_summary(text, date) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public._fmt_day_summary(p jsonb) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE
  v_out text;
  v_item jsonb;
  v_date_br text;
BEGIN
  IF p IS NULL OR NOT (p->>'ok')::boolean THEN
    RETURN '⚠️ ' || COALESCE(p->>'error', 'erro');
  END IF;

  v_date_br := TO_CHAR((p->>'date')::date, 'DD/MM (Dy)');
  v_out := '📊 *Resumo — ' || v_date_br || E'*\n─────────────\n';
  v_out := v_out || 'Consultas: *' || (p->>'total') || E'*\n';
  v_out := v_out || 'Finalizadas: ' || (p->>'finalizados');
  IF (p->>'cancelados')::int > 0 THEN v_out := v_out || ' · Canceladas: ' || (p->>'cancelados'); END IF;
  IF (p->>'no_shows')::int > 0 THEN v_out := v_out || ' · No-show: ' || (p->>'no_shows'); END IF;
  v_out := v_out || E'\n';

  IF (p->>'receita')::numeric > 0 THEN
    v_out := v_out || 'Receita: *' || _money((p->>'receita')::numeric) || E'*\n';
  END IF;

  IF p->>'top_procedimento' IS NOT NULL THEN
    v_out := v_out || 'Top proc: ' || (p->>'top_procedimento') || ' (' || (p->>'top_qtd') || 'x)' || E'\n';
  END IF;

  IF p->>'primeiro_horario' IS NOT NULL THEN
    v_out := v_out || 'Horario: ' || LEFT(p->>'primeiro_horario', 5) ||
             CASE WHEN p->>'ultimo_horario' IS NOT NULL THEN ' – ' || LEFT(p->>'ultimo_horario', 5) ELSE '' END || E'\n';
  END IF;

  -- Pendentes
  IF jsonb_array_length(COALESCE(p->'pendentes_lista', '[]'::jsonb)) > 0 THEN
    v_out := v_out || E'\n⏳ *Ainda pendentes:*';
    FOR v_item IN SELECT * FROM jsonb_array_elements(p->'pendentes_lista') LOOP
      v_out := v_out || E'\n• ' || (v_item->>'time') || ' — ' || (v_item->>'patient') || ' · ' || (v_item->>'procedure');
    END LOOP;
  END IF;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public._fmt_day_summary(jsonb) TO authenticated, anon;


-- ============================================================
-- 2. PROXIMO PACIENTE
-- "qual meu proximo?" / "proximo paciente" / "quem e o proximo"
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_next_patient(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth     jsonb := wa_pro_resolve_phone(p_phone);
  v_clinic_id uuid;
  v_prof_id  uuid;
  v_scope    text;
  v_today    date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_now_time time := (now() AT TIME ZONE 'America/Sao_Paulo')::time;
  v_appt     record;
  v_profile  jsonb;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := COALESCE(v_auth->>'access_scope', 'own');

  SELECT * INTO v_appt
  FROM appointments
  WHERE clinic_id = v_clinic_id AND deleted_at IS NULL
    AND scheduled_date = v_today
    AND status IN ('agendado', 'pre_consulta')
    AND start_time >= v_now_time
    AND (v_scope = 'full' OR v_scope = 'team' OR professional_id = v_prof_id)
  ORDER BY start_time LIMIT 1;

  IF v_appt.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'has_next', false,
      'response', '📋 Nenhuma consulta pendente pro resto do dia.');
  END IF;

  -- Carrega mini-perfil do paciente
  v_profile := wa_pro_patient_profile(p_phone, v_appt.patient_id::text);

  RETURN jsonb_build_object(
    'ok', true,
    'has_next', true,
    'time', LEFT(v_appt.start_time::text, 5),
    'patient_name', v_appt.patient_name,
    'procedure', COALESCE(NULLIF(v_appt.procedure_name,''), 'Consulta'),
    'patient_id', v_appt.patient_id,
    'profile', v_profile
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_next_patient(text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public._fmt_next_patient(p jsonb) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_out text; v_profile jsonb;
BEGIN
  IF NOT (p->>'has_next')::boolean THEN
    RETURN p->>'response';
  END IF;

  v_out := '⏰ *Proximo — ' || (p->>'time') || E'*\n─────────────\n';
  v_out := v_out || '*' || (p->>'patient_name') || '* · ' || (p->>'procedure');

  v_profile := p->'profile';
  IF v_profile IS NOT NULL AND (v_profile->>'ok')::boolean THEN
    v_out := v_out || E'\n' || _fmt_patient_profile(v_profile);
  END IF;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public._fmt_next_patient(jsonb) TO authenticated, anon;


-- ============================================================
-- 3. BUSCA POR PROCEDIMENTO
-- "quem fez botox esse mes?" / "pacientes de limpeza de pele"
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_patients_by_procedure(
  p_phone text,
  p_procedure text,
  p_start date DEFAULT NULL,
  p_end   date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth      jsonb := wa_pro_resolve_phone(p_phone);
  v_clinic_id uuid;
  v_prof_id   uuid;
  v_scope     text;
  v_results   jsonb;
  v_start     date;
  v_end       date;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := COALESCE(v_auth->>'access_scope', 'own');
  v_start     := COALESCE(p_start, date_trunc('month', CURRENT_DATE)::date);
  v_end       := COALESCE(p_end, CURRENT_DATE);

  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.last_date DESC), '[]'::jsonb)
  INTO v_results
  FROM (
    SELECT
      a.patient_name AS name,
      a.patient_id::text AS id,
      count(*)::int AS qtd,
      MAX(a.scheduled_date) AS last_date,
      COALESCE(SUM(a.value), 0) AS total_valor
    FROM appointments a
    WHERE a.clinic_id = v_clinic_id AND a.deleted_at IS NULL
      AND a.status = 'finalizado'
      AND a.scheduled_date BETWEEN v_start AND v_end
      AND a.procedure_name ~* p_procedure
      AND (v_scope = 'full' OR v_scope = 'team' OR a.professional_id = v_prof_id)
    GROUP BY a.patient_name, a.patient_id
  ) r;

  RETURN jsonb_build_object(
    'ok', true,
    'procedure', p_procedure,
    'period_start', v_start,
    'period_end', v_end,
    'count', jsonb_array_length(v_results),
    'patients', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_patients_by_procedure(text, text, date, date) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public._fmt_patients_by_procedure(p jsonb) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_out text; v_item jsonb; v_i int := 0;
BEGIN
  IF NOT (p->>'ok')::boolean THEN RETURN '⚠️ ' || COALESCE(p->>'error', 'erro'); END IF;

  IF (p->>'count')::int = 0 THEN
    RETURN '🔍 Nenhum paciente fez *' || (p->>'procedure') || '* no periodo.';
  END IF;

  v_out := '💉 *' || INITCAP(p->>'procedure') || '* — ' ||
           TO_CHAR((p->>'period_start')::date, 'DD/MM') || ' a ' ||
           TO_CHAR((p->>'period_end')::date, 'DD/MM') || E'\n─────────────\n';
  v_out := v_out || 'Pacientes: *' || (p->>'count') || '*';

  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'patients') LOOP
    v_i := v_i + 1;
    IF v_i > 10 THEN v_out := v_out || E'\n... e mais ' || ((p->>'count')::int - 10); EXIT; END IF;
    v_out := v_out || E'\n' || v_i || '. *' || (v_item->>'name') || '* — ' ||
             (v_item->>'qtd') || 'x · ' || _money((v_item->>'total_valor')::numeric) ||
             ' · ultimo ' || TO_CHAR((v_item->>'last_date')::date, 'DD/MM');
  END LOOP;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public._fmt_patients_by_procedure(jsonb) TO authenticated, anon;


-- ============================================================
-- 4. LISTA DE DEVEDORES
-- "quem me deve?" / "devedores" / "quem me deve mais de 500"
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_debtors(
  p_phone text,
  p_min_value numeric DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth      jsonb := wa_pro_resolve_phone(p_phone);
  v_clinic_id uuid;
  v_prof_id   uuid;
  v_scope     text;
  v_results   jsonb;
  v_total     numeric;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := COALESCE(v_auth->>'access_scope', 'own');

  SELECT COALESCE(jsonb_agg(row_to_json(r)::jsonb ORDER BY r.saldo DESC), '[]'::jsonb),
         COALESCE(SUM(r.saldo), 0)
  INTO v_results, v_total
  FROM (
    SELECT
      a.patient_name AS name,
      a.patient_id::text AS id,
      l.phone,
      COALESCE(SUM(a.value), 0) AS total,
      COALESCE(SUM(CASE WHEN a.payment_status = 'pago' THEN a.value ELSE 0 END), 0) AS pago,
      COALESCE(SUM(a.value), 0) - COALESCE(SUM(CASE WHEN a.payment_status = 'pago' THEN a.value ELSE 0 END), 0) AS saldo
    FROM appointments a
    LEFT JOIN leads l ON l.id = a.patient_id::text AND l.deleted_at IS NULL
    WHERE a.clinic_id = v_clinic_id AND a.deleted_at IS NULL
      AND a.status = 'finalizado'
      AND (v_scope = 'full' OR v_scope = 'team' OR a.professional_id = v_prof_id)
    GROUP BY a.patient_name, a.patient_id, l.phone
    HAVING COALESCE(SUM(a.value), 0) - COALESCE(SUM(CASE WHEN a.payment_status = 'pago' THEN a.value ELSE 0 END), 0) > p_min_value
  ) r;

  RETURN jsonb_build_object(
    'ok', true,
    'min_value', p_min_value,
    'count', jsonb_array_length(v_results),
    'total_saldo', v_total,
    'debtors', v_results
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_debtors(text, numeric) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public._fmt_debtors(p jsonb) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_out text; v_item jsonb; v_i int := 0;
BEGIN
  IF NOT (p->>'ok')::boolean THEN RETURN '⚠️ ' || COALESCE(p->>'error', 'erro'); END IF;

  IF (p->>'count')::int = 0 THEN
    RETURN '💰 Nenhum devedor' ||
           CASE WHEN (p->>'min_value')::numeric > 0 THEN ' acima de ' || _money((p->>'min_value')::numeric) ELSE '' END || '.';
  END IF;

  v_out := '💰 *Devedores' ||
           CASE WHEN (p->>'min_value')::numeric > 0 THEN ' (> ' || _money((p->>'min_value')::numeric) || ')' ELSE '' END ||
           E'*\n─────────────\n';
  v_out := v_out || 'Total: *' || (p->>'count') || '* pacientes · *' || _money((p->>'total_saldo')::numeric) || '*';

  FOR v_item IN SELECT * FROM jsonb_array_elements(p->'debtors') LOOP
    v_i := v_i + 1;
    IF v_i > 15 THEN v_out := v_out || E'\n... e mais ' || ((p->>'count')::int - 15); EXIT; END IF;
    v_out := v_out || E'\n' || v_i || '. *' || (v_item->>'name') || '* — *' ||
             _money((v_item->>'saldo')::numeric) || '*';
  END LOOP;

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public._fmt_debtors(jsonb) TO authenticated, anon;


-- ============================================================
-- 5. DASHBOARD DE USO DA MIRA
-- "uso da mira" / "consumo whisper" / "quanto gastei de voz"
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_mira_usage(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth      jsonb := wa_pro_resolve_phone(p_phone);
  v_clinic_id uuid;
  v_prof_id   uuid;
  v_today     date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_month     date := date_trunc('month', (now() AT TIME ZONE 'America/Sao_Paulo'))::date;
  v_voice     record;
  v_queries   record;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;

  -- Voice usage this month
  SELECT
    count(*)::int AS total_transcriptions,
    count(*) FILTER (WHERE status = 'ok')::int AS successful,
    COALESCE(SUM(duration_s), 0)::int AS total_seconds,
    ROUND(COALESCE(SUM(duration_s), 0) / 60.0, 1) AS total_minutes,
    COALESCE(SUM(cost_usd), 0) AS cost_usd
  INTO v_voice
  FROM wa_pro_transcripts
  WHERE clinic_id = v_clinic_id AND created_at >= v_month;

  -- Query usage today + month
  SELECT
    count(*) FILTER (WHERE created_at::date = v_today)::int AS today_queries,
    count(*)::int AS month_queries,
    count(*) FILTER (WHERE success = true AND created_at::date = v_today)::int AS today_success,
    count(*) FILTER (WHERE success = true)::int AS month_success
  INTO v_queries
  FROM wa_pro_audit_log
  WHERE clinic_id = v_clinic_id AND created_at >= v_month;

  RETURN jsonb_build_object(
    'ok', true,
    'month', TO_CHAR(v_month, 'MM/YYYY'),
    'voice', jsonb_build_object(
      'transcriptions', v_voice.total_transcriptions,
      'successful', v_voice.successful,
      'minutes', v_voice.total_minutes,
      'cost_usd', v_voice.cost_usd,
      'cost_brl', ROUND(v_voice.cost_usd * 5.5, 2)
    ),
    'queries', jsonb_build_object(
      'today', v_queries.today_queries,
      'today_success', v_queries.today_success,
      'month', v_queries.month_queries,
      'month_success', v_queries.month_success
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_mira_usage(text) TO authenticated, anon;

CREATE OR REPLACE FUNCTION public._fmt_mira_usage(p jsonb) RETURNS text
LANGUAGE plpgsql AS $$
DECLARE v_out text; v_voice jsonb; v_queries jsonb;
BEGIN
  IF NOT (p->>'ok')::boolean THEN RETURN '⚠️ ' || COALESCE(p->>'error', 'erro'); END IF;

  v_voice   := p->'voice';
  v_queries := p->'queries';

  v_out := '🤖 *Uso da Mira — ' || (p->>'month') || E'*\n─────────────\n';
  v_out := v_out || E'*Hoje:* ' || (v_queries->>'today') || ' consultas (' ||
           (v_queries->>'today_success') || ' ok)' || E'\n';
  v_out := v_out || E'*Mes:* ' || (v_queries->>'month') || ' consultas (' ||
           (v_queries->>'month_success') || ' ok)' || E'\n';
  v_out := v_out || E'\n🎙️ *Voice (Whisper)*\n';
  v_out := v_out || 'Audios: ' || (v_voice->>'transcriptions') || ' (' || (v_voice->>'successful') || ' ok)' || E'\n';
  v_out := v_out || 'Minutos: ' || (v_voice->>'minutes') || E'\n';
  v_out := v_out || 'Custo: $' || (v_voice->>'cost_usd') || ' (~R$ ' || (v_voice->>'cost_brl') || ')';

  RETURN v_out;
END;
$$;

GRANT EXECUTE ON FUNCTION public._fmt_mira_usage(jsonb) TO authenticated, anon;


COMMENT ON FUNCTION public.wa_pro_day_summary(text, date) IS 'Resumo executivo do dia: consultas, receita, no-shows, pendentes';
COMMENT ON FUNCTION public.wa_pro_next_patient(text) IS 'Proximo paciente agendado hoje (inclui perfil)';
COMMENT ON FUNCTION public.wa_pro_patients_by_procedure(text, text, date, date) IS 'Busca pacientes por procedimento no periodo';
COMMENT ON FUNCTION public.wa_pro_debtors(text, numeric) IS 'Lista devedores com saldo > min_value';
COMMENT ON FUNCTION public.wa_pro_mira_usage(text) IS 'Dashboard de uso da Mira: queries + voice + custo';
