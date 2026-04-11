-- ============================================================
-- Migration: Fix consentimento_img — boolean → text 3-state
-- Frontend ja escreve 'pendente'/'assinado'/'recusado' mas o
-- schema original era boolean. Upsert falhava com
-- "invalid input syntax for type boolean: \"pendente\"".
-- ============================================================

-- ── 1. Remove default antigo (boolean) ─────────────────────

ALTER TABLE public.appointments
  ALTER COLUMN consentimento_img DROP DEFAULT;

-- ── 2. Muda tipo boolean → text preservando semantica ──────

ALTER TABLE public.appointments
  ALTER COLUMN consentimento_img TYPE text
  USING CASE
    WHEN consentimento_img IS NULL THEN 'pendente'
    WHEN consentimento_img::text = 'true'  THEN 'assinado'
    WHEN consentimento_img::text = 'false' THEN 'pendente'
    ELSE consentimento_img::text
  END;

-- ── 3. Novo default + CHECK constraint ─────────────────────

ALTER TABLE public.appointments
  ALTER COLUMN consentimento_img SET DEFAULT 'pendente';

ALTER TABLE public.appointments
  ALTER COLUMN consentimento_img SET NOT NULL;

ALTER TABLE public.appointments
  DROP CONSTRAINT IF EXISTS appointments_consentimento_img_check;

ALTER TABLE public.appointments
  ADD CONSTRAINT appointments_consentimento_img_check
  CHECK (consentimento_img IN ('pendente', 'assinado', 'recusado', 'nao_aplica'));

COMMENT ON COLUMN public.appointments.consentimento_img IS
  'Estado do TCLE de imagem: pendente|assinado|recusado|nao_aplica';

-- ── 4. appt_upsert — string direto, sem cast boolean ──────

CREATE OR REPLACE FUNCTION public.appt_upsert(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id   uuid := app_clinic_id();
  v_role        text := app_role();
  v_id          text;
  v_patient_id  uuid;
  v_prof_id     uuid;
  v_consent     text;
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_role NOT IN ('owner','admin','receptionist','therapist') THEN
    RAISE EXCEPTION 'Permissão insuficiente para salvar agendamento';
  END IF;

  v_id := p_data->>'id';
  IF v_id IS NULL OR trim(v_id) = '' THEN
    RAISE EXCEPTION 'Campo id é obrigatório';
  END IF;

  BEGIN v_patient_id := (p_data->>'pacienteId')::uuid;
  EXCEPTION WHEN others THEN v_patient_id := NULL; END;

  BEGIN v_prof_id := (p_data->>'_professionalId')::uuid;
  EXCEPTION WHEN others THEN v_prof_id := NULL; END;

  -- Normaliza consentimento: aceita string ou boolean legado
  v_consent := COALESCE(p_data->>'consentimentoImagem', 'pendente');
  IF v_consent NOT IN ('pendente','assinado','recusado','nao_aplica') THEN
    v_consent := CASE WHEN v_consent IN ('true','t','1') THEN 'assinado' ELSE 'pendente' END;
  END IF;

  INSERT INTO public.appointments (
    id, clinic_id,
    patient_id, patient_name,
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
    v_patient_id,
    COALESCE(p_data->>'pacienteNome', ''),
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
    v_consent,
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

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

-- ── 5. appt_sync_batch — mesma normalizacao ────────────────

CREATE OR REPLACE FUNCTION public.appt_sync_batch(p_appointments jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := app_clinic_id();
  v_role       text := app_role();
  v_inserted   int := 0;
  v_updated    int := 0;
  v_errors     int := 0;
  v_item       jsonb;
  v_id         text;
  v_patient_id uuid;
  v_prof_id    uuid;
  v_exists     boolean;
  v_consent    text;
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_role NOT IN ('owner','admin','receptionist','therapist') THEN
    RAISE EXCEPTION 'Permissão insuficiente';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_appointments) LOOP
    BEGIN
      v_id := v_item->>'id';
      IF v_id IS NULL OR trim(v_id) = '' THEN CONTINUE; END IF;
      IF v_item->>'data' IS NULL THEN CONTINUE; END IF;

      SELECT EXISTS(
        SELECT 1 FROM public.appointments WHERE id = v_id AND clinic_id = v_clinic_id
      ) INTO v_exists;

      BEGIN v_patient_id := (v_item->>'pacienteId')::uuid;
      EXCEPTION WHEN others THEN v_patient_id := NULL; END;

      BEGIN v_prof_id := (v_item->>'_professionalId')::uuid;
      EXCEPTION WHEN others THEN v_prof_id := NULL; END;

      v_consent := COALESCE(v_item->>'consentimentoImagem', 'pendente');
      IF v_consent NOT IN ('pendente','assinado','recusado','nao_aplica') THEN
        v_consent := CASE WHEN v_consent IN ('true','t','1') THEN 'assinado' ELSE 'pendente' END;
      END IF;

      INSERT INTO public.appointments (
        id, clinic_id,
        patient_id, patient_name,
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
        v_patient_id,
        COALESCE(v_item->>'pacienteNome', ''),
        v_prof_id,
        (v_item->>'profissionalIdx')::integer,
        COALESCE(v_item->>'profissionalNome', ''),
        (v_item->>'salaIdx')::integer,
        (v_item->>'data')::date,
        (v_item->>'horaInicio')::time,
        (v_item->>'horaFim')::time,
        COALESCE(v_item->>'procedimento', ''),
        COALESCE((v_item->>'valor')::numeric, 0),
        v_item->>'formaPagamento',
        COALESCE(v_item->>'statusPagamento', 'pendente'),
        v_item->>'tipoConsulta',
        v_item->>'tipoAvaliacao',
        COALESCE(v_item->>'status', 'agendado'),
        v_item->>'origem',
        v_item->>'obs',
        COALESCE((v_item->>'confirmacaoEnviada')::boolean, false),
        v_consent,
        COALESCE(v_item->>'presenca', 'aguardando'),
        (v_item->>'chegada_em')::timestamptz,
        (v_item->>'canceladoEm')::timestamptz,
        v_item->>'motivoCancelamento',
        (v_item->>'noShowEm')::timestamptz,
        v_item->>'motivoNoShow',
        COALESCE(v_item->'historicoAlteracoes', '[]'::jsonb),
        COALESCE(v_item->'historicoStatus',    '[]'::jsonb),
        COALESCE((v_item->>'createdAt')::timestamptz, now())
      )
      ON CONFLICT (id) DO UPDATE SET
        patient_id           = EXCLUDED.patient_id,
        patient_name         = EXCLUDED.patient_name,
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

      IF v_exists THEN v_updated := v_updated + 1;
      ELSE v_inserted := v_inserted + 1; END IF;

    EXCEPTION WHEN others THEN
      v_errors := v_errors + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'inserted', v_inserted,
    'updated',  v_updated,
    'errors',   v_errors
  );
END;
$$;

COMMENT ON FUNCTION public.appt_upsert     IS 'Upsert v2: consentimento_img aceita string (pendente/assinado/recusado)';
COMMENT ON FUNCTION public.appt_sync_batch IS 'Sync batch v2: consentimento_img aceita string';
