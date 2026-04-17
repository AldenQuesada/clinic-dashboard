/**
 * VPI Embaixadora - Share (Web Share API + clipboard fallback)
 *
 * Usa navigator.share quando disponivel. Em desktops/navegadores
 * sem suporte, copia URL para clipboard e mostra toast.
 * Tambem expoe abertura do modal de Story IG.
 *
 * Expoe window.VPIEmbShare.
 */
;(function () {
  'use strict'
  if (window._vpiEmbShareLoaded) return
  window._vpiEmbShareLoaded = true

  function _app() { return window.VPIEmbApp }
  function _esc(s){ return _app() ? _app().esc(s) : (s == null ? '' : String(s)) }

  function _ico(name, sz) {
    sz = sz || 16
    if (window.feather && window.feather.icons && window.feather.icons[name]) {
      return window.feather.icons[name].toSvg({ width: sz, height: sz, 'stroke-width': 2 })
    }
    return ''
  }

  function _shareUrl() {
    if (window.VPIEmbQR && window.VPIEmbQR.shareUrl) return window.VPIEmbQR.shareUrl()
    return window.location.href
  }

  var SHARE_TEXT =
    'Oi! Tenho um convite especial - sou embaixadora oficial da ' +
    'Clinica Mirian de Paula e voce pode fazer seu proximo procedimento ' +
    'com bonus exclusivo. Toca pra saber mais:'

  async function share() {
    var url = _shareUrl()
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'Convite exclusivo - Clinica Mirian de Paula',
          text:  SHARE_TEXT,
          url:   url,
        })
        return true
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return false
      console.warn('[VPIEmbShare] share fail:', e && e.message)
    }
    // Fallback: clipboard
    try {
      await navigator.clipboard.writeText(SHARE_TEXT + '\n' + url)
      if (_app()) _app().toast('Link copiado! Cole no WhatsApp.')
      return true
    } catch (_) {
      _openFallbackModal(url)
      return false
    }
  }

  function _openFallbackModal(url) {
    if (document.getElementById('vpi-share-modal')) return
    var bg = document.createElement('div')
    bg.className = 'vpi-modal-backdrop'
    bg.id = 'vpi-share-modal'
    bg.innerHTML =
      '<div class="vpi-modal">' +
        '<h3>Compartilhar meu cartao</h3>' +
        '<p class="sub">Copie o link abaixo e cole no WhatsApp.</p>' +
        '<div class="vpi-field">' +
          '<input id="vpi-share-link" type="text" readonly value="' + _esc(url) + '" />' +
        '</div>' +
        '<div class="vpi-modal-actions">' +
          '<button class="vpi-btn vpi-btn-secondary" id="vpi-share-close">Fechar</button>' +
          '<button class="vpi-btn vpi-btn-primary" id="vpi-share-copy">' + _ico('copy', 16) + ' Copiar</button>' +
        '</div>' +
      '</div>'
    document.body.appendChild(bg)
    requestAnimationFrame(function () { bg.classList.add('open') })

    bg.querySelector('#vpi-share-close').addEventListener('click', function () {
      bg.classList.remove('open')
      setTimeout(function () { bg.remove() }, 260)
    })
    bg.querySelector('#vpi-share-copy').addEventListener('click', function () {
      var inp = document.getElementById('vpi-share-link')
      try {
        inp.select()
        document.execCommand('copy')
        if (_app()) _app().toast('Copiado!')
      } catch (_) {}
    })

    if (window.feather && window.feather.replace) {
      try { window.feather.replace() } catch (_) {}
    }
  }

  function openStoryModal() {
    if (window.VPIEmbStory && window.VPIEmbStory.openModal) {
      window.VPIEmbStory.openModal()
    } else if (_app()) {
      _app().toast('Gerador de Story indisponivel.')
    }
  }

  function init() {
    // Adiciona botao extra "Gerar Story IG" abaixo dos botoes existentes
    // via observer, ja que o card pode ser re-renderizado
    function _attach() {
      var actions = document.querySelector('.vpi-actions')
      if (!actions) return
      if (document.getElementById('vpi-btn-story')) return
      var btn = document.createElement('button')
      btn.className = 'vpi-btn vpi-btn-secondary'
      btn.id = 'vpi-btn-story'
      btn.innerHTML = _ico('instagram', 16) + ' Gerar Story para Instagram'
      btn.addEventListener('click', function (e) {
        e.stopPropagation()
        openStoryModal()
      })
      actions.appendChild(btn)
      if (window.feather && window.feather.replace) {
        try { window.feather.replace() } catch (_) {}
      }
    }
    _attach()
    window.addEventListener('vpi-emb-rendered', function () { setTimeout(_attach, 20) })
  }

  window.VPIEmbShare = {
    init:  init,
    share: share,
    openStoryModal: openStoryModal,
  }
})()
