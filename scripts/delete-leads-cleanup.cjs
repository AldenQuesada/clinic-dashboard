/**
 * Delete leads especificos da BD (cleanup)
 * Usa leads_delete RPC (soft delete)
 */
const SUPABASE_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'
const EMAIL = 'contato@aldenquesada.org'
const PASSWORD = 'rosangela*121776'

// Lista para deletar: { name (referencia), phone }
const TO_DELETE = [
  { name: 'TJA',                          phone: '554396169163' },
  { name: '(emojis)',                     phone: '554498121969' },
  { name: 'Vânia Torres',                 phone: '554498189300' },
  { name: 'Cler Waldhelm',                phone: '554499297879' },
  { name: 'Vanessa',                      phone: '554499623427' },
  { name: 'Danilo Mohr Funes',            phone: '554499703025' },
  { name: 'Elisângela - Vendedora AAC',   phone: '554491345231' },
  { name: 'Patrícia ❤️',                  phone: '554498958157' },
  { name: 'Adriana F. Lamoglia',          phone: '554499182772' },
  { name: 'Alden',                        phone: '554498787673' },
  { name: 'Erick',                        phone: '5544991727833' },
  { name: 'Etherea Lab',                  phone: '554430250015' },
  { name: 'GRAVAÇÃO',                     phone: '5544998776543' },
  { name: 'Dra. Priscila Elias',          phone: '5511930114506' },
  { name: 'MARIA/ ENTREVISTA',            phone: '5511991360070' },
  { name: 'Nicolle Negri',                phone: '5544998416231' },
  { name: 'Gabriela Rech',                phone: '5554996308634' },
  { name: 'SARA',                         phone: '5544997338980' },
  { name: 'Glaciana Santana',             phone: '5544999157901' },
  { name: 'TIA CRIS',                     phone: '5544997889678' },
  { name: 'Joicy Soldan',                 phone: '5544998568157' },
]

// Sem telefone — busca por nome
const TO_DELETE_BY_NAME = ['Norlei Rech']

async function auth() {
  const r = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  })
  const data = await r.json()
  if (!data.access_token) throw new Error('Auth falhou: ' + JSON.stringify(data))
  return data.access_token
}

async function rpc(token, fn, params) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  })
  const data = await r.json()
  if (!r.ok) throw new Error(`${fn} HTTP ${r.status}: ${JSON.stringify(data)}`)
  return data
}

async function hardDeleteLead(token, id) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/leads?id=eq.${id}`, {
    method: 'DELETE',
    headers: {
      apikey: ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
  })
  if (!r.ok) {
    const err = await r.text()
    throw new Error(`DELETE HTTP ${r.status}: ${err}`)
  }
  return true
}

function normalizePhone(p) {
  return String(p || '').replace(/\D/g, '')
}

async function main() {
  console.log('\n' + '='.repeat(70))
  console.log('  DELETE LEADS — CLEANUP')
  console.log('='.repeat(70))
  console.log(`  A deletar: ${TO_DELETE.length} por telefone + ${TO_DELETE_BY_NAME.length} por nome`)

  console.log('\n  Autenticando...')
  const token = await auth()
  console.log('  OK')

  console.log('  Carregando leads do banco...')
  const allLeads = await rpc(token, 'leads_list', { p_limit: 5000, p_offset: 0 })
  console.log(`  ${allLeads.length} leads carregados`)

  // Mapa: phone normalizado -> {id, name}
  const byPhone = new Map()
  const byNameLC = new Map()
  for (const l of allLeads) {
    const p = normalizePhone(l.phone || l.data?.phone)
    if (p) {
      if (!byPhone.has(p)) byPhone.set(p, [])
      byPhone.get(p).push({ id: l.id, name: l.name })
    }
    const n = String(l.name || '').toLowerCase().trim()
    if (n) {
      if (!byNameLC.has(n)) byNameLC.set(n, [])
      byNameLC.get(n).push({ id: l.id, name: l.name, phone: l.phone })
    }
  }

  const results = {
    deleted: [],
    notFound: [],
    errors: [],
  }

  console.log('\n  Processando deletes por telefone...')
  console.log('  ' + '─'.repeat(66))

  for (const target of TO_DELETE) {
    const p = normalizePhone(target.phone)
    const matches = byPhone.get(p) || []

    if (matches.length === 0) {
      results.notFound.push(target)
      console.log(`  [SKIP] ${target.name} (${target.phone}) — nao encontrado`)
      continue
    }

    for (const m of matches) {
      try {
        await hardDeleteLead(token, m.id)
        results.deleted.push({ ...target, id: m.id, found_name: m.name })
        console.log(`  [DEL]  ${m.name} (${target.phone})`)
      } catch (e) {
        results.errors.push({ ...target, id: m.id, error: e.message })
        console.log(`  [ERR]  ${m.name} (${target.phone}): ${e.message}`)
      }
    }
  }

  console.log('\n  Processando deletes por nome...')
  console.log('  ' + '─'.repeat(66))

  for (const targetName of TO_DELETE_BY_NAME) {
    const n = targetName.toLowerCase().trim()
    let matches = byNameLC.get(n) || []
    // Tenta match parcial se exato falhar
    if (matches.length === 0) {
      for (const [k, v] of byNameLC.entries()) {
        if (k.includes(n) || n.includes(k)) {
          matches = matches.concat(v)
        }
      }
    }

    if (matches.length === 0) {
      results.notFound.push({ name: targetName, phone: '(sem telefone)' })
      console.log(`  [SKIP] ${targetName} — nao encontrado por nome`)
      continue
    }

    for (const m of matches) {
      try {
        await hardDeleteLead(token, m.id)
        results.deleted.push({ name: targetName, phone: m.phone, id: m.id, found_name: m.name })
        console.log(`  [DEL]  ${m.name} (${m.phone})`)
      } catch (e) {
        results.errors.push({ name: targetName, id: m.id, error: e.message })
        console.log(`  [ERR]  ${m.name}: ${e.message}`)
      }
    }
  }

  console.log('\n' + '='.repeat(70))
  console.log('  RELATORIO FINAL')
  console.log('='.repeat(70))
  console.log(`  Deletados: ${results.deleted.length}`)
  console.log(`  Nao encontrados: ${results.notFound.length}`)
  console.log(`  Erros: ${results.errors.length}`)

  if (results.notFound.length > 0) {
    console.log('\n  Nao encontrados:')
    results.notFound.forEach(t => console.log(`    - ${t.name} (${t.phone})`))
  }
  console.log('='.repeat(70))
}

main().catch(err => {
  console.error('\nERRO FATAL:', err.message)
  process.exit(1)
})
