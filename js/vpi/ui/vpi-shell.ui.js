/**
 * ClinicAI - VPI UI Shell
 *
 * Orquestra as abas da pagina growth-referral. Importa os sub-modulos
 * (ranking, rewards, partner-modal) e substitui o JS inline antigo.
 *
 * Exporta:
 *   window.vpiSwitchTab(n)
 *   window.vpiToggle(id)
 *   window.vpiSetSort(val)
 *   window.vpiRenderRanking(suffix)
 *   window.vpiRefreshKpis(suffix)
 *   window.vpiOpenAddPartner / vpiCloseAddPartner / vpiSavePartner
 *   window.vpiViewPartner(id)
 *   window.vpiDeletePartner(id)
 *   window.vpiRenderRewards() / vpiOpenTierModal / vpiCloseTierModal / vpiSaveTier / vpiDeleteTier
 */
;(function () {
  'use strict'

  if (window._vpiShellLoaded) return
  window._vpiShellLoaded = true

  var _sort = 'ranking'

  function _toast(title, body, kind) {
    if (window._showToast) _showToast(title, body, kind || 'info')
  }

  // ══════════════════════════════════════════════════
  //  Tabs
  // ══════════════════════════════════════════════════
  function vpiSwitchTab(n) {
    [1, 2, 3, 4, 5].forEach(function (i) {
      var panel = document.getElementById('vpiPanel' + i)
      var tab   = document.getElementById('vpiTab'   + i)
      if (!panel || !tab) return
      var active = i === n
      panel.style.display            = active ? '' : 'none'
      tab.style.color                = active ? '#7C3AED' : '#9CA3AF'
      tab.style.borderBottomColor    = active ? '#7C3AED' : 'transparent'
    })
    if (n === 1) refreshAll()
    if (n === 2) { refreshKpis('2') }
    if (n === 4 && window.vpiRenderRewards) window.vpiRenderRewards()
    if (n === 5 && window.vpiRenderMissoes) window.vpiRenderMissoes()
  }

  function vpiToggle(id) {
    var el    = document.getElementById('vpiSec'   + id.replace('sec', ''))
    var arrow = document.getElementById('vpiArrow' + id.replace('sec', ''))
    if (!el) return
    var open = el.style.display !== 'none'
    el.style.display        = open ? 'none' : ''
    if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)'
  }

  // ══════════════════════════════════════════════════
  //  Sort
  // ══════════════════════════════════════════════════
  function vpiSetSort(val) {
    _sort = val
    document.querySelectorAll('.vpi-sort-btn').forEach(function (b) {
      var active = b.dataset.sort === val
      b.style.background  = active ? '#7C3AED' : '#F3F4F6'
      b.style.color       = active ? '#fff'    : '#374151'
      b.style.borderColor = active ? '#7C3AED' : '#E5E7EB'
    })
    vpiRenderRanking(''); vpiRenderRanking('2')
  }

  // ══════════════════════════════════════════════════
  //  KPIs
  // ══════════════════════════════════════════════════
  async function refreshKpis(suffix) {
    if (!window.VPIService) return
    var kpis = await VPIService.loadKpis()
    var s = suffix || ''
    var set = function (id, v) { var el = document.getElementById(id + s); if (el) el.textContent = v }
    set('vpiKpiTotal',  (kpis.parceiros_ativos || 0))
    set('vpiKpiMes',    (kpis.indicacoes_mes || 0))
    set('vpiKpiRecomp', (kpis.recompensas_liberadas || 0))
    set('vpiKpiConv',   (kpis.taxa_conversao || 0) + '%')
  }

  // ══════════════════════════════════════════════════
  //  Ranking render (reuses vpi-ranking module)
  // ══════════════════════════════════════════════════
  async function vpiRenderRanking(suffix) {
    if (window.VPIRankingUI && window.VPIRankingUI.render) {
      await window.VPIRankingUI.render(suffix || '', _sort)
    }
  }

  async function refreshAll() {
    await Promise.all([
      refreshKpis(''),
      refreshKpis('2'),
      vpiRenderRanking(''),
      vpiRenderRanking('2'),
    ])
  }

  // ══════════════════════════════════════════════════
  //  Partner modal (manual create)
  // ══════════════════════════════════════════════════
  function vpiOpenAddPartner() {
    var m = document.getElementById('vpiAddPartnerModal')
    if (m) m.style.display = 'flex'
  }

  function vpiCloseAddPartner() {
    var m = document.getElementById('vpiAddPartnerModal')
    if (m) m.style.display = 'none'
    ;['vpiPNome', 'vpiPTel', 'vpiPEmail', 'vpiPCidade', 'vpiPProfissao'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = ''
    })
    var pref = document.getElementById('vpiPTelPref'); if (pref) pref.value = '+55'
    var est  = document.getElementById('vpiPEstado');  if (est)  est.value  = ''
    var tipo = document.getElementById('vpiPTipo');    if (tipo) tipo.value = 'paciente'
  }

  async function vpiSavePartner() {
    var g = function (id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : '' }
    var nome  = g('vpiPNome')
    var tel   = g('vpiPTelPref') + ' ' + g('vpiPTel')
    var telD  = g('vpiPTel')

    if (!nome || !telD) { alert('Nome e WhatsApp sao obrigatorios.'); return }

    try {
      await VPIService.upsertPartner({
        nome:      nome,
        phone:     tel,
        email:     g('vpiPEmail'),
        cidade:    g('vpiPCidade'),
        estado:    g('vpiPEstado'),
        profissao: g('vpiPProfissao'),
        tipo:      g('vpiPTipo') || 'paciente',
        origem:    'manual',
        status:    'ativo',
      })
      vpiCloseAddPartner()
      await refreshAll()
      _toast('Parceiro cadastrado', nome + ' entrou no programa', 'success')
    } catch (e) {
      console.error('[VPI] savePartner:', e)
      alert('Erro ao cadastrar: ' + (e && e.message || 'tente novamente'))
    }
  }

  async function vpiDeletePartner(id) {
    if (!confirm('Remover este parceiro?')) return
    try {
      if (window._sbShared) {
        var res = await window._sbShared.from('vpi_partners').delete().eq('id', id)
        if (res.error) throw new Error(res.error.message)
      }
      VPIService.invalidatePartners()
      await refreshAll()
    } catch (e) {
      console.error('[VPI] deletePartner:', e)
      alert('Nao foi possivel remover: ' + (e.message || ''))
    }
  }

  function vpiViewPartner(id) {
    if (window.VPIPartnerModal && window.VPIPartnerModal.open) {
      window.VPIPartnerModal.open(id)
    }
  }

  // ══════════════════════════════════════════════════
  //  Alta Performance — trigger manual
  // ══════════════════════════════════════════════════
  async function vpiCheckHighPerfNow() {
    var sb = window._sbShared
    if (!sb) { _toast('Erro', 'Supabase indisponivel', 'error'); return }
    if (!confirm('Verificar todas as parceiras agora?\n\nIsso checa Niveis 1/2/3 (50/100/150 indicacoes em 11 meses) e, se algum partner bater o criterio, registra a recompensa e envia a msg WA.\n\npg_cron ja roda isso automaticamente todo dia 1 as 11h BRT — use so pra teste ou emergencia.')) return
    _toast('Alta Performance', 'Verificando...', 'info')
    try {
      var res = await sb.rpc('vpi_high_performance_check')
      if (res.error) throw new Error(res.error.message)
      var r = res.data || {}
      var hits = Array.isArray(r.hits) ? r.hits : []
      var msg = 'Check concluido: ' + hits.length + ' hit(s), ' +
        (r.emitted_count || 0) + ' recompensa(s) registrada(s), ' +
        (r.wa_count || 0) + ' WA enviada(s)' +
        ((r.wa_failed || 0) > 0 ? ' (' + r.wa_failed + ' falha WA)' : '')
      _toast('Alta Performance', msg, hits.length > 0 ? 'success' : 'info')
      if (hits.length > 0) {
        var detail = hits.map(function (h) { return '- ' + (h.partner_nome || h.partner_id) + ': ' + (h.recompensa || h.threshold) }).join('\n')
        alert('Hits encontrados:\n\n' + detail)
      }
    } catch (e) {
      console.error('[VPI] vpiCheckHighPerfNow:', e)
      _toast('Erro', e.message || 'Falha ao verificar', 'error')
    }
  }

  // ══════════════════════════════════════════════════
  //  Init
  // ══════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', function () {
    // Primeiro render das paginas VPI
    setTimeout(refreshAll, 500)
  })

  // Expor API publica
  window.vpiSwitchTab      = vpiSwitchTab
  window.vpiToggle         = vpiToggle
  window.vpiSetSort        = vpiSetSort
  window.vpiRefreshKpis    = refreshKpis
  window.vpiRenderRanking  = vpiRenderRanking
  window.vpiOpenAddPartner = vpiOpenAddPartner
  window.vpiCloseAddPartner = vpiCloseAddPartner
  window.vpiSavePartner    = vpiSavePartner
  window.vpiDeletePartner  = vpiDeletePartner
  window.vpiViewPartner    = vpiViewPartner
  window.vpiCheckHighPerfNow = vpiCheckHighPerfNow
  // Legacy: vpiAutoEnroll/vpiScheduleWA ficam como shims para quem chama old code
  window.vpiAutoEnroll     = function (appt) { return window.VPIEngine && VPIEngine.autoEnroll(appt) }
  window.vpiScheduleWA     = function (p)    { return window.VPIEngine && VPIEngine.scheduleInviteWA(p) }
})()
