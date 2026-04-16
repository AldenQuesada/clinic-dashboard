const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

const N8N_URL = 'https://flows.aldenquesada.site'
const N8N_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI4NWZiNjE4NC0zMjhlLTQ0NWItYWJjZi0xYWM4MzJjODFhMGQiLCJpc3MiOiJuOG4iLCJhdWQiOiJwdWJsaWMtYXBpIiwianRpIjoiNzdmMjE0NzgtMTk1OS00MDhmLTgwMWEtNDM2ZDVlMWI4NzEwIiwiaWF0IjoxNzc1MjgzOTE3fQ.SsflN1gPGY1cnt16pKTGoumS4Iuh38TK-ocXS58DkW8'
const WORKFLOW_ID = '0cTSZyQ98wGxf1Qx'

async function main() {
  await client.connect()
  console.log('=== Adicionando guard de birthday na Lara ===\n')

  // 1. Adicionar birthday_active no retorno do wa_get_lead_context
  console.log('1. Atualizando wa_get_lead_context...')

  let src = (await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'wa_get_lead_context' ORDER BY oid DESC LIMIT 1")).rows[0]?.prosrc

  // Adicionar variavel e query de birthday
  const oldDeclare = "v_funnel         text;"
  const newDeclare = "v_funnel         text;\n  v_birthday_active boolean := false;"

  const oldReturn = "'system_prompt', ''"
  const newReturn = "'system_prompt', '',\n    'birthday_active', v_birthday_active"

  // Adicionar query de birthday antes do RETURN
  const oldReturnBlock = "RETURN jsonb_build_object("
  const birthdayCheck = `-- Check birthday campaign active
  IF v_has_lead THEN
    SELECT true INTO v_birthday_active
    FROM wa_birthday_campaigns
    WHERE lead_id = v_lead.id
      AND status IN ('pending', 'sending')
      AND is_excluded = false
    LIMIT 1;
    v_birthday_active := COALESCE(v_birthday_active, false);
  END IF;

  RETURN jsonb_build_object(`

  src = src.replace(oldDeclare, newDeclare)
  src = src.replace(oldReturn, newReturn)
  src = src.replace(oldReturnBlock, birthdayCheck)

  // Recriar funcao
  // Preciso pegar a assinatura completa
  const fullFn = await client.query("SELECT pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'wa_get_lead_context' ORDER BY oid DESC LIMIT 1")

  await client.query('DROP FUNCTION IF EXISTS wa_get_lead_context(text)')
  await client.query(`
    CREATE OR REPLACE FUNCTION wa_get_lead_context(p_phone text)
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$${src}$fn$
  `)
  await client.query('GRANT EXECUTE ON FUNCTION wa_get_lead_context(text) TO anon, authenticated')
  console.log('   ✓ birthday_active adicionado ao retorno')

  // Testar
  const test = await client.query("SELECT wa_get_lead_context('5544998787673') as ctx")
  const ctx = test.rows[0]?.ctx
  console.log('   Alden birthday_active:', ctx?.birthday_active)

  // 2. Atualizar Build Claude Prompt no n8n pra verificar birthday_active
  console.log('\n2. Atualizando n8n workflow...')

  const r = await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}`, {
    headers: { 'X-N8N-API-KEY': N8N_KEY }
  })
  const wf = await r.json()

  const buildNode = wf.nodes.find(n => n.id === 'build-prompt' || n.name === 'Build Claude Prompt')
  let code = buildNode.parameters.jsCode

  // Adicionar guard no inicio do Build Claude Prompt
  // Se birthday_active, nao processar com Claude — so logar
  const oldFirstCheck = "// Check for pre-defined responses (zero tokens)"
  const newFirstCheck = `// GUARD: Birthday campaign active — don't process with Claude, just log
const _bdayCtx = $input.first().json;
if (_bdayCtx.birthday_active) {
  const _bdayMsg = $('Parse Message').first().json;
  return [{ json: { phone: _bdayMsg.phone, leadId: _bdayCtx.lead?.id || null, conversationId: _bdayCtx.conversation_id || null, systemPrompt: '', messages: [], persona: 'onboarder', messageText: _bdayMsg.text, instance: _bdayMsg.instance, fixedResponse: null, birthdaySkip: true } }];
}

// Check for pre-defined responses (zero tokens)`

  if (code.includes(oldFirstCheck)) {
    code = code.replace(oldFirstCheck, newFirstCheck)
    buildNode.parameters.jsCode = code
    console.log('   ✓ Guard de birthday adicionado no Build Claude Prompt')
  } else {
    console.log('   ✗ Trecho nao encontrado!')
  }

  // 3. Atualizar Process AI Response pra tratar birthdaySkip
  const processNode = wf.nodes.find(n => n.id === 'process-response' || n.name === 'Process AI Response')
  let processCode = processNode.parameters.jsCode

  const oldFixedCheck = "if (prevData.fixedResponse) {"
  const newFixedCheck = `if (prevData.birthdaySkip) {
  // Birthday campaign — don't respond, just log the inbound message
  const parseData = $('Parse Message').first().json;
  return [{ json: { phone: prevData.phone, leadId: prevData.leadId, conversationId: prevData.conversationId, aiResponse: '', tokensUsed: 0, tags: [], persona: prevData.persona, instance: prevData.instance, userMessage: prevData.messageText, detectedName: parseData.pushName || null, photoQueixa: null, followUp: null } }];
}
if (prevData.fixedResponse) {`

  if (processCode.includes(oldFixedCheck)) {
    processCode = processCode.replace(oldFixedCheck, newFixedCheck)
    processNode.parameters.jsCode = processCode
    console.log('   ✓ birthdaySkip handler adicionado no Process AI Response')
  }

  // Salvar workflow
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
    console.log('   ✓ Workflow salvo')
    await fetch(`${N8N_URL}/api/v1/workflows/${WORKFLOW_ID}/activate`, {
      method: 'POST', headers: { 'X-N8N-API-KEY': N8N_KEY }
    })
    console.log('   ✓ Reativado')
  } else {
    console.error('   Erro:', (await up.text()).substring(0, 300))
  }

  await client.end()
  console.log('\n=== PRONTO ===')
  console.log('Quando lead com birthday ativo responde:')
  console.log('  → Lara NAO responde com IA')
  console.log('  → Msg inbound e logada no banco')
  console.log('  → Trigger detecta resposta → auto-reply com link')
}
main().catch(console.error)
