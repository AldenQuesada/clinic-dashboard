/**
 * LP Builder · Block Render: anatomy-quiz (Onda 29 · carro-chefe de conversão)
 *
 * Quiz facial interativo onde o paciente clica em áreas do rosto SVG
 * que quer melhorar. No final coleta WhatsApp com contexto rico das
 * áreas selecionadas (anatomy.areas + anatomy.priority).
 *
 * Renderer puro (zero side-effects · zero binding):
 *   · SVG editorial monoline (rosto neutro frontal · viewBox 400×500)
 *   · 8 áreas anatômicas com hotspots (circle data-area="...")
 *   · Painel lateral com pills das áreas selecionadas
 *   · Botão sticky "Ver meu protocolo" (abre modal com form WA)
 *
 * Binding de cliques + form + cooldown + RPC fica em
 * lpb-anatomy-quiz-runtime.js (Runtime separado · separação de concerns).
 *
 *   LPBBlockAnatomyQuiz.render(block) → string HTML
 *   LPBBlockAnatomyQuiz.AREAS         → metadados das 8 áreas (label + protocolo)
 */
;(function () {
  'use strict'
  if (window.LPBBlockAnatomyQuiz) return

  // ──────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }
  function _multiline(s) {
    return _esc(s).replace(/\n/g, '<br>')
  }
  function _uid() {
    return 'aq_' + Math.random().toString(36).slice(2, 10)
  }

  // ──────────────────────────────────────────────────────────
  // Fotos reais (Supabase Storage · uploaded 2026-04-19)
  // Progressão de envelhecimento da MESMA pessoa
  // ──────────────────────────────────────────────────────────
  var PHOTO_BASE   = 'https://oqboitkpcvuaudouwvkl.supabase.co/storage/v1/object/public/lp-assets/anatomy/02.jpg'  // 40+ jovial (default)
  var PHOTO_BEFORE = 'https://oqboitkpcvuaudouwvkl.supabase.co/storage/v1/object/public/lp-assets/anatomy/03.jpg'  // 55+ com sinais
  var PHOTO_YOUNG  = 'https://oqboitkpcvuaudouwvkl.supabase.co/storage/v1/object/public/lp-assets/anatomy/01.jpg'  // 30+

  // ──────────────────────────────────────────────────────────
  // Áreas anatômicas (coordenadas percentuais sobre a foto · responsivo)
  // x: 0-100 (esquerda→direita) · y: 0-100 (topo→base)
  // Foto crop fechado · só rosto frontal (sem pescoço completo)
  // ──────────────────────────────────────────────────────────
  // Coordenadas calibradas pra foto 02.jpg (frontal · crop fechado a partir das sobrancelhas)
  var AREAS = Object.freeze({
    entre_sobrancelhas: { label: 'Entre sobrancelhas', protocol: 'Toxina botulínica (linha do leão)',     hotspots: [[50, 14]] },
    pe_de_galinha:   { label: 'Pés de galinha',       protocol: 'Toxina botulínica (canto dos olhos)',    hotspots: [[15, 23], [85, 23]] },
    olheiras:        { label: 'Olheiras',             protocol: 'Smooth Eyes (laser fracionado + AH)',    hotspots: [[35, 29], [65, 29]] },
    bochechas:       { label: 'Volume de bochecha',   protocol: 'Volumização com AH (área zigomática)',   hotspots: [[18, 46], [82, 46]] },
    bigode_chines:   { label: 'Bigode chinês',        protocol: 'Preenchimento sulco nasogeniano com AH', hotspots: [[33, 62], [67, 62]] },
    labios:          { label: 'Lábios',               protocol: 'Preenchimento com AH',                   hotspots: [[50, 77]] },
    mandibular:      { label: 'Mandíbula · contorno', protocol: 'Contorno mandibular com AH',             hotspots: [[24, 92], [76, 92]] },
  })

  // Ícone Feather "user-check" inline · pra header empty-state
  var ICON_USER = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>' +
    '<circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>' +
    '</svg>'

  // ──────────────────────────────────────────────────────────
  // SVG do rosto neutro · monoline editorial (sem detalhes étnicos)
  // ──────────────────────────────────────────────────────────
  function _faceSvg(uid) {
    var paths =
      // Contorno do rosto (oval suave, mais alongado embaixo)
      '<path class="aq-face-contour" d="M 200 80 ' +
        'C 130 80, 90 130, 90 200 ' +     // testa esquerda → têmpora
        'C 90 250, 95 290, 110 330 ' +    // descida lateral esquerda
        'C 125 380, 150 420, 200 435 ' +  // mandíbula esquerda → queixo
        'C 250 420, 275 380, 290 330 ' +  // mandíbula direita
        'C 305 290, 310 250, 310 200 ' +  // descida lateral direita
        'C 310 130, 270 80, 200 80 Z" />' +
      // Pescoço (linhas laterais leves)
      '<path class="aq-face-neck" d="M 165 430 L 158 488" />' +
      '<path class="aq-face-neck" d="M 235 430 L 242 488" />' +
      // Sobrancelhas (arcos suaves)
      '<path class="aq-face-brow" d="M 130 175 Q 160 165, 188 175" />' +
      '<path class="aq-face-brow" d="M 212 175 Q 240 165, 270 175" />' +
      // Olhos (elipses neutras)
      '<ellipse class="aq-face-eye" cx="160" cy="200" rx="14" ry="6" />' +
      '<ellipse class="aq-face-eye" cx="240" cy="200" rx="14" ry="6" />' +
      // Nariz (linha em V suave)
      '<path class="aq-face-nose" d="M 200 215 L 190 280 Q 200 290, 210 280 L 200 215" />' +
      // Lábios (curva discreta)
      '<path class="aq-face-lips" d="M 175 335 Q 200 325, 225 335 Q 200 345, 175 335 Z" />' +
      // Linha do queixo (sutil interno)
      '<path class="aq-face-chin" d="M 175 405 Q 200 415, 225 405" />'
    return paths
  }

  // ──────────────────────────────────────────────────────────
  // Hotspots SVG · gera <g class="aq-hotspot" data-area="...">
  // ──────────────────────────────────────────────────────────
  function _hotspotsSvg() {
    var html = ''
    Object.keys(AREAS).forEach(function (key) {
      var a = AREAS[key]
      var tip = _esc(a.label + ' · ' + a.protocol)
      a.hotspots.forEach(function (pt, idx) {
        html += '<g class="aq-hotspot" data-area="' + _esc(key) + '"' +
                ' role="button" tabindex="0"' +
                ' aria-label="' + tip + '">' +
          // hit area maior (32px) · invisível
          '<circle class="aq-hit"  cx="' + pt[0] + '" cy="' + pt[1] + '" r="22" />' +
          // marcador visual (16px)
          '<circle class="aq-dot"  cx="' + pt[0] + '" cy="' + pt[1] + '" r="16" />' +
          // checkmark interno (visível só quando .is-selected)
          '<path class="aq-check" d="M ' + (pt[0] - 6) + ' ' + pt[1] +
                ' L ' + (pt[0] - 1) + ' ' + (pt[1] + 5) +
                ' L ' + (pt[0] + 7) + ' ' + (pt[1] - 4) + '"' +
                ' fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />' +
          // tooltip nativo via <title>
          '<title>' + tip + '</title>' +
        '</g>'
      })
    })
    return html
  }

  // ──────────────────────────────────────────────────────────
  // Render principal
  // ──────────────────────────────────────────────────────────
  function render(block) {
    var p           = (block && block.props) || {}
    var bg          = p.bg || 'ivory'
    var eyebrow     = p.eyebrow     || 'Quiz personalizado · 60 segundos'
    var headline    = p.headline    || 'Onde você quer mais cuidado?'
    var subtitle    = p.subtitle    || 'Toque nas áreas do rosto · receba um protocolo personalizado da Dra. Mirian'
    var ctaLabel    = p.cta_label   || 'Ver meu protocolo'
    var successText = p.success_text || 'Recebemos. A Dra. Mirian vai entrar em contato no WhatsApp em breve.'
    var uid         = _uid()

    // Areas JSON pra runtime ler (label + protocolo) sem precisar
    // re-importar este módulo. Atributo data-areas no root.
    var areasMap = {}
    Object.keys(AREAS).forEach(function (k) {
      areasMap[k] = { label: AREAS[k].label, protocol: AREAS[k].protocol }
    })
    var areasAttr = _esc(JSON.stringify(areasMap))
    var successAttr = _esc(successText)

    // Botão · usa LPBButtonLegacy se disponível (estilo champagne)
    var btnHtml
    if (window.LPBButtonLegacy) {
      btnHtml = LPBButtonLegacy.render({
        label: ctaLabel,
        url: '#',
        style: 'champagne',
      })
      // Substitui href="#" por data-action pra runtime interceptar
      btnHtml = btnHtml.replace('<a ', '<a data-aq-cta="1" ')
    } else {
      btnHtml = '<a class="blk-aq-cta" href="#" data-aq-cta="1"><span>' + _esc(ctaLabel) + '</span></a>'
    }

    // URLs configuráveis via props (defaults = fotos do Supabase)
    var photoBase   = p.photo_url        || PHOTO_BASE
    var photoBefore = p.photo_url_before || PHOTO_BEFORE

    var html = '<section class="blk-aq" data-bg="' + _esc(bg) + '"' +
               ' id="' + uid + '"' +
               ' data-aq-root="1"' +
               ' data-areas="' + areasAttr + '"' +
               ' data-success="' + successAttr + '">'

    // Header textual
    html += '<header class="blk-aq-head">'
    if (eyebrow)  html += '<div class="blk-aq-eyebrow">' + _esc(eyebrow) + '</div>'
    if (headline) html += '<h2 class="blk-aq-headline">' + _multiline(headline) + '</h2>'
    if (subtitle) html += '<p class="blk-aq-subtitle">' + _esc(subtitle) + '</p>'
    html += '</header>'

    // Grid: foto interativa esquerda · painel direita
    html += '<div class="blk-aq-grid">'

    // Coluna foto (relative · hotspots absolute %)
    html += '<div class="blk-aq-photo-wrap" data-aq-photo-wrap="1">' +
      // 2 fotos sobrepostas: BASE (jovial) + BEFORE (com sinais) com opacidade
      '<img class="blk-aq-photo blk-aq-photo-base"   src="' + _esc(photoBase)   + '" alt="Rosto · após cuidados" loading="lazy" decoding="async">' +
      '<img class="blk-aq-photo blk-aq-photo-before" src="' + _esc(photoBefore) + '" alt="Rosto · antes" loading="lazy" decoding="async" style="opacity:0">' +
      // Toggle sutil "antes ↔ depois"
      '<button class="blk-aq-toggle" type="button" data-aq-toggle="1" aria-label="Alternar antes/depois">' +
        '<span class="aq-tog-label" data-aq-tog-label>Ver antes</span>' +
      '</button>' +
      // Hotspots (gerados via _hotspotsHtml com posições %)
      _hotspotsHtml() +
    '</div>'

    // Coluna painel
    html += '<aside class="blk-aq-panel" aria-live="polite">' +
      '<div class="blk-aq-panel-title">Áreas selecionadas</div>' +
      '<ul class="blk-aq-pills" data-aq-pills="1">' +
        '<li class="blk-aq-empty">' + ICON_USER + '<span>Comece marcando uma área no rosto…</span></li>' +
      '</ul>' +
      '<div class="blk-aq-counter" data-aq-counter="1" hidden>0 áreas marcadas</div>' +
    '</aside>'

    html += '</div>'  // grid

    // CTA sticky bottom
    html += '<div class="blk-aq-cta-wrap">' + btnHtml + '</div>'

    html += '</section>'
    return html
  }

  // ──────────────────────────────────────────────────────────
  // Hotspots HTML · botões absolutos com top/left percentuais
  // ──────────────────────────────────────────────────────────
  function _hotspotsHtml() {
    var html = ''
    Object.keys(AREAS).forEach(function (key) {
      var a = AREAS[key]
      var tip = _esc(a.label + ' · ' + a.protocol)
      a.hotspots.forEach(function (pt, idx) {
        html += '<button type="button" class="aq-hotspot" data-area="' + _esc(key) + '"' +
          ' style="left:' + pt[0] + '%; top:' + pt[1] + '%"' +
          ' aria-label="' + tip + '" title="' + tip + '">' +
          '<span class="aq-dot"></span>' +
          '<span class="aq-check">' +
            '<svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<polyline points="2 6 5 9 10 3"/>' +
            '</svg>' +
          '</span>' +
        '</button>'
      })
    })
    return html
  }

  window.LPBBlockAnatomyQuiz = Object.freeze({
    render: render,
    AREAS:  AREAS,
  })
})()
