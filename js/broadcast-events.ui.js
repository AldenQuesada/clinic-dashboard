/**
 * ClinicAI — Broadcast Events (extracted from automations.ui.js)
 *
 * All broadcast event handlers and bindings.
 * Uses BroadcastUI.getState() / setState() for state access.
 * Uses window._clinicaiRender() for re-renders.
 */

;(function () {
  'use strict'

  if (window._clinicaiBroadcastEventsLoaded) return
  window._clinicaiBroadcastEventsLoaded = true

  // ── Shared helper aliases ───────────────────────────────────
  var _esc = function(s) { return window._clinicaiHelpers.esc(s) }
  var _feather = function(n, s) { return window._clinicaiHelpers.feather(n, s) }

  function _render() { window._clinicaiRender() }

  function _showToast(msg, type) {
    if (window._clinicaiHelpers && window._clinicaiHelpers.showToast) window._clinicaiHelpers.showToast(msg, type)
  }

  // ── Event binding ───────────────────────────────────────────

  function _bindBroadcastEvents(root) {
    var st = window.BroadcastUI.getState()

    // New broadcast buttons (stats sidebar + center empty state)
    var newBtns = root.querySelectorAll('#bcNewBtn, #bcNewBtn2')
    newBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        window.BroadcastUI.setState('broadcastForm', window.BroadcastUI.emptyForm())
        window.BroadcastUI.setState('broadcastMode', 'new')
        window.BroadcastUI.setState('broadcastSelected', null)
        window.BroadcastUI.setState('bcPanelOpen', true)
        window.BroadcastUI.setState('bcPanelTab', 'editor')
        window.BroadcastUI.setState('_editingBroadcastId', null)
        _render()
      })
    })

    // Slide panel close button — goes back to history (never fully closes)
    var closeBtn = document.getElementById('bcSlideClose')
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        var curState = window.BroadcastUI.getState()
        if (curState.panelTab === 'editor') {
          window.BroadcastUI.setState('bcPanelTab', 'history')
          window.BroadcastUI.setState('broadcastMode', 'detail')
          if (!curState.selected && curState.broadcasts.length > 0) {
            window.BroadcastUI.setState('broadcastSelected', curState.broadcasts[0].id)
          }
        }
        _render()
      })
    }

    // Slide panel overlay — no action (panel stays open)
    var overlay = document.getElementById('bcSlideOverlay')
    if (overlay) {
      overlay.addEventListener('click', function() {
        // panel stays open — do nothing
      })
    }

    // Delete broadcast — step 1: show confirm
    document.querySelectorAll('.bc-hist-del-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault()
        e.stopPropagation()
        window.BroadcastUI.setState('bcDeleteConfirm', btn.dataset.id)
        _render()
      })
    })

    // Delete broadcast — step 2: confirm yes
    document.querySelectorAll('.bc-hist-del-yes').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.preventDefault()
        e.stopPropagation()
        var id = btn.dataset.id
        window.BroadcastUI.setState('bcDeleteConfirm', null)
        var result = await window.BroadcastService.deleteBroadcast(id)
        if (result && result.ok) {
          _showToast('Disparo removido')
          var curState = window.BroadcastUI.getState()
          if (curState.selected === id) {
            window.BroadcastUI.setState('broadcastSelected', null)
            window.BroadcastUI.setState('broadcastMode', 'detail')
          }
          await window.BroadcastUI.loadBroadcasts()
        } else {
          _showToast(result?.error || 'Erro ao remover', 'error')
          _render()
        }
      })
    })

    // Delete broadcast — step 2: confirm no
    document.querySelectorAll('.bc-hist-del-no').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault()
        e.stopPropagation()
        window.BroadcastUI.setState('bcDeleteConfirm', null)
        _render()
      })
    })

    // Panel tab switching
    root.querySelectorAll('.bc-slide-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tab = btn.dataset.panelTab
        var curState = window.BroadcastUI.getState()
        if (tab && tab !== curState.panelTab) {
          window.BroadcastUI.setState('bcPanelTab', tab)
          _render()
        }
      })
    })

    // History tab item click — show detail in center, panel stays open
    root.querySelectorAll('.bc-hist-item').forEach(function(item) {
      item.addEventListener('click', async function() {
        window.BroadcastUI.setState('broadcastSelected', item.dataset.id)
        window.BroadcastUI.setState('broadcastMode', 'detail')
        window.BroadcastUI.setState('bcStats', null)
        window.BroadcastUI.setState('bcSegment', 'all')
        window.BroadcastUI.setState('bcSegmentLeads', [])
        window.BroadcastUI.setState('bcConfirmSend', false)
        _render()
        // Load stats async
        if (window.BroadcastService && window.BroadcastService.getBroadcastStats) {
          var result = await window.BroadcastService.getBroadcastStats(item.dataset.id)
          if (result && result.ok && result.data) {
            window.BroadcastUI.setState('bcStats', result.data)
            _render()
          }
        }
      })
    })

    // Media upload button → trigger file input
    var uploadBtn = document.getElementById('bcMediaUploadBtn')
    var fileInput = document.getElementById('bcMediaFile')
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', function() { fileInput.click() })
      fileInput.addEventListener('change', async function() {
        if (!fileInput.files || !fileInput.files[0]) return
        var file = fileInput.files[0]
        if (!file.type.startsWith('image/')) {
          _showToast('Selecione um arquivo de imagem', 'error')
          return
        }
        window.BroadcastUI.setState('bcUploading', true)
        uploadBtn.textContent = 'Enviando...'
        uploadBtn.disabled = true
        try {
          var ts = Date.now()
          var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
          var path = 'broadcasts/' + ts + '-' + safeName
          var sbUrl = 'https://oqboitkpcvuaudouwvkl.supabase.co'
          var sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'
          var uploadUrl = sbUrl + '/storage/v1/object/media/' + path
          var resp = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'apikey': sbKey,
              'Authorization': 'Bearer ' + sbKey,
              'Content-Type': file.type,
              'x-upsert': 'true'
            },
            body: file
          })
          if (!resp.ok) throw new Error('Upload falhou: ' + resp.status)
          var publicUrl = sbUrl + '/storage/v1/object/public/media/' + path
          window.BroadcastUI.saveFormFields()
          var curForm = window.BroadcastUI.getState().form
          curForm.media_url = publicUrl
          window.BroadcastUI.setState('broadcastForm', curForm)
          window.BroadcastUI.setState('bcUploading', false)
          _render()
          _showToast('Imagem enviada com sucesso')
        } catch (err) {
          window.BroadcastUI.setState('bcUploading', false)
          _showToast('Erro no upload: ' + err.message, 'error')
          uploadBtn.textContent = 'Enviar imagem'
          uploadBtn.disabled = false
        }
      })
    }

    // Media remove
    var removeMedia = document.getElementById('bcMediaRemove')
    if (removeMedia) {
      removeMedia.addEventListener('click', function() {
        window.BroadcastUI.saveFormFields()
        var curForm = window.BroadcastUI.getState().form
        curForm.media_url = ''
        window.BroadcastUI.setState('broadcastForm', curForm)
        _render()
      })
    }

    // Media position radios
    document.querySelectorAll('input[name="bcMediaPos"]').forEach(function(radio) {
      radio.addEventListener('change', function() {
        var curForm = window.BroadcastUI.getState().form
        curForm.media_position = radio.value
        window.BroadcastUI.setState('broadcastForm', curForm)
      })
    })

    // Schedule mode radios
    document.querySelectorAll('input[name="bcScheduleMode"]').forEach(function(radio) {
      radio.addEventListener('change', function() {
        var schedInput = document.getElementById('bcScheduleAt')
        if (schedInput) {
          schedInput.disabled = (radio.value === 'now')
          if (radio.value === 'now') schedInput.value = ''
        }
      })
    })

    // Real-time phone preview binding
    var contentEl = root.querySelector('#bcContent')
    if (contentEl) {
      contentEl.addEventListener('input', function() {
        var curForm = window.BroadcastUI.getState().form
        curForm.content = contentEl.value
        window.BroadcastUI.setState('broadcastForm', curForm)
        window.BroadcastUI.updatePhonePreview(contentEl.value)
      })
    }

    // Tag insert buttons
    root.querySelectorAll('.bc-tag-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var textarea = document.getElementById('bcContent')
        if (!textarea) return
        var tag = btn.dataset.tag
        var start = textarea.selectionStart
        var end = textarea.selectionEnd
        var text = textarea.value
        textarea.value = text.substring(0, start) + tag + text.substring(end)
        textarea.selectionStart = textarea.selectionEnd = start + tag.length
        textarea.focus()
        var curForm = window.BroadcastUI.getState().form
        curForm.content = textarea.value
        window.BroadcastUI.setState('broadcastForm', curForm)
        window.BroadcastUI.updatePhonePreview(textarea.value)
      })
    })

    // Emoji picker toggle + insert
    var emojiToggle = document.getElementById('bcEmojiToggle')
    var emojiPicker = document.getElementById('bcEmojiPicker')
    if (emojiToggle && emojiPicker) {
      emojiToggle.addEventListener('click', function(e) {
        e.stopPropagation()
        emojiPicker.classList.toggle('open')
      })
      document.addEventListener('click', function() { emojiPicker.classList.remove('open') }, { once: true })
    }
    document.querySelectorAll('.bc-emoji-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation()
        var textarea = document.getElementById('bcContent')
        if (!textarea) return
        var emoji = btn.dataset.emoji
        var text = textarea.value
        var start = textarea === document.activeElement ? textarea.selectionStart : text.length
        textarea.value = text.substring(0, start) + emoji + text.substring(start)
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length
        textarea.focus()
        var curForm = window.BroadcastUI.getState().form
        curForm.content = textarea.value
        window.BroadcastUI.setState('broadcastForm', curForm)
        window.BroadcastUI.updatePhonePreview(textarea.value)
        if (emojiPicker) emojiPicker.classList.remove('open')
      })
    })

    // Format buttons (bold, italic, strikethrough, mono) — exclude emoji toggle
    document.querySelectorAll('.bc-fmt-btn[data-wrap]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var textarea = document.getElementById('bcContent')
        if (!textarea) return
        var wrap = btn.dataset.wrap
        var start = textarea.selectionStart
        var end = textarea.selectionEnd
        var text = textarea.value
        var rawSelected = text.substring(start, end)
        // Trim selection — format only the actual text, not surrounding spaces
        var trimStart = 0
        var trimEnd = rawSelected.length
        while (trimStart < trimEnd && rawSelected[trimStart] === ' ') trimStart++
        while (trimEnd > trimStart && rawSelected[trimEnd - 1] === ' ') trimEnd--
        var selected = rawSelected.substring(trimStart, trimEnd)
        start = start + trimStart
        end = start + selected.length
        if (selected) {
          // Toggle: if already wrapped, remove; otherwise add
          var alreadyWrapped = selected.length >= wrap.length * 2
            && selected.substring(0, wrap.length) === wrap
            && selected.substring(selected.length - wrap.length) === wrap
          // Also check if the surrounding text has the wrap
          var outerWrapped = start >= wrap.length
            && text.substring(start - wrap.length, start) === wrap
            && text.substring(end, end + wrap.length) === wrap
          if (alreadyWrapped) {
            // Remove inner wrap
            var unwrapped = selected.substring(wrap.length, selected.length - wrap.length)
            textarea.value = text.substring(0, start) + unwrapped + text.substring(end)
            textarea.selectionStart = start
            textarea.selectionEnd = start + unwrapped.length
          } else if (outerWrapped) {
            // Remove outer wrap
            textarea.value = text.substring(0, start - wrap.length) + selected + text.substring(end + wrap.length)
            textarea.selectionStart = start - wrap.length
            textarea.selectionEnd = end - wrap.length
          } else {
            // Add wrap
            textarea.value = text.substring(0, start) + wrap + selected + wrap + text.substring(end)
            textarea.selectionStart = start
            textarea.selectionEnd = end + (wrap.length * 2)
          }
        } else {
          textarea.value = text.substring(0, start) + wrap + wrap + text.substring(end)
          textarea.selectionStart = textarea.selectionEnd = start + wrap.length
        }
        textarea.focus()
        var curForm = window.BroadcastUI.getState().form
        curForm.content = textarea.value
        window.BroadcastUI.setState('broadcastForm', curForm)
        window.BroadcastUI.updatePhonePreview(textarea.value)
      })
    })

    // Lead search + select
    var searchInput = document.getElementById('bcLeadSearch')
    var dropdown = document.getElementById('bcLeadDropdown')
    var _searchTimeout = null

    if (searchInput && dropdown) {
      searchInput.addEventListener('input', function() {
        clearTimeout(_searchTimeout)
        var q = searchInput.value.trim().toLowerCase()
        if (q.length < 2) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return }
        _searchTimeout = setTimeout(async function() {
          var allLeads = []
          if (window.LeadsService) allLeads = await window.LeadsService.loadAll()
          var curForm = window.BroadcastUI.getState().form
          var selectedIds = curForm.selected_leads.map(function(l) { return l.id })
          var matches = allLeads.filter(function(l) {
            var lName = l.name || l.nome || ''
            if (!lName || selectedIds.indexOf(l.id) !== -1) return false
            return lName.toLowerCase().indexOf(q) !== -1
          }).slice(0, 8)

          if (matches.length === 0) {
            dropdown.innerHTML = '<div class="bc-lead-option bc-lead-empty">Nenhum lead encontrado</div>'
          } else {
            dropdown.innerHTML = matches.map(function(l) {
              var lName = l.name || l.nome || ''
              var phone = l.phone || l.whatsapp || l.telefone || ''
              return '<div class="bc-lead-option" data-id="' + _esc(l.id) + '" data-nome="' + _esc(lName) + '" data-phone="' + _esc(phone) + '">'
                + '<span class="bc-lead-opt-name">' + _esc(lName) + '</span>'
                + (phone ? '<span class="bc-lead-opt-phone">' + _esc(phone) + '</span>' : '')
                + '</div>'
            }).join('')
          }
          dropdown.style.display = 'block'
        }, 200)
      })

      searchInput.addEventListener('blur', function() {
        setTimeout(function() { dropdown.style.display = 'none' }, 200)
      })

      dropdown.addEventListener('mousedown', function(e) {
        var opt = e.target.closest('.bc-lead-option')
        if (!opt || opt.classList.contains('bc-lead-empty')) return
        e.preventDefault()
        window.BroadcastUI.saveFormFields()
        var curForm = window.BroadcastUI.getState().form
        curForm.selected_leads.push({
          id: opt.dataset.id,
          nome: opt.dataset.nome,
          phone: opt.dataset.phone
        })
        window.BroadcastUI.setState('broadcastForm', curForm)
        searchInput.value = ''
        dropdown.style.display = 'none'
        _render()
      })
    }

    // Remove lead chip
    document.querySelectorAll('.bc-chip-remove').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.id
        window.BroadcastUI.saveFormFields()
        var curForm = window.BroadcastUI.getState().form
        curForm.selected_leads = curForm.selected_leads.filter(function(l) { return l.id !== id })
        window.BroadcastUI.setState('broadcastForm', curForm)
        _render()
      })
    })

    // Cancel form
    var cancelForm = document.getElementById('bcCancelForm')
    if (cancelForm) {
      cancelForm.addEventListener('click', function() {
        var curState = window.BroadcastUI.getState()
        window.BroadcastUI.setState('bcPanelTab', 'history')
        window.BroadcastUI.setState('broadcastMode', 'detail')
        if (!curState.selected && curState.broadcasts.length > 0) {
          window.BroadcastUI.setState('broadcastSelected', curState.broadcasts[0].id)
        }
        _render()
      })
    }

    // Save
    var saveBtn = document.getElementById('bcSaveBtn')
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        window.BroadcastUI.saveFormFields()
        var curForm = window.BroadcastUI.getState().form
        var name = curForm.name || ''
        var content = curForm.content || ''
        var mediaUrl = curForm.media_url || ''
        var mediaPosition = curForm.media_position || 'above'
        var filterPhase = (document.getElementById('bcFilterPhase') || {}).value || ''
        var filterTemp = (document.getElementById('bcFilterTemp') || {}).value || ''
        var filterFunnel = (document.getElementById('bcFilterFunnel') || {}).value || ''
        var filterSource = (document.getElementById('bcFilterSource') || {}).value || ''
        var batchSize = parseInt((document.getElementById('bcBatchSize') || {}).value) || 10
        var batchInterval = parseInt((document.getElementById('bcBatchInterval') || {}).value) || 10

        if (!name.trim() || !content.trim()) {
          _showToast('Nome e mensagem sao obrigatorios', 'error')
          return
        }

        var filter = {}
        if (filterPhase) filter.phase = filterPhase
        if (filterTemp) filter.temperature = filterTemp
        if (filterFunnel) filter.funnel = filterFunnel
        if (filterSource) filter.source_type = filterSource

        window.BroadcastUI.setState('broadcastSaving', true)
        _render()

        var editId = window.BroadcastUI.getState().editingId
        var saveData = {
          name: name.trim(),
          content: content.trim(),
          media_url: mediaUrl.trim() || null,
          media_caption: null,
          media_position: mediaPosition,
          target_filter: filter,
          batch_size: batchSize,
          batch_interval_min: batchInterval,
          selected_lead_ids: curForm.selected_leads.map(function(l) { return l.id }),
          scheduled_at: curForm.scheduled_at ? new Date(curForm.scheduled_at).toISOString() : null,
        }

        var result
        if (editId) {
          result = await window.BroadcastService.updateBroadcast(editId, saveData)
        } else {
          result = await window.BroadcastService.createBroadcast(saveData)
        }

        window.BroadcastUI.setState('broadcastSaving', false)

        if (result && result.ok) {
          var hasSchedule = curForm.scheduled_at && curForm.scheduled_at.length > 0
          _showToast(editId ? 'Disparo atualizado!' : 'Disparo criado! ' + (result.data?.total_targets || 0) + ' destinatarios encontrados')
          window.BroadcastUI.setState('broadcastSelected', editId || result.data?.id || null)
          window.BroadcastUI.setState('broadcastMode', 'detail')
          window.BroadcastUI.setState('bcPanelTab', hasSchedule ? 'scheduled' : 'history')
          window.BroadcastUI.setState('_editingBroadcastId', null)
          await window.BroadcastUI.loadBroadcasts()
        } else {
          _showToast(result?.error || 'Erro ao salvar disparo', 'error')
          _render()
        }
      })
    }

    // Segment click — load leads for that segment
    document.querySelectorAll('.bc-seg-item[data-seg]').forEach(function(item) {
      item.addEventListener('click', async function() {
        var seg = item.dataset.seg
        window.BroadcastUI.setState('bcSegment', seg)
        window.BroadcastUI.setState('bcSegmentLeads', [])
        _render()
        var curState = window.BroadcastUI.getState()
        if (window.BroadcastService && window.BroadcastService.getBroadcastLeads && curState.selected) {
          var result = await window.BroadcastService.getBroadcastLeads(curState.selected, seg)
          if (result && result.ok && Array.isArray(result.data)) {
            window.BroadcastUI.setState('bcSegmentLeads', result.data)
          }
          _render()
        }
      })
    })

    // Edit button — load broadcast data into form
    document.querySelectorAll('.bc-edit-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.id
        var broadcasts = window.BroadcastUI.getState().broadcasts
        var b = broadcasts.find(function(x) { return x.id === id })
        if (!b) return

        // Populate form with broadcast data
        var form = {
          name: b.name || '',
          content: b.content || '',
          media_url: b.media_url || '',
          media_caption: b.media_caption || '',
          media_position: b.media_position || 'above',
          filter_phase: (b.target_filter && b.target_filter.phase) || '',
          filter_temperature: (b.target_filter && b.target_filter.temperature) || '',
          filter_funnel: (b.target_filter && b.target_filter.funnel) || '',
          filter_source: (b.target_filter && b.target_filter.source_type) || '',
          batch_size: b.batch_size || 10,
          batch_interval_min: b.batch_interval_min || 10,
          selected_leads: [],
          scheduled_at: b.scheduled_at ? new Date(new Date(b.scheduled_at).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().substring(0, 16) : '',
        }

        window.BroadcastUI.setState('broadcastForm', form)
        window.BroadcastUI.setState('broadcastMode', 'new')
        window.BroadcastUI.setState('bcPanelTab', 'editor')
        window.BroadcastUI.setState('_editingBroadcastId', id)
        _render()
      })
    })

    // Clone from history list
    document.querySelectorAll('.bc-hist-clone-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault()
        e.stopPropagation()
        var id = btn.dataset.id
        var broadcasts = window.BroadcastUI.getState().broadcasts
        var b = broadcasts.find(function(x) { return x.id === id })
        if (!b) return
        var form = {
          name: (b.name || '') + ' (copia)',
          content: b.content || '',
          media_url: b.media_url || '',
          media_caption: b.media_caption || '',
          media_position: b.media_position || 'above',
          filter_phase: (b.target_filter && b.target_filter.phase) || '',
          filter_temperature: (b.target_filter && b.target_filter.temperature) || '',
          filter_funnel: (b.target_filter && b.target_filter.funnel) || '',
          filter_source: (b.target_filter && b.target_filter.source_type) || '',
          batch_size: b.batch_size || 10,
          batch_interval_min: b.batch_interval_min || 10,
          selected_leads: [],
          scheduled_at: '',
        }
        window.BroadcastUI.setState('broadcastForm', form)
        window.BroadcastUI.setState('broadcastMode', 'new')
        window.BroadcastUI.setState('bcPanelTab', 'editor')
        window.BroadcastUI.setState('_editingBroadcastId', null)
        _render()
      })
    })

    // Pre-send button — show checklist
    document.querySelectorAll('.bc-presend-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        window.BroadcastUI.setState('bcConfirmSend', true)
        _render()
      })
    })

    // Confirm cancel
    document.querySelectorAll('.bc-confirm-no').forEach(function(btn) {
      btn.addEventListener('click', function() {
        window.BroadcastUI.setState('bcConfirmSend', false)
        _render()
      })
    })

    // Clone from detail
    document.querySelectorAll('.bc-clone-detail-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.id
        var broadcasts = window.BroadcastUI.getState().broadcasts
        var b = broadcasts.find(function(x) { return x.id === id })
        if (!b) return
        var form = {
          name: (b.name || '') + ' (copia)',
          content: b.content || '',
          media_url: b.media_url || '',
          media_caption: b.media_caption || '',
          media_position: b.media_position || 'above',
          filter_phase: (b.target_filter && b.target_filter.phase) || '',
          filter_temperature: (b.target_filter && b.target_filter.temperature) || '',
          filter_funnel: (b.target_filter && b.target_filter.funnel) || '',
          filter_source: (b.target_filter && b.target_filter.source_type) || '',
          batch_size: b.batch_size || 10,
          batch_interval_min: b.batch_interval_min || 10,
          selected_leads: [],
          scheduled_at: '',
        }
        window.BroadcastUI.setState('broadcastForm', form)
        window.BroadcastUI.setState('broadcastMode', 'new')
        window.BroadcastUI.setState('bcPanelTab', 'editor')
        window.BroadcastUI.setState('_editingBroadcastId', null)
        _render()
      })
    })

    // Start buttons
    root.querySelectorAll('.bc-start-btn').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.dataset.id
        var targets = parseInt(btn.dataset.targets) || 0
        if (targets === 0) {
          _showToast('Nenhum destinatario encontrado para este filtro', 'error')
          return
        }
        if (!confirm('Iniciar disparo para ' + targets + ' destinatarios?')) return
        btn.disabled = true
        btn.textContent = 'Iniciando...'
        var result = await window.BroadcastService.startBroadcast(id)
        if (result && result.ok) {
          var est = result.data?.estimated_minutes || 0
          var schedFor = result.data?.scheduled_for
          var msg = 'Disparo iniciado! ' + (result.data?.enqueued || 0) + ' msgs'
          if (schedFor && new Date(schedFor) > new Date(Date.now() + 60000)) {
            msg += ' — agendado para ' + new Date(schedFor).toLocaleString('pt-BR')
          } else if (est > 0) {
            msg += ' (~' + est + 'min para concluir)'
          }
          _showToast(msg)
          await window.BroadcastUI.loadBroadcasts()
        } else {
          _showToast(result?.error || 'Erro ao iniciar', 'error')
          _render()
        }
      })
    })

    // Cancel buttons
    root.querySelectorAll('.bc-cancel-btn').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.dataset.id
        if (!confirm('Cancelar este disparo? Mensagens pendentes serao removidas.')) return
        btn.disabled = true
        btn.textContent = 'Cancelando...'
        var result = await window.BroadcastService.cancelBroadcast(id)
        if (result && result.ok) {
          _showToast('Disparo cancelado. ' + (result.data?.removed_from_outbox || 0) + ' mensagens removidas')
          await window.BroadcastUI.loadBroadcasts()
        } else {
          _showToast(result?.error || 'Erro ao cancelar', 'error')
          _render()
        }
      })
    })

    // Dashboard period filter buttons
    document.querySelectorAll('.bc-dash-filter').forEach(function(btn) {
      btn.addEventListener('click', function() {
        window.BroadcastDashboard.setState('bcDashPeriod', btn.dataset.period)
        _render()
      })
    })

    // Dashboard metric tabs
    document.querySelectorAll('.bc-dash-metric-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        window.BroadcastDashboard.setState('bcDashMetric', btn.dataset.metric)
        _render()
      })
    })

    // Dashboard sort select
    var dashSort = document.getElementById('bcDashSort')
    if (dashSort) {
      dashSort.addEventListener('change', function() {
        window.BroadcastDashboard.setState('bcDashSort', dashSort.value)
        _render()
      })
    }
  }

  // ── Expose ──────────────────────────────────────────────────

  window.BroadcastEvents = Object.freeze({
    bind: _bindBroadcastEvents
  })

})()
