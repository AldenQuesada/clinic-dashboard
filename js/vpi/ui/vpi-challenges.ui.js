/**
 * ClinicAI - VPI Challenges UI (Fase 9 - Entrega 2)
 *
 * CRUD admin de vpi_challenges. Renderiza dentro de
 * #vpiChallengesContainer no panel 6 da pagina growth-referral.
 *
 * Lista challenges agrupados por status: Ativo agora | Futuro |
 * Encerrado. Modal editor full (titulo, descricao, datas, multiplier,
 * bonus, templates inicio/fim).
 *
 * Expoe:
 *   window.vpiRenderChallenges
 *   window.vpiOpenChallengeModal / vpiCloseChallengeModal
 *   window.vpiSaveChallenge / vpiDeleteChallenge / vpiToggleChallenge
 */
;(function () {
  'use strict'
  if (window._vpiChallengesUILoaded) return
  window._vpiChallengesUILoaded = true

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
    if (!sb) throw new Error('Supabase indisponivel')
    var res = await sb.rpc(name, args || {})
    if (res.error) throw new Error(res.error.message)
    return res.data
  }

  function _fmtDate(iso) {
    if (!iso) return '—'
    try {
      var d = new Date(iso)
      return String(d.getDate()).padStart(2,'0') + '/' +
             String(d.getMonth()+1).padStart(2,'0') + '/' +
             d.getFullYear()
    } catch (_) { return '—' }
  }

  function _isoToInputLocal(iso) {
    if (!iso) return ''
    try {
      var d = new Date(iso)
      var pad = function (n) { return String(n).padStart(2, '0') }
      return d.getFullYear() + '-' + pad(d.getMonth()+1) + '-' + pad(d.getDate()) +
             'T' + pad(d.getHours()) + ':' + pad(d.getMinutes())
    } catch (_) { return '' }
  }

  function _statusOf(ch) {
    var now = Date.now()
    var ini = new Date(ch.periodo_inicio).getTime()
    var fim = new Date(ch.periodo_fim).getTime()
    if (!ch.is_active) return 'inativo'
    if (now < ini) return 'futuro'
    if (now > fim) return 'encerrado'
    return 'ativo'
  }

  function _statusChip(s) {
    var m = {
      ativo:     { bg: '#D1FAE5', fg: '#065F46', txt: 'ATIVO AGORA' },
      futuro:    { bg: '#DBEAFE', fg: '#1E40AF', txt: 'FUTURO' },
      encerrado: { bg: '#F3F4F6', fg: '#6B7280', txt: 'ENCERRADO' },
      inativo:   { bg: '#FEE2E2', fg: '#991B1B', txt: 'DESATIVADO' },
    }
    var x = m[s] || m.inativo
    return '<span style="display:inline-block;padding:3px 8px;border-radius:10px;background:' + x.bg + ';color:' + x.fg + ';font-size:10px;font-weight:800;letter-spacing:.04em">' + x.txt + '</span>'
  }

  function _ensureContainer() {
    var panel = document.getElementById('vpiPanel6')
    if (!panel) return null
    var container = document.getElementById('vpiChallengesContainer')
    if (container) return container

    var block = document.createElement('div')
    block.id = 'vpiChallengesContainer'
    block.style.cssText = 'background:#fff;border-radius:12px;border:1px solid #F3F4F6;padding:22px'
    block.innerHTML =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:10px">' +
        '<div>' +
          '<div style="font-size:15px;font-weight:700;color:#111;margin-bottom:2px">Desafios sazonais</div>' +
          '<div style="font-size:12px;color:#9CA3AF">Carnaval, Dia das Maes, Black November... multiplicador temporario nos creditos por periodo limitado.</div>' +
        '</div>' +
        '<button onclick="vpiOpenChallengeModal()" style="display:inline-flex;align-items:center;gap:6px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;padding:9px 16px;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer">' +
          '<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>' +
          'Novo desafio' +
        '</button>' +
      '</div>' +
      '<div id="vpiChallengesBody"><div style="text-align:center;color:#9CA3AF;font-size:13px;padding:20px">Carregando...</div></div>'
    panel.appendChild(block)
    return block
  }

  async function vpiRenderChallenges() {
    var c = _ensureContainer()
    if (!c) return
    var body = document.getElementById('vpiChallengesBody')
    if (!body) return

    try {
      var list = await _rpc('vpi_challenge_list')
      if (!Array.isArray(list) || list.length === 0) {
        body.innerHTML =
          '<div style="padding:30px;text-align:center;color:#9CA3AF;font-size:13px">' +
            'Nenhum desafio cadastrado. Clique em "Novo desafio" para comecar.' +
          '</div>'
        return
      }

      // Group por status
      var groups = { ativo: [], futuro: [], encerrado: [], inativo: [] }
      list.forEach(function (ch) {
        groups[_statusOf(ch)].push(ch)
      })

      var html = ''
      var order = ['ativo', 'futuro', 'encerrado', 'inativo']
      order.forEach(function (st) {
        var arr = groups[st]
        if (!arr.length) return
        html += '<div style="margin-bottom:18px">'
        html += '<div style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px">' + _statusChip(st) + '</div>'
        arr.forEach(function (ch) { html += _cardRow(ch) })
        html += '</div>'
      })

      body.innerHTML = html
    } catch (e) {
      body.innerHTML = '<div style="padding:20px;color:#DC2626;font-size:12px">Erro ao carregar: ' + _esc(e.message || e) + '</div>'
    }
  }

  function _cardRow(ch) {
    var cor = ch.cor || '#7C3AED'
    var emoji = ch.emoji || ''
    var multi = Number(ch.multiplier || 1).toFixed(1)
    var bonus = Number(ch.bonus_fixo || 0)
    return '<div style="display:flex;align-items:center;gap:14px;padding:12px 14px;border:1px solid #E5E7EB;border-radius:10px;margin-bottom:8px;background:#fff">' +
      '<div style="width:40px;height:40px;border-radius:10px;background:' + _esc(cor) + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0">' + _esc(emoji) + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-size:13px;font-weight:700;color:#111">' + _esc(ch.titulo) + ' <span style="font-size:11px;color:#7C3AED;margin-left:4px">x' + multi + (bonus > 0 ? ' +' + bonus : '') + '</span></div>' +
        '<div style="font-size:11px;color:#6B7280;margin-top:2px">' + _fmtDate(ch.periodo_inicio) + ' — ' + _fmtDate(ch.periodo_fim) + ' · slug: <code>' + _esc(ch.slug) + '</code></div>' +
      '</div>' +
      '<div style="display:flex;gap:6px;flex-shrink:0">' +
        '<button onclick="vpiToggleChallenge(\'' + _esc(ch.id) + '\', ' + (!ch.is_active) + ')" style="padding:6px 10px;border:1px solid #E5E7EB;border-radius:7px;background:' + (ch.is_active ? '#FEF2F2' : '#F0FDF4') + ';color:' + (ch.is_active ? '#991B1B' : '#065F46') + ';font-size:11px;font-weight:700;cursor:pointer">' +
          (ch.is_active ? 'Desativar' : 'Ativar') +
        '</button>' +
        '<button onclick="vpiOpenChallengeModal(\'' + _esc(ch.id) + '\')" style="padding:6px 10px;border:1px solid #E5E7EB;border-radius:7px;background:#fff;color:#374151;font-size:11px;font-weight:600;cursor:pointer">Editar</button>' +
        '<button onclick="vpiDeleteChallenge(\'' + _esc(ch.id) + '\', \'' + _esc(ch.titulo) + '\')" style="padding:6px 8px;border:1px solid #FECACA;border-radius:7px;background:#fff;color:#DC2626;font-size:11px;cursor:pointer" title="Remover">' +
          '<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/></svg>' +
        '</button>' +
      '</div>' +
    '</div>'
  }

  // ══ Modal ══════════════════════════════════════════
  var _currentId = null

  async function vpiOpenChallengeModal(id) {
    _currentId = id || null
    var ch = null
    if (id) {
      try {
        var list = await _rpc('vpi_challenge_list')
        ch = (list || []).find(function (x) { return x.id === id }) || null
      } catch (e) {
        _toast('Erro', 'Falha ao carregar challenge: ' + (e.message || ''), 'error')
        return
      }
    }

    var old = document.getElementById('vpiChallengeModal')
    if (old) old.remove()

    var modal = document.createElement('div')
    modal.id = 'vpiChallengeModal'
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10001;display:flex;align-items:center;justify-content:center;padding:20px'

    var d = ch || {}
    modal.innerHTML =
      '<div style="background:#fff;border-radius:14px;padding:24px;max-width:640px;width:100%;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.3)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">' +
          '<div style="font-size:17px;font-weight:700;color:#111">' + (id ? 'Editar desafio' : 'Novo desafio') + '</div>' +
          '<button onclick="vpiCloseChallengeModal()" style="background:none;border:none;font-size:24px;color:#9CA3AF;cursor:pointer;line-height:1">×</button>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px">' +
          '<div><label style="font-size:11px;font-weight:700;color:#374151">Titulo</label>' +
            '<input id="vpiChTitulo" type="text" value="' + _esc(d.titulo || '') + '" style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;margin-top:4px"/></div>' +
          '<div><label style="font-size:11px;font-weight:700;color:#374151">Slug (unique)</label>' +
            '<input id="vpiChSlug" type="text" value="' + _esc(d.slug || '') + '" placeholder="ex: carnaval_2026" style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;margin-top:4px"/></div>' +
        '</div>' +
        '<div style="margin-bottom:12px">' +
          '<label style="font-size:11px;font-weight:700;color:#374151">Descricao</label>' +
          '<textarea id="vpiChDesc" rows="2" style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;margin-top:4px">' + _esc(d.descricao || '') + '</textarea>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:80px 1fr;gap:14px;margin-bottom:12px">' +
          '<div><label style="font-size:11px;font-weight:700;color:#374151">Emoji</label>' +
            '<input id="vpiChEmoji" type="text" maxlength="4" value="' + _esc(d.emoji || '') + '" style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:18px;text-align:center;margin-top:4px"/></div>' +
          '<div><label style="font-size:11px;font-weight:700;color:#374151">Cor</label>' +
            '<input id="vpiChCor" type="color" value="' + _esc(d.cor || '#7C3AED') + '" style="width:100%;padding:5px;border:1.5px solid #E5E7EB;border-radius:8px;height:38px;margin-top:4px"/></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:12px">' +
          '<div><label style="font-size:11px;font-weight:700;color:#374151">Inicio</label>' +
            '<input id="vpiChIni" type="datetime-local" value="' + _esc(_isoToInputLocal(d.periodo_inicio)) + '" style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;margin-top:4px"/></div>' +
          '<div><label style="font-size:11px;font-weight:700;color:#374151">Fim</label>' +
            '<input id="vpiChFim" type="datetime-local" value="' + _esc(_isoToInputLocal(d.periodo_fim)) + '" style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;margin-top:4px"/></div>' +
        '</div>' +
        '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:12px">' +
          '<div><label style="font-size:11px;font-weight:700;color:#374151">Multiplier</label>' +
            '<input id="vpiChMult" type="number" step="0.1" min="1" max="5" value="' + _esc(String(d.multiplier == null ? 1.5 : d.multiplier)) + '" style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;margin-top:4px"/></div>' +
          '<div><label style="font-size:11px;font-weight:700;color:#374151">Bonus fixo</label>' +
            '<input id="vpiChBonus" type="number" min="0" step="1" value="' + _esc(String(d.bonus_fixo || 0)) + '" style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;margin-top:4px"/></div>' +
          '<div><label style="font-size:11px;font-weight:700;color:#374151">Sort order</label>' +
            '<input id="vpiChSort" type="number" step="1" value="' + _esc(String(d.sort_order || 0)) + '" style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;margin-top:4px"/></div>' +
        '</div>' +
        '<div style="margin-bottom:12px">' +
          '<label style="font-size:11px;font-weight:700;color:#374151">Template WA inicio (opcional, {{nome}})</label>' +
          '<textarea id="vpiChTplIni" rows="3" placeholder="Anunciar inicio do desafio" style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;margin-top:4px;font-family:ui-monospace,Consolas,monospace">' + _esc(d.msg_template_inicio || '') + '</textarea>' +
        '</div>' +
        '<div style="margin-bottom:16px">' +
          '<label style="font-size:11px;font-weight:700;color:#374151">Template WA fim (opcional)</label>' +
          '<textarea id="vpiChTplFim" rows="2" placeholder="Anunciar encerramento" style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;margin-top:4px;font-family:ui-monospace,Consolas,monospace">' + _esc(d.msg_template_fim || '') + '</textarea>' +
        '</div>' +
        '<div style="margin-bottom:16px;display:flex;align-items:center;gap:8px;padding:10px;background:#F9FAFB;border-radius:8px">' +
          '<input id="vpiChActive" type="checkbox" ' + (d.is_active ? 'checked' : '') + ' style="width:16px;height:16px;cursor:pointer"/>' +
          '<label for="vpiChActive" style="font-size:12px;color:#374151;cursor:pointer">Ativo (aparece no cartao + aplica multiplier)</label>' +
        '</div>' +
        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button onclick="vpiCloseChallengeModal()" style="padding:10px 18px;border:1.5px solid #E5E7EB;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:700;cursor:pointer">Cancelar</button>' +
          '<button onclick="vpiSaveChallenge()" style="padding:10px 18px;border:none;border-radius:8px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;font-size:13px;font-weight:700;cursor:pointer">' +
            (id ? 'Salvar' : 'Criar desafio') +
          '</button>' +
        '</div>' +
      '</div>'
    document.body.appendChild(modal)
  }

  function vpiCloseChallengeModal() {
    var m = document.getElementById('vpiChallengeModal')
    if (m) m.remove()
    _currentId = null
  }

  async function vpiSaveChallenge() {
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : '' }
    var gc = function (id) { var el = document.getElementById(id); return el ? el.checked : false }

    var titulo = (g('vpiChTitulo') || '').trim()
    var slug   = (g('vpiChSlug') || '').trim()
    if (!titulo || !slug) {
      _toast('Atencao', 'Titulo e slug obrigatorios', 'warning'); return
    }
    var ini = g('vpiChIni'), fim = g('vpiChFim')
    if (!ini || !fim) {
      _toast('Atencao', 'Datas de inicio e fim obrigatorias', 'warning'); return
    }
    if (new Date(fim).getTime() <= new Date(ini).getTime()) {
      _toast('Atencao', 'Fim precisa ser depois do inicio', 'warning'); return
    }

    var payload = {
      titulo: titulo, slug: slug,
      descricao: g('vpiChDesc'),
      emoji:    g('vpiChEmoji'),
      cor:      g('vpiChCor') || '#7C3AED',
      periodo_inicio: new Date(ini).toISOString(),
      periodo_fim:    new Date(fim).toISOString(),
      multiplier: Number(g('vpiChMult') || 1.5),
      bonus_fixo: parseInt(g('vpiChBonus') || '0', 10),
      is_active:  gc('vpiChActive'),
      msg_template_inicio: g('vpiChTplIni') || null,
      msg_template_fim:    g('vpiChTplFim') || null,
      sort_order: parseInt(g('vpiChSort') || '0', 10),
    }
    if (_currentId) payload.id = _currentId

    try {
      var r = await _rpc('vpi_challenge_upsert', { p_data: payload })
      if (!r || !r.ok) throw new Error(r && r.reason || 'Falha')
      _toast('Salvo', _currentId ? 'Desafio atualizado' : 'Desafio criado', 'success')
      vpiCloseChallengeModal()
      vpiRenderChallenges()
    } catch (e) {
      _toast('Erro', e.message || 'falha', 'error')
    }
  }

  async function vpiToggleChallenge(id, turnOn) {
    try {
      var list = await _rpc('vpi_challenge_list')
      var ch = (list || []).find(function (x) { return x.id === id })
      if (!ch) { _toast('Erro', 'Nao encontrado', 'error'); return }
      ch.id = id
      ch.is_active = !!turnOn
      await _rpc('vpi_challenge_upsert', { p_data: ch })
      _toast('OK', turnOn ? 'Desafio ativado' : 'Desafio desativado', 'success')
      vpiRenderChallenges()
    } catch (e) {
      _toast('Erro', e.message || 'falha', 'error')
    }
  }

  async function vpiDeleteChallenge(id, titulo) {
    if (!confirm('Remover o desafio "' + titulo + '"? Isso nao remove auditoria, so o registro.')) return
    try {
      await _rpc('vpi_challenge_delete', { p_id: id })
      _toast('Removido', titulo, 'success')
      vpiRenderChallenges()
    } catch (e) {
      _toast('Erro', e.message || 'falha', 'error')
    }
  }

  window.vpiRenderChallenges    = vpiRenderChallenges
  window.vpiOpenChallengeModal  = vpiOpenChallengeModal
  window.vpiCloseChallengeModal = vpiCloseChallengeModal
  window.vpiSaveChallenge       = vpiSaveChallenge
  window.vpiToggleChallenge     = vpiToggleChallenge
  window.vpiDeleteChallenge     = vpiDeleteChallenge
})()
