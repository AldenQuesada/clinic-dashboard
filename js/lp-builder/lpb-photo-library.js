/**
 * LP Builder · Photo Library
 *
 * Drawer/modal lista todas as fotos ja usadas em LPs (varre image fields
 * recursivamente em todos os blocks de todas as paginas).
 * Permite click pra inserir, ou upload novo (Storage bucket lp-assets).
 *
 * window.LPBPhotoLibrary.openForField(blockIdx, fieldKey)
 */
;(function () {
  'use strict'
  if (window.LPBPhotoLibrary) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  var SB_URL = (window.ClinicEnv && window.ClinicEnv.SUPABASE_URL) ||
               'https://oqboitkpcvuaudouwvkl.supabase.co'
  var SB_KEY = (window.ClinicEnv && window.ClinicEnv.SUPABASE_KEY) ||
               'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'

  // ────────────────────────────────────────────────────────────
  // Crawl paginas pra coletar URLs unicas
  // ────────────────────────────────────────────────────────────
  function _crawlImagesInProps(props, acc) {
    if (!props || typeof props !== 'object') return
    Object.keys(props).forEach(function (k) {
      var v = props[k]
      if (typeof v === 'string') {
        // url provavel
        if (/^https?:\/\//.test(v) && /\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(v)) {
          acc[v] = true
        }
        // chaves "image" / "url" / "foto" / "og_image_url"
        else if (v && /image|foto|photo|url/i.test(k) && /^https?:\/\//.test(v)) {
          acc[v] = true
        }
      } else if (Array.isArray(v)) {
        v.forEach(function (item) { _crawlImagesInProps(item, acc) })
      } else if (typeof v === 'object') {
        _crawlImagesInProps(v, acc)
      }
    })
  }

  async function _collectAllPhotos() {
    var acc = {}
    // 1. Pagina atual
    var current = LPBuilder.getCurrentPage()
    if (current) {
      ;(current.blocks || []).forEach(function (b) { _crawlImagesInProps(b.props || {}, acc) })
      if (current.og_image_url) acc[current.og_image_url] = true
    }
    // 2. Demais paginas (pelo lp_page_get)
    try {
      var pages = LPBuilder.getPages() || []
      // limita pra evitar carregar 50 paginas — pega so as 10 mais recentes
      var topPages = pages.slice(0, 10)
      for (var i = 0; i < topPages.length; i++) {
        if (current && topPages[i].id === current.id) continue
        try {
          var data = await LPBuilder.rpc('lp_page_get', { p_id: topPages[i].id })
          if (data && data.ok) {
            ;(data.blocks || []).forEach(function (b) { _crawlImagesInProps(b.props || {}, acc) })
            if (data.og_image_url) acc[data.og_image_url] = true
          }
        } catch (_) {}
      }
    } catch (_) {}

    return Object.keys(acc).sort()
  }

  // ────────────────────────────────────────────────────────────
  // Storage upload
  // ────────────────────────────────────────────────────────────
  async function _uploadFile(file) {
    if (!file) throw new Error('sem arquivo')
    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    var safeExt = ['jpg','jpeg','png','webp'].indexOf(ext) >= 0 ? ext : 'jpg'
    var name = 'lp-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.' + safeExt

    var r = await fetch(SB_URL + '/storage/v1/object/lp-assets/' + name, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': file.type || 'image/jpeg',
        'x-upsert': 'true',
      },
      body: file,
    })
    if (!r.ok) {
      var t = await r.text()
      throw new Error('upload ' + r.status + ': ' + t.slice(0, 100))
    }
    // URL publica (bucket lp-assets e public:true com policy select pra anon)
    return SB_URL + '/storage/v1/object/public/lp-assets/' + name
  }

  // ────────────────────────────────────────────────────────────
  // Modal
  // ────────────────────────────────────────────────────────────
  function openForField(blockIdx, fieldKey, listCtx) {
    // listCtx opcional: { fkey, idx } pra escrever dentro de um list item
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbPhBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:760px;max-height:88vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Biblioteca de Fotos</h3>' +
            '<button class="lpb-btn-icon" id="lpbPhClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div style="display:flex;border-bottom:1px solid var(--lpb-border);padding:12px 20px;gap:8px;align-items:center">' +
            '<input type="text" class="lpb-input" id="lpbPhUrl" placeholder="Cole URL https://..." style="flex:1">' +
            '<button class="lpb-btn sm" id="lpbPhUseUrl">Usar URL</button>' +
            '<label class="lpb-btn primary sm" style="cursor:pointer;margin:0">' +
              _ico('upload', 12) + ' Enviar' +
              '<input type="file" id="lpbPhFile" accept="image/*" style="display:none">' +
            '</label>' +
          '</div>' +
          '<div class="lpb-modal-body" id="lpbPhBody" style="flex:1;overflow:auto">' +
            '<div style="text-align:center;padding:40px;color:var(--lpb-text-3);font-style:italic">Carregando fotos...</div>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg    = document.getElementById('lpbPhBg')
    var close = document.getElementById('lpbPhClose')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss

    document.getElementById('lpbPhUseUrl').onclick = function () {
      var url = (document.getElementById('lpbPhUrl').value || '').trim()
      if (!url) { LPBToast && LPBToast('Cole uma URL primeiro', 'error'); return }
      _apply(blockIdx, fieldKey, url, listCtx)
      dismiss()
    }

    document.getElementById('lpbPhFile').onchange = async function (e) {
      var file = e.target.files && e.target.files[0]
      if (!file) return
      LPBToast && LPBToast('Enviando...', 'success')
      try {
        var url = await _uploadFile(file)
        _apply(blockIdx, fieldKey, url, listCtx)
        LPBToast && LPBToast('Foto enviada', 'success')
        dismiss()
      } catch (err) {
        LPBToast && LPBToast('Erro no envio: ' + err.message, 'error')
      }
    }

    // load grid
    _collectAllPhotos().then(function (urls) {
      var body = document.getElementById('lpbPhBody')
      if (!body) return
      if (!urls.length) {
        body.innerHTML = '<div style="text-align:center;padding:40px;color:var(--lpb-text-3);font-style:italic">' +
          'Nenhuma foto encontrada nas páginas. Envie uma acima.' +
          '</div>'
        return
      }
      body.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px;padding:16px">' +
        urls.map(function (u) {
          return '<button class="lpb-ph-thumb" data-url="' + _esc(u) + '" ' +
            'style="background:#000;background-image:url(' + _esc(u) + ');background-size:cover;background-position:center;' +
            'aspect-ratio:1/1;border:1px solid var(--lpb-border);cursor:pointer;padding:0;transition:border-color .12s" ' +
            'title="' + _esc(u) + '"></button>'
        }).join('') +
        '</div>'
      body.querySelectorAll('.lpb-ph-thumb').forEach(function (el) {
        el.onmouseenter = function () { el.style.borderColor = 'var(--lpb-accent)' }
        el.onmouseleave = function () { el.style.borderColor = 'var(--lpb-border)' }
        el.onclick = function () {
          _apply(blockIdx, fieldKey, el.dataset.url, listCtx)
          dismiss()
        }
      })
    }).catch(function () {
      var body = document.getElementById('lpbPhBody')
      if (body) body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--lpb-danger)">Erro ao carregar fotos</div>'
    })
  }

  function _apply(blockIdx, fieldKey, url, listCtx) {
    if (listCtx && listCtx.fkey && typeof listCtx.idx === 'number') {
      var block = LPBuilder.getBlock(blockIdx)
      if (!block) return
      var arr = Array.isArray(block.props && block.props[listCtx.fkey])
        ? block.props[listCtx.fkey].slice() : []
      var item = arr[listCtx.idx] || {}
      var update = {}
      update[fieldKey] = url
      arr[listCtx.idx] = Object.assign({}, item, update)
      LPBuilder.setBlockProp(blockIdx, listCtx.fkey, arr)
    } else {
      LPBuilder.setBlockProp(blockIdx, fieldKey, url)
    }
  }

  // Upload direto (usado pelo inspector — sem abrir modal)
  async function uploadFor(blockIdx, fieldKey, file) {
    if (!file) return
    LPBToast && LPBToast('Enviando foto...', 'success')
    try {
      var url = await _uploadFile(file)
      try { document.activeElement && document.activeElement.blur && document.activeElement.blur() } catch (_) {}
      LPBuilder.setBlockProp(blockIdx, fieldKey, url)
      // força ambos re-renderizarem (inspector E canvas)
      if (window.LPBInspector && window.LPBInspector.render) window.LPBInspector.render()
      if (window.LPBCanvas    && window.LPBCanvas.render)    window.LPBCanvas.render()
      // salva imediatamente pra nao perder se der F5
      try { await LPBuilder.savePage() } catch (_) {}
      LPBToast && LPBToast('Foto aplicada e salva', 'success')
    } catch (err) {
      LPBToast && LPBToast('Erro no envio: ' + err.message, 'error')
    }
  }

  window.LPBPhotoLibrary = {
    openForField: openForField,
    uploadFor:    uploadFor,
    uploadFile:   _uploadFile,   // expose pra inspector controlar onde grava (list context)
  }
})()
