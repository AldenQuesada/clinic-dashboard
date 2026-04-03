;(function () {
  'use strict'
  if (window.QAQuestions) return

  // ── Questions tab ─────────────────────────────────────────────────────────────
  function _buildQuestionsTab() {
    return '<div id="qa-q-list-wrap"></div>' +
      '<button class="qa-add-btn" id="qa-btn-add-q">' + QA.ICON.plus + ' Adicionar Pergunta</button>' +
      '<div id="qa-q-editor-wrap" style="margin-top:14px"></div>'
  }

  function _renderQList() {
    var wrap = document.getElementById('qa-q-list-wrap')
    var _activeQuiz = QA.quiz()
    if (!wrap || !_activeQuiz) return

    var questions = _activeQuiz.schema.questions || []
    var _activeQIdx = QA.qIdx()

    if (!questions.length) {
      wrap.innerHTML = '<div class="qa-empty" style="padding:20px 0"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>Nenhuma pergunta ainda.</div>'
    } else {
      wrap.innerHTML = '<div class="qa-q-list" id="qa-q-list">' +
        questions.map(function(q, i) {
          var typeLabel = (QA.QUESTION_TYPES.find(function(t) { return t.value === q.type }) || {}).label || q.type
          var activeCls = i === _activeQIdx ? ' active' : ''
          return '<div class="qa-q-item' + activeCls + '" data-qi="' + i + '">' +
            '<span class="qa-grip">' + QA.ICON.grip + '</span>' +
            '<span class="qa-q-item-title">' + QA.esc(q.title) + '</span>' +
            '<span class="qa-q-item-type">' + QA.esc(typeLabel) + '</span>' +
            '<button class="qa-icon-btn danger" data-del-q="' + i + '" title="Remover">' + QA.ICON.x + '</button>' +
          '</div>'
        }).join('') +
      '</div>'

      // Click to edit
      wrap.querySelectorAll('.qa-q-item').forEach(function(item) {
        item.addEventListener('click', function(e) {
          if (e.target.closest('[data-del-q]')) return
          var qi = parseInt(item.getAttribute('data-qi'), 10)
          QA.setQIdx(qi)
          _renderQList()
          _renderQEditor()
          QA.renderPreview()
        })
      })

      // Delete question
      wrap.querySelectorAll('[data-del-q]').forEach(function(btn) {
        btn.onclick = function(e) {
          e.stopPropagation()
          var qi = parseInt(btn.getAttribute('data-del-q'), 10)
          QA.quiz().schema.questions.splice(qi, 1)
          if (QA.qIdx() >= QA.quiz().schema.questions.length) QA.setQIdx(-1)
          QA.markDirty()
          _renderQList()
          _renderQEditor()
          QA.renderPreview()
        }
      })

      // Drag to reorder
      _initDragDrop(wrap.querySelector('#qa-q-list'))
    }

    // Add button
    var addBtn = document.getElementById('qa-btn-add-q')
    if (addBtn) {
      addBtn.onclick = function() {
        QA.quiz().schema.questions.push(QA.deepClone(QA.defaultQuestion()))
        QA.setQIdx(QA.quiz().schema.questions.length - 1)
        QA.markDirty()
        _renderQList()
        _renderQEditor()
      }
    }
  }

  // ── Drag-n-drop reorder ──────────────────────────────────────────────────────
  function _initDragDrop(listEl) {
    if (!listEl) return
    var dragging = null
    var items    = listEl.querySelectorAll('.qa-q-item')

    items.forEach(function(item) {
      item.setAttribute('draggable', 'true')

      item.addEventListener('dragstart', function(e) {
        dragging = item
        item.style.opacity = '0.4'
        e.dataTransfer.effectAllowed = 'move'
      })

      item.addEventListener('dragend', function() {
        item.style.opacity = ''
        dragging = null
        var newOrder = []
        listEl.querySelectorAll('.qa-q-item').forEach(function(el) {
          var qi = parseInt(el.getAttribute('data-qi'), 10)
          newOrder.push(QA.quiz().schema.questions[qi])
        })
        QA.quiz().schema.questions = newOrder.filter(Boolean)
        QA.setQIdx(-1)
        QA.markDirty()
        _renderQList()
      })

      item.addEventListener('dragover', function(e) {
        e.preventDefault()
        if (!dragging || dragging === item) return
        var rect   = item.getBoundingClientRect()
        var midY   = rect.top + rect.height / 2
        if (e.clientY < midY) {
          listEl.insertBefore(dragging, item)
        } else {
          listEl.insertBefore(dragging, item.nextSibling)
        }
      })
    })
  }

  // ── Question editor ──────────────────────────────────────────────────────────
  // ── Question Text Blocks, Checklists & Testimonials UI ─────────────────────
  var _qPositions = [
    { value: 'above', label: 'Acima do conteudo' },
    { value: 'below', label: 'Abaixo do conteudo' },
  ]

  function _buildQTextBlocksUI(blocks) {
    if (!blocks || !blocks.length) return ''
    return '<div id="qe-text-blocks">' + blocks.map(function(b, i) {
      var posOpts = _qPositions.map(function(p) {
        return '<option value="' + p.value + '"' + (b.position === p.value ? ' selected' : '') + '>' + p.label + '</option>'
      }).join('')
      var isPrompt = b.variant === 'prompt'
      return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;background:#fafafa">' +
        '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">' +
          '<select class="qa-select qtb-pos" data-idx="' + i + '" style="flex:1">' + posOpts + '</select>' +
          '<div style="display:flex;border:1px solid #e5e7eb;border-radius:6px;overflow:hidden">' +
            '<button class="qtb-var" data-idx="' + i + '" data-val="text" style="padding:4px 8px;border:none;font-size:10px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;' + (!isPrompt ? 'background:#f3f4f6;color:#374151' : 'background:#fff;color:#9ca3af') + '">' +
              '<span style="width:8px;height:8px;border-radius:50%;background:#6B7280;display:inline-block;vertical-align:middle;margin-right:3px"></span>Cinza</button>' +
            '<button class="qtb-var" data-idx="' + i + '" data-val="prompt" style="padding:4px 8px;border:none;border-left:1px solid #e5e7eb;font-size:10px;font-weight:600;cursor:pointer;font-family:Inter,sans-serif;' + (isPrompt ? 'background:#f3f4f6;color:#374151' : 'background:#fff;color:#9ca3af') + '">' +
              '<span style="width:8px;height:8px;border-radius:50%;background:#5B6CFF;display:inline-block;vertical-align:middle;margin-right:3px"></span>Dest</button>' +
          '</div>' +
          '<button class="qa-icon-btn qtb-del" data-idx="' + i + '" style="color:#ef4444;padding:4px" title="Remover">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<textarea class="qa-textarea qtb-txt" data-idx="' + i + '" rows="2" placeholder="Texto do bloco...">' + QA.esc(b.text || '') + '</textarea>' +
      '</div>'
    }).join('') + '</div>'
  }

  function _buildQChecklistsUI(lists) {
    if (!lists || !lists.length) return ''
    return lists.map(function(c, i) {
      var posOpts = _qPositions.map(function(p) {
        return '<option value="' + p.value + '"' + (c.position === p.value ? ' selected' : '') + '>' + p.label + '</option>'
      }).join('')
      var itemsText = (c.items || []).join('\n')
      return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;background:#fafafa">' +
        '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">' +
          '<select class="qa-select qcl-pos" data-idx="' + i + '" style="flex:1">' + posOpts + '</select>' +
          '<button class="qa-icon-btn qcl-del" data-idx="' + i + '" style="color:#ef4444;padding:4px" title="Remover">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<textarea class="qa-textarea qcl-items" data-idx="' + i + '" rows="3" placeholder="Um item por linha...">' + QA.esc(itemsText) + '</textarea>' +
      '</div>'
    }).join('')
  }

  function _buildQTestimonialsUI(items) {
    if (!items || !items.length) return ''
    return items.map(function(t, i) {
      var posOpts = _qPositions.map(function(p) {
        return '<option value="' + p.value + '"' + (t.position === p.value ? ' selected' : '') + '>' + p.label + '</option>'
      }).join('')
      var starsOpts = [1,2,3,4,5].map(function(n) {
        return '<option value="' + n + '"' + ((t.stars || 5) === n ? ' selected' : '') + '>' + n + '</option>'
      }).join('')
      return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:10px;margin-bottom:8px;background:#fafafa">' +
        '<div style="display:flex;gap:8px;margin-bottom:6px;align-items:center">' +
          '<select class="qa-select qtm-pos" data-idx="' + i + '" style="flex:1">' + posOpts + '</select>' +
          '<select class="qa-select qtm-stars" data-idx="' + i + '" style="width:auto;min-width:70px">' + starsOpts + '</select>' +
          '<button class="qa-icon-btn qtm-del" data-idx="' + i + '" style="color:#ef4444;padding:4px" title="Remover">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
          '</button>' +
        '</div>' +
        '<div style="display:flex;gap:8px;margin-bottom:6px">' +
          '<input class="qa-input qtm-title" data-idx="' + i + '" placeholder="Titulo" value="' + QA.esc(t.title || '') + '" style="flex:1">' +
          '<input class="qa-input qtm-date" data-idx="' + i + '" placeholder="Data" value="' + QA.esc(t.date || '') + '" style="width:110px">' +
        '</div>' +
        '<textarea class="qa-textarea qtm-body" data-idx="' + i + '" rows="2" placeholder="Texto do depoimento...">' + QA.esc(t.body || '') + '</textarea>' +
      '</div>'
    }).join('')
  }

  function _bindQComponentEvents(q) {
    if (!q.text_blocks) q.text_blocks = []
    if (!q.checklists) q.checklists = []
    if (!q.testimonials) q.testimonials = []

    // Text block bindings
    document.querySelectorAll('.qtb-txt').forEach(function(el) {
      el.addEventListener('input', function() {
        var idx = parseInt(el.dataset.idx)
        if (q.text_blocks[idx]) { q.text_blocks[idx].text = el.value; QA.markDirty(); QA.renderPreview() }
      })
    })
    document.querySelectorAll('.qtb-pos').forEach(function(el) {
      el.addEventListener('change', function() {
        var idx = parseInt(el.dataset.idx)
        if (q.text_blocks[idx]) { q.text_blocks[idx].position = el.value; QA.markDirty(); QA.renderPreview() }
      })
    })
    document.querySelectorAll('.qtb-var').forEach(function(el) {
      el.addEventListener('click', function() {
        var idx = parseInt(el.dataset.idx)
        if (q.text_blocks[idx]) {
          q.text_blocks[idx].variant = el.dataset.val
          _refreshQComponents(q)
        }
      })
    })
    document.querySelectorAll('.qtb-del').forEach(function(el) {
      el.addEventListener('click', function() {
        q.text_blocks.splice(parseInt(el.dataset.idx), 1)
        _refreshQComponents(q)
      })
    })
    var addTb = document.getElementById('qe-add-text-block')
    if (addTb) addTb.onclick = function() {
      q.text_blocks.push({ position: 'above', variant: 'text', text: '' })
      _refreshQComponents(q)
    }

    // Checklist bindings
    document.querySelectorAll('.qcl-items').forEach(function(el) {
      el.addEventListener('input', function() {
        var idx = parseInt(el.dataset.idx)
        if (q.checklists[idx]) {
          q.checklists[idx].items = el.value.split('\n').filter(function(l) { return l.trim() })
          QA.markDirty(); QA.renderPreview()
        }
      })
    })
    document.querySelectorAll('.qcl-pos').forEach(function(el) {
      el.addEventListener('change', function() {
        var idx = parseInt(el.dataset.idx)
        if (q.checklists[idx]) { q.checklists[idx].position = el.value; QA.markDirty(); QA.renderPreview() }
      })
    })
    document.querySelectorAll('.qcl-del').forEach(function(el) {
      el.addEventListener('click', function() {
        q.checklists.splice(parseInt(el.dataset.idx), 1)
        _refreshQComponents(q)
      })
    })
    var addCl = document.getElementById('qe-add-checklist')
    if (addCl) addCl.onclick = function() {
      q.checklists.push({ position: 'above', items: [] })
      _refreshQComponents(q)
    }

    // Testimonial bindings
    document.querySelectorAll('.qtm-title').forEach(function(el) {
      el.addEventListener('input', function() {
        var idx = parseInt(el.dataset.idx)
        if (q.testimonials[idx]) { q.testimonials[idx].title = el.value; QA.markDirty(); QA.renderPreview() }
      })
    })
    document.querySelectorAll('.qtm-body').forEach(function(el) {
      el.addEventListener('input', function() {
        var idx = parseInt(el.dataset.idx)
        if (q.testimonials[idx]) { q.testimonials[idx].body = el.value; QA.markDirty(); QA.renderPreview() }
      })
    })
    document.querySelectorAll('.qtm-date').forEach(function(el) {
      el.addEventListener('input', function() {
        var idx = parseInt(el.dataset.idx)
        if (q.testimonials[idx]) { q.testimonials[idx].date = el.value; QA.markDirty(); QA.renderPreview() }
      })
    })
    document.querySelectorAll('.qtm-stars').forEach(function(el) {
      el.addEventListener('change', function() {
        var idx = parseInt(el.dataset.idx)
        if (q.testimonials[idx]) { q.testimonials[idx].stars = parseInt(el.value); QA.markDirty(); QA.renderPreview() }
      })
    })
    document.querySelectorAll('.qtm-pos').forEach(function(el) {
      el.addEventListener('change', function() {
        var idx = parseInt(el.dataset.idx)
        if (q.testimonials[idx]) { q.testimonials[idx].position = el.value; QA.markDirty(); QA.renderPreview() }
      })
    })
    document.querySelectorAll('.qtm-del').forEach(function(el) {
      el.addEventListener('click', function() {
        q.testimonials.splice(parseInt(el.dataset.idx), 1)
        _refreshQComponents(q)
      })
    })
    var addTm = document.getElementById('qe-add-testimonial')
    if (addTm) addTm.onclick = function() {
      q.testimonials.push({ position: 'below', stars: 5, date: '', title: '', body: '' })
      _refreshQComponents(q)
    }
  }

  function _refreshQComponents(q) {
    var tbWrap = document.getElementById('qe-text-blocks')
    if (tbWrap) tbWrap.innerHTML = _buildQTextBlocksUI(q.text_blocks || []).replace(/^<div id="qe-text-blocks">|<\/div>$/g, '')
    var clWrap = document.getElementById('qe-checklists')
    if (clWrap) clWrap.innerHTML = _buildQChecklistsUI(q.checklists || [])
    var tmWrap = document.getElementById('qe-testimonials')
    if (tmWrap) tmWrap.innerHTML = _buildQTestimonialsUI(q.testimonials || [])
    _bindQComponentEvents(q)
    QA.markDirty(); QA.renderPreview()
  }

  // ── Question Image Section ───────────────────────────────────────────────────
  function _buildQImageSection(q) {
    var img = q.q_image || {}
    var hasUrl = !!img.url
    var posOpts = [
      { value: 'above', label: 'Acima do conteudo' },
      { value: 'below', label: 'Abaixo do conteudo' },
      { value: 'after_title', label: 'Apos o titulo' },
      { value: 'after_desc', label: 'Apos a descricao' },
    ]
    var posHtml = posOpts.map(function(p) {
      return '<option value="' + p.value + '"' + ((img.position || 'after_title') === p.value ? ' selected' : '') + '>' + p.label + '</option>'
    }).join('')

    var preview = hasUrl
      ? '<img id="qe-img-preview" src="' + QA.esc(QA.resolveImgUrl(img.url)) + '" style="width:100%;max-height:120px;object-fit:cover;border-radius:8px;margin-top:6px" onerror="this.style.display=\'none\'">'
      : '<div id="qe-img-preview" style="display:none"></div>'

    return '<div class="qa-divider" style="margin:10px 0"></div>' +
      '<div class="qa-section-title">Imagem da pergunta</div>' +
      '<div class="qa-form-group"><label class="qa-label">URL da imagem</label>' +
        '<input class="qa-input" id="qe-img-url" value="' + QA.esc(img.url || '') + '" placeholder="https://... ou link do Google Drive">' +
        preview +
      '</div>' +
      (hasUrl ? '<div class="qa-form-group"><label class="qa-label">Posicao</label>' +
        '<select class="qa-select" id="qe-img-pos">' + posHtml + '</select></div>' +
      '<div class="qa-form-group"><label class="qa-label">Titulo da imagem (opcional)</label>' +
        '<input class="qa-input" id="qe-img-title" value="' + QA.esc(img.title || '') + '" placeholder="Titulo sobre a imagem"></div>' +
      '<div class="qa-form-group"><label class="qa-label">Descricao da imagem (opcional)</label>' +
        '<input class="qa-input" id="qe-img-desc" value="' + QA.esc(img.desc || '') + '" placeholder="Texto abaixo da imagem"></div>' +
      '<div style="display:flex;gap:10px">' +
        '<div class="qa-form-group" style="flex:1"><label class="qa-label">Formato</label>' +
          '<select class="qa-select" id="qe-img-aspect">' +
            '<option value="16:9"' + ((img.aspect || '16:9') === '16:9' ? ' selected' : '') + '>Paisagem (16:9)</option>' +
            '<option value="1:1"' + (img.aspect === '1:1' ? ' selected' : '') + '>Quadrado (1:1)</option>' +
            '<option value="9:16"' + (img.aspect === '9:16' ? ' selected' : '') + '>Reels / Stories (9:16)</option>' +
            '<option value="65"' + (img.aspect === '65' ? ' selected' : '') + '>Retrato (como Antes/Depois)</option>' +
          '</select></div>' +
        '<div class="qa-form-group" style="flex:1"><label class="qa-label">Cantos</label>' +
          '<select class="qa-select" id="qe-img-radius">' +
            '<option value="12"' + ((img.radius || '12') === '12' ? ' selected' : '') + '>Arredondado</option>' +
            '<option value="0"' + (img.radius === '0' ? ' selected' : '') + '>Reto</option>' +
            '<option value="50"' + (img.radius === '50' ? ' selected' : '') + '>Muito arredondado</option>' +
          '</select></div>' +
      '</div>' +
      (function() {
        var focusOpts = [
          ['center 20%','Rosto (topo)'],['center top','Topo'],['center 40%','Meio-alto'],
          ['center center','Centro'],['center 60%','Meio-baixo'],['center bottom','Base']
        ]
        var f = img.focus || 'center center'
        var z = img.zoom || '100'
        var selF = focusOpts.map(function(o){return '<option value="'+o[0]+'"'+(f===o[0]?' selected':'')+'>'+o[1]+'</option>'}).join('')
        return '<div style="display:flex;gap:10px">' +
          '<div class="qa-form-group" style="flex:1"><label class="qa-label">Foco</label>' +
            '<select class="qa-select" id="qe-img-focus">' + selF + '</select></div>' +
          '<div class="qa-form-group" style="flex:1"><label class="qa-label">Zoom ' + z + '%</label>' +
            '<input type="range" id="qe-img-zoom" min="100" max="200" value="' + z + '" style="width:100%"></div>' +
        '</div>'
      })() : '') +
      '<div class="qa-divider" style="margin:10px 0"></div>'
  }

  function _bindQImageEvents(q, qi) {
    if (!q.q_image) q.q_image = {}
    var img = q.q_image

    var urlEl = document.getElementById('qe-img-url')
    if (urlEl) {
      urlEl.addEventListener('input', function() {
        img.url = urlEl.value.trim()
        var prev = document.getElementById('qe-img-preview')
        if (prev) {
          if (img.url) { prev.src = QA.resolveImgUrl(img.url); prev.style.display = 'block' }
          else { prev.style.display = 'none' }
        }
        QA.markDirty(); QA.renderPreview()
      })
      urlEl.addEventListener('change', function() {
        // Re-render editor to show/hide extra fields
        _renderQEditor()
      })
    }

    var posEl = document.getElementById('qe-img-pos')
    if (posEl) posEl.addEventListener('change', function() { img.position = posEl.value; QA.markDirty(); QA.renderPreview() })

    var titleEl = document.getElementById('qe-img-title')
    if (titleEl) titleEl.addEventListener('input', function() { img.title = titleEl.value; QA.markDirty(); QA.renderPreview() })

    var descEl = document.getElementById('qe-img-desc')
    if (descEl) descEl.addEventListener('input', function() { img.desc = descEl.value; QA.markDirty(); QA.renderPreview() })

    var aspectEl = document.getElementById('qe-img-aspect')
    if (aspectEl) aspectEl.addEventListener('change', function() { img.aspect = aspectEl.value; QA.markDirty(); QA.renderPreview() })

    var radiusEl = document.getElementById('qe-img-radius')
    if (radiusEl) radiusEl.addEventListener('change', function() { img.radius = radiusEl.value; QA.markDirty(); QA.renderPreview() })

    var focusEl = document.getElementById('qe-img-focus')
    if (focusEl) focusEl.addEventListener('change', function() { img.focus = focusEl.value; QA.markDirty(); QA.renderPreview() })

    var zoomEl = document.getElementById('qe-img-zoom')
    if (zoomEl) {
      zoomEl.addEventListener('input', function() {
        img.zoom = zoomEl.value
        var lbl = zoomEl.parentElement.querySelector('.qa-label')
        if (lbl) lbl.textContent = 'Zoom ' + zoomEl.value + '%'
        QA.markDirty(); QA.renderPreview()
      })
      zoomEl.addEventListener('change', function() { _renderQEditor() })
    }
  }

  // Delegate to QAEditor shared helper
  function _buildAlignControl(cls, label, current) {
    return window.QAEditor ? QAEditor.buildAlignControl(cls, label, current) : ''
  }

  // ── Question BA Carousel ──────────────────────────────────────────────────
  function _buildQBACarouselUI(q) {
    var carousels = q.ba_carousels || []
    if (!carousels.length) {
      return '<div id="qe-ba-wrap"></div>' +
        '<button class="qa-add-btn" id="qe-add-ba" style="margin-bottom:10px">' + QA.ICON.plus + ' Adicionar Carrossel Antes/Depois</button>'
    }
    var c = carousels[0]
    var posOpts = _qPositions.map(function(p) {
      return '<option value="' + p.value + '"' + ((c.position || 'above') === p.value ? ' selected' : '') + '>' + p.label + '</option>'
    }).join('')
    var slidesHtml = (c.slides || []).map(function(s, i) {
      return '<div style="border:1px solid #e5e7eb;border-radius:6px;padding:8px;margin-bottom:6px;background:#fafafa">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">' +
          '<span style="font-size:10px;font-weight:700;color:#6b7280">Slide ' + (i+1) + '</span>' +
          '<button class="qa-icon-btn qba-del" data-idx="' + i + '" style="color:#ef4444;padding:2px"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
        '</div>' +
        '<div style="display:flex;gap:6px">' +
          '<input class="qa-input qba-before" data-idx="' + i + '" value="' + QA.esc(s.before || '') + '" placeholder="URL antes" style="flex:1">' +
          '<input class="qa-input qba-after" data-idx="' + i + '" value="' + QA.esc(s.after || '') + '" placeholder="URL depois" style="flex:1">' +
        '</div>' +
      '</div>'
    }).join('')
    return '<div id="qe-ba-wrap">' +
      '<div style="font-size:11px;font-weight:700;color:#6b7280;margin:8px 0 4px">Carrossel Antes/Depois</div>' +
      '<select class="qa-select" id="qe-ba-pos" style="margin-bottom:6px">' + posOpts + '</select>' +
      '<div id="qe-ba-slides">' + slidesHtml + '</div>' +
      (c.slides.length < 5 ? '<button class="qa-add-btn" id="qe-add-ba-slide" style="margin-bottom:6px"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Slide</button>' : '') +
      '<button class="qa-icon-btn" id="qe-del-ba" style="color:#ef4444;font-size:10px;padding:2px 6px;margin-bottom:10px"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Remover</button>' +
    '</div>'
  }

  function _bindQBAEvents(q) {
    if (!q.ba_carousels) q.ba_carousels = []
    var addBtn = document.getElementById('qe-add-ba')
    if (addBtn) addBtn.onclick = function() {
      q.ba_carousels.push({ position: 'above', slides: [{ before: '', after: '' }] })
      _refreshQBA(q)
    }
    if (!q.ba_carousels.length) return
    var c = q.ba_carousels[0]
    var posEl = document.getElementById('qe-ba-pos')
    if (posEl) posEl.addEventListener('change', function() { c.position = posEl.value; QA.markDirty(); QA.renderPreview() })
    document.querySelectorAll('.qba-before').forEach(function(el) {
      el.addEventListener('input', function() { c.slides[parseInt(el.dataset.idx)].before = el.value.trim(); QA.markDirty(); QA.renderPreview() })
    })
    document.querySelectorAll('.qba-after').forEach(function(el) {
      el.addEventListener('input', function() { c.slides[parseInt(el.dataset.idx)].after = el.value.trim(); QA.markDirty(); QA.renderPreview() })
    })
    var addSlide = document.getElementById('qe-add-ba-slide')
    if (addSlide) addSlide.onclick = function() {
      if (c.slides.length < 5) { c.slides.push({ before: '', after: '' }); _refreshQBA(q) }
    }
    document.querySelectorAll('.qba-del').forEach(function(el) {
      el.addEventListener('click', function() {
        c.slides.splice(parseInt(el.dataset.idx), 1)
        if (!c.slides.length) q.ba_carousels.splice(0, 1)
        _refreshQBA(q)
      })
    })
    var delBtn = document.getElementById('qe-del-ba')
    if (delBtn) delBtn.onclick = function() { q.ba_carousels.splice(0, 1); _refreshQBA(q) }
  }

  function _refreshQBA(q) {
    var wrap = document.getElementById('qe-ba-wrap')
    if (!wrap) return
    wrap.outerHTML = _buildQBACarouselUI(q)
    _bindQBAEvents(q)
    QA.markDirty(); QA.renderPreview()
  }

  function _renderQEditor() {
    var wrap = document.getElementById('qa-q-editor-wrap')
    if (!wrap) return

    var _activeQIdx = QA.qIdx()
    var _activeQuiz = QA.quiz()

    if (_activeQIdx < 0 || !_activeQuiz) {
      wrap.innerHTML = ''
      return
    }

    var q = _activeQuiz.schema.questions[_activeQIdx]
    if (!q) { wrap.innerHTML = ''; return }

    var typeOpts = QA.QUESTION_TYPES.map(function(t) {
      return '<option value="' + t.value + '"' + (q.type === t.value ? ' selected' : '') + '>' + t.label + '</option>'
    }).join('')

    var hasOptions     = ['single_choice','multiple_choice','image_choice'].indexOf(q.type) !== -1
    var isScale        = q.type === 'scale'
    var isContactField = QA.CONTACT_FIELD_TYPES.indexOf(q.type) !== -1
    var optionsHtml = ''
    if (hasOptions) {
      var isImage = q.type === 'image_choice'
      optionsHtml = '<div class="qa-section-title" style="margin-top:10px">Opções</div>' +
        '<div class="qa-opt-list" id="qa-opt-list">' +
          (q.options || []).map(function(opt, oi) {
            return '<div class="qa-opt-row" data-oi="' + oi + '">' +
              '<input class="qa-input qa-opt-label" value="' + QA.esc(opt.label) + '" placeholder="Label da opção">' +
              '<input class="qa-input qa-opt-score" type="number" value="' + (opt.score || 0) + '" placeholder="Score" title="Score">' +
              (isImage ? '<input class="qa-input" style="width:130px" value="' + QA.esc(opt.image_url || '') + '" placeholder="URL imagem" data-img-url>' : '') +
              '<button class="qa-icon-btn danger" data-del-opt="' + oi + '">' + QA.ICON.x + '</button>' +
            '</div>'
          }).join('') +
        '</div>' +
        '<button class="qa-add-btn" id="qa-btn-add-opt" style="margin-top:4px">' + QA.ICON.plus + ' Opção</button>'
    }

    var scaleHtml = ''
    if (isScale) {
      scaleHtml =
        '<div class="qa-section-title" style="margin-top:10px">Labels da escala</div>' +
        '<div class="qa-form-group"><label class="qa-label">Label mínimo (1)</label><input class="qa-input" id="scale-min-lbl" value="' + QA.esc(q.scale_min_label || 'Pouco') + '"></div>' +
        '<div class="qa-form-group"><label class="qa-label">Label máximo (5)</label><input class="qa-input" id="scale-max-lbl" value="' + QA.esc(q.scale_max_label || 'Muito') + '"></div>'
    }

    var contactFieldHtml = ''
    if (isContactField) {
      var _cfLabels = { contact_name: 'Nome completo', contact_phone: 'WhatsApp', contact_email: 'E-mail', contact_queixas: 'Queixas Faciais' }
      var _cfDescs  = {
        contact_name:    'Exibe um campo de texto para o lead informar o nome.',
        contact_phone:   'Exibe um campo de telefone com mascara para o lead informar o WhatsApp.',
        contact_email:   'Exibe um campo de e-mail (opcional — nao bloqueia o avanco).',
        contact_queixas: 'Exibe 14 opcoes de queixas faciais com selecao multipla. Os dados ficam vinculados ao lead e disponiveis em todo o sistema.',
      }
      contactFieldHtml =
        '<div style="margin-top:10px;padding:10px 12px;background:#EEF2FF;border-radius:8px;font-size:12px;color:#4338CA;line-height:1.5">' +
          '<strong>' + _cfLabels[q.type] + '</strong> — ' + _cfDescs[q.type] + '<br>' +
          '<span style="color:#6B7280;margin-top:4px;display:block">Não requer opções ou pontuação. O campo será exibido como tela individual no quiz.</span>' +
        '</div>'
    }

    wrap.innerHTML =
      '<div class="qa-q-editor">' +
        '<div class="qa-q-editor-title">Editando pergunta ' + (_activeQIdx + 1) + '</div>' +
        '<div class="qa-form-group"><label class="qa-label">Titulo da pergunta</label><textarea class="qa-textarea" id="qe-title">' + QA.esc(q.title) + '</textarea>' +
          '<span style="font-size:10px;color:#9ca3af;margin-top:3px">Variaveis: <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px">{nome}</code> <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px">{email}</code> <code style="background:#f3f4f6;padding:1px 4px;border-radius:3px">{telefone}</code></span>' +
        '</div>' +
        _buildAlignControl('qe-title-align', 'Alinhamento do titulo', q.title_align || 'center') +
        '<div class="qa-form-group"><label class="qa-label">Descricao (opcional)</label><textarea class="qa-textarea" id="qe-description" placeholder="Texto de apoio abaixo do titulo" style="min-height:40px">' + QA.esc(q.description || '') + '</textarea></div>' +
        _buildAlignControl('qe-desc-align', 'Alinhamento da descricao', q.desc_align || 'center') +
        _buildQImageSection(q) +
        (q.collagen_timeline
          ? '<div style="padding:8px 12px;background:#EEF2FF;border-radius:8px;font-size:12px;color:#4338CA;margin-bottom:10px"><strong>Linha do Tempo do Colageno</strong> — esta pergunta usa a animacao interativa. O lead seleciona a idade no slider.</div>'
          : '<div class="qa-form-group"><label class="qa-label">Tipo</label><select class="qa-select" id="qe-type">' + typeOpts + '</select></div>' +
            (!isContactField
              ? '<div class="qa-form-group" style="flex-direction:row;align-items:center;gap:8px">' +
                  '<label class="qa-toggle"><input type="checkbox" id="qe-required"' + (q.required ? ' checked' : '') + '><span class="qa-toggle-slider"></span></label>' +
                  '<span class="qa-label" style="margin-bottom:0">Obrigatoria</span>' +
                '</div>'
              : '') +
            contactFieldHtml + optionsHtml + scaleHtml) +
        '<div class="qa-divider" style="margin-top:14px"></div>' +
        '<div class="qa-section-title">Componentes extras</div>' +
        _buildQTextBlocksUI(q.text_blocks || []) +
        '<button class="qa-add-btn" id="qe-add-text-block" style="margin-bottom:10px">' + QA.ICON.plus + ' Bloco de Texto</button>' +
        '<div id="qe-checklists">' + _buildQChecklistsUI(q.checklists || []) + '</div>' +
        '<button class="qa-add-btn" id="qe-add-checklist" style="margin-bottom:10px">' + QA.ICON.plus + ' Checklist</button>' +
        '<div id="qe-testimonials">' + _buildQTestimonialsUI(q.testimonials || []) + '</div>' +
        '<button class="qa-add-btn" id="qe-add-testimonial" style="margin-bottom:10px">' + QA.ICON.plus + ' Depoimento</button>' +
        _buildQBACarouselUI(q) +
        (function() {
          var ct = q.collagen_timeline
          if (!ct) return '<button class="qa-add-btn" id="qe-add-collagen" style="margin-bottom:10px">' + QA.ICON.plus + ' Linha do Tempo do Colageno</button>'
          var posOpts = _qPositions.map(function(p) {
            return '<option value="' + p.value + '"' + ((ct.position || 'above') === p.value ? ' selected' : '') + '>' + p.label + '</option>'
          }).join('')
          return '<div style="border:1px solid #e5e7eb;border-radius:8px;padding:8px;margin-bottom:10px;background:#fafafa">' +
            '<div style="font-size:11px;font-weight:700;color:#6b7280;margin-bottom:4px">Linha do Tempo do Colageno</div>' +
            '<select class="qa-select" id="qe-collagen-pos" style="margin-bottom:4px">' + posOpts + '</select>' +
            '<div style="font-size:10px;color:#059669;margin-bottom:4px">Ativo</div>' +
            '<button class="qa-icon-btn" id="qe-del-collagen" style="color:#ef4444;font-size:10px;padding:2px 6px"><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Remover</button>' +
          '</div>'
        })() +
      '</div>'

    _bindQEditorEvents(q)
    QA.renderPreview()
  }

  function _markQuestionRevised(qi) {
    var q = QA.quiz().schema.questions[qi]
    if (q) q.revised_at = new Date().toISOString()
  }

  function _bindQEditorEvents(q) {
    var qi = QA.qIdx()
    var _activeQuiz = QA.quiz()

    function _field(id, setter) {
      var el = document.getElementById(id)
      if (!el) return
      el.addEventListener('input', function() { setter(el.value); QA.markDirty() })
      el.addEventListener('change', function() { setter(el.value); QA.markDirty() })
    }

    var titleEl = document.getElementById('qe-title')
    if (titleEl) {
      titleEl.addEventListener('input', function() {
        _activeQuiz.schema.questions[qi].title = titleEl.value
        _markQuestionRevised(qi)
        QA.markDirty()
        QA.renderPreview()
      })
    }

    var descEl = document.getElementById('qe-description')
    if (descEl) {
      descEl.addEventListener('input', function() {
        _activeQuiz.schema.questions[qi].description = descEl.value
        QA.markDirty()
        QA.renderPreview()
      })
    }

    // Title align
    document.querySelectorAll('.qe-title-align').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _activeQuiz.schema.questions[qi].title_align = btn.dataset.align
        document.querySelectorAll('.qe-title-align').forEach(function(b) {
          b.style.background = '#fff'; b.style.color = '#6b7280'
        })
        btn.style.background = '#111'; btn.style.color = '#fff'
        QA.markDirty(); QA.renderPreview()
      })
    })
    // Description align
    document.querySelectorAll('.qe-desc-align').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _activeQuiz.schema.questions[qi].desc_align = btn.dataset.align
        document.querySelectorAll('.qe-desc-align').forEach(function(b) {
          b.style.background = '#fff'; b.style.color = '#6b7280'
        })
        btn.style.background = '#111'; btn.style.color = '#fff'
        QA.markDirty(); QA.renderPreview()
      })
    })

    var typeEl = document.getElementById('qe-type')
    if (typeEl) {
      typeEl.onchange = function() {
        var qObj = _activeQuiz.schema.questions[qi]
        qObj.type = typeEl.value
        _markQuestionRevised(qi)
        if (['single_choice','multiple_choice','image_choice'].indexOf(typeEl.value) !== -1) {
          if (!qObj.options || !qObj.options.length) {
            qObj.options = [{ label: 'Opção 1', score: 1 }]
          }
        }
        QA.markDirty()
        _renderQEditor()
        QA.renderPreview()
      }
    }

    var reqEl = document.getElementById('qe-required')
    if (reqEl) reqEl.onchange = function() { _activeQuiz.schema.questions[qi].required = reqEl.checked; QA.markDirty() }

    _field('scale-min-lbl', function(v) { _activeQuiz.schema.questions[qi].scale_min_label = v })
    _field('scale-max-lbl', function(v) { _activeQuiz.schema.questions[qi].scale_max_label = v })

    // Options events
    var optList = document.getElementById('qa-opt-list')
    if (optList) {
      optList.querySelectorAll('.qa-opt-row').forEach(function(row) {
        var oi      = parseInt(row.getAttribute('data-oi'), 10)
        var lblInp  = row.querySelector('.qa-opt-label')
        var scrInp  = row.querySelector('.qa-opt-score')
        var imgInp  = row.querySelector('[data-img-url]')
        var delBtn  = row.querySelector('[data-del-opt]')

        if (lblInp) lblInp.oninput = function() {
          _activeQuiz.schema.questions[qi].options[oi].label = lblInp.value
          _markQuestionRevised(qi)
          QA.markDirty(); QA.renderPreview()
        }
        if (scrInp) scrInp.oninput = function() {
          _activeQuiz.schema.questions[qi].options[oi].score = parseInt(scrInp.value, 10) || 0
          QA.markDirty()
        }
        if (imgInp) imgInp.oninput = function() {
          _activeQuiz.schema.questions[qi].options[oi].image_url = imgInp.value
          QA.markDirty(); QA.renderPreview()
        }
        if (delBtn) delBtn.onclick = function() {
          _activeQuiz.schema.questions[qi].options.splice(oi, 1)
          _markQuestionRevised(qi)
          QA.markDirty()
          _renderQEditor()
        }
      })
    }

    var addOptBtn = document.getElementById('qa-btn-add-opt')
    if (addOptBtn) {
      addOptBtn.onclick = function() {
        if (!_activeQuiz.schema.questions[qi].options) _activeQuiz.schema.questions[qi].options = []
        _activeQuiz.schema.questions[qi].options.push({ label: 'Nova opção', score: 0 })
        _markQuestionRevised(qi)
        QA.markDirty()
        _renderQEditor()
      }
    }

    // ── Multi choice with image bindings ─────────────────────────────────────

    // Imagem da pergunta
    _bindQImageEvents(q, qi)

    // Componentes extras
    _bindQComponentEvents(q)
    _bindQBAEvents(q)

    // Collagen Timeline
    var addCol = document.getElementById('qe-add-collagen')
    if (addCol) addCol.onclick = function() {
      q.collagen_timeline = { position: 'above' }
      q.type = 'single_choice'
      q.required = false
      q.options = []
      QA.markDirty(); _renderQEditor()
    }
    var colPos = document.getElementById('qe-collagen-pos')
    if (colPos) colPos.addEventListener('change', function() {
      q.collagen_timeline.position = colPos.value
      QA.markDirty(); QA.renderPreview()
    })
    var delCol = document.getElementById('qe-del-collagen')
    if (delCol) delCol.onclick = function() {
      delete q.collagen_timeline
      QA.markDirty(); _renderQEditor()
    }
  }

  window.QAQuestions = {
    buildTab: _buildQuestionsTab,
    renderList: _renderQList,
    renderEditor: _renderQEditor,
  }

})()
