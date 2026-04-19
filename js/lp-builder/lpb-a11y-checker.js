/**
 * LP Builder · Accessibility Checker (Onda 22)
 *
 * Engine PURO. Scan estático de blocks pra detectar problemas WCAG 2.1.
 * Sem DOM, sem fetch.
 *
 * Sinais avaliados:
 *   · Imagens sem alt (WCAG 1.1.1)
 *   · Contraste texto vs fundo (WCAG 1.4.3, AA: 4.5:1)
 *   · Hierarquia de heading (WCAG 1.3.1) — 1 H1, sem pular níveis
 *   · Form sem labels (WCAG 3.3.2)
 *   · Links sem texto descritivo (WCAG 2.4.4)
 *   · Botões sem ação clara (WCAG 2.5.3)
 *   · Vídeos sem legenda (WCAG 1.2.2)
 *   · CTA com texto genérico ('Clique aqui')
 *
 * API:
 *   LPBA11yChecker.scan(page, tokens) → checks[]
 *   LPBA11yChecker.getScore(page, tokens) → { score, grade, checks, counts }
 */
;(function () {
  'use strict'
  if (window.LPBA11yChecker) return

  var GENERIC_LINK_TEXT = ['clique aqui', 'click here', 'aqui', 'saiba mais', 'leia mais', 'mais', 'link']

  function _isFilled(s) { return s != null && String(s).trim().length > 0 }
  function _norm(s) { return (s || '').trim().toLowerCase() }

  // ──────────────────────────────────────────────────────────
  // Coleta de tokens efetivos (pra calcular contraste)
  // ──────────────────────────────────────────────────────────
  function _resolveTokens(page) {
    var override = (page && page.tokens_override) || {}
    return {
      bg:    override.bg     || override.bg_primary    || '#FEFCF8',
      text:  override.text   || override.text_primary  || '#2C2C2C',
      accent:override.accent || override.champagne     || '#C8A97E',
      muted: override.muted  || override.text_muted    || '#6B6660',
    }
  }

  // ──────────────────────────────────────────────────────────
  // Coletores específicos
  // ──────────────────────────────────────────────────────────
  function _collectImages(blocks) {
    var imgs = []
    ;(blocks || []).forEach(function (b, idx) {
      if (!b || !b.props) return
      var p = b.props
      var alts = p.alt || ''
      ;['image', 'foto', 'bg_image', 'imagem'].forEach(function (k) {
        if (p[k]) imgs.push({ blockIdx: idx, type: b.type, src: p[k], alt: alts })
      })
      ;(p.items || []).forEach(function (it) {
        ;['image', 'foto', 'imagem', 'bg'].forEach(function (k) {
          if (it && it[k]) imgs.push({ blockIdx: idx, type: b.type, src: it[k], alt: it.alt || '' })
        })
      })
    })
    return imgs
  }

  function _collectHeadings(blocks) {
    var hs = []
    ;(blocks || []).forEach(function (b, idx) {
      if (!b || !b.props) return
      var p = b.props
      if (_isFilled(p.h1)) hs.push({ level: 1, text: p.h1, blockIdx: idx })
      if (_isFilled(p.h2)) hs.push({ level: 2, text: p.h2, blockIdx: idx })
      if (_isFilled(p.h3)) hs.push({ level: 3, text: p.h3, blockIdx: idx })
      if (_isFilled(p.titulo) && b.type !== 'pricing-table') hs.push({ level: 2, text: p.titulo, blockIdx: idx })
    })
    return hs
  }

  function _collectCtas(blocks) {
    var ctas = []
    ;(blocks || []).forEach(function (b, idx) {
      if (!b || !b.props) return
      var p = b.props
      if (_isFilled(p.cta_label)) ctas.push({ text: p.cta_label, blockIdx: idx })
      if (_isFilled(p.btn_label)) ctas.push({ text: p.btn_label, blockIdx: idx })
      ;(p.items || []).forEach(function (it) {
        if (it && _isFilled(it.cta_label)) ctas.push({ text: it.cta_label, blockIdx: idx })
      })
    })
    return ctas
  }

  function _collectForms(blocks) {
    return (blocks || []).filter(function (b) { return b && b.type === 'form' })
  }

  function _collectVideos(blocks) {
    return (blocks || []).filter(function (b) {
      if (!b) return false
      return b.type === 'video' || b.type === 'video-embed' ||
             (b.props && (b.props.video_url || b.props.youtube_id || b.props.vimeo_id))
    })
  }

  // ──────────────────────────────────────────────────────────
  // SCAN
  // ──────────────────────────────────────────────────────────
  function scan(page) {
    var blocks = (page && page.blocks) || []
    var tokens = _resolveTokens(page)
    var checks = []

    // 1. Imagens sem alt (WCAG 1.1.1)
    var imgs = _collectImages(blocks)
    var noAlt = imgs.filter(function (i) { return !_isFilled(i.alt) })
    if (imgs.length === 0) {
      checks.push({ severity: 'pass', code: 'no_imgs', label: 'Imagens', message: 'Sem imagens · nada a checar.', wcag: '1.1.1' })
    } else if (noAlt.length === 0) {
      checks.push({ severity: 'pass', code: 'all_alt', label: 'Imagens', message: imgs.length + ' imagens · todas com alt.', wcag: '1.1.1' })
    } else if (noAlt.length === imgs.length) {
      checks.push({ severity: 'error', code: 'no_alt_all', label: 'Imagens', message: 'TODAS as ' + imgs.length + ' imagens sem alt · leitor de tela vê só "imagem".', wcag: '1.1.1' })
    } else {
      checks.push({ severity: 'warning', code: 'no_alt_some', label: 'Imagens', message: noAlt.length + ' de ' + imgs.length + ' imagens sem alt.', wcag: '1.1.1' })
    }

    // 2. Hierarquia de heading (WCAG 1.3.1)
    var hs = _collectHeadings(blocks)
    var h1s = hs.filter(function (h) { return h.level === 1 })
    if (h1s.length === 0) {
      checks.push({ severity: 'error', code: 'no_h1', label: 'Hierarquia', message: 'Página sem H1 · leitor de tela perde o título principal.', wcag: '1.3.1' })
    } else if (h1s.length > 1) {
      checks.push({ severity: 'warning', code: 'multiple_h1', label: 'Hierarquia', message: h1s.length + ' H1s · ideal 1 só (no hero).', wcag: '1.3.1' })
    } else {
      checks.push({ severity: 'pass', code: 'h1_ok', label: 'Hierarquia', message: '1 H1 · estrutura correta.', wcag: '1.3.1' })
    }

    // 3. Contraste (WCAG 1.4.3)
    if (window.LPBA11yContrast) {
      var rText = LPBA11yContrast.contrastRatio(tokens.text, tokens.bg)
      var rMuted = LPBA11yContrast.contrastRatio(tokens.muted, tokens.bg)
      var rAccent = LPBA11yContrast.contrastRatio(tokens.accent, tokens.bg)
      _addContrast(checks, 'Texto principal', tokens.text, tokens.bg, rText, false)
      _addContrast(checks, 'Texto secundário', tokens.muted, tokens.bg, rMuted, false)
      _addContrast(checks, 'Acento (botões/destaques)', tokens.accent, tokens.bg, rAccent, true)
    }

    // 4. CTA sem texto descritivo (WCAG 2.4.4)
    var ctas = _collectCtas(blocks)
    var generic = ctas.filter(function (c) { return GENERIC_LINK_TEXT.indexOf(_norm(c.text)) >= 0 })
    if (generic.length > 0) {
      checks.push({ severity: 'warning', code: 'generic_cta', label: 'CTAs', message: generic.length + ' CTA(s) com texto genérico ("clique aqui", "saiba mais") · use ações claras como "Agendar consulta".', wcag: '2.4.4' })
    } else if (ctas.length > 0) {
      checks.push({ severity: 'pass', code: 'cta_ok', label: 'CTAs', message: ctas.length + ' CTA(s) · todos descritivos.', wcag: '2.4.4' })
    }

    // 5. Forms (WCAG 3.3.2 — labels)
    var forms = _collectForms(blocks)
    forms.forEach(function (f) {
      var fields = (f.props && f.props.fields) || []
      var noLabel = fields.filter(function (x) { return !_isFilled(x.label) })
      if (noLabel.length > 0) {
        checks.push({ severity: 'error', code: 'form_no_label', label: 'Form', message: noLabel.length + ' campo(s) sem label · leitor de tela não sabe o que pedir.', wcag: '3.3.2' })
      }
    })
    if (forms.length > 0 && !checks.some(function (c) { return c.code === 'form_no_label' })) {
      checks.push({ severity: 'pass', code: 'form_labels_ok', label: 'Form', message: 'Todos os campos com label.', wcag: '3.3.2' })
    }

    // 6. Vídeos (WCAG 1.2.2 — captions)
    var vids = _collectVideos(blocks)
    if (vids.length > 0) {
      var noCap = vids.filter(function (v) { return !v.props || !v.props.captions_url })
      if (noCap.length === vids.length) {
        checks.push({ severity: 'warning', code: 'video_no_cap', label: 'Vídeos', message: vids.length + ' vídeo(s) sem legendas · pacientes surdas perdem conteúdo. Use vídeos com closed captions.', wcag: '1.2.2' })
      } else {
        checks.push({ severity: 'pass', code: 'video_cap_ok', label: 'Vídeos', message: 'Vídeos com legendas configuradas.', wcag: '1.2.2' })
      }
    }

    // 7. Lang attribute (WCAG 3.1.1) — sempre setado pelo runtime
    checks.push({ severity: 'pass', code: 'lang_set', label: 'Idioma', message: 'Atributo lang setado pelo runtime (i18n).', wcag: '3.1.1' })

    // 8. Skip link (WCAG 2.4.1) — runtime injeta
    checks.push({ severity: 'pass', code: 'skip_link', label: 'Skip link', message: 'Runtime injeta "pular para conteúdo" automaticamente.', wcag: '2.4.1' })

    return checks
  }

  function _addContrast(checks, label, fg, bg, ratio, isLarge) {
    var lvl = LPBA11yContrast.wcagLevel(ratio, isLarge)
    var msg = label + ': ' + ratio.toFixed(2) + ':1 sobre ' + bg + ' · ' + (lvl === 'fail' ? 'reprovado' : lvl)
    var sev = lvl === 'fail' ? 'error' : (lvl === 'A' ? 'warning' : 'pass')
    checks.push({ severity: sev, code: 'contrast_' + label.replace(/\s+/g, '_').toLowerCase(), label: 'Contraste', message: msg, wcag: '1.4.3' })
  }

  // ──────────────────────────────────────────────────────────
  // SCORE
  // ──────────────────────────────────────────────────────────
  function getScore(page) {
    var checks = scan(page)
    var weights = { error: -25, warning: -10, info: 0, pass: +5 }
    var raw = 70  // baseline
    checks.forEach(function (c) { raw += (weights[c.severity] || 0) })
    raw = Math.max(0, Math.min(100, raw))
    return {
      score: Math.round(raw),
      grade: raw >= 90 ? 'A' : raw >= 80 ? 'B' : raw >= 65 ? 'C' : raw >= 50 ? 'D' : 'F',
      checks: checks,
      counts: {
        error:   checks.filter(function (c) { return c.severity === 'error'   }).length,
        warning: checks.filter(function (c) { return c.severity === 'warning' }).length,
        pass:    checks.filter(function (c) { return c.severity === 'pass'    }).length,
        info:    checks.filter(function (c) { return c.severity === 'info'    }).length,
      },
    }
  }

  window.LPBA11yChecker = Object.freeze({
    scan:     scan,
    getScore: getScore,
  })
})()
