const N8N_URL = 'https://flows.aldenquesada.site'
const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4NWZiNjE4NC0zMjhlLTQ0NWItYWJjZi0xYWM4MzJjODFhMGQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNzdmMjE0NzgtMTk1OS00MDhmLTgwMWEtNDM2ZDVlMWI4NzEwIiwiaWF0IjoxNzc1MjgzOTE3fQ.SsflN1gPGY1cnt16pKTGoumS4Iuh38TK-ocXS58DkW8'
const WORKFLOW_ID = '0cTSZyQ98wGxf1Qx'

async function main() {
  const r = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    headers: { 'X-N8N-API-KEY': N8N_KEY }
  })
  const wf = await r.json()

  // Atualizar Parse Message
  const node = wf.nodes.find(n => n.id === 'parse-message')
  let code = node.parameters.jsCode

  // Replace direto do skip line
  const old = "return [{ json: { skip: true, reason: 'send.message from API (Lara)' } }];"
  const replacement = `if (sendText && sendPhone) {
      return [{ json: { skip: false, phone: sendPhone, text: sendText, contentType: 'api_outbound', caption: '', mediaType: '', pushName: '', messageId: data.key?.id || '', remoteJid: sendJid, instance: instance, timestamp: new Date().toISOString() } }];
    }
    return [{ json: { skip: true, reason: 'send.message from API without text' } }];`

  if (code.includes(old)) {
    // Preciso mover as declaracoes de sendPhone/sendText/sendJid ANTES do if
    // Atualmente estao DEPOIS do if — preciso reordenar
    code = code.replace(
      `  if (source === 'unknown' || source === '' || source === 'api') {\n    ${old}\n  }\n  const sendPhone`,
      `  const sendPhone`
    )
    // Agora inserir o novo if DEPOIS das declaracoes
    code = code.replace(
      `  const sendJid = data.remoteJid || data.key?.remoteJid || '';\n  if (sendText) {`,
      `  const sendJid = data.remoteJid || data.key?.remoteJid || '';\n  if (source === 'unknown' || source === '' || source === 'api') {\n    ${replacement}\n  }\n  if (sendText) {`
    )
    console.log('✓ Codigo atualizado com reordenacao')
  } else {
    console.log('Trecho nao encontrado, mostrando contexto...')
    const idx = code.indexOf('send.message from API')
    if (idx > -1) {
      console.log('Contexto:', code.substring(idx - 200, idx + 200))
    }
    return
  }

  node.parameters.jsCode = code

  // Salvar — so campos aceitos pela API
  const payload = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: {
      executionOrder: wf.settings?.executionOrder || 'v1'
    }
  }

  console.log('Salvando...')
  const up = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    method: 'PUT',
    headers: { 'X-N8N-API-KEY': N8N_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (up.ok) {
    console.log('✓ Workflow salvo')
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
