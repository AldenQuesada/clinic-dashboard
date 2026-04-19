/**
 * Reverte o patch da Fase C restaurando o workflow a partir do backup
 * C:/Users/alden/n8n-backup/mira-whatsapp-pre-voice-b2b.json
 *
 * Uso: set N8N_API_KEY=... && node scripts/archive/revert-mira-voice-b2b.cjs
 */
const https = require('https'), fs = require('fs')
const N8N_HOST = 'flows.aldenquesada.site'
const API_KEY = process.env.N8N_API_KEY
const WORKFLOW_ID = 'j3i14cyQt3NPiGF2'
const BACKUP = 'C:/Users/alden/n8n-backup/mira-whatsapp-pre-voice-b2b.json'

if (!API_KEY) {
  console.error('Defina N8N_API_KEY no env antes de rodar.')
  process.exit(1)
}
if (!fs.existsSync(BACKUP)) {
  console.error('Backup não encontrado:', BACKUP)
  process.exit(1)
}

const wf = JSON.parse(fs.readFileSync(BACKUP, 'utf8'))
const body = JSON.stringify({
  name: wf.name,
  nodes: wf.nodes,
  connections: wf.connections,
  settings: wf.settings || {},
})

const rq = https.request({
  hostname: N8N_HOST,
  path: '/api/v1/workflows/' + WORKFLOW_ID,
  method: 'PUT',
  headers: {
    'X-N8N-API-KEY': API_KEY,
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'Content-Length': Buffer.byteLength(body),
  },
}, (res) => {
  let d = ''; res.on('data', c => d += c)
  res.on('end', () => {
    console.log('status:', res.statusCode)
    console.log('✓ revert concluído' + (res.statusCode === 200 ? '' : ' (checar response)'))
  })
})
rq.on('error', (e) => { console.error(e); process.exit(1) })
rq.write(body); rq.end()
