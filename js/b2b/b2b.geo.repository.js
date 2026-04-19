/**
 * ClinicAI — B2B Geo Repository (WOW #3)
 *
 * I/O puro das coordenadas das parcerias. Zero DOM.
 * Expõe window.B2BGeoRepository.
 */
;(function () {
  'use strict'
  if (window.B2BGeoRepository) return

  function _sb() {
    if (!window._sbShared) throw new Error('_sbShared não disponível')
    return window._sbShared
  }
  async function _rpc(name, args) {
    var r = await _sb().rpc(name, args || {})
    if (r.error) throw new Error('[' + name + '] ' + r.error.message)
    return r.data
  }

  function list() {
    return _rpc('b2b_partnerships_geo_list', {})
  }
  function setGeo(partnershipId, lat, lng) {
    return _rpc('b2b_partnership_set_geo', {
      p_partnership_id: partnershipId, p_lat: lat, p_lng: lng,
    })
  }

  window.B2BGeoRepository = Object.freeze({
    list: list,
    setGeo: setGeo,
  })
})()
