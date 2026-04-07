/**
 * fm-export.js — Report export, download, ranges editor
 */
;(function () {
  'use strict'

  var FM = window._FM

  FM._exportReport = function () {
    // Allow export with annotations OR metric data
    if (FM._annotations.length === 0 && !FM._metricAngles && !FM._scanData) {
      alert('Adicione marcacoes ou execute Auto Analise antes de exportar.')
      return
    }

    // Auto-generate simulation if not yet generated (only if annotations exist)
    if (!FM._simPhotoUrl && FM._annotations.length > 0) {
      FM._showLoading('Gerando simulacao para report...')
      FM._generateSimulation(function () {
        FM._hideLoading()
        FM._exportReport()
      })
      return
    }

    var name = FM._lead.nome || FM._lead.name || 'Paciente'
    var totals = FM._calcTotals()

    var overlay = document.createElement('div')
    overlay.className = 'fm-export-overlay'
    overlay.id = 'fmExportOverlay'

    var mainAngle = FM._photoUrls['45'] ? '45' : (FM._photoUrls['front'] ? 'front' : 'lateral')

    var html = '<div class="fm-export-modal">' +
      '<div class="fm-export-header">' +
        '<h3>Report de Analise Facial</h3>' +
        '<div style="display:flex;gap:8px">' +
          '<button style="display:flex;align-items:center;gap:5px;padding:8px 14px;border:none;border-radius:10px;background:#C8A97E;color:#fff;font-size:13px;font-weight:600;cursor:pointer" onclick="FaceMapping._downloadReport()">' +
            FM._icon('download', 14) + ' Baixar PNG</button>' +
          '<button style="display:flex;align-items:center;gap:5px;padding:8px 14px;border:1px solid rgba(200,169,126,0.3);border-radius:10px;background:transparent;color:#C8A97E;font-size:13px;font-weight:500;cursor:pointer" onclick="FaceMapping._printReport()">' +
            FM._icon('printer', 14) + ' Imprimir</button>' +
          '<button style="display:flex;align-items:center;gap:5px;padding:8px 14px;border:1px solid rgba(200,169,126,0.3);border-radius:10px;background:transparent;color:#C8A97E;font-size:13px;font-weight:500;cursor:pointer" onclick="FaceMapping._shareReport()">' +
            FM._icon('share-2', 14) + ' Compartilhar</button>' +
          '<button class="fm-btn" onclick="FaceMapping._closeExport()">' +
            FM._icon('x', 14) + ' Fechar</button>' +
        '</div>' +
      '</div>' +
      '<div class="fm-export-body">' +
        '<div class="fm-report" id="fmReportCard">' +

          '<div class="fm-report-header">' +
            '<div class="fm-report-brand">Clinica Mirian de Paula</div>' +
            '<div class="fm-report-subtitle">Plano de Tratamento Facial</div>' +
            '<div class="fm-report-patient">' + FM._esc(name) + ' \u2022 ' + FM._formatDate(new Date()) + '</div>' +
          '</div>' +

          // TOP ROW: ANTES / DEPOIS / DEPOIS SIMULADO
          '<div class="fm-report-photos">' +
            '<div class="fm-report-photo-cell">' +
              '<canvas id="fmReportCanvas_main"></canvas>' +
              '<span class="fm-report-photo-label">ANTES</span>' +
            '</div>' +
            '<div class="fm-report-photo-cell">' +
              (FM._afterPhotoUrl
                ? '<img id="fmReportAfterImg" src="' + FM._afterPhotoUrl + '" style="width:100%;height:100%;object-fit:cover">'
                : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.2);font-size:12px;flex-direction:column"><span style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase">Sem foto</span></div>') +
              '<span class="fm-report-photo-label">DEPOIS<br><span style="font-size:9px;font-weight:400">(seu resultado atual)</span></span>' +
            '</div>' +
            '<div class="fm-report-photo-cell">' +
              (FM._simPhotoUrl
                ? '<img id="fmReportSimImg" src="' + FM._simPhotoUrl + '" style="width:100%;height:100%;object-fit:cover">'
                : '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:rgba(255,255,255,0.2);font-size:12px;flex-direction:column"><span style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase">Sem foto</span></div>') +
              '<span class="fm-report-photo-label" style="background:linear-gradient(transparent,rgba(201,169,110,0.9))"><strong>DEPOIS SIMULADO</strong><br><span style="font-size:9px;font-weight:400">(protocolo completo)</span></span>' +
            '</div>' +
          '</div>' +

          // BOTTOM ROW: 3 panels
          '<div class="fm-report-panels">' +

            '<div class="fm-report-panel">' +
              '<div class="fm-report-panel-title">O Que Falta Para Chegar no -10 Anos</div>' +
              FM._renderDonePanel() +
            '</div>' +

            '<div class="fm-report-panel" style="padding:12px">' +
              '<div class="fm-report-panel-title" style="padding:0 12px">Mapa de Tratamento</div>' +
              '<div class="fm-report-center-photo">' +
                '<canvas id="fmReportCenterCanvas"></canvas>' +
              '</div>' +
            '</div>' +

            '<div class="fm-report-panel">' +
              '<div class="fm-report-panel-title">Resultado Final Simulado</div>' +
              FM._renderExpectedPanel() +
            '</div>' +

          '</div>' +

          // Summary bar
          '<div class="fm-report-summary">'

    totals.forEach(function (t) {
      html += '<div class="fm-report-stat">' +
        '<div class="fm-report-stat-value" style="color:' + t.color + '">' + t.ml.toFixed(1) + '</div>' +
        '<div class="fm-report-stat-label">' + t.label + '</div>' +
      '</div>'
    })

    html += '<div class="fm-report-stat">' +
      '<div class="fm-report-stat-value">' + FM._annotations.length + '</div>' +
      '<div class="fm-report-stat-label">Zonas Tratadas</div>' +
    '</div>'

    // Skin analysis scores (v2 — wrinkles, spots, pores, redness, pigmentation, firmness)
    if (FM._skinAnalysis) {
      html += '<div class="fm-report-stat">' +
        '<div class="fm-report-stat-value" style="color:' + (FM._skinAnalysis.overall >= 70 ? '#10B981' : FM._skinAnalysis.overall >= 50 ? '#F59E0B' : '#EF4444') + '">' + Math.round(FM._skinAnalysis.overall) + '</div>' +
        '<div class="fm-report-stat-label">Score Pele</div>' +
      '</div>'
    }

    // Skin age (v2)
    if (FM._skinAge) {
      var ageColor = FM._skinAge.estimated_age <= 35 ? '#10B981' : FM._skinAge.estimated_age <= 45 ? '#F59E0B' : '#EF4444'
      html += '<div class="fm-report-stat">' +
        '<div class="fm-report-stat-value" style="color:' + ageColor + '">' + Math.round(FM._skinAge.estimated_age) + '</div>' +
        '<div class="fm-report-stat-label">Idade da Pele</div>' +
      '</div>'
    }

    // Face shape (v2 scanner)
    if (FM._scanData && FM._scanData.shape) {
      html += '<div class="fm-report-stat">' +
        '<div class="fm-report-stat-value" style="font-size:16px;color:#C8A97E">' + FM._scanData.shape.shape + '</div>' +
        '<div class="fm-report-stat-label">Biotipo</div>' +
      '</div>'
    }

    // Symmetry (v2 scanner)
    if (FM._scanData && FM._scanData.symmetry) {
      var symColor = FM._scanData.symmetry.overall >= 85 ? '#10B981' : FM._scanData.symmetry.overall >= 70 ? '#F59E0B' : '#EF4444'
      html += '<div class="fm-report-stat">' +
        '<div class="fm-report-stat-value" style="color:' + symColor + '">' + FM._scanData.symmetry.overall + '%</div>' +
        '<div class="fm-report-stat-label">Simetria</div>' +
      '</div>'
    }

    html += '</div>'

    // Skin detail bar (v2 — 6 metrics)
    if (FM._skinAnalysis) {
      html += '<div class="fm-report-summary" style="padding-top:0;gap:20px">'
      var skinMetrics = [
        { key: 'wrinkles', label: 'Rugas' },
        { key: 'spots', label: 'Manchas' },
        { key: 'pores', label: 'Poros' },
        { key: 'redness', label: 'Vermelhidao' },
        { key: 'pigmentation', label: 'Pigmentacao' },
        { key: 'firmness', label: 'Firmeza' },
      ]
      skinMetrics.forEach(function (m) {
        var val = FM._skinAnalysis[m.key]
        if (val == null) return
        var color = val >= 70 ? '#10B981' : val >= 50 ? '#F59E0B' : '#EF4444'
        html += '<div class="fm-report-stat">' +
          '<div class="fm-report-stat-value" style="font-size:20px;color:' + color + '">' + Math.round(val) + '</div>' +
          '<div class="fm-report-stat-label">' + m.label + '</div>' +
        '</div>'
      })
      html += '</div>'
    }

    // Skin age detail (v2)
    if (FM._skinAge) {
      html += '<div class="fm-report-summary" style="padding-top:0;justify-content:center">' +
        '<div style="text-align:center;font-size:11px;color:rgba(245,240,232,0.6)">' +
          FM._skinAge.description +
        '</div>' +
      '</div>'
    }

    // Color legend
    html += '<div class="fm-report-summary" style="padding-top:0;flex-wrap:wrap;gap:12px">' +
      '<div style="font-size:9px;letter-spacing:0.15em;text-transform:uppercase;color:#C8A97E;width:100%;text-align:center;margin-bottom:4px">Legenda de Cores</div>'
    var usedZones = []
    FM._annotations.forEach(function (a) {
      if (usedZones.indexOf(a.zone) !== -1) return
      usedZones.push(a.zone)
      var z = FM.ZONES.find(function (zz) { return zz.id === a.zone })
      if (!z) return
      html += '<div style="display:flex;align-items:center;gap:4px">' +
        '<span style="width:10px;height:10px;border-radius:50%;background:' + z.color + ';flex-shrink:0"></span>' +
        '<span style="font-size:9px;color:#F5F0E8">' + z.label + '</span>' +
      '</div>'
    })
    html += '</div>'

    // Professional signature
    var profName = localStorage.getItem('fm_professional_name') || 'Dra. Mirian de Paula'
    var profCRM = localStorage.getItem('fm_professional_crm') || 'CRM/SP 000000'
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-end;padding:16px 32px;border-top:1px solid rgba(200,169,126,0.15)">' +
      '<div style="font-size:9px;color:rgba(245,240,232,0.3)">Documento gerado por ClinicAI</div>' +
      '<div style="text-align:right">' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:18px;font-style:italic;color:#C8A97E">' + FM._esc(profName) + '</div>' +
        '<div style="font-size:9px;color:rgba(245,240,232,0.4);letter-spacing:0.1em">' + FM._esc(profCRM) + '</div>' +
      '</div>' +
    '</div>'

    html += '</div></div></div>'
    overlay.innerHTML = html
    document.body.appendChild(overlay)

    setTimeout(function () { FM._renderReportCanvases() }, 100)
  }

  FM._renderDonePanel = function () {
    var html = ''
    var uniqueZones = []
    FM._annotations.forEach(function (a) {
      if (uniqueZones.indexOf(a.zone) === -1) uniqueZones.push(a.zone)
    })
    uniqueZones.forEach(function (zId) {
      var z = FM.ZONES.find(function (x) { return x.id === zId })
      var anns = FM._annotations.filter(function (a) { return a.zone === zId })
      var desc = anns.map(function (a) {
        var t = FM.TREATMENTS.find(function (x) { return x.id === a.treatment })
        return (t ? t.label : '') + ' ' + a.ml + 'mL'
      }).join(', ')
      var color = z ? z.color : '#C8A97E'

      html += '<div class="fm-report-check">' +
        '<span class="fm-report-check-icon" style="background:' + color + '">' + FM._svgCheck() + '</span>' +
        '<div class="fm-report-check-text">' +
          '<strong>' + (z ? z.label : zId) + '</strong>' +
          '<span>' + (z ? z.desc : '') + '</span>' +
        '</div>' +
      '</div>'
    })

    return html || '<div style="font-size:12px;color:rgba(245,240,232,0.4)">Nenhuma zona marcada</div>'
  }

  FM._renderExpectedPanel = function () {
    var results = {
      'zigoma-lateral':  { title: 'Terco medio elevado', desc: 'Efeito lifting natural' },
      'zigoma-anterior': { title: 'Olhar iluminado', desc: 'Sombra preenchida' },
      'temporal':        { title: 'Vetor de sustentacao', desc: 'Lifting sem cirurgia' },
      'olheira':         { title: 'Olhar mais descansado', desc: 'Sombra tratada' },
      'nariz-dorso':     { title: 'Nariz harmonizado', desc: 'Dorso projetado naturalmente' },
      'nariz-base':      { title: 'Base nasal refinada', desc: 'Proporcao equilibrada' },
      'sulco':           { title: 'Sulco suavizado', desc: 'Sem excesso de volume' },
      'marionete':       { title: 'Expressao mais leve', desc: 'Refinamento da marionete' },
      'pre-jowl':        { title: 'Transicao suave', desc: 'Contorno mandibular continuo' },
      'mandibula':       { title: 'Mandibula definida', desc: 'Contorno continuo' },
      'mento':           { title: 'Mento harmonizado', desc: 'Projecao ideal' },
      'labio':           { title: 'Labios naturais', desc: 'Volume harmonico' },
      'glabela':         { title: 'Glabela relaxada', desc: 'Sem linhas de expressao' },
      'frontal':         { title: 'Face mais leve', desc: 'Triangulo invertido restaurado' },
      'periorbital':     { title: 'Olhar rejuvenescido', desc: 'Pes de galinha suavizados' },
      'gingival':        { title: 'Sorriso harmonioso', desc: 'Exposicao gengival corrigida' },
      'dao':             { title: 'Canto labial elevado', desc: 'Expressao mais positiva' },
      'platisma':        { title: 'Pescoco definido', desc: 'Bandas platismais suavizadas' },
      'cod-barras':      { title: 'Labio superior liso', desc: 'Codigo de barras suavizado' },
      'pescoco':         { title: 'Pescoco rejuvenescido', desc: 'Linhas cervicais tratadas' },
    }

    var html = ''
    var seen = []
    FM._annotations.forEach(function (a) {
      if (seen.indexOf(a.zone) !== -1) return
      seen.push(a.zone)
      var r = results[a.zone] || { title: a.zone, desc: '' }
      var z = FM.ZONES.find(function (x) { return x.id === a.zone })
      html += '<div class="fm-report-check">' +
        '<span class="fm-report-check-icon" style="background:' + (z ? z.color : '#8A9E88') + '">' + FM._svgCheck() + '</span>' +
        '<div class="fm-report-check-text">' +
          '<strong>' + r.title + '</strong>' +
          '<span>' + r.desc + '</span>' +
        '</div>' +
      '</div>'
    })

    return html || '<div style="font-size:12px;color:rgba(245,240,232,0.4)">Adicione marcacoes</div>'
  }

  FM._renderReportCanvases = function () {
    var mainAngle = FM._photoUrls['45'] ? '45' : (FM._photoUrls['front'] ? 'front' : 'lateral')
    var mainCanvas = document.getElementById('fmReportCanvas_main')
    if (mainCanvas && FM._photoUrls[mainAngle]) {
      var mainImg = new Image()
      mainImg.onload = function () {
        var scale = 400 / mainImg.width
        mainCanvas.width = 400
        mainCanvas.height = mainImg.height * scale
        var ctx = mainCanvas.getContext('2d')
        ctx.drawImage(mainImg, 0, 0, mainCanvas.width, mainCanvas.height)
      }
      mainImg.src = FM._photoUrls[mainAngle]
    }

    var centerAngle = FM._photoUrls['45'] ? '45' : (FM._photoUrls['front'] ? 'front' : 'lateral')
    var cc = document.getElementById('fmReportCenterCanvas')
    if (!cc || !FM._photoUrls[centerAngle]) return

    var cImg = new Image()
    cImg.onload = function () {
      var scale = 500 / cImg.width
      cc.width = 500
      cc.height = cImg.height * scale
      var ctx = cc.getContext('2d')
      ctx.drawImage(cImg, 0, 0, cc.width, cc.height)

      var anns = FM._annotations.filter(function (ann) { return ann.angle === centerAngle })
      var origScale = FM._canvas ? (cc.width / FM._canvas.width) : 1
      anns.forEach(function (ann) {
        FM._drawEllipseOn(ctx, FM._scaleAnn(ann, origScale))
      })
    }
    cImg.src = FM._photoUrls[centerAngle]
  }

  FM._downloadReport = function () {
    var report = document.getElementById('fmReportCard')
    if (!report) return

    if (window.html2canvas) {
      FM._showLoading('Gerando imagem do report...')
      window.html2canvas(report, {
        backgroundColor: '#2C2C2C',
        scale: 2,
        useCORS: true,
      }).then(function (canvas) {
        FM._hideLoading()
        var link = document.createElement('a')
        var name = (FM._lead.nome || FM._lead.name || 'paciente').replace(/\s+/g, '-').toLowerCase()
        link.download = 'analise-facial-' + name + '-' + FM._dateStr() + '.png'
        link.href = canvas.toDataURL('image/png')
        link.click()
        FM._showToast('Report exportado!', 'success')
      }).catch(function () { FM._hideLoading() })
    } else {
      var cc = document.getElementById('fmReportCenterCanvas')
      if (cc) {
        var link = document.createElement('a')
        var name = (FM._lead.nome || FM._lead.name || 'paciente').replace(/\s+/g, '-').toLowerCase()
        link.download = 'mapa-facial-' + name + '-' + FM._dateStr() + '.png'
        link.href = cc.toDataURL('image/png')
        link.click()
      }
    }
  }

  FM._printReport = function () {
    var report = document.getElementById('fmReportCard')
    if (!report) return
    var win = window.open('', '_blank')
    win.document.write('<!DOCTYPE html><html><head><title>Analise Facial</title>' +
      '<style>body{margin:0;background:#2C2C2C;font-family:Montserrat,sans-serif}' +
      '@media print{body{background:#fff}}</style></head><body>' +
      report.outerHTML + '</body></html>')
    win.document.close()
    setTimeout(function () { win.print() }, 500)
  }

  FM._closeExport = function () {
    var overlay = document.getElementById('fmExportOverlay')
    if (overlay) overlay.remove()
  }

  FM._editRanges = function () {
    var overlay = document.createElement('div')
    overlay.className = 'fm-export-overlay'
    overlay.id = 'fmRangesOverlay'

    var html = '<div style="background:#fff;border-radius:14px;width:520px;max-height:85vh;display:flex;flex-direction:column;box-shadow:0 24px 80px rgba(0,0,0,0.3)">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;padding:14px 20px;border-bottom:1px solid #E8EAF0;flex-shrink:0">' +
        '<span style="font-size:15px;font-weight:600;color:#1A1B2E">Editar Ranges por Zona</span>' +
        '<button onclick="document.getElementById(\'fmRangesOverlay\').remove()" style="width:28px;height:28px;border-radius:50%;background:#F3F4F6;border:none;cursor:pointer;color:#6B7280;display:flex;align-items:center;justify-content:center">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>' +
        '</button>' +
      '</div>' +
      '<div style="padding:16px 20px;overflow-y:auto;flex:1">' +
        '<div style="font-size:11px;color:#9CA3AF;margin-bottom:12px">Quantidade minima (obrigatoria) e maxima (sugestao) por zona. Alteracoes salvas localmente.</div>'

    html += '<div style="font-size:11px;font-weight:600;color:#C9A96E;text-transform:uppercase;letter-spacing:0.1em;margin-bottom:8px">Preenchimento (mL)</div>'
    FM.ZONES.filter(function (z) { return z.cat === 'fill' }).forEach(function (z) {
      html += FM._rangeRow(z)
    })

    html += '<div style="font-size:11px;font-weight:600;color:#8B5CF6;text-transform:uppercase;letter-spacing:0.1em;margin:16px 0 8px">Rugas / Toxina (U)</div>'
    FM.ZONES.filter(function (z) { return z.cat === 'tox' }).forEach(function (z) {
      html += FM._rangeRow(z)
    })

    html += '</div>' +
      '<div style="padding:12px 20px;border-top:1px solid #E8EAF0;flex-shrink:0">' +
        '<button id="fmRangesSave" style="width:100%;padding:10px;border:none;border-radius:10px;background:#C8A97E;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Salvar Ranges</button>' +
      '</div>' +
    '</div>'

    overlay.innerHTML = html
    document.body.appendChild(overlay)

    document.getElementById('fmRangesSave').addEventListener('click', function () {
      FM.ZONES.forEach(function (z) {
        var minEl = document.getElementById('fmRange_min_' + z.id)
        var maxEl = document.getElementById('fmRange_max_' + z.id)
        if (minEl && maxEl) {
          FM._saveZoneRange(z.id, parseFloat(minEl.value) || z.min, parseFloat(maxEl.value) || z.max)
        }
      })
      document.getElementById('fmRangesOverlay').remove()
      FM._refreshToolbar()
    })
  }

  FM._rangeRow = function (z) {
    return '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">' +
      '<span style="width:10px;height:10px;border-radius:50%;background:' + z.color + ';flex-shrink:0"></span>' +
      '<span style="font-size:12px;color:#1A1B2E;width:130px;flex-shrink:0">' + z.label + '</span>' +
      '<span style="font-size:10px;color:#9CA3AF;width:24px">Min</span>' +
      '<input id="fmRange_min_' + z.id + '" type="number" step="' + (z.unit === 'U' ? '1' : '0.1') + '" value="' + z.min + '" ' +
        'style="width:60px;padding:4px 6px;border:1px solid #E8EAF0;border-radius:6px;font-size:12px;text-align:center">' +
      '<span style="font-size:10px;color:#9CA3AF;width:28px">Max</span>' +
      '<input id="fmRange_max_' + z.id + '" type="number" step="' + (z.unit === 'U' ? '1' : '0.1') + '" value="' + z.max + '" ' +
        'style="width:60px;padding:4px 6px;border:1px solid #E8EAF0;border-radius:6px;font-size:12px;text-align:center">' +
      '<span style="font-size:10px;color:#9CA3AF">' + z.unit + '</span>' +
    '</div>'
  }

})()
