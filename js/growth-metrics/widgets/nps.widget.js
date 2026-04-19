/**
 * VpiNpsWidget — correlação entre NPS e volume de indicações por parceira.
 * Consome GrowthMetricsRepository.npsCorr(180) → RPC vpi_nps_indication_correlation.
 * Se nps_table_missing ou sem dados, mostra aviso.
 */
;(function () {
  'use strict'
  if (window.VpiNpsWidget) return

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _header() {
    return '' +
      '<div class="gm-widget-title">Correlação NPS × Indicações</div>' +
      '<div class="gm-widget-sub">Últimos 180 dias</div>'
  }

  function _renderLoading(host) {
    host.innerHTML = _header() +
      '<div class="gm-widget-loading">Carregando…</div>'
  }

  function _renderError(host, msg) {
    host.innerHTML = _header() +
      '<div class="gm-widget-err">Falha ao carregar NPS: ' + _esc(msg || 'erro desconhecido') + '</div>'
  }

  function _num(v) {
    var n = Number(v)
    return isNaN(n) ? 0 : n
  }

  function _fmtAvg(v) {
    var n = Number(v)
    if (isNaN(n)) return '0'
    return (Math.round(n * 10) / 10).toString().replace('.', ',')
  }

  function _renderData(host, data) {
    var payload = data || {}

    // Resposta de erro estruturada
    if (payload.error === 'nps_table_missing') {
      host.innerHTML = _header() +
        '<div class="gm-empty">NPS ainda não coletado. Aparece aqui após 30d de coleta.</div>'
      return
    }

    var promoters = payload.promoters || {}
    var passives = payload.passives || {}
    var detractors = payload.detractors || {}

    var pN = _num(promoters.count || promoters.partners)
    var sN = _num(passives.count || passives.partners)
    var dN = _num(detractors.count || detractors.partners)
    var pAvg = promoters.avg_indications != null ? promoters.avg_indications : promoters.avg
    var sAvg = passives.avg_indications != null ? passives.avg_indications : passives.avg
    var dAvg = detractors.avg_indications != null ? detractors.avg_indications : detractors.avg

    if (pN === 0 && sN === 0 && dN === 0) {
      host.innerHTML = _header() +
        '<div class="gm-empty">NPS ainda não coletado. Aparece aqui após 30d de coleta.</div>'
      return
    }

    var grid = '' +
      '<div class="gm-kpi-grid">' +
        '<div class="gm-kpi">' +
          '<div class="gm-kpi-label">Promotores</div>' +
          '<div class="gm-kpi-value">' + _esc(pN) + '</div>' +
          '<div class="gm-kpi-sub">parceira' + (pN === 1 ? '' : 's') +
            ' · média ' + _esc(_fmtAvg(pAvg)) + ' indicaç' +
            (_num(pAvg) === 1 ? 'ão' : 'ões') + '</div>' +
        '</div>' +
        '<div class="gm-kpi">' +
          '<div class="gm-kpi-label">Passivos</div>' +
          '<div class="gm-kpi-value">' + _esc(sN) + '</div>' +
          '<div class="gm-kpi-sub">parceira' + (sN === 1 ? '' : 's') +
            ' · média ' + _esc(_fmtAvg(sAvg)) + ' indicaç' +
            (_num(sAvg) === 1 ? 'ão' : 'ões') + '</div>' +
        '</div>' +
        '<div class="gm-kpi">' +
          '<div class="gm-kpi-label">Detratores</div>' +
          '<div class="gm-kpi-value">' + _esc(dN) + '</div>' +
          '<div class="gm-kpi-sub">parceira' + (dN === 1 ? '' : 's') +
            ' · média ' + _esc(_fmtAvg(dAvg)) + ' indicaç' +
            (_num(dAvg) === 1 ? 'ão' : 'ões') + '</div>' +
        '</div>' +
      '</div>'

    var note = ''
    if (payload.correlation_note) {
      note = '<div class="gm-widget-sub" style="margin-top:10px">' +
        _esc(payload.correlation_note) + '</div>'
    }

    host.innerHTML = _header() + grid + note
  }

  async function mount(hostId) {
    var host = document.getElementById(hostId)
    if (!host) return
    _renderLoading(host)
    try {
      if (!window.GrowthMetricsRepository) throw new Error('GrowthMetricsRepository ausente')
      var data = await window.GrowthMetricsRepository.npsCorr(180)
      _renderData(host, data)
    } catch (err) {
      _renderError(host, err && err.message)
    }
  }

  window.VpiNpsWidget = Object.freeze({ mount: mount })
})()
