/**
 * ClinicAI — B2B ROI Panel
 *
 * Painel inline no detalhe: ROI real da parceria + histórico de leads.
 * Cruza b2b_attributions com appointments pra medir conversão em R$.
 *
 * Consome: B2BAttributionRepository.
 * Expõe window.B2BRoiPanel.
 */
;(function () {
  'use strict'
  if (window.B2BRoiPanel) return

  var STATUS_META = {
    referred:  { label:'Indicado',   color:'#64748B' },
    matched:   { label:'Foi à clínica', color:'#60A5FA' },
    converted: { label:'Converteu',  color:'#10B981' },
    lost:      { label:'Perdido',    color:'#EF4444' },
  }
  var SOURCE_META = {
    wa_mira:      'Via Mira',
    admin_manual: 'Manual',
    backfill:     'Histórico',
    import:       'Importado',
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _fmtBRL(v) {
    if (v == null) return '—'
    try { return Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 }) }
    catch (_) { return 'R$ ' + v }
  }
  function _fmtDate(iso) {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString('pt-BR') } catch (_) { return '' }
  }
  function _fmtPhone(p) {
    if (!p) return '—'
    var d = String(p).replace(/\D/g, '')
    if (d.length >= 11) return '('+d.slice(-11,-9)+') '+d.slice(-9,-4)+'-'+d.slice(-4)
    if (d.length === 10) return '('+d.slice(0,2)+') '+d.slice(2,6)+'-'+d.slice(6)
    return p
  }

  async function mount(hostId, partnershipId) {
    var host = document.getElementById(hostId)
    if (!host || !partnershipId) return
    if (!window.B2BAttributionRepository) return
    host.innerHTML = '<div class="b2b-roi-panel b2b-roi-loading">Calculando retorno…</div>'

    try {
      var [roi, leads] = await Promise.all([
        window.B2BAttributionRepository.roi(partnershipId),
        window.B2BAttributionRepository.leads(partnershipId, 50),
      ])
      if (!roi) { host.innerHTML = ''; return }

      var leadsArr = Array.isArray(leads) ? leads : []
      var roiBand = roi.roi_pct == null ? { lbl:'Sem custo pra medir', color:'#64748B' }
        : roi.roi_pct >= 100 ? { lbl:'ROI positivo (+' + roi.roi_pct + '%)', color:'#10B981' }
        : roi.roi_pct >= 0   ? { lbl:'Empate (' + roi.roi_pct + '%)',       color:'#60A5FA' }
        :                      { lbl:'Prejuízo (' + roi.roi_pct + '%)',     color:'#EF4444' }

      host.innerHTML =
        '<div class="b2b-roi-panel">' +
          '<div class="b2b-sec-title">Retorno real (registro + conversão)</div>' +

          '<div class="b2b-roi-hero">' +
            '<div class="b2b-roi-kpis">' +
              '<div class="b2b-roi-kpi"><span>Indicados</span><strong>' + (roi.referred || 0) + '</strong></div>' +
              '<div class="b2b-roi-kpi"><span>Foram à clínica</span><strong>' + (roi.matched || 0) + '</strong></div>' +
              '<div class="b2b-roi-kpi"><span>Converteram</span><strong style="color:#10B981">' + (roi.converted || 0) + '</strong></div>' +
              '<div class="b2b-roi-kpi"><span>Taxa conversão</span><strong>' +
                (roi.conversion_rate != null ? roi.conversion_rate + '%' : '—') +
              '</strong></div>' +
            '</div>' +
            '<div class="b2b-roi-money">' +
              '<div class="b2b-roi-money-line"><span>Faturamento</span><strong>' + _fmtBRL(roi.revenue_brl) + '</strong></div>' +
              '<div class="b2b-roi-money-line"><span>Custo</span><strong>' + _fmtBRL(roi.cost_brl) + '</strong></div>' +
              '<div class="b2b-roi-money-line b2b-roi-money-total" style="border-color:' + roiBand.color + '">' +
                '<span>Líquido</span><strong style="color:' + roiBand.color + '">' + _fmtBRL(roi.net_brl) + '</strong>' +
              '</div>' +
              '<div class="b2b-roi-band" style="background:' + roiBand.color + '">' + roiBand.lbl + '</div>' +
            '</div>' +
          '</div>' +

          '<div class="b2b-roi-hist">' +
            '<div class="b2b-roi-hist-hdr">' +
              'Histórico de indicações (' + leadsArr.length + ')' +
              '<button type="button" class="b2b-btn b2b-roi-rescan">Cruzar com agendamentos</button>' +
            '</div>' +
            (leadsArr.length
              ? '<div class="b2b-roi-table">' +
                  '<div class="b2b-roi-head">' +
                    '<span>Lead</span><span>Telefone</span><span>Origem</span>' +
                    '<span>Indicado em</span><span>Status</span><span>R$</span>' +
                  '</div>' +
                  leadsArr.map(function (l) {
                    var m = STATUS_META[l.status] || { label: l.status, color:'#64748B' }
                    return '<div class="b2b-roi-row">' +
                      '<span class="b2b-roi-name">' + _esc(l.lead_name || '(sem nome)') + '</span>' +
                      '<span class="b2b-roi-phone">' + _esc(_fmtPhone(l.lead_phone)) + '</span>' +
                      '<span class="b2b-roi-src">' + _esc(SOURCE_META[l.source] || l.source || '—') + '</span>' +
                      '<span class="b2b-roi-date">' + _esc(_fmtDate(l.created_at)) + '</span>' +
                      '<span class="b2b-roi-status"><i style="background:' + m.color + '"></i>' + _esc(m.label) + '</span>' +
                      '<span class="b2b-roi-rev">' + (Number(l.revenue_brl) > 0 ? _fmtBRL(l.revenue_brl) : '—') + '</span>' +
                    '</div>'
                  }).join('') +
                '</div>'
              : '<div class="b2b-empty" style="padding:20px;font-style:italic">Nenhum lead indicado ainda. Ao emitir voucher, aparece aqui.</div>'
            ) +
          '</div>' +

        '</div>'

      var rescan = host.querySelector('.b2b-roi-rescan')
      if (rescan) rescan.addEventListener('click', async function () {
        rescan.disabled = true
        rescan.textContent = 'Cruzando…'
        try {
          var r = await window.B2BAttributionRepository.scan(180)
          if (window.B2BToast) window.B2BToast.success('Rescan: ' + (r.rows_updated || 0) + ' atualizadas · ' + (r.total_converted || 0) + ' convertidas')
          mount(hostId, partnershipId)
        } catch (e) {
          if (window.B2BToast) window.B2BToast.error('Falha: ' + (e.message || e))
          rescan.disabled = false
          rescan.textContent = 'Cruzar com agendamentos'
        }
      })
    } catch (e) {
      host.innerHTML = '<div class="b2b-empty b2b-empty-err">ROI indisponível: ' + _esc(e.message) + '</div>'
    }
  }

  window.B2BRoiPanel = Object.freeze({ mount: mount })
})()
