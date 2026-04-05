const N8N_URL = 'https://flows.aldenquesada.site'
const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4NWZiNjE4NC0zMjhlLTQ0NWItYWJjZi0xYWM4MzJjODFhMGQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNzdmMjE0NzgtMTk1OS00MDhmLTgwMWEtNDM2ZDVlMWI4NzEwIiwiaWF0IjoxNzc1MjgzOTE3fQ.SsflN1gPGY1cnt16pKTGoumS4Iuh38TK-ocXS58DkW8'

async function main() {
  // Get latest 3 executions
  const listR = await fetch(`${N8N_URL}/api/v1/executions?limit=3&workflowId=0cTSZyQ98wGxf1Qx`, {
    headers: { 'X-N8N-API-KEY': N8N_KEY }
  })
  const list = await listR.json()

  for (const exec of (list.data || [])) {
    console.log('\n=== Execution', exec.id, '|', exec.status, '===')

    const r = await fetch(`${N8N_URL}/api/v1/executions/${exec.id}`, {
      headers: { 'X-N8N-API-KEY': N8N_KEY }
    })
    const data = await r.json()
    const nodes = data.data?.resultData?.runData || {}

    for (const [name, runs] of Object.entries(nodes)) {
      const items = runs[0]?.data?.main?.[0] || []
      if (items.length === 0) continue
      const out = items[0]?.json || {}

      if (name === 'Parse Message') {
        console.log('  Parse:', 'phone=' + out.phone, '| skip=' + out.skip, '| type=' + out.contentType)
      }
      if (name === 'Get Lead Context') {
        console.log('  Context:', 'birthday_active=' + out.birthday_active, '| lead=' + out.lead?.name, '| phone=' + out.lead?.phone)
      }
      if (name === 'Build Claude Prompt') {
        console.log('  Build:', 'birthdaySkip=' + out.birthdaySkip, '| fixedResponse=' + (out.fixedResponse ? 'HAS' : 'null'), '| phone=' + out.phone)
      }
      if (name === 'Process AI Response') {
        console.log('  Process:', 'aiResponse=' + (out.aiResponse || '').substring(0, 100))
      }
      if (name === 'Route Message') {
        console.log('  Route: output triggered')
      }
    }
  }
}
main().catch(console.error)
