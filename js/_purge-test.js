// One-shot: purge test appointments (localStorage + Supabase)
// Load via: var s=document.createElement('script');s.src='./js/_purge-test.js?t='+Date.now();document.head.appendChild(s)
(async function () {
  var sb = window._sbShared
  if (!sb) { console.error('[purge] _sbShared nao carregado'); return }

  var NAMES = /mislene|elisangela|gislaine|camila/i
  var LAST_WK = function (a) { return a.data >= '2026-04-06' && a.data <= '2026-04-12' }
  var THIS_WK = function (a) { return a.data >= '2026-04-13' && a.data <= '2026-04-19' && NAMES.test(a.pacienteNome || '') }

  var arr = JSON.parse(localStorage.getItem('clinicai_appointments') || '[]')
  var toKill = arr.filter(function (a) { return LAST_WK(a) || THIS_WK(a) })
  var ids = toKill.map(function (a) { return a.id })

  console.log('[purge] Deletando', ids.length, 'agendamentos:')
  console.table(toKill.map(function (a) { return { id: a.id, nome: a.pacienteNome, data: a.data, hora: a.horaInicio } }))

  if (!ids.length) { console.log('[purge] Nada a deletar.'); return }

  var keep = arr.filter(function (a) { return ids.indexOf(a.id) < 0 })
  localStorage.setItem('clinicai_appointments', JSON.stringify(keep))
  console.log('[purge] localStorage limpo. Restam', keep.length, 'agendamentos.')

  var okDb = 0, errDb = 0
  for (var i = 0; i < ids.length; i++) {
    var id = ids[i]
    var r1 = await sb.from('appointments').delete().eq('id', id)
    if (r1.error) { console.warn('[purge] appt erro', id, r1.error.message); errDb++ } else { okDb++ }
    await sb.from('wa_outbox').delete().eq('appt_ref', id).in('status', ['pending', 'scheduled'])
  }
  console.log('[purge] Supabase: ', okDb, 'deletados,', errDb, 'erros')
  console.log('[purge] Recarregando em 2s...')
  setTimeout(function () { location.reload() }, 2000)
})()
