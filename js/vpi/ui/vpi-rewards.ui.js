/**
 * ClinicAI - VPI Rewards UI
 * CRUD completo de vpi_reward_tiers.
 * Renderiza dentro do container #vpiRewardsContainer (criado dinamicamente
 * dentro do panel 4 da pagina growth-referral).
 *
 * Expoe: window.vpiRenderRewards, vpiOpenTierModal, vpiCloseTierModal,
 *        vpiSaveTier, vpiDeleteTier
 */
;(function () {
  'use strict'

  if (window._vpiRewardsUILoaded) return
  window._vpiRewardsUILoaded = true

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  var TIPO_LABEL = {
    per_indication:   'Por indicação',
    milestone:        'Milestone',
    high_performance: 'Alta Performance',
  }

  function _groupByTipo(tiers) {
    var g = { per_indication: [], milestone: [], high_performance: [] }
    tiers.forEach(function (t) { if (g[t.tipo]) g[t.tipo].push(t) })
    Object.keys(g).forEach(function (k) {
      g[k].sort(function (a, b) { return (a.threshold || 0) - (b.threshold || 0) })
    })
    return g
  }

  function _ensureContainer() {
    var panel = document.getElementById('vpiPanel4')
    if (!panel) return null
    var container = document.getElementById('vpiRewardsContainer')
    if (container) return container

    // Cria bloco de Recompensas editaveis no topo do panel 4
    var block = document.createElement('div')
    block.id = 'vpiRewardsContainer'
    block.style.cssText = 'background:#fff;border-radius:12px;border:1px solid #F3F4F6;padding:22px;margin-bottom:20px'
    block.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">' +
        '<div>' +
          '<div style="font-size:15px;font-weight:700;color:#111;margin-bottom:2px">Recompensas do Programa</div>' +
          '<div style="font-size:12px;color:#9CA3AF">Configure os tiers e as mensagens WhatsApp enviadas quando forem liberados</div>' +
        '</div>' +
        '<button onclick="vpiOpenTierModal()" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;padding:9px 16px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer">' +
          '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>' +
          'Nova recompensa' +
        '</button>' +
      '</div>' +
      '<div id="vpiRewardsBody"><div style="text-align:center;color:#9CA3AF;font-size:13px;padding:20px">Carregando...</div></div>'
    panel.insertBefore(block, panel.firstChild)
    return block
  }

  async function render() {
    var container = _ensureContainer()
    if (!container || !window.VPIService) return

    var tiers = await VPIService.loadTiers(false)
    var body = document.getElementById('vpiRewardsBody')
    if (!body) return

    if (!tiers || !tiers.length) {
      body.innerHTML = '<div style="text-align:center;color:#9CA3AF;font-size:13px;padding:30px">Nenhum tier configurado. Clique em <strong>Nova recompensa</strong>.</div>'
      return
    }

    var grouped = _groupByTipo(tiers)
    var html = ''
    Object.keys(grouped).forEach(function (tipo) {
      var list = grouped[tipo]
      if (!list.length) return
      html += '<div style="margin-bottom:20px">' +
        '<div style="font-size:11px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">' + TIPO_LABEL[tipo] + '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px">'
      list.forEach(function (t) {
        var statusDot = t.is_active
          ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10B981;margin-right:6px"></span>'
          : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#9CA3AF;margin-right:6px"></span>'
        var valorStr = t.recompensa_valor > 0 ? 'R$ ' + Number(t.recompensa_valor).toFixed(0) : '—'
        var mesesStr = t.required_consecutive_months
          ? ' · ' + t.required_consecutive_months + ' meses'
          : ''
        html += '<div style="border:1.5px solid #E5E7EB;border-radius:10px;padding:14px;background:#FAFAFA;position:relative">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">' +
            '<div style="font-size:20px;font-weight:800;color:#7C3AED">' + (t.threshold || 0) + mesesStr + '</div>' +
            '<div style="display:flex;gap:4px">' +
              '<button onclick="vpiOpenTierModal(\'' + _esc(t.id) + '\')" title="Editar" style="padding:4px 6px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;cursor:pointer;color:#374151;display:inline-flex;align-items:center">' +
                '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' +
              '</button>' +
              '<button onclick="vpiDeleteTier(\'' + _esc(t.id) + '\')" title="Remover" style="padding:4px 6px;border:1px solid #FEE2E2;border-radius:6px;background:#FEF2F2;cursor:pointer;color:#DC2626;display:inline-flex;align-items:center">' +
                '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>' +
              '</button>' +
            '</div>' +
          '</div>' +
          '<div style="font-size:13px;font-weight:700;color:#111;margin-bottom:4px">' + _esc(t.recompensa) + '</div>' +
          '<div style="font-size:11px;color:#6B7280;margin-bottom:10px">' + statusDot + (t.is_active ? 'Ativo' : 'Inativo') + ' · valor ref ' + valorStr + '</div>' +
          '<div style="font-size:11px;color:#4B5563;background:#fff;border:1px dashed #E5E7EB;border-radius:6px;padding:8px;line-height:1.5;white-space:pre-wrap;max-height:70px;overflow:hidden">' + _esc(t.msg_template).substring(0, 180) + (t.msg_template && t.msg_template.length > 180 ? '...' : '') + '</div>' +
        '</div>'
      })
      html += '</div></div>'
    })
    body.innerHTML = html
  }

  // ══════════════════════════════════════════════════
  //  Modal editor
  // ══════════════════════════════════════════════════
  function _openModal(tier) {
    _closeModal()
    var overlay = document.createElement('div')
    overlay.id = 'vpiTierModal'
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px'

    var t = tier || { tipo: 'milestone', threshold: 5, recompensa: '', recompensa_valor: 0, msg_template: 'Parabéns {{nome}}! {{threshold}} indicações = {{recompensa}}', required_consecutive_months: null, is_active: true, sort_order: 0 }

    overlay.innerHTML =
      '<div style="background:#fff;border-radius:14px;width:100%;max-width:560px;max-height:90vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)">' +
        '<div style="padding:20px 24px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">' +
          '<div style="font-size:15px;font-weight:700;color:#111">' + (tier ? 'Editar recompensa' : 'Nova recompensa') + '</div>' +
          '<button onclick="vpiCloseTierModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
        '</div>' +
        '<div style="padding:20px 24px">' +
          '<input type="hidden" id="tierId" value="' + _esc(t.id || '') + '"/>' +

          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">' +
            '<div>' +
              '<label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Tipo</label>' +
              '<select id="tierTipo" onchange="_vpiTierOnTipoChange()" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box">' +
                '<option value="per_indication"' +   (t.tipo === 'per_indication'   ? ' selected' : '') + '>Por indicação (1ª)</option>' +
                '<option value="milestone"' +        (t.tipo === 'milestone'        ? ' selected' : '') + '>Milestone acumulativo</option>' +
                '<option value="high_performance"' + (t.tipo === 'high_performance' ? ' selected' : '') + '>Alta Performance (11 meses)</option>' +
              '</select>' +
            '</div>' +
            '<div>' +
              '<label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Threshold (creditos)</label>' +
              '<input id="tierThreshold" type="number" min="1" value="' + (t.threshold || 1) + '" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>' +
            '</div>' +
          '</div>' +

          '<div style="margin-bottom:12px">' +
            '<label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Recompensa</label>' +
            '<input id="tierRecompensa" type="text" placeholder="Ex: 1 Sessao Fotona 4D" value="' + _esc(t.recompensa || '') + '" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>' +
          '</div>' +

          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">' +
            '<div>' +
              '<label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Valor referencia (R$)</label>' +
              '<input id="tierValor" type="number" min="0" step="50" value="' + (t.recompensa_valor || 0) + '" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>' +
            '</div>' +
            '<div id="tierMonthsWrap"' + (t.tipo === 'high_performance' ? '' : ' style="display:none"') + '>' +
              '<label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Meses consecutivos</label>' +
              '<input id="tierMonths" type="number" min="1" value="' + (t.required_consecutive_months || 11) + '" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>' +
            '</div>' +
          '</div>' +

          '<div style="margin-bottom:12px">' +
            '<label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Mensagem WhatsApp (enviada ao parceiro quando a recompensa for liberada)</label>' +
            '<textarea id="tierMsg" rows="5" oninput="_vpiTierPreview()" style="width:100%;padding:10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box;resize:vertical;font-family:inherit">' + _esc(t.msg_template || '') + '</textarea>' +
            '<div style="font-size:11px;color:#6B7280;margin-top:6px">Variaveis: <code>{{nome}}</code>, <code>{{threshold}}</code>, <code>{{recompensa}}</code>, <code>{{creditos_atuais}}</code>, <code>{{faltam}}</code>, <code>{{clinica}}</code></div>' +
          '</div>' +

          '<div style="background:#F9FAFB;border-radius:8px;padding:12px;margin-bottom:12px">' +
            '<div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Preview</div>' +
            '<div id="tierPreview" style="font-size:12px;color:#374151;line-height:1.5;white-space:pre-wrap;font-style:italic">—</div>' +
          '</div>' +

          '<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px">' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151;cursor:pointer">' +
              '<input id="tierActive" type="checkbox"' + (t.is_active !== false ? ' checked' : '') + '/> Ativo' +
            '</label>' +
            '<div style="flex:1"></div>' +
            '<label style="font-size:11px;color:#6B7280">Ordem</label>' +
            '<input id="tierOrder" type="number" value="' + (t.sort_order || 0) + '" style="width:70px;padding:6px 8px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:12px;outline:none"/>' +
          '</div>' +

          '<div style="display:flex;gap:10px;justify-content:flex-end;border-top:1px solid #F3F4F6;padding-top:14px">' +
            '<button onclick="vpiCloseTierModal()" style="padding:9px 16px;border:1.5px solid #E5E7EB;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>' +
            '<button onclick="vpiSaveTier()" style="padding:9px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;font-size:13px;font-weight:700;cursor:pointer">Salvar</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    document.body.appendChild(overlay)
    overlay.addEventListener('click', function (e) { if (e.target === overlay) _closeModal() })
    setTimeout(_preview, 100)
  }

  function _closeModal() {
    var m = document.getElementById('vpiTierModal')
    if (m) m.remove()
  }

  function _onTipoChange() {
    var tipo = (document.getElementById('tierTipo') || {}).value
    var wrap = document.getElementById('tierMonthsWrap')
    if (wrap) wrap.style.display = tipo === 'high_performance' ? '' : 'none'
  }

  function _preview() {
    var tpl = (document.getElementById('tierMsg') || {}).value || ''
    var vars = {
      nome:            'Ana',
      threshold:       (document.getElementById('tierThreshold') || {}).value || '5',
      recompensa:      (document.getElementById('tierRecompensa') || {}).value || 'Recompensa',
      creditos_atuais: (document.getElementById('tierThreshold') || {}).value || '5',
      faltam:          '0',
      clinica:         'Clinica Mirian de Paula Beauty & Health',
    }
    var out = (window.VPIService && VPIService.renderTemplate)
      ? VPIService.renderTemplate(tpl, vars)
      : tpl
    var el = document.getElementById('tierPreview')
    if (el) el.textContent = out || '—'
  }

  async function saveTier() {
    var g = function (id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : '' }
    var tipo        = g('tierTipo') || 'milestone'
    var threshold   = parseInt(g('tierThreshold'), 10) || 0
    var recompensa  = g('tierRecompensa')
    var valor       = parseFloat(g('tierValor')) || 0
    var msg         = g('tierMsg')
    var months      = tipo === 'high_performance' ? (parseInt(g('tierMonths'), 10) || 11) : null
    var active      = !!document.getElementById('tierActive').checked
    var order       = parseInt(g('tierOrder'), 10) || 0
    var id          = g('tierId') || null

    if (!threshold || threshold < 1) { alert('Threshold deve ser maior que 0'); return }
    if (!recompensa) { alert('Informe a recompensa'); return }
    if (!msg) { alert('Mensagem WhatsApp e obrigatoria'); return }

    try {
      await VPIService.upsertTier({
        id:                          id,
        tipo:                        tipo,
        threshold:                   threshold,
        recompensa:                  recompensa,
        recompensa_valor:            valor,
        msg_template:                msg,
        required_consecutive_months: months,
        is_active:                   active,
        sort_order:                  order,
      })
      _closeModal()
      await render()
      if (window._showToast) _showToast('Salvo', 'Recompensa configurada', 'success')
    } catch (e) {
      console.error('[VPI] saveTier:', e)
      alert('Erro ao salvar: ' + (e && e.message || ''))
    }
  }

  async function deleteTier(id) {
    if (!confirm('Remover esta recompensa?')) return
    try {
      await VPIService.deleteTier(id)
      await render()
    } catch (e) {
      alert('Erro: ' + (e && e.message || ''))
    }
  }

  async function openTierModal(id) {
    if (!id) return _openModal(null)
    await VPIService.loadTiers(false)
    var t = VPIService.getTiers().find(function (x) { return x.id === id })
    _openModal(t || null)
  }

  window.vpiRenderRewards    = render
  window.vpiOpenTierModal    = openTierModal
  window.vpiCloseTierModal   = _closeModal
  window.vpiSaveTier         = saveTier
  window.vpiDeleteTier       = deleteTier
  window._vpiTierOnTipoChange = _onTipoChange
  window._vpiTierPreview     = _preview
})()
