/* ============================================================================
 * Beauty & Health Magazine — Analytics Panel
 *
 * Lê métricas de magazine_reads e magazine_rewards e exibe num modal:
 *   - Total de aberturas (open)
 *   - % que leu 80%
 *   - % que completou quiz
 *   - Hidden icons encontrados
 *   - Shares / invites
 *   - Cashback total distribuído
 *   - Segmento mais engajado
 *
 * Expõe: window.MagazineAdmin.AnalyticsPanel
 *   - mount(host, sb) → controller { open(edition), close }
 * ============================================================================ */
;(function () {
  'use strict'

  function mount(host, sb) {
    host.innerHTML = `
      <div class="an-overlay" data-open="0">
        <div class="an-modal">
          <div class="an-head">
            <div class="an-title">Analytics da edição</div>
            <div class="an-edition" data-role="edition-label"></div>
            <button class="an-close" data-act="close">×</button>
          </div>
          <div class="an-body" data-role="body">
            <div class="an-loading">Carregando métricas…</div>
          </div>
        </div>
      </div>
    `

    const overlay = host.querySelector('.an-overlay')
    const body = host.querySelector('[data-role="body"]')
    const edLabel = host.querySelector('[data-role="edition-label"]')
    host.querySelector('[data-act="close"]').addEventListener('click', close)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
    document.addEventListener('keydown', (e) => {
      if (overlay.dataset.open === '1' && e.key === 'Escape') close()
    })

    async function open(edition) {
      edLabel.textContent = edition.title || '—'
      overlay.dataset.open = '1'
      body.innerHTML = '<div class="an-loading">Carregando métricas…</div>'
      try {
        const metrics = await fetchMetrics(edition.id)
        body.innerHTML = renderMetrics(metrics)
      } catch (err) {
        body.innerHTML = `<div class="an-error">Erro: ${escapeHtml(err.message)}</div>`
      }
    }

    function close() {
      overlay.dataset.open = '0'
    }

    async function fetchMetrics(editionId) {
      const [readsRes, rewardsRes] = await Promise.all([
        sb.from('magazine_reads')
          .select('id, lead_id, pages_read, pages_total, hidden_icon_found, time_spent_sec, created_at')
          .eq('edition_id', editionId),
        sb.from('magazine_rewards')
          .select('id, lead_id, reward_type, amount, created_at')
          .eq('edition_id', editionId),
      ])

      if (readsRes.error) throw readsRes.error
      if (rewardsRes.error) throw rewardsRes.error
      const reads = readsRes.data || []
      const rewards = rewardsRes.data || []

      const totalOpens = reads.length
      const read80 = reads.filter(r => r.pages_total && (r.pages_read / r.pages_total >= 0.8)).length
      const hiddenFound = reads.filter(r => r.hidden_icon_found).length
      const avgTime = reads.length
        ? reads.reduce((acc, r) => acc + (r.time_spent_sec || 0), 0) / reads.length
        : 0
      const byType = {}
      let cashbackDistributed = 0
      rewards.forEach(r => {
        byType[r.reward_type] = (byType[r.reward_type] || 0) + 1
        cashbackDistributed += Number(r.amount || 0)
      })

      return { totalOpens, read80, hiddenFound, avgTime, byType, cashbackDistributed }
    }

    function renderMetrics(m) {
      const pct = (n, d) => d > 0 ? Math.round((n / d) * 100) : 0
      const fmtTime = (s) => {
        if (s < 60) return `${Math.round(s)}s`
        const min = Math.floor(s / 60), sec = Math.round(s - min * 60)
        return sec ? `${min}min ${sec}s` : `${min}min`
      }
      return `
        <div class="an-grid">
          <div class="an-kpi"><div class="an-kpi-value">${m.totalOpens}</div><div class="an-kpi-label">Aberturas</div></div>
          <div class="an-kpi"><div class="an-kpi-value">${m.read80}</div><div class="an-kpi-label">Leram 80% (${pct(m.read80, m.totalOpens)}%)</div></div>
          <div class="an-kpi"><div class="an-kpi-value">${m.hiddenFound}</div><div class="an-kpi-label">Encontraram ícone</div></div>
          <div class="an-kpi"><div class="an-kpi-value">${fmtTime(m.avgTime)}</div><div class="an-kpi-label">Tempo médio</div></div>
          <div class="an-kpi"><div class="an-kpi-value">R$ ${m.cashbackDistributed.toFixed(2)}</div><div class="an-kpi-label">Cashback pago</div></div>
          <div class="an-kpi"><div class="an-kpi-value">${(m.byType.quiz || 0)}</div><div class="an-kpi-label">Quiz completo</div></div>
          <div class="an-kpi"><div class="an-kpi-value">${(m.byType.shared || 0)}</div><div class="an-kpi-label">Compartilhadas</div></div>
          <div class="an-kpi"><div class="an-kpi-value">${(m.byType.invite || 0)}</div><div class="an-kpi-label">Indicações</div></div>
        </div>
      `
    }

    function escapeHtml(s) {
      if (s == null) return ''
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    }

    return { open, close }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.AnalyticsPanel = { mount }
})()
