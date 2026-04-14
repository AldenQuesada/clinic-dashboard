;(function () {
  'use strict'
  if (window.QAPopups) return

  function _showAbandonedPopup(initialData, questions) {
    var _activeQuiz = QA.quiz()
    if (!_activeQuiz) return
    var totalQuestions = questions.length || 1
    var quizId = _activeQuiz.id
    var quizTitle = _activeQuiz.title || _activeQuiz.slug || 'quiz'
    var currentPeriod = '30d'
    var currentFilter = 'all'
    var currentData = initialData || []
    var customFrom = ''
    var customTo = ''

    var outr = (_activeQuiz.schema && _activeQuiz.schema.outro) || {}
    var waPhone = (outr.wa_phone || '').replace(/\D/g, '')
    var recoveryTemplate = outr.wa_recovery_msg || 'Oi {nome}, tudo bem? Vi que você começou nosso quiz sobre {quiz} mas não conseguiu finalizar. Aconteceu alguma coisa? Se quiser, posso te ajudar a completar e te enviar o resultado.'

    function _buildRecoveryLink(lead) {
      if (!waPhone || !lead.contact_phone) return ''
      var phone = lead.contact_phone.replace(/\D/g, '')
      if (phone.length < 10) return ''
      phone = phone.startsWith('55') ? phone : '55' + phone
      var msg = recoveryTemplate
        .replace(/\{nome\}/gi, lead.contact_name || 'tudo bem')
        .replace(/\{quiz\}/gi, quizTitle)
        .replace(/\{pergunta\}/gi, lead.last_step_label || '')
      var base = 'https://wa.me/' + phone + '?text=' + encodeURIComponent(msg)
      return '<a href="' + base + '" target="whatsapp_session" rel="noopener" style="display:inline-flex;align-items:center;gap:4px;color:#25D366;font-weight:700;font-size:11px;text-decoration:none" title="Enviar mensagem de recuperação">' +
        '<svg width="14" height="14" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>' +
        'Recuperar</a>'
    }

    function _buildTable(data, filter) {
      var filtered = data
      if (filter === 'recoverable') filtered = data.filter(function(a) { return a.contact_name || a.contact_phone })
      if (filter === 'anonymous') filtered = data.filter(function(a) { return !a.contact_name && !a.contact_phone })

      if (filtered.length === 0) return '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px">Nenhum lead neste filtro</div>'

      return '<table class="qa-leads-table"><thead><tr>' +
        '<th style="width:28px"><input type="checkbox" id="qa-ab-check-all" style="cursor:pointer"></th>' +
        '<th>Status</th><th>Nome</th><th>WhatsApp</th><th>Abandonou em</th><th>Progresso</th><th>Data</th><th style="width:44px"></th>' +
        '</tr></thead><tbody>' +
        filtered.map(function(a) {
          var hasContact = a.contact_name || a.contact_phone
          var tagClass = hasContact ? 'recoverable' : 'anonymous'
          var tagLabel = hasContact ? 'Recuperável' : 'Anônimo'
          var stepsNum = Math.min(a.steps_completed || 0, totalQuestions)
          var pct = Math.round((stepsNum / totalQuestions) * 100)
          if (pct > 100) pct = 100
          var progressColor = pct >= 60 ? '#22c55e' : (pct >= 30 ? '#eab308' : '#ef4444')
          var dateStr = a.abandoned_at
            ? new Date(a.abandoned_at).toLocaleDateString('pt-BR') + '<br><span style="font-size:10px;color:#6b7280">' + new Date(a.abandoned_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</span>'
            : '-'
          var waLink = _buildRecoveryLink(a)
          var phoneCell = a.contact_phone
            ? '<div style="display:flex;align-items:center;gap:6px;white-space:nowrap"><span class="qa-leads-phone">' + QA.esc(a.contact_phone) + '</span>' + (waLink || '') + '</div>'
            : '<span style="color:#9ca3af">-</span>'
          var sid = QA.esc(a.session_id || '')
          return '<tr data-sid="' + sid + '">' +
            '<td><input type="checkbox" class="qa-ab-row-check" data-sid="' + sid + '" style="cursor:pointer"></td>' +
            '<td><span class="qa-abandoned-tag ' + tagClass + '">' + tagLabel + '</span></td>' +
            '<td class="qa-leads-name">' + QA.esc(a.contact_name || '-') + '</td>' +
            '<td>' + phoneCell + '</td>' +
            '<td style="font-size:12px;color:#374151">' + QA.esc(a.last_step_label || 'Step ' + a.last_step) + '</td>' +
            '<td style="white-space:nowrap"><span class="qa-progress-bar"><span class="qa-progress-fill" style="width:' + Math.max(pct, 8) + '%;background:' + progressColor + '"></span></span><span style="font-size:11px;font-weight:700;color:' + progressColor + '">' + stepsNum + '/' + totalQuestions + '</span></td>' +
            '<td class="qa-leads-date">' + dateStr + '</td>' +
            '<td><button class="qa-ab-del-row" data-sid="' + sid + '" title="Excluir este lead" style="background:transparent;border:0;cursor:pointer;color:#ef4444;padding:4px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2"/></svg></button></td>' +
          '</tr>'
        }).join('') +
        '</tbody></table>'
    }

    function _updateCounts(ov, data) {
      var rec = data.filter(function(a) { return a.contact_name || a.contact_phone }).length
      var anon = data.length - rec
      var titleEl = ov.querySelector('#qa-ab-title')
      var subEl = ov.querySelector('#qa-ab-sub')
      if (titleEl) titleEl.textContent = 'Leads Abandonados (' + data.length + ')'
      if (subEl) subEl.textContent = rec + ' recuperáveis, ' + anon + ' anônimos'
      var allBtn = ov.querySelector('[data-ab-filter="all"]')
      var recBtn = ov.querySelector('[data-ab-filter="recoverable"]')
      var anonBtn = ov.querySelector('[data-ab-filter="anonymous"]')
      if (allBtn) allBtn.textContent = 'Todos (' + data.length + ')'
      if (recBtn) recBtn.textContent = 'Recuperáveis (' + rec + ')'
      if (anonBtn) anonBtn.textContent = 'Anônimos (' + anon + ')'
    }

    function _renderBody(ov) {
      var body = ov.querySelector('#qa-ab-body')
      if (body) body.innerHTML = '<div class="qa-leads-wrap" style="max-height:none">' + _buildTable(currentData, currentFilter) + '</div>'
    }

    async function _loadPeriod(ov, period) {
      currentPeriod = period
      var dates = window.QAAnalytics ? QAAnalytics.periodDates(period) : { from: new Date('2020-01-01').toISOString(), to: new Date().toISOString() }
      if (period === 'custom' && customFrom && customTo) {
        dates = { from: new Date(customFrom + 'T00:00:00').toISOString(), to: new Date(customTo + 'T23:59:59.999').toISOString() }
      }
      var body = ov.querySelector('#qa-ab-body')
      if (body) body.innerHTML = '<div style="padding:20px;text-align:center;color:#9ca3af;font-size:12px">Carregando...</div>'
      var res = await QA.repo().getAbandonedLeads(quizId, QA.clinicId(), dates.from, dates.to)
      currentData = res.ok ? res.data : []
      _updateCounts(ov, currentData)
      _renderBody(ov)
    }

    // Build overlay
    var periodLabels = { today: 'Hoje', '7d': '7 dias', '30d': '30 dias', '90d': '90 dias', custom: 'Selecionar Período' }
    var recCount = currentData.filter(function(a) { return a.contact_name || a.contact_phone }).length
    var anonCount = currentData.length - recCount

    if (!customFrom) { var d30 = new Date(); d30.setDate(d30.getDate() - 30); customFrom = d30.toISOString().substring(0, 10) }
    if (!customTo) customTo = new Date().toISOString().substring(0, 10)

    var overlay = document.createElement('div')
    overlay.className = 'qa-answers-overlay'
    overlay.innerHTML =
      '<div class="qa-answers-modal" style="max-width:900px;width:95%;max-height:85vh">' +
        '<div class="qa-answers-header">' +
          '<div>' +
            '<div class="qa-answers-header-title" id="qa-ab-title">Leads Abandonados (' + currentData.length + ')</div>' +
            '<div class="qa-answers-header-sub" id="qa-ab-sub">' + recCount + ' recuperáveis, ' + anonCount + ' anônimos</div>' +
          '</div>' +
          '<button class="qa-answers-close" id="qa-ab-close">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div style="padding:10px 20px 0;display:flex;gap:4px;flex-wrap:wrap;align-items:center" id="qa-ab-periods">' +
          ['today','7d','30d','90d','custom'].map(function(p) {
            return '<button class="qa-period-btn' + (p === currentPeriod ? ' active' : '') + '" data-ab-period="' + p + '">' + periodLabels[p] + '</button>'
          }).join('') +
        '</div>' +
        '<div style="padding:8px 20px 0;gap:4px;align-items:center;display:' + (currentPeriod === 'custom' ? 'flex' : 'none') + '" id="qa-ab-custom-row">' +
          '<input type="date" class="qa-input qa-date-input" id="qa-ab-from" value="' + customFrom + '">' +
          '<span style="font-size:11px;color:#9ca3af;font-weight:600;align-self:center">a</span>' +
          '<input type="date" class="qa-input qa-date-input" id="qa-ab-to" value="' + customTo + '">' +
          '<button class="qa-refresh-btn" id="qa-ab-apply">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> Aplicar' +
          '</button>' +
        '</div>' +
        '<div style="padding:8px 20px 0;display:flex;gap:4px;align-items:center;flex-wrap:wrap">' +
          '<button class="qa-period-btn active" data-ab-filter="all">Todos (' + currentData.length + ')</button>' +
          '<button class="qa-period-btn" data-ab-filter="recoverable">Recuperáveis (' + recCount + ')</button>' +
          '<button class="qa-period-btn" data-ab-filter="anonymous">Anônimos (' + anonCount + ')</button>' +
          '<div style="flex:1"></div>' +
          '<button class="qa-period-btn" id="qa-ab-del-selected" style="color:#ef4444;border-color:#fecaca" disabled>Excluir selecionados (0)</button>' +
          '<button class="qa-period-btn" id="qa-ab-del-all" style="color:#ef4444;border-color:#fecaca">Excluir todos filtrados</button>' +
        '</div>' +
        '<div class="qa-answers-body" id="qa-ab-body" style="padding:10px 20px 20px">' +
          '<div class="qa-leads-wrap" style="max-height:none">' + _buildTable(currentData, 'all') + '</div>' +
        '</div>' +
      '</div>'

    document.body.appendChild(overlay)

    overlay.querySelector('#qa-ab-close').onclick = function() { overlay.remove() }
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove() }

    overlay.querySelectorAll('[data-ab-period]').forEach(function(btn) {
      btn.onclick = function() {
        overlay.querySelectorAll('[data-ab-period]').forEach(function(b) { b.classList.remove('active') })
        btn.classList.add('active')
        var p = btn.getAttribute('data-ab-period')
        var customRow = overlay.querySelector('#qa-ab-custom-row')
        if (customRow) customRow.style.display = (p === 'custom') ? 'flex' : 'none'
        if (p !== 'custom') _loadPeriod(overlay, p)
      }
    })

    var applyBtn = overlay.querySelector('#qa-ab-apply')
    if (applyBtn) applyBtn.onclick = function() {
      var fEl = overlay.querySelector('#qa-ab-from')
      var tEl = overlay.querySelector('#qa-ab-to')
      if (fEl) customFrom = fEl.value
      if (tEl) customTo = tEl.value
      _loadPeriod(overlay, 'custom')
    }

    overlay.querySelectorAll('[data-ab-filter]').forEach(function(btn) {
      btn.onclick = function() {
        overlay.querySelectorAll('[data-ab-filter]').forEach(function(b) { b.classList.remove('active') })
        btn.classList.add('active')
        currentFilter = btn.getAttribute('data-ab-filter')
        _renderBody(overlay)
        _refreshSelectionCount(overlay)
      }
    })

    function _filteredSessionIds() {
      var data = currentData
      if (currentFilter === 'recoverable') data = data.filter(function(a) { return a.contact_name || a.contact_phone })
      if (currentFilter === 'anonymous')   data = data.filter(function(a) { return !a.contact_name && !a.contact_phone })
      return data.map(function(a) { return a.session_id }).filter(Boolean)
    }

    function _selectedSessionIds() {
      var ids = []
      overlay.querySelectorAll('.qa-ab-row-check:checked').forEach(function(cb) {
        var sid = cb.getAttribute('data-sid')
        if (sid) ids.push(sid)
      })
      return ids
    }

    function _refreshSelectionCount(ov) {
      var n = (ov || overlay).querySelectorAll('.qa-ab-row-check:checked').length
      var btn = (ov || overlay).querySelector('#qa-ab-del-selected')
      if (btn) {
        btn.textContent = 'Excluir selecionados (' + n + ')'
        btn.disabled = n === 0
      }
      var all = (ov || overlay).querySelector('#qa-ab-check-all')
      if (all) {
        var total = (ov || overlay).querySelectorAll('.qa-ab-row-check').length
        all.checked = total > 0 && n === total
        all.indeterminate = n > 0 && n < total
      }
    }

    async function _doDelete(sessionIds) {
      if (!sessionIds || !sessionIds.length) return
      var msg = sessionIds.length === 1
        ? 'Excluir este lead abandonado? Esta ação é irreversível.'
        : 'Excluir ' + sessionIds.length + ' leads abandonados? Esta ação é irreversível.'
      if (!window.confirm(msg)) return
      var res = await QA.repo().deleteAbandonedSessions(quizId, QA.clinicId(), sessionIds)
      if (!res.ok) {
        alert('Erro ao excluir: ' + (res.error || 'desconhecido'))
        return
      }
      currentData = currentData.filter(function(a) { return sessionIds.indexOf(a.session_id) === -1 })
      _updateCounts(overlay, currentData)
      _renderBody(overlay)
      _refreshSelectionCount(overlay)
    }

    overlay.addEventListener('change', function(e) {
      if (e.target.classList && e.target.classList.contains('qa-ab-row-check')) {
        _refreshSelectionCount(overlay)
      } else if (e.target.id === 'qa-ab-check-all') {
        var checked = e.target.checked
        overlay.querySelectorAll('.qa-ab-row-check').forEach(function(cb) { cb.checked = checked })
        _refreshSelectionCount(overlay)
      }
    })

    overlay.addEventListener('click', function(e) {
      var delBtn = e.target.closest && e.target.closest('.qa-ab-del-row')
      if (delBtn) {
        e.preventDefault()
        var sid = delBtn.getAttribute('data-sid')
        if (sid) _doDelete([sid])
      }
    })

    var delSelBtn = overlay.querySelector('#qa-ab-del-selected')
    if (delSelBtn) delSelBtn.onclick = function() { _doDelete(_selectedSessionIds()) }

    var delAllBtn = overlay.querySelector('#qa-ab-del-all')
    if (delAllBtn) delAllBtn.onclick = function() { _doDelete(_filteredSessionIds()) }
  }

  function _showThresholdPopup(metricKey) {
    var _activeQuiz = QA.quiz()
    if (!_activeQuiz) return
    var _popupQuizId = _activeQuiz.id
    var th = _activeQuiz.schema.analytics_thresholds || {}

    var configs = {
      engagement: {
        title: 'Engajamento',
        sub: 'Visualizaram \u2192 Iniciaram',
        greenKey: 'engagement_green',
        yellowKey: 'engagement_yellow',
        greenVal: typeof th.engagement_green === 'number' ? th.engagement_green : 60,
        yellowVal: typeof th.engagement_yellow === 'number' ? th.engagement_yellow : 30,
      },
      conversion: {
        title: 'Conversão',
        sub: 'Iniciaram \u2192 Finalizaram',
        greenKey: 'conversion_green',
        yellowKey: 'conversion_yellow',
        greenVal: typeof th.conversion_green === 'number' ? th.conversion_green : 60,
        yellowVal: typeof th.conversion_yellow === 'number' ? th.conversion_yellow : 30,
      },
      whatsapp: {
        title: 'WhatsApp',
        sub: 'Finalizaram \u2192 Clicaram WhatsApp',
        greenKey: 'whatsapp_green',
        yellowKey: 'whatsapp_yellow',
        greenVal: typeof th.whatsapp_green === 'number' ? th.whatsapp_green : 50,
        yellowVal: typeof th.whatsapp_yellow === 'number' ? th.whatsapp_yellow : 20,
      },
    }

    var cfg = configs[metricKey]
    if (!cfg) return

    function buildRow(colorHex, label, id, val) {
      return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">' +
        '<span style="width:10px;height:10px;border-radius:50%;background:' + colorHex + ';flex-shrink:0"></span>' +
        '<span style="font-size:12px;color:#374151;font-weight:600;min-width:70px">' + label + '</span>' +
        '<input class="qa-input" id="' + id + '" type="number" min="0" max="100" value="' + val + '" style="width:70px;padding:5px 8px;font-size:13px;text-align:center">' +
        '<span style="font-size:12px;color:#9ca3af">%</span>' +
      '</div>'
    }

    var overlay = document.createElement('div')
    overlay.className = 'qa-answers-overlay'
    overlay.innerHTML =
      '<div class="qa-answers-modal" style="max-width:320px">' +
        '<div class="qa-answers-header">' +
          '<div>' +
            '<div class="qa-answers-header-title">' + QA.esc(cfg.title) + '</div>' +
            '<div class="qa-answers-header-sub">' + QA.esc(cfg.sub) + '</div>' +
          '</div>' +
          '<button class="qa-answers-close" id="qa-th-close">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="qa-answers-body">' +
          buildRow('#22c55e', 'Verde \u2265', 'th-green', cfg.greenVal) +
          buildRow('#eab308', 'Amarelo \u2265', 'th-yellow', cfg.yellowVal) +
          '<div style="font-size:10px;color:#9ca3af;margin-top:2px;margin-bottom:14px">Vermelho = abaixo do amarelo</div>' +
          '<button class="qa-save-btn" id="qa-th-save" style="width:100%;justify-content:center">Salvar</button>' +
        '</div>' +
      '</div>'

    document.body.appendChild(overlay)

    overlay.querySelector('#qa-th-close').onclick = function() { overlay.remove() }
    overlay.onclick = function(e) { if (e.target === overlay) overlay.remove() }

    overlay.querySelector('#qa-th-save').onclick = function() {
      var currentQuiz = QA.quiz()
      if (!currentQuiz || currentQuiz.id !== _popupQuizId) {
        overlay.remove()
        return
      }
      var gEl = overlay.querySelector('#th-green')
      var yEl = overlay.querySelector('#th-yellow')
      var gVal = gEl ? parseInt(gEl.value, 10) : 60
      var yVal = yEl ? parseInt(yEl.value, 10) : 30
      if (isNaN(gVal) || gVal < 0) gVal = 0
      if (gVal > 100) gVal = 100
      if (isNaN(yVal) || yVal < 0) yVal = 0
      if (yVal > 100) yVal = 100

      if (!currentQuiz.schema.analytics_thresholds) currentQuiz.schema.analytics_thresholds = {}
      currentQuiz.schema.analytics_thresholds[cfg.greenKey] = gVal
      currentQuiz.schema.analytics_thresholds[cfg.yellowKey] = yVal
      QA.markDirty()
      // Re-render analytics dashboard
      if (window.QAAnalytics) QAAnalytics.bindEvents()
      overlay.remove()
    }
  }

  function _showAnswersPopup(lead, questions) {
    var items = window.QuizId
      ? QuizId.mapForDisplay(lead.answers || {}, questions)
      : (window.QAAnalytics ? QAAnalytics.legacyMapAnswers(lead.answers || {}, questions) : [])

    // Proteção: detectar respostas de versão diferente
    var removedItems = items.filter(function(item) { return item.index === -1 })
    var versionWarning = ''
    if (removedItems.length > 0) {
      versionWarning = '<div style="background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 12px;margin-bottom:12px;display:flex;align-items:flex-start;gap:8px">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2" style="flex-shrink:0;margin-top:1px"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>' +
        '<div style="font-size:11px;color:#92400e;line-height:1.4"><strong>Quiz alterado:</strong> Este lead respondeu uma versao anterior do quiz. ' + removedItems.length + ' pergunta(s) foram removidas ou alteradas desde entao. O score original (' + (lead.score || 0) + ' pts) reflete a versao que o lead respondeu.</div>' +
      '</div>'
    }

    var itemsHtml = items.map(function(item, i) {
      var val = item.answer
      var ansHtml = ''

      if (Array.isArray(val)) {
        ansHtml = val.map(function(v) {
          var scoreInfo = ''
          var opt = item.options.find(function(o) { return o.label === v })
          if (opt && typeof opt.score === 'number') scoreInfo = '<span class="qa-answer-score">+' + opt.score + ' pts</span>'
          return '<div style="display:flex;align-items:center;gap:4px;margin-bottom:2px">' +
            '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg> ' +
            QA.esc(v) + scoreInfo + '</div>'
        }).join('')
      } else if (item.questionType === 'scale') {
        var scaleVal = parseInt(val, 10) || 0
        var dots = ''
        for (var s = 1; s <= 5; s++) {
          dots += '<span style="display:inline-block;width:18px;height:18px;border-radius:50%;margin-right:3px;text-align:center;line-height:18px;font-size:10px;font-weight:700;' +
            (s <= scaleVal ? 'background:#6366F1;color:#fff' : 'background:#f3f4f6;color:#9ca3af') + '">' + s + '</span>'
        }
        ansHtml = dots
      } else {
        var scoreInfo = ''
        if (item.score !== null) scoreInfo = '<span class="qa-answer-score">+' + item.score + ' pts</span>'
        ansHtml = QA.esc(String(val)) + scoreInfo
      }

      var num = item.index >= 0 ? (item.index + 1) : '?'
      return '<div class="qa-answer-item">' +
        '<div class="qa-answer-q">Pergunta ' + num + ': ' + QA.esc(item.questionTitle) + '</div>' +
        '<div class="qa-answer-a">' + ansHtml + '</div>' +
      '</div>'
    }).join('')

    var tempLabels = { hot: 'Quente', warm: 'Morno', cold: 'Frio' }
    var tempColors = { hot: '#ef4444', warm: '#f59e0b', cold: '#3b82f6' }
    var temp = lead.temperature || 'cold'
    var summaryHtml = '<div style="display:flex;gap:10px;margin-bottom:14px">' +
      '<div style="flex:1;padding:10px 12px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6;text-align:center">' +
        '<div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin-bottom:2px">Score</div>' +
        '<div style="font-size:20px;font-weight:800;color:#6366F1">' + (lead.score || 0) + '</div>' +
      '</div>' +
      '<div style="flex:1;padding:10px 12px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6;text-align:center">' +
        '<div style="font-size:10px;font-weight:700;color:#9ca3af;text-transform:uppercase;margin-bottom:2px">Temperatura</div>' +
        '<div style="font-size:14px;font-weight:800;color:' + (tempColors[temp] || '#6b7280') + '">' + (tempLabels[temp] || temp) + '</div>' +
      '</div>' +
    '</div>'

    var dateStr = lead.submitted_at ? new Date(lead.submitted_at).toLocaleDateString('pt-BR') + ' às ' + new Date(lead.submitted_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''

    var overlay = document.createElement('div')
    overlay.className = 'qa-answers-overlay'
    overlay.innerHTML =
      '<div class="qa-answers-modal">' +
        '<div class="qa-answers-header">' +
          '<div>' +
            '<div class="qa-answers-header-title">' + QA.esc(lead.contact_name || 'Lead') + '</div>' +
            '<div class="qa-answers-header-sub">' + QA.esc(lead.contact_phone || '') + (dateStr ? ' \u00B7 ' + dateStr : '') + '</div>' +
          '</div>' +
          '<button class="qa-answers-close" id="qa-answers-close">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="qa-answers-body">' +
          versionWarning +
          summaryHtml +
          itemsHtml +
        '</div>' +
      '</div>'

    document.body.appendChild(overlay)

    var closeBtn = overlay.querySelector('#qa-answers-close')
    if (closeBtn) closeBtn.onclick = function() { overlay.remove() }
    overlay.onclick = function(e) {
      if (e.target === overlay) overlay.remove()
    }
  }

  window.QAPopups = {
    showAbandoned: _showAbandonedPopup,
    showThreshold: _showThresholdPopup,
    showAnswers: _showAnswersPopup,
  }

})()
