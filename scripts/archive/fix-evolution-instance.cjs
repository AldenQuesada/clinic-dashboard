/**
 * Atualiza workflow Mira + Follow-up pra usar a instancia correta
 * do Evolution (mira-mirian = 5544998787673) em vez de Mih.
 *
 * Uso: N8N_API_KEY=... node scripts/archive/fix-evolution-instance.cjs
 */
const https = require('https')
const API_KEY = process.env.N8N_API_KEY
if (!API_KEY) { console.error('N8N_API_KEY missing'); process.exit(1) }

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

const OLD = '/sendText/Mih'
const NEW = '/sendText/mira-mirian'
const OLD_URL = 'evolution.aldenquesada.site/message' + OLD
const NEW_URL = 'evolution.aldenquesada.site/message' + NEW

function patchNodes(wf) {
  let changed = 0
  ;(wf.nodes || []).forEach(n => {
    if (n.type !== 'n8n-nodes-base.httpRequest') return
    const url = n.parameters?.url || ''
    if (url.includes(OLD)) {
      n.parameters.url = url.replace(OLD, NEW)
      changed++
      console.log(`  · URL: ${n.name} → ${n.parameters.url}`)
    }
    // Code nodes também podem ter URL hardcoded (B2B Dispatch Actions)
  })
  ;(wf.nodes || []).forEach(n => {
    if (n.type !== 'n8n-nodes-base.code') return
    const code = n.parameters?.jsCode || ''
    if (code.includes(OLD_URL)) {
      n.parameters.jsCode = code.split(OLD_URL).join(NEW_URL)
      changed++
      console.log(`  · CODE: ${n.name} (substituiu URL embutida)`)
    }
  })
  return changed
}

;(async () => {
  for (const id of ['j3i14cyQt3NPiGF2', 'rH08l8Ovq84IST3a']) {
    console.log(`\n=== Workflow ${id} ===`)
    const wf = (await req('GET', '/api/v1/workflows/' + id)).data
    console.log('  name:', wf.name)
    const changed = patchNodes(wf)
    if (!changed) { console.log('  (nenhuma mudança necessária)'); continue }
    const upd = await req('PUT', '/api/v1/workflows/' + id, {
      name: wf.name, nodes: wf.nodes, connections: wf.connections, settings: wf.settings || {},
    })
    if (upd.status === 200) console.log(`  ✓ ${changed} node(s) atualizado(s)`)
    else console.log(`  FAIL:`, upd.status, upd.data)
  }
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
