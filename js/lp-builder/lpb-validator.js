/**
 * LP Builder · Validator Engine
 *
 * Engine de validacao independente de UI. Combina:
 *  - Schema validation (LPBSchema.validate por bloco)
 *  - Token bounds (LPBTokens.validate, valores out-of-range)
 *  - Page-level checks (slug, blocos minimos, ordem)
 *
 * Saida:
 *   { errors: [], warnings: [], score: 0..100 }
 *
 * Cada item:
 *   { severity: 'error'|'warning', code, message,
 *     scope: 'page'|'block', blockIdx?, blockType?, fieldKey? }
 *
 * window.LPBValidator
 */
;(function () {
  'use strict'
  if (window.LPBValidator) return

  // ────────────────────────────────────────────────────────────
  // Page-level checks
  // ────────────────────────────────────────────────────────────
  function _validatePageMeta(page) {
    var out = []
    if (!page.slug || !/^[a-z0-9-]+$/.test(page.slug)) {
      out.push({
        severity: 'error', code: 'slug_invalid',
        message: 'Slug "' + page.slug + '" invalido. Use so letras minusculas, numeros e hifen.',
        scope: 'page',
      })
    }
    if (!page.title || page.title.trim().length < 3) {
      out.push({
        severity: 'error', code: 'title_missing',
        message: 'Titulo da pagina obrigatorio (>=3 caracteres).',
        scope: 'page',
      })
    }
    if (!page.meta_description) {
      out.push({
        severity: 'warning', code: 'meta_description_empty',
        message: 'Meta descricao vazia. Importante para SEO e redes sociais.',
        scope: 'page',
      })
    } else if (page.meta_description.length < 80 || page.meta_description.length > 200) {
      out.push({
        severity: 'warning', code: 'meta_description_length',
        message: 'Meta descricao com ' + page.meta_description.length +
                 ' chars. Ideal entre 80 e 200.',
        scope: 'page',
      })
    }
    if (!page.og_image_url) {
      out.push({
        severity: 'warning', code: 'og_image_missing',
        message: 'Sem imagem OG. Compartilhamento em redes sera generico.',
        scope: 'page',
      })
    }
    return out
  }

  function _validateBlocksOrder(blocks) {
    var out = []
    if (!Array.isArray(blocks) || blocks.length === 0) {
      out.push({
        severity: 'error', code: 'no_blocks',
        message: 'Pagina vazia. Adicione pelo menos hero + CTA + footer.',
        scope: 'page',
      })
      return out
    }
    // recomendado: nav primeiro
    var navIdx = blocks.findIndex(function (b) { return b.type === 'nav' })
    if (navIdx > 0) {
      out.push({
        severity: 'warning', code: 'nav_not_first',
        message: 'Nav deveria ser o primeiro bloco da pagina.',
        scope: 'block', blockIdx: navIdx, blockType: 'nav',
      })
    }
    // recomendado: footer ultimo
    var footerIdx = blocks.findIndex(function (b) { return b.type === 'footer' })
    if (footerIdx >= 0 && footerIdx !== blocks.length - 1) {
      out.push({
        severity: 'warning', code: 'footer_not_last',
        message: 'Footer deveria ser o ultimo bloco da pagina.',
        scope: 'block', blockIdx: footerIdx, blockType: 'footer',
      })
    }
    // recomendado: ter pelo menos 1 hero
    var hasHero = blocks.some(function (b) { return b.type === 'hero-split' })
    if (!hasHero) {
      out.push({
        severity: 'warning', code: 'no_hero',
        message: 'Sem bloco hero. Recomendado iniciar com um.',
        scope: 'page',
      })
    }
    // recomendado: ter pelo menos 1 CTA-final
    var hasCta = blocks.some(function (b) { return b.type === 'cta-final' })
    if (!hasCta) {
      out.push({
        severity: 'warning', code: 'no_cta',
        message: 'Sem bloco CTA final. Conversao prejudicada.',
        scope: 'page',
      })
    }
    // recomendado: ter pelo menos 1 FAQ
    var hasFaq = blocks.some(function (b) { return b.type === 'faq' })
    if (!hasFaq) {
      out.push({
        severity: 'warning', code: 'no_faq',
        message: 'Sem FAQ. Reduz objeções, recomendado.',
        scope: 'page',
      })
    }
    return out
  }

  // ────────────────────────────────────────────────────────────
  // Block schema validation (delega ao LPBSchema.validate)
  // ────────────────────────────────────────────────────────────
  function _validateBlock(block, idx) {
    var schema = window.LPBSchema
    if (!schema) return []
    var r = schema.validate(block.type, block.props || {})
    if (r.valid) return []
    return r.errors.map(function (msg) {
      // tenta extrair fieldKey do msg
      var fieldKey = null
      var m = msg.match(/^([a-z_]+)/)
      if (m) fieldKey = m[1]
      return {
        severity: 'error', code: 'schema_' + (fieldKey || 'unknown'),
        message: msg,
        scope: 'block', blockIdx: idx, blockType: block.type, fieldKey: fieldKey,
      }
    })
  }

  // ────────────────────────────────────────────────────────────
  // Tokens override validation (out-of-range)
  // ────────────────────────────────────────────────────────────
  function _validateTokens(tokensOverride) {
    var tokens = window.LPBTokens
    if (!tokens) return []
    var out = []
    Object.keys(tokensOverride || {}).forEach(function (key) {
      // key formato: "typography.h1.size.mobile" → token path = "typography.h1", bp = "mobile"
      var parts = key.split('.')
      if (parts.length < 4) return  // so checa size/lineHeight responsivos
      if (parts[2] !== 'size') return  // so size por enquanto
      var path = parts[0] + '.' + parts[1]
      var bp = parts[3]
      var spec = tokens.get(path)
      if (!spec) return
      var v = parseFloat(tokensOverride[key])
      if (isNaN(v)) return
      var min = spec.min && spec.min[bp]
      var max = spec.max && spec.max[bp]
      if (typeof min === 'number' && v < min) {
        out.push({
          severity: 'warning', code: 'token_below_min',
          message: key + ' = ' + v + ' (abaixo do min recomendado ' + min + ')',
          scope: 'page',
        })
      }
      if (typeof max === 'number' && v > max) {
        out.push({
          severity: 'warning', code: 'token_above_max',
          message: key + ' = ' + v + ' (acima do max recomendado ' + max + ')',
          scope: 'page',
        })
      }
    })
    return out
  }

  // ────────────────────────────────────────────────────────────
  // Score 0-100 (heuristica simples)
  // ────────────────────────────────────────────────────────────
  function _computeScore(errors, warnings) {
    var penalty = errors.length * 12 + warnings.length * 4
    var s = Math.max(0, Math.min(100, 100 - penalty))
    return s
  }

  // ────────────────────────────────────────────────────────────
  // Main API
  // ────────────────────────────────────────────────────────────
  function validate(page) {
    if (!page) return { errors: [], warnings: [], score: 0, total: 0 }
    var all = []
    all = all.concat(_validatePageMeta(page))
    all = all.concat(_validateBlocksOrder(page.blocks || []))
    ;(page.blocks || []).forEach(function (b, i) {
      all = all.concat(_validateBlock(b, i))
    })
    all = all.concat(_validateTokens(page.tokens_override || {}))

    var errors   = all.filter(function (x) { return x.severity === 'error' })
    var warnings = all.filter(function (x) { return x.severity === 'warning' })

    return {
      errors: errors,
      warnings: warnings,
      total: errors.length + warnings.length,
      score: _computeScore(errors, warnings),
    }
  }

  // Atalho: valida pagina atual do LPBuilder
  function validateCurrent() {
    if (!window.LPBuilder) return { errors: [], warnings: [], total: 0, score: 0 }
    return validate(LPBuilder.getCurrentPage())
  }

  window.LPBValidator = Object.freeze({
    validate: validate,
    validateCurrent: validateCurrent,
  })
})()
