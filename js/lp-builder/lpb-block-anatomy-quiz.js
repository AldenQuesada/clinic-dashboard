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
  // Fotos reais (Supabase Storage · uploaded 2026-04-19 · enquadramento amplo)
  // ──────────────────────────────────────────────────────────
  // BASE = ANTES (carrega primeiro · com sinais) · BEFORE_PROP = DEPOIS (toggle revela)
  var PHOTO_FRONT_BASE   = 'https://oqboitkpcvuaudouwvkl.supabase.co/storage/v1/object/public/lp-assets/anatomy/front-old.png'    // 55+ com sinais (DEFAULT)
  var PHOTO_FRONT_BEFORE = 'https://oqboitkpcvuaudouwvkl.supabase.co/storage/v1/object/public/lp-assets/anatomy/front-young.png'  // 40+ jovial (toggle "Ver depois")
  var PHOTO_SIDE_BASE    = 'https://oqboitkpcvuaudouwvkl.supabase.co/storage/v1/object/public/lp-assets/anatomy/side-old.png'     // perfil 55+ (default)
  var PHOTO_SIDE_BEFORE  = 'https://oqboitkpcvuaudouwvkl.supabase.co/storage/v1/object/public/lp-assets/anatomy/side-young.png'   // perfil 40+ (toggle)

  // ──────────────────────────────────────────────────────────
  // Áreas anatômicas separadas por VISTA (frontal · perfil)
  // Coordenadas percentuais (x: 0-100 esq→dir · y: 0-100 topo→base)
  // Calibrado pro novo enquadramento: testa visível no topo + pescoço base
  // ──────────────────────────────────────────────────────────
  var AREAS_FRONT = Object.freeze({
    testa:              { label: 'Testa',                protocol: 'Toxina botulínica (linhas frontais)',         hotspots: [[50, 16]] },
    entre_sobrancelhas: { label: 'Entre sobrancelhas',   protocol: 'Toxina botulínica (linha do leão)',           hotspots: [[50, 26]] },
    pe_de_galinha:      { label: 'Pés de galinha',       protocol: 'Toxina botulínica (canto dos olhos)',         hotspots: [[20, 33], [80, 33]] },
    olheiras:           { label: 'Olheiras',             protocol: 'Smooth Eyes (laser fracionado + AH)',         hotspots: [[37, 38], [63, 38]] },
    bochechas:          { label: 'Volume de bochecha',   protocol: 'Volumização com AH (área zigomática)',        hotspots: [[22, 52], [78, 52]] },
    bigode_chines:      { label: 'Bigode chinês',        protocol: 'Preenchimento sulco nasogeniano com AH',      hotspots: [[36, 63], [64, 63]] },
    codigo_barras:      { label: 'Código de barras',     protocol: 'Toxina botulínica + AH (linhas verticais do lábio superior)', hotspots: [[50, 70]] },
    labios:             { label: 'Lábios',               protocol: 'Preenchimento com AH',                        hotspots: [[50, 73]] },
    linha_marionete:    { label: 'Linha de marionete',   protocol: 'Preenchimento com AH (sulcos das comissuras labiais)', hotspots: [[40, 79], [60, 79]] },
    bulldog:            { label: 'Buldogue (jowls)',     protocol: 'AH + Bioestimulador + Bioremodelador + Fotona 4D',          hotspots: [[22, 82], [78, 82]] },
    mandibular:         { label: 'Mandíbula · contorno', protocol: 'Contorno mandibular com AH',                  hotspots: [[26, 87], [74, 87]] },
  })

  // Calibrado pro novo perfil (rosto olhando pra ESQUERDA · enquadramento amplo)
  var AREAS_SIDE = Object.freeze({
    dorso_nariz:     { label: 'Dorso nasal',          protocol: 'Rinomodelação · AH no dorso',                            hotspots: [[40, 38]] },
    ponta_nariz:     { label: 'Ponta do nariz',       protocol: 'Rinomodelação · projeção da ponta com AH',               hotspots: [[28, 48]] },
    mento:           { label: 'Mento (queixo)',       protocol: 'Preenchimento com AH (mentoplastia injetável)',          hotspots: [[34, 78]] },
    bulldog:         { label: 'Buldogue (jowls)',     protocol: 'AH + Bioestimulador + Bioremodelador + Fotona 4D',       hotspots: [[62, 82]] },
    papada:          { label: 'Papada',               protocol: 'Fotona 4D',                                              hotspots: [[52, 88]] },
  })

  // Mapa unificado pra runtime · merge dos 2 (compatibilidade)
  var AREAS = Object.freeze(Object.assign({}, AREAS_FRONT, AREAS_SIDE))

  // Ícone Feather "user-check" inline · pra header empty-state
  var ICON_USER = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>' +
    '<circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>' +
    '</svg>'

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

    // areasAttr montado DEPOIS do _resolveAreas (mais abaixo · usa areasMerged)
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
    var photoFrontBase   = p.photo_url             || PHOTO_FRONT_BASE
    var photoFrontBefore = p.photo_url_before      || PHOTO_FRONT_BEFORE
    var photoSideBase    = p.photo_url_side        || PHOTO_SIDE_BASE
    var photoSideBefore  = p.photo_url_side_before || PHOTO_SIDE_BEFORE

    // Áreas customizáveis (Camada 1) · convert lista do user → formato AREAS
    function _resolveAreas(items, fallback) {
      if (!Array.isArray(items) || items.length === 0) return fallback
      var out = {}
      items.forEach(function (it, idx) {
        if (!it || !it.label) return
        var x = parseFloat(it.x), y = parseFloat(it.y)
        if (isNaN(x) || isNaN(y)) return
        var key = it.label.toLowerCase()
          .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')
          + '_' + idx
        var spots = [[Math.max(0, Math.min(100, x)), Math.max(0, Math.min(100, y))]]
        if (it.mirror === '1' || it.mirror === 1 || it.mirror === true) {
          spots.push([Math.max(0, Math.min(100, 100 - x)), Math.max(0, Math.min(100, y))])
        }
        out[key] = {
          label:    it.label,
          protocol: it.protocol || '',
          hotspots: spots,
        }
      })
      return Object.keys(out).length ? Object.freeze(out) : fallback
    }
    var areasFront = _resolveAreas(p.areas_front, AREAS_FRONT)
    var areasSide  = _resolveAreas(p.areas_side,  AREAS_SIDE)
    var areasMerged = Object.assign({}, areasFront, areasSide)

    // Mapa label+protocol pro runtime (data-areas no root)
    var areasMap = {}
    Object.keys(areasMerged).forEach(function (k) {
      areasMap[k] = { label: areasMerged[k].label, protocol: areasMerged[k].protocol }
    })
    var areasAttr = _esc(JSON.stringify(areasMap))

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
    // Estado inicial: vista frontal (data-aq-view="front")
    html += '<div class="blk-aq-photo-wrap" data-aq-photo-wrap="1" data-aq-view="front">' +
      // ── VISTA FRONTAL (default visível) ────────────────
      '<div class="aq-view aq-view-front" data-aq-view-pane="front">' +
        '<img class="blk-aq-photo blk-aq-photo-base"   src="' + _esc(photoFrontBase)   + '" alt="Rosto frontal · após cuidados" loading="lazy" decoding="async">' +
        '<img class="blk-aq-photo blk-aq-photo-before" src="' + _esc(photoFrontBefore) + '" alt="Rosto frontal · antes" loading="lazy" decoding="async" style="opacity:0">' +
        _hotspotsHtmlFor(areasFront) +
      '</div>' +
      // ── VISTA PERFIL (oculta inicialmente) ─────────────
      '<div class="aq-view aq-view-side" data-aq-view-pane="side" hidden>' +
        '<img class="blk-aq-photo blk-aq-photo-base"   src="' + _esc(photoSideBase)   + '" alt="Perfil · após cuidados" loading="lazy" decoding="async">' +
        '<img class="blk-aq-photo blk-aq-photo-before" src="' + _esc(photoSideBefore) + '" alt="Perfil · antes" loading="lazy" decoding="async" style="opacity:0">' +
        _hotspotsHtmlFor(areasSide) +
      '</div>' +
      // ── Toggle de VISTA (Frontal/Perfil) · canto top-left
      '<div class="blk-aq-view-tabs" role="tablist" aria-label="Vista do rosto">' +
        '<button class="aq-view-tab is-active" type="button" data-aq-view-btn="front" role="tab">Frontal</button>' +
        '<button class="aq-view-tab"           type="button" data-aq-view-btn="side"  role="tab">Perfil</button>' +
      '</div>' +
      // ── Toggle antes/depois · canto top-right (BASE = antes · toggle revela depois)
      '<button class="blk-aq-toggle" type="button" data-aq-toggle="1" aria-label="Alternar antes/depois">' +
        '<span class="aq-tog-label" data-aq-tog-label>Ver depois</span>' +
      '</button>' +
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
  // Aceita AREAS específico (FRONT ou SIDE) pra renderizar separado
  // ──────────────────────────────────────────────────────────
  function _hotspotsHtmlFor(areas) {
    var html = ''
    Object.keys(areas).forEach(function (key) {
      var a = areas[key]
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
    render:      render,
    AREAS:       AREAS,
    AREAS_FRONT: AREAS_FRONT,
    AREAS_SIDE:  AREAS_SIDE,
  })
})()
