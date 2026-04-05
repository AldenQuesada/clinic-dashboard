const N8N_URL = 'https://flows.aldenquesada.site'
const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4NWZiNjE4NC0zMjhlLTQ0NWItYWJjZi0xYWM4MzJjODFhMGQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNzdmMjE0NzgtMTk1OS00MDhmLTgwMWEtNDM2ZDVlMWI4NzEwIiwiaWF0IjoxNzc1MjgzOTE3fQ.SsflN1gPGY1cnt16pKTGoumS4Iuh38TK-ocXS58DkW8'

async function main() {
  const r = await fetch(`${N8N_URL}/api/v1/executions/5133`, {
    headers: { 'X-N8N-API-KEY': N8N_KEY }
  })
  const data = await r.json()

  // Mostrar erro
  const error = data.data?.resultData?.error
  console.log('Error:', JSON.stringify(error, null, 2)?.substring(0, 500))

  // Mostrar ultimo node que executou
  const runData = data.data?.resultData?.runData || {}
  for (const [name, runs] of Object.entries(runData)) {
    const run = runs[0]
    if (run?.error) {
      console.log('\nNode com erro:', name)
      console.log('Error msg:', run.error.message?.substring(0, 300))
    }
    const items = run?.data?.main?.[0] || []
    if (items.length > 0 && name === 'Parse Message') {
      console.log('\nParse Message output:', JSON.stringify(items[0].json).substring(0, 200))
    }
    if (items.length > 0 && name === 'Guard Check') {
      console.log('Guard Check output:', JSON.stringify(items[0].json).substring(0, 200))
    }
  }
}
main().catch(console.error)
