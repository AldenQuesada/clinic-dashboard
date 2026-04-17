/* ============================================================================
 * Beauty & Health Magazine — Smart Autofix (B5)
 *
 * Painel que busca erros de validacao de uma pagina via
 * magazine_validate_autofix_plan, itera cada erro, monta uma instrucao
 * especifica (ex: "reduza 'titulo' para 40 chars mantendo sentido") e
 * chama Edge Function magazine-ai-generate por campo. Aplica correcoes via
 * magazine_page_update_slots. Mostra progresso por erro.
 *
 * Expoe: window.MagazineAdmin.AutofixPanel
 *   - mount(host, sb) -> controller { open(pageId, onDone), close }
 * ============================================================================ */
;(function () {
  'use strict'

  function mount(host, sb) {
    if (!host) return null
    host.innerHTML = [
      '<div class="af-overlay" data-open="0" style="position:fixed;inset:0;background:rgba(0,0,0,.55);display:none;z-index:9998;align-items:center;justify-content:center">',
      '  <div style="background:#fff;width:min(640px,94vw);max-height:84vh;overflow:auto;border-radius:10px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.3)">',
      '    <h2 style="font-family:Playfair Display,serif;font-weight:700;font-size:20px;margin-bottom:12px">Corrigir erros com IA</h2>',
      '    <div data-role="summary" style="font-size:13px;color:#555;margin-bottom:12px"></div>',
      '    <div data-role="items" style="display:flex;flex-direction:column;gap:6px;max-height:350px;overflow:auto;margin-bottom:16px"></div>',
      '    <div style="display:flex;gap:8px;justify-content:flex-end">',
      '      <button data-act="close" style="padding:8px 14px;border:1px solid #e5ddd2;border-radius:6px;background:#fff;cursor:pointer;font-size:13px">Fechar</button>',
      '      <button data-act="fix-all" style="padding:8px 14px;background:#7a1f2b;color:#fff;border:none;border-radius:6px;cursor:pointer;font-size:13px">✨ Corrigir tudo</button>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('\n')

    var overlay = host.querySelector('.af-overlay')
    var summaryEl = host.querySelector('[data-role="summary"]')
    var itemsEl = host.querySelector('[data-role="items"]')
    var fixAllBtn = host.querySelector('[data-act="fix-all"]')
    var state = { pageId: null, plan: null, slots: null, templateSlug: null, onDone: null }

    host.querySelector('[data-act="close"]').addEventListener('click', close)
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close() })
    fixAllBtn.addEventListener('click', fixAll)

    async function open(pageId, onDone) {
      state.pageId = pageId
      state.onDone = onDone || function () {}
      overlay.style.display = 'flex'
      overlay.dataset.open = '1'
      summaryEl.textContent = 'Analisando erros…'
      itemsEl.innerHTML = ''
      fixAllBtn.disabled = true

      try {
        var res = await sb.rpc('magazine_validate_autofix_plan', { p_page_id: pageId })
        if (res.error) throw res.error
        state.plan = (res.data && res.data.plan) || []
        state.slots = (res.data && res.data.slots) || {}
        state.templateSlug = res.data && res.data.template_slug
        renderPlan()
      } catch (err) {
        summaryEl.textContent = 'Erro: ' + err.message
      }
    }

    function close() {
      overlay.style.display = 'none'
      overlay.dataset.open = '0'
      state = { pageId: null, plan: null, slots: null, templateSlug: null, onDone: null }
    }

    function renderPlan() {
      if (!state.plan || !state.plan.length) {
        summaryEl.textContent = 'Sem erros — pagina valida.'
        fixAllBtn.disabled = true
        return
      }
      summaryEl.textContent = state.plan.length + ' erro(s) detectado(s). Correcoes disponiveis:'
      itemsEl.innerHTML = state.plan.map(function (e, i) {
        return [
          '<div data-idx="' + i + '" style="display:flex;gap:8px;align-items:center;padding:8px;background:#f7f3ec;border-radius:6px">',
          '  <div style="flex:1">',
          '    <div style="font-family:ui-monospace,monospace;font-size:11px;color:#b91c1c">' + escapeHtml(e.error) + '</div>',
          '    <div style="font-size:11px;color:#555;margin-top:2px"><strong>' + escapeHtml(e.field) + '</strong> · kind: ' + escapeHtml(e.kind) + '</div>',
          '  </div>',
          '  <div data-role="status" style="font-size:11px;color:#8a8178">pendente</div>',
          '</div>',
        ].join('')
      }).join('')
      fixAllBtn.disabled = false
    }

    async function fixAll() {
      if (!state.plan || !state.plan.length) return
      fixAllBtn.disabled = true
      var endpoint = (window.ClinicEnv && window.ClinicEnv.MAGAZINE_AI_ENDPOINT) || ''
      var headers = { 'Content-Type': 'application/json' }
      var anon = window.ClinicEnv && window.ClinicEnv.SUPABASE_KEY
      if (anon) { headers['Authorization'] = 'Bearer ' + anon; headers['apikey'] = anon }

      var newSlots = JSON.parse(JSON.stringify(state.slots))

      for (var i = 0; i < state.plan.length; i++) {
        var err = state.plan[i]
        var row = itemsEl.querySelector('[data-idx="' + i + '"]')
        var statusEl = row && row.querySelector('[data-role="status"]')
        if (statusEl) { statusEl.textContent = 'corrigindo…'; statusEl.style.color = '#b45309' }

        try {
          var instruction = buildInstruction(err)
          if (!instruction) {
            if (statusEl) { statusEl.textContent = 'nao tratavel'; statusEl.style.color = '#8a8178' }
            continue
          }

          var payload = {
            template_slug: state.templateSlug,
            field_key: err.field,
            field_meta: { k: err.field, label: err.field, type: 'text' },
            page_slots: newSlots,
            edition_context: {},
            extra_instruction: instruction,
          }
          var resp = await fetch(endpoint, {
            method: 'POST', headers: headers, body: JSON.stringify(payload),
          })
          if (!resp.ok) throw new Error('HTTP ' + resp.status)
          var data = await resp.json()
          if (data.text) newSlots[err.field] = data.text
          else if (data.items) newSlots[err.field] = data.items
          if (statusEl) { statusEl.textContent = 'ok'; statusEl.style.color = '#2d7a43' }
        } catch (e) {
          if (statusEl) { statusEl.textContent = 'erro'; statusEl.style.color = '#b91c1c' }
        }
      }

      // Persiste
      summaryEl.textContent = 'Aplicando correcoes…'
      try {
        var applyRes = await sb.rpc('magazine_page_update_slots', {
          p_page_id: state.pageId,
          p_slots: newSlots,
        })
        if (applyRes.error) throw applyRes.error
        summaryEl.textContent = 'Correcoes aplicadas.'
        if (state.onDone) state.onDone(newSlots, applyRes.data && applyRes.data.validation)
      } catch (e) {
        summaryEl.textContent = 'Erro aplicando: ' + e.message
      }
      fixAllBtn.disabled = false
    }

    function buildInstruction(err) {
      var f = err.field, k = err.kind
      if (k === 'char_limit') {
        // ex: "titulo > 40 chars"
        var m = err.error.match(/> (\d+) chars/)
        var lim = m ? m[1] : '?'
        return 'Reduza o campo "' + f + '" para no maximo ' + lim + ' caracteres mantendo o sentido editorial.'
      }
      if (k === 'word_limit') {
        var m2 = err.error.match(/> (\d+) palavras/)
        var lim2 = m2 ? m2[1] : '?'
        return 'Reduza o campo "' + f + '" para no maximo ' + lim2 + ' palavras mantendo parragrafos e sentido.'
      }
      if (k === 'word_min') {
        var m3 = err.error.match(/< (\d+) palavras/)
        var lim3 = m3 ? m3[1] : '?'
        return 'Expanda o campo "' + f + '" para pelo menos ' + lim3 + ' palavras, mantendo tom editorial.'
      }
      if (k === 'char_min') {
        return 'Expanda o campo "' + f + '" para ter conteudo suficiente, mantendo tom editorial.'
      }
      if (k === 'missing' || k === 'list_min') {
        return 'Gere conteudo para o campo "' + f + '" baseado nos outros slots da pagina, respeitando o contrato do template ' + state.templateSlug + '.'
      }
      return null
    }

    function escapeHtml(s) { if (s==null) return ''; return String(s).replace(/[&<>"']/g,function(c){return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]}) }

    return { open: open, close: close }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.AutofixPanel = { mount: mount }
})()
