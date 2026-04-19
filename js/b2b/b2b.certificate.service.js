/**
 * ClinicAI — B2B Certificate Service (WOW #10)
 *
 * Gera certificado formal de encerramento de parceria.
 * Abre em nova aba com HTML A4 pronto pra Imprimir → PDF.
 *
 * Zero cruzamento com b2b.dossier.service.js (esse é o
 * dossiê de apresentação; certificado é honraria de saída).
 *
 * Expõe window.B2BCertificateService.
 */
;(function () {
  'use strict'
  if (window.B2BCertificateService) return

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _fmtDateLong(iso) {
    if (!iso) return ''
    try {
      return new Date(iso).toLocaleDateString('pt-BR',
        { day:'numeric', month:'long', year:'numeric' })
    } catch (_) { return '' }
  }
  function _monthsDiff(start, end) {
    if (!start) return 0
    var s = new Date(start), e = end ? new Date(end) : new Date()
    return Math.max(1, Math.round((e - s) / (1000 * 60 * 60 * 24 * 30)))
  }

  function _css() {
    return [
      '@page { size: A4 landscape; margin: 0; }',
      'body { margin: 0; padding: 0; font-family: "Cormorant Garamond", Georgia, serif;',
      '       background: #0F0D0A; color: #F5F0E8; }',
      '.cert-page { width: 297mm; height: 210mm; padding: 22mm 30mm;',
      '             background: linear-gradient(135deg, #0F0D0A 0%, #1A1713 50%, #211D17 100%);',
      '             position: relative; overflow: hidden; box-sizing: border-box;',
      '             display: flex; flex-direction: column; align-items: center; }',
      '.cert-border { position: absolute; top: 8mm; left: 8mm; right: 8mm; bottom: 8mm;',
      '               border: 2px solid rgba(201,169,110,0.35); border-radius: 2mm; pointer-events: none; }',
      '.cert-border::before, .cert-border::after { content:""; position:absolute; width: 50mm; height: 50mm;',
      '               border: 1px solid rgba(201,169,110,0.4); }',
      '.cert-border::before { top: -3mm; left: -3mm; border-right:none; border-bottom:none; }',
      '.cert-border::after  { bottom: -3mm; right: -3mm; border-left:none; border-top:none; }',
      '.cert-eyebrow { font-family: "Montserrat", sans-serif; font-size: 11px;',
      '                letter-spacing: 6px; text-transform: uppercase; color: #C9A96E;',
      '                margin-top: 8mm; font-weight: 500; }',
      '.cert-clinic { font-size: 28px; color: #DFC5A0; font-weight: 300;',
      '               letter-spacing: 2px; margin: 4mm 0 12mm; font-style: italic; }',
      '.cert-title { font-size: 68px; font-weight: 300; letter-spacing: 3px;',
      '              text-transform: uppercase; color: #DFC5A0; line-height: 1;',
      '              text-align: center; margin: 6mm 0 2mm; }',
      '.cert-sub { font-size: 18px; font-style: italic; color: #C9A96E; margin-bottom: 16mm; }',
      '.cert-body { font-size: 20px; line-height: 1.7; color: #F5F0E8;',
      '             max-width: 200mm; text-align: center; margin: 0 auto; }',
      '.cert-body strong { color: #DFC5A0; font-weight: 500; }',
      '.cert-partner-name { font-size: 44px; color: #DFC5A0; font-weight: 400;',
      '                     margin: 8mm 0; letter-spacing: 1px; display: block; text-align: center; }',
      '.cert-stats { display: flex; gap: 40mm; justify-content: center; margin: 12mm 0 0; }',
      '.cert-stat { text-align: center; }',
      '.cert-stat strong { font-size: 38px; color: #DFC5A0; display: block; font-weight: 400; }',
      '.cert-stat span { font-family: "Montserrat", sans-serif; font-size: 10px;',
      '                  letter-spacing: 3px; text-transform: uppercase; color: #7A7165; }',
      '.cert-signature { margin-top: auto; display: flex; gap: 24mm;',
      '                  justify-content: center; align-items: flex-end; padding-top: 10mm; }',
      '.sig-block { text-align: center; min-width: 80mm; }',
      '.sig-line { border-bottom: 1px solid rgba(201,169,110,0.5); margin-bottom: 3mm; height: 18mm; }',
      '.sig-name { font-size: 16px; color: #DFC5A0; font-style: italic; }',
      '.sig-role { font-family: "Montserrat", sans-serif; font-size: 9px;',
      '            letter-spacing: 3px; text-transform: uppercase; color: #7A7165; margin-top: 2mm; }',
      '.cert-footer { font-family: "Montserrat", sans-serif; font-size: 10px;',
      '               letter-spacing: 3px; text-transform: uppercase; color: #7A7165;',
      '               margin-top: 8mm; text-align: center; }',
      '.actions { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; z-index: 1000; }',
      '.actions button { padding: 10px 18px; background: #C9A96E; color: #0F0D0A;',
      '                  border: none; font-family: "Montserrat", sans-serif;',
      '                  font-size: 11px; text-transform: uppercase; letter-spacing: 2px;',
      '                  cursor: pointer; border-radius: 4px; font-weight: 600; }',
      '.actions button:hover { background: #DFC5A0; }',
      '.actions .btn-alt { background: transparent; color: #F5F0E8; border: 1px solid rgba(245,240,232,0.3); }',
      '@media print { .actions { display: none; } body { background: #0F0D0A; } }',
    ].join('\n')
  }

  function _render(partnership, context) {
    var p = partnership || {}
    var ctx = context || {}
    var months = _monthsDiff(p.created_at, ctx.closed_at || null)
    var vouchersRedeemed = ctx.vouchers_redeemed || (ctx.funnel && ctx.funnel.redeemed) || 0

    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
      '<title>Certificado · ' + _esc(p.name || 'Parceria') + '</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">' +
      '<style>' + _css() + '</style></head><body>' +
      '<div class="actions">' +
        '<button onclick="window.print()">Imprimir / PDF</button>' +
        '<button class="btn-alt" onclick="window.close()">Fechar</button>' +
      '</div>' +
      '<div class="cert-page">' +
        '<div class="cert-border"></div>' +
        '<div class="cert-eyebrow">Círculo Mirian de Paula</div>' +
        '<div class="cert-clinic">Clínica Mirian de Paula · Maringá</div>' +

        '<h1 class="cert-title">Certificado</h1>' +
        '<div class="cert-sub">Parceria formal encerrada</div>' +

        '<div class="cert-body">' +
          'Conferimos este certificado a' +
          '<span class="cert-partner-name">' + _esc(p.name || '—') + '</span>' +
          'pela parceria formalizada com a Clínica Mirian de Paula, construída com cuidado, ' +
          'excelência e afeto ao longo de ' +
          '<strong>' + months + ' ' + (months === 1 ? 'mês' : 'meses') + '</strong>' +
          (vouchersRedeemed ? ', impactando <strong>' + vouchersRedeemed + ' experiências</strong> de beleza e cuidado' : '') +
          '. Que esta relação continue, em outros formatos, na história de quem passou por ela.' +
        '</div>' +

        '<div class="cert-stats">' +
          '<div class="cert-stat">' +
            '<strong>' + months + '</strong>' +
            '<span>' + (months === 1 ? 'mês de parceria' : 'meses de parceria') + '</span>' +
          '</div>' +
          (vouchersRedeemed ? '<div class="cert-stat">' +
            '<strong>' + vouchersRedeemed + '</strong>' +
            '<span>clientes impactadas</span>' +
          '</div>' : '') +
          (p.tier ? '<div class="cert-stat">' +
            '<strong>T' + p.tier + '</strong>' +
            '<span>Tier da parceria</span>' +
          '</div>' : '') +
        '</div>' +

        '<div class="cert-signature">' +
          '<div class="sig-block">' +
            '<div class="sig-line"></div>' +
            '<div class="sig-name">Mirian de Paula</div>' +
            '<div class="sig-role">Clínica Mirian de Paula</div>' +
          '</div>' +
          '<div class="sig-block">' +
            '<div class="sig-line"></div>' +
            '<div class="sig-name">' + _esc(p.contact_name || p.name || '—') + '</div>' +
            '<div class="sig-role">' + _esc(p.name || 'Parceira') + '</div>' +
          '</div>' +
        '</div>' +

        '<div class="cert-footer">' +
          'Maringá · ' + _fmtDateLong(ctx.closed_at || new Date().toISOString()) +
        '</div>' +
      '</div>' +
    '</body></html>'
  }

  function open(partnership, context) {
    var html = _render(partnership, context)
    var win = window.open('', '_blank')
    if (!win) {
      var blob = new Blob([html], { type: 'text/html' })
      var url = URL.createObjectURL(blob)
      var a = document.createElement('a')
      a.href = url; a.target = '_blank'; a.rel = 'noopener'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  window.B2BCertificateService = Object.freeze({ open: open })
})()
