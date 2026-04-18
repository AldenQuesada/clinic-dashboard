/**
 * ClinicAI — B2B Health Service
 *
 * Calcula saúde derivada de uma parceria (verde/amarelo/vermelho).
 * Puro: recebe dados, retorna classificação + razão. Zero I/O, zero DOM.
 *
 * Regras (Fase 2 — dados reais começam a existir):
 *   verde    = metas ≥ 80% + DNA ≥ 7 + contrapartidas em dia
 *   amarelo  = metas 50-80% OU 1 contrapartida atrasada OU DNA 5-7
 *   vermelho = metas < 50% OU DNA < 5 OU 3 meses sem atividade
 *   unknown  = dados insuficientes ou status paused/closed
 */
;(function () {
  'use strict'
  if (window.B2BHealthService) return

  var DNA_CRITICAL = 5
  var DNA_WARN     = 7

  function _monthsSince(iso) {
    if (!iso) return 999
    var d = new Date(iso)
    if (isNaN(d)) return 999
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30))
  }

  function _dnaAverage(partnership) {
    var e = Number(partnership.dna_excelencia || 0)
    var s = Number(partnership.dna_estetica   || 0)
    var p = Number(partnership.dna_proposito  || 0)
    if (!e || !s || !p) return null
    return (e + s + p) / 3
  }

  function _targetFulfillmentRate(targets, progress) {
    // progress: { indicator: actualValue } — opcional
    if (!targets || !targets.length) return null
    var sum = 0, count = 0
    targets.forEach(function (t) {
      var actual = progress && progress[t.indicator]
      if (actual == null) return
      var pct = Number(t.target_value) > 0 ? Math.min(1, actual / t.target_value) : 0
      sum += pct
      count++
    })
    return count > 0 ? sum / count : null
  }

  function _overdueEvents(events) {
    if (!events || !events.length) return 0
    var now = Date.now()
    return events.filter(function (e) {
      return e.status === 'planned' && e.next_occurrence && new Date(e.next_occurrence).getTime() < now
    }).length
  }

  /**
   * evaluate({ partnership, targets, progress, events, voucherFunnel })
   * → { color, reasons[], score }
   */
  function evaluate(ctx) {
    ctx = ctx || {}
    var p = ctx.partnership || {}
    var reasons = []

    if (['paused','closed'].indexOf(p.status) !== -1) {
      return { color: 'unknown', reasons: ['Status ' + p.status], score: null }
    }

    var color = 'green'

    // DNA
    var dna = _dnaAverage(p)
    if (dna == null) {
      reasons.push('DNA não avaliado')
      color = 'yellow'
    } else if (dna < DNA_CRITICAL) {
      reasons.push('DNA crítico (' + dna.toFixed(1) + ')')
      color = 'red'
    } else if (dna < DNA_WARN) {
      reasons.push('DNA abaixo do ideal (' + dna.toFixed(1) + ')')
      if (color === 'green') color = 'yellow'
    }

    // Metas
    var rate = _targetFulfillmentRate(ctx.targets, ctx.progress)
    if (rate != null) {
      var pct = Math.round(rate * 100)
      if (rate < 0.5) {
        reasons.push('Metas em ' + pct + '% (crítico)')
        color = 'red'
      } else if (rate < 0.8) {
        reasons.push('Metas em ' + pct + '%')
        if (color === 'green') color = 'yellow'
      } else {
        reasons.push('Metas em ' + pct + '%')
      }
    }

    // Eventos atrasados
    var overdue = _overdueEvents(ctx.events)
    if (overdue >= 2) {
      reasons.push(overdue + ' eventos atrasados')
      color = 'red'
    } else if (overdue === 1) {
      reasons.push('1 evento atrasado')
      if (color === 'green') color = 'yellow'
    }

    // Inatividade
    var monthsIdle = _monthsSince(p.updated_at)
    if (monthsIdle >= 3) {
      reasons.push(monthsIdle + ' meses sem atualização')
      color = 'red'
    }

    // Voucher funnel (opcional)
    if (ctx.voucherFunnel && ctx.voucherFunnel.issued >= 5) {
      var f = ctx.voucherFunnel
      var conv = f.issued > 0 ? f.redeemed / f.issued : 0
      if (conv < 0.1 && p.status === 'active') {
        reasons.push('Conversão voucher < 10%')
        if (color === 'green') color = 'yellow'
      }
    }

    return {
      color: color,
      reasons: reasons,
      score: dna,
    }
  }

  window.B2BHealthService = Object.freeze({
    evaluate: evaluate,
    DNA_WARN: DNA_WARN,
    DNA_CRITICAL: DNA_CRITICAL,
  })
})()
