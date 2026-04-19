/**
 * Aplica migration 20260420_anatomy_quiz_lifecycle_bridge.sql via pg direto.
 * Reuso da conexao IPv6 documentada (reference_supabase_direct_pg).
 */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

// Project ref: oqboitkpcvuaudouwvkl
// Connection from env or hardcode dev (db password obtido do dashboard Supabase)
const SQL_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '20260420_anatomy_quiz_lifecycle_bridge.sql')

;(async () => {
  const password = process.env.SUPABASE_DB_PASSWORD
  if (!password) {
    console.error('Defina SUPABASE_DB_PASSWORD no env (pegue no Supabase Dashboard > Settings > Database)')
    console.error('PowerShell: $env:SUPABASE_DB_PASSWORD = "..."')
    console.error('CMD:       set SUPABASE_DB_PASSWORD=...')
    console.error('Bash:      export SUPABASE_DB_PASSWORD=...')
    process.exit(1)
  }

  const client = new Client({
    host:     'db.oqboitkpcvuaudouwvkl.supabase.co',
    port:     5432,
    user:     'postgres',
    database: 'postgres',
    password: password,
    ssl:      { rejectUnauthorized: false },
  })

  try {
    await client.connect()
    console.log('Conectado ao Supabase via pg')
    const sql = fs.readFileSync(SQL_FILE, 'utf8')
    console.log(`Aplicando ${path.basename(SQL_FILE)}...`)
    await client.query(sql)
    console.log('OK · migration aplicada')

    // Smoke tests
    const r1 = await client.query("SELECT public._aq_top_complaints(ARRAY['olheiras','testa','labios']::text[]) AS top")
    console.log('Smoke score:', JSON.stringify(r1.rows[0].top))

    const r2 = await client.query("SELECT public._aq_lookup_lifecycle('5544991622986') AS lifecycle")
    console.log('Smoke lookup:', JSON.stringify(r2.rows[0].lifecycle))

    console.log('\n✓ Bridge anatomy_quiz → Lara pronto.')
    console.log('  Tabela dispatch:    anatomy_quiz_lara_dispatch')
    console.log('  Tabela proof:       anatomy_quiz_proof_photos')
    console.log('  Trigger:            trg_anatomy_quiz_dispatch on lp_leads')
  } catch (err) {
    console.error('ERRO:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
})()
