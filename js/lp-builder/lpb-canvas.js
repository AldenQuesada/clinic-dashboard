/**
 * LP Builder · Canvas (centro)
 *
 * Estrategia: NAO usar iframe externo (latencia + cors).
 * Em vez disso, renderiza os blocos DIRETO no canvas usando
 * o mesmo HTML do lp.html — embutido aqui via Renderer interno.
 * Isso permite:
 *  - Click pra selecionar bloco (capturando event no canvas)
 *  - Hot-reload imediato a cada mudanca no state
 *  - Drag-drop pra reordenar
 *
 * Device frame (mobile/tablet/desktop) muda largura visual.
 */
;(function () {
  'use strict'
  if (window.LPBCanvas) return

  var _root = null
  var _frame = null
  var _lastScrolledIdx = -1
  var _scrollPos = 0  // preserva scroll entre re-renders

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }
  function _rich(s) {
    if (s == null) return ''
    return _esc(s)
      .replace(/\*([^*]+)\*/g, '<em style="color:var(--champagne-dk)">$1</em>')
      .replace(/_([^_]+)_/g,   '<em>$1</em>')
      .replace(/\n/g, '<br>')
  }

  // ────────────────────────────────────────────────────────────
  // Block renderers (inline — espelha lp.html)
  // ────────────────────────────────────────────────────────────
  var Render = {
    'nav': function (b) {
      var p = b.props || {}
      var ctaHtml = (p.cta_enabled !== false && p.cta && p.cta.label)
        ? '<a href="javascript:void(0)" class="btn btn-outline btn-sm hide-mobile">' + _esc(p.cta.label) + '</a>'
        : ''
      return '<nav class="lp-nav"><div class="lp-nav-inner">' +
        '<div class="brand">' +
          '<span class="brand-small">' + _esc(p.brand_small || 'Clinica') + '</span>' +
          '<span class="brand-name">' + _esc(p.brand_name || '') + '</span>' +
        '</div>' + ctaHtml +
        '</div></nav>'
    },

    'hero-split': function (b) {
      var p = b.props || {}
      var ctas = ''
      if (p.cta_primary && p.cta_primary.label)
        ctas += '<a href="javascript:void(0)" class="btn btn-primary btn-large">' + _esc(p.cta_primary.label) + '</a>'
      if (p.cta_secondary && p.cta_secondary.label)
        ctas += '<a href="javascript:void(0)" class="btn btn-outline btn-large">' + _esc(p.cta_secondary.label) + '</a>'
      var visual = p.visual_image
        ? '<img src="' + _esc(p.visual_image) + '" alt="" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0">'
        : '<div class="hero-visual-placeholder">' + _esc(p.visual_placeholder || '') + '</div>'
      return '<header class="hero"><div class="container"><div class="hero-grid">' +
        '<div class="hero-text">' +
          (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
          '<h1>' + _rich(p.h1 || '') + '</h1>' +
          (p.lead ? '<p class="lead">' + _esc(p.lead) + '</p>' : '') +
          '<div class="hero-ctas">' + ctas + '</div>' +
        '</div>' +
        '<div class="hero-visual">' + visual + '</div>' +
        '</div></div></header>'
    },

    'problema-center': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'bege' ? 'section-alt' : ''
      return '<section class="' + sec + '"><div class="container-narrow text-center">' +
        (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
        '<h2>' + _esc(p.h2 || '') + '</h2>' +
        (p.lead ? '<p class="lead" style="margin-top:28px">' + _esc(p.lead) + '</p>' : '') +
        '</div></section>'
    },

    'cards-2col': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'bege' ? 'section-alt' : ''
      var intro = '<div class="block-intro">' +
        (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
        '<h2>' + _esc(p.h2 || '') + '</h2>' +
        (p.intro ? '<p style="margin-top:18px;max-width:640px;margin-left:auto;margin-right:auto">' + _esc(p.intro) + '</p>' : '') +
        '</div>'
      var cards = (p.cards || []).map(function (c) {
        var pars = (c.paragrafos || []).map(function (par, i) {
          return '<p' + (i === 0 ? ' style="margin-top:16px"' : '') + '>' + _rich(par) + '</p>'
        }).join('')
        return '<div class="card">' +
          (c.numero ? '<span class="card-num">' + _esc(c.numero) + '</span>' : '') +
          (c.kicker ? '<h4>' + _esc(c.kicker) + '</h4>' : '') +
          '<h3>' + _esc(c.titulo || '') + '</h3>' +
          pars +
          '</div>'
      }).join('')
      return '<section class="' + sec + '" id="como-funciona"><div class="container">' +
        intro + '<div class="grid-2">' + cards + '</div></div></section>'
    },

    'quote-narrative': function (b) {
      var p = b.props || {}
      var bgClass = p.bg === 'bege'  ? 'section-alt'
                  : p.bg === 'ivory' ? ''
                  : 'section-accent'
      return '<section class="' + bgClass + '"><div class="container-narrow"><div class="quote-block">' +
        '<blockquote>' + _esc(p.quote || '') + '</blockquote>' +
        '</div></div></section>'
    },

    'benefits-grid': function (b) {
      var p = b.props || {}
      var items = (p.items || []).map(function (it) {
        return '<div class="benefit-item">' +
          (it.icon_svg || '<svg width="22" height="22"></svg>') +
          '<div><h4>' + _esc(it.titulo || '') + '</h4>' +
          '<p>' + _esc(it.desc || '') + '</p></div>' +
          '</div>'
      }).join('')
      return '<section><div class="container">' +
        '<div class="block-intro">' +
          (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
          '<h2>' + _esc(p.h2 || '') + '</h2>' +
        '</div>' +
        '<div class="benefits">' + items + '</div>' +
        '</div></section>'
    },

    'investimento': function (b) {
      var p = b.props || {}
      var sec = p.bg_section === 'ivory' ? '' : 'section-alt'
      var cta = (p.cta && p.cta.label)
        ? '<div style="margin-top:36px"><a href="javascript:void(0)" class="btn btn-gold btn-large">' + _esc(p.cta.label) + '</a></div>' : ''
      return '<section class="' + sec + '"><div class="container-narrow">' +
        '<div class="investimento">' +
          (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
          '<h2>' + _esc(p.h2 || '') + '</h2>' +
          (p.valor ? '<div class="investimento-valor">' + _esc(p.valor) + '</div>' : '') +
          (p.sub   ? '<div class="investimento-sub">' + _esc(p.sub) + '</div>' : '') +
          (p.badge_text ? '<div class="cashback-badge">' + _esc(p.badge_text) + '</div>' : '') +
          (p.descricao  ? '<p>' + _esc(p.descricao) + '</p>' : '') +
          cta +
        '</div></div></section>'
    },

    'list-rich': function (b) {
      var p = b.props || {}
      var items = (p.items || []).map(function (it, i, arr) {
        var border = i === arr.length - 1 ? '' : 'border-bottom:1px solid var(--border-soft);'
        return '<li style="padding:22px 0;' + border + 'display:flex;gap:20px">' +
          '<span style="flex-shrink:0;width:8px;height:8px;background:var(--champagne);transform:rotate(45deg);margin-top:10px"></span>' +
          '<div>' +
            '<h3 style="margin-bottom:6px">' + _esc(it.titulo || '') + '</h3>' +
            '<p style="font-size:15px">' + _esc(it.desc || '') + '</p>' +
          '</div></li>'
      }).join('')
      return '<section><div class="container-narrow">' +
        '<div class="block-intro">' +
          (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
          '<h2>' + _esc(p.h2 || '') + '</h2>' +
        '</div>' +
        (p.intro ? '<p>' + _esc(p.intro) + '</p>' : '') +
        '<ul style="list-style:none;padding:0;margin:40px 0">' + items + '</ul>' +
        '</div></section>'
    },

    'list-simple': function (b) {
      var p = b.props || {}
      var items = (p.items || []).map(function (it, i, arr) {
        var border = i === arr.length - 1 ? '' : 'border-bottom:1px solid var(--border-soft);'
        return '<li style="padding:18px 0;' + border + 'display:flex;gap:16px;align-items:center">' +
          '<span style="flex-shrink:0;width:6px;height:6px;background:var(--champagne);transform:rotate(45deg)"></span>' +
          '<span style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:var(--graphite)">' + _esc(it.texto || '') + '</span>' +
          '</li>'
      }).join('')
      return '<section><div class="container-narrow">' +
        '<div class="block-intro">' +
          (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
          '<h2>' + _esc(p.h2 || '') + '</h2>' +
        '</div>' +
        '<ul style="list-style:none;padding:0">' + items + '</ul>' +
        '</div></section>'
    },

    'doctor-block': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'ivory' ? '' : 'section-alt'
      var photo = p.foto
        ? '<img src="' + _esc(p.foto) + '" alt="" style="width:100%;height:100%;object-fit:cover;position:absolute;inset:0">'
        : '<div class="doctor-photo-initials">' + _esc(p.foto_initial || 'M') + '</div>'
      var pars = (p.paragrafos || []).map(function (par, i) {
        return '<p' + (i === 0 ? ' style="margin-top:20px"' : '') + '>' + _esc(par) + '</p>'
      }).join('')
      return '<section class="' + sec + '"><div class="container">' +
        '<div class="doctor-block">' +
          '<div class="doctor-photo">' + photo + '</div>' +
          '<div>' +
            (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
            '<h2>' + _esc(p.h2 || '') + '</h2>' + pars +
          '</div>' +
        '</div></div></section>'
    },

    'faq': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'bege' ? 'section-alt' : ''
      var items = (p.items || []).map(function (it) {
        return '<details class="faq-item">' +
          '<summary>' + _esc(it.pergunta || '') + '</summary>' +
          '<p>' + _esc(it.resposta || '') + '</p>' +
          '</details>'
      }).join('')
      return '<section class="' + sec + '"><div class="container-narrow">' +
        '<div class="block-intro">' +
          (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
          '<h2>' + _esc(p.h2 || '') + '</h2>' +
        '</div>' +
        '<div class="faq">' + items + '</div>' +
        '</div></section>'
    },

    'cta-final': function (b) {
      var p = b.props || {}
      var cta = (p.cta && p.cta.label)
        ? '<a href="javascript:void(0)" class="btn btn-primary btn-large">' + _esc(p.cta.label) + '</a>' : ''
      return '<section class="final-cta"><div class="container-narrow">' +
        (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
        '<h2>' + _esc(p.h2 || '') + '</h2>' +
        (p.lead ? '<p>' + _esc(p.lead) + '</p>' : '') + cta +
        '</div></section>'
    },

    'footer': function (b) {
      // Onda 28: footer upgrade pra match com legado (eyebrow + social + bg variants)
      if (window.LPBBlockFooter) return LPBBlockFooter.render(b)
      var p = b.props || {}
      return '<footer class="lp-footer"><div class="container-narrow">' +
        '<div class="lp-footer-brand">' + _esc(p.brand_name || '') + '</div>' +
        (p.tagline ? '<div class="lp-footer-tagline">' + _esc(p.tagline) + '</div>' : '') +
        '<div class="lp-footer-small">' + _esc(p.copyright || '') + '</div>' +
        '</div></footer>'
    },

    'links-tree': function (b) {
      // Onda 28: delega ao renderer puro compartilhado
      if (window.LPBBlockLinksTree) return LPBBlockLinksTree.render(b)
      return '<div style="padding:20px;text-align:center;color:#888;font-style:italic">links-tree (renderer não carregado)</div>'
    },

    'hero-cover': function (b) {
      // Onda 28: capa de revista full-bleed
      if (window.LPBBlockHeroCover) return LPBBlockHeroCover.render(b)
      return '<div style="padding:20px;text-align:center;color:#888;font-style:italic">hero-cover (renderer não carregado)</div>'
    },

    'cta-legacy': function (b) {
      if (window.LPBBlockCtaLegacy) return LPBBlockCtaLegacy.render(b)
      return '<div style="padding:20px;text-align:center;color:#888;font-style:italic">cta-legacy (renderer não carregado)</div>'
    },

    'badges-legacy': function (b) {
      if (window.LPBBlockBadgesLegacy) return LPBBlockBadgesLegacy.render(b)
      return '<div style="padding:20px;text-align:center;color:#888;font-style:italic">badges-legacy (renderer não carregado)</div>'
    },

    'price-legacy': function (b) {
      if (window.LPBBlockPriceLegacy) return LPBBlockPriceLegacy.render(b)
      return '<div style="padding:20px;text-align:center;color:#888;font-style:italic">price-legacy (renderer não carregado)</div>'
    },

    'divider-legacy': function (b) {
      if (window.LPBBlockDividerLegacy) return LPBBlockDividerLegacy.render(b)
      return '<hr style="border:0;border-top:1px solid #ddd;margin:2rem 0">'
    },

    'title-legacy': function (b) {
      if (window.LPBBlockTitleLegacy) return LPBBlockTitleLegacy.render(b)
      return '<div style="padding:20px;text-align:center;color:#888;font-style:italic">title-legacy (renderer não carregado)</div>'
    },

    'check-legacy': function (b) {
      if (window.LPBBlockCheckLegacy) return LPBBlockCheckLegacy.render(b)
      return '<div style="padding:20px;text-align:center;color:#888;font-style:italic">check-legacy (renderer não carregado)</div>'
    },

    'buttons-row': function (b) {
      if (window.LPBBlockButtonsRow) return LPBBlockButtonsRow.render(b)
      return '<div style="padding:20px;text-align:center;color:#888;font-style:italic">buttons-row (renderer não carregado)</div>'
    },

    'magazine-toc': function (b) {
      if (window.LPBBlockMagazineToc) return LPBBlockMagazineToc.render(b)
      return '<div style="padding:20px;text-align:center;color:#888;font-style:italic">magazine-toc (renderer não carregado)</div>'
    },

    'before-after-carousel': function (b) {
      // Onda 28: bloco do legado + dots em rombo
      if (window.LPBBlockBaCarousel) return LPBBlockBaCarousel.render(b)
      return '<div style="padding:20px;text-align:center;color:#888;font-style:italic">before-after-carousel (renderer não carregado)</div>'
    },

    'before-after': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'bege'  ? 'section-alt'
              : p.bg === 'dark'  ? 'section-dark'
              : ''
      var dir = p.direction || 'horizontal-lr'
      var isVert = dir.indexOf('vertical') === 0
      var knobIcon = isVert ? '⇕' : '⇔'
      var items = (p.items || []).filter(function (it) { return it && (it.before_url || it.after_url) })
      var hasMulti = items.length > 1
      var darkCls  = p.bg === 'dark' ? ' blk-ba-dark' : ''
      var itemsHtml = items.map(function (it) {
        return '<div class="blk-ba-item">' +
          '<div class="blk-ba-wrap" data-slider data-dir="' + _esc(dir) + '">' +
            '<img class="blk-ba-img before" src="' + _esc(it.before_url || '') + '" alt="Antes">' +
            '<img class="blk-ba-img after"  src="' + _esc(it.after_url  || '') + '" alt="Depois">' +
            '<div class="blk-ba-label before">Antes</div>' +
            '<div class="blk-ba-label after">Depois</div>' +
            '<div class="blk-ba-handle"><div class="blk-ba-knob">' + knobIcon + '</div></div>' +
          '</div>' +
          (it.caption ? '<div class="blk-ba-caption">' + _esc(it.caption) + '</div>' : '') +
          '</div>'
      }).join('')
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2 || p.intro)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
              (p.intro   ? '<p style="margin-top:18px;max-width:640px;margin-left:auto;margin-right:auto">' + _esc(p.intro) + '</p>' : '') +
            '</div>'
          : '') +
        '<div class="blk-ba ' + (hasMulti ? 'has-multi' : '') + darkCls + '">' + itemsHtml + '</div>' +
        '</div></section>'
    },

    'stats-inline': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'ivory' ? '' : 'section-alt'
      var colsCls = 'cols-' + (p.columns && p.columns !== 'auto' ? p.columns : 'auto')
      var stats = (p.items || []).map(function (it) {
        return '<div class="blk-stat">' +
          '<div class="blk-stat-valor">' + _esc(it.valor || '') + '</div>' +
          '<div class="blk-stat-label">' + _esc(it.label || '') + '</div>' +
          (it.desc ? '<div class="blk-stat-desc">' + _esc(it.desc) + '</div>' : '') +
          '</div>'
      }).join('')
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
            '</div>'
          : '') +
        '<div class="blk-stats ' + colsCls + '">' + stats + '</div>' +
        '</div></section>'
    },

    'gallery-mosaic': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'bege' ? 'section-alt' : ''
      var items = (p.items || []).filter(function (it) { return it && it.url })
      var photos = items.map(function (it) {
        return '<div class="blk-mosaic-photo">' +
          '<img src="' + _esc(it.url) + '" alt="' + _esc(it.caption || '') + '" loading="lazy">' +
          (it.caption ? '<div class="blk-mosaic-caption">' + _esc(it.caption) + '</div>' : '') +
          '</div>'
      }).join('')
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
            '</div>'
          : '') +
        '<div class="blk-mosaic">' + photos + '</div>' +
        '</div></section>'
    },

    'pull-quote': function (b) {
      var p = b.props || {}
      var bgCls = p.bg === 'bege'  ? 'section-alt'
                : p.bg === 'ivory' ? ''
                : p.bg === 'dark'  ? 'section-dark'
                : 'section-accent'
      return '<section class="' + bgCls + '"><div class="container-narrow">' +
        '<div class="blk-pull-quote">' +
          '<p class="blk-pull-quote-text">' + _esc(p.quote || '') + '</p>' +
          (p.author ? '<div class="blk-pull-quote-author">' + _esc(p.author) + '</div>' : '') +
          (p.meta   ? '<div class="blk-pull-quote-meta">'   + _esc(p.meta)   + '</div>' : '') +
        '</div>' +
        '</div></section>'
    },

    'process-timeline': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'bege' ? 'section-alt' : ''
      var layout = p.layout === 'horizontal' ? 'layout-horizontal' : 'layout-vertical'
      var steps = (p.items || []).map(function (it, i) {
        var num = (it.numero && String(it.numero).trim()) || String(i + 1).padStart(2, '0')
        return '<div class="blk-process-step">' +
          '<div class="blk-process-num">' + _esc(num) + '</div>' +
          '<div class="blk-process-titulo">' + _esc(it.titulo || '') + '</div>' +
          '<div class="blk-process-desc">' + _esc(it.descricao || '') + '</div>' +
          '</div>'
      }).join('')
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2 || p.intro)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
              (p.intro   ? '<p style="margin-top:18px;max-width:640px;margin-left:auto;margin-right:auto">' + _esc(p.intro) + '</p>' : '') +
            '</div>'
          : '') +
        '<div class="blk-process ' + layout + '">' + steps + '</div>' +
        '</div></section>'
    },

    'evolution-timeline': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'ivory' ? '' : 'section-alt'
      var items = (p.items || []).map(function (it) {
        return '<div class="blk-evolution-item">' +
          '<div class="blk-evolution-photo">' +
            (it.foto ? '<img src="' + _esc(it.foto) + '" alt="' + _esc(it.data || '') + '" loading="lazy">' : '') +
            (it.data ? '<div class="blk-evolution-marca">' + _esc(it.data) + '</div>' : '') +
          '</div>' +
          (it.legenda ? '<div class="blk-evolution-legenda">' + _esc(it.legenda) + '</div>' : '') +
          '</div>'
      }).join('')
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2 || p.intro)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
              (p.intro   ? '<p style="margin-top:18px;max-width:640px;margin-left:auto;margin-right:auto">' + _esc(p.intro) + '</p>' : '') +
            '</div>'
          : '') +
        '<div class="blk-evolution">' + items + '</div>' +
        '</div></section>'
    },

    'qa-depoimento': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'bege' ? 'section-alt' : ''
      var initial = (p.nome || '').trim().charAt(0).toUpperCase() || 'P'
      var foto = p.foto
        ? '<img src="' + _esc(p.foto) + '" alt="' + _esc(p.nome || '') + '">'
        : '<div class="blk-qa-pessoa-foto-initials">' + _esc(initial) + '</div>'
      var msgs = (p.items || []).map(function (it) {
        return '<div class="blk-qa-msg">' +
          '<div class="blk-qa-pergunta">' + _esc(it.pergunta || '') + '</div>' +
          '<div class="blk-qa-resposta">' + _esc(it.resposta || '') + '</div>' +
          '</div>'
      }).join('')
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
            '</div>'
          : '') +
        '<div class="blk-qa">' +
          '<div class="blk-qa-pessoa">' +
            '<div class="blk-qa-pessoa-foto">' + foto + '</div>' +
            (p.nome ? '<div class="blk-qa-nome">' + _esc(p.nome) + '</div>' : '') +
            (p.meta ? '<div class="blk-qa-meta">' + _esc(p.meta) + '</div>' : '') +
          '</div>' +
          '<div class="blk-qa-conversa">' + msgs + '</div>' +
        '</div>' +
        '</div></section>'
    },

    'reading-time': function (b) {
      var p = b.props || {}
      var alignCls = 'align-' + (p.align || 'center')
      var clockSvg = '<svg class="blk-reading-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'
      return '<div class="blk-reading ' + alignCls + '" data-reading-time>' +
        '<div class="blk-reading-pill">' +
          clockSvg +
          (p.prefix ? '<span class="blk-reading-prefix">' + _esc(p.prefix) + '</span>' : '') +
          '<span class="blk-reading-time rt-min">— minutos</span>' +
          (p.show_sections !== false ? '<span class="blk-reading-sections rt-sections">— seções</span>' : '') +
        '</div>' +
        '</div>'
    },

    'hotspots-anatomicos': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'ivory' ? ''
              : p.bg === 'dark'  ? 'section-dark'
              : 'section-alt'
      var items = (p.items || []).filter(function (it) { return it && (it.x !== undefined && it.y !== undefined) })
      var points = items.map(function (it) {
        var x = _clampPct(it.x)
        var y = _clampPct(it.y)
        return '<button class="blk-hotspot-point" type="button" ' +
          'style="left:' + x + '%;top:' + y + '%" ' +
          'data-label="' + _esc(it.label || '') + '" ' +
          'data-desc="'  + _esc(it.descricao || '') + '"></button>'
      }).join('')
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2 || p.intro)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
              (p.intro   ? '<p style="margin-top:18px;max-width:640px;margin-left:auto;margin-right:auto">' + _esc(p.intro) + '</p>' : '') +
            '</div>'
          : '') +
        '<div class="blk-hotspots ' + (items.length ? 'has-info' : '') + '">' +
          '<div class="blk-hotspot-canvas">' +
            (p.foto ? '<img src="' + _esc(p.foto) + '" alt="">' : '') +
            points +
            '<div class="blk-hotspot-tip"></div>' +
          '</div>' +
          '<div class="blk-hotspot-info">' +
            '<div class="blk-hotspot-info-empty">Clique em um ponto para ver detalhes.</div>' +
          '</div>' +
        '</div>' +
        '</div></section>'
    },

    'language-switcher': function (b) {
      var p = b.props || {}
      var langs = String(p.languages || 'pt-BR,en').split(',').map(function (s) { return s.trim() }).filter(Boolean)
      var styleCls = 'style-' + (p.style || 'pills')
      var alignCls = 'align-' + (p.align || 'right')
      var meta = (window.LPBI18n && LPBI18n.SUPPORTED) || []
      function labelOf(code) {
        var m = meta.find(function (x) { return x.code === code })
        return m ? m.short : code.toUpperCase()
      }
      var btns
      if (p.style === 'inline') {
        btns = langs.map(function (l, i) {
          return (i > 0 ? '<span class="blk-lang-sep">|</span>' : '') +
            '<a class="blk-lang-btn" href="javascript:void(0)" data-lang="' + _esc(l) + '">' + _esc(labelOf(l)) + '</a>'
        }).join('')
      } else {
        btns = langs.map(function (l) {
          return '<a class="blk-lang-btn" href="javascript:void(0)" data-lang="' + _esc(l) + '">' + _esc(labelOf(l)) + '</a>'
        }).join('')
      }
      return '<div class="blk-lang-switcher ' + styleCls + ' ' + alignCls + '">' + btns + '</div>'
    },

    'scroll-progress': function (b) {
      var p = b.props || {}
      var altura = parseInt(p.altura, 10) || 2
      var cor = p.cor || 'champagne'
      return '<div class="blk-scroll-progress" data-cor="' + _esc(cor) + '" style="height:' + altura + 'px">' +
        '<div class="blk-scroll-progress-bar"></div>' +
        '</div>'
    },

    'parallax-banner': function (b) {
      var p = b.props || {}
      var bg = p.foto ? 'background-image:url(' + _esc(p.foto) + ');' : ''
      var overlayAlpha = (parseInt(p.overlay, 10) || 55) / 100
      var hCls = 'h-' + (p.altura || 'md')
      var alignCls = 'align-' + (p.align || 'center')
      var ctaHtml = (p.cta && p.cta.label)
        ? '<a class="btn btn-primary btn-large" href="javascript:void(0)" data-wa-message="' + _esc(p.cta.message_wa || '') + '">' +
          _esc(p.cta.label) + '</a>'
        : ''
      return '<div class="blk-parallax ' + hCls + ' ' + alignCls + '" data-parallax style="' + bg + '">' +
        '<div class="blk-parallax-overlay" style="background:rgba(44,44,44,' + overlayAlpha + ')"></div>' +
        '<div class="blk-parallax-content">' +
          (p.eyebrow ? '<div class="blk-parallax-eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
          '<h2 class="blk-parallax-h2">' + _esc(p.h2 || '') + '</h2>' +
          (p.lead ? '<p class="blk-parallax-lead">' + _esc(p.lead) + '</p>' : '') +
          ctaHtml +
        '</div>' +
        '</div>'
    },

    'form-inline': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'bege' ? 'section-alt'
              : p.bg === 'dark' ? 'section-dark' : ''
      var slug = (LPBuilder.getCurrentPage() && LPBuilder.getCurrentPage().slug) || ''
      var fields = (p.fields || []).map(function (f) {
        var req = f.required ? ' required' : ''
        var requiredMark = f.required ? '<span class="blk-form-required">*</span>' : ''
        var ph = _esc(f.placeholder || '')
        var key = _esc(f.key || '')
        var label = _esc(f.label || '')
        var common = 'data-fkey="' + key + '" name="' + key + '"' + req + ' placeholder="' + ph + '"'
        var input
        if (f.type === 'textarea') {
          input = '<textarea class="blk-form-textarea" ' + common + '></textarea>'
        } else if (f.type === 'select') {
          var opts = String(f.options || '').split('\n').map(function (o) {
            o = o.trim(); if (!o) return ''
            return '<option value="' + _esc(o) + '">' + _esc(o) + '</option>'
          }).join('')
          input = '<select class="blk-form-select" ' + common + '>' +
                  '<option value="">— escolha —</option>' + opts + '</select>'
        } else {
          var t = f.type === 'phone' ? 'tel' : (f.type === 'email' ? 'email' : 'text')
          input = '<input class="blk-form-input" type="' + t + '" ' + common + '>'
        }
        return '<div class="blk-form-field">' +
          '<label class="blk-form-label">' + label + requiredMark + '</label>' +
          input +
          '</div>'
      }).join('')

      var checkSvg = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>'
      var waCta = ''
      if (p.wa_after_submit && p.wa_after_submit.label) {
        waCta = '<a class="btn btn-primary btn-large" href="#" data-wa-message="' + _esc(p.wa_after_submit.message_wa || '') + '">' +
                _esc(p.wa_after_submit.label) + '</a>'
      }

      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2 || p.intro)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
              (p.intro   ? '<p style="margin-top:18px;max-width:640px;margin-left:auto;margin-right:auto">' + _esc(p.intro) + '</p>' : '') +
            '</div>'
          : '') +
        '<div class="blk-form" data-form data-slug="' + _esc(slug) + '">' +
          '<form>' +
            fields +
            '<div class="blk-form-global-msg blk-form-msg"></div>' +
            '<button class="btn btn-primary btn-large blk-form-submit" type="submit" data-label="' + _esc(p.submit_label || 'Enviar') + '">' +
              _esc(p.submit_label || 'Enviar') +
            '</button>' +
          '</form>' +
          '<div class="blk-form-success" style="display:none">' +
            '<div class="blk-form-success-icon">' + checkSvg + '</div>' +
            '<div class="blk-form-success-title">' + _esc(p.success_title || 'Recebido!') + '</div>' +
            '<div class="blk-form-success-msg">' + _esc(p.success_message || '') + '</div>' +
            waCta +
          '</div>' +
        '</div>' +
        '</div></section>'
    },

    'agenda-widget': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'ivory' ? '' : 'section-alt'
      var tpl = p.wa_message_template || 'Olá! Gostaria de agendar para {{data}} às {{horario}}.'
      var slots = (p.slots || []).map(function (s) {
        var data = (s.data || '').trim()
        var horarios = String(s.horarios || '').split(',').map(function (h) {
          return h.trim()
        }).filter(Boolean)
        var slotsBtns = horarios.map(function (h) {
          var msg = tpl.replace(/\{\{data\}\}/g, data).replace(/\{\{horario\}\}/g, h)
          return '<a class="blk-agenda-slot" href="javascript:void(0)" data-wa-message="' + _esc(msg) + '">' +
                 _esc(h) + '</a>'
        }).join('')
        return '<div class="blk-agenda-day">' +
          '<div class="blk-agenda-data">' + _esc(data) + '</div>' +
          '<div class="blk-agenda-horarios">' + slotsBtns + '</div>' +
          '</div>'
      }).join('')
      var colsCls = (p.slots && p.slots.length > 1) ? 'cols-auto' : 'cols-1'
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2 || p.intro)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
              (p.intro   ? '<p style="margin-top:18px;max-width:640px;margin-left:auto;margin-right:auto">' + _esc(p.intro) + '</p>' : '') +
            '</div>'
          : '') +
        '<div class="blk-agenda ' + colsCls + '">' + slots + '</div>' +
        '</div></section>'
    },

    'mapa-local': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'bege' ? 'section-alt' : ''
      var layoutCls = 'layout-' + (p.layout || 'split')
      var query = encodeURIComponent(p.google_maps_query || p.endereco || 'Brasil')
      var mapSrc = 'https://www.google.com/maps?q=' + query + '&output=embed'
      var ctaHtml = (p.cta && p.cta.label)
        ? '<a class="btn btn-outline btn-sm" href="#" data-wa-message="' + _esc(p.cta.message_wa || '') + '">' + _esc(p.cta.label) + '</a>'
        : ''
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
            '</div>'
          : '') +
        '<div class="blk-map ' + layoutCls + '">' +
          '<div class="blk-map-frame"><iframe src="' + _esc(mapSrc) + '" loading="lazy" allowfullscreen referrerpolicy="no-referrer-when-downgrade"></iframe></div>' +
          '<div class="blk-map-info">' +
            (p.endereco ? '<div class="blk-map-info-section"><div class="blk-map-info-label">Endereço</div><div class="blk-map-info-text">' + _esc(p.endereco) + '</div></div>' : '') +
            (p.horario_funcionamento ? '<div class="blk-map-info-section"><div class="blk-map-info-label">Horário</div><div class="blk-map-info-text">' + _esc(p.horario_funcionamento) + '</div></div>' : '') +
            (p.telefone ? '<div class="blk-map-info-section"><div class="blk-map-info-label">Telefone</div><div class="blk-map-info-text">' + _esc(p.telefone) + '</div></div>' : '') +
            (ctaHtml ? '<div class="blk-map-info-section">' + ctaHtml + '</div>' : '') +
          '</div>' +
        '</div>' +
        '</div></section>'
    },

    'sticky-cta-mobile': function (b) {
      var p = b.props || {}
      var visibilityCls = p.desktop_visible ? 'is-everywhere' : 'is-mobile-only'
      var threshold = p.show_after_scroll || '30'
      var ctaLabel = (p.cta && p.cta.label) || 'Agendar'
      var msg = (p.cta && p.cta.message_wa) || ''
      return '<div class="blk-sticky ' + visibilityCls + '" data-threshold="' + _esc(threshold) + '">' +
        '<div class="blk-sticky-text">' + _esc(p.text || '') + '</div>' +
        '<a class="blk-sticky-cta" href="#" data-wa-message="' + _esc(msg) + '">' + _esc(ctaLabel) + '</a>' +
        '</div>'
    },

    'selos-confianca': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'bege' ? 'section-alt' : ''
      var defaultIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="8" r="6"/><polyline points="9 13.5 11.5 16 15.5 10"/><path d="M8 14l-2 7 6-3 6 3-2-7"/></svg>'
      var items = (p.items || []).map(function (it) {
        var visual = it.logo_url
          ? '<img src="' + _esc(it.logo_url) + '" alt="">'
          : (it.icon_svg || defaultIcon)
        return '<div class="blk-selo">' +
          '<div class="blk-selo-visual">' + visual + '</div>' +
          '<div class="blk-selo-titulo">' + _esc(it.titulo || '') + '</div>' +
          (it.descricao ? '<div class="blk-selo-desc">' + _esc(it.descricao) + '</div>' : '') +
          '</div>'
      }).join('')
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
            '</div>'
          : '') +
        '<div class="blk-selos cols-' + _esc(p.columns || '3') + '">' + items + '</div>' +
        '</div></section>'
    },

    'logos-imprensa': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'bege' ? 'section-alt' : ''
      var scrollCls = p.autoplay ? ' is-scrolling' : ''
      var logos = (p.items || []).map(function (it) {
        var img = '<img src="' + _esc(it.url || '') + '" alt="' + _esc(it.alt || '') + '" loading="lazy">'
        return it.link
          ? '<a class="blk-logo" href="' + _esc(it.link) + '" target="_blank" rel="noopener">' + img + '</a>'
          : '<div class="blk-logo">' + img + '</div>'
      }).join('')
      return '<section class="' + sec + '"><div class="container">' +
        '<div class="blk-logos-wrap">' +
          (p.eyebrow ? '<div class="blk-logos-eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
          '<div class="blk-logos' + scrollCls + '">' + logos + '</div>' +
        '</div>' +
        '</div></section>'
    },

    'galeria-filtrada': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'ivory' ? '' : 'section-alt'
      var items = (p.items || []).filter(function (it) { return it && (it.before_url || it.after_url) })

      // Coleta categorias únicas pra montar tabs
      var cats = []
      var seen = {}
      items.forEach(function (it) {
        var c = (it.categoria || 'Outros').trim()
        if (!seen[c]) { seen[c] = true; cats.push(c) }
      })

      var filtersHtml = ''
      if (p.show_filters !== false && cats.length > 1) {
        filtersHtml = '<div class="blk-gallery-filters">' +
          '<button class="blk-gallery-filter is-active" type="button" data-cat="all">Todos</button>' +
          cats.map(function (c) {
            return '<button class="blk-gallery-filter" type="button" data-cat="' + _esc(c) + '">' + _esc(c) + '</button>'
          }).join('') +
        '</div>'
      }

      var cards = items.map(function (it) {
        var cat = (it.categoria || 'Outros').trim()
        return '<button class="blk-gallery-card" type="button" ' +
            'data-cat="' + _esc(cat) + '" ' +
            'data-before="' + _esc(it.before_url || '') + '" ' +
            'data-after="'  + _esc(it.after_url  || '') + '" ' +
            'data-caption="' + _esc(it.caption || '') + '">' +
          '<div class="blk-gallery-tag">' + _esc(cat) + '</div>' +
          '<div class="blk-gallery-card-imgs">' +
            '<img src="' + _esc(it.before_url || '') + '" alt="Antes" loading="lazy">' +
            '<img src="' + _esc(it.after_url  || '') + '" alt="Depois" loading="lazy">' +
          '</div>' +
          '<div class="blk-gallery-card-labels"><span>Antes</span><span>Depois</span></div>' +
          (it.caption ? '<div class="blk-gallery-caption">' + _esc(it.caption) + '</div>' : '') +
          '</button>'
      }).join('')

      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2 || p.intro)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
              (p.intro   ? '<p style="margin-top:18px;max-width:640px;margin-left:auto;margin-right:auto">' + _esc(p.intro) + '</p>' : '') +
            '</div>'
          : '') +
        '<div data-gallery>' +
          filtersHtml +
          '<div class="blk-gallery cols-' + _esc(p.columns || '3') + '">' + cards + '</div>' +
          '<div class="blk-gallery-empty" style="display:none">Nenhum caso nesta categoria.</div>' +
        '</div>' +
        '</div></section>'
    },

    'pricing-table': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'ivory' ? '' : 'section-alt'
      var items = (p.items || [])
      var cols = 'cols-' + items.length
      var checkSvg = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>'
      var xSvg     = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'
      function parseFeatures(text) {
        if (!text) return []
        return String(text).split('\n').map(function (l) {
          var s = l.trim()
          if (!s) return null
          if (s.indexOf('- ') === 0) return { excluded: true, text: s.slice(2).trim() }
          if (s.indexOf('+ ') === 0) return { excluded: false, text: s.slice(2).trim() }
          return { excluded: false, text: s }
        }).filter(Boolean)
      }
      var plans = items.map(function (pl) {
        var features = parseFeatures(pl.features).map(function (f) {
          var cls = f.excluded ? ' is-excluded' : ''
          var icon = f.excluded ? xSvg : checkSvg
          return '<li class="blk-plan-feature' + cls + '">' +
            '<span class="blk-plan-feature-icon">' + icon + '</span>' +
            '<span>' + _esc(f.text) + '</span>' +
            '</li>'
        }).join('')
        var ctaHtml = (pl.cta && pl.cta.label)
          ? '<a class="btn btn-primary btn-large blk-plan-cta" href="javascript:void(0)" data-wa-message="' + _esc(pl.cta.message_wa || '') + '">' + _esc(pl.cta.label) + '</a>'
          : ''
        return '<div class="blk-plan' + (pl.highlight ? ' is-highlight' : '') + '">' +
          (pl.kicker ? '<div class="blk-plan-kicker">' + _esc(pl.kicker) + '</div>' : '') +
          '<div class="blk-plan-titulo">' + _esc(pl.titulo || '') + '</div>' +
          (pl.preco ? '<div class="blk-plan-preco">' + _esc(pl.preco) + '</div>' : '') +
          (pl.preco_detalhe ? '<div class="blk-plan-preco-detalhe">' + _esc(pl.preco_detalhe) + '</div>' : '') +
          (pl.descricao ? '<div class="blk-plan-descricao">' + _esc(pl.descricao) + '</div>' : '') +
          (features ? '<ul class="blk-plan-features">' + features + '</ul>' : '') +
          ctaHtml +
          '</div>'
      }).join('')
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2 || p.intro)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
              (p.intro   ? '<p style="margin-top:18px;max-width:640px;margin-left:auto;margin-right:auto">' + _esc(p.intro) + '</p>' : '') +
            '</div>'
          : '') +
        '<div class="blk-pricing ' + cols + '">' + plans + '</div>' +
        '</div></section>'
    },

    'cards-compare': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'bege' ? 'section-alt' : ''
      var items = (p.items || [])
      var cols = 'cols-' + items.length
      function parseValores(text) {
        if (!text) return []
        return String(text).split('\n').map(function (l) {
          var s = l.trim()
          if (!s) return null
          var parts = s.split('|')
          var label = (parts[0] || '').trim()
          var valor = (parts[1] || '').trim()
          var mod = ''
          if (valor.indexOf('+ ') === 0) { mod = 'positive'; valor = valor.slice(2).trim() }
          else if (valor.indexOf('- ') === 0) { mod = 'negative'; valor = valor.slice(2).trim() }
          return { label: label, valor: valor, mod: mod }
        }).filter(Boolean)
      }
      var cards = items.map(function (c) {
        var valoresHtml = parseValores(c.valores).map(function (v) {
          var cls = v.mod ? ' is-' + v.mod : ''
          return '<li class="blk-compare-attr">' +
            '<span class="blk-compare-attr-label">' + _esc(v.label) + '</span>' +
            '<span class="blk-compare-attr-valor' + cls + '">' + _esc(v.valor) + '</span>' +
            '</li>'
        }).join('')
        var ctaHtml = (c.cta && c.cta.label)
          ? '<a class="btn btn-outline btn-sm blk-compare-cta" href="javascript:void(0)" data-wa-message="' + _esc(c.cta.message_wa || '') + '">' + _esc(c.cta.label) + '</a>'
          : ''
        return '<div class="blk-compare-col' + (c.highlight ? ' is-highlight' : '') + '">' +
          (c.foto ? '<div class="blk-compare-foto"><img src="' + _esc(c.foto) + '" alt=""></div>' : '') +
          '<div class="blk-compare-titulo">' + _esc(c.titulo || '') + '</div>' +
          (c.descricao ? '<div class="blk-compare-desc">' + _esc(c.descricao) + '</div>' : '') +
          (valoresHtml ? '<ul class="blk-compare-list">' + valoresHtml + '</ul>' : '') +
          ctaHtml +
          '</div>'
      }).join('')
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2 || p.intro)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
              (p.intro   ? '<p style="margin-top:18px;max-width:640px;margin-left:auto;margin-right:auto">' + _esc(p.intro) + '</p>' : '') +
            '</div>'
          : '') +
        '<div class="blk-compare ' + cols + '">' + cards + '</div>' +
        '</div></section>'
    },

    'checklist': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'bege' ? 'section-alt' : ''
      var checkSvg = '<svg viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>'
      var items = (p.items || []).map(function (it) {
        return '<li class="blk-check-item">' +
          '<span class="blk-check-mark">' + checkSvg + '</span>' +
          '<div class="blk-check-body">' + _esc(it.texto || '') +
            (it.desc ? '<span class="blk-check-desc">' + _esc(it.desc) + '</span>' : '') +
          '</div>' +
          '</li>'
      }).join('')
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2 || p.intro)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
              (p.intro   ? '<p style="margin-top:18px;max-width:640px;margin-left:auto;margin-right:auto">' + _esc(p.intro) + '</p>' : '') +
            '</div>'
          : '') +
        '<ul class="blk-checklist cols-' + _esc(p.columns || '1') + '">' + items + '</ul>' +
        '</div></section>'
    },

    'carousel-slides': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'ivory' ? ''
              : p.bg === 'dark'  ? 'section-dark'
              : 'section-alt'
      var slides = (p.slides || []).map(function (sl) {
        var photoCls = sl.foto ? ' has-photo' : ''
        return '<div class="blk-slide' + photoCls + '">' +
          (sl.foto ? '<div class="blk-slide-photo"><img src="' + _esc(sl.foto) + '" alt="" loading="lazy"></div>' : '') +
          '<div class="blk-slide-text">' +
            (sl.eyebrow ? '<div class="blk-slide-eyebrow">' + _esc(sl.eyebrow) + '</div>' : '') +
            (sl.titulo  ? '<div class="blk-slide-titulo">'  + _esc(sl.titulo)  + '</div>' : '') +
            (sl.texto   ? '<div class="blk-slide-texto">'   + _esc(sl.texto)   + '</div>' : '') +
          '</div>' +
          '</div>'
      }).join('')
      var dots = (p.slides || []).map(function (_, i) {
        return '<button class="blk-slides-dot' + (i === 0 ? ' is-active' : '') + '" type="button" data-idx="' + i + '"></button>'
      }).join('')
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
            '</div>'
          : '') +
        '<div class="blk-slides" data-slides ' +
          'data-autoplay="' + (p.autoplay ? '1' : '0') + '" ' +
          'data-interval="' + _esc(p.autoplay_interval || 6) + '">' +
          '<div class="blk-slides-track">' + slides + '</div>' +
          '<div class="blk-slides-dots">' + dots + '</div>' +
        '</div>' +
        '</div></section>'
    },

    'testimonials': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'ivory' ? '' : 'section-alt'
      var layoutCls = (p.layout === 'carousel') ? 'layout-carousel' : 'layout-grid cols-' + _esc(p.columns_grid || '3')
      var showStars = p.show_stars !== false
      function stars(n) {
        var num = parseInt(n, 10) || 0
        if (!num) return ''
        var s = ''
        for (var i = 0; i < num; i++) s += '★'
        return '<div class="blk-test-stars">' + s + '</div>'
      }
      function avatar(it) {
        if (it.foto) return '<img src="' + _esc(it.foto) + '" alt="">'
        var ini = (it.nome || 'P').trim().charAt(0).toUpperCase()
        return '<div class="blk-test-avatar-initial">' + _esc(ini) + '</div>'
      }
      var cards = (p.items || []).map(function (it) {
        return '<div class="blk-test-card">' +
          (showStars ? stars(it.stars != null ? it.stars : 5) : '') +
          '<div class="blk-test-body">' + _esc(it.body || '') + '</div>' +
          '<div class="blk-test-author">' +
            '<div class="blk-test-avatar">' + avatar(it) + '</div>' +
            '<div>' +
              '<div class="blk-test-name">' + _esc(it.nome || '') + '</div>' +
              (it.meta ? '<div class="blk-test-meta">' + _esc(it.meta) + '</div>' : '') +
            '</div>' +
          '</div>' +
          '</div>'
      }).join('')
      var trackHtml = (p.layout === 'carousel')
        ? '<div class="blk-testimonials-track">' + cards + '</div>' +
          '<div class="blk-slides-dots">' +
            (p.items || []).map(function (_, i) {
              return '<button class="blk-slides-dot' + (i === 0 ? ' is-active' : '') + '" type="button" data-idx="' + i + '"></button>'
            }).join('') +
          '</div>' +
          '<p class="blk-testimonials-hint">Deslize para ver mais</p>'
        : cards
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
            '</div>'
          : '') +
        '<div class="blk-testimonials ' + layoutCls + '">' + trackHtml + '</div>' +
        '</div></section>'
    },

    'countdown': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'bege' ? 'section-alt'
              : p.bg === 'dark' ? 'section-dark' : ''
      var variant = (p.variant === 'card') ? 'variant-card' : 'variant-minimal'
      var showDays = p.show_days !== false
      var timeHtml = (p.variant === 'card')
        ? '<span class="blk-countdown-time"></span>'
        : '<div class="blk-countdown-time">' + (showDays ? '00 ' : '') + '00<span class="blk-countdown-sep">:</span>00<span class="blk-countdown-sep">:</span>00</div>'
      return '<section class="' + sec + '"><div class="container-narrow">' +
        '<div class="blk-countdown ' + variant + '" ' +
          'data-target="' + _esc(p.target_at || '') + '" ' +
          'data-show-days="' + (showDays ? '1' : '0') + '" ' +
          'data-variant="' + (p.variant || 'minimal') + '">' +
          (p.label ? '<div class="blk-countdown-label">' + _esc(p.label) + '</div>' : '') +
          timeHtml +
          '<div class="blk-countdown-expired" style="display:none">' + _esc(p.show_after_zero || 'Encerrado') + '</div>' +
        '</div>' +
        '</div></section>'
    },

    'timeline-scrub': function (b) {
      var p = b.props || {}
      var sec = p.bg === 'bege' ? 'section-alt'
              : p.bg === 'dark' ? 'section-dark' : ''
      var items = (p.items || []).filter(function (it) { return it && it.foto_url })
      var imgs = items.map(function (it, i) {
        return '<img class="blk-tscrub-img' + (i === 0 ? ' is-active' : '') + '" ' +
          'src="' + _esc(it.foto_url) + '" alt="' + _esc(it.label || '') + '" ' +
          'data-label="'   + _esc(it.label || '') + '" ' +
          'data-legenda="' + _esc(it.legenda || '') + '" loading="lazy">'
      }).join('')
      var dots = items.map(function (it, i) {
        return '<button class="blk-tscrub-dot' + (i === 0 ? ' is-active' : '') + '" type="button" data-idx="' + i + '">' +
          '<span class="blk-tscrub-dot-label">' + _esc(it.label || '') + '</span>' +
          '</button>'
      }).join('')
      var firstLabel   = (items[0] && items[0].label)   || ''
      var firstLegenda = (items[0] && items[0].legenda) || ''
      return '<section class="' + sec + '"><div class="container">' +
        ((p.eyebrow || p.h2 || p.intro)
          ? '<div class="block-intro">' +
              (p.eyebrow ? '<div class="eyebrow">' + _esc(p.eyebrow) + '</div>' : '') +
              (p.h2      ? '<h2>' + _esc(p.h2) + '</h2>' : '') +
              (p.intro   ? '<p style="margin-top:18px;max-width:640px;margin-left:auto;margin-right:auto">' + _esc(p.intro) + '</p>' : '') +
            '</div>'
          : '') +
        '<div class="blk-tscrub" data-autoplay="' + (p.autoplay ? '1' : '0') + '">' +
          '<div class="blk-tscrub-stage">' +
            '<div class="blk-tscrub-overlay">' + _esc(firstLabel) + '</div>' +
            imgs +
          '</div>' +
          '<div class="blk-tscrub-track">' + dots + '</div>' +
          '<div class="blk-tscrub-caption">' + _esc(firstLegenda) + '</div>' +
        '</div>' +
        '</div></section>'
    },
  }

  function _clampPct(v) {
    var n = parseFloat(v)
    if (isNaN(n)) return 50
    return Math.max(0, Math.min(100, n))
  }

  function _renderEmptyCanvas() {
    return '' +
      '<div class="lpb-empty-canvas" style="padding:80px 24px;text-align:center;font-family:Cormorant Garamond,serif;color:#A8895E;font-size:24px;font-style:italic">' +
        'Página em branco' +
        '<div style="font-family:Montserrat,sans-serif;font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#8A7F74;margin-top:14px;font-style:normal">' +
          'Adicione blocos pela palette à esquerda · ou arraste um aqui' +
        '</div>' +
        '<div style="margin-top:30px;display:flex;flex-direction:column;gap:6px;max-width:300px;margin-left:auto;margin-right:auto">' +
          '<button class="lpb-suggest-btn" data-add="nav"        style="background:transparent;border:1px solid #C8A97E;color:#A8895E;padding:10px;font-family:Montserrat,sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer">+ Nav (topo)</button>' +
          '<button class="lpb-suggest-btn" data-add="hero-split" style="background:transparent;border:1px solid #C8A97E;color:#A8895E;padding:10px;font-family:Montserrat,sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer">+ Hero principal</button>' +
          '<button class="lpb-suggest-btn" data-add="cta-final"  style="background:transparent;border:1px solid #C8A97E;color:#A8895E;padding:10px;font-family:Montserrat,sans-serif;font-size:11px;letter-spacing:.1em;text-transform:uppercase;cursor:pointer">+ CTA final</button>' +
        '</div>' +
      '</div>'
  }

  // ────────────────────────────────────────────────────────────
  // Render shell — cria iframe UMA vez, depois só atualiza body
  // (evita FOUC: head + CSS persistem entre renders)
  // ────────────────────────────────────────────────────────────
  function render() {
    if (!_root) return
    var page = LPBuilder.getCurrentPage()
    if (!page) {
      _root.innerHTML = '<div class="lpb-canvas-empty">Nenhuma página selecionada</div>'
      return
    }
    var vp = LPBuilder.getViewport()

    // 1. Cria iframe + frame container UMA vez
    var existingIframe = _root.querySelector('#lpbIframe')
    if (!existingIframe) {
      _root.innerHTML = '' +
        '<div class="lpb-canvas-frame viewport-' + vp + '" id="lpbCanvasFrame">' +
          '<iframe class="lpb-iframe" id="lpbIframe"></iframe>' +
        '</div>'
      _frame = document.getElementById('lpbIframe')
      // iframe sem src/srcdoc → contentDocument já existe (about:blank)
      // primeira escrita: doc completo com head + CSS
      _initFrameDocument()
      _wireFrameEvents()  // listeners no body persistem entre updates
    } else {
      _frame = existingIframe
      // só atualiza viewport class do frame container
      var fc = document.getElementById('lpbCanvasFrame')
      if (fc) fc.className = 'lpb-canvas-frame viewport-' + vp
    }

    // 2. Atualiza apenas o body (head/CSS já carregados — sem FOUC)
    _updateFrameBody(page)
    _updateFrameOverrides(page)
  }

  function _initFrameDocument() {
    if (!_frame) return
    var doc = _frame.contentDocument
    if (!doc) return
    doc.open()
    doc.write(
      '<!DOCTYPE html><html lang="pt-BR"><head>' +
      '<meta charset="UTF-8">' +
      '<meta name="viewport" content="width=device-width,initial-scale=1">' +
      '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;0,600;1,300;1,400&family=Montserrat:wght@300;400;500;600&display=swap" rel="stylesheet">' +
      '<link rel="stylesheet" href="css/lp-shared.css">' +
      '<link rel="stylesheet" href="css/lp-blocks.css">' +
      '<style id="lpb-overrides"></style>' +
      '<style id="lpb-block-styles"></style>' +
      '<style id="lpb-edit-mode">' +
        '.lpb-edit-block{position:relative;outline:1px dashed transparent;transition:outline .12s}' +
        '.lpb-edit-block:hover{outline-color:rgba(200,169,126,.6);outline-offset:-1px}' +
        '.lpb-edit-block.lpb-edit-selected{outline:2px solid #C8A97E;outline-offset:-2px}' +
        '.lpb-edit-actions{position:absolute;top:6px;right:6px;display:none;gap:2px;background:#1A1A1C;padding:3px;z-index:50;box-shadow:0 4px 12px rgba(0,0,0,.3)}' +
        '.lpb-edit-block:hover .lpb-edit-actions,' +
        '.lpb-edit-block.lpb-edit-selected .lpb-edit-actions{display:flex}' +
        '.lpb-edit-actions button{background:transparent;border:0;color:#E5E5E5;font-size:14px;padding:4px 8px;cursor:pointer;font-weight:500}' +
        '.lpb-edit-actions button:hover{background:#2C2C30;color:#C8A97E}' +
        '.lpb-edit-actions button.danger:hover{color:#F87171}' +
        '.lpb-edit-label{position:absolute;top:6px;left:6px;display:none;background:#C8A97E;color:#1A1A1C;font-family:Montserrat,sans-serif;font-size:9px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;padding:3px 8px;z-index:50}' +
        '.lpb-edit-block:hover .lpb-edit-label,' +
        '.lpb-edit-block.lpb-edit-selected .lpb-edit-label{display:block}' +
        '.lpb-empty-canvas{padding:80px 24px;text-align:center;font-family:Cormorant Garamond,serif;font-size:24px;font-style:italic;color:#A8895E}' +
        '.reveal{opacity:1;transform:none}' +
        // evita o flash inicial enquanto fonte web carrega
        'body{font-family:Montserrat,system-ui,sans-serif;font-weight:300;color:#2C2C2C;background:#FEFCF8;margin:0}' +
      '</style>' +
      '</head><body></body></html>'
    )
    doc.close()
  }

  // Render do INNER (tudo DENTRO do wrapper .lpb-edit-block)
  function _renderBlockInner(b, idx) {
    var fn = Render[b.type]
    // Aplica i18n: usa o idioma sendo editado (default = PT-BR)
    var resolved = (window.LPBI18n && window.LPBI18n.applyI18n)
      ? window.LPBI18n.applyI18n(b, window.LPBI18n.getEditingLang())
      : b
    var inner
    try {
      inner = fn
        ? fn(resolved)
        : '<section style="padding:20px;background:#fee;color:#900">Bloco desconhecido: ' + _esc(b.type) + '</section>'
    } catch (err) {
      console.error('[lpb-canvas] erro ao renderizar bloco', b.type, err)
      inner = '<section style="padding:20px;background:#fee;color:#900">Erro renderizando ' + _esc(b.type) + ': ' + _esc(err.message || err) + '</section>'
    }
    return inner +
      '<div class="lpb-edit-actions">' +
        '<button data-act="up"  title="Mover para cima">&uarr;</button>' +
        '<button data-act="dup" title="Duplicar">&#x29C9;</button>' +
        '<button data-act="dn"  title="Mover para baixo">&darr;</button>' +
        '<button data-act="del" title="Remover" class="danger">&times;</button>' +
      '</div>' +
      '<div class="lpb-edit-label">' + _esc(b.type) + '</div>'
  }

  // Render do WRAPPER completo (usado em full re-render quando estrutura muda)
  function _renderBlockWrapper(b, idx, selectedIdx) {
    var selectedCls = (idx === selectedIdx) ? ' lpb-edit-selected' : ''
    var animAttr = ''
    if (b._style && b._style.animation && b._style.animation.type && b._style.animation.type !== 'none') {
      animAttr = ' data-reveal-anim class-anim-tag lpb-anim-' + _esc(b._style.animation.type)
    }
    var animCls = (b._style && b._style.animation && b._style.animation.type && b._style.animation.type !== 'none')
      ? ' lpb-anim-' + _esc(b._style.animation.type) : ''
    var animDA  = animCls ? ' data-reveal-anim' : ''
    return '<div class="lpb-edit-block' + selectedCls + animCls + '" ' +
      'id="bloco-' + idx + '" ' +
      'data-block-idx="' + idx + '" data-block-type="' + _esc(b.type) + '"' + animDA + '>' +
      _renderBlockInner(b, idx) +
      '</div>'
  }

  function _updateFrameBody(page) {
    if (!_frame || !_frame.contentDocument) return
    var doc = _frame.contentDocument
    var body = doc.body
    if (!body) return

    var blocks = page.blocks || []
    var selectedIdx = LPBuilder.getSelectedIdx()
    var existing = body.querySelectorAll('.lpb-edit-block')

    // Detecta se a estrutura bateu: mesma quantidade e mesmos types na mesma ordem.
    // Se sim, atualiza IN-PLACE (zero mexida no scroll/foco).
    // Se não, re-render total.
    var structuralMatch = existing.length === blocks.length
    if (structuralMatch) {
      for (var i = 0; i < blocks.length; i++) {
        if (existing[i].dataset.blockType !== blocks[i].type) {
          structuralMatch = false
          break
        }
      }
    }

    if (!structuralMatch) {
      // Full re-render (add/remove/move de bloco)
      var blocksHtml = blocks.map(function (b, idx) {
        return _renderBlockWrapper(b, idx, selectedIdx)
      }).join('')
      body.innerHTML = blocksHtml || _renderEmptyCanvas()
      // bloqueia links e wire empty-state
      body.querySelectorAll('a').forEach(function (a) { a.setAttribute('href', 'javascript:void(0)') })
      body.querySelectorAll('.lpb-suggest-btn').forEach(function (b) {
        b.onclick = function () { LPBuilder.addBlock(b.dataset.add) }
      })
    } else {
      // IN-PLACE: pra cada bloco, atualiza innerHTML (sempre, sem check
      // de igualdade — browser normaliza HTML e pode dar falso positivo)
      blocks.forEach(function (b, idx) {
        var el = existing[idx]
        var newInner = _renderBlockInner(b, idx)
        el.innerHTML = newInner
        el.querySelectorAll('a').forEach(function (a) { a.setAttribute('href', 'javascript:void(0)') })
        // toggle selection class
        var shouldSelect = (idx === selectedIdx)
        el.classList.toggle('lpb-edit-selected', shouldSelect)
      })
    }

    // Init de blocos interativos dentro do iframe (slider etc.)
    // Carrega lp-blocks.js no iframe se ainda não existir
    _ensureBlocksScriptInFrame()
    // Chama init após o DOM estar atualizado
    setTimeout(function () {
      var win = _frame && _frame.contentWindow
      if (win && win.LPBlocks) {
        try { win.LPBlocks.init(_frame.contentDocument) } catch (_) {}
      }
      // Onda 28: auto-scroll suave pro bloco selecionado (UX da outline)
      try {
        if (selectedIdx != null && selectedIdx >= 0 && _frame && _frame.contentDocument) {
          var selEl = _frame.contentDocument.querySelector('.lpb-edit-block[data-block-idx="' + selectedIdx + '"]')
          if (selEl && _lastScrolledIdx !== selectedIdx) {
            selEl.scrollIntoView({ behavior: 'smooth', block: 'center' })
            _lastScrolledIdx = selectedIdx
          }
        }
      } catch (_) {}
      // Onda 28: hero-cover drag handle (Elementor-style)
      if (window.LPBHeroCoverDrag && _frame && _frame.contentDocument) {
        try {
          LPBHeroCoverDrag.attach(
            _frame.contentDocument,
            function () { return LPBuilder.getSelectedIdx && LPBuilder.getSelectedIdx() },
            function () { return LPBuilder.getViewport && LPBuilder.getViewport() }
          )
        } catch (_) {}
      }
    }, 30)
  }

  function _ensureBlocksScriptInFrame() {
    if (!_frame || !_frame.contentDocument) return
    var doc = _frame.contentDocument
    if (doc.getElementById('lpb-blocks-script')) return
    var s = doc.createElement('script')
    s.id  = 'lpb-blocks-script'
    s.src = 'js/lp-blocks.js'
    doc.body.appendChild(s)
  }

  function _updateFrameOverrides(page) {
    if (!_frame || !_frame.contentDocument) return
    var doc = _frame.contentDocument
    var styleEl = doc.getElementById('lpb-overrides')
    if (styleEl) {
      var overrideCss = ''
      var ov = page.tokens_override || {}
      Object.keys(ov).forEach(function (k) {
        var varName = '--' + k.split('.').map(function (p) {
          return p.replace(/([A-Z])/g, '-$1').toLowerCase()
        }).join('-')
        overrideCss += varName + ':' + ov[k] + ';'
      })
      styleEl.textContent = ':root{' + overrideCss + '}'
    }
    // Estilos por bloco (Ajustes)
    var blockStyleEl = doc.getElementById('lpb-block-styles')
    if (blockStyleEl && window.LPBBlockStyle) {
      blockStyleEl.textContent = window.LPBBlockStyle.generateAllCss(page.blocks || [])
    }
  }

  // Delegated handlers no document — listeners persistem entre updates
  // de body.innerHTML (que não removem listeners do parent doc)
  function _wireFrameEvents() {
    if (!_frame || !_frame.contentDocument) return
    var doc = _frame.contentDocument

    doc.addEventListener('click', function (e) {
      var actBtn = e.target.closest && e.target.closest('.lpb-edit-actions button')
      if (actBtn) {
        e.preventDefault(); e.stopPropagation()
        var blk = actBtn.closest('.lpb-edit-block')
        var idx = blk ? parseInt(blk.dataset.blockIdx, 10) : -1
        if (idx < 0) return
        var act = actBtn.dataset.act
        if (act === 'up')  LPBuilder.moveBlock(idx, -1)
        if (act === 'dn')  LPBuilder.moveBlock(idx,  1)
        if (act === 'dup') LPBuilder.duplicateBlock(idx)
        if (act === 'del') {
          if (doc.defaultView.confirm('Remover este bloco?')) LPBuilder.removeBlock(idx)
        }
        return
      }
      var blk = e.target.closest && e.target.closest('.lpb-edit-block')
      if (blk) {
        e.preventDefault()
        var idx = parseInt(blk.dataset.blockIdx, 10)
        if (!isNaN(idx)) LPBuilder.selectBlock(idx)
      }
    }, true)

    doc.addEventListener('submit', function (e) { e.preventDefault() })
  }

  // ────────────────────────────────────────────────────────────
  // Drop zone (recebe blocos arrastados da palette)
  // ────────────────────────────────────────────────────────────
  function _attachDropZone() {
    var canvas = _root
    if (!canvas) return
    canvas.addEventListener('dragover', function (e) {
      if (!e.dataTransfer.types.includes('text/lpb-block-type')) return
      e.preventDefault()
      e.dataTransfer.dropEffect = 'copy'
    })
    canvas.addEventListener('drop', function (e) {
      var type = e.dataTransfer.getData('text/lpb-block-type')
      if (!type) return
      e.preventDefault()
      LPBuilder.addBlock(type)
      LPBToast && LPBToast('Bloco adicionado', 'success')
    })
  }

  // ────────────────────────────────────────────────────────────
  // Mount
  // ────────────────────────────────────────────────────────────
  function mount(rootId) {
    _root = document.getElementById(rootId)
    if (!_root) return
    _attachDropZone()  // listeners no _root persistem entre re-renders
    render()
  }

  // re-render hooks
  document.body.addEventListener('lpb:state-changed', function () {
    if (_root && LPBuilder.getView() === 'editor') render()
  })
  document.body.addEventListener('lpb:viewport-changed', function () {
    if (_root && LPBuilder.getView() === 'editor') render()
  })

  // Expoe renderer único de bloco (sem wrapper edit) — usado pelo export HTML
  function renderBlockForExport(block) {
    if (!block) return ''
    var resolved = (window.LPBI18n && window.LPBI18n.applyI18n)
      ? window.LPBI18n.applyI18n(block, window.LPBI18n.getEditingLang())
      : block
    var fn = Render[block.type]
    return fn ? fn(resolved) : ''
  }

  window.LPBCanvas = { mount: mount, render: render, renderBlockForExport: renderBlockForExport }
})()
