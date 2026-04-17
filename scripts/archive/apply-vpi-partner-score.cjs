/**
 * Aplica migration: VPI Partner Score (Fase 6 - Entrega 2).
 * Uso: node scripts/archive/apply-vpi-partner-score.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000061_vpi_partner_score.sql'
)

const client = new Client({
  host:     'aws-0-us-west-2.pooler.supabase.com',
  port:     5432,
  user:     'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl:      { rejectUnauthorized: false },
})

async function main() {
  console.log('=== VPI Partner Score (Fase 6 - Entrega 2) ===\n')

  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Migration:', MIGRATION_PATH)
  console.log('Size:', sql.length, 'bytes\n')

  await client.connect()
  console.log('Connected.')

  try {
    await client.query(sql)
    console.log('Migration OK.\n')
  } catch (e) {
    console.error('Migration FAILED:', e.message)
    throw e
  }

  console.log('--- Sanity checks ---')

  // RPCs
  const fns = await client.query(`
    SELECT p.proname, pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('vpi_partner_compute_score', 'vpi_partner_compute_scores_all', 'vpi_send_reativacao')
     ORDER BY p.proname
  `)
  console.log('Funcoes (' + fns.rows.length + '/3):')
  fns.rows.forEach(r => console.log('  -', r.proname))

  // Colunas
  const cols = await client.query(`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema='public' AND table_name='vpi_partners'
       AND column_name IN ('score_total', 'score_produtividade', 'score_engajamento', 'score_recorrencia',
                           'score_cadastro', 'score_criterio_entrada', 'score_classe', 'alertas', 'score_atualizado_em')
     ORDER BY column_name
  `)
  console.log('\nColunas score (' + cols.rows.length + '/9):')
  cols.rows.forEach(r => console.log('  -', r.column_name, r.data_type))

  // Template
  const tpl = await client.query(`
    SELECT id, slug, name, trigger_type, is_active
      FROM public.wa_agenda_automations
     WHERE slug='vpi_reativacao_criterio'
  `)
  console.log('\nTemplate WA:', tpl.rows.length ? JSON.stringify(tpl.rows[0]) : 'NAO ENCONTRADO')

  // pg_cron
  try {
    const jobs = await client.query(`SELECT jobid, jobname, schedule FROM cron.job WHERE jobname='vpi_partner_score_daily'`)
    console.log('Cron job (vpi_partner_score_daily):',
      jobs.rows.length ? JSON.stringify(jobs.rows[0]) : 'NAO REGISTRADO')
  } catch (e) { console.log('pg_cron check:', e.message) }

  // Trigger
  const tr = await client.query(`
    SELECT trigger_name FROM information_schema.triggers
     WHERE event_object_table='vpi_indications' AND trigger_name='trg_vpi_ind_score'
  `)
  console.log('Trigger trg_vpi_ind_score:', tr.rows.length ? 'OK' : 'NAO CRIADO')

  // Smoke: roda batch
  console.log('\n--- Smoke: vpi_partner_compute_scores_all() ---')
  try {
    const r = await client.query(`SELECT public.vpi_partner_compute_scores_all() AS r`)
    console.log('Batch:', JSON.stringify(r.rows[0].r))
  } catch (e) {
    console.log('Batch falhou:', e.message)
  }

  // Mostra uma amostra
  const samp = await client.query(`
    SELECT nome, score_total, score_classe,
           score_produtividade AS prod, score_engajamento AS eng,
           score_recorrencia AS rec, score_cadastro AS cad, score_criterio_entrada AS cri,
           jsonb_array_length(alertas) AS n_alertas
      FROM public.vpi_partners
     WHERE clinic_id='00000000-0000-0000-0000-000000000001'
     ORDER BY score_total DESC
     LIMIT 5
  `)
  console.log('\nTop 5 por score:')
  samp.rows.forEach(r => console.log(
    '  -', r.nome, '| total=', r.score_total, '| classe=', r.score_classe,
    '| prod/eng/rec/cad/cri=', r.prod, r.eng, r.rec, r.cad, r.cri,
    '| alertas=', r.n_alertas
  ))

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
