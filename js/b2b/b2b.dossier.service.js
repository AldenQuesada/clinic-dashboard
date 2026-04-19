/**
 * ClinicAI — B2B Dossier Service (WOW #1)
 *
 * Gera o HTML luxuoso do dossiê da parceria (1 página premium com tudo
 * que o admin precisa pra apresentar em reunião trimestral ao parceiro).
 *
 * Uso: abre nova aba com HTML inline. O browser cuida do print-to-PDF.
 *
 * Sem DOM persistente — só janela popup. Zero cruzamento com b2b-report.service.js
 * (esse é o report do funil de vouchers; o dossier é narrativa + métricas + copy).
 *
 * Expõe window.B2BDossierService.
 */
;(function () {
  'use strict'
  if (window.B2BDossierService) return

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
    try { return new Date(iso).toLocaleDateString('pt-BR') } catch (_) { return '—' }
  }
  function _pillarLabel(p) {
    var M = { imagem:'Imagem', evento:'Evento', institucional:'Institucional', fitness:'Fitness',
              alimentacao:'Alimentação', saude:'Saúde', status:'Status', rede:'Rede' }
    return M[p] || p || '—'
  }
  function _statusBadge(s) {
    var M = {
      prospect:'Prospecção', dna_check:'DNA',
      contract:'Contrato', active:'Ativa',
      review:'Revisão', paused:'Pausada', closed:'Encerrada',
    }
    return M[s] || s || '—'
  }
  function _healthLabel(h) {
    return { green:'Saudável', yellow:'Atenção', red:'Crítica', unknown:'Sem dado' }[h] || '—'
  }
  function _healthColor(h) {
    return { green:'#10B981', yellow:'#F59E0B', red:'#EF4444', unknown:'#94A3B8' }[h] || '#94A3B8'
  }

  function _css() {
    return [
      '@page { size: A4; margin: 18mm 16mm; }',
      'body { font-family: "Cormorant Garamond", Georgia, serif; color: #1A1A2E;',
      '       background: #F8F5F0; margin: 0; padding: 32px 40px; line-height: 1.5; }',
      '.dossier-wrap { max-width: 760px; margin: 0 auto; background: #FFFFFF;',
      '                padding: 48px 56px; box-shadow: 0 2px 24px rgba(0,0,0,0.06); }',
      'h1 { font-size: 40px; font-weight: 400; margin: 0 0 4px; letter-spacing: 0.5px; }',
      'h2 { font-size: 14px; font-weight: 500; text-transform: uppercase; letter-spacing: 3px;',
      '     color: #B8956A; margin: 28px 0 12px; border-bottom: 1px solid #E5DDD1; padding-bottom: 6px; }',
      '.eyebrow { font-size: 11px; letter-spacing: 3px; text-transform: uppercase; color: #8B7355;',
      '           font-family: "Montserrat", sans-serif; margin-bottom: 4px; }',
      '.subtitle { font-style: italic; font-size: 18px; color: #4A4A5C; margin: 0 0 24px; }',
      '.meta-row { display: flex; gap: 24px; margin: 16px 0 28px; font-family: "Montserrat", sans-serif;',
      '            font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase; color: #6B6B7D; }',
      '.meta-row span strong { color: #1A1A2E; font-weight: 600; }',
      '.health-chip { display: inline-block; padding: 3px 10px; border-radius: 999px;',
      '              font-size: 10px; font-weight: 600; color: #FFFFFF; letter-spacing: 1px; }',
      '.quote { font-size: 22px; font-style: italic; padding: 24px 32px; border-left: 3px solid #B8956A;',
      '         color: #3A3A4C; margin: 24px 0; background: #FAF7F2; }',
      '.quote-author { font-size: 12px; font-style: normal; color: #8B7355; margin-top: 8px;',
      '                letter-spacing: 2px; text-transform: uppercase; font-family: "Montserrat", sans-serif; }',
      '.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin: 12px 0; }',
      '.grid-4 { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 12px 0; }',
      '.kpi { background: #FAF7F2; border: 1px solid #E5DDD1; border-radius: 8px;',
      '       padding: 14px 16px; text-align: center; }',
      '.kpi strong { display: block; font-size: 28px; color: #1A1A2E; font-weight: 500;',
      '              font-family: "Cormorant Garamond", serif; }',
      '.kpi span { font-size: 10px; text-transform: uppercase; letter-spacing: 2px; color: #8B7355;',
      '            font-family: "Montserrat", sans-serif; }',
      '.bullet { padding: 10px 16px; background: #FAF7F2; border-left: 3px solid #B8956A;',
      '          margin: 8px 0; font-size: 14px; color: #3A3A4C; }',
      '.targets-table { width: 100%; border-collapse: collapse; font-size: 13px; margin: 8px 0 24px; }',
      '.targets-table th { text-align: left; padding: 10px 12px; background: #1A1A2E; color: #FFFFFF;',
      '                    font-family: "Montserrat", sans-serif; font-size: 10px; letter-spacing: 1.5px;',
      '                    text-transform: uppercase; font-weight: 500; }',
      '.targets-table td { padding: 10px 12px; border-bottom: 1px solid #E5DDD1; }',
      '.footer { margin-top: 48px; padding-top: 18px; border-top: 1px solid #E5DDD1;',
      '          font-size: 10px; color: #8B7355; text-align: center; letter-spacing: 2px;',
      '          text-transform: uppercase; font-family: "Montserrat", sans-serif; }',
      '.actions { position: fixed; top: 16px; right: 16px; display: flex; gap: 8px; }',
      '.actions button { padding: 10px 18px; border: 1px solid #B8956A; background: #FFFFFF;',
      '                  color: #1A1A2E; font-size: 11px; text-transform: uppercase; letter-spacing: 2px;',
      '                  cursor: pointer; font-family: "Montserrat", sans-serif; border-radius: 4px; }',
      '.actions button:hover { background: #B8956A; color: #FFFFFF; }',
      '@media print { .actions { display: none; } body { background: #FFFFFF; padding: 0; }',
      '               .dossier-wrap { box-shadow: none; padding: 0; } }',
    ].join('\n')
  }

  function _renderDossier(data) {
    var p = data.partnership || {}
    var funnel = data.funnel || {}
    var targets = Array.isArray(data.targets) ? data.targets : []
    var events = Array.isArray(data.events) ? data.events : []
    var cost = data.cost || {}
    var trend = data.trend || {}

    var redeemRate = funnel.issued
      ? Math.round((Number(funnel.redeemed || 0) / Number(funnel.issued)) * 100) + '%'
      : '—'

    var slogans = (p.slogans || []).slice(0, 2).map(function (s) {
      return '<div class="bullet">' + _esc(s) + '</div>'
    }).join('')

    var targetsHtml = targets.length
      ? '<table class="targets-table"><thead><tr><th>Indicador</th><th>Meta</th><th>Cadência</th><th>Benefício</th></tr></thead>' +
        '<tbody>' + targets.map(function (t) {
          return '<tr><td>' + _esc(t.indicator) + '</td><td>' + _esc(t.target_value) +
            '</td><td>' + _esc(t.cadence) + '</td><td>' + _esc(t.benefit_label || '') + '</td></tr>'
        }).join('') + '</tbody></table>'
      : '<div class="bullet" style="font-style:italic;opacity:0.7">Metas ainda não definidas — executar playbook.</div>'

    var eventsHtml = events.length
      ? events.slice(0, 4).map(function (e) {
          return '<div class="bullet"><strong>' + _esc(e.title) + '</strong> · ' +
            _fmtDate(e.next_occurrence) + '</div>'
        }).join('')
      : '<div class="bullet" style="font-style:italic;opacity:0.7">Sem eventos agendados.</div>'

    return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8">' +
      '<title>Dossiê · ' + _esc(p.name || 'Parceria') + '</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,500;1,300;1,400&family=Montserrat:wght@400;500;600&display=swap" rel="stylesheet">' +
      '<style>' + _css() + '</style></head><body>' +
      '<div class="actions">' +
        '<button onclick="window.print()">Imprimir / PDF</button>' +
        '<button onclick="window.close()">Fechar</button>' +
      '</div>' +
      '<div class="dossier-wrap">' +
        '<div class="eyebrow">Círculo Mirian de Paula · Dossiê da Parceria</div>' +
        '<h1>' + _esc(p.name || 'Parceria') + '</h1>' +
        (p.category ? '<p class="subtitle">' + _pillarLabel(p.pillar) + ' · ' + _esc(p.category) + '</p>' : '<p class="subtitle">' + _pillarLabel(p.pillar) + '</p>') +

        '<div class="meta-row">' +
          '<span>Tier · <strong>' + (p.tier ? 'T' + p.tier : '—') + '</strong></span>' +
          '<span>Status · <strong>' + _statusBadge(p.status) + '</strong></span>' +
          '<span>Saúde · <span class="health-chip" style="background:' + _healthColor(p.health_color) + '">' +
            _healthLabel(p.health_color) + '</span></span>' +
          '<span>Desde · <strong>' + _fmtDate(p.created_at) + '</strong></span>' +
        '</div>' +

        (p.narrative_quote
          ? '<div class="quote">“' + _esc(p.narrative_quote) + '”' +
              (p.narrative_author ? '<div class="quote-author">— ' + _esc(p.narrative_author) + '</div>' : '') +
            '</div>'
          : '') +

        (slogans ? '<h2>Narrativa</h2>' + slogans : '') +

        (p.emotional_trigger
          ? '<h2>Gatilho emocional</h2><div class="bullet">' + _esc(p.emotional_trigger) + '</div>'
          : '') +

        '<h2>Voucher · funil</h2>' +
        '<div class="grid-4">' +
          '<div class="kpi"><strong>' + (funnel.issued || 0) + '</strong><span>Emitidos</span></div>' +
          '<div class="kpi"><strong>' + (funnel.delivered || 0) + '</strong><span>Entregues</span></div>' +
          '<div class="kpi"><strong>' + (funnel.redeemed || 0) + '</strong><span>Resgatados</span></div>' +
          '<div class="kpi"><strong>' + redeemRate + '</strong><span>Taxa resgate</span></div>' +
        '</div>' +

        '<h2>Custo real acumulado</h2>' +
        '<div class="grid-2">' +
          '<div class="kpi"><strong>' + _fmtBRL(cost.voucher_total_cost || 0) + '</strong><span>Vouchers</span></div>' +
          '<div class="kpi"><strong>' + _fmtBRL(cost.group_total_cost || 0) + '</strong><span>Eventos</span></div>' +
        '</div>' +
        '<div class="kpi" style="margin-top:4px;border:2px solid #B8956A">' +
          '<strong>' + _fmtBRL(cost.total_cost || 0) + '</strong><span>Total · ' +
          (cost.monthly_cap_brl ? 'teto ' + _fmtBRL(cost.monthly_cap_brl) : 'sem teto') +
        '</span></div>' +

        '<h2>Metas pactuadas</h2>' + targetsHtml +

        '<h2>Próximos eventos</h2>' + eventsHtml +

        (trend && trend.trend
          ? '<h2>Tendência de saúde (90 dias)</h2>' +
            '<div class="bullet">' +
              'Atual: <strong>' + _healthLabel(trend.current) + '</strong> · ' +
              'Tendência: <strong>' +
                (trend.trend === 'improving' ? '↑ Melhorando' :
                 trend.trend === 'worsening' ? '↓ Piorando' : '→ Estável') +
              '</strong> · ' +
              (trend.changes || 0) + ' mudanças no período' +
            '</div>'
          : '') +

        '<div class="footer">' +
          'Clínica Mirian de Paula · Maringá · Documento gerado em ' + _fmtDate(new Date().toISOString()) +
        '</div>' +
      '</div>' +
    '</body></html>'
  }

  /**
   * Gera e abre o dossiê em nova aba.
   * @param {Object} partnership - objeto parceria (vindo de B2BRepository.get)
   * @param {Object} context - { targets, events, content, funnel, cost, trend }
   */
  function open(partnership, context) {
    var html = _renderDossier({
      partnership: partnership,
      targets: context && context.targets,
      events:  context && context.events,
      funnel:  context && context.funnel,
      cost:    context && context.cost,
      trend:   context && context.trend,
    })

    var win = window.open('', '_blank')
    if (!win) {
      // popup bloqueado — fallback blob URL
      var blob = new Blob([html], { type: 'text/html' })
      var url = URL.createObjectURL(blob)
      var a = document.createElement('a')
      a.href = url; a.target = '_blank'
      a.rel = 'noopener'
      document.body.appendChild(a); a.click(); document.body.removeChild(a)
      return
    }
    win.document.open()
    win.document.write(html)
    win.document.close()
  }

  window.B2BDossierService = Object.freeze({ open: open })
})()
