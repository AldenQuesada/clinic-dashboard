/* ============================================================================
 * Beauty & Health Magazine — AI Generator (por slot)
 *
 * Popup que chama um endpoint configurável (Claude/Haiku via proxy) para
 * preencher um slot específico respeitando o playbook (template_slug + field +
 * brief + outros slots da página como contexto).
 *
 * Endpoint esperado:
 *   POST window.ClinicEnv.MAGAZINE_AI_ENDPOINT
 *   Body: { template_slug, field_key, field_meta, page_slots, edition_context }
 *   Response: { text: string } (para text/textarea) OU { items: [...] } (para list)
 *
 * Expõe: window.MagazineAdmin.AIGenerator
 *   - mount(host) → controller
 *   - controller.openForField({fieldMeta, pageTemplateSlug, pageSlots, editionContext, onAccept})
 *   - attachButton(containerEl, params) — injeta ✨ botão num wrapper de campo
 * ============================================================================ */
;(function () {
  'use strict'

  function getEndpoint() {
    return (window.ClinicEnv && window.ClinicEnv.MAGAZINE_AI_ENDPOINT) || null
  }

  function mount(host) {
    host.innerHTML = `
      <div class="ai-overlay" data-open="0">
        <div class="ai-modal">
          <div class="ai-head">
            <div class="ai-title">Gerar com IA</div>
            <button class="ai-close" data-act="close">×</button>
          </div>
          <div class="ai-body">
            <div class="ai-row">
              <div class="ai-field" data-role="field-label">—</div>
              <div class="ai-hint" data-role="field-hint"></div>
            </div>
            <div class="ai-row">
              <label class="ai-label">Instrução adicional (opcional)</label>
              <textarea data-role="prompt" rows="3" placeholder="Ex: tom mais direto, mencionar Fotona 4D, focar em público 50+…"></textarea>
            </div>
            <div class="ai-actions-row">
              <button type="button" class="ai-btn primary" data-act="generate">✨ Gerar</button>
              <span class="ai-status" data-role="status"></span>
            </div>
            <div class="ai-preview" data-role="preview"></div>
            <div class="ai-actions-row" data-role="accept-row" style="display:none">
              <button type="button" class="ai-btn" data-act="regen">↻ Regenerar</button>
              <button type="button" class="ai-btn primary" data-act="accept">✓ Usar este texto</button>
            </div>
          </div>
        </div>
      </div>
    `

    const overlay = host.querySelector('.ai-overlay')
    const $ = (sel) => host.querySelector(sel)
    const fieldLbl = $('[data-role="field-label"]')
    const fieldHint = $('[data-role="field-hint"]')
    const promptEl = $('[data-role="prompt"]')
    const statusEl = $('[data-role="status"]')
    const previewEl = $('[data-role="preview"]')
    const acceptRow = $('[data-role="accept-row"]')

    let ctx = null
    let lastGenerated = null

    host.querySelector('[data-act="close"]').addEventListener('click', close)
    host.querySelector('[data-act="generate"]').addEventListener('click', generate)
    host.querySelector('[data-act="regen"]').addEventListener('click', generate)
    host.querySelector('[data-act="accept"]').addEventListener('click', accept)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })

    function openForField(params) {
      ctx = params
      const fm = params.fieldMeta
      fieldLbl.textContent = fm.label + (fm.optional ? '' : ' *')
      fieldHint.textContent = fm.hint || ''
      promptEl.value = ''
      previewEl.innerHTML = ''
      acceptRow.style.display = 'none'
      statusEl.textContent = ''
      lastGenerated = null
      overlay.dataset.open = '1'
      setTimeout(() => promptEl.focus(), 50)
    }

    async function generate() {
      if (!ctx) return
      const endpoint = getEndpoint()
      if (!endpoint) {
        statusEl.textContent = 'Endpoint IA não configurado (ClinicEnv.MAGAZINE_AI_ENDPOINT)'
        statusEl.dataset.state = 'err'
        return
      }
      statusEl.textContent = 'Gerando…'
      statusEl.dataset.state = 'loading'
      const payload = {
        template_slug: ctx.pageTemplateSlug,
        field_key: ctx.fieldMeta.k,
        field_meta: ctx.fieldMeta,
        page_slots: ctx.pageSlots || {},
        edition_context: ctx.editionContext || {},
        extra_instruction: promptEl.value.trim() || null,
      }
      try {
        const headers = { 'Content-Type': 'application/json' }
        // Edge Functions exigem auth header com a anon key
        const anon = window.ClinicEnv && window.ClinicEnv.SUPABASE_KEY
        if (anon) {
          headers['Authorization'] = `Bearer ${anon}`
          headers['apikey'] = anon
        }
        const res = await fetch(endpoint, {
          method: 'POST',
          headers,
          body: JSON.stringify(payload),
        })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const data = await res.json()
        const text = data.text || (data.items ? JSON.stringify(data.items, null, 2) : '')
        lastGenerated = data
        previewEl.innerHTML = `<pre>${escapeHtml(text)}</pre>`
        acceptRow.style.display = ''
        statusEl.textContent = 'Pronto · revise antes de aplicar'
        statusEl.dataset.state = 'ok'
      } catch (err) {
        statusEl.textContent = 'Erro: ' + err.message
        statusEl.dataset.state = 'err'
      }
    }

    function accept() {
      if (!ctx || !lastGenerated) return
      const val = lastGenerated.items || lastGenerated.text || ''
      if (typeof ctx.onAccept === 'function') ctx.onAccept(val)
      close()
    }

    function close() {
      overlay.dataset.open = '0'
      ctx = null
      lastGenerated = null
    }

    function escapeHtml(s) {
      if (s == null) return ''
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    }

    // Anexa um botão ✨ num wrapper de campo existente. params = {fieldMeta, onClick}
    function attachButton(labelRow, params) {
      if (!labelRow) return
      if (labelRow.querySelector('.ai-spark')) return
      const btn = document.createElement('button')
      btn.type = 'button'
      btn.className = 'ai-spark'
      btn.title = 'Gerar com IA'
      btn.textContent = '✨'
      btn.addEventListener('click', (e) => {
        e.stopPropagation()
        if (typeof params.onClick === 'function') params.onClick()
      })
      labelRow.appendChild(btn)
    }

    return { openForField, attachButton }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.AIGenerator = { mount, getEndpoint }
})()
