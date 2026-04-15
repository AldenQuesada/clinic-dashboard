/* ============================================================================
 * Beauty & Health Magazine — Edition Metadata
 *
 * Modal para editar metadados da edição: theme, subtitle, cover_template_slug,
 * e slug (read-only após criar). Atualiza via UPDATE direto em magazine_editions.
 *
 * Expõe: window.MagazineAdmin.EditionMeta
 *   - mount(backdrop, sb, handlers) → controller { open(edition, templates), close }
 *
 * handlers:
 *   - onSaved(partial) — chamado após UPDATE bem-sucedido
 * ============================================================================ */
;(function () {
  'use strict'

  function mount(backdrop, sb, handlers) {
    handlers = handlers || {}
    let current = null
    let templates = []

    backdrop.innerHTML = `
      <div class="modal em-modal">
        <div class="modal-header">
          <h2>Metadados da edição</h2>
          <button class="close" data-act="close" title="Fechar">×</button>
        </div>
        <div class="modal-body em-body">
          <div class="em-field">
            <label>Título</label>
            <input type="text" data-k="title" />
            <div class="em-hint">Aparece no leitor e nos links. Padrão: "Beauty &amp; Health — Edição de {mês} {ano}"</div>
          </div>
          <div class="em-field">
            <label>Slug</label>
            <input type="text" data-k="slug" readonly />
            <div class="em-hint">Imutável após criar · formato: mes-ano-tema</div>
          </div>
          <div class="em-field">
            <label>Subtítulo</label>
            <textarea data-k="subtitle" rows="2"></textarea>
            <div class="em-hint">Descritivo opcional · aparece em destaque</div>
          </div>
          <div class="em-field">
            <label>Tema</label>
            <input type="text" data-k="theme" />
            <div class="em-hint">Ex: "smooth-eyes", "full-body-renewal" · usado em analytics e filtros</div>
          </div>
          <div class="em-field">
            <label>Template da capa</label>
            <select data-k="cover_template_slug">
              <option value="">— Nenhum padrão —</option>
            </select>
            <div class="em-hint">Template sugerido para a capa (1ª página)</div>
          </div>
        </div>
        <div class="em-footer">
          <button type="button" class="btn" data-act="cancel">Cancelar</button>
          <button type="button" class="btn primary" data-act="save">Salvar</button>
        </div>
      </div>
    `

    const modal = backdrop.querySelector('.em-modal')
    const inputs = {
      title:    modal.querySelector('[data-k="title"]'),
      slug:     modal.querySelector('[data-k="slug"]'),
      subtitle: modal.querySelector('[data-k="subtitle"]'),
      theme:    modal.querySelector('[data-k="theme"]'),
      cover_template_slug: modal.querySelector('[data-k="cover_template_slug"]'),
    }

    backdrop.querySelector('[data-act="close"]').addEventListener('click', close)
    backdrop.querySelector('[data-act="cancel"]').addEventListener('click', close)
    backdrop.querySelector('[data-act="save"]').addEventListener('click', save)
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) close() })

    function populateCoverOptions() {
      // Só capas (category=cover)
      const covers = templates.filter(t => (t.category || '').toLowerCase() === 'cover')
      inputs.cover_template_slug.innerHTML =
        '<option value="">— Nenhum padrão —</option>' +
        covers.map(t => `<option value="${escapeAttr(t.slug)}">${escapeHtml(t.name || t.slug)}</option>`).join('')
    }

    function open(edition, tpls) {
      current = edition
      templates = tpls || []
      populateCoverOptions()
      inputs.title.value    = edition.title || ''
      inputs.slug.value     = edition.slug  || ''
      inputs.subtitle.value = edition.subtitle || ''
      inputs.theme.value    = edition.theme || ''
      inputs.cover_template_slug.value = edition.cover_template_slug || ''
      backdrop.classList.add('open')
      setTimeout(() => inputs.title.focus(), 50)
    }

    function close() {
      backdrop.classList.remove('open')
    }

    async function save() {
      if (!current) return
      const payload = {
        title:    inputs.title.value.trim() || current.title,
        subtitle: inputs.subtitle.value.trim() || null,
        theme:    inputs.theme.value.trim() || null,
        cover_template_slug: inputs.cover_template_slug.value || null,
      }
      const saveBtn = backdrop.querySelector('[data-act="save"]')
      saveBtn.disabled = true
      saveBtn.textContent = 'Salvando…'
      try {
        const { error } = await sb.from('magazine_editions').update(payload).eq('id', current.id)
        if (error) throw error
        if (typeof handlers.onSaved === 'function') handlers.onSaved(payload)
        close()
      } catch (err) {
        if (typeof handlers.onError === 'function') handlers.onError(err.message)
        else alert('Erro: ' + err.message)
      } finally {
        saveBtn.disabled = false
        saveBtn.textContent = 'Salvar'
      }
    }

    function escapeHtml(s) {
      if (s == null) return ''
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    }
    function escapeAttr(s) { return escapeHtml(s) }

    return { open, close }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.EditionMeta = { mount }
})()
