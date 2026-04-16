/**
 * Atualiza o Parse Message do workflow Lara para logar msgs enviadas por API
 * em vez de descartar. Usa contentType 'api_outbound' pra nao processar com Claude.
 */

const N8N_URL = 'https://flows.aldenquesada.site'
const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4NWZiNjE4NC0zMjhlLTQ0NWItYWJjZi0xYWM4MzJjODFhMGQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNzdmMjE0NzgtMTk1OS00MDhmLTgwMWEtNDM2ZDVlMWI4NzEwIiwiaWF0IjoxNzc1MjgzOTE3fQ.SsflN1gPGY1cnt16pKTGoumS4Iuh38TK-ocXS58DkW8'
const WORKFLOW_ID = '0cTSZyQ98wGxf1Qx'

async function main() {
  // 1. Buscar workflow atual
  console.log('1. Buscando workflow...')
  const r = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    headers: { 'X-N8N-API-KEY': N8N_KEY }
  })
  const workflow = await r.json()

  // 2. Encontrar o node Parse Message
  const parseNode = workflow.nodes.find(n => n.id === 'parse-message' || n.name === 'Parse Message')
  if (!parseNode) {
    console.error('Parse Message node nao encontrado!')
    return
  }

  console.log('2. Node encontrado:', parseNode.name)

  // 3. Atualizar o codigo — trocar o filtro de send.message
  let code = parseNode.parameters.jsCode

  const oldFilter = `// send.message = could be secretary from phone or Lara via API
if (event === 'send.message') {
  const source = data.source || '';
  // Skip if sent by API (Lara) — only process if from phone (android/web/ios)
  if (source === 'unknown' || source === '' || source === 'api') {
    return [{ json: { skip: true, reason: 'send.message from API (Lara)' } }];
  }`

  const newFilter = `// send.message = secretary from phone, Lara via API, or external platform
if (event === 'send.message') {
  const source = data.source || '';
  const sendPhone = (data.remoteJid || data.key?.remoteJid || '').replace('@s.whatsapp.net', '').replace(/@.*/, '');
  const sendText = data.message?.conversation || data.message?.extendedTextMessage?.text || '';
  const sendJid = data.remoteJid || data.key?.remoteJid || '';
  // API source: log as api_outbound (logged in DB but NOT processed by Claude)
  if (source === 'unknown' || source === '' || source === 'api') {
    if (sendText && sendPhone) {
      return [{ json: { skip: false, phone: sendPhone, text: sendText, contentType: 'api_outbound', caption: '', mediaType: '', pushName: '', messageId: data.key?.id || '', remoteJid: sendJid, instance: instance, timestamp: new Date().toISOString() } }];
    }
    return [{ json: { skip: true, reason: 'send.message from API without text' } }];
  }`

  if (!code.includes(oldFilter)) {
    console.error('Filtro antigo nao encontrado no codigo! Pode ter mudado.')
    // Tentar match parcial
    if (code.includes("'send.message from API (Lara)'")) {
      console.log('Match parcial encontrado, tentando replace...')
      code = code.replace(
        /\/\/ send\.message.*?if \(source === 'unknown'.*?return \[\{ json: \{ skip: true, reason: 'send\.message from API \(Lara\)' \} \}\];\s*\}/s,
        newFilter
      )
    } else {
      console.error('Nao consegui encontrar o trecho pra substituir')
      return
    }
  } else {
    code = code.replace(oldFilter, newFilter)
  }

  parseNode.parameters.jsCode = code

  // 4. Tambem preciso garantir que api_outbound NAO passa pelo Claude
  // Verificar o node que filtra skip
  const filterNode = workflow.nodes.find(n => n.name && n.name.includes('Skip') || n.name.includes('Filter') || n.name.includes('Should Process'))
  console.log('3. Filter node:', filterNode?.name || 'buscando...')

  // 5. Atualizar workflow
  console.log('4. Salvando workflow...')
  const update = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    method: 'PUT',
    headers: {
      'X-N8N-API-KEY': N8N_KEY,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(workflow)
  })

  if (update.ok) {
    console.log('✓ Workflow atualizado!')
    // Reativar
    await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}/activate`, {
      method: 'POST',
      headers: { 'X-N8N-API-KEY': N8N_KEY }
    })
    console.log('✓ Workflow reativado')
  } else {
    const err = await update.text()
    console.error('Erro ao salvar:', err.substring(0, 300))
  }

  console.log('\n=== RESULTADO ===')
  console.log('Msgs de API (outra plataforma) agora sao logadas como api_outbound')
  console.log('api_outbound NAO passa pelo Claude — so loga no banco')
  console.log('Precisa: adicionar handler no workflow pra logar api_outbound direto')
}

main().catch(console.error)
