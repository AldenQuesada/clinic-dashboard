const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('Connected.')

  await client.query(`
    DROP POLICY IF EXISTS "appt_delete" ON public.appointments;
    CREATE POLICY "appt_delete"
      ON public.appointments FOR DELETE
      USING (
        clinic_id = app_clinic_id()
        AND (
          professional_id = auth.uid()
          OR app_role() IN ('owner','admin','receptionist')
        )
      );
  `)
  console.log('Policy applied.')

  // Also nuke the stubborn Mirian appointment
  const r = await client.query(
    `DELETE FROM public.appointments WHERE id = $1 RETURNING id, patient_name`,
    ['appt_1775823619170_cap7u']
  )
  console.log('Deleted:', r.rows)

  await client.query(
    `DELETE FROM public.wa_outbox WHERE appt_ref = $1`,
    ['appt_1775823619170_cap7u']
  )
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => client.end())
