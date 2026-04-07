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

    // Load from Supabase
    var sb = window._sbShared
    if (!sb) { FM._showToast('Supabase nao disponivel.', 'warn'); return }

    FM._showLoading('Carregando historico...')
    sb.rpc('get_facial_session', { p_lead_id: leadId })
      .then(function (res) {
        FM._hideLoading()
        if (res.data && res.data.found) {
          _renderHistory(res.data)
        } else {
          FM._showToast('Nenhuma sessao anterior encontrada.', 'warn')
        }
      })
      .catch(function () {
        FM._hideLoading()
        // Try localStorage
        var key = 'fm_sessions_' + leadId
        try {
          var sessions = JSON.parse(localStorage.getItem(key) || '[]')
          if (sessions.length > 0) {
            _renderHistory({ session_data: sessions[sessions.length - 1] })
          } else {
            FM._showToast('Nenhum historico encontrado.', 'warn')
          }
        } catch (e) { FM._showToast('Erro ao carregar historico.', 'error') }
      })
  }

  function _renderHistory(data) {
    var session = data.session_data || {}
    var gpt = data.gpt_analysis || null
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

    if (gpt) {
      html += '<div style="margin-bottom:16px;padding:12px;background:rgba(200,169,126,0.08);border-radius:8px;border:1px solid rgba(200,169,126,0.15)">' +
        '<div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#C8A97E;margin-bottom:6px">Analise IA</div>' +
        '<div style="font-size:12px;color:rgba(245,240,232,0.7);line-height:1.6">' + FM._esc(gpt.overall_assessment || '') + '</div>' +
      '</div>'
    }

    var anns = session.annotations || []
    if (anns.length > 0) {
      html += '<div style="font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#C8A97E;margin-bottom:8px">' + anns.length + ' Zonas Marcadas</div>'
      anns.forEach(function (a) {
        var z = FM.ZONES.find(function (zz) { return zz.id === a.zone })
        html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(255,255,255,0.05)">' +
          '<span style="width:10px;height:10px;border-radius:50%;background:' + (z ? z.color : '#999') + ';flex-shrink:0"></span>' +
          '<span style="font-size:12px;color:#F5F0E8;font-weight:600;flex:1">' + (z ? z.label : a.zone) + '</span>' +
          '<span style="font-size:11px;color:#C8A97E">' + a.ml + (z ? z.unit : 'mL') + '</span>' +
        '</div>'
      })
    }

    if (session.session_date) {
      html += '<div style="margin-top:16px;font-size:11px;color:rgba(245,240,232,0.3)">Sessao: ' + session.session_date + '</div>'
    }

    html += '</div></div>'
    overlay.innerHTML = html
    document.body.appendChild(overlay)
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
