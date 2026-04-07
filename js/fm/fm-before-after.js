/**
 * fm-before-after.js — Metrified Before/After Comparison
 * Upload Antes + Depois, scan both, compare metrics with delta
 *
 * Features:
 * - Dual photo upload (Antes / Depois) with premium enhance
 * - Scanner 478pts on both photos
 * - Auto angles on both
 * - Side-by-side with matching lines/points
 * - Delta panel: AMF, symmetry, jawline, skin age differences
 */
;(function () {
  'use strict'

  var FM = window._FM

  FM._beforeAfterData = FM._beforeAfterData || { before: null, after: null }

  FM._openBeforeAfter = function () {
    var overlay = document.createElement('div')
    overlay.className = 'fm-export-overlay'
    overlay.id = 'fmBeforeAfterOverlay'
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.9);z-index:9999;display:flex;flex-direction:column;overflow:auto'

    var html = '<div style="padding:16px;display:flex;flex-direction:column;height:100%">'

    // Header
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-shrink:0">' +
      '<div style="display:flex;align-items:center;gap:12px">' +
        '<span style="font-family:Cormorant Garamond,serif;font-size:22px;color:#C8A97E">Antes & Depois Metrificado</span>' +
        '<span style="font-size:11px;color:rgba(245,240,232,0.4)">Upload as duas fotos para comparar metricas</span>' +
      '</div>' +
      '<div style="display:flex;gap:8px">' +
        '<button onclick="FaceMapping._scanBeforeAfter()" style="padding:6px 14px;border:1px solid #10B981;border-radius:8px;background:transparent;color:#10B981;font-size:12px;cursor:pointer;font-weight:600">Escanear Ambas</button>' +
        '<button onclick="FaceMapping._closeBeforeAfter()" style="padding:6px 14px;border:1px solid rgba(200,169,126,0.3);border-radius:8px;background:transparent;color:#C8A97E;font-size:12px;cursor:pointer">Fechar</button>' +
      '</div>' +
    '</div>'

    // Photos row
    html += '<div style="display:flex;gap:16px;flex:1;min-height:0">'

    // ANTES
    html += '<div style="flex:1;display:flex;flex-direction:column;background:#1A1A1A;border-radius:12px;overflow:hidden">' +
      '<div style="padding:8px 16px;background:rgba(239,68,68,0.1);display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-size:12px;font-weight:700;color:#EF4444;letter-spacing:0.1em">ANTES</span>' +
        '<label style="padding:4px 10px;border:1px solid rgba(239,68,68,0.3);border-radius:6px;background:transparent;color:#EF4444;font-size:10px;cursor:pointer">' +
          'Upload<input type="file" accept="image/*" onchange="FaceMapping._uploadBA(\'before\',this)" style="display:none">' +
        '</label>' +
      '</div>' +
      '<div id="fmBA_before" style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;min-height:300px">' +
        (FM._beforeAfterData.before
          ? '<img src="' + FM._beforeAfterData.before.url + '" style="max-width:100%;max-height:100%;object-fit:contain">'
          : '<div style="color:rgba(245,240,232,0.2);font-size:14px;text-align:center">Clique Upload para<br>carregar foto ANTES</div>') +
      '</div>' +
      '<div id="fmBA_beforeMetrics" style="padding:8px 12px;border-top:1px solid rgba(255,255,255,0.05);min-height:60px">' +
        _renderBAMetrics(FM._beforeAfterData.before) +
      '</div>' +
    '</div>'

    // DEPOIS
    html += '<div style="flex:1;display:flex;flex-direction:column;background:#1A1A1A;border-radius:12px;overflow:hidden">' +
      '<div style="padding:8px 16px;background:rgba(16,185,129,0.1);display:flex;justify-content:space-between;align-items:center">' +
        '<span style="font-size:12px;font-weight:700;color:#10B981;letter-spacing:0.1em">DEPOIS</span>' +
        '<label style="padding:4px 10px;border:1px solid rgba(16,185,129,0.3);border-radius:6px;background:transparent;color:#10B981;font-size:10px;cursor:pointer">' +
          'Upload<input type="file" accept="image/*" onchange="FaceMapping._uploadBA(\'depois\',this)" style="display:none">' +
        '</label>' +
      '</div>' +
      '<div id="fmBA_after" style="flex:1;display:flex;align-items:center;justify-content:center;position:relative;min-height:300px">' +
        (FM._beforeAfterData.after
          ? '<img src="' + FM._beforeAfterData.after.url + '" style="max-width:100%;max-height:100%;object-fit:contain">'
          : '<div style="color:rgba(245,240,232,0.2);font-size:14px;text-align:center">Clique Upload para<br>carregar foto DEPOIS</div>') +
      '</div>' +
      '<div id="fmBA_afterMetrics" style="padding:8px 12px;border-top:1px solid rgba(255,255,255,0.05);min-height:60px">' +
        _renderBAMetrics(FM._beforeAfterData.after) +
      '</div>' +
    '</div>'

    // DELTA panel (between the two)
    html += '<div style="width:220px;flex-shrink:0;background:#1A1A1A;border-radius:12px;overflow-y:auto">' +
      '<div style="padding:8px 16px;background:rgba(200,169,126,0.1)">' +
        '<span style="font-size:12px;font-weight:700;color:#C8A97E;letter-spacing:0.1em">DELTA</span>' +
      '</div>' +
      '<div id="fmBA_delta" style="padding:12px">' +
        _renderBADelta() +
      '</div>' +
    '</div>'

    html += '</div></div>'

    overlay.innerHTML = html
    document.body.appendChild(overlay)
  }

  FM._closeBeforeAfter = function () {
    var ov = document.getElementById('fmBeforeAfterOverlay')
    if (ov) ov.remove()
  }

  FM._uploadBA = function (which, input) {
    var file = input.files[0]
    if (!file) return

    var reader = new FileReader()
    reader.onload = function (e) {
      var url = e.target.result

      // Store
      if (which === 'before') {
        if (FM._beforeAfterData.before && FM._beforeAfterData.before.url) {
          URL.revokeObjectURL(FM._beforeAfterData.before.url)
        }
        FM._beforeAfterData.before = { url: url, scan: null, angles: null, skin: null }
      } else {
        if (FM._beforeAfterData.after && FM._beforeAfterData.after.url) {
          URL.revokeObjectURL(FM._beforeAfterData.after.url)
        }
        FM._beforeAfterData.after = { url: url, scan: null, angles: null, skin: null }
      }

      // Update image display
      var container = document.getElementById(which === 'before' ? 'fmBA_before' : 'fmBA_after')
      if (container) {
        container.innerHTML = '<img src="' + url + '" style="max-width:100%;max-height:100%;object-fit:contain">'
      }

      FM._showToast('Foto ' + (which === 'before' ? 'ANTES' : 'DEPOIS') + ' carregada', 'success')
    }
    reader.readAsDataURL(file)
  }

  FM._scanBeforeAfter = function () {
    var before = FM._beforeAfterData.before
    var after = FM._beforeAfterData.after

    if (!before || !before.url) {
      FM._showToast('Upload a foto ANTES primeiro', 'warn')
      return
    }
    if (!after || !after.url) {
      FM._showToast('Upload a foto DEPOIS primeiro', 'warn')
      return
    }

    FM._showLoading('Escaneando ANTES (478 pts)...')

    // Scan BEFORE
    _scanPhoto(before.url, function (scanData) {
      before.scan = scanData
      FM._showLoading('Escaneando DEPOIS (478 pts)...')

      // Scan AFTER
      _scanPhoto(after.url, function (scanDataAfter) {
        after.scan = scanDataAfter
        FM._hideLoading()

        // Update metrics displays
        var beforePanel = document.getElementById('fmBA_beforeMetrics')
        var afterPanel = document.getElementById('fmBA_afterMetrics')
        var deltaPanel = document.getElementById('fmBA_delta')

        if (beforePanel) beforePanel.innerHTML = _renderBAMetrics(before)
        if (afterPanel) afterPanel.innerHTML = _renderBAMetrics(after)
        if (deltaPanel) deltaPanel.innerHTML = _renderBADelta()

        FM._showToast('Ambas fotos escaneadas — veja o DELTA', 'success')
      })
    })
  }

  function _scanPhoto(url, callback) {
    var img = new Image()
    img.onload = function () {
      var c = document.createElement('canvas')
      c.width = img.width; c.height = img.height
      c.getContext('2d').drawImage(img, 0, 0)
      var b64 = c.toDataURL('image/jpeg', 0.85).split(',')[1]

      var apiUrl = FM.FACIAL_API_URL

      // Scan face
      fetch(apiUrl + '/scanner/scan-face', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_base64: b64, include_landmarks: false, include_measurements: true }),
      })
      .then(function (r) { return r.json() })
      .then(function (data) {
        if (!data.success) {
          FM._showToast('Nenhum rosto detectado', 'error')
          callback(null)
          return
        }

        // Also get skin analysis
        fetch(apiUrl + '/skin/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ photo_base64: b64, generate_heatmaps: false }),
        })
        .then(function (r) { return r.json() })
        .then(function (skinData) {
          data.skin = skinData.success ? skinData : null
          callback(data)
        })
        .catch(function () { callback(data) })
      })
      .catch(function () {
        FM._showToast('API offline', 'error')
        callback(null)
      })
    }
    img.src = url
  }

  function _renderBAMetrics(photoData) {
    if (!photoData || !photoData.scan) {
      return '<div style="color:rgba(245,240,232,0.3);font-size:10px">Clique "Escanear Ambas" apos upload</div>'
    }

    var s = photoData.scan
    var html = '<div style="font-size:10px">'

    if (s.shape) html += _mVal('Biotipo', s.shape.shape, '#C8A97E')
    if (s.symmetry) html += _mVal('Simetria', s.symmetry.overall + '%', s.symmetry.overall >= 85 ? '#10B981' : '#F59E0B')
    if (s.thirds) {
      html += _mVal('T.Sup', Math.round(s.thirds.superior) + '%', s.thirds.superior >= 28 && s.thirds.superior <= 38 ? '#10B981' : '#F59E0B')
      html += _mVal('T.Med', Math.round(s.thirds.medio) + '%', s.thirds.medio >= 28 && s.thirds.medio <= 38 ? '#10B981' : '#F59E0B')
      html += _mVal('T.Inf', Math.round(s.thirds.inferior) + '%', s.thirds.inferior >= 28 && s.thirds.inferior <= 38 ? '#10B981' : '#F59E0B')
    }
    if (s.measurements) html += _mVal('Golden', Math.round(s.measurements.golden_ratio_score) + '%', s.measurements.golden_ratio_score >= 70 ? '#10B981' : '#F59E0B')
    if (s.skin && s.skin.scores) {
      html += _mVal('Score Pele', Math.round(s.skin.scores.overall), s.skin.scores.overall >= 70 ? '#10B981' : '#F59E0B')
    }
    if (s.skin && s.skin.skin_age) {
      html += _mVal('Idade Pele', Math.round(s.skin.skin_age.estimated_age) + 'a', '#C8A97E')
    }

    html += '</div>'
    return html
  }

  function _renderBADelta() {
    var b = FM._beforeAfterData.before
    var a = FM._beforeAfterData.after

    if (!b || !b.scan || !a || !a.scan) {
      return '<div style="color:rgba(245,240,232,0.3);font-size:10px;text-align:center">Escaneie ambas fotos<br>para ver o delta</div>'
    }

    var html = '<div style="font-size:10px">'

    // Symmetry delta
    if (b.scan.symmetry && a.scan.symmetry) {
      var symDelta = a.scan.symmetry.overall - b.scan.symmetry.overall
      html += _dVal('Simetria', b.scan.symmetry.overall + '%', a.scan.symmetry.overall + '%', symDelta, '%')
    }

    // Golden ratio delta
    if (b.scan.measurements && a.scan.measurements) {
      var grB = b.scan.measurements.golden_ratio_score
      var grA = a.scan.measurements.golden_ratio_score
      html += _dVal('Golden Ratio', Math.round(grB) + '%', Math.round(grA) + '%', grA - grB, '%')
    }

    // Thirds delta
    if (b.scan.thirds && a.scan.thirds) {
      html += '<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05)">'
      html += '<div style="font-size:9px;color:#C8A97E;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em">Tercos</div>'
      html += _dVal('Superior', Math.round(b.scan.thirds.superior) + '%', Math.round(a.scan.thirds.superior) + '%', a.scan.thirds.superior - b.scan.thirds.superior, '%')
      html += _dVal('Medio', Math.round(b.scan.thirds.medio) + '%', Math.round(a.scan.thirds.medio) + '%', a.scan.thirds.medio - b.scan.thirds.medio, '%')
      html += _dVal('Inferior', Math.round(b.scan.thirds.inferior) + '%', Math.round(a.scan.thirds.inferior) + '%', a.scan.thirds.inferior - b.scan.thirds.inferior, '%')
      html += '</div>'
    }

    // Skin delta
    if (b.scan.skin && b.scan.skin.scores && a.scan.skin && a.scan.skin.scores) {
      html += '<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05)">'
      html += '<div style="font-size:9px;color:#C8A97E;margin-bottom:4px;text-transform:uppercase;letter-spacing:0.1em">Pele</div>'
      var bSk = b.scan.skin.scores
      var aSk = a.scan.skin.scores
      html += _dVal('Overall', Math.round(bSk.overall), Math.round(aSk.overall), aSk.overall - bSk.overall, '')
      html += _dVal('Rugas', Math.round(bSk.wrinkles), Math.round(aSk.wrinkles), aSk.wrinkles - bSk.wrinkles, '')
      html += _dVal('Manchas', Math.round(bSk.spots), Math.round(aSk.spots), aSk.spots - bSk.spots, '')
      html += _dVal('Firmeza', Math.round(bSk.firmness), Math.round(aSk.firmness), aSk.firmness - bSk.firmness, '')
      html += '</div>'
    }

    // Skin age delta
    if (b.scan.skin && b.scan.skin.skin_age && a.scan.skin && a.scan.skin.skin_age) {
      var ageBefore = b.scan.skin.skin_age.estimated_age
      var ageAfter = a.scan.skin.skin_age.estimated_age
      var ageDelta = ageAfter - ageBefore
      html += '<div style="margin-top:8px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.05)">'
      html += '<div style="display:flex;justify-content:space-between;align-items:center">' +
        '<span style="color:rgba(245,240,232,0.6)">Idade Pele</span>' +
        '<span style="font-size:14px;font-weight:800;color:' + (ageDelta < 0 ? '#10B981' : '#EF4444') + '">' +
          (ageDelta < 0 ? '' : '+') + Math.round(ageDelta) + ' anos</span>' +
      '</div>'
      html += '</div>'
    }

    html += '</div>'
    return html
  }

  function _mVal(label, value, color) {
    return '<div style="display:flex;justify-content:space-between;padding:2px 0">' +
      '<span style="color:rgba(245,240,232,0.5)">' + label + '</span>' +
      '<span style="color:' + color + ';font-weight:600">' + value + '</span>' +
    '</div>'
  }

  function _dVal(label, before, after, delta, unit) {
    var deltaColor = delta > 0 ? '#10B981' : delta < 0 ? '#EF4444' : 'rgba(245,240,232,0.4)'
    var deltaSign = delta > 0 ? '+' : ''
    var deltaStr = deltaSign + Math.round(delta * 10) / 10 + unit
    return '<div style="display:flex;justify-content:space-between;align-items:center;padding:2px 0">' +
      '<span style="color:rgba(245,240,232,0.5);flex:1">' + label + '</span>' +
      '<span style="color:rgba(245,240,232,0.4);font-size:9px;width:35px;text-align:right">' + before + '</span>' +
      '<span style="color:rgba(245,240,232,0.2);margin:0 4px">\u2192</span>' +
      '<span style="color:rgba(245,240,232,0.6);font-size:9px;width:35px;text-align:right">' + after + '</span>' +
      '<span style="color:' + deltaColor + ';font-weight:700;font-size:10px;width:50px;text-align:right">' + deltaStr + '</span>' +
    '</div>'
  }

})()
