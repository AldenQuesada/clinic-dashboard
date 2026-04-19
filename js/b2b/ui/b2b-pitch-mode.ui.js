/**
 * ClinicAI — B2B Pitch Mode (WOW #12)
 *
 * Overlay fullscreen pra apresentar o programa Círculo Mirian a um
 * novo parceiro em reunião presencial. Carrega métricas reais:
 *   - N parcerias ativas
 *   - Total vouchers resgatados
 *   - NPS médio do parceiro (se tem)
 *   - Pillars cobertos
 *
 * Teclas: ESC fecha · setas navegam slides.
 *
 * Consome: B2BRepository, B2BNpsRepository.
 * Expõe window.B2BPitchMode.
 */
;(function () {
  'use strict'
  if (window.B2BPitchMode) return

  var _state = {
    open: false,
    slide: 0,
    data: null,
  }

  var SLIDES = [
    {
      eyebrow: 'Clínica Mirian de Paula',
      title: 'Círculo<br><em>Mirian</em>',
      subtitle: 'Uma rede de marcas que compartilham nosso cuidado.',
    },
    {
      eyebrow: 'O que é',
      title: 'Permuta de<br>excelência',
      subtitle: 'A gente entrega tratamento premium. Nossa parceira entrega seu melhor. Sem dinheiro trocando — só valor circulando.',
    },
    {
      eyebrow: 'A rede hoje',
      title: '<span data-stat="partnerships">0</span><small> parcerias</small>',
      subtitle: 'Cada uma escolhida pelo DNA — excelência, estética e propósito.',
    },
    {
      eyebrow: 'Impacto',
      title: '<span data-stat="redeemed">0</span><small> experiências</small>',
      subtitle: 'Clientes que viveram o cuidado da Clínica Mirian graças à nossa rede.',
    },
    {
      eyebrow: 'Quem avalia',
      title: 'NPS <span data-stat="nps">—</span>',
      subtitle: 'Pesquisa trimestral com todas as parceiras. Nenhuma voz perdida.',
    },
    {
      eyebrow: 'Convite',
      title: 'Você faz<br>parte?',
      subtitle: 'Se sim — a gente costura a parceria juntas, no seu ritmo.',
    },
  ]

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _render() {
    var s = SLIDES[_state.slide] || SLIDES[0]
    return '<div class="b2b-pitch-overlay">' +
      '<div class="b2b-pitch-slide">' +
        '<div class="b2b-pitch-eyebrow">' + _esc(s.eyebrow) + '</div>' +
        '<h1 class="b2b-pitch-title">' + s.title + '</h1>' +
        '<p class="b2b-pitch-subtitle">' + _esc(s.subtitle) + '</p>' +
      '</div>' +
      '<div class="b2b-pitch-dots">' +
        SLIDES.map(function (_, i) {
          return '<button type="button" class="b2b-pitch-dot' +
            (i === _state.slide ? ' active' : '') + '" data-pitch-goto="' + i + '"></button>'
        }).join('') +
      '</div>' +
      '<div class="b2b-pitch-hints">' +
        '<span>← / → navegar</span><span>ESC sair</span>' +
      '</div>' +
      '<button type="button" class="b2b-pitch-close" data-pitch-close aria-label="Fechar">×</button>' +
      '<button type="button" class="b2b-pitch-prev" data-pitch-prev aria-label="Anterior">‹</button>' +
      '<button type="button" class="b2b-pitch-next" data-pitch-next aria-label="Próximo">›</button>' +
    '</div>'
  }

  function _apply() {
    var host = document.getElementById('b2bPitchHost')
    if (!host) {
      host = document.createElement('div')
      host.id = 'b2bPitchHost'
      document.body.appendChild(host)
    }
    host.innerHTML = _state.open ? _render() : ''
    _paintStats()
    _bind(host)
  }

  function _paintStats() {
    if (!_state.open || !_state.data) return
    var host = document.getElementById('b2bPitchHost')
    if (!host) return
    var q = function (sel) { return host.querySelector(sel) }
    var pEl = q('[data-stat="partnerships"]')
    var rEl = q('[data-stat="redeemed"]')
    var nEl = q('[data-stat="nps"]')
    if (pEl) pEl.textContent = String(_state.data.partnerships_count || 0)
    if (rEl) rEl.textContent = String(_state.data.vouchers_redeemed || 0)
    if (nEl) nEl.textContent = _state.data.nps == null ? '—' : String(_state.data.nps)
  }

  function _bind(host) {
    var prev = host.querySelector('[data-pitch-prev]')
    var next = host.querySelector('[data-pitch-next]')
    var close = host.querySelector('[data-pitch-close]')
    if (prev) prev.addEventListener('click', function () { go(-1) })
    if (next) next.addEventListener('click', function () { go(1) })
    if (close) close.addEventListener('click', exit)
    host.querySelectorAll('[data-pitch-goto]').forEach(function (d) {
      d.addEventListener('click', function () {
        _state.slide = Number(d.getAttribute('data-pitch-goto')) || 0
        _apply()
      })
    })
  }

  function go(delta) {
    _state.slide = Math.max(0, Math.min(SLIDES.length - 1, _state.slide + delta))
    _apply()
  }

  function _onKey(e) {
    if (!_state.open) return
    if (e.key === 'Escape') { exit(); return }
    if (e.key === 'ArrowLeft')  { go(-1); e.preventDefault() }
    if (e.key === 'ArrowRight') { go(1);  e.preventDefault() }
  }

  async function _loadStats() {
    var out = { partnerships_count: 0, vouchers_redeemed: 0, nps: null }
    try {
      if (window.B2BRepository && window.B2BRepository.list) {
        var list = await window.B2BRepository.list({ status: 'active' })
        out.partnerships_count = Array.isArray(list) ? list.length : 0
        // somar vouchers resgatados via voucher_funnel por parceria
        if (window.B2BVouchersRepository && Array.isArray(list)) {
          var redeemed = 0
          for (var i = 0; i < list.length; i++) {
            try {
              var f = await window.B2BVouchersRepository.funnel(list[i].id)
              redeemed += Number((f && f.redeemed) || 0)
            } catch (_) { /* ignore */ }
          }
          out.vouchers_redeemed = redeemed
        }
      }
      if (window.B2BNpsRepository) {
        var s = await window.B2BNpsRepository.summary(null).catch(function () { return null })
        if (s && s.nps_score != null) out.nps = s.nps_score
      }
    } catch (_) { /* silencioso — pitch mostra "—" */ }
    return out
  }

  async function enter() {
    _state.open = true
    _state.slide = 0
    _state.data = null
    _apply()
    document.addEventListener('keydown', _onKey)
    document.body.style.overflow = 'hidden'
    _state.data = await _loadStats()
    _paintStats()
  }

  function exit() {
    _state.open = false
    _apply()
    document.removeEventListener('keydown', _onKey)
    document.body.style.overflow = ''
  }

  window.B2BPitchMode = Object.freeze({ enter: enter, exit: exit })
})()
