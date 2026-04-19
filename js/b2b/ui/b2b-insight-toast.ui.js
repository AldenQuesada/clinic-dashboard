/**
 * ClinicAI — B2B Insight Toast (WOW #9)
 *
 * Ao abrir a página, busca insights não descartados e mostra
 * o mais recente como toast premium (com ações).
 *
 * Também adiciona botão "Gerar insights agora" no header (admin).
 *
 * Expõe window.B2BInsightToast.
 */
;(function () {
  'use strict'
  if (window.B2BInsightToast) return

  var SEV_COLOR = {
    info:        { bg:'rgba(96,165,250,0.1)',  border:'#60A5FA', label:'Insight' },
    opportunity: { bg:'rgba(16,185,129,0.1)',  border:'#10B981', label:'Oportunidade' },
    warning:     { bg:'rgba(245,158,11,0.1)',  border:'#F59E0B', label:'Atenção' },
    critical:    { bg:'rgba(239,68,68,0.1)',   border:'#EF4444', label:'Crítico' },
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _render(insight) {
    var sev = SEV_COLOR[insight.severity] || SEV_COLOR.info
    return '<div class="b2b-insight-card" style="background:' + sev.bg + ';border-color:' + sev.border + '" ' +
      'data-insight-id="' + _esc(insight.id) + '">' +
      '<div class="b2b-insight-hdr">' +
        '<span class="b2b-insight-badge" style="background:' + sev.border + '">' + sev.label + '</span>' +
        (insight.partnership_name
          ? '<span class="b2b-insight-partner">' + _esc(insight.partnership_name) + '</span>'
          : '<span class="b2b-insight-partner">Visão geral</span>') +
        '<button type="button" class="b2b-insight-close" data-insight-dismiss aria-label="Dispensar">×</button>' +
      '</div>' +
      '<div class="b2b-insight-headline">' + _esc(insight.headline || '') + '</div>' +
      (insight.detail ? '<div class="b2b-insight-detail">' + _esc(insight.detail) + '</div>' : '') +
      (insight.suggested_action
        ? '<div class="b2b-insight-action"><strong>Ação:</strong> ' + _esc(insight.suggested_action) + '</div>'
        : '') +
      (insight.partnership_id
        ? '<button type="button" class="b2b-insight-open" data-insight-open="' +
            _esc(insight.partnership_id) + '">Abrir parceria →</button>'
        : '') +
    '</div>'
  }

  function _bind(host) {
    host.querySelectorAll('[data-insight-dismiss]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var card = btn.closest('[data-insight-id]')
        var id = card && card.getAttribute('data-insight-id')
        if (!id) return
        card.style.opacity = '0.4'
        try {
          await window.B2BInsightRepository.dismiss(id)
          card.remove()
          // Se não sobrou nenhum, remove o host
          if (host && !host.querySelector('.b2b-insight-card')) host.remove()
        } catch (_) { /* silencioso */ }
      })
    })
    host.querySelectorAll('[data-insight-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-insight-open')
        document.dispatchEvent(new CustomEvent('b2b:open-detail', { detail: { id: id } }))
      })
    })
  }

  async function show() {
    if (!window.B2BInsightRepository) return
    try {
      var list = await window.B2BInsightRepository.list(3)
      if (!Array.isArray(list) || !list.length) return

      var host = document.getElementById('b2bInsightToastHost')
      if (!host) {
        host = document.createElement('div')
        host.id = 'b2bInsightToastHost'
        host.className = 'b2b-insight-host'
        document.body.appendChild(host)
      }
      host.innerHTML = list.map(_render).join('')
      _bind(host)

      // Marca os visíveis como 'seen'
      list.forEach(function (i) {
        if (!i.seen_at) window.B2BInsightRepository.markSeen(i.id).catch(function () { /* ignore */ })
      })
    } catch (e) {
      console.warn('[B2BInsightToast] falha:', e.message)
    }
  }

  async function generate() {
    if (!window.B2BInsightRepository) return
    if (window.B2BToast) window.B2BToast.info('Analisando parcerias com IA…')
    try {
      var r = await window.B2BInsightRepository.generate(true)
      if (!r || !r.ok) throw new Error(r && r.error || 'desconhecido')
      if (window.B2BToast) {
        window.B2BToast.success('IA gerou ' + (r.inserted || 0) + ' insights · US$ ' +
          (Number(r.cost_usd || 0)).toFixed(4))
      }
      show()
    } catch (e) {
      if (window.B2BToast) window.B2BToast.error('Falha: ' + (e.message || e))
    }
  }

  // Auto-show quando o shell mounta
  document.addEventListener('b2b:shell-mounted', show)
  // Alternativa: auto-show 1.5s após DOMContentLoaded (caso shell não emita)
  if (document.readyState !== 'loading') {
    setTimeout(show, 1500)
  } else {
    document.addEventListener('DOMContentLoaded', function () { setTimeout(show, 1500) })
  }

  window.B2BInsightToast = Object.freeze({ show: show, generate: generate })
})()
