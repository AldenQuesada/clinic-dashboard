/**
 * VPI Embaixadora - Cartao (Identidade + Tier + Progress Ring)
 *
 * Renderiza o cartao premium com 3D flip. Usa SVG conic-gradient
 * pseudo via stroke-dasharray pro progress ring. Paleta dinamica
 * por tier (bronze|prata|ouro|diamante). Mobile-first.
 *
 * Expoe window.VPIEmbCard.
 */
;(function () {
  'use strict'
  if (window._vpiEmbCardLoaded) return
  window._vpiEmbCardLoaded = true

  function _app() { return window.VPIEmbApp }
  function _esc(s) { return _app() ? _app().esc(s) : (s == null ? '' : String(s)) }

  var RING_R     = 64
  var RING_CIRC  = 2 * Math.PI * RING_R  // ~ 402.12

  function _initials(name) {
    if (!name) return 'E'
    var parts = String(name).trim().split(/\s+/)
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase()
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase()
  }

  function _firstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || 'Embaixadora'
  }

  function _tierLabel(t) {
    switch (t) {
      case 'diamante': return 'EMBAIXADORA DIAMANTE'
      case 'ouro':     return 'EMBAIXADORA OURO'
      case 'prata':    return 'EMBAIXADORA PRATA'
      default:         return 'EMBAIXADORA BRONZE'
    }
  }

  function _padNum(n, width) {
    var s = String(n == null ? 0 : n)
    while (s.length < width) s = '0' + s
    return s
  }

  function _formatDate(iso) {
    if (!iso) return ''
    try {
      var d = new Date(iso)
      if (isNaN(d.getTime())) return ''
      var dd = String(d.getDate()).padStart(2, '0')
      var mm = String(d.getMonth() + 1).padStart(2, '0')
      return dd + '/' + mm + '/' + d.getFullYear()
    } catch (_) { return '' }
  }

  function _ico(n, sz) {
    sz = sz || 14
    if (window.feather && window.feather.icons && window.feather.icons[n]) {
      return window.feather.icons[n].toSvg({ width: sz, height: sz, 'stroke-width': 2 })
    }
    return ''
  }

  function _nextTierText(next) {
    if (!next) return '<strong>Máximo atingido</strong><span>Você desbloqueou todos os tiers</span>'
    var faltam = next.faltam || 0
    var reward = _esc(next.recompensa || 'Recompensa exclusiva')
    return '<strong>Próxima: ' + reward + '</strong>' +
           '<span>Faltam ' + faltam + ' ' + (faltam === 1 ? 'indicação fechada' : 'indicações fechadas') + '</span>'
  }

  function _progressPct(partner, next) {
    if (!next || !next.threshold || next.threshold <= 0) return 100
    var total = partner.creditos_total || 0
    var pct   = (total / next.threshold) * 100
    return Math.max(3, Math.min(100, pct))
  }

  function _render() {
    var data = _app().getData()
    if (!data || !data.partner) return

    var p    = data.partner
    var tier = p.tier_atual || 'bronze'
    var next = data.next_tier || null
    var pct  = _progressPct(p, next)
    var dashOffset = RING_CIRC * (1 - pct / 100)

    var root = document.getElementById('vpi-emb-root')
    if (!root) return

    var avatar = p.avatar_url
      ? '<img src="' + _esc(p.avatar_url) + '" alt="' + _esc(p.nome) + '" />'
      : _initials(p.nome)

    var streakChip = (p.streak_meses && p.streak_meses >= 2)
      ? '<span class="vpi-chip streak">' + _ico('zap', 12) + p.streak_meses + ' meses consecutivos</span>'
      : ''

    var rankChip = data.ranking_pos && data.ranking_pos <= 50
      ? '<span class="vpi-chip">' + _ico('trending-up', 12) + '#' + data.ranking_pos + ' no ranking do mes</span>'
      : ''

    var html =
      '<div class="vpi-emb-brand">' +
        '<div class="brand-line">Clinica Mirian de Paula</div>' +
        '<div class="brand-name">Beauty &amp; Health</div>' +
        '<div class="brand-tag">Programa de Embaixadoras</div>' +
      '</div>' +

      '<div class="vpi-card-outer" id="vpi-card-outer">' +
        '<div class="vpi-card-flip" id="vpi-card-flip">' +
          // FRONT
          '<div class="vpi-card-face front tier-' + _esc(tier) + '">' +
            '<div class="vpi-logo-slot">Cartão Digital<span class="sub">Clínica Mirian de Paula</span></div>' +
            '<div class="vpi-avatar-wrap"><div class="vpi-avatar">' + avatar + '</div></div>' +
            '<h1 class="vpi-name">' + _esc(p.nome) + '</h1>' +
            '<div class="vpi-tier-label">' + _tierLabel(tier) + '</div>' +
            '<div class="vpi-member-num">Membro #' + _padNum(p.numero_membro, 5) + '</div>' +
            '<div class="vpi-divider"></div>' +

            '<div class="vpi-progress">' +
              '<div class="vpi-progress-ring">' +
                '<svg viewBox="0 0 150 150">' +
                  '<circle class="track" cx="75" cy="75" r="' + RING_R + '"></circle>' +
                  '<circle class="fill" cx="75" cy="75" r="' + RING_R + '"' +
                    ' stroke-dasharray="' + RING_CIRC.toFixed(2) + '"' +
                    ' stroke-dashoffset="' + dashOffset.toFixed(2) + '"></circle>' +
                '</svg>' +
                '<div class="vpi-progress-center">' +
                  '<div class="big">' + (p.creditos_total || 0) + '</div>' +
                  '<div class="small">créditos</div>' +
                '</div>' +
              '</div>' +
            '</div>' +

            '<div class="vpi-next-reward">' + _nextTierText(next) + '</div>' +

            (streakChip || rankChip
              ? '<div class="vpi-meta-row">' + streakChip + rankChip + '</div>'
              : '') +

            '<div class="vpi-actions">' +
              '<button class="vpi-btn vpi-btn-primary" id="vpi-btn-indicar">' +
                _ico('heart', 16) + 'Indicar uma amiga' +
              '</button>' +
              '<button class="vpi-btn vpi-btn-secondary" id="vpi-btn-share">' +
                _ico('share-2', 16) + 'Compartilhar meu cartão' +
              '</button>' +
            '</div>' +

            '<div class="vpi-flip-hint">' + _ico('refresh-cw', 10) + '&nbsp;Toque para ver histórico</div>' +
          '</div>' +

          // BACK
          '<div class="vpi-card-face back tier-' + _esc(tier) + '">' +
            '<div class="vpi-back-title">Suas Indicações</div>' +
            '<div class="vpi-back-sub">Histórico completo</div>' +
            '<div class="vpi-timeline" id="vpi-timeline">' + _renderTimeline(data.indications || []) + '</div>' +
            '<div id="vpi-qr-slot"></div>' +
            '<div class="vpi-flip-hint">' + _ico('rotate-ccw', 10) + '&nbsp;Toque para voltar</div>' +
          '</div>' +
        '</div>' +
      '</div>' +

      '<div id="vpi-missao-slot"></div>' +
      '<div id="vpi-badges-slot"></div>' +
      '<div id="vpi-shoutout-slot"></div>' +
      // Fase 9: Attribution ROI (card "Sua Atribuicao")
      '<div id="vpi-emb-attribution"></div>' +
      // Fase 9 Entrega 5: Meu Impacto ("voce transformou N vidas")
      '<div id="vpi-emb-myimpact"></div>' +
      '<div id="vpi-impact-slot"></div>' +
      // Novo modelo: Ponteiras Fotona 4D (5 ponteiras, resgate a partir de 2)
      '<div id="vpi-emb-ponteiras"></div>' +
      // Fase 8: Linhagem (arvore de filhas)
      '<div id="vpi-emb-lineage"></div>' +

      // Footer LGPD opt-out
      '<div class="vpi-optout-footer" style="margin:32px auto 16px;max-width:420px;text-align:center;padding:16px;font-size:11px;color:rgba(245,245,245,0.45);line-height:1.5">' +
        'Voce pode sair do programa a qualquer momento. ' +
        '<a href="javascript:void(0)" id="vpi-optout-link" style="color:rgba(245,245,245,0.75);text-decoration:underline;font-weight:500">Sair do programa</a>' +
      '</div>'

    root.innerHTML = html

    _attachHandlers()

    // Feather replace async
    if (window.feather && window.feather.replace) {
      try { window.feather.replace() } catch (_) {}
    }

    // Dispara evento global para modulos ouvintes
    try {
      window.dispatchEvent(new CustomEvent('vpi-emb-rendered', { detail: { tier: tier, data: data } }))
    } catch (_) {}
  }

  function _renderTimeline(items) {
    if (window.VPIEmbTimeline && window.VPIEmbTimeline.renderHTML) {
      return window.VPIEmbTimeline.renderHTML(items)
    }
    // Fallback inline
    if (!items || !items.length) {
      return '<div class="vpi-tl-empty">' +
        '<strong>Comece agora</strong>' +
        'Sua jornada de embaixadora começa com a primeira indicação.<br>' +
        'Cada amiga que fechar um procedimento gera créditos no seu cartão.' +
      '</div>'
    }
    return items.map(function (i) {
      var closed = i.status === 'closed'
      var date = _formatDate(i.fechada_em || i.created_at)
      return '<div class="vpi-tl-item">' +
        '<div class="vpi-tl-dot ' + (closed ? '' : 'pending') + '"></div>' +
        '<div class="vpi-tl-body">' +
          '<div class="vpi-tl-proc">' + _esc(i.procedimento || 'Indicação') + '</div>' +
          '<div class="vpi-tl-date">' + date + (closed ? ' - fechada' : ' - pendente') + '</div>' +
        '</div>' +
        '<div class="vpi-tl-credits">+' + (i.creditos || 0) + '</div>' +
      '</div>'
    }).join('')
  }

  function _attachHandlers() {
    var flip = document.getElementById('vpi-card-flip')
    if (flip) {
      flip.addEventListener('click', function (e) {
        // Nao vira se clicou em botao
        if (e.target.closest('.vpi-btn') || e.target.closest('#vpi-indicate-modal')) return
        flip.classList.toggle('flipped')
      })
    }

    var btnIndicar = document.getElementById('vpi-btn-indicar')
    if (btnIndicar) {
      btnIndicar.addEventListener('click', function (e) {
        e.stopPropagation()
        if (window.VPIEmbIndicate && window.VPIEmbIndicate.open) {
          window.VPIEmbIndicate.open()
        } else {
          _app().toast('Em breve: envie sua indicação pelo WhatsApp da clínica.')
        }
      })
    }

    var btnShare = document.getElementById('vpi-btn-share')
    if (btnShare) {
      btnShare.addEventListener('click', function (e) {
        e.stopPropagation()
        if (window.VPIEmbShare && window.VPIEmbShare.share) {
          window.VPIEmbShare.share()
        } else {
          _fallbackShare()
        }
      })
    }

    var optOutLink = document.getElementById('vpi-optout-link')
    if (optOutLink) {
      optOutLink.addEventListener('click', function (e) {
        e.stopPropagation()
        e.preventDefault()
        if (window.VPIEmbOptOut && window.VPIEmbOptOut.openModal) {
          window.VPIEmbOptOut.openModal()
        } else if (_app()) {
          _app().toast('Módulo de opt-out não carregou. Fale com a clínica.')
        }
      })
    }
  }

  function _fallbackShare() {
    var url = window.location.href
    if (navigator.share) {
      navigator.share({ title: 'Meu cartão de embaixadora', url: url }).catch(function () {})
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url).then(function () {
        _app().toast('Link copiado')
      })
    }
  }

  // Re-render quando state muda
  if (_app()) {
    _app().onStateChange(function () {
      if (_app().getData()) _render()
    })
  }

  window.VPIEmbCard = {
    render: _render,
  }
})()
