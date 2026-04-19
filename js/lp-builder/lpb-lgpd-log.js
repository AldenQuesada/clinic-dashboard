/**
 * LP Builder · LGPD Consent Log Viewer (Onda 21)
 *
 * Modal admin que lista consentimentos capturados (lp_consents). Pra audit
 * jurídico em caso de questionamento ANPD.
 *
 * API:
 *   LPBLgpdLog.open(slug)   // slug opcional (filtra por LP)
 *   LPBLgpdLog.openAll()    // todas as LPs
 */
;(function () {
  'use strict'
  if (window.LPBLgpdLog) return

  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }
  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }

  function _fmtDate(s) {
    if (!s) return '—'
    try {
      var d = new Date(s)
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
        + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
    } catch (_) { return s }
  }

  function _consentChips(c) {
    if (!c || typeof c !== 'object') return '—'
    var chips = []
    if (c.necessary) chips.push(_chip('necessary', 'essenciais', 'var(--lpb-text-2)'))
    if (c.analytics) chips.push(_chip('analytics', 'analytics', 'var(--lpb-success)'))
    else            chips.push(_chip('analytics', 'analytics', 'var(--lpb-danger)', true))
    if (c.marketing) chips.push(_chip('marketing', 'marketing', 'var(--lpb-success)'))
    else            chips.push(_chip('marketing', 'marketing', 'var(--lpb-danger)', true))
    return chips.join(' ')
  }

  function _chip(k, label, color, neg) {
    var bg = neg ? 'transparent' : color
    var border = color
    var text = neg ? color : '#fff'
    var txt = (neg ? '✕ ' : '✓ ') + label
    return '<span style="display:inline-block;padding:2px 8px;font-size:9px;letter-spacing:.06em;text-transform:uppercase;background:' + bg + ';color:' + text + ';border:1px solid ' + border + ';margin-right:3px">' + _esc(txt) + '</span>'
  }

  async function open(slug) {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    var rows = []
    try {
      var r = await LPBuilder.rpc('lp_consent_list', { p_slug: slug || null, p_limit: 200 })
      rows = Array.isArray(r) ? r : []
    } catch (err) {
      LPBToast && LPBToast('Erro ao carregar log: ' + err.message, 'error')
      return
    }

    // counters por categoria
    var totals = { total: rows.length, analytics: 0, marketing: 0, both_denied: 0 }
    rows.forEach(function (r) {
      var c = r.consents || {}
      if (c.analytics) totals.analytics++
      if (c.marketing) totals.marketing++
      if (!c.analytics && !c.marketing) totals.both_denied++
    })

    var listHtml = rows.length
      ? '<table style="width:100%;border-collapse:collapse;font-size:11px">' +
          '<thead><tr style="background:var(--lpb-bg);text-align:left">' +
            _th('Data') + _th('LP') + _th('Consentimentos') + _th('Pseudo-ID') + _th('Origem') +
          '</tr></thead><tbody>' +
          rows.map(_renderRow).join('') +
        '</tbody></table>'
      : '<div style="padding:30px;text-align:center;color:var(--lpb-text-2);font-size:12px">' +
          _ico('shield', 22) +
          '<div style="margin-top:10px">Nenhum consentimento registrado ainda.</div>' +
          '<div style="font-size:10px;margin-top:4px">Logs aparecem aqui após primeira interação com banner em LP publicada.</div>' +
        '</div>'

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbLgLogBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:1080px;width:96vw;max-height:92vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Log de consentimentos LGPD' + (slug ? ' · /' + _esc(slug) : ' · todas as LPs') + '</h3>' +
            '<button class="lpb-btn-icon" id="lpbLgLogClose">' + _ico('x', 16) + '</button>' +
          '</div>' +

          '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;padding:14px 22px;background:var(--lpb-bg);border-bottom:1px solid var(--lpb-border)">' +
            _stat(totals.total,        'total registrados') +
            _stat(totals.analytics,    'aceitaram analytics') +
            _stat(totals.marketing,    'aceitaram marketing') +
            _stat(totals.both_denied,  'recusaram opcionais') +
          '</div>' +

          '<div class="lpb-modal-body" style="padding:0;overflow:auto;flex:1">' + listHtml + '</div>' +

          '<div class="lpb-modal-footer">' +
            '<div style="font-size:10px;color:var(--lpb-text-2);line-height:1.4">' +
              _ico('info', 11) + ' Pseudo-ID = hash de UA + resolução. Não armazenamos IP real (privacy-first).' +
            '</div>' +
            '<div style="flex:1"></div>' +
            (rows.length ? '<button class="lpb-btn ghost" id="lpbLgLogCsv">' + _ico('download', 12) + ' Exportar CSV</button>' : '') +
            '<button class="lpb-btn ghost" id="lpbLgLogDone">Fechar</button>' +
          '</div>' +
        '</div></div>'

    document.getElementById('lpbLgLogBg').addEventListener('click', _dismiss)
    document.getElementById('lpbLgLogClose').onclick = _dismiss
    document.getElementById('lpbLgLogDone').onclick  = _dismiss
    var csvBtn = document.getElementById('lpbLgLogCsv')
    if (csvBtn) csvBtn.onclick = function () { _exportCsv(rows) }
  }

  function openAll() { return open(null) }

  function _th(t) {
    return '<th style="padding:10px 14px;border-bottom:1px solid var(--lpb-border);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--lpb-text-2);font-weight:500">' + _esc(t) + '</th>'
  }
  function _td(html) {
    return '<td style="padding:10px 14px;border-bottom:1px solid var(--lpb-border);vertical-align:top">' + html + '</td>'
  }

  function _renderRow(r) {
    var refer = r.referrer ? '<small style="color:var(--lpb-text-2);font-size:10px">' + _esc((r.referrer || '').slice(0, 60)) + '</small>' : '<small style="color:var(--lpb-text-2);font-size:10px">direto</small>'
    return '<tr>' +
      _td(_fmtDate(r.created_at)) +
      _td('<code style="font-size:10px;color:var(--lpb-accent)">/' + _esc(r.page_slug) + '</code>') +
      _td(_consentChips(r.consents)) +
      _td('<code style="font-size:10px;color:var(--lpb-text-2)">' + _esc(r.ip_hash || '—') + '</code>') +
      _td(refer) +
    '</tr>'
  }

  function _stat(n, label) {
    return '<div style="text-align:center;background:var(--lpb-surface);border:1px solid var(--lpb-border);padding:10px">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:22px;font-weight:400;color:var(--lpb-text);line-height:1">' + (n || 0) + '</div>' +
      '<div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--lpb-text-2);margin-top:4px">' + _esc(label) + '</div>' +
    '</div>'
  }

  function _exportCsv(rows) {
    var header = ['data', 'lp_slug', 'necessary', 'analytics', 'marketing', 'pseudo_id', 'referrer', 'user_agent']
    var lines = [header.join(',')]
    rows.forEach(function (r) {
      var c = r.consents || {}
      var fields = [
        r.created_at,
        r.page_slug,
        c.necessary ? '1' : '0',
        c.analytics ? '1' : '0',
        c.marketing ? '1' : '0',
        r.ip_hash || '',
        '"' + (r.referrer || '').replace(/"/g, '""') + '"',
        '"' + (r.user_agent || '').replace(/"/g, '""') + '"',
      ]
      lines.push(fields.join(','))
    })
    var blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
    var url  = URL.createObjectURL(blob)
    var a    = document.createElement('a')
    a.href   = url
    a.download = 'lgpd-consents-' + new Date().toISOString().slice(0, 10) + '.csv'
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(function () { URL.revokeObjectURL(url) }, 200)
  }

  function _dismiss() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (modalRoot) modalRoot.innerHTML = ''
  }

  window.LPBLgpdLog = Object.freeze({ open: open, openAll: openAll })
})()
