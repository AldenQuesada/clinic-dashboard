/* ============================================================================
 * Beauty & Health Magazine — Editorial Score
 *
 * Score 0-100 por página baseado em checklist ponderado:
 *   - Obrigatórios preenchidos (30%)
 *   - Limites de tamanho respeitados (25%)
 *   - Imagens presentes nos slots do tipo image (20%)
 *   - Boas práticas do playbook (25%) — itálico no título, kicker ALL CAPS etc.
 *
 * Expõe: window.MagazineAdmin.EditorialScore
 *   - compute(page, section) → { score, band, checks[] }
 *   - renderBadge(el, result)
 *   - renderChecklist(el, result)
 * ============================================================================ */
;(function () {
  'use strict'

  function hasValue(v) {
    if (v == null || v === '') return false
    if (Array.isArray(v) && v.length === 0) return false
    return true
  }

  function wordCount(s) {
    const t = (s || '').trim()
    return t ? t.split(/\s+/).length : 0
  }

  function fieldLenOk(field, value) {
    if (!hasValue(value)) return !!field.optional
    const str = Array.isArray(value) ? '' : String(value)
    if (field.type === 'list') {
      if (field.min && value.length < field.min) return false
      if (field.max && value.length > field.max) return false
      return true
    }
    if (field.max && str.length > field.max) return false
    if (field.minChars && str.length < field.minChars) return false
    if (field.wordsMin || field.wordsMax) {
      const w = wordCount(str)
      if (field.wordsMin && w < field.wordsMin) return false
      if (field.wordsMax && w > field.wordsMax) return false
    }
    return true
  }

  function compute(page, section) {
    if (!page || !section) return { score: 0, band: 'low', checks: [] }
    const slots = page.slots || {}

    // 1. Obrigatórios (30%)
    const required = section.fields.filter(f => !f.optional)
    const filledReq = required.filter(f => hasValue(slots[f.k])).length
    const reqCheck = {
      key: 'required',
      label: `Obrigatórios (${filledReq}/${required.length})`,
      weight: 30,
      partial: required.length ? filledReq / required.length : 1,
      passed: filledReq === required.length,
      details: required
        .filter(f => !hasValue(slots[f.k]))
        .map(f => ({ label: f.label || f.k, passed: false })),
    }

    // 2. Limites (25%)
    const lenFields = section.fields.filter(f =>
      f.max || f.minChars || f.wordsMin || f.wordsMax ||
      (f.type === 'list' && (f.min || f.max))
    )
    const lenOkCount = lenFields.filter(f => fieldLenOk(f, slots[f.k])).length
    const lenCheck = {
      key: 'lengths',
      label: `Limites de tamanho (${lenOkCount}/${lenFields.length || 0})`,
      weight: 25,
      partial: lenFields.length ? lenOkCount / lenFields.length : 1,
      passed: lenOkCount === lenFields.length,
      details: lenFields
        .filter(f => !fieldLenOk(f, slots[f.k]))
        .map(f => ({ label: f.label, passed: false })),
    }

    // 3. Imagens presentes (20%)
    const imgFields = section.fields.filter(f => f.type === 'image')
    const imgOk = imgFields.filter(f => {
      const v = slots[f.k]
      return typeof v === 'string' && v.length > 0
    }).length
    const imgCheck = {
      key: 'images',
      label: imgFields.length ? `Imagens preenchidas (${imgOk}/${imgFields.length})` : 'Sem slots de imagem',
      weight: 20,
      partial: imgFields.length ? imgOk / imgFields.length : 1,
      passed: imgOk === imgFields.length,
    }

    // 4. Boas práticas (25%)
    const bp = []
    // 4a. Itálico em título (templates editoriais)
    const italicTpls = /^(t01|t02|t07|t08|t12|t14|t16|t20|t22|t25)/
    if (italicTpls.test(page.template_slug) && typeof slots.titulo === 'string' && slots.titulo) {
      bp.push({ label: 'Título com itálico *palavra*', passed: /\*[^*]+\*/.test(slots.titulo) })
    }
    // 4b. Kicker ALL CAPS
    if (typeof slots.kicker === 'string' && slots.kicker) {
      const k = slots.kicker
      bp.push({ label: 'Kicker ALL CAPS', passed: k === k.toUpperCase() })
    }
    // 4c. CTA texto ALL CAPS (t06, t11)
    if (typeof slots.cta_texto === 'string' && slots.cta_texto) {
      bp.push({ label: 'CTA texto ALL CAPS', passed: slots.cta_texto === slots.cta_texto.toUpperCase() })
    }
    if (typeof slots.cta === 'string' && slots.cta) {
      bp.push({ label: 'CTA ALL CAPS', passed: slots.cta === slots.cta.toUpperCase() })
    }
    // 4d. t06 cta_link começa com https:// ou wa.me
    if (page.template_slug === 't06_back_cta' && typeof slots.cta_link === 'string' && slots.cta_link) {
      bp.push({ label: 'CTA link válido (https:// ou wa.me)', passed: /^https:\/\/|wa\.me/.test(slots.cta_link) })
    }
    // 4e. t04 items em ordem numérica sequencial
    if (page.template_slug === 't04_toc_editorial' && Array.isArray(slots.items)) {
      const nums = slots.items.map(i => parseInt(i && i.num, 10)).filter(n => !isNaN(n))
      const seq = nums.every((n, i) => i === 0 || n === nums[i - 1] + 1)
      bp.push({ label: 'Sumário em ordem sequencial', passed: seq && nums.length === slots.items.length })
    }
    // 4f. t17 pergunta termina com ?
    if (page.template_slug === 't17_poll' && typeof slots.pergunta === 'string' && slots.pergunta) {
      bp.push({ label: 'Pergunta termina com "?"', passed: slots.pergunta.trim().endsWith('?') })
    }
    // 4g. t18 fonte não vazia (dado tem origem)
    if (page.template_slug === 't18_stat_feature' && hasValue(slots.numero)) {
      bp.push({ label: 'Dado com fonte citada', passed: !!slots.fonte && slots.fonte.length > 5 })
    }
    // 4h. t11 benefícios começam com verbo ativo
    if (page.template_slug === 't11_product_highlight' && Array.isArray(slots.beneficios) && slots.beneficios.length) {
      const verbPattern = /^(Estimula|Reduz|Devolve|Redefine|Melhora|Ilumina|Hidrata|Suaviza|Rejuven|Aumenta|Elimina|Restaura|Protege|Preenche|Corrige)/i
      const okVerbs = slots.beneficios.filter(b => verbPattern.test(String(b || '').trim())).length
      bp.push({ label: 'Benefícios começam com verbo ativo', passed: okVerbs === slots.beneficios.length })
    }

    const bpPassed = bp.filter(b => b.passed).length
    const bpCheck = {
      key: 'bestpractices',
      label: bp.length ? `Boas práticas (${bpPassed}/${bp.length})` : 'Boas práticas aplicáveis',
      weight: 25,
      partial: bp.length ? bpPassed / bp.length : 1,
      passed: bpPassed === bp.length,
      details: bp.filter(b => !b.passed).map(b => ({ label: b.label, passed: false })),
    }

    const checks = [reqCheck, lenCheck, imgCheck, bpCheck]
    const total = checks.reduce((acc, c) => acc + c.weight * (c.partial || 0), 0)
    const score = Math.round(total)
    const band = score >= 85 ? 'high' : score >= 60 ? 'mid' : 'low'
    return { score, band, checks }
  }

  function renderBadge(el, result) {
    if (!el) return
    el.innerHTML = `
      <div class="es-badge" data-band="${result.band}">
        <div class="es-score">${result.score}</div>
        <div class="es-label">SCORE</div>
      </div>
    `
  }

  function renderChecklist(el, result) {
    if (!el) return
    el.innerHTML = `
      <div class="es-list">
        ${result.checks.map(c => `
          <div class="es-check" data-state="${c.passed ? 'ok' : c.partial > 0 ? 'partial' : 'fail'}">
            <div class="es-check-main">
              <span class="es-dot">${c.passed ? '✓' : c.partial > 0 ? '◐' : '○'}</span>
              <span class="es-check-label">${escapeHtml(c.label)}</span>
              <span class="es-weight">${c.weight}%</span>
            </div>
            ${(c.details && c.details.length)
              ? `<ul class="es-sub">${c.details.map(d => `<li>${escapeHtml(d.label)}</li>`).join('')}</ul>`
              : ''}
          </div>
        `).join('')}
      </div>
    `
  }

  function escapeHtml(s) {
    if (s == null) return ''
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.EditorialScore = { compute, renderBadge, renderChecklist }
})()
