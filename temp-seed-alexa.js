// Cola TODO este conteudo no console do dashboard (F12)
(async function() {
  var r1 = await _sbShared.rpc('wa_agenda_auto_upsert', {
    p_data: {
      name: 'Alexa: Boas-vindas Recepcao',
      trigger_type: 'on_status',
      trigger_value: 'na_clinica',
      channel: 'alexa',
      content_template: '-',
      alexa_message: 'Bem-vinda, {{nome}}! Fique a vontade, em breve voce sera atendida.',
      alexa_target: 'recepcao',
      category: 'during',
      sort_order: 10,
      is_active: true
    }
  })
  console.log('Regra 1:', r1.error ? r1.error.message : 'OK')

  var r2 = await _sbShared.rpc('wa_agenda_auto_upsert', {
    p_data: {
      name: 'Alexa: Aviso Dra Mirian',
      trigger_type: 'on_status',
      trigger_value: 'na_clinica',
      channel: 'alexa',
      content_template: '-',
      alexa_message: 'Dra Mirian, sua proxima paciente {{nome}} esta na recepcao.',
      alexa_target: 'sala',
      category: 'during',
      sort_order: 11,
      is_active: true
    }
  })
  console.log('Regra 2:', r2.error ? r2.error.message : 'OK')
})()
