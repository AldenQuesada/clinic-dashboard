const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== Fix completo: normalizacao de phone ===\n')

  // 1. Verificar quantas RPCs buscam leads por phone exato
  const rpcs = await client.query(`
    SELECT proname FROM pg_proc
    WHERE prosrc LIKE '%FROM leads%WHERE%phone = p_phone%'
      OR prosrc LIKE '%FROM leads%phone = p_phone%'
    ORDER BY proname
  `)
  console.log('1. RPCs que buscam lead por phone exato:')
  rpcs.rows.forEach(r => console.log('  ', r.proname))

  // 2. Atualizar wa_get_lead_context — busca por ultimos 8 digitos
  console.log('\n2. Atualizando wa_get_lead_context...')
  let ctxSrc = (await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'wa_get_lead_context' ORDER BY oid DESC LIMIT 1")).rows[0]?.prosrc

  // Substituir busca exata por busca fuzzy
  const oldLeadSearch = "SELECT * INTO v_lead FROM leads\n  WHERE phone = p_phone AND clinic_id = v_clinic_id AND deleted_at IS NULL\n  ORDER BY created_at DESC LIMIT 1;"
  const newLeadSearch = "SELECT * INTO v_lead FROM leads\n  WHERE phone LIKE '%' || right(p_phone, 8) AND clinic_id = v_clinic_id AND deleted_at IS NULL\n  ORDER BY created_at DESC LIMIT 1;"

  if (ctxSrc.includes(oldLeadSearch)) {
    ctxSrc = ctxSrc.replace(oldLeadSearch, newLeadSearch)
    await client.query('DROP FUNCTION IF EXISTS wa_get_lead_context(text)')
    await client.query(`
      CREATE OR REPLACE FUNCTION wa_get_lead_context(p_phone text)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
      AS $fn$${ctxSrc}$fn$
    `)
    await client.query('GRANT EXECUTE ON FUNCTION wa_get_lead_context(text) TO anon, authenticated')
    console.log('   ✓ Busca lead por ultimos 8 digitos')
  } else {
    console.log('   Trecho nao encontrado, verificando...')
    const idx = ctxSrc.indexOf('FROM leads')
    console.log('   Contexto:', ctxSrc.substring(idx, idx + 150))
  }

  // 3. Atualizar wa_get_lead_context — busca conversa tambem por ultimos 8 digitos
  console.log('\n3. Verificando busca de conversa...')
  ctxSrc = (await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'wa_get_lead_context' ORDER BY oid DESC LIMIT 1")).rows[0]?.prosrc

  // Conversas: ja busca por phone = p_phone, precisa adicionar fuzzy
  const oldConvSearch = "SELECT * INTO v_conv FROM wa_conversations\n  WHERE phone = p_phone AND clinic_id = v_clinic_id"
  const newConvSearch = "SELECT * INTO v_conv FROM wa_conversations\n  WHERE (phone = p_phone OR phone LIKE '%' || right(p_phone, 8)) AND clinic_id = v_clinic_id"

  if (ctxSrc.includes(oldConvSearch)) {
    ctxSrc = ctxSrc.replace(oldConvSearch, newConvSearch)
    await client.query('DROP FUNCTION IF EXISTS wa_get_lead_context(text)')
    await client.query(`
      CREATE OR REPLACE FUNCTION wa_get_lead_context(p_phone text)
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
      AS $fn$${ctxSrc}$fn$
    `)
    await client.query('GRANT EXECUTE ON FUNCTION wa_get_lead_context(text) TO anon, authenticated')
    console.log('   ✓ Busca conversa por ultimos 8 digitos')
  } else {
    console.log('   Trecho nao encontrado')
    const idx2 = ctxSrc.indexOf('INTO v_conv')
    console.log('   Contexto:', ctxSrc.substring(idx2 - 50, idx2 + 200))
  }

  // 4. Atualizar wa_log_message — busca conversa por fuzzy
  console.log('\n4. Verificando wa_log_message...')
  let logSrc = (await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'wa_log_message' ORDER BY oid DESC LIMIT 1")).rows[0]?.prosrc

  if (logSrc && logSrc.includes("phone = p_phone")) {
    logSrc = logSrc.replace(
      /WHERE\s+phone\s*=\s*p_phone\s+AND\s+clinic_id/g,
      "WHERE (phone = p_phone OR phone LIKE '%' || right(p_phone, 8)) AND clinic_id"
    )
    const logArgs = (await client.query("SELECT pg_get_function_identity_arguments(oid) as args FROM pg_proc WHERE proname = 'wa_log_message' ORDER BY oid DESC LIMIT 1")).rows[0]?.args
    await client.query('DROP FUNCTION IF EXISTS wa_log_message(' + logArgs + ')')
    await client.query(`
      CREATE OR REPLACE FUNCTION wa_log_message(${logArgs})
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
      AS $fn$${logSrc}$fn$
    `)
    await client.query('GRANT EXECUTE ON FUNCTION wa_log_message(' + logArgs + ') TO anon, authenticated')
    console.log('   ✓ wa_log_message atualizado')
  } else {
    console.log('   Sem busca por phone exato ou ja atualizado')
  }

  // 5. Verificar wa_log_secretary_reply
  console.log('\n5. Verificando wa_log_secretary_reply...')
  let secSrc = (await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'wa_log_secretary_reply' ORDER BY oid DESC LIMIT 1")).rows[0]?.prosrc
  if (secSrc && secSrc.includes("phone = p_phone")) {
    secSrc = secSrc.replace(
      /WHERE\s+phone\s*=\s*p_phone\s+AND\s+clinic_id/g,
      "WHERE (phone = p_phone OR phone LIKE '%' || right(p_phone, 8)) AND clinic_id"
    )
    const secArgs = (await client.query("SELECT pg_get_function_identity_arguments(oid) as args FROM pg_proc WHERE proname = 'wa_log_secretary_reply' ORDER BY oid DESC LIMIT 1")).rows[0]?.args
    await client.query('DROP FUNCTION IF EXISTS wa_log_secretary_reply(' + secArgs + ')')
    await client.query(`
      CREATE OR REPLACE FUNCTION wa_log_secretary_reply(${secArgs})
      RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
      AS $fn$${secSrc}$fn$
    `)
    await client.query('GRANT EXECUTE ON FUNCTION wa_log_secretary_reply(' + secArgs + ') TO anon, authenticated')
    console.log('   ✓ wa_log_secretary_reply atualizado')
  } else {
    console.log('   Sem busca por phone exato')
  }

  // 6. Verificar auto-create lead (wa_detect_funnel ou dentro do wa_log_message)
  console.log('\n6. Verificando auto-create de lead...')
  // Se wa_get_lead_context nao encontra lead, o sistema cria um novo?
  // Verificar no wa_log_message se cria lead
  const autoCreate = (await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'wa_log_message' ORDER BY oid DESC LIMIT 1")).rows[0]?.prosrc || ''
  if (autoCreate.includes('INSERT INTO leads')) {
    console.log('   ⚠ wa_log_message cria leads automaticamente — verificar se usa phone fuzzy')
  } else {
    console.log('   wa_log_message NAO cria leads')
  }

  // Verificar se ha funcao que auto-cria leads
  const autoCreateFns = await client.query(`
    SELECT proname FROM pg_proc
    WHERE prosrc LIKE '%INSERT INTO leads%'
      AND proname LIKE 'wa_%'
  `)
  console.log('   RPCs que criam leads:', autoCreateFns.rows.map(r => r.proname).join(', ') || 'nenhuma')

  // 7. Verificar patients e appointments com lead_id deletado
  console.log('\n7. Verificando referencias a leads deletados...')
  const deletedLeads = await client.query("SELECT id FROM leads WHERE deleted_at IS NOT NULL AND phone LIKE '%_MERGED'")
  const deletedIds = deletedLeads.rows.map(r => "'" + r.id + "'").join(',')

  if (deletedIds) {
    const patRefs = await client.query(`SELECT count(*) as c FROM patients WHERE "leadId" IN (${deletedIds})`)
    const apptRefs = await client.query(`SELECT count(*) as c FROM appointments WHERE patient_id IN (${deletedIds})`)
    console.log('   Patients com lead deletado:', patRefs.rows[0]?.c)
    console.log('   Appointments com lead deletado:', apptRefs.rows[0]?.c)
  }

  // 8. Reload PostgREST
  await client.query("NOTIFY pgrst, 'reload schema'")
  console.log('\n8. PostgREST reload enviado')

  // 9. TESTE: simular busca como a Evolution faria
  console.log('\n=== TESTE ===')
  const test = await client.query("SELECT (wa_get_lead_context('554498782003'))::jsonb->'lead'->'name' as name")
  console.log('Busca 554498782003 (12 dig):', test.rows[0]?.name)
  const test2 = await client.query("SELECT (wa_get_lead_context('5544998782003'))::jsonb->'lead'->'name' as name")
  console.log('Busca 5544998782003 (13 dig):', test2.rows[0]?.name)

  await client.end()
}
main().catch(console.error)
