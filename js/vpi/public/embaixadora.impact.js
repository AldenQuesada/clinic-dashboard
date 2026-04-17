/**
 * VPI Embaixadora - Impacto Coletivo (Counter Animado)
 *
 * Card mostrando metrica do ano: "R$ X indicado por N embaixadoras".
 * Counter animado em 2s usando easeOut.
 *
 * Expoe window.VPIEmbImpact.
 */
;(function () {
  'use strict'
  if (window._vpiEmbImpactLoaded) return
  window._vpiEmbImpactLoaded = true

  function _app() { return window.VPIEmbApp }
  function _sb()  { return window._sbShared || null }
  function _esc(s){ return _app() ? _app().esc(s) : (s == null ? '' : String(s)) }

  var _state = { data: null, loaded: false }

  function _fmtBRL(v) {
    try {
      if (v >= 1000) return 'R$ ' + (v / 1000).toFixed(v >= 100000 ? 0 : 1).replace('.', ',') + 'k'
      return 'R$ ' + Math.floor(v).toLocaleString('pt-BR')
    } catch (_) { return 'R$ ' + v }
  }
  function _fmtInt(v) {
    try { return Number(v || 0).toLocaleString('pt-BR') } catch (_) { return String(v || 0) }
  }

  function _animateCounter(el, target, formatter, duration) {
    if (!el) return
    duration = duration || 1800
    var start = 0
    var t0 = performance.now()
    function step(now) {
      var p = Math.min(1, (now - t0) / duration)
      // easeOutCubic
      var eased = 1 - Math.pow(1 - p, 3)
      var val = start + (target - start) * eased
      el.textContent = formatter(val)
      if (p < 1) requestAnimationFrame(step)
      else el.textContent = formatter(target)
    }
    try {
      if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        el.textContent = formatter(target)
        return
      }
    } catch (_) {}
    requestAnimationFrame(step)
  }

  function _render() {
    var slot = document.getElementById('vpi-impact-slot')
    if (!slot) return
    if (!_state.loaded || !_state.data) { slot.innerHTML = ''; return }
    var d = _state.data

    var recompensas = Number(d.recompensas_emitidas_ano || 0)

    // Se nenhuma recompensa com valor monetario foi registrada,
    // oculta o card (evita mostrar "R$ 0" que confunde).
    if (recompensas <= 0) { slot.innerHTML = ''; return }

    slot.innerHTML =
      '<div class="vpi-impact">' +
        '<div class="vpi-impact-kicker">Nossas parceiras já ganharam</div>' +
        '<div class="vpi-impact-counter" id="vpi-impact-valor">R$ 0</div>' +
        '<div class="vpi-impact-desc">' +
          'Em recompensas entregues em ' + (d.ano_ref || '') + ',' +
          ' para <strong id="vpi-impact-emb">0</strong> parceiras ativas.<br>' +
          '<span style="opacity:0.8">Indicar transforma a vida de quem você ama — e a sua também.</span>' +
        '</div>' +
      '</div>'

    var elValor = document.getElementById('vpi-impact-valor')
    var elEmb   = document.getElementById('vpi-impact-emb')
    _animateCounter(elValor, recompensas, _fmtBRL, 2000)
    _animateCounter(elEmb,   d.total_embaixadoras || 0, _fmtInt, 1600)
  }

  async function _fetch() {
    var sb = _sb()
    if (!sb) return
    try {
      var r = await sb.rpc('vpi_pub_impact', { p_clinic_id: '00000000-0000-0000-0000-000000000001' })
      if (r.error) { console.warn('[VPIEmbImpact] rpc error:', r.error.message); return }
      var d = r.data || {}
      if (d.error) return
      _state.data = d
      _state.loaded = true
      _render()
    } catch (e) {
      console.warn('[VPIEmbImpact] fetch fail:', e && e.message)
    }
  }

  async function init() {
    var tries = 0
    var wait = setInterval(function () {
      tries++
      if (document.getElementById('vpi-impact-slot') || tries > 20) {
        clearInterval(wait)
        _fetch()
      }
    }, 120)
  }

  function refresh() { return _fetch() }

  window.addEventListener('vpi-emb-rendered', function () {
    if (_state.loaded) _render()
    else _fetch()
  })

  window.VPIEmbImpact = {
    init:    init,
    refresh: refresh,
    getState: function () { return _state },
  }
})()
