/**
 * ClinicAI - VPI Missoes UI
 * CRUD admin completo de vpi_missoes com listagem, modal editor,
 * acoes inline (emitir recompensas pendentes, pausar/ativar, ver
 * completions). Renderiza dentro de #vpiMissoesContainer no panel 5
 * da pagina growth-referral.
 *
 * Expoe:
 *   window.vpiRenderMissoes, vpiOpenMissaoModal, vpiCloseMissaoModal,
 *   vpiSaveMissao, vpiDeleteMissao, vpiToggleMissao,
 *   vpiEmitMissaoRewards, vpiOpenMissaoCompletions,
 *   vpiCloseMissaoCompletions
 */
;(function () {
  'use strict'

  if (window._vpiMissoesUILoaded) return
  window._vpiMissoesUILoaded = true

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _toast(title, body, kind) {
    if (window._showToast) _showToast(title, body, kind || 'info')
  }
  function _sb() { return window._sbShared || null }
  async function _rpc(name, args) {
    var sb = _sb()
    if (!sb) throw new Error('Supabase client indisponivel')
    var res = await sb.rpc(name, args || {})
    if (res.error) throw new Error(res.error.message)
    return res.data
  }

  var PERIODO_LABEL = { '7d': '7 dias', '30d': '30 dias', 'mes': 'Mes calendario', '90d': '90 dias' }
  var TIPO_LABEL = {
    indicacoes_fechadas: 'Indicacoes fechadas',
    full_face_fechado:   'Full Face fechado',
    streak_dias:         'Streak (dias consecutivos)',
  }

  function _criterioDesc(c) {
    if (!c) return '—'
    if (c.tipo === 'indicacoes_fechadas') {
      return (c.quantidade || 1) + ' indicacao(oes) em ' + (PERIODO_LABEL[c.periodo] || c.periodo || '7 dias')
    }
    if (c.tipo === 'full_face_fechado') return '1 Full Face fechado'
    if (c.tipo === 'streak_dias') return (c.dias || 7) + ' dias consecutivos'
    return c.tipo || '—'
  }

  function _fmtDateShort(iso) {
    if (!iso) return '—'
    try {
      var d = new Date(iso)
      var dd = String(d.getDate()).padStart(2, '0')
      var mm = String(d.getMonth() + 1).padStart(2, '0')
      return dd + '/' + mm + '/' + d.getFullYear()
    } catch (_) { return '—' }
  }

  function _isoToInput(iso) {
    if (!iso) return ''
    try { return new Date(iso).toISOString().slice(0, 10) } catch (_) { return '' }
  }

  function _ensureContainer() {
    var panel = document.getElementById('vpiPanel5')
    if (!panel) return null
    var container = document.getElementById('vpiMissoesContainer')
    if (container) return container

    var block = document.createElement('div')
    block.id = 'vpiMissoesContainer'
    block.style.cssText = 'background:#fff;border-radius:12px;border:1px solid #F3F4F6;padding:22px'
    block.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">' +
        '<div>' +
          '<div style="font-size:15px;font-weight:700;color:#111;margin-bottom:2px">Missoes do Programa</div>' +
          '<div style="font-size:12px;color:#9CA3AF">Crie e gerencie missoes semanais/mensais. A recompensa e enviada automaticamente por WhatsApp quando a parceira completa.</div>' +
        '</div>' +
        '<button onclick="vpiOpenMissaoModal()" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;padding:9px 16px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer">' +
          '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>' +
          'Nova missao' +
        '</button>' +
      '</div>' +
      '<div id="vpiMissoesBody"><div style="text-align:center;color:#9CA3AF;font-size:13px;padding:20px">Carregando...</div></div>'
    panel.appendChild(block)
    return block
  }

  function _countdown(validUntil) {
    if (!validUntil) return 'Sem prazo'
    var end = new Date(validUntil).getTime()
    var ms = end - Date.now()
    if (ms <= 0) return 'Expirada'
    var d = Math.floor(ms / 86400000)
    var h = Math.floor((ms % 86400000) / 3600000)
    if (d >= 1) return d + 'd' + (h ? ' ' + h + 'h' : '') + ' restantes'
    return h + 'h restantes'
  }

  async function render() {
    var container = _ensureContainer()
    if (!container) return
    var body = document.getElementById('vpiMissoesBody')
    if (!body) return

    var list = []
    try {
      list = await _rpc('vpi_missao_list', { p_include_inactive: true })
    } catch (e) {
      body.innerHTML = '<div style="color:#DC2626;font-size:13px;padding:18px;background:#FEF2F2;border-radius:8px">Erro: ' + _esc(e.message) + '</div>'
      return
    }

    if (!list || !list.length) {
      body.innerHTML = '<div style="text-align:center;color:#9CA3AF;font-size:13px;padding:30px">Nenhuma missao criada. Clique em <strong>Nova missao</strong> para comecar.</div>'
      return
    }

    var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px">'
    list.forEach(function (m) {
      var expired = !!m.is_expired
      var badge = expired
        ? '<span style="display:inline-block;padding:2px 8px;border-radius:99px;background:#FEF2F2;color:#B91C1C;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">Expirada</span>'
        : (m.is_active
          ? '<span style="display:inline-block;padding:2px 8px;border-radius:99px;background:#ECFDF5;color:#047857;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">Ativa</span>'
          : '<span style="display:inline-block;padding:2px 8px;border-radius:99px;background:#F3F4F6;color:#6B7280;font-size:10px;font-weight:700;letter-spacing:.05em;text-transform:uppercase">Pausada</span>')

      var pendentes = m.total_pendentes || 0
      var toggleTxt = m.is_active ? 'Pausar' : 'Ativar'
      var toggleStyle = m.is_active
        ? 'background:#FFFBEB;color:#92400E;border-color:#FCD34D'
        : 'background:#ECFDF5;color:#047857;border-color:#6EE7B7'
      var pendBadge = pendentes > 0
        ? '<div style="margin-top:6px;font-size:11px;color:#DC2626;font-weight:700">' + pendentes + ' recompensa(s) pendente(s) de envio</div>'
        : ''

      html += '<div style="border:1.5px solid ' + (expired ? '#FECACA' : (m.is_active ? '#DDD6FE' : '#E5E7EB')) + ';border-radius:12px;padding:16px;background:' + (expired ? '#FFFBFB' : '#fff') + ';position:relative">' +
        '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;gap:8px">' +
          '<div style="flex:1;min-width:0">' +
            '<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;flex-wrap:wrap">' + badge +
              '<span style="font-size:10px;color:#9CA3AF">' + _esc(_countdown(m.valid_until)) + '</span>' +
            '</div>' +
            '<div style="font-size:14px;font-weight:700;color:#111;margin-bottom:4px;word-wrap:break-word">' + _esc(m.titulo) + '</div>' +
            '<div style="font-size:11px;color:#6B7280;line-height:1.4;min-height:28px">' + _esc(m.descricao) + '</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:4px;flex-shrink:0">' +
            '<button onclick="vpiOpenMissaoModal(\'' + _esc(m.id) + '\')" title="Editar" style="padding:4px 6px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;cursor:pointer;color:#374151;display:inline-flex;align-items:center;justify-content:center">' +
              '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>' +
            '</button>' +
            '<button onclick="vpiDeleteMissao(\'' + _esc(m.id) + '\')" title="Remover" style="padding:4px 6px;border:1px solid #FEE2E2;border-radius:6px;background:#FEF2F2;cursor:pointer;color:#DC2626;display:inline-flex;align-items:center;justify-content:center">' +
              '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/></svg>' +
            '</button>' +
          '</div>' +
        '</div>' +
        '<div style="background:#F9FAFB;border-radius:8px;padding:10px;margin:10px 0">' +
          '<div style="font-size:10px;color:#9CA3AF;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-bottom:3px">Criterio</div>' +
          '<div style="font-size:12px;color:#374151">' + _esc(_criterioDesc(m.criterio)) + '</div>' +
          '<div style="font-size:10px;color:#9CA3AF;font-weight:700;text-transform:uppercase;letter-spacing:.05em;margin-top:8px;margin-bottom:3px">Recompensa</div>' +
          '<div style="font-size:12px;color:#111;font-weight:600">' + _esc(m.recompensa_texto || '—') + (m.recompensa_valor > 0 ? ' <span style="color:#9CA3AF;font-weight:500">(R$ ' + Number(m.recompensa_valor).toFixed(0) + ')</span>' : '') + '</div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:10px">' +
          '<div style="text-align:center;padding:6px;background:#F3F4F6;border-radius:6px"><div style="font-size:16px;font-weight:800;color:#7C3AED">' + (m.total_completos || 0) + '</div><div style="font-size:10px;color:#6B7280">Completos</div></div>' +
          '<div style="text-align:center;padding:6px;background:#F3F4F6;border-radius:6px"><div style="font-size:16px;font-weight:800;color:#10B981">' + (m.total_emitidos || 0) + '</div><div style="font-size:10px;color:#6B7280">Emitidos</div></div>' +
          '<div style="text-align:center;padding:6px;background:' + (pendentes > 0 ? '#FEF2F2' : '#F3F4F6') + ';border-radius:6px"><div style="font-size:16px;font-weight:800;color:' + (pendentes > 0 ? '#DC2626' : '#6B7280') + '">' + pendentes + '</div><div style="font-size:10px;color:#6B7280">Pendentes</div></div>' +
        '</div>' +
        pendBadge +
        '<div style="font-size:10px;color:#9CA3AF;margin-top:10px">Valido ate ' + _esc(_fmtDateShort(m.valid_until)) + '</div>' +
        '<div style="display:flex;gap:6px;margin-top:10px;border-top:1px solid #F3F4F6;padding-top:10px;flex-wrap:wrap">' +
          '<button onclick="vpiOpenMissaoCompletions(\'' + _esc(m.id) + '\')" style="flex:1;padding:7px;border:1px solid #E5E7EB;border-radius:6px;background:#fff;color:#374151;font-size:11px;font-weight:600;cursor:pointer;min-width:90px">Ver completos</button>' +
          '<button onclick="vpiEmitMissaoRewards(\'' + _esc(m.id) + '\')" ' + (pendentes === 0 ? 'disabled' : '') + ' style="flex:1;padding:7px;border:1px solid ' + (pendentes > 0 ? '#6EE7B7' : '#E5E7EB') + ';border-radius:6px;background:' + (pendentes > 0 ? '#ECFDF5' : '#F9FAFB') + ';color:' + (pendentes > 0 ? '#047857' : '#9CA3AF') + ';font-size:11px;font-weight:700;cursor:' + (pendentes > 0 ? 'pointer' : 'not-allowed') + ';min-width:90px">Emitir (' + pendentes + ')</button>' +
          '<button onclick="vpiToggleMissao(\'' + _esc(m.id) + '\',' + (!m.is_active) + ')" style="flex:1;padding:7px;border:1px solid;border-radius:6px;font-size:11px;font-weight:600;cursor:pointer;min-width:90px;' + toggleStyle + '">' + toggleTxt + '</button>' +
        '</div>' +
      '</div>'
    })
    html += '</div>'
    body.innerHTML = html
  }

  // ══════════════════════════════════════════════════
  //  Modal editor
  // ══════════════════════════════════════════════════
  var _editing = null  // missao carregada pro modal

  function _renderModal(m) {
    _closeModal()
    var overlay = document.createElement('div')
    overlay.id = 'vpiMissaoModal'
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10000;display:flex;align-items:center;justify-content:center;padding:16px'

    m = m || {
      titulo: '', descricao: '',
      criterio: { tipo: 'indicacoes_fechadas', quantidade: 1, periodo: '7d' },
      recompensa_texto: '', recompensa_valor: 0,
      msg_template_sucesso: 'Parabens {{nome}}! Voce completou a missao *{{missao_titulo}}* e ganhou {{recompensa_texto}}. Fale com a clinica para resgatar.',
      valid_from: null, valid_until: null, is_active: true, sort_order: 0,
    }
    var crit = m.criterio || {}

    overlay.innerHTML =
      '<div style="background:#fff;border-radius:14px;width:100%;max-width:640px;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.2)">' +
        '<div style="padding:20px 24px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between;position:sticky;top:0;background:#fff;z-index:1">' +
          '<div style="font-size:15px;font-weight:700;color:#111">' + (m.id ? 'Editar missao' : 'Nova missao') + '</div>' +
          '<button onclick="vpiCloseMissaoModal()" style="background:none;border:none;cursor:pointer;color:#9CA3AF"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
        '</div>' +
        '<div style="padding:20px 24px">' +
          '<input type="hidden" id="mId" value="' + _esc(m.id || '') + '"/>' +

          '<div style="margin-bottom:12px">' +
            '<label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Titulo *</label>' +
            '<input id="mTitulo" type="text" placeholder="Ex: Indique 1 amiga esta semana" value="' + _esc(m.titulo || '') + '" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>' +
          '</div>' +

          '<div style="margin-bottom:12px">' +
            '<label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Descricao</label>' +
            '<textarea id="mDesc" rows="2" placeholder="Contexto pra parceira saber o que precisa fazer" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box;resize:vertical;font-family:inherit">' + _esc(m.descricao || '') + '</textarea>' +
          '</div>' +

          '<div style="border:1.5px solid #E5E7EB;border-radius:10px;padding:14px;margin-bottom:14px;background:#FAFAFA">' +
            '<div style="font-size:11px;font-weight:700;color:#7C3AED;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Criterio *</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">' +
              '<div>' +
                '<label style="font-size:10px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px">Tipo</label>' +
                '<select id="mTipo" onchange="_vpiMissaoTipoChange()" style="width:100%;padding:7px 9px;border:1.5px solid #E5E7EB;border-radius:6px;font-size:12px;outline:none;box-sizing:border-box;background:#fff">' +
                  '<option value="indicacoes_fechadas"' + (crit.tipo === 'indicacoes_fechadas' ? ' selected' : '') + '>Indicacoes fechadas</option>' +
                  '<option value="full_face_fechado"' +   (crit.tipo === 'full_face_fechado'   ? ' selected' : '') + '>Full Face fechado</option>' +
                  '<option value="streak_dias"' +         (crit.tipo === 'streak_dias'         ? ' selected' : '') + '>Streak (dias consec.)</option>' +
                '</select>' +
              '</div>' +
              '<div>' +
                '<label style="font-size:10px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px">Quantidade</label>' +
                '<input id="mQtd" type="number" min="1" value="' + (crit.quantidade || crit.dias || 1) + '" style="width:100%;padding:7px 9px;border:1.5px solid #E5E7EB;border-radius:6px;font-size:12px;outline:none;box-sizing:border-box"/>' +
              '</div>' +
              '<div id="mPeriodoWrap">' +
                '<label style="font-size:10px;font-weight:600;color:#6B7280;display:block;margin-bottom:3px">Periodo</label>' +
                '<select id="mPeriodo" style="width:100%;padding:7px 9px;border:1.5px solid #E5E7EB;border-radius:6px;font-size:12px;outline:none;box-sizing:border-box;background:#fff">' +
                  '<option value="7d"'  + (crit.periodo === '7d'  ? ' selected' : '') + '>7 dias</option>' +
                  '<option value="30d"' + (crit.periodo === '30d' ? ' selected' : '') + '>30 dias</option>' +
                  '<option value="mes"' + (crit.periodo === 'mes' ? ' selected' : '') + '>Mes calendario</option>' +
                  '<option value="90d"' + (crit.periodo === '90d' ? ' selected' : '') + '>90 dias</option>' +
                '</select>' +
              '</div>' +
            '</div>' +
          '</div>' +

          '<div style="display:grid;grid-template-columns:2fr 1fr;gap:12px;margin-bottom:12px">' +
            '<div>' +
              '<label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Recompensa *</label>' +
              '<input id="mRtxt" type="text" placeholder="Ex: Kit skincare R$50 extra" value="' + _esc(m.recompensa_texto || '') + '" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>' +
            '</div>' +
            '<div>' +
              '<label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Valor (R$)</label>' +
              '<input id="mRval" type="number" min="0" step="10" value="' + (m.recompensa_valor || 0) + '" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>' +
            '</div>' +
          '</div>' +

          '<div style="margin-bottom:12px">' +
            '<label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Mensagem WhatsApp de sucesso</label>' +
            '<textarea id="mMsg" rows="4" oninput="_vpiMissaoPreview()" style="width:100%;padding:10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box;resize:vertical;font-family:inherit">' + _esc(m.msg_template_sucesso || '') + '</textarea>' +
            '<div style="font-size:11px;color:#6B7280;margin-top:5px">Variaveis: <code>{{nome}}</code>, <code>{{missao_titulo}}</code>, <code>{{recompensa_texto}}</code>, <code>{{recompensa_valor}}</code>, <code>{{clinica}}</code></div>' +
          '</div>' +

          '<div style="background:#F9FAFB;border-radius:8px;padding:12px;margin-bottom:12px">' +
            '<div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:6px">Preview</div>' +
            '<div id="mPreview" style="font-size:12px;color:#374151;line-height:1.5;white-space:pre-wrap;font-style:italic">—</div>' +
          '</div>' +

          '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">' +
            '<div>' +
              '<label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Valido de</label>' +
              '<input id="mFrom" type="date" value="' + _esc(_isoToInput(m.valid_from)) + '" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>' +
            '</div>' +
            '<div>' +
              '<label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Valido ate</label>' +
              '<input id="mUntil" type="date" value="' + _esc(_isoToInput(m.valid_until)) + '" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>' +
            '</div>' +
          '</div>' +

          '<div style="display:flex;gap:12px;align-items:center;margin-bottom:16px">' +
            '<label style="display:flex;align-items:center;gap:6px;font-size:13px;color:#374151;cursor:pointer">' +
              '<input id="mActive" type="checkbox"' + (m.is_active !== false ? ' checked' : '') + '/> Ativa' +
            '</label>' +
            '<div style="flex:1"></div>' +
            '<label style="font-size:11px;color:#6B7280">Ordem</label>' +
            '<input id="mOrder" type="number" value="' + (m.sort_order || 0) + '" style="width:70px;padding:7px 9px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:12px;outline:none"/>' +
          '</div>' +

          '<div style="display:flex;gap:10px;justify-content:flex-end;border-top:1px solid #F3F4F6;padding-top:14px">' +
            '<button onclick="vpiCloseMissaoModal()" style="padding:9px 16px;border:1.5px solid #E5E7EB;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>' +
            '<button onclick="vpiSaveMissao()" style="padding:9px 20px;border:none;border-radius:8px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;font-size:13px;font-weight:700;cursor:pointer">Salvar</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    document.body.appendChild(overlay)
    overlay.addEventListener('click', function (e) { if (e.target === overlay) _closeModal() })
    setTimeout(function () { _onTipoChange(); _preview() }, 80)
  }

  function _closeModal() {
    var m = document.getElementById('vpiMissaoModal')
    if (m) m.remove()
    _editing = null
  }

  function _onTipoChange() {
    var tipo = (document.getElementById('mTipo') || {}).value
    var wrap = document.getElementById('mPeriodoWrap')
    if (!wrap) return
    // Periodo so se aplica a indicacoes_fechadas
    wrap.style.visibility = (tipo === 'indicacoes_fechadas') ? 'visible' : 'hidden'
    var qtdEl = document.getElementById('mQtd')
    if (tipo === 'full_face_fechado' && qtdEl) qtdEl.value = 1
  }

  function _renderTemplate(tpl, vars) {
    var out = tpl || ''
    Object.keys(vars || {}).forEach(function (k) {
      out = out.split('{{' + k + '}}').join(vars[k] == null ? '' : String(vars[k]))
    })
    return out
  }

  function _preview() {
    var tpl = (document.getElementById('mMsg') || {}).value || ''
    var vars = {
      nome: 'Ana',
      missao_titulo: (document.getElementById('mTitulo') || {}).value || 'Titulo da missao',
      recompensa_texto: (document.getElementById('mRtxt') || {}).value || 'Recompensa',
      recompensa_valor: (document.getElementById('mRval') || {}).value
        ? 'R$ ' + Number((document.getElementById('mRval') || {}).value).toFixed(0)
        : '',
      clinica: 'Clinica Mirian de Paula Beauty & Health',
    }
    var el = document.getElementById('mPreview')
    if (el) el.textContent = _renderTemplate(tpl, vars) || '—'
  }

  async function openModal(id) {
    if (!id) return _renderModal(null)
    try {
      var list = await _rpc('vpi_missao_list', { p_include_inactive: true })
      var found = (list || []).find(function (x) { return x.id === id })
      _renderModal(found || null)
    } catch (e) {
      alert('Erro ao carregar missao: ' + (e.message || ''))
    }
  }

  async function saveMissao() {
    var g = function (id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : '' }
    var id        = g('mId') || null
    var titulo    = g('mTitulo')
    var descricao = g('mDesc')
    var tipo      = g('mTipo') || 'indicacoes_fechadas'
    var qtd       = parseInt(g('mQtd'), 10) || 1
    var periodo   = g('mPeriodo') || '7d'
    var rtxt      = g('mRtxt')
    var rval      = parseFloat(g('mRval')) || 0
    var msg       = g('mMsg')
    var fromStr   = g('mFrom')
    var untilStr  = g('mUntil')
    var active    = !!document.getElementById('mActive').checked
    var order     = parseInt(g('mOrder'), 10) || 0

    if (!titulo) { alert('Titulo e obrigatorio'); return }
    if (!rtxt)   { alert('Recompensa e obrigatoria'); return }

    var criterio = { tipo: tipo }
    if (tipo === 'indicacoes_fechadas') {
      criterio.quantidade = qtd
      criterio.periodo    = periodo
    } else if (tipo === 'full_face_fechado') {
      criterio.quantidade = 1
    } else if (tipo === 'streak_dias') {
      criterio.dias = qtd
    }

    // Date inputs: YYYY-MM-DD → ISO. Se vazio, valid_until fica null.
    var valid_from  = fromStr ? new Date(fromStr + 'T00:00:00').toISOString() : null
    var valid_until = untilStr ? new Date(untilStr + 'T23:59:59').toISOString() : null

    if (valid_from && valid_until && new Date(valid_until) <= new Date(valid_from)) {
      alert('Data final deve ser maior que inicial'); return
    }

    try {
      var res = await _rpc('vpi_missao_upsert', {
        p_data: {
          id:                   id,
          titulo:               titulo,
          descricao:            descricao,
          criterio:             criterio,
          recompensa_texto:     rtxt,
          recompensa_valor:     rval,
          msg_template_sucesso: msg,
          valid_from:           valid_from,
          valid_until:          valid_until,
          is_active:            active,
          sort_order:           order,
        }
      })
      if (!res || !res.ok) throw new Error((res && res.error) || 'Erro desconhecido')
      _closeModal()
      await render()
      _toast('Missao salva', res.created ? 'Criada com sucesso' : 'Atualizada com sucesso', 'success')
    } catch (e) {
      console.error('[VPI Missoes] save:', e)
      alert('Erro ao salvar: ' + (e.message || ''))
    }
  }

  async function deleteMissao(id) {
    if (!confirm('Remover esta missao? Todo o progresso dela sera apagado tambem.')) return
    try {
      var res = await _rpc('vpi_missao_delete', { p_id: id })
      if (!res || !res.ok) throw new Error((res && res.error) || 'Falhou')
      await render()
      _toast('Missao removida', '', 'success')
    } catch (e) {
      alert('Erro: ' + (e.message || ''))
    }
  }

  async function toggleMissao(id, makeActive) {
    try {
      var list = await _rpc('vpi_missao_list', { p_include_inactive: true })
      var m = (list || []).find(function (x) { return x.id === id })
      if (!m) throw new Error('Missao nao encontrada')
      m.is_active = !!makeActive
      var res = await _rpc('vpi_missao_upsert', { p_data: m })
      if (!res || !res.ok) throw new Error((res && res.error) || 'Falhou')
      await render()
      _toast(makeActive ? 'Missao ativada' : 'Missao pausada', '', 'info')
    } catch (e) {
      alert('Erro: ' + (e.message || ''))
    }
  }

  async function emitRewards(missaoId) {
    if (!confirm('Emitir recompensas pendentes desta missao? Uma msg WhatsApp sera enviada para cada parceira.')) return
    try {
      var res = await _rpc('vpi_emit_missao_rewards_batch', { p_missao_id: missaoId })
      if (!res || !res.ok) throw new Error((res && res.error) || 'Falhou')
      var msg = 'Enviadas: ' + (res.emitted_count || 0)
      if (res.skipped_already)   msg += ' | ja emitidas: ' + res.skipped_already
      if (res.skipped_incomplete) msg += ' | incompletas: ' + res.skipped_incomplete
      if (res.failed)            msg += ' | falhas: ' + res.failed
      await render()
      _toast('Recompensas', msg, 'success')
    } catch (e) {
      alert('Erro: ' + (e.message || ''))
    }
  }

  // ══════════════════════════════════════════════════
  //  Drawer: completions
  // ══════════════════════════════════════════════════
  async function openCompletions(missaoId) {
    _closeCompletions()
    try {
      var res = await _rpc('vpi_missao_completions', { p_missao_id: missaoId })
      if (!res || !res.ok) throw new Error((res && res.error) || 'Falhou')
      _renderDrawer(res.completions || [], missaoId)
    } catch (e) {
      alert('Erro: ' + (e.message || ''))
    }
  }

  function _renderDrawer(rows, missaoId) {
    var overlay = document.createElement('div')
    overlay.id = 'vpiMissaoCompDrawer'
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:10000;display:flex;justify-content:flex-end'

    var html = ''
    if (!rows.length) {
      html = '<div style="padding:30px;text-align:center;color:#9CA3AF;font-size:13px">Nenhuma parceira completou esta missao ainda.</div>'
    } else {
      html = '<div style="padding:8px">'
      rows.forEach(function (r) {
        var emitMark = r.recompensa_emitida
          ? '<span style="display:inline-block;padding:2px 7px;border-radius:99px;background:#ECFDF5;color:#047857;font-size:10px;font-weight:700">emitida ' + _fmtDateShort(r.recompensa_emitida_at) + '</span>'
          : (r.completed_at
            ? '<span style="display:inline-block;padding:2px 7px;border-radius:99px;background:#FEF2F2;color:#B91C1C;font-size:10px;font-weight:700">pendente</span>'
            : '<span style="display:inline-block;padding:2px 7px;border-radius:99px;background:#F3F4F6;color:#6B7280;font-size:10px;font-weight:700">em progresso</span>')
        html += '<div style="padding:12px;border:1px solid #F3F4F6;border-radius:10px;margin-bottom:8px">' +
          '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">' +
            '<div style="flex:1;min-width:0">' +
              '<div style="font-size:13px;font-weight:700;color:#111">' + _esc(r.partner_nome || 'Partner') + '</div>' +
              '<div style="font-size:11px;color:#6B7280">Tier: ' + _esc(r.partner_tier || '—') + ' | ' + _esc(r.partner_phone || '') + '</div>' +
            '</div>' +
            emitMark +
          '</div>' +
          '<div style="font-size:11px;color:#374151;margin-top:6px">Progresso: ' + r.progresso_atual + '/' + r.target +
          (r.completed_at ? ' | Concluida em ' + _fmtDateShort(r.completed_at) : '') + '</div>' +
        '</div>'
      })
      html += '</div>'
    }

    overlay.innerHTML =
      '<div style="background:#fff;width:100%;max-width:440px;height:100%;display:flex;flex-direction:column;box-shadow:-12px 0 30px rgba(0,0,0,.15)">' +
        '<div style="padding:16px 20px;border-bottom:1px solid #F3F4F6;display:flex;justify-content:space-between;align-items:center">' +
          '<div><div style="font-size:14px;font-weight:700;color:#111">Completaram a missao</div><div style="font-size:11px;color:#9CA3AF">' + (rows.length) + ' parceiras</div></div>' +
          '<button onclick="vpiCloseMissaoCompletions()" style="background:none;border:none;cursor:pointer;color:#9CA3AF"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M18 6L6 18M6 6l12 12"/></svg></button>' +
        '</div>' +
        '<div style="flex:1;overflow-y:auto">' + html + '</div>' +
      '</div>'

    document.body.appendChild(overlay)
    overlay.addEventListener('click', function (e) { if (e.target === overlay) _closeCompletions() })
  }

  function _closeCompletions() {
    var el = document.getElementById('vpiMissaoCompDrawer')
    if (el) el.remove()
  }

  // ══════════════════════════════════════════════════
  //  Exports
  // ══════════════════════════════════════════════════
  window.vpiRenderMissoes           = render
  window.vpiOpenMissaoModal         = openModal
  window.vpiCloseMissaoModal        = _closeModal
  window.vpiSaveMissao              = saveMissao
  window.vpiDeleteMissao            = deleteMissao
  window.vpiToggleMissao            = toggleMissao
  window.vpiEmitMissaoRewards       = emitRewards
  window.vpiOpenMissaoCompletions   = openCompletions
  window.vpiCloseMissaoCompletions  = _closeCompletions
  window._vpiMissaoTipoChange       = _onTipoChange
  window._vpiMissaoPreview          = _preview
})()
