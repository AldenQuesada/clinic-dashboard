const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  await client.query(`
    CREATE OR REPLACE FUNCTION trg_appointment_cancelled_phase()
    RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$
    DECLARE
      v_lead_id text;
      v_current_phase text;
    BEGIN
      IF OLD.status = NEW.status THEN RETURN NEW; END IF;

      v_lead_id := NEW.patient_id::text;
      IF v_lead_id IS NULL OR NOT EXISTS (SELECT 1 FROM leads WHERE id = v_lead_id AND deleted_at IS NULL) THEN
        IF NEW.patient_phone IS NOT NULL THEN
          SELECT id INTO v_lead_id
          FROM leads WHERE phone LIKE '%' || right(NEW.patient_phone, 8) AND deleted_at IS NULL LIMIT 1;
        END IF;
      END IF;
      IF v_lead_id IS NULL THEN RETURN NEW; END IF;

      SELECT phase INTO v_current_phase FROM leads WHERE id = v_lead_id;
      IF v_current_phase = 'paciente' THEN RETURN NEW; END IF;

      -- Cancelado/no_show → phase perdido
      IF NEW.status IN ('cancelado', 'no_show') AND OLD.status NOT IN ('cancelado', 'no_show') THEN
        PERFORM _sdr_record_phase_change(v_lead_id, 'perdido', 'appointment_' || NEW.status, auth.uid());
      END IF;

      -- Remarcado a partir de cancelado/no_show → volta pra agendado
      IF NEW.status = 'remarcado' AND OLD.status IN ('cancelado', 'no_show') THEN
        PERFORM _sdr_record_phase_change(v_lead_id, 'agendado', 'appointment_rescheduled', auth.uid());
      END IF;

      RETURN NEW;
    END;
    $fn$
  `)

  await client.query('DROP TRIGGER IF EXISTS trg_lead_phase_on_appointment_cancelled ON appointments')
  await client.query(`
    CREATE TRIGGER trg_lead_phase_on_appointment_cancelled
    AFTER UPDATE ON appointments
    FOR EACH ROW
    WHEN (NEW.status IS DISTINCT FROM OLD.status)
    EXECUTE FUNCTION trg_appointment_cancelled_phase()
  `)

  console.log('Triggers de phase completos:')
  console.log('  criar agendamento → lead phase: agendado')
  console.log('  reagendar (mudar data/hora) → lead phase: reagendado')
  console.log('  finalizar/em_consulta → lead phase: compareceu')
  console.log('  cancelar/no_show → lead phase: perdido')
  console.log('  remarcar (de cancelado) → lead phase: agendado')
  console.log('  paciente → NUNCA regride')

  // Tambem adicionar sync Supabase no cancelamento/no_show do JS
  // O confirmCancelWithReason ja salva no localStorage e aplica tag
  // Mas nao faz syncOne pro Supabase — vou verificar

  await client.query("NOTIFY pgrst, 'reload schema'")
  await client.end()
}
main().catch(err => { console.error(err); process.exit(1) })
