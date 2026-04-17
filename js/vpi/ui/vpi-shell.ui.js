/**
 * ClinicAI - VPI UI Shell
 *
 * Orquestra as abas da pagina growth-referral. Importa os sub-modulos
 * (ranking, rewards, partner-modal) e substitui o JS inline antigo.
 *
 * Modal "Novo Parceiro" tem 2 modos:
 *   - Buscar existente (default): autocomplete em vpi_search_candidates
 *     debounce 300ms; click preenche form; edicao desbloquevel
 *   - Cadastrar do zero: formulario manual
 *
 * Exporta:
 *   window.vpiSwitchTab(n)
 *   window.vpiToggle(id)
 *   window.vpiSetSort(val)
 *   window.vpiRenderRanking(suffix)
 *   window.vpiRefreshKpis(suffix)
 *   window.vpiOpenAddPartner / vpiCloseAddPartner / vpiSavePartner
 *   window.vpiViewPartner(id)
 *   window.vpiDeletePartner(id)
 *   window.vpiRenderRewards() / vpiOpenTierModal / vpiCloseTierModal / vpiSaveTier / vpiDeleteTier
 *   window.vpiPSetMode / vpiPPickCandidate / vpiPClearSelected / vpiPToggleEdit
 */
;(function () {
  'use strict'

  if (window._vpiShellLoaded) return
  window._vpiShellLoaded = true

  var _sort = 'ranking'

  function _toast(title, body, kind) {
    if (window._showToast) _showToast(title, body, kind || 'info')
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _onlyDigits(s) { return String(s || '').replace(/\D/g, '') }

  function _maskPhone(raw) {
    var d = _onlyDigits(raw)
    if (!d) return ''
    if (d.length >= 12) { // with country code
      return '+' + d.slice(0, d.length - 11) + ' (' + d.slice(-11, -9) + ') ' +
             d.slice(-9, -4) + '-' + d.slice(-4)
    }
    if (d.length === 11) return '(' + d.slice(0,2) + ') ' + d.slice(2,7) + '-' + d.slice(7)
    if (d.length === 10) return '(' + d.slice(0,2) + ') ' + d.slice(2,6) + '-' + d.slice(6)
    return raw
  }

  function _initials(name) {
    var parts = String(name || '?').trim().split(/\s+/).filter(Boolean)
    if (!parts.length) return '?'
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  }

  // ══════════════════════════════════════════════════
  //  Tabs
  // ══════════════════════════════════════════════════
  function vpiSwitchTab(n) {
    [1, 2, 3, 4, 5, 6, 7, 8].forEach(function (i) {
      var panel = document.getElementById('vpiPanel' + i)
      var tab   = document.getElementById('vpiTab'   + i)
      if (!panel || !tab) return
      var active = i === n
      panel.style.display            = active ? '' : 'none'
      tab.style.color                = active ? '#7C3AED' : '#9CA3AF'
      tab.style.borderBottomColor    = active ? '#7C3AED' : 'transparent'
    })
    if (n === 1) refreshAll()
    if (n === 2) { refreshKpis('2') }
    if (n === 4) {
      if (window.vpiRenderRewards) window.vpiRenderRewards()
      vpiLoadStaffAlertConfig()
    }
    if (n === 5 && window.vpiRenderMissoes)       window.vpiRenderMissoes()
    if (n === 6 && window.vpiRenderChallenges)    window.vpiRenderChallenges()
    if (n === 7 && window.vpiRenderCelebrations)  window.vpiRenderCelebrations()
    if (n === 8 && window.vpiRenderResgates)      window.vpiRenderResgates()
  }

  function vpiToggle(id) {
    var el    = document.getElementById('vpiSec'   + id.replace('sec', ''))
    var arrow = document.getElementById('vpiArrow' + id.replace('sec', ''))
    if (!el) return
    var open = el.style.display !== 'none'
    el.style.display        = open ? 'none' : ''
    if (arrow) arrow.style.transform = open ? '' : 'rotate(180deg)'
  }

  // ══════════════════════════════════════════════════
  //  Sort
  // ══════════════════════════════════════════════════
  function vpiSetSort(val) {
    _sort = val
    document.querySelectorAll('.vpi-sort-btn').forEach(function (b) {
      var active = b.dataset.sort === val
      b.style.background  = active ? '#7C3AED' : '#F3F4F6'
      b.style.color       = active ? '#fff'    : '#374151'
      b.style.borderColor = active ? '#7C3AED' : '#E5E7EB'
    })
    vpiRenderRanking(''); vpiRenderRanking('2')
  }

  // ══════════════════════════════════════════════════
  //  KPIs
  // ══════════════════════════════════════════════════
  async function refreshKpis(suffix) {
    if (window.VPIStrategicKpis && typeof window.VPIStrategicKpis.render === 'function') {
      // Fase 6: KPIs estrategicos assumem (ja renderizam tudo no container)
      try {
        await window.VPIStrategicKpis.render(suffix || '')
        return
      } catch (e) {
        if (window.Logger) Logger.warn('[VPIShell] strategic render falhou:', e.message || e)
      }
    }
    // Fallback: KPIs antigos (caso VPIStrategicKpis ainda nao carregou)
    if (!window.VPIService) return
    var kpis = await VPIService.loadKpis()
    var s = suffix || ''
    var set = function (id, v) { var el = document.getElementById(id + s); if (el) el.textContent = v }
    set('vpiKpiTotal',  (kpis.parceiros_ativos || 0))
    set('vpiKpiMes',    (kpis.indicacoes_mes || 0))
    set('vpiKpiRecomp', (kpis.recompensas_liberadas || 0))
    set('vpiKpiConv',   (kpis.taxa_conversao || 0) + '%')
  }

  // ══════════════════════════════════════════════════
  //  Ranking render (reuses vpi-ranking module)
  // ══════════════════════════════════════════════════
  async function vpiRenderRanking(suffix) {
    if (window.VPIRankingUI && window.VPIRankingUI.render) {
      await window.VPIRankingUI.render(suffix || '', _sort)
    }
  }

  async function refreshAll() {
    await Promise.all([
      refreshKpis(''),
      refreshKpis('2'),
      vpiRenderRanking(''),
      vpiRenderRanking('2'),
    ])
  }

  // ══════════════════════════════════════════════════
  //  Partner modal — state + mode management
  // ══════════════════════════════════════════════════
  var _pState = {
    mode: 'search',       // 'search' | 'new'
    selected: null,       // candidato escolhido
    editUnlocked: false,  // se usuario clicou "Editar dados"
  }

  function _setFieldReadonly(id, readonly) {
    var el = document.getElementById(id)
    if (!el) return
    if (readonly) {
      el.setAttribute('readonly', 'readonly')
      el.setAttribute('disabled', 'disabled')
      el.style.background = '#F9FAFB'
      el.style.color = '#6B7280'
    } else {
      el.removeAttribute('readonly')
      el.removeAttribute('disabled')
      el.style.background = '#fff'
      el.style.color = '#111'
    }
  }

  function _setAllFieldsReadonly(readonly) {
    ['vpiPNome', 'vpiPTel', 'vpiPTelPref', 'vpiPProfissao', 'vpiPCidade', 'vpiPEstado', 'vpiPTipo'].forEach(function (id) {
      _setFieldReadonly(id, readonly)
    })
  }

  function _clearForm() {
    ;['vpiPNome', 'vpiPTel', 'vpiPProfissao', 'vpiPCidade'].forEach(function (id) {
      var el = document.getElementById(id); if (el) el.value = ''
    })
    var pref = document.getElementById('vpiPTelPref'); if (pref) pref.value = '+55'
    var est  = document.getElementById('vpiPEstado');  if (est)  est.value  = ''
    var tipo = document.getElementById('vpiPTipo');    if (tipo) tipo.value = 'paciente'
  }

  function _splitPhone(rawPhone) {
    // rawPhone pode vir como "+55 (11) 99..." ou "5511999..."
    var d = _onlyDigits(rawPhone)
    if (!d) return { pref: '+55', rest: '' }
    // BR (55)
    if (d.length === 13 && d.slice(0, 2) === '55') {
      return { pref: '+55', rest: d.slice(2) }
    }
    if (d.length === 12 && d.slice(0, 2) === '55') {
      return { pref: '+55', rest: d.slice(2) }
    }
    if (d.length <= 11) {
      // sem ddi, assume BR
      return { pref: '+55', rest: d }
    }
    // fallback: tenta assumir 55 se nao deu match
    return { pref: '+55', rest: d.replace(/^55/, '') }
  }

  function vpiPSetMode(mode) {
    _pState.mode = (mode === 'new') ? 'new' : 'search'
    _pState.editUnlocked = false
    var pSearch = document.getElementById('vpiPPanelSearch')
    var pNew    = document.getElementById('vpiPPanelNew')
    var tab1    = document.getElementById('vpiPModeTab1')
    var tab2    = document.getElementById('vpiPModeTab2')
    if (pSearch) pSearch.style.display = _pState.mode === 'search' ? '' : 'none'
    if (pNew)    pNew.style.display    = _pState.mode === 'new'    ? '' : 'none'
    if (tab1) {
      tab1.style.color              = _pState.mode === 'search' ? '#7C3AED' : '#9CA3AF'
      tab1.style.borderBottomColor  = _pState.mode === 'search' ? '#7C3AED' : 'transparent'
    }
    if (tab2) {
      tab2.style.color              = _pState.mode === 'new' ? '#7C3AED' : '#9CA3AF'
      tab2.style.borderBottomColor  = _pState.mode === 'new' ? '#7C3AED' : 'transparent'
    }

    if (_pState.mode === 'new') {
      _clearForm()
      _setAllFieldsReadonly(false)
      _pState.selected = null
      _updateSelectedPanel()
    } else {
      // search mode: inicializa busca vazia
      var inp = document.getElementById('vpiPSearchInput')
      if (inp) { inp.value = ''; inp.focus() }
      _renderSearchResults([], '')
      _pState.selected = null
      _updateSelectedPanel()
    }
  }

  function _updateSelectedPanel() {
    var panel = document.getElementById('vpiPSelected')
    var panelNew = document.getElementById('vpiPPanelNew')
    var saveBtn = document.getElementById('vpiPSaveBtn')
    if (_pState.mode === 'search') {
      if (_pState.selected) {
        if (panel) panel.style.display = ''
        // se editUnlocked mostra form abaixo
        if (panelNew) panelNew.style.display = _pState.editUnlocked ? '' : 'none'
        if (saveBtn) saveBtn.style.opacity = 1
      } else {
        if (panel) panel.style.display = 'none'
        if (panelNew) panelNew.style.display = 'none'
        if (saveBtn) saveBtn.style.opacity = 0.5
      }
    }
  }

  function vpiPToggleEdit() {
    _pState.editUnlocked = !_pState.editUnlocked
    var btn = document.getElementById('vpiPToggleEditBtn')
    if (btn) {
      btn.textContent = _pState.editUnlocked ? 'Bloquear edição' : 'Editar dados antes de cadastrar'
      // reaplica icone
      btn.innerHTML = _pState.editUnlocked
        ? '<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Bloquear edicao'
        : '<svg width="11" height="11" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/></svg> Editar dados antes de cadastrar'
    }
    _setAllFieldsReadonly(!_pState.editUnlocked)
    _updateSelectedPanel()
  }

  function vpiPClearSelected() {
    _pState.selected = null
    _pState.editUnlocked = false
    _clearForm()
    _updateSelectedPanel()
    var inp = document.getElementById('vpiPSearchInput')
    if (inp) inp.focus()
  }

  function vpiPPickCandidate(idx) {
    var c = _pLastResults[idx]
    if (!c) return
    if (c.is_already_partner) {
      _toast('Já é parceira', (c.nome || 'Esta pessoa') + ' já está no programa', 'warning')
      return
    }
    _pState.selected = c
    _pState.editUnlocked = false

    // Preenche form
    var sp = _splitPhone(c.phone || '')
    var set = function (id, v) { var el = document.getElementById(id); if (el) el.value = v == null ? '' : v }
    set('vpiPNome',     c.nome || '')
    set('vpiPTelPref',  sp.pref)
    set('vpiPTel',      sp.rest)
    set('vpiPProfissao', c.profissao || '')
    set('vpiPCidade',   c.cidade || '')
    set('vpiPEstado',   c.estado || '')
    set('vpiPTipo',     'paciente')

    _setAllFieldsReadonly(true)

    // atualiza panel de selecao
    var avEl = document.getElementById('vpiPSelAvatar')
    var nmEl = document.getElementById('vpiPSelName')
    var mtEl = document.getElementById('vpiPSelMeta')
    if (avEl) avEl.textContent = _initials(c.nome)
    if (nmEl) nmEl.textContent = c.nome || '—'
    if (mtEl) {
      var meta = []
      if (c.phone) meta.push(_maskPhone(c.phone))
      if (c.cidade) meta.push(c.cidade + (c.estado ? '/' + c.estado : ''))
      if (c.has_injetavel_12m) meta.push('Injetavel 12m')
      mtEl.textContent = meta.join(' · ') || (c.source === 'patient' ? 'Paciente' : 'Lead')
    }

    _updateSelectedPanel()
  }

  // ══════════════════════════════════════════════════
  //  Search (autocomplete)
  // ══════════════════════════════════════════════════
  var _pDebounce = null
  var _pLastResults = []
  var _pLastReqSeq = 0

  function _bindSearch() {
    var inp = document.getElementById('vpiPSearchInput')
    if (!inp || inp._vpiBound) return
    inp._vpiBound = true
    inp.addEventListener('input', function () {
      var q = (inp.value || '').trim()
      if (_pDebounce) clearTimeout(_pDebounce)
      if (q.length < 2) {
        _renderSearchResults([], q)
        return
      }
      _pDebounce = setTimeout(function () { _doSearch(q) }, 300)
    })
  }

  async function _doSearch(q) {
    var reqId = ++_pLastReqSeq
    var sb = window._sbShared
    if (!sb) { _renderSearchResults([], q, 'Supabase indisponível'); return }
    try {
      var res = await sb.rpc('vpi_search_candidates', { p_query: q, p_limit: 15 })
      if (res.error) throw new Error(res.error.message)
      // Evita race: so renderiza a ultima req
      if (reqId !== _pLastReqSeq) return
      var list = Array.isArray(res.data) ? res.data : []
      _pLastResults = list
      _renderSearchResults(list, q)
    } catch (e) {
      console.error('[VPI] vpi_search_candidates:', e)
      _renderSearchResults([], q, 'Erro na busca: ' + (e.message || ''))
    }
  }

  function _renderSearchResults(list, q, errMsg) {
    var box   = document.getElementById('vpiPSearchResults')
    var empty = document.getElementById('vpiPSearchEmpty')
    if (!box || !empty) return

    if (errMsg) {
      box.style.display = 'none'
      empty.style.display = ''
      empty.innerHTML = '<span style="color:#DC2626">' + _esc(errMsg) + '</span>'
      return
    }

    if (!q || q.length < 2) {
      box.style.display = 'none'
      empty.style.display = ''
      empty.textContent = 'Digite no mínimo 2 caracteres pra buscar'
      return
    }

    if (!list.length) {
      box.style.display = 'none'
      empty.style.display = ''
      empty.textContent = 'Nenhum candidato encontrado pra "' + q + '"'
      return
    }

    empty.style.display = 'none'
    box.style.display = ''
    box.innerHTML = list.map(function (c, idx) {
      var disabled = !!c.is_already_partner
      var bg       = disabled ? '#FEF2F2' : '#fff'
      var border   = disabled ? '#FECACA' : '#F3F4F6'
      var cursor   = disabled ? 'not-allowed' : 'pointer'
      var dim      = disabled ? '0.7' : '1'
      var badges = []
      if (c.is_already_partner) {
        badges.push('<span style="background:#FEE2E2;color:#991B1B;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700">Já está no programa</span>')
      }
      if (c.has_injetavel_12m && !c.is_already_partner) {
        badges.push('<span style="background:#D1FAE5;color:#065F46;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700">Fez injetável 12m</span>')
      }
      if (c.source === 'patient') {
        badges.push('<span style="background:#EFF6FF;color:#1D4ED8;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700">Paciente</span>')
      } else {
        badges.push('<span style="background:#F5F3FF;color:#6D28D9;padding:2px 7px;border-radius:12px;font-size:10px;font-weight:700">Lead</span>')
      }

      var onclick = disabled ? '' : 'onclick="vpiPPickCandidate(' + idx + ')"'

      return '<div ' + onclick +
        ' style="display:flex;align-items:center;gap:10px;padding:10px 12px;border-bottom:1px solid ' + border + ';background:' + bg + ';cursor:' + cursor + ';opacity:' + dim + '"' +
        (disabled ? '' : ' onmouseover="this.style.background=\'#F9FAFB\'" onmouseout="this.style.background=\'#fff\'"') +
        '>' +
          '<div style="width:32px;height:32px;border-radius:50%;background:#F5F3FF;color:#7C3AED;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0">' + _esc(_initials(c.nome)) + '</div>' +
          '<div style="flex:1;min-width:0">' +
            '<div style="font-size:13px;font-weight:700;color:#111;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _esc(c.nome || '—') + '</div>' +
            '<div style="font-size:11px;color:#6B7280">' + _esc(_maskPhone(c.phone) || '—') + (c.cidade ? ' · ' + _esc(c.cidade) + (c.estado ? '/' + _esc(c.estado) : '') : '') + '</div>' +
          '</div>' +
          '<div style="display:flex;flex-direction:column;gap:3px;align-items:flex-end">' + badges.join('') + '</div>' +
        '</div>'
    }).join('')
  }

  // ══════════════════════════════════════════════════
  //  Partner modal (manual create)
  // ══════════════════════════════════════════════════
  function vpiOpenAddPartner() {
    var m = document.getElementById('vpiAddPartnerModal')
    if (m) m.style.display = 'flex'
    _pState.selected = null
    _pState.editUnlocked = false
    _clearForm()
    _bindSearch()
    vpiPSetMode('search')
  }

  function vpiCloseAddPartner() {
    var m = document.getElementById('vpiAddPartnerModal')
    if (m) m.style.display = 'none'
    _clearForm()
    _pState.selected = null
    _pState.editUnlocked = false
    _setAllFieldsReadonly(false)
    var sr = document.getElementById('vpiPSearchInput')
    if (sr) sr.value = ''
    _renderSearchResults([], '')
  }

  async function vpiSavePartner() {
    var g = function (id) { var el = document.getElementById(id); return el ? (el.value || '').trim() : '' }

    // No modo 'search' sem selecao e sem desbloqueio manual, avisa
    if (_pState.mode === 'search' && !_pState.selected) {
      alert('Selecione um candidato ou mude pra "Cadastrar do zero".')
      return
    }

    var nome  = g('vpiPNome')
    var tel   = g('vpiPTelPref') + ' ' + g('vpiPTel')
    var telD  = g('vpiPTel')

    if (!nome || !telD) { alert('Nome e WhatsApp sao obrigatorios.'); return }

    var payload = {
      nome:      nome,
      phone:     tel,
      cidade:    g('vpiPCidade'),
      estado:    g('vpiPEstado'),
      profissao: g('vpiPProfissao'),
      tipo:      g('vpiPTipo') || 'paciente',
      origem:    _pState.mode === 'search' && _pState.selected ? 'manual_filtro' : 'manual',
      status:    'ativo',
    }

    // Se veio de busca, preserva lead_id pra evitar duplicacao cruzada
    if (_pState.selected) {
      if (_pState.selected.source === 'lead') {
        payload.lead_id = _pState.selected.id
      } else if (_pState.selected.source === 'patient') {
        // patients tem leadId separado — mas mantemos o id pra trackear
        payload.lead_id = _pState.selected.id
      }
    }

    try {
      await VPIService.upsertPartner(payload)
      vpiCloseAddPartner()
      await refreshAll()
      _toast('Parceiro cadastrado', nome + ' entrou no programa', 'success')
    } catch (e) {
      console.error('[VPI] savePartner:', e)
      alert('Erro ao cadastrar: ' + (e && e.message || 'tente novamente'))
    }
  }

  async function vpiDeletePartner(id) {
    if (!confirm('Remover este parceiro?')) return
    try {
      if (window._sbShared) {
        var res = await window._sbShared.from('vpi_partners').delete().eq('id', id)
        if (res.error) throw new Error(res.error.message)
      }
      VPIService.invalidatePartners()
      await refreshAll()
    } catch (e) {
      console.error('[VPI] deletePartner:', e)
      alert('Não foi possível remover: ' + (e.message || ''))
    }
  }

  function vpiViewPartner(id) {
    if (window.VPIPartnerModal && window.VPIPartnerModal.open) {
      window.VPIPartnerModal.open(id)
    }
  }

  // ══════════════════════════════════════════════════
  //  Alta Performance — trigger manual
  // ══════════════════════════════════════════════════
  async function vpiCheckHighPerfNow() {
    var sb = window._sbShared
    if (!sb) { _toast('Erro', 'Supabase indisponível', 'error'); return }
    if (!confirm('Verificar todas as parceiras agora?\n\nIsso checa Níveis 1/2/3 (50/100/150 indicações em 11 meses) e, se algum partner bater o critério, registra a recompensa e envia a msg WA.\n\npg_cron já roda isso automaticamente todo dia 1 às 11h BRT — use só pra teste ou emergência.')) return
    _toast('Alta Performance', 'Verificando...', 'info')
    try {
      var res = await sb.rpc('vpi_high_performance_check')
      if (res.error) throw new Error(res.error.message)
      var r = res.data || {}
      var hits = Array.isArray(r.hits) ? r.hits : []
      var msg = 'Check concluído: ' + hits.length + ' hit(s), ' +
        (r.emitted_count || 0) + ' recompensa(s) registrada(s), ' +
        (r.wa_count || 0) + ' WA enviada(s)' +
        ((r.wa_failed || 0) > 0 ? ' (' + r.wa_failed + ' falha WA)' : '')
      _toast('Alta Performance', msg, hits.length > 0 ? 'success' : 'info')
      if (hits.length > 0) {
        var detail = hits.map(function (h) { return '- ' + (h.partner_nome || h.partner_id) + ': ' + (h.recompensa || h.threshold) }).join('\n')
        alert('Hits encontrados:\n\n' + detail)
      }
    } catch (e) {
      console.error('[VPI] vpiCheckHighPerfNow:', e)
      _toast('Erro', e.message || 'Falha ao verificar', 'error')
    }
  }

  // ══════════════════════════════════════════════════
  //  Saudade (Fase 7 - Entrega 7)
  // ══════════════════════════════════════════════════
  async function vpiRunSaudadeNow() {
    var sb = window._sbShared
    if (!sb) { _toast('Erro', 'Supabase indisponível', 'error'); return }
    if (!confirm('Disparar varredura "sentindo sua falta" agora?\n\n' +
      'Vai procurar parceiras VPI ativas + consent LGPD sem procedimento há 5+ meses e enviar o WA.\n\n' +
      'pg_cron já roda isso dia 15 de cada mês às 14h BRT — use só pra teste ou urgência.')) return
    _toast('Saudade', 'Varredura iniciada...', 'info')
    try {
      var res = await sb.rpc('vpi_saudade_send_batch', { p_months: 5 })
      if (res.error) throw new Error(res.error.message)
      var r = res.data || {}
      var msg = 'Scan: ' + (r.total_scanned || 0) + ' | Enviado: ' + (r.sent_count || 0) +
                ' | Skip: ' + (r.skipped_count || 0) + ' | Falhou: ' + (r.failed_count || 0)
      _toast('Saudade', msg, (r.sent_count || 0) > 0 ? 'success' : 'info')
      if ((r.sent_count || 0) === 0 && (r.total_scanned || 0) === 0) {
        alert('Nenhuma parceira elegível encontrada.\n\n' +
              'Critérios: status=ativo, consent LGPD, sem procedimento há 5+ meses, sem saudade recente (60d).')
      }
    } catch (e) {
      console.error('[VPI] saudade batch:', e)
      _toast('Erro', e.message || 'falhou', 'error')
    }
  }

  // ══════════════════════════════════════════════════
  //  Staff Alert Config (Fase 7 - Entrega 3)
  // ══════════════════════════════════════════════════
  async function vpiLoadStaffAlertConfig() {
    var sb = window._sbShared
    var phoneEl   = document.getElementById('vpiStaffAlertPhone')
    var enEl      = document.getElementById('vpiStaffAlertEnabled')
    var hintEl    = document.getElementById('vpiStaffAlertHint')
    if (!sb || !phoneEl || !enEl) return
    try {
      var res = await sb.rpc('vpi_staff_alert_config')
      if (res.error) throw new Error(res.error.message)
      var cfg = res.data || {}
      phoneEl.value = cfg.phone || ''
      enEl.checked  = cfg.enabled !== false
      if (hintEl) hintEl.textContent = cfg.phone
        ? 'Staff alerts enviados pra ' + cfg.phone
        : 'Sem telefone configurado — alertas ficam bloqueados.'
    } catch (e) {
      if (hintEl) hintEl.textContent = 'Não carregou config: ' + (e.message || '')
    }
  }

  async function vpiSaveStaffAlertConfig() {
    var sb = window._sbShared
    var phoneEl = document.getElementById('vpiStaffAlertPhone')
    var enEl    = document.getElementById('vpiStaffAlertEnabled')
    if (!sb) { _toast('Erro', 'Supabase indisponível', 'error'); return }
    var phone = _onlyDigits((phoneEl && phoneEl.value) || '')
    var enabled = !!(enEl && enEl.checked)
    if (phone && phone.length < 8) {
      _toast('Telefone invalido', 'Digite o numero completo com DDI (ex 5544999999999)', 'warning')
      return
    }
    try {
      var res = await sb.rpc('vpi_staff_alert_config_update', { p_phone: phone, p_enabled: enabled })
      if (res.error) throw new Error(res.error.message)
      if (res.data && !res.data.ok) {
        _toast('Erro', res.data.reason || 'falhou', 'error')
        return
      }
      _toast('Salvo', 'Configuracao de alertas staff atualizada', 'success')
      vpiLoadStaffAlertConfig()
    } catch (e) {
      _toast('Erro', e.message || 'falhou', 'error')
    }
  }

  // ══════════════════════════════════════════════════
  //  Init
  // ══════════════════════════════════════════════════
  document.addEventListener('DOMContentLoaded', function () {
    // Primeiro render das paginas VPI
    setTimeout(refreshAll, 500)
  })

  // Expor API publica
  window.vpiSwitchTab      = vpiSwitchTab
  window.vpiToggle         = vpiToggle
  window.vpiSetSort        = vpiSetSort
  window.vpiRefreshKpis    = refreshKpis
  window.vpiRenderRanking  = vpiRenderRanking
  window.vpiOpenAddPartner = vpiOpenAddPartner
  window.vpiCloseAddPartner = vpiCloseAddPartner
  window.vpiSavePartner    = vpiSavePartner
  window.vpiDeletePartner  = vpiDeletePartner
  window.vpiViewPartner    = vpiViewPartner
  window.vpiCheckHighPerfNow = vpiCheckHighPerfNow
  window.vpiSaveStaffAlertConfig = vpiSaveStaffAlertConfig
  window.vpiLoadStaffAlertConfig = vpiLoadStaffAlertConfig
  window.vpiRunSaudadeNow        = vpiRunSaudadeNow
  window.vpiPSetMode       = vpiPSetMode
  window.vpiPPickCandidate = vpiPPickCandidate
  window.vpiPClearSelected = vpiPClearSelected
  window.vpiPToggleEdit    = vpiPToggleEdit
  // Legacy: vpiAutoEnroll/vpiScheduleWA ficam como shims para quem chama old code
  window.vpiAutoEnroll     = function (appt) { return window.VPIEngine && VPIEngine.autoEnroll(appt) }
  window.vpiScheduleWA     = function (p)    { return window.VPIEngine && VPIEngine.scheduleInviteWA(p) }
})()
