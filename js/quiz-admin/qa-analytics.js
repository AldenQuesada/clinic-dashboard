;(function () {
  'use strict'
  if (window.QAAnalytics) return

  // ── Analytics state ──────────────────────────────────────────────────────────
  var _analyticsData      = null
  var _analyticsLeads     = null
  var _analyticsAbandoned = null
  var _analyticsPeriod    = '30d'
  var _analyticsCustomFrom = ''
  var _analyticsCustomTo   = ''
  var _analyticsLoading   = false

  function _periodDates(period) {
    var now = new Date()
    var toDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)

    if (period === 'custom' && _analyticsCustomFrom && _analyticsCustomTo) {
      var cf = new Date(_analyticsCustomFrom + 'T00:00:00')
      var ct = new Date(_analyticsCustomTo + 'T23:59:59.999')
      return { from: cf.toISOString(), to: ct.toISOString() }
    }

    var fromDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0)
    if (period === 'today') {
      // fromDate already start of today
    } else if (period === '7d') {
      fromDate.setDate(fromDate.getDate() - 7)
    } else if (period === '30d') {
      fromDate.setDate(fromDate.getDate() - 30)
    } else if (period === '90d') {
      fromDate.setDate(fromDate.getDate() - 90)
    } else {
      fromDate = new Date('2020-01-01T00:00:00')
    }
    return { from: fromDate.toISOString(), to: toDate.toISOString() }
  }

  function _buildAnalyticsTab() {
    return '<div id="qa-analytics-root">' +
      '<div class="qa-analytics-loading">Carregando estatísticas...</div>' +
    '</div>'
  }

  function _bindAnalyticsEvents() {
    _loadAnalyticsData()
  }

  function _buildFallbackAnalytics(leads) {
    if (!leads || leads.length === 0) return {}

    var completed = leads.length
    var tempDist = {}
    var dayMap = {}

    leads.forEach(function(l) {
      var t = l.temperature || 'cold'
      tempDist[t] = (tempDist[t] || 0) + 1
      if (l.submitted_at) {
        var day = l.submitted_at.substring(0, 10)
        dayMap[day] = (dayMap[day] || 0) + 1
      }
    })

    var leadsPerDay = Object.keys(dayMap).sort().map(function(day) {
      return { day: day, total: dayMap[day] }
    })

    return {
      page_views: completed,
      started: completed,
      completed: completed,
      wa_clicks: 0,
      btn_clicks: 0,
      engagement_rate: 100,
      conversion_rate: 100,
      funnel: [],
      leads_per_day: leadsPerDay,
      exit_points: [],
      temperature_dist: tempDist,
    }
  }

  async function _loadAnalyticsData() {
    var _activeQuiz = QA.quiz()
    if (!_activeQuiz) return
    _analyticsLoading = true
    var quizIdAtStart = _activeQuiz.id

    var root = document.getElementById('qa-analytics-root')
    if (!root) { _analyticsLoading = false; return }
    root.innerHTML = '<div class="qa-analytics-loading">Carregando estatísticas...</div>'

    var dates = _periodDates(_analyticsPeriod)

    try {
      var leadsRes = await QA.repo().getResponses(quizIdAtStart, { from: dates.from, to: dates.to, limit: 200 })

      if (!QA.quiz() || QA.quiz().id !== quizIdAtStart) return

      _analyticsLeads = leadsRes.ok ? leadsRes.data : []

      var abandonedRes = await QA.repo().getAbandonedLeads(quizIdAtStart, QA.clinicId(), dates.from, dates.to)
      if (!QA.quiz() || QA.quiz().id !== quizIdAtStart) return
      _analyticsAbandoned = abandonedRes.ok ? abandonedRes.data : []

      var analyticsRes = await QA.repo().getAnalytics(quizIdAtStart, QA.clinicId(), dates.from, dates.to)

      if (!QA.quiz() || QA.quiz().id !== quizIdAtStart) return

      if (analyticsRes.ok && analyticsRes.data) {
        _analyticsData = analyticsRes.data
      } else {
        console.warn('[quiz-analytics] RPC falhou, usando fallback:', analyticsRes.error)
        _analyticsData = _buildFallbackAnalytics(_analyticsLeads)
      }

      _renderAnalyticsDashboard()
    } catch (err) {
      if (!QA.quiz() || QA.quiz().id !== quizIdAtStart) return

      console.error('[quiz-analytics] erro:', err)
      if (_analyticsLeads && _analyticsLeads.length > 0) {
        _analyticsData = _buildFallbackAnalytics(_analyticsLeads)
        _renderAnalyticsDashboard()
      } else {
        var errRoot = document.getElementById('qa-analytics-root')
        if (errRoot) errRoot.innerHTML = '<div class="qa-analytics-error">Erro ao carregar: ' + QA.esc(err.message || 'desconhecido') + '</div>'
      }
    } finally {
      _analyticsLoading = false
    }
  }

  var _PHASE_BADGE_CFG = {
    lead:       { label: 'Lead',       color: '#6366f1', bg: '#eef2ff' },
    agendado:   { label: 'Agendado',   color: '#8b5cf6', bg: '#f5f3ff' },
    reagendado: { label: 'Reagendado', color: '#a855f7', bg: '#faf5ff' },
    compareceu: { label: 'Compareceu', color: '#06b6d4', bg: '#ecfeff' },
    paciente:   { label: 'Paciente',   color: '#10b981', bg: '#f0fdf4' },
    orcamento:  { label: 'Orcamento',  color: '#f59e0b', bg: '#fffbeb' },
    perdido:    { label: 'Perdido',    color: '#ef4444', bg: '#fef2f2' },
  }

  function _qaLeadPhaseBadge(phase) {
    var cfg = _PHASE_BADGE_CFG[phase] || _PHASE_BADGE_CFG.lead
    return '<span style="display:inline-block;padding:2px 8px;border-radius:12px;font-size:11px;font-weight:600;background:' + cfg.bg + ';color:' + cfg.color + '">' + cfg.label + '</span>'
  }

  function _renderAnalyticsDashboard() {
    var root = document.getElementById('qa-analytics-root')
    if (!root) return

    var _activeQuiz = QA.quiz()
    var d = _analyticsData || {}
    var leads = _analyticsLeads || []
    var abandoned = _analyticsAbandoned || []
    var recoverableAbandoned = abandoned.filter(function(a) { return a.contact_name || a.contact_phone })
    var pageViews    = d.page_views    || 0
    var started      = d.started      || 0
    var completed    = d.completed    || 0
    var waClicks     = d.wa_clicks    || 0
    var convRate     = d.conversion_rate || 0
    var engRate      = d.engagement_rate || 0
    var funnel       = d.funnel       || []
    var leadsPerDay  = d.leads_per_day || []
    var exitPoints   = d.exit_points  || []

    var periodLabels = { today: 'Hoje', '7d': '7 dias', '30d': '30 dias', '90d': '90 dias', custom: 'Selecionar Período' }

    if (!_analyticsCustomFrom) {
      var d30 = new Date(); d30.setDate(d30.getDate() - 30)
      _analyticsCustomFrom = d30.toISOString().substring(0, 10)
    }
    if (!_analyticsCustomTo) {
      _analyticsCustomTo = new Date().toISOString().substring(0, 10)
    }

    // ── Period selector
    var periodHtml = '<div class="qa-period-bar">' +
      ['today','7d','30d','90d','custom'].map(function(p) {
        return '<button class="qa-period-btn' + (p === _analyticsPeriod ? ' active' : '') + '" data-period="' + p + '">' + periodLabels[p] + '</button>'
      }).join('') +
      (_analyticsPeriod === 'custom'
        ? '<input type="date" class="qa-input qa-date-input" id="qa-date-from" value="' + _analyticsCustomFrom + '">' +
          '<span style="font-size:11px;color:#9ca3af;font-weight:600">a</span>' +
          '<input type="date" class="qa-input qa-date-input" id="qa-date-to" value="' + _analyticsCustomTo + '">' +
          '<button class="qa-refresh-btn" id="qa-date-apply">' +
            '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>' +
            'Aplicar' +
          '</button>'
        : '') +
      '<button class="qa-refresh-btn" id="qa-analytics-refresh" style="margin-left:auto">' +
        '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15"/></svg>' +
        'Atualizar' +
      '</button>' +
    '</div>'

    // ── Thresholds
    var th = (_activeQuiz.schema.analytics_thresholds) || {}
    var engGreen  = typeof th.engagement_green  === 'number' ? th.engagement_green  : 60
    var engYellow = typeof th.engagement_yellow === 'number' ? th.engagement_yellow : 30
    var convGreen  = typeof th.conversion_green  === 'number' ? th.conversion_green  : 60
    var convYellow = typeof th.conversion_yellow === 'number' ? th.conversion_yellow : 30

    var topExit = exitPoints.length > 0 ? exitPoints[0] : null
    var engSuggestion = ''
    var convSuggestion = ''

    if (engRate < engYellow) {
      engSuggestion = 'Mude o título, imagem ou texto do botão CTA da tela inicial'
    } else if (engRate < engGreen) {
      engSuggestion = 'Teste uma imagem ou vídeo diferente na intro'
    }

    if (convRate < convYellow && topExit) {
      convSuggestion = 'Maior gargalo: "' + (topExit.last_label || 'Step ' + topExit.last_step) + '" — simplifique ou remova'
    } else if (convRate < convGreen && topExit) {
      convSuggestion = 'Revise: "' + (topExit.last_label || 'Step ' + topExit.last_step) + '" (' + topExit.exits + ' abandonos)'
    }

    // ── WhatsApp rate
    var waRate = completed > 0 ? Math.round((waClicks / completed) * 100) : 0
    var waGreen  = typeof th.whatsapp_green  === 'number' ? th.whatsapp_green  : 50
    var waYellow = typeof th.whatsapp_yellow === 'number' ? th.whatsapp_yellow : 20
    var waSuggestion = ''
    if (waRate < waYellow) {
      waSuggestion = 'Teste vídeo, oferta ou presente na tela final'
    } else if (waRate < waGreen) {
      waSuggestion = 'Experimente mudar a mensagem ou o CTA do botão'
    }

    var kpiHtml = '<div class="qa-kpi-grid">' +
      _buildKpiCard('Visualizaram', pageViews, '#fff7ed', '#f97316',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>',
        '', 'Quantas pessoas abriram a página do quiz. Quanto maior esse número, mais alcance sua campanha está tendo.') +
      _buildKpiCardWithRate('Iniciaram', started, '#eff6ff', '#3b82f6',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        engRate, 'engajamento',
        'Engajamento: % de quem abriu e clicou Começar. Verde: acima de ' + engGreen + '%. Amarelo: ' + engYellow + '-' + (engGreen - 1) + '%. Vermelho: abaixo de ' + engYellow + '%.',
        engSuggestion, engGreen, engYellow, 'engagement') +
      _buildKpiCardWithRate('Finalizaram', completed, '#f0fdf4', '#22c55e',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
        convRate, 'conversão',
        'Conversão: % de quem iniciou e finalizou. Verde: acima de ' + convGreen + '%. Amarelo: ' + convYellow + '-' + (convGreen - 1) + '%. Vermelho: abaixo de ' + convYellow + '%.',
        convSuggestion, convGreen, convYellow, 'conversion') +
      _buildKpiCardWithRate('WhatsApp', waClicks, '#f0fdf4', '#25D366',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>',
        waRate, 'engajamento WA',
        'WhatsApp: % dos leads que clicaram no botão. Verde: acima de ' + waGreen + '%. Amarelo: ' + waYellow + '-' + (waGreen - 1) + '%. Vermelho: abaixo de ' + waYellow + '%. Teste vídeo, foto ou presente na tela final para aumentar.',
        waSuggestion, waGreen, waYellow, 'whatsapp') +
      '<div id="qa-kpi-abandoned" style="cursor:pointer">' +
      _buildKpiCard('Abandonos', abandoned.length, '#fef2f2', '#ef4444',
        '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>',
        recoverableAbandoned.length > 0 ? recoverableAbandoned.length + ' recuperáveis' : '',
        'Leads que iniciaram mas não finalizaram. Clique para ver a lista. Os recuperáveis têm nome e telefone e podem ser contactados diretamente.') +
      '</div>' +
    '</div>'

    // ── Line chart
    var chartHtml = '<div class="qa-chart-wrap">' +
      '<div class="qa-chart-title">' +
        '<div class="qa-tooltip-wrap">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>' +
          '<div class="qa-tooltip">Gráfico com a quantidade de leads que finalizaram o quiz por dia. Use para identificar tendências, picos após campanhas e sazonalidade.</div>' +
        '</div>' +
        'Leads por período' +
      '</div>' +
      (leadsPerDay.length > 0
        ? '<div id="qa-chart-canvas">' + _buildLineChartSVG(leadsPerDay) + '</div>'
        : '<div class="qa-chart-empty">Nenhum dado no período selecionado</div>') +
    '</div>'

    // ── Funnel
    var maxFunnel = funnel.length > 0 ? Math.max.apply(null, funnel.map(function(f) { return f.views })) : 1
    var funnelHtml = '<div class="qa-chart-wrap">' +
      '<div class="qa-chart-title">' +
        '<div class="qa-tooltip-wrap">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>' +
          '<div class="qa-tooltip">Mostra quantas pessoas viram cada etapa do quiz. A barra vai diminuindo conforme os leads avançam. Quedas bruscas entre etapas indicam perguntas problemáticas que devem ser simplificadas ou removidas.</div>' +
        '</div>' +
        'Funil do Quiz' +
      '</div>' +
      (funnel.length > 0
        ? (function() {
            // Calcular drop-off entre steps para identificar gargalos
            // Drop entre steps: se step 3→4 perde 20 leads, o gargalo é o step 3 (onde o lead estava quando saiu)
            var drops = []
            for (var di = 0; di < funnel.length - 1; di++) {
              drops.push({ idx: di, drop: funnel[di].views - funnel[di + 1].views })
            }
            // Último step vs completados: se LGPD teve 10 views mas só 5 completaram, 5 saíram no LGPD
            if (funnel.length > 0) {
              var lastViews = funnel[funnel.length - 1].views
              var lastDrop = lastViews - completed
              if (lastDrop > 0) drops.push({ idx: funnel.length - 1, drop: lastDrop })
            }
            drops.sort(function(a, b) { return b.drop - a.drop })
            var exitRank = {}
            if (drops.length > 0 && drops[0].drop > 0) exitRank[drops[0].idx] = 1
            if (drops.length > 1 && drops[1].drop > 0) exitRank[drops[1].idx] = 2

            return funnel.map(function(f, fi) {
              var pct = Math.round((f.views / maxFunnel) * 100)
              var colors = ['#6366F1','#818cf8','#a5b4fc','#c7d2fe','#e0e7ff']
              var color = colors[Math.min(f.step_index || 0, colors.length - 1)]
              var countClass = 'qa-funnel-count'
              if (exitRank[fi] === 1) countClass += ' qa-funnel-exit-1'
              else if (exitRank[fi] === 2) countClass += ' qa-funnel-exit-2'
              return '<div class="qa-funnel-row">' +
                '<div class="qa-funnel-label" title="' + QA.esc(f.step_label || 'Step ' + f.step_index) + '">' + QA.esc(f.step_label || 'Step ' + f.step_index) + '</div>' +
                '<div class="qa-funnel-bar-wrap"><div class="qa-funnel-bar" style="width:' + pct + '%;background:' + color + '"><span class="qa-funnel-bar-text">' + pct + '%</span></div></div>' +
                '<div class="' + countClass + '">' + f.views + '</div>' +
              '</div>'
            }).join('')
          })()

        : '<div class="qa-chart-empty">Nenhum dado de funil disponível</div>') +
    '</div>'

    // ── Exit points
    var totalExits = exitPoints.reduce(function(s, e) { return s + (e.exits || 0) }, 0) || 1
    var questions = (_activeQuiz.schema && _activeQuiz.schema.questions) || []

    function _getRevisionForStep(stepIdx) {
      var q = questions[stepIdx]
      return (q && q.revised_at) ? q.revised_at : null
    }

    var enrichedExits = exitPoints.map(function(e) {
      var revisedAt = _getRevisionForStep(e.last_step)
      var dates = _periodDates(_analyticsPeriod)
      var hasRevision = revisedAt && revisedAt >= dates.from && revisedAt <= dates.to
      return {
        label: e.last_label || 'Step ' + e.last_step,
        exits: e.exits,
        step: e.last_step,
        revised_at: revisedAt,
        revised_in_period: hasRevision,
      }
    })

    var exitHtml = '<div class="qa-chart-wrap">' +
      '<div class="qa-chart-title">' +
        '<div class="qa-tooltip-wrap">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>' +
          '<div class="qa-tooltip">Mostra onde os leads abandonaram o quiz, ordenado pelo maior gargalo. Quando você edita uma pergunta (título ou opções), o sistema marca a data da revisão. Use Selecionar Período para comparar os abandonos antes e depois da mudança e medir se o ajuste funcionou.</div>' +
        '</div>' +
        'Pontos de Saída' +
      '</div>' +
      (enrichedExits.length > 0
        ? enrichedExits.map(function(e, i) {
            var pct = Math.round((e.exits / totalExits) * 100)
            var rank = i + 1
            var revBadge = ''
            if (e.revised_at) {
              var revDate = new Date(e.revised_at).toLocaleDateString('pt-BR')
              revBadge = '<span class="qa-exit-revised" title="Revisada em ' + revDate + '">' +
                '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg> revisada ' + revDate +
              '</span>'
            }
            var rankClass = rank === 1 ? ' qa-exit-rank-1' : (rank === 2 ? ' qa-exit-rank-2' : '')
            return '<div class="qa-exit-row">' +
              '<div class="qa-exit-rank' + rankClass + '">' + rank + '</div>' +
              '<div class="qa-exit-label">' + QA.esc(e.label) + revBadge + '</div>' +
              '<div class="qa-exit-count">' + e.exits + '</div>' +
              '<div class="qa-exit-pct">(' + pct + '%)</div>' +
            '</div>'
          }).join('')
        : '<div class="qa-chart-empty">Nenhum abandono registrado</div>') +
    '</div>'

    // ── Temperature distribution
    var tempDist = d.temperature_dist || {}
    var tempTotal = (tempDist.hot || 0) + (tempDist.warm || 0) + (tempDist.cold || 0)
    var tempHtml = ''
    if (tempTotal > 0) {
      var tempItems = [
        { key: 'hot',  label: 'Quente', color: '#ef4444', bg: '#fef2f2' },
        { key: 'warm', label: 'Morno',  color: '#f59e0b', bg: '#fffbeb' },
        { key: 'cold', label: 'Frio',   color: '#3b82f6', bg: '#eff6ff' },
      ]
      tempHtml = '<div class="qa-chart-wrap">' +
        '<div class="qa-chart-title">' +
          '<div class="qa-tooltip-wrap">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/></svg>' +
            '<div class="qa-tooltip">Classificação automática dos leads baseada no score das respostas. Leads quentes têm maior potencial de conversão e devem ser priorizados pela equipe comercial.</div>' +
          '</div>' +
          'Temperatura dos Leads' +
        '</div>' +
        '<div class="qa-kpi-grid" style="grid-template-columns:repeat(3,1fr)">' +
        tempItems.map(function(t) {
          var cnt = tempDist[t.key] || 0
          var pct = tempTotal > 0 ? Math.round((cnt / tempTotal) * 100) : 0
          return '<div class="qa-kpi-card" style="border-color:' + t.color + '30">' +
            '<div class="qa-kpi-value" style="color:' + t.color + '">' + cnt + '</div>' +
            '<div class="qa-kpi-label">' + t.label + '</div>' +
            '<div class="qa-kpi-sub">' + pct + '% dos leads</div>' +
          '</div>'
        }).join('') +
        '</div>' +
      '</div>'
    }

    // ── Leads table
    var questions = (_activeQuiz.schema && _activeQuiz.schema.questions) || []
    var tableHtml = '<div class="qa-chart-wrap" style="padding-bottom:4px">' +
      '<div class="qa-chart-title">' +
        '<div class="qa-tooltip-wrap">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
          '<div class="qa-tooltip">Lista completa de todos os leads que finalizaram o quiz no período. Clique em Ver respostas para ver exatamente o que cada lead respondeu em cada pergunta.</div>' +
        '</div>' +
        'Leads do Quiz (' + leads.length + ')' +
      '</div>' +
      (leads.length > 0
        ? '<div class="qa-leads-wrap"><table class="qa-leads-table"><thead><tr>' +
          '<th>Nome</th><th>WhatsApp</th><th>Temperatura</th><th>Status</th><th>Respostas</th><th>Data</th>' +
          '</tr></thead><tbody>' +
          leads.map(function(l, li) {
            var tempClass = (l.temperature || 'cold')
            var dateStr = l.submitted_at
              ? new Date(l.submitted_at).toLocaleDateString('pt-BR') + '<br><span style="font-size:10px;color:#6b7280">' + new Date(l.submitted_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</span>'
              : '-'
            var hasAnswers = l.answers && typeof l.answers === 'object' && Object.keys(l.answers).length > 0
            var phaseBadge = _qaLeadPhaseBadge(l.phase)
            // Proteção: detectar respostas de versão diferente do quiz
            var answerCount = hasAnswers ? Object.keys(l.answers).length : 0
            var currentQCount = questions.length
            var versionMismatch = hasAnswers && answerCount !== currentQCount
            var versionBadge = versionMismatch
              ? '<span style="display:inline-block;margin-left:4px;font-size:9px;font-weight:600;color:#f59e0b;background:#fffbeb;border:1px solid #fde68a;border-radius:4px;padding:0 4px" title="Lead respondeu ' + answerCount + ' perguntas mas o quiz atual tem ' + currentQCount + '">v' + answerCount + '/' + currentQCount + '</span>'
              : ''
            return '<tr>' +
              '<td class="qa-leads-name">' + QA.esc(l.contact_name || '-') + '</td>' +
              '<td class="qa-leads-phone">' + QA.esc(l.contact_phone || '-') + '</td>' +
              '<td><span class="qa-leads-temp ' + tempClass + '">' + QA.esc(tempClass) + '</span></td>' +
              '<td>' + phaseBadge + '</td>' +
              '<td>' + (hasAnswers
                ? '<button class="qa-answers-btn" data-lead-idx="' + li + '">Ver respostas</button>' + versionBadge
                : '<span style="color:#9ca3af;font-size:11px">-</span>') + '</td>' +
              '<td class="qa-leads-date">' + dateStr + '</td>' +
            '</tr>'
          }).join('') +
          '</tbody></table></div>'
        : '<div class="qa-chart-empty">Nenhum lead registrado no período</div>') +
    '</div>'

    root.innerHTML = periodHtml + kpiHtml + chartHtml + funnelHtml + exitHtml + tempHtml + tableHtml

    // Bind period buttons
    root.querySelectorAll('.qa-period-btn').forEach(function(btn) {
      btn.onclick = function() {
        var p = btn.getAttribute('data-period')
        _analyticsPeriod = p
        if (p === 'custom') {
          _renderAnalyticsDashboard()
        } else {
          _loadAnalyticsData()
        }
      }
    })
    var dateApply = document.getElementById('qa-date-apply')
    if (dateApply) {
      dateApply.onclick = function() {
        var fromEl = document.getElementById('qa-date-from')
        var toEl   = document.getElementById('qa-date-to')
        if (fromEl) _analyticsCustomFrom = fromEl.value
        if (toEl)   _analyticsCustomTo   = toEl.value
        _loadAnalyticsData()
      }
    }
    var refreshBtn = document.getElementById('qa-analytics-refresh')
    if (refreshBtn) refreshBtn.onclick = function() { _loadAnalyticsData() }

    // Bind tooltips
    root.querySelectorAll('.qa-tooltip-wrap').forEach(function(wrap) {
      var tip = wrap.querySelector('.qa-tooltip')
      if (!tip) return
      wrap.addEventListener('mouseenter', function() {
        var rect = wrap.getBoundingClientRect()
        tip.style.display = 'block'
        var tipRect = tip.getBoundingClientRect()
        var top = rect.bottom + 8
        var left = rect.left + rect.width / 2 - tipRect.width / 2
        if (left + tipRect.width > window.innerWidth - 8) left = window.innerWidth - tipRect.width - 8
        if (left < 8) left = 8
        if (top + tipRect.height > window.innerHeight - 8) top = rect.top - tipRect.height - 8
        tip.style.top = top + 'px'
        tip.style.left = left + 'px'
      })
      wrap.addEventListener('mouseleave', function() {
        tip.style.display = 'none'
      })
    })

    // Bind abandoned KPI
    var abandonedKpi = document.getElementById('qa-kpi-abandoned')
    if (abandonedKpi) abandonedKpi.onclick = function() {
      if (window.QAPopups) QAPopups.showAbandoned(abandoned, questions)
    }

    // Bind gear buttons
    root.querySelectorAll('.qa-kpi-gear').forEach(function(btn) {
      btn.onclick = function() {
        var metric = btn.getAttribute('data-metric')
        if (metric && window.QAPopups) QAPopups.showThreshold(metric)
      }
    })

    // Bind answer buttons
    root.querySelectorAll('.qa-answers-btn').forEach(function(btn) {
      btn.onclick = function() {
        var idx = parseInt(btn.getAttribute('data-lead-idx'), 10)
        var lead = leads[idx]
        if (lead && window.QAPopups) QAPopups.showAnswers(lead, questions)
      }
    })
  }

  function _buildKpiCard(label, value, bgColor, iconColor, iconSvg, sub, tooltip) {
    return '<div class="qa-kpi-card">' +
      '<div class="qa-kpi-icon" style="background:' + bgColor + ';color:' + iconColor + '">' +
        (tooltip
          ? '<div class="qa-tooltip-wrap">' + iconSvg + '<div class="qa-tooltip">' + QA.esc(tooltip) + '</div></div>'
          : iconSvg) +
      '</div>' +
      '<div class="qa-kpi-value">' + value + '</div>' +
      '<div class="qa-kpi-label">' + QA.esc(label) + '</div>' +
      (sub ? '<div class="qa-kpi-sub">' + QA.esc(sub) + '</div>' : '') +
    '</div>'
  }

  function _rateColor(rate, greenMin, yellowMin) {
    if (rate >= greenMin) return 'green'
    if (rate >= yellowMin) return 'yellow'
    return 'red'
  }

  function _buildKpiCardWithRate(label, value, bgColor, iconColor, iconSvg, rate, rateLabel, tooltip, suggestion, greenMin, yellowMin, metricKey) {
    var color = _rateColor(rate, greenMin || 60, yellowMin || 30)
    var rateColors = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' }
    var rateBgs    = { green: '#f0fdf4', yellow: '#fefce8', red: '#fef2f2' }
    var rc = rateColors[color] || '#6b7280'
    var rb = rateBgs[color]    || '#f9fafb'
    var gearSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>'
    var fullTooltip = tooltip || ''
    if (suggestion) fullTooltip += (fullTooltip ? ' | Sugestão: ' : 'Sugestão: ') + suggestion
    return '<div class="qa-kpi-card" style="padding:0;overflow:hidden;position:relative">' +
      '<button class="qa-kpi-gear" data-metric="' + (metricKey || '') + '">' + gearSvg + '</button>' +
      '<div class="qa-kpi-split">' +
        '<div class="qa-kpi-split-left">' +
          '<div class="qa-kpi-icon" style="background:' + bgColor + ';color:' + iconColor + '">' +
            (fullTooltip
              ? '<div class="qa-tooltip-wrap">' + iconSvg + '<div class="qa-tooltip">' + QA.esc(fullTooltip) + '</div></div>'
              : iconSvg) +
          '</div>' +
          '<div class="qa-kpi-value">' + value + '</div>' +
          '<div class="qa-kpi-label">' + QA.esc(label) + '</div>' +
        '</div>' +
        '<div class="qa-kpi-split-divider"></div>' +
        '<div class="qa-kpi-split-right" style="background:' + rb + '">' +
          '<div class="qa-kpi-rate-label" style="color:' + rc + '">' + QA.esc(rateLabel) + '</div>' +
          '<div class="qa-kpi-rate-value" style="color:' + rc + '">' + rate + '%</div>' +
        '</div>' +
      '</div>' +
    '</div>'
  }

  function _buildLineChartSVG(data) {
    if (!data || data.length === 0) return ''

    var W = 520, H = 200, padL = 36, padR = 16, padT = 24, padB = 30
    var chartW = W - padL - padR
    var chartH = H - padT - padB

    var maxVal = Math.max.apply(null, data.map(function(d) { return d.total }))
    if (maxVal === 0) maxVal = 1

    var points = data.map(function(d, i) {
      var x = padL + (data.length === 1 ? chartW / 2 : (i / (data.length - 1)) * chartW)
      var y = padT + chartH - (d.total / maxVal) * chartH
      return { x: x, y: y, total: d.total, day: d.day }
    })

    var linePath = points.map(function(p, i) { return (i === 0 ? 'M' : 'L') + p.x.toFixed(1) + ',' + p.y.toFixed(1) }).join(' ')
    var areaPath = linePath + ' L' + points[points.length - 1].x.toFixed(1) + ',' + (padT + chartH) + ' L' + points[0].x.toFixed(1) + ',' + (padT + chartH) + ' Z'

    var gridLines = ''
    for (var g = 0; g <= 4; g++) {
      var gy = padT + (g / 4) * chartH
      var gVal = Math.round(maxVal - (g / 4) * maxVal)
      gridLines += '<line class="grid-line" x1="' + padL + '" y1="' + gy.toFixed(1) + '" x2="' + (W - padR) + '" y2="' + gy.toFixed(1) + '"/>'
      gridLines += '<text class="axis-label" x="' + (padL - 6) + '" y="' + (gy + 3).toFixed(1) + '" text-anchor="end">' + gVal + '</text>'
    }

    var step = Math.max(1, Math.ceil(data.length / 8))
    var xLabels = ''
    points.forEach(function(p, i) {
      if (i % step === 0 || i === points.length - 1) {
        var dayStr = p.day ? p.day.substring(5).replace('-', '/') : ''
        xLabels += '<text class="axis-label" x="' + p.x.toFixed(1) + '" y="' + (H - 6) + '" text-anchor="middle">' + dayStr + '</text>'
      }
    })

    var dots = points.map(function(p) {
      return '<circle class="data-dot" cx="' + p.x.toFixed(1) + '" cy="' + p.y.toFixed(1) + '" r="3.5"/>' +
        '<text class="value-label" x="' + p.x.toFixed(1) + '" y="' + (p.y - 8).toFixed(1) + '" text-anchor="middle">' + p.total + '</text>'
    }).join('')

    return '<svg class="qa-line-chart" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="xMidYMid meet">' +
      '<defs><linearGradient id="qa-gradient" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#6366F1"/><stop offset="100%" stop-color="#6366F1" stop-opacity="0"/></linearGradient></defs>' +
      gridLines + xLabels +
      '<path class="data-area" d="' + areaPath + '"/>' +
      '<path class="data-line" d="' + linePath + '"/>' +
      dots +
    '</svg>'
  }

  // Fallback if QuizId not loaded
  function _legacyMapAnswers(answers, questions) {
    var items = []
    Object.keys(answers).forEach(function(key) {
      var idx = parseInt(key, 10)
      var q = !isNaN(idx) ? questions[idx] : null
      items.push({
        questionId: key, questionTitle: q ? (q.title || 'Pergunta ' + (idx + 1)) : 'Pergunta ' + key,
        questionType: q ? q.type : 'unknown', answer: answers[key], score: null, options: q ? (q.options || []) : [], index: isNaN(idx) ? -1 : idx,
      })
    })
    return items
  }

  window.QAAnalytics = {
    buildTab: _buildAnalyticsTab,
    bindEvents: _bindAnalyticsEvents,
    periodDates: _periodDates,
    legacyMapAnswers: _legacyMapAnswers,
  }

})()
