-- ============================================================
-- ClinicAI — Appointments (Sprint 6-A)
--
-- Design:
--   • id text PK — mantém formato 'appt_timestamp_random' do localStorage
--     para sincronização sem remapeamento de IDs
--   • professional_id uuid nullable — resolvido pelo serviço client-side
--     a partir do AgendaAccessService quando disponível
--   • patient_id uuid nullable — lead UUID; sem FK pois leads ficam
--     no localStorage (tabela patients será Sprint 7)
--   • Soft delete (deleted_at) — nunca perde histórico
--   • historicoAlteracoes / historicoStatus armazenados como JSONB
--   • RLS + SECURITY DEFINER RPCs como dupla camada de segurança
--   • Visibilidade por profissional respeitada via agenda_visibility
-- ============================================================

-- ── Tabela principal ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.appointments (
  id                   text          PRIMARY KEY,               -- 'appt_<ts>_<rand>'
  clinic_id            uuid          NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

  -- Paciente (UUID do lead — sem FK, leads estão no localStorage)
  patient_id           uuid,
  patient_name         text          NOT NULL DEFAULT '',

  -- Profissional
  professional_id      uuid          REFERENCES public.profiles(id) ON DELETE SET NULL,
  professional_idx     integer,                                  -- índice legado no array local
  professional_name    text          NOT NULL DEFAULT '',

  -- Sala (referência por índice, tabela de salas é localStorage)
  room_idx             integer,

  -- Agendamento
  scheduled_date       date          NOT NULL,
  start_time           time          NOT NULL,
  end_time             time          NOT NULL,

  -- Procedimento & Financeiro
  procedure_name       text          NOT NULL DEFAULT '',
  value                numeric(10,2) NOT NULL DEFAULT 0,
  payment_method       text,
  payment_status       text          NOT NULL DEFAULT 'pendente'
                       CHECK (payment_status IN ('pendente','parcial','pago')),

  -- Tipo de consulta
  consult_type         text,
  eval_type            text,

  -- Status (state machine definida em agenda-smart.js)
  status               text          NOT NULL DEFAULT 'agendado'
                       CHECK (status IN (
                         'agendado','aguardando_confirmacao','confirmado','aguardando',
                         'na_clinica','em_consulta','em_atendimento','finalizado',
                         'remarcado','cancelado','no_show'
                       )),

  -- Origem & Observações
  origem               text,
  obs                  text,

  -- Comunicação
  confirmacao_enviada  boolean       NOT NULL DEFAULT false,
  consentimento_img    boolean       NOT NULL DEFAULT false,

  -- Presença
  presenca             text          DEFAULT 'aguardando',
  chegada_em           timestamptz,

  -- Cancelamento
  cancelado_em         timestamptz,
  motivo_cancelamento  text,

  -- No-show
  no_show_em           timestamptz,
  motivo_no_show       text,

  -- Histórico JSONB (audit trail completo)
  historico_alteracoes jsonb         NOT NULL DEFAULT '[]',
  historico_status     jsonb         NOT NULL DEFAULT '[]',

  -- Soft delete & timestamps
  deleted_at           timestamptz,
  created_at           timestamptz   DEFAULT now(),
  updated_at           timestamptz   DEFAULT now()
);

COMMENT ON TABLE  public.appointments                    IS 'Agendamentos da clínica — sincronizado com localStorage via Supabase';
COMMENT ON COLUMN public.appointments.id                 IS 'ID no formato appt_<timestamp>_<random> — gerado pelo cliente';
COMMENT ON COLUMN public.appointments.patient_id         IS 'UUID do lead; sem FK (leads ficam no localStorage)';
COMMENT ON COLUMN public.appointments.professional_idx   IS 'Índice legado no array getProfessionals(); nullable quando professional_id resolvido';
COMMENT ON COLUMN public.appointments.historico_alteracoes IS 'Array de edições manuais com old/new_value, changed_by, changed_at';
COMMENT ON COLUMN public.appointments.historico_status   IS 'Array de transições de status com motivo e timestamp';
COMMENT ON COLUMN public.appointments.deleted_at         IS 'Soft delete — histórico nunca é apagado';

-- ── Indexes ──────────────────────────────────────────────────
-- Padrão dominante: agenda do dia / semana / mês
CREATE INDEX IF NOT EXISTS idx_appt_clinic_date
  ON public.appointments (clinic_id, scheduled_date DESC)
  WHERE deleted_at IS NULL;

-- Por profissional (minha agenda, visão semanal filtrada)
CREATE INDEX IF NOT EXISTS idx_appt_professional_date
  ON public.appointments (clinic_id, professional_id, scheduled_date DESC)
  WHERE deleted_at IS NULL;

-- Por paciente (histórico de consultas no prontuário)
CREATE INDEX IF NOT EXISTS idx_appt_patient_date
  ON public.appointments (clinic_id, patient_id, scheduled_date DESC)
  WHERE deleted_at IS NULL;

-- Por status (dashboard, KPIs)
CREATE INDEX IF NOT EXISTS idx_appt_status
  ON public.appointments (clinic_id, status, scheduled_date DESC)
  WHERE deleted_at IS NULL;

-- ── Trigger updated_at ─────────────────────────────────────
DROP TRIGGER IF EXISTS appointments_updated_at ON public.appointments;
CREATE TRIGGER appointments_updated_at
  BEFORE UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;

-- Leitura: respeita visibilidade de agenda
-- admin/owner/receptionist veem tudo; therapist/viewer respeitam agenda_visibility
DROP POLICY IF EXISTS "appt_select" ON public.appointments;
CREATE POLICY "appt_select"
  ON public.appointments FOR SELECT
  USING (
    clinic_id   = app_clinic_id()
    AND deleted_at IS NULL
    AND app_role() IN ('owner','admin','receptionist','therapist','viewer')
    AND (
      app_role() IN ('owner','admin','receptionist')
      OR professional_id = auth.uid()
      OR professional_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.agenda_visibility av
        WHERE av.clinic_id  = app_clinic_id()
          AND av.owner_id   = professional_id
          AND av.viewer_id  = auth.uid()
      )
    )
  );

-- Inserção: roles com acesso à agenda
DROP POLICY IF EXISTS "appt_insert" ON public.appointments;
CREATE POLICY "appt_insert"
  ON public.appointments FOR INSERT
  WITH CHECK (
    clinic_id = app_clinic_id()
    AND app_role() IN ('owner','admin','receptionist','therapist')
  );

-- Atualização: o criador do agendamento, ou admin/owner/receptionist
DROP POLICY IF EXISTS "appt_update" ON public.appointments;
CREATE POLICY "appt_update"
  ON public.appointments FOR UPDATE
  USING (
    clinic_id = app_clinic_id()
    AND (
      professional_id = auth.uid()
      OR app_role() IN ('owner','admin','receptionist')
    )
  );

-- ── RPC: appt_list ────────────────────────────────────────────
-- Lista agendamentos de um período com filtros opcionais.
-- Respeita visibilidade por profissional.
-- Retorna array no formato do localStorage para merge direto.
CREATE OR REPLACE FUNCTION public.appt_list(
  p_date_from       date,
  p_date_to         date,
  p_professional_ids uuid[]  DEFAULT NULL,   -- NULL = todos visíveis
  p_limit           int      DEFAULT 500,
  p_offset          int      DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
  v_uid       uuid := auth.uid();
  v_result    jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_role NOT IN ('owner','admin','receptionist','therapist','viewer') THEN
    RAISE EXCEPTION 'Permissão insuficiente para acessar agendamentos';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY row.data DESC, row."horaInicio" DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      a.id,
      a.patient_id::text                          AS "pacienteId",
      a.patient_name                              AS "pacienteNome",
      a.professional_idx                          AS "profissionalIdx",
      a.professional_name                         AS "profissionalNome",
      a.room_idx                                  AS "salaIdx",
      a.scheduled_date::text                      AS "data",
      to_char(a.start_time, 'HH24:MI')            AS "horaInicio",
      to_char(a.end_time,   'HH24:MI')            AS "horaFim",
      a.procedure_name                            AS "procedimento",
      a.value                                     AS "valor",
      a.payment_method                            AS "formaPagamento",
      a.payment_status                            AS "statusPagamento",
      a.consult_type                              AS "tipoConsulta",
      a.eval_type                                 AS "tipoAvaliacao",
      a.status,
      a.origem,
      a.obs,
      a.confirmacao_enviada                       AS "confirmacaoEnviada",
      a.consentimento_img                         AS "consentimentoImagem",
      a.presenca,
      a.chegada_em                                AS "chegada_em",
      a.cancelado_em                              AS "canceladoEm",
      a.motivo_cancelamento                       AS "motivoCancelamento",
      a.no_show_em                                AS "noShowEm",
      a.motivo_no_show                            AS "motivoNoShow",
      a.historico_alteracoes                      AS "historicoAlteracoes",
      a.historico_status                          AS "historicoStatus",
      a.created_at                                AS "createdAt",
      a.professional_id                           AS "_professionalId",
      true                                        AS "_synced"
    FROM public.appointments a
    WHERE a.clinic_id      = v_clinic_id
      AND a.scheduled_date BETWEEN p_date_from AND p_date_to
      AND a.deleted_at     IS NULL
      -- Filtro de profissionais opcional
      AND (p_professional_ids IS NULL OR a.professional_id = ANY(p_professional_ids))
      -- Visibilidade
      AND (
        v_role IN ('owner','admin','receptionist')
        OR a.professional_id = v_uid
        OR a.professional_id IS NULL
        OR EXISTS (
          SELECT 1 FROM public.agenda_visibility av
          WHERE av.clinic_id  = v_clinic_id
            AND av.owner_id   = a.professional_id
            AND av.viewer_id  = v_uid
        )
      )
    ORDER BY a.scheduled_date DESC, a.start_time DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) row;

  RETURN v_result;
END;
$$;

-- ── RPC: appt_upsert ─────────────────────────────────────────
-- Cria ou atualiza um agendamento.
-- Aceita JSONB com os campos no formato localStorage.
-- clinic_id é sempre injetado pelo servidor (app_clinic_id()).
-- professional_id opcional: se presente no JSONB como "_professionalId".
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
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_role NOT IN ('owner','admin','receptionist','therapist') THEN
    RAISE EXCEPTION 'Permissão insuficiente para salvar agendamento';
  END IF;

  v_id := p_data->>'id';
  IF v_id IS NULL OR trim(v_id) = '' THEN
    RAISE EXCEPTION 'Campo id é obrigatório';
  END IF;

  -- patient_id: converte para UUID somente se for UUID válido
  BEGIN
    v_patient_id := (p_data->>'pacienteId')::uuid;
  EXCEPTION WHEN others THEN
    v_patient_id := NULL;
  END;

  -- professional_id: campo interno _professionalId
  BEGIN
    v_prof_id := (p_data->>'_professionalId')::uuid;
  EXCEPTION WHEN others THEN
    v_prof_id := NULL;
  END;

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

-- ── RPC: appt_delete ─────────────────────────────────────────
-- Soft delete. Somente o criador / admin / owner / receptionist.
CREATE OR REPLACE FUNCTION public.appt_delete(p_id text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id   uuid := app_clinic_id();
  v_role        text := app_role();
  v_uid         uuid := auth.uid();
  v_prof_id     uuid;
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  SELECT professional_id INTO v_prof_id
    FROM public.appointments
   WHERE id = p_id AND clinic_id = v_clinic_id AND deleted_at IS NULL;

  IF NOT FOUND THEN
    -- Já deletado ou inexistente — considera sucesso (idempotente)
    RETURN jsonb_build_object('ok', true, 'skipped', true);
  END IF;

  IF v_prof_id IS DISTINCT FROM v_uid AND v_role NOT IN ('owner','admin','receptionist') THEN
    RAISE EXCEPTION 'Permissão insuficiente para remover este agendamento';
  END IF;

  UPDATE public.appointments SET deleted_at = now() WHERE id = p_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── RPC: appt_sync_batch ─────────────────────────────────────
-- Migração em lote: recebe array JSONB de agendamentos do localStorage
-- e faz upsert de cada um. Idempotente — pode ser chamado múltiplas vezes.
-- Retorna { ok, inserted, updated, errors }.
CREATE OR REPLACE FUNCTION public.appt_sync_batch(p_appointments jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := app_clinic_id();
  v_role       text := app_role();
  v_item       jsonb;
  v_inserted   int  := 0;
  v_updated    int  := 0;
  v_errors     int  := 0;
  v_id         text;
  v_patient_id uuid;
  v_prof_id    uuid;
  v_exists     bool;
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_role NOT IN ('owner','admin','receptionist','therapist') THEN
    RAISE EXCEPTION 'Permissão insuficiente para sync em lote';
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_appointments) LOOP
    BEGIN
      v_id := v_item->>'id';
      IF v_id IS NULL OR trim(v_id) = '' THEN CONTINUE; END IF;
      -- Ignora entradas sem data válida
      IF v_item->>'data' IS NULL THEN CONTINUE; END IF;

      SELECT EXISTS(
        SELECT 1 FROM public.appointments WHERE id = v_id AND clinic_id = v_clinic_id
      ) INTO v_exists;

      BEGIN v_patient_id := (v_item->>'pacienteId')::uuid;
      EXCEPTION WHEN others THEN v_patient_id := NULL; END;

      BEGIN v_prof_id := (v_item->>'_professionalId')::uuid;
      EXCEPTION WHEN others THEN v_prof_id := NULL; END;

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
        COALESCE((v_item->>'consentimentoImagem')::boolean, false),
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
        status               = EXCLUDED.status,
        patient_name         = EXCLUDED.patient_name,
        professional_id      = COALESCE(EXCLUDED.professional_id, appointments.professional_id),
        professional_idx     = EXCLUDED.professional_idx,
        professional_name    = EXCLUDED.professional_name,
        scheduled_date       = EXCLUDED.scheduled_date,
        start_time           = EXCLUDED.start_time,
        end_time             = EXCLUDED.end_time,
        procedure_name       = EXCLUDED.procedure_name,
        value                = EXCLUDED.value,
        payment_method       = EXCLUDED.payment_method,
        payment_status       = EXCLUDED.payment_status,
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
      ELSE v_inserted := v_inserted + 1;
      END IF;

    EXCEPTION WHEN others THEN
      v_errors := v_errors + 1;
      -- Log individual error mas continua o batch
      RAISE WARNING 'appt_sync_batch: erro ao processar id=% — %', v_item->>'id', SQLERRM;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',       true,
    'inserted', v_inserted,
    'updated',  v_updated,
    'errors',   v_errors
  );
END;
$$;

-- ── Permissões ────────────────────────────────────────────────
DO $$
DECLARE
  fn  text;
  fns text[] := ARRAY[
    'appt_list(date,date,uuid[],int,int)',
    'appt_upsert(jsonb)',
    'appt_delete(text)',
    'appt_sync_batch(jsonb)'
  ];
BEGIN
  FOREACH fn IN ARRAY fns LOOP
    EXECUTE 'REVOKE ALL ON FUNCTION public.' || fn || ' FROM PUBLIC';
    EXECUTE 'GRANT EXECUTE ON FUNCTION public.' || fn || ' TO authenticated';
  END LOOP;
END;
$$;
