/* ============================================================================
 * Beauty & Health Magazine — Validator
 *
 * Validação client-side de slots contra o schema + cálculo de status da página
 * para badges. Opcionalmente chama RPC magazine_validate_section para deep check.
 *
 * Expõe: window.MagazineAdmin.Validator
 *   - validateSlots(templateSlug, slots) → { errors[], warnings[] }
 *   - computePageStatus(page) → { state, errors, warnings }
 *   - renderBadge(parent, status)
 *   - validateDeep(templateSlug, slots, sb) — async RPC
 * ============================================================================ */
;(function () {
  'use strict'

  const { Widgets, Schema } = window.MagazineAdmin || {}

  function wordCount(s) {
    const t = (s || '').trim()
    return t ? t.split(/\s+/).length : 0
  }

  function validateField(fm, value) {
    const errors = []
    const warnings = []
    const isEmpty = value == null || value === '' || (Array.isArray(value) && value.length === 0)

    if (!fm.optional && isEmpty) {
      errors.push(`${fm.label}: campo obrigatório`)
      return { errors, warnings }
    }
    if (isEmpty) return { errors, warnings }

    if (fm.type === 'list') {
      const arr = Array.isArray(value) ? value : []
      if (fm.min != null && arr.length < fm.min) errors.push(`${fm.label}: mínimo ${fm.min} itens (tem ${arr.length})`)
      if (fm.max != null && arr.length > fm.max) errors.push(`${fm.label}: máximo ${fm.max} itens (tem ${arr.length})`)

      const sc = fm.scalarItem
      const itemSchema = fm.itemSchema ? Schema.getItemSchema(fm.itemSchema) : null
      arr.forEach((item, i) => {
        if (sc) {
          const v = typeof item === 'object' ? (item.url || item.texto || '') : String(item || '')
          if (sc.max && v.length > sc.max) warnings.push(`${fm.label}[${i + 1}]: excede ${sc.max} chars (tem ${v.length})`)
          if (!sc.optional && !v) errors.push(`${fm.label}[${i + 1}]: vazio`)
        } else if (itemSchema) {
          itemSchema.forEach(sub => {
            const v = (item && item[sub.k]) || ''
            if (!sub.optional && !v) errors.push(`${fm.label}[${i + 1}].${sub.label}: vazio`)
            if (sub.max && v.length > sub.max) warnings.push(`${fm.label}[${i + 1}].${sub.label}: excede ${sub.max} (tem ${v.length})`)
            if (sub.wordsMin || sub.wordsMax) {
              const w = wordCount(v)
              if (sub.wordsMin && w && w < sub.wordsMin) warnings.push(`${fm.label}[${i + 1}].${sub.label}: mín ${sub.wordsMin} palavras (tem ${w})`)
              if (sub.wordsMax && w > sub.wordsMax) warnings.push(`${fm.label}[${i + 1}].${sub.label}: máx ${sub.wordsMax} palavras (tem ${w})`)
            }
          })
        }
      })
      return { errors, warnings }
    }

    const v = String(value)
    if (fm.max != null && v.length > fm.max) {
      errors.push(`${fm.label}: excede ${fm.max} chars (tem ${v.length})`)
    }
    if (fm.minChars != null && v.length < fm.minChars) {
      warnings.push(`${fm.label}: mín ${fm.minChars} chars (tem ${v.length})`)
    }
    if (fm.wordsMin != null || fm.wordsMax != null) {
      const w = wordCount(v)
      if (fm.wordsMin && w < fm.wordsMin) warnings.push(`${fm.label}: mín ${fm.wordsMin} palavras (tem ${w})`)
      if (fm.wordsMax && w > fm.wordsMax) errors.push(`${fm.label}: máx ${fm.wordsMax} palavras (tem ${w})`)
    }
    return { errors, warnings }
  }

  function validateSlots(templateSlug, slots) {
    const section = Schema.getSectionMeta(templateSlug)
    if (!section) return { errors: [`Template desconhecido: ${templateSlug}`], warnings: [] }
    const errors = []
    const warnings = []
    section.fields.forEach(fm => {
      const r = validateField(fm, slots ? slots[fm.k] : undefined)
      errors.push(...r.errors)
      warnings.push(...r.warnings)
    })
    return { errors, warnings }
  }

  function computePageStatus(page) {
    if (!page) return { state: 'empty', errors: [], warnings: [] }
    const { errors, warnings } = validateSlots(page.template_slug, page.slots || {})
    const slots = page.slots || {}
    const allEmpty = Object.keys(slots).length === 0
    if (allEmpty) return { state: 'empty', errors, warnings }
    if (errors.length) return { state: 'err', errors, warnings }
    if (warnings.length) return { state: 'warn', errors, warnings }
    return { state: 'ok', errors, warnings }
  }

  // RPC deep validation (async)
  async function validateDeep(templateSlug, slots, sb) {
    if (!sb || !sb.rpc) return { ok: true, errors: [], warnings: [], skipped: true }
    try {
      const { data, error } = await sb.rpc('magazine_validate_section', {
        p_template_slug: templateSlug,
        p_slots: slots || {},
      })
      if (error) return { ok: false, errors: [error.message], warnings: [], rpc: true }
      return {
        ok: !(data && data.errors && data.errors.length),
        errors: (data && data.errors) || [],
        warnings: (data && data.warnings) || [],
        rpc: true,
      }
    } catch (e) {
      return { ok: false, errors: [e.message], warnings: [], rpc: true }
    }
  }

  function renderBadge(parent, status) {
    if (!parent) return
    let badge = parent.querySelector('.page-status-badge')
    if (!badge) {
      badge = document.createElement('span')
      badge.className = 'page-status-badge'
      parent.appendChild(badge)
    }
    const state = status ? status.state : 'empty'
    badge.dataset.state = state
    const titles = {
      ok:    'Válida',
      warn:  'Avisos: ' + (status.warnings || []).join(' · '),
      err:   'Erros: ' + (status.errors || []).join(' · '),
      empty: 'Sem conteúdo ainda',
    }
    badge.title = titles[state] || ''
    const dots = { ok: '●', warn: '●', err: '●', empty: '○' }
    badge.textContent = dots[state] || '○'
  }

  function renderIssueList(parent, status) {
    if (!parent) return
    parent.innerHTML = ''
    if (!status) return
    const all = [
      ...(status.errors || []).map(m => ({ kind: 'err', msg: m })),
      ...(status.warnings || []).map(m => ({ kind: 'warn', msg: m })),
    ]
    if (!all.length) {
      parent.innerHTML = '<div class="issue ok">Nenhum problema detectado.</div>'
      return
    }
    all.forEach(i => {
      const el = document.createElement('div')
      el.className = `issue ${i.kind}`
      el.textContent = (i.kind === 'err' ? '⨯ ' : '! ') + i.msg
      parent.appendChild(el)
    })
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.Validator = {
    validateField,
    validateSlots,
    computePageStatus,
    validateDeep,
    renderBadge,
    renderIssueList,
  }
})()
