/**
 * VPI Embaixadora - Story IG Generator
 *
 * Gera PNG 1080x1920 client-side via Canvas API. Usa gradient do
 * tier da parceira + avatar (foto ou initials) + QR do short-link.
 *
 * API:
 *   VPIEmbStory.generate() -> Promise<canvas>
 *   VPIEmbStory.openModal() -> abre preview + botao salvar/share
 *
 * Expoe window.VPIEmbStory.
 */
;(function () {
  'use strict'
  if (window._vpiEmbStoryLoaded) return
  window._vpiEmbStoryLoaded = true

  var W = 1080, H = 1920

  var TIER_GRAD = {
    bronze: ['#1a0f08', '#8B5A2B', '#CD7F32', '#F4E4BC'],
    prata:  ['#1a1a1a', '#6A6A6A', '#C0C0C0', '#F5F5F5'],
    ouro:   ['#1a1204', '#5E4A1E', '#C9A96E', '#E4C795'],
    diamante: ['#0a0822', '#2d1b4e', '#7C3AED', '#E0C3FC'],
    default: ['#0B0813', '#5B21B6', '#C9A96E', '#E4C795'],
  }

  // Cache de Images por URL pra reaproveitar entre regeneracoes.
  // Evita alocar um novo Image a cada openModal (memory leak se
  // tab fica aberta horas). WeakMap nao serve aqui (keys sao strings),
  // entao usamos Map com LRU simples.
  var _imgCache = new Map()
  var _IMG_CACHE_MAX = 8

  function _app() { return window.VPIEmbApp }
  function _esc(s){ return _app() ? _app().esc(s) : (s == null ? '' : String(s)) }

  function _data() { return _app() ? _app().getData() : null }

  function _initials(name) {
    if (!name) return 'E'
    var parts = String(name).trim().split(/\s+/)
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
  }

  // Promove entry no LRU
  function _lruTouch(key) {
    if (!_imgCache.has(key)) return
    var val = _imgCache.get(key)
    _imgCache.delete(key)
    _imgCache.set(key, val)
  }

  function _lruEvict() {
    while (_imgCache.size > _IMG_CACHE_MAX) {
      var firstKey = _imgCache.keys().next().value
      if (!firstKey) break
      var img = _imgCache.get(firstKey)
      // Cleanup explicito: remove src e listeners pra GC
      if (img) {
        try { img.onload = null; img.onerror = null; img.src = '' } catch (_) {}
      }
      _imgCache.delete(firstKey)
    }
  }

  function _loadImg(src) {
    return new Promise(function (resolve) {
      if (!src) return resolve(null)
      // Cache hit
      if (_imgCache.has(src)) {
        _lruTouch(src)
        return resolve(_imgCache.get(src))
      }
      var img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload  = function () {
        _imgCache.set(src, img)
        _lruEvict()
        resolve(img)
      }
      img.onerror = function () {
        try { img.onload = null; img.onerror = null; img.src = '' } catch (_) {}
        resolve(null)
      }
      img.src = src
    })
  }

  function _clearImgCache() {
    _imgCache.forEach(function (img) {
      if (img) {
        try { img.onload = null; img.onerror = null; img.src = '' } catch (_) {}
      }
    })
    _imgCache.clear()
  }

  function _fillGradient(ctx, stops) {
    var g = ctx.createLinearGradient(0, 0, W, H)
    var n = stops.length
    for (var i = 0; i < n; i++) g.addColorStop(i / (n - 1), stops[i])
    ctx.fillStyle = g
    ctx.fillRect(0, 0, W, H)
  }

  function _drawAvatar(ctx, avatarImg, name, cx, cy, radius) {
    ctx.save()
    // Outer ring glow
    var g = ctx.createRadialGradient(cx, cy, radius * 0.6, cx, cy, radius + 40)
    g.addColorStop(0, 'rgba(255,255,255,0)')
    g.addColorStop(1, 'rgba(255,255,255,0.18)')
    ctx.fillStyle = g
    ctx.beginPath(); ctx.arc(cx, cy, radius + 40, 0, Math.PI * 2); ctx.fill()

    // Border white
    ctx.beginPath(); ctx.arc(cx, cy, radius + 6, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(255,255,255,0.4)'
    ctx.fill()
    ctx.beginPath(); ctx.arc(cx, cy, radius + 3, 0, Math.PI * 2)
    ctx.fillStyle = '#FFFFFF'
    ctx.fill()

    // Clip pro avatar
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.clip()

    if (avatarImg) {
      var s = Math.min(avatarImg.width, avatarImg.height)
      var sx = (avatarImg.width - s) / 2
      var sy = (avatarImg.height - s) / 2
      ctx.drawImage(avatarImg, sx, sy, s, s, cx - radius, cy - radius, radius * 2, radius * 2)
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.15)'
      ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2)
      ctx.fillStyle = '#FFFFFF'
      ctx.font = '600 ' + Math.floor(radius * 0.9) + 'px Georgia, serif'
      ctx.textAlign = 'center'
      ctx.textBaseline = 'middle'
      ctx.fillText(_initials(name), cx, cy + 4)
    }
    ctx.restore()
  }

  function _drawText(ctx, text, x, y, opts) {
    opts = opts || {}
    ctx.save()
    ctx.fillStyle   = opts.color || '#FFFFFF'
    ctx.font        = opts.font || '48px sans-serif'
    ctx.textAlign   = opts.align || 'center'
    ctx.textBaseline= opts.baseline || 'alphabetic'
    if (opts.shadow) {
      ctx.shadowColor = opts.shadow
      ctx.shadowBlur = opts.shadowBlur || 18
    }
    ctx.fillText(text, x, y)
    ctx.restore()
  }

  async function generate() {
    var d = _data()
    if (!d || !d.partner) return null
    var p = d.partner
    var tier = p.tier_atual || 'ouro'
    var stops = TIER_GRAD[tier] || TIER_GRAD.default

    var canvas = document.createElement('canvas')
    canvas.width = W; canvas.height = H
    var ctx = canvas.getContext('2d')

    // 1. Gradient de fundo
    _fillGradient(ctx, stops)

    // 2. Glow central (reforco)
    ctx.save()
    var g2 = ctx.createRadialGradient(W/2, H * 0.35, 100, W/2, H * 0.35, W * 0.8)
    g2.addColorStop(0, 'rgba(255,255,255,0.22)')
    g2.addColorStop(1, 'rgba(255,255,255,0)')
    ctx.fillStyle = g2
    ctx.fillRect(0, 0, W, H)
    ctx.restore()

    // 3. Avatar
    var avatarImg = await _loadImg(p.avatar_url)
    _drawAvatar(ctx, avatarImg, p.nome, W / 2, 540, 220)

    // 4. Nome
    _drawText(ctx, p.nome || 'Embaixadora', W / 2, 870, {
      color: '#FFFFFF',
      font: '500 92px "Cormorant Garamond", Georgia, serif',
      shadow: 'rgba(0,0,0,0.5)', shadowBlur: 24,
    })

    // 5. Tier label
    _drawText(ctx, 'EMBAIXADORA OFICIAL', W / 2, 950, {
      color: 'rgba(255,255,255,0.92)',
      font: '700 34px sans-serif',
    })
    ctx.save()
    ctx.strokeStyle = 'rgba(255,255,255,0.35)'
    ctx.lineWidth = 2
    ctx.beginPath(); ctx.moveTo(W * 0.25, 1000); ctx.lineTo(W * 0.75, 1000); ctx.stroke()
    ctx.restore()

    // 6. Nome da clinica
    _drawText(ctx, 'Clinica Mirian de Paula', W / 2, 1080, {
      color: '#FFFFFF',
      font: '400 58px "Cormorant Garamond", Georgia, serif',
    })
    _drawText(ctx, 'BEAUTY AND HEALTH', W / 2, 1135, {
      color: 'rgba(255,255,255,0.75)',
      font: '600 26px sans-serif',
    })

    // 7. CTA
    _drawText(ctx, 'Toque para acessar', W / 2, 1500, {
      color: 'rgba(255,255,255,0.8)',
      font: '500 32px sans-serif',
    })
    _drawText(ctx, 'seu bonus exclusivo', W / 2, 1550, {
      color: 'rgba(255,255,255,0.8)',
      font: '500 32px sans-serif',
    })

    // 8. QR code
    try {
      if (window.VPIEmbQR && window.VPIEmbQR.generateCanvas) {
        var qr = await window.VPIEmbQR.generateCanvas(null, 320)
        if (qr) {
          // Bg branco padded
          ctx.fillStyle = '#FFFFFF'
          ctx.fillRect(W / 2 - 180, 1600, 360, 360)
          ctx.drawImage(qr, W / 2 - 160, 1620, 320, 320)
        }
      }
    } catch (e) {
      console.warn('[VPIEmbStory] qr fail:', e && e.message)
    }

    // 9. Numero membro
    var membro = 'Membro #' + String(p.numero_membro || 0).padStart(5, '0')
    _drawText(ctx, membro, W / 2, H - 60, {
      color: 'rgba(255,255,255,0.5)',
      font: '500 24px monospace',
    })

    return canvas
  }

  function _downloadCanvas(canvas, filename) {
    try {
      canvas.toBlob(function (blob) {
        if (!blob) { if (_app()) _app().toast('Falha ao gerar imagem.'); return }
        var url = URL.createObjectURL(blob)
        var a = document.createElement('a')
        a.href = url
        a.download = filename || 'meu-cartao-embaixadora.png'
        document.body.appendChild(a)
        a.click()
        setTimeout(function () {
          document.body.removeChild(a)
          URL.revokeObjectURL(url)
        }, 100)
      }, 'image/png', 0.95)
    } catch (e) {
      console.warn('[VPIEmbStory] download fail:', e && e.message)
    }
  }

  async function _shareCanvasFile(canvas) {
    return new Promise(function (resolve) {
      canvas.toBlob(async function (blob) {
        if (!blob) { resolve(false); return }
        try {
          if (navigator.canShare && navigator.canShare({ files: [new File([blob], 'cartao.png', { type: 'image/png' })] })) {
            await navigator.share({
              files: [new File([blob], 'cartao.png', { type: 'image/png' })],
              title: 'Meu cartão de embaixadora',
              text:  'Sou embaixadora oficial da Clínica Mirian de Paula',
            })
            resolve(true)
            return
          }
        } catch (e) {
          if (e && e.name === 'AbortError') { resolve(false); return }
          console.warn('[VPIEmbStory] share fail:', e && e.message)
        }
        resolve(false)
      }, 'image/png', 0.95)
    })
  }

  async function openModal() {
    if (document.getElementById('vpi-story-modal')) return
    var d = _data()
    if (!d || !d.partner) { if (_app()) _app().toast('Cartão ainda carregando.'); return }

    var bg = document.createElement('div')
    bg.className = 'vpi-modal-backdrop'
    bg.id = 'vpi-story-modal'
    bg.innerHTML =
      '<div class="vpi-modal">' +
        '<h3>Story para Instagram</h3>' +
        '<p class="sub">Imagem 1080×1920 pronta pra postar. Salve ou compartilhe direto.</p>' +
        '<div style="text-align:center;padding:8px 0">' +
          '<div class="vpi-loading"><div class="spinner"></div><div>Gerando sua imagem...</div></div>' +
          '<div id="vpi-story-preview" style="display:none"></div>' +
        '</div>' +
        '<div class="vpi-modal-actions">' +
          '<button class="vpi-btn vpi-btn-secondary" id="vpi-story-close">Fechar</button>' +
          '<button class="vpi-btn vpi-btn-primary" id="vpi-story-save" disabled>Salvar</button>' +
        '</div>' +
      '</div>'
    document.body.appendChild(bg)
    requestAnimationFrame(function () { bg.classList.add('open') })

    var closeBtn = bg.querySelector('#vpi-story-close')
    var saveBtn  = bg.querySelector('#vpi-story-save')
    var preview  = bg.querySelector('#vpi-story-preview')
    var loading  = bg.querySelector('.vpi-loading')

    function _cleanupAndClose() {
      // Cleanup explicito: remove preview img src pra liberar bitmap
      var pv = bg.querySelector('#vpi-story-preview img')
      if (pv) { try { pv.src = '' } catch (_) {} }
      bg.classList.remove('open')
      setTimeout(function () { try { bg.remove() } catch (_) {} }, 260)
    }
    closeBtn.addEventListener('click', _cleanupAndClose)
    bg.addEventListener('click', function (e) { if (e.target === bg) _cleanupAndClose() })

    var canvas = await generate()
    if (!canvas) {
      loading.innerHTML = '<div>Não foi possível gerar a imagem.</div>'
      return
    }
    loading.style.display = 'none'
    preview.style.display = 'block'
    preview.innerHTML = ''

    var img = document.createElement('img')
    img.src = canvas.toDataURL('image/png', 0.9)
    img.className = 'vpi-story-preview'
    img.alt = 'Preview Story'
    preview.appendChild(img)

    saveBtn.disabled = false
    saveBtn.innerHTML = 'Salvar / Compartilhar'
    saveBtn.addEventListener('click', async function () {
      var shared = await _shareCanvasFile(canvas)
      if (!shared) _downloadCanvas(canvas, 'meu-cartao-embaixadora.png')
      if (_app()) _app().toast('Imagem pronta!')
    })
  }

  function init() {
    // Nada persistente; Share chama openModal
  }

  // Libera pool de imagens quando tab fica em background prolongado
  try {
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        // Schedule pra limpar cache se tab seguir oculta por 60s
        setTimeout(function () {
          if (document.hidden) _clearImgCache()
        }, 60000)
      }
    })
  } catch (_) {}

  window.VPIEmbStory = {
    init:           init,
    generate:       generate,
    openModal:      openModal,
    clearImgCache:  _clearImgCache,
  }
})()
