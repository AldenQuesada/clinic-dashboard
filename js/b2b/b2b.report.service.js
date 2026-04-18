/**
 * ClinicAI — B2B Report Service
 *
 * Gera relatório mensal de uma parceria como HTML impresso (vira PDF
 * via window.print). Sem dependência externa (jsPDF, html2pdf etc).
 *
 * Puro: recebe dados, retorna HTML + abre janela de impressão.
 * Zero I/O: chamador passa tudo (partnership + funnel + health).
 *
 * Expõe window.B2BReportService.
 */
;(function () {
  'use strict'
  if (window.B2BReportService) return

  var COLORS = {
    green:   '#10B981',
    yellow:  '#F59E0B',
    red:     '#EF4444',
    unknown: '#9CA3AF',
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _fmtBRL(v) {
    if (v == null || v === '') return '—'
    try { return Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 }) }
    catch (_) { return 'R$ ' + v }
  }
  function _fmtDate(iso) {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString('pt-BR', { day:'numeric', month:'long', year:'numeric' }) }
    catch (_) { return iso }
  }
  function _monthLabel() {
    return new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' })
  }

  function _kv(label, value) {
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return ''
    var display = Array.isArray(value) ? value.join(', ') : String(value)
    return '<tr><td class="k">' + _esc(label) + '</td><td class="v">' + _esc(display) + '</td></tr>'
  }

  function _funnelTable(funnel) {
    var f = funnel || {}
    var rows = [
      ['Emitidos',   f.issued    || 0],
      ['Entregues',  f.delivered || 0],
      ['Abertos',    f.opened    || 0],
      ['Resgatados', f.redeemed  || 0],
      ['Expirados',  f.expired   || 0],
      ['Cancelados', f.cancelled || 0],
    ]
    var conv = (f.issued > 0) ? Math.round((f.redeemed || 0) * 100 / f.issued) : null
    return '<table class="b2brep-table">' +
      '<thead><tr><th>Etapa do voucher</th><th>Qtd</th></tr></thead>' +
      '<tbody>' + rows.map(function (r) {
        return '<tr><td>' + r[0] + '</td><td>' + r[1] + '</td></tr>'
      }).join('') + '</tbody>' +
    '</table>' +
    (conv !== null ? '<div class="b2brep-note">Conversão voucher→resgate: ' + conv + '%</div>' : '')
  }

  function _healthBar(partnership) {
    var color = COLORS[partnership.health_color] || COLORS.unknown
    return '<div class="b2brep-health" style="border-left-color:' + color + '">' +
      '<strong style="color:' + color + '">Saúde: ' + _esc(partnership.health_color || 'unknown') + '</strong>' +
      (partnership.dna_score != null ? ' · DNA ' + Number(partnership.dna_score).toFixed(1) + '/10' : '') +
    '</div>'
  }

  function _buildHtml(ctx) {
    var p = (ctx && ctx.partnership) || {}
    var funnel = ctx && ctx.funnel
    var month = _monthLabel()

    return '<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8">' +
      '<title>Relatório · ' + _esc(p.name) + ' · ' + _esc(month) + '</title>' +
      '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Montserrat:wght@300;400;500;600;700&display=swap" rel="stylesheet">' +
      '<style>' +
        '@page { size: A4; margin: 20mm; }' +
        'body { font-family: Montserrat, sans-serif; font-weight: 300; color: #2a2520; line-height: 1.6; }' +
        '.b2brep-hdr { border-bottom: 2px solid #C9A96E; padding-bottom: 16px; margin-bottom: 28px; }' +
        '.b2brep-eyebrow { font-size: 10px; letter-spacing: 4px; text-transform: uppercase; color: #C9A96E; font-weight: 600; }' +
        '.b2brep-title { font-family: "Cormorant Garamond", serif; font-size: 36px; font-weight: 300; color: #1a1713; margin: 8px 0 4px; }' +
        '.b2brep-title em { font-style: italic; color: #A8895E; }' +
        '.b2brep-meta { font-size: 12px; color: #7a7165; }' +
        '.b2brep-sec { font-size: 10px; letter-spacing: 2px; text-transform: uppercase; color: #C9A96E; font-weight: 600; margin: 24px 0 10px; border-bottom: 1px solid #eee; padding-bottom: 6px; }' +
        '.b2brep-table { width: 100%; border-collapse: collapse; margin: 6px 0 16px; font-size: 12px; }' +
        '.b2brep-table th, .b2brep-table td { padding: 8px 10px; border-bottom: 1px solid #eee; text-align: left; }' +
        '.b2brep-table th { background: #F5F0E8; color: #A8895E; font-size: 10px; letter-spacing: 1.5px; text-transform: uppercase; font-weight: 600; }' +
        '.b2brep-table td.k { color: #7a7165; width: 35%; }' +
        '.b2brep-table td.v { color: #1a1713; }' +
        '.b2brep-cols { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }' +
        '.b2brep-note { font-size: 11px; color: #7a7165; font-style: italic; margin-top: 4px; }' +
        '.b2brep-health { border-left: 3px solid #9CA3AF; padding: 8px 12px; background: #F5F0E8; margin: 10px 0 20px; font-size: 13px; }' +
        '.b2brep-slogan { font-family: "Cormorant Garamond", serif; font-style: italic; font-size: 15px; color: #A8895E; margin: 12px 0; padding: 10px 14px; border-left: 2px solid #C9A96E; background: #faf6ed; }' +
        '.b2brep-footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; font-family: "Cormorant Garamond", serif; font-style: italic; color: #A8895E; font-size: 14px; }' +
        '@media print { .b2brep-noprint { display: none !important; } }' +
        '.b2brep-noprint-bar { position: fixed; top: 0; left: 0; right: 0; background: #C9A96E; padding: 12px; text-align: center; font-family: Montserrat, sans-serif; font-size: 13px; color: #1a1713; z-index: 1000; }' +
        '.b2brep-noprint-bar button { margin: 0 6px; padding: 6px 16px; background: #1a1713; color: #fff; border: none; border-radius: 4px; cursor: pointer; font-family: Montserrat, sans-serif; font-size: 12px; font-weight: 600; }' +
      '</style></head><body>' +

      '<div class="b2brep-noprint b2brep-noprint-bar">' +
        'Relatório pronto. ' +
        '<button onclick="window.print()">Imprimir / Salvar PDF</button>' +
        '<button onclick="window.close()">Fechar</button>' +
      '</div>' +
      '<div style="height:50px"></div>' +

      '<div class="b2brep-hdr">' +
        '<div class="b2brep-eyebrow">Círculo Mirian de Paula · Relatório Mensal</div>' +
        '<h1 class="b2brep-title">' + _esc(p.name) + ' <em>· ' + _esc(month) + '</em></h1>' +
        '<div class="b2brep-meta">' +
          (p.pillar ? 'Pilar: ' + _esc(p.pillar) + ' · ' : '') +
          (p.tier ? 'Tier ' + p.tier + ' · ' : '') +
          'Status: ' + _esc(p.status || '—') +
        '</div>' +
      '</div>' +

      _healthBar(p) +

      ((p.slogans && p.slogans.length)
        ? '<div class="b2brep-slogan">' + _esc(p.slogans[0]) + '</div>' : '') +

      '<div class="b2brep-cols">' +
        '<div>' +
          '<div class="b2brep-sec">Contato</div>' +
          '<table class="b2brep-table">' +
            _kv('Responsável', p.contact_name) +
            _kv('Telefone',    p.contact_phone) +
            _kv('Instagram',   p.contact_instagram) +
            _kv('Site',        p.contact_website) +
          '</table>' +

          '<div class="b2brep-sec">Voucher</div>' +
          '<table class="b2brep-table">' +
            _kv('Combo',              p.voucher_combo) +
            _kv('Validade (dias)',    p.voucher_validity_days) +
            _kv('Antecedência (dias)', p.voucher_min_notice_days) +
            _kv('Cap mensal',         p.voucher_monthly_cap) +
          '</table>' +
        '</div>' +

        '<div>' +
          '<div class="b2brep-sec">Vigência</div>' +
          '<table class="b2brep-table">' +
            _kv('Teto mensal',         _fmtBRL(p.monthly_value_cap_brl)) +
            _kv('Duração (meses)',     p.contract_duration_months) +
            _kv('Próxima revisão (m)', p.review_cadence_months) +
            _kv('Sazonais',            p.sazonais) +
          '</table>' +

          '<div class="b2brep-sec">Contrapartida</div>' +
          '<table class="b2brep-table">' +
            _kv('Compromisso', p.contrapartida) +
            _kv('Cadência',    p.contrapartida_cadence) +
          '</table>' +
        '</div>' +
      '</div>' +

      (funnel ? '<div class="b2brep-sec">Funil de vouchers do mês</div>' + _funnelTable(funnel) : '') +

      (p.narrative_quote
        ? '<div class="b2brep-sec">Narrativa</div>' +
          '<div class="b2brep-slogan">' + _esc(p.narrative_quote) +
          (p.narrative_author ? '<br><small>— ' + _esc(p.narrative_author) + '</small>' : '') +
          '</div>' : '') +

      '<div class="b2brep-footer">' +
        'Clínica Mirian de Paula · Beauty & Health · Gerado em ' + _fmtDate(new Date().toISOString()) +
      '</div>' +

    '</body></html>'
  }

  /**
   * open(ctx) — abre nova janela com o relatório pronto pra imprimir/salvar PDF.
   * ctx: { partnership, funnel? }
   */
  function open(ctx) {
    var html = _buildHtml(ctx || {})
    var w = window.open('', '_blank')
    if (!w) {
      alert('Pop-up bloqueado. Permita pop-ups pra visualizar o relatório.')
      return null
    }
    w.document.write(html)
    w.document.close()
    return w
  }

  window.B2BReportService = Object.freeze({
    open: open,
    buildHtml: _buildHtml,
  })
})()
