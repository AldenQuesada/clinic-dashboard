const N8N_URL = 'https://flows.aldenquesada.site'
const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4NWZiNjE4NC0zMjhlLTQ0NWItYWJjZi0xYWM4MzJjODFhMGQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNzdmMjE0NzgtMTk1OS00MDhmLTgwMWEtNDM2ZDVlMWI4NzEwIiwiaWF0IjoxNzc1MjgzOTE3fQ.SsflN1gPGY1cnt16pKTGoumS4Iuh38TK-ocXS58DkW8'
const WORKFLOW_ID = '0cTSZyQ98wGxf1Qx'

async function main() {
  // 1. Buscar
  const r = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    headers: { 'X-N8N-API-KEY': N8N_KEY }
  })
  const wf = await r.json()

  // 2. Atualizar Parse Message
  const node = wf.nodes.find(n => n.id === 'parse-message')
  let code = node.parameters.jsCode

  // Substituir o filtro
  code = code.replace(
    `// Skip if sent by API (Lara) — only process if from phone (android/web/ios)\n  if (source === 'unknown' || source === '' || source === 'api') {\n    return [{ json: { skip: true, reason: 'send.message from API (Lara)' } }];\n  }\n  const sendPhone = (data.remoteJid || data.key?.remoteJid || '').replace('@s.whatsapp.net', '').replace(/@.*/, '');\n  const sendText = data.message?.conversation || data.message?.extendedTextMessage?.text || '';\n  const sendJid = data.remoteJid || data.key?.remoteJid || '';`,
    `// API source: log as api_outbound (goes to DB but NOT to Claude)\n  const sendPhone = (data.remoteJid || data.key?.remoteJid || '').replace('@s.whatsapp.net', '').replace(/@.*/, '');\n  const sendText = data.message?.conversation || data.message?.extendedTextMessage?.text || '';\n  const sendJid = data.remoteJid || data.key?.remoteJid || '';\n  if (source === 'unknown' || source === '' || source === 'api') {\n    if (sendText && sendPhone) {\n      return [{ json: { skip: false, phone: sendPhone, text: sendText, contentType: 'api_outbound', caption: '', mediaType: '', pushName: '', messageId: data.key?.id || '', remoteJid: sendJid, instance: instance, timestamp: new Date().toISOString() } }];\n    }\n    return [{ json: { skip: true, reason: 'send.message from API without text' } }];\n  }`
  )

  if (code === node.parameters.jsCode) {
    console.log('AVISO: replace nao funcionou, tentando match diferente...')
    // Fallback: replace direto do trecho skip
    code = code.replace(
      "return [{ json: { skip: true, reason: 'send.message from API (Lara)' } }];",
      "if (sendText && sendPhone) {\n      return [{ json: { skip: false, phone: sendPhone, text: sendText, contentType: 'api_outbound', caption: '', mediaType: '', pushName: '', messageId: data.key?.id || '', remoteJid: sendJid, instance: instance, timestamp: new Date().toISOString() } }];\n    }\n    return [{ json: { skip: true, reason: 'send.message from API without text' } }];"
    )
  }

  node.parameters.jsCode = code

  // 3. Salvar com campos limpos
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
  }

  console.log('Salvando...')
  const up = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (up.ok) {
    console.log('✓ Workflow salvo')
    // Reativar
    const act = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': N8N_KEY }
    })
    console.log('✓ Reativado:', act.ok)
  } else {
    const err = await up.text()
    console.error('Erro:', err.substring(0, 500))
  }
}

main().catch(console.error)
