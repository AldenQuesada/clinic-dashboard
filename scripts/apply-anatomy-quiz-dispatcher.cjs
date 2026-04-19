/**
 * Aplica migration 2 (dispatcher pg_net+pg_cron) E
 * popula vault.secrets com keys necessarias.
 *
 * Reads secrets from env (NUNCA commitar):
 *   SUPABASE_DB_PASSWORD     (obrigatorio · senha do db)
 *   ANTHROPIC_API_KEY        (Claude · sk-ant-...)
 *   EVOLUTION_API_KEY        (Mih · 429683C4C977415CAAFCCE10F7D57E11)
 *   EVOLUTION_BASE_URL       (https://evolution.aldenquesada.site)
 *   EVOLUTION_INSTANCE       (Mih)
 */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const SQL_FILE = path.join(__dirname, '..', 'supabase', 'migrations', '20260420_anatomy_quiz_lara_dispatcher.sql')

;(async () => {
  const required = ['SUPABASE_DB_PASSWORD','ANTHROPIC_API_KEY','EVOLUTION_API_KEY','EVOLUTION_BASE_URL','EVOLUTION_INSTANCE']
  const missing = required.filter(k => !process.env[k])
  if (missing.length) {
    console.error('FALTAM env vars: ' + missing.join(', '))
    process.exit(1)
  }

  const client = new Client({
    host:'db.oqboitkpcvuaudouwvkl.supabase.co',
    port:5432, user:'postgres', database:'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl:{ rejectUnauthorized:false },
  })

  try {
    await client.connect()
    console.log('Conectado · aplicando dispatcher migration...')
    const sql = fs.readFileSync(SQL_FILE, 'utf8')
    await client.query(sql)
    console.log('OK · dispatcher migration aplicada')

    // Popula vault com cada secret · upsert idempotente
    const secrets = {
      ANTHROPIC_API_KEY:   process.env.ANTHROPIC_API_KEY,
      EVOLUTION_API_KEY:   process.env.EVOLUTION_API_KEY,
      EVOLUTION_BASE_URL:  process.env.EVOLUTION_BASE_URL,
      EVOLUTION_INSTANCE:  process.env.EVOLUTION_INSTANCE,
    }
    for (const [name, value] of Object.entries(secrets)) {
      // tenta update primeiro · se nao existir, insere
      const r = await client.query(`
        SELECT id FROM vault.secrets WHERE name = $1
      `, [name])
      if (r.rows.length) {
        await client.query(`
          SELECT vault.update_secret($1::uuid, $2::text)
        `, [r.rows[0].id, value])
        console.log(`  secret ${name}: UPDATED`)
      } else {
        await client.query(`
          SELECT vault.create_secret($1::text, $2::text)
        `, [value, name])
        console.log(`  secret ${name}: CREATED`)
      }
    }

    // Smoke test · verifica que pg_net tá ativo + cron job criado
    const ext = await client.query("SELECT extname FROM pg_extension WHERE extname IN ('pg_net','pg_cron')")
    console.log('Extensions:', ext.rows.map(r=>r.extname).join(', '))
    const job = await client.query("SELECT jobname, schedule FROM cron.job WHERE jobname='aq_lara_dispatcher'")
    console.log('Cron job:', job.rows[0] || 'NOT FOUND')

    console.log('\n✓ Dispatcher pronto · pg_cron processa fila a cada 1 min via Claude Haiku + Evolution')
    console.log('  Pra disparar manual agora:')
    console.log("  SELECT public.aq_process_pending();")
  } catch (err) {
    console.error('ERRO:', err.message)
    process.exit(1)
  } finally {
    await client.end()
  }
})()
