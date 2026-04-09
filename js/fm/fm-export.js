/**
 * fm-export.js — Report export, download, ranges editor
 */
;(function () {
  'use strict'

  var FM = window._FM

  // ── Helper: score color ──
  function _scoreColor(val, good, warn) {
    good = good || 70; warn = warn || 50
    return val >= good ? '#10B981' : val >= warn ? '#F59E0B' : '#EF4444'
  }

  // ── Helper: build a metric card (dark bg, colored value, uppercase label) ──
  function _metricCard(value, label, color, sub) {
    return '<div style="flex:1;min-width:100px;background:rgba(255,255,255,0.03);border:1px solid rgba(200,169,126,0.10);border-radius:10px;padding:14px 10px;text-align:center">' +
      '<div style="font-family:Montserrat,sans-serif;font-size:22px;font-weight:700;color:' + (color || '#F5F0E8') + ';line-height:1.1">' + value + '</div>' +
      '<div style="font-family:Montserrat,sans-serif;font-size:8px;letter-spacing:0.14em;text-transform:uppercase;color:rgba(245,240,232,0.50);margin-top:6px">' + label + '</div>' +
      (sub ? '<div style="font-size:8px;color:' + (color || 'rgba(245,240,232,0.4)') + ';margin-top:3px">' + sub + '</div>' : '') +
    '</div>'
  }

  // ── Helper: section title bar ──
  function _sectionTitle(text, icon) {
    return '<div style="display:flex;align-items:center;gap:8px;padding:18px 32px 8px 32px">' +
      (icon ? '<span style="color:#C8A97E;opacity:0.7">' + FM._icon(icon, 13) + '</span>' : '') +
      '<span style="font-family:Montserrat,sans-serif;font-size:8px;letter-spacing:0.18em;text-transform:uppercase;color:#C8A97E">' + text + '</span>' +
      '<span style="flex:1;height:1px;background:linear-gradient(90deg,rgba(200,169,126,0.18),transparent)"></span>' +
    '</div>'
  }

  // ── Helper: skin analysis bar ──
  function _skinBar(label, val) {
    if (val == null) return ''
    var c = _scoreColor(val)
    var pct = Math.min(100, Math.max(0, val))
    return '<div style="display:flex;align-items:center;gap:10px;margin-bottom:5px">' +
      '<span style="font-size:9px;color:rgba(245,240,232,0.55);width:72px;text-align:right;flex-shrink:0">' + label + '</span>' +
      '<div style="flex:1;height:5px;background:rgba(255,255,255,0.06);border-radius:3px;overflow:hidden">' +
        '<div style="width:' + pct + '%;height:100%;background:' + c + ';border-radius:3px;transition:width .3s"></div>' +
      '</div>' +
      '<span style="font-size:10px;font-weight:600;color:' + c + ';width:28px;text-align:right">' + Math.round(val) + '</span>' +
    '</div>'
  }

  FM._exportReport = function () {
    if (FM._annotations.length === 0 && !FM._metricAngles && !FM._scanData && !FM._skinAnalysis) {
      alert('Adicione marcacoes ou execute Auto Analise antes de exportar.')
      return
    }

    var name = FM._lead ? (FM._lead.nome || FM._lead.name || 'Paciente') : 'Paciente'
    var dateStr = FM._formatDate ? FM._formatDate(new Date()) : new Date().toLocaleDateString('pt-BR')

    var overlay = document.createElement('div')
    overlay.id = 'fmExportOverlay'
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;flex-direction:column;align-items:center;overflow-y:auto;padding:24px 0;backdrop-filter:blur(8px)'

    // ── Toolbar ──
    var toolbar = '<div style="width:100%;max-width:820px;display:flex;justify-content:space-between;align-items:center;padding:0 0 16px 0;flex-shrink:0">' +
      '<div style="font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;color:#F5F0E8;letter-spacing:0.04em">Harmonia Facial</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:none;border-radius:10px;background:#C8A97E;color:#0A0A0A;font-size:12px;font-weight:600;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._downloadReport()">' +
          FM._icon('download', 13) + ' Baixar PNG</button>' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:1px solid rgba(200,169,126,0.3);border-radius:10px;background:transparent;color:#C8A97E;font-size:12px;font-weight:500;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._printReport()">' +
          FM._icon('printer', 13) + ' Imprimir</button>' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:1px solid rgba(200,169,126,0.3);border-radius:10px;background:transparent;color:#C8A97E;font-size:12px;font-weight:500;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._shareReport()">' +
          FM._icon('share-2', 13) + ' Compartilhar</button>' +
        '<button style="display:flex;align-items:center;gap:5px;padding:8px 16px;border:1px solid rgba(255,255,255,0.1);border-radius:10px;background:transparent;color:rgba(245,240,232,0.6);font-size:12px;font-weight:500;cursor:pointer;font-family:Montserrat,sans-serif" onclick="FaceMapping._closeExport()">' +
          FM._icon('x', 13) + ' Fechar</button>' +
      '</div>' +
    '</div>'

    // ── Report Card ──
    var html = '<div id="fmReportCard" style="width:794px;background:#0A0A0A;border-radius:4px;font-family:Montserrat,sans-serif;color:#F5F0E8;box-shadow:0 32px 100px rgba(0,0,0,0.6)">'

    // ─── SECTION 1: Header ───
    html += '<div style="padding:36px 32px 20px 32px;display:flex;justify-content:space-between;align-items:flex-end">' +
      '<div>' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:26px;font-weight:300;font-style:italic;color:#C8A97E;letter-spacing:0.02em">Clinica Mirian de Paula</div>' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:11px;font-weight:300;font-style:italic;color:rgba(200,169,126,0.55);margin-top:2px;letter-spacing:0.06em">Harmonia que revela. Precisao que dura.</div>' +
      '</div>' +
      '<div style="text-align:right">' +
        '<div style="font-size:13px;font-weight:600;color:#F5F0E8;letter-spacing:0.02em">' + FM._esc(name) + '</div>' +
        '<div style="font-size:9px;color:rgba(245,240,232,0.4);margin-top:2px;letter-spacing:0.06em">' + dateStr + '</div>' +
      '</div>' +
    '</div>' +
    '<div style="height:1px;background:linear-gradient(90deg,transparent,#C8A97E,transparent);margin:0 32px"></div>'

    // ─── SECTION 2: Photos Side by Side ───
    var hasAntes = FM._canvas && FM._canvas.width > 0
    var hasDepois = FM._canvas2 && FM._canvas2.width > 0
    if (hasAntes || hasDepois) {
      html += '<div style="display:flex;gap:12px;padding:20px 32px;justify-content:center">'
      if (hasAntes) {
        html += '<div style="flex:1;max-width:360px;position:relative;border-radius:8px;overflow:hidden;background:#111">' +
          '<canvas id="fmReportCanvasAntes" style="width:100%;display:block"></canvas>' +
          '<div style="position:absolute;bottom:0;left:0;right:0;padding:6px 12px;background:linear-gradient(transparent,rgba(10,10,10,0.85));display:flex;align-items:center;gap:6px">' +
            '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#EF4444"></span>' +
            '<span style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;color:rgba(245,240,232,0.8)">ANTES</span>' +
          '</div>' +
        '</div>'
      }
      if (hasDepois) {
        html += '<div style="flex:1;max-width:360px;position:relative;border-radius:8px;overflow:hidden;background:#111">' +
          '<canvas id="fmReportCanvasDepois" style="width:100%;display:block"></canvas>' +
          '<div style="position:absolute;bottom:0;left:0;right:0;padding:6px 12px;background:linear-gradient(transparent,rgba(10,10,10,0.85));display:flex;align-items:center;gap:6px">' +
            '<span style="display:inline-block;width:6px;height:6px;border-radius:50%;background:#10B981"></span>' +
            '<span style="font-size:9px;letter-spacing:0.12em;text-transform:uppercase;font-weight:600;color:rgba(245,240,232,0.8)">DEPOIS</span>' +
          '</div>' +
        '</div>'
      }
      html += '</div>'
    }

    // ─── SECTION 3: Simetria Metrics ───
    var hasScan = FM._scanData
    var hasAngles = FM._metricAngles
    if (hasScan || hasAngles) {
      html += _sectionTitle('Analise de Simetria', 'grid')
      html += '<div style="display:flex;gap:8px;padding:0 32px 4px 32px;flex-wrap:wrap">'

      // Tercos
      if (hasScan && hasScan.thirds) {
        var t = hasScan.thirds
        var thirds = [
          { l: 'Sup.', v: t.superior },
          { l: 'Medio', v: t.medio },
          { l: 'Inf.', v: t.inferior },
        ]
        thirds.forEach(function (tc) {
          if (tc.v == null) return
          var c = (tc.v >= 28 && tc.v <= 38) ? '#10B981' : tc.v < 28 ? '#EF4444' : '#F59E0B'
          html += _metricCard(Math.round(tc.v) + '%', 'Terco ' + tc.l, c)
        })
      }

      // AMF
      if (hasAngles && hasAngles.amf != null) {
        var cl = hasAngles.classification || {}
        html += _metricCard(hasAngles.amf + '\u00B0', 'AMF', cl.color || '#C8A97E', cl.label || '')
      }

      // Golden ratio / measurements
      if (hasScan && hasScan.measurements) {
        var meas = hasScan.measurements
        if (meas.golden_ratio != null) {
          var grColor = Math.abs(meas.golden_ratio - 1.618) < 0.08 ? '#10B981' : '#F59E0B'
          html += _metricCard(meas.golden_ratio.toFixed(3), 'Proporcao Aurea', grColor, '1.618 ideal')
        }
      }

      // Symmetry
      if (hasScan && hasScan.symmetry && hasScan.symmetry.overall != null) {
        var so = hasScan.symmetry.overall
        html += _metricCard(so + '%', 'Simetria', _scoreColor(so, 85, 70))
      }

      // Jawline
      if (hasAngles && hasAngles.aij_avg != null) {
        var jl = hasAngles.jawline || {}
        html += _metricCard(hasAngles.aij_avg + '\u00B0', 'Jawline', jl.color || '#C8A97E', jl.label || '')
      }

      // Ratio M/Z
      if (hasAngles && hasAngles.rmz != null) {
        var rmzOk = hasAngles.rmz >= 0.85 && hasAngles.rmz <= 0.95
        html += _metricCard(hasAngles.rmz, 'Ratio M/Z', rmzOk ? '#10B981' : '#F59E0B')
      }

      // Ricketts
      if (FM._rickettsPoints && FM._rickettsPoints.nose && FM._rickettsPoints.chin) {
        html += _metricCard('Lateral', 'Ricketts', '#C8A97E', 'Linha E avaliada')
      }

      // Shape
      if (hasScan && hasScan.shape && hasScan.shape.shape) {
        html += _metricCard(hasScan.shape.shape, 'Biotipo', '#C8A97E')
      }

      html += '</div>'
    }

    // ─── SECTION 4: Skin Analysis ───
    if (FM._skinAnalysis) {
      var sk = FM._skinAnalysis
      html += _sectionTitle('Analise da Pele', 'activity')

      html += '<div style="display:flex;gap:16px;padding:0 32px 4px 32px;align-items:flex-start">'

      // Overall score circle
      html += '<div style="flex-shrink:0;width:90px;text-align:center">' +
        '<div style="width:72px;height:72px;border-radius:50%;border:3px solid ' + _scoreColor(sk.overall || 0) + ';display:flex;align-items:center;justify-content:center;margin:0 auto">' +
          '<span style="font-size:26px;font-weight:700;color:' + _scoreColor(sk.overall || 0) + '">' + Math.round(sk.overall || 0) + '</span>' +
        '</div>' +
        '<div style="font-size:8px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,240,232,0.45);margin-top:6px">Score Geral</div>'
      // Skin age
      if (FM._skinAge && FM._skinAge.estimated_age) {
        var saColor = FM._skinAge.estimated_age <= 35 ? '#10B981' : FM._skinAge.estimated_age <= 45 ? '#F59E0B' : '#EF4444'
        html += '<div style="font-size:18px;font-weight:700;color:' + saColor + ';margin-top:8px">' + Math.round(FM._skinAge.estimated_age) + '</div>' +
          '<div style="font-size:8px;letter-spacing:0.1em;text-transform:uppercase;color:rgba(245,240,232,0.45)">Idade Pele</div>'
      }
      html += '</div>'

      // Individual bars
      html += '<div style="flex:1">'
      html += _skinBar('Rugas', sk.wrinkles)
      html += _skinBar('Manchas', sk.spots)
      html += _skinBar('Poros', sk.pores)
      html += _skinBar('Vermelhidao', sk.redness)
      html += _skinBar('Pigmentacao', sk.pigmentation)
      html += _skinBar('Firmeza', sk.firmness)
      html += '</div>'

      html += '</div>'

      // Skin age description
      if (FM._skinAge && FM._skinAge.description) {
        html += '<div style="padding:4px 32px 8px 32px;text-align:center;font-size:10px;color:rgba(245,240,232,0.45);font-style:italic">' + FM._esc(FM._skinAge.description) + '</div>'
      }
    }

    // ─── SECTION 5: Force Vectors Summary ───
    var age = FM._vecAge || 25
    if (FM._vecAgeFactor && FM._vecCollagenPct) {
      var t = FM._vecAgeFactor(age)
      var colPct = FM._vecCollagenPct(age)
      var ageColor = FM._vecAgeColor ? FM._vecAgeColor(t) : '#C8A97E'
      var elastPct = Math.max(0, 100 - Math.round(t * 65))
      var sustPct = Math.max(0, 100 - Math.round(t * 55))
      var activeVecPct = Math.max(0, 100 - Math.round(t * 70))

      html += _sectionTitle('Vetores de Forca  |  Idade Simulada: ' + age, 'trending-up')
      html += '<div style="display:flex;gap:8px;padding:0 32px 4px 32px;flex-wrap:wrap">'
      html += _metricCard(Math.round(colPct) + '%', 'Colageno', ageColor)
      html += _metricCard(elastPct + '%', 'Elasticidade', ageColor)
      html += _metricCard(sustPct + '%', 'Sustentacao', ageColor)
      html += _metricCard(activeVecPct + '%', 'Vetores Ativos', ageColor)

      // Gravity / Anteriorizacao / Ligaments
      if (FM._vecGravityLabel) {
        var grav = FM._vecGravityLabel(t)
        html += _metricCard(grav.label, 'Gravidade', grav.color)
      }
      var antLabel = t < 0.3 ? 'Minima' : t < 0.6 ? 'Moderada' : 'Acentuada'
      var antColor = t < 0.3 ? '#10B981' : t < 0.6 ? '#F59E0B' : '#EF4444'
      html += _metricCard(antLabel, 'Anteriorizacao', antColor)
      var ligLabel = t < 0.25 ? 'Firmes' : t < 0.55 ? 'Estirados' : 'Alongados'
      var ligColor = t < 0.25 ? '#10B981' : t < 0.55 ? '#F59E0B' : '#EF4444'
      html += _metricCard(ligLabel, 'Ligamentos', ligColor)

      html += '</div>'
    }

    // ─── SECTION 6: Protocol (treatment zones) ───
    if (FM._annotations.length > 0 || (FM._protocolData && FM._protocolData.protocol)) {
      html += _sectionTitle('Protocolo de Tratamento', 'clipboard')

      // Protocol table
      html += '<div style="padding:0 32px 4px 32px">' +
        '<table style="width:100%;border-collapse:collapse;font-size:10px">' +
        '<thead><tr>' +
          '<th style="text-align:left;padding:6px 8px;color:rgba(245,240,232,0.4);font-weight:500;font-size:8px;letter-spacing:0.1em;text-transform:uppercase;border-bottom:1px solid rgba(200,169,126,0.10)">Zona</th>' +
          '<th style="text-align:left;padding:6px 8px;color:rgba(245,240,232,0.4);font-weight:500;font-size:8px;letter-spacing:0.1em;text-transform:uppercase;border-bottom:1px solid rgba(200,169,126,0.10)">Tratamento</th>' +
          '<th style="text-align:right;padding:6px 8px;color:rgba(245,240,232,0.4);font-weight:500;font-size:8px;letter-spacing:0.1em;text-transform:uppercase;border-bottom:1px solid rgba(200,169,126,0.10)">Dose</th>' +
          '<th style="text-align:left;padding:6px 8px;color:rgba(245,240,232,0.4);font-weight:500;font-size:8px;letter-spacing:0.1em;text-transform:uppercase;border-bottom:1px solid rgba(200,169,126,0.10)">Produto</th>' +
        '</tr></thead><tbody>'

      // Use protocolData if available, otherwise annotations
      if (FM._protocolData && FM._protocolData.protocol && FM._protocolData.protocol.length > 0) {
        FM._protocolData.protocol.forEach(function (p, i) {
          var bg = i % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
          var doseColor = p.unit === 'U' ? '#8B5CF6' : '#3B82F6'
          html += '<tr style="background:' + bg + '">' +
            '<td style="padding:5px 8px;color:#F5F0E8">' + FM._esc(p.zone || '') + (p.bilateral ? ' (bi)' : '') + '</td>' +
            '<td style="padding:5px 8px;color:rgba(245,240,232,0.65)">' + FM._esc(p.product || '') + '</td>' +
            '<td style="padding:5px 8px;text-align:right;color:' + doseColor + ';font-weight:600">' + p.dose + ' ' + p.unit + '</td>' +
            '<td style="padding:5px 8px;color:rgba(245,240,232,0.45)">' + FM._esc(p.product || '') + '</td>' +
          '</tr>'
        })
      } else {
        // Fallback: annotations
        var zoneTotals = {}
        FM._annotations.forEach(function (a) {
          var z = (FM.ZONES || []).find(function (x) { return x.id === a.zone })
          var tr = (FM.TREATMENTS || []).find(function (x) { return x.id === a.treatment })
          var zLabel = z ? z.label : a.zone
          var tLabel = tr ? tr.label : (a.treatment || 'Preenchimento')
          var product = a.product || ''
          var key = a.zone + '|' + a.treatment
          if (!zoneTotals[key]) {
            zoneTotals[key] = { zone: zLabel, treatment: tLabel, ml: 0, product: product, side: a.side || '' }
          }
          zoneTotals[key].ml += (a.ml || 0)
        })
        var idx = 0
        Object.keys(zoneTotals).forEach(function (key) {
          var row = zoneTotals[key]
          var bg = idx % 2 === 0 ? 'rgba(255,255,255,0.02)' : 'transparent'
          html += '<tr style="background:' + bg + '">' +
            '<td style="padding:5px 8px;color:#F5F0E8">' + FM._esc(row.zone) + '</td>' +
            '<td style="padding:5px 8px;color:rgba(245,240,232,0.65)">' + FM._esc(row.treatment) + '</td>' +
            '<td style="padding:5px 8px;text-align:right;color:#3B82F6;font-weight:600">' + row.ml.toFixed(1) + ' mL</td>' +
            '<td style="padding:5px 8px;color:rgba(245,240,232,0.45)">' + FM._esc(row.product) + '</td>' +
          '</tr>'
          idx++
        })
      }

      html += '</tbody></table>'

      // Totals row
      if (FM._protocolData && FM._protocolData.totals) {
        var pt = FM._protocolData.totals
        html += '<div style="display:flex;gap:16px;margin-top:8px;padding:8px 0;border-top:1px solid rgba(200,169,126,0.10);justify-content:flex-end">'
        if (pt.ah_ml) html += '<span style="font-size:10px;color:#3B82F6;font-weight:600">' + FM._icon('droplet', 10) + ' ' + pt.ah_ml + ' mL AH</span>'
        if (pt.botox_units) html += '<span style="font-size:10px;color:#8B5CF6;font-weight:600">' + FM._icon('zap', 10) + ' ' + pt.botox_units + ' U Botox</span>'
        if (pt.bio_sessions) html += '<span style="font-size:10px;color:#10B981;font-weight:600">' + FM._icon('refresh-cw', 10) + ' ' + pt.bio_sessions + ' Sessoes Bio</span>'
        html += '</div>'
      } else if (FM._annotations.length > 0) {
        var totals = FM._calcTotals ? FM._calcTotals() : []
        if (totals.length > 0) {
          html += '<div style="display:flex;gap:16px;margin-top:8px;padding:8px 0;border-top:1px solid rgba(200,169,126,0.10);justify-content:flex-end">'
          totals.forEach(function (tt) {
            html += '<span style="font-size:10px;color:' + tt.color + ';font-weight:600">' + tt.ml.toFixed(1) + ' ' + FM._esc(tt.label) + '</span>'
          })
          html += '</div>'
        }
      }

      html += '</div>'
    }

    // ─── SECTION 7: Footer ───
    html += '<div style="margin-top:16px;border-top:1px solid rgba(200,169,126,0.12)">'
    html += '<div style="padding:24px 32px 8px 32px;text-align:center">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:14px;font-weight:300;font-style:italic;color:rgba(200,169,126,0.65);line-height:1.6;max-width:500px;margin:0 auto">' +
        'Nos nao preenchemos rugas. Nos reposicionamos as forcas do seu rosto.' +
      '</div>' +
    '</div>'

    var profName = localStorage.getItem('fm_professional_name') || 'Dra. Mirian de Paula'
    var profCRM = localStorage.getItem('fm_professional_crm') || 'CRM/SP 000000'
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-end;padding:12px 32px 28px 32px">' +
      '<div style="font-size:8px;color:rgba(245,240,232,0.20);letter-spacing:0.06em">Gerado por ClinicAI Face Mapping</div>' +
      '<div style="text-align:right">' +
        '<div style="font-family:Cormorant Garamond,serif;font-size:18px;font-weight:300;font-style:italic;color:#C8A97E">' + FM._esc(profName) + '</div>' +
        '<div style="font-size:8px;color:rgba(245,240,232,0.35);letter-spacing:0.1em;margin-top:2px">' + FM._esc(profCRM) + '</div>' +
      '</div>' +
    '</div>'
    html += '</div>'

    // Close report card
    html += '</div>'

    overlay.innerHTML = toolbar + html
    document.body.appendChild(overlay)

    // Render canvases after DOM insertion
    setTimeout(function () { FM._renderReportCanvases() }, 80)
  }

  // ── Render canvases: copy from main canvases WITH all overlays ──
  FM._renderReportCanvases = function () {
    // ANTES canvas — copy directly from FM._canvas (already has metrics/angles/wireframe)
    var antesEl = document.getElementById('fmReportCanvasAntes')
    if (antesEl && FM._canvas && FM._canvas.width > 0) {
      antesEl.width = FM._canvas.width
      antesEl.height = FM._canvas.height
      var actx = antesEl.getContext('2d')
      actx.drawImage(FM._canvas, 0, 0)
    }

    // DEPOIS canvas — copy directly from FM._canvas2 (already has overlays)
    var depoisEl = document.getElementById('fmReportCanvasDepois')
    if (depoisEl && FM._canvas2 && FM._canvas2.width > 0) {
      depoisEl.width = FM._canvas2.width
      depoisEl.height = FM._canvas2.height
      var dctx = depoisEl.getContext('2d')
      dctx.drawImage(FM._canvas2, 0, 0)
    }
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
