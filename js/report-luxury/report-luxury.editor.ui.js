/**
 * ClinicAI - Report Luxury Editor UI
 *
 * Pagina admin para editar todos os textos do report luxury.
 * Renderiza em #report-editor-root.
 *
 * Layout:
 *   - 10 abas (uma por grupo definido em ReportLuxuryTemplatesDefaults.GROUPS)
 *   - Cada aba lista todos os campos do grupo (label + textarea/input)
 *   - Botao "Resetar para padrao" por campo
 *   - Botao "Salvar tudo" por aba (ou autossave on blur)
 *
 * Estilo: brandbook (Champagne + Cormorant + Montserrat).
 */
;(function () {
  'use strict'
  if (window._reportLuxuryEditorLoaded) return
  window._reportLuxuryEditorLoaded = true

  var GOLD = '#C8A97E'
  var GOLD_DARK = '#A8895E'
  var IVORY = '#F5F0E8'
  var GRAPHITE = '#2C2C2C'
  var GRAPHITE_LIGHT = '#4A4A4A'
  var BEGE = '#E8DDD0'
  var WHITE = '#FEFCF8'

  var _state = { activeGroup: null, dirty: {}, loading: false }

  function _esc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) { return ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c] }) }
  function _toast(m, t) { if (window.toast) return window.toast(m, t || 'info'); if (window.showToast) return window.showToast(m, t || 'info') }

  function _defaults() { return window.ReportLuxuryTemplatesDefaults }
  function _service()  { return window.ReportLuxuryTemplates }

  function _load() {
    if (!_service() || !_defaults()) return
    _state.loading = true
    _state.activeGroup = _defaults().GROUPS[0].id
    _render()
    _service().load().then(function () {
      _state.loading = false
      _render()
    })
  }

  function _render() {
    var root = document.getElementById('report-editor-root')
    if (!root) return
    var d = _defaults()
    if (!d) {
      root.innerHTML = '<div style="padding:40px;text-align:center">Carregando templates...</div>'
      return
    }

    root.innerHTML = '<div style="font-family:Montserrat,sans-serif;color:' + GRAPHITE + '">' +
      _headerHtml() +
      '<div style="display:grid;grid-template-columns:240px 1fr;gap:0;min-height:calc(100vh - 180px)">' +
        _sidebarHtml() +
        _contentHtml() +
      '</div>' +
    '</div>'

    _bind()
  }

  function _headerHtml() {
    return '<div style="padding:24px 32px;background:' + WHITE + ';border-bottom:1px solid ' + BEGE + ';display:flex;justify-content:space-between;align-items:flex-end">' +
      '<div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-weight:300;font-size:32px;color:' + GRAPHITE + ';line-height:1.1">Editor do <em style="color:' + GOLD_DARK + '">report luxury</em></div>' +
        '<div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:' + GRAPHITE_LIGHT + ';margin-top:6px">Edite qualquer texto que aparece no plano de harmonia</div>' +
      '</div>' +
      '<button id="rleSaveAll" style="padding:14px 28px;background:' + GRAPHITE + ';color:' + IVORY + ';border:none;font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;cursor:pointer;font-family:Montserrat,sans-serif">Salvar alterações</button>' +
    '</div>'
  }

  function _sidebarHtml() {
    var d = _defaults()
    return '<div style="background:' + IVORY + ';border-right:1px solid ' + BEGE + ';padding:20px 0">' +
      d.GROUPS.map(function (g) {
        var active = _state.activeGroup === g.id
        var style = 'display:block;width:100%;text-align:left;padding:14px 24px;background:' + (active ? WHITE : 'transparent') +
          ';border:none;border-left:3px solid ' + (active ? GOLD : 'transparent') +
          ';font-family:Montserrat,sans-serif;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:' + (active ? GRAPHITE : GRAPHITE_LIGHT) +
          ';font-weight:' + (active ? '600' : '400') + ';cursor:pointer'
        return '<button data-group="' + g.id + '" style="' + style + '">' + _esc(g.label) + '</button>'
      }).join('') +
    '</div>'
  }

  function _contentHtml() {
    var d = _defaults()
    var entries = d.ENTRIES.filter(function (e) { return e.group === _state.activeGroup })
    var groupLabel = (d.GROUPS.find(function (g) { return g.id === _state.activeGroup }) || {}).label || ''

    return '<div style="padding:32px 40px;background:' + WHITE + ';max-width:760px">' +
      '<div style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-weight:300;font-size:28px;color:' + GRAPHITE + ';margin-bottom:8px">' + _esc(groupLabel) + '</div>' +
      '<div style="font-size:11px;color:' + GRAPHITE_LIGHT + ';margin-bottom:32px;line-height:1.6">' +
        'Use <code style="font-family:monospace;color:' + GOLD_DARK + '">&lt;em&gt;palavra&lt;/em&gt;</code> para destacar em itálico champagne. ' +
        'Use <code style="font-family:monospace;color:' + GOLD_DARK + '">&lt;strong&gt;</code> para negrito. ' +
        'Linhas em branco viram parágrafos.' +
      '</div>' +
      entries.map(_entryHtml).join('') +
    '</div>'
  }

  function _entryHtml(e) {
    var svc = _service()
    var current = svc ? svc.get(e.key) : e.default
    var isOverridden = svc && svc.getRaw(e.key) != null
    var dirtyFlag = _state.dirty[e.key] !== undefined
    var displayValue = dirtyFlag ? _state.dirty[e.key] : current

    var inputHtml
    if (e.multiline) {
      inputHtml = '<textarea data-key="' + e.key + '" rows="4" style="width:100%;padding:14px 16px;background:' + IVORY + ';border:1px solid ' + (dirtyFlag ? GOLD : BEGE) + ';font-family:\'Cormorant Garamond\',serif;font-size:15px;color:' + GRAPHITE + ';line-height:1.6;resize:vertical">' + _esc(displayValue) + '</textarea>'
    } else {
      inputHtml = '<input data-key="' + e.key + '" type="text" value="' + _esc(displayValue) + '" style="width:100%;padding:12px 16px;background:' + IVORY + ';border:1px solid ' + (dirtyFlag ? GOLD : BEGE) + ';font-family:\'Cormorant Garamond\',serif;font-size:15px;color:' + GRAPHITE + '">'
    }

    return '<div style="margin-bottom:24px">' +
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:8px">' +
        '<label style="font-size:10px;letter-spacing:0.15em;text-transform:uppercase;color:' + GOLD_DARK + ';font-weight:500">' + _esc(e.label) + '</label>' +
        '<div style="display:flex;gap:8px;align-items:center">' +
          (dirtyFlag ? '<span style="font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:' + GOLD + ';font-weight:600">Não salvo</span>' :
            (isOverridden ? '<span style="font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:' + GRAPHITE_LIGHT + '">Personalizado</span>' : '')) +
          (isOverridden || dirtyFlag ? '<button data-reset="' + e.key + '" style="padding:4px 10px;background:transparent;border:1px solid ' + BEGE + ';font-size:9px;letter-spacing:0.1em;text-transform:uppercase;color:' + GRAPHITE_LIGHT + ';cursor:pointer;font-family:Montserrat,sans-serif">Resetar</button>' : '') +
        '</div>' +
      '</div>' +
      inputHtml +
      '<div style="font-size:9px;font-family:monospace;color:' + GRAPHITE_LIGHT + ';opacity:0.5;margin-top:4px">' + _esc(e.key) + '</div>' +
    '</div>'
  }

  function _bind() {
    var root = document.getElementById('report-editor-root')
    if (!root) return

    root.querySelectorAll('[data-group]').forEach(function (b) {
      b.addEventListener('click', function () {
        _state.activeGroup = b.getAttribute('data-group')
        _render()
      })
    })

    root.querySelectorAll('[data-key]').forEach(function (el) {
      el.addEventListener('input', function () {
        var key = el.getAttribute('data-key')
        var val = el.value
        var d = _defaults()
        var defaultVal = d.getDefault(key)
        var current = _service().getRaw(key)
        // Se voltou ao default, remove dirty
        if (val === current || (current == null && val === defaultVal)) {
          delete _state.dirty[key]
        } else {
          _state.dirty[key] = val
        }
      })
    })

    root.querySelectorAll('[data-reset]').forEach(function (b) {
      b.addEventListener('click', function () {
        var key = b.getAttribute('data-reset')
        if (!confirm('Resetar este campo para o texto padrão?')) return
        delete _state.dirty[key]
        _service().reset(key).then(function () {
          _toast('Campo resetado', 'success')
          _render()
        }).catch(function (e) { _toast('Falha: ' + (e.message || ''), 'error') })
      })
    })

    var saveBtn = root.querySelector('#rleSaveAll')
    if (saveBtn) saveBtn.addEventListener('click', _saveAll)
  }

  function _saveAll() {
    var keys = Object.keys(_state.dirty)
    if (!keys.length) { _toast('Nenhuma alteração para salvar', 'info'); return }
    var svc = _service()
    if (!svc) { _toast('Serviço indisponível', 'error'); return }

    Promise.all(keys.map(function (k) {
      return svc.set(k, _state.dirty[k])
    })).then(function () {
      _state.dirty = {}
      _toast(keys.length + ' alteração(ões) salva(s)', 'success')
      _render()
    }).catch(function (e) {
      _toast('Falha ao salvar: ' + (e.message || ''), 'error')
    })
  }

  window.ReportLuxuryEditor = { init: _load }

  document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('clinicai:page-change', function (e) {
      if (e.detail === 'report-editor') _load()
    })
    var t = setInterval(function () {
      var page = document.getElementById('page-report-editor')
      if (page && page.style.display !== 'none' && page.offsetParent !== null) {
        clearInterval(t); _load()
      }
    }, 500)
    setTimeout(function () { clearInterval(t) }, 30000)
  })
})()
