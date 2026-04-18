/**
 * ClinicAI — NPS Dashboard (s2-3 plano growth)
 *
 * Consome:
 *   RPC nps_kpis(period_days)
 *   RPC nps_testimonials_consented(limit)
 *
 * Renderizado na pagina growth-partners via vpi-dashboard.ui.js.
 * Expoe window.renderNPSDashboard(containerId).
 */
;(function () {
  'use strict'
  if (window._vpiNPSUILoaded) return
  window._vpiNPSUILoaded = true

  var PERIODS = [
    { days: 30,  label: '30 dias' },
    { days: 90,  label: '90 dias' },
    { days: 180, label: '180 dias' },
  ]

  var _state = {
    period:       30,
    kpis:         null,
    testimonials: null,
    loading:      false,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _sb() { return window._sbShared || null }
  function _initials(nome) {
    var parts = String(nome || '?').trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }
  function _firstName(nome) {
    return String(nome || 'paciente').trim().split(/\s+/)[0] || 'paciente'
  }

  function _scoreColor(score) {
    if (score >= 50) return '#059669'   // verde: nps excelente
    if (score >= 30) return '#10B981'   // verde claro: bom
    if (score >= 0)  return '#D97706'   // amarelo: aceitavel
    return '#DC2626'                     // vermelho: critico
  }

  function _scoreLabel(score) {
    if (score >= 70) return 'Excelente'
    if (score >= 50) return 'Otimo'
    if (score >= 30) return 'Bom'
    if (score >= 0)  return 'Razoavel'
    return 'Critico'
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
            '<div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#9CA3AF;font-weight:700">Satisfa\u00e7\u00e3o</div>' +
            '<div style="font-size:16px;font-weight:700;color:#111827;margin-top:4px">NPS p\u00f3s-procedimento (D+7)</div>' +
            '<div style="font-size:11px;color:#6B7280;margin-top:2px">Coleta autom\u00e1tica 7 dias ap\u00f3s finalizar \u2014 promotoras viram fonte de depoimentos, detratoras geram task alta prioridade</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;align-items:center">' +
            '<select id="npsPeriod" onchange="window._npsOnPeriodChange(this.value)" style="padding:7px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;outline:none;background:#fff">' +
              periodOpts +
            '</select>' +
            '<button onclick="window._npsReload()" style="padding:7px 12px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">Atualizar</button>' +
          '</div>' +
        '</div>' +
        '<div id="npsBody"><div style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px">Carregando...</div></div>' +
      '</div>'
    return container
  }

  function _renderKpis(k) {
    var color = _scoreColor(k.nps_score || 0)
    var label = _scoreLabel(k.nps_score || 0)
    var total = k.total_responses || 0
    var pctP = total > 0 ? Math.round((k.promotoras / total) * 100) : 0
    var pctN = total > 0 ? Math.round((k.neutras    / total) * 100) : 0
    var pctD = total > 0 ? Math.round((k.detratoras / total) * 100) : 0

    return '<div style="display:grid;grid-template-columns:minmax(200px,1fr) 2fr;gap:16px;margin-bottom:18px">' +
      // Score principal
      '<div style="background:linear-gradient(135deg,' + color + '08,' + color + '15);border:2px solid ' + color + '30;border-radius:10px;padding:16px;text-align:center">' +
        '<div style="font-size:10px;letter-spacing:.12em;text-transform:uppercase;color:#6B7280;font-weight:700">NPS Score</div>' +
        '<div style="font-size:38px;font-weight:800;color:' + color + ';line-height:1;margin-top:8px">' + (k.nps_score || 0) + '</div>' +
        '<div style="font-size:12px;color:' + color + ';font-weight:700;margin-top:4px">' + label + '</div>' +
        '<div style="font-size:10px;color:#9CA3AF;margin-top:6px">Nota m\u00e9dia ' + (k.nota_media || 0) + '/10 \u2022 ' + total + ' respostas</div>' +
      '</div>' +
      // Barra de distribuicao
      '<div style="display:flex;flex-direction:column;justify-content:center;gap:8px">' +
        _distBar('Promotoras (9-10)', k.promotoras, pctP, total, '#059669') +
        _distBar('Neutras (7-8)',     k.neutras,    pctN, total, '#D97706') +
        _distBar('Detratoras (0-6)',  k.detratoras, pctD, total, '#DC2626') +
        (k.consent_count > 0
          ? '<div style="font-size:11px;color:#6B7280;margin-top:6px"><strong style="color:#5B21B6">' + k.consent_count + '</strong> ' + (k.consent_count === 1 ? 'depoimento autorizado' : 'depoimentos autorizados') + ' no per\u00edodo</div>'
          : '') +
      '</div>' +
    '</div>'
  }

  function _distBar(label, count, pct, total, color) {
    return '<div>' +
      '<div style="display:flex;justify-content:space-between;font-size:11px;margin-bottom:3px">' +
        '<span style="color:#6B7280;font-weight:600">' + _esc(label) + '</span>' +
        '<span style="color:' + color + ';font-weight:700">' + count + ' \u2022 ' + pct + '%</span>' +
      '</div>' +
      '<div style="height:8px;background:#F3F4F6;border-radius:4px;overflow:hidden">' +
        '<div style="height:100%;width:' + pct + '%;background:' + color + ';border-radius:4px;transition:width .4s"></div>' +
      '</div>' +
    '</div>'
  }

  function _renderTestimonials(list) {
    if (!list || !list.length) {
      return '<div style="padding:18px;text-align:center;color:#9CA3AF;font-size:12px;background:#F9FAFB;border:1px dashed #E5E7EB;border-radius:8px">' +
        'Nenhum depoimento autorizado ainda. Quando paciente responder AUTORIZO ap\u00f3s nota 9-10, aparece aqui.' +
      '</div>'
    }

    var items = list.map(function (t) {
      var name = _firstName(t.lead_name)
      var nota = t.score || 0
      var hasText = !!t.testimonial_text
      var alreadyInMag = !!t.magazine_page_id
      return '<div style="background:#F9FAFB;border:1px solid #F3F4F6;border-radius:8px;padding:12px" data-nps-id="' + _esc(t.id) + '">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">' +
          '<div style="width:32px;height:32px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">' + _esc(_initials(t.lead_name || name)) + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:12px;font-weight:700;color:#111827">' + _esc(name) + '</div>' +
            '<div style="font-size:10px;color:#6B7280">Nota ' + nota + '/10 \u2022 autorizado ' + _relativeDate(t.testimonial_consent_at) + '</div>' +
          '</div>' +
        '</div>' +
        (hasText
          ? '<div style="font-size:12px;color:#374151;line-height:1.5;margin-bottom:10px">' + _esc(t.testimonial_text) + '</div>'
          : '<div style="font-size:11px;color:#9CA3AF;font-style:italic;margin-bottom:10px">Consent dado via WA \u2014 aguardando texto/foto da paciente</div>') +
        // Acao "adicionar a revista"
        (hasText
          ? (alreadyInMag
            ? '<div style="display:flex;align-items:center;gap:6px;font-size:10px;color:#059669;font-weight:600;padding:6px 10px;background:#ECFDF5;border:1px solid #A7F3D0;border-radius:6px">' +
                '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="20 6 9 17 4 12"/></svg>' +
                'Ja na revista' +
              '</div>'
            : '<button onclick="window._npsToMagazine(\'' + _esc(t.id) + '\', this)" ' +
                'style="width:100%;padding:8px 12px;background:#fff;color:#7C3AED;border:1.5px solid #E9D5FF;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:6px">' +
                '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>' +
                'Adicionar a revista' +
              '</button>')
          : '') +
      '</div>'
    }).join('')

    return '<div>' +
      '<div style="font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:#6B7280;font-weight:700;margin-bottom:10px">Depoimentos autorizados</div>' +
      '<div style="display:flex;flex-direction:column;gap:10px;max-height:720px;overflow-y:auto;padding-right:6px">' + items + '</div>' +
    '</div>'
  }

  function _relativeDate(iso) {
    if (!iso) return '\u2014'
    try {
      var d = new Date(iso)
      var days = Math.floor((Date.now() - d.getTime()) / 86400000)
      if (days === 0) return 'hoje'
      if (days === 1) return 'ontem'
      if (days < 7) return days + 'd atr\u00e1s'
      return d.toLocaleDateString('pt-BR')
    } catch (_) { return '\u2014' }
  }

  function _renderBody(kpis, testimonials) {
    if (!kpis || !kpis.ok) {
      return '<div style="padding:16px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;color:#991B1B;font-size:12px">' +
        'Erro carregando KPIs: ' + _esc((kpis && kpis.error) || 'desconhecido') +
      '</div>'
    }
    if ((kpis.total_responses || 0) === 0) {
      return '<div style="padding:24px;text-align:center;color:#6B7280;font-size:13px;background:#FFFBEB;border:1px dashed #F59E0B;border-radius:8px">' +
        '<strong style="color:#92400E">Aguardando primeiras respostas.</strong><br>' +
        '<span style="font-size:11px">Quando pacientes finalizarem procedimento, a pergunta NPS sai automaticamente no D+7 (trigger d_after ativo).</span>' +
      '</div>'
    }
    return _renderKpis(kpis) + _renderTestimonials(testimonials || [])
  }

  async function _fetchAll() {
    var sb = _sb()
    if (!sb) return { kpis: { ok: false, error: 'no_supabase' }, testimonials: [] }
    try {
      var results = await Promise.all([
        sb.rpc('nps_kpis',                   { p_period_days: _state.period }),
        sb.rpc('nps_testimonials_consented', { p_limit: 30 }),
      ])
      return {
        kpis:         (results[0].error ? { ok: false, error: results[0].error.message } : results[0].data),
        testimonials: (results[1].error ? [] : (results[1].data || [])),
      }
    } catch (e) {
      return { kpis: { ok: false, error: e && e.message }, testimonials: [] }
    }
  }

  async function _reload() {
    var body = document.getElementById('npsBody')
    if (!body) return
    if (_state.loading) return
    _state.loading = true
    body.innerHTML = '<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px">Carregando...</div>'
    var res = await _fetchAll()
    _state.kpis = res.kpis
    _state.testimonials = res.testimonials
    body.innerHTML = _renderBody(res.kpis, res.testimonials)
    _state.loading = false
  }

  function _onPeriodChange(val) {
    _state.period = parseInt(val, 10) || 30
    _reload()
  }

  async function renderNPSDashboard(containerId) {
    var c = _renderShell(containerId)
    if (!c) return
    await _reload()
  }

  async function _npsToMagazine(npsId, btn) {
    var sb = _sb()
    if (!sb) { _toast && _toast('Supabase indisponivel', 'error'); return }
    if (btn) { btn.disabled = true; btn.style.opacity = '.6'; btn.innerHTML = 'Adicionando...' }
    try {
      var r = await sb.rpc('nps_testimonial_to_magazine', { p_nps_id: npsId })
      if (r.error) throw r.error
      var data = r.data || {}
      if (!data.ok) {
        var reason = data.reason === 'no_consent'        ? 'Depoimento sem consentimento'
                   : data.reason === 'empty_testimonial' ? 'Depoimento sem texto'
                   : data.reason === 'nps_not_found'     ? 'NPS nao encontrado'
                   : 'Falha: ' + (data.reason || 'desconhecida')
        _toast && _toast(reason, 'error')
        if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = 'Tentar novamente' }
        return
      }
      _toast && _toast(data.already_existed ? 'Ja estava na revista' : 'Pagina adicionada a edicao draft', 'success')
      _reload()
    } catch (e) {
      console.error('[NPS→Magazine]', e)
      _toast && _toast('Erro: ' + (e.message || e), 'error')
      if (btn) { btn.disabled = false; btn.style.opacity = '1'; btn.innerHTML = 'Tentar novamente' }
    }
  }

  function _toast(m, t) {
    if (window.toast)     return window.toast(m, t || 'info')
    if (window.showToast) return window.showToast(m, t || 'info')
  }

  window._npsOnPeriodChange = _onPeriodChange
  window._npsReload         = _reload
  window._npsToMagazine     = _npsToMagazine
  window.renderNPSDashboard = renderNPSDashboard
})()
