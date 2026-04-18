/**
 * ClinicAI — Content Opportunities pra Instagram (s2-5 plano growth)
 *
 * Agrega oportunidades consolidadas (NPS testimonials, VPI celebrations,
 * tier upgrades) numa lista acionavel: copiar copy, marcar postado.
 *
 * Consome:
 *   RPC growth_content_opportunities(period_days, limit)
 *   RPC growth_content_mark_posted(type, source_id, url)
 *
 * Renderizado via window.renderContentIG(containerId).
 */
;(function () {
  'use strict'
  if (window._vpiContentIGLoaded) return
  window._vpiContentIGLoaded = true

  var _state = { period: 60, data: null, loading: false }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _sb() { return window._sbShared || null }
  function _first(n) { return String(n || 'paciente').trim().split(/\s+/)[0] || 'paciente' }

  // ── Copy templates por tipo ──────────────────────────────────
  function _copyFor(opp) {
    var nome = _first(opp.person_name)
    var text = (opp.testimonial_text || '').trim()
    if (opp.type === 'nps_testimonial') {
      if (text) {
        return 'Depoimento da ' + nome + ':\n\n' +
          '"' + text + '"\n\n' +
          'Obrigada pela confiança, ' + nome + '! \u2728\n\n' +
          '#ClinicaMirianDePaula #HarmoniaFacial #Estetica'
      }
      return nome + ' respondeu nosso NPS com nota ' + (opp.score || 10) + ' \u2014 mais uma harmonia revelada.\n\n' +
        'Cada história é única. A sua também pode ser.\n\n' +
        '#ClinicaMirianDePaula #HarmoniaFacial'
    }
    if (opp.type === 'vpi_celebration') {
      return 'Nossa embaixadora ' + nome + ' celebrando uma nova conquista! \u2728\n\n' +
        (text ? '"' + text + '"\n\n' : '') +
        'Gratidão por escolher a nossa clínica pra essa jornada.\n\n' +
        '#EmbaixadoraMirianDePaula #ClinicaMirianDePaula'
    }
    if (opp.type === 'tier_upgrade') {
      var tierLabel = (opp.tag || 'parceira').toLowerCase()
      return nome + ' agora é nossa embaixadora ' + tierLabel + '! \u2728\n\n' +
        'Parceiras como ela constroem essa rede de cuidado e confiança que nos orgulha.\n\n' +
        'Parabéns, ' + nome + '!\n\n' +
        '#EmbaixadoraMirianDePaula #ClinicaMirianDePaula'
    }
    return nome + ' compartilhando um momento com a gente.\n\n#ClinicaMirianDePaula'
  }

  function _typeLabel(t) {
    var map = {
      'nps_testimonial': 'Depoimento NPS',
      'vpi_celebration': 'Celebra\u00e7\u00e3o VPI',
      'tier_upgrade':    'Novo Tier VPI',
    }
    return map[t] || t
  }

  function _typeColor(t) {
    var map = {
      'nps_testimonial': '#10B981',
      'vpi_celebration': '#7C3AED',
      'tier_upgrade':    '#D97706',
    }
    return map[t] || '#6B7280'
  }

  // ── Render ──────────────────────────────────────────────────
  function _renderShell(containerId) {
    var c = document.getElementById(containerId)
    if (!c) return null
    c.innerHTML =
      '<div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:20px;margin-bottom:16px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">' +
              '<div style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:#9CA3AF;font-weight:700">Conte\u00fado</div>' +
              '<span id="contentIGCounter" style="padding:2px 9px;background:#FEF3C7;color:#92400E;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:.05em;display:none">0 p/ postar</span>' +
            '</div>' +
            '<div style="font-size:16px;font-weight:700;color:#111827;margin-top:4px">Oportunidades pra Instagram</div>' +
            '<div style="font-size:11px;color:#6B7280;margin-top:2px">Depoimentos NPS + celebra\u00e7\u00f5es VPI + tier upgrades — copy pronta pra colar</div>' +
          '</div>' +
          '<div style="display:flex;gap:8px;align-items:center">' +
            '<select id="contentIGPeriod" onchange="window._contentIGOnPeriodChange(this.value)" style="padding:7px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;outline:none;background:#fff">' +
              '<option value="30"' + (_state.period===30?' selected':'') + '>30 dias</option>' +
              '<option value="60"' + (_state.period===60?' selected':'') + '>60 dias</option>' +
              '<option value="90"' + (_state.period===90?' selected':'') + '>90 dias</option>' +
            '</select>' +
            '<button onclick="window._contentIGReload()" style="padding:7px 12px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer">Atualizar</button>' +
          '</div>' +
        '</div>' +
        '<div id="contentIGBody"><div style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px">Carregando...</div></div>' +
      '</div>'
    return c
  }

  function _renderBody(data) {
    if (!data || !data.ok) {
      return '<div style="padding:16px;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;color:#991B1B;font-size:12px">Erro: ' + _esc(data && data.error || 'desconhecido') + '</div>'
    }
    var opps = data.opportunities || []
    if (!opps.length) {
      return '<div style="padding:24px;text-align:center;color:#6B7280;font-size:13px;background:#FFFBEB;border:1px dashed #F59E0B;border-radius:8px">' +
        '<strong style="color:#92400E">Sem candidatos no per\u00edodo.</strong><br>' +
        '<span style="font-size:11px">Aguardando depoimentos NPS consentidos, rea\u00e7\u00f5es VPI ou tier upgrades. A lista se popula sozinha conforme os fluxos disparam.</span>' +
      '</div>'
    }

    var cards = opps.map(_renderCard).join('')
    return '<div style="display:flex;flex-direction:column;gap:12px;max-height:720px;overflow-y:auto;padding-right:6px">' + cards + '</div>'
  }

  function _renderCard(opp) {
    var col = _typeColor(opp.type)
    var label = _typeLabel(opp.type)
    var nome = _first(opp.person_name)
    var copy = _copyFor(opp)
    var hasPhoto = opp.photo_url && opp.photo_url.length > 5
    var copyEsc = _esc(copy).replace(/\n/g, '<br>')

    return '<div style="background:#fff;border:1px solid #E5E7EB;border-left:3px solid ' + col + ';border-radius:10px;padding:14px 16px;display:flex;flex-direction:column;gap:10px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
        '<div>' +
          '<div style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:' + col + ';font-weight:700">' + _esc(label) + '</div>' +
          '<div style="font-size:14px;font-weight:700;color:#111827;margin-top:2px">' + _esc(nome) + '</div>' +
        '</div>' +
        (opp.tag ? '<div style="padding:3px 8px;background:' + col + '15;color:' + col + ';border-radius:12px;font-size:10px;font-weight:700;white-space:nowrap">' + _esc(opp.tag) + '</div>' : '') +
      '</div>' +
      (hasPhoto
        ? '<div><a href="' + _esc(opp.photo_url) + '" target="_blank" rel="noopener" style="display:inline-block;padding:5px 10px;background:#F5F3FF;color:#5B21B6;border:1px solid #DDD6FE;border-radius:6px;font-size:11px;font-weight:600;text-decoration:none">Ver foto enviada</a></div>'
        : '') +
      '<div style="background:#F9FAFB;border:1px solid #F3F4F6;border-radius:6px;padding:10px 12px;font-size:12px;color:#374151;line-height:1.55;white-space:pre-wrap">' + copyEsc + '</div>' +
      '<div style="display:flex;gap:6px;flex-wrap:wrap">' +
        '<button data-action="copy" data-copy="' + _escAttr(copy) + '" style="padding:6px 12px;background:#10B981;color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;flex:1">' +
          'Copiar copy' +
        '</button>' +
        '<button data-action="mark" data-type="' + _esc(opp.type) + '" data-source-id="' + _esc(opp.source_id) + '" style="padding:6px 12px;background:#F5F3FF;color:#5B21B6;border:1.5px solid #DDD6FE;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">' +
          'Marcar postado' +
        '</button>' +
      '</div>' +
    '</div>'
  }

  function _escAttr(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'&#10;')
  }

  // ── Fetch/Actions ───────────────────────────────────────────
  async function _fetchData() {
    var sb = _sb()
    if (!sb) return { ok: false, error: 'no_supabase' }
    try {
      var res = await sb.rpc('growth_content_opportunities', {
        p_period_days: _state.period,
        p_limit:       50,
      })
      if (res.error) return { ok: false, error: res.error.message }
      return res.data
    } catch (e) {
      return { ok: false, error: e && e.message }
    }
  }

  async function _reload() {
    var body = document.getElementById('contentIGBody')
    if (!body || _state.loading) return
    _state.loading = true
    body.innerHTML = '<div style="padding:24px;text-align:center;color:#9CA3AF;font-size:13px">Carregando...</div>'
    _state.data = await _fetchData()
    body.innerHTML = _renderBody(_state.data)
    _wireCardEvents(body)
    _state.loading = false
    // Contador no header
    var counter = document.getElementById('contentIGCounter')
    if (counter) {
      var opps = (_state.data && _state.data.opportunities) || []
      var pending = opps.filter(function (o) { return !o.posted }).length
      if (pending > 0) {
        counter.textContent = pending + ' p/ postar'
        counter.style.display = 'inline-block'
      } else {
        counter.style.display = 'none'
      }
    }
  }

  function _wireCardEvents(container) {
    container.addEventListener('click', async function (e) {
      var btn = e.target.closest('button[data-action]')
      if (!btn) return
      var action = btn.dataset.action
      if (action === 'copy') {
        var copy = btn.dataset.copy || ''
        try {
          await navigator.clipboard.writeText(copy.replace(/&#10;/g, '\n'))
          _flashBtn(btn, 'Copiado!', '#059669')
        } catch (_) {
          _flashBtn(btn, 'Erro', '#DC2626')
        }
      } else if (action === 'mark') {
        await _markPosted(btn.dataset.type, btn.dataset.sourceId, btn)
      }
    }, { once: false })
  }

  function _flashBtn(btn, txt, color) {
    var orig = btn.textContent
    var origBg = btn.style.background
    btn.textContent = txt
    if (color) btn.style.background = color
    setTimeout(function () {
      btn.textContent = orig
      btn.style.background = origBg
    }, 1400)
  }

  async function _markPosted(type, sourceId, btn) {
    var sb = _sb()
    if (!sb) return
    var url = prompt('Link do post no Instagram (opcional):', '')
    btn.disabled = true
    var orig = btn.textContent
    btn.textContent = 'Marcando...'
    try {
      var res = await sb.rpc('growth_content_mark_posted', {
        p_type:      type,
        p_source_id: sourceId,
        p_url:       url || null,
      })
      if (res.error || !(res.data && res.data.ok)) {
        btn.textContent = orig
        btn.disabled = false
        alert('Falhou: ' + (res.error && res.error.message || (res.data && res.data.error) || 'desconhecido'))
        return
      }
      // Remove card com fade
      var card = btn.closest('div[style*="border-left:3px"]')
      if (card) {
        card.style.transition = 'opacity .3s, transform .3s'
        card.style.opacity = '0'
        card.style.transform = 'scale(.95)'
        setTimeout(function () { card.remove() }, 300)
      }
    } catch (e) {
      btn.textContent = orig
      btn.disabled = false
      alert('Erro: ' + (e && e.message || e))
    }
  }

  function _onPeriodChange(v) {
    _state.period = parseInt(v, 10) || 60
    _reload()
  }

  async function renderContentIG(containerId) {
    var c = _renderShell(containerId)
    if (!c) return
    await _reload()
  }

  window._contentIGOnPeriodChange = _onPeriodChange
  window._contentIGReload         = _reload
  window.renderContentIG          = renderContentIG
})()
