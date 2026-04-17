/**
 * VPI Embaixadora - Realtime (Supabase subscriptions)
 *
 * Subscribe em 3 canais para o partner do token atual:
 *   - vpi_partners:id=eq.partner_id  (UPDATE) -> re-fetch card
 *   - vpi_indications:partner_id=eq (UPDATE)  -> se status -> closed, confetti
 *   - vpi_badges:partner_id=eq (INSERT)       -> toast + confetti
 *
 * Fallback: se Realtime nao conectar em 5s, liga polling 30s.
 *
 * Expoe window.VPIEmbRealtime.
 */
;(function () {
  'use strict'
  if (window._vpiEmbRealtimeLoaded) return
  window._vpiEmbRealtimeLoaded = true

  function _app() { return window.VPIEmbApp }
  function _sb()  { return window._sbShared || null }

  var _ch           = null
  var _pollingTimer = null
  var _partnerId    = null
  var _connected    = false

  function _tier() {
    try {
      var d = _app() && _app().getData()
      return (d && d.partner && d.partner.tier_atual) || 'ouro'
    } catch (_) { return 'ouro' }
  }

  function _startPolling() {
    if (_pollingTimer) return
    _pollingTimer = setInterval(function () {
      if (_app() && _app().refresh) _app().refresh()
      if (window.VPIEmbBadges && window.VPIEmbBadges.refresh) window.VPIEmbBadges.refresh()
      if (window.VPIEmbMissoes && window.VPIEmbMissoes.refresh) window.VPIEmbMissoes.refresh()
    }, 30000)
  }

  function _stopPolling() {
    if (_pollingTimer) { clearInterval(_pollingTimer); _pollingTimer = null }
  }

  function _onIndicationUpdate(payload) {
    try {
      var n = payload && payload.new
      var o = payload && payload.old
      if (!n) return
      if (n.status === 'closed' && (!o || o.status !== 'closed')) {
        if (window.VPIEmbConfetti && window.VPIEmbConfetti.fire) {
          window.VPIEmbConfetti.fire({ tier: _tier(), count: 180, duration: 3800 })
        }
        // Fase 9 Entrega 6: haptic + som
        if (window.VPIEmbHaptic && window.VPIEmbHaptic.fire) {
          window.VPIEmbHaptic.fire('indication')
        }
        if (_app()) _app().toast('Indicacao fechada! Creditos atualizados.')
        if (_app() && _app().refresh) _app().refresh()
        if (window.VPIEmbBadges && window.VPIEmbBadges.refresh) {
          setTimeout(function () { window.VPIEmbBadges.refresh() }, 800)
        }
        if (window.VPIEmbMissoes && window.VPIEmbMissoes.refresh) {
          setTimeout(function () { window.VPIEmbMissoes.refresh() }, 800)
        }
      } else if (_app() && _app().refresh) {
        _app().refresh()
      }
    } catch (e) { console.warn('[VPIEmbRealtime] ind update:', e && e.message) }
  }

  function _onBadgeInsert(payload) {
    try {
      var b = payload && payload.new
      if (!b) return
      if (window.VPIEmbConfetti && window.VPIEmbConfetti.fire) {
        window.VPIEmbConfetti.fire({ tier: _tier(), count: 160, duration: 3500 })
      }
      // Fase 9 Entrega 6: haptic + som
      if (window.VPIEmbHaptic && window.VPIEmbHaptic.fire) {
        window.VPIEmbHaptic.fire('badge')
      }
      if (window.VPIEmbBadges && window.VPIEmbBadges.addUnlocked) {
        window.VPIEmbBadges.addUnlocked(b.badge_code, b.unlocked_at)
      } else if (window.VPIEmbBadges && window.VPIEmbBadges.refresh) {
        window.VPIEmbBadges.refresh()
      }
    } catch (e) { console.warn('[VPIEmbRealtime] badge insert:', e && e.message) }
  }

  var _lastKnownTier = null

  function _onPartnerUpdate(payload) {
    try {
      var n = payload && payload.new
      if (n && n.tier_atual) {
        if (_lastKnownTier && _lastKnownTier !== n.tier_atual) {
          // Tier subiu: haptic + som tier_up
          if (window.VPIEmbHaptic && window.VPIEmbHaptic.fire) {
            window.VPIEmbHaptic.fire('tier_up')
          }
        }
        _lastKnownTier = n.tier_atual
      }
    } catch (_) {}
    if (_app() && _app().refresh) _app().refresh()
  }

  async function init() {
    var sb = _sb()
    var d = _app() && _app().getData()
    if (!sb || !d || !d.partner || !d.partner.id) {
      _startPolling()
      return
    }
    _partnerId = d.partner.id
    _lastKnownTier = d.partner.tier_atual || null

    try {
      _ch = sb.channel('vpi-emb-' + _partnerId)
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'vpi_partners', filter: 'id=eq.' + _partnerId },
            _onPartnerUpdate)
        .on('postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'vpi_indications', filter: 'partner_id=eq.' + _partnerId },
            _onIndicationUpdate)
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'vpi_indications', filter: 'partner_id=eq.' + _partnerId },
            function () { if (_app() && _app().refresh) _app().refresh() })
        .on('postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'vpi_badges', filter: 'partner_id=eq.' + _partnerId },
            _onBadgeInsert)
        .subscribe(function (status) {
          if (status === 'SUBSCRIBED') {
            _connected = true
            _stopPolling()
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
            _connected = false
            _startPolling()
          }
        })

      // Fallback se nao conectar em 5s
      setTimeout(function () {
        if (!_connected) _startPolling()
      }, 5000)
    } catch (e) {
      console.warn('[VPIEmbRealtime] subscribe fail:', e && e.message)
      _startPolling()
    }

    window.addEventListener('beforeunload', teardown)
  }

  function teardown() {
    _stopPolling()
    try {
      if (_ch && _sb()) _sb().removeChannel(_ch)
    } catch (_) {}
    _ch = null
    _connected = false
  }

  window.VPIEmbRealtime = {
    init:     init,
    teardown: teardown,
    isConnected: function () { return _connected },
  }
})()
