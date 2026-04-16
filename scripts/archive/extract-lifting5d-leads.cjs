/**
 * Extrai leads de 3 planilhas de quizzes Lifting 5D / MP Beauty
 * Normaliza os campos e salva em scripts/leads-extracted.json
 *
 * Uso: node scripts/extract-lifting5d-leads.cjs
 *
 * Sem inserir nada — so extracao + relatorio.
 */
const XLSX = require('xlsx')
const fs = require('fs')
const path = require('path')

const FILES = [
  {
    path: 'C:/Users/alden/Downloads/Anti-Curioso _ Dra. Mirian.xlsx',
    sheet: 'Dra. Mirian de Paula',
    source: 'Quiz Anti-Curioso',
  },
  {
    path: 'C:/Users/alden/Downloads/Dra. Mirian de Paula _ Novo.xlsx',
    sheet: 'Dra. Mirian de Paula Novo',
    source: 'Quiz Lifting 5D Novo',
  },
  {
    path: 'C:/Users/alden/Downloads/Dra. Mirian _ [A_B].xlsx',
    sheet: 'Dra. Mirian de Paula TesteAB',
    source: 'Quiz Lifting 5D A/B',
  },
]

// ── Helpers ────────────────────────────────────────────────

function cleanPhone(raw) {
  if (!raw) return null
  const digits = String(raw).replace(/\D/g, '')
  if (digits.length < 10 || digits.length > 13) return null
  // garante prefixo 55
  if (digits.length === 10 || digits.length === 11) return '55' + digits
  return digits
}

function cleanText(raw) {
  if (raw === null || raw === undefined) return null
  const s = String(raw).trim().replace(/\s+/g, ' ')
  return s.length > 0 ? s : null
}

function parseDate(raw) {
  if (!raw) return null
  // Formato: M/D/YYYY H:MM:SS
  const m = String(raw).match(/(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2}):(\d{2})/)
  if (!m) return null
  const [, mo, d, y, h, mi, s] = m
  // Convertendo para ISO (assumindo timezone local BR -3)
  const iso = `${y}-${mo.padStart(2,'0')}-${d.padStart(2,'0')}T${h.padStart(2,'0')}:${mi}:${s}-03:00`
  const date = new Date(iso)
  return isNaN(date.getTime()) ? null : date.toISOString()
}

function findCol(row, ...patterns) {
  const keys = Object.keys(row)
  for (const pat of patterns) {
    const re = new RegExp(pat, 'i')
    const found = keys.find(k => re.test(k))
    if (found) return row[found]
  }
  return null
}

// ── Extractors ─────────────────────────────────────────────

function extractAntiCurioso(rows, source) {
  return rows.map(r => {
    const phone = cleanPhone(findCol(r, 'Telefone'))
    if (!phone) return null
    return {
      name: cleanText(findCol(r, 'Nome')),
      phone,
      queixas: cleanText(findCol(r, 'cite 2 coisas que mais te incomodam', 'incomodam no seu rosto')),
      procedimentos_anteriores: cleanText(findCol(r, 'ja fez procedimentos esteticos', 'fez procedimentos')),
      utm_term: cleanText(findCol(r, '^utm_term$')),
      utm_content: cleanText(findCol(r, '^utm_content$')),
      funil_destino: cleanText(findCol(r, 'winning_outcome_id')),
      submitted_at: parseDate(findCol(r, 'Submitted At')),
      source,
    }
  }).filter(Boolean)
}

function extractNovo(rows, source) {
  return rows.map(r => {
    const phone = cleanPhone(findCol(r, 'Telefone'))
    if (!phone) return null
    return {
      name: cleanText(findCol(r, 'Nome')),
      phone,
      queixas: cleanText(findCol(r, 'o que mais te incomoda hoje em seu rosto')),
      procedimentos_anteriores: cleanText(findCol(r, 'voce ja realizou algum procedimento', 'realizou algum procedimento')),
      investimento: cleanText(findCol(r, 'quanto voce esta disposta a investir.*_1$', 'disposta a investir')),
      interesse: cleanText(findCol(r, 'esses sao os resultados das mulheres')),
      motivacao: cleanText(findCol(r, '^Antes de avancar')),
      utm_term: cleanText(findCol(r, '^utm_term$')),
      utm_content: cleanText(findCol(r, '^utm_content$')),
      submitted_at: parseDate(findCol(r, 'Submitted At')),
      source,
    }
  }).filter(Boolean)
}

function extractAB(rows, source) {
  return rows.map(r => {
    const phone = cleanPhone(findCol(r, 'Telefone'))
    if (!phone) return null
    return {
      name: cleanText(findCol(r, 'Nome')),
      phone,
      queixas: cleanText(findCol(r, 'sinais que.*mais te incomodam', 'sinais que mais te incomodam')),
      impacto_autoestima: cleanText(findCol(r, 'escala de 0 a 10', 'autoestima')),
      nivel_pesquisa: cleanText(findCol(r, 'ja pesquisou sobre tratamentos')),
      objecao: cleanText(findCol(r, 'poderia te impedir')),
      utm_term: cleanText(findCol(r, '^utm_term$')),
      utm_content: cleanText(findCol(r, '^utm_content$')),
      funil_destino: cleanText(findCol(r, 'winning_outcome_id')),
      submitted_at: parseDate(findCol(r, 'Submitted At')),
      source,
    }
  }).filter(Boolean)
}

// ── Main ───────────────────────────────────────────────────

const allLeads = []
const stats = []

for (const file of FILES) {
  const wb = XLSX.readFile(file.path)
  const sheet = wb.Sheets[file.sheet]
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })

  let extracted
  if (file.source.includes('Anti-Curioso')) extracted = extractAntiCurioso(rows, file.source)
  else if (file.source.includes('Novo')) extracted = extractNovo(rows, file.source)
  else extracted = extractAB(rows, file.source)

  const withoutPhone = rows.length - extracted.length
  stats.push({
    file: path.basename(file.path),
    source: file.source,
    total: rows.length,
    extracted: extracted.length,
    descartados_sem_telefone: withoutPhone,
  })

  allLeads.push(...extracted)
}

// Dedupe interno por telefone (mantem o primeiro com mais campos preenchidos)
const phoneMap = new Map()
for (const lead of allLeads) {
  const existing = phoneMap.get(lead.phone)
  if (!existing) {
    phoneMap.set(lead.phone, lead)
  } else {
    // Merge: mantem o que tem mais dados
    const existingFields = Object.values(existing).filter(v => v !== null && v !== undefined).length
    const newFields = Object.values(lead).filter(v => v !== null && v !== undefined).length
    if (newFields > existingFields) phoneMap.set(lead.phone, lead)
  }
}

const dedupedLeads = Array.from(phoneMap.values())
const internalDuplicates = allLeads.length - dedupedLeads.length

// Salvar
const outPath = path.join(__dirname, 'leads-extracted.json')
fs.writeFileSync(outPath, JSON.stringify(dedupedLeads, null, 2))

// Relatorio
console.log('\n' + '='.repeat(70))
console.log('  EXTRACAO DE LEADS LIFTING 5D')
console.log('='.repeat(70))
console.log('')
for (const s of stats) {
  console.log(`  ${s.file}`)
  console.log(`    Fonte: ${s.source}`)
  console.log(`    Total na planilha: ${s.total}`)
  console.log(`    Extraidos (com telefone): ${s.extracted}`)
  console.log(`    Descartados (sem telefone): ${s.descartados_sem_telefone}`)
  console.log('')
}
console.log('  ' + '─'.repeat(66))
console.log(`  TOTAL extraidos: ${allLeads.length}`)
console.log(`  Duplicados internos (mesmo telefone): ${internalDuplicates}`)
console.log(`  TOTAL UNICOS para inserir: ${dedupedLeads.length}`)
console.log('')
console.log(`  Arquivo gerado: ${outPath}`)
console.log('='.repeat(70))

// Sample
console.log('\n  SAMPLE (3 primeiros):')
console.log('  ' + '─'.repeat(66))
dedupedLeads.slice(0, 3).forEach((l, i) => {
  console.log(`\n  [${i+1}] ${l.name} | ${l.phone} | ${l.source}`)
  if (l.queixas) console.log(`      queixas: ${l.queixas.substring(0, 80)}`)
  if (l.procedimentos_anteriores) console.log(`      procedimentos: ${l.procedimentos_anteriores.substring(0, 60)}`)
  if (l.investimento) console.log(`      investimento: ${l.investimento}`)
  if (l.utm_term) console.log(`      utm: ${l.utm_term}`)
  if (l.submitted_at) console.log(`      data: ${l.submitted_at}`)
})
