/**
 * GrowthMetricsRepository — consome RPCs das migrations 386 + 387.
 * IIFE puro. Zero DOM.
 */
;(function () {
  'use strict'
  if (window.GrowthMetricsRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  window.GrowthMetricsRepository = Object.freeze({
    funnel:      function (days, partnerId) { return _rpc('vpi_funnel_breakdown', { p_days: days || 30, p_partner_id: partnerId || null }) },
    timeseries:  function (bucket, periods, partnerId) { return _rpc('vpi_timeseries', { p_bucket: bucket || 'month', p_periods: periods || 12, p_partner_id: partnerId || null }) },
    cohort:      function (months) { return _rpc('vpi_cohort_retention',         { p_months: months || 6 }) },
    quality:     function (days) { return _rpc('vpi_partner_quality',            { p_days: days || 90 }) },
    velocity:    function (days, partnerId) { return _rpc('vpi_velocity',        { p_days: days || 30, p_partner_id: partnerId || null }) },
    forecast:    function (meta) { return _rpc('vpi_forecast_month',             { p_meta: meta || 20 }) },
    dropoff:     function (days) { return _rpc('vpi_dropoff_leads',              { p_days: days || 7 }) },
    heatmap:     function (days) { return _rpc('vpi_heatmap_activity',           { p_days: days || 90 }) },
    npsCorr:     function (days) { return _rpc('vpi_nps_indication_correlation', { p_days: days || 180 }) },
    payback:     function (days, partnerId) { return _rpc('vpi_payback_analysis',{ p_days: days || 90, p_partner_id: partnerId || null }) },
    alertsScan:  function () { return _rpc('vpi_alerts_scan', {}) },
    alertsList:  function (limit) { return _rpc('vpi_alerts_list',               { p_limit: limit || 20 }) },
    alertDismiss: function (id) { return _rpc('vpi_alert_dismiss',               { p_id: id }) },
    partnerSearch: function (q, limit) { return _rpc('vpi_partner_search',       { p_query: q, p_limit: limit || 10 }) },
  })
})()
