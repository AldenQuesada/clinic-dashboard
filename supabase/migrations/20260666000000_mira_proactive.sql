-- Mira Proactive — 4 features wow baseadas em cron
--
-- 🥇 wa_pro_daily_digest(phone)         → resumo 7h
-- 🥈 wa_pro_evening_digest(phone)       → fechamento 20h
-- 🩺 wa_pro_pre_consult_alerts(phone)   → alertas 10min antes (cron a cada 5min)
-- 🎯 wa_pro_anomaly_check(phone)        → detecta faturamento > 3σ
-- ⚙️  wa_pro_active_digest_recipients() → helper pra n8n iterar

-- ============================================================
-- 🥇 Daily Digest — 07:00 seg-sab
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_daily_digest(p_phone text)
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
  v_first_name text;
  v_total      int;
  v_new        int;
  v_return     int;
  v_value      numeric;
  v_items      jsonb;
  v_item       jsonb;
  v_out        text;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := v_auth->>'access_scope';
  v_first_name := SPLIT_PART(COALESCE(v_auth->>'name', 'Doutor(a)'), ' ', 1);

  -- Agenda hoje + classifica novo/retorno via historico
  WITH today_appts AS (
    SELECT
      a.id,
      a.start_time,
      a.patient_name,
      a.patient_id,
      a.procedure_name,
      a.value,
      a.status,
      (SELECT count(*) FROM public.appointments prev
       WHERE prev.patient_id = a.patient_id
         AND prev.clinic_id = v_clinic_id
         AND prev.scheduled_date < CURRENT_DATE
         AND prev.status = 'finalizado'
         AND prev.deleted_at IS NULL
      ) AS prior_visits
    FROM public.appointments a
    WHERE a.clinic_id = v_clinic_id
      AND a.deleted_at IS NULL
      AND a.scheduled_date = CURRENT_DATE
      AND a.status != 'cancelado'
      AND (v_scope IN ('full','team') OR a.professional_id = v_prof_id)
  )
  SELECT
    count(*),
    count(*) FILTER (WHERE prior_visits = 0),
    count(*) FILTER (WHERE prior_visits > 0),
    COALESCE(sum(value), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'time', start_time, 'patient', patient_name,
      'procedure', procedure_name, 'value', value,
      'is_new', prior_visits = 0
    ) ORDER BY start_time), '[]'::jsonb)
  INTO v_total, v_new, v_return, v_value, v_items
  FROM today_appts;

  IF v_total = 0 THEN
    v_out := 'Bom dia ' || v_first_name || E'! ☀️\n\nNenhum agendamento pra hoje. Dia livre! 🏖️';
  ELSE
    v_out := 'Bom dia ' || v_first_name || E'! ☀️\n\n' ||
             'Hoje voce tem *' || v_total || ' atendimento' || CASE WHEN v_total > 1 THEN 's' ELSE '' END || '*';
    IF v_new > 0 AND v_return > 0 THEN
      v_out := v_out || ' (' || v_new || ' novo' || CASE WHEN v_new > 1 THEN 's' ELSE '' END ||
               ' + ' || v_return || ' retorno' || CASE WHEN v_return > 1 THEN 's' ELSE '' END || ')';
    ELSIF v_new > 0 THEN
      v_out := v_out || ' (' || v_new || ' novo' || CASE WHEN v_new > 1 THEN 's' ELSE '' END || ')';
    ELSIF v_return > 0 THEN
      v_out := v_out || ' (' || v_return || ' retorno' || CASE WHEN v_return > 1 THEN 's' ELSE '' END || ')';
    END IF;

    IF v_value > 0 THEN
      v_out := v_out || E'\n💰 Valor previsto: *' || _money(v_value) || '*';
    END IF;

    v_out := v_out || E'\n\n📅 *Agenda:*';
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_items)
    LOOP
      v_out := v_out || E'\n• ' || LEFT(v_item->>'time', 5) ||
               CASE WHEN (v_item->>'is_new')::boolean THEN ' 🆕' ELSE '' END ||
               ' — ' || COALESCE(v_item->>'patient', '?');
      IF NULLIF(v_item->>'procedure', '') IS NOT NULL THEN
        v_out := v_out || ' · ' || (v_item->>'procedure');
      END IF;
    END LOOP;

    v_out := v_out || E'\n\nBom dia e bom trabalho! 💪';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'phone', p_phone,
    'message', v_out,
    'total', v_total,
    'new', v_new,
    'return', v_return,
    'value', v_value
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_daily_digest(text) TO authenticated, anon;


-- ============================================================
-- 🥈 Evening Digest — 20:00 seg-sab
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_evening_digest(p_phone text)
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
  v_first_name text;
  v_finalized  int;
  v_paid_value numeric;
  v_pending_list jsonb;
  v_tomorrow_count int;
  v_avg_30d    numeric;
  v_delta_pct  numeric;
  v_out        text;
  v_item       jsonb;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := v_auth->>'access_scope';
  v_first_name := SPLIT_PART(COALESCE(v_auth->>'name', 'Doutor(a)'), ' ', 1);

  -- Fechamento hoje
  SELECT
    count(*) FILTER (WHERE a.status = 'finalizado'),
    COALESCE(SUM(a.value) FILTER (WHERE a.status = 'finalizado' AND a.payment_status = 'pago'), 0),
    COALESCE(jsonb_agg(jsonb_build_object(
      'patient', a.patient_name, 'value', a.value
    )) FILTER (WHERE a.status = 'finalizado' AND a.payment_status != 'pago'), '[]'::jsonb)
  INTO v_finalized, v_paid_value, v_pending_list
  FROM public.appointments a
  WHERE a.clinic_id = v_clinic_id
    AND a.deleted_at IS NULL
    AND a.scheduled_date = CURRENT_DATE
    AND (v_scope IN ('full','team') OR a.professional_id = v_prof_id);

  -- Agendamentos amanha
  SELECT count(*) INTO v_tomorrow_count
  FROM public.appointments a
  WHERE a.clinic_id = v_clinic_id
    AND a.deleted_at IS NULL
    AND a.scheduled_date = CURRENT_DATE + 1
    AND a.status != 'cancelado'
    AND (v_scope IN ('full','team') OR a.professional_id = v_prof_id);

  -- Media ultimos 30 dias (exclui hoje) pra calcular delta
  SELECT COALESCE(AVG(daily_total), 0)
  INTO v_avg_30d
  FROM (
    SELECT a.scheduled_date, SUM(a.value) FILTER (WHERE a.status = 'finalizado') as daily_total
    FROM public.appointments a
    WHERE a.clinic_id = v_clinic_id
      AND a.deleted_at IS NULL
      AND a.scheduled_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1
      AND (v_scope IN ('full','team') OR a.professional_id = v_prof_id)
    GROUP BY a.scheduled_date
  ) daily WHERE daily_total > 0;

  IF v_avg_30d > 0 THEN
    v_delta_pct := ROUND(((v_paid_value - v_avg_30d) / v_avg_30d * 100)::numeric, 1);
  END IF;

  -- Monta mensagem
  IF v_finalized = 0 THEN
    v_out := '🌙 *Fechamento do dia — ' || v_first_name || E'*\n\nHoje sem atendimentos finalizados.';
    IF v_tomorrow_count > 0 THEN
      v_out := v_out || E'\n\nAmanha: *' || v_tomorrow_count || '* agendado' || CASE WHEN v_tomorrow_count > 1 THEN 's' ELSE '' END || '.';
    END IF;
  ELSE
    v_out := '🌙 *Fechamento do dia — ' || v_first_name || E'*\n─────────────\n' ||
             'Faturamento: *' || _money(v_paid_value) || '*' ||
             E'\nAtendimentos: ' || v_finalized;

    IF v_delta_pct IS NOT NULL THEN
      v_out := v_out || E'\n' || CASE WHEN v_delta_pct >= 0 THEN '📈' ELSE '📉' END ||
               ' vs media 30d: ' || CASE WHEN v_delta_pct >= 0 THEN '+' ELSE '' END ||
               REPLACE(v_delta_pct::text, '.', ',') || '% (' || _money(v_avg_30d) || ')';
    END IF;

    IF jsonb_array_length(v_pending_list) > 0 THEN
      v_out := v_out || E'\n\n⏳ *Pendentes de pagamento:*';
      FOR v_item IN SELECT * FROM jsonb_array_elements(v_pending_list) LOOP
        v_out := v_out || E'\n• ' || COALESCE(v_item->>'patient', '?') || ' — ' || _money((v_item->>'value')::numeric);
      END LOOP;
    END IF;

    IF v_tomorrow_count > 0 THEN
      v_out := v_out || E'\n\n📅 Amanha: *' || v_tomorrow_count || '* agendado' || CASE WHEN v_tomorrow_count > 1 THEN 's' ELSE '' END || '.';
    ELSE
      v_out := v_out || E'\n\n📅 Amanha: agenda livre.';
    END IF;

    v_out := v_out || E'\n\nBoa noite! 😴';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'phone', p_phone,
    'message', v_out,
    'finalized', v_finalized,
    'paid_value', v_paid_value,
    'delta_pct', v_delta_pct,
    'tomorrow_count', v_tomorrow_count
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_evening_digest(text) TO authenticated, anon;


-- ============================================================
-- 🩺 Pre-Consult Alerts — cron a cada 5min
-- ============================================================
-- Retorna appointments que comecam em ~10min (janela 8-12min)
-- pra profissionais specificados. n8n itera e envia.
CREATE OR REPLACE FUNCTION public.wa_pro_pre_consult_alerts(p_phone text)
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
  v_alerts     jsonb;
  v_out_list   jsonb := '[]'::jsonb;
  v_item       jsonb;
  v_msg        text;
  v_first_name text;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := v_auth->>'access_scope';
  v_first_name := SPLIT_PART(COALESCE(v_auth->>'name', 'Doutor(a)'), ' ', 1);

  -- Janela: appointments que comecam entre 8 e 13 min a partir de agora
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', a.id,
    'time', a.start_time,
    'patient', a.patient_name,
    'patient_id', a.patient_id,
    'procedure', a.procedure_name,
    'value', a.value,
    'minutes_until', EXTRACT(EPOCH FROM (
      (a.scheduled_date::timestamp + a.start_time::interval) - now()
    ))::int / 60
  )), '[]'::jsonb)
  INTO v_alerts
  FROM public.appointments a
  WHERE a.clinic_id = v_clinic_id
    AND a.deleted_at IS NULL
    AND a.scheduled_date = CURRENT_DATE
    AND a.status IN ('agendado', 'confirmado')
    AND (v_scope IN ('full','team') OR a.professional_id = v_prof_id)
    AND (a.scheduled_date::timestamp + a.start_time::interval) BETWEEN now() + interval '8 minutes' AND now() + interval '13 minutes';

  -- Monta mensagem por appointment
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_alerts) LOOP
    v_msg := '⏰ *' || (v_item->>'patient') || '* chega em ~' || (v_item->>'minutes_until') || E'min\n─────────────\n' ||
             'Horario: ' || LEFT(v_item->>'time', 5);
    IF NULLIF(v_item->>'procedure', '') IS NOT NULL THEN
      v_msg := v_msg || E'\nProcedimento: ' || (v_item->>'procedure');
    END IF;
    IF (v_item->>'value')::numeric > 0 THEN
      v_msg := v_msg || E'\nValor: ' || _money((v_item->>'value')::numeric);
    END IF;
    -- Historico: ultimas visitas
    v_msg := v_msg || E'\n\n';

    v_out_list := v_out_list || jsonb_build_object(
      'phone', p_phone,
      'message', v_msg,
      'appointment_id', v_item->>'id'
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'alerts', v_out_list, 'count', jsonb_array_length(v_out_list));
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_pre_consult_alerts(text) TO authenticated, anon;


-- ============================================================
-- 🎯 Anomaly Check — 22:00 diario
-- ============================================================
-- Compara faturamento do dia vs media 30d. Flag se > 2σ
CREATE OR REPLACE FUNCTION public.wa_pro_anomaly_check(p_phone text)
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
  v_first_name text;
  v_today_val  numeric;
  v_avg        numeric;
  v_stddev     numeric;
  v_delta_sigma numeric;
  v_out        text;
  v_triggered  boolean := false;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_prof_id   := (v_auth->>'professional_id')::uuid;
  v_scope     := v_auth->>'access_scope';
  v_first_name := SPLIT_PART(COALESCE(v_auth->>'name', 'Doutor(a)'), ' ', 1);

  -- Faturamento hoje
  SELECT COALESCE(SUM(value), 0) INTO v_today_val
  FROM public.appointments
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND scheduled_date = CURRENT_DATE
    AND status = 'finalizado' AND payment_status = 'pago'
    AND (v_scope IN ('full','team') OR professional_id = v_prof_id);

  -- Media + stddev ultimos 30d (excluindo dias zerados e hoje)
  SELECT AVG(daily_total), STDDEV(daily_total)
  INTO v_avg, v_stddev
  FROM (
    SELECT scheduled_date, SUM(value) as daily_total
    FROM public.appointments
    WHERE clinic_id = v_clinic_id
      AND deleted_at IS NULL
      AND scheduled_date BETWEEN CURRENT_DATE - 30 AND CURRENT_DATE - 1
      AND status = 'finalizado' AND payment_status = 'pago'
      AND (v_scope IN ('full','team') OR professional_id = v_prof_id)
    GROUP BY scheduled_date
    HAVING SUM(value) > 0
  ) daily;

  IF v_avg IS NULL OR v_stddev IS NULL OR v_stddev = 0 THEN
    RETURN jsonb_build_object('ok', true, 'triggered', false, 'reason', 'insufficient_history');
  END IF;

  v_delta_sigma := ABS(v_today_val - v_avg) / v_stddev;

  -- Dispara se > 2 sigmas (top/bottom 2.5%)
  IF v_delta_sigma > 2 AND v_today_val > 0 THEN
    v_triggered := true;
    v_out := CASE
      WHEN v_today_val > v_avg THEN '📈 *Dia atipico — positivo!*'
      ELSE '📉 *Dia atipico — atencao*'
    END || E'\n─────────────\n' ||
    'Hoje: *' || _money(v_today_val) || E'*\n' ||
    'Media 30d: ' || _money(v_avg) || E'\n' ||
    'Desvio: ' || REPLACE(ROUND(v_delta_sigma, 1)::text, '.', ',') || 'σ (>2σ = notavel)';
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'triggered', v_triggered,
    'today', v_today_val,
    'avg_30d', v_avg,
    'stddev', v_stddev,
    'delta_sigma', v_delta_sigma,
    'message', v_out,
    'phone', p_phone
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_anomaly_check(text) TO authenticated, anon;


-- ============================================================
-- ⚙️  Helper: lista numeros ativos pra iterar em cron
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_active_digest_recipients()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'phone', n.phone,
    'instance_id', n.instance_id,
    'label', n.label,
    'professional_id', n.professional_id
  )), '[]'::jsonb)
  FROM public.wa_numbers n
  WHERE n.number_type = 'professional_private'
    AND n.is_active = true
    AND n.instance_id IS NOT NULL
    AND COALESCE((n.permissions->>'digest_enabled')::boolean, true) = true;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_active_digest_recipients() TO authenticated, anon;

COMMENT ON FUNCTION public.wa_pro_daily_digest(text)        IS '🥇 Resumo da manha: agenda + valor previsto + novos/retornos';
COMMENT ON FUNCTION public.wa_pro_evening_digest(text)      IS '🥈 Fechamento noite: faturamento + pendentes + delta 30d + amanha';
COMMENT ON FUNCTION public.wa_pro_pre_consult_alerts(text)  IS '🩺 Alertas consultas em ~10min (cron /5min)';
COMMENT ON FUNCTION public.wa_pro_anomaly_check(text)       IS '🎯 Deteccao de faturamento atipico via z-score 30d';
COMMENT ON FUNCTION public.wa_pro_active_digest_recipients() IS 'Lista numeros ativos pra n8n iterar';
