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

const SB_KEY = process.env.SUPABASE_SECRET_KEY  // ver memory reference_clinicai_api_keys
if (!API_KEY || !SB_KEY) {
  console.error('Defina N8N_API_KEY e SUPABASE_SECRET_KEY. Ver memory reference_clinicai_api_keys.md')
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
// Sinais: (1) keyword regex | (2) state B2B ativo pro phone.
const j = $input.first().json
const phone = String(j.phone || '')
const textRaw = String(j.text || '')

// Normaliza: remove acentos/diacriticos pra regex bater com "Lista"/"Lísta"
const text = textRaw.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')

// 1. Keywords B2B
const kwRegex = /voucher|parceir|candidatura|parceria|aprova|rejeita|recusa|cazza|moinho|mormaii|osvaldo|mentor|nps|quero ser|lista pendent|lista de pendent|pendentes|stats|status|quantos vouchers|quantas parcerias/i
const kwHit = kwRegex.test(text)

// 2. Admin Mirian (só pra log, nao dispara B2B sozinho)
const last8 = phone.slice(-8)
const ADMIN_LAST8 = ['98782003', '88782003']
const isAdmin = ADMIN_LAST8.includes(last8)

// 3. State ativo? Consulta RPC mira_state_get via fetch.
// Se phone tem onboarding B2B em curso, mesmo mensagem sem keyword vai pra B2B.
let hasActiveState = false
let activeState = null
try {
  const res = await fetch('https://oqboitkpcvuaudouwvkl.supabase.co/rest/v1/rpc/mira_state_get', {
    method: 'POST',
    headers: {
      'apikey': '__SUPABASE_SECRET_KEY__',
      'Authorization': 'Bearer __SUPABASE_SECRET_KEY__',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ p_phone: phone }),
  })
  const body = await res.json()
  if (body && body.context && String(body.context).startsWith('b2b')) {
    hasActiveState = true
    activeState = body.state || null
  }
} catch (e) {
  // fail silently
}

// B2B = keyword OU state ativo
const isB2B = kwHit || hasActiveState

return [{ json: {
  ...j,
  isB2B, kwHit, isAdmin, hasActiveState,
  activeState,
  _text_norm: text, _last8: last8,
} }]
`

// Injeta a secret key do env no code antes de enviar ao n8n
const DETECT_CODE_WITH_KEY = NEW_DETECT_CODE.replace(/__SUPABASE_SECRET_KEY__/g, SB_KEY)

;(async () => {
  const cur = await req('GET', '/api/v1/workflows/' + WORKFLOW_ID)
  if (cur.status !== 200) { console.error(cur); process.exit(1) }
  const wf = cur.data
  const detect = (wf.nodes || []).find(n => n.name === 'B2B Detect')
  if (!detect) {
    console.error('Node "B2B Detect" não encontrado. Precisa rodar patch-mira-workflow-b2b.cjs antes.')
    process.exit(1)
  }
  detect.parameters.jsCode = DETECT_CODE_WITH_KEY
  const upd = await req('PUT', '/api/v1/workflows/' + WORKFLOW_ID, {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
  })
  if (upd.status !== 200) { console.error(upd); process.exit(1) }
  console.log('✓ B2B Detect atualizado (Alden + Mirian agora são admins)')
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
