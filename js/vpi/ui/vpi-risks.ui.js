/**
 * ClinicAI — Growth Risks Dashboard (rk-1..rk-5)
 *
 * Consome RPC growth_risks_snapshot() e renderiza 5 cards-semaforo.
 * Status: ok (verde) / warn (ambar) / critical (vermelho) / unknown / error.
 *
 * Renderizado em page-growth-partners via vpi-dashboard.ui.js.
 * Expoe window.renderRisksDashboard(containerId).
 */
;(function () {
  'use strict'
  if (window._vpiRisksUILoaded) return
  window._vpiRisksUILoaded = true

  var COLORS = {
    ok:       { bg: '#ECFDF5', border: '#A7F3D0', fg: '#065F46', label: 'OK' },
    warn:     { bg: '#FFFBEB', border: '#FDE68A', fg: '#92400E', label: 'Atenção' },
    critical: { bg: '#FEF2F2', border: '#FCA5A5', fg: '#991B1B', label: 'Crítico' },
    unknown:  { bg: '#F9FAFB', border: '#E5E7EB', fg: '#6B7280', label: 'Sem dados' },
    error:    { bg: '#FEF2F2', border: '#FCA5A5', fg: '#991B1B', label: 'Erro' }
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _sb() { return window._sbShared || null }

  function _fmtValue(v, unit) {
    if (v === null || v === undefined) return '—'
    var num = typeof v === 'number' ? v : parseFloat(v)
    if (isNaN(num)) return String(v)
    if (unit === '%' || unit === '% vs regular' || unit === '% do total') {
      return (num >= 0 ? '+' : '') + num.toFixed(1) + '%'
    }
    if (unit === 'posts') return Math.round(num) + ' posts'
    if (unit === 'flag')  return num ? 'Sim' : 'Não'
    return num.toFixed(1) + (unit ? ' ' + unit : '')
  }

  function _riskCard(rk) {
    var status = rk.status || 'unknown'
    var c = COLORS[status] || COLORS.unknown

    // Delta badge — so mostra se delta existir e for != 0 e direction_good definido
    var deltaBadge = ''
    var delta = Number(rk.delta)
    if (!isNaN(delta) && delta !== 0 && rk.delta_direction_good) {
      var isGood = (delta > 0 && rk.delta_direction_good === 'up') ||
                   (delta < 0 && rk.delta_direction_good === 'down')
      var arrow = delta > 0 ? '↑' : '↓'
      var deltaColor = isGood ? '#059669' : '#DC2626'
      var deltaFmt = Math.abs(delta).toFixed(1)
      deltaBadge = '<span style="font-size:10px;font-weight:700;color:' + deltaColor + ';margin-left:6px">' +
        arrow + ' ' + deltaFmt + '</span>'
    }

    return '<div style="background:' + c.bg + ';border:1px solid ' + c.border + ';border-radius:10px;padding:14px;display:flex;flex-direction:column;gap:6px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
        '<div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:' + c.fg + ';font-weight:700">' + _esc(rk.id || '?') + '</div>' +
        '<div style="padding:2px 8px;background:' + c.fg + ';color:#fff;border-radius:10px;font-size:9px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">' + _esc(c.label) + '</div>' +
      '</div>' +
      '<div style="font-size:13px;font-weight:600;color:#111827;line-height:1.3">' + _esc(rk.label || '?') + '</div>' +
      '<div style="font-size:22px;font-weight:800;color:' + c.fg + ';letter-spacing:-0.02em">' +
        _esc(_fmtValue(rk.value, rk.unit)) + deltaBadge +
      '</div>' +
      '<div style="font-size:11px;color:#6B7280;line-height:1.4">' + _esc(rk.hint || '') + '</div>' +
    '</div>'
  }

  var _containerId = null
  var _state = { loading: false, data: null, error: null }

  function _render() {
    if (!_containerId) return
    var el = document.getElementById(_containerId)
    if (!el) return

    if (_state.loading && !_state.data) {
      el.innerHTML = '<div style="padding:18px;color:#9CA3AF;font-size:12px">Carregando riscos...</div>'
      return
    }

    if (_state.error) {
      el.innerHTML = '<div style="padding:16px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;color:#991B1B;font-size:12px">' +
        'Erro carregando riscos: ' + _esc(_state.error) +
      '</div>'
      return
    }

    var risks = (_state.data && _state.data.risks) || []
    var generated = _state.data && _state.data.generated_at
      ? new Date(_state.data.generated_at).toLocaleString('pt-BR')
      : '—'

    el.innerHTML =
      '<div style="background:#fff;border-radius:12px;border:1px solid #F3F4F6;padding:20px;margin-bottom:20px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">' +
          '<div style="font-size:13px;font-weight:700;color:#111">Riscos operacionais</div>' +
          '<button id="vpiRisksReload" style="padding:5px 10px;background:#F5F3FF;color:#7C3AED;border:1px solid #E9D5FF;border-radius:6px;font-size:10px;font-weight:600;cursor:pointer">Atualizar</button>' +
        '</div>' +
        '<div style="font-size:11px;color:#6B7280;margin-bottom:16px">5 alavancas monitoradas automaticamente · ultima leitura ' + _esc(generated) + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:10px">' +
          risks.map(_riskCard).join('') +
        '</div>' +
      '</div>'

    var btn = document.getElementById('vpiRisksReload')
    if (btn) btn.addEventListener('click', function () { _load(true) })
  }

  async function _load(forceFresh) {
    var sb = _sb()
    if (!sb) { _state.error = 'Supabase indisponivel'; _render(); return }
    _state.loading = true
    if (forceFresh) _state.data = null
    _render()
    try {
      var r = await sb.rpc('growth_risks_snapshot')
      if (r.error) throw r.error
      _state.data = r.data || { risks: [] }
      _state.error = null
    } catch (e) {
      _state.error = (e && e.message) || String(e)
    } finally {
      _state.loading = false
      _render()
    }
  }

  async function renderRisksDashboard(containerId) {
    _containerId = containerId
    _render() // loading
    await _load(false)
  }

  window.renderRisksDashboard = renderRisksDashboard
})()
