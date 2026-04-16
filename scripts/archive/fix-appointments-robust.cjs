const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== Fix Robusto de Agendamentos ===\n')

  // ══════════════════════════════════════════════════
  // 1. ADICIONAR patient_phone EM APPOINTMENTS
  // ══════════════════════════════════════════════════

  await client.query(`
    ALTER TABLE appointments
    ADD COLUMN IF NOT EXISTS patient_phone text
  `)
  // Trigger de normalizacao no phone
  await client.query(`DROP TRIGGER IF EXISTS trg_appt_normalize_phone ON appointments`)
  await client.query(`
    CREATE TRIGGER trg_appt_normalize_phone
    BEFORE INSERT OR UPDATE OF patient_phone ON appointments
    FOR EACH ROW
    EXECUTE FUNCTION trg_normalize_phone()
  `)
  // Renomear coluna no trigger (trg_normalize_phone usa NEW.phone, preciso adaptar)
  // Na verdade, preciso de uma funcao especifica pra patient_phone
  await client.query(`DROP TRIGGER IF EXISTS trg_appt_normalize_phone ON appointments`)
  await client.query(`
    CREATE OR REPLACE FUNCTION trg_normalize_patient_phone()
    RETURNS trigger LANGUAGE plpgsql AS $fn$
    BEGIN
      IF NEW.patient_phone IS NOT NULL AND NEW.patient_phone != '' THEN
        NEW.patient_phone := normalize_phone(NEW.patient_phone);
      END IF;
      RETURN NEW;
    END;
    $fn$
  `)
  await client.query(`
    CREATE TRIGGER trg_appt_normalize_patient_phone
    BEFORE INSERT OR UPDATE OF patient_phone ON appointments
    FOR EACH ROW EXECUTE FUNCTION trg_normalize_patient_phone()
  `)
  console.log('1. patient_phone adicionado + trigger de normalizacao')

  // ══════════════════════════════════════════════════
  // 2. APPT_UPSERT — RESOLVER LEAD PELO PHONE
  // ══════════════════════════════════════════════════

  await client.query(`
    CREATE OR REPLACE FUNCTION appt_upsert(p_data jsonb)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_clinic_id   uuid := app_clinic_id();
      v_role        text := app_role();
      v_id          text;
      v_patient_id  text;  -- TEXT pra compatibilidade com leads.id
      v_prof_id     uuid;
      v_phone       text;
      v_lead        record;
    BEGIN
      IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
      IF v_role NOT IN ('owner','admin','receptionist','therapist') THEN
        RAISE EXCEPTION 'Permissao insuficiente';
      END IF;

      v_id := p_data->>'id';
      IF v_id IS NULL OR trim(v_id) = '' THEN
        RAISE EXCEPTION 'Campo id obrigatorio';
      END IF;

      -- Resolver professional_id
      BEGIN
        v_prof_id := (p_data->>'_professionalId')::uuid;
      EXCEPTION WHEN others THEN
        v_prof_id := NULL;
      END;

      -- ── RESOLVER LEAD: phone primeiro, ID como fallback ──
      v_phone := normalize_phone(p_data->>'pacientePhone');
      v_patient_id := p_data->>'pacienteId';

      -- Tentar achar lead pelo phone (mais confiavel)
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

      -- Se nao achou por phone, tentar pelo ID original
      IF v_patient_id IS NOT NULL AND v_lead IS NULL THEN
        SELECT id INTO v_lead
        FROM leads
        WHERE id = v_patient_id
          AND clinic_id = v_clinic_id
          AND deleted_at IS NULL;

        IF NOT FOUND THEN
          -- ID do localStorage nao existe no Supabase
          -- Tentar por nome como ultimo recurso
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
        -- patient_id: tentar UUID cast, se falhar usa NULL
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
    $fn$
  `)
  await client.query('GRANT EXECUTE ON FUNCTION appt_upsert(jsonb) TO authenticated')
  console.log('2. appt_upsert: resolve lead por phone > ID > nome')

  // ══════════════════════════════════════════════════
  // 3. TRIGGERS DE PHASE — FALLBACK POR PHONE
  // ══════════════════════════════════════════════════

  await client.query(`
    CREATE OR REPLACE FUNCTION trg_appointment_created_phase()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
    DECLARE
      v_lead_id text;
    BEGIN
      IF NEW.status = 'cancelado' THEN RETURN NEW; END IF;

      -- Resolver lead: patient_id primeiro, phone como fallback
      v_lead_id := NEW.patient_id::text;

      IF v_lead_id IS NULL OR NOT EXISTS (SELECT 1 FROM leads WHERE id = v_lead_id AND deleted_at IS NULL) THEN
        -- Fallback: buscar por phone
        IF NEW.patient_phone IS NOT NULL THEN
          SELECT id INTO v_lead_id
          FROM leads
          WHERE phone LIKE '%' || right(NEW.patient_phone, 8)
            AND deleted_at IS NULL
          LIMIT 1;
        END IF;
      END IF;

      IF v_lead_id IS NULL THEN RETURN NEW; END IF;

      PERFORM _sdr_record_phase_change(v_lead_id, 'agendado', 'appointment_created', auth.uid());
      RETURN NEW;
    END;
    $fn$
  `)
  console.log('3a. Trigger created: fallback por phone')

  await client.query(`
    CREATE OR REPLACE FUNCTION trg_appointment_attended_phase()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
    DECLARE
      v_lead_id text;
    BEGIN
      IF OLD.status = NEW.status THEN RETURN NEW; END IF;
      IF NEW.status NOT IN ('finalizado', 'em_consulta') THEN RETURN NEW; END IF;

      v_lead_id := NEW.patient_id::text;
      IF v_lead_id IS NULL OR NOT EXISTS (SELECT 1 FROM leads WHERE id = v_lead_id AND deleted_at IS NULL) THEN
        IF NEW.patient_phone IS NOT NULL THEN
          SELECT id INTO v_lead_id
          FROM leads WHERE phone LIKE '%' || right(NEW.patient_phone, 8) AND deleted_at IS NULL LIMIT 1;
        END IF;
      END IF;

      IF v_lead_id IS NULL THEN RETURN NEW; END IF;

      PERFORM _sdr_record_phase_change(v_lead_id, 'compareceu', 'appointment_attended', auth.uid());
      RETURN NEW;
    END;
    $fn$
  `)
  console.log('3b. Trigger attended: fallback por phone')

  await client.query(`
    CREATE OR REPLACE FUNCTION trg_appointment_rescheduled_phase()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
    DECLARE
      v_lead_id text;
    BEGIN
      IF OLD.scheduled_date IS NOT DISTINCT FROM NEW.scheduled_date
         AND OLD.start_time IS NOT DISTINCT FROM NEW.start_time THEN
        RETURN NEW;
      END IF;
      IF NEW.status = 'cancelado' THEN RETURN NEW; END IF;

      v_lead_id := NEW.patient_id::text;
      IF v_lead_id IS NULL OR NOT EXISTS (SELECT 1 FROM leads WHERE id = v_lead_id AND deleted_at IS NULL) THEN
        IF NEW.patient_phone IS NOT NULL THEN
          SELECT id INTO v_lead_id
          FROM leads WHERE phone LIKE '%' || right(NEW.patient_phone, 8) AND deleted_at IS NULL LIMIT 1;
        END IF;
      END IF;

      IF v_lead_id IS NULL THEN RETURN NEW; END IF;

      IF EXISTS (SELECT 1 FROM leads WHERE id = v_lead_id AND phase IN ('agendado', 'reagendado')) THEN
        PERFORM _sdr_record_phase_change(v_lead_id, 'reagendado', 'appointment_rescheduled', auth.uid());
      END IF;
      RETURN NEW;
    END;
    $fn$
  `)
  console.log('3c. Trigger rescheduled: fallback por phone')

  // ══════════════════════════════════════════════════
  // 4. APPT_LIST — INCLUIR patient_phone NO RETORNO
  // ══════════════════════════════════════════════════

  // Pegar source atual do appt_list
  const listSrc = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'appt_list'")
  let src = listSrc.rows[0].prosrc

  // Verificar se ja tem patient_phone
  if (!src.includes('patient_phone')) {
    // Adicionar patient_phone ao SELECT do jsonb_build_object
    src = src.replace(
      "'pacienteNome',   a.patient_name,",
      "'pacienteNome',   a.patient_name,\n            'pacientePhone',  a.patient_phone,"
    )

    await client.query(`
      CREATE OR REPLACE FUNCTION appt_list(
        p_date_from        date    DEFAULT CURRENT_DATE - 30,
        p_date_to          date    DEFAULT CURRENT_DATE + 90,
        p_professional_ids uuid[]  DEFAULT NULL,
        p_limit            integer DEFAULT 500,
        p_offset           integer DEFAULT 0
      )
      RETURNS jsonb
      LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
      AS $fn$
      ${src}
      $fn$
    `)
    await client.query('GRANT EXECUTE ON FUNCTION appt_list(date, date, uuid[], integer, integer) TO authenticated')
    console.log('4. appt_list: retorna pacientePhone')
  }

  // PostgREST reload
  await client.query("NOTIFY pgrst, 'reload schema'")

  await client.end()
  console.log('\n=== Agendamentos robustos ===')
}
main().catch(err => { console.error(err); process.exit(1) })
