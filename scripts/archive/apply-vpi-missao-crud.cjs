/**
 * Aplica migration: VPI Missao CRUD (Fase 4 - Entrega 4).
 * Uso: node scripts/archive/apply-vpi-missao-crud.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000043_vpi_missao_crud.sql'
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
  console.log('=== VPI Missao CRUD (Fase 4 - Entrega 4) ===\n')

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

  // Funcoes novas
  const fns = await client.query(`
    SELECT p.proname, pg_get_function_arguments(p.oid) AS args
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname='public'
       AND p.proname IN ('vpi_missao_upsert','vpi_missao_list',
                         'vpi_missao_completions','vpi_missao_delete')
     ORDER BY p.proname
  `)
  console.log('Funcoes (' + fns.rows.length + '/4):')
  fns.rows.forEach(r => console.log('  -', r.proname, '(' + r.args + ')'))

  // Teste: list
  const list = await client.query(`SELECT public.vpi_missao_list(true) AS r`)
  const arr = list.rows[0].r
  console.log('\nvpi_missao_list(true):')
  console.log('  - total missoes:', arr.length)
  if (arr.length) {
    console.log('  - amostra:', JSON.stringify({
      titulo: arr[0].titulo,
      is_active: arr[0].is_active,
      total_progresso: arr[0].total_progresso,
      total_completos: arr[0].total_completos,
      total_emitidos: arr[0].total_emitidos,
      total_pendentes: arr[0].total_pendentes,
      is_expired: arr[0].is_expired,
    }))
  }

  // Teste upsert (INSERT + UPDATE + DELETE)
  console.log('\n--- Teste CRUD sintetico ---')

  // 1. INSERT
  const ins = await client.query(`
    SELECT public.vpi_missao_upsert('{
      "titulo":"TESTE_CRUD_MIGRATION",
      "descricao":"Missao sintetica do script apply",
      "criterio":{"tipo":"indicacoes_fechadas","quantidade":2,"periodo":"30d"},
      "recompensa_texto":"Kit teste",
      "recompensa_valor":42,
      "msg_template_sucesso":"Teste {{nome}}",
      "is_active":false,
      "sort_order":999
    }'::jsonb) AS r
  `)
  const insR = ins.rows[0].r
  console.log('INSERT:', JSON.stringify(insR))
  const testId = insR.id

  // 2. UPDATE
  const upd = await client.query(
    `SELECT public.vpi_missao_upsert($1::jsonb) AS r`,
    [JSON.stringify({
      id: testId,
      titulo: 'TESTE_CRUD_MIGRATION_RENAMED',
      descricao: 'atualizado',
      criterio: { tipo: 'indicacoes_fechadas', quantidade: 3, periodo: '7d' },
      recompensa_texto: 'Kit teste atualizado',
      recompensa_valor: 100,
      msg_template_sucesso: 'Teste {{nome}}',
      is_active: false,
      sort_order: 999,
    })]
  )
  console.log('UPDATE:', JSON.stringify(upd.rows[0].r))

  // 3. Completions (vazio)
  const comp = await client.query(
    `SELECT public.vpi_missao_completions($1::uuid) AS r`, [testId]
  )
  console.log('COMPLETIONS:', (comp.rows[0].r.completions || []).length, 'rows')

  // 4. DELETE
  const del = await client.query(
    `SELECT public.vpi_missao_delete($1::uuid) AS r`, [testId]
  )
  console.log('DELETE:', JSON.stringify(del.rows[0].r))

  // 5. Validacao: missao nao existe mais
  const exists = await client.query(
    `SELECT id FROM public.vpi_missoes WHERE id = $1`, [testId]
  )
  console.log('Verificacao (deve ser vazio):', exists.rows.length ? 'FAIL' : 'OK (cleanup success)')

  console.log('\n=== OK ===')
  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
