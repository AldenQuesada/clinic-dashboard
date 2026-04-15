/* ============================================================================
 * Beauty & Health Magazine — Editor Widgets (atomic renderers)
 *
 * Componentes vanilla, sem dependências externas. Cada widget monta UI + wires
 * eventos, e notifica via onChange(newValue). Pensados para compor editor de
 * slots do admin.
 *
 * Expõe: window.MagazineAdmin.Widgets
 *   - createFieldWrapper(meta, opts)
 *   - mountTextInput(wrapper, meta, value, onChange)
 *   - mountTextarea(wrapper, meta, value, onChange)
 *   - mountImageInput(wrapper, meta, value, onChange, onUpload)
 *   - mountListEditor(wrapper, meta, value, onChange, handlers)
 *   - mountCounter(input, meta)
 *   - escapeHtml(str)
 * ============================================================================ */
;(function () {
  'use strict'

  function escapeHtml(s) {
    if (s == null) return ''
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]))
  }

  // ── Counter (char/word) ─────────────────────────────────────────────────
  // Cores: verde (ok), âmbar (warning/próximo do limite), vermelho (violação)
  function computeCounterState(value, meta) {
    const v = value || ''
    const chars = v.length
    const words = v.trim() ? v.trim().split(/\s+/).length : 0

    const useWords = meta.wordsMin != null || meta.wordsMax != null
    const count = useWords ? words : chars
    const unit = useWords ? 'palavras' : 'chars'
    const min = useWords ? meta.wordsMin : meta.minChars
    const max = useWords ? meta.wordsMax : meta.max

    let state = 'ok'
    let label = `${count} ${unit}`

    if (max != null) {
      label = `${count} / ${max} ${unit}`
      if (count > max) state = 'err'
      else if (count > max * 0.9) state = 'warn'
    }
    if (min != null && count > 0 && count < min) state = 'warn'
    if (min != null && max != null) {
      label = `${count} / ${min}-${max} ${unit}`
      if (count > max) state = 'err'
      else if (count < min) state = 'warn'
      else state = 'ok'
    }
    return { state, label, count }
  }

  function mountCounter(input, meta, counterEl) {
    if (!counterEl) return () => {}
    const update = () => {
      const { state, label } = computeCounterState(input.value, meta)
      counterEl.textContent = label
      counterEl.dataset.state = state
    }
    input.addEventListener('input', update)
    update()
    return update
  }

  // ── Field wrapper (label + control holder + counter + hint) ────────────
  function createFieldWrapper(meta, opts) {
    opts = opts || {}
    const wrap = document.createElement('div')
    wrap.className = 'slot-field'
    wrap.dataset.fieldKey = meta.k

    const labelRow = document.createElement('div')
    labelRow.className = 'slot-field-labelrow'

    const label = document.createElement('label')
    label.textContent = meta.label || meta.k
    if (!meta.optional) {
      const req = document.createElement('span')
      req.className = 'req'
      req.textContent = '*'
      label.appendChild(req)
    }
    labelRow.appendChild(label)

    const counter = document.createElement('span')
    counter.className = 'slot-counter'
    counter.dataset.state = 'ok'
    if (meta.max || meta.wordsMin || meta.wordsMax || meta.minChars) {
      labelRow.appendChild(counter)
    }

    wrap.appendChild(labelRow)

    const control = document.createElement('div')
    control.className = 'slot-field-control'
    wrap.appendChild(control)

    if (meta.hint) {
      const hint = document.createElement('div')
      hint.className = 'slot-hint'
      hint.textContent = meta.hint
      wrap.appendChild(hint)
    }

    return { wrap, control, counter, label, labelRow }
  }

  // ── Text input ─────────────────────────────────────────────────────────
  function mountTextInput(parts, meta, value, onChange) {
    const input = document.createElement('input')
    input.type = 'text'
    input.value = value || ''
    input.dataset.slot = meta.k
    if (meta.max) input.setAttribute('maxlength', String(meta.max + 20)) // soft limit (counter alerta antes)
    parts.control.appendChild(input)
    mountCounter(input, meta, parts.counter)
    input.addEventListener('input', () => onChange(input.value))
    return input
  }

  // ── Textarea ───────────────────────────────────────────────────────────
  function mountTextarea(parts, meta, value, onChange) {
    const ta = document.createElement('textarea')
    ta.value = value || ''
    ta.dataset.slot = meta.k
    ta.rows = meta.rows || 3
    parts.control.appendChild(ta)
    mountCounter(ta, meta, parts.counter)
    ta.addEventListener('input', () => onChange(ta.value))
    return ta
  }

  // ── Image input (URL + upload + thumb + lightbox) ──────────────────────
  function mountImageInput(parts, meta, value, onChange, onUpload) {
    parts.control.classList.add('img-row')

    const row = document.createElement('div')
    row.className = 'img-row-inner'

    const input = document.createElement('input')
    input.type = 'text'
    input.value = value || ''
    input.dataset.slot = meta.k
    input.placeholder = 'URL ou use upload →'
    row.appendChild(input)

    const btn = document.createElement('button')
    btn.type = 'button'
    btn.className = 'upload-btn'
    btn.dataset.upload = meta.k
    btn.textContent = '↑ Upload'
    row.appendChild(btn)

    parts.control.appendChild(row)

    const thumb = document.createElement('div')
    thumb.className = 'thumb'
    const setThumb = (url) => {
      const normalized = (window.MagazineRenderer && window.MagazineRenderer.normalizeUrl)
        ? window.MagazineRenderer.normalizeUrl(url) : url
      if (normalized) {
        thumb.style.backgroundImage = `url('${normalized}')`
        thumb.classList.add('has-img')
        thumb.title = 'Clique para ampliar'
      } else {
        thumb.style.backgroundImage = ''
        thumb.classList.remove('has-img')
      }
    }
    setThumb(value)
    parts.wrap.appendChild(thumb)

    input.addEventListener('input', () => {
      onChange(input.value)
      setThumb(input.value)
    })

    const doUpload = (file) => {
      if (typeof onUpload !== 'function') return
      onUpload({
        key: meta.k,
        button: btn,
        file: file || null,
        aspect: meta.aspect || null,
        onUploaded: (url) => {
          input.value = url
          onChange(url)
          setThumb(url)
        },
      })
    }
    btn.addEventListener('click', () => doUpload(null))

    thumb.addEventListener('click', () => {
      if (!thumb.classList.contains('has-img')) return
      openLightbox(input.value)
    })

    // Drag-drop arquivo direto no wrapper (se DropZone disponível)
    const DZ = window.MagazineAdmin && window.MagazineAdmin.DropZone
    if (DZ) DZ.attach(parts.wrap, { onFile: doUpload })

    return { input, thumb, setThumb }
  }

  // Lightbox compartilhado (singleton)
  let _lightbox = null
  function openLightbox(url) {
    const normalized = (window.MagazineRenderer && window.MagazineRenderer.normalizeUrl)
      ? window.MagazineRenderer.normalizeUrl(url) : url
    if (!normalized) return
    if (!_lightbox) {
      _lightbox = document.createElement('div')
      _lightbox.className = 'mag-lightbox'
      _lightbox.innerHTML = '<img alt="preview"/>'
      _lightbox.addEventListener('click', () => _lightbox.classList.remove('open'))
      document.body.appendChild(_lightbox)
    }
    _lightbox.querySelector('img').src = normalized
    _lightbox.classList.add('open')
  }

  // ── List editor (add/remove/move) ──────────────────────────────────────
  function mountListEditor(parts, meta, value, onChange, handlers) {
    handlers = handlers || {}
    parts.control.classList.add('list-editor')

    const container = document.createElement('div')
    container.className = 'list-rows'
    parts.control.appendChild(container)

    const toolbar = document.createElement('div')
    toolbar.className = 'list-toolbar'
    const addBtn = document.createElement('button')
    addBtn.type = 'button'
    addBtn.className = 'list-add'
    addBtn.textContent = '+ Adicionar'
    toolbar.appendChild(addBtn)

    const countEl = document.createElement('span')
    countEl.className = 'list-count'
    toolbar.appendChild(countEl)
    parts.control.appendChild(toolbar)

    const isScalar = !!meta.scalarItem
    const schema = isScalar ? null : (window.MagazineAdmin.Schema.getItemSchema(meta.itemSchema) || [])
    const items = Array.isArray(value) ? value.slice() : []

    function updateCount() {
      const n = items.length
      const min = meta.min
      const max = meta.max
      let txt = `${n} ${n === 1 ? 'item' : 'itens'}`
      if (min != null && max != null) txt += ` · mín ${min} · máx ${max}`
      countEl.textContent = txt
      countEl.dataset.state = (min != null && n < min) ? 'warn'
                            : (max != null && n > max) ? 'err' : 'ok'
      addBtn.disabled = (max != null && n >= max)
    }

    function rebuild() {
      container.innerHTML = ''
      items.forEach((item, idx) => container.appendChild(buildRow(item, idx)))
      updateCount()
    }

    function buildRow(item, idx) {
      const row = document.createElement('div')
      row.className = 'list-row'

      const handle = document.createElement('div')
      handle.className = 'list-row-handle'
      handle.innerHTML = `<span class="idx">${idx + 1}</span>`
      row.appendChild(handle)

      const fields = document.createElement('div')
      fields.className = 'list-row-fields'
      row.appendChild(fields)

      if (isScalar) {
        fields.appendChild(buildScalarInput(item, idx))
      } else {
        schema.forEach(fm => fields.appendChild(buildItemField(fm, item, idx)))
      }

      const actions = document.createElement('div')
      actions.className = 'list-row-actions'
      actions.innerHTML = `
        <button type="button" class="act up"   title="Subir">↑</button>
        <button type="button" class="act down" title="Descer">↓</button>
        <button type="button" class="act del"  title="Remover">×</button>
      `
      actions.querySelector('.up').addEventListener('click',   () => move(idx, -1))
      actions.querySelector('.down').addEventListener('click', () => move(idx,  1))
      actions.querySelector('.del').addEventListener('click',  () => remove(idx))
      row.appendChild(actions)

      return row
    }

    function buildScalarInput(item, idx) {
      const sc = meta.scalarItem
      const el = document.createElement(sc.type === 'textarea' ? 'textarea' : 'input')
      if (sc.type !== 'textarea' && sc.type !== 'image') el.type = 'text'
      el.value = typeof item === 'object' ? (item.url || item.texto || '') : (item || '')
      if (sc.max) el.setAttribute('maxlength', String(sc.max + 20))
      el.placeholder = sc.label || ''
      el.addEventListener('input', () => {
        items[idx] = el.value
        onChange(items.slice())
      })
      if (sc.type === 'image') {
        const wrap = document.createElement('div')
        wrap.className = 'scalar-image'
        el.placeholder = 'URL ou use upload →'
        wrap.appendChild(el)
        const ub = document.createElement('button')
        ub.type = 'button'; ub.className = 'upload-btn'; ub.textContent = '↑'
        const doUp = (file) => {
          if (typeof handlers.onUpload !== 'function') return
          handlers.onUpload({
            key: `${meta.k}[${idx}]`,
            button: ub,
            file: file || null,
            aspect: sc.aspect || null,
            onUploaded: (url) => {
              el.value = url
              items[idx] = url
              onChange(items.slice())
            },
          })
        }
        ub.addEventListener('click', () => doUp(null))
        wrap.appendChild(ub)
        const DZ = window.MagazineAdmin && window.MagazineAdmin.DropZone
        if (DZ) DZ.attach(wrap, { onFile: doUp })
        return wrap
      }
      return el
    }

    function buildItemField(fm, item, idx) {
      const wrap = document.createElement('div')
      wrap.className = 'list-field'
      if (fm.width) wrap.classList.add(`w-${fm.width}`)

      const lbl = document.createElement('label')
      lbl.textContent = fm.label
      wrap.appendChild(lbl)

      const isTA = fm.type === 'textarea'
      const isImg = fm.type === 'image'

      if (isImg) {
        const row = document.createElement('div')
        row.className = 'img-row-inline'
        const inp = document.createElement('input')
        inp.type = 'text'
        inp.placeholder = 'URL ou use ↑'
        inp.value = (item && item[fm.k]) || ''
        inp.addEventListener('input', () => {
          items[idx] = Object.assign({}, items[idx], { [fm.k]: inp.value })
          onChange(items.slice())
        })
        const ub = document.createElement('button')
        ub.type = 'button'; ub.className = 'upload-btn'; ub.textContent = '↑'
        const doUp = (file) => {
          if (typeof handlers.onUpload !== 'function') return
          handlers.onUpload({
            key: `${meta.k}[${idx}].${fm.k}`,
            button: ub,
            file: file || null,
            aspect: fm.aspect || null,
            onUploaded: (url) => {
              inp.value = url
              items[idx] = Object.assign({}, items[idx], { [fm.k]: url })
              onChange(items.slice())
            },
          })
        }
        ub.addEventListener('click', () => doUp(null))
        row.appendChild(inp); row.appendChild(ub)
        wrap.appendChild(row)
        const DZ = window.MagazineAdmin && window.MagazineAdmin.DropZone
        if (DZ) DZ.attach(wrap, { onFile: doUp })
      } else {
        const el = document.createElement(isTA ? 'textarea' : 'input')
        if (!isTA) el.type = 'text'
        el.value = (item && item[fm.k]) || ''
        if (fm.max) el.setAttribute('maxlength', String(fm.max + 20))
        if (isTA) el.rows = fm.rows || 2
        el.addEventListener('input', () => {
          items[idx] = Object.assign({}, items[idx], { [fm.k]: el.value })
          onChange(items.slice())
        })
        wrap.appendChild(el)

        if (fm.max || fm.wordsMin || fm.wordsMax) {
          const c = document.createElement('div')
          c.className = 'slot-counter inline'
          wrap.appendChild(c)
          mountCounter(el, fm, c)
        }
      }
      return wrap
    }

    function move(idx, delta) {
      const j = idx + delta
      if (j < 0 || j >= items.length) return
      const [it] = items.splice(idx, 1)
      items.splice(j, 0, it)
      rebuild()
      onChange(items.slice())
    }

    function remove(idx) {
      items.splice(idx, 1)
      rebuild()
      onChange(items.slice())
    }

    function emptyItem() {
      if (isScalar) return ''
      const obj = {}
      schema.forEach(fm => obj[fm.k] = '')
      return obj
    }

    addBtn.addEventListener('click', () => {
      items.push(emptyItem())
      rebuild()
      onChange(items.slice())
    })

    rebuild()

    return { rebuild, getValue: () => items.slice() }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.Widgets = {
    escapeHtml,
    createFieldWrapper,
    mountTextInput,
    mountTextarea,
    mountImageInput,
    mountListEditor,
    mountCounter,
    openLightbox,
    computeCounterState,
  }
})()
