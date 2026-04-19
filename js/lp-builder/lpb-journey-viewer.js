/**
 * LP Builder · Journey Viewer (Onda 24)
 *
 * Modal admin: tabela de paths mais comuns + funil agregado.
 * Não decide nada — só lê via RPC e exibe.
 *
 * API: LPBJourneyViewer.open()
 */
;(function () {
  'use strict'
  if (window.LPBJourneyViewer) return

  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }
  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }

  async function open() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    var paths = []
    try {
      var r = await LPBuilder.rpc('lp_journey_paths', { p_limit: 100 })
      paths = Array.isArray(r) ? r : []
    } catch (err) {
      LPBToast && LPBToast('Erro ao carregar jornadas: ' + err.message, 'error')
      return
    }

    // Stats top-level
    var totalEvents = paths.reduce(function (s, p) { return s + (p.count || 0) }, 0)
    var landingsDirect = paths.filter(function (p) { return !p.from_slug })
    var crossNav = paths.filter(function (p) { return !!p.from_slug })
    var directCount = landingsDirect.reduce(function (s, p) { return s + p.count }, 0)
    var crossCount  = crossNav.reduce(function (s, p) { return s + p.count }, 0)

    var rows = paths.length
      ? '<table style="width:100%;border-collapse:collapse;font-size:11px">' +
          '<thead><tr style="background:var(--lpb-bg);text-align:left">' +
            '<th style="padding:10px 14px;border-bottom:1px solid var(--lpb-border);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--lpb-text-2)">Origem</th>' +
            '<th style="padding:10px 14px;border-bottom:1px solid var(--lpb-border);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--lpb-text-2)">Destino</th>' +
            '<th style="padding:10px 14px;border-bottom:1px solid var(--lpb-border);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--lpb-text-2);text-align:right">Visitas</th>' +
            '<th style="padding:10px 14px;border-bottom:1px solid var(--lpb-border);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--lpb-text-2)">Última</th>' +
          '</tr></thead><tbody>' +
          paths.map(_renderRow).join('') +
        '</tbody></table>'
      : '<div style="padding:32px;text-align:center;color:var(--lpb-text-2);font-size:12px">' +
          _ico('git-branch', 22) +
          '<div style="margin-top:10px">Nenhuma jornada registrada ainda.</div>' +
          '<div style="font-size:10px;margin-top:4px">Eventos aparecem aqui após visitas em LPs publicadas.</div>' +
        '</div>'

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbJrBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:880px;width:96vw;max-height:92vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Jornada · paths cross-LP <small style="font-weight:400;color:var(--lpb-text-2);margin-left:8px;font-size:11px">últimos 90 dias</small></h3>' +
            '<button class="lpb-btn-icon" id="lpbJrClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:14px 22px;background:var(--lpb-bg);border-bottom:1px solid var(--lpb-border)">' +
            _stat(totalEvents, 'eventos totais') +
            _stat(directCount, 'entradas diretas') +
            _stat(crossCount,  'navegações entre LPs') +
          '</div>' +
          '<div class="lpb-modal-body" style="padding:0;overflow:auto;flex:1">' + rows + '</div>' +
          '<div class="lpb-modal-footer">' +
            '<div style="font-size:10px;color:var(--lpb-text-2);line-height:1.4">' +
              _ico('info', 11) + ' Visitor_id estável por 30 dias (localStorage). Respeita LGPD.' +
            '</div>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn ghost" id="lpbJrDone">Fechar</button>' +
          '</div>' +
        '</div></div>'

    document.getElementById('lpbJrBg').addEventListener('click', _dismiss)
    document.getElementById('lpbJrClose').onclick = _dismiss
    document.getElementById('lpbJrDone').onclick  = _dismiss
  }

  function _renderRow(p) {
    var from = p.from_slug
      ? '<code style="font-size:10px;color:var(--lpb-text-2)">/' + _esc(p.from_slug) + '</code>'
      : '<span style="font-size:10px;color:var(--lpb-text-2);font-style:italic">direto</span>'
    var when = '—'
    try { when = new Date(p.last_at).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' }) } catch (_) {}
    return '<tr>' +
      '<td style="padding:10px 14px;border-bottom:1px solid var(--lpb-border)">' + from + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid var(--lpb-border)">' + _ico('arrow-right', 11) + ' <code style="font-size:10px;color:var(--lpb-accent)">/' + _esc(p.to_slug) + '</code></td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid var(--lpb-border);text-align:right;font-weight:500">' + (p.count || 0) + '</td>' +
      '<td style="padding:10px 14px;border-bottom:1px solid var(--lpb-border);font-size:10px;color:var(--lpb-text-2)">' + _esc(when) + '</td>' +
    '</tr>'
  }

  function _stat(n, label) {
    return '<div style="text-align:center;background:var(--lpb-surface);border:1px solid var(--lpb-border);padding:10px">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:22px;font-weight:400;color:var(--lpb-text);line-height:1">' + (n || 0) + '</div>' +
      '<div style="font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--lpb-text-2);margin-top:4px">' + _esc(label) + '</div>' +
    '</div>'
  }

  function _dismiss() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (modalRoot) modalRoot.innerHTML = ''
  }

  window.LPBJourneyViewer = Object.freeze({ open: open })
})()
