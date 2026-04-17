/**
 * Aplica migration: VPI Missao Emit Reward (Fase 4 - Entrega 2).
 * Uso: node scripts/archive/apply-vpi-missao-emit.cjs
 *
 * Executa apenas o migration. Para testar a emissao sintetica,
 * use scripts/archive/test-vpi-missao-emit.cjs.
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000041_vpi_missao_emit_reward.sql'
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
  console.log('=== VPI Missao Emit Reward (Fase 4 - Entrega 2) ===\n')

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

  // Coluna nova
  const col = await client.query(`
    SELECT column_name, data_type
      FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name='vpi_missao_progresso'
       AND column_name='recompensa_emitida_at'
  `)
  console.log('Coluna recompensa_emitida_at:', col.rows.length ? 'OK' : 'MISSING')

  // Funcoes
  const fns = await client.query(`
    SELECT p.proname
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('vpi_emit_missao_reward','vpi_emit_missao_rewards_batch',
                         '_vpi_missao_progresso_after_update',
                         '_vpi_missao_progresso_after_insert')
     ORDER BY p.proname
  `)
  console.log('\nFuncoes (' + fns.rows.length + '/4):')
  fns.rows.forEach(r => console.log('  -', r.proname))

  // Triggers
  const trg = await client.query(`
    SELECT tgname FROM pg_trigger
     WHERE tgname IN ('trg_vpi_missao_progresso_after_update',
                      'trg_vpi_missao_progresso_after_insert')
     ORDER BY tgname
  `)
  console.log('\nTriggers (' + trg.rows.length + '/2):')
  trg.rows.forEach(r => console.log('  -', r.tgname))

  // Estado atual do sistema de missoes
  const stats = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public.vpi_missoes WHERE is_active=true)                                         AS missoes_ativas,
      (SELECT COUNT(*)::int FROM public.vpi_missao_progresso)                                                      AS progressos,
      (SELECT COUNT(*)::int FROM public.vpi_missao_progresso WHERE completed_at IS NOT NULL)                      AS completos,
      (SELECT COUNT(*)::int FROM public.vpi_missao_progresso WHERE recompensa_emitida=true)                       AS emitidos,
      (SELECT COUNT(*)::int FROM public.vpi_missao_progresso
        WHERE completed_at IS NOT NULL AND recompensa_emitida=false)                                              AS pendentes
  `)
  console.log('\nEstado atual:')
  console.log('  - missoes ativas :', stats.rows[0].missoes_ativas)
  console.log('  - progressos     :', stats.rows[0].progressos)
  console.log('  - completos      :', stats.rows[0].completos)
  console.log('  - emitidos       :', stats.rows[0].emitidos)
  console.log('  - pendentes      :', stats.rows[0].pendentes)

  // Teste de invocacao sem ID valido
  const err = await client.query(
    `SELECT public.vpi_emit_missao_reward('00000000-0000-0000-0000-000000000000'::uuid) AS r`
  )
  console.log('\nvpi_emit_missao_reward(zero-uuid):', JSON.stringify(err.rows[0].r))

  // Audit log recente (se backfill emitiu algo)
  const audit = await client.query(`
    SELECT action, COUNT(*)::int AS n
      FROM public.vpi_audit_log
     WHERE entity_type='vpi_missao_progresso'
       AND created_at >= now() - interval '5 minutes'
     GROUP BY action
     ORDER BY action
  `)
  if (audit.rows.length) {
    console.log('\nAudit log (5min):')
    audit.rows.forEach(r => console.log('  -', r.action.padEnd(30), r.n))
  }

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
