/**
 * Corrige o node "B2B Dispatch Actions" do workflow Mira pra usar
 * require('https') em vez de fetch (que não existe no Code node do n8n).
 */
const https = require('https')
const API_KEY = process.env.N8N_API_KEY
const EV_KEY = process.env.EVOLUTION_API_KEY
if (!API_KEY || !EV_KEY) { console.error('N8N_API_KEY e EVOLUTION_API_KEY missing'); process.exit(1) }

function req(method, path, body) {
  return new Promise((r, x) => {
    const data = body ? JSON.stringify(body) : null
    const opts = {
      hostname: 'flows.aldenquesada.site', path, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' },
    }
    if (data) {
      opts.headers['Content-Type'] = 'application/json'
      opts.headers['Content-Length'] = Buffer.byteLength(data)
    }
    const rq = https.request(opts, (res) => {
      let d = ''; res.on('data', c => d += c); res.on('end', () => {
        try { r({ status: res.statusCode, data: JSON.parse(d) }) }
        catch { r({ status: res.statusCode, data: d }) }
      })
    })
    rq.on('error', x); if (data) rq.write(data); rq.end()
  })
}

const NEW_CODE = (`
const https = require('https')
const actions = $('B2B Process').item.json.actions || []
const EV_HOST = 'evolution.aldenquesada.site'
const EV_PATH = '/message/sendText/mira-mirian'
const API_KEY_EV = '${EV_KEY_PLACEHOLDER}'

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
return [{ json: { actions_executed: results.length, details: results } }]
`).replace(/\$\{EV_KEY_PLACEHOLDER\}/g, EV_KEY)

;(async () => {
  const wf = (await req('GET', '/api/v1/workflows/j3i14cyQt3NPiGF2')).data
  const node = (wf.nodes || []).find(n => n.name === 'B2B Dispatch Actions')
  if (!node) { console.error('node não encontrado'); process.exit(1) }
  node.parameters.jsCode = NEW_CODE
  const upd = await req('PUT', '/api/v1/workflows/j3i14cyQt3NPiGF2', {
    name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {},
  })
  console.log(upd.status === 200 ? '✓ B2B Dispatch Actions corrigido (require(https))' : 'FAIL: ' + JSON.stringify(upd.data).slice(0, 300))
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
