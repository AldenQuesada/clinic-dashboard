/**
 * LP Builder · Image Crop (Cropper.js inline)
 *
 * Modal de crop com Cropper.js carregado via CDN on-demand.
 * Aspect ratio vem do schema (image field aspect: '4/5' etc.).
 * Output: jpeg upload pro Storage → URL aplicada no campo.
 *
 * window.LPBImageCrop.openForField(blockIdx, fieldKey)
 */
;(function () {
  'use strict'
  if (window.LPBImageCrop) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  var SB_URL = (window.ClinicEnv && window.ClinicEnv.SUPABASE_URL) ||
               'https://oqboitkpcvuaudouwvkl.supabase.co'
  var SB_KEY = (window.ClinicEnv && window.ClinicEnv.SUPABASE_KEY) ||
               'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'

  // Carrega Cropper.js + CSS uma unica vez
  var _cropperLoaded = false
  function _loadCropper() {
    if (_cropperLoaded || window.Cropper) {
      _cropperLoaded = true
      return Promise.resolve()
    }
    return new Promise(function (resolve, reject) {
      var css = document.createElement('link')
      css.rel = 'stylesheet'
      css.href = 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.1/dist/cropper.min.css'
      document.head.appendChild(css)

      var s = document.createElement('script')
      s.src = 'https://cdn.jsdelivr.net/npm/cropperjs@1.6.1/dist/cropper.min.js'
      s.onload = function () { _cropperLoaded = true; resolve() }
      s.onerror = function () { reject(new Error('falha ao carregar Cropper.js')) }
      document.head.appendChild(s)
    })
  }

  function _parseAspect(str) {
    if (!str) return NaN  // free
    var m = String(str).match(/^(\d+)\s*[\/:x]\s*(\d+)$/i)
    if (!m) return NaN
    return parseInt(m[1], 10) / parseInt(m[2], 10)
  }

  async function _uploadBlob(blob) {
    var name = 'lp-crop-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8) + '.jpg'
    var r = await fetch(SB_URL + '/storage/v1/object/lp-assets/' + name, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'image/jpeg',
        'x-upsert': 'true',
      },
      body: blob,
    })
    if (!r.ok) throw new Error('upload ' + r.status)
    return SB_URL + '/storage/v1/object/public/lp-assets/' + name
  }

  // ────────────────────────────────────────────────────────────
  // Open
  // ────────────────────────────────────────────────────────────
  function openForField(blockIdx, fieldKey, listCtx) {
    // listCtx opcional: { fkey, idx } pra escrever dentro de um list item
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    var schema = window.LPBSchema
    var b = LPBuilder.getBlock(blockIdx)
    if (!b || !schema) return
    // Pra list context, lê o aspect do itemSchema (não do field top-level)
    var fmeta = (listCtx && listCtx.fkey)
      ? (function () {
          var listFmeta = schema.getFieldMeta(b.type, listCtx.fkey)
          if (!listFmeta || !listFmeta.itemSchema) return null
          var itemDef = schema.getItemSchema(listFmeta.itemSchema) || []
          var found = null
          itemDef.forEach(function (sub) { if (sub.k === fieldKey) found = sub })
          return found
        })()
      : schema.getFieldMeta(b.type, fieldKey)
    var aspect = fmeta ? _parseAspect(fmeta.aspect) : NaN
    // Lê URL atual · do slide se em list context, senão do top-level
    var srcUrl
    if (listCtx && listCtx.fkey && typeof listCtx.idx === 'number') {
      var arr0 = (b.props && Array.isArray(b.props[listCtx.fkey])) ? b.props[listCtx.fkey] : []
      var item0 = arr0[listCtx.idx] || {}
      srcUrl = item0[fieldKey] || ''
    } else {
      srcUrl = b.props ? b.props[fieldKey] : ''
    }

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbCrBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:760px">' +
          '<div class="lpb-modal-h">' +
            '<h3>Recortar Imagem</h3>' +
            '<button class="lpb-btn-icon" id="lpbCrClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div class="lpb-modal-body">' +
            '<div style="display:flex;gap:10px;margin-bottom:14px;align-items:center">' +
              '<input type="text" class="lpb-input" id="lpbCrUrl" placeholder="URL da imagem de origem" value="' + _esc(srcUrl) + '" style="flex:1">' +
              '<label class="lpb-btn sm" style="cursor:pointer;margin:0">' +
                _ico('upload', 12) + ' Arquivo' +
                '<input type="file" id="lpbCrFile" accept="image/*" style="display:none">' +
              '</label>' +
            '</div>' +
            '<div style="display:flex;gap:8px;margin-bottom:10px">' +
              _aspectBtn('free', 'Livre', isNaN(aspect)) +
              _aspectBtn('1/1',  '1:1',   aspect === 1) +
              _aspectBtn('4/5',  '4:5',   aspect === 4/5) +
              _aspectBtn('3/4',  '3:4',   aspect === 3/4) +
              _aspectBtn('16/9', '16:9',  aspect === 16/9) +
              '<div style="flex:1"></div>' +
              '<button class="lpb-btn ghost sm" id="lpbCrRot">' + _ico('rotate-cw', 12) + ' Girar</button>' +
            '</div>' +
            '<div style="background:#000;max-height:55vh;overflow:hidden">' +
              '<img id="lpbCrImg" src="" style="display:block;max-width:100%">' +
            '</div>' +
          '</div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn ghost" id="lpbCrCancel">Cancelar</button>' +
            '<button class="lpb-btn primary" id="lpbCrApply">' + _ico('check', 14) + ' Aplicar</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg     = document.getElementById('lpbCrBg')
    var close  = document.getElementById('lpbCrClose')
    var cancel = document.getElementById('lpbCrCancel')
    var apply  = document.getElementById('lpbCrApply')
    var img    = document.getElementById('lpbCrImg')
    var urlIn  = document.getElementById('lpbCrUrl')
    var fileIn = document.getElementById('lpbCrFile')
    var rot    = document.getElementById('lpbCrRot')

    var cropper = null
    function dismiss() {
      if (cropper) try { cropper.destroy() } catch(_) {}
      modalRoot.innerHTML = ''
    }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
    cancel.onclick = dismiss

    function initCropper(srcOrDataUrl) {
      img.src = srcOrDataUrl
      img.crossOrigin = 'anonymous'  // pra toBlob funcionar com URL externa
      _loadCropper().then(function () {
        if (cropper) try { cropper.destroy() } catch(_) {}
        cropper = new window.Cropper(img, {
          aspectRatio: isNaN(aspect) ? NaN : aspect,
          viewMode: 1, autoCropArea: 0.9,
          movable: true, zoomable: true, scalable: false,
        })
      }).catch(function (e) {
        LPBToast && LPBToast(e.message, 'error')
      })
    }

    if (srcUrl) initCropper(srcUrl)

    urlIn.onchange = function () { if (urlIn.value) initCropper(urlIn.value) }

    fileIn.onchange = function (e) {
      var f = e.target.files && e.target.files[0]
      if (!f) return
      var reader = new FileReader()
      reader.onload = function () { initCropper(reader.result) }
      reader.readAsDataURL(f)
    }

    rot.onclick = function () { if (cropper) cropper.rotate(90) }

    document.querySelectorAll('[data-aspect]').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('[data-aspect]').forEach(function (x) { x.classList.remove('is-active') })
        b.classList.add('is-active')
        var a = b.dataset.aspect === 'free' ? NaN : _parseAspect(b.dataset.aspect)
        aspect = a
        if (cropper) cropper.setAspectRatio(a)
      }
    })

    apply.onclick = function () {
      if (!cropper) { LPBToast && LPBToast('Carregue uma imagem primeiro', 'error'); return }
      apply.disabled = true
      apply.innerHTML = _ico('loader', 14) + ' Enviando...'
      cropper.getCroppedCanvas({
        maxWidth:  2400, maxHeight: 2400,
        imageSmoothingEnabled: true, imageSmoothingQuality: 'high',
      }).toBlob(async function (blob) {
        try {
          var url = await _uploadBlob(blob)
          dismiss()
          try { document.activeElement && document.activeElement.blur && document.activeElement.blur() } catch (_) {}
          // Suporta list context (slide do carrossel etc)
          if (listCtx && listCtx.fkey && typeof listCtx.idx === 'number') {
            var blockX = LPBuilder.getBlock(blockIdx)
            var arr = (blockX && Array.isArray(blockX.props[listCtx.fkey]))
              ? blockX.props[listCtx.fkey].slice() : []
            var item = arr[listCtx.idx] || {}
            var update = {}
            update[fieldKey] = url
            arr[listCtx.idx] = Object.assign({}, item, update)
            LPBuilder.setBlockProp(blockIdx, listCtx.fkey, arr)
          } else {
            LPBuilder.setBlockProp(blockIdx, fieldKey, url)
          }
          if (window.LPBInspector && window.LPBInspector.render) window.LPBInspector.render()
          if (window.LPBCanvas    && window.LPBCanvas.render)    window.LPBCanvas.render()
          // salva imediatamente
          try { await LPBuilder.savePage() } catch (_) {}
          LPBToast && LPBToast('Imagem recortada e salva', 'success')
        } catch (err) {
          LPBToast && LPBToast('Erro no envio: ' + err.message, 'error')
          apply.disabled = false
          apply.innerHTML = _ico('check', 14) + ' Aplicar'
        }
      }, 'image/jpeg', 0.92)
    }
  }

  function _aspectBtn(val, label, active) {
    return '<button class="lpb-btn ghost sm' + (active ? ' is-active' : '') + '" data-aspect="' + _esc(val) + '" ' +
      'style="' + (active ? 'background:var(--lpb-accent);color:#1A1A1C' : '') + '">' +
      _esc(label) + '</button>'
  }

  window.LPBImageCrop = { openForField: openForField }
})()
