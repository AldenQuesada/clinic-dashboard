/**
 * fm-history.js — Session history, notes per zone, share via link
 */
;(function () {
  'use strict'

  var FM = window._FM

  // ── Notes per zone ────────────────────────────────────────

  FM._setNote = function (annotationId, note) {
    var ann = FM._annotations.find(function (a) { return a.id === annotationId })
    if (ann) {
      ann.notes = note
      FM._autoSave()
    }
  }

  FM._showNoteEditor = function (annotationId) {
    var ann = FM._annotations.find(function (a) { return a.id === annotationId })
    if (!ann) return
    var z = FM.ZONES.find(function (zz) { return zz.id === ann.zone })

    var overlay = document.createElement('div')
    overlay.className = 'fm-export-overlay'
    overlay.id = 'fmNoteOverlay'
    overlay.innerHTML =
      '<div style="background:#2C2C2C;border-radius:14px;width:400px;box-shadow:0 24px 80px rgba(0,0,0,0.5);overflow:hidden">' +
        '<div style="padding:14px 20px;border-bottom:1px solid rgba(200,169,126,0.15);display:flex;justify-content:space-between;align-items:center">' +
          '<span style="font-size:14px;font-weight:600;color:#F5F0E8">Nota — ' + (z ? z.label : ann.zone) + '</span>' +
          '<button onclick="document.getElementById(\'fmNoteOverlay\').remove()" style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;cursor:pointer;color:#C8A97E;display:flex;align-items:center;justify-content:center">' +
            '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
        '</div>' +
        '<div style="padding:16px 20px">' +
          '<textarea id="fmNoteText" style="width:100%;height:100px;background:rgba(255,255,255,0.05);border:1px solid rgba(200,169,126,0.2);border-radius:8px;padding:10px;color:#F5F0E8;font-size:13px;font-family:Montserrat,sans-serif;resize:vertical">' + FM._esc(ann.notes || '') + '</textarea>' +
          '<button onclick="FaceMapping._saveNote(' + annotationId + ')" style="width:100%;margin-top:10px;padding:10px;border:none;border-radius:10px;background:#C8A97E;color:#fff;font-size:14px;font-weight:600;cursor:pointer">Salvar Nota</button>' +
        '</div>' +
      '</div>'
    document.body.appendChild(overlay)
    document.getElementById('fmNoteText').focus()
  }

  FM._saveNote = function (annotationId) {
    var text = document.getElementById('fmNoteText')
    if (text) FM._setNote(annotationId, text.value)
    var overlay = document.getElementById('fmNoteOverlay')
    if (overlay) overlay.remove()
    FM._showToast('Nota salva', 'success')
  }

  // ── Session History ───────────────────────────────────────

  FM._showHistory = function () {
    if (!FM._lead) { FM._showToast('Selecione um paciente primeiro.', 'warn'); return }
    var leadId = FM._lead.id || FM._lead.lead_id

    // Try Supabase first, fallback to localStorage
    var sb = window._sbShared

    FM._showLoading('Carregando historico...')

    // Collect from both sources
    var supabaseSession = null
    var localSessions = []

    try {
      var key = 'fm_sessions_' + leadId
      localSessions = JSON.parse(localStorage.getItem(key) || '[]')
    } catch (e) { /* ignore */ }

    if (!sb) {
      FM._hideLoading()
      if (localSessions.length > 0) {
        _renderHistoryList(localSessions, null)
      } else {
        FM._showToast('Nenhum historico encontrado.', 'warn')
      }
      return
    }

    sb.rpc('get_facial_session', { p_lead_id: leadId })
      .then(function (res) {
        FM._hideLoading()
        supabaseSession = (res.data && res.data.found) ? res.data : null
        _renderHistoryList(localSessions, supabaseSession)
      })
      .catch(function () {
        FM._hideLoading()
        _renderHistoryList(localSessions, null)
      })
  }

  function _renderHistoryList(localSessions, supabaseData) {
    var overlay = document.createElement('div')
    overlay.className = 'fm-export-overlay'
    overlay.id = 'fmHistoryOverlay'

    var html = '<div style="background:#2C2C2C;border-radius:14px;width:600px;max-height:85vh;overflow-y:auto;box-shadow:0 24px 80px rgba(0,0,0,0.5)">' +
      '<div style="padding:14px 20px;border-bottom:1px solid rgba(200,169,126,0.15);display:flex;justify-content:space-between;align-items:center;position:sticky;top:0;background:#2C2C2C;z-index:1">' +
        '<span style="font-size:15px;font-weight:600;color:#F5F0E8">Historico de Sessoes</span>' +
        '<button onclick="document.getElementById(\'fmHistoryOverlay\').remove()" style="width:28px;height:28px;border-radius:50%;background:rgba(255,255,255,0.08);border:none;cursor:pointer;color:#C8A97E;display:flex;align-items:center;justify-content:center">' +
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>' +
      '</div>' +
      '<div style="padding:16px 20px">'

    // Supabase session (cloud)
    if (supabaseData) {
      var sd = supabaseData.session_data || {}
      var gpt = supabaseData.gpt_analysis || null
      html += '<div style="margin-bottom:16px;padding:14px;background:rgba(200,169,126,0.06);border-radius:10px;border:1px solid rgba(200,169,126,0.15)">'
      html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px">'
      html += '<div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8A97E">Sessao Salva (Nuvem)</div>'
      html += '<button onclick="FaceMapping._restoreFromHistory(\'supabase\')" style="padding:5px 12px;border:1px solid #C8A97E;border-radius:6px;background:none;color:#C8A97E;font-size:11px;cursor:pointer;font-weight:600">Restaurar</button>'
      html += '</div>'
      if (gpt) {
        html += '<div style="font-size:12px;color:rgba(245,240,232,0.7);line-height:1.5;margin-bottom:8px">' + FM._esc(gpt.overall_assessment || '') + '</div>'
      }
      html += _renderSessionAnns(sd)
      if (sd.session_date) html += '<div style="font-size:11px;color:rgba(245,240,232,0.3);margin-top:8px">Data: ' + sd.session_date + '</div>'
      html += '</div>'
    }

    // Local sessions
    if (localSessions.length > 0) {
      html += '<div style="font-size:11px;letter-spacing:0.1em;text-transform:uppercase;color:#C8A97E;margin-bottom:10px">Sessoes Locais (' + localSessions.length + ')</div>'
      // Show most recent 5
      var recent = localSessions.slice(-5).reverse()
      recent.forEach(function (s, i) {
        var idx = localSessions.length - 1 - i
        html += '<div style="margin-bottom:10px;padding:12px;background:rgba(255,255,255,0.03);border-radius:8px;border:1px solid rgba(255,255,255,0.06)">'
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
        html += '<span style="font-size:12px;color:#F5F0E8;font-weight:600">' + (s.session_date || 'Sem data') + '</span>'
        html += '<button onclick="FaceMapping._restoreFromHistory(\'local\',' + idx + ')" style="padding:4px 10px;border:1px solid rgba(200,169,126,0.3);border-radius:5px;background:none;color:#C8A97E;font-size:10px;cursor:pointer">Restaurar</button>'
        html += '</div>'
        html += _renderSessionAnns(s)
        html += '</div>'
      })
    }

    if (!supabaseData && localSessions.length === 0) {
      html += '<div style="text-align:center;padding:24px;color:rgba(245,240,232,0.3);font-size:13px">Nenhuma sessao anterior encontrada.</div>'
    }

    html += '</div></div>'
    overlay.innerHTML = html
    document.body.appendChild(overlay)

    // Cache for restore
    FM._historyCache = { local: localSessions, supabase: supabaseData }
  }

  function _renderSessionAnns(session) {
    var anns = session.annotations || []
    if (anns.length === 0) return '<div style="font-size:11px;color:rgba(245,240,232,0.3)">Sem marcacoes</div>'
    var html = ''
    anns.forEach(function (a) {
      var z = FM.ZONES.find(function (zz) { return zz.id === a.zone })
      html += '<div style="display:inline-flex;align-items:center;gap:4px;padding:2px 8px;margin:2px;background:rgba(255,255,255,0.05);border-radius:4px;font-size:11px">' +
        '<span style="width:7px;height:7px;border-radius:50%;background:' + (z ? z.color : '#999') + '"></span>' +
        '<span style="color:#F5F0E8">' + (z ? z.label : a.zone) + '</span>' +
        '<span style="color:#C8A97E">' + (a.ml || '') + (z ? z.unit : 'mL') + '</span>' +
      '</div>'
    })
    return html
  }

  // ── Restore from history ──────────────────────────────────
  FM._restoreFromHistory = function (source, index) {
    if (!FM._historyCache) return
    var session = null

    if (source === 'supabase' && FM._historyCache.supabase) {
      session = FM._historyCache.supabase.session_data
    } else if (source === 'local' && FM._historyCache.local[index]) {
      session = FM._historyCache.local[index]
    }

    if (!session) { FM._showToast('Sessao nao encontrada.', 'error'); return }
    if (!confirm('Restaurar esta sessao? As marcacoes atuais serao substituidas.')) return

    // Restore annotations
    FM._annotations = session.annotations || []
    FM._nextId = FM._annotations.reduce(function (max, a) { return Math.max(max, a.id || 0) }, 0) + 1

    // Restore angle state if present
    if (session.stateByAngle) {
      Object.keys(session.stateByAngle).forEach(function (ang) {
        FM._angleStore[ang] = session.stateByAngle[ang]
      })
    }

    FM._autoSave()
    FM._render()
    setTimeout(FM._initCanvas, 50)

    var overlay = document.getElementById('fmHistoryOverlay')
    if (overlay) overlay.remove()
    FM._showToast('Sessao restaurada com sucesso', 'success')
  }

  // ── Share via Link ────────────────────────────────────────

  FM._shareReport = function () {
    // Generate a data URL from the report card and encode as URL parameter
    var report = document.getElementById('fmReportCard')
    if (!report) { FM._showToast('Gere o report primeiro (Exportar).', 'warn'); return }

    FM._showLoading('Gerando link...')

    if (window.html2canvas) {
      window.html2canvas(report, { backgroundColor: '#2C2C2C', scale: 1.5, useCORS: true })
        .then(function (canvas) {
          FM._hideLoading()
          var dataUrl = canvas.toDataURL('image/jpeg', 0.8)

          // Copy to clipboard as image (modern browsers)
          canvas.toBlob(function (blob) {
            try {
              navigator.clipboard.write([
                new ClipboardItem({ 'image/png': blob })
              ]).then(function () {
                FM._showToast('Report copiado! Cole no WhatsApp ou email.', 'success')
              }).catch(function () {
                // Fallback: download
                var link = document.createElement('a')
                link.download = 'report-facial.png'
                link.href = canvas.toDataURL('image/png')
                link.click()
                FM._showToast('Report baixado para compartilhar.', 'success')
              })
            } catch (e) {
              var link = document.createElement('a')
              link.download = 'report-facial.png'
              link.href = canvas.toDataURL('image/png')
              link.click()
              FM._showToast('Report baixado para compartilhar.', 'success')
            }
          })
        })
        .catch(function () { FM._hideLoading() })
    } else {
      FM._hideLoading()
      FM._showToast('Exporte como PNG e compartilhe manualmente.', 'warn')
    }
  }

})()
