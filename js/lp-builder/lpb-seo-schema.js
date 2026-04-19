/**
 * LP Builder · Schema.org JSON-LD generator
 *
 * Gera structured data pra rich snippets no Google a partir de
 *   · page.schema_org (configurado manualmente: clínica info)
 *   · page.blocks (inferido: FAQ, doctor, testimonials, pricing)
 *
 * Schemas suportados:
 *   · MedicalBusiness     (clínica)
 *   · Person              (doctor-block)
 *   · FAQPage             (faq blocks)
 *   · AggregateRating + Review (testimonials)
 *   · Service+Offer       (pricing-table itens)
 *   · WebPage             (página em si · sempre)
 *
 * Independente — testável isolado:
 *   var ld = LPBSeoSchema.generate(page)
 *   LPBSeoSchema.injectIntoHead(ld, document)
 */
;(function () {
  'use strict'
  if (window.LPBSeoSchema) return

  function _isFilled(s) { return s != null && String(s).trim().length > 0 }

  // ────────────────────────────────────────────────────────────
  // Detectores por tipo de bloco
  // ────────────────────────────────────────────────────────────
  function _findFirstBlock(blocks, type) {
    return (blocks || []).find(function (b) { return b && b.type === type })
  }

  function _allBlocks(blocks, type) {
    return (blocks || []).filter(function (b) { return b && b.type === type })
  }

  // ────────────────────────────────────────────────────────────
  // Schema generators
  // ────────────────────────────────────────────────────────────
  function _medicalBusiness(page) {
    var c = page.schema_org || {}
    if (!_isFilled(c.name)) return null
    var node = {
      '@type': 'MedicalBusiness',
      '@id':   '#clinic',
      'name':  c.name,
      'url':   c.url || (window.location.origin + '/lp.html?s=' + page.slug),
    }
    if (c.image)      node.image = c.image
    if (c.telephone)  node.telephone = c.telephone
    if (c.priceRange) node.priceRange = c.priceRange
    if (c.medicalSpecialty) node.medicalSpecialty = c.medicalSpecialty

    // Endereço
    if (_isFilled(c.street) || _isFilled(c.city) || _isFilled(c.zip)) {
      node.address = { '@type': 'PostalAddress' }
      if (c.street)  node.address.streetAddress   = c.street
      if (c.city)    node.address.addressLocality = c.city
      if (c.state)   node.address.addressRegion   = c.state
      if (c.zip)     node.address.postalCode      = c.zip
      if (c.country) node.address.addressCountry  = c.country
    }

    // Geo
    if (c.latitude && c.longitude) {
      node.geo = {
        '@type': 'GeoCoordinates',
        'latitude':  c.latitude,
        'longitude': c.longitude,
      }
    }

    // Horário (string livre tipo "Mo-Fr 09:00-18:00, Sa 09:00-13:00")
    if (c.openingHours) node.openingHours = c.openingHours

    return node
  }

  function _person(blocks, page) {
    var b = _findFirstBlock(blocks, 'doctor-block')
    if (!b || !b.props) return null
    var p = b.props
    if (!_isFilled(p.h2)) return null
    var node = {
      '@type': 'Person',
      'name':  p.h2,
    }
    if (p.foto) node.image = p.foto
    var c = page.schema_org || {}
    if (_isFilled(c.name)) {
      node.worksFor = { '@id': '#clinic' }
      node.affiliation = { '@id': '#clinic' }
    }
    // tira jobTitle do eyebrow se aplicável
    if (p.eyebrow && p.eyebrow.toLowerCase().indexOf('especialista') >= 0) {
      node.jobTitle = 'Médica especialista em medicina estética facial'
    }
    return node
  }

  function _faqPage(blocks) {
    var faqs = _allBlocks(blocks, 'faq')
    if (!faqs.length) return null
    var entities = []
    faqs.forEach(function (f) {
      var items = (f.props && f.props.items) || []
      items.forEach(function (it) {
        if (!_isFilled(it.pergunta) || !_isFilled(it.resposta)) return
        entities.push({
          '@type': 'Question',
          'name': String(it.pergunta).trim(),
          'acceptedAnswer': {
            '@type': 'Answer',
            'text': String(it.resposta).trim(),
          },
        })
      })
    })
    if (!entities.length) return null
    return {
      '@type': 'FAQPage',
      'mainEntity': entities,
    }
  }

  function _aggregateRating(blocks) {
    var tBlocks = _allBlocks(blocks, 'testimonials')
    var qaBlocks = _allBlocks(blocks, 'qa-depoimento')
    var allReviews = []
    var sumStars = 0, count = 0

    tBlocks.forEach(function (b) {
      var items = (b.props && b.props.items) || []
      items.forEach(function (it) {
        if (!_isFilled(it.body)) return
        var stars = parseInt(it.stars, 10)
        if (isNaN(stars)) stars = 5
        if (stars > 0) { sumStars += stars; count++ }
        allReviews.push({
          '@type': 'Review',
          'author':       { '@type': 'Person', 'name': it.nome || 'Paciente' },
          'reviewBody':   String(it.body).trim(),
          'reviewRating': { '@type': 'Rating', 'ratingValue': stars, 'bestRating': 5 },
        })
      })
    })

    qaBlocks.forEach(function (b) {
      var p = b.props || {}
      if (!_isFilled(p.nome)) return
      // Considera o conteúdo da entrevista como review
      var bodyParts = []
      ;((p.items || [])).forEach(function (it) {
        if (it.resposta) bodyParts.push(it.resposta.trim())
      })
      if (bodyParts.length) {
        allReviews.push({
          '@type': 'Review',
          'author':       { '@type': 'Person', 'name': p.nome },
          'reviewBody':   bodyParts.join(' '),
          'reviewRating': { '@type': 'Rating', 'ratingValue': 5, 'bestRating': 5 },
        })
        sumStars += 5; count++
      }
    })

    if (!allReviews.length) return { reviews: null, agg: null }
    var agg = count > 0 ? {
      '@type': 'AggregateRating',
      'ratingValue': (sumStars / count).toFixed(1),
      'reviewCount': count,
      'bestRating':  5,
    } : null
    return { reviews: allReviews, agg: agg }
  }

  function _services(blocks, page) {
    var pricing = _allBlocks(blocks, 'pricing-table')
    if (!pricing.length) return []
    var services = []
    pricing.forEach(function (b) {
      var items = (b.props && b.props.items) || []
      items.forEach(function (pl) {
        if (!_isFilled(pl.titulo)) return
        var price = String(pl.preco || '').replace(/[^\d,.]/g, '').replace(/\./g, '').replace(',', '.')
        var node = {
          '@type': 'Service',
          'name': pl.titulo,
          'provider': { '@id': '#clinic' },
        }
        if (_isFilled(pl.descricao)) node.description = pl.descricao
        if (price && !isNaN(parseFloat(price))) {
          node.offers = {
            '@type': 'Offer',
            'price': price,
            'priceCurrency': 'BRL',
            'availability': 'https://schema.org/InStock',
            'url': window.location.origin + '/lp.html?s=' + page.slug,
          }
        }
        services.push(node)
      })
    })
    return services
  }

  function _webPage(page) {
    return {
      '@type': 'WebPage',
      '@id':    window.location.origin + '/lp.html?s=' + page.slug,
      'url':    window.location.origin + '/lp.html?s=' + page.slug,
      'name':   page.meta_title || page.title || page.slug,
      'description': page.meta_description || '',
      'inLanguage':  document.documentElement.lang || 'pt-BR',
    }
  }

  // ────────────────────────────────────────────────────────────
  // generate(page) → JSON-LD com @graph
  // ────────────────────────────────────────────────────────────
  function generate(page) {
    if (!page) return null
    var blocks = page.blocks || []
    var graph = []

    var biz = _medicalBusiness(page)
    if (biz) graph.push(biz)

    var person = _person(blocks, page)
    if (person) graph.push(person)

    var faq = _faqPage(blocks)
    if (faq) graph.push(faq)

    var rev = _aggregateRating(blocks)
    if (rev && rev.reviews) {
      // anexa AggregateRating ao MedicalBusiness se existir
      if (biz && rev.agg) biz.aggregateRating = rev.agg
      // adiciona reviews como nodes top-level (Google indexa)
      rev.reviews.forEach(function (r) { graph.push(r) })
    }

    var services = _services(blocks, page)
    services.forEach(function (s) { graph.push(s) })

    graph.push(_webPage(page))

    if (!graph.length) return null

    return {
      '@context': 'https://schema.org',
      '@graph':   graph,
    }
  }

  // ────────────────────────────────────────────────────────────
  // Inject in <head>
  // ────────────────────────────────────────────────────────────
  function injectIntoHead(ld, doc) {
    if (!ld) return
    doc = doc || document
    // Remove anterior se existir
    var prev = doc.getElementById('lpb-jsonld')
    if (prev && prev.parentNode) prev.parentNode.removeChild(prev)
    var s = doc.createElement('script')
    s.id = 'lpb-jsonld'
    s.type = 'application/ld+json'
    s.text = JSON.stringify(ld, null, 2)
    doc.head.appendChild(s)
  }

  // Helper: gera + injeta numa única chamada
  function applyToPage(page, doc) {
    var ld = generate(page)
    if (ld) injectIntoHead(ld, doc)
    return ld
  }

  // Helper: tem schema configurado?
  function isConfigured(page) {
    return !!(page && page.schema_org && page.schema_org.name)
  }

  window.LPBSeoSchema = Object.freeze({
    generate:        generate,
    injectIntoHead:  injectIntoHead,
    applyToPage:     applyToPage,
    isConfigured:    isConfigured,
  })
})()
