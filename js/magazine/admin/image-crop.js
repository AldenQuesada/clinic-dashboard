/* ============================================================================
 * Beauty & Health Magazine — Image Crop (Cropper.js)
 *
 * Modal que recebe um File e um aspect ratio ('3/4', '16/10', '1/1', etc.),
 * deixa usuária recortar, e retorna Blob PNG/JPG.
 *
 * Dependência: Cropper.js 1.x carregado via CDN no admin.html
 *
 * Expõe: window.MagazineAdmin.ImageCrop
 *   - mount(host) → controller { open({file, aspect, onResult}), close }
 * ============================================================================ */
;(function () {
  'use strict'

  function mount(host) {
    host.innerHTML = `
      <div class="ic-overlay" data-open="0">
        <div class="ic-modal">
          <div class="ic-head">
            <div class="ic-title">Recortar imagem</div>
            <div class="ic-aspect" data-role="aspect">—</div>
            <div class="ic-actions">
              <button type="button" class="ic-btn" data-act="skip"  title="Enviar sem recortar">Pular recorte</button>
              <button type="button" class="ic-btn primary" data-act="save">Aplicar recorte</button>
              <button type="button" class="ic-close" data-act="close" title="Cancelar (ESC)">×</button>
            </div>
          </div>
          <div class="ic-stage">
            <img data-role="img" alt="a recortar" />
          </div>
        </div>
      </div>
    `

    const overlay = host.querySelector('.ic-overlay')
    const img     = host.querySelector('[data-role="img"]')
    const aspectEl= host.querySelector('[data-role="aspect"]')
    let cropper = null
    let ctx = null // { file, aspect, onResult }

    host.querySelector('[data-act="close"]').addEventListener('click', cancel)
    host.querySelector('[data-act="skip"]').addEventListener('click', skip)
    host.querySelector('[data-act="save"]').addEventListener('click', apply)
    document.addEventListener('keydown', (e) => {
      if (overlay.dataset.open !== '1') return
      if (e.key === 'Escape') { e.preventDefault(); cancel() }
      if (e.key === 'Enter')  { e.preventDefault(); apply() }
    })

    function parseAspect(str) {
      if (!str) return NaN
      const [w, h] = String(str).split('/').map(n => parseFloat(n))
      if (!w || !h) return NaN
      return w / h
    }

    function open({ file, aspect, onResult }) {
      if (!window.Cropper) {
        // fallback: sem Cropper.js, usa File direto
        if (typeof onResult === 'function') onResult(file)
        return
      }
      ctx = { file, aspect, onResult }
      aspectEl.textContent = aspect ? `Aspect alvo: ${aspect}` : 'Sem aspect fixo'
      const url = URL.createObjectURL(file)
      img.src = url
      overlay.dataset.open = '1'
      document.body.style.overflow = 'hidden'
      img.onload = () => {
        if (cropper) { cropper.destroy(); cropper = null }
        cropper = new window.Cropper(img, {
          aspectRatio: parseAspect(aspect) || NaN,
          viewMode: 1,
          autoCropArea: 0.9,
          background: true,
          movable: true,
          zoomable: true,
          rotatable: false,
          scalable: false,
          responsive: true,
          checkOrientation: true,
        })
      }
    }

    function cancel() {
      if (ctx && typeof ctx.onResult === 'function') ctx.onResult(null)
      close()
    }

    function skip() {
      if (ctx && typeof ctx.onResult === 'function') ctx.onResult(ctx.file)
      close()
    }

    function apply() {
      if (!cropper || !ctx) return close()
      const canvas = cropper.getCroppedCanvas({ imageSmoothingQuality: 'high', maxWidth: 3000, maxHeight: 3000 })
      const mime = ctx.file.type === 'image/png' ? 'image/png' : 'image/jpeg'
      const quality = mime === 'image/jpeg' ? 0.92 : undefined
      canvas.toBlob((blob) => {
        if (!blob) { close(); return }
        // Preserva nome + injeta sufixo
        const cropped = new File([blob], renameFile(ctx.file.name, '-crop'), { type: mime })
        if (typeof ctx.onResult === 'function') ctx.onResult(cropped)
        close()
      }, mime, quality)
    }

    function renameFile(name, suffix) {
      const dot = name.lastIndexOf('.')
      if (dot < 0) return name + suffix
      return name.slice(0, dot) + suffix + name.slice(dot)
    }

    function close() {
      overlay.dataset.open = '0'
      document.body.style.overflow = ''
      if (cropper) { cropper.destroy(); cropper = null }
      if (img.src && img.src.startsWith('blob:')) URL.revokeObjectURL(img.src)
      img.src = ''
      ctx = null
    }

    return { open, close }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.ImageCrop = { mount }
})()
