/**
 * ClinicAI — B2B Analytics UI
 *
 * Tab "Analytics" no shell mostra KPIs consolidados da Mira B2B:
 *   - Candidaturas (conversão)
 *   - Vouchers (via Mira vs manual)
 *   - Timing (tempo médio aprovação)
 *   - Saúde (distribuição verde/amarelo/vermelho)
 *   - Atividade Mira (whitelist, NPS, insights)
 *
 * Escuta 'b2b:tab-change' com tab=analytics.
 * Expõe window.B2BAnalytics.
 */
;(function () {
  'use strict'
  if (window.B2BAnalytics) return

  var _state = {
    loading: false, error: null, data: null, days: 30,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _repo() { return window.B2BAnalyticsRepository }

  function _kpi(label, value, subtitle, color) {
    return '<div class="b2b-kpi' + (color ? ' b2b-kpi-' + color : '') + '">' +
      '<div class="b2b-kpi-val">' + _esc(value) + '</div>' +
      '<div class="b2b-kpi-lbl">' + _esc(label) + '</div>' +
      (subtitle ? '<div class="b2b-kpi-sub">' + _esc(subtitle) + '</div>' : '') +
    '</div>'
  }

  function _healthBar(h) {
    var total = Number(h.total || 0)
    if (!total) return '<div class="b2b-empty" style="padding:12px;font-style:italic">Nenhuma parceria ativa</div>'
    var g = Number(h.green || 0), y = Number(h.yellow || 0), r = Number(h.red || 0), u = Number(h.unknown || 0)
    var gP = (g/total*100).toFixed(1), yP = (y/total*100).toFixed(1), rP = (r/total*100).toFixed(1), uP = (u/total*100).toFixed(1)
    return '<div class="b2b-health-bar">' +
      (g>0 ? '<div style="width:' + gP + '%;background:#10B981" title="Verde · ' + g + '"></div>' : '') +
      (y>0 ? '<div style="width:' + yP + '%;background:#F59E0B" title="Amarela · ' + y + '"></div>' : '') +
      (r>0 ? '<div style="width:' + rP + '%;background:#EF4444" title="Vermelha · ' + r + '"></div>' : '') +
      (u>0 ? '<div style="width:' + uP + '%;background:#64748B" title="Sem dado · ' + u + '"></div>' : '') +
    '</div>' +
    '<div class="b2b-health-legend">' +
      (g>0 ? '<span><i style="background:#10B981"></i>' + g + ' verdes</span>' : '') +
      (y>0 ? '<span><i style="background:#F59E0B"></i>' + y + ' em atenção</span>' : '') +
      (r>0 ? '<span><i style="background:#EF4444"></i>' + r + ' críticas</span>' : '') +
      (u>0 ? '<span><i style="background:#64748B"></i>' + u + ' sem dado</span>' : '') +
    '</div>'
  }

  function _voucherSplit(v) {
    var total = Number(v.total || 0)
    if (!total) return '<div class="b2b-empty" style="padding:12px;font-style:italic">Nenhum voucher no período</div>'
    var mira = Number(v.via_mira || 0), admin = Number(v.via_admin || 0), bf = Number(v.via_backfill || 0)
    var mP = (mira/total*100).toFixed(0), aP = (admin/total*100).toFixed(0), bP = (bf/total*100).toFixed(0)
    return '<div class="b2b-split-bar">' +
      (mira>0 ? '<div style="width:' + mP + '%;background:var(--b2b-champagne)" title="Via Mira"></div>' : '') +
      (admin>0 ? '<div style="width:' + aP + '%;background:#60A5FA" title="Manual"></div>' : '') +
      (bf>0 ? '<div style="width:' + bP + '%;background:#64748B" title="Backfill"></div>' : '') +
    '</div>' +
    '<div class="b2b-split-legend">' +
      (mira>0 ? '<span><i style="background:var(--b2b-champagne)"></i>' + mira + ' via Mira (' + mP + '%)</span>' : '') +
      (admin>0 ? '<span><i style="background:#60A5FA"></i>' + admin + ' manual</span>' : '') +
      (bf>0 ? '<span><i style="background:#64748B"></i>' + bf + ' histórico</span>' : '') +
    '</div>'
  }

  function _render() {
    var body = window.B2BShell ? window.B2BShell.getTabBody() : document.getElementById('b2bTabBody')
    if (!body) return

    if (_state.loading) {
      body.innerHTML = (window.B2BUXKit && window.B2BUXKit.skeleton({ rows: 4, compact: true })) ||
                       '<div class="b2b-empty">Carregando analytics…</div>'
      return
    }
    if (_state.error) {
      body.innerHTML = '<div class="b2b-empty b2b-empty-err">' + _esc(_state.error) + '</div>'
      return
    }
    if (!_state.data || !_state.data.ok) {
      body.innerHTML = '<div class="b2b-empty">Sem dados.</div>'
      return
    }

    var d = _state.data
    var a = d.applications || {}
    var v = d.vouchers || {}
    var t = d.timing || {}
    var h = d.health || {}
    var m = d.mira || {}
    var nps = m.nps_summary || {}

    body.innerHTML =
      '<div class="b2b-analytics">' +

        '<div class="b2b-analytics-hdr">' +
          '<div>' +
            '<div class="b2b-list-count">Analytics Mira B2B · últimos ' + d.period_days + ' dias</div>' +
            '<div style="font-size:11px;color:var(--b2b-text-muted);margin-top:2px">' +
              'Gerado em ' + _esc(new Date(d.generated_at).toLocaleString('pt-BR')) +
            '</div>' +
          '</div>' +
          '<div class="b2b-analytics-period">' +
            ['7','30','90'].map(function (days) {
              return '<button type="button" class="b2b-tab' +
                (String(_state.days) === days ? ' active' : '') + '" data-ana-period="' + days + '">' +
                days + 'd</button>'
            }).join('') +
          '</div>' +
        '</div>' +

        '<div class="b2b-sec-title">Candidaturas</div>' +
        '<div class="b2b-kpis-grid">' +
          _kpi('Total',      a.total      || 0, '') +
          _kpi('Pendentes',  a.pending    || 0, '', (a.pending>0 ? 'amber' : null)) +
          _kpi('Aprovadas',  a.approved   || 0, '', 'green') +
          _kpi('Rejeitadas', a.rejected   || 0, '') +
          _kpi('Conversão',  (a.conversion_rate || 0) + '%',
               (a.approved || 0) + '/' + (a.total || 0) + ' viraram parceria') +
        '</div>' +

        '<div class="b2b-sec-title">Vouchers</div>' +
        '<div class="b2b-kpis-grid">' +
          _kpi('Emitidos',   v.total      || 0) +
          _kpi('Entregues',  v.delivered  || 0) +
          _kpi('Abertos',    v.opened     || 0) +
          _kpi('Resgatados', v.redeemed   || 0, '', 'green') +
        '</div>' +
        '<div class="b2b-analytics-split">' +
          '<div class="b2b-split-hdr">Origem dos vouchers</div>' +
          _voucherSplit(v) +
        '</div>' +

        '<div class="b2b-sec-title">Tempo de resposta</div>' +
        '<div class="b2b-kpis-grid">' +
          _kpi('Aprovação média', (t.avg_approval_hours || 0) + 'h',
               (t.resolved_count || 0) + ' resolvidas no período') +
          _kpi('Maior tempo',     (t.max_approval_hours || 0) + 'h') +
        '</div>' +

        '<div class="b2b-sec-title">Saúde das parcerias</div>' +
        _healthBar(h) +

        '<div class="b2b-sec-title">Atividade Mira</div>' +
        '<div class="b2b-kpis-grid">' +
          _kpi('Telefones autorizados', m.wa_senders_active || 0,
               'de ' + (m.wa_senders_total || 0) + ' cadastrados') +
          _kpi('Respostas NPS', m.nps_responses || 0,
               nps.responses > 0 ? 'NPS atual: ' + (nps.nps_score != null ? nps.nps_score : '—') : '') +
          _kpi('Insights ativos', m.insights_active || 0,
               (m.insights_active || 0) > 0 ? 'Olha na página' : 'Tudo em ordem') +
        '</div>' +

      '</div>'

    _bind(body)
  }

  function _bind(root) {
    root.querySelectorAll('[data-ana-period]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _state.days = Number(btn.getAttribute('data-ana-period')) || 30
        _load()
      })
    })
  }

  async function _load() {
    _state.loading = true
    _state.error = null
    _render()
    try {
      _state.data = await _repo().get(_state.days)
    } catch (e) {
      _state.error = e.message || String(e)
      _state.data = null
    } finally {
      _state.loading = false
      _render()
    }
  }

  document.addEventListener('b2b:tab-change', function (e) {
    if (e.detail && e.detail.tab === 'analytics') _load()
  })

  window.B2BAnalytics = Object.freeze({ reload: _load })
})()
