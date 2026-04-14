// Purge: semana 2026-03-30 a 2026-04-05 (tudo) + Mirian 2026-04-10
(async function () {
  var sb = window._sbShared
  if (!sb) { console.error('[purge] _sbShared ausente'); return }

  // 1. DB: tudo entre 03-30 e 04-05
  var q1 = await sb.from('appointments').select('id,patient_name,scheduled_date,start_time')
    .gte('scheduled_date', '2026-03-30').lte('scheduled_date', '2026-04-05')
  console.log('[purge] DB semana 03-30..04-05:', q1.data)

  // 2. DB: Mirian 04-10
  var q2 = await sb.from('appointments').select('id,patient_name,scheduled_date,start_time')
    .eq('scheduled_date', '2026-04-10').ilike('patient_name', '%Mirian%')
  console.log('[purge] DB Mirian 04-10:', q2.data)

  var allIds = [].concat(q1.data || [], q2.data || []).map(function (a) { return a.id })
  for (var i = 0; i < allIds.length; i++) {
    var id = allIds[i]
    var d = await sb.from('appointments').delete().eq('id', id)
    console.log('[purge] DB delete', id, d.error ? 'ERRO: ' + d.error.message : 'OK')
    await sb.from('wa_outbox').delete().eq('appt_ref', id)
  }

  // 3. localStorage
  var arr = JSON.parse(localStorage.getItem('clinicai_appointments') || '[]')
  var before = arr.length
  var keep = arr.filter(function (a) {
    var inWk = a.data >= '2026-03-30' && a.data <= '2026-04-05'
    var isMirian410 = a.data === '2026-04-10' && /mirian/i.test(a.pacienteNome || '')
    return !(inWk || isMirian410)
  })
  localStorage.setItem('clinicai_appointments', JSON.stringify(keep))
  console.log('[purge] localStorage:', before, '->', keep.length)

  setTimeout(function () { location.reload() }, 1500)
})()
