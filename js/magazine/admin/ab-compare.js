/* ============================================================================
 * Beauty & Health Magazine — A/B Compare
 *
 * Overlay que mostra duas páginas lado a lado (iframes escalados) para
 * comparar variantes de capa, título ou mesma página em segmentos diferentes.
 *
 * Fluxo sugerido:
 *   1. Usuária duplica a página (botão Duplicar no PageControls)
 *   2. Edita a cópia (variante B)
 *   3. Abre A/B Compare pelo botão no topbar → escolhe as 2 páginas
 *   4. Vê lado a lado + pode votar mentalmente qual vai pra publicação
 *
 * Expõe: window.MagazineAdmin.ABCompare
 *   - mount(host) → controller { open({pages, css, renderPage}), close }
 * ============================================================================ */
;(function () {
  'use strict'

  function mount(host) {
    host.innerHTML = `
      <div class="ab-overlay" data-open="0">
        <div class="ab-head">
          <div class="ab-title">A/B · Comparar</div>
          <div class="ab-selectors">
            <label>A:</label>
            <select data-role="selA"></select>
            <label>B:</label>
            <select data-role="selB"></select>
          </div>
          <div class="ab-actions">
            <button class="ab-mode-btn" data-mode="desktop" data-active="1">Desktop</button>
            <button class="ab-mode-btn" data-mode="mobile">Mobile</button>
            <button class="ab-close" data-act="close">×</button>
          </div>
        </div>
        <div class="ab-stage">
          <div class="ab-frame desktop" data-slot="A">
            <div class="ab-side-label">A</div>
            <iframe data-role="iframeA" title="Variante A"></iframe>
          </div>
          <div class="ab-frame desktop" data-slot="B">
            <div class="ab-side-label">B</div>
            <iframe data-role="iframeB" title="Variante B"></iframe>
          </div>
        </div>
      </div>
    `

    const overlay = host.querySelector('.ab-overlay')
    const selA = host.querySelector('[data-role="selA"]')
    const selB = host.querySelector('[data-role="selB"]')
    const iframeA = host.querySelector('[data-role="iframeA"]')
    const iframeB = host.querySelector('[data-role="iframeB"]')
    const frames = host.querySelectorAll('.ab-frame')

    let ctx = null

    host.querySelector('[data-act="close"]').addEventListener('click', close)
    host.querySelectorAll('.ab-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode))
    })
    selA.addEventListener('change', () => renderFrame('A'))
    selB.addEventListener('change', () => renderFrame('B'))
    document.addEventListener('keydown', (e) => {
      if (overlay.dataset.open === '1' && e.key === 'Escape') close()
    })

    function setMode(mode) {
      frames.forEach(f => {
        f.classList.toggle('desktop', mode === 'desktop')
        f.classList.toggle('mobile',  mode === 'mobile')
      })
      host.querySelectorAll('.ab-mode-btn').forEach(b => {
        b.dataset.active = b.dataset.mode === mode ? '1' : '0'
      })
      renderFrame('A'); renderFrame('B')
    }

    function populateSelectors() {
      if (!ctx) return
      const opts = ctx.pages.map((p, idx) =>
        `<option value="${p.id}">${idx + 1}. ${escapeHtml(p._label || p.template_slug)}</option>`
      ).join('')
      selA.innerHTML = opts
      selB.innerHTML = opts
      // Defaults: 1ª e 2ª página (ou selected + next)
      if (ctx.pages[0]) selA.value = ctx.pages[0].id
      if (ctx.pages[1]) selB.value = ctx.pages[1].id
      else if (ctx.pages[0]) selB.value = ctx.pages[0].id
    }

    function renderFrame(side) {
      if (!ctx) return
      const sel = side === 'A' ? selA : selB
      const iframe = side === 'A' ? iframeA : iframeB
      const page = ctx.pages.find(p => p.id === sel.value)
      if (!page) { iframe.srcdoc = ''; return }
      const frame = host.querySelector(`.ab-frame[data-slot="${side}"]`)
      const isMobile = frame.classList.contains('mobile')
      const nat = isMobile ? { w: 390, h: 720 } : { w: 1440, h: 900 }
      const html = ctx.renderPage(page)
      iframe.srcdoc = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Inter:wght@300;400;500;600;700&display=swap" rel="stylesheet"/>
<style>
${ctx.css || ''}
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
      ctx = {
        pages: (payload.pages || []).slice(),
        css: payload.css || '',
        renderPage: payload.renderPage || (() => ''),
      }
      populateSelectors()
      overlay.dataset.open = '1'
      document.body.style.overflow = 'hidden'
      renderFrame('A'); renderFrame('B')
    }

    function close() {
      overlay.dataset.open = '0'
      document.body.style.overflow = ''
      ctx = null
      iframeA.srcdoc = ''; iframeB.srcdoc = ''
    }

    function escapeHtml(s) {
      if (s == null) return ''
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    }

    return { open, close }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.ABCompare = { mount }
})()
