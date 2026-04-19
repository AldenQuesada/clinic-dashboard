/**
 * LP Builder · Styles Panel (modal global de tokens)
 *
 * Modal grande com tabs:
 *   Cores · Tipografia · Espacamento · Borders · Reset
 *
 * Cada token responsivo tem 3 inputs (mobile/tablet/desktop).
 * Mudancas gravam em currentPage.tokens_override (jsonb).
 * Renderer (canvas + lp.html) ja aplica via CSS variables.
 *
 * window.LPBStylesPanel.open()
 */
;(function () {
  'use strict'
  if (window.LPBStylesPanel) return

  var _activeTab = 'colors'

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  function _getOverride(key) {
    var p = LPBuilder.getCurrentPage()
    var ov = p && p.tokens_override || {}
    return ov[key]
  }

  function _setOverride(key, value) {
    var patch = {}
    if (value === '' || value == null) {
      // remove override
      var p = LPBuilder.getCurrentPage()
      if (p && p.tokens_override && key in p.tokens_override) {
        delete p.tokens_override[key]
        // forca dirty + state-changed
        LPBuilder.setTokensOverride({})  // chama trigger sem adicionar nada novo
      }
      return
    }
    patch[key] = value
    LPBuilder.setTokensOverride(patch)
  }

  function _resetAll() {
    var p = LPBuilder.getCurrentPage()
    if (!p) return
    if (!confirm('Remover TODAS as alterações de tokens? A página volta ao design padrão.')) return
    p.tokens_override = {}
    LPBuilder.setTokensOverride({})
    LPBToast && LPBToast('Tokens resetados', 'success')
    _renderBody()
  }

  // ────────────────────────────────────────────────────────────
  // TAB: Cores
  // ────────────────────────────────────────────────────────────
  function _renderColorsTab() {
    var tokens = window.LPBTokens
    if (!tokens) return ''
    var colors = tokens.COLORS
    var html = '' +
      '<p style="font-size:11px;color:var(--lpb-text-3);margin-bottom:14px;line-height:1.6">' +
        'Cores compõem a identidade da marca. Mude com cuidado — afetam toda a página.' +
      '</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    Object.keys(colors).forEach(function (k) {
      var key = 'colors.' + k
      var cur = _getOverride(key) || colors[k]
      html += '' +
        '<div class="lpb-field">' +
          '<div class="lpb-field-label">' +
            '<span>' + _esc(k) + '</span>' +
            (_getOverride(key) ? '<button class="lpb-btn-icon" data-reset="' + _esc(key) + '" title="Reset">' + _ico('rotate-ccw', 11) + '</button>' : '') +
          '</div>' +
          '<div style="display:flex;gap:6px;align-items:center">' +
            '<input type="color" data-tk="' + _esc(key) + '" value="' + _esc(_normalizeColor(cur)) + '" ' +
              'style="width:36px;height:32px;border:1px solid var(--lpb-border);background:transparent;cursor:pointer">' +
            '<input type="text" class="lpb-input" data-tk-text="' + _esc(key) + '" value="' + _esc(cur) + '" style="flex:1">' +
          '</div>' +
        '</div>'
    })
    html += '</div>'
    return html
  }

  function _normalizeColor(c) {
    if (!c) return '#000000'
    if (c[0] === '#' && (c.length === 4 || c.length === 7)) return c
    // rgba/rgb fallback: nao usar no color picker
    return '#000000'
  }

  // ────────────────────────────────────────────────────────────
  // TAB: Tipografia
  // ────────────────────────────────────────────────────────────
  function _renderTypographyTab() {
    var tokens = window.LPBTokens
    if (!tokens) return ''
    var typo = tokens.TYPOGRAPHY
    var html = '' +
      '<p style="font-size:11px;color:var(--lpb-text-3);margin-bottom:14px;line-height:1.6">' +
        'Tipografia em <strong>3 tamanhos de tela</strong> (celular · tablet · desktop). ' +
        'Valores fora dos limites mostram aviso.' +
      '</p>'

    Object.keys(typo).forEach(function (key) {
      var spec = typo[key]
      if (!spec.size || typeof spec.size !== 'object') return
      html += '<div style="margin-bottom:18px;padding-bottom:18px;border-bottom:1px solid var(--lpb-border)">'
      html += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">'
      html += '<strong style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--lpb-text)">' + _esc(key) + '</strong>'
      html += '<small style="color:var(--lpb-text-3);font-size:10px">' + _esc(spec.family) + ' · weight ' + spec.weight + '</small>'
      html += '</div>'

      // 3 inputs (mobile/tablet/desktop)
      ;['mobile', 'tablet', 'desktop'].forEach(function (bp) {
        var tokenKey = 'typography.' + key + '.size.' + bp
        var def = spec.size[bp]
        var cur = _getOverride(tokenKey) || def
        var min = spec.min && spec.min[bp]
        var max = spec.max && spec.max[bp]
        var outOfRange = (typeof min === 'number' && cur < min) ||
                         (typeof max === 'number' && cur > max)
        html += '' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
            '<span style="width:60px;font-size:10px;color:var(--lpb-text-3);text-transform:uppercase;letter-spacing:.1em">' + bp + '</span>' +
            '<input type="number" class="lpb-input" style="width:80px;' + (outOfRange ? 'border-color:var(--lpb-warn)' : '') + '" ' +
              'data-tk-num="' + _esc(tokenKey) + '" value="' + _esc(cur) + '">' +
            '<small style="font-size:10px;color:var(--lpb-text-3)">px</small>' +
            (typeof min === 'number' ? '<small style="font-size:10px;color:var(--lpb-text-3);margin-left:auto">' + min + '–' + (max || '∞') + '</small>' : '') +
            (_getOverride(tokenKey) != null ? '<button class="lpb-btn-icon" data-reset="' + _esc(tokenKey) + '" title="Reset">' + _ico('rotate-ccw', 11) + '</button>' : '') +
          '</div>'
      })
      html += '</div>'
    })
    return html
  }

  // ────────────────────────────────────────────────────────────
  // TAB: Espacamento
  // ────────────────────────────────────────────────────────────
  function _renderSpacingTab() {
    var tokens = window.LPBTokens
    if (!tokens) return ''
    var spacing = tokens.SPACING
    var html = '' +
      '<p style="font-size:11px;color:var(--lpb-text-3);margin-bottom:14px;line-height:1.6">' +
        'Espaçamento em 3 tamanhos de tela. Valores em px (ou % onde indicado).' +
      '</p>'

    Object.keys(spacing).forEach(function (key) {
      var spec = spacing[key]
      html += '<div style="margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--lpb-border)">'
      html += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">'
      html += '<strong style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--lpb-text)">' + _esc(key) + '</strong>'
      if (spec.hint) html += '<small style="color:var(--lpb-text-3);font-size:10px;font-style:italic">' + _esc(spec.hint) + '</small>'
      html += '</div>'

      ;['mobile', 'tablet', 'desktop'].forEach(function (bp) {
        if (spec[bp] == null) return
        var tokenKey = 'spacing.' + key + '.' + bp
        var cur = _getOverride(tokenKey) != null ? _getOverride(tokenKey) : spec[bp]
        html += '' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">' +
            '<span style="width:60px;font-size:10px;color:var(--lpb-text-3);text-transform:uppercase;letter-spacing:.1em">' + bp + '</span>' +
            '<input type="number" class="lpb-input" style="width:80px" data-tk-num="' + _esc(tokenKey) + '" value="' + _esc(cur) + '">' +
            '<small style="font-size:10px;color:var(--lpb-text-3)">' + (spec.unit || 'px') + '</small>' +
            (_getOverride(tokenKey) != null ? '<button class="lpb-btn-icon" data-reset="' + _esc(tokenKey) + '" title="Reset" style="margin-left:auto">' + _ico('rotate-ccw', 11) + '</button>' : '') +
          '</div>'
      })
      html += '</div>'
    })
    return html
  }

  // ────────────────────────────────────────────────────────────
  // TAB: Borders / Misc
  // ────────────────────────────────────────────────────────────
  function _renderBordersTab() {
    var tokens = window.LPBTokens
    if (!tokens) return ''
    var b = tokens.BORDERS
    var html = '' +
      '<p style="font-size:11px;color:var(--lpb-text-3);margin-bottom:14px;line-height:1.6">' +
        'Bordas, raios e espessuras. Estética padrão da clínica é angular (raio 0-2px).' +
      '</p>' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
    Object.keys(b).forEach(function (k) {
      var key = 'borders.' + k
      var cur = _getOverride(key) != null ? _getOverride(key) : b[k]
      html += '' +
        '<div class="lpb-field">' +
          '<div class="lpb-field-label">' +
            '<span>' + _esc(k) + '</span>' +
            (_getOverride(key) != null ? '<button class="lpb-btn-icon" data-reset="' + _esc(key) + '">' + _ico('rotate-ccw', 11) + '</button>' : '') +
          '</div>' +
          '<input type="number" class="lpb-input" data-tk-num="' + _esc(key) + '" value="' + _esc(cur) + '">' +
        '</div>'
    })
    html += '</div>'
    return html
  }

  // ────────────────────────────────────────────────────────────
  // Modal shell
  // ────────────────────────────────────────────────────────────
  function open() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbStylesBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:680px;max-height:88vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Estilos da página</h3>' +
            '<button class="lpb-btn-icon" id="lpbStylesClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div style="display:flex;border-bottom:1px solid var(--lpb-border);padding:0 12px">' +
            _tabBtn('colors',     'Cores',       'droplet') +
            _tabBtn('typography', 'Tipografia',  'type') +
            _tabBtn('spacing',    'Espaçamento', 'maximize-2') +
            _tabBtn('borders',    'Bordas',      'square') +
          '</div>' +
          '<div class="lpb-modal-body" id="lpbStylesBody" style="flex:1;overflow:auto"></div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn danger" id="lpbStylesReset">Restaurar padrão</button>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn primary" id="lpbStylesDone">Pronto</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg    = document.getElementById('lpbStylesBg')
    var close = document.getElementById('lpbStylesClose')
    var done  = document.getElementById('lpbStylesDone')
    var reset = document.getElementById('lpbStylesReset')

    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
    done.onclick = dismiss
    reset.onclick = _resetAll

    _renderBody()
    _attachTabs()
  }

  function _tabBtn(id, label, icon) {
    var active = id === _activeTab
    return '<button class="lpb-tab-btn' + (active ? ' is-active' : '') + '" data-tab="' + id + '" ' +
      'style="background:transparent;border:0;color:' + (active ? 'var(--lpb-accent)' : 'var(--lpb-text-2)') + ';' +
      'padding:12px 14px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:500;' +
      'border-bottom:2px solid ' + (active ? 'var(--lpb-accent)' : 'transparent') + ';' +
      'display:inline-flex;align-items:center;gap:6px;cursor:pointer">' +
      _ico(icon, 12) + ' ' + label + '</button>'
  }

  function _attachTabs() {
    document.querySelectorAll('.lpb-tab-btn').forEach(function (b) {
      b.onclick = function () {
        _activeTab = b.dataset.tab
        // re-render header com tab ativa
        var header = b.parentElement
        if (header) header.innerHTML =
          _tabBtn('colors',     'Cores',       'droplet') +
          _tabBtn('typography', 'Tipografia',  'type') +
          _tabBtn('spacing',    'Espaçamento', 'maximize-2') +
          _tabBtn('borders',    'Bordas',      'square')
        _attachTabs()
        _renderBody()
      }
    })
  }

  function _renderBody() {
    var body = document.getElementById('lpbStylesBody')
    if (!body) return
    var html
    switch (_activeTab) {
      case 'typography': html = _renderTypographyTab(); break
      case 'spacing':    html = _renderSpacingTab();    break
      case 'borders':    html = _renderBordersTab();    break
      default:           html = _renderColorsTab()
    }
    body.innerHTML = html
    _attachInputs()
  }

  function _attachInputs() {
    var body = document.getElementById('lpbStylesBody')
    if (!body) return
    // text/color inputs
    body.querySelectorAll('[data-tk]').forEach(function (el) {
      el.oninput = function () {
        var k = el.dataset.tk
        _setOverride(k, el.value)
        // sync com input texto adjacente
        var partner = body.querySelector('[data-tk-text="' + k + '"]')
        if (partner && partner !== el) partner.value = el.value
      }
    })
    body.querySelectorAll('[data-tk-text]').forEach(function (el) {
      el.oninput = function () {
        var k = el.dataset.tkText
        _setOverride(k, el.value)
        var partner = body.querySelector('[data-tk="' + k + '"]')
        if (partner && partner !== el && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(el.value)) {
          partner.value = el.value
        }
      }
    })
    body.querySelectorAll('[data-tk-num]').forEach(function (el) {
      el.oninput = function () {
        var k = el.dataset.tkNum
        var n = parseFloat(el.value)
        _setOverride(k, isNaN(n) ? '' : n)
      }
    })
    body.querySelectorAll('[data-reset]').forEach(function (el) {
      el.onclick = function (e) {
        e.preventDefault()
        _setOverride(el.dataset.reset, '')
        _renderBody()
      }
    })
  }

  window.LPBStylesPanel = { open: open }
})()
