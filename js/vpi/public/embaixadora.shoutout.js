/**
 * VPI Embaixadora - Shoutout do Mes (Leader + Ranking Top 10)
 *
 * Card "Embaixadora do Mes" destacando a top 1 + ranking top 10
 * com nomes blurred (filter:blur) nas outras posicoes. A parceira
 * consultante tem sua posicao revelada (highlight + classe .self).
 *
 * Quando a consultante E a #1, o layout muda para "VOCE E A
 * EMBAIXADORA DO MES" com CTA compartilhar.
 *
 * Expoe window.VPIEmbShoutout.
 */
;(function () {
  'use strict'
  if (window._vpiEmbShoutoutLoaded) return
  window._vpiEmbShoutoutLoaded = true

  function _app() { return window.VPIEmbApp }
  function _sb()  { return window._sbShared || null }
  function _esc(s){ return _app() ? _app().esc(s) : (s == null ? '' : String(s)) }

  var _state = {
    leader:   null,
    ranking:  [],
    self_pos: null,
    self_qtd: 0,
    loaded:   false,
  }

  function _ico(name, sz) {
    sz = sz || 28
    if (window.feather && window.feather.icons && window.feather.icons[name]) {
      return window.feather.icons[name].toSvg({ width: sz, height: sz, 'stroke-width': 2 })
    }
    return ''
  }

  function _render() {
    var slot = document.getElementById('vpi-shoutout-slot')
    if (!slot) return
    if (!_state.loaded) { slot.innerHTML = ''; return }

    var l = _state.leader
    if (!l) {
      // Sem lider (mes ainda sem indicacoes fechadas): mostra call-to-action sutil
      slot.innerHTML =
        '<div class="vpi-shoutout">' +
          '<div class="vpi-shoutout-kicker">Embaixadora do mes</div>' +
          '<div class="vpi-shoutout-crown">' + _ico('award', 32) + '</div>' +
          '<div class="vpi-shoutout-name">Ainda nao definida</div>' +
          '<div class="vpi-shoutout-stats">Seja voce a primeira a indicar este mes.</div>' +
        '</div>'
      if (window.feather && window.feather.replace) {
        try { window.feather.replace() } catch (_) {}
      }
      return
    }

    var isSelfLeader = !!l.is_self

    var rankingHtml = ''
    if (_state.ranking && _state.ranking.length) {
      rankingHtml = '<div class="vpi-shoutout-ranking">' +
        _state.ranking.map(function (r) {
          var cls = 'vpi-rank-item' + (r.is_self ? ' self' : ' blur')
          return '<div class="' + cls + '">' +
            '<span class="pos">#' + (r.pos || '-') + '</span>' +
            '<span class="nm">' + _esc(r.nome || 'Embaixadora') + '</span>' +
            '<span class="qt">' + (r.qtd || 0) + ' ind.</span>' +
          '</div>'
        }).join('') +
      '</div>'
    }

    slot.innerHTML =
      '<div class="vpi-shoutout">' +
        '<div class="vpi-shoutout-kicker">' +
          (isSelfLeader ? 'Voce e a embaixadora do mes' : 'Embaixadora do mes') +
        '</div>' +
        '<div class="vpi-shoutout-crown">' + _ico('award', 32) + '</div>' +
        '<div class="vpi-shoutout-name">' + _esc(l.nome) + '</div>' +
        '<div class="vpi-shoutout-stats">' + (l.qtd || 0) + ' indicacoes fechadas este mes</div>' +
        (isSelfLeader
          ? '<div class="vpi-shoutout-self">Parabens! Compartilhe essa conquista com suas amigas.</div>' +
            '<div style="margin-top:12px">' +
              '<button class="vpi-btn vpi-btn-primary" id="vpi-shoutout-share">' +
                _ico('share-2', 16) + ' Compartilhar conquista' +
              '</button>' +
            '</div>'
          : (_state.self_pos
              ? '<div class="vpi-shoutout-self">Sua posicao: #' + _state.self_pos +
                ' com ' + _state.self_qtd + ' indicacao' + (_state.self_qtd === 1 ? '' : 'es') + '</div>'
              : '')
        ) +
        rankingHtml +
      '</div>'

    if (window.feather && window.feather.replace) {
      try { window.feather.replace() } catch (_) {}
    }

    var btn = document.getElementById('vpi-shoutout-share')
    if (btn) {
      btn.addEventListener('click', function () {
        if (window.VPIEmbShare && window.VPIEmbShare.share) window.VPIEmbShare.share()
      })
    }
  }

  async function _fetch() {
    var sb = _sb()
    var token = _app() ? _app().getToken() : null
    if (!sb || !token) return
    try {
      var r = await sb.rpc('vpi_pub_shoutout_atual', { p_token: token })
      if (r.error) { console.warn('[VPIEmbShoutout] rpc error:', r.error.message); return }
      var d = r.data || {}
      if (d.error) return
      _state.leader   = d.leader || null
      _state.ranking  = d.ranking || []
      _state.self_pos = d.self_pos || null
      _state.self_qtd = d.self_qtd || 0
      _state.loaded   = true
      _render()
    } catch (e) {
      console.warn('[VPIEmbShoutout] fetch fail:', e && e.message)
    }
  }

  async function init() {
    var tries = 0
    var wait = setInterval(function () {
      tries++
      if (document.getElementById('vpi-shoutout-slot') || tries > 20) {
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

  window.VPIEmbShoutout = {
    init:    init,
    refresh: refresh,
    getState: function () { return _state },
  }
})()
