// Diagnostico: de onde a Mirian 2026-04-10 volta
(async function () {
  var sb = window._sbShared
  var r = await sb.from('appointments').select('*').ilike('patient_name', '%Mirian%').eq('scheduled_date', '2026-04-10')
  console.log('[diag] DB appointments:', r.data)

  var ls = JSON.parse(localStorage.getItem('clinicai_appointments') || '[]')
    .filter(function (a) { return a.data === '2026-04-10' && /mirian/i.test(a.pacienteNome || '') })
  console.log('[diag] localStorage appointments:', ls)

  console.log('[diag] Chaves LS relacionadas:')
  Object.keys(localStorage).filter(function (k) {
    return /appoint|agenda|event|calendar/i.test(k)
  }).forEach(function (k) {
    console.log('  KEY:', k, '| size:', localStorage.getItem(k).length)
  })
})()
