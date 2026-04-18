/**
 * ClinicAI — B2B Health Dashboard UI
 *
 * Renderiza a tab 'health' (dashboard de saúde).
 * Consome a RPC b2b_health_snapshot; não depende de outros UIs.
 *
 * Features:
 *   - 3 cards grandes: verde / amarelo / vermelho (+ unknown pequeno)
 *   - Lista prioritária (amarelos e vermelhos ordenados por severidade)
 *   - Botão "Recalcular tudo" (dispara b2b_partnership_health_recalc_all)
 *   - Cada linha tem ação "Abrir detalhe" (emite b2b:open-detail)
 *
 * Eventos ouvidos:
 *   'b2b:tab-change' (tab === 'health')
 *   'b2b:partnership-saved' (reload)
 *
 * Eventos emitidos:
 *   'b2b:open-detail' { id }
 *
 * Expõe window.B2BHealth.
 */
;(function () {
  'use strict'
  if (window.B2BHealth) return

  var _state = {
    data: null,
    loading: false,
    error: null,
  }

  var COLORS = {
    green:   { hex: '#10B981', label: 'Verde',    desc: 'Operando bem' },
    yellow:  { hex: '#F59E0B', label: 'Amarelo',  desc: 'Atenção'      },
    red:     { hex: '#EF4444', label: 'Vermelho', desc: 'Crítico'      },
    unknown: { hex: '#9CA3AF', label: 'Sem dado', desc: 'Pausado/sem info' },
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }

  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function _emit(name, detail) {
    document.dispatchEvent(new CustomEvent(name, { detail: detail || {} }))
  }

  // ─── Render ─────────────────────────────────────────────────
  function _renderCounterCard(color, count) {
    var c = COLORS[color] || COLORS.unknown
    var size = (color === 'unknown') ? 'small' : 'large'
    return '<div class="b2b-hcard b2b-hcard-' + size + '" data-health-color="' + color + '" style="border-left:4px solid ' + c.hex + '">' +
      '<div class="b2b-hcard-count" style="color:' + c.hex + '">' + count + '</div>' +
      '<div class="b2b-hcard-lbl">' + _esc(c.label) + '</div>' +
      '<div class="b2b-hcard-desc">' + _esc(c.desc) + '</div>' +
    '</div>'
  }

  function _renderCounters(data) {
    var c = data.counts || {}
    return '<div class="b2b-health-counters">' +
      _renderCounterCard('green',   c.green   || 0) +
      _renderCounterCard('yellow',  c.yellow  || 0) +
      _renderCounterCard('red',     c.red     || 0) +
      _renderCounterCard('unknown', c.unknown || 0) +
    '</div>'
  }

  function _renderCriticalRow(p) {
    var c = COLORS[p.health_color] || COLORS.unknown
    return '<button class="b2b-hrow" data-id="' + _esc(p.id) + '" data-action="open">' +
      '<span class="b2b-hrow-dot" style="background:' + c.hex + '"></span>' +
      '<div class="b2b-hrow-body">' +
        '<div class="b2b-hrow-top">' +
          '<strong>' + _esc(p.name) + '</strong>' +
          (p.tier ? '<span class="b2b-pill b2b-pill-tier">T' + p.tier + '</span>' : '') +
          '<span class="b2b-pill">' + _esc(p.pillar || 'outros') + '</span>' +
          '<span class="b2b-pill">' + _esc(p.status) + '</span>' +
        '</div>' +
        '<div class="b2b-hrow-meta">' +
          (p.dna_score != null ? 'DNA ' + Number(p.dna_score).toFixed(1) : 'DNA —') +
          (p.contact_name ? ' · ' + _esc(p.contact_name) : '') +
          (p.contact_phone ? ' · ' + _esc(p.contact_phone) : '') +
        '</div>' +
      '</div>' +
      '<span class="b2b-hrow-arrow">→</span>' +
    '</button>'
  }

  function _renderCritical(data) {
    var items = data.critical || []
    if (!items.length) {
      return '<div class="b2b-empty">Nenhuma parceria em atenção no momento. Todas verdes.</div>'
    }
    var red    = items.filter(function (p) { return p.health_color === 'red' })
    var yellow = items.filter(function (p) { return p.health_color === 'yellow' })

    var out = ''
    if (red.length) {
      out += '<div class="b2b-hgroup">' +
        '<div class="b2b-hgroup-hdr" style="color:' + COLORS.red.hex + '">' +
          red.length + ' vermelhas · ação imediata' +
        '</div>' +
        red.map(_renderCriticalRow).join('') +
      '</div>'
    }
    if (yellow.length) {
      out += '<div class="b2b-hgroup">' +
        '<div class="b2b-hgroup-hdr" style="color:' + COLORS.yellow.hex + '">' +
          yellow.length + ' amarelas · atenção' +
        '</div>' +
        yellow.map(_renderCriticalRow).join('') +
      '</div>'
    }
    return out
  }

  function _renderBody() {
    var body = window.B2BShell ? window.B2BShell.getTabBody() : document.getElementById('b2bTabBody')
    if (!body) return

    if (_state.loading) {
      body.innerHTML = (window.B2BUXKit && window.B2BUXKit.skeleton({ rows: 4, compact: true })) ||
                       '<div class="b2b-empty">Carregando saúde…</div>'
      return
    }
    if (_state.error) {
      body.innerHTML = '<div class="b2b-empty b2b-empty-err">Erro: ' + _esc(_state.error) + '</div>'
      return
    }

    var d = _state.data || { counts: {}, critical: [] }
    var generated = d.generated_at ? new Date(d.generated_at).toLocaleString('pt-BR') : '—'

    body.innerHTML =
      '<div class="b2b-health-head">' +
        '<div>' +
          '<div class="b2b-list-count">Saúde do programa · ' + (d.total_active || 0) + ' ativas</div>' +
          '<div style="font-size:11px;color:var(--b2b-text-muted);margin-top:2px">Última leitura: ' + _esc(generated) + '</div>' +
        '</div>' +
        '<button type="button" class="b2b-btn" id="b2bHealthRecalc">Recalcular</button>' +
      '</div>' +
      _renderCounters(d) +
      _renderCritical(d)

    _bind(body)
  }

  // ─── Bind ───────────────────────────────────────────────────
  function _bind(root) {
    root.querySelectorAll('[data-action="open"]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _emit('b2b:open-detail', { id: btn.getAttribute('data-id') })
      })
    })
    var recalcBtn = root.querySelector('#b2bHealthRecalc')
    if (recalcBtn) recalcBtn.addEventListener('click', _onRecalc)
  }

  async function _onRecalc() {
    _state.loading = true
    _renderBody()
    try {
      await _rpc('b2b_partnership_health_recalc_all')
      await _load()
    } catch (e) {
      _state.error = e.message || String(e)
      _state.loading = false
      _renderBody()
    }
  }

  // ─── Data ───────────────────────────────────────────────────
  async function _load() {
    _state.loading = true
    _state.error = null
    _renderBody()
    try {
      _state.data = await _rpc('b2b_health_snapshot')
    } catch (e) {
      _state.error = e.message || String(e)
      _state.data = null
    } finally {
      _state.loading = false
      _renderBody()
    }
  }

  // ─── Bind global ────────────────────────────────────────────
  document.addEventListener('b2b:tab-change', function (e) {
    if (e.detail && e.detail.tab === 'health') _load()
  })

  document.addEventListener('b2b:partnership-saved', function () {
    var cur = window.B2BShell && window.B2BShell.getActiveTab()
    if (cur === 'health') _load()
  })

  // ─── API pública ────────────────────────────────────────────
  window.B2BHealth = Object.freeze({
    reload: _load,
    COLORS: COLORS,
  })
})()
