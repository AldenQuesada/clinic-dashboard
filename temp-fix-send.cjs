const { Client } = require('pg')
const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})
;(async () => {
  await c.connect()

  // 1. Get full function and fix uuid=text
  const fn = await c.query(`SELECT pg_get_functiondef(p.oid) as def FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='validate_anamnesis_token'`)
  var def = fn.rows[0].def
  
  // Fix the 3 lines with uuid=text: add ::text casts for patient_id comparisons with leads.id
  // p.id = l.id → p.id::text = l.id (patients.id=uuid, leads.id=text)
  // l.id = v_req.patient_id → l.id = v_req.patient_id::text
  // p.id = v_req.patient_id → stays (both uuid now)
  
  var fixedDef = def
    .replace(/p\.id = l\.id/g, 'p.id::text = l.id')
    .replace(/l\.id = p\.id/g, 'l.id = p.id::text')
    .replace(/l\.id = v_req\.patient_id/g, 'l.id = v_req.patient_id::text')
  
  // Drop and recreate
  await c.query(`DROP FUNCTION IF EXISTS public.validate_anamnesis_token(text, text)`)
  await c.query(fixedDef)
  console.log('validate_anamnesis_token fixed!')
  
  // Also fix the RETURNS patient_id text → should stay text for frontend compat
  // The function returns patient_id as text which is fine
  
  // 2. Test validation
  const v = await c.query(`SELECT validate_anamnesis_token('58de21fb6af4a58d', '84066e378064001d20cd9d1a9f077f327e48b89f72c87531f62ccbf258f90525')`)
  console.log('Validacao OK:', v.rows[0]?.patient_name || 'sem nome')

  // 3. Reenviar mensagem
  const tpl = await c.query(`SELECT content FROM wa_message_templates WHERE slug = 'scheduling_confirm_novo' AND is_active = true LIMIT 1`)
  var content = tpl.rows[0].content
  var linkAnamnese = 'https://clinicai-dashboard.px1hdq.easypanel.host/form-render.html?slug=58de21fb6af4a58d#token=84066e378064001d20cd9d1a9f077f327e48b89f72c87531f62ccbf258f90525'
  var vars = {
    nome: 'Alden', clinica: 'Clinica Mirian de Paula',
    data: 'segunda-feira, 14 de abril de 2026', hora: '14:30',
    profissional: 'Dra. Mirian de Paula', procedimento: 'Consulta de Avaliacao',
    linha_procedimento: '\n💆 *Procedimento:* Consulta de Avaliacao',
    link_anamnese: linkAnamnese,
    endereco: 'Av. Carneiro Leao, 296 - Sala 806, Centro Comercial Monumental - Maringa/PR',
    endereco_clinica: 'Av. Carneiro Leao, 296 - Sala 806, Centro Comercial Monumental - Maringa/PR',
    link_maps: 'https://maps.app.goo.gl/VCxLkAL6m15JLnaV7',
    menu_clinica: 'https://clinicai-dashboard.px1hdq.easypanel.host/menu-clinica.html',
    link: 'https://miriandpaula.br', valor: 'R$ 350,00',
  }
  content = content.replace(/\{(\w+)\}/g, function (_, k) { return vars[k] != null ? String(vars[k]) : '' })
  const r = await c.query(`
    INSERT INTO wa_outbox (clinic_id, lead_id, phone, content, status, scheduled_at, priority)
    VALUES ('00000000-0000-0000-0000-000000000001', '', '5544998787673', $1, 'pending', now(), 1)
    RETURNING id
  `, [content])
  console.log('Enviado! ID:', r.rows[0].id)
  
  await c.query(`NOTIFY pgrst, 'reload schema'`)
  await c.end()
})()
