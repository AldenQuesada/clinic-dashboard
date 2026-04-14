// Purge final Mirian 04-10: DB + localStorage + backup
(async function () {
  var sb = window._sbShared

  // DB
  var q = await sb.from('appointments').select('id').eq('scheduled_date', '2026-04-10').ilike('patient_name', '%Mirian%')
  console.log('[purge] DB matches:', q.data)
  for (var i = 0; i < (q.data || []).length; i++) {
    var id = q.data[i].id
    var d = await sb.from('appointments').delete().eq('id', id)
    console.log('[purge] DB delete', id, d.error ? 'ERRO ' + d.error.message : 'OK')
  }

  // localStorage principal + backup
  ;['clinicai_appointments', 'clinicai_appointments_backup'].forEach(function (key) {
    var arr = JSON.parse(localStorage.getItem(key) || '[]')
    var before = arr.length
    var keep = arr.filter(function (a) {
      return !(a.data === '2026-04-10' && /mirian/i.test(a.pacienteNome || ''))
    })
    localStorage.setItem(key, JSON.stringify(keep))
    console.log('[purge]', key, ':', before, '->', keep.length)
  })

  setTimeout(function () { location.reload() }, 1500)
})()
