/**
 * Cria workflow n8n novo: "ClinicAI - Mira B2B Follow-up"
 *
 * Schedule diário (08:00 BRT / 11:00 UTC):
 *   1. chama b2b_applications_follow_up_queue → lista de candidaturas 24h+
 *   2. pra cada item: envia mensagem educada via Evolution + marca
 *      b2b_application_mark_followed_up
 *   3. chama b2b_applications_archive_stale (48h+ pending após follow-up)
 *
 * Uso:
 *   N8N_API_KEY=xxx SUPABASE_SECRET_KEY=yyy EVOLUTION_API_KEY=zzz \
 *   node scripts/archive/create-mira-followup-workflow.cjs
 */
const https = require('https')
const N8N_URL = 'flows.aldenquesada.site'
const API_KEY = process.env.N8N_API_KEY
const SB_KEY = process.env.SUPABASE_SECRET_KEY
const EVOLUTION_KEY = process.env.EVOLUTION_API_KEY
const EVOLUTION_URL = 'https://evolution.aldenquesada.site/message/sendText/Mih'
const SB_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co'

if (!API_KEY || !SB_KEY || !EVOLUTION_KEY) {
  console.error('Defina N8N_API_KEY, SUPABASE_SECRET_KEY, EVOLUTION_API_KEY')
  console.error('Ver memory reference_clinicai_api_keys.md')
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

// Nodes do workflow
const nodes = [
  {
    parameters: {
      rule: { interval: [{ field: 'cronExpression', expression: '0 11 * * *' }] },
    },
    id: 'trigger', name: 'Schedule Daily 08h BRT',
    type: 'n8n-nodes-base.scheduleTrigger',
    typeVersion: 1.2, position: [240, 300],
  },
  {
    parameters: {
      method: 'POST',
      url: `${SB_URL}/rest/v1/rpc/b2b_applications_follow_up_queue`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: SB_KEY },
          { name: 'Authorization', value: `Bearer ${SB_KEY}` },
          { name: 'Content-Type', value: 'application/json' },
        ],
      },
      sendBody: true, specifyBody: 'json', jsonBody: '={}',
      options: { response: { response: { responseFormat: 'json' } } },
    },
    id: 'queue', name: 'Get Follow-up Queue',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [460, 300],
  },
  {
    parameters: {
      jsCode:
`// Expande a lista de candidaturas pendentes em items separados
const body = $input.first().json
const items = Array.isArray(body) ? body : []
if (!items.length) return []  // nenhuma candidatura pendente, pipeline vazio
return items.map(item => ({ json: item }))`,
    },
    id: 'expand', name: 'Expand Queue',
    type: 'n8n-nodes-base.code', typeVersion: 2, position: [680, 300],
  },
  {
    parameters: {
      method: 'POST', url: EVOLUTION_URL,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: EVOLUTION_KEY },
          { name: 'Content-Type', value: 'application/json' },
        ],
      },
      sendBody: true, specifyBody: 'json',
      jsonBody:
`={{ JSON.stringify({
  number: $json.requested_by_phone,
  text: 'Oi! Tô por aqui se quiser retomar o cadastro da parceria. Sem pressão — qualquer hora você volta, tudo bem.'
}) }}`,
      options: { response: { response: { responseFormat: 'json' }, timeout: 20000 } },
    },
    id: 'send', name: 'Send Gentle Touch',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [900, 300],
  },
  {
    parameters: {
      method: 'POST',
      url: `${SB_URL}/rest/v1/rpc/b2b_application_mark_followed_up`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: SB_KEY },
          { name: 'Authorization', value: `Bearer ${SB_KEY}` },
          { name: 'Content-Type', value: 'application/json' },
        ],
      },
      sendBody: true, specifyBody: 'json',
      jsonBody: `={{ JSON.stringify({ p_id: $('Expand Queue').item.json.id }) }}`,
      options: { response: { response: { responseFormat: 'json' } } },
    },
    id: 'mark', name: 'Mark Followed Up',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [1120, 300],
  },
  {
    parameters: {
      method: 'POST',
      url: `${SB_URL}/rest/v1/rpc/b2b_applications_archive_stale`,
      sendHeaders: true,
      headerParameters: {
        parameters: [
          { name: 'apikey', value: SB_KEY },
          { name: 'Authorization', value: `Bearer ${SB_KEY}` },
          { name: 'Content-Type', value: 'application/json' },
        ],
      },
      sendBody: true, specifyBody: 'json', jsonBody: '={}',
      options: { response: { response: { responseFormat: 'json' } } },
    },
    id: 'archive', name: 'Archive Stale',
    type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2, position: [460, 500],
  },
]

const connections = {
  'Schedule Daily 08h BRT': { main: [[
    { node: 'Get Follow-up Queue', type: 'main', index: 0 },
    { node: 'Archive Stale',       type: 'main', index: 0 }, // paralelo
  ]] },
  'Get Follow-up Queue': { main: [[{ node: 'Expand Queue',    type: 'main', index: 0 }]] },
  'Expand Queue':        { main: [[{ node: 'Send Gentle Touch', type: 'main', index: 0 }]] },
  'Send Gentle Touch':   { main: [[{ node: 'Mark Followed Up',  type: 'main', index: 0 }]] },
}

;(async () => {
  // Idempotência: checar se já existe pelo nome
  const list = await req('GET', '/api/v1/workflows?limit=250')
  const existing = (list.data?.data || []).find(w => w.name === 'ClinicAI - Mira B2B Follow-up')
  if (existing) {
    console.log('⚠ Workflow já existe:', existing.id, '· active:', existing.active)
    console.log('  Pra refazer, apague via UI e roda de novo.')
    return
  }

  const body = {
    name: 'ClinicAI - Mira B2B Follow-up',
    nodes, connections,
    settings: { executionOrder: 'v1' },
  }
  const r = await req('POST', '/api/v1/workflows', body)
  if (r.status !== 200 && r.status !== 201) {
    console.error('FAIL create:', r.status, JSON.stringify(r.data).slice(0, 400))
    process.exit(1)
  }
  console.log('✓ Workflow criado:', r.data.id, '· active:', r.data.active)

  // Ativa
  const act = await req('POST', `/api/v1/workflows/${r.data.id}/activate`)
  if (act.status === 200) console.log('✓ Workflow ativado')
  else console.log('⚠ Ativação manual: abra no n8n e toggle Active')
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
