/**
 * Upload de leads Lifting 5D para Supabase
 * Le scripts/leads-extracted.json e insere via leads_upsert RPC
 *
 * - Autentica como Luciana
 * - Dedupe contra leads existentes (por telefone)
 * - Insere com tag tags_clinica=['lifting_5d']
 * - Reporta inseridos / duplicados / erros
 *
 * Uso: node scripts/upload-lifting5d-leads.cjs
 */
const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const SUPABASE_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co'
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'
const EMAIL = 'aldenquesada82@gmail.com'
const PASSWORD = 'clinica*123'

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

async function getExistingPhones(token) {
  console.log('  Buscando leads existentes para dedupe...')
  const data = await rpc(token, 'leads_list', { p_limit: 5000, p_offset: 0 })
  const phones = new Set()
  for (const lead of (data || [])) {
    const p = String(lead.phone || lead.data?.phone || '').replace(/\D/g, '')
    if (p) phones.add(p)
  }
  console.log(`  ${data.length} leads ja existem no banco | ${phones.size} telefones unicos`)
  return phones
}

function buildPayload(lead) {
  const id = crypto.randomUUID()
  const dataExtra = {}
  // Campos extras vao no data (jsonb)
  if (lead.queixas) dataExtra.queixas = lead.queixas
  if (lead.procedimentos_anteriores) dataExtra.procedimentos_anteriores = lead.procedimentos_anteriores
  if (lead.investimento) dataExtra.investimento = lead.investimento
  if (lead.interesse) dataExtra.interesse = lead.interesse
  if (lead.motivacao) dataExtra.motivacao = lead.motivacao
  if (lead.impacto_autoestima) dataExtra.impacto_autoestima = lead.impacto_autoestima
  if (lead.nivel_pesquisa) dataExtra.nivel_pesquisa = lead.nivel_pesquisa
  if (lead.objecao) dataExtra.objecao = lead.objecao
  if (lead.utm_term) dataExtra.utm_term = lead.utm_term
  if (lead.utm_content) dataExtra.utm_content = lead.utm_content
  if (lead.funil_destino) dataExtra.funil_destino = lead.funil_destino
  if (lead.submitted_at) dataExtra.submitted_at = lead.submitted_at

  return {
    id,
    name: lead.name || 'Sem nome',
    phone: lead.phone,
    source_type: 'import',
    origem: 'Lifting 5D - ' + lead.source,
    status: 'new',
    temperature: 'warm',
    phase: 'novo_lead',
    tags_clinica: ['lifting_5d'],
    queixas_faciais: [],
    data: dataExtra,
  }
}

async function main() {
  const inputFile = path.join(__dirname, 'leads-extracted.json')
  if (!fs.existsSync(inputFile)) {
    console.error('ERRO: rode primeiro extract-lifting5d-leads.cjs')
    process.exit(1)
  }
  const leads = JSON.parse(fs.readFileSync(inputFile, 'utf8'))

  console.log('\n' + '='.repeat(70))
  console.log('  UPLOAD LEADS LIFTING 5D')
  console.log('='.repeat(70))
  console.log(`  Total a processar: ${leads.length}`)

  console.log('\n  Autenticando...')
  const token = await auth()
  console.log('  OK')

  const existingPhones = await getExistingPhones(token)

  const results = {
    inserted: 0,
    duplicated: 0,
    errors: 0,
    errorList: [],
  }

  console.log('\n  Inserindo leads...')
  console.log('  ' + '─'.repeat(66))

  for (let i = 0; i < leads.length; i++) {
    const lead = leads[i]

    if (existingPhones.has(lead.phone)) {
      results.duplicated++
      if (i % 20 === 0 || i === leads.length - 1) {
        process.stdout.write(`\r  [${i+1}/${leads.length}] inseridos: ${results.inserted} | duplicados: ${results.duplicated} | erros: ${results.errors}`)
      }
      continue
    }

    try {
      const payload = buildPayload(lead)
      const result = await rpc(token, 'leads_upsert', { p_data: payload })
      if (result && result.ok) {
        results.inserted++
        existingPhones.add(lead.phone)
      } else {
        results.errors++
        results.errorList.push({ phone: lead.phone, name: lead.name, error: JSON.stringify(result) })
      }
    } catch (err) {
      results.errors++
      results.errorList.push({ phone: lead.phone, name: lead.name, error: err.message })
    }

    if (i % 5 === 0 || i === leads.length - 1) {
      process.stdout.write(`\r  [${i+1}/${leads.length}] inseridos: ${results.inserted} | duplicados: ${results.duplicated} | erros: ${results.errors}`)
    }

    // Pequeno delay para nao sobrecarregar
    await new Promise(r => setTimeout(r, 30))
  }

  console.log('')
  console.log('  ' + '─'.repeat(66))
  console.log('\n' + '='.repeat(70))
  console.log('  RELATORIO FINAL')
  console.log('='.repeat(70))
  console.log(`  Inseridos: ${results.inserted}`)
  console.log(`  Duplicados (ja existiam): ${results.duplicated}`)
  console.log(`  Erros: ${results.errors}`)
  console.log('')
  if (results.errors > 0 && results.errorList.length > 0) {
    console.log('  Primeiros 5 erros:')
    results.errorList.slice(0, 5).forEach(e => {
      console.log(`    - ${e.name} (${e.phone}): ${e.error.substring(0, 100)}`)
    })
  }
  console.log('='.repeat(70))

  // Salva log
  fs.writeFileSync(
    path.join(__dirname, 'upload-lifting5d-log.json'),
    JSON.stringify({ timestamp: new Date().toISOString(), results }, null, 2)
  )
}

main().catch(err => {
  console.error('\nERRO FATAL:', err.message)
  process.exit(1)
})
