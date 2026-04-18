/**
 * ClinicAI — Staff Alert Phone Config (s1-3 plano growth)
 *
 * Consome:
 *   RPC vpi_staff_alert_config()                          — leitura
 *   RPC vpi_staff_alert_config_update(p_phone, p_enabled) — escrita
 *
 * Renderizado em page-growth-partners via vpi-dashboard.ui.js.
 * Expõe window.renderStaffAlertConfig(containerId).
 *
 * Alerta dispara quando parceira bate tier high_performance.
 * Sem telefone configurado, alerta é dropado silenciosamente.
 */
;(function () {
  'use strict'
  if (window._vpiStaffAlertUILoaded) return
  window._vpiStaffAlertUILoaded = true

  var _state = {
    phone:   '',
    enabled: true,
    loading: false,
    saving:  false,
    error:   null,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _sb() { return window._sbShared || null }
  function _toast(m, t) {
    if (window.toast)     return window.toast(m, t || 'info')
    if (window.showToast) return window.showToast(m, t || 'info')
  }

  function _formatPhone(digits) {
    var d = String(digits || '').replace(/\D/g, '')
    if (!d) return ''
    if (d.length <= 2)  return '(' + d
    if (d.length <= 7)  return '(' + d.slice(0, 2) + ') ' + d.slice(2)
    if (d.length <= 11) return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7)
    return '(' + d.slice(0, 2) + ') ' + d.slice(2, 7) + '-' + d.slice(7, 11)
  }

  async function _load() {
    var sb = _sb()
    if (!sb) { _state.error = 'Supabase indisponível'; return }
    _state.loading = true
    try {
      var r = await sb.rpc('vpi_staff_alert_config')
      if (r.error) throw r.error
      var data = r.data || {}
      _state.phone   = data.phone   || ''
      _state.enabled = data.enabled !== false
    } catch (e) {
      _state.error = e.message || String(e)
    } finally {
      _state.loading = false
    }
  }

  async function _save(phone, enabled) {
    var sb = _sb()
    if (!sb) { _toast('Supabase indisponível', 'error'); return }
    _state.saving = true
    _render()
    try {
      var r = await sb.rpc('vpi_staff_alert_config_update', {
        p_phone:   phone,
        p_enabled: enabled,
      })
      if (r.error) throw r.error
      var data = r.data || {}
      if (!data.ok) {
        var reason = data.reason === 'invalid_phone' ? 'Telefone inválido (mínimo 8 dígitos)'
                   : data.reason === 'clinics_table_missing' ? 'Tabela clinics ausente'
                   : ('Falha: ' + (data.reason || 'desconhecida'))
        _toast(reason, 'error')
      } else {
        _toast('Configuração salva', 'success')
        var cfg = data.config || {}
        _state.phone   = cfg.phone   || ''
        _state.enabled = cfg.enabled !== false
      }
    } catch (e) {
      _toast('Erro: ' + (e.message || e), 'error')
    } finally {
      _state.saving = false
      _render()
    }
  }

  var _containerId = null

  function _render() {
    if (!_containerId) return
    var c = document.getElementById(_containerId)
    if (!c) return

    if (_state.loading) {
      c.innerHTML = '<div style="padding:20px;color:#9CA3AF;font-size:12px">Carregando configuração…</div>'
      return
    }

    if (_state.error) {
      c.innerHTML = '<div style="padding:20px;color:#DC2626;font-size:12px">' + _esc(_state.error) + '</div>'
      return
    }

    var statusLabel = _state.phone
      ? (_state.enabled ? '<span style="color:#059669;font-weight:600">Ativo</span>'
                        : '<span style="color:#9CA3AF;font-weight:600">Desativado</span>')
      : '<span style="color:#DC2626;font-weight:600">Sem telefone — alertas silenciados</span>'

    c.innerHTML =
      '<div style="background:#fff;border-radius:12px;border:1px solid #F3F4F6;padding:20px;margin-bottom:20px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">' +
          '<div style="font-size:13px;font-weight:700;color:#111">Alertas para a Equipe</div>' +
          '<div style="font-size:11px">' + statusLabel + '</div>' +
        '</div>' +
        '<div style="font-size:12px;color:#6B7280;margin-bottom:16px;line-height:1.5">' +
          'Telefone WhatsApp que recebe aviso quando parceira bate tier <strong>high_performance</strong> ' +
          '(Nível 1/2/3 do VPI). Sem telefone = alerta não é enviado.' +
        '</div>' +

        '<div style="display:flex;flex-wrap:wrap;gap:12px;align-items:flex-end">' +
          '<div style="flex:1;min-width:240px">' +
            '<label style="display:block;font-size:11px;color:#6B7280;margin-bottom:6px;font-weight:500">Telefone da secretaria / admin</label>' +
            '<input id="vpiStaffAlertPhoneInput" type="tel" value="' + _esc(_formatPhone(_state.phone)) + '" ' +
              'placeholder="(11) 91234-5678" ' +
              'style="width:100%;padding:10px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;box-sizing:border-box;font-family:inherit">' +
          '</div>' +

          '<div style="min-width:120px">' +
            '<label style="display:flex;align-items:center;gap:8px;font-size:12px;color:#374151;cursor:pointer;padding:10px 0">' +
              '<input id="vpiStaffAlertEnabledInput" type="checkbox" ' + (_state.enabled ? 'checked' : '') +
                ' style="width:16px;height:16px;cursor:pointer">' +
              '<span style="font-weight:500">Ativo</span>' +
            '</label>' +
          '</div>' +

          '<button id="vpiStaffAlertSaveBtn" ' +
            'style="padding:10px 20px;background:linear-gradient(135deg,#7C3AED,#6D28D9);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer;min-width:100px' +
              (_state.saving ? ';opacity:.6;pointer-events:none' : '') + '">' +
            (_state.saving ? 'Salvando…' : 'Salvar') +
          '</button>' +
        '</div>' +

        (_state.phone ? '<div style="margin-top:14px;padding:10px 14px;background:#F5F3FF;border-left:3px solid #7C3AED;border-radius:6px;font-size:11px;color:#4C1D95">' +
          'Template enviado: <code style="background:#fff;padding:1px 6px;border-radius:3px">wa_staff_alert_tier</code> ' +
          '(configurado em wa_agenda_automations)' +
        '</div>' : '') +
      '</div>'

    // Mascara telefone ao digitar
    var input = document.getElementById('vpiStaffAlertPhoneInput')
    if (input) {
      input.addEventListener('input', function (e) {
        var digits = e.target.value.replace(/\D/g, '').slice(0, 11)
        e.target.value = _formatPhone(digits)
      })
    }

    var btn = document.getElementById('vpiStaffAlertSaveBtn')
    if (btn) {
      btn.addEventListener('click', function () {
        var phone = (document.getElementById('vpiStaffAlertPhoneInput') || {}).value || ''
        var enabled = !!(document.getElementById('vpiStaffAlertEnabledInput') || {}).checked
        _save(phone, enabled)
      })
    }
  }

  async function renderStaffAlertConfig(containerId) {
    _containerId = containerId
    _render() // mostra loading
    await _load()
    _render()
  }

  window.renderStaffAlertConfig = renderStaffAlertConfig
})()
