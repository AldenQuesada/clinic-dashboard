/**
 * VPI Embaixadora - Paleta personalizada por tier (Fase 9 - Entrega 4)
 *
 * Botao "Personalizar" no footer do cartao abre modal com 3 previews
 * lado a lado (miniatures do cartao). Click seleciona + chama RPC +
 * aplica data-palette no container.
 *
 * Variants por tier:
 *   - bronze:   classico | rose | cobre
 *   - prata:    classico | sage | perla
 *   - ouro:     classico | rose-gold | champagne
 *   - diamante: classico | blackout | rainbow-hologram
 *
 * Expoe window.VPIEmbPalette.
 */
;(function () {
  'use strict'
  if (window._vpiEmbPaletteLoaded) return
  window._vpiEmbPaletteLoaded = true

  var VARIANTS = {
    bronze:   ['classico','rose','cobre'],
    prata:    ['classico','sage','perla'],
    ouro:     ['classico','rose-gold','champagne'],
    diamante: ['classico','blackout','rainbow-hologram'],
  }

  var PREVIEW_COLORS = {
    'bronze/classico':         '#CD7F32',
    'bronze/rose':             '#D4A574',
    'bronze/cobre':            '#B87333',
    'prata/classico':          '#C0C0C0',
    'prata/sage':              '#B8C5B0',
    'prata/perla':             '#E5E4E2',
    'ouro/classico':           '#C9A96E',
    'ouro/rose-gold':          '#E0A88A',
    'ouro/champagne':          '#F7E7CE',
    'diamante/classico':       '#7C3AED',
    'diamante/blackout':       '#0A0A0A',
    'diamante/rainbow-hologram': 'conic-gradient(from 0deg,#FF00C8,#00E0FF,#B9FF66,#FFB400,#FF00C8)',
  }

  var LABELS = {
    classico:           'Classico',
    rose:               'Rose',
    cobre:              'Cobre',
    sage:               'Sage',
    perla:              'Perla',
    'rose-gold':        'Rose Gold',
    champagne:          'Champagne',
    blackout:           'Blackout',
    'rainbow-hologram': 'Rainbow Hologram',
  }

  function _app() { return window.VPIEmbApp }
  function _sb()  { return window._sbShared }
  function _token() { return _app() && _app().getToken && _app().getToken() }
  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _currentTier() {
    try {
      var d = _app() && _app().getData()
      return (d && d.partner && d.partner.tier_atual) || 'bronze'
    } catch (_) { return 'bronze' }
  }

  function _applyVariant(variant) {
    // Aplica data-palette em ambas faces do cartao e container root
    var faces = document.querySelectorAll('.vpi-card-face')
    faces.forEach(function (el) {
      if (variant === 'classico') el.removeAttribute('data-palette')
      else el.setAttribute('data-palette', variant)
    })
  }

  async function _fetchCurrentVariant() {
    var sb = _sb(), token = _token()
    if (!sb || !token) return 'classico'
    try {
      var res = await sb.rpc('vpi_pub_get_palette', { p_token: token })
      if (res.error) return 'classico'
      var d = res.data || {}
      return (d.ok && d.variant) || 'classico'
    } catch (_) { return 'classico' }
  }

  async function openModal() {
    var tier = _currentTier()
    var variants = VARIANTS[tier] || VARIANTS.bronze
    var current = await _fetchCurrentVariant()

    var old = document.getElementById('vpi-palette-modal')
    if (old) old.remove()

    var cards = variants.map(function (v) {
      var key = tier + '/' + v
      var col = PREVIEW_COLORS[key] || '#888'
      var bg  = col.indexOf('gradient') >= 0 ? col : ('linear-gradient(135deg,' + col + ' 0%,' + col + 'cc 100%)')
      var selected = v === current
      return '<button type="button" data-variant="' + _esc(v) + '"' +
        ' style="flex:1;min-width:0;border:' + (selected ? '2px solid #fff' : '2px solid transparent') + ';' +
        'background:rgba(255,255,255,0.04);padding:12px 8px;border-radius:14px;cursor:pointer;color:#fff;' +
        'display:flex;flex-direction:column;align-items:center;gap:8px;transition:border-color .2s">' +
        '<div style="width:74px;height:102px;border-radius:10px;background:' + bg + ';box-shadow:0 8px 24px -8px rgba(0,0,0,.5)"></div>' +
        '<div style="font-size:11px;font-weight:700;text-align:center">' + _esc(LABELS[v] || v) + '</div>' +
        (selected ? '<div style="font-size:9px;color:#C9A96E;font-weight:800;letter-spacing:.06em">ATUAL</div>' : '<div style="font-size:9px;opacity:0;height:10px">_</div>') +
      '</button>'
    }).join('')

    var modal = document.createElement('div')
    modal.id = 'vpi-palette-modal'
    modal.className = 'vpi-modal-backdrop'
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(5,3,10,.75);z-index:10060;display:flex;align-items:center;justify-content:center;padding:16px;opacity:0;transition:opacity .24s'
    modal.innerHTML =
      '<div style="background:linear-gradient(160deg,#16111F,#0B0813);border:1px solid rgba(201,169,110,0.25);border-radius:18px;padding:24px;max-width:440px;width:100%;color:#F4F1EC;box-shadow:0 24px 72px -12px rgba(0,0,0,.7)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">' +
          '<div style="font-size:16px;font-weight:700">Personalizar paleta</div>' +
          '<button id="vpi-palette-close" style="background:none;border:none;color:#B8B0A3;font-size:24px;line-height:1;cursor:pointer">×</button>' +
        '</div>' +
        '<div style="font-size:12px;color:#B8B0A3;margin-bottom:16px">Escolha a vibe que combina com voce (' + _esc(tier.toUpperCase()) + ')</div>' +
        '<div style="display:flex;gap:8px;align-items:stretch">' + cards + '</div>' +
        '<div style="font-size:10px;color:#B8B0A3;margin-top:16px;text-align:center">Voce pode trocar sempre que quiser</div>' +
      '</div>'
    document.body.appendChild(modal)
    requestAnimationFrame(function () { modal.style.opacity = '1' })

    modal.querySelector('#vpi-palette-close').addEventListener('click', closeModal)
    modal.addEventListener('click', function (e) { if (e.target === modal) closeModal() })

    Array.prototype.forEach.call(modal.querySelectorAll('button[data-variant]'), function (btn) {
      btn.addEventListener('click', function () { _selectVariant(btn.getAttribute('data-variant')) })
    })
  }

  function closeModal() {
    var m = document.getElementById('vpi-palette-modal')
    if (!m) return
    m.style.opacity = '0'
    setTimeout(function () { m.remove() }, 260)
  }

  async function _selectVariant(variant) {
    var sb = _sb(), token = _token()
    if (!sb || !token) { closeModal(); return }

    // Otimista: aplica imediatamente
    _applyVariant(variant)

    try {
      var res = await sb.rpc('vpi_pub_set_palette', { p_token: token, p_variant: variant })
      if (res.error) throw new Error(res.error.message)
      var d = res.data || {}
      if (!d.ok) throw new Error(d.reason || 'falhou')
      if (_app() && _app().toast) _app().toast('Paleta atualizada: ' + (LABELS[variant] || variant))
    } catch (e) {
      if (window.console && console.warn) console.warn('[VPIEmbPalette]', e && e.message)
      // Reverte pra classico em caso de erro
      _applyVariant('classico')
      if (_app() && _app().toast) _app().toast('Nao conseguimos salvar sua escolha. Tente de novo.')
    }
    closeModal()
  }

  // Insere botao "Personalizar" no footer do cartao (depois do optout)
  function _injectButton() {
    if (document.getElementById('vpi-btn-palette')) return
    var footer = document.querySelector('.vpi-optout-footer')
    if (!footer) return
    var sep = document.createTextNode(' · ')
    var btn = document.createElement('a')
    btn.href = 'javascript:void(0)'
    btn.id = 'vpi-btn-palette'
    btn.style.cssText = 'color:rgba(245,245,245,0.75);text-decoration:underline;font-weight:500;cursor:pointer'
    btn.textContent = 'Personalizar paleta'
    btn.addEventListener('click', function (e) { e.preventDefault(); openModal() })
    // Inserir antes do ultimo nó (link Sair) senao append
    var lastLink = footer.querySelector('#vpi-optout-link')
    if (lastLink && lastLink.parentNode) {
      lastLink.parentNode.insertBefore(sep, lastLink)
      lastLink.parentNode.insertBefore(btn, lastLink)
      var sep2 = document.createTextNode(' · ')
      lastLink.parentNode.insertBefore(sep2, lastLink)
    } else {
      footer.appendChild(sep); footer.appendChild(btn)
    }
  }

  async function _initialApply() {
    // Aplica variant atual assim que o cartao renderizar
    var variant = await _fetchCurrentVariant()
    if (variant && variant !== 'classico') _applyVariant(variant)
  }

  function init() {
    window.addEventListener('vpi-emb-rendered', function () {
      setTimeout(function () { _injectButton(); _initialApply() }, 30)
    })
    _injectButton()
    _initialApply()
  }

  window.VPIEmbPalette = {
    init:       init,
    openModal:  openModal,
    closeModal: closeModal,
  }
})()
