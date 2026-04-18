/**
 * ClinicAI — B2B Closure UI (tab 'closure')
 *
 * Lista parcerias flagadas pra encerramento. Por card:
 *   - Motivo, saúde, DNA, dias sem atividade
 *   - Botões: Aprovar (fecha + gera carta) · Manter ativa (dismiss) · Abrir parceria
 *
 * Botão "Detectar agora" dispara varredura manual (além do cron mensal).
 *
 * Zero cruzamento (consome só repo próprio + evento open-detail).
 *
 * Eventos ouvidos: 'b2b:tab-change' (tab === 'closure'), 'b2b:partnership-saved'
 * Eventos emitidos: 'b2b:open-detail' { id } · 'b2b:partnership-closed' { id }
 *
 * Expõe window.B2BClosure.
 */
;(function () {
  'use strict'
  if (window.B2BClosure) return

  var _state = {
    pending: [],
    loading: false,
    error: null,
    detecting: false,
    lastLetter: null,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _repo() { return window.B2BClosureRepository }
  function _emit(n, d) { document.dispatchEvent(new CustomEvent(n, { detail: d || {} })) }
  function _fmtDate(iso) {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString('pt-BR') } catch (_) { return iso }
  }
  function _healthColor(c) {
    return ({ green:'#10B981', yellow:'#F59E0B', red:'#EF4444', unknown:'#9CA3AF' })[c] || '#9CA3AF'
  }

  function _renderHeader() {
    return '<div class="b2b-health-head">' +
      '<div>' +
        '<div class="b2b-list-count">Parcerias sugeridas pra encerramento</div>' +
        '<div style="font-size:11px;color:var(--b2b-text-muted);margin-top:2px">Detecção mensal automática · critérios: 90d sem atividade · saúde vermelha · DNA quebrado</div>' +
      '</div>' +
      '<button type="button" class="b2b-btn" id="b2bClosureDetect"' + (_state.detecting ? ' disabled' : '') + '>' +
        (_state.detecting ? 'Detectando…' : 'Detectar agora') +
      '</button>' +
    '</div>'
  }

  function _renderRow(p) {
    var days = p.days_idle != null ? p.days_idle + 'd' : '—'
    var dna  = p.dna_score != null ? Number(p.dna_score).toFixed(1) : '—'
    var color = _healthColor(p.health_color)
    return '<div class="b2b-clos-row">' +
      '<span class="b2b-sug-dot" style="background:' + color + '"></span>' +
      '<div class="b2b-clos-body">' +
        '<div class="b2b-clos-top">' +
          '<strong>' + _esc(p.name) + '</strong>' +
          (p.tier ? '<span class="b2b-pill b2b-pill-tier">T' + p.tier + '</span>' : '') +
          '<span class="b2b-pill">' + _esc(p.pillar || 'outros') + '</span>' +
          '<span class="b2b-pill">' + _esc(p.status) + '</span>' +
        '</div>' +
        '<div class="b2b-clos-meta">' +
          'Motivo: <strong>' + _esc(p.closure_reason || '—') + '</strong>' +
          ' · DNA ' + dna +
          ' · ' + days + ' sem atividade' +
          ' · flagada em ' + _fmtDate(p.closure_suggested_at) +
        '</div>' +
      '</div>' +
      '<div class="b2b-clos-acts">' +
        '<button class="b2b-btn" data-clos-action="open" data-id="' + _esc(p.id) + '">Abrir</button>' +
        '<button class="b2b-btn" data-clos-action="dismiss" data-id="' + _esc(p.id) + '" data-name="' + _esc(p.name) + '">Manter ativa</button>' +
        '<button class="b2b-btn b2b-btn-primary" data-clos-action="approve" data-id="' + _esc(p.id) + '" data-name="' + _esc(p.name) + '">Encerrar</button>' +
      '</div>' +
    '</div>'
  }

  function _renderBody() {
    var body = window.B2BShell ? window.B2BShell.getTabBody() : document.getElementById('b2bTabBody')
    if (!body) return

    if (_state.loading) { body.innerHTML = '<div class="b2b-empty">Carregando…</div>'; return }
    if (_state.error)   { body.innerHTML = '<div class="b2b-empty b2b-empty-err">' + _esc(_state.error) + '</div>'; return }

    var emptyMsg = _state.pending.length
      ? ''
      : '<div class="b2b-empty" style="border-color:rgba(138,158,136,0.3);color:var(--b2b-sage)">Nenhuma parceria em risco de encerramento. Tudo saudável.</div>'

    var rows = _state.pending.length
      ? _state.pending.map(_renderRow).join('')
      : emptyMsg

    var letter = _state.lastLetter
      ? '<div class="b2b-clos-letter">' +
          '<div class="b2b-sec-title">Carta gerada — copie pra enviar</div>' +
          '<textarea readonly rows="10" class="b2b-input">' + _esc(_state.lastLetter) + '</textarea>' +
        '</div>'
      : ''

    body.innerHTML = _renderHeader() + rows + letter
    _bind(body)
  }

  function _bind(root) {
    var detectBtn = root.querySelector('#b2bClosureDetect')
    if (detectBtn) detectBtn.addEventListener('click', _onDetect)

    root.querySelectorAll('[data-clos-action]').forEach(function (btn) {
      btn.addEventListener('click', _onAction)
    })
  }

  async function _onDetect() {
    _state.detecting = true
    _renderBody()
    try {
      var r = await _repo().detectInactive()
      if (r && r.ok) {
        await _load()
        if (r.flagged === 0) alert('Nenhuma parceria nova flagada. Tudo no prazo.')
        else alert(r.flagged + ' parceria(s) nova(s) flagada(s) para revisão.')
      }
    } catch (e) {
      alert('Erro: ' + e.message)
    } finally {
      _state.detecting = false
      _renderBody()
    }
  }

  async function _onAction(e) {
    var btn = e.currentTarget
    var action = btn.getAttribute('data-clos-action')
    var id = btn.getAttribute('data-id')
    var name = btn.getAttribute('data-name')

    if (action === 'open') {
      _emit('b2b:open-detail', { id: id })
      return
    }

    if (action === 'dismiss') {
      var note = prompt('Mantendo "' + name + '" ativa. Nota (opcional):') || null
      btn.disabled = true
      try {
        await _repo().dismiss(id, note)
        await _load()
      } catch (err) {
        alert('Erro: ' + err.message)
        btn.disabled = false
      }
      return
    }

    if (action === 'approve') {
      if (!confirm('Encerrar parceria "' + name + '"?\n\n• Status vira "closed"\n• Vouchers abertos são cancelados automaticamente\n• Tasks pendentes viram auto_resolved\n• Carta formal é gerada (você copia + envia)\n\nConfirma?')) return
      var reason = prompt('Motivo final do encerramento (aparece na carta):', '') || null
      btn.disabled = true; btn.textContent = 'Encerrando…'
      try {
        var r = await _repo().approve(id, reason)
        if (!r || !r.ok) throw new Error(r && r.error || 'falha')
        _state.lastLetter = r.letter
        _emit('b2b:partnership-closed', { id: id })
        _emit('b2b:partnership-saved', { id: id })
        await _load()
      } catch (err) {
        alert('Erro: ' + err.message)
        btn.disabled = false; btn.textContent = 'Encerrar'
      }
    }
  }

  async function _load() {
    _state.loading = true
    _state.error = null
    _renderBody()
    try {
      _state.pending = (await _repo().listPending()) || []
    } catch (e) {
      _state.error = e.message || String(e)
      _state.pending = []
    } finally {
      _state.loading = false
      _renderBody()
    }
  }

  document.addEventListener('b2b:tab-change', function (e) {
    if (e.detail && e.detail.tab === 'closure') _load()
  })

  document.addEventListener('b2b:partnership-saved', function () {
    var cur = window.B2BShell && window.B2BShell.getActiveTab()
    if (cur === 'closure') _load()
  })

  window.B2BClosure = Object.freeze({ reload: _load })
})()
