/**
 * Delete leads via REST direto — nao usa leads_list
 * Para cada telefone: SELECT id, depois DELETE id
 */
const SUPABASE_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'
const EMAIL = 'contato@aldenquesada.org'
const PASSWORD = 'rosangela*121776'

const PHONES = [
  '554396169163','554498121969','554498189300','554499297879',
  '554499623427','554499703025','554491345231','554498958157',
  '554499182772','554498787673','5544991727833','554430250015',
  '5544998776543','5511930114506','5511991360070','5544998416231',
  '5554996308634','5544997338980','5544999157901','5544997889678',
  '5544998568157',
]

async function auth() {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const data = await r.json()
  if (!data.access_token) throw new Error('Auth: ' + JSON.stringify(data))
  return data.access_token
}

async function main() {
  console.log('\n' + '='.repeat(70))
  console.log('  DELETE LEADS — DIRECT REST')
  console.log('='.repeat(70))

  const token = await auth()
  console.log('  Auth OK\n')

  const headers = {
    apikey: ANON_KEY,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }

  let totalDeleted = 0
  let totalNotFound = 0
  let totalErrors = 0

  for (const phone of PHONES) {
    // 1. Buscar todos os IDs com esse telefone
    const sel = await fetch(
      `${SUPABASE_URL}/rest/v1/leads?select=id,name,clinic_id&phone=eq.${phone}`,
      { headers }
    )
    const rows = await sel.json()

    if (!Array.isArray(rows) || rows.length === 0) {
      console.log(`  [SKIP] ${phone} — nao encontrado`)
      totalNotFound++
      continue
    }

    for (const row of rows) {
      // 2. DELETE com return=representation pra ver se afetou
      const del = await fetch(
        `${SUPABASE_URL}/rest/v1/leads?id=eq.${row.id}`,
        {
          method: 'DELETE',
          headers: { ...headers, Prefer: 'return=representation' },
        }
      )
      const delResult = await del.json()

      if (!del.ok) {
        console.log(`  [ERR]  ${row.name || phone}: ${JSON.stringify(delResult)}`)
        totalErrors++
        continue
      }

      if (Array.isArray(delResult) && delResult.length > 0) {
        console.log(`  [DEL]  ${row.name || phone} (${row.id.substring(0,8)})`)
        totalDeleted++
      } else {
        console.log(`  [WARN] ${row.name || phone} — DELETE retornou 0 rows (RLS bloqueou?)`)
        totalErrors++
      }
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log(`  Deletados: ${totalDeleted}`)
  console.log(`  Nao encontrados: ${totalNotFound}`)
  console.log(`  Erros/RLS: ${totalErrors}`)
  console.log('='.repeat(70))
}

main().catch(e => { console.error('FATAL:', e.message); process.exit(1) })
