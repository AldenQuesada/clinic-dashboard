/**
 * ClinicAI — B2B Vouchers UI
 *
 * Overlay modal pra gerenciar vouchers de UMA parceria.
 * Consome B2BVouchersRepository. Zero conhecimento de outros módulos.
 *
 * Eventos ouvidos:
 *   'b2b:open-vouchers'  { partnershipId, partnershipName }
 *
 * Eventos emitidos:
 *   'b2b:voucher-issued'  { id, token }
 *   'b2b:voucher-updated' { id }
 *
 * Expõe window.B2BVouchers.
 */
;(function () {
  'use strict'
  if (window.B2BVouchers) return

  var _state = {
    partnershipId: null,
    partnershipName: null,
    vouchers: [],
    funnel: null,
    loading: false,
    error: null,
    showForm: false,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _repo() { return window.B2BVouchersRepository }

  function _voucherUrl(token) {
    var base = (window.ClinicEnv && window.ClinicEnv.DASHBOARD_URL) || window.location.origin
    return base.replace(/\/+$/, '') + '/voucher.html?t=' + encodeURIComponent(token)
  }

  function _statusColor(s) {
    return ({ issued: '#9CA3AF', delivered: '#3B82F6', opened: '#F59E0B',
              redeemed: '#10B981', expired: '#6B7280', cancelled: '#EF4444' })[s] || '#9CA3AF'
  }

  function _statusLabel(s) {
    return ({ issued: 'Emitido', delivered: 'Entregue', opened: 'Aberto',
              redeemed: 'Resgatado', expired: 'Expirado', cancelled: 'Cancelado' })[s] || s
  }

  function _fmtDate(iso) {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString('pt-BR') } catch (_) { return iso }
  }

  function _renderFunnel() {
    var f = _state.funnel || {}
    var steps = [
      { key: 'issued',    label: 'Emitidos',   color: '#9CA3AF' },
      { key: 'delivered', label: 'Entregues',  color: '#3B82F6' },
      { key: 'opened',    label: 'Abertos',    color: '#F59E0B' },
      { key: 'redeemed',  label: 'Resgatados', color: '#10B981' },
    ]
    return '<div class="b2b-voucher-funnel">' +
      steps.map(function (s) {
        return '<div class="b2b-funnel-step">' +
          '<div class="b2b-funnel-val" style="color:' + s.color + '">' + (f[s.key] || 0) + '</div>' +
          '<div class="b2b-funnel-lbl">' + s.label + '</div>' +
        '</div>'
      }).join('') +
      ((f.expired || f.cancelled) ? '<div class="b2b-funnel-note">Expirados: ' + (f.expired || 0) + ' · Cancelados: ' + (f.cancelled || 0) + '</div>' : '') +
    '</div>'
  }

  function _renderForm() {
    if (!_state.showForm) return '<button type="button" class="b2b-btn b2b-btn-primary" data-voucher-new>+ Emitir voucher</button>'
    return '<form class="b2b-voucher-form" id="b2bVoucherNewForm">' +
      '<div class="b2b-grid-2">' +
        '<label class="b2b-field"><span class="b2b-field-lbl">Nome do destinatário</span>' +
          '<input name="recipient_name" class="b2b-input" required></label>' +
        '<label class="b2b-field"><span class="b2b-field-lbl">WhatsApp (opcional)</span>' +
          '<input name="recipient_phone" class="b2b-input" placeholder="+55 44 9..."></label>' +
      '</div>' +
      '<div class="b2b-grid-2">' +
        '<label class="b2b-field"><span class="b2b-field-lbl">CPF (opcional)</span>' +
          '<input name="recipient_cpf" class="b2b-input"></label>' +
        '<label class="b2b-field"><span class="b2b-field-lbl">Combo (padrão da parceria se vazio)</span>' +
          '<input name="combo" class="b2b-input" placeholder="veu_noiva+anovator"></label>' +
      '</div>' +
      '<label class="b2b-field"><span class="b2b-field-lbl">Observações</span>' +
        '<textarea name="notes" rows="2" class="b2b-input"></textarea></label>' +
      '<div class="b2b-form-actions">' +
        '<button type="button" class="b2b-btn" data-voucher-cancel>Cancelar</button>' +
        '<button type="submit" class="b2b-btn b2b-btn-primary">Emitir</button>' +
      '</div>' +
    '</form>'
  }

  function _renderVoucherRow(v) {
    var url = _voucherUrl(v.token)
    return '<div class="b2b-voucher-row">' +
      '<div class="b2b-voucher-status" style="background:' + _statusColor(v.status) + '" title="' + _statusLabel(v.status) + '"></div>' +
      '<div class="b2b-voucher-info">' +
        '<div class="b2b-voucher-top">' +
          '<strong>' + _esc(v.recipient_name || '(sem nome)') + '</strong>' +
          '<span class="b2b-pill">' + _esc(_statusLabel(v.status)) + '</span>' +
          '<code class="b2b-voucher-token">#' + _esc(v.token) + '</code>' +
        '</div>' +
        '<div class="b2b-voucher-meta">' +
          '<span>Combo: ' + _esc(v.combo) + '</span>' +
          '<span>Válido até ' + _fmtDate(v.valid_until) + '</span>' +
          (v.recipient_phone ? '<span>' + _esc(v.recipient_phone) + '</span>' : '') +
        '</div>' +
        '<div class="b2b-voucher-url"><a href="' + url + '" target="_blank" rel="noopener">' + url + '</a></div>' +
      '</div>' +
      '<div class="b2b-voucher-acts">' +
        (['issued','delivered','opened'].indexOf(v.status) !== -1
          ? '<button class="b2b-btn" data-voucher-action="copy" data-url="' + _esc(url) + '">Copiar link</button>'
          : '') +
        (v.status === 'issued'
          ? '<button class="b2b-btn" data-voucher-action="mark-delivered" data-id="' + v.id + '">Marcar entregue</button>'
          : '') +
        (['issued','delivered','opened'].indexOf(v.status) !== -1
          ? '<button class="b2b-btn" data-voucher-action="cancel" data-id="' + v.id + '">Cancelar</button>'
          : '') +
      '</div>' +
    '</div>'
  }

  function _renderBody() {
    if (_state.loading) return '<div class="b2b-empty">Carregando…</div>'
    if (_state.error)   return '<div class="b2b-empty b2b-empty-err">' + _esc(_state.error) + '</div>'
    return _renderFunnel() +
      '<div class="b2b-voucher-actions-top">' + _renderForm() + '</div>' +
      (_state.vouchers.length
        ? '<div class="b2b-voucher-list">' + _state.vouchers.map(_renderVoucherRow).join('') + '</div>'
        : '<div class="b2b-empty">Nenhum voucher emitido ainda pra essa parceria.</div>')
  }

  function _renderOverlay() {
    return '<div class="b2b-overlay" data-voucher-overlay>' +
      '<div class="b2b-modal b2b-modal-wide">' +
        '<header class="b2b-modal-hdr">' +
          '<h2>Vouchers · ' + _esc(_state.partnershipName || '') + '</h2>' +
          '<button type="button" class="b2b-close" data-voucher-close aria-label="Fechar">&times;</button>' +
        '</header>' +
        '<div class="b2b-modal-body">' + _renderBody() + '</div>' +
      '</div>' +
    '</div>'
  }

  // ─── Actions ────────────────────────────────────────────────
  async function _onAction(e) {
    var btn = e.target.closest('[data-voucher-action]')
    if (!btn) return
    var act = btn.getAttribute('data-voucher-action')

    if (act === 'copy') {
      var url = btn.getAttribute('data-url')
      try {
        await navigator.clipboard.writeText(url)
        btn.textContent = 'Copiado!'
        window.B2BToast && window.B2BToast.success('Link copiado')
        setTimeout(function () { btn.textContent = 'Copiar link' }, 1500)
      } catch (_) {
        window.B2BToast && window.B2BToast.info(url, { title: 'Copie manualmente', duration: 8000 })
      }
      return
    }

    if (act === 'mark-delivered') {
      try {
        await _repo().markDelivered(btn.getAttribute('data-id'))
        document.dispatchEvent(new CustomEvent('b2b:voucher-updated', { detail: { id: btn.getAttribute('data-id') } }))
        window.B2BToast && window.B2BToast.success('Marcado como entregue')
        await _load()
      } catch (err) {
        window.B2BToast && window.B2BToast.error('Falha: ' + err.message)
      }
      return
    }

    if (act === 'cancel') {
      var reason = window.B2BToast
        ? await window.B2BToast.prompt('Motivo do cancelamento (opcional):', '',
            { title: 'Cancelar voucher', okLabel: 'Cancelar voucher' })
        : (prompt('Motivo do cancelamento (opcional):') || null)
      if (reason === null) return
      try {
        await _repo().cancel(btn.getAttribute('data-id'), reason || null)
        document.dispatchEvent(new CustomEvent('b2b:voucher-updated', { detail: { id: btn.getAttribute('data-id') } }))
        window.B2BToast && window.B2BToast.success('Voucher cancelado')
        await _load()
      } catch (err) {
        window.B2BToast && window.B2BToast.error('Falha: ' + err.message)
      }
    }
  }

  async function _onSubmitNew(e) {
    e.preventDefault()
    var fd = new FormData(e.target)
    var payload = { partnership_id: _state.partnershipId }
    fd.forEach(function (v, k) { if (v != null && String(v).trim() !== '') payload[k] = v })

    try {
      var r = await _repo().issue(payload)
      if (!r || !r.ok) throw new Error('falha')
      _state.showForm = false
      document.dispatchEvent(new CustomEvent('b2b:voucher-issued', { detail: r }))
      window.B2BToast && window.B2BToast.success('Voucher emitido · #' + (r.token || r.id))
      await _load()
    } catch (err) {
      window.B2BToast && window.B2BToast.error('Falha ao emitir: ' + (err.message || err))
    }
  }

  function _bind(host) {
    host.querySelectorAll('[data-voucher-close]').forEach(function (el) {
      el.addEventListener('click', _close)
    })
    var ov = host.querySelector('[data-voucher-overlay]')
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) _close() })

    var newBtn = host.querySelector('[data-voucher-new]')
    if (newBtn) newBtn.addEventListener('click', function () { _state.showForm = true; _mount() })

    var cancelBtn = host.querySelector('[data-voucher-cancel]')
    if (cancelBtn) cancelBtn.addEventListener('click', function () { _state.showForm = false; _mount() })

    var form = host.querySelector('#b2bVoucherNewForm')
    if (form) form.addEventListener('submit', _onSubmitNew)

    host.addEventListener('click', _onAction)
  }

  function _mount() {
    var host = document.getElementById('b2bVouchersOverlayHost')
    if (!host) {
      host = document.createElement('div')
      host.id = 'b2bVouchersOverlayHost'
      document.body.appendChild(host)
    }
    host.innerHTML = _renderOverlay()
    _bind(host)
  }

  function _close() {
    var host = document.getElementById('b2bVouchersOverlayHost')
    if (host) host.innerHTML = ''
    _state.partnershipId = null
  }

  async function _load() {
    if (!_state.partnershipId) return
    _state.loading = true
    _state.error = null
    _mount()
    try {
      var results = await Promise.all([
        _repo().listByPartnership(_state.partnershipId),
        _repo().funnel(_state.partnershipId),
      ])
      _state.vouchers = results[0] || []
      _state.funnel   = results[1] || null
    } catch (e) {
      _state.error = e.message || String(e)
    } finally {
      _state.loading = false
      _mount()
    }
  }

  function open(partnershipId, partnershipName) {
    _state.partnershipId = partnershipId
    _state.partnershipName = partnershipName || ''
    _state.showForm = false
    _load()
  }

  // ─── Bind global ────────────────────────────────────────────
  document.addEventListener('b2b:open-vouchers', function (e) {
    var d = e.detail || {}
    if (d.partnershipId) open(d.partnershipId, d.partnershipName)
  })

  window.B2BVouchers = Object.freeze({ open: open, close: _close })
})()
