/**
 * B2BMetricsRepository — consome RPCs da migration 388 (B2B analytics).
 * IIFE puro. Zero DOM.
 */
;(function () {
  'use strict'
  if (window.B2BMetricsRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  window.B2BMetricsRepository = Object.freeze({
    funnel:        function (days, partnershipId) { return _rpc('b2b_funnel_breakdown',     { p_days: days || 30, p_partnership_id: partnershipId || null }) },
    timeseries:    function (bucket, periods, partnershipId) { return _rpc('b2b_timeseries', { p_bucket: bucket || 'month', p_periods: periods || 12, p_partnership_id: partnershipId || null }) },
    cohort:        function (months) { return _rpc('b2b_cohort_retention',                  { p_months: months || 6 }) },
    quality:       function (days) { return _rpc('b2b_partnership_quality',                 { p_days: days || 90 }) },
    velocity:      function (days, partnershipId) { return _rpc('b2b_partnership_velocity', { p_days: days || 30, p_partnership_id: partnershipId || null }) },
    forecast:      function (metaNew, metaVouch) { return _rpc('b2b_forecast_month',        { p_meta_new_partners: metaNew || null, p_meta_vouchers: metaVouch || null }) },
    dropoff:       function (days) { return _rpc('b2b_dropoff_vouchers',                    { p_days: days || 7 }) },
    heatmap:       function (days) { return _rpc('b2b_heatmap_activity',                    { p_days: days || 90 }) },
    payback:       function (days, partnershipId) { return _rpc('b2b_payback_analysis',     { p_days: days || 90, p_partnership_id: partnershipId || null }) },
    partnerSearch: function (q, limit) { return _rpc('b2b_partnership_search',              { p_query: q, p_limit: limit || 10 }) },
    alertsScan:    function () { return _rpc('b2b_alerts_scan', {}) },
    alertsList:    function (limit) { return _rpc('b2b_alerts_list',                        { p_limit: limit || 20 }) },
    alertDismiss:  function (id) { return _rpc('b2b_alert_dismiss',                         { p_id: id }) },
  })
})()
