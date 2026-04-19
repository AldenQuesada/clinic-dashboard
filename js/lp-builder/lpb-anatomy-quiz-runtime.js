/**
 * LP Builder · Anatomy Quiz Runtime (Onda 29)
 *
 * Interatividade do bloco anatomy-quiz · separada do renderer puro:
 *   · Click/keyboard nos hotspots → toggle .is-selected
 *   · Pills do painel sincronizam em tempo real
 *   · Botão "Ver meu protocolo" abre modal overlay com form WA
 *   · Submit chama RPC lp_lead_submit_v2 com payload anatomy{} rico
 *   · Cooldown 24h previne spam (mesmo visitor, mesmo navegador)
 *   · Tracking granular: quiz_area_marked / unmarked / view_protocol_clicked / completed
 *
 * Defesas:
 *   · LPBEngagement ausente → fallback console.log
 *   · RPC falha → toast vermelho · form mantém aberto pra retry
 *   · Validação BR no telefone (regex flexível)
 *   · Cooldown não bloqueia UX, só evita re-submit (mostra success direto)
 *
 *   LPBAnatomyQuizRuntime.bind(rootEl)  → ativa todos quizzes dentro do root
 */
;(function () {
  'use strict'
  if (window.LPBAnatomyQuizRuntime) return

  var COOLDOWN_KEY = 'aq_lead_submitted'
  var COOLDOWN_HOURS = 24
  var PHONE_RE_BR = /^(?:\+?55\s?)?(?:\(?\d{2}\)?\s?)?9?\d{4}[-\s]?\d{4}$/

  // ──────────────────────────────────────────────────────────
  // Helpers
  // ──────────────────────────────────────────────────────────
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function _track(event, payload) {
    try {
      if (window.LPBEngagement && LPBEngagement.track) {
        LPBEngagement.track(event, payload || {})
        return
      }
    } catch (_) {}
    // fallback silencioso
    try { console.log('[anatomy-quiz]', event, payload || {}) } catch (_) {}
  }

  function _getRpc() {
    try {
      if (window.LPBEngagement && LPBEngagement.getRpc) {
        return LPBEngagement.getRpc()
      }
    } catch (_) {}
    return null
  }

  function _getSlug() {
    try {
      if (window.LPBEngagement && LPBEngagement.getSlug) {
        return LPBEngagement.getSlug()
      }
    } catch (_) {}
    return null
  }

  function _getUtms() {
    try {
      if (window.LPShared && LPShared.getUTMs) return LPShared.getUTMs() || {}
    } catch (_) {}
    return {}
  }

  function _normalizePhone(raw) {
    if (!raw) return ''
    return String(raw).replace(/\D/g, '')
  }

  function _validPhoneBR(raw) {
    if (!raw) return false
    var d = _normalizePhone(raw)
    // 10-13 dígitos · cobre celular/fixo com ou sem DDI
    return d.length >= 10 && d.length <= 13 && PHONE_RE_BR.test(String(raw).trim())
  }

  // Cooldown · usa LPBEngagement se disponível, senão localStorage direto
  function _cooldownActive(key) {
    try {
      if (window.LPBEngagement && LPBEngagement.cooldownActive) {
        return LPBEngagement.cooldownActive(key, COOLDOWN_HOURS)
      }
      var raw = localStorage.getItem('lpb_eng_cd::' + key)
      if (!raw) return false
      var ts = parseInt(raw, 10)
      if (!ts) return false
      return (Date.now() - ts) < (COOLDOWN_HOURS * 3600 * 1000)
    } catch (_) { return false }
  }

  function _markCooldown(key) {
    try {
      if (window.LPBEngagement && LPBEngagement.markCooldown) {
        LPBEngagement.markCooldown(key)
        return
      }
      localStorage.setItem('lpb_eng_cd::' + key, String(Date.now()))
    } catch (_) {}
  }

  // ──────────────────────────────────────────────────────────
  // Toast simples (autonomo · não depende do LPBToast do builder)
  // ──────────────────────────────────────────────────────────
  function _toast(msg, kind) {
    try {
      var existing = document.querySelector('.aq-toast')
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing)
      var t = document.createElement('div')
      t.className = 'aq-toast' + (kind === 'error' ? ' is-error' : '')
      t.setAttribute('role', 'status')
      t.textContent = msg || ''
      document.body.appendChild(t)
      setTimeout(function () {
        if (t.parentNode) t.parentNode.removeChild(t)
      }, 3500)
    } catch (_) {}
  }

  // ──────────────────────────────────────────────────────────
  // Estado por quiz (cada section.blk-aq tem seu Set de áreas)
  // WeakMap evita leak quando o root sai do DOM
  // ──────────────────────────────────────────────────────────
  var _stateMap = typeof WeakMap === 'function' ? new WeakMap() : null

  function _getState(rootEl) {
    if (_stateMap) {
      var s = _stateMap.get(rootEl)
      if (!s) { s = { selected: [] }; _stateMap.set(rootEl, s) }
      return s
    }
    rootEl.__aqState = rootEl.__aqState || { selected: [] }
    return rootEl.__aqState
  }

  function _getAreasMap(rootEl) {
    try {
      var raw = rootEl.getAttribute('data-areas') || '{}'
      return JSON.parse(raw)
    } catch (_) { return {} }
  }

  // ──────────────────────────────────────────────────────────
  // Pills do painel · sincroniza com o estado
  // ──────────────────────────────────────────────────────────
  function _renderPills(rootEl) {
    var state = _getState(rootEl)
    var areasMap = _getAreasMap(rootEl)
    var pillsEl = rootEl.querySelector('[data-aq-pills]')
    var counterEl = rootEl.querySelector('[data-aq-counter]')
    if (!pillsEl) return

    if (!state.selected.length) {
      pillsEl.innerHTML = '<li class="blk-aq-empty">' +
        '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>' +
          '<circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>' +
        '</svg>' +
        '<span>Comece marcando uma área no rosto…</span></li>'
      if (counterEl) { counterEl.hidden = true; counterEl.textContent = '0 áreas marcadas' }
      return
    }

    var html = ''
    state.selected.forEach(function (key) {
      var meta = areasMap[key] || { label: key, protocol: '' }
      html += '<li class="blk-aq-pill" data-area="' + _esc(key) + '">' +
        '<span class="blk-aq-pill-dot" aria-hidden="true"></span>' +
        '<span class="blk-aq-pill-label">' + _esc(meta.label) + '</span>' +
        (meta.protocol ? '<span class="blk-aq-pill-protocol">' + _esc(meta.protocol) + '</span>' : '') +
        '<button type="button" class="blk-aq-pill-x" data-aq-remove="' + _esc(key) + '" aria-label="Remover ' + _esc(meta.label) + '">' +
          '<svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true">' +
            '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
          '</svg>' +
        '</button>' +
      '</li>'
    })
    pillsEl.innerHTML = html

    if (counterEl) {
      var n = state.selected.length
      counterEl.hidden = false
      counterEl.textContent = n + (n === 1 ? ' área marcada' : ' áreas marcadas')
    }
  }

  // ──────────────────────────────────────────────────────────
  // Toggle de hotspot
  // ──────────────────────────────────────────────────────────
  function _syncHotspots(rootEl) {
    var state = _getState(rootEl)
    var sel = state.selected
    var spots = rootEl.querySelectorAll('.aq-hotspot')
    Array.prototype.forEach.call(spots, function (g) {
      var area = g.getAttribute('data-area')
      var on = sel.indexOf(area) >= 0
      g.classList.toggle('is-selected', on)
      g.setAttribute('aria-pressed', on ? 'true' : 'false')
    })
  }

  function _toggleArea(rootEl, area) {
    if (!area) return
    var state = _getState(rootEl)
    var idx = state.selected.indexOf(area)
    if (idx >= 0) {
      state.selected.splice(idx, 1)
      _track('quiz_area_unmarked', { area: area, total: state.selected.length })
    } else {
      state.selected.push(area)
      _track('quiz_area_marked', { area: area, total: state.selected.length })
    }
    _syncHotspots(rootEl)
    _renderPills(rootEl)
  }

  // ──────────────────────────────────────────────────────────
  // Modal overlay (criado dinamicamente · evita poluir DOM até abrir)
  // ──────────────────────────────────────────────────────────
  function _buildModal(rootEl) {
    var state = _getState(rootEl)
    var areasMap = _getAreasMap(rootEl)
    var successText = rootEl.getAttribute('data-success') || 'Recebemos. A Dra. Mirian vai entrar em contato em breve.'

    var overlay = document.createElement('div')
    overlay.className = 'blk-aq-overlay'
    overlay.setAttribute('role', 'dialog')
    overlay.setAttribute('aria-modal', 'true')
    overlay.setAttribute('aria-label', 'Receba seu protocolo personalizado')

    var sumHtml = ''
    if (state.selected.length) {
      sumHtml = '<ul class="blk-aq-modal-sum">'
      state.selected.forEach(function (k) {
        var m = areasMap[k] || { label: k }
        sumHtml += '<li>' + _esc(m.label) + '</li>'
      })
      sumHtml += '</ul>'
    }

    overlay.innerHTML =
      '<div class="blk-aq-modal" data-aq-modal="1">' +
        '<button type="button" class="blk-aq-modal-x" data-aq-close="1" aria-label="Fechar">' +
          '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true">' +
            '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>' +
          '</svg>' +
        '</button>' +
        '<div class="blk-aq-modal-eyebrow">Protocolo Mirian</div>' +
        '<h3 class="blk-aq-modal-title">Quase lá</h3>' +
        '<p class="blk-aq-modal-sub">Deixe seu WhatsApp e a Dra. Mirian envia seu protocolo personalizado.</p>' +
        (sumHtml ? '<div class="blk-aq-modal-block"><div class="blk-aq-modal-block-label">Áreas que você marcou</div>' + sumHtml + '</div>' : '') +
        '<form class="blk-aq-form" novalidate>' +
          '<label class="blk-aq-field">' +
            '<span class="blk-aq-field-label">Nome <em>(opcional)</em></span>' +
            '<input type="text" name="name" autocomplete="name" maxlength="80" class="blk-aq-input">' +
          '</label>' +
          '<label class="blk-aq-field">' +
            '<span class="blk-aq-field-label">WhatsApp <em>*</em></span>' +
            '<input type="tel" name="phone" required inputmode="tel" autocomplete="tel" maxlength="20" placeholder="(44) 9 9999-9999" class="blk-aq-input">' +
            '<span class="blk-aq-field-error" hidden>Digite um WhatsApp válido com DDD.</span>' +
          '</label>' +
          '<button type="submit" class="blk-aq-submit">Receber meu protocolo</button>' +
          '<p class="blk-aq-form-msg" hidden></p>' +
        '</form>' +
        '<div class="blk-aq-success" hidden>' +
          '<div class="blk-aq-success-icon">' +
            '<svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
              '<polyline points="20 6 9 17 4 12"/>' +
            '</svg>' +
          '</div>' +
          '<div class="blk-aq-success-text">' + _esc(successText) + '</div>' +
        '</div>' +
      '</div>'
    return overlay
  }

  function _openModal(rootEl) {
    if (!rootEl._aqModalOpen) {
      var state = _getState(rootEl)
      _track('quiz_view_protocol_clicked', {
        areas: state.selected.slice(),
        total: state.selected.length,
      })

      var overlay = _buildModal(rootEl)
      document.body.appendChild(overlay)
      rootEl._aqModalEl = overlay
      rootEl._aqModalOpen = true
      // animação fade-in
      requestAnimationFrame(function () { overlay.classList.add('is-visible') })

      // Cooldown ativo? mostra success direto
      if (_cooldownActive(COOLDOWN_KEY)) {
        _showSuccess(overlay, '\u00a0Você já enviou recentemente. Aguarde o contato da Dra. Mirian.')
      } else {
        // foco no input principal
        var ph = overlay.querySelector('input[name="phone"]')
        if (ph) try { ph.focus({ preventScroll: false }) } catch (_) { ph.focus() }
      }

      _bindModal(rootEl, overlay)
    }
  }

  function _closeModal(rootEl) {
    var overlay = rootEl._aqModalEl
    if (!overlay) return
    overlay.classList.remove('is-visible')
    setTimeout(function () {
      if (overlay.parentNode) overlay.parentNode.removeChild(overlay)
      rootEl._aqModalEl = null
      rootEl._aqModalOpen = false
    }, 220)
  }

  function _showSuccess(overlay, customText) {
    var form = overlay.querySelector('.blk-aq-form')
    var sum  = overlay.querySelector('.blk-aq-modal-block')
    var sub  = overlay.querySelector('.blk-aq-modal-sub')
    var ok   = overlay.querySelector('.blk-aq-success')
    if (form) form.style.display = 'none'
    if (sum)  sum.style.display = 'none'
    if (sub)  sub.style.display = 'none'
    if (ok) {
      ok.hidden = false
      if (customText) {
        var txt = ok.querySelector('.blk-aq-success-text')
        if (txt) txt.textContent = customText
      }
    }
  }

  function _bindModal(rootEl, overlay) {
    var form = overlay.querySelector('.blk-aq-form')
    var phoneInput = overlay.querySelector('input[name="phone"]')
    var nameInput  = overlay.querySelector('input[name="name"]')
    var errEl      = overlay.querySelector('.blk-aq-field-error')
    var msgEl      = overlay.querySelector('.blk-aq-form-msg')
    var submitBtn  = overlay.querySelector('.blk-aq-submit')

    // Fecha modal: backdrop click + botão X + ESC
    overlay.addEventListener('click', function (e) {
      if (e.target === overlay) _closeModal(rootEl)
      var x = e.target.closest && e.target.closest('[data-aq-close]')
      if (x) _closeModal(rootEl)
    })
    document.addEventListener('keydown', function escHandler(e) {
      if (e.key === 'Escape' && rootEl._aqModalOpen) {
        _closeModal(rootEl)
        document.removeEventListener('keydown', escHandler)
      }
    })

    if (!form) return

    // Validação onBlur do telefone
    if (phoneInput) {
      phoneInput.addEventListener('blur', function () {
        var v = phoneInput.value.trim()
        if (v && !_validPhoneBR(v)) {
          if (errEl) errEl.hidden = false
          phoneInput.classList.add('is-error')
        } else {
          if (errEl) errEl.hidden = true
          phoneInput.classList.remove('is-error')
        }
      })
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault()

      var phone = phoneInput ? phoneInput.value.trim() : ''
      var name  = nameInput  ? nameInput.value.trim()  : ''

      if (!_validPhoneBR(phone)) {
        if (errEl) errEl.hidden = false
        if (phoneInput) {
          phoneInput.classList.add('is-error')
          try { phoneInput.focus() } catch (_) {}
        }
        return
      }

      var state = _getState(rootEl)
      var priority = state.selected[0] || null

      var payload = {
        p_slug: _getSlug(),
        p_data: {
          phone: _normalizePhone(phone),
          phone_raw: phone,
          name: name || null,
          anatomy: {
            areas: state.selected.slice(),
            priority: priority,
            count: state.selected.length,
          },
          source: 'anatomy_quiz',
        },
        p_utm: _getUtms(),
      }

      var rpc = _getRpc()

      if (submitBtn) {
        submitBtn.disabled = true
        submitBtn._oldText = submitBtn.textContent
        submitBtn.textContent = 'Enviando…'
      }
      if (msgEl) msgEl.hidden = true

      var promise = rpc
        ? rpc('lp_lead_submit_v2', payload)
        : Promise.reject(new Error('rpc-unavailable'))

      promise.then(function () {
        _markCooldown(COOLDOWN_KEY)
        _track('quiz_completed', {
          areas: state.selected.slice(),
          priority: priority,
          count: state.selected.length,
          has_name: !!name,
        })
        _showSuccess(overlay)
      }).catch(function (err) {
        if (submitBtn) {
          submitBtn.disabled = false
          submitBtn.textContent = submitBtn._oldText || 'Receber meu protocolo'
        }
        if (msgEl) {
          msgEl.hidden = false
          msgEl.textContent = 'Não conseguimos enviar agora. Tente novamente em instantes.'
        }
        _toast('Erro ao enviar. Tente novamente.', 'error')
        try { console.warn('[anatomy-quiz] submit erro:', err) } catch (_) {}
      })
    })
  }

  // ──────────────────────────────────────────────────────────
  // Bind por root (idempotente · usa data-aq-bound)
  // ──────────────────────────────────────────────────────────
  function _bindRoot(rootEl) {
    if (!rootEl || rootEl.getAttribute('data-aq-bound') === '1') return
    rootEl.setAttribute('data-aq-bound', '1')

    // Click delegado · cobre hotspots, CTA e remove-pill
    rootEl.addEventListener('click', function (e) {
      var spot = e.target.closest && e.target.closest('.aq-hotspot')
      if (spot && rootEl.contains(spot)) {
        e.preventDefault()
        _toggleArea(rootEl, spot.getAttribute('data-area'))
        return
      }
      var cta = e.target.closest && e.target.closest('[data-aq-cta]')
      if (cta && rootEl.contains(cta)) {
        e.preventDefault()
        _openModal(rootEl)
        return
      }
      var rm = e.target.closest && e.target.closest('[data-aq-remove]')
      if (rm && rootEl.contains(rm)) {
        e.preventDefault()
        _toggleArea(rootEl, rm.getAttribute('data-aq-remove'))
        return
      }
      // Onda 30: toggle antes/depois das fotos
      var tog = e.target.closest && e.target.closest('[data-aq-toggle]')
      if (tog && rootEl.contains(tog)) {
        e.preventDefault()
        var wrap = rootEl.querySelector('[data-aq-photo-wrap]')
        if (!wrap) return
        var before = wrap.querySelector('.blk-aq-photo-before')
        var label  = tog.querySelector('[data-aq-tog-label]')
        if (!before) return
        var showing = before.style.opacity === '1'
        if (showing) {
          before.style.opacity = '0'
          if (label) label.textContent = 'Ver antes'
        } else {
          before.style.opacity = '1'
          if (label) label.textContent = 'Ver depois'
        }
        return
      }
    })

    // Acessibilidade: Enter/Space no hotspot
    rootEl.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== ' ') return
      var spot = e.target.closest && e.target.closest('.aq-hotspot')
      if (spot && rootEl.contains(spot)) {
        e.preventDefault()
        _toggleArea(rootEl, spot.getAttribute('data-area'))
      }
    })

    // Sync inicial (caso o estado venha pré-populado em iteração futura)
    _syncHotspots(rootEl)
    _renderPills(rootEl)
  }

  function bind(rootEl) {
    var scope = rootEl || document
    try {
      var roots = scope.querySelectorAll('[data-aq-root="1"]')
      Array.prototype.forEach.call(roots, _bindRoot)
    } catch (e) {
      try { console.warn('[anatomy-quiz] bind erro:', e) } catch (_) {}
    }
  }

  window.LPBAnatomyQuizRuntime = Object.freeze({
    bind: bind,
    AREAS_VALIDATOR: { validPhoneBR: _validPhoneBR },
  })
})()
