/**
 * ClinicAI — B2B Suggestions UI (tab 'Gaps')
 *
 * Mostra as 24 categorias do plano em 3 grupos (red/yellow/green).
 * Red → vazio (nenhuma parceria, nenhum candidato). Ação principal: scout ou manual.
 * Yellow → tem candidato em triagem, sem parceria. Ação: abrir aba Candidatos.
 * Green → já tem parceria ativa/contrato/review.
 *
 * Consome: B2BSuggestionsRepository.
 * Eventos ouvidos: 'b2b:tab-change' (tab === 'gaps'), 'b2b:partnership-saved', 'b2b:candidate-added'
 * Eventos emitidos:
 *   'b2b:scout-scan-request'   { category }    — pede ao Candidates aba
 *   'b2b:open-candidate-form'  {}              — abre form manual
 *   'b2b:tab-change'           { tab }         — navegar
 *
 * Expõe window.B2BSuggestions.
 */
;(function () {
  'use strict'
  if (window.B2BSuggestions) return

  var _state = { data: null, loading: false, error: null }

  var COLORS = {
    red:    { hex: '#EF4444', label: 'Vazio',        desc: 'Sem parceria nem candidato' },
    yellow: { hex: '#F59E0B', label: 'Em triagem',   desc: 'Tem candidatos, sem parceria' },
    green:  { hex: '#10B981', label: 'Coberto',      desc: 'Já tem parceria ativa' },
  }

  var PILLAR_LABELS = {
    imagem:       'Imagem',
    evento:       'Evento',
    institucional:'Institucional',
    fitness:      'Fitness',
    alimentacao:  'Alimentação',
    saude:        'Saúde',
    status:       'Status',
    rede:         'Rede',
    outros:       'Outros',
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _repo() { return window.B2BSuggestionsRepository }
  function _emit(n, d) { document.dispatchEvent(new CustomEvent(n, { detail: d || {} })) }

  function _pillarLabel(p) { return PILLAR_LABELS[p] || p }

  // Top 3 categorias mais prioritárias em red (gaps urgentes)
  function _renderTopGaps(cats) {
    var reds = cats.filter(function (c) { return c.state === 'red' })
      .sort(function (a, b) {
        if (a.tier !== b.tier) return (a.tier || 99) - (b.tier || 99)
        return (b.priority || 0) - (a.priority || 0)
      })
      .slice(0, 3)
    if (!reds.length) return ''
    return '<div class="b2b-sug-toplist">' +
      '<div class="b2b-sug-toplist-hdr">Abordar primeiro · 3 categorias prioritárias</div>' +
      '<div class="b2b-sug-toplist-grid">' +
        reds.map(function (c) {
          return '<div class="b2b-sug-top-card">' +
            '<div class="b2b-sug-top-pill">T' + c.tier + ' · ' + _esc(_pillarLabel(c.pillar)) + '</div>' +
            '<div class="b2b-sug-top-name">' + _esc(c.label) + '</div>' +
            (c.notes ? '<div class="b2b-sug-top-notes">' + _esc(c.notes) + '</div>' : '') +
            '<div class="b2b-sug-top-acts">' +
              '<button class="b2b-btn" data-sug-action="manual" data-slug="' + _esc(c.slug) + '">+ Manual</button>' +
              '<button class="b2b-btn b2b-btn-primary" data-sug-action="scout" data-slug="' + _esc(c.slug) + '">Varrer</button>' +
            '</div>' +
          '</div>'
        }).join('') +
      '</div></div>'
  }

  // Cobertura agrupada por pilar estratégico
  function _renderByPillar(cats) {
    var byPillar = {}
    cats.forEach(function (c) {
      var k = c.pillar || 'outros'
      if (!byPillar[k]) byPillar[k] = { total:0, green:0, yellow:0, red:0 }
      byPillar[k].total++
      byPillar[k][c.state] = (byPillar[k][c.state] || 0) + 1
    })
    var keys = Object.keys(byPillar).sort(function (a, b) {
      return byPillar[b].total - byPillar[a].total
    })
    return '<div class="b2b-sug-pillars">' +
      '<div class="b2b-sug-pillars-hdr">Cobertura por pilar</div>' +
      '<div class="b2b-sug-pillars-grid">' +
        keys.map(function (k) {
          var p = byPillar[k]
          var coveredPct = p.total > 0 ? Math.round(((p.green || 0) / p.total) * 100) : 0
          var color = coveredPct >= 66 ? '#10B981' : coveredPct >= 33 ? '#F59E0B' : '#EF4444'
          return '<div class="b2b-sug-pillar-card">' +
            '<div class="b2b-sug-pillar-top">' +
              '<strong>' + _esc(_pillarLabel(k)) + '</strong>' +
              '<span style="color:' + color + '">' + coveredPct + '%</span>' +
            '</div>' +
            '<div class="b2b-sug-pillar-bar">' +
              '<div style="width:' + coveredPct + '%;background:' + color + '"></div>' +
            '</div>' +
            '<div class="b2b-sug-pillar-meta">' +
              (p.green || 0) + ' cobertas · ' + ((p.yellow || 0) + (p.red || 0)) + ' em aberto · ' + p.total + ' total' +
            '</div>' +
          '</div>'
        }).join('') +
      '</div></div>'
  }

  function _renderCounters(cats) {
    var by = { green: 0, yellow: 0, red: 0 }
    cats.forEach(function (c) { by[c.state] = (by[c.state] || 0) + 1 })
    return '<div class="b2b-sug-counters">' +
      ['green','yellow','red'].map(function (k) {
        var col = COLORS[k]
        return '<div class="b2b-sug-kpi" style="border-left:3px solid ' + col.hex + '">' +
          '<div class="b2b-sug-kpi-n" style="color:' + col.hex + '">' + by[k] + '</div>' +
          '<div class="b2b-sug-kpi-l">' + col.label + '</div>' +
          '<div class="b2b-sug-kpi-d">' + col.desc + '</div>' +
        '</div>'
      }).join('') +
      '<div class="b2b-sug-kpi"><div class="b2b-sug-kpi-n">' + cats.length + '</div>' +
        '<div class="b2b-sug-kpi-l">Total do plano</div>' +
        '<div class="b2b-sug-kpi-d">24 categorias priorizadas</div></div>' +
    '</div>'
  }

  function _renderRow(c) {
    var color = COLORS[c.state] || COLORS.red
    var score = c.best_candidate_score != null ? Number(c.best_candidate_score).toFixed(1) : null

    var actions = ''
    if (c.state === 'red') {
      actions =
        '<button class="b2b-btn" data-sug-action="manual"  data-slug="' + _esc(c.slug) + '">+ Manual</button>' +
        '<button class="b2b-btn b2b-btn-primary" data-sug-action="scout" data-slug="' + _esc(c.slug) + '">Varrer</button>'
    } else if (c.state === 'yellow') {
      actions =
        '<button class="b2b-btn" data-sug-action="triage" data-slug="' + _esc(c.slug) + '">Triar (' + c.open_candidates + ')</button>'
    } else {
      actions = '<span class="b2b-sug-ok">' + c.active_partnerships + ' parc.</span>'
    }

    return '<div class="b2b-sug-row">' +
      '<span class="b2b-sug-dot" style="background:' + color.hex + '"></span>' +
      '<div class="b2b-sug-body">' +
        '<div class="b2b-sug-top">' +
          '<strong>' + _esc(c.label) + '</strong>' +
          '<span class="b2b-pill b2b-pill-tier">T' + c.tier + '</span>' +
          '<span class="b2b-pill">' + _esc(_pillarLabel(c.pillar)) + '</span>' +
        '</div>' +
        '<div class="b2b-sug-meta">' +
          (c.notes ? _esc(c.notes) : '') +
          (score ? ' · melhor candidato DNA ' + score : '') +
        '</div>' +
      '</div>' +
      '<div class="b2b-sug-acts">' + actions + '</div>' +
    '</div>'
  }

  function _renderTier(tier, cats) {
    var tierCats = cats.filter(function (c) { return c.tier === tier }).sort(function (a, b) {
      // red primeiro, yellow, green. Dentro, priority desc
      var order = { red: 0, yellow: 1, green: 2 }
      if (order[a.state] !== order[b.state]) return order[a.state] - order[b.state]
      return b.priority - a.priority
    })
    if (!tierCats.length) return ''
    var tierLabel = ({ 1: 'Tier 1 — abrir agora', 2: 'Tier 2 — 60-90 dias', 3: 'Tier 3 — latente' })[tier]
    return '<div class="b2b-sug-tier">' +
      '<div class="b2b-sug-tier-hdr">' + tierLabel + ' · ' + tierCats.length + '</div>' +
      tierCats.map(_renderRow).join('') +
    '</div>'
  }

  function _renderBody() {
    var body = window.B2BShell ? window.B2BShell.getTabBody() : document.getElementById('b2bTabBody')
    if (!body) return

    if (_state.loading) {
      body.innerHTML = (window.B2BUXKit && window.B2BUXKit.skeleton({ rows: 6, compact: true })) ||
                       '<div class="b2b-empty">Carregando gaps…</div>'
      return
    }
    if (_state.error)   { body.innerHTML = '<div class="b2b-empty b2b-empty-err">' + _esc(_state.error) + '</div>'; return }

    var d = _state.data
    if (!d || !d.categories) { body.innerHTML = '<div class="b2b-empty">Sem dados.</div>'; return }

    var cats = d.categories
    var gen = d.generated_at ? new Date(d.generated_at).toLocaleString('pt-BR') : '—'

    body.innerHTML =
      '<div class="b2b-sug-head">' +
        '<div>' +
          '<div class="b2b-list-count">Cobertura do plano · ' + cats.length + ' categorias</div>' +
          '<div style="font-size:11px;color:var(--b2b-text-muted);margin-top:2px">Última leitura: ' + _esc(gen) + '</div>' +
        '</div>' +
        '<button type="button" class="b2b-btn" id="b2bSugReload">Atualizar</button>' +
      '</div>' +
      _renderCounters(cats) +
      _renderTopGaps(cats) +
      _renderByPillar(cats) +
      _renderTier(1, cats) +
      _renderTier(2, cats) +
      _renderTier(3, cats)

    _bind(body)
  }

  function _bind(root) {
    var reloadBtn = root.querySelector('#b2bSugReload')
    if (reloadBtn) reloadBtn.addEventListener('click', _load)

    root.querySelectorAll('[data-sug-action]').forEach(function (btn) {
      btn.addEventListener('click', _onAction)
    })
  }

  function _onAction(e) {
    var btn = e.currentTarget
    var action = btn.getAttribute('data-sug-action')
    var slug = btn.getAttribute('data-slug')

    if (action === 'manual') {
      // Abre aba Candidatos e o form manual, passando categoria pré-selecionada via state (simples: shell já muda a tab e o form usa dropdown)
      if (window.B2BShell) window.B2BShell.setActiveTab('candidates')
      // Pequeno delay pra garantir que o form renderize depois da aba
      setTimeout(function () {
        _emit('b2b:open-candidate-form', { preselect_category: slug })
      }, 80)
    } else if (action === 'scout') {
      if (window.B2BShell) window.B2BShell.setActiveTab('candidates')
      // Dispara evento pra Candidates fazer o scan (via seu próprio botão — ou simulamos o click)
      setTimeout(function () {
        _emit('b2b:scout-scan-request', { category: slug })
        // Como fallback UX: ativa o select e clica no botão Varrer
        var sel = document.getElementById('b2bScoutCatSel')
        var scan = document.getElementById('b2bScoutScanBtn')
        if (sel && scan) { sel.value = slug; scan.click() }
      }, 100)
    } else if (action === 'triage') {
      if (window.B2BShell) window.B2BShell.setActiveTab('candidates')
      // Filtro idealmente por categoria — por ora, só navega
    }
  }

  async function _load() {
    _state.loading = true
    _state.error = null
    _renderBody()
    try {
      _state.data = await _repo().snapshot()
    } catch (e) {
      _state.error = e.message || String(e)
      _state.data = null
    } finally {
      _state.loading = false
      _renderBody()
    }
  }

  document.addEventListener('b2b:tab-change', function (e) {
    if (e.detail && e.detail.tab === 'gaps') _load()
  })

  ;['b2b:partnership-saved','b2b:candidate-added','b2b:candidate-status-changed'].forEach(function (ev) {
    document.addEventListener(ev, function () {
      var cur = window.B2BShell && window.B2BShell.getActiveTab()
      if (cur === 'gaps') _load()
    })
  })

  window.B2BSuggestions = Object.freeze({ reload: _load })
})()
