-- ============================================================
-- Migration: Fix appointment sync + Server-side daily summary
--
-- 1. Fix appt_upsert: fallback to hardcoded clinic_id when
--    app_clinic_id() is NULL (anon key without auth context)
-- 2. Create wa_daily_summary(): generates daily agenda message
--    and enqueues it in wa_outbox for the professional
-- 3. pg_cron job: runs at 11:00 UTC (08:00 BRT) every day
-- ============================================================

-- ── 1. Fix appt_upsert: allow sync without auth context ─────
CREATE OR REPLACE FUNCTION appt_upsert(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id   uuid;
  v_id          text;
  v_patient_id  text;
  v_prof_id     uuid;
  v_phone       text;
  v_lead        record;
BEGIN
  -- Fallback: se nao autenticado, usar clinic padrao
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN
    v_clinic_id := '00000000-0000-0000-0000-000000000001';
  END IF;

  v_id := p_data->>'id';
  IF v_id IS NULL OR trim(v_id) = '' THEN
    RAISE EXCEPTION 'Campo id obrigatorio';
  END IF;

  BEGIN
    v_prof_id := (p_data->>'_professionalId')::uuid;
  EXCEPTION WHEN others THEN
    v_prof_id := NULL;
  END;

  v_phone := normalize_phone(p_data->>'pacientePhone');
  v_patient_id := p_data->>'pacienteId';

  IF v_phone IS NOT NULL THEN
    SELECT id INTO v_lead
    FROM leads
    WHERE phone LIKE '%' || right(v_phone, 8)
      AND clinic_id = v_clinic_id
      AND deleted_at IS NULL
    LIMIT 1;
    IF v_lead IS NOT NULL THEN
      v_patient_id := v_lead.id;
    END IF;
  END IF;

  IF v_patient_id IS NOT NULL AND v_lead IS NULL THEN
    SELECT id INTO v_lead
    FROM leads
    WHERE id = v_patient_id
      AND clinic_id = v_clinic_id
      AND deleted_at IS NULL;
    IF NOT FOUND THEN
      SELECT id INTO v_lead
      FROM leads
      WHERE name ILIKE p_data->>'pacienteNome'
        AND clinic_id = v_clinic_id
        AND deleted_at IS NULL
      LIMIT 1;
      IF v_lead IS NOT NULL THEN
        v_patient_id := v_lead.id;
      END IF;
    END IF;
  END IF;

  INSERT INTO appointments (
    id, clinic_id,
    patient_id, patient_name, patient_phone,
    professional_id, professional_idx, professional_name,
    room_idx,
    scheduled_date, start_time, end_time,
    procedure_name, value, payment_method, payment_status,
    consult_type, eval_type,
    status, origem, obs,
    confirmacao_enviada, consentimento_img,
    presenca, chegada_em,
    cancelado_em, motivo_cancelamento,
    no_show_em, motivo_no_show,
    historico_alteracoes, historico_status,
    created_at
  ) VALUES (
    v_id, v_clinic_id,
    (SELECT CASE WHEN v_patient_id ~ '^[0-9a-f]{8}-' THEN v_patient_id::uuid ELSE NULL END),
    COALESCE(p_data->>'pacienteNome', ''),
    v_phone,
    v_prof_id,
    (p_data->>'profissionalIdx')::integer,
    COALESCE(p_data->>'profissionalNome', ''),
    (p_data->>'salaIdx')::integer,
    (p_data->>'data')::date,
    (p_data->>'horaInicio')::time,
    (p_data->>'horaFim')::time,
    COALESCE(p_data->>'procedimento', ''),
    COALESCE((p_data->>'valor')::numeric, 0),
    p_data->>'formaPagamento',
    COALESCE(p_data->>'statusPagamento', 'pendente'),
    p_data->>'tipoConsulta',
    p_data->>'tipoAvaliacao',
    COALESCE(p_data->>'status', 'agendado'),
    p_data->>'origem',
    p_data->>'obs',
    COALESCE((p_data->>'confirmacaoEnviada')::boolean, false),
    COALESCE((p_data->>'consentimentoImagem')::boolean, false),
    COALESCE(p_data->>'presenca', 'aguardando'),
    (p_data->>'chegada_em')::timestamptz,
    (p_data->>'canceladoEm')::timestamptz,
    p_data->>'motivoCancelamento',
    (p_data->>'noShowEm')::timestamptz,
    p_data->>'motivoNoShow',
    COALESCE(p_data->'historicoAlteracoes', '[]'::jsonb),
    COALESCE(p_data->'historicoStatus',    '[]'::jsonb),
    COALESCE((p_data->>'createdAt')::timestamptz, now())
  )
  ON CONFLICT (id) DO UPDATE SET
    patient_id           = EXCLUDED.patient_id,
    patient_name         = EXCLUDED.patient_name,
    patient_phone        = EXCLUDED.patient_phone,
    professional_id      = COALESCE(EXCLUDED.professional_id, appointments.professional_id),
    professional_idx     = EXCLUDED.professional_idx,
    professional_name    = EXCLUDED.professional_name,
    room_idx             = EXCLUDED.room_idx,
    scheduled_date       = EXCLUDED.scheduled_date,
    start_time           = EXCLUDED.start_time,
    end_time             = EXCLUDED.end_time,
    procedure_name       = EXCLUDED.procedure_name,
    value                = EXCLUDED.value,
    payment_method       = EXCLUDED.payment_method,
    payment_status       = EXCLUDED.payment_status,
    consult_type         = EXCLUDED.consult_type,
    eval_type            = EXCLUDED.eval_type,
    status               = EXCLUDED.status,
    origem               = EXCLUDED.origem,
    obs                  = EXCLUDED.obs,
    confirmacao_enviada  = EXCLUDED.confirmacao_enviada,
    consentimento_img    = EXCLUDED.consentimento_img,
    presenca             = EXCLUDED.presenca,
    chegada_em           = EXCLUDED.chegada_em,
    cancelado_em         = EXCLUDED.cancelado_em,
    motivo_cancelamento  = EXCLUDED.motivo_cancelamento,
    no_show_em           = EXCLUDED.no_show_em,
    motivo_no_show       = EXCLUDED.motivo_no_show,
    historico_alteracoes = EXCLUDED.historico_alteracoes,
    historico_status     = EXCLUDED.historico_status,
    updated_at           = now();

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'resolved_patient_id', v_patient_id);
END;
$$;

-- ── 2. Daily summary function (per-professional) ────────────
-- Sends a personalized daily agenda to EACH professional who
-- has appointments that day. Anti-duplicate per professional+day.
CREATE OR REPLACE FUNCTION wa_daily_summary()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id   uuid := '00000000-0000-0000-0000-000000000001';
  v_today       date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_today_txt   text;
  v_dow_names   text[] := ARRAY['Domingo','Segunda-feira','Terça-feira','Quarta-feira','Quinta-feira','Sexta-feira','Sábado'];
  v_dow         int;
  v_prof        record;
  v_appt        record;
  v_count       int;
  v_total_sent  int := 0;
  v_msg         text;
  v_body        text;
  v_idx         int;
  v_phone       text;
  v_sent_key    text;
  v_first_name  text;
BEGIN
  v_dow := EXTRACT(DOW FROM v_today)::int;
  v_today_txt := to_char(v_today, 'DD/MM/YYYY');

  -- Loop por cada profissional que tem agendamento hoje
  FOR v_prof IN
    SELECT DISTINCT a.professional_name, pp.whatsapp, pp.phone, pp.display_name
    FROM appointments a
    LEFT JOIN professional_profiles pp
      ON pp.display_name = a.professional_name AND pp.clinic_id = v_clinic_id
    WHERE a.clinic_id = v_clinic_id
      AND a.scheduled_date = v_today
      AND a.status NOT IN ('cancelado', 'no_show')
      AND (pp.whatsapp IS NOT NULL AND pp.whatsapp != ''
        OR pp.phone IS NOT NULL AND pp.phone != '')
  LOOP
    v_phone := regexp_replace(COALESCE(v_prof.whatsapp, v_prof.phone, ''), '[^0-9]', '', 'g');
    IF v_phone = '' THEN CONTINUE; END IF;
    IF length(v_phone) <= 11 THEN v_phone := '55' || v_phone; END IF;

    -- Anti-duplicidade por profissional + dia
    v_sent_key := 'daily_summary_' || v_today::text || '_' || md5(v_prof.professional_name);
    IF EXISTS (
      SELECT 1 FROM wa_outbox
      WHERE clinic_id = v_clinic_id AND appt_ref = v_sent_key
        AND status IN ('pending', 'processing', 'sent')
    ) THEN CONTINUE; END IF;

    -- Listar agendamentos deste profissional
    v_count := 0; v_body := ''; v_idx := 0;
    FOR v_appt IN
      SELECT patient_name, procedure_name, start_time, end_time, obs
      FROM appointments
      WHERE clinic_id = v_clinic_id
        AND scheduled_date = v_today
        AND professional_name = v_prof.professional_name
        AND status NOT IN ('cancelado', 'no_show')
      ORDER BY start_time
    LOOP
      v_idx := v_idx + 1; v_count := v_count + 1;
      v_body := v_body || v_idx || '. *' || COALESCE(v_appt.patient_name, 'Paciente') || '*' || E'\n';
      v_body := v_body || '   ' || COALESCE(v_appt.procedure_name, '—') || E'\n';
      v_body := v_body || '   ' || to_char(v_appt.start_time, 'HH24:MI');
      IF v_appt.end_time IS NOT NULL THEN
        v_body := v_body || ' - ' || to_char(v_appt.end_time, 'HH24:MI');
      END IF;
      v_body := v_body || E'\n';
      IF v_appt.obs IS NOT NULL AND v_appt.obs != '' THEN
        v_body := v_body || '   Obs: ' || v_appt.obs || E'\n';
      END IF;
      v_body := v_body || E'\n';
    END LOOP;

    IF v_count = 0 THEN CONTINUE; END IF;

    v_first_name := split_part(initcap(v_prof.display_name), ' ', 1);

    v_msg := '*Clínica — Agenda do Dia*' || E'\n';
    v_msg := v_msg || v_dow_names[v_dow + 1] || ', ' || v_today_txt || E'\n';
    v_msg := v_msg || v_count || ' agendamento' || CASE WHEN v_count > 1 THEN 's' ELSE '' END || E'\n';
    v_msg := v_msg || '━━━━━━━━━━━━━━━━━━━━━━' || E'\n\n';
    v_msg := v_msg || v_body;
    v_msg := v_msg || '━━━━━━━━━━━━━━━━━━━━━━' || E'\n';
    v_msg := v_msg || 'Bom dia e sucesso ' || v_first_name || '!';

    INSERT INTO wa_outbox (
      clinic_id, lead_id, phone, content,
      scheduled_at, status, priority, appt_ref
    ) VALUES (
      v_clinic_id, '', v_phone, v_msg,
      now(), 'pending', 2, v_sent_key
    );

    v_total_sent := v_total_sent + 1;
  END LOOP;

  RETURN v_total_sent;
END;
$$;

GRANT EXECUTE ON FUNCTION wa_daily_summary() TO anon, authenticated;

-- ── 3. pg_cron: todo dia as 11:00 UTC (08:00 BRT) ───────────
SELECT cron.schedule(
  'daily-agenda-summary',
  '0 11 * * *',
  'SELECT wa_daily_summary()'
);
