/**
 * ClinicAI — Channel LTV/CAC (s2-6 plano growth)
 *
 * Painel de analytics por canal, consumindo RPC growth_channel_analytics.
 * Renderizado na pagina-growth-partners via vpi-dashboard.ui.js.
 *
 * Features:
 *   - Seletor de periodo (7/30/90/180d)
 *   - Tabela de canais: clicks, leads, conv, receita, LTV, CAC, LTV/CAC
 *   - Editor de custos por canal (persistente em localStorage)
 *   - Export CSV
 *
 * Expoe window.renderChannelLTVCAC(containerId).
 */
;(function () {
  'use strict'
  if (window._vpiChannelLTVCACLoaded) return
  window._vpiChannelLTVCACLoaded = true

  var STORAGE_KEY = 'growth_channel_costs_v1'
  var PERIODS = [
    { days: 7,   label: '7 dias' },
    { days: 30,  label: '30 dias' },
    { days: 90,  label: '90 dias' },
    { days: 180, label: '180 dias' },
  ]

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _sb() { return window._sbShared || null }
  function _fmtBRL(v) {
    var n = Number(v) || 0
    return n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  }
  function _fmtInt(v) { return Number(v || 0).toLocaleString('pt-BR') }

  // ── Storage de custos ────────────────────────────────────────
  function _readCosts() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return {}
      var parsed = JSON.parse(raw)
      return (parsed && typeof parsed === 'object') ? parsed : {}
    } catch (_) { return {} }
  }
  function _writeCosts(obj) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(obj || {})) } catch (_) {}
  }

  // ── Estado ───────────────────────────────────────────────────
  var _state = {
    period: 30,
    data:   null,
    loading: false,
  }

  // ── Nome humanizado de canal ────────────────────────────────
  function _channelLabel(ch) {
    var map = {
      'direto':          'Link direto (sem UTM)',
      'indicacao_vpi':   'Indicação VPI (cartão)',
      'outros':          'Outros',
    }
    return map[ch] || ch
  }

  // ── Render ──────────────────────────────────────────────────
  function _renderShell(containerId) {
    var container = document.getElementById(containerId)
    if (!container) return null
    var periodOpts = PERIODS.map(function (p) {
      return '<option value="' + p.days + '"' +
        (p.days === _state.period ? ' selected' : '') + '>' + p.label + '</option>'
    }).join('')

    container.innerHTML =
      '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin-bottom:16px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">' +
          '<div>' +
            '<div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#9CA3AF;font-weight:700">Analytics</div>' +
            '<div style="font-size:16px;font-weight:700;color:#111827;margin-top:4px">LTV / CAC por canal</div>' +
            '<div style="font-size:11px;color:#6B7280;margin-top:2px">Dados de <code style="background:#F3F4F6;padding:1px 5px;border-radius:3px;font-size:10px">vpi_partner_attribution</code> — alimentada pelo hook VPI no cadastro de lead</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;align-items:center">' +
            '<select id="chLTVCacPeriod" onchange="window._chLTVCacOnPeriodChange(this.value)" style="padding:7px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;outline:none;background:#fff">' +
              periodOpts +
            '</select>' +
            '<button onclick="window._chLTVCacOpenCosts()" title="Informar custo de aquisicao por canal no periodo" style="padding:7px 12px;background:#F5F3FF;color:#5B21B6;border:1.5px solid #DDD6FE;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">' +
              'Editar custos' +
            '</button>' +
            '<button onclick="window._chLTVCacExportCSV()" style="padding:7px 12px;background:#F0FDF4;color:#15803D;border:1.5px solid #BBF7D0;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">' +
              'CSV' +
            '</button>' +
            '<button onclick="window._chLTVCacReload()" style="padding:7px 12px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">' +
              'Atualizar' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div id="chLTVCacBody"><div style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px">Carregando...</div></div>' +
      '</div>'
    return container
  }

  function _renderTotals(data) {
    var hasCustos = Number(data.total_custo || 0) > 0
    var ltvGlobal = data.total_conversoes > 0
      ? (data.total_receita / data.total_conversoes)
      : 0
    var ratioGlobal = (hasCustos && data.total_receita > 0)
      ? (data.total_receita / data.total_custo)
      : 0

    return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin-bottom:16px">' +
      _kpi('Clicks', _fmtInt(data.total_clicks), '#6B7280') +
      _kpi('Leads', _fmtInt(data.total_leads), '#2563EB') +
      _kpi('Conversões', _fmtInt(data.total_conversoes), '#10B981') +
      _kpi('Receita', 'R$ ' + _fmtBRL(data.total_receita), '#059669') +
      _kpi('LTV médio', ltvGlobal > 0 ? 'R$ ' + _fmtBRL(ltvGlobal) : '—', '#5B21B6') +
      (hasCustos
        ? _kpi('LTV/CAC global', ratioGlobal > 0 ? ratioGlobal.toFixed(2) + 'x' : '—',
               ratioGlobal >= 3 ? '#059669' : ratioGlobal >= 1 ? '#D97706' : '#DC2626')
        : _kpi('Custo', '—', '#9CA3AF'))
      +
    '</div>'
  }

  function _kpi(label, val, color) {
    return '<div style="background:#F9FAFB;border:1px solid #F3F4F6;border-radius:10px;padding:12px 14px">' +
      '<div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:#9CA3AF;font-weight:700">' + _esc(label) + '</div>' +
      '<div style="font-size:18px;font-weight:800;color:' + color + ';margin-top:4px">' + _esc(val) + '</div>' +
    '</div>'
  }

  function _renderTable(channels) {
    if (!channels || !channels.length) {
      return '<div style="padding:32px;text-align:center;color:#9CA3AF;font-size:13px;background:#F9FAFB;border:1px dashed #E5E7EB;border-radius:8px">' +
        'Sem dados de attribution no período. Verifique se o hook VPI está ativo e se houve tráfego via short-links.' +
      '</div>'
    }

    var rows = channels.map(function (c) {
      var ratioColor = c.ltv_cac_ratio >= 3 ? '#059669'
                    : c.ltv_cac_ratio >= 1 ? '#D97706'
                    : c.ltv_cac_ratio > 0  ? '#DC2626'
                    : '#9CA3AF'
      var ratioStr = c.ltv_cac_ratio > 0 ? c.ltv_cac_ratio.toFixed(2) + 'x' : '—'

      return '<tr style="border-bottom:1px solid #F3F4F6">' +
        '<td style="padding:10px 12px"><div style="font-size:12px;font-weight:700;color:#111827">' + _esc(_channelLabel(c.channel)) + '</div>' +
          (c.channel !== _channelLabel(c.channel)
            ? '<div style="font-size:10px;color:#9CA3AF;font-family:Consolas,monospace">' + _esc(c.channel) + '</div>'
            : '') +
        '</td>' +
        '<td style="padding:10px 12px;text-align:right;font-size:12px;color:#374151">' + _fmtInt(c.clicks) + '</td>' +
        '<td style="padding:10px 12px;text-align:right;font-size:12px;color:#2563EB;font-weight:600">' + _fmtInt(c.leads) + '</td>' +
        '<td style="padding:10px 12px;text-align:right;font-size:12px;color:#10B981;font-weight:700">' + _fmtInt(c.conversoes) + '</td>' +
        '<td style="padding:10px 12px;text-align:right;font-size:12px;color:#374151">' + (c.taxa_conversao_pct || 0).toFixed(1) + '%</td>' +
        '<td style="padding:10px 12px;text-align:right;font-size:12px;color:#059669;font-weight:700">R$ ' + _fmtBRL(c.receita_total) + '</td>' +
        '<td style="padding:10px 12px;text-align:right;font-size:12px;color:#5B21B6;font-weight:600">' +
          (c.ltv_medio > 0 ? 'R$ ' + _fmtBRL(c.ltv_medio) : '—') + '</td>' +
        '<td style="padding:10px 12px;text-align:right;font-size:12px;color:#6B7280">' +
          (c.custo_periodo > 0 ? 'R$ ' + _fmtBRL(c.custo_periodo) : '—') + '</td>' +
        '<td style="padding:10px 12px;text-align:right;font-size:12px;color:#6B7280">' +
          (c.cac > 0 ? 'R$ ' + _fmtBRL(c.cac) : '—') + '</td>' +
        '<td style="padding:10px 12px;text-align:right;font-size:12px;font-weight:800;color:' + ratioColor + '">' + ratioStr + '</td>' +
      '</tr>'
    }).join('')

    var thStyle = 'padding:8px 12px;text-align:right;font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;border-bottom:1.5px solid #E5E7EB;background:#F9FAFB'
    var thLeft  = thStyle.replace('text-align:right', 'text-align:left')

    return '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:900px">' +
      '<thead><tr>' +
        '<th style="' + thLeft + '">Canal</th>' +
        '<th style="' + thStyle + '">Clicks</th>' +
        '<th style="' + thStyle + '">Leads</th>' +
        '<th style="' + thStyle + '">Conv.</th>' +
        '<th style="' + thStyle + '">Tx Conv.</th>' +
        '<th style="' + thStyle + '">Receita</th>' +
        '<th style="' + thStyle + '">LTV</th>' +
        '<th style="' + thStyle + '">Custo</th>' +
        '<th style="' + thStyle + '">CAC</th>' +
        '<th style="' + thStyle + '">LTV/CAC</th>' +
      '</tr></thead>' +
      '<tbody>' + rows + '</tbody>' +
    '</table></div>'
  }

  function _renderBody(data) {
    if (!data) return ''
    if (!data.ok) {
      return '<div style="padding:16px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;color:#991B1B;font-size:12px">' +
        'Erro: ' + _esc(data.error || 'desconhecido') +
        (data.detail ? ' — ' + _esc(data.detail) : '') +
      '</div>'
    }
    return _renderTotals(data) + _renderTable(data.channels || [])
  }

  // ── Ações ────────────────────────────────────────────────────
  async function _fetchData() {
    var sb = _sb()
    if (!sb) return { ok: false, error: 'no_supabase' }
    var costs = _readCosts()
    try {
      var res = await sb.rpc('growth_channel_analytics', {
        p_period_days:     _state.period,
        p_cost_by_channel: costs,
      })
      if (res.error) return { ok: false, error: 'rpc_error', detail: res.error.message }
      return res.data
    } catch (e) {
      return { ok: false, error: 'exception', detail: e && e.message || String(e) }
    }
  }

  async function _reload() {
    var body = document.getElementById('chLTVCacBody')
    if (!body) return
    if (_state.loading) return
    _state.loading = true
    body.innerHTML = '<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px">Carregando...</div>'
    _state.data = await _fetchData()
    body.innerHTML = _renderBody(_state.data)
    _state.loading = false
  }

  function _onPeriodChange(val) {
    _state.period = parseInt(val, 10) || 30
    _reload()
  }

  function _openCostsEditor() {
    var current = _readCosts()
    var channels = (_state.data && _state.data.channels) || []
    // monta lista: canais do ultimo fetch + os que já tem custo salvo
    var all = {}
    channels.forEach(function (c) { all[c.channel] = true })
    Object.keys(current).forEach(function (k) { all[k] = true })
    var keys = Object.keys(all).sort()
    if (!keys.length) keys = ['indicacao_vpi', 'direto', 'instagram/story', 'google/cpc']

    var rows = keys.map(function (k) {
      var val = current[k] != null ? String(current[k]) : ''
      return '<div style="display:grid;grid-template-columns:1fr 140px;gap:8px;align-items:center;padding:6px 0">' +
        '<div style="font-size:12px;color:#374151;font-family:Consolas,monospace">' + _esc(k) + '</div>' +
        '<input type="number" step="0.01" min="0" placeholder="0.00" value="' + _esc(val) + '" data-ch-cost-key="' + _esc(k) + '" style="padding:7px 9px;border:1.5px solid #E5E7EB;border-radius:6px;font-size:12px;text-align:right">' +
      '</div>'
    }).join('')

    var modal = document.createElement('div')
    modal.id = 'chLTVCacCostsModal'
    modal.innerHTML =
      '<div style="position:fixed;inset:0;background:rgba(0,0,0,0.55);display:flex;align-items:center;justify-content:center;z-index:10000;padding:20px" onclick="if(event.target===this)document.getElementById(\'chLTVCacCostsModal\').remove()">' +
        '<div style="background:#fff;border-radius:12px;width:100%;max-width:520px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 20px 60px rgba(0,0,0,0.3)">' +
          '<div style="padding:18px 22px;border-bottom:1px solid #F3F4F6">' +
            '<div style="font-size:15px;font-weight:700;color:#111827">Custo por canal — período de ' + _state.period + ' dias</div>' +
            '<div style="font-size:11px;color:#6B7280;margin-top:4px">Informe o gasto TOTAL do período em cada canal (ex: investimento em anúncios, comissão paga, produção). Salvo localmente.</div>' +
          '</div>' +
          '<div style="padding:18px 22px;overflow-y:auto;flex:1">' + rows + '</div>' +
          '<div style="padding:14px 22px;border-top:1px solid #F3F4F6;display:flex;justify-content:flex-end;gap:10px">' +
            '<button onclick="document.getElementById(\'chLTVCacCostsModal\').remove()" style="padding:8px 16px;background:#F3F4F6;color:#374151;border:none;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">Cancelar</button>' +
            '<button onclick="window._chLTVCacSaveCosts()" style="padding:8px 16px;background:#7C3AED;color:#fff;border:none;border-radius:6px;font-size:12px;font-weight:700;cursor:pointer">Salvar</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    document.body.appendChild(modal)
  }

  function _saveCostsFromEditor() {
    var modal = document.getElementById('chLTVCacCostsModal')
    if (!modal) return
    var obj = {}
    modal.querySelectorAll('[data-ch-cost-key]').forEach(function (el) {
      var key = el.getAttribute('data-ch-cost-key')
      var v = parseFloat(el.value)
      if (key && !isNaN(v) && v > 0) obj[key] = v
    })
    _writeCosts(obj)
    modal.remove()
    _reload()
  }

  function _exportCSV() {
    var data = _state.data
    if (!data || !data.ok) { alert('Sem dados pra exportar'); return }
    var rows = [['canal','clicks','leads','conversoes','taxa_conv_pct','receita_total','ltv_medio','custo_periodo','cac','ltv_cac_ratio']]
    ;(data.channels || []).forEach(function (c) {
      rows.push([
        c.channel, c.clicks, c.leads, c.conversoes, c.taxa_conversao_pct,
        c.receita_total, c.ltv_medio, c.custo_periodo, c.cac, c.ltv_cac_ratio
      ])
    })
    var csv = rows.map(function (r) {
      return r.map(function (v) {
        var s = String(v == null ? '' : v)
        return /[",\n;]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s
      }).join(',')
    }).join('\n')
    var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = 'growth-ltv-cac-' + _state.period + 'd-' + new Date().toISOString().slice(0,10) + '.csv'
    document.body.appendChild(a)
    a.click()
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url) }, 100)
  }

  // ── Entry point ──────────────────────────────────────────────
  async function renderChannelLTVCAC(containerId) {
    var c = _renderShell(containerId)
    if (!c) return
    await _reload()
  }

  // Expõe ações globais (onclick inline)
  window._chLTVCacOnPeriodChange = _onPeriodChange
  window._chLTVCacReload         = _reload
  window._chLTVCacOpenCosts      = _openCostsEditor
  window._chLTVCacSaveCosts      = _saveCostsFromEditor
  window._chLTVCacExportCSV      = _exportCSV
  window.renderChannelLTVCAC     = renderChannelLTVCAC
})()
