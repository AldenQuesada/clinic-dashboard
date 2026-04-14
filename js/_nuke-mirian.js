// Nuke Mirian by specific ID appt_1775823619170_cap7u
(async function () {
  var sb = window._sbShared
  var TARGET_ID = 'appt_1775823619170_cap7u'

  // 1. DB delete com check
  var d = await sb.from('appointments').delete().eq('id', TARGET_ID).select()
  console.log('[nuke] DB delete response:', d)

  // 2. Varre TODAS as chaves do localStorage e remove esse ID
  var removed = []
  Object.keys(localStorage).forEach(function (k) {
    var v = localStorage.getItem(k)
    if (!v || v.indexOf(TARGET_ID) < 0) return
    try {
      var parsed = JSON.parse(v)
      if (Array.isArray(parsed)) {
        var filtered = parsed.filter(function (x) { return x && x.id !== TARGET_ID })
        if (filtered.length !== parsed.length) {
          localStorage.setItem(k, JSON.stringify(filtered))
          removed.push({ key: k, before: parsed.length, after: filtered.length })
        }
      }
    } catch (e) { /* nao e JSON array */ }
  })
  console.log('[nuke] LS removidos:', removed)

  // 3. Checa sessionStorage tambem
  Object.keys(sessionStorage).forEach(function (k) {
    var v = sessionStorage.getItem(k)
    if (v && v.indexOf(TARGET_ID) >= 0) {
      console.log('[nuke] SS HIT key:', k)
    }
  })

  // 4. Re-verifica DB apos delete
  var check = await sb.from('appointments').select('id').eq('id', TARGET_ID)
  console.log('[nuke] DB recheck (deve ser []):', check.data)

  // 5. Limpa timestamp de sync pra forcar re-fetch
  localStorage.removeItem('_ts_clinicai_appointments')

  console.log('[nuke] Feito. Reload em 2s.')
  setTimeout(function () { location.reload() }, 2000)
})()
