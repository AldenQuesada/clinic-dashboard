/**
 * ClinicAI — B2B Detail UI
 *
 * Abre um overlay com a ficha completa da parceria + ações:
 *   - Editar (emite b2b:open-form com mode=edit)
 *   - Mudar status (máquina de estados via B2BService.transitionStatus)
 *
 * Consome: B2BRepository, B2BService
 * Eventos ouvidos: 'b2b:open-detail' { id }
 * Eventos emitidos: 'b2b:partnership-saved' (pós-transição status)
 *
 * Expõe window.B2BDetail.
 */
;(function () {
  'use strict'
  if (window.B2BDetail) return

  var _state = {
    loading: false,
    error: null,
    data: null,   // { partnership, targets, events, content }
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _repo() { return window.B2BRepository }
  function _svc()  { return window.B2BService    }
  function _arr(a) { return Array.isArray(a) && a.length ? a : [] }

  function _kv(label, value) {
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return ''
    var display = Array.isArray(value) ? value.join(', ') : String(value)
    return '<div class="b2b-kv"><span class="b2b-kv-lbl">' + _esc(label) + '</span>' +
      '<span class="b2b-kv-val">' + _esc(display) + '</span></div>'
  }

  function _fmtBRL(v) {
    if (v == null || v === '') return ''
    try { return Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 }) }
    catch (_) { return 'R$ ' + v }
  }

  function _dnaBar(partnership) {
    var e = Number(partnership.dna_excelencia || 0)
    var s = Number(partnership.dna_estetica || 0)
    var p = Number(partnership.dna_proposito || 0)
    var score = (e + s + p) / 3
    var color = score >= 7 ? '#10B981' : score >= 5 ? '#F59E0B' : '#EF4444'
    return '<div class="b2b-dna">' +
      '<div class="b2b-dna-hdr"><span>DNA</span><strong style="color:' + color + '">' + score.toFixed(1) + '/10</strong></div>' +
      '<div class="b2b-dna-row"><span>Excelência</span><div class="b2b-dna-bar"><div style="width:' + (e*10) + '%;background:' + color + '"></div></div><span>' + e + '</span></div>' +
      '<div class="b2b-dna-row"><span>Estética</span><div class="b2b-dna-bar"><div style="width:' + (s*10) + '%;background:' + color + '"></div></div><span>' + s + '</span></div>' +
      '<div class="b2b-dna-row"><span>Propósito</span><div class="b2b-dna-bar"><div style="width:' + (p*10) + '%;background:' + color + '"></div></div><span>' + p + '</span></div>' +
    '</div>'
  }

  function _statusOptions(current) {
    var svc = _svc()
    return svc.STATUSES.map(function (st) {
      var allowed = svc.canTransition(current, st)
      return '<option value="' + st + '"' + (!allowed && st !== current ? ' disabled' : '') +
        (st === current ? ' selected' : '') + '>' + st + '</option>'
    }).join('')
  }

  function _renderBody() {
    if (_state.loading) return '<div class="b2b-empty">Carregando…</div>'
    if (_state.error)   return '<div class="b2b-empty b2b-empty-err">' + _esc(_state.error) + '</div>'
    if (!_state.data)   return ''

    var d = _state.data
    var p = d.partnership

    return '<div class="b2b-detail">' +
      '<div class="b2b-detail-hdr">' +
        '<div>' +
          '<div class="b2b-eyebrow">' + _esc(p.pillar || '') + (p.category ? ' · ' + _esc(p.category) : '') + '</div>' +
          '<h2>' + _esc(p.name) + '</h2>' +
          '<div class="b2b-detail-meta">' +
            (p.tier ? '<span class="b2b-pill b2b-pill-tier">Tier ' + p.tier + '</span>' : '') +
            '<span class="b2b-pill b2b-pill-type">' + _esc(({ transactional:'Transacional', occasion:'Ocasião', institutional:'Institucional' })[p.type] || p.type) + '</span>' +
            '<span class="b2b-pill">' + _esc(p.status) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="b2b-detail-actions">' +
          '<button type="button" class="b2b-btn" data-action="vouchers" data-id="' + _esc(p.id) + '" data-name="' + _esc(p.name) + '">Vouchers</button>' +
          '<button type="button" class="b2b-btn" data-action="edit" data-id="' + _esc(p.id) + '">Editar</button>' +
          '<select class="b2b-input b2b-status-sel" data-action="status" data-id="' + _esc(p.id) + '" data-current="' + _esc(p.status) + '">' +
            _statusOptions(p.status) +
          '</select>' +
        '</div>' +
      '</div>' +

      _dnaBar(p) +

      '<div class="b2b-detail-cols">' +
        '<div class="b2b-detail-col">' +
          '<div class="b2b-sec-title">Contato</div>' +
          _kv('Responsável', p.contact_name) +
          _kv('Telefone',    p.contact_phone) +
          _kv('E-mail',      p.contact_email) +
          _kv('Instagram',   p.contact_instagram) +
          _kv('Site',        p.contact_website) +

          '<div class="b2b-sec-title">Voucher</div>' +
          _kv('Combo',         p.voucher_combo) +
          _kv('Validade',      (p.voucher_validity_days || '—') + ' dias') +
          _kv('Antecedência',  (p.voucher_min_notice_days || '—') + ' dias') +
          _kv('Cap mensal',    p.voucher_monthly_cap ? p.voucher_monthly_cap + ' un.' : '') +
          _kv('Entrega',       p.voucher_delivery) +

          '<div class="b2b-sec-title">Vigência</div>' +
          _kv('Teto mensal',        _fmtBRL(p.monthly_value_cap_brl)) +
          _kv('Duração (meses)',    p.contract_duration_months) +
          _kv('Revisão (meses)',    p.review_cadence_months) +
          _kv('Sazonais',           p.sazonais) +
        '</div>' +

        '<div class="b2b-detail-col">' +
          '<div class="b2b-sec-title">Narrativa</div>' +
          (_arr(p.slogans).length ?
            '<ul class="b2b-slogans">' +
              p.slogans.map(function (s) { return '<li>' + _esc(s) + '</li>' }).join('') +
            '</ul>' : '') +
          (p.narrative_quote ?
            '<blockquote class="b2b-quote">' + _esc(p.narrative_quote) +
            (p.narrative_author ? '<cite>— ' + _esc(p.narrative_author) + '</cite>' : '') +
            '</blockquote>' : '') +
          _kv('Gatilho emocional', p.emotional_trigger) +

          '<div class="b2b-sec-title">Contrapartida</div>' +
          _kv('O que o parceiro entrega', p.contrapartida) +
          _kv('Cadência',                  p.contrapartida_cadence) +

          '<div class="b2b-sec-title">Equipe envolvida</div>' +
          _kv('Profissionais', p.involved_professionals) +
        '</div>' +
      '</div>' +

      (_arr(d.targets).length ? _renderTargets(d.targets)   : '') +
      (_arr(d.events).length  ? _renderEvents(d.events)     : '') +
      (_arr(d.content).length ? _renderContent(d.content)   : '') +
    '</div>'
  }

  function _renderTargets(targets) {
    return '<div class="b2b-sec-title">Metas operacionais</div>' +
      '<table class="b2b-table"><thead><tr><th>Indicador</th><th>Meta</th><th>Cadência</th><th>Horizonte</th><th>Benefício</th></tr></thead><tbody>' +
      targets.map(function (t) {
        return '<tr><td>' + _esc(t.indicator) + '</td><td>' + _esc(t.target_value) + '</td>' +
          '<td>' + _esc(t.cadence) + '</td><td>' + (t.horizon_days || '—') + 'd</td>' +
          '<td>' + _esc(t.benefit_label || '') + '</td></tr>'
      }).join('') + '</tbody></table>'
  }

  function _renderEvents(events) {
    return '<div class="b2b-sec-title">Eventos</div>' +
      '<table class="b2b-table"><thead><tr><th>Tipo</th><th>Título</th><th>Cadência/data</th><th>Status</th></tr></thead><tbody>' +
      events.map(function (e) {
        return '<tr><td>' + _esc(e.event_type) + '</td><td>' + _esc(e.title) + '</td>' +
          '<td>' + _esc(e.date_or_cadence) + '</td><td>' + _esc(e.status) + '</td></tr>'
      }).join('') + '</tbody></table>'
  }

  function _renderContent(content) {
    var groups = {}
    content.forEach(function (c) { (groups[c.kind] = groups[c.kind] || []).push(c) })
    return '<div class="b2b-sec-title">Playbook de conteúdo</div>' +
      Object.keys(groups).map(function (k) {
        return '<div class="b2b-content-group"><div class="b2b-content-kind">' + _esc(k) + '</div>' +
          groups[k].map(function (c) { return '<div class="b2b-content-item">' + _esc(c.content) + '</div>' }).join('') +
        '</div>'
      }).join('')
  }

  function _renderOverlay() {
    return '<div class="b2b-overlay" data-detail-overlay>' +
      '<div class="b2b-modal b2b-modal-wide">' +
        '<header class="b2b-modal-hdr">' +
          '<h2>Detalhe da parceria</h2>' +
          '<button type="button" class="b2b-close" data-detail-close aria-label="Fechar">&times;</button>' +
        '</header>' +
        '<div class="b2b-modal-body">' + _renderBody() + '</div>' +
      '</div>' +
    '</div>'
  }

  // ─── Actions ────────────────────────────────────────────────
  async function _onStatusChange(ev) {
    var sel = ev.target
    var id = sel.getAttribute('data-id')
    var current = sel.getAttribute('data-current')
    var newStatus = sel.value
    if (newStatus === current) return

    var reason = prompt('Motivo da transição ' + current + ' → ' + newStatus + ' (opcional):') || null

    var partnership = _state.data && _state.data.partnership
    if (!partnership) return
    partnership.status = current  // passa o anterior pra service validar

    try {
      await _svc().transitionStatus(partnership, newStatus, reason)
      document.dispatchEvent(new CustomEvent('b2b:partnership-saved', { detail: { id: id } }))
      close()
    } catch (e) {
      alert('Falha: ' + (e.message || e))
      sel.value = current
    }
  }

  async function open(id) {
    _state.loading = true
    _state.error = null
    _state.data = null
    _mount()
    try {
      var r = await _repo().get(id)
      if (!r || !r.ok) throw new Error(r && r.error || 'não encontrado')
      _state.data = r
    } catch (e) {
      _state.error = e.message || String(e)
    } finally {
      _state.loading = false
      _mount()
    }
  }

  function close() {
    var host = document.getElementById('b2bDetailOverlayHost')
    if (host) host.innerHTML = ''
  }

  function _mount() {
    var host = document.getElementById('b2bDetailOverlayHost')
    if (!host) {
      host = document.createElement('div')
      host.id = 'b2bDetailOverlayHost'
      document.body.appendChild(host)
    }
    host.innerHTML = _renderOverlay()
    _bind(host)
  }

  function _bind(host) {
    host.querySelectorAll('[data-detail-close]').forEach(function (el) {
      el.addEventListener('click', close)
    })
    var ov = host.querySelector('[data-detail-overlay]')
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) close() })

    var editBtn = host.querySelector('[data-action="edit"]')
    if (editBtn) {
      editBtn.addEventListener('click', function () {
        var id = editBtn.getAttribute('data-id')
        close()
        document.dispatchEvent(new CustomEvent('b2b:open-form', { detail: { mode: 'edit', id: id } }))
      })
    }

    var vouchBtn = host.querySelector('[data-action="vouchers"]')
    if (vouchBtn) {
      vouchBtn.addEventListener('click', function () {
        var id   = vouchBtn.getAttribute('data-id')
        var name = vouchBtn.getAttribute('data-name')
        document.dispatchEvent(new CustomEvent('b2b:open-vouchers', { detail: { partnershipId: id, partnershipName: name } }))
      })
    }

    var statusSel = host.querySelector('[data-action="status"]')
    if (statusSel) statusSel.addEventListener('change', _onStatusChange)
  }

  // ─── Bind global ────────────────────────────────────────────
  document.addEventListener('b2b:open-detail', function (e) {
    var id = e.detail && e.detail.id
    if (id) open(id)
  })

  // ─── API pública ────────────────────────────────────────────
  window.B2BDetail = Object.freeze({ open: open, close: close })
})()
