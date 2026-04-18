/**
 * ClinicAI — B2B Health Trend Panel (Fraqueza #9)
 *
 * Painel inline no detalhe: tendência de health nos últimos 90d.
 *   - Atual (verde/amarelo/vermelho/unknown)
 *   - Primeiro valor na janela
 *   - Trend: improving / stable / worsening
 *   - Mini série de pontos na timeline (últimas mudanças)
 *
 * Consome: B2BHealthTrendRepository.
 * Expõe window.B2BTrendPanel.
 */
;(function () {
  'use strict'
  if (window.B2BTrendPanel) return

  var COLORS = { green:'#10B981', yellow:'#F59E0B', red:'#EF4444', unknown:'#64748B' }
  var LABELS = { green:'Verde', yellow:'Amarelo', red:'Vermelho', unknown:'Sem dado' }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _fmtDate(iso) {
    try { return new Date(iso).toLocaleDateString('pt-BR', { day:'2-digit', month:'2-digit' }) }
    catch (_) { return '' }
  }

  function _trendBadge(trend) {
    var map = {
      improving: { lbl:'Melhorando', bg:'#10B981', glyph:'▲' },
      stable:    { lbl:'Estável',    bg:'#64748B', glyph:'■' },
      worsening: { lbl:'Piorando',   bg:'#EF4444', glyph:'▼' },
    }
    var m = map[trend] || map.stable
    return '<span class="b2b-trend-badge" style="background:' + m.bg + '">' +
      '<span class="b2b-trend-glyph">' + m.glyph + '</span> ' + m.lbl + '</span>'
  }

  function _dot(color, when) {
    return '<div class="b2b-trend-dot" title="' + _esc(LABELS[color] || color) +
      ' · ' + _esc(_fmtDate(when)) + '" style="background:' + (COLORS[color] || COLORS.unknown) + '"></div>'
  }

  async function mount(hostId, partnershipId) {
    var host = document.getElementById(hostId)
    if (!host || !partnershipId) return
    if (!window.B2BHealthTrendRepository) return
    host.innerHTML = '<div class="b2b-trend-panel b2b-trend-loading">Calculando tendência…</div>'

    try {
      var d = await window.B2BHealthTrendRepository.byPartnership(partnershipId, 90)
      if (!d || !d.ok) { host.innerHTML = ''; return }

      var history = Array.isArray(d.history) ? d.history : []
      var dots = history.length
        ? history.map(function (h) { return _dot(h.color, h.at) }).join('')
        : '<span class="b2b-trend-empty">sem mudanças registradas na janela</span>'

      host.innerHTML =
        '<div class="b2b-trend-panel">' +
          '<div class="b2b-sec-title">Tendência de saúde · 90 dias</div>' +
          '<div class="b2b-trend-row">' +
            '<div class="b2b-trend-cell"><span class="b2b-trend-lbl">Atual</span>' +
              '<div class="b2b-trend-chip" style="background:' + (COLORS[d.current] || COLORS.unknown) + '">' +
                _esc(LABELS[d.current] || '—') + '</div></div>' +
            '<div class="b2b-trend-cell"><span class="b2b-trend-lbl">Início janela</span>' +
              '<div class="b2b-trend-chip" style="background:' + (COLORS[d.first_in_window || d.current] || COLORS.unknown) + '">' +
                _esc(LABELS[d.first_in_window || d.current] || '—') + '</div></div>' +
            '<div class="b2b-trend-cell"><span class="b2b-trend-lbl">Tendência</span>' + _trendBadge(d.trend) + '</div>' +
            '<div class="b2b-trend-cell"><span class="b2b-trend-lbl">Mudanças</span>' +
              '<strong>' + (d.changes || 0) + '</strong>' +
              '<span class="b2b-trend-sub">' + (d.green_changes || 0) + ' verdes · ' + (d.red_changes || 0) + ' vermelhas</span>' +
            '</div>' +
          '</div>' +
          '<div class="b2b-trend-series">' + dots + '</div>' +
        '</div>'
    } catch (e) {
      host.innerHTML = '<div class="b2b-empty b2b-empty-err">Tendência indisponível: ' + _esc(e.message) + '</div>'
    }
  }

  window.B2BTrendPanel = Object.freeze({ mount: mount })
})()
