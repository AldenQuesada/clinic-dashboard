/* ============================================================================
 * Beauty & Health Magazine — Preview Full-Screen
 *
 * Overlay full-viewport que renderiza o HTML de uma página em iframe escalado
 * (1440×900 desktop ou 390×720 mobile). Fecha com ESC ou botão ×.
 *
 * Expõe: window.MagazineAdmin.PreviewFullscreen
 *   - mount(host) → controller { open({html, css, title, mode}), close }
 * ============================================================================ */
;(function () {
  'use strict'

  function mount(host) {
    host.innerHTML = `
      <div class="fsp-overlay" data-open="0">
        <div class="fsp-head">
          <div class="fsp-title" data-role="title">Preview</div>
          <div class="fsp-actions">
            <button type="button" class="fsp-mode-btn" data-mode="desktop" data-active="1">Desktop</button>
            <button type="button" class="fsp-mode-btn" data-mode="mobile">Mobile</button>
            <button type="button" class="fsp-close" data-act="close" title="Fechar (ESC)">×</button>
          </div>
        </div>
        <div class="fsp-stage">
          <div class="fsp-frame desktop" data-role="frame">
            <iframe data-role="iframe" title="Preview fullscreen"></iframe>
          </div>
        </div>
      </div>
    `

    const overlay = host.querySelector('.fsp-overlay')
    const titleEl = host.querySelector('[data-role="title"]')
    const frame   = host.querySelector('[data-role="frame"]')
    const iframe  = host.querySelector('[data-role="iframe"]')
    let lastRender = null

    host.querySelector('[data-act="close"]').addEventListener('click', close)
    host.querySelectorAll('.fsp-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode))
    })
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.dataset.open === '1') close()
    })

    function setMode(mode) {
      frame.classList.toggle('desktop', mode === 'desktop')
      frame.classList.toggle('mobile',  mode === 'mobile')
      host.querySelectorAll('.fsp-mode-btn').forEach(b => {
        b.dataset.active = b.dataset.mode === mode ? '1' : '0'
      })
      if (lastRender) render(lastRender)
    }

    function render({ html, css, title }) {
      lastRender = { html, css, title }
      if (title) titleEl.textContent = title
      const isMobile = frame.classList.contains('mobile')
      const nat = isMobile ? { w: 390, h: 720 } : { w: 1440, h: 900 }
      iframe.srcdoc = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>
${css || ''}
html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#f4f1ec;}
#stage{width:${nat.w}px;height:${nat.h}px;transform-origin:top left;position:absolute;top:0;left:0;}
#stage>.mp{width:100%;height:100%;}
</style>
</head>
<body>
<div id="stage">${html}</div>
<script>
(function(){
  function fit(){
    var s=document.getElementById('stage');
    var sx=window.innerWidth/${nat.w};
    var sy=window.innerHeight/${nat.h};
    var k=Math.min(sx,sy);
    s.style.transform='scale('+k+')';
    s.style.left=((window.innerWidth-${nat.w}*k)/2)+'px';
    s.style.top=((window.innerHeight-${nat.h}*k)/2)+'px';
  }
  fit();
  window.addEventListener('resize',fit);
})();
<\/script>
</body></html>`
    }

    function open(payload) {
      render(payload || {})
      overlay.dataset.open = '1'
      document.body.style.overflow = 'hidden'
    }

    function close() {
      overlay.dataset.open = '0'
      document.body.style.overflow = ''
      lastRender = null
      iframe.srcdoc = ''
    }

    return { open, close }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.PreviewFullscreen = { mount }
})()
