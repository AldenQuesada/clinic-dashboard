/**
 * Adiciona fluxo B2B ao workflow Mira existente no n8n.
 *
 * Estrutura atual (relevante):
 *   Webhook → Parse Message → Should Skip? [false] → Tier 1 — Handle Message → ...
 *
 * Nova estrutura:
 *   Webhook → Parse Message → Should Skip? [false] → B2B Detect →
 *     B2B Route? [true] → B2B Router → B2B Process Response →
 *        B2B Send Reply → B2B Send Actions → B2B Respond OK
 *     B2B Route? [false] → Tier 1 — Handle Message (fluxo original)
 *
 * Backup em C:/Users/alden/n8n-backup/mira-whatsapp-pre-b2b.json
 *
 * Uso: node scripts/archive/patch-mira-workflow-b2b.cjs
 */
const https = require('https'), fs = require('fs')
const N8N_URL = 'flows.aldenquesada.site'
const API_KEY = process.env.N8N_API_KEY  // ver memory reference_clinicai_api_keys
const WORKFLOW_ID = 'j3i14cyQt3NPiGF2'

const SB_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co'
const SB_KEY = process.env.SUPABASE_SECRET_KEY  // ver memory reference_clinicai_api_keys

if (!API_KEY || !SB_KEY) {
  console.error('Defina N8N_API_KEY e SUPABASE_SECRET_KEY no env antes de rodar.')
  console.error('Ver C:/Users/alden/.claude/projects/C--Users-alden/memory/reference_clinicai_api_keys.md')
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
    r.on('error', reject)
    if (data) r.write(data); r.end()
  })
}

// ══════════════════════════════════════════════════════════
// Definição dos nodes novos
// ══════════════════════════════════════════════════════════

const NODE_B2B_DETECT = {
  parameters: {
    jsCode: `
// Detecta se a mensagem deve ir pro fluxo B2B.
// Sinais: keyword regex + whitelist de telefone + state ativo.
const j = $input.first().json
const phone = String(j.phone || '')
const text = String(j.text || '').toLowerCase()

// 1. Keywords B2B
const kwRegex = /voucher|parceir|candidatura|parceria|aprova(?:r)?|rejeita(?:r)?|cazza|moinho|mormaii|osvaldo|mentor|nps|quero ser/i
const kwHit = kwRegex.test(text)

// 2. Alden (admin) = último 8 dígitos = 98787673
const last8 = phone.slice(-8)
const isAdmin = last8 === '98787673'

// 3. State ativo (consultado no próximo node)
// Sempre roteia se: admin OR keyword hit
const isB2B = isAdmin || kwHit

return [{ json: { ...j, isB2B, kwHit, isAdmin } }]
`,
  },
  id: 'b2b-detect',
  name: 'B2B Detect',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [700, 200],
}

const NODE_B2B_ROUTE = {
  parameters: {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
      conditions: [{
        id: 'is-b2b',
        leftValue: '={{ $json.isB2B }}',
        rightValue: true,
        operator: { type: 'boolean', operation: 'true' },
      }],
      combinator: 'and',
    },
    options: {},
  },
  id: 'b2b-route',
  name: 'B2B Route?',
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: [900, 200],
}

const NODE_B2B_STATE_GET = {
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
  id: 'b2b-state-get',
  name: 'B2B State Get',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [1100, 140],
}

const NODE_B2B_ROUTER = {
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
    jsonBody: `={{ JSON.stringify({ phone: $('B2B Detect').item.json.phone, message: $('B2B Detect').item.json.text, state: $json }) }}`,
    options: { response: { response: { responseFormat: 'json' } } },
  },
  id: 'b2b-router-call',
  name: 'B2B Router',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [1300, 140],
}

const NODE_B2B_STATE_SAVE = {
  parameters: {
    jsCode: `
// Salva next_state se veio do router
const r = $input.first().json
const phone = $('B2B Detect').item.json.phone
const nextState = r.next_state || null
const intent = r.intent || 'unknown'

// Monta chamada pro state_set
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
  id: 'b2b-process',
  name: 'B2B Process',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1500, 140],
}

const NODE_B2B_STATE_SET = {
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
  id: 'b2b-state-set',
  name: 'B2B State Set',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [1700, 140],
}

const NODE_B2B_SEND_REPLY = {
  parameters: {
    method: 'POST',
    url: 'https://evolution.aldenquesada.site/message/sendText/Mih',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'apikey', value: '__EVOLUTION_API_KEY__' },
        { name: 'Content-Type', value: 'application/json' },
      ],
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: `={{ JSON.stringify({ number: $('B2B Detect').item.json.phone, text: $('B2B Process').item.json.reply }) }}`,
    options: { response: { response: { responseFormat: 'json' }, timeout: 20000 } },
  },
  id: 'b2b-send-reply',
  name: 'B2B Send Reply',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [1900, 140],
}

const NODE_B2B_ACTIONS_LOOP = {
  parameters: {
    jsCode: `
// Dispara actions send_wa sequencialmente via fetch
const actions = $('B2B Process').item.json.actions || []
const EVOLUTION = 'https://evolution.aldenquesada.site/message/sendText/Mih'
const API_KEY_EV = '__EVOLUTION_API_KEY__'

const results = []
for (const a of actions) {
  if (a.kind !== 'send_wa' || !a.to || !a.content) continue
  try {
    const r = await fetch(EVOLUTION, {
      method: 'POST',
      headers: { 'apikey': API_KEY_EV, 'Content-Type': 'application/json' },
      body: JSON.stringify({ number: a.to, text: a.content }),
    })
    results.push({ to: a.to, status: r.status })
  } catch (e) {
    results.push({ to: a.to, error: e.message })
  }
}
return [{ json: { actions_executed: results.length, details: results } }]
`,
  },
  id: 'b2b-actions',
  name: 'B2B Dispatch Actions',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [2100, 140],
}

const NODE_B2B_RESPOND_OK = {
  parameters: {
    respondWith: 'json',
    responseBody: '={{ { ok: true, b2b: true } }}',
    options: {},
  },
  id: 'b2b-respond',
  name: 'B2B Respond OK',
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position: [2300, 140],
}

const NEW_NODES = [
  NODE_B2B_DETECT, NODE_B2B_ROUTE, NODE_B2B_STATE_GET,
  NODE_B2B_ROUTER, NODE_B2B_STATE_SAVE, NODE_B2B_STATE_SET,
  NODE_B2B_SEND_REPLY, NODE_B2B_ACTIONS_LOOP, NODE_B2B_RESPOND_OK,
]

// ══════════════════════════════════════════════════════════
// Patch do workflow
// ══════════════════════════════════════════════════════════

;(async () => {
  console.log('1. Baixa workflow atual…')
  const cur = await req('GET', '/api/v1/workflows/' + WORKFLOW_ID)
  if (cur.status !== 200) {
    console.error('FAIL download:', cur.status, cur.data)
    process.exit(1)
  }
  const wf = cur.data

  console.log('2. Backup…')
  fs.writeFileSync(
    'C:/Users/alden/n8n-backup/mira-whatsapp-pre-b2b.json',
    JSON.stringify(wf, null, 2),
  )
  console.log('   ✓ C:/Users/alden/n8n-backup/mira-whatsapp-pre-b2b.json')

  // Checa se já foi patched (idempotência)
  if ((wf.nodes || []).some(n => n.name === 'B2B Detect')) {
    console.log('⚠ Workflow já contém B2B Detect — abortando pra não duplicar')
    return
  }

  console.log('3. Injetando nodes novos…')
  wf.nodes = [...(wf.nodes || []), ...NEW_NODES]

  console.log('4. Reescrevendo connections…')
  // Conexão original: "Should Skip?" saída 2 (false) → "Tier 1 — Handle Message"
  // Nova: "Should Skip?" saída 2 (false) → "B2B Detect"
  //       "B2B Detect" → "B2B Route?"
  //       "B2B Route?" true → "B2B State Get" → "B2B Router" → "B2B Process"
  //                                  → "B2B State Set" → "B2B Send Reply"
  //                                  → "B2B Dispatch Actions" → "B2B Respond OK"
  //       "B2B Route?" false → "Tier 1 — Handle Message" (mantém original)

  const conns = wf.connections || {}

  // 1. Salva conexão original do "Should Skip?" saída false (main[1])
  const shouldSkipConns = conns['Should Skip?']?.main || []
  const falseBranch = shouldSkipConns[1] || []

  // 2. Reescreve pra apontar pra B2B Detect
  if (conns['Should Skip?']?.main) {
    conns['Should Skip?'].main[1] = [{ node: 'B2B Detect', type: 'main', index: 0 }]
  }

  // 3. Adiciona conexões dos novos nodes
  conns['B2B Detect'] = { main: [[{ node: 'B2B Route?', type: 'main', index: 0 }]] }
  conns['B2B Route?'] = {
    main: [
      // true
      [{ node: 'B2B State Get', type: 'main', index: 0 }],
      // false → mantém caminho original do "Should Skip?" false
      falseBranch,
    ],
  }
  conns['B2B State Get'] = { main: [[{ node: 'B2B Router', type: 'main', index: 0 }]] }
  conns['B2B Router'] = { main: [[{ node: 'B2B Process', type: 'main', index: 0 }]] }
  conns['B2B Process'] = { main: [[{ node: 'B2B State Set', type: 'main', index: 0 }]] }
  conns['B2B State Set'] = { main: [[{ node: 'B2B Send Reply', type: 'main', index: 0 }]] }
  conns['B2B Send Reply'] = { main: [[{ node: 'B2B Dispatch Actions', type: 'main', index: 0 }]] }
  conns['B2B Dispatch Actions'] = { main: [[{ node: 'B2B Respond OK', type: 'main', index: 0 }]] }

  wf.connections = conns

  console.log('5. PUT workflow atualizado…')
  // n8n PUT costuma precisar só de { name, nodes, connections, settings }
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
  console.log('   ✓ workflow atualizado')

  console.log('\n✓ Pronto. Workflow Mira patched com B2B.')
  console.log('  Nodes novos:', NEW_NODES.length)
  console.log('  Active:', upd.data.active)
  console.log('\nPra testar:')
  console.log('  - manda "aprova cazza flor" no WhatsApp da Mira (Alden)')
  console.log('  - ou mensagem "quero ser parceira" de outro número')
})().catch(e => { console.error('FAIL:', e.message, e.stack); process.exit(1) })
