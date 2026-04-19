/**
 * LP Builder · AI Generator
 *
 * Modal "Gerar com IA" para um campo especifico.
 * Envia ao endpoint configurado em window.ClinicEnv.LP_AI_ENDPOINT
 * (ou fallback MAGAZINE_AI_ENDPOINT) o contexto:
 *   { mode: 'lp', block_type, field_key, field_meta, block_props, page_meta, instruction }
 * Recebe: { text } ou { items } e aplica no campo.
 *
 * window.LPBAIGenerator.openForField(blockIdx, fieldKey, opts?)
 */
;(function () {
  'use strict'
  if (window.LPBAIGenerator) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  function _getEndpoint() {
    var env = window.ClinicEnv || {}
    return env.LP_AI_ENDPOINT || env.MAGAZINE_AI_ENDPOINT || null
  }

  // ────────────────────────────────────────────────────────────
  // Open modal pra um field especifico
  // ────────────────────────────────────────────────────────────
  function openForField(blockIdx, fieldKey, opts) {
    opts = opts || {}
    var endpoint = _getEndpoint()
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    var schema = window.LPBSchema
    var block  = LPBuilder.getBlock(blockIdx)
    if (!block || !schema) return
    var meta = schema.getBlockMeta(block.type)
    var fmeta = schema.getFieldMeta(block.type, fieldKey)
    if (!fmeta) return

    // ── modal HTML ────────────────────────────────────────────
    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbAiBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:560px">' +
          '<div class="lpb-modal-h">' +
            '<h3>Gerar com IA</h3>' +
            '<button class="lpb-btn-icon" id="lpbAiClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div class="lpb-modal-body">' +
            '<div style="background:var(--lpb-bg);border:1px solid var(--lpb-border);padding:10px 12px;margin-bottom:14px;font-size:11px;color:var(--lpb-text-2)">' +
              '<strong style="color:var(--lpb-accent);text-transform:uppercase;letter-spacing:.1em;font-size:10px">' +
                'Campo:</strong> ' + _esc(fmeta.label) +
              ' · <span style="color:var(--lpb-text-3)">' + _esc(meta.name) + '</span>' +
              (fmeta.max ? '<br><small style="color:var(--lpb-text-3)">Limite: ' + fmeta.max + ' caracteres</small>' : '') +
            '</div>' +
            '<div class="lpb-field">' +
              '<div class="lpb-field-label"><span>Instrução (opcional)</span></div>' +
              '<textarea id="lpbAiInstruction" class="lpb-textarea" rows="3" ' +
                'placeholder="Ex: faça mais emocional e direto · foque em mulheres 45+ · mantenha o tom da clínica..."></textarea>' +
              '<div class="lpb-field-hint">Se vazio, usa o tom da marca + contexto dos blocos vizinhos.</div>' +
            '</div>' +
            '<div class="lpb-field">' +
              '<div class="lpb-field-label"><span>Variantes</span></div>' +
              '<div class="lpb-select-btns" id="lpbAiCount">' +
                '<button class="is-active" data-n="1">1</button>' +
                '<button data-n="3">3</button>' +
                '<button data-n="5">5</button>' +
              '</div>' +
              '<div class="lpb-field-hint">Mais variantes ajudam a escolher · custa mais tokens.</div>' +
            '</div>' +
            '<div id="lpbAiResults" style="margin-top:14px"></div>' +
            (!endpoint
              ? '<div style="background:rgba(248,113,113,0.1);border-left:2px solid var(--lpb-danger);padding:10px 12px;margin-top:12px;font-size:11px;color:var(--lpb-danger)">' +
                  'Endpoint de IA não configurado. Adicione <code>LP_AI_ENDPOINT</code> em <code>js/config/env.js</code>.' +
                '</div>'
              : '') +
          '</div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn ghost" id="lpbAiCancel">Fechar</button>' +
            '<button class="lpb-btn primary" id="lpbAiGenerate" ' + (endpoint ? '' : 'disabled') + '>' +
              _ico('zap', 14) + ' Gerar' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg     = document.getElementById('lpbAiBg')
    var close  = document.getElementById('lpbAiClose')
    var cancel = document.getElementById('lpbAiCancel')
    var btn    = document.getElementById('lpbAiGenerate')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
    cancel.onclick = dismiss

    var nVariants = 1
    document.querySelectorAll('#lpbAiCount button').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#lpbAiCount button').forEach(function (x) {
          x.classList.remove('is-active')
        })
        b.classList.add('is-active')
        nVariants = parseInt(b.dataset.n, 10) || 1
      }
    })

    btn.onclick = async function () {
      btn.disabled = true
      btn.innerHTML = _ico('loader', 14) + ' Gerando...'
      var instruction = (document.getElementById('lpbAiInstruction').value || '').trim()
      try {
        var page = LPBuilder.getCurrentPage()
        var blocksContext = (page.blocks || []).slice(
          Math.max(0, blockIdx - 1),
          Math.min(page.blocks.length, blockIdx + 2)
        ).map(function (b) {
          return { type: b.type, props: b.props }
        })
        var payload = {
          mode: 'lp',
          block_type: block.type,
          field_key: fieldKey,
          field_meta: fmeta,
          block_props: block.props,
          neighbor_blocks: blocksContext,
          page_meta: {
            slug: page.slug, title: page.title,
            meta_description: page.meta_description,
          },
          instruction: instruction,
          variants: nVariants,
        }
        var res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error('HTTP ' + res.status)
        var data = await res.json()
        var items = Array.isArray(data.items)
          ? data.items
          : (data.text ? [data.text] : [])
        if (!items.length) throw new Error('Sem texto na resposta')
        _renderResults(items, blockIdx, fieldKey)
      } catch (e) {
        LPBToast && LPBToast('Erro IA: ' + e.message, 'error')
      } finally {
        btn.disabled = false
        btn.innerHTML = _ico('zap', 14) + ' Gerar novamente'
      }
    }
  }

  function _renderResults(items, blockIdx, fieldKey) {
    var div = document.getElementById('lpbAiResults')
    if (!div) return
    div.innerHTML = '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3);margin-bottom:8px">Resultados — clique para usar</div>'
    items.forEach(function (txt) {
      var card = document.createElement('div')
      card.style.cssText = 'background:var(--lpb-bg);border:1px solid var(--lpb-border);padding:12px;margin-bottom:8px;cursor:pointer;font-size:13px;line-height:1.6;color:var(--lpb-text);transition:border-color .12s'
      card.textContent = txt
      card.onmouseenter = function () { card.style.borderColor = 'var(--lpb-accent)' }
      card.onmouseleave = function () { card.style.borderColor = 'var(--lpb-border)' }
      card.onclick = function () {
        document.getElementById('lpbModalRoot').innerHTML = ''
        try { document.activeElement && document.activeElement.blur && document.activeElement.blur() } catch (_) {}
        LPBuilder.setBlockProp(blockIdx, fieldKey, txt)
        if (window.LPBInspector && window.LPBInspector.render) window.LPBInspector.render()
        LPBToast && LPBToast('Texto aplicado', 'success')
      }
      div.appendChild(card)
    })
  }

  window.LPBAIGenerator = {
    openForField: openForField,
    isConfigured: function () { return !!_getEndpoint() },
  }
})()
