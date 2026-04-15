/* ============================================================================
 * Beauty & Health Magazine — Slot Renderer (orchestrator)
 *
 * Consome Schema + Widgets + Validator para montar o form de edição de uma
 * página. Expõe API de leitura/escrita dos slots + ciclo de validação.
 *
 * Expõe: window.MagazineAdmin.SlotRenderer
 *   - render(mountEl, page, handlers) → controller
 *
 * handlers:
 *   - onChange(slots)       — chamado a cada edição (debounced pelo caller)
 *   - onUpload({key, button, onUploaded}) — invoca upload Storage
 *   - onValidate(status)    — status atualizado após cada mudança
 * ============================================================================ */
;(function () {
  'use strict'

  const NS = () => window.MagazineAdmin
  const $Schema    = () => NS().Schema
  const $Widgets   = () => NS().Widgets
  const $Validator = () => NS().Validator

  function render(mountEl, page, handlers) {
    handlers = handlers || {}
    const slug = page && page.template_slug
    const section = slug ? $Schema().getSectionMeta(slug) : null

    mountEl.innerHTML = ''

    if (!page) {
      mountEl.innerHTML = '<div class="empty-state">Selecione uma página para editar.</div>'
      return createStub()
    }
    if (!section) {
      mountEl.innerHTML = `<div class="empty-state">Template sem meta: <code>${slug}</code>.</div>`
      return createStub()
    }

    const slots = Object.assign({}, page.slots || {})
    const issuePanel = document.createElement('div')
    issuePanel.className = 'slot-issues'

    const fieldsWrap = document.createElement('div')
    fieldsWrap.className = 'slot-fields'

    // Header com nome + slug do template
    const hd = document.createElement('div')
    hd.className = 'slot-head'
    hd.innerHTML = `
      <div class="slot-head-name">${$Widgets().escapeHtml(section.name)}</div>
      <code class="slot-head-slug">${$Widgets().escapeHtml(slug)}</code>
    `
    mountEl.appendChild(hd)

    section.fields.forEach(fm => {
      const value = slots[fm.k]
      const parts = $Widgets().createFieldWrapper(fm)
      fieldsWrap.appendChild(parts.wrap)

      const onFieldChange = (newVal) => {
        if (newVal === '' || newVal == null || (Array.isArray(newVal) && newVal.length === 0)) {
          delete slots[fm.k]
        } else {
          slots[fm.k] = newVal
        }
        notifyChange()
      }

      let inputEl = null
      switch (fm.type) {
        case 'textarea':
          inputEl = $Widgets().mountTextarea(parts, fm, value, onFieldChange)
          break
        case 'image':
          $Widgets().mountImageInput(parts, fm, value, onFieldChange, handlers.onUpload)
          break
        case 'list':
          $Widgets().mountListEditor(parts, fm, value, onFieldChange, { onUpload: handlers.onUpload })
          break
        case 'text':
        default:
          inputEl = $Widgets().mountTextInput(parts, fm, value, onFieldChange)
          break
      }

      // Botão ✨ IA para campos de texto (curto ou longo)
      if (inputEl && typeof handlers.onAIField === 'function') {
        const ai = NS().AIGenerator
        if (ai) {
          ai.attachButton(parts.labelRow, {
            fieldMeta: fm,
            onClick: () => handlers.onAIField({
              fieldMeta: fm,
              inputEl,
              applyValue: (newVal) => {
                inputEl.value = newVal
                onFieldChange(newVal)
                inputEl.dispatchEvent(new Event('input', { bubbles: true }))
              },
            }),
          })
        }
      }
    })

    mountEl.appendChild(fieldsWrap)
    mountEl.appendChild(issuePanel)

    function notifyChange() {
      if (typeof handlers.onChange === 'function') handlers.onChange(Object.assign({}, slots))
      const status = $Validator().computePageStatus({ template_slug: slug, slots })
      $Validator().renderIssueList(issuePanel, status)
      if (typeof handlers.onValidate === 'function') handlers.onValidate(status)
    }
    // Status inicial
    notifyChange()

    return {
      readSlots: () => Object.assign({}, slots),
      getStatus: () => $Validator().computePageStatus({ template_slug: slug, slots }),
      destroy: () => { mountEl.innerHTML = '' },
    }
  }

  function createStub() {
    return { readSlots: () => ({}), getStatus: () => ({ state: 'empty', errors: [], warnings: [] }), destroy: () => {} }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.SlotRenderer = { render }
})()
