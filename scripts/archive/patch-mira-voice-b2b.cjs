/**
 * Fase C — Voz no onboarding B2B.
 *
 * Problema: áudio passa por "Is Audio? → Cap → Transcribe Groq → Parse Transcript
 * → Process Voice" SEM nunca entrar no fluxo B2B. Candidatas que mandam
 * "oi, quero ser parceira" em áudio são tratadas como mensagem genérica da Mira.
 *
 * Solução (bifurcação): entre `Parse Transcript` e `Process Voice`, injeta:
 *   - B2B Detect (Voice)          code  — mesma heurística do B2B Detect (keyword
 *                                         + state ativo), mas lê `$json.transcript`
 *                                         como texto; normaliza pra .text tb pra
 *                                         o resto do chain ler como sempre.
 *   - B2B Route? (Voice)          if    — isB2B boolean
 *       [true]  → B2B State Get (Voice)  → B2B Router (Voice) → B2B Process (Voice)
 *                  → B2B State Set (Voice) → B2B Send Reply (Voice)
 *                  → B2B Dispatch Actions (Voice) → B2B Respond OK (Voice)
 *       [false] → Process Voice (fluxo original intocado)
 *
 * Por que nodes voice-scoped (clones) e não reentrar no chain de texto:
 *   - Nodes B2B existentes usam `$('B2B Detect').item.json.phone` em várias
 *     expressões. Se o áudio entrasse no chain de texto, essa referência
 *     retornaria empty (B2B Detect text não executou nesse run).
 *   - Clonar o chain com refs a `B2B Detect (Voice)` e `B2B Process (Voice)`
 *     mantém o text-path 100% intocado (zero risco de regressão) e dá ao
 *     voice-path seu próprio frame de execução.
 *
 * Backup em C:/Users/alden/n8n-backup/mira-whatsapp-pre-voice-b2b.json
 * Idempotente: aborta se já existe "B2B Detect (Voice)".
 *
 * Uso:
 *   set N8N_API_KEY=... && set SUPABASE_SECRET_KEY=... && node scripts/archive/patch-mira-voice-b2b.cjs
 */
const https = require('https'), fs = require('fs')
const N8N_HOST = 'flows.aldenquesada.site'
const API_KEY = process.env.N8N_API_KEY
const WORKFLOW_ID = 'j3i14cyQt3NPiGF2'

const SB_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co'
const SB_KEY = process.env.SUPABASE_SECRET_KEY
const EV_HOST = 'evolution.aldenquesada.site'
const EV_INSTANCE = 'mira-mirian' // confirmed correct instance (not Mih)
const EV_API_KEY = process.env.EVOLUTION_API_KEY || '__EVOLUTION_API_KEY__'

if (!API_KEY || !SB_KEY) {
  console.error('Defina N8N_API_KEY e SUPABASE_SECRET_KEY no env antes de rodar.')
  console.error('Ver C:/Users/alden/.claude/projects/C--Users-alden/memory/reference_clinicai_api_keys.md')
  process.exit(1)
}

// Substitui placeholders em strings de code/jsonBody na hora do patch.
// Nenhum secret fica inline no arquivo commitado.
function materialize(str) {
  return String(str)
    .replace(/__SUPABASE_SECRET_KEY__/g, SB_KEY)
    .replace(/__EVOLUTION_API_KEY__/g, EV_API_KEY)
}

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const opts = {
      hostname: N8N_HOST, path, method,
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
    r.on('error', reject)
    if (data) r.write(data); r.end()
  })
}

// ══════════════════════════════════════════════════════════
// Novos nodes (voice-scoped)
// ══════════════════════════════════════════════════════════

// Position base: Parse Transcript fica em [2220, 80] no canvas.
// Encadeamos pra direita e levemente pra baixo pra não colidir com Process Voice.
const BASE_X = 2420
const BASE_Y = 260

const NODE_B2B_DETECT_VOICE = {
  parameters: {
    jsCode: materialize(`
// Detecta se a mensagem transcrita deve ir pro fluxo B2B.
// Mesma lógica do "B2B Detect" texto: keyword regex + state ativo.
// Diferença: lê \`$json.transcript\` (do Parse Transcript) como texto.
const j = $input.first().json
const phone = String(j.phone || '')
const textRaw = String(j.transcript || j.text || '')

// Normaliza: remove acentos/diacriticos pra regex bater
const text = textRaw.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '')

// 1. Keywords B2B (mesma lista do B2B Detect texto)
const kwRegex = /voucher|parceir|candidatura|parceria|aprova|rejeita|recusa|cazza|moinho|mormaii|osvaldo|mentor|nps|quero ser|lista pendent|lista de pendent|pendentes|stats|status|quantos vouchers|quantas parcerias/i
const kwHit = kwRegex.test(text)

// 2. Admin Mirian (só log)
const last8 = phone.slice(-8)
const ADMIN_LAST8 = ['98782003', '88782003']
const isAdmin = ADMIN_LAST8.includes(last8)

// 3. State ativo B2B
let hasActiveState = false
let activeState = null
try {
  const res = await fetch('__SUPABASE_URL__/rest/v1/rpc/mira_state_get', {
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
  // fail silently — sem state = só keyword decide
}

// B2B = keyword OU state ativo
const isB2B = kwHit || hasActiveState

// IMPORTANTE: escreve .text pra downstream ler como se fosse texto nativo
return [{ json: {
  ...j,
  text: textRaw,         // transcript vira text pro router
  textSource: 'voice',   // marcador pra debug
  isB2B, kwHit, isAdmin, hasActiveState,
  activeState,
  _text_norm: text, _last8: last8,
} }]
`).replace(/__SUPABASE_URL__/g, SB_URL),
  },
  id: 'b2b-detect-voice',
  name: 'B2B Detect (Voice)',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [BASE_X, BASE_Y],
}

const NODE_B2B_ROUTE_VOICE = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{
        id: 'is-b2b-voice',
        leftValue: '={{ $json.isB2B }}',
        rightValue: true,
        operator: { type: 'boolean', operation: 'true' },
      }],
      combinator: 'and',
    },
    options: {},
  },
  id: 'b2b-route-voice',
  name: 'B2B Route? (Voice)',
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [BASE_X + 200, BASE_Y],
}

const NODE_B2B_STATE_GET_VOICE = {
  parameters: {
    method: 'POST',
    url: `${SB_URL}/rest/v1/rpc/mira_state_get`,
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'apikey', value: SB_KEY },
        { name: 'Authorization', value: `Bearer ${SB_KEY}` },
        { name: 'Content-Type', value: 'application/json' },
      ],
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={{ JSON.stringify({ p_phone: $json.phone }) }}`,
    options: { response: { response: { responseFormat: 'json' } } },
  },
  id: 'b2b-state-get-voice',
  name: 'B2B State Get (Voice)',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [BASE_X + 400, BASE_Y - 60],
}

const NODE_B2B_ROUTER_VOICE = {
  parameters: {
    method: 'POST',
    url: `${SB_URL}/functions/v1/b2b-mira-router`,
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'apikey', value: SB_KEY },
        { name: 'Authorization', value: `Bearer ${SB_KEY}` },
        { name: 'Content-Type', value: 'application/json' },
      ],
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={{ JSON.stringify({ phone: $('B2B Detect (Voice)').item.json.phone, message: $('B2B Detect (Voice)').item.json.text, state: $json, source: 'voice' }) }}`,
    options: { response: { response: { responseFormat: 'json' } } },
  },
  id: 'b2b-router-voice',
  name: 'B2B Router (Voice)',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [BASE_X + 600, BASE_Y - 60],
}

const NODE_B2B_PROCESS_VOICE = {
  parameters: {
    jsCode: `
// Extrai reply/actions/next_state do router pra downstream
const r = $input.first().json
const phone = $('B2B Detect (Voice)').item.json.phone
const nextState = r.next_state || null
const intent = r.intent || 'unknown'

return [{ json: {
  phone,
  reply: r.reply || '',
  actions: r.actions || [],
  next_state: nextState,
  intent,
  role: r.role,
} }]
`,
  },
  id: 'b2b-process-voice',
  name: 'B2B Process (Voice)',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [BASE_X + 800, BASE_Y - 60],
}

const NODE_B2B_STATE_SET_VOICE = {
  parameters: {
    method: 'POST',
    url: `${SB_URL}/rest/v1/rpc/mira_state_set`,
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'apikey', value: SB_KEY },
        { name: 'Authorization', value: `Bearer ${SB_KEY}` },
        { name: 'Content-Type', value: 'application/json' },
      ],
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={{ JSON.stringify({ p_phone: $json.phone, p_state: $json.next_state, p_context: 'b2b_mira' }) }}`,
    options: { response: { response: { responseFormat: 'json' } } },
  },
  id: 'b2b-state-set-voice',
  name: 'B2B State Set (Voice)',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [BASE_X + 1000, BASE_Y - 60],
}

const NODE_B2B_SEND_REPLY_VOICE = {
  parameters: {
    method: 'POST',
    url: `https://${EV_HOST}/message/sendText/${EV_INSTANCE}`,
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'apikey', value: EV_API_KEY },
        { name: 'Content-Type', value: 'application/json' },
      ],
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={{ JSON.stringify({ number: $('B2B Detect (Voice)').item.json.phone, text: $('B2B Process (Voice)').item.json.reply }) }}`,
    options: { response: { response: { responseFormat: 'json' }, timeout: 20000 } },
  },
  id: 'b2b-send-reply-voice',
  name: 'B2B Send Reply (Voice)',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [BASE_X + 1200, BASE_Y - 60],
}

const NODE_B2B_DISPATCH_VOICE = {
  parameters: {
    jsCode: materialize(`
const https = require('https')
const actions = $('B2B Process (Voice)').item.json.actions || []
const EV_HOST = '${EV_HOST}'
const EV_PATH = '/message/sendText/${EV_INSTANCE}'
const API_KEY_EV = '__EVOLUTION_API_KEY__'

function send(number, text) {
  return new Promise((resolve) => {
    const body = JSON.stringify({ number: String(number), text: String(text) })
    const rq = https.request({
      hostname: EV_HOST, path: EV_PATH, method: 'POST',
      headers: {
        'apikey': API_KEY_EV,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (res) => {
      let d = ''; res.on('data', c => d += c)
      res.on('end', () => { try { resolve({ status: res.statusCode, body: JSON.parse(d) }) } catch { resolve({ status: res.statusCode, body: d }) } })
    })
    rq.on('error', (e) => resolve({ error: e.message }))
    rq.write(body); rq.end()
  })
}

const results = []
for (const a of actions) {
  if (!a || a.kind !== 'send_wa' || !a.to || !a.content) continue
  const r = await send(a.to, a.content)
  results.push({ to: a.to, status: r.status || null, error: r.error || null })
}
return [{ json: { actions_executed: results.length, details: results, source: 'voice' } }]
`),
  },
  id: 'b2b-dispatch-voice',
  name: 'B2B Dispatch Actions (Voice)',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [BASE_X + 1400, BASE_Y - 60],
}

const NODE_B2B_RESPOND_VOICE = {
  parameters: {
    respondWith: 'json',
    responseBody: '={{ { ok: true, b2b: true, source: "voice" } }}',
    options: {},
  },
  id: 'b2b-respond-voice',
  name: 'B2B Respond OK (Voice)',
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position: [BASE_X + 1600, BASE_Y - 60],
}

const NEW_NODES = [
  NODE_B2B_DETECT_VOICE,
  NODE_B2B_ROUTE_VOICE,
  NODE_B2B_STATE_GET_VOICE,
  NODE_B2B_ROUTER_VOICE,
  NODE_B2B_PROCESS_VOICE,
  NODE_B2B_STATE_SET_VOICE,
  NODE_B2B_SEND_REPLY_VOICE,
  NODE_B2B_DISPATCH_VOICE,
  NODE_B2B_RESPOND_VOICE,
]

// ══════════════════════════════════════════════════════════
// Patch
// ══════════════════════════════════════════════════════════

;(async () => {
  console.log('1. Baixa workflow atual…')
  const cur = await req('GET', '/api/v1/workflows/' + WORKFLOW_ID)
  if (cur.status !== 200) {
    console.error('FAIL download:', cur.status, cur.data)
    process.exit(1)
  }
  const wf = cur.data

  // Idempotência FIRST: se já tem B2B Detect (Voice), aborta sem sobrescrever backup
  if ((wf.nodes || []).some(n => n.name === 'B2B Detect (Voice)')) {
    console.log('⚠ Workflow já contém "B2B Detect (Voice)" — nada a fazer.')
    return
  }

  console.log('2. Backup (pre-patch)…')
  const backupPath = 'C:/Users/alden/n8n-backup/mira-whatsapp-pre-voice-b2b.json'
  // Não sobrescreve se já existe: preserva o verdadeiro estado pre-patch
  if (fs.existsSync(backupPath)) {
    console.log('   ℹ backup já existe, preservando:', backupPath)
  } else {
    fs.writeFileSync(backupPath, JSON.stringify(wf, null, 2))
    console.log('   ✓', backupPath)
  }

  // Sanity: checa que nodes referenciados existem
  const required = ['Parse Transcript', 'Process Voice']
  for (const n of required) {
    if (!(wf.nodes || []).some(x => x.name === n)) {
      console.error(`FAIL: node obrigatório "${n}" não encontrado no workflow.`)
      process.exit(1)
    }
  }

  console.log('3. Injetando', NEW_NODES.length, 'nodes novos…')
  wf.nodes = [...(wf.nodes || []), ...NEW_NODES]

  console.log('4. Reescrevendo connections…')
  const conns = wf.connections || {}

  // Reescreve: Parse Transcript → B2B Detect (Voice) (em vez de direto pra Process Voice)
  conns['Parse Transcript'] = {
    main: [[{ node: 'B2B Detect (Voice)', type: 'main', index: 0 }]],
  }

  // Adiciona: B2B Detect (Voice) → B2B Route? (Voice)
  conns['B2B Detect (Voice)'] = {
    main: [[{ node: 'B2B Route? (Voice)', type: 'main', index: 0 }]],
  }

  // B2B Route? (Voice): [true] → State Get (Voice); [false] → Process Voice (original)
  conns['B2B Route? (Voice)'] = {
    main: [
      [{ node: 'B2B State Get (Voice)', type: 'main', index: 0 }],
      [{ node: 'Process Voice', type: 'main', index: 0 }],
    ],
  }

  // Chain voice-scoped
  conns['B2B State Get (Voice)'] = { main: [[{ node: 'B2B Router (Voice)', type: 'main', index: 0 }]] }
  conns['B2B Router (Voice)'] = { main: [[{ node: 'B2B Process (Voice)', type: 'main', index: 0 }]] }
  conns['B2B Process (Voice)'] = { main: [[{ node: 'B2B State Set (Voice)', type: 'main', index: 0 }]] }
  conns['B2B State Set (Voice)'] = { main: [[{ node: 'B2B Send Reply (Voice)', type: 'main', index: 0 }]] }
  conns['B2B Send Reply (Voice)'] = { main: [[{ node: 'B2B Dispatch Actions (Voice)', type: 'main', index: 0 }]] }
  conns['B2B Dispatch Actions (Voice)'] = { main: [[{ node: 'B2B Respond OK (Voice)', type: 'main', index: 0 }]] }

  wf.connections = conns

  console.log('5. PUT workflow atualizado…')
  const putBody = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
  }
  const upd = await req('PUT', '/api/v1/workflows/' + WORKFLOW_ID, putBody)
  if (upd.status !== 200) {
    console.error('FAIL update:', upd.status, upd.data)
    process.exit(1)
  }
  console.log('   ✓ workflow atualizado. Total nodes agora:', upd.data.nodes?.length)
  console.log('   active:', upd.data.active)

  console.log('\n✓ Fase C aplicada. Audio "quero ser parceira" agora passa pelo B2B.')
  console.log('\nPra reverter (restaurar pre-patch):')
  console.log('  node scripts/archive/revert-mira-voice-b2b.cjs')
  console.log('  (ou via API: PUT /api/v1/workflows/' + WORKFLOW_ID + ' com conteudo de ' + backupPath + ')')
})().catch(e => { console.error('FAIL:', e.message, e.stack); process.exit(1) })
