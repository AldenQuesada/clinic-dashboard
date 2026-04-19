/**
 * Atualiza o node "B2B Detect" do workflow Mira pra reconhecer
 * tanto Alden (5544998787673) quanto Mirian (5544988782003) como admin.
 *
 * Uso: N8N_API_KEY=xxx node scripts/archive/patch-mira-detect-admins.cjs
 */
const https = require('https')
const N8N_URL = 'flows.aldenquesada.site'
const API_KEY = process.env.N8N_API_KEY
const WORKFLOW_ID = 'j3i14cyQt3NPiGF2'

if (!API_KEY) {
  console.error('Defina N8N_API_KEY. Ver memory reference_clinicai_api_keys.md')
  process.exit(1)
}

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const opts = {
      hostname: N8N_URL, path, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' },
    }
    if (data) {
      opts.headers['Content-Type'] = 'application/json'
      opts.headers['Content-Length'] = Buffer.byteLength(data)
    }
    const r = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }) }
        catch { resolve({ status: res.statusCode, data: d }) }
      })
    })
    r.on('error', reject); if (data) r.write(data); r.end()
  })
}

const NEW_DETECT_CODE = `
// Detecta se a mensagem deve ir pro fluxo B2B.
// Sinais: keyword regex + whitelist de admins.
const j = $input.first().json
const phone = String(j.phone || '')
const textRaw = String(j.text || '')

// Normaliza: remove acentos/diacriticos pra regex bater com "Lista"/"Lísta"
const text = textRaw.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')

// 1. Keywords B2B
const kwRegex = /voucher|parceir|candidatura|parceria|aprova|rejeita|recusa|cazza|moinho|mormaii|osvaldo|mentor|nps|quero ser|lista pendent|lista de pendent|pendentes|stats|status|quantos vouchers|quantas parcerias/i
const kwHit = kwRegex.test(text)

// 2. Admin Mirian. Evolution entrega com 12 ou 13 digitos (nono digito BR opcional).
const last8 = phone.slice(-8)
const ADMIN_LAST8 = ['98782003', '88782003']
const isAdmin = ADMIN_LAST8.includes(last8)

// SO roteia pra B2B se tem keyword B2B (voucher, parceir, aprova, etc).
// Admin sem keyword = Mira normal (agenda, relatorios, etc).
// isAdmin fica salvo pra logs mas nao dispara roteamento sozinho.
const isB2B = kwHit

return [{ json: { ...j, isB2B, kwHit, isAdmin, _text_norm: text, _last8: last8 } }]
`

;(async () => {
  const cur = await req('GET', '/api/v1/workflows/' + WORKFLOW_ID)
  if (cur.status !== 200) { console.error(cur); process.exit(1) }
  const wf = cur.data
  const detect = (wf.nodes || []).find(n => n.name === 'B2B Detect')
  if (!detect) {
    console.error('Node "B2B Detect" não encontrado. Precisa rodar patch-mira-workflow-b2b.cjs antes.')
    process.exit(1)
  }
  detect.parameters.jsCode = NEW_DETECT_CODE
  const upd = await req('PUT', '/api/v1/workflows/' + WORKFLOW_ID, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
  })
  if (upd.status !== 200) { console.error(upd); process.exit(1) }
  console.log('✓ B2B Detect atualizado (Alden + Mirian agora são admins)')
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
