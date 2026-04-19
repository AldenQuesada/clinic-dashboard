/**
 * LP Builder · AI Polish
 *
 * Pega texto de um campo (ou de toda a pagina) e envia ao endpoint
 * de IA com instrucao FIXA: "polir clareza/ritmo/gramatica SEM
 * mudar significado nem inventar fatos".
 *
 * Modo single: campo unico, mostra antes/depois com aceitar/rejeitar.
 * Modo batch:  todos os campos textuais, lista com diff por campo.
 *
 * window.LPBAIPolish.openForField(blockIdx, fieldKey)
 * window.LPBAIPolish.openBatch()
 */
;(function () {
  'use strict'
  if (window.LPBAIPolish) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  var POLISH_INSTRUCTION = '' +
    'Polir este texto: melhorar clareza, ritmo, gramática e ortografia. ' +
    'NÃO mudar o significado. NÃO inventar nem adicionar fatos. ' +
    'Manter o tom da Clínica Mirian de Paula (sereno, técnico, premium, sem urgência). ' +
    'Retornar APENAS o texto polido, sem explicação.'

  function _getEndpoint() {
    var env = window.ClinicEnv || {}
    return env.LP_AI_ENDPOINT || env.MAGAZINE_AI_ENDPOINT || null
  }

  async function _callPolish(text, blockType, fieldKey) {
    var endpoint = _getEndpoint()
    if (!endpoint) throw new Error('Endpoint LP_AI_ENDPOINT não configurado')
    var res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'lp-polish',
        block_type: blockType,
        field_key: fieldKey,
        original: text,
        instruction: POLISH_INSTRUCTION,
        variants: 1,
      }),
    })
    if (!res.ok) throw new Error('HTTP ' + res.status)
    var data = await res.json()
    return (data && (data.text || (data.items && data.items[0]))) || ''
  }

  // ────────────────────────────────────────────────────────────
  // Single field
  // ────────────────────────────────────────────────────────────
  function openForField(blockIdx, fieldKey) {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    var b = LPBuilder.getBlock(blockIdx)
    if (!b) return
    var schema = window.LPBSchema
    var fmeta = schema && schema.getFieldMeta(b.type, fieldKey)
    if (!fmeta) return
    var original = (b.props && b.props[fieldKey]) || ''

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbPlBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:640px">' +
          '<div class="lpb-modal-h">' +
            '<h3>Polir Texto · ' + _esc(fmeta.label) + '</h3>' +
            '<button class="lpb-btn-icon" id="lpbPlClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div class="lpb-modal-body">' +
            '<div class="lpb-field">' +
              '<div class="lpb-field-label"><span>Original</span></div>' +
              '<textarea class="lpb-textarea" id="lpbPlOrig" rows="4" readonly>' + _esc(original) + '</textarea>' +
            '</div>' +
            '<div class="lpb-field">' +
              '<div class="lpb-field-label"><span>Polido (IA)</span></div>' +
              '<textarea class="lpb-textarea" id="lpbPlOut" rows="4" placeholder="Clique \'Polir\' para gerar..."></textarea>' +
            '</div>' +
          '</div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn ghost" id="lpbPlCancel">Cancelar</button>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn" id="lpbPlGen">' + _ico('feather', 12) + ' Polir</button>' +
            '<button class="lpb-btn primary" id="lpbPlApply" disabled>Aplicar</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg     = document.getElementById('lpbPlBg')
    var close  = document.getElementById('lpbPlClose')
    var cancel = document.getElementById('lpbPlCancel')
    var gen    = document.getElementById('lpbPlGen')
    var apply  = document.getElementById('lpbPlApply')
    var out    = document.getElementById('lpbPlOut')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
    cancel.onclick = dismiss

    gen.onclick = async function () {
      gen.disabled = true
      gen.innerHTML = _ico('loader', 12) + ' Polindo...'
      try {
        var polished = await _callPolish(original, b.type, fieldKey)
        out.value = polished
        apply.disabled = !polished
      } catch (e) {
        LPBToast && LPBToast(e.message, 'error')
      } finally {
        gen.disabled = false
        gen.innerHTML = _ico('feather', 12) + ' Polir novamente'
      }
    }
    apply.onclick = function () {
      LPBuilder.setBlockProp(blockIdx, fieldKey, out.value)
      LPBToast && LPBToast('Texto polido aplicado', 'success')
      dismiss()
    }
  }

  // ────────────────────────────────────────────────────────────
  // Batch — todos os fields texto
  // ────────────────────────────────────────────────────────────
  function openBatch() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    if (!_getEndpoint()) {
      LPBToast && LPBToast('Endpoint LP_AI_ENDPOINT não configurado', 'error')
      return
    }

    var page = LPBuilder.getCurrentPage()
    if (!page) return

    // coleta campos text/textarea/richtext de todos os blocos
    var schema = window.LPBSchema
    var items = []
    ;(page.blocks || []).forEach(function (b, i) {
      var meta = schema.getBlockMeta(b.type)
      if (!meta) return
      meta.fields.forEach(function (f) {
        if (f.type !== 'text' && f.type !== 'textarea' && f.type !== 'richtext') return
        var v = (b.props && b.props[f.k]) || ''
        if (v && v.length > 5) {
          items.push({
            blockIdx: i, blockType: b.type, blockName: meta.name,
            fieldKey: f.k, fieldLabel: f.label,
            original: v, polished: '', applied: false,
          })
        }
      })
    })

    if (!items.length) {
      LPBToast && LPBToast('Nenhum texto para polir', 'error')
      return
    }

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbPbBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:760px;max-height:90vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Polir Tudo (IA)</h3>' +
            '<button class="lpb-btn-icon" id="lpbPbClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div style="padding:12px 16px;background:var(--lpb-bg);border-bottom:1px solid var(--lpb-border);font-size:11px;color:var(--lpb-text-2)">' +
            '<strong style="color:var(--lpb-accent)">' + items.length + '</strong> campos detectados. ' +
            'Clique em "Polir todos" para gerar versões melhoradas. Você escolhe quais aceitar.' +
          '</div>' +
          '<div class="lpb-modal-body" id="lpbPbBody" style="flex:1;overflow:auto;padding:0"></div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn ghost" id="lpbPbCancel">Fechar</button>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn" id="lpbPbAll">' + _ico('feather', 12) + ' Polir todos</button>' +
            '<button class="lpb-btn primary" id="lpbPbApplyAll" disabled>Aplicar marcados</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg     = document.getElementById('lpbPbBg')
    var close  = document.getElementById('lpbPbClose')
    var cancel = document.getElementById('lpbPbCancel')
    var allBtn = document.getElementById('lpbPbAll')
    var apply  = document.getElementById('lpbPbApplyAll')
    var body   = document.getElementById('lpbPbBody')

    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
    cancel.onclick = dismiss

    function _renderRows() {
      body.innerHTML = items.map(function (it, i) {
        var hasPolish = !!it.polished
        var sameAsOrig = hasPolish && it.polished.trim() === it.original.trim()
        return '<div style="padding:14px 16px;border-bottom:1px solid var(--lpb-border)">' +
          '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
            '<div>' +
              '<small style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-accent)">' + _esc(it.fieldLabel) + '</small>' +
              ' <small style="color:var(--lpb-text-3);font-size:10px">' + _esc(it.blockName) + ' #' + it.blockIdx + '</small>' +
            '</div>' +
            (hasPolish && !sameAsOrig
              ? '<label class="lpb-bool"><input type="checkbox" data-accept="' + i + '" ' + (it.applied ? 'checked' : '') + '><span class="track"></span><span class="lpb-bool-label">Aceitar</span></label>'
              : (sameAsOrig ? '<small style="color:var(--lpb-text-3);font-size:10px">Sem mudanças</small>' : '<small style="color:var(--lpb-text-3);font-size:10px">Aguardando</small>')) +
          '</div>' +
          '<div style="font-size:11px;color:var(--lpb-text-3);margin-bottom:4px;text-decoration:line-through">' + _esc(it.original) + '</div>' +
          (hasPolish ? '<div style="font-size:12px;color:var(--lpb-success)">' + _esc(it.polished) + '</div>' : '') +
          '</div>'
      }).join('')

      body.querySelectorAll('[data-accept]').forEach(function (el) {
        el.onchange = function () {
          var i = parseInt(el.dataset.accept, 10)
          items[i].applied = el.checked
          _updateApplyBtn()
        }
      })
    }

    function _updateApplyBtn() {
      var n = items.filter(function (it) { return it.applied }).length
      apply.disabled = n === 0
      apply.innerHTML = n > 0 ? 'Aplicar ' + n + ' campo(s)' : 'Aplicar marcados'
    }

    allBtn.onclick = async function () {
      allBtn.disabled = true
      allBtn.innerHTML = _ico('loader', 12) + ' Polindo... 0/' + items.length
      var done = 0
      for (var i = 0; i < items.length; i++) {
        var it = items[i]
        try {
          it.polished = await _callPolish(it.original, it.blockType, it.fieldKey)
          // marca pre-aceito se mudou e nao for so whitespace
          if (it.polished && it.polished.trim() !== it.original.trim()) it.applied = true
        } catch (e) {
          it.polished = ''
        }
        done++
        allBtn.innerHTML = _ico('loader', 12) + ' Polindo... ' + done + '/' + items.length
        _renderRows()
        _updateApplyBtn()
      }
      allBtn.disabled = false
      allBtn.innerHTML = _ico('feather', 12) + ' Polir novamente'
    }

    apply.onclick = async function () {
      var page = LPBuilder.getCurrentPage()
      if (!page) return
      try { await LPBuilder.rpc('lp_revision_create', { p_page_id: page.id, p_label: 'ai-polish-batch', p_by: 'ai-polish' }) } catch (_) {}
      var n = 0
      items.forEach(function (it) {
        if (!it.applied || !it.polished) return
        var b = LPBuilder.getBlock(it.blockIdx)
        if (b && b.props) {
          b.props[it.fieldKey] = it.polished
          n++
        }
      })
      LPBuilder.setPageMeta('updated_at', page.updated_at)
      LPBToast && LPBToast(n + ' campo(s) atualizado(s)', 'success')
      dismiss()
    }

    _renderRows()
  }

  window.LPBAIPolish = {
    openForField: openForField,
    openBatch: openBatch,
  }
})()
