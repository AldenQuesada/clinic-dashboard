// Purge test appointments
// - Semana passada (2026-04-06..2026-04-12): DELETE ALL
// - Semana atual  (2026-04-13..2026-04-19): DELETE onde patient_name match Mislene/Elisangela/Gislaine/Camila
// - Mantem Jose Aparecido
//
// Uso: node scripts/purge-test-appointments.cjs [--apply]
// Sem --apply: apenas PREVIEW (nada deletado).

const { Client } = require('pg')

const APPLY = process.argv.includes('--apply')
const LAST_WEEK_START = '2026-04-06'
const LAST_WEEK_END   = '2026-04-12'
const THIS_WEEK_START = '2026-04-13'
const THIS_WEEK_END   = '2026-04-19'
const TEST_NAMES = ['Mislene', 'Elisangela', 'Gislaine', 'Camila']

const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()

  const whereName = TEST_NAMES.map((_, i) => `patient_name ILIKE $${i + 3}`).join(' OR ')
  const params = [LAST_WEEK_START, LAST_WEEK_END, ...TEST_NAMES.map(n => `%${n}%`), THIS_WEEK_START, THIS_WEEK_END]

  const selectSql = `
    SELECT id, patient_name, scheduled_date, start_time, status
    FROM public.appointments
    WHERE (scheduled_date BETWEEN $1 AND $2)
       OR (scheduled_date BETWEEN $${TEST_NAMES.length + 3} AND $${TEST_NAMES.length + 4}
           AND (${whereName}))
    ORDER BY scheduled_date, start_time
  `

  const rows = (await client.query(selectSql, params)).rows

  console.log(`\n═══ ${APPLY ? 'DELETANDO' : 'PREVIEW'} (${rows.length} agendamentos) ═══\n`)
  rows.forEach(r => {
    console.log(`  ${r.scheduled_date.toISOString().slice(0,10)} ${String(r.start_time).slice(0,5)}  ${r.patient_name.padEnd(30)}  [${r.status}]  ${r.id}`)
  })

  if (!rows.length) { console.log('\nNada a deletar.'); return }

  if (!APPLY) {
    console.log('\n(dry-run) Rode com --apply para deletar de verdade.\n')
    return
  }

  const ids = rows.map(r => r.id)

  // Cancela outbox pendente
  const outbox = await client.query(
    `DELETE FROM public.wa_outbox WHERE appt_ref = ANY($1::text[]) AND status IN ('pending','scheduled') RETURNING id`,
    [ids]
  )
  console.log(`\nwa_outbox purgado: ${outbox.rowCount} registros`)

  // Hard delete dos agendamentos
  const del = await client.query(
    `DELETE FROM public.appointments WHERE id = ANY($1::text[]) RETURNING id`,
    [ids]
  )
  console.log(`appointments deletado: ${del.rowCount} registros`)
}

main().catch(e => { console.error(e); process.exit(1) }).finally(() => client.end())
