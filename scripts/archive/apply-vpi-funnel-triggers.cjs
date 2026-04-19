/**
 * Aplica migration: VPI Funnel Stage Triggers.
 *
 * - Cria 4 triggers que populam funnel_stage automaticamente:
 *     contacted (wa_outbox INSERT)
 *     responded (wa_messages INSERT direction=inbound)
 *     scheduled (appointments INSERT com patient_phone)
 *     showed    (appointments UPDATE chegada_em null→notnull)
 * - Backfill leve pra indicações existentes
 * - Lista triggers criados + funções helper
 * - Smoke test end-to-end com dados fake (cleanup no final)
 *
 * Uso: node scripts/archive/apply-vpi-funnel-triggers.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000389_vpi_funnel_stage_triggers.sql'
)

const CLINIC_ID = '00000000-0000-0000-0000-000000000001'

const client = new Client({
  host:     'aws-0-us-west-2.pooler.supabase.com',
  port:     5432,
  user:     'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl:      { rejectUnauthorized: false },
})

function pick(r, ...keys) {
  const out = {}
  keys.forEach(k => { if (r && r[k] !== undefined) out[k] = r[k] })
  return out
}

async function main() {
  console.log('=== VPI Funnel Stage Triggers ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Migration:', MIGRATION_PATH)
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  // 1. Apply migration
  try {
    await client.query(sql)
    console.log('Migration OK.\n')
  } catch (e) {
    console.error('Migration FAILED:', e.message)
    throw e
  }

  // 2. List triggers created
  console.log('--- Triggers criados ---')
  const triggers = await client.query(`
    SELECT tgname AS name,
           tgrelid::regclass AS table_name,
           tgenabled AS enabled,
           pg_get_triggerdef(oid) AS def
      FROM pg_trigger
     WHERE NOT tgisinternal
       AND tgname IN (
         'trg_vpi_ind_stage_on_outbox',
         'trg_vpi_ind_stage_on_inbound',
         'trg_vpi_ind_stage_on_appointment',
         'trg_vpi_ind_stage_on_arrival'
       )
     ORDER BY tgname
  `)
  if (!triggers.rows.length) {
    console.error('NENHUM trigger encontrado. Aborta.')
    process.exit(1)
  }
  triggers.rows.forEach(t => {
    console.log(`  * ${t.name} on ${t.table_name} (enabled=${t.enabled})`)
  })

  // 3. Helper functions
  console.log('\n--- Helper functions ---')
  const fns = await client.query(`
    SELECT p.proname, pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('_vpi_funnel_stage_rank','_vpi_update_funnel_stage')
     ORDER BY p.proname
  `)
  fns.rows.forEach(f => console.log(`  * ${f.proname}(${f.args})`))

  // 4. Backfill effect snapshot
  console.log('\n--- Distribuicao de funnel_stage apos backfill ---')
  const dist = await client.query(`
    SELECT funnel_stage, COUNT(*) AS n
      FROM public.vpi_indications
     WHERE clinic_id = $1::uuid
     GROUP BY funnel_stage
     ORDER BY n DESC
  `, [CLINIC_ID])
  dist.rows.forEach(d => console.log(`  * ${d.funnel_stage}: ${d.n}`))

  // ============================================================
  // 5. SMOKE TEST end-to-end
  // ============================================================
  console.log('\n--- Smoke test (cria dados fake, verifica, cleanup) ---')

  const stamp = Date.now()
  const fakePhone = `+5544999${String(stamp).slice(-7)}`
  const phoneLast8 = fakePhone.replace(/\D/g, '').slice(-8)
  const fakeLeadId = `test_vpi_funnel_${stamp}`
  const fakeApptId = `test_appt_${stamp}`
  const fakeConvId = (await client.query(`SELECT gen_random_uuid() AS id`)).rows[0].id
  const fakeOutboxRef = `test_vpi_outbox_${stamp}`

  // Precisamos de uma partner_id existente
  const partner = await client.query(`
    SELECT id FROM public.vpi_partners
     WHERE clinic_id = $1::uuid
     ORDER BY created_at DESC LIMIT 1
  `, [CLINIC_ID])
  if (!partner.rows.length) {
    console.log('  (skip smoke: nenhuma vpi_partner existente pra testar)')
    await client.end()
    console.log('\n=== OK (smoke skipped) ===')
    return
  }
  const partnerId = partner.rows[0].id

  let smokePassed = true
  let cleanupNeeded = true
  const expect = async (label, actual, expected) => {
    const pass = actual === expected
    console.log(`  [${pass ? 'PASS' : 'FAIL'}] ${label}: got='${actual}' expected='${expected}'`)
    if (!pass) smokePassed = false
    return pass
  }

  try {
    // Setup: lead + conversation + indication
    await client.query('BEGIN')

    await client.query(`
      INSERT INTO public.leads (id, clinic_id, name, phone, status, phase, temperature,
                                priority, channel_mode, ai_persona, funnel, tipo,
                                wa_opt_in, conversation_status, created_at)
      VALUES ($1, $2::uuid, 'Smoke Test Fake', $3, 'new', 'lead', 'hot',
              'normal', 'whatsapp', 'onboarder', 'procedimentos', 'Lead',
              true, 'new', now())
      ON CONFLICT (id) DO NOTHING
    `, [fakeLeadId, CLINIC_ID, fakePhone])

    await client.query(`
      INSERT INTO public.wa_conversations (id, clinic_id, lead_id, phone, status, created_at)
      VALUES ($1, $2::uuid, $3, $4, 'active', now())
      ON CONFLICT (id) DO NOTHING
    `, [fakeConvId, CLINIC_ID, fakeLeadId, fakePhone])

    // Cria indicação em estado 'created'
    const indIns = await client.query(`
      INSERT INTO public.vpi_indications (clinic_id, partner_id, lead_id, creditos, status, funnel_stage)
      VALUES ($1::uuid, $2::uuid, $3, 1, 'pending_close', 'created')
      RETURNING id
    `, [CLINIC_ID, partnerId, fakeLeadId])
    const indId = indIns.rows[0].id
    console.log(`  · Setup OK. indication=${indId}, lead=${fakeLeadId}, phone=${fakePhone}`)

    await client.query('COMMIT')

    // --- TEST 1: contacted (wa_outbox INSERT) ---
    console.log('\n  [TEST 1] Insert em wa_outbox → esperando stage=contacted')
    await client.query(`
      INSERT INTO public.wa_outbox
        (clinic_id, lead_id, phone, content, content_type, priority, status, attempts, max_attempts, appt_ref, created_at)
      VALUES ($1::uuid, $2, $3, 'mensagem test', 'text', 5, 'pending', 0, 3, $4, now())
    `, [CLINIC_ID, fakeLeadId, fakePhone, fakeOutboxRef])

    let r = await client.query(
      `SELECT funnel_stage, contacted_at FROM public.vpi_indications WHERE id=$1`, [indId]
    )
    await expect('Trigger 1 (contacted)', r.rows[0].funnel_stage, 'contacted')
    console.log(`    contacted_at=${r.rows[0].contacted_at}`)

    // --- TEST 2: responded (wa_messages INSERT direction=inbound) ---
    console.log('\n  [TEST 2] Insert em wa_messages inbound → esperando stage=responded')
    await client.query(`
      INSERT INTO public.wa_messages
        (conversation_id, clinic_id, direction, sender, content, content_type, sent_at)
      VALUES ($1, $2::uuid, 'inbound', 'lead', 'resposta test', 'text', now())
    `, [fakeConvId, CLINIC_ID])

    r = await client.query(
      `SELECT funnel_stage, responded_at FROM public.vpi_indications WHERE id=$1`, [indId]
    )
    await expect('Trigger 2 (responded)', r.rows[0].funnel_stage, 'responded')
    console.log(`    responded_at=${r.rows[0].responded_at}`)

    // --- TEST 3: scheduled (appointments INSERT com patient_phone) ---
    console.log('\n  [TEST 3] Insert em appointments → esperando stage=scheduled')
    await client.query(`
      INSERT INTO public.appointments
        (id, clinic_id, patient_name, patient_phone, professional_name,
         scheduled_date, start_time, end_time, procedure_name, value, status, created_at)
      VALUES ($1, $2::uuid, 'Smoke Test Fake', $3, 'Dra. Mirian',
              CURRENT_DATE, '10:00', '11:00', 'Teste', 0, 'agendado', now())
    `, [fakeApptId, CLINIC_ID, fakePhone])

    r = await client.query(
      `SELECT funnel_stage, scheduled_at FROM public.vpi_indications WHERE id=$1`, [indId]
    )
    await expect('Trigger 3 (scheduled)', r.rows[0].funnel_stage, 'scheduled')
    console.log(`    scheduled_at=${r.rows[0].scheduled_at}`)

    // --- TEST 4: showed (UPDATE chegada_em null→valor) ---
    console.log('\n  [TEST 4] UPDATE appointments SET chegada_em=now() → esperando stage=showed')
    await client.query(`
      UPDATE public.appointments SET chegada_em=now() WHERE id=$1
    `, [fakeApptId])

    r = await client.query(
      `SELECT funnel_stage, showed_at FROM public.vpi_indications WHERE id=$1`, [indId]
    )
    await expect('Trigger 4 (showed)', r.rows[0].funnel_stage, 'showed')
    console.log(`    showed_at=${r.rows[0].showed_at}`)

    // --- TEST 5: idempotência — insert outbox de novo nao baixa stage ---
    console.log('\n  [TEST 5] Insert outbox de novo → stage NAO deve voltar pra contacted')
    await client.query(`
      INSERT INTO public.wa_outbox
        (clinic_id, lead_id, phone, content, content_type, priority, status, attempts, max_attempts, appt_ref, created_at)
      VALUES ($1::uuid, $2, $3, 'segunda msg', 'text', 5, 'pending', 0, 3, $4, now())
    `, [CLINIC_ID, fakeLeadId, fakePhone, fakeOutboxRef + '_b'])
    r = await client.query(
      `SELECT funnel_stage FROM public.vpi_indications WHERE id=$1`, [indId]
    )
    await expect('Idempotência (stage não regride)', r.rows[0].funnel_stage, 'showed')

    // ============================================================
    // CLEANUP
    // ============================================================
    console.log('\n--- Cleanup ---')
    await client.query('BEGIN')

    await client.query(`DELETE FROM public.wa_messages WHERE conversation_id=$1`, [fakeConvId])
    await client.query(`DELETE FROM public.wa_outbox WHERE appt_ref LIKE $1`, [`${fakeOutboxRef}%`])
    await client.query(`DELETE FROM public.wa_conversations WHERE id=$1`, [fakeConvId])
    await client.query(`DELETE FROM public.appointments WHERE id=$1`, [fakeApptId])
    await client.query(`DELETE FROM public.vpi_indications WHERE id=$1`, [indId])
    await client.query(`DELETE FROM public.leads WHERE id=$1`, [fakeLeadId])

    await client.query('COMMIT')
    cleanupNeeded = false
    console.log('  Cleanup OK.')

  } catch (e) {
    console.error('\nSMOKE FAILED:', e.message)
    smokePassed = false
    try { await client.query('ROLLBACK') } catch (_) {}

    // Best-effort cleanup mesmo no fail
    if (cleanupNeeded) {
      console.log('  Tentando cleanup de emergência…')
      try {
        await client.query(`DELETE FROM public.wa_messages WHERE conversation_id=$1`, [fakeConvId])
        await client.query(`DELETE FROM public.wa_outbox WHERE appt_ref LIKE $1`, [`${fakeOutboxRef}%`])
        await client.query(`DELETE FROM public.wa_conversations WHERE id=$1`, [fakeConvId])
        await client.query(`DELETE FROM public.appointments WHERE id=$1`, [fakeApptId])
        await client.query(`DELETE FROM public.vpi_indications WHERE lead_id=$1`, [fakeLeadId])
        await client.query(`DELETE FROM public.leads WHERE id=$1`, [fakeLeadId])
        console.log('  Cleanup emergência OK.')
      } catch (ce) {
        console.log('  Cleanup emergência falhou (ignorar):', ce.message)
      }
    }
  }

  await client.end()
  console.log(`\n=== ${smokePassed ? 'OK' : 'FAILED'} ===`)
  if (!smokePassed) process.exit(1)
}

main().catch(e => { console.error(e); process.exit(1) })
