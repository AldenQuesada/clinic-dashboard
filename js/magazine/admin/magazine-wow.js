/* ============================================================================
 * Beauty & Health Magazine — WOW effects
 *
 * 3 features:
 *   1. readingTime: estimativa de tempo total de leitura (palavras / WPM)
 *   2. heatmapOverlay: zonas quentes estilo padrão F sobrepostas ao preview
 *   3. dynamicPalette: extrai cor dominante da foto de capa (canvas sampling)
 *      e aplica como --mp-accent no documento/iframe
 *
 * Expõe: window.MagazineAdmin.Wow
 *   - readingTime.compute(pages) → { totalWords, minutes, seconds, label }
 *   - heatmapOverlay.mount(host), .attach(container, mode), .detach(container)
 *   - dynamicPalette.extract(imgUrl) → Promise<hex>
 *   - dynamicPalette.applyToDoc(doc, hex)
 * ============================================================================ */
;(function () {
  'use strict'

  const WPM = 200 // palavras por minuto (leitura casual)

  // ── Reading time ───────────────────────────────────────────────────────
  function countWordsInSlots(slots) {
    if (!slots) return 0
    let total = 0
    Object.values(slots).forEach(v => {
      if (typeof v === 'string') {
        total += v.trim() ? v.trim().split(/\s+/).length : 0
      } else if (Array.isArray(v)) {
        v.forEach(item => {
          if (typeof item === 'string') {
            total += item.trim() ? item.trim().split(/\s+/).length : 0
          } else if (item && typeof item === 'object') {
            Object.values(item).forEach(sub => {
              if (typeof sub === 'string') total += sub.trim() ? sub.trim().split(/\s+/).length : 0
            })
          }
        })
      }
    })
    return total
  }

  function computeReadingTime(pages) {
    const totalWords = (pages || []).reduce((acc, p) => acc + countWordsInSlots(p.slots), 0)
    const totalMinutes = totalWords / WPM
    const minutes = Math.floor(totalMinutes)
    const seconds = Math.round((totalMinutes - minutes) * 60)
    const label = minutes > 0
      ? `${minutes}min${seconds ? ' ' + seconds + 's' : ''}`
      : `${seconds}s`
    return { totalWords, minutes, seconds, label }
  }

  // ── Heatmap overlay (padrão F + zonas de atenção) ──────────────────────
  // Zonas típicas: topo-esquerdo (primeiro olhar), centro-título, CTA inferior
  const HEATMAP_ZONES = [
    { x: 12, y: 18, r: 22, weight: 1.0 },   // topo-esquerdo (onde olho pousa)
    { x: 50, y: 32, r: 28, weight: 0.85 },  // centro-superior (hero/título)
    { x: 28, y: 58, r: 18, weight: 0.55 },  // meio-esquerdo (lede)
    { x: 72, y: 72, r: 14, weight: 0.65 },  // inferior-direito (CTA comum)
  ]

  function renderHeatmapSVG() {
    const gradients = HEATMAP_ZONES.map((z, i) => `
      <radialGradient id="hmz${i}" cx="${z.x}%" cy="${z.y}%" r="${z.r}%">
        <stop offset="0%"   stop-color="rgba(255, 70, 70, ${0.55 * z.weight})"/>
        <stop offset="60%"  stop-color="rgba(255, 180, 70, ${0.18 * z.weight})"/>
        <stop offset="100%" stop-color="rgba(255, 180, 70, 0)"/>
      </radialGradient>
    `).join('')
    const rects = HEATMAP_ZONES.map((_, i) => `<rect width="100%" height="100%" fill="url(#hmz${i})"/>`).join('')
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" preserveAspectRatio="none">
      <defs>${gradients}</defs>
      ${rects}
    </svg>`
  }

  function attachHeatmap(container) {
    if (!container) return
    if (container.querySelector('.wow-heatmap')) return
    const layer = document.createElement('div')
    layer.className = 'wow-heatmap'
    layer.innerHTML = renderHeatmapSVG()
    container.appendChild(layer)
  }

  function detachHeatmap(container) {
    if (!container) return
    const layer = container.querySelector('.wow-heatmap')
    if (layer) layer.remove()
  }

  // ── Dynamic palette (cor dominante via canvas sampling) ────────────────
  async function extractDominantColor(imgUrl) {
    return new Promise((resolve, reject) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas')
          const size = 80 // sample baixo é mais rápido + suave
          canvas.width = size; canvas.height = size
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, size, size)
          const data = ctx.getImageData(0, 0, size, size).data
          const buckets = {}
          for (let i = 0; i < data.length; i += 16) {
            const r = data[i], g = data[i+1], b = data[i+2], a = data[i+3]
            if (a < 200) continue
            // ignora branco/preto puro
            if ((r + g + b) / 3 > 240) continue
            if ((r + g + b) / 3 < 20) continue
            // quantiza p/ bucket de 32
            const key = [Math.round(r/32)*32, Math.round(g/32)*32, Math.round(b/32)*32].join(',')
            buckets[key] = (buckets[key] || 0) + 1
          }
          const top = Object.entries(buckets).sort((a, b) => b[1] - a[1])[0]
          if (!top) return resolve(null)
          const [r, g, b] = top[0].split(',').map(Number)
          // Escurece um pouco para contraste editorial
          const darken = (n) => Math.max(0, Math.round(n * 0.72))
          const hex = '#' + [darken(r), darken(g), darken(b)].map(n => n.toString(16).padStart(2, '0')).join('')
          resolve(hex)
        } catch (e) { reject(e) }
      }
      img.onerror = () => reject(new Error('Falha ao carregar imagem'))
      img.src = imgUrl
    })
  }

  function applyPaletteToDoc(doc, hex) {
    if (!doc || !hex) return
    const style = doc.createElement('style')
    style.id = 'wow-palette'
    style.textContent = `:root { --mp-accent: ${hex} !important; }`
    const old = doc.getElementById('wow-palette')
    if (old) old.remove()
    doc.head ? doc.head.appendChild(style) : doc.documentElement.appendChild(style)
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.Wow = {
    readingTime: { compute: computeReadingTime },
    heatmapOverlay: { attach: attachHeatmap, detach: detachHeatmap },
    dynamicPalette: { extract: extractDominantColor, applyToDoc: applyPaletteToDoc },
  }
})()
