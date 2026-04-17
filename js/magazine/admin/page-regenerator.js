/* ============================================================================
 * Beauty & Health Magazine — Page Regenerator (B3)
 *
 * Drawer que permite regerar uma pagina inteira via Edge Function
 * magazine-brief-to-edition (mode=page-regenerate) com instrucao extra.
 * Mostra slots atuais vs slots gerados side-by-side. Confirma aplica.
 *
 * Expoe: window.MagazineAdmin.PageRegenerator
 *   - mount(host, sb) -> controller { open(page, editionContext, onApplied), close }
 * ============================================================================ */
;(function () {
  'use strict'

  function mount(host, sb) {
    if (!host) return null
    host.innerHTML = [
      '<div class="pr-overlay" data-open="0" style="position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;z-index:9998;align-items:flex-end;justify-content:center">',
      '  <div class="pr-drawer" style="background:#fff;width:min(960px,96vw);max-height:85vh;border-radius:14px 14px 0 0;box-shadow:0 -10px 40px rgba(0,0,0,.2);display:flex;flex-direction:column">',
      '    <div style="display:flex;align-items:center;gap:10px;padding:14px 20px;border-bottom:1px solid #e5ddd2">',
      '      <div style="font-family:Playfair Display,serif;font-weight:700;font-size:17px">Regerar pagina com IA</div>',
      '      <div data-role="tpl-label" style="color:#8a8178;font-size:12px;font-family:ui-monospace,monospace"></div>',
      '      <div style="flex:1"></div>',
      '      <button data-act="close" style="border:none;background:none;font-size:24px;line-height:1;cursor:pointer;color:#555">&times;</button>',
      '    </div>',
      '    <div style="padding:16px 20px;display:grid;grid-template-columns:1fr;gap:10px">',
      '      <label style="font-size:11px;color:#555">Instrucao extra (opcional)</label>',
      '      <div style="display:flex;gap:8px;align-items:flex-start">',
      '        <select data-role="saved-prompts" style="padding:8px;border:1px solid #e5ddd2;border-radius:6px;font-size:12px;flex:0 0 240px">',
      '          <option value="">-- Prompts salvos --</option>',
      '        </select>',
      '        <textarea data-role="prompt" rows="2" placeholder="Ex: tom mais intimista, mencione Fotona 4D, foco em publico 50+" style="flex:1;padding:10px;border:1px solid #e5ddd2;border-radius:6px;font-size:13px"></textarea>',
      '        <button data-act="save-prompt" title="Salvar como prompt reutilizavel" style="padding:8px;border:1px solid #e5ddd2;border-radius:6px;background:#fff;cursor:pointer;font-size:11px">Salvar</button>',
      '      </div>',
      '      <div style="display:flex;gap:8px;align-items:center">',
      '        <button data-act="generate" style="padding:10px 16px;background:#1a1a1a;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer">Gerar</button>',
      '        <span data-role="status" style="font-size:12px;color:#8a8178"></span>',
      '      </div>',
      '    </div>',
      '    <div style="padding:0 20px 16px 20px;flex:1;overflow:auto;display:grid;grid-template-columns:1fr 1fr;gap:16px">',
      '      <div>',
      '        <h4 style="margin:0 0 6px;font-size:12px;font-weight:700;color:#555">Atual</h4>',
      '        <pre data-role="before" style="background:#f7f3ec;padding:10px;border-radius:6px;font-size:11px;max-height:300px;overflow:auto"></pre>',
      '      </div>',
      '      <div>',
      '        <h4 style="margin:0 0 6px;font-size:12px;font-weight:700;color:#7a1f2b">Proposto pela IA</h4>',
      '        <pre data-role="after" style="background:#fdf2f3;padding:10px;border-radius:6px;font-size:11px;max-height:300px;overflow:auto;border:1px solid #f5e9eb">Clique em Gerar para ver proposta.</pre>',
      '      </div>',
      '    </div>',
      '    <div style="display:flex;gap:8px;padding:12px 20px;border-top:1px solid #e5ddd2;justify-content:flex-end">',
      '      <button data-act="close" style="padding:8px 14px;border:1px solid #e5ddd2;border-radius:6px;background:#fff;cursor:pointer;font-size:13px">Cancelar</button>',
      '      <button data-act="apply" disabled style="padding:8px 14px;background:#2d7a43;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px;opacity:.5">Aplicar</button>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('\n')

    var overlay = host.querySelector('.pr-overlay')
    var tplLabel = host.querySelector('[data-role="tpl-label"]')
    var promptEl = host.querySelector('[data-role="prompt"]')
    var savedPromptsEl = host.querySelector('[data-role="saved-prompts"]')
    var statusEl = host.querySelector('[data-role="status"]')
    var beforeEl = host.querySelector('[data-role="before"]')
    var afterEl = host.querySelector('[data-role="after"]')
    var applyBtn = host.querySelector('[data-act="apply"]')
    var generateBtn = host.querySelector('[data-act="generate"]')
    var savePromptBtn = host.querySelector('[data-act="save-prompt"]')

    var state = {
      page: null, editionContext: null, onApplied: null, proposedSlots: null,
    }

    Array.prototype.forEach.call(host.querySelectorAll('[data-act="close"]'), function (b) {
      b.addEventListener('click', close)
    })
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close() })
    generateBtn.addEventListener('click', generate)
    applyBtn.addEventListener('click', applyProposed)
    savePromptBtn.addEventListener('click', savePrompt)
    savedPromptsEl.addEventListener('change', function () {
      if (savedPromptsEl.value) promptEl.value = savedPromptsEl.value
    })

    async function open(page, editionContext, onApplied) {
      state.page = page
      state.editionContext = editionContext || {}
      state.onApplied = onApplied || function () {}
      state.proposedSlots = null
      tplLabel.textContent = page.template_slug + ' · ord ' + (page.order_index || 0)
      promptEl.value = ''
      beforeEl.textContent = JSON.stringify(page.slots || {}, null, 2)
      afterEl.textContent = 'Clique em Gerar para ver proposta.'
      applyBtn.disabled = true
      applyBtn.style.opacity = '.5'
      statusEl.textContent = ''
      overlay.style.display = 'flex'
      overlay.dataset.open = '1'
      await loadSavedPrompts()
    }

    function close() {
      overlay.style.display = 'none'
      overlay.dataset.open = '0'
      state.page = null
    }

    async function generate() {
      if (!state.page) return
      statusEl.textContent = 'Gerando…'
      generateBtn.disabled = true
      try {
        var endpoint = (window.ClinicEnv && window.ClinicEnv.MAGAZINE_AI_ENDPOINT) || ''
        var briefEndpoint = endpoint.replace('/magazine-ai-generate', '/magazine-brief-to-edition')

        var headers = { 'Content-Type': 'application/json' }
        var anon = window.ClinicEnv && window.ClinicEnv.SUPABASE_KEY
        if (anon) { headers['Authorization'] = 'Bearer ' + anon; headers['apikey'] = anon }

        var resp = await fetch(briefEndpoint, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            mode: 'page-regenerate',
            page: { template_slug: state.page.template_slug, slots: state.page.slots || {} },
            extra_instruction: promptEl.value.trim() || null,
          }),
        })
        if (!resp.ok) {
          var err = await resp.text()
          throw new Error('HTTP ' + resp.status + ': ' + err.slice(0, 200))
        }
        var data = await resp.json()
        state.proposedSlots = data.slots || data
        afterEl.textContent = JSON.stringify(state.proposedSlots, null, 2)
        applyBtn.disabled = false
        applyBtn.style.opacity = '1'
        statusEl.textContent = 'Proposta pronta. Revise e aplique.'
      } catch (err) {
        statusEl.textContent = 'Erro: ' + err.message
      } finally {
        generateBtn.disabled = false
      }
    }

    async function applyProposed() {
      if (!state.page || !state.proposedSlots) return
      statusEl.textContent = 'Aplicando…'
      applyBtn.disabled = true
      try {
        var res = await sb.rpc('magazine_page_update_slots', {
          p_page_id: state.page.id,
          p_slots: state.proposedSlots,
        })
        if (res.error) throw res.error
        statusEl.textContent = 'Aplicado.'
        if (state.onApplied) state.onApplied(state.proposedSlots, res.data && res.data.validation)
        setTimeout(close, 600)
      } catch (err) {
        statusEl.textContent = 'Erro: ' + err.message
        applyBtn.disabled = false
      }
    }

    async function loadSavedPrompts() {
      // B4: tabela magazine_prompt_library
      try {
        var res = await sb.rpc('magazine_prompt_library_list', { p_template_slug: state.page && state.page.template_slug })
        if (res.error) { savedPromptsEl.innerHTML = '<option value="">-- Prompts salvos --</option>'; return }
        var rows = res.data || []
        var opts = ['<option value="">-- Prompts salvos --</option>']
        rows.forEach(function (p) {
          opts.push('<option value="' + escapeAttr(p.prompt_text) + '">' + escapeHtml(p.nome) + '</option>')
        })
        savedPromptsEl.innerHTML = opts.join('')
      } catch (e) {
        savedPromptsEl.innerHTML = '<option value="">-- Prompts salvos --</option>'
      }
    }

    async function savePrompt() {
      var txt = promptEl.value.trim()
      if (!txt) { alert('Escreva o prompt primeiro.'); return }
      var nome = prompt('Nome para esse prompt (ex: "mais intimista"):')
      if (!nome) return
      try {
        var res = await sb.rpc('magazine_prompt_library_upsert', {
          p_id: null,
          p_nome: nome,
          p_prompt_text: txt,
          p_aplicavel_a: state.page ? [state.page.template_slug] : null,
        })
        if (res.error) throw res.error
        statusEl.textContent = 'Prompt salvo.'
        await loadSavedPrompts()
      } catch (err) { statusEl.textContent = 'Erro salvando: ' + err.message }
    }

    function escapeHtml(s) { if (s==null) return ''; return String(s).replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]}) }
    function escapeAttr(s) { return escapeHtml(s) }

    return { open: open, close: close }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.PageRegenerator = { mount: mount }
})()
