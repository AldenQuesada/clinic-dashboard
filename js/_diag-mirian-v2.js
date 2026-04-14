// Diag simplificado: retorna tudo num objeto no window._diag
(async function () {
  var sb = window._sbShared
  var out = { db: null, lsHits: [], ssHits: [], mem: null, lsKeys: [] }

  var q = await sb.from('appointments').select('*').eq('scheduled_date', '2026-04-10').ilike('patient_name', '%Mirian%')
  out.db = q.data

  Object.keys(localStorage).forEach(function (k) {
    var v = localStorage.getItem(k) || ''
    if (/mirian/i.test(v) && /2026-04-10/.test(v)) {
      out.lsHits.push({ key: k, size: v.length })
    }
  })

  Object.keys(sessionStorage).forEach(function (k) {
    var v = sessionStorage.getItem(k) || ''
    if (/mirian/i.test(v) && /2026-04-10/.test(v)) {
      out.ssHits.push({ key: k, size: v.length })
    }
  })

  out.lsKeys = Object.keys(localStorage).filter(function (k) { return /appoint|agenda|event|calend/i.test(k) })

  if (window.getAppointments) {
    out.mem = getAppointments().filter(function (a) {
      return a.data === '2026-04-10' && /mirian/i.test(a.pacienteNome || '')
    })
  }

  window._diag = out
  console.log('===== DIAG =====')
  console.log('DB:', JSON.stringify(out.db))
  console.log('LS hits:', JSON.stringify(out.lsHits))
  console.log('SS hits:', JSON.stringify(out.ssHits))
  console.log('LS keys relacionadas:', JSON.stringify(out.lsKeys))
  console.log('MEM:', JSON.stringify(out.mem))
  console.log('================')
})()
