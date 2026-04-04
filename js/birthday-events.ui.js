/**
 * ClinicAI — Birthday Events
 *
 * Todos os event handlers do modulo de aniversarios.
 * Separado do render para manter arquivos pequenos.
 *
 * Depende de: BirthdayUI, BirthdayTemplatesUI, BirthdayService
 */
;(function () {
  'use strict'
  if (window._clinicaiBirthdayEventsLoaded) return
  window._clinicaiBirthdayEventsLoaded = true

  var _ico = function (n, sz) { return window.BirthdayUI ? window.BirthdayUI.ico(n, sz) : '' }

  function attach() {
    _attachTabs()
    _attachScan()
    _attachSegFilters()
    _attachTemplateActions()
    _attachTemplateForm()
    _attachLivePreview()
  }

  // ── Tab navigation ─────────────────────────────────────────
  function _attachTabs() {
    document.querySelectorAll('.bday-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.BirthdayUI.setState('tab', btn.dataset.tab)
        if (window.BirthdayTemplatesUI) window.BirthdayTemplatesUI.setEditId(null)
        window.BirthdayUI.render()
      })
    })
  }

  // ── Scan button ────────────────────────────────────────────
  function _attachScan() {
    var btn = document.getElementById('bdayScanBtn')
    if (!btn) return
    btn.addEventListener('click', async function () {
      btn.disabled = true
      btn.innerHTML = _ico('loader', 14) + ' Escaneando...'
      var result = await window.BirthdayService.runScan()
      window.BirthdayUI.setState('loading', true)
      window.BirthdayUI.render()
      await window.BirthdayService.loadAll()
      window.BirthdayUI.setState('loading', false)
      window.BirthdayUI.render()

      var msg = result.campaigns_created + ' campanhas criadas'
      if (result.enqueued > 0) msg += ', ' + result.enqueued + ' mensagens enfileiradas'
      _toast(msg, 'success')
    })
  }

  // ── Segment filters ────────────────────────────────────────
  function _attachSegFilters() {
    document.querySelectorAll('.bday-seg-filter').forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.BirthdayUI.setState('segFilter', btn.dataset.seg || null)
        window.BirthdayUI.render()
      })
    })
  }

  // ── Template actions (edit, delete, toggle, add) ───────────
  function _attachTemplateActions() {
    var tmplUI = window.BirthdayTemplatesUI
    if (!tmplUI) return

    // Add new
    var addBtn = document.getElementById('bdayAddTmpl')
    if (addBtn) {
      addBtn.addEventListener('click', function () {
        tmplUI.setEditId('new')
        window.BirthdayUI.render()
      })
    }

    // Edit
    document.querySelectorAll('[data-edit]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        tmplUI.setEditId(btn.dataset.edit)
        window.BirthdayUI.render()
      })
    })

    // Delete
    document.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (!confirm('Remover esta mensagem da sequencia?')) return
        await window.BirthdayService.deleteTemplate(btn.dataset.del)
        window.BirthdayUI.render()
      })
    })

    // Toggle active
    document.querySelectorAll('[data-toggle]').forEach(function (cb) {
      cb.addEventListener('change', async function () {
        await window.BirthdayService.toggleTemplate(cb.dataset.toggle, cb.checked)
        window.BirthdayUI.render()
      })
    })
  }

  // ── Template form (save, cancel) ───────────────────────────
  function _attachTemplateForm() {
    var tmplUI = window.BirthdayTemplatesUI
    if (!tmplUI) return
    var editId = tmplUI.getEditId()
    if (!editId) return

    // Save
    var saveBtn = document.getElementById('bdayTmplSave')
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        var label = (document.getElementById('bdayTmplLabel')?.value || '').trim()
        var content = (document.getElementById('bdayTmplContent')?.value || '').trim()
        var offset = parseInt(document.getElementById('bdayTmplOffset')?.value) || 30
        var hour = parseInt(document.getElementById('bdayTmplHour')?.value) || 10
        var order = parseInt(document.getElementById('bdayTmplOrder')?.value) || 1
        var media = (document.getElementById('bdayTmplMedia')?.value || '').trim()

        if (!label) { _toast('Preencha o titulo', 'error'); return }
        if (!content) { _toast('Preencha a mensagem', 'error'); return }

        saveBtn.disabled = true
        saveBtn.textContent = 'Salvando...'

        await window.BirthdayService.saveTemplate({
          id: editId === 'new' ? null : editId,
          label: label,
          content: content,
          day_offset: offset,
          send_hour: hour,
          sort_order: order,
          media_url: media || null
        })
        tmplUI.setEditId(null)
        window.BirthdayUI.render()
        _toast('Mensagem salva', 'success')
      })
    }

    // Cancel
    var cancelBtn = document.getElementById('bdayTmplCancel')
    if (cancelBtn) {
      cancelBtn.addEventListener('click', function () {
        tmplUI.setEditId(null)
        window.BirthdayUI.render()
      })
    }
  }

  // ── Live preview (textarea → phone preview) ────────────────
  function _attachLivePreview() {
    var textarea = document.getElementById('bdayTmplContent')
    var chat = document.getElementById('bdayPhoneChat')
    if (!textarea || !chat) return

    var previewLead = { name: 'Maria', queixas: 'flacidez e rugas', age_turning: 45, has_open_budget: true, budget_title: 'Lifting 5D', budget_total: 3500 }

    textarea.addEventListener('input', function () {
      var resolved = window.BirthdayService.resolveVariables(textarea.value, previewLead)
      var formatted = window.BirthdayTemplatesUI.waFormat(resolved)
      chat.innerHTML = '<div class="bday-phone-bubble">' + formatted + '</div><div class="bday-phone-time">10:00</div>'
    })
  }

  // ── Toast helper ───────────────────────────────────────────
  function _toast(msg, type) {
    var existing = document.querySelector('.bday-toast')
    if (existing) existing.remove()
    var el = document.createElement('div')
    el.className = 'bday-toast bday-toast-' + (type || 'info')
    el.textContent = msg
    document.body.appendChild(el)
    setTimeout(function () { el.classList.add('bday-toast-show') }, 10)
    setTimeout(function () { el.remove() }, 3000)
  }

  // ── Expose ─────────────────────────────────────────────────
  window.BirthdayEvents = Object.freeze({ attach: attach })
})()
