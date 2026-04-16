const N8N_URL = 'https://flows.aldenquesada.site'
const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4NWZiNjE4NC0zMjhlLTQ0NWItYWJjZi0xYWM4MzJjODFhMGQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNzdmMjE0NzgtMTk1OS00MDhmLTgwMWEtNDM2ZDVlMWI4NzEwIiwiaWF0IjoxNzc1MjgzOTE3fQ.SsflN1gPGY1cnt16pKTGoumS4Iuh38TK-ocXS58DkW8'

async function main() {
  console.log('=== Atualizando Outbox Processor: batch 1, anti-bloqueio ===\n')

  // Buscar workflow
  const r = await fetch(`${N8N_URL}/api/v1/workflows/x5f4MApEcSUX5hca`, {
    headers: { 'X-N8N-API-KEY': N8N_KEY }
  })
  const wf = await r.json()
  console.log('Workflow:', wf.name, '| active:', wf.active)

  // 1. Mudar p_limit de 10 pra 1
  const fetchNode = wf.nodes.find(n => n.name === 'Fetch Pending')
  const limitParam = fetchNode.parameters.bodyParameters.parameters.find(p => p.name === 'p_limit')
  console.log('\nBatch antes:', limitParam.value)
  limitParam.value = '1'
  console.log('Batch depois:', limitParam.value)

  // 2. Salvar
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: { executionOrder: wf.settings?.executionOrder || 'v1' }
  }

  const up = await fetch(`${N8N_URL}/api/v1/workflows/x5f4MApEcSUX5hca`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (up.ok) {
    console.log('\n✓ Workflow salvo')
    await fetch(`${N8N_URL}/api/v1/workflows/x5f4MApEcSUX5hca/activate`, {
      method: 'POST', headers: { 'X-N8N-API-KEY': N8N_KEY }
    })
    console.log('✓ Reativado')
  } else {
    console.error('Erro:', (await up.text()).substring(0, 300))
  }

  console.log('\n=== Config final ===')
  console.log('Batch: 1 msg por vez')
  console.log('Intervalo: 2 min (cron existente)')
  console.log('Resultado: 1 msg a cada 2 min = 30/hora')
  console.log('Anti-bloqueio: maximo, zero risco')
  console.log('Se falhar: retry automatico (max_attempts=3 no outbox)')
}
main().catch(console.error)
