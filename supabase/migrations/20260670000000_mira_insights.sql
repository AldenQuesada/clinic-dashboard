-- Sprint Insights — 4 features proativas baseadas em pattern detection
--
-- 🎂 wa_pro_birthday_alerts          — aniversariantes hoje (cron 7h)
-- 💤 wa_pro_inactivity_radar         — VIPs sumidos 60+ dias (cron sexta 18h)
-- 📈 wa_pro_weekly_roundup           — resumo semana passada (cron seg 7h)
-- 🔄 wa_pro_followup_suggestions     — 30/60/90 dias pos-procedimento (cron diario)

-- ============================================================
-- 🎂 Birthday Alerts
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_birthday_alerts(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth       jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id  uuid;
  v_first_name text;
  v_today      date := _today_br();
  v_items      jsonb;
  v_count      int;
  v_out        text;
  v_item       jsonb;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_first_name := SPLIT_PART(COALESCE(v_auth->>'name', 'Doutor(a)'), ' ', 1);

  SELECT
    count(*),
    COALESCE(jsonb_agg(jsonb_build_object(
      'name', name,
      'phone', phone,
      'age', EXTRACT(year FROM age(v_today, birth_date::date))::int,
      'birth_date', birth_date
    ) ORDER BY name), '[]'::jsonb)
  INTO v_count, v_items
  FROM public.leads
  WHERE clinic_id = v_clinic_id
    AND deleted_at IS NULL
    AND birth_date IS NOT NULL
    AND birth_date != ''
    AND TO_CHAR(birth_date::date, 'MM-DD') = TO_CHAR(v_today, 'MM-DD');

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'triggered', false, 'count', 0);
  END IF;

  v_out := '🎂 *Aniversariantes de hoje*' || E'\n─────────────';
  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_out := v_out || E'\n• *' || (v_item->>'name') || '* — ' || (v_item->>'age') || ' anos';
    IF NULLIF(v_item->>'phone', '') IS NOT NULL THEN
      v_out := v_out || E'\n  📱 ' || (v_item->>'phone');
    END IF;
  END LOOP;
  v_out := v_out || E'\n─────────────\n💡 _Que tal mandar uma mensagem de parabens?_';

  RETURN jsonb_build_object(
    'ok', true,
    'triggered', true,
    'phone', p_phone,
    'count', v_count,
    'message', v_out,
    'patients', v_items
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_birthday_alerts(text) TO authenticated, anon;

-- ============================================================
-- 💤 Inactivity Radar (pacientes VIP sumidos)
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_inactivity_radar(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth       jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id  uuid;
  v_scope      text;
  v_first_name text;
  v_today      date := _today_br();
  v_items      jsonb;
  v_count      int;
  v_total_potential numeric := 0;
  v_out        text;
  v_item       jsonb;
  v_i          int := 0;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_scope     := v_auth->>'access_scope';
  v_first_name := SPLIT_PART(COALESCE(v_auth->>'name', 'Doutor(a)'), ' ', 1);

  -- Pacientes com ultimo atendimento finalizado > 60 dias, ranked por total historico gasto
  WITH patient_stats AS (
    SELECT
      a.patient_id,
      MAX(a.patient_name) AS patient_name,
      MAX(a.scheduled_date) AS last_visit,
      COUNT(*) AS visit_count,
      SUM(a.value) AS lifetime_value,
      (v_today - MAX(a.scheduled_date)) AS days_since_last
    FROM public.appointments a
    WHERE a.clinic_id = v_clinic_id
      AND a.deleted_at IS NULL
      AND a.status = 'finalizado'
      AND a.patient_id IS NOT NULL
    GROUP BY a.patient_id
  )
  SELECT
    count(*),
    COALESCE(jsonb_agg(jsonb_build_object(
      'patient_id', patient_id,
      'name', patient_name,
      'last_visit', last_visit,
      'days_since_last', days_since_last,
      'lifetime_value', lifetime_value,
      'visit_count', visit_count
    ) ORDER BY lifetime_value DESC), '[]'::jsonb),
    COALESCE(SUM(lifetime_value), 0)
  INTO v_count, v_items, v_total_potential
  FROM patient_stats
  WHERE days_since_last BETWEEN 60 AND 365  -- entre 60 dias e 1 ano (>1 ano é cold)
    AND lifetime_value > 500;  -- só quem já gastou 500+ (VIPs)

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'triggered', false, 'count', 0);
  END IF;

  v_out := '💤 *Radar de Pacientes Sumidos*' || E'\n─────────────\n' ||
           'VIPs com 60+ dias sem vir. *Revenue potencial: ' || _money(v_total_potential) || '*' || E'\n';

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_i := v_i + 1;
    IF v_i > 10 THEN EXIT; END IF;
    v_out := v_out || E'\n' || v_i || '. *' || (v_item->>'name') || '*' ||
             E'\n   ' || (v_item->>'days_since_last') || ' dias sem vir · ' ||
             _money((v_item->>'lifetime_value')::numeric) || ' gasto · ' ||
             (v_item->>'visit_count') || ' consulta(s)';
  END LOOP;

  IF v_count > 10 THEN
    v_out := v_out || E'\n\n_... e mais ' || (v_count - 10) || '_';
  END IF;

  v_out := v_out || E'\n─────────────\n💡 _Vale uma campanha de reativacao?_';

  RETURN jsonb_build_object(
    'ok', true,
    'triggered', true,
    'phone', p_phone,
    'count', v_count,
    'total_potential', v_total_potential,
    'message', v_out
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_inactivity_radar(text) TO authenticated, anon;

-- ============================================================
-- 📈 Weekly Roundup (segunda 7h)
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_weekly_roundup(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth       jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id  uuid;
  v_scope      text;
  v_first_name text;
  v_today      date := _today_br();
  -- Semana passada: seg a dom anterior
  v_lw_start   date;
  v_lw_end     date;
  -- Antepenultima semana pra comparar
  v_pw_start   date;
  v_pw_end     date;
  v_lw_revenue numeric := 0;
  v_lw_count   int := 0;
  v_pw_revenue numeric := 0;
  v_pw_count   int := 0;
  v_delta_pct  numeric;
  v_top_patients jsonb;
  v_top_procs    jsonb;
  v_new_count    int;
  v_out        text;
  v_item       jsonb;
  v_i          int := 0;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_scope     := v_auth->>'access_scope';
  v_first_name := SPLIT_PART(COALESCE(v_auth->>'name', 'Doutor(a)'), ' ', 1);

  -- Semana passada: segunda a domingo anterior a hoje
  v_lw_end := v_today - ((EXTRACT(dow FROM v_today)::int + 6) % 7)::int - 1;
  v_lw_start := v_lw_end - 6;
  v_pw_end := v_lw_start - 1;
  v_pw_start := v_pw_end - 6;

  -- Revenue semana passada
  SELECT COUNT(*), COALESCE(SUM(value), 0)
  INTO v_lw_count, v_lw_revenue
  FROM public.appointments
  WHERE clinic_id = v_clinic_id AND deleted_at IS NULL
    AND scheduled_date BETWEEN v_lw_start AND v_lw_end
    AND status = 'finalizado' AND payment_status = 'pago';

  -- Revenue antepenultima
  SELECT COUNT(*), COALESCE(SUM(value), 0)
  INTO v_pw_count, v_pw_revenue
  FROM public.appointments
  WHERE clinic_id = v_clinic_id AND deleted_at IS NULL
    AND scheduled_date BETWEEN v_pw_start AND v_pw_end
    AND status = 'finalizado' AND payment_status = 'pago';

  IF v_pw_revenue > 0 THEN
    v_delta_pct := ROUND(((v_lw_revenue - v_pw_revenue) / v_pw_revenue * 100)::numeric, 1);
  END IF;

  -- Top 3 pacientes
  SELECT COALESCE(jsonb_agg(x ORDER BY x->>'value' DESC), '[]'::jsonb) INTO v_top_patients
  FROM (
    SELECT jsonb_build_object(
      'name', patient_name,
      'value', SUM(value)::numeric,
      'visits', COUNT(*)
    ) AS x
    FROM public.appointments
    WHERE clinic_id = v_clinic_id AND deleted_at IS NULL
      AND scheduled_date BETWEEN v_lw_start AND v_lw_end
      AND status = 'finalizado' AND payment_status = 'pago'
    GROUP BY patient_name
    ORDER BY SUM(value) DESC
    LIMIT 3
  ) y;

  -- Top 3 procedimentos
  SELECT COALESCE(jsonb_agg(x ORDER BY (x->>'count')::int DESC), '[]'::jsonb) INTO v_top_procs
  FROM (
    SELECT jsonb_build_object(
      'name', COALESCE(NULLIF(procedure_name, ''), 'Consulta'),
      'count', COUNT(*),
      'total', SUM(value)
    ) AS x
    FROM public.appointments
    WHERE clinic_id = v_clinic_id AND deleted_at IS NULL
      AND scheduled_date BETWEEN v_lw_start AND v_lw_end
      AND status = 'finalizado'
    GROUP BY COALESCE(NULLIF(procedure_name, ''), 'Consulta')
    ORDER BY COUNT(*) DESC
    LIMIT 3
  ) y;

  -- Novos pacientes da semana (primeira aparicao)
  SELECT COUNT(DISTINCT a.patient_id) INTO v_new_count
  FROM public.appointments a
  WHERE a.clinic_id = v_clinic_id AND a.deleted_at IS NULL
    AND a.scheduled_date BETWEEN v_lw_start AND v_lw_end
    AND a.status = 'finalizado'
    AND NOT EXISTS (
      SELECT 1 FROM public.appointments prev
      WHERE prev.patient_id = a.patient_id
        AND prev.clinic_id = v_clinic_id
        AND prev.deleted_at IS NULL
        AND prev.scheduled_date < v_lw_start
        AND prev.status = 'finalizado'
    );

  -- Monta mensagem
  v_out := 'Bom dia ' || v_first_name || E'! ☀️\n\n' ||
           '📈 *Roundup da semana passada*' || E'\n─────────────\n' ||
           '*Periodo:* ' || TO_CHAR(v_lw_start, 'DD/MM') || ' a ' || TO_CHAR(v_lw_end, 'DD/MM') || E'\n\n' ||
           '💰 Faturamento: *' || _money(v_lw_revenue) || '*' || E'\n' ||
           '👥 Atendimentos: *' || v_lw_count || '*';
  IF v_new_count > 0 THEN
    v_out := v_out || E'\n🆕 Novos pacientes: *' || v_new_count || '*';
  END IF;

  IF v_delta_pct IS NOT NULL THEN
    v_out := v_out || E'\n' || CASE WHEN v_delta_pct >= 0 THEN '📈' ELSE '📉' END ||
             ' vs semana anterior: ' || CASE WHEN v_delta_pct >= 0 THEN '+' ELSE '' END ||
             REPLACE(v_delta_pct::text, '.', ',') || '% (' || _money(v_pw_revenue) || ')';
  END IF;

  IF jsonb_array_length(v_top_patients) > 0 THEN
    v_out := v_out || E'\n\n🏆 *Top pacientes*';
    v_i := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_top_patients) LOOP
      v_i := v_i + 1;
      v_out := v_out || E'\n' || v_i || '. ' || (v_item->>'name') || ' — ' || _money((v_item->>'value')::numeric);
    END LOOP;
  END IF;

  IF jsonb_array_length(v_top_procs) > 0 THEN
    v_out := v_out || E'\n\n⚕️ *Top procedimentos*';
    v_i := 0;
    FOR v_item IN SELECT * FROM jsonb_array_elements(v_top_procs) LOOP
      v_i := v_i + 1;
      v_out := v_out || E'\n' || v_i || '. ' || (v_item->>'name') || ' — ' || (v_item->>'count') || 'x';
    END LOOP;
  END IF;

  v_out := v_out || E'\n\nBora pra essa semana! 💪';

  RETURN jsonb_build_object(
    'ok', true,
    'triggered', v_lw_count > 0,
    'phone', p_phone,
    'revenue', v_lw_revenue,
    'count', v_lw_count,
    'delta_pct', v_delta_pct,
    'message', v_out
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_weekly_roundup(text) TO authenticated, anon;

-- ============================================================
-- 🔄 Smart Follow-up (cron diario)
-- Pacientes com atendimento ha exatamente 30/60/90 dias
-- ============================================================
CREATE OR REPLACE FUNCTION public.wa_pro_followup_suggestions(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth       jsonb := public.wa_pro_resolve_phone(p_phone);
  v_clinic_id  uuid;
  v_first_name text;
  v_today      date := _today_br();
  v_items      jsonb;
  v_count      int;
  v_out        text;
  v_item       jsonb;
  v_i          int := 0;
BEGIN
  IF NOT (v_auth->>'ok')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;
  v_clinic_id := (v_auth->>'clinic_id')::uuid;
  v_first_name := SPLIT_PART(COALESCE(v_auth->>'name', 'Doutor(a)'), ' ', 1);

  -- Pacientes cuja ultima visita foi ha exatamente 30, 60 ou 90 dias
  -- (janela de 1 dia pra evitar repeticao quando cron falha)
  WITH last_visits AS (
    SELECT DISTINCT ON (a.patient_id)
      a.patient_id, a.patient_name, a.scheduled_date, a.procedure_name,
      (v_today - a.scheduled_date) AS days_ago
    FROM public.appointments a
    WHERE a.clinic_id = v_clinic_id AND a.deleted_at IS NULL
      AND a.status = 'finalizado' AND a.patient_id IS NOT NULL
    ORDER BY a.patient_id, a.scheduled_date DESC
  )
  SELECT
    count(*),
    COALESCE(jsonb_agg(jsonb_build_object(
      'patient_name', patient_name,
      'last_visit', scheduled_date,
      'days_ago', days_ago,
      'procedure', procedure_name,
      'marker', CASE days_ago WHEN 30 THEN '30d' WHEN 60 THEN '60d' WHEN 90 THEN '90d' END
    )), '[]'::jsonb)
  INTO v_count, v_items
  FROM last_visits
  WHERE days_ago IN (30, 60, 90);

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', true, 'triggered', false, 'count', 0);
  END IF;

  v_out := '🔄 *Follow-up do dia*' || E'\n─────────────\n' ||
           'Pacientes que merecem atencao:';

  FOR v_item IN SELECT * FROM jsonb_array_elements(v_items) LOOP
    v_i := v_i + 1;
    IF v_i > 10 THEN EXIT; END IF;
    v_out := v_out || E'\n\n• ' || (v_item->>'marker') || ' · *' || (v_item->>'patient_name') || '*' ||
             CASE WHEN NULLIF(v_item->>'procedure', '') IS NOT NULL
                  THEN E'\n  ' || (v_item->>'procedure')
                  ELSE '' END;
  END LOOP;

  IF v_count > 10 THEN
    v_out := v_out || E'\n\n_... e mais ' || (v_count - 10) || '_';
  END IF;

  v_out := v_out || E'\n─────────────\n💡 _Hora de chamar pro retorno?_';

  RETURN jsonb_build_object(
    'ok', true,
    'triggered', true,
    'phone', p_phone,
    'count', v_count,
    'message', v_out
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_followup_suggestions(text) TO authenticated, anon;

COMMENT ON FUNCTION public.wa_pro_birthday_alerts(text)      IS '🎂 Aniversariantes de hoje (cron 7h)';
COMMENT ON FUNCTION public.wa_pro_inactivity_radar(text)     IS '💤 VIPs sumidos 60+ dias (cron sex 18h)';
COMMENT ON FUNCTION public.wa_pro_weekly_roundup(text)       IS '📈 Resumo semana passada (cron seg 7h)';
COMMENT ON FUNCTION public.wa_pro_followup_suggestions(text) IS '🔄 30/60/90 dias pos-atendimento (cron diario)';
