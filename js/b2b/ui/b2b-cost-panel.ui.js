/**
 * ClinicAI — B2B Cost Panel (Fraqueza #8)
 *
 * Painel inline no detalhe da parceria: custo real acumulado.
 *   - Vouchers resgatados × voucher_unit_cost_brl
 *   - Eventos/exposições × cost_estimate_brl
 *   - Over-cap warning se passou do monthly_value_cap_brl
 *
 * Consome: B2BCostRepository.
 * Expõe window.B2BCostPanel.
 */
;(function () {
  'use strict'
  if (window.B2BCostPanel) return

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

  async function mount(hostId, partnershipId) {
    var host = document.getElementById(hostId)
    if (!host || !partnershipId) return
    if (!window.B2BCostRepository) return
    host.innerHTML = '<div class="b2b-cost-panel b2b-cost-loading">Calculando custo…</div>'

    try {
      var d = await window.B2BCostRepository.byPartnership(partnershipId)
      if (!d || !d.ok) { host.innerHTML = ''; return }

      var totalCls = d.over_cap ? 'b2b-cost-over' : 'b2b-cost-ok'
      var unitLabel = d.voucher_unit_cost_brl != null
        ? _fmtBRL(d.voucher_unit_cost_brl) + '/voucher'
        : '<span class="b2b-cost-hint">sem custo unitário cadastrado</span>'

      host.innerHTML =
        '<div class="b2b-cost-panel">' +
          '<div class="b2b-sec-title">Custo real acumulado</div>' +
          '<div class="b2b-cost-grid">' +
            '<div class="b2b-cost-cell"><span class="b2b-cost-lbl">Vouchers resgatados</span>' +
              '<strong>' + d.voucher_redeemed + '</strong>' +
              '<span class="b2b-cost-sub">' + unitLabel + '</span></div>' +
            '<div class="b2b-cost-cell"><span class="b2b-cost-lbl">Custo vouchers</span>' +
              '<strong>' + _fmtBRL(d.voucher_total_cost) + '</strong></div>' +
            '<div class="b2b-cost-cell"><span class="b2b-cost-lbl">Exposições grupo</span>' +
              '<strong>' + d.group_exposures + '</strong>' +
              '<span class="b2b-cost-sub">' + (d.group_reach || 0) + ' alcançadas</span></div>' +
            '<div class="b2b-cost-cell"><span class="b2b-cost-lbl">Custo eventos</span>' +
              '<strong>' + _fmtBRL(d.group_total_cost) + '</strong></div>' +
            '<div class="b2b-cost-cell b2b-cost-total ' + totalCls + '">' +
              '<span class="b2b-cost-lbl">Total</span>' +
              '<strong>' + _fmtBRL(d.total_cost) + '</strong>' +
              (d.monthly_cap_brl != null
                ? '<span class="b2b-cost-sub">teto: ' + _fmtBRL(d.monthly_cap_brl) + '</span>'
                : '') +
            '</div>' +
          '</div>' +
          (d.over_cap
            ? '<div class="b2b-cost-warn">Custo passou do teto mensal configurado — revise a parceria.</div>'
            : '') +
          (d.voucher_unit_cost_brl == null && d.voucher_redeemed > 0
            ? '<div class="b2b-cost-hint-box">Cadastre o custo unitário do voucher na edição da parceria pra ver valores reais.</div>'
            : '') +
        '</div>'
    } catch (e) {
      host.innerHTML = '<div class="b2b-empty b2b-empty-err">Custo indisponível: ' + _esc(e.message) + '</div>'
    }
  }

  window.B2BCostPanel = Object.freeze({ mount: mount })
})()
