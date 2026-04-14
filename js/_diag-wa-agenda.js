// Diagnostico: todas as fontes que disparam msg WA ao criar agendamento
(async function () {
  var sb = window._sbShared

  console.log('═══ FONTE 1: wa_agenda_automations (triggers d_before/d_zero/min_before/on_status) ═══')
  var r1 = await sb.from('wa_agenda_automations').select('id,name,trigger_type,trigger_config,channel,active').eq('active', true)
  console.log('Total:', (r1.data || []).length)
  console.table(r1.data)

  console.log('═══ FONTE 2: wa_templates_for_phase — fase "agendado" ═══')
  var r2 = await sb.rpc('wa_templates_for_phase', { p_phase: 'agendado' })
  console.log('Total:', (r2.data || []).length)
  console.table(r2.data)

  console.log('═══ FONTE 3: wa_message_templates slug scheduling_confirm_* (msg imediata de boas-vindas) ═══')
  var r3 = await sb.from('wa_message_templates').select('slug,content,is_active').like('slug', 'scheduling_confirm_%')
  console.table(r3.data)

  console.log('═══ FONTE 4: wa_outbox recente (ultimas 10 msgs enfileiradas) ═══')
  var r4 = await sb.from('wa_outbox').select('*').order('created_at', { ascending: false }).limit(10)
  console.table((r4.data || []).map(function (x) {
    return { id: x.id, phone: x.phone, status: x.status, scheduled_at: x.scheduled_at, content: (x.content || '').slice(0, 60) }
  }))
})()
