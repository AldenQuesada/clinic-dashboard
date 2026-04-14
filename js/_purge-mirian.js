// Targeted purge: Mirian de Paula 2026-04-10 11:00
(async function () {
  var sb = window._sbShared
  if (!sb) { console.error('[purge] _sbShared ausente'); return }

  // 1. DB: buscar todos os matches
  var q = await sb.from('appointments').select('id,patient_name,scheduled_date,start_time')
    .eq('scheduled_date', '2026-04-10').ilike('patient_name', '%Mirian%')
  console.log('[purge] DB matches:', q.data)

  if (q.data && q.data.length) {
    for (var i = 0; i < q.data.length; i++) {
      var id = q.data[i].id
      var d = await sb.from('appointments').delete().eq('id', id)
      console.log('[purge] DB delete', id, d.error ? 'ERRO: ' + d.error.message : 'OK')
      await sb.from('wa_outbox').delete().eq('appt_ref', id)
    }
  }

  // 2. localStorage: remove qualquer Mirian em 04-10
  var arr = JSON.parse(localStorage.getItem('clinicai_appointments') || '[]')
  var before = arr.length
  var keep = arr.filter(function (a) {
    return !(a.data === '2026-04-10' && /mirian/i.test(a.pacienteNome || ''))
  })
  localStorage.setItem('clinicai_appointments', JSON.stringify(keep))
  console.log('[purge] localStorage:', before, '->', keep.length)

  setTimeout(function () { location.reload() }, 1500)
})()
