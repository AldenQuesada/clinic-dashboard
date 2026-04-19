/**
 * ClinicAI — B2B Senders UI
 *
 * Modal de gerenciamento de telefones autorizados a emitir voucher pela Mira
 * (whitelist da parceria). Cadastra, lista, ativa/desativa, remove.
 *
 * Eventos ouvidos: 'b2b:open-senders' { partnership_id, partnership_name }
 * Expõe window.B2BSenders
 */
;(function () {
  'use strict'
  if (window.B2BSenders) return

  var _state = {
    open: false,
    partnership_id: null,
    partnership_name: '',
    senders: [],
    loading: false,
    error: null,
    adding: false,
    addError: null,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _repo() { return window.B2BSendersRepository }
  function _toast() { return window.B2BToast }

  function _fmtPhone(p) {
    var d = String(p || '').replace(/\D/g, '')
    if (d.length >= 12) return '+' + d.slice(0,2) + ' ' + d.slice(2,4) + ' ' + d.slice(4,-4) + '-' + d.slice(-4)
    if (d.length === 11) return '(' + d.slice(0,2) + ') ' + d.slice(2,7) + '-' + d.slice(7)
    if (d.length === 10) return '(' + d.slice(0,2) + ') ' + d.slice(2,6) + '-' + d.slice(6)
    return p
  }
  function _fmtDate(iso) {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString('pt-BR') } catch (_) { return '—' }
  }

  function _renderRow(s) {
    return '<div class="b2b-sender-row' + (s.active ? '' : ' b2b-sender-inactive') + '">' +
      '<div class="b2b-sender-info">' +
        '<strong>' + _esc(_fmtPhone(s.phone)) + '</strong>' +
        '<span class="b2b-sender-role">' + _esc(s.role === 'owner' ? 'dona' : 'operador') + '</span>' +
        (!s.active ? '<span class="b2b-sender-badge b2b-sender-off">desativado</span>' : '') +
        '<span class="b2b-sender-date">desde ' + _esc(_fmtDate(s.created_at)) + '</span>' +
      '</div>' +
      '<div class="b2b-sender-acts">' +
        (s.active
          ? '<button type="button" class="b2b-btn" data-sender-toggle data-id="' + _esc(s.id) + '" data-active="true">Desativar</button>'
          : '<button type="button" class="b2b-btn" data-sender-toggle data-id="' + _esc(s.id) + '" data-active="false">Reativar</button>') +
        '<button type="button" class="b2b-btn b2b-btn-danger" data-sender-remove data-id="' + _esc(s.id) + '">Remover</button>' +
      '</div>' +
    '</div>'
  }

  function _renderBody() {
    var inner
    if (_state.loading) {
      inner = '<div class="b2b-empty">Carregando…</div>'
    } else if (_state.error) {
      inner = '<div class="b2b-empty b2b-empty-err">' + _esc(_state.error) + '</div>'
    } else {
      inner =
        '<div class="b2b-sender-add">' +
          '<div class="b2b-sender-add-hdr">Autorizar novo telefone</div>' +
          '<form id="b2bSenderAddForm" class="b2b-sender-add-form">' +
            '<div class="b2b-grid-2">' +
              '<label class="b2b-field"><span class="b2b-field-lbl">Telefone (WhatsApp)</span>' +
                '<input name="phone" class="b2b-input" placeholder="44 99999-1111" required></label>' +
              '<label class="b2b-field"><span class="b2b-field-lbl">Papel</span>' +
                '<select name="role" class="b2b-input">' +
                  '<option value="owner">Dona</option>' +
                  '<option value="operator">Operador</option>' +
                '</select></label>' +
            '</div>' +
            '<button type="submit" class="b2b-btn b2b-btn-primary" ' +
              (_state.adding ? 'disabled' : '') + '>' +
              (_state.adding ? 'Autorizando…' : '+ Autorizar') +
            '</button>' +
            (_state.addError ? '<div class="b2b-form-err">' + _esc(_state.addError) + '</div>' : '') +
          '</form>' +
        '</div>' +
        '<div class="b2b-sender-list">' +
          '<div class="b2b-sender-list-hdr">Autorizados (' + _state.senders.length + ')</div>' +
          (_state.senders.length
            ? _state.senders.map(_renderRow).join('')
            : '<div class="b2b-empty" style="padding:20px;font-style:italic">Nenhum telefone autorizado ainda. Adicione o primeiro acima.</div>') +
        '</div>'
    }

    return '<div class="b2b-overlay" data-senders-overlay>' +
      '<div class="b2b-modal">' +
        '<header class="b2b-modal-hdr">' +
          '<h2>WhatsApp autorizados · ' + _esc(_state.partnership_name || '') + '</h2>' +
          '<button type="button" class="b2b-close" data-senders-close aria-label="Fechar">&times;</button>' +
        '</header>' +
        '<div class="b2b-modal-body">' +
          '<p class="b2b-sender-hint">' +
            'Telefones aqui autorizam emitir voucher pela Mira (ex: manda ' +
            '“voucher pra Maria, 44 99999-1111” e a Mira emite). ' +
            'Cada pessoa da parceria que pode distribuir vouchers precisa estar aqui.' +
          '</p>' +
          inner +
        '</div>' +
      '</div>' +
    '</div>'
  }

  function _mount() {
    var host = document.getElementById('b2bSendersHost')
    if (!host) {
      host = document.createElement('div')
      host.id = 'b2bSendersHost'
      document.body.appendChild(host)
    }
    host.innerHTML = _state.open ? _renderBody() : ''
    if (_state.open) _bind(host)
  }

  function _bind(host) {
    host.querySelectorAll('[data-senders-close]').forEach(function (el) {
      el.addEventListener('click', _close)
    })
    var ov = host.querySelector('[data-senders-overlay]')
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) _close() })

    var form = host.querySelector('#b2bSenderAddForm')
    if (form) form.addEventListener('submit', _onAdd)

    host.querySelectorAll('[data-sender-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () { _onToggle(btn) })
    })
    host.querySelectorAll('[data-sender-remove]').forEach(function (btn) {
      btn.addEventListener('click', function () { _onRemove(btn) })
    })
  }

  async function _load() {
    _state.loading = true
    _state.error = null
    _mount()
    try {
      _state.senders = await _repo().list(_state.partnership_id)
    } catch (e) {
      _state.error = e.message || String(e)
    } finally {
      _state.loading = false
      _mount()
    }
  }

  async function _onAdd(e) {
    e.preventDefault()
    var fd = new FormData(e.target)
    _state.adding = true
    _state.addError = null
    _mount()
    try {
      await _repo().create({
        partnership_id: _state.partnership_id,
        phone: fd.get('phone'),
        role: fd.get('role') || 'owner',
      })
      _toast() && _toast().success('Telefone autorizado')
      await _load()
    } catch (err) {
      _state.addError = err.message || String(err)
    } finally {
      _state.adding = false
      _mount()
    }
  }

  async function _onToggle(btn) {
    var id = btn.getAttribute('data-id')
    var wasActive = btn.getAttribute('data-active') === 'true'
    try {
      await _repo().toggleActive(id, !wasActive)
      _toast() && _toast().success(wasActive ? 'Desativado' : 'Reativado')
      await _load()
    } catch (err) {
      _toast() && _toast().error('Falha: ' + (err.message || err))
    }
  }

  async function _onRemove(btn) {
    if (!_toast()) return
    var ok = await _toast().confirm(
      'Remover esse telefone da whitelist?',
      'A pessoa não conseguirá mais emitir voucher pela Mira.',
    )
    if (!ok) return
    var id = btn.getAttribute('data-id')
    try {
      await _repo().remove(id)
      _toast() && _toast().success('Telefone removido')
      await _load()
    } catch (err) {
      _toast() && _toast().error('Falha: ' + (err.message || err))
    }
  }

  function open(partnershipId, partnershipName) {
    _state.open = true
    _state.partnership_id = partnershipId
    _state.partnership_name = partnershipName || ''
    _load()
  }

  function _close() {
    _state.open = false
    _state.partnership_id = null
    _state.partnership_name = ''
    _state.senders = []
    _state.addError = null
    _mount()
  }

  document.addEventListener('b2b:open-senders', function (e) {
    var d = (e && e.detail) || {}
    open(d.partnership_id, d.partnership_name)
  })

  window.B2BSenders = Object.freeze({ open: open, close: _close })
})()
