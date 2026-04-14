;(function () {
  'use strict'
  if (window.QAPreview) return

  function _renderPhonePreview() {
    var screen = document.getElementById('qa-phone-screen')
    if (!screen) return
    var scrollEl = screen.querySelector('.qa-preview-intro')
    var scrollTop = scrollEl ? scrollEl.scrollTop : 0

    var _activeQuiz = QA.quiz()

    if (!_activeQuiz) {
      screen.innerHTML = '<div style="padding:30px 16px;text-align:center;color:#9ca3af;font-size:12px">Selecione um quiz</div>'
      return
    }

    var schema  = _activeQuiz.schema || {}
    var intr    = schema.intro || {}
    var app     = schema.appearance || {}
    var primary = app.primary_color || '#6366F1'

    var clinicName = _activeQuiz.title || 'Quiz'
    var initial    = clinicName.charAt(0).toUpperCase()
    var logoUrl    = intr.logo_url || ''
    var coverUrl   = intr.image_url || ''

    var logoHtml = logoUrl
      ? '<div class="qa-preview-logo"><img src="' + QA.esc(QA.resolveImgUrl(logoUrl)) + '"></div>'
      : ''

    var coverFit    = app.cover_fit || 'cover'
    var coverAspect = intr.image_aspect || '16:9'
    var coverFocus  = intr.image_focus || 'center center'
    var coverZoom   = intr.image_zoom ? 'transform:scale(' + (intr.image_zoom/100) + ');' : ''
    var coverRadius = (intr.image_radius || '12') + 'px'
    var coverHtml   = ''
    if (coverUrl) {
      if (coverAspect === '65') {
        coverHtml = '<div style="position:relative;width:100%;padding-top:65%;border-radius:' + coverRadius + ';overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);background:#1a1a2e;margin-bottom:10px"><img src="' + QA.esc(QA.resolveImgUrl(coverUrl)) + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:' + QA.esc(coverFocus) + ';' + coverZoom + '"></div>'
      } else if (coverAspect === '9:16') {
        coverHtml = '<div style="max-width:140px;border-radius:' + coverRadius + ';overflow:hidden;margin:0 auto 10px;box-shadow:0 2px 8px rgba(0,0,0,0.08)"><img src="' + QA.esc(QA.resolveImgUrl(coverUrl)) + '" style="width:100%;height:auto;' + coverZoom + 'display:block"></div>'
      } else if (coverAspect === '1:1') {
        coverHtml = '<div style="width:65%;max-width:150px;aspect-ratio:1/1;border-radius:' + coverRadius + ';overflow:hidden;margin:0 auto 10px"><img src="' + QA.esc(QA.resolveImgUrl(coverUrl)) + '" style="width:100%;height:100%;object-fit:cover;object-position:' + QA.esc(coverFocus) + ';' + coverZoom + 'display:block"></div>'
      } else {
        coverHtml = '<div style="width:100%;height:120px;border-radius:' + coverRadius + ';overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);margin-bottom:10px"><img src="' + QA.esc(QA.resolveImgUrl(coverUrl)) + '" style="width:100%;height:100%;object-fit:' + coverFit + ';object-position:' + QA.esc(coverFocus) + ';' + coverZoom + 'display:block"></div>'
      }
    }

    // ── Thankyou preview ─────────────────────────────────────────
    if (QA.tab() === 'thankyou') {
      var outr     = schema.outro || {}
      var waPhone  = (outr.wa_phone || '').replace(/\D/g, '')
      var vidUrl   = outr.video_url   || ''
      var imgUrl   = outr.image_url   || ''
      var autoplay = outr.video_autoplay !== false

      var mediaHtml = ''
      if (vidUrl) {
        var embedSrc = QA.resolveVideoEmbed(vidUrl, autoplay)
        if (embedSrc) {
          mediaHtml = '<div style="width:55%;max-width:130px;aspect-ratio:9/16;border-radius:8px;overflow:hidden;margin:0 auto 10px">' +
            '<iframe src="' + QA.esc(embedSrc) + '" style="width:100%;height:100%;border:0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>' +
            '</div>'
        }
      } else if (imgUrl) {
        var tyIA = outr.image_aspect || '16:9'
        var tyIF = outr.image_focus || 'center center'
        var tyIZ = outr.image_zoom ? 'transform:scale(' + (outr.image_zoom/100) + ');' : ''
        var tyIR = (outr.image_radius || '12') + 'px'
        if (tyIA === '65') {
          mediaHtml = '<div style="position:relative;width:100%;padding-top:65%;border-radius:' + tyIR + ';overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);background:#1a1a2e;margin-bottom:10px"><img src="' + QA.esc(QA.resolveImgUrl(imgUrl)) + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:' + QA.esc(tyIF) + ';' + tyIZ + '"></div>'
        } else if (tyIA === '9:16') {
          mediaHtml = '<div style="max-width:140px;border-radius:' + tyIR + ';overflow:hidden;margin:0 auto 10px;box-shadow:0 2px 8px rgba(0,0,0,0.08)"><img src="' + QA.esc(QA.resolveImgUrl(imgUrl)) + '" style="width:100%;height:auto;' + tyIZ + 'display:block"></div>'
        } else if (tyIA === '1:1') {
          mediaHtml = '<div style="width:60%;max-width:140px;aspect-ratio:1/1;border-radius:' + tyIR + ';overflow:hidden;margin:0 auto 10px;box-shadow:0 2px 8px rgba(0,0,0,0.08)"><img src="' + QA.esc(QA.resolveImgUrl(imgUrl)) + '" style="width:100%;height:100%;object-fit:cover;object-position:' + QA.esc(tyIF) + ';' + tyIZ + 'display:block"></div>'
        } else {
          mediaHtml = '<div style="width:100%;aspect-ratio:16/9;border-radius:' + tyIR + ';overflow:hidden;margin-bottom:10px;box-shadow:0 2px 8px rgba(0,0,0,0.08)"><img src="' + QA.esc(QA.resolveImgUrl(imgUrl)) + '" style="width:100%;height:100%;object-fit:cover;object-position:' + QA.esc(tyIF) + ';' + tyIZ + 'display:block"></div>'
        }
      }

      var customBtnHtml = (outr.btn_label)
        ? '<div style="height:38px;background:' + QA.esc(outr.btn_color || '#111') + ';color:' + QA.esc(outr.btn_text_color || '#fff') + ';border-radius:10px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;margin-bottom:8px">' + QA.esc(outr.btn_label) + '</div>'
        : ''

      var btnBg = QA.esc(outr.btn_color || '#25D366')
      var btnTxt = QA.esc(outr.btn_text_color || '#fff')
      var hasBtn = waPhone || outr.btn_link
      var waBtnHtml = hasBtn
        ? '<div style="height:38px;background:' + btnBg + ';color:' + btnTxt + ';border-radius:24px;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;box-shadow:0 4px 12px ' + btnBg + '50">' +
            QA.esc(outr.wa_btn_label || 'Falar no WhatsApp') +
          '</div>'
        : ''

      // Thankyou components by position
      var tySlots = { above_media: '', below_media: '', above_btn: '' }
      // Text blocks
      ;(outr.text_blocks || []).forEach(function(b) {
        if (!b.text) return
        var color = b.variant === 'prompt' ? '#5B6CFF' : '#6B7280'
        var size = b.variant === 'prompt' ? '11px' : '10px'
        var pos = b.position || 'below_media'
        tySlots[pos] += '<div style="text-align:center;font-size:' + size + ';color:' + color + ';margin:6px 0;line-height:1.4">' + QA.esc(b.text) + '</div>'
      })
      // Checklists
      ;(outr.checklists || []).forEach(function(c) {
        if (!c.items || !c.items.length) return
        var pos = c.position || 'below_media'
        tySlots[pos] += '<div style="margin:10px 0">' + c.items.map(function(item, idx) {
          var line = idx < c.items.length - 1 ? '<hr style="border:none;height:1px;background:#D1D5DB;margin:0">' : ''
          return '<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 2px;text-align:left">' +
            '<span style="font-size:9px;font-weight:500;color:#000">' + QA.esc(item) + '</span>' +
            '<span style="width:11px;height:11px;min-width:11px;border-radius:50%;background:linear-gradient(135deg,#6854E5,#4881F3);display:flex;align-items:center;justify-content:center;margin-left:4px"><svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg></span>' +
          '</div>' + line
        }).join('') + '</div>'
      })
      // Testimonials
      ;(outr.testimonials || []).filter(function(t){return t.body}).forEach(function(t) {
        var pos = t.after || 'below_media'
        tySlots[pos] += '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px;margin:10px 0;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,0.03)">' + _buildTmCard(t) + '</div>'
      })
      // Badges
      var tyBadgesPrev = (outr.badges || []).filter(function(b){return b.text})
      if (tyBadgesPrev.length) {
        var bPos = outr.badges_position || 'below_media'
        tySlots[bPos] += '<div style="display:inline-flex;align-items:center;background:#fff;border-radius:8px;padding:4px 2px;border:1px solid #E5E7EB;margin:6px 0">' +
          tyBadgesPrev.map(function(b) { return '<span style="font-size:8px;font-weight:600;color:#111;padding:0 4px">' + QA.esc(b.text) + '</span>' }).join('<span style="width:1px;height:8px;background:#D1D5DB"></span>') + '</div>'
      }
      // Countdown
      var tyCdSec = parseInt(outr.countdown_seconds) || 0
      if (tyCdSec > 0) {
        var cdPos = outr.countdown_position || 'below_media'
        var tyCdText = outr.countdown_text || 'Oferta expira em'
        var m = Math.floor(tyCdSec / 60), s = tyCdSec % 60
        var fmt = (m<10?'0':'') + m + ':' + (s<10?'0':'') + s
        tySlots[cdPos] += '<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;margin:6px auto;max-width:160px;background:linear-gradient(135deg,#FEF3C7,#FDE68A);border-radius:10px">' +
          '<div style="width:18px;height:18px;min-width:18px;border-radius:50%;background:#F59E0B;display:flex;align-items:center;justify-content:center"><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg></div>' +
          '<div><div style="font-size:7px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:0.3px">' + QA.esc(tyCdText) + '</div><div style="font-size:12px;font-weight:800;color:#78350F;letter-spacing:1px">' + fmt + '</div></div></div>'
      }

      var mainBtn = waBtnHtml

      screen.innerHTML =
        '<div style="height:100%;display:flex;flex-direction:column;background:linear-gradient(180deg,#fff 0%,#F0EEF6 60%,#E8E5F0 100%)">' +
          '<div style="flex:1;overflow-y:auto;padding:16px 12px 0;text-align:center">' +
            '<div style="width:44px;height:44px;border-radius:50%;background:#DCFCE7;display:flex;align-items:center;justify-content:center;margin:0 auto 10px">' +
              '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>' +
            '</div>' +
            '<div style="font-size:14px;font-weight:700;color:#111;margin-bottom:5px">' + QA.esc(outr.title || 'Perfeito!') + '</div>' +
            '<div style="font-size:11px;color:#6b7280;margin-bottom:12px;line-height:1.5;white-space:pre-line">' + QA.esc(outr.message || '') + '</div>' +
            tySlots.above_media +
            mediaHtml +
            tySlots.below_media +
          '</div>' +
          tySlots.above_btn +
          (mainBtn ? '<div style="padding:8px 12px 14px;background:linear-gradient(180deg,rgba(255,255,255,0),#fff 30%)">' + mainBtn + '</div>' : '') +
        '</div>'
      return
    }

    // ── Question preview ──────────────────────────────────────────
    var _activeQIdx = QA.qIdx()
    if (QA.tab() === 'questions' && _activeQIdx >= 0) {
      var qs    = schema.questions || []
      var q     = qs[_activeQIdx]
      if (q) {
        var total   = qs.length
        var qNum    = _activeQIdx + 1
        var qTitle  = q.title || 'Pergunta ' + qNum
        var qType   = q.type  || 'single_choice'
        var opts    = q.options || []

        var dotsHtml = '<div style="display:flex;gap:4px;justify-content:center;margin-bottom:10px">' +
          qs.map(function(_, i) {
            var isActive = i === _activeQIdx
            return '<div style="height:4px;border-radius:2px;background:' + (isActive ? primary : '#D1D5DB') + ';width:' + (isActive ? '18px' : '8px') + ';transition:width .2s"></div>'
          }).join('') +
        '</div>'

        var bodyHtml = ''
        if (qType === 'single_choice' || qType === 'multiple_choice') {
          bodyHtml = opts.slice(0, 5).map(function(o) {
            return '<div style="padding:10px 12px;border-radius:12px;border:1px solid #E5E7EB;font-size:11px;color:#111;margin-bottom:8px;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,0.04)">' + QA.esc(o.label || '') + '</div>'
          }).join('')
          if (opts.length > 5) bodyHtml += '<div style="font-size:10px;color:#9ca3af;text-align:center">+' + (opts.length - 5) + ' opções</div>'
        } else if (qType === 'image_choice') {
          bodyHtml = '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
            opts.slice(0, 4).map(function(o) {
              var imgPrev = o.image_url
                ? '<img src="' + QA.esc(QA.resolveImgUrl(o.image_url)) + '" style="width:100%;height:auto;display:block;object-fit:cover;object-position:center top" onerror="this.style.display=\'none\'">'
                : '<div style="height:60px;background:#E5E7EB"></div>'
              return '<div style="border-radius:10px;overflow:hidden;background:#EEF2FF">' +
                imgPrev +
                '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 8px;background:linear-gradient(135deg,#5B6CFF,#7B68EE,#9B6DFF)">' +
                  '<span style="font-size:9px;font-weight:600;color:#fff">' + QA.esc(o.label || '') + '</span>' +
                  '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>' +
                '</div></div>'
            }).join('') +
          '</div>'
        } else if (qType === 'scale') {
          bodyHtml = '<div style="display:flex;gap:4px;justify-content:center">' +
            [1,2,3,4,5].map(function(n) {
              return '<div style="width:28px;height:28px;border-radius:8px;border:1.5px solid #E5E7EB;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:600;color:#111;background:#fff">' + n + '</div>'
            }).join('') +
          '</div>'
        } else {
          var ph = qType === 'contact_phone' ? '(00) 00000-0000' : qType === 'contact_email' ? 'email@exemplo.com' : 'Digite aqui...'
          bodyHtml = '<div style="border:1.5px solid #E5E7EB;border-radius:10px;padding:8px 10px;font-size:11px;color:#9ca3af;background:#fff">' + ph + '</div>'
        }

        if (qType === 'contact_queixas') {
          bodyHtml = ['Rugas na testa','Pe de Galinha','Bigode Chines','Flacidez facial'].map(function(l) {
            return '<div style="padding:6px 8px;border-radius:8px;border:1.5px solid #E5E7EB;font-size:9px;color:#111;margin-bottom:4px;background:#fff">' + l + '</div>'
          }).join('') + '<div style="font-size:8px;color:#9ca3af;text-align:center">+10 opcoes</div>'
        }

        // Collagen Timeline preview
        if (q.collagen_timeline) {
          bodyHtml = '<div style="background:rgba(255,255,255,0.95);border-radius:12px;padding:14px;box-shadow:0 2px 12px rgba(0,0,0,0.06);text-align:center">' +
            '<div style="font-size:11px;font-weight:700;color:#1a1a2e;margin-bottom:8px">Evolucao do Colageno</div>' +
            '<div style="width:70px;height:70px;border-radius:50%;background:#e5e7eb;margin:0 auto 8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)"><img src="https://drive.google.com/thumbnail?id=1g6nasKaKer1SVmvnyVblU26MDaDUoQnP&sz=w150" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display=\'none\'"></div>' +
            '<div style="display:flex;justify-content:space-between;margin-bottom:4px;font-size:7px;color:#9ca3af"><span>Nivel de Colageno</span><span style="color:#32D74B;font-weight:700">100%</span></div>' +
            '<div style="height:8px;border-radius:4px;background:#F3F4F6;overflow:hidden;margin-bottom:8px"><div style="width:100%;height:100%;border-radius:4px;background:linear-gradient(90deg,#32D74B,#34D058)"></div></div>' +
            '<div style="font-size:8px;color:#4B5563;font-style:italic;margin-bottom:8px">Producao maxima de colageno</div>' +
            '<div style="font-size:9px;font-weight:600;color:#1a1a2e;margin-bottom:4px">Qual e a sua idade?</div>' +
            '<div style="height:10px;border-radius:5px;background:linear-gradient(90deg,#32D74B,#FFD60A,#FF453A);margin-bottom:4px"></div>' +
            '<div style="display:flex;justify-content:space-between;font-size:7px;color:#9ca3af"><span>18</span><span>30</span><span>40</span><span>50</span><span>65</span></div>' +
          '</div>'
        }

        // Question-level components
        var qTextBlocks = q.text_blocks || []
        var qChecklists = q.checklists || []
        var qTestimonials = q.testimonials || []

        function _qPreviewAt(position) {
          var html = ''
          // Text blocks
          qTextBlocks.filter(function(b) { return b.position === position && b.text }).forEach(function(b) {
            var color = b.variant === 'prompt' ? (intr.cta_color || '#5B6CFF') : '#6B7280'
            var size = b.variant === 'prompt' ? '11px' : '10px'
            var weight = b.variant === 'prompt' ? '600' : '400'
            html += '<div style="text-align:center;font-size:' + size + ';font-weight:' + weight + ';color:' + color + ';margin:8px 0;line-height:1.4">' + QA.esc(b.text) + '</div>'
          })
          // Checklists (merge all at same position)
          var clItems = []
          qChecklists.forEach(function(c) {
            if (c.position === position && c.items && c.items.length) clItems = clItems.concat(c.items)
          })
          if (clItems.length) {
            html += '<div style="margin:8px 0">' + clItems.map(function(item, idx) {
              var line = idx < clItems.length - 1 ? '<hr style="border:none;height:1px;background:#D1D5DB;margin:0">' : ''
              return '<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 2px">' +
                '<span style="font-size:9px;font-weight:500;color:#000">' + QA.esc(item) + '</span>' +
                '<span style="width:11px;height:11px;min-width:11px;border-radius:50%;background:linear-gradient(135deg,#6854E5,#4881F3);display:flex;align-items:center;justify-content:center;margin-left:4px">' +
                  '<svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' +
                '</span></div>' + line
            }).join('') + '</div>'
          }
          // Testimonials
          qTestimonials.filter(function(t) { return t.position === position && t.body }).forEach(function(t) {
            html += '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:10px;padding:10px;margin:10px 0;text-align:left;box-shadow:0 1px 4px rgba(0,0,0,0.03)">' +
              _buildTmCard(t) +
            '</div>'
          })
          return html
        }

        // Question image preview
        var qImg = q.q_image || {}
        var qImgPrev = ''
        if (qImg.url) {
          var iFocus = qImg.focus || 'center center'
          var iZoom = qImg.zoom ? 'transform:scale(' + (qImg.zoom/100) + ');' : ''
          var iRadius = (qImg.radius || '12') + 'px'
          var iAspect = qImg.aspect || '16:9'
          if (iAspect === '65') {
            qImgPrev = '<div style="margin:6px 0"><div style="position:relative;width:100%;padding-top:65%;border-radius:' + iRadius + ';overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);background:#1a1a2e"><img src="' + QA.esc(QA.resolveImgUrl(qImg.url)) + '" style="position:absolute;top:0;left:0;width:100%;height:100%;object-fit:cover;object-position:' + QA.esc(iFocus) + ';' + iZoom + '" onerror="this.style.display=\'none\'"></div></div>'
          } else {
            var iStyle = iAspect === '1:1' ? 'aspect-ratio:1/1;width:60%;margin:0 auto;' : iAspect === '9:16' ? 'max-width:140px;margin:0 auto;' : 'width:100%;aspect-ratio:16/9;'
            var iFitStyle = iAspect === '9:16' ? 'width:100%;height:auto;' : 'width:100%;height:100%;object-fit:cover;'
            qImgPrev = '<div style="margin:6px 0;text-align:center">' +
              (qImg.title ? '<div style="font-size:8px;font-weight:700;color:#111;margin-bottom:3px">' + QA.esc(qImg.title) + '</div>' : '') +
              '<div style="' + iStyle + 'border-radius:' + iRadius + ';overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08)"><img src="' + QA.esc(QA.resolveImgUrl(qImg.url)) + '" style="' + iFitStyle + 'object-position:' + QA.esc(iFocus) + ';' + iZoom + 'display:block" onerror="this.style.display=\'none\'"></div>' +
              (qImg.desc ? '<div style="font-size:7px;color:#8B8BA3;margin-top:3px">' + QA.esc(qImg.desc) + '</div>' : '') +
            '</div>'
          }
        }
        var qImgPos = qImg.position || 'after_title'

        // Header com nome do quiz (igual telefone)
        var quizName = _activeQuiz.title || 'Quiz'
        var headerHtml = (!q.collagen_timeline)
          ? '<div style="text-align:center;padding:8px 0 6px"><span style="font-size:9px;font-weight:800;color:#5B6CFF;letter-spacing:1.5px;text-transform:uppercase">' + QA.esc(quizName) + '</span></div>'
          : ''

        screen.innerHTML =
          '<div style="height:100%;overflow-y:auto;padding:12px 12px 10px;background:linear-gradient(180deg,#fff 0%,#F0EEF6 60%,#E8E5F0 100%)">' +
            headerHtml +
            dotsHtml +
            _qPreviewAt('above') +
            (qImgPos === 'above' ? qImgPrev : '') +
            '<div style="font-size:14px;font-weight:800;color:#1a1a2e;line-height:1.3;margin:12px 0 6px;text-align:' + (q.title_align || 'center') + ';white-space:pre-line">' + QA.esc(qTitle) + '</div>' +
            (qImgPos === 'after_title' ? qImgPrev : '') +
            (q.description ? '<div style="font-size:10px;color:#8B8BA3;text-align:' + (q.desc_align || 'center') + ';margin-bottom:12px;line-height:1.5;white-space:pre-line">' + QA.esc(q.description) + '</div>' : '') +
            (qImgPos === 'after_desc' ? qImgPrev : '') +
            bodyHtml +
            (qImgPos === 'below' ? qImgPrev : '') +
            _qPreviewAt('below') +
            '<div style="padding:8px 0 14px">' +
              '<button style="width:100%;padding:12px;border-radius:24px;border:none;background:linear-gradient(135deg,#5B6CFF,#7B68EE,#9B6DFF);color:#fff;font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;box-shadow:0 4px 16px rgba(91,108,255,0.3);cursor:pointer">' +
                'PROXIMO' +
              '</button>' +
            '</div>' +
          '</div>'
        return
      }
    }

    // ── Intro preview (default) ───────────────────────────────────
    var badges = Array.isArray(intr.badges) ? intr.badges : []
    var badgesPreviewHtml = ''
    if (badges.length > 0) {
      var badgeIcons = {
        star:  '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>',
        users: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/></svg>',
        clock: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
        check: '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
        heart: '<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
        shield:'<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>',
      }
      var activeBadges = badges.filter(function(b) { return b.text })
      var badgeItemsHtml = activeBadges.map(function(b, i) {
        var icon = badgeIcons[b.icon] || badgeIcons.star
        var color = b.iconColor || '#6B7280'
        var divider = i < activeBadges.length - 1
          ? '<div style="width:1px;height:10px;background:#D1D5DB;flex-shrink:0"></div>'
          : ''
        return '<span style="display:flex;align-items:center;gap:3px;padding:0 5px;font-size:9px;font-weight:600;color:#111;white-space:nowrap">' +
          '<span style="color:' + QA.esc(color) + ';display:flex">' + icon + '</span>' +
          '<span>' + QA.esc(b.text) + '</span>' +
        '</span>' + divider
      }).join('')

      badgesPreviewHtml = '<div style="display:inline-flex;align-items:center;background:#fff;border-radius:8px;padding:4px 2px;border:1px solid #E5E7EB;box-shadow:0 1px 2px rgba(0,0,0,0.04);margin-bottom:8px">' +
        badgeItemsHtml +
      '</div>'
    }

    var descHtml = (intr.description && intr.description.trim())
      ? '<div class="qa-preview-desc" style="text-align:' + (intr.desc_align || 'center') + ';white-space:pre-line">' + QA.esc(intr.description) + '</div>'
      : ''

    var dividerHtml = (intr.show_divider !== false)
      ? '<div class="qa-preview-divider"></div>'
      : ''

    // Text blocks helper
    var textBlocks = intr.text_blocks || []
    function _tbAt(pos) {
      return textBlocks.filter(function(b) { return b.after === pos && b.text }).map(function(b) {
        var color = b.variant === 'prompt' ? (intr.cta_color || '#5B6CFF') : '#6B7280'
        var size = b.variant === 'prompt' ? '11px' : '10px'
        var weight = b.variant === 'prompt' ? '600' : '400'
        return '<div style="text-align:center;font-size:' + size + ';font-weight:' + weight + ';color:' + color + ';margin:6px 0;line-height:1.4;word-wrap:break-word">' + QA.esc(b.text) + '</div>'
      }).join('')
    }

    // Checklists helper
    var checklists = intr.checklists || []
    function _buildClBlock(items) {
      return items.map(function(item, idx) {
        var line = idx < items.length - 1 ? '<hr style="border:none;height:1px;background:#D1D5DB;margin:0">' : ''
        return '<div style="display:flex;align-items:center;justify-content:space-between;padding:5px 2px;text-align:left">' +
          '<span style="font-size:9px;font-weight:500;color:#000;text-align:left">' + QA.esc(item) + '</span>' +
          '<span style="width:11px;height:11px;min-width:11px;border-radius:50%;background:linear-gradient(135deg,#6854E5,#4881F3);display:flex;align-items:center;justify-content:center;margin-left:4px">' +
            '<svg width="6" height="6" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>' +
          '</span>' +
        '</div>' + line
      }).join('')
    }
    function _clAt(pos) {
      var matched = checklists.filter(function(c) { return c.after === pos && c.items && c.items.length })
      if (!matched.length) return ''
      if (matched.length === 1) {
        return '<div style="margin:10px 0">' + _buildClBlock(matched[0].items) + '</div>'
      }
      var id = 'pcl-' + pos + '-' + Math.random().toString(36).substr(2,4)
      var slides = matched.map(function(c, i) {
        return '<div data-ptc-slide="' + i + '" style="min-width:100%;box-sizing:border-box;padding:0 8px">' +
          '<div>' + _buildClBlock(c.items) + '</div></div>'
      }).join('')
      var dots = '<div style="display:flex;justify-content:center;gap:4px;padding:6px 0">' +
        matched.map(function(_, j) {
          return '<span data-ptc-dot="' + j + '" style="width:' + (j===0?'14px':'6px') + ';height:6px;border-radius:3px;background:' + (j===0?'#111':'#D1D5DB') + ';transition:all .3s ease;display:inline-block"></span>'
        }).join('') + '</div>'
      return '<div data-ptc-carousel="' + id + '" style="margin:12px 0;overflow:hidden">' +
        '<div data-ptc-track style="display:flex;transition:transform .5s ease">' + slides + '</div>' +
        dots + '</div>'
    }

    // Testimonials helper
    var testimonials = intr.testimonials || []
    function _buildTmCard(t) {
      var starCount = parseInt(t.stars) || 5
      var starsHtml = ''
      for (var s = 0; s < starCount; s++) starsHtml += '<span style="width:10px;height:10px;background:#00B67A;border-radius:1px;display:inline-flex;align-items:center;justify-content:center;margin-right:1px"><svg width="6" height="6" viewBox="0 0 24 24" fill="#fff"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg></span>'
      var avatarHtml = t.photo
        ? '<img src="' + QA.esc(QA.resolveImgUrl(t.photo)) + '" style="width:22px;height:22px;border-radius:50%;object-fit:cover" onerror="this.style.display=\'none\'">'
        : '<div style="width:22px;height:22px;border-radius:50%;background:#E5E7EB;display:flex;align-items:center;justify-content:center;font-size:9px;font-weight:700;color:#6B7280">' + QA.esc((t.title || '?').charAt(0).toUpperCase()) + '</div>'
      return '<div style="display:flex;justify-content:space-between;align-items:flex-start">' +
        '<div style="font-size:16px;color:#D1D5DB;font-family:Georgia,serif;line-height:1">\u201C</div>' +
        '<div style="display:flex;gap:1px">' + starsHtml + '</div>' +
      '</div>' +
        '<div style="font-size:8px;color:#374151;line-height:1.5;font-family:Georgia,serif;font-style:italic;padding:2px 0">' + QA.esc(t.body) + '</div>' +
        '<div style="font-size:8px;color:#D1D5DB;font-family:Georgia,serif;text-align:right;line-height:1">\u201D</div>' +
        '<div style="display:flex;align-items:center;justify-content:center;position:relative;margin-top:6px;padding-top:6px;border-top:1px solid #f3f4f6">' +
          avatarHtml +
          (t.title ? '<div style="font-size:8px;font-weight:600;color:#111;position:absolute;left:calc(50% + 16px)">' + QA.esc(t.title) + '</div>' : '') +
        '</div>'
    }
    function _tmAt(pos) {
      var items = testimonials.filter(function(t) { return t.after === pos && t.body })
      if (!items.length) return ''
      if (items.length === 1) {
        return '<div style="background:#f5f5f7;border-radius:8px;padding:10px;margin:10px 0;text-align:left">' + _buildTmCard(items[0]) + '</div>'
      }
      var id = 'ptc-' + pos + '-' + Math.random().toString(36).substr(2,4)
      var slides = items.map(function(t, i) {
        return '<div data-ptc-slide="' + i + '" style="min-width:100%;box-sizing:border-box;padding:0 8px">' +
          '<div style="background:#f5f5f7;border-radius:8px;padding:10px;text-align:left">' + _buildTmCard(t) + '</div>' +
        '</div>'
      }).join('')
      var dots = '<div style="display:flex;justify-content:center;gap:4px;padding:6px 0">' +
        items.map(function(_, j) {
          return '<span data-ptc-dot="' + j + '" style="width:' + (j===0?'14px':'6px') + ';height:6px;border-radius:3px;background:' + (j===0?'#111':'#D1D5DB') + ';transition:all .3s ease;display:inline-block"></span>'
        }).join('') + '</div>'
      return '<div data-ptc-carousel="' + id + '" style="margin:12px 0;overflow:hidden">' +
        '<div data-ptc-track style="display:flex;transition:transform .5s ease">' + slides + '</div>' +
        dots + '</div>'
    }

    // BA Carousel helper
    var baCarousels = intr.ba_carousels || []
    function _buildBaSlide(s) {
      var fb = s.focus_before || s.focus || 'center 20%'
      var fa = s.focus_after || s.focus || 'center 20%'
      var zb = s.zoom_before ? 'transform:scale(' + (s.zoom_before/100) + ');' : ''
      var za = s.zoom_after ? 'transform:scale(' + (s.zoom_after/100) + ');' : ''
      return '<div style="width:50%;height:100%;position:relative;overflow:hidden"><img src="' + QA.esc(QA.resolveImgUrl(s.before)) + '" style="width:100%;height:100%;object-fit:cover;object-position:' + QA.esc(fb) + ';' + zb + '" onerror="this.style.display=\'none\'"><div style="position:absolute;bottom:3px;left:3px;background:rgba(0,0,0,0.5);color:#fff;font-size:6px;font-weight:700;padding:1px 4px;border-radius:3px;letter-spacing:0.5px">ANTES</div></div>' +
        '<div style="width:1px;height:100%;background:rgba(255,255,255,0.5);flex-shrink:0"></div>' +
        '<div style="width:50%;height:100%;position:relative;overflow:hidden"><img src="' + QA.esc(QA.resolveImgUrl(s.after)) + '" style="width:100%;height:100%;object-fit:cover;object-position:' + QA.esc(fa) + ';' + za + '" onerror="this.style.display=\'none\'"><div style="position:absolute;bottom:3px;right:3px;background:linear-gradient(135deg,rgba(50,215,75,0.6),rgba(91,108,255,0.5));color:#fff;font-size:6px;font-weight:700;padding:1px 4px;border-radius:3px;letter-spacing:0.5px">DEPOIS</div></div>'
    }
    function _baAt(pos) {
      var editorSlide = (window.QAEditor && typeof QAEditor._baPreviewSlide === 'number') ? QAEditor._baPreviewSlide : 0
      return baCarousels.filter(function(c) { return c.after === pos && c.slides && c.slides.length }).map(function(c) {
        var valid = c.slides.filter(function(s) { return s.before && s.after })
        if (!valid.length) return ''
        // Show the slide being edited in the editor
        var showIdx = Math.min(editorSlide, valid.length - 1)
        if (valid.length === 1) {
          return '<div style="margin:10px 0;border-radius:6px;overflow:hidden;display:flex;height:140px;box-shadow:0 2px 8px rgba(0,0,0,0.1)">' + _buildBaSlide(valid[0]) + '</div>'
        }
        var id = 'pba-' + pos + '-' + Math.random().toString(36).substr(2,4)
        var slides = valid.map(function(s, i) {
          return '<div data-pba-slide="' + i + '" style="position:absolute;top:0;left:0;width:100%;height:100%;display:flex;opacity:' + (i===showIdx?'1':'0') + ';transition:opacity .8s ease">' + _buildBaSlide(s) + '</div>'
        }).join('')
        var dots = '<div style="display:flex;justify-content:center;gap:4px;padding:6px 0">' +
          valid.map(function(_, j) {
            return '<span data-pba-dot="' + j + '" style="width:' + (j===showIdx?'14px':'6px') + ';height:6px;border-radius:3px;background:' + (j===showIdx?'#111':'#D1D5DB') + ';transition:all .3s ease;display:inline-block"></span>'
          }).join('') + '</div>'
        return '<div data-pba-carousel="' + id + '" style="margin:10px 0">' +
          '<div style="position:relative;height:140px;border-radius:6px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1)">' + slides + '</div>' +
          dots + '</div>'
      }).join('')
    }

    function _allPreviewAt(pos) {
      return _tbAt(pos) + _clAt(pos) + _tmAt(pos) + _baAt(pos)
    }

    screen.innerHTML =
      '<div class="qa-preview-intro">' +
        logoHtml +
        _allPreviewAt('logo') +
        dividerHtml +
        _allPreviewAt('divider') +
        '<div class="qa-preview-title" style="text-align:' + (intr.title_align || 'center') + ';white-space:pre-line">' + QA.esc(intr.title || _activeQuiz.title || 'Quiz') + '</div>' +
        _allPreviewAt('title') +
        descHtml +
        _allPreviewAt('description') +
        badgesPreviewHtml +
        _allPreviewAt('badges') +
        _allPreviewAt('prompt') +
        coverHtml +
        _allPreviewAt('media') +
        (function() {
          var cSec = parseInt(intr.countdown_seconds) || 0
          if (cSec <= 0) return ''
          var cText = intr.countdown_text || 'Oferta expira em'
          var m = Math.floor(cSec / 60), s = cSec % 60
          var fmt = (m<10?'0':'') + m + ':' + (s<10?'0':'') + s
          return '<div style="display:flex;align-items:center;gap:6px;padding:6px 10px;margin:6px auto;max-width:160px;background:linear-gradient(135deg,#FEF3C7,#FDE68A);border-radius:10px">' +
            '<div style="width:18px;height:18px;min-width:18px;border-radius:50%;background:#F59E0B;display:flex;align-items:center;justify-content:center">' +
              '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
            '</div>' +
            '<div><div style="font-size:7px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:0.3px">' + QA.esc(cText) + '</div>' +
            '<div style="font-size:12px;font-weight:800;color:#78350F;letter-spacing:1px">' + fmt + '</div></div>' +
          '</div>'
        })() +
        _allPreviewAt('countdown') +
        _allPreviewAt('checklist') +
        _allPreviewAt('testimonial') +
      '</div>' +
      '<div class="qa-preview-cta-wrap">' +
        '<button class="qa-preview-cta" onclick="var q=QA.quiz();if(q&&q.slug)window.open(\'quiz-render.html?q=\'+encodeURIComponent(q.slug),\'_blank\')">' + QA.esc(intr.cta_label || 'Começar') + '</button>' +
      '</div>'

    // Restore scroll + init preview carousels
    setTimeout(function() {
      var el = screen.querySelector('.qa-preview-intro')
      if (el && scrollTop) el.scrollTop = scrollTop

      // Autoplay BA carousels in preview (fade)
      screen.querySelectorAll('[data-pba-carousel]').forEach(function(carousel) {
        var slides = carousel.querySelectorAll('[data-pba-slide]')
        var dots = carousel.querySelectorAll('[data-pba-dot]')
        var total = slides.length
        if (total < 2) return
        var cur = 0
        setInterval(function() {
          slides[cur].style.opacity = '0'
          cur = (cur + 1) % total
          slides[cur].style.opacity = '1'
          dots.forEach(function(d, di) {
            d.style.width = di === cur ? '14px' : '6px'
            d.style.background = di === cur ? '#111' : '#D1D5DB'
          })
        }, 3000)
      })

      // Autoplay testimonial carousels in preview
      screen.querySelectorAll('[data-ptc-carousel]').forEach(function(carousel) {
        var track = carousel.querySelector('[data-ptc-track]')
        var dots = carousel.querySelectorAll('[data-ptc-dot]')
        var total = carousel.querySelectorAll('[data-ptc-slide]').length
        if (total < 2 || !track) return
        var cur = 0
        setInterval(function() {
          cur = (cur + 1) % total
          track.style.transform = 'translateX(-' + (cur * 100) + '%)'
          dots.forEach(function(d, di) {
            d.style.width = di === cur ? '14px' : '6px'
            d.style.background = di === cur ? '#111' : '#D1D5DB'
          })
        }, 3000)
      })
    }, 10)
  }

  window.QAPreview = { render: _renderPhonePreview }

})()
