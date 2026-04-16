const N8N_URL = 'https://flows.aldenquesada.site'
const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4NWZiNjE4NC0zMjhlLTQ0NWItYWJjZi0xYWM4MzJjODFhMGQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNzdmMjE0NzgtMTk1OS00MDhmLTgwMWEtNDM2ZDVlMWI4NzEwIiwiaWF0IjoxNzc1MjgzOTE3fQ.SsflN1gPGY1cnt16pKTGoumS4Iuh38TK-ocXS58DkW8'
const WORKFLOW_ID = '0cTSZyQ98wGxf1Qx'

async function main() {
  const r = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    headers: { 'X-N8N-API-KEY': N8N_KEY }
  })
  const wf = await r.json()

  // Trocar api_outbound → secretary_reply no Parse Message
  // Assim entra no mesmo fluxo que ja loga no banco sem Claude
  const node = wf.nodes.find(n => n.id === 'parse-message')
  let code = node.parameters.jsCode

  code = code.replace(
    "contentType: 'api_outbound'",
    "contentType: 'secretary_reply'"
  )

  if (code === node.parameters.jsCode) {
    console.log('Nada pra trocar — ja esta como secretary_reply ou api_outbound nao existe')
    return
  }

  node.parameters.jsCode = code
  console.log('✓ api_outbound trocado por secretary_reply')

  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: wf.settings?.executionOrder || 'v1' }
  }

  const up = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (up.ok) {
    console.log('✓ Salvo')
    await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}/activate`, {
      method: 'POST', headers: { 'X-N8N-API-KEY': N8N_KEY }
    })
    console.log('✓ Reativado')
    console.log('\nAgora TODA msg enviada pelo numero da clinica (qualquer plataforma)')
    console.log('e logada na Central como secretary_reply')
  } else {
    console.error('Erro:', (await up.text()).substring(0, 300))
  }
}

main().catch(console.error)
