/**
 * Cria workflow n8n "ClinicAI - B2B Alerts Scan" (cron diário 06:15 UTC).
 */
const https = require('https')
const API_KEY = process.env.N8N_API_KEY
const SB_KEY = process.env.SUPABASE_SECRET_KEY
const SB_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co'
if (!API_KEY || !SB_KEY) { console.error('envs missing'); process.exit(1) }
function req(method, path, body) {
  return new Promise((r, x) => {
    const d = body ? JSON.stringify(body) : null
    const opts = { hostname:'flows.aldenquesada.site', path, method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' } }
    if (d) { opts.headers['Content-Type']='application/json'; opts.headers['Content-Length']=Buffer.byteLength(d) }
    const rq = https.request(opts, (res)=>{ let b=''; res.on('data',c=>b+=c); res.on('end',()=>{
      try { r({status:res.statusCode, data:JSON.parse(b)}) } catch { r({status:res.statusCode, data:b}) } }) })
    rq.on('error', x); if (d) rq.write(d); rq.end()
  })
}
const nodes = [
  { parameters: { rule: { interval: [{ field:'cronExpression', expression:'15 6 * * *' }] } },
    id:'trigger', name:'Schedule Daily 06:15 UTC',
    type:'n8n-nodes-base.scheduleTrigger', typeVersion:1.2, position:[240,300] },
  { parameters: {
      method: 'POST', url: `${SB_URL}/rest/v1/rpc/b2b_alerts_scan`,
      sendHeaders: true,
      headerParameters: { parameters: [
        { name:'apikey', value: SB_KEY },
        { name:'Authorization', value: `Bearer ${SB_KEY}` },
        { name:'Content-Type', value:'application/json' } ] },
      sendBody: true, specifyBody:'json', jsonBody:'={}',
      options: { response: { response: { responseFormat:'json' } } } },
    id:'scan', name:'Run b2b_alerts_scan',
    type:'n8n-nodes-base.httpRequest', typeVersion:4.2, position:[460,300] },
]
const connections = {
  'Schedule Daily 06:15 UTC': { main: [[{ node:'Run b2b_alerts_scan', type:'main', index:0 }]] },
}
;(async () => {
  const list = await req('GET','/api/v1/workflows?limit=250')
  const existing = (list.data?.data||[]).find(w => w.name === 'ClinicAI - B2B Alerts Scan')
  if (existing) { console.log('⚠ já existe:', existing.id); return }
  const r = await req('POST','/api/v1/workflows', {
    name: 'ClinicAI - B2B Alerts Scan', nodes, connections, settings: { executionOrder:'v1' },
  })
  if (r.status !== 200 && r.status !== 201) { console.error('FAIL:', r.status, r.data); process.exit(1) }
  console.log('✓ workflow criado:', r.data.id)
  await req('POST', `/api/v1/workflows/${r.data.id}/activate`)
  console.log('✓ ativado')
})().catch(e => { console.error('FAIL:', e.message); process.exit(1) })
