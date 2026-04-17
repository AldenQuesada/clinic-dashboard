/**
 * ClinicAI - VPI Strategic KPIs UI
 *
 * Renderiza os 4 KPIs estrategicos no topo da pagina growth-referral:
 *   1. K-factor (metrica-mae)
 *   2. Faturamento indicado (R$)
 *   3. Indicacoes fechadas
 *   4. Parceiras dormentes (com CTA)
 *
 * Usa RPC vpi_kpis_strategic(p_period_days, p_valor_medio_fallback).
 * Graceful fallback: se RPC falhar, mostra placeholders sem throw.
 *
 * Expoe window.VPIStrategicKpis.render(suffix)
 */
;(function () {
  'use strict'

  if (window._vpiStratKpisLoaded) return
  window._vpiStratKpisLoaded = true

  var DEFAULT_PERIOD_DAYS = 30
  var DEFAULT_VALOR_FALLBACK = 1200

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _fmtBRL(v) {
    var n = Number(v || 0)
    return n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', minimumFractionDigits: 0 })
  }

  function _fmtNum(v) {
    var n = Number(v || 0)
    return n.toLocaleString('pt-BR')
  }

  function _deltaBadge(val, opts) {
    opts = opts || {}
    var n = Number(val || 0)
    var suffix = opts.pct ? '%' : ''
    var prefix = n > 0 ? '+' : ''
    var arrow, col
    if (n > 0) {
      arrow = '<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><polyline points="18 15 12 9 6 15"/></svg>'
      col = '#059669'
    } else if (n < 0) {
      arrow = '<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>'
      col = '#DC2626'
    } else {
      arrow = '<svg width="10" height="10" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/></svg>'
      col = '#6B7280'
    }
    var bg = opts.transparent ? 'transparent' : '#fff'
    return '<span style="display:inline-flex;align-items:center;gap:3px;color:' + col + ';background:' + bg + ';font-size:11px;font-weight:700;padding:2px 6px;border-radius:8px">' +
      arrow + prefix + (opts.pct ? n.toFixed(1) : n) + suffix +
    '</span>'
  }

  function _cardKfactor(k) {
    var value = Number(k.value || 0)
    var prev  = Number(k.value_prev || 0)
    var deltaPct = Number(k.delta_pct || 0)
    var storyline = 'Cada parceira trouxe ' + value.toFixed(2).replace('.', ',') + ' novas pacientes'

    return '<div style="background:linear-gradient(135deg,#FFFBEB,#FEF3C7);border-radius:14px;border:1.5px solid #F59E0B;padding:18px;position:relative;overflow:hidden">' +
      '<div style="position:absolute;top:-10px;right:-10px;width:60px;height:60px;background:radial-gradient(circle,rgba(245,158,11,0.2),transparent);border-radius:50%"></div>' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
        '<svg width="12" height="12" fill="#92400E" stroke="none" viewBox="0 0 24 24"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>' +
        '<span style="font-size:10px;font-weight:700;color:#92400E;text-transform:uppercase;letter-spacing:.08em">K-FACTOR</span>' +
      '</div>' +
      '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:4px">' +
        '<span style="font-size:32px;font-weight:800;color:#78350F">' + value.toFixed(2).replace('.', ',') + '</span>' +
        _deltaBadge(deltaPct, { pct: true, transparent: true }) +
      '</div>' +
      '<div style="font-size:11px;color:#92400E;font-weight:600">' + _esc(storyline) + '</div>' +
      '<div style="font-size:10px;color:#B45309;margin-top:4px;opacity:.8">' + (k.ind_fechadas || 0) + ' ind. / ' + (k.parceiras_ativas || 0) + ' ativas</div>' +
    '</div>'
  }

  function _cardFaturamento(f) {
    var value = Number(f.value || 0)
    var deltaPct = Number(f.delta_pct || 0)
    return '<div style="background:linear-gradient(135deg,#064E3B,#065F46);border-radius:14px;border:1.5px solid #065F46;padding:18px;color:#fff;position:relative;overflow:hidden">' +
      '<div style="position:absolute;bottom:-14px;right:-14px;width:70px;height:70px;background:radial-gradient(circle,rgba(16,185,129,0.25),transparent);border-radius:50%"></div>' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
        '<svg width="12" height="12" fill="none" stroke="#6EE7B7" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' +
        '<span style="font-size:10px;font-weight:700;color:#6EE7B7;text-transform:uppercase;letter-spacing:.08em">Faturamento indicado</span>' +
      '</div>' +
      '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:4px">' +
        '<span style="font-size:24px;font-weight:800;color:#fff">' + _fmtBRL(value) + '</span>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:6px">' +
        '<span style="font-size:10px;color:#A7F3D0">vs periodo anterior</span>' +
        _deltaBadge(deltaPct, { pct: true, transparent: true }) +
      '</div>' +
    '</div>'
  }

  function _cardIndicacoes(i) {
    var value = Number(i.value || 0)
    var deltaAbs = Number(i.delta_abs || 0)
    return '<div style="background:linear-gradient(135deg,#7C3AED,#5B21B6);border-radius:14px;border:1.5px solid #5B21B6;padding:18px;color:#fff;position:relative;overflow:hidden">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
        '<svg width="12" height="12" fill="none" stroke="#DDD6FE" stroke-width="2" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 11-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>' +
        '<span style="font-size:10px;font-weight:700;color:#DDD6FE;text-transform:uppercase;letter-spacing:.08em">Indicacoes fechadas</span>' +
      '</div>' +
      '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:4px">' +
        '<span style="font-size:32px;font-weight:800;color:#fff">' + _fmtNum(value) + '</span>' +
        _deltaBadge(deltaAbs, { pct: false, transparent: true }) +
      '</div>' +
      '<div style="font-size:10px;color:#DDD6FE;opacity:.85">no periodo selecionado</div>' +
    '</div>'
  }

  function _cardDormentes(d, suffix) {
    var value = Number(d.value || 0)
    var attentionBg = value > 0
      ? 'linear-gradient(135deg,#FFF7ED,#FED7AA)'
      : 'linear-gradient(135deg,#F0FDF4,#BBF7D0)'
    var borderCol = value > 0 ? '#F97316' : '#16A34A'
    var textCol = value > 0 ? '#9A3412' : '#166534'
    var actionHtml = value > 0
      ? '<button onclick="VPIStrategicKpis.sendDormantReminders(\'' + _esc(suffix || '') + '\')" id="vpiStratDormBtn' + _esc(suffix || '') + '" style="margin-top:8px;padding:7px 10px;background:' + borderCol + ';color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:5px">' +
          '<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
          'Enviar lembretes agora' +
        '</button>'
      : '<div style="margin-top:6px;font-size:10px;color:' + textCol + ';font-weight:600">Tudo certo! Nenhuma parceira em risco.</div>'

    return '<div style="background:' + attentionBg + ';border-radius:14px;border:1.5px solid ' + borderCol + ';padding:18px;position:relative;overflow:hidden">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px">' +
        '<svg width="12" height="12" fill="none" stroke="' + textCol + '" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>' +
        '<span style="font-size:10px;font-weight:700;color:' + textCol + ';text-transform:uppercase;letter-spacing:.08em">Parceiras dormentes</span>' +
      '</div>' +
      '<div style="display:flex;align-items:baseline;gap:10px;margin-bottom:2px">' +
        '<span style="font-size:32px;font-weight:800;color:' + textCol + '">' + _fmtNum(value) + '</span>' +
      '</div>' +
      '<div style="font-size:10px;color:' + textCol + ';opacity:.85">sem indicar nos últimos 30d</div>' +
      actionHtml +
    '</div>'
  }

  function _renderPlaceholder(suffix) {
    var root = document.getElementById('vpiStratKpis' + (suffix || ''))
    if (!root) return
    root.innerHTML = '<div style="grid-column:1/-1;padding:20px;text-align:center;color:#9CA3AF;font-size:12px">Carregando KPIs...</div>'
  }

  function _renderError(suffix, msg) {
    var root = document.getElementById('vpiStratKpis' + (suffix || ''))
    if (!root) return
    root.innerHTML = '<div style="grid-column:1/-1;padding:16px;text-align:center;color:#DC2626;font-size:12px;background:#FEF2F2;border-radius:10px;border:1px solid #FECACA">' +
      'KPIs indisponíveis: ' + _esc(msg || 'erro') +
    '</div>'
  }

  // Mini-stats row (Fase 8 - Entrega 3)
  async function _renderMiniStats(suffix) {
    var miniId = 'vpiMiniStats' + (suffix || '')
    var container = document.getElementById(miniId)
    if (!container) {
      // Injeta container logo depois do #vpiStratKpis{suffix}
      var main = document.getElementById('vpiStratKpis' + (suffix || ''))
      if (!main || !main.parentNode) return
      container = document.createElement('div')
      container.id = miniId
      container.style.cssText = 'display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin:-12px 0 24px 0'
      main.parentNode.insertBefore(container, main.nextSibling)
    }

    var sb = window._sbShared
    if (!sb) { container.innerHTML = ''; return }

    try {
      var res = await sb.rpc('vpi_mini_stats')
      if (res.error) throw new Error(res.error.message)
      var s = res.data || {}

      function tile(iconSvg, label, value, colorHex) {
        return '<div style="background:#fff;border:1px solid #F3F4F6;border-radius:10px;padding:10px 12px;display:flex;align-items:center;gap:10px">' +
          '<div style="width:28px;height:28px;border-radius:7px;background:' + colorHex + '22;display:flex;align-items:center;justify-content:center;flex-shrink:0">' + iconSvg + '</div>' +
          '<div style="min-width:0">' +
            '<div style="font-size:10px;color:#6B7280;font-weight:600;text-transform:uppercase;letter-spacing:.05em">' + _esc(label) + '</div>' +
            '<div style="font-size:18px;font-weight:800;color:#111;line-height:1.1">' + _fmtNum(value) + '</div>' +
          '</div>' +
        '</div>'
      }

      var eyeSvg    = '<svg width="14" height="14" fill="none" stroke="#7C3AED" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>'
      var shareSvg  = '<svg width="14" height="14" fill="none" stroke="#0891B2" stroke-width="2" viewBox="0 0 24 24"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>'
      var clockSvg  = '<svg width="14" height="14" fill="none" stroke="#F59E0B" stroke-width="2" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>'

      container.innerHTML =
        tile(eyeSvg,   'Aberturas do mês',     s.aberturas_mes          || 0, '#7C3AED') +
        tile(shareSvg, 'Compartilhamentos mês', s.compartilhamentos_mes || 0, '#0891B2') +
        tile(clockSvg, 'Indicações pendentes',  s.ind_pending           || 0, '#F59E0B')
    } catch (e) {
      // Graceful: se RPC nao existe, oculta sem poluir o console
      if (e && /vpi_mini_stats/.test(e.message || '')) {
        container.innerHTML = ''
      } else {
        console.warn('[VPIStrategicKpis] mini stats:', e)
        container.innerHTML = ''
      }
    }
  }

  async function render(suffix) {
    suffix = suffix || ''
    var root = document.getElementById('vpiStratKpis' + suffix)
    if (!root) return // placeholder nao existe nesse viewport
    _renderPlaceholder(suffix)

    var sb = window._sbShared
    if (!sb) { _renderError(suffix, 'Supabase indisponivel'); return }

    try {
      var res = await sb.rpc('vpi_kpis_strategic', {
        p_period_days: DEFAULT_PERIOD_DAYS,
        p_valor_medio_fallback: DEFAULT_VALOR_FALLBACK,
      })
      if (res.error) throw new Error(res.error.message)
      var d = res.data || {}

      root.innerHTML =
        _cardKfactor(d.k_factor || {}) +
        _cardFaturamento(d.faturamento_mes || {}) +
        _cardIndicacoes(d.ind_fechadas_mes || {}) +
        _cardDormentes(d.dormentes || {}, suffix)

      // Mini-stats (fire-and-forget)
      _renderMiniStats(suffix)
    } catch (e) {
      console.error('[VPIStrategicKpis] render:', e)
      _renderError(suffix, e.message || 'erro desconhecido')
    }
  }

  async function sendDormantReminders(suffix) {
    suffix = suffix || ''
    if (!confirm('Enviar lembretes WhatsApp para TODAS as parceiras dormentes agora?\n\n(Cada parceira recebe no maximo 1 lembrete a cada 20 dias — dedup automatico.)')) return
    var btn = document.getElementById('vpiStratDormBtn' + suffix)
    if (btn) { btn.disabled = true; btn.textContent = 'Enviando...' }

    var sb = window._sbShared
    if (!sb) { alert('Supabase indisponivel'); return }

    try {
      var res = await sb.rpc('vpi_dormant_send_reminders_batch')
      if (res.error) throw new Error(res.error.message)
      var r = res.data || {}
      var msg = 'Concluido! ' + (r.sent_count || 0) + ' enviada(s), ' +
                (r.skipped_count || 0) + ' skip, ' + (r.failed_count || 0) + ' falha(s).'
      if (window._showToast) _showToast('Dormentes', msg, (r.sent_count || 0) > 0 ? 'success' : 'info')
      else alert(msg)
      await render(suffix)
    } catch (e) {
      console.error('[VPIStrategicKpis] send:', e)
      alert('Falha: ' + (e.message || ''))
    } finally {
      if (btn) { btn.disabled = false }
    }
  }

  window.VPIStrategicKpis = {
    render:                 render,
    sendDormantReminders:   sendDormantReminders,
  }
})()
