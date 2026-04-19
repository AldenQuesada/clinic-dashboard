/**
 * ClinicAI — B2B WOW Actions (Bloco 1 dos efeitos WOW)
 *
 * Barra única de ações premium no detalhe da parceria:
 *   - Dossiê PDF (WOW #1) → abre aba com HTML luxuoso
 *   - Painel do parceiro (WOW #2) → gera/copia link público
 *   - IA conteúdo (WOW #4) → chama edge function
 *
 * Consome:
 *   B2BDossierService, B2BPartnerPanelRepository, B2BPlaybookIaRepository,
 *   B2BCostRepository, B2BHealthTrendRepository, B2BRepository
 *
 * Expõe window.B2BWowActions (mount por ID).
 */
;(function () {
  'use strict'
  if (window.B2BWowActions) return

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _toast() { return window.B2BToast }

  function _panelUrl(token) {
    var base = window.location.origin
    return base + '/parceiro.html?t=' + encodeURIComponent(token)
  }

  async function _onDossier(partnership) {
    if (!window.B2BDossierService) { _toast() && _toast().error('Dossier service não carregado'); return }
    _toast() && _toast().info('Montando dossiê premium…')
    try {
      // Carrega dados auxiliares em paralelo
      var [full, cost, trend] = await Promise.all([
        window.B2BRepository.get(partnership.id),
        window.B2BCostRepository
          ? window.B2BCostRepository.byPartnership(partnership.id).catch(function () { return null })
          : null,
        window.B2BHealthTrendRepository
          ? window.B2BHealthTrendRepository.byPartnership(partnership.id, 90).catch(function () { return null })
          : null,
      ])

      // Funnel vem do voucher repo — busca já dentro do get ou fazemos agora
      var funnel = null
      if (window.B2BVouchersRepository && window.B2BVouchersRepository.funnel) {
        funnel = await window.B2BVouchersRepository.funnel(partnership.id).catch(function () { return null })
      }

      window.B2BDossierService.open(full && full.partnership || partnership, {
        targets: full && full.targets,
        events:  full && full.events,
        funnel:  funnel,
        cost:    cost,
        trend:   trend,
      })
    } catch (e) {
      _toast() && _toast().error('Falha: ' + (e.message || e))
    }
  }

  async function _onPanel(partnership) {
    if (!window.B2BPartnerPanelRepository) return
    try {
      var currentToken = partnership.public_token
      var token = currentToken
      if (!token) {
        var r = await window.B2BPartnerPanelRepository.issueToken(partnership.id)
        if (!r || !r.ok) throw new Error(r && r.error || 'desconhecido')
        token = r.token
      }
      var url = _panelUrl(token)

      // Copia link pro clipboard
      try {
        await navigator.clipboard.writeText(url)
        _toast() && _toast().success('Link do painel copiado · ' + url.slice(0, 60) + '…')
      } catch (_) {
        _toast() && _toast().info('Link do painel: ' + url)
      }

      // Abre em aba nova pra visualizar
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      _toast() && _toast().error('Falha painel: ' + (e.message || e))
    }
  }

  async function _onIa(partnership) {
    if (!window.B2BPlaybookIaRepository) return
    if (!_toast()) return
    var confirm = await _toast().confirm(
      'Gerar conteúdo com IA?',
      'Claude Haiku vai escrever 4 slides de carrossel + 3 ganchos na voz da clínica e anexar ao playbook desta parceria. Custo aproximado: US$ 0,03.'
    )
    if (!confirm) return

    _toast().info('Gerando conteúdo com IA…')
    try {
      var by = (window.ClinicAuth && window.ClinicAuth.getUser && window.ClinicAuth.getUser()) || null
      var name = by && (by.name || by.email) || null
      var r = await window.B2BPlaybookIaRepository.generate(partnership.id, 'all', name)
      if (!r || !r.ok) throw new Error(r && r.error || 'desconhecido')
      _toast().success('IA gerou ' + r.inserted + ' conteúdos · US$ ' +
        (Number(r.cost_usd || 0)).toFixed(4))
      document.dispatchEvent(new CustomEvent('b2b:partnership-saved',
        { detail: { id: partnership.id } }))
    } catch (e) {
      _toast().error('IA falhou: ' + (e.message || e))
    }
  }

  function _render(partnership) {
    var showCert = partnership && (partnership.status === 'closed' || partnership.status === 'review' || partnership.status === 'paused')
    var showNps  = partnership && partnership.status === 'active'
    return '<div class="b2b-wow-bar">' +
      '<button type="button" class="b2b-wow-btn b2b-wow-dossier" data-wow="dossier">' +
        '<span class="b2b-wow-ico">📄</span>' +
        '<span class="b2b-wow-lbl">Dossiê PDF</span>' +
        '<span class="b2b-wow-sub">Luxo · pra reunião</span>' +
      '</button>' +
      '<button type="button" class="b2b-wow-btn b2b-wow-panel" data-wow="panel">' +
        '<span class="b2b-wow-ico">🔗</span>' +
        '<span class="b2b-wow-lbl">Painel do parceiro</span>' +
        '<span class="b2b-wow-sub">Link público · read-only</span>' +
      '</button>' +
      '<button type="button" class="b2b-wow-btn b2b-wow-ia" data-wow="ia">' +
        '<span class="b2b-wow-ico">✨</span>' +
        '<span class="b2b-wow-lbl">IA conteúdo</span>' +
        '<span class="b2b-wow-sub">Carrossel + ganchos</span>' +
      '</button>' +
      (showNps
        ? '<button type="button" class="b2b-wow-btn b2b-wow-nps" data-wow="nps">' +
            '<span class="b2b-wow-ico">📊</span>' +
            '<span class="b2b-wow-lbl">Link NPS</span>' +
            '<span class="b2b-wow-sub">Trimestral · 1 clique</span>' +
          '</button>'
        : '') +
      (showCert
        ? '<button type="button" class="b2b-wow-btn b2b-wow-cert" data-wow="cert">' +
            '<span class="b2b-wow-ico">🏆</span>' +
            '<span class="b2b-wow-lbl">Certificado</span>' +
            '<span class="b2b-wow-sub">Honraria de encerramento</span>' +
          '</button>'
        : '') +
    '</div>'
  }

  async function _onNps(partnership) {
    if (!window.B2BNpsRepository) return
    try {
      var r = await window.B2BNpsRepository.issue(partnership.id)
      if (!r || !r.ok) throw new Error(r && r.error || 'desconhecido')
      var url = window.location.origin + '/nps.html?t=' + encodeURIComponent(r.token)
      try {
        await navigator.clipboard.writeText(url)
        _toast() && _toast().success('Link NPS copiado · ' + url.slice(0, 60) + '…')
      } catch (_) {
        _toast() && _toast().info('Link NPS: ' + url)
      }
      window.open(url, '_blank', 'noopener')
    } catch (e) {
      _toast() && _toast().error('Falha NPS: ' + (e.message || e))
    }
  }

  async function _onCert(partnership) {
    if (!window.B2BCertificateService) {
      _toast() && _toast().error('Certificate service não carregado'); return
    }
    try {
      var funnel = null
      if (window.B2BVouchersRepository && window.B2BVouchersRepository.funnel) {
        funnel = await window.B2BVouchersRepository.funnel(partnership.id).catch(function () { return null })
      }
      window.B2BCertificateService.open(partnership, {
        closed_at: partnership.status === 'closed' ? (partnership.updated_at || new Date().toISOString()) : null,
        funnel: funnel,
      })
    } catch (e) {
      _toast() && _toast().error('Falha: ' + (e.message || e))
    }
  }

  function mount(hostId, partnership) {
    var host = document.getElementById(hostId)
    if (!host || !partnership || !partnership.id) return
    host.innerHTML = _render(partnership)

    host.querySelectorAll('[data-wow]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var kind = btn.getAttribute('data-wow')
        btn.disabled = true
        var done = function () { btn.disabled = false }
        if (kind === 'dossier') return _onDossier(partnership).finally(done)
        if (kind === 'panel')   return _onPanel(partnership).finally(done)
        if (kind === 'ia')      return _onIa(partnership).finally(done)
        if (kind === 'nps')     return _onNps(partnership).finally(done)
        if (kind === 'cert')    return _onCert(partnership).finally(done)
        done()
      })
    })
  }

  window.B2BWowActions = Object.freeze({ mount: mount })
})()
