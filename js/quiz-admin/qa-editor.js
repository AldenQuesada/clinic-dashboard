;(function () {
  'use strict'
  if (window.QAEditor) return

  // ── Collapsible Section Helper ─────────────────────────────────────────────
  var _collapseArrow = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>'

  function _section(title, content, opts) {
    opts = opts || {}
    var open = opts.open !== false
    var id = 'cfg-sec-' + title.replace(/[^a-z]/gi, '').toLowerCase()
    var hasContent = opts.count !== undefined ? ' <span style="font-size:10px;color:#d1d5db;font-weight:400">(' + opts.count + ')</span>' : ''
    return '<div class="qa-divider"></div>' +
      '<div class="qa-collapse-header" data-collapse="' + id + '">' +
        '<span class="qa-section-title">' + title + hasContent + '</span>' +
        '<span class="qa-collapse-arrow' + (open ? ' open' : '') + '" data-collapse-arrow="' + id + '">' + _collapseArrow + '</span>' +
      '</div>' +
      '<div class="qa-collapse-body' + (open ? '' : ' closed') + '" data-collapse-body="' + id + '" style="max-height:' + (open ? '9999px' : '0') + '">' +
        content +
      '</div>'
  }

  function _bindCollapseEvents() {
    document.querySelectorAll('[data-collapse]').forEach(function(header) {
      header.addEventListener('click', function() {
        var id = header.dataset.collapse
        var body = document.querySelector('[data-collapse-body="' + id + '"]')
        var arrow = document.querySelector('[data-collapse-arrow="' + id + '"]')
        if (!body) return
        var isClosed = body.classList.contains('closed')
        if (isClosed) {
          body.classList.remove('closed')
          body.style.maxHeight = body.scrollHeight + 'px'
          if (arrow) arrow.classList.add('open')
        } else {
          body.style.maxHeight = body.scrollHeight + 'px'
          requestAnimationFrame(function() {
            body.style.maxHeight = '0'
            body.classList.add('closed')
          })
          if (arrow) arrow.classList.remove('open')
        }
      })
    })
  }

  // ── Align Control Helper ──────────────────────────────────────────────────────
  function _buildAlignControl(cls, label, current) {
    var svgL = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="17" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>'
    var svgC = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="18" y1="14" x2="6" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>'
    var svgR = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="7" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>'
    var base = 'flex:1;padding:7px 0;border:none;font-size:11px;font-weight:600;font-family:Inter,sans-serif;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:3px;transition:background .15s,color .15s;'
    var on = 'background:#111;color:#fff'
    var off = 'background:#fff;color:#6b7280'
    return '<div class="qa-form-group" style="margin-bottom:6px"><label class="qa-label" style="font-size:11px">' + label + '</label>' +
      '<div style="display:flex;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">' +
        '<button class="' + cls + '" data-align="left" style="' + base + (current === 'left' ? on : off) + '">' + svgL + 'Esq</button>' +
        '<button class="' + cls + '" data-align="center" style="border-left:1px solid #e5e7eb;border-right:1px solid #e5e7eb;' + base + (current === 'center' ? on : off) + '">' + svgC + 'Centro</button>' +
        '<button class="' + cls + '" data-align="right" style="' + base + (current === 'right' ? on : off) + '">' + svgR + 'Dir</button>' +
      '</div></div>'
  }

  function _bindAlignControl(cls, setter) {
    document.querySelectorAll('.' + cls).forEach(function(btn) {
      btn.addEventListener('click', function() {
        setter(btn.dataset.align)
        document.querySelectorAll('.' + cls).forEach(function(b) {
          b.style.background = '#fff'; b.style.color = '#6b7280'
        })
        btn.style.background = '#111'; btn.style.color = '#fff'
        QA.markDirty(); QA.renderPreview()
      })
    })
  }

  // ── Text Blocks ──────────────────────────────────────────────────────────────
  var _tbPositions = [
    { value: 'logo',        label: 'Apos Logo' },
    { value: 'divider',     label: 'Apos Divisor' },
    { value: 'title',       label: 'Apos Titulo' },
    { value: 'description', label: 'Apos Descricao' },
    { value: 'badges',      label: 'Apos Badges' },
    { value: 'prompt',      label: 'Apos Prompt' },
    { value: 'media',       label: 'Apos Midia' },
    { value: 'countdown',   label: 'Apos Countdown' },
    { value: 'checklist',   label: 'Apos Checklist' },
    { value: 'testimonial', label: 'Apos Depoimento' },
  ]

  function _buildTextBlocksUI(blocks) {
    if (!blocks || !blocks.length) return ''
    var ctaColor = (QA.quiz().schema.intro || {}).cta_color || '#5B6CFF'
    return blocks.map(function(b, i) {
      var posOpts = _tbPositions.map(function(p) {
        return '<option value="' + p.value + '"' + (b.after === p.value ? ' selected' : '') + '>' + p.label + '</option>'
      }).join('')
      var isPrompt = b.variant === 'prompt'
      return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;background:#fafafa">' +
        '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">' +
          '<select class="qa-select tb-pos" data-idx="' + i + '" style="flex:1">' + posOpts + '</select>' +
          '<div style="display:flex;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">' +
            '<button class="tb-var" data-idx="' + i + '" data-val="text" style="padding:5px 10px;border:none;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:Inter,sans-serif;transition:background .12s;' + (!isPrompt ? 'background:#f3f4f6;color:#374151' : 'background:#fff;color:#9ca3af') + '">' +
              '<span style="width:10px;height:10px;border-radius:50%;background:#6B7280;display:inline-block"></span>Cinza</button>' +
            '<button class="tb-var" data-idx="' + i + '" data-val="prompt" style="padding:5px 10px;border:none;border-left:1px solid #e5e7eb;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:Inter,sans-serif;transition:background .12s;' + (isPrompt ? 'background:#f3f4f6;color:#374151' : 'background:#fff;color:#9ca3af') + '">' +
              '<span style="width:10px;height:10px;border-radius:50%;background:' + QA.esc(ctaColor) + ';display:inline-block"></span>Destaque</button>' +
          '</div>' +
          '<button class="qa-icon-btn tb-del" data-idx="' + i + '" style="color:#ef4444;padding:4px" title="Remover">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div style="display:flex;gap:4px;margin-bottom:6px">' +
          '<button class="tb-align" data-idx="' + i + '" data-align="left" style="flex:1;padding:4px;border:1px solid #e5e7eb;border-radius:4px;cursor:pointer;display:flex;justify-content:center;font-size:10px;' + ((b.align || 'center') === 'left' ? 'background:#111;color:#fff;border-color:#111' : 'background:#fff;color:#6b7280') + '">Esq</button>' +
          '<button class="tb-align" data-idx="' + i + '" data-align="center" style="flex:1;padding:4px;border:1px solid #e5e7eb;border-radius:4px;cursor:pointer;display:flex;justify-content:center;font-size:10px;' + ((b.align || 'center') === 'center' ? 'background:#111;color:#fff;border-color:#111' : 'background:#fff;color:#6b7280') + '">Centro</button>' +
          '<button class="tb-align" data-idx="' + i + '" data-align="right" style="flex:1;padding:4px;border:1px solid #e5e7eb;border-radius:4px;cursor:pointer;display:flex;justify-content:center;font-size:10px;' + ((b.align || 'center') === 'right' ? 'background:#111;color:#fff;border-color:#111' : 'background:#fff;color:#6b7280') + '">Dir</button>' +
        '</div>' +
        '<textarea class="qa-textarea tb-txt" data-idx="' + i + '" rows="2" placeholder="Texto do bloco...">' + QA.esc(b.text || '') + '</textarea>' +
      '</div>'
    }).join('')
  }

  function _bindTextBlockEvents() {
    var intro = QA.quiz().schema.intro
    if (!intro.text_blocks) intro.text_blocks = []
    var blocks = intro.text_blocks

    document.querySelectorAll('.tb-txt').forEach(function(el) {
      el.addEventListener('input', function() {
        var idx = parseInt(el.dataset.idx)
        if (blocks[idx]) { blocks[idx].text = el.value; QA.markDirty(); QA.renderPreview() }
      })
    })
    document.querySelectorAll('.tb-pos').forEach(function(el) {
      el.addEventListener('change', function() {
        var idx = parseInt(el.dataset.idx)
        if (blocks[idx]) { blocks[idx].after = el.value; QA.markDirty(); QA.renderPreview() }
      })
    })
    document.querySelectorAll('.tb-var').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(el.dataset.idx)
        if (blocks[idx]) {
          blocks[idx].variant = el.dataset.val
          _refreshTextBlocks()
        }
      })
    })
    document.querySelectorAll('.tb-align').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(el.dataset.idx)
        if (blocks[idx]) {
          blocks[idx].align = el.dataset.align
          _refreshTextBlocks()
        }
      })
    })
    document.querySelectorAll('.tb-del').forEach(function(el) {
      el.addEventListener('click', function() {
        blocks.splice(parseInt(el.dataset.idx), 1)
        _refreshTextBlocks()
      })
    })

    var addBtn = document.getElementById('cfg-add-text-block')
    if (addBtn) addBtn.onclick = function() {
      blocks.push({ text: '', after: 'description', variant: 'text' })
      _refreshTextBlocks()
    }
  }

  function _refreshTextBlocks() {
    var container = document.getElementById('cfg-text-blocks')
    var blocks = QA.quiz().schema.intro.text_blocks || []
    if (container) container.innerHTML = _buildTextBlocksUI(blocks)
    _bindTextBlockEvents()
    QA.markDirty()
    QA.renderPreview()
  }

  // ── Checklists UI ────────────────────────────────────────────────────────────
  function _buildChecklistsUI(lists) {
    if (!lists || !lists.length) return ''
    return lists.map(function(c, i) {
      var posOpts = _tbPositions.map(function(p) {
        return '<option value="' + p.value + '"' + (c.after === p.value ? ' selected' : '') + '>' + p.label + '</option>'
      }).join('')
      var itemsText = (c.items || []).join('\n')
      return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;background:#fafafa">' +
        '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">' +
          '<select class="qa-select cl-pos" data-idx="' + i + '" style="flex:1">' + posOpts + '</select>' +
          '<button class="qa-icon-btn cl-del" data-idx="' + i + '" style="color:#ef4444;padding:4px" title="Remover">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<textarea class="qa-textarea cl-items" data-idx="' + i + '" rows="4" placeholder="Um item por linha...">' + QA.esc(itemsText) + '</textarea>' +
      '</div>'
    }).join('')
  }

  function _bindChecklistEvents() {
    var intro = QA.quiz().schema.intro
    if (!intro.checklists) intro.checklists = []
    var lists = intro.checklists

    document.querySelectorAll('.cl-items').forEach(function(el) {
      el.addEventListener('input', function() {
        var idx = parseInt(el.dataset.idx)
        if (lists[idx]) {
          lists[idx].items = el.value.split('\n').filter(function(l) { return l.trim() })
          QA.markDirty(); QA.renderPreview()
        }
      })
    })
    document.querySelectorAll('.cl-del').forEach(function(el) {
      el.addEventListener('click', function() {
        lists.splice(parseInt(el.dataset.idx), 1)
        _refreshChecklists()
      })
    })
    var globalPos = document.getElementById('cfg-cl-global-pos')
    if (globalPos) globalPos.addEventListener('change', function() {
      lists.forEach(function(c) { c.after = globalPos.value })
      QA.markDirty(); QA.renderPreview()
    })
    var addBtn = document.getElementById('cfg-add-checklist')
    if (addBtn) addBtn.onclick = function() {
      var pos = globalPos ? globalPos.value : 'title'
      lists.push({ after: pos, items: [] })
      _refreshChecklists()
    }
  }

  function _refreshChecklists() {
    var container = document.getElementById('cfg-checklists')
    if (!container) return
    var lists = QA.quiz().schema.intro.checklists || []
    container.innerHTML = lists.map(function(c, i) {
      return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;background:#fafafa">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
          '<span style="font-size:11px;font-weight:700;color:#6b7280">Lista ' + (i+1) + '</span>' +
          '<button class="qa-icon-btn cl-del" data-idx="' + i + '" style="color:#ef4444;padding:4px" title="Remover"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
        '</div>' +
        '<textarea class="qa-textarea cl-items" data-idx="' + i + '" rows="3" placeholder="Um item por linha...">' + QA.esc((c.items || []).join('\n')) + '</textarea>' +
      '</div>'
    }).join('')
    _bindChecklistEvents()
    // Expand collapse body if it was auto-sized
    var body = container.closest('.qa-collapse-body')
    if (body && !body.classList.contains('closed')) {
      body.style.maxHeight = body.scrollHeight + 'px'
    }
    QA.markDirty(); QA.renderPreview()
  }

  // ── Testimonials UI ─────────────────────────────────────────────────────────
  function _buildTestimonialsUI(items) {
    if (!items || !items.length) return ''
    return items.map(function(t, i) {
      var posOpts = _tbPositions.map(function(p) {
        return '<option value="' + p.value + '"' + (t.after === p.value ? ' selected' : '') + '>' + p.label + '</option>'
      }).join('')
      var starsOpts = [1,2,3,4,5].map(function(n) {
        return '<option value="' + n + '"' + ((t.stars || 5) === n ? ' selected' : '') + '>' + n + ' estrela' + (n > 1 ? 's' : '') + '</option>'
      }).join('')
      return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;background:#fafafa">' +
        '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">' +
          '<select class="qa-select tm-pos" data-idx="' + i + '" style="flex:1">' + posOpts + '</select>' +
          '<select class="qa-select tm-stars" data-idx="' + i + '" style="width:auto;min-width:90px">' + starsOpts + '</select>' +
          '<button class="tm-del" data-idx="' + i + '" style="background:none;border:none;color:#ef4444;padding:4px;cursor:pointer" title="Remover">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:6px">' +
          '<input class="qa-input tm-title" data-idx="' + i + '" placeholder="Nome da pessoa" value="' + QA.esc(t.title || '') + '" style="flex:1">' +
          '<input class="qa-input tm-photo" data-idx="' + i + '" placeholder="URL foto (opcional)" value="' + QA.esc(t.photo || '') + '" style="flex:1">' +
        '</div>' +
        '<textarea class="qa-textarea tm-body" data-idx="' + i + '" rows="3" placeholder="Texto do depoimento...">' + QA.esc(t.body || '') + '</textarea>' +
      '</div>'
    }).join('')
  }

  function _bindTestimonialEvents() {
    var intro = QA.quiz().schema.intro
    if (!intro.testimonials) intro.testimonials = []
    var items = intro.testimonials

    document.querySelectorAll('.tm-title').forEach(function(el) {
      el.addEventListener('input', function() {
        var idx = parseInt(el.dataset.idx)
        if (items[idx]) { items[idx].title = el.value; QA.markDirty(); QA.renderPreview() }
      })
    })
    document.querySelectorAll('.tm-body').forEach(function(el) {
      el.addEventListener('input', function() {
        var idx = parseInt(el.dataset.idx)
        if (items[idx]) { items[idx].body = el.value; QA.markDirty(); QA.renderPreview() }
      })
    })
    document.querySelectorAll('.tm-photo').forEach(function(el) {
      el.addEventListener('input', function() {
        var idx = parseInt(el.dataset.idx)
        if (items[idx]) { items[idx].photo = el.value.trim(); QA.markDirty(); QA.renderPreview() }
      })
    })
    document.querySelectorAll('.tm-stars').forEach(function(el) {
      el.addEventListener('change', function() {
        var idx = parseInt(el.dataset.idx)
        if (items[idx]) { items[idx].stars = parseInt(el.value); QA.markDirty(); QA.renderPreview() }
      })
    })
    document.querySelectorAll('.tm-pos').forEach(function(el) {
      el.addEventListener('change', function() {
        var idx = parseInt(el.dataset.idx)
        if (items[idx]) { items[idx].after = el.value; QA.markDirty(); QA.renderPreview() }
      })
    })
    document.querySelectorAll('.tm-del').forEach(function(el) {
      el.addEventListener('click', function() {
        items.splice(parseInt(el.dataset.idx), 1)
        _refreshTestimonials()
      })
    })
    // Global position
    var globalPos = document.getElementById('cfg-tm-global-pos')
    if (globalPos) globalPos.onchange = function() {
      items.forEach(function(t) { t.after = globalPos.value })
      document.querySelectorAll('.tm-pos').forEach(function(el) { el.value = globalPos.value })
      QA.markDirty(); QA.renderPreview()
    }

    var addBtn = document.getElementById('cfg-add-testimonial')
    if (addBtn) addBtn.onclick = function() {
      var pos = globalPos ? globalPos.value : 'media'
      items.push({ after: pos, stars: 5, date: '', title: '', body: '' })
      _refreshTestimonials()
    }
  }

  function _refreshTestimonials() {
    var container = document.getElementById('cfg-testimonials')
    var items = QA.quiz().schema.intro.testimonials || []
    if (container) container.innerHTML = _buildTestimonialsUI(items)
    _bindTestimonialEvents()
    QA.markDirty(); QA.renderPreview()
  }

  // ── BA Carousel UI ───────────────────────────────────────────────────────────
  var _baPreviewSlide = 0 // Which slide is being previewed/edited

  function _buildBACarouselUI(carousels) {
    if (!carousels || !carousels.length) {
      return '<div id="cfg-ba-carousels"></div>' +
        '<button class="qa-add-btn" id="cfg-add-ba-carousel" style="margin-bottom:12px">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Adicionar Carrossel Antes/Depois' +
        '</button>'
    }
    var c = carousels[0] // Um carrossel por enquanto
    var posOpts = _tbPositions.map(function(p) {
      return '<option value="' + p.value + '"' + ((c.after || 'media') === p.value ? ' selected' : '') + '>' + p.label + '</option>'
    }).join('')

    // Clamp preview slide index
    if (_baPreviewSlide >= c.slides.length) _baPreviewSlide = 0

    var slidesHtml = (c.slides || []).map(function(s, i) {
      var isActive = i === _baPreviewSlide
      var borderColor = isActive ? '#5B6CFF' : '#e5e7eb'
      var bgColor = isActive ? '#F5F3FF' : '#fafafa'
      return '<div style="border:2px solid ' + borderColor + ';border-radius:8px;padding:10px;margin-bottom:8px;background:' + bgColor + ';transition:border-color .2s">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
          '<div style="display:flex;align-items:center;gap:6px">' +
            '<button class="ba-slide-preview-btn" data-idx="' + i + '" style="padding:3px 8px;border:1px solid ' + (isActive ? '#5B6CFF' : '#d1d5db') + ';border-radius:6px;font-size:10px;font-weight:700;cursor:pointer;background:' + (isActive ? '#5B6CFF' : '#fff') + ';color:' + (isActive ? '#fff' : '#6b7280') + '">Slide ' + (i+1) + '</button>' +
            (isActive ? '<span style="font-size:9px;color:#5B6CFF;font-weight:600">Editando no preview</span>' : '<span style="font-size:9px;color:#9ca3af">Clique para visualizar</span>') +
          '</div>' +
          '<button class="qa-icon-btn ba-slide-del" data-idx="' + i + '" style="color:#ef4444;padding:4px" title="Remover">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px">' +
          '<div style="flex:1"><label style="font-size:10px;font-weight:600;color:#9ca3af;display:block;margin-bottom:3px">ANTES</label>' +
            '<input class="qa-input ba-before" data-idx="' + i + '" value="' + QA.esc(s.before || '') + '" placeholder="URL imagem antes"></div>' +
          '<div style="flex:1"><label style="font-size:10px;font-weight:600;color:#9ca3af;display:block;margin-bottom:3px">DEPOIS</label>' +
            '<input class="qa-input ba-after" data-idx="' + i + '" value="' + QA.esc(s.after || '') + '" placeholder="URL imagem depois"></div>' +
        '</div>' +
        (function() {
          var focusOpts = [
            ['center 20%','Rosto (topo)'],['center top','Topo'],['center 40%','Meio-alto'],
            ['center center','Centro'],['center 60%','Meio-baixo'],['center bottom','Base']
          ]
          var fb = s.focus_before || 'center 20%'
          var fa = s.focus_after || 'center 20%'
          var zb = s.zoom_before || '100'
          var za = s.zoom_after || '100'
          var selB = focusOpts.map(function(o){return '<option value="'+o[0]+'"'+(fb===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')
          var selA = focusOpts.map(function(o){return '<option value="'+o[0]+'"'+(fa===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')
          return '<div style="display:flex;gap:8px;margin-top:6px">' +
            '<div style="flex:1"><label style="font-size:10px;font-weight:600;color:#9ca3af;display:block;margin-bottom:3px">Foco ANTES</label>' +
              '<select class="qa-select ba-focus-before" data-idx="'+i+'">'+selB+'</select>' +
              '<label style="font-size:10px;font-weight:600;color:#9ca3af;display:block;margin:4px 0 2px">Zoom ANTES</label>' +
              '<input type="range" class="ba-zoom-before" data-idx="'+i+'" min="100" max="200" value="'+zb+'" style="width:100%">' +
              '<span class="ba-zoom-before-val" style="font-size:9px;color:#9ca3af">'+zb+'%</span>' +
            '</div>' +
            '<div style="flex:1"><label style="font-size:10px;font-weight:600;color:#9ca3af;display:block;margin-bottom:3px">Foco DEPOIS</label>' +
              '<select class="qa-select ba-focus-after" data-idx="'+i+'">'+selA+'</select>' +
              '<label style="font-size:10px;font-weight:600;color:#9ca3af;display:block;margin:4px 0 2px">Zoom DEPOIS</label>' +
              '<input type="range" class="ba-zoom-after" data-idx="'+i+'" min="100" max="200" value="'+za+'" style="width:100%">' +
              '<span class="ba-zoom-after-val" style="font-size:9px;color:#9ca3af">'+za+'%</span>' +
            '</div>' +
          '</div>'
        })() +
        ((s.before && s.after) ? '<div style="display:flex;gap:4px;margin-top:6px;border-radius:6px;overflow:hidden;height:120px">' +
          '<img src="' + QA.esc(QA.resolveImgUrl(s.before)) + '" style="width:50%;object-fit:cover;object-position:' + QA.esc(s.focus_before || 'center 20%') + ';transform:scale(' + ((s.zoom_before||100)/100) + ')" onerror="this.style.display=\'none\'">' +
          '<img src="' + QA.esc(QA.resolveImgUrl(s.after)) + '" style="width:50%;object-fit:cover;object-position:' + QA.esc(s.focus_after || 'center 20%') + ';transform:scale(' + ((s.zoom_after||100)/100) + ')" onerror="this.style.display=\'none\'">' +
        '</div>' : '') +
      '</div>'
    }).join('')

    return '<div id="cfg-ba-carousels">' +
      '<div class="qa-form-group" style="margin-bottom:8px"><label class="qa-label">Posicao</label>' +
        '<select class="qa-select" id="cfg-ba-pos">' + posOpts + '</select></div>' +
      '<div id="cfg-ba-slides">' + slidesHtml + '</div>' +
      (c.slides.length < 5 ? '<button class="qa-add-btn" id="cfg-add-ba-slide" style="margin-bottom:8px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Adicionar Slide</button>' : '') +
      '<button class="qa-icon-btn ba-carousel-del" style="color:#ef4444;font-size:11px;padding:4px 8px;margin-bottom:12px" title="Remover carrossel">' +
        '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Remover carrossel' +
      '</button>' +
    '</div>'
  }

  function _bindBACarouselEvents() {
    var intro = QA.quiz().schema.intro
    if (!intro.ba_carousels) intro.ba_carousels = []
    var carousels = intro.ba_carousels

    // Adicionar carrossel
    var addBtn = document.getElementById('cfg-add-ba-carousel')
    if (addBtn) addBtn.onclick = function() {
      carousels.push({ after: 'media', slides: [{ before: '', after: '' }] })
      _refreshBACarousel()
    }

    if (!carousels.length) return
    var c = carousels[0]

    // Posicao
    var posEl = document.getElementById('cfg-ba-pos')
    if (posEl) posEl.addEventListener('change', function() { c.after = posEl.value; QA.markDirty(); QA.renderPreview() })

    // Slide inputs
    document.querySelectorAll('.ba-before').forEach(function(el) {
      el.addEventListener('input', function() {
        c.slides[parseInt(el.dataset.idx)].before = el.value.trim()
        QA.markDirty(); QA.renderPreview()
      })
    })
    document.querySelectorAll('.ba-after').forEach(function(el) {
      el.addEventListener('input', function() {
        c.slides[parseInt(el.dataset.idx)].after = el.value.trim()
        QA.markDirty(); QA.renderPreview()
      })
    })
    document.querySelectorAll('.ba-focus-before').forEach(function(el) {
      el.addEventListener('change', function() {
        c.slides[parseInt(el.dataset.idx)].focus_before = el.value
        _refreshBACarousel()
      })
    })
    document.querySelectorAll('.ba-focus-after').forEach(function(el) {
      el.addEventListener('change', function() {
        c.slides[parseInt(el.dataset.idx)].focus_after = el.value
        _refreshBACarousel()
      })
    })
    document.querySelectorAll('.ba-zoom-before').forEach(function(el) {
      el.addEventListener('input', function() {
        c.slides[parseInt(el.dataset.idx)].zoom_before = el.value
        var lbl = el.parentElement.querySelector('.ba-zoom-before-val')
        if (lbl) lbl.textContent = el.value + '%'
        QA.markDirty(); QA.renderPreview()
      })
      el.addEventListener('change', function() { _refreshBACarousel() })
    })
    document.querySelectorAll('.ba-zoom-after').forEach(function(el) {
      el.addEventListener('input', function() {
        c.slides[parseInt(el.dataset.idx)].zoom_after = el.value
        var lbl = el.parentElement.querySelector('.ba-zoom-after-val')
        if (lbl) lbl.textContent = el.value + '%'
        QA.markDirty(); QA.renderPreview()
      })
      el.addEventListener('change', function() { _refreshBACarousel() })
    })

    // Add slide
    var addSlide = document.getElementById('cfg-add-ba-slide')
    if (addSlide) addSlide.onclick = function() {
      if (c.slides.length < 5) {
        c.slides.push({ before: '', after: '' })
        _refreshBACarousel()
      }
    }

    // Remove slide
    // Slide preview navigation
    document.querySelectorAll('.ba-slide-preview-btn').forEach(function(el) {
      el.addEventListener('click', function() {
        _baPreviewSlide = parseInt(el.dataset.idx)
        _refreshBACarousel()
      })
    })
    document.querySelectorAll('.ba-slide-del').forEach(function(el) {
      el.addEventListener('click', function() {
        c.slides.splice(parseInt(el.dataset.idx), 1)
        if (c.slides.length === 0) carousels.splice(0, 1)
        if (_baPreviewSlide >= c.slides.length) _baPreviewSlide = Math.max(0, c.slides.length - 1)
        _refreshBACarousel()
      })
    })

    // Remove carousel
    var delBtn = document.querySelector('.ba-carousel-del')
    if (delBtn) delBtn.onclick = function() {
      carousels.splice(0, 1)
      _refreshBACarousel()
    }
  }

  function _refreshBACarousel() {
    var wrap = document.getElementById('cfg-ba-carousels')
    if (!wrap) return
    var carousels = QA.quiz().schema.intro.ba_carousels || []
    wrap.outerHTML = _buildBACarouselUI(carousels)
    _bindBACarouselEvents()
    QA.markDirty(); QA.renderPreview()
  }

  // ── Config tab ───────────────────────────────────────────────────────────────
  function _buildConfigTab() {
    var q    = QA.quiz()
    var sch  = q.schema || {}
    var intr = sch.intro || {}

    var kanbanOpts = QA.KANBAN_OPTIONS.map(function(o) {
      return '<option value="' + QA.esc(o.value) + '"' + (q.kanban_target === o.value ? ' selected' : '') + '>' + QA.esc(o.label) + '</option>'
    }).join('')

    var publicLink = (location.origin || '') + '/quiz-render.html?q=' + encodeURIComponent(q.slug || '')

    var meta = sch.meta || {}

    return '<div class="qa-section-title" style="margin-top:6px">Geral</div>' +
      '<div class="qa-form-group"><label class="qa-label">Titulo do quiz</label><input class="qa-input" id="cfg-title" value="' + QA.esc(q.title) + '"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Descricao / Objetivo *</label><textarea class="qa-textarea" id="cfg-objective" style="min-height:50px" placeholder="Ex: Captar leads interessados em procedimentos faciais">' + QA.esc(meta.objective || '') + '</textarea></div>' +
      '<div class="qa-form-group"><label class="qa-label">Responsaveis *</label><div id="cfg-responsibles-wrap"><span style="font-size:11px;color:#9ca3af">Carregando equipe...</span></div></div>' +
      '<div class="qa-form-group"><label class="qa-label">Slug (URL)</label><input class="qa-input" id="cfg-slug" value="' + QA.esc(q.slug) + '"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Kanban destino</label><select class="qa-select" id="cfg-kanban">' + kanbanOpts + '</select></div>' +
      '<div class="qa-form-group"><label class="qa-label">Link publico</label>' +
        '<div class="qa-input-row">' +
          '<span class="qa-link-display" id="cfg-link">' + QA.esc(publicLink) + '</span>' +
          '<button class="qa-icon-btn" id="cfg-copy-link" title="Copiar link">' + QA.ICON.copy + '</button>' +
        '</div>' +
      '</div>' +
      _section('Tela de Introducao',
      '<div style="font-size:11px;color:#9ca3af;margin-bottom:10px">Use <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">{nome}</code> <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">{email}</code> <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">{telefone}</code> para inserir dados do lead</div>' +
      '<div class="qa-form-group"><label class="qa-label">Titulo da intro</label><textarea class="qa-textarea" id="cfg-intro-title">' + QA.esc(intr.title || '') + '</textarea></div>' +
      _buildAlignControl('cfg-title-align', 'Alinhamento do titulo', intr.title_align || 'center') +
      '<div class="qa-form-group"><label class="qa-label">Descricao</label><textarea class="qa-textarea" id="cfg-intro-desc">' + QA.esc(intr.description || '') + '</textarea></div>' +
      _buildAlignControl('cfg-desc-align', 'Alinhamento da descricao', intr.desc_align || 'center') +
      '<div class="qa-form-group"><label class="qa-label">Texto do botao CTA</label><input class="qa-input" id="cfg-cta" value="' + QA.esc(intr.cta_label || 'Comecar') + '"></div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="qa-form-group" style="flex:1"><label class="qa-label">Estilo CTA</label>' +
          '<select class="qa-select" id="cfg-cta-style">' +
            '<option value="gradient"' + ((intr.cta_style || 'gradient') === 'gradient' ? ' selected' : '') + '>Gradiente</option>' +
            '<option value="solid"' + (intr.cta_style === 'solid' ? ' selected' : '') + '>Solido</option>' +
            '<option value="outline"' + (intr.cta_style === 'outline' ? ' selected' : '') + '>Contorno</option>' +
          '</select></div>' +
        '<div class="qa-form-group" style="flex:1"><label class="qa-label">Cor CTA</label>' +
          '<input type="color" class="qa-input" id="cfg-cta-color" value="' + QA.esc(intr.cta_color || '#5B6CFF') + '" style="height:36px;padding:2px"></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="qa-form-group" style="flex:1"><label class="qa-label">Cor de fundo</label>' +
          '<input type="color" class="qa-input" id="cfg-bg-color" value="' + QA.esc(intr.bg_color || '#F4F3F8') + '" style="height:36px;padding:2px"></div>' +
        '<div class="qa-form-group" style="flex:1"><label class="qa-label">Cor primaria</label>' +
          '<input type="color" class="qa-input" id="cfg-primary-color" value="' + QA.esc((QA.quiz().schema.appearance || {}).primary_color || '#6366F1') + '" style="height:36px;padding:2px"></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="qa-form-group" style="flex:1"><label class="qa-label">Altura imagem (px)</label>' +
          '<input type="number" class="qa-input" id="cfg-cover-height" value="' + (intr.cover_height || 320) + '" min="100" max="600"></div>' +
        '<div class="qa-form-group" style="flex:1"></div>' +
      '</div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="qa-form-group" style="flex:1"><label class="qa-checkbox-row"><input type="checkbox" id="cfg-divider"' + (intr.show_divider !== false ? ' checked' : '') + '><span>Mostrar linha divisoria</span></label></div>' +
        '<div class="qa-form-group" style="flex:1"><label class="qa-label">Countdown (seg.)</label>' +
          '<input type="number" class="qa-input" id="cfg-countdown" value="' + (intr.countdown_seconds || 0) + '" min="0" max="3600" placeholder="0 = desativado"></div>' +
      '</div>' +
      (parseInt(intr.countdown_seconds) > 0 ? '<div class="qa-form-group"><label class="qa-label">Texto do contador</label><input class="qa-input" id="cfg-countdown-text" value="' + QA.esc(intr.countdown_text || 'Oferta expira em') + '" placeholder="Oferta expira em"></div>' : '')
      , {open: true}) +
      _section('Badges (Prova Social)',
        '<div style="font-size:11px;color:#9ca3af;margin-bottom:10px">Badges de autoridade exibidos na tela de inicio.</div>' +
        '<div id="cfg-badges-list">' + _buildBadgesEditor(intr.badges || []) + '</div>' +
        '<button class="qa-add-btn" id="cfg-badge-add" style="margin-bottom:12px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Adicionar Badge</button>'
      , {open: (intr.badges||[]).filter(function(b){return b.text}).length > 0, count: (intr.badges||[]).filter(function(b){return b.text}).length}) +
      _section('Blocos de Texto',
        '<div style="font-size:11px;color:#9ca3af;margin-bottom:10px">Textos em qualquer posicao. <strong>Simples</strong> = cinza. <strong>Destaque</strong> = azul.</div>' +
        '<div id="cfg-text-blocks">' + _buildTextBlocksUI(intr.text_blocks || []) + '</div>' +
        '<button class="qa-add-btn" id="cfg-add-text-block" style="margin-bottom:12px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Adicionar Bloco de Texto</button>'
      , {open: (intr.text_blocks||[]).length > 0, count: (intr.text_blocks||[]).length}) +
      _section('Checklist',
        '<div style="font-size:11px;color:#9ca3af;margin-bottom:10px">Lista de itens com check. Um item por linha. Com 2+ listas, vira carrossel automatico.</div>' +
      (function() {
        var lists = intr.checklists || []
        var pos = lists.length ? lists[0].after : 'title'
        return '<div class="qa-form-group" style="margin-bottom:8px"><label class="qa-label">Posicao de todos</label>' +
          '<select class="qa-select" id="cfg-cl-global-pos">' + _tbPositions.map(function(p) {
            return '<option value="' + p.value + '"' + (pos === p.value ? ' selected' : '') + '>' + p.label + '</option>'
          }).join('') + '</select></div>' +
        '<div id="cfg-checklists">' + lists.map(function(c, i) {
          return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;background:#fafafa">' +
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
              '<span style="font-size:11px;font-weight:700;color:#6b7280">Lista ' + (i+1) + '</span>' +
              '<button class="qa-icon-btn cl-del" data-idx="' + i + '" style="color:#ef4444;padding:4px" title="Remover"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
            '</div>' +
            '<textarea class="qa-textarea cl-items" data-idx="' + i + '" rows="3" placeholder="Um item por linha...">' + QA.esc((c.items || []).join('\n')) + '</textarea>' +
          '</div>'
        }).join('') + '</div>' +
        '<button class="qa-add-btn" id="cfg-add-checklist" style="margin-bottom:8px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Adicionar Lista</button>'
      })()
      , {open: (intr.checklists||[]).reduce(function(a,c){return a+(c.items?c.items.length:0)},0) > 0, count: (intr.checklists||[]).reduce(function(a,c){return a+(c.items?c.items.length:0)},0)}) +
      _section('Depoimentos',
        '<div style="font-size:11px;color:#9ca3af;margin-bottom:10px">Card de depoimento com estrelas e data.</div>' +
        '<div class="qa-form-group" style="margin-bottom:8px"><label class="qa-label">Posicao de todos</label>' +
          '<select class="qa-select" id="cfg-tm-global-pos">' + _tbPositions.map(function(p) {
            var firstPos = (intr.testimonials && intr.testimonials.length) ? intr.testimonials[0].after : 'media'
            return '<option value="' + p.value + '"' + (firstPos === p.value ? ' selected' : '') + '>' + p.label + '</option>'
          }).join('') + '</select></div>' +
        '<div id="cfg-testimonials">' + _buildTestimonialsUI(intr.testimonials || []) + '</div>' +
        '<button class="qa-add-btn" id="cfg-add-testimonial" style="margin-bottom:12px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Adicionar Depoimento</button>'
      , {open: (intr.testimonials||[]).length > 0, count: (intr.testimonials||[]).length}) +
      _section('Carrossel Antes/Depois',
        '<div style="font-size:11px;color:#9ca3af;margin-bottom:10px">Banner rotativo com imagens de antes e depois.</div>' +
        _buildBACarouselUI(intr.ba_carousels || [])
      , {open: (intr.ba_carousels||[]).reduce(function(a,c){return a+(c.slides?c.slides.length:0)},0) > 0, count: (intr.ba_carousels||[]).reduce(function(a,c){return a+(c.slides?c.slides.length:0)},0)}) +
      _section('Linha do Tempo do Colageno',
        '<div style="font-size:11px;color:#9ca3af;margin-bottom:10px">Animacao interativa de envelhecimento.</div>' +
        (function() {
          var ct = intr.collagen_timeline || null
          if (!ct) return '<button class="qa-add-btn" id="cfg-add-collagen" style="margin-bottom:12px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Ativar</button>'
          var posOpts = _tbPositions.map(function(p) { return '<option value="' + p.value + '"' + ((ct.after||'media')===p.value?' selected':'') + '>' + p.label + '</option>' }).join('')
          return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;background:#fafafa"><div class="qa-form-group" style="margin-bottom:6px"><label class="qa-label">Posicao</label><select class="qa-select" id="cfg-collagen-pos">' + posOpts + '</select></div><div style="font-size:10px;color:#059669;margin-bottom:6px">Ativo</div><button class="qa-icon-btn" id="cfg-del-collagen" style="color:#ef4444;font-size:11px;padding:4px 8px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Desativar</button></div>'
        })()
      , {open: !!intr.collagen_timeline, count: intr.collagen_timeline ? 1 : 0}) +
      _section('Midia da Introducao',
        _buildConfigMediaSection(intr)
      , {open: !!(intr.image_url || intr.logo_url || intr.video_url)}) +
      _buildPixelsSection() +
      _buildNotificationsSection()
  }

  function _buildPixelsSection() {
    var px = (QA.quiz().schema.pixels) || {}
    var pixelCount = [px.facebook_pixel_id, px.google_tag_id, px.tiktok_pixel_id].filter(function(v){return v}).length
    return _section('Pixels e Rastreamento',
      '<div style="font-size:11px;color:#9ca3af;margin-bottom:10px">Eventos: PageView, InitiateQuiz, CompleteQuiz, Lead, Contact.</div>' +
      '<div class="qa-form-group"><label class="qa-label">Facebook Pixel ID</label><input class="qa-input" id="cfg-fb-pixel" value="' + QA.esc(px.facebook_pixel_id || '') + '" placeholder="Ex: 123456789012345"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Google Tag (GA4 ou GTM)</label><input class="qa-input" id="cfg-gtag" value="' + QA.esc(px.google_tag_id || '') + '" placeholder="Ex: G-XXXXXXXXXX ou GTM-XXXXXXX"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Google Ads Conversion ID</label><input class="qa-input" id="cfg-gads-id" value="' + QA.esc(px.google_ads_id || '') + '" placeholder="Ex: AW-123456789"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Google Ads Conversion Label</label><input class="qa-input" id="cfg-gads-label" value="' + QA.esc(px.google_ads_label || '') + '" placeholder="Ex: AbCdEfGhIjK"></div>' +
      '<div class="qa-form-group"><label class="qa-label">TikTok Pixel ID</label><input class="qa-input" id="cfg-tiktok-pixel" value="' + QA.esc(px.tiktok_pixel_id || '') + '" placeholder="Ex: CXXXXXXXXXXXXXXXXX"></div>'
    , {open: false, count: pixelCount})
  }

  async function _loadStaffSelector() {
    var wrap = document.getElementById('cfg-responsibles-wrap')
    if (!wrap) return

    var staff = await QA.loadStaff()
    var _activeQuiz = QA.quiz()
    var currentIds = ((_activeQuiz.schema.meta || {}).responsibles || []).map(function(r) { return r.id })

    if (staff.length === 0) {
      wrap.innerHTML = '<span style="font-size:11px;color:#9ca3af">Nenhum membro cadastrado.</span>'
      return
    }

    var roleLabels = { admin: 'Admin', therapist: 'Terapeuta', receptionist: 'Recepcionista', viewer: 'Visualizador' }

    var currentResps = (_activeQuiz.schema.meta || {}).responsibles || []

    wrap.innerHTML = staff.map(function(s) {
      var sId = s.user_id || s.id || ''
      var name = ((s.first_name || '') + ' ' + (s.last_name || '')).trim() || s.email || 'Sem nome'
      var roleLabel = roleLabels[s.role] || s.role || ''
      var existing = currentResps.find(function(r) { return r.id === sId })
      var checked = existing ? ' checked' : ''
      var phone = existing ? (existing.phone || s.phone || '') : (s.phone || '')
      return '<div class="cfg-staff-row" style="margin-bottom:8px;padding:8px 10px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6">' +
        '<label class="qa-checkbox-row" style="margin-bottom:4px">' +
          '<input type="checkbox" class="cfg-staff-cb" data-staff-id="' + QA.esc(sId) + '" data-staff-name="' + QA.esc(name) + '" data-staff-role="' + QA.esc(s.role || '') + '"' + checked + '>' +
          '<span style="font-weight:700">' + QA.esc(name) + '</span>' +
          '<span style="font-size:10px;color:#9ca3af;margin-left:4px">(' + QA.esc(roleLabel) + ')</span>' +
        '</label>' +
        '<div class="cfg-staff-phone-row" style="display:' + (existing ? 'flex' : 'none') + ';align-items:center;gap:6px;margin-left:22px">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="#25D366"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/></svg>' +
          '<input class="qa-input cfg-staff-phone" data-staff-id="' + QA.esc(sId) + '" value="' + QA.esc(phone) + '" placeholder="5511999990000" style="flex:1;padding:4px 8px;font-size:12px">' +
        '</div>' +
      '</div>'
    }).join('')

    // Bind checkboxes + phones
    function _syncResponsibles() {
      var selected = []
      wrap.querySelectorAll('.cfg-staff-cb:checked').forEach(function(el) {
        var sId = el.getAttribute('data-staff-id')
        var phoneInput = wrap.querySelector('.cfg-staff-phone[data-staff-id="' + sId + '"]')
        selected.push({
          id:    sId,
          name:  el.getAttribute('data-staff-name'),
          role:  el.getAttribute('data-staff-role'),
          phone: phoneInput ? phoneInput.value.replace(/\D/g, '') : '',
        })
      })
      if (!_activeQuiz.schema.meta) _activeQuiz.schema.meta = {}
      _activeQuiz.schema.meta.responsibles = selected

      // Auto-sync whatsapp_numbers das notificações
      var phones = selected.map(function(r) { return r.phone }).filter(function(p) { return p.length >= 10 })
      if (!_activeQuiz.schema.notifications) _activeQuiz.schema.notifications = {}
      _activeQuiz.schema.notifications.whatsapp_numbers = phones.join(', ')
      var phonesField = document.getElementById('cfg-notif-phones')
      if (phonesField) phonesField.value = _activeQuiz.schema.notifications.whatsapp_numbers

      QA.markDirty()
    }

    wrap.querySelectorAll('.cfg-staff-cb').forEach(function(cb) {
      cb.onchange = function() {
        var row = cb.closest('.cfg-staff-row')
        var phoneRow = row ? row.querySelector('.cfg-staff-phone-row') : null
        if (phoneRow) phoneRow.style.display = cb.checked ? 'flex' : 'none'
        _syncResponsibles()
      }
    })
    wrap.querySelectorAll('.cfg-staff-phone').forEach(function(inp) {
      inp.addEventListener('input', function() { _syncResponsibles() })
    })
  }

  function _buildNotificationsSection() {
    var notif = (QA.quiz().schema.notifications) || {}
    var hasNotif = !!(notif.whatsapp_numbers || notif.webhook_url)
    return _section('Notificacoes WhatsApp',
      '<div style="font-size:11px;color:#9ca3af;margin-bottom:10px">Alertas automaticos as 18h.</div>' +
      '<div class="qa-form-group"><label class="qa-label">Numeros WhatsApp (DDI+DDD, separados por virgula)</label><textarea class="qa-textarea" id="cfg-notif-phones" placeholder="5511999990000, 5511888880000" style="min-height:50px">' + QA.esc(notif.whatsapp_numbers || '') + '</textarea></div>' +
      '<div class="qa-form-group"><label class="qa-label">Webhook URL</label><input class="qa-input" id="cfg-webhook-url" value="' + QA.esc(notif.webhook_url || '') + '" placeholder="https://seu-n8n.com/webhook/quiz-alerts"></div>'
    , {open: false, count: hasNotif ? 1 : 0})
  }

  // ── Authority Badges Editor ──────────────────────────────────────────────
  var _BADGE_ICONS = {
    star:  '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
    users: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87"/><path d="M16 3.13a4 4 0 010 7.75"/></svg>',
    clock: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
    check: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
    heart: '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
    shield:'<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
  }

  function _buildBadgesEditor(badges) {
    if (!badges || !badges.length) return '<div style="font-size:11px;color:#d1d5db;padding:8px 0">Nenhum badge adicionado</div>'
    var iconOpts = Object.keys(_BADGE_ICONS).map(function(k) { return '<option value="' + k + '">' + k + '</option>' }).join('')
    return badges.map(function(b, i) {
      return '<div class="cfg-badge-row" data-idx="' + i + '" style="display:flex;gap:6px;align-items:center;margin-bottom:6px;padding:6px 8px;background:#f9fafb;border-radius:8px;border:1px solid #f3f4f6">' +
        '<select class="qa-select cfg-badge-icon" style="width:70px;padding:4px 6px;font-size:11px" data-idx="' + i + '">' +
          Object.keys(_BADGE_ICONS).map(function(k) { return '<option value="' + k + '"' + (b.icon === k ? ' selected' : '') + '>' + k + '</option>' }).join('') +
        '</select>' +
        '<input class="qa-input cfg-badge-text" data-idx="' + i + '" value="' + QA.esc(b.text || '') + '" placeholder="Ex: 4.8 out of 5" style="flex:1;padding:4px 8px;font-size:11px">' +
        '<input type="color" class="cfg-badge-color" data-idx="' + i + '" value="' + QA.esc(b.iconColor || '#6B7280') + '" style="width:28px;height:28px;border:none;padding:0;cursor:pointer">' +
        '<button class="qa-icon-btn cfg-badge-del" data-idx="' + i + '" style="padding:2px 4px" title="Remover">' +
          '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>'
    }).join('')
  }

  function _bindBadgesEvents() {
    var _activeQuiz = QA.quiz()
    if (!_activeQuiz.schema.intro.badges) _activeQuiz.schema.intro.badges = []

    function _syncBadges() {
      QA.markDirty()
      QA.renderPreview()
      var list = document.getElementById('cfg-badges-list')
      if (list) list.innerHTML = _buildBadgesEditor(_activeQuiz.schema.intro.badges)
      _attachBadgeListeners()
    }

    function _attachBadgeListeners() {
      document.querySelectorAll('.cfg-badge-text').forEach(function(el) {
        el.addEventListener('input', function() {
          var idx = parseInt(el.dataset.idx)
          _activeQuiz.schema.intro.badges[idx].text = el.value
          QA.markDirty(); QA.renderPreview()
        })
      })
      document.querySelectorAll('.cfg-badge-icon').forEach(function(el) {
        el.addEventListener('change', function() {
          var idx = parseInt(el.dataset.idx)
          _activeQuiz.schema.intro.badges[idx].icon = el.value
          QA.markDirty(); QA.renderPreview()
        })
      })
      document.querySelectorAll('.cfg-badge-color').forEach(function(el) {
        el.addEventListener('input', function() {
          var idx = parseInt(el.dataset.idx)
          _activeQuiz.schema.intro.badges[idx].iconColor = el.value
          QA.markDirty(); QA.renderPreview()
        })
      })
      document.querySelectorAll('.cfg-badge-del').forEach(function(el) {
        el.addEventListener('click', function() {
          var idx = parseInt(el.dataset.idx)
          _activeQuiz.schema.intro.badges.splice(idx, 1)
          _syncBadges()
        })
      })
    }

    var addBtn = document.getElementById('cfg-badge-add')
    if (addBtn) addBtn.addEventListener('click', function() {
      _activeQuiz.schema.intro.badges.push({ icon: 'star', text: '', iconColor: '#6B7280' })
      _syncBadges()
    })

    _attachBadgeListeners()
  }

  function _bindNotificationsEvents() {
    var phoneEl = document.getElementById('cfg-notif-phones')
    var webhookEl = document.getElementById('cfg-webhook-url')
    if (phoneEl) phoneEl.addEventListener('input', function() {
      if (!QA.quiz().schema.notifications) QA.quiz().schema.notifications = {}
      QA.quiz().schema.notifications.whatsapp_numbers = phoneEl.value.trim()
      QA.markDirty()
    })
    if (webhookEl) webhookEl.addEventListener('input', function() {
      if (!QA.quiz().schema.notifications) QA.quiz().schema.notifications = {}
      QA.quiz().schema.notifications.webhook_url = webhookEl.value.trim()
      QA.markDirty()
    })
  }

  function _bindPixelsEvents() {
    var binds = [
      { id: 'cfg-fb-pixel',     key: 'facebook_pixel_id' },
      { id: 'cfg-gtag',         key: 'google_tag_id' },
      { id: 'cfg-gads-id',      key: 'google_ads_id' },
      { id: 'cfg-gads-label',   key: 'google_ads_label' },
      { id: 'cfg-tiktok-pixel', key: 'tiktok_pixel_id' },
    ]
    binds.forEach(function(b) {
      var el = document.getElementById(b.id)
      if (!el) return
      el.addEventListener('input', function() {
        if (!QA.quiz().schema.pixels) QA.quiz().schema.pixels = {}
        QA.quiz().schema.pixels[b.key] = el.value.trim()
        QA.markDirty()
      })
    })
  }

  function _buildConfigMediaSection(intr) {
    var app      = (QA.quiz().schema.appearance) || {}
    var coverUrl = intr.image_url || ''
    var logoUrl  = intr.logo_url  || ''
    var vidUrl   = intr.video_url || ''
    var autoplay = intr.video_autoplay !== false
    var aspect   = intr.image_aspect || '16:9'
    var fit      = app.cover_fit || 'cover'

    var aspectStyle = aspect === '9:16'
      ? 'width:50%;aspect-ratio:9/16;height:auto;margin-left:auto;margin-right:auto'
      : aspect === '1:1'
        ? 'width:60%;aspect-ratio:1/1;height:auto;margin-left:auto;margin-right:auto'
        : 'width:100%;height:120px'
    var coverPrev = coverUrl
      ? '<img id="cfg-cover-prev" src="' + QA.esc(QA.resolveImgUrl(coverUrl)) + '" style="' + aspectStyle + ';object-fit:' + fit + ';border-radius:8px;margin-top:6px;background:#f3f4f6;display:block">'
      : '<div id="cfg-cover-prev" style="display:none"></div>'

    var logoPrev = logoUrl
      ? '<img id="cfg-logo-prev" src="' + QA.esc(QA.resolveImgUrl(logoUrl)) + '" style="width:48px;height:48px;object-fit:contain;border-radius:8px;margin-top:6px;background:#f3f4f6;display:block">'
      : '<div id="cfg-logo-prev" style="display:none"></div>'

    var vidEmbed = QA.resolveVideoEmbed(vidUrl, false)
    var vidPrev  = vidEmbed
      ? '<div id="cfg-vid-prev" style="width:100%;aspect-ratio:16/9;border-radius:8px;overflow:hidden;margin-top:6px;background:#000"><iframe src="' + QA.esc(vidEmbed) + '" style="width:100%;height:100%;border:0" allowfullscreen></iframe></div>'
      : '<div id="cfg-vid-prev" style="display:none"></div>'

    var focus = intr.image_focus || 'center center'
    var zoom = intr.image_zoom || '100'
    var radius = intr.image_radius || '12'
    var focusOpts = [
      ['center 20%','Rosto (topo)'],['center top','Topo'],['center 40%','Meio-alto'],
      ['center center','Centro'],['center 60%','Meio-baixo'],['center bottom','Base']
    ]

    return '<div class="qa-form-group">' +
        '<label class="qa-label">URL da imagem de capa</label>' +
        '<input class="qa-input" id="cfg-cover-url" value="' + QA.esc(coverUrl) + '" placeholder="https://... ou link do Google Drive">' +
        coverPrev +
      '</div>' +
      (coverUrl ? '<div style="display:flex;gap:10px">' +
        '<div class="qa-form-group" style="flex:1">' +
          '<label class="qa-label">Formato</label>' +
          '<select class="qa-select" id="cfg-cover-aspect">' +
            '<option value="16:9"' + (aspect === '16:9' ? ' selected' : '') + '>Paisagem (16:9)</option>' +
            '<option value="9:16"' + (aspect === '9:16' ? ' selected' : '') + '>Reels / Stories (9:16)</option>' +
            '<option value="1:1"' + (aspect === '1:1' ? ' selected' : '') + '>Quadrado (1:1)</option>' +
            '<option value="65"' + (aspect === '65' ? ' selected' : '') + '>Retrato (como Antes/Depois)</option>' +
          '</select>' +
        '</div>' +
        '<div class="qa-form-group" style="flex:1">' +
          '<label class="qa-label">Cantos</label>' +
          '<select class="qa-select" id="cfg-cover-radius">' +
            '<option value="12"' + (radius === '12' ? ' selected' : '') + '>Arredondado</option>' +
            '<option value="0"' + (radius === '0' ? ' selected' : '') + '>Reto</option>' +
            '<option value="50"' + (radius === '50' ? ' selected' : '') + '>Muito arredondado</option>' +
          '</select>' +
        '</div>' +
      '</div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="qa-form-group" style="flex:1">' +
          '<label class="qa-label">Foco</label>' +
          '<select class="qa-select" id="cfg-cover-focus">' +
            focusOpts.map(function(o) { return '<option value="' + o[0] + '"' + (focus === o[0] ? ' selected' : '') + '>' + o[1] + '</option>' }).join('') +
          '</select>' +
        '</div>' +
        '<div class="qa-form-group" style="flex:1">' +
          '<label class="qa-label">Zoom ' + zoom + '%</label>' +
          '<input type="range" id="cfg-cover-zoom" min="100" max="200" value="' + zoom + '" style="width:100%">' +
        '</div>' +
      '</div>' : '') +
      '<div class="qa-form-group" style="margin-top:4px">' +
        '<label class="qa-label">URL do vídeo (YouTube / Vimeo / Google Drive)</label>' +
        '<input class="qa-input" id="cfg-video-url" value="' + QA.esc(vidUrl) + '" placeholder="https://youtube.com/watch?v=...">' +
        '<label class="qa-checkbox-row" style="margin-top:8px"><input type="checkbox" id="cfg-video-autoplay"' + (autoplay ? ' checked' : '') + '><span>Autoplay com mudo</span></label>' +
        vidPrev +
      '</div>' +
      '<div style="font-size:11px;color:#9ca3af;margin-bottom:12px">Se vídeo e imagem estiverem preenchidos, o vídeo tem prioridade.</div>' +
      '<div class="qa-form-group">' +
        '<label class="qa-label">URL do logo da clínica</label>' +
        '<input class="qa-input" id="cfg-logo-url" value="' + QA.esc(logoUrl) + '" placeholder="https://... ou link do Google Drive">' +
        logoPrev +
      '</div>'
  }

  function _bindConfigEvents() {
    var _activeQuiz = QA.quiz()

    function _bind(id, setter) {
      var el = document.getElementById(id)
      if (!el) return
      el.addEventListener('input', function() {
        setter(el.value)
        QA.markDirty()
        QA.renderPreview()
      })
    }

    _bind('cfg-title', function(v) {
      _activeQuiz.title = v
      var slugEl = document.getElementById('cfg-slug')
      if (slugEl) {
        slugEl.value = QA.slugify(v)
        _activeQuiz.slug = slugEl.value
        _updateLinkDisplay()
      }
    })

    _bind('cfg-slug', function(v) {
      _activeQuiz.slug = QA.slugify(v)
      var el = document.getElementById('cfg-slug')
      if (el) el.value = _activeQuiz.slug
      _updateLinkDisplay()
    })

    _bind('cfg-objective', function(v) {
      if (!_activeQuiz.schema.meta) _activeQuiz.schema.meta = {}
      _activeQuiz.schema.meta.objective = v
    })

    // Carregar equipe para seletor de responsáveis
    _loadStaffSelector()

    var kanbanEl = document.getElementById('cfg-kanban')
    if (kanbanEl) kanbanEl.onchange = function() { _activeQuiz.kanban_target = kanbanEl.value; QA.markDirty() }

    _bind('cfg-intro-title', function(v) { _activeQuiz.schema.intro.title = v })
    _bind('cfg-intro-desc',  function(v) { _activeQuiz.schema.intro.description = v })

    _bindAlignControl('cfg-title-align', function(v) { _activeQuiz.schema.intro.title_align = v })
    _bindAlignControl('cfg-desc-align', function(v) { _activeQuiz.schema.intro.desc_align = v })
    _bind('cfg-cta',         function(v) { _activeQuiz.schema.intro.cta_label = v })
    _bind('cfg-cta-color',   function(v) { _activeQuiz.schema.intro.cta_color = v })
    _bind('cfg-bg-color',    function(v) { _activeQuiz.schema.intro.bg_color = v })
    _bind('cfg-primary-color', function(v) { _activeQuiz.schema.appearance.primary_color = v })
    _bind('cfg-cover-height',function(v) { _activeQuiz.schema.intro.cover_height = parseInt(v) || 320 })
    _bind('cfg-countdown',   function(v) { _activeQuiz.schema.intro.countdown_seconds = parseInt(v) || 0 })
    var countdownEl = document.getElementById('cfg-countdown')
    if (countdownEl) countdownEl.addEventListener('change', function() {
      var content = document.getElementById('qa-editor-content')
      if (content && window.QAEditor) { content.innerHTML = QAEditor.buildConfigTab(); QAEditor.bindConfigEvents() }
    })
    _bind('cfg-countdown-text', function(v) { _activeQuiz.schema.intro.countdown_text = v })

    var ctaStyleEl = document.getElementById('cfg-cta-style')
    if (ctaStyleEl) ctaStyleEl.onchange = function() { _activeQuiz.schema.intro.cta_style = ctaStyleEl.value; QA.markDirty(); QA.renderPreview() }

    var dividerEl = document.getElementById('cfg-divider')
    if (dividerEl) dividerEl.onchange = function() { _activeQuiz.schema.intro.show_divider = dividerEl.checked; QA.markDirty(); QA.renderPreview() }

    // Collapsible sections
    _bindCollapseEvents()

    // Text blocks, Checklists, Testimonials, BA Carousel, Collagen
    _bindTextBlockEvents()
    _bindChecklistEvents()
    _bindTestimonialEvents()
    _bindBACarouselEvents()

    // Collagen Timeline
    var addCollagen = document.getElementById('cfg-add-collagen')
    if (addCollagen) addCollagen.onclick = function() {
      _activeQuiz.schema.intro.collagen_timeline = { after: 'media' }
      QA.markDirty(); QA.renderPreview()
      if (window.QAEditor) { var content = document.getElementById('qa-editor-content'); if (content) { content.innerHTML = QAEditor.buildConfigTab(); QAEditor.bindConfigEvents() } }
    }
    var collagenPos = document.getElementById('cfg-collagen-pos')
    if (collagenPos) collagenPos.addEventListener('change', function() {
      _activeQuiz.schema.intro.collagen_timeline.after = collagenPos.value
      QA.markDirty(); QA.renderPreview()
    })
    var delCollagen = document.getElementById('cfg-del-collagen')
    if (delCollagen) delCollagen.onclick = function() {
      delete _activeQuiz.schema.intro.collagen_timeline
      QA.markDirty(); QA.renderPreview()
      if (window.QAEditor) { var content = document.getElementById('qa-editor-content'); if (content) { content.innerHTML = QAEditor.buildConfigTab(); QAEditor.bindConfigEvents() } }
    }

    // Media bindings
    _bind('cfg-cover-url', function(v) {
      _activeQuiz.schema.intro.image_url = v
    })
    var coverUrlEl = document.getElementById('cfg-cover-url')
    if (coverUrlEl) coverUrlEl.addEventListener('change', function() {
      var content = document.getElementById('qa-editor-content')
      if (content && window.QAEditor) { content.innerHTML = QAEditor.buildConfigTab(); QAEditor.bindConfigEvents() }
    })

    var aspectEl = document.getElementById('cfg-cover-aspect')
    if (aspectEl) aspectEl.onchange = function() {
      _activeQuiz.schema.intro.image_aspect = aspectEl.value
      QA.markDirty()
      QA.renderPreview()
      var prev = document.getElementById('cfg-cover-prev')
      if (prev) {
        var val = aspectEl.value
        if (val === '9:16') {
          prev.style.width = '50%'; prev.style.height = 'auto'; prev.style.aspectRatio = '9/16'
          prev.style.marginLeft = 'auto'; prev.style.marginRight = 'auto'
        } else if (val === '1:1') {
          prev.style.width = '60%'; prev.style.height = 'auto'; prev.style.aspectRatio = '1/1'
          prev.style.marginLeft = 'auto'; prev.style.marginRight = 'auto'
        } else {
          prev.style.width = '100%'; prev.style.height = '120px'; prev.style.aspectRatio = 'auto'
          prev.style.marginLeft = ''; prev.style.marginRight = ''
        }
      }
    }

    var radiusEl = document.getElementById('cfg-cover-radius')
    if (radiusEl) radiusEl.onchange = function() {
      _activeQuiz.schema.intro.image_radius = radiusEl.value
      QA.markDirty(); QA.renderPreview()
    }

    var focusEl = document.getElementById('cfg-cover-focus')
    if (focusEl) focusEl.onchange = function() {
      _activeQuiz.schema.intro.image_focus = focusEl.value
      QA.markDirty(); QA.renderPreview()
    }

    var zoomEl = document.getElementById('cfg-cover-zoom')
    if (zoomEl) {
      zoomEl.addEventListener('input', function() {
        _activeQuiz.schema.intro.image_zoom = zoomEl.value
        var lbl = zoomEl.parentElement.querySelector('.qa-label')
        if (lbl) lbl.textContent = 'Zoom ' + zoomEl.value + '%'
        QA.markDirty(); QA.renderPreview()
      })
    }

    _bind('cfg-video-url', function(v) {
      _activeQuiz.schema.intro.video_url = v
    })
    var vidUrlEl = document.getElementById('cfg-video-url')
    if (vidUrlEl) vidUrlEl.addEventListener('change', function() {
      var content = document.getElementById('qa-editor-content')
      if (content && window.QAEditor) { content.innerHTML = QAEditor.buildConfigTab(); QAEditor.bindConfigEvents() }
    })

    var autoplayEl = document.getElementById('cfg-video-autoplay')
    if (autoplayEl) autoplayEl.onchange = function() {
      _activeQuiz.schema.intro.video_autoplay = autoplayEl.checked
      QA.markDirty()
    }

    _bind('cfg-logo-url', function(v) {
      _activeQuiz.schema.intro.logo_url = v
    })
    var logoUrlEl = document.getElementById('cfg-logo-url')
    if (logoUrlEl) logoUrlEl.addEventListener('change', function() {
      var content = document.getElementById('qa-editor-content')
      if (content && window.QAEditor) { content.innerHTML = QAEditor.buildConfigTab(); QAEditor.bindConfigEvents() }
    })

    var copyBtn = document.getElementById('cfg-copy-link')
    if (copyBtn) {
      copyBtn.onclick = function() {
        var link = (location.origin || '') + '/quiz-render.html?q=' + encodeURIComponent(_activeQuiz.slug || '')
        if (navigator.clipboard) navigator.clipboard.writeText(link)
        copyBtn.style.color = '#059669'
        setTimeout(function() { copyBtn.style.color = '' }, 1200)
      }
    }

    _bindPixelsEvents()
    _bindNotificationsEvents()
    _bindBadgesEvents()
  }

  function _updateLinkDisplay() {
    var el = document.getElementById('cfg-link')
    var _activeQuiz = QA.quiz()
    if (el && _activeQuiz) {
      el.textContent = (location.origin || '') + '/quiz-render.html?q=' + encodeURIComponent(_activeQuiz.slug || '')
    }
  }

  // ── Appearance tab ───────────────────────────────────────────────────────────
  function _buildAppearanceTab() {
    var _activeQuiz = QA.quiz()
    var app      = (_activeQuiz.schema.appearance) || {}
    var intr     = (_activeQuiz.schema.intro) || {}
    var primary  = app.primary_color || '#6366F1'

    var coverFit = app.cover_fit || 'cover'
    var coverPrev = intr.image_url ? '<img id="app-cover-prev" src="' + QA.esc(QA.resolveImgUrl(intr.image_url)) + '" style="width:100%;height:80px;object-fit:' + coverFit + ';border-radius:8px;margin-top:6px;background:#f3f4f6;display:block">' : '<div id="app-cover-prev" style="display:none"></div>'
    var logoPrev  = intr.logo_url  ? '<img id="app-logo-prev"  src="' + QA.esc(QA.resolveImgUrl(intr.logo_url)) + '" style="width:48px;height:48px;object-fit:contain;border-radius:8px;margin-top:6px;background:#f3f4f6;display:block">' : '<div id="app-logo-prev" style="display:none"></div>'

    return '<div class="qa-section-title">Imagens</div>' +
      '<div class="qa-form-group"><label class="qa-label">URL da imagem de capa (intro)</label><input class="qa-input" id="app-cover" value="' + QA.esc(intr.image_url || '') + '" placeholder="https://... ou link do Google Drive">' + coverPrev + '</div>' +
      '<div class="qa-form-group" style="margin-top:6px"><label class="qa-label">Ajuste da capa</label><select class="qa-input" id="app-cover-fit"><option value="cover"' + (coverFit==='cover'?' selected':'') + '>Preencher (cortar)</option><option value="contain"' + (coverFit==='contain'?' selected':'') + '>Conter (mostrar tudo)</option></select></div>' +
      '<div class="qa-form-group"><label class="qa-label">URL do logo da clínica</label><input class="qa-input" id="app-logo" value="' + QA.esc(intr.logo_url || '') + '" placeholder="https://... ou link do Google Drive">' + logoPrev + '</div>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Cor primária</div>' +
      '<div class="qa-color-row">' +
        '<input type="color" class="qa-color-input" id="app-color" value="' + QA.esc(primary) + '">' +
        '<input class="qa-input" id="app-color-text" value="' + QA.esc(primary) + '" style="width:110px">' +
        '<span style="font-size:12px;color:#6b7280">Cor dos botões e destaques</span>' +
      '</div>'
  }

  function _bindAppearanceEvents() {
    var _activeQuiz = QA.quiz()

    function _bind(id, setter) {
      var el = document.getElementById(id)
      if (!el) return
      el.addEventListener('input', function() { setter(el.value); QA.markDirty(); QA.renderPreview() })
      el.addEventListener('change', function() { setter(el.value); QA.markDirty(); QA.renderPreview() })
    }

    _bind('app-cover', function(v) {
      _activeQuiz.schema.intro.image_url = v
      var prev = document.getElementById('app-cover-prev')
      if (prev) { prev.src = QA.resolveImgUrl(v); prev.style.display = v ? 'block' : 'none' }
    })
    _bind('app-logo',  function(v) {
      _activeQuiz.schema.intro.logo_url  = v
      var prev = document.getElementById('app-logo-prev')
      if (prev) { prev.src = QA.resolveImgUrl(v); prev.style.display = v ? 'block' : 'none' }
    })
    _bind('app-cover-fit', function(v) {
      _activeQuiz.schema.appearance.cover_fit = v
      var prev = document.getElementById('app-cover-prev')
      if (prev) prev.style.objectFit = v
    })

    var colorPicker = document.getElementById('app-color')
    var colorText   = document.getElementById('app-color-text')

    if (colorPicker) {
      colorPicker.oninput = function() {
        _activeQuiz.schema.appearance.primary_color = colorPicker.value
        if (colorText) colorText.value = colorPicker.value
        QA.markDirty()
        QA.renderPreview()
      }
    }
    if (colorText) {
      colorText.oninput = function() {
        var v = colorText.value
        if (/^#[0-9A-Fa-f]{6}$/.test(v)) {
          _activeQuiz.schema.appearance.primary_color = v
          if (colorPicker) colorPicker.value = v
          QA.markDirty()
          QA.renderPreview()
        }
      }
    }
  }

  // ── Tela Final (Thank You) tab ───────────────────────────────────────────────
  var _tyPositions = [
    { value: 'above_media', label: 'Acima da midia' },
    { value: 'below_media', label: 'Abaixo da midia' },
    { value: 'above_btn',   label: 'Acima do botao' },
  ]
  function _tyPosSelect(cls, current, idx) {
    return '<select class="qa-select ' + cls + '"' + (idx != null ? ' data-idx="' + idx + '"' : '') + ' style="width:auto;min-width:120px;font-size:11px">' +
      _tyPositions.map(function(p) { return '<option value="' + p.value + '"' + ((current || 'below_media') === p.value ? ' selected' : '') + '>' + p.label + '</option>' }).join('') +
    '</select>'
  }

  function _buildThankyouTab() {
    var _activeQuiz = QA.quiz()
    var outr         = (_activeQuiz.schema.outro) || {}
    var imgUrl       = outr.image_url      || ''
    var vidUrl       = outr.video_url      || ''
    var autoplay     = outr.video_autoplay !== false
    var btnColor     = outr.btn_color      || '#111111'
    var btnTextColor = outr.btn_text_color || '#ffffff'

    var imgPrev = imgUrl
      ? '<img id="ty-img-prev" src="' + QA.esc(QA.resolveImgUrl(imgUrl)) + '" style="width:100%;height:80px;object-fit:cover;border-radius:8px;margin-top:6px;display:block">'
      : '<div id="ty-img-prev" style="display:none"></div>'

    var varHint = '<div style="font-size:11px;color:#9ca3af;margin-top:-8px;margin-bottom:10px">Variáveis disponíveis: <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">{nome}</code> <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">{email}</code> <code style="background:#f3f4f6;padding:1px 5px;border-radius:4px">{telefone}</code></div>'

    return '<div class="qa-section-title">Texto</div>' +
      varHint +
      '<div class="qa-form-group"><label class="qa-label">Título</label><input class="qa-input" id="ty-title" value="' + QA.esc(outr.title || 'Perfeito!') + '" placeholder="Ex: Parabéns, {nome}!"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Descrição</label><textarea class="qa-textarea" id="ty-message" placeholder="Ex: Olá {nome}, nossa equipe entrará em contato em breve.">' + QA.esc(outr.message || 'Nossa equipe entrará em contato em breve.') + '</textarea></div>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Midia</div>' +
      '<div class="qa-form-group"><label class="qa-label">URL da imagem</label><input class="qa-input" id="ty-image-url" value="' + QA.esc(imgUrl) + '" placeholder="https://... ou link do Google Drive">' + imgPrev + '</div>' +
      (imgUrl ? (function() {
        var iAspect = outr.image_aspect || '16:9'
        var iFocus = outr.image_focus || 'center center'
        var iZoom = outr.image_zoom || '100'
        var iRadius = outr.image_radius || '12'
        var focusOpts = [['center 20%','Rosto (topo)'],['center top','Topo'],['center 40%','Meio-alto'],['center center','Centro'],['center 60%','Meio-baixo'],['center bottom','Base']]
        return '<div style="display:flex;gap:10px">' +
          '<div class="qa-form-group" style="flex:1"><label class="qa-label">Formato</label><select class="qa-select" id="ty-img-aspect">' +
            '<option value="16:9"' + (iAspect==='16:9'?' selected':'') + '>Paisagem (16:9)</option>' +
            '<option value="1:1"' + (iAspect==='1:1'?' selected':'') + '>Quadrado (1:1)</option>' +
            '<option value="9:16"' + (iAspect==='9:16'?' selected':'') + '>Reels / Stories (9:16)</option>' +
            '<option value="65"' + (iAspect==='65'?' selected':'') + '>Retrato (como Antes/Depois)</option>' +
          '</select></div>' +
          '<div class="qa-form-group" style="flex:1"><label class="qa-label">Cantos</label><select class="qa-select" id="ty-img-radius">' +
            '<option value="12"' + (iRadius==='12'?' selected':'') + '>Arredondado</option>' +
            '<option value="0"' + (iRadius==='0'?' selected':'') + '>Reto</option>' +
            '<option value="50"' + (iRadius==='50'?' selected':'') + '>Muito arredondado</option>' +
          '</select></div></div>' +
        '<div style="display:flex;gap:10px">' +
          '<div class="qa-form-group" style="flex:1"><label class="qa-label">Foco</label><select class="qa-select" id="ty-img-focus">' +
            focusOpts.map(function(o){return '<option value="'+o[0]+'"'+(iFocus===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('') +
          '</select></div>' +
          '<div class="qa-form-group" style="flex:1"><label class="qa-label">Zoom '+iZoom+'%</label>' +
            '<input type="range" id="ty-img-zoom" min="100" max="200" value="'+iZoom+'" style="width:100%"></div></div>'
      })() : '') +
      '<div class="qa-form-group"><label class="qa-label">URL do video (YouTube / Vimeo)</label>' +
        '<input class="qa-input" id="ty-video-url" value="' + QA.esc(vidUrl) + '" placeholder="https://youtube.com/watch?v=...">' +
        '<label class="qa-checkbox-row" style="margin-top:8px"><input type="checkbox" id="ty-video-autoplay"' + (autoplay ? ' checked' : '') + '><span>Autoplay com mudo</span></label>' +
      '</div>' +
      '<div style="font-size:11px;color:#9ca3af;margin-top:-6px;margin-bottom:12px">Se video e imagem estiverem preenchidos, o video tem prioridade.</div>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Botao WhatsApp</div>' +
      '<div class="qa-form-group"><label class="qa-label">Numero (com DDI+DDD, so numeros)</label><input class="qa-input" id="ty-wa-phone" value="' + QA.esc(outr.wa_phone || '') + '" placeholder="5511999990000"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Texto do botao</label><input class="qa-input" id="ty-wa-btn-label" value="' + QA.esc(outr.wa_btn_label || 'Falar no WhatsApp') + '" placeholder="Falar no WhatsApp"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Mensagem pre-preenchida</label><textarea class="qa-textarea" id="ty-wa-msg">' + QA.esc(outr.wa_message || 'Ola! Acabei de responder o quiz e gostaria de saber mais.') + '</textarea></div>' +
      '<div class="qa-form-group"><label class="qa-label">Link alternativo (se preenchido, botao redireciona para este link em vez do WhatsApp)</label><input class="qa-input" id="ty-btn-link" value="' + QA.esc(outr.btn_link || '') + '" placeholder="https://..."></div>' +
      '<div class="qa-color-row">' +
        '<input type="color" class="qa-color-input" id="ty-btn-color" value="' + QA.esc(btnColor) + '">' +
        '<input class="qa-input" id="ty-btn-color-text" value="' + QA.esc(btnColor) + '" style="width:110px">' +
        '<span style="font-size:12px;color:#6b7280">Cor de fundo</span>' +
      '</div>' +
      '<div class="qa-color-row">' +
        '<input type="color" class="qa-color-input" id="ty-btn-text-color" value="' + QA.esc(btnTextColor) + '">' +
        '<input class="qa-input" id="ty-btn-text-color-text" value="' + QA.esc(btnTextColor) + '" style="width:110px">' +
        '<span style="font-size:12px;color:#6b7280">Cor do texto</span>' +
      '</div>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Recuperação de Abandonos</div>' +
      '<div style="font-size:11px;color:#9ca3af;margin-top:-8px;margin-bottom:10px">Mensagem enviada ao clicar no WhatsApp de um lead abandonado.</div>' +
      '<div class="qa-form-group"><label class="qa-label">Mensagem de recuperação</label><textarea class="qa-textarea" id="ty-wa-recovery" style="min-height:90px">' + QA.esc(outr.wa_recovery_msg || 'Oi {nome}, tudo bem? Vi que voce comecou nosso quiz sobre {quiz} mas nao conseguiu finalizar. Aconteceu alguma coisa?') + '</textarea></div>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Blocos de Texto</div>' +
      '<div id="ty-text-blocks">' + (outr.text_blocks || []).map(function(b, i) {
        return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;background:#fafafa">' +
          '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">' +
            '<span style="font-size:10px;font-weight:700;color:#6b7280">Texto ' + (i+1) + '</span>' +
            _tyPosSelect('ty-tb-pos', b.position, i) +
            '<div style="display:flex;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;margin-left:auto">' +
              '<button class="ty-tb-var" data-idx="' + i + '" data-val="text" style="padding:4px 8px;border:none;font-size:10px;font-weight:600;cursor:pointer;' + (b.variant !== 'prompt' ? 'background:#f3f4f6;color:#374151' : 'background:#fff;color:#9ca3af') + '">Cinza</button>' +
              '<button class="ty-tb-var" data-idx="' + i + '" data-val="prompt" style="padding:4px 8px;border:none;border-left:1px solid #e5e7eb;font-size:10px;font-weight:600;cursor:pointer;' + (b.variant === 'prompt' ? 'background:#f3f4f6;color:#374151' : 'background:#fff;color:#9ca3af') + '">Destaque</button>' +
            '</div>' +
            '<button class="ty-tb-del" data-idx="' + i + '" style="background:none;border:none;color:#ef4444;padding:4px;cursor:pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
          '</div>' +
          '<textarea class="qa-textarea ty-tb-txt" data-idx="' + i + '" rows="2" placeholder="Texto...">' + QA.esc(b.text || '') + '</textarea>' +
        '</div>'
      }).join('') + '</div>' +
      '<button class="qa-add-btn" id="ty-add-text-block" style="margin-bottom:10px">' + QA.ICON.plus + ' Bloco de Texto</button>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Checklist</div>' +
      '<div id="ty-checklists">' + (outr.checklists || []).map(function(c, i) {
        return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;background:#fafafa">' +
          '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
            '<span style="font-size:11px;font-weight:700;color:#6b7280">Lista ' + (i+1) + '</span>' +
            _tyPosSelect('ty-cl-pos', c.position, i) +
            '<button class="ty-cl-del" style="margin-left:auto" data-idx="' + i + '" style="background:none;border:none;color:#ef4444;padding:4px;cursor:pointer"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="pointer-events:none"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
          '</div>' +
          '<textarea class="qa-textarea ty-cl-items" data-idx="' + i + '" rows="3" placeholder="Um item por linha...">' + QA.esc((c.items || []).join('\n')) + '</textarea>' +
        '</div>'
      }).join('') + '</div>' +
      '<button class="qa-add-btn" id="ty-add-checklist" style="margin-bottom:10px">' + QA.ICON.plus + ' Checklist</button>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Depoimentos</div>' +
      '<div id="ty-testimonials">' + _buildTestimonialsUI(outr.testimonials || []) + '</div>' +
      '<button class="qa-add-btn" id="ty-add-testimonial" style="margin-bottom:10px">' + QA.ICON.plus + ' Depoimento</button>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Badges (Prova Social)</div>' +
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">' +
        '<span style="font-size:11px;color:#9ca3af">Posicao:</span>' +
        _tyPosSelect('ty-badges-pos', outr.badges_position) +
      '</div>' +
      '<div id="ty-badges-list">' + _buildBadgesEditor(outr.badges || []) + '</div>' +
      '<button class="qa-add-btn" id="ty-badge-add" style="margin-bottom:12px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Adicionar Badge</button>' +
      '<div class="qa-divider"></div>' +
      '<div class="qa-section-title">Contador</div>' +
      '<div style="display:flex;gap:10px;margin-bottom:8px">' +
        '<div class="qa-form-group" style="flex:1"><label class="qa-label">Segundos</label><input type="number" class="qa-input" id="ty-countdown" value="' + (parseInt(outr.countdown_seconds) || 0) + '" min="0" max="3600" placeholder="0 = desativado"></div>' +
        '<div class="qa-form-group" style="flex:1"><label class="qa-label">Posicao</label>' + _tyPosSelect('ty-cd-pos', outr.countdown_position) + '</div>' +
      '</div>' +
      '<div class="qa-form-group"><label class="qa-label">Texto do contador</label><input class="qa-input" id="ty-countdown-text" value="' + QA.esc(outr.countdown_text || 'Oferta expira em') + '" placeholder="Oferta expira em"></div>'
  }

  function _bindThankyouEvents() {
    var _activeQuiz = QA.quiz()

    function _bind(id, setter) {
      var el = document.getElementById(id)
      if (!el) return
      el.addEventListener('input',  function() { setter(el.value); QA.markDirty(); QA.renderPreview() })
      el.addEventListener('change', function() { setter(el.value); QA.markDirty(); QA.renderPreview() })
    }

    _bind('ty-title',   function(v) { _activeQuiz.schema.outro.title   = v })
    _bind('ty-message', function(v) { _activeQuiz.schema.outro.message = v })

    _bind('ty-image-url', function(v) {
      _activeQuiz.schema.outro.image_url = v
      var prev = document.getElementById('ty-img-prev')
      if (prev) { prev.src = QA.resolveImgUrl(v); prev.style.display = v ? 'block' : 'none' }
    })
    _bind('ty-video-url', function(v) { _activeQuiz.schema.outro.video_url = v })

    var autoEl = document.getElementById('ty-video-autoplay')
    if (autoEl) autoEl.onchange = function() { _activeQuiz.schema.outro.video_autoplay = autoEl.checked; QA.markDirty(); QA.renderPreview() }

    // btn_label and btn_url removed — WA button only
    _bind('ty-wa-phone',     function(v) { _activeQuiz.schema.outro.wa_phone      = v.replace(/\D/g, '') })
    _bind('ty-wa-btn-label',  function(v) { _activeQuiz.schema.outro.wa_btn_label    = v })
    _bind('ty-wa-msg',       function(v) { _activeQuiz.schema.outro.wa_message     = v })

    _bind('ty-btn-link', function(v) { _activeQuiz.schema.outro.btn_link = v })

    // Force preview update on all button field changes
    ;['ty-wa-phone','ty-wa-btn-label','ty-wa-msg','ty-btn-link'].forEach(function(id) {
      var el = document.getElementById(id)
      if (el) el.addEventListener('input', function() { QA.renderPreview() })
    })
    _bind('ty-wa-recovery',  function(v) { _activeQuiz.schema.outro.wa_recovery_msg = v })

    // Cor de fundo do botão
    var bgPicker = document.getElementById('ty-btn-color')
    var bgText   = document.getElementById('ty-btn-color-text')
    if (bgPicker) bgPicker.oninput = function() {
      _activeQuiz.schema.outro.btn_color = bgPicker.value
      if (bgText) bgText.value = bgPicker.value
      QA.markDirty(); QA.renderPreview()
    }
    if (bgText) bgText.oninput = function() {
      if (/^#[0-9A-Fa-f]{6}$/.test(bgText.value)) {
        _activeQuiz.schema.outro.btn_color = bgText.value
        if (bgPicker) bgPicker.value = bgText.value
        QA.markDirty(); QA.renderPreview()
      }
    }

    // Cor do texto do botão
    var txtPicker = document.getElementById('ty-btn-text-color')
    var txtText   = document.getElementById('ty-btn-text-color-text')
    if (txtPicker) txtPicker.oninput = function() {
      _activeQuiz.schema.outro.btn_text_color = txtPicker.value
      if (txtText) txtText.value = txtPicker.value
      QA.markDirty(); QA.renderPreview()
    }
    if (txtText) txtText.oninput = function() {
      if (/^#[0-9A-Fa-f]{6}$/.test(txtText.value)) {
        _activeQuiz.schema.outro.btn_text_color = txtText.value
        if (txtPicker) txtPicker.value = txtText.value
        QA.markDirty(); QA.renderPreview()
      }
    }

    // Thankyou components
    var outr = _activeQuiz.schema.outro
    if (!outr.text_blocks) outr.text_blocks = []
    if (!outr.checklists) outr.checklists = []
    if (!outr.testimonials) outr.testimonials = []

    // Image controls
    var tyImgUrl = document.getElementById('ty-image-url')
    if (tyImgUrl) tyImgUrl.addEventListener('change', function() { _rebuildTYTab() })
    var tyImgAspect = document.getElementById('ty-img-aspect')
    if (tyImgAspect) tyImgAspect.addEventListener('change', function() { outr.image_aspect = tyImgAspect.value; QA.markDirty(); QA.renderPreview() })
    var tyImgRadius = document.getElementById('ty-img-radius')
    if (tyImgRadius) tyImgRadius.addEventListener('change', function() { outr.image_radius = tyImgRadius.value; QA.markDirty(); QA.renderPreview() })
    var tyImgFocus = document.getElementById('ty-img-focus')
    if (tyImgFocus) tyImgFocus.addEventListener('change', function() { outr.image_focus = tyImgFocus.value; QA.markDirty(); QA.renderPreview() })
    var tyImgZoom = document.getElementById('ty-img-zoom')
    if (tyImgZoom) tyImgZoom.addEventListener('input', function() {
      outr.image_zoom = tyImgZoom.value
      var lbl = tyImgZoom.parentElement.querySelector('.qa-label')
      if (lbl) lbl.textContent = 'Zoom ' + tyImgZoom.value + '%'
      QA.markDirty(); QA.renderPreview()
    })

    // Text blocks — use event delegation on container
    var tyTBWrap = document.getElementById('ty-text-blocks')
    if (tyTBWrap) {
      tyTBWrap.addEventListener('input', function(e) {
        if (e.target.classList.contains('ty-tb-txt')) {
          var idx = parseInt(e.target.dataset.idx); if (outr.text_blocks[idx]) { outr.text_blocks[idx].text = e.target.value; QA.markDirty(); QA.renderPreview() }
        }
      })
      tyTBWrap.addEventListener('click', function(e) {
        var del = e.target.closest('.ty-tb-del')
        if (del) { outr.text_blocks.splice(parseInt(del.dataset.idx), 1); _rebuildTYTab(); return }
        var vr = e.target.closest('.ty-tb-var')
        if (vr) { var idx = parseInt(vr.dataset.idx); if (outr.text_blocks[idx]) { outr.text_blocks[idx].variant = vr.dataset.val; _rebuildTYTab() } }
      })
    }
    var tyAddTB = document.getElementById('ty-add-text-block')
    if (tyAddTB) tyAddTB.onclick = function() { outr.text_blocks.push({ text: '', variant: 'text' }); _rebuildTYTab() }

    // Checklists — event delegation
    var tyCLWrap = document.getElementById('ty-checklists')
    if (tyCLWrap) {
      tyCLWrap.addEventListener('input', function(e) {
        if (e.target.classList.contains('ty-cl-items')) {
          var idx = parseInt(e.target.dataset.idx); if (outr.checklists[idx]) { outr.checklists[idx].items = e.target.value.split('\n').filter(function(l){return l.trim()}); QA.markDirty(); QA.renderPreview() }
        }
      })
      tyCLWrap.addEventListener('click', function(e) {
        var del = e.target.closest('.ty-cl-del')
        if (del) { outr.checklists.splice(parseInt(del.dataset.idx), 1); _rebuildTYTab() }
      })
    }
    var tyAddCL = document.getElementById('ty-add-checklist')
    if (tyAddCL) tyAddCL.onclick = function() { outr.checklists.push({ items: [] }); _rebuildTYTab() }

    // Testimonials — event delegation
    var tyTMWrap = document.getElementById('ty-testimonials')
    if (tyTMWrap) {
      tyTMWrap.addEventListener('input', function(e) {
        var idx = e.target.dataset.idx != null ? parseInt(e.target.dataset.idx) : -1
        if (idx < 0 || !outr.testimonials[idx]) return
        if (e.target.classList.contains('tm-title')) { outr.testimonials[idx].title = e.target.value; QA.markDirty(); QA.renderPreview() }
        if (e.target.classList.contains('tm-body')) { outr.testimonials[idx].body = e.target.value; QA.markDirty(); QA.renderPreview() }
        if (e.target.classList.contains('tm-photo')) { outr.testimonials[idx].photo = e.target.value.trim(); QA.markDirty(); QA.renderPreview() }
      })
      tyTMWrap.addEventListener('change', function(e) {
        if (e.target.classList.contains('tm-stars')) {
          var idx = parseInt(e.target.dataset.idx); if (outr.testimonials[idx]) { outr.testimonials[idx].stars = parseInt(e.target.value); QA.markDirty(); QA.renderPreview() }
        }
      })
      tyTMWrap.addEventListener('click', function(e) {
        var del = e.target.closest('.tm-del')
        if (del) { outr.testimonials.splice(parseInt(del.dataset.idx), 1); _rebuildTYTab() }
      })
    }
    var tyAddTM = document.getElementById('ty-add-testimonial')
    if (tyAddTM) tyAddTM.onclick = function() { outr.testimonials.push({ stars: 5, title: '', body: '' }); _rebuildTYTab() }

    // Position selects for all components
    document.querySelectorAll('.ty-tb-pos').forEach(function(el) {
      el.addEventListener('change', function() { var idx = parseInt(el.dataset.idx); if (outr.text_blocks[idx]) { outr.text_blocks[idx].position = el.value; QA.markDirty(); QA.renderPreview() } })
    })
    document.querySelectorAll('.ty-cl-pos').forEach(function(el) {
      el.addEventListener('change', function() { var idx = parseInt(el.dataset.idx); if (outr.checklists[idx]) { outr.checklists[idx].position = el.value; QA.markDirty(); QA.renderPreview() } })
    })
    document.querySelectorAll('.ty-badges-pos').forEach(function(el) {
      el.addEventListener('change', function() { outr.badges_position = el.value; QA.markDirty(); QA.renderPreview() })
    })
    document.querySelectorAll('.ty-cd-pos').forEach(function(el) {
      el.addEventListener('change', function() { outr.countdown_position = el.value; QA.markDirty(); QA.renderPreview() })
    })

    // Badges
    if (!outr.badges) outr.badges = []
    var tyBadgesWrap = document.getElementById('ty-badges-list')
    if (tyBadgesWrap) {
      tyBadgesWrap.addEventListener('input', function(e) {
        var idx = e.target.dataset.idx != null ? parseInt(e.target.dataset.idx) : -1
        if (idx < 0 || !outr.badges[idx]) return
        if (e.target.classList.contains('cfg-badge-text')) { outr.badges[idx].text = e.target.value; QA.markDirty(); QA.renderPreview() }
        if (e.target.classList.contains('cfg-badge-color')) { outr.badges[idx].iconColor = e.target.value; QA.markDirty(); QA.renderPreview() }
      })
      tyBadgesWrap.addEventListener('change', function(e) {
        var idx = e.target.dataset.idx != null ? parseInt(e.target.dataset.idx) : -1
        if (idx < 0 || !outr.badges[idx]) return
        if (e.target.classList.contains('cfg-badge-icon')) { outr.badges[idx].icon = e.target.value; QA.markDirty(); QA.renderPreview() }
      })
      tyBadgesWrap.addEventListener('click', function(e) {
        var del = e.target.closest('.cfg-badge-del')
        if (del) { outr.badges.splice(parseInt(del.dataset.idx), 1); _rebuildTYTab() }
      })
    }
    var tyBadgeAdd = document.getElementById('ty-badge-add')
    if (tyBadgeAdd) tyBadgeAdd.onclick = function() { outr.badges.push({ icon: 'star', text: '', iconColor: '#6B7280' }); _rebuildTYTab() }

    // Countdown
    _bind('ty-countdown', function(v) { outr.countdown_seconds = parseInt(v) || 0 })
    var tyCountdownEl = document.getElementById('ty-countdown')
    if (tyCountdownEl) tyCountdownEl.addEventListener('change', function() { _rebuildTYTab() })
    _bind('ty-countdown-text', function(v) { outr.countdown_text = v })
  }

  function _rebuildTYTab() {
    var content = document.getElementById('qa-editor-content')
    if (content && window.QAEditor) { content.innerHTML = QAEditor.buildThankyouTab(); QAEditor.bindThankyouEvents() }
    QA.markDirty(); QA.renderPreview()
  }

  window.QAEditor = {
    buildConfigTab: _buildConfigTab,
    bindConfigEvents: _bindConfigEvents,
    buildAppearanceTab: _buildAppearanceTab,
    bindAppearanceEvents: _bindAppearanceEvents,
    buildThankyouTab: _buildThankyouTab,
    bindThankyouEvents: _bindThankyouEvents,
    buildAlignControl: _buildAlignControl,
    section: _section,
    bindCollapseEvents: _bindCollapseEvents,
    get _baPreviewSlide() { return _baPreviewSlide },
  }

})()
