// Dashboard: Aniversariantes da semana (birth_date em leads)
;(function(){
  'use strict'

  var CONTAINER_ID = 'dashboard-birthdays'

  function init() {
    var el = document.getElementById(CONTAINER_ID)
    if (!el) return
    loadBirthdays(el)
  }

  async function loadBirthdays(container) {
    try {
      var env = window.ENV || {}
      var url = (env.SUPABASE_URL || 'https://oqboitkpcvuaudouwvkl.supabase.co')
      var key = env.SUPABASE_ANON_KEY || env.SUPABASE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'

      var res = await fetch(url + '/rest/v1/leads?select=id,name,phone,birth_date,phase&deleted_at=is.null&birth_date=neq.&birth_date=not.is.null&order=birth_date', {
        headers: { apikey: key, Authorization: 'Bearer ' + key }
      })
      var leads = await res.json()
      if (!Array.isArray(leads)) { container.innerHTML = '<div style="text-align:center;padding:24px;color:#888;font-size:13px">Sem dados</div>'; return }

      var today = new Date()
      today.setHours(0,0,0,0)
      var endOfWeek = new Date(today)
      endOfWeek.setDate(today.getDate() + 7)

      // Filtra aniversariantes da semana (mesmo mes+dia, qualquer ano)
      var birthdays = []
      leads.forEach(function(lead) {
        if (!lead.birth_date) return
        var parts = lead.birth_date.split('-')
        if (parts.length < 3) return
        var bMonth = parseInt(parts[1], 10)
        var bDay = parseInt(parts[2], 10)
        if (isNaN(bMonth) || isNaN(bDay)) return

        // Cria data de aniversario ESTE ANO
        var bdayThisYear = new Date(today.getFullYear(), bMonth - 1, bDay)
        bdayThisYear.setHours(0,0,0,0)

        // Checa se cai entre hoje e +7 dias
        if (bdayThisYear >= today && bdayThisYear < endOfWeek) {
          var age = today.getFullYear() - parseInt(parts[0], 10)
          var diffDays = Math.round((bdayThisYear - today) / 86400000)
          birthdays.push({
            name: lead.name,
            phone: lead.phone,
            phase: lead.phase,
            date: bDay + '/' + bMonth,
            age: age,
            diffDays: diffDays,
            id: lead.id
          })
        }
      })

      // Ordena por dia mais proximo
      birthdays.sort(function(a, b) { return a.diffDays - b.diffDays })

      if (birthdays.length === 0) {
        container.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-muted,#888);font-size:13px">Nenhum aniversariante esta semana</div>'
        updateLabel(0)
        return
      }

      var html = ''
      birthdays.forEach(function(b) {
        var dayLabel = b.diffDays === 0 ? 'Hoje!' : b.diffDays === 1 ? 'Amanha' : 'em ' + b.diffDays + ' dias'
        var dotClass = b.diffDays === 0 ? 'timeline-dot-emerald' : b.diffDays <= 2 ? 'timeline-dot-warning' : 'timeline-dot-blue'
        var waLink = b.phone ? 'https://wa.me/' + b.phone.replace(/\D/g, '') : ''

        html += '<div class="timeline-item">'
        html += '  <div class="timeline-time">' + b.date + '</div>'
        html += '  <div class="timeline-dot ' + dotClass + '"></div>'
        html += '  <div class="timeline-content">'
        html += '    <div class="timeline-name">' + b.name + '</div>'
        html += '    <div class="timeline-proc">' + b.age + ' anos · ' + dayLabel + '</div>'
        if (waLink) {
          html += '    <a href="' + waLink + '" target="_blank" style="font-size:11px;color:var(--accent,#7c5cfc);text-decoration:none">Enviar parabens</a>'
        }
        html += '  </div>'
        html += '</div>'
      })

      container.innerHTML = html
      updateLabel(birthdays.length)

    } catch(e) {
      container.innerHTML = '<div style="text-align:center;padding:24px;color:#888;font-size:13px">Erro ao carregar</div>'
    }
  }

  function updateLabel(count) {
    var label = document.getElementById('birthday-period-label')
    if (label) label.textContent = count > 0 ? count + ' esta semana' : 'Esta semana'
  }

  // Inicializa quando dashboard carrega
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }

  // Re-renderiza quando navega pro dashboard
  window.addEventListener('clinicai:page-changed', function(e) {
    if (e.detail && e.detail.page === 'dashboard-overview') init()
  })

  // Fallback: observa se o container aparece
  var _observer = new MutationObserver(function() {
    var el = document.getElementById(CONTAINER_ID)
    if (el && el.textContent.includes('Carregando')) {
      init()
      _observer.disconnect()
    }
  })
  _observer.observe(document.body, { childList: true, subtree: true })
})()
