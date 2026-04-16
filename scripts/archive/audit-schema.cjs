/**
 * ClinicAI — Schema drift audit
 *
 * Compara, para cada entidade auditada:
 *  1. Colunas no DB (information_schema)
 *  2. Parametros do RPC upsert (pg_proc)
 *  3. Campos enviados pelo frontend (parsed do .js do repo)
 *  4. Campos coletados pelo form (parsed dos id="sp_*"/"pf_*")
 *
 * Reporta:
 *  - colunas no DB sem RPC param
 *  - RPC param sem coluna no DB
 *  - frontend manda campo que não existe no RPC
 *  - form coleta campo que não chega no save
 *
 * Uso:
 *   node scripts/audit-schema.cjs
 */
const { Client } = require('pg')
const fs = require('fs')
const path = require('path')

const ENTITIES = [
  {
    name: 'professional_profiles',
    table: 'professional_profiles',
    upsertRpc: 'upsert_professional',
    repoFile: 'js/repositories/professionals.repository.js',
    repoFnRegex: /upsert_professional[\s\S]*?\)/,
    skipColumns: ['id', 'created_at', 'updated_at', 'is_active', 'phone', 'clinic_id'],
    skipRpcParams: ['id'],
  },
  {
    name: 'clinic_procedimentos',
    table: 'clinic_procedimentos',
    upsertRpc: 'upsert_procedimento',
    repoFile: 'js/repositories/procedimentos.repository.js',
    repoFnRegex: /upsert_procedimento[\s\S]*?\)/,
    skipColumns: ['id', 'created_at', 'updated_at', 'clinic_id', 'ativo'],
    skipRpcParams: ['id', 'insumos'], // insumos vai pra tabela separada via RPC
  },
  {
    name: 'clinic_injetaveis',
    table: 'clinic_injetaveis',
    upsertRpc: 'upsert_injetavel',
    repoFile: 'js/repositories/injetaveis.repository.js',
    repoFnRegex: /upsert_injetavel[\s\S]*?\)/,
    skipColumns: ['id', 'created_at', 'updated_at', 'clinic_id', 'ativo'],
    skipRpcParams: ['id'],
  },
  {
    name: 'clinic_rooms',
    table: 'clinic_rooms',
    upsertRpc: 'upsert_room',
    repoFile: 'js/repositories/rooms.repository.js',
    repoFnRegex: /upsert_room[\s\S]*?\)/,
    skipColumns: ['id', 'created_at', 'updated_at', 'clinic_id', 'ativo'],
    skipRpcParams: ['id'],
  },
]

const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false }
})

function colorize(text, code) { return '\x1b[' + code + 'm' + text + '\x1b[0m' }
const RED = 31, GREEN = 32, YELLOW = 33, BLUE = 34, GRAY = 90, BOLD = 1

function parseRepoFields(filePath, fnRegex) {
  if (!fs.existsSync(filePath)) return null
  const content = fs.readFileSync(filePath, 'utf8')
  const match = content.match(fnRegex)
  if (!match) return null
  const block = match[0]
  // Captura "p_field_name:" no bloco
  const fields = []
  const re = /p_(\w+)\s*:/g
  let m
  while ((m = re.exec(block)) !== null) fields.push(m[1])
  return Array.from(new Set(fields))
}

function diffSets(a, b) {
  const setB = new Set(b)
  return a.filter(x => !setB.has(x))
}

async function auditEntity(entity) {
  const root = path.join(__dirname, '..')
  console.log('\n' + colorize('═══ ' + entity.name + ' ═══', BOLD))

  // 1. Colunas DB
  const colsResult = await c.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = $1 AND table_schema = 'public' ORDER BY column_name",
    [entity.table]
  )
  const dbCols = colsResult.rows.map(r => r.column_name).filter(col => !entity.skipColumns.includes(col))

  // 2. Params do RPC upsert
  const fnResult = await c.query(
    "SELECT pg_get_function_arguments(oid) AS args FROM pg_proc WHERE proname = $1",
    [entity.upsertRpc]
  )
  let rpcParams = []
  if (fnResult.rows.length > 0) {
    const argsStr = fnResult.rows[0].args
    const re = /p_(\w+)\s+/g
    let m
    while ((m = re.exec(argsStr)) !== null) rpcParams.push(m[1])
    rpcParams = Array.from(new Set(rpcParams))
  }
  const skipRpc = entity.skipRpcParams || []
  rpcParams = rpcParams.filter(p => !skipRpc.includes(p))

  // 3. Frontend repo payload
  const repoPath = path.join(root, entity.repoFile)
  let repoFields = parseRepoFields(repoPath, entity.repoFnRegex) || []
  repoFields = repoFields.filter(p => !skipRpc.includes(p))

  // Diffs
  const colsNotInRpc = diffSets(dbCols, rpcParams)
  const rpcNotInDb = diffSets(rpcParams, dbCols)
  const repoNotInRpc = diffSets(repoFields, rpcParams)
  const rpcNotInRepo = diffSets(rpcParams, repoFields)

  console.log(colorize('  DB columns:    ', GRAY) + dbCols.length)
  console.log(colorize('  RPC params:    ', GRAY) + rpcParams.length)
  console.log(colorize('  Repo fields:   ', GRAY) + repoFields.length)

  let issues = 0

  if (colsNotInRpc.length) {
    issues += colsNotInRpc.length
    console.log(colorize('  ✗ Coluna no DB sem param no RPC:', YELLOW))
    colsNotInRpc.forEach(c => console.log('    - ' + c))
  }
  if (rpcNotInDb.length) {
    issues += rpcNotInDb.length
    console.log(colorize('  ✗ Param do RPC sem coluna no DB:', RED))
    rpcNotInDb.forEach(c => console.log('    - p_' + c))
  }
  if (repoNotInRpc.length) {
    issues += repoNotInRpc.length
    console.log(colorize('  ✗ Repo manda param que não existe no RPC:', RED))
    repoNotInRpc.forEach(c => console.log('    - p_' + c))
  }
  if (rpcNotInRepo.length) {
    console.log(colorize('  ⚠ RPC aceita param que repo não envia (opcional):', GRAY))
    rpcNotInRepo.forEach(c => console.log('    - p_' + c))
  }

  if (issues === 0) {
    console.log(colorize('  ✓ OK', GREEN))
  }
  return issues
}

async function main() {
  await c.connect()
  console.log(colorize('Schema drift audit — ' + new Date().toISOString(), BOLD))
  let totalIssues = 0
  for (const entity of ENTITIES) {
    try {
      totalIssues += await auditEntity(entity)
    } catch (e) {
      console.error('Erro auditando ' + entity.name + ':', e.message)
    }
  }
  console.log('\n' + colorize('═══ Resumo ═══', BOLD))
  console.log(totalIssues === 0
    ? colorize('  Tudo OK. Nenhum drift detectado.', GREEN)
    : colorize('  ' + totalIssues + ' problemas detectados (ver acima).', RED))
  await c.end()
  process.exit(totalIssues > 0 ? 1 : 0)
}

main().catch(e => { console.error(e); process.exit(2) })
