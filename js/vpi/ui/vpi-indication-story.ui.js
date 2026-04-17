/**
 * ClinicAI - VPI Indication Story UI (Fase 9 - Entrega 5)
 *
 * Drawer pra editar o story de uma indication fechada: depoimento,
 * foto antes/depois (URL), primeiro nome da indicada, consent.
 *
 * Usado a partir do partner modal ou ranking row. Abre por:
 *   window.vpiOpenIndicationStory(indicationId, partnerName)
 *
 * Expoe:
 *   window.vpiOpenIndicationStory
 *   window.vpiCloseIndicationStory
 *   window.vpiSaveIndicationStory
 */
;(function () {
  'use strict'
  if (window._vpiIndStoryUILoaded) return
  window._vpiIndStoryUILoaded = true

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

  var _indicationId = null

  async function vpiOpenIndicationStory(indicationId, partnerName) {
    _indicationId = indicationId
    var story = { depoimento: '', foto_antes_url: '', foto_depois_url: '',
                  indicada_nome: '', consent_mostrar_na_historia: false,
                  procedimento: '' }
    try {
      var list = await _rpc('vpi_indication_stories_list', { p_partner_id: null, p_limit: 500 })
      var rows = (list && list.rows) || []
      var found = rows.find(function (x) { return x.id === indicationId })
      if (found) story = Object.assign(story, found)
    } catch (e) {
      _toast('Erro', 'Nao carregou: ' + (e.message || ''), 'error')
      return
    }

    var old = document.getElementById('vpiIndStoryDrawer')
    if (old) old.remove()

    var drawer = document.createElement('div')
    drawer.id = 'vpiIndStoryDrawer'
    drawer.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:10003;display:flex;align-items:center;justify-content:flex-end'
    drawer.innerHTML =
      '<div style="background:#fff;width:100%;max-width:520px;height:100%;overflow-y:auto;box-shadow:-12px 0 40px rgba(0,0,0,.2);padding:26px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:18px">' +
          '<div>' +
            '<div style="font-size:16px;font-weight:700;color:#111">Historia desta indicacao</div>' +
            '<div style="font-size:12px;color:#9CA3AF;margin-top:2px">' + _esc(partnerName || '') + (story.procedimento ? ' · ' + _esc(story.procedimento) : '') + '</div>' +
          '</div>' +
          '<button onclick="vpiCloseIndicationStory()" style="background:none;border:none;font-size:24px;color:#9CA3AF;cursor:pointer;line-height:1">×</button>' +
        '</div>' +

        '<div style="margin-bottom:14px">' +
          '<label style="font-size:11px;font-weight:700;color:#374151">Primeiro nome da indicada (anonimizado)</label>' +
          '<input id="vpiStoNome" type="text" value="' + _esc(story.indicada_nome || '') + '" placeholder="Ex: Carla" style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;margin-top:4px"/>' +
          '<div style="font-size:10px;color:#9CA3AF;margin-top:3px">Se vazio, sistema pega automaticamente do cadastro do lead.</div>' +
        '</div>' +

        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">' +
          '<div>' +
            '<label style="font-size:11px;font-weight:700;color:#374151">Foto antes (URL)</label>' +
            '<input id="vpiStoAntes" type="text" value="' + _esc(story.foto_antes_url || '') + '" placeholder="https://..." style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;margin-top:4px"/>' +
          '</div>' +
          '<div>' +
            '<label style="font-size:11px;font-weight:700;color:#374151">Foto depois (URL)</label>' +
            '<input id="vpiStoDepois" type="text" value="' + _esc(story.foto_depois_url || '') + '" placeholder="https://..." style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;margin-top:4px"/>' +
          '</div>' +
        '</div>' +

        '<div style="margin-bottom:14px">' +
          '<label style="font-size:11px;font-weight:700;color:#374151">Depoimento da indicada</label>' +
          '<textarea id="vpiStoDepo" rows="4" placeholder="Texto em primeira pessoa..." style="width:100%;padding:9px 11px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:12px;margin-top:4px;font-family:inherit">' + _esc(story.depoimento || '') + '</textarea>' +
        '</div>' +

        '<div style="margin-bottom:16px;display:flex;align-items:center;gap:10px;padding:12px;background:#FEF3C7;border-radius:8px;border:1px solid #FCD34D">' +
          '<input id="vpiStoConsent" type="checkbox" ' + (story.consent_mostrar_na_historia ? 'checked' : '') + ' style="width:16px;height:16px;cursor:pointer;margin-top:2px"/>' +
          '<label for="vpiStoConsent" style="font-size:12px;color:#78350F;line-height:1.45;cursor:pointer">' +
            '<strong>Consent da indicada pra aparecer no cartao da parceira.</strong><br/>' +
            'So marque se voce tem autorizacao explicita dela (formulario, print de msg, TCLE assinado).' +
          '</label>' +
        '</div>' +

        '<div style="display:flex;gap:8px;justify-content:flex-end">' +
          '<button onclick="vpiCloseIndicationStory()" style="padding:10px 18px;border:1.5px solid #E5E7EB;border-radius:8px;background:#fff;color:#374151;font-size:13px;font-weight:700;cursor:pointer">Cancelar</button>' +
          '<button onclick="vpiSaveIndicationStory()" style="padding:10px 18px;border:none;border-radius:8px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;font-size:13px;font-weight:700;cursor:pointer">Salvar</button>' +
        '</div>' +
      '</div>'
    document.body.appendChild(drawer)
  }

  function vpiCloseIndicationStory() {
    var d = document.getElementById('vpiIndStoryDrawer')
    if (d) d.remove()
    _indicationId = null
  }

  async function vpiSaveIndicationStory() {
    if (!_indicationId) return
    var g = function (id) { var el = document.getElementById(id); return el ? el.value : '' }
    var gc = function (id) { var el = document.getElementById(id); return el ? el.checked : false }

    var payload = {
      indicada_nome:               (g('vpiStoNome') || '').trim(),
      foto_antes_url:              (g('vpiStoAntes') || '').trim(),
      foto_depois_url:             (g('vpiStoDepois') || '').trim(),
      depoimento:                  g('vpiStoDepo'),
      consent_mostrar_na_historia: gc('vpiStoConsent'),
    }

    try {
      var r = await _rpc('vpi_indication_story_update', {
        p_indication_id: _indicationId, p_data: payload,
      })
      if (!r || !r.ok) throw new Error((r && r.reason) || 'falhou')
      _toast('Salvo', 'Historia atualizada', 'success')
      vpiCloseIndicationStory()
    } catch (e) {
      _toast('Erro', e.message || 'falha', 'error')
    }
  }

  window.vpiOpenIndicationStory  = vpiOpenIndicationStory
  window.vpiCloseIndicationStory = vpiCloseIndicationStory
  window.vpiSaveIndicationStory  = vpiSaveIndicationStory
})()
