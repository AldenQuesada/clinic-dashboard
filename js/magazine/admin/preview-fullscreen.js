/* ============================================================================
 * Beauty & Health Magazine — Preview Full-Screen (multi-página + segmento)
 *
 * Overlay full-viewport com navegação entre páginas + simulação de segmento.
 * Respeita segment_scope: quando usuário escolhe VIP/at_risk/etc., filtra
 * páginas como o leitor real filtraria.
 *
 * Expõe: window.MagazineAdmin.PreviewFullscreen
 *   - mount(host) → controller { open(payload), close }
 *
 * payload:
 *   - pages: [{id, template_slug, slots, segment_scope}]
 *   - currentIndex: índice inicial (do array pages original)
 *   - css: CSS dos templates embutido
 *   - renderPage: (page) => html string (renderizador injetado)
 *   - editionTitle?: string
 * ============================================================================ */
;(function () {
  'use strict'

  const SEGMENTS = [
    { key: 'all',     label: 'Ver tudo' },
    { key: 'vip',     label: 'VIP' },
    { key: 'active',  label: 'Ativo' },
    { key: 'at_risk', label: 'Em risco' },
    { key: 'dormant', label: 'Dormente' },
    { key: 'lead',    label: 'Lead' },
  ]

  function mount(host) {
    host.innerHTML = `
      <div class="fsp-overlay" data-open="0">
        <div class="fsp-head">
          <div class="fsp-title" data-role="title">Preview</div>
          <div class="fsp-seg" data-role="segments">
            ${SEGMENTS.map(s => `
              <button type="button" class="fsp-seg-btn" data-seg="${s.key}" data-active="${s.key === 'all' ? '1' : '0'}">${s.label}</button>
            `).join('')}
          </div>
          <div class="fsp-actions">
            <button type="button" class="fsp-nav"      data-act="prev"  title="Página anterior (←)">‹</button>
            <span class="fsp-counter" data-role="counter">0 / 0</span>
            <button type="button" class="fsp-nav"      data-act="next"  title="Próxima (→)">›</button>
            <span class="fsp-sep"></span>
            <button type="button" class="fsp-mode-btn" data-mode="desktop" data-active="1">Desktop</button>
            <button type="button" class="fsp-mode-btn" data-mode="mobile">Mobile</button>
            <button type="button" class="fsp-close"    data-act="close" title="Fechar (ESC)">×</button>
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
    const counterEl = host.querySelector('[data-role="counter"]')
    const frame   = host.querySelector('[data-role="frame"]')
    const iframe  = host.querySelector('[data-role="iframe"]')
    const segEl   = host.querySelector('[data-role="segments"]')

    let ctx = null // { pages, css, renderPage, editionTitle, segment, visiblePages, visibleIdx }

    host.querySelector('[data-act="close"]').addEventListener('click', close)
    host.querySelector('[data-act="prev"]').addEventListener('click', () => nav(-1))
    host.querySelector('[data-act="next"]').addEventListener('click', () => nav( 1))
    host.querySelectorAll('.fsp-mode-btn').forEach(btn => {
      btn.addEventListener('click', () => setMode(btn.dataset.mode))
    })
    segEl.querySelectorAll('.fsp-seg-btn').forEach(btn => {
      btn.addEventListener('click', () => setSegment(btn.dataset.seg))
    })
    document.addEventListener('keydown', (e) => {
      if (overlay.dataset.open !== '1') return
      if (e.key === 'Escape')    { e.preventDefault(); close() }
      if (e.key === 'ArrowLeft') { e.preventDefault(); nav(-1) }
      if (e.key === 'ArrowRight'){ e.preventDefault(); nav( 1) }
    })

    function pageVisibleInSegment(page, segment) {
      if (segment === 'all') return true
      const scope = Array.isArray(page.segment_scope) && page.segment_scope.length
        ? page.segment_scope : ['all']
      return scope.includes('all') || scope.includes(segment)
    }

    function rebuildVisible() {
      if (!ctx) return
      ctx.visiblePages = ctx.pages.filter(p => pageVisibleInSegment(p, ctx.segment))
      // Tenta preservar posição no visível mais próxima da página atual
      const curId = ctx.pages[ctx.currentIndex]?.id
      let idx = ctx.visiblePages.findIndex(p => p.id === curId)
      if (idx < 0) idx = 0
      ctx.visibleIdx = idx
    }

    function setSegment(seg) {
      if (!ctx) return
      ctx.segment = seg
      segEl.querySelectorAll('.fsp-seg-btn').forEach(b => {
        b.dataset.active = b.dataset.seg === seg ? '1' : '0'
      })
      rebuildVisible()
      render()
    }

    function setMode(mode) {
      frame.classList.toggle('desktop', mode === 'desktop')
      frame.classList.toggle('mobile',  mode === 'mobile')
      host.querySelectorAll('.fsp-mode-btn').forEach(b => {
        b.dataset.active = b.dataset.mode === mode ? '1' : '0'
      })
      render()
    }

    function nav(delta) {
      if (!ctx || !ctx.visiblePages.length) return
      ctx.visibleIdx = Math.max(0, Math.min(ctx.visiblePages.length - 1, ctx.visibleIdx + delta))
      // Sincroniza currentIndex no array original
      const p = ctx.visiblePages[ctx.visibleIdx]
      if (p) {
        const origIdx = ctx.pages.findIndex(x => x.id === p.id)
        if (origIdx >= 0) ctx.currentIndex = origIdx
      }
      render()
    }

    function render() {
      if (!ctx) return
      const n = ctx.visiblePages.length
      if (!n) {
        iframe.srcdoc = emptyDoc(`Nenhuma página visível para <strong>${escapeHtml(segLabel(ctx.segment))}</strong>.`)
        counterEl.textContent = `0 / 0`
        titleEl.textContent = ctx.editionTitle || 'Preview'
        return
      }
      counterEl.textContent = `${ctx.visibleIdx + 1} / ${n}`
      const page = ctx.visiblePages[ctx.visibleIdx]
      const html = ctx.renderPage(page)
      const sectionName = page._sectionName || page.template_slug
      titleEl.textContent = `${sectionName}${ctx.editionTitle ? ' · ' + ctx.editionTitle : ''}`

      const isMobile = frame.classList.contains('mobile')
      const nat = isMobile ? { w: 390, h: 720 } : { w: 1440, h: 900 }
      iframe.srcdoc = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Inter:wght@300;400;500;600;700&family=Great+Vibes&display=swap" rel="stylesheet"/>
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

    function emptyDoc(msg) {
      return `<!doctype html><html><body style="margin:0;display:grid;place-items:center;height:100vh;font-family:'Playfair Display',serif;color:#8a8178;padding:40px;text-align:center;font-size:22px;line-height:1.4;">${msg}</body></html>`
    }

    function segLabel(k) { return (SEGMENTS.find(s => s.key === k) || {}).label || k }

    function escapeHtml(s) {
      if (s == null) return ''
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    }

    function open(payload) {
      ctx = {
        pages: (payload.pages || []).slice(),
        css: payload.css || '',
        renderPage: payload.renderPage || (() => ''),
        editionTitle: payload.editionTitle || '',
        segment: payload.segment || 'all',
        currentIndex: Math.max(0, Math.min((payload.pages || []).length - 1, payload.currentIndex || 0)),
        visiblePages: [],
        visibleIdx: 0,
      }
      // Reset segmento na UI
      segEl.querySelectorAll('.fsp-seg-btn').forEach(b => {
        b.dataset.active = b.dataset.seg === ctx.segment ? '1' : '0'
      })
      rebuildVisible()
      overlay.dataset.open = '1'
      document.body.style.overflow = 'hidden'
      render()
    }

    function close() {
      overlay.dataset.open = '0'
      document.body.style.overflow = ''
      ctx = null
      iframe.srcdoc = ''
    }

    return { open, close }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.PreviewFullscreen = { mount }
})()
