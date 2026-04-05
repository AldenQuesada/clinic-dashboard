const fs = require('fs')
const N8N_URL = 'https://flows.aldenquesada.site'
const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4NWZiNjE4NC0zMjhlLTQ0NWItYWJjZi0xYWM4MzJjODFhMGQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNzdmMjE0NzgtMTk1OS00MDhmLTgwMWEtNDM2ZDVlMWI4NzEwIiwiaWF0IjoxNzc1MjgzOTE3fQ.SsflN1gPGY1cnt16pKTGoumS4Iuh38TK-ocXS58DkW8'
const WORKFLOW_ID = '0cTSZyQ98wGxf1Qx'

async function main() {
  // Ler o workflow original do arquivo local
  const original = JSON.parse(fs.readFileSync('C:/Users/alden/clinic-dashboard/n8n/lara-whatsapp-workflow.json', 'utf8'))

  console.log('Restaurando workflow da Lara ao estado original...')
  console.log('Nodes:', original.nodes.length)

  const payload = {
    name: original.name,
    nodes: original.nodes,
    connections: original.connections,
    settings: { executionOrder: 'v1' }
  }

  const r = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (r.ok) {
    console.log('✓ Workflow restaurado')
    await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}/activate`, {
      method: 'POST', headers: { 'X-N8N-API-KEY': N8N_KEY }
    })
    console.log('✓ Reativado')
  } else {
    const err = await r.text()
    console.error('Erro:', err.substring(0, 300))
  }
}
main().catch(console.error)
