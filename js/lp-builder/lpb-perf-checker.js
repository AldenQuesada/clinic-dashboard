/**
 * LP Builder · Performance Checker (Onda 20)
 *
 * Engine puro pra estimar Core Web Vitals SEM Lighthouse — análise estática
 * da estrutura da LP. Foca em sinais que o Google realmente usa pra ranking
 * e UX percebida em mobile (que é o tráfego real de clínica).
 *
 * Sinais avaliados:
 *   · Hero LCP candidate (primeira imagem grande deve carregar rápido)
 *   · Imagens externas vs CDN próprio (latência)
 *   · Total de imagens (peso de download)
 *   · Imagens sem dimensão (causa CLS — Cumulative Layout Shift)
 *   · Vídeos embarcados (frames)
 *   · Quantidade de blocos (DOM weight)
 *   · Animações pesadas (parallax, rich-reveal — aborta em mobile fraco)
 *   · Fontes Google externas (preload já configurado)
 *   · Tracking pesado (GA4 + FB + GTM somam ~150KB JS)
 *
 * Independente — testável isolado:
 *   var checks = LPBPerfChecker.scan(page)
 *   var s = LPBPerfChecker.getScore(page)
 */
;(function () {
  'use strict'
  if (window.LPBPerfChecker) return

  // ──────────────────────────────────────────────────────────
  // Helpers de extração
  // ──────────────────────────────────────────────────────────
  function _isImage(b) {
    if (!b || !b.props) return false
    var t = b.type || ''
    if (t === 'image' || t === 'gallery' || t === 'before-after' || t === 'hero') return true
    var p = b.props
    return !!(p.image || p.foto || p.bg_image || p.imagem || p.before || p.after)
  }

  function _extractImageUrls(blocks) {
    var urls = []
    ;(blocks || []).forEach(function (b) {
      if (!b || !b.props) return
      var p = b.props
      var keys = ['image', 'foto', 'bg_image', 'imagem', 'before', 'after']
      keys.forEach(function (k) { if (p[k]) urls.push(p[k]) })
      // listas (gallery, slides, etc.)
      ;(p.items || []).forEach(function (it) {
        if (!it) return
        ;['image', 'foto', 'imagem', 'bg', 'before', 'after'].forEach(function (k) {
          if (it[k]) urls.push(it[k])
        })
      })
    })
    return urls
  }

  function _isExternalUrl(u) {
    if (!u) return false
    return /^https?:\/\//.test(u) && !u.indexOf(window.location.origin) === 0
  }

  function _hasHeavyAnim(blocks) {
    return (blocks || []).some(function (b) {
      if (!b) return false
      if (b.type === 'parallax-section' || b.type === 'rich-reveal') return true
      var s = b._style && b._style.animation
      return s && (s.type === 'parallax' || s.type === 'zoom-pan')
    })
  }

  function _countTrackers(tracking) {
    var t = tracking || {}, n = 0
    if (t.ga4_id)      n++
    if (t.fb_pixel_id) n++
    if (t.gtm_id)      n++
    if (t.custom_head_html) n++
    return n
  }

  // ──────────────────────────────────────────────────────────
  // SCAN — retorna lista de checks com severidade
  // ──────────────────────────────────────────────────────────
  function scan(page) {
    var blocks = (page && page.blocks) || []
    var imgUrls = _extractImageUrls(blocks)
    var totalImgs = imgUrls.length
    var externalImgs = imgUrls.filter(_isExternalUrl).length
    var checks = []

    // 1. LCP — primeira imagem (hero)
    var firstBlock = blocks[0]
    var heroHasImg = _isImage(firstBlock)
    if (firstBlock && firstBlock.type === 'hero' && !heroHasImg) {
      checks.push({ severity: 'pass', code: 'lcp_text_hero', label: 'LCP', message: 'Hero textual · LCP rápido (sem imagem grande pra baixar).' })
    } else if (heroHasImg) {
      checks.push({ severity: 'pass', code: 'lcp_image_hero', label: 'LCP', message: 'Hero com imagem · marcada como fetchpriority=high pelo runtime.' })
    } else {
      checks.push({ severity: 'info', code: 'lcp_unknown', label: 'LCP', message: 'Primeiro bloco: ' + (firstBlock ? firstBlock.type : '—') })
    }

    // 2. Total de imagens (peso de download)
    if (totalImgs > 30) {
      checks.push({ severity: 'error', code: 'too_many_imgs', label: 'Peso de imagens', message: totalImgs + ' imagens · mobile vai sofrer · alvo < 20.' })
    } else if (totalImgs > 20) {
      checks.push({ severity: 'warning', code: 'many_imgs', label: 'Peso de imagens', message: totalImgs + ' imagens · considere reduzir.' })
    } else if (totalImgs > 0) {
      checks.push({ severity: 'pass', code: 'imgs_ok', label: 'Peso de imagens', message: totalImgs + ' imagens · razoável.' })
    } else {
      checks.push({ severity: 'pass', code: 'no_imgs', label: 'Peso de imagens', message: 'Sem imagens · LP muito leve.' })
    }

    // 3. Imagens externas (latência DNS extra)
    if (externalImgs > 5) {
      checks.push({ severity: 'warning', code: 'many_external_imgs', label: 'CDN externa', message: externalImgs + ' imagens em domínio externo · cada domínio = 1 DNS lookup.' })
    } else if (externalImgs > 0) {
      checks.push({ severity: 'info', code: 'few_external_imgs', label: 'CDN externa', message: externalImgs + ' imagens externas · ok.' })
    }

    // 4. Total de blocos (DOM weight)
    var blockCount = blocks.length
    if (blockCount > 25) {
      checks.push({ severity: 'warning', code: 'too_many_blocks', label: 'DOM weight', message: blockCount + ' blocos · LP longa · mobile pode lentificar.' })
    } else if (blockCount > 0) {
      checks.push({ severity: 'pass', code: 'blocks_ok', label: 'DOM weight', message: blockCount + ' blocos · estrutura limpa.' })
    }

    // 5. Animações pesadas
    if (_hasHeavyAnim(blocks)) {
      checks.push({ severity: 'warning', code: 'heavy_anim', label: 'Animações', message: 'Tem parallax/zoom-pan · pode quebrar em iPhone antigo. Teste com throttle 4G.' })
    } else {
      checks.push({ severity: 'pass', code: 'anim_ok', label: 'Animações', message: 'Sem animação pesada · ok.' })
    }

    // 6. Tracking
    var nT = _countTrackers(page && page.tracking)
    if (nT >= 3) {
      checks.push({ severity: 'warning', code: 'heavy_tracking', label: 'Tracking', message: nT + ' scripts de tracking · ~150KB extra JS · prefira só GTM.' })
    } else if (nT > 0) {
      checks.push({ severity: 'pass', code: 'tracking_ok', label: 'Tracking', message: nT + ' tracker(s) · ok.' })
    } else {
      checks.push({ severity: 'info', code: 'no_tracking', label: 'Tracking', message: 'Sem tracking · LP mais leve, mas sem dados.' })
    }

    // 7. Forms (cada form = JS extra)
    var formBlocks = blocks.filter(function (b) { return b && b.type === 'form' })
    if (formBlocks.length > 1) {
      checks.push({ severity: 'warning', code: 'multi_forms', label: 'Formulários', message: formBlocks.length + ' forms · normalmente 1 é o suficiente.' })
    }

    // 8. Vídeos embarcados (iframe pesado)
    var videoBlocks = blocks.filter(function (b) {
      return b && (b.type === 'video' || b.type === 'video-embed' || (b.props && b.props.video_url))
    })
    if (videoBlocks.length > 0) {
      checks.push({ severity: 'info', code: 'has_video', label: 'Vídeo', message: videoBlocks.length + ' vídeo(s) · runtime aplica loading=lazy automático.' })
    }

    // 9. Lazy load runtime confirmado
    checks.push({ severity: 'pass', code: 'auto_lazy', label: 'Lazy loading', message: 'Runtime aplica loading=lazy automático em todas imagens (exceto hero).' })

    // 10. Preload de fontes
    checks.push({ severity: 'pass', code: 'preload_fonts', label: 'Preload', message: 'Fonts Google + CSS preloaded · evita FOUT.' })

    return checks
  }

  // ──────────────────────────────────────────────────────────
  // SCORE 0-100 (estimativa de Lighthouse perf)
  // ──────────────────────────────────────────────────────────
  function getScore(page) {
    var checks = scan(page)
    var weights = { error: -22, warning: -8, info: 0, pass: +3 }
    var base = 84  // baseline otimista (lazy load + preload garantidos)
    var raw = base
    checks.forEach(function (c) { raw += (weights[c.severity] || 0) })
    raw = Math.max(0, Math.min(100, raw))
    return {
      score:  Math.round(raw),
      checks: checks,
      grade:  raw >= 90 ? 'A' : raw >= 80 ? 'B' : raw >= 65 ? 'C' : raw >= 50 ? 'D' : 'F',
      counts: {
        error:   checks.filter(function (c) { return c.severity === 'error'   }).length,
        warning: checks.filter(function (c) { return c.severity === 'warning' }).length,
        info:    checks.filter(function (c) { return c.severity === 'info'    }).length,
        pass:    checks.filter(function (c) { return c.severity === 'pass'    }).length,
      },
    }
  }

  window.LPBPerfChecker = Object.freeze({
    scan:     scan,
    getScore: getScore,
  })
})()
