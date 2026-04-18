/**
 * ClinicAI — B2B Candidate Manual Form
 *
 * Overlay com formulário pra adicionar candidato manualmente (por indicação).
 * Zero dependência de scout automático. Grava direto via RPC add_manual.
 *
 * Consome: B2BScoutRepository, B2BCandidates.CATEGORIES (lista única).
 * Eventos ouvidos: 'b2b:open-candidate-form'
 * Eventos emitidos: 'b2b:candidate-added' { id }
 *
 * Expõe window.B2BCandidateForm.
 */
;(function () {
  'use strict'
  if (window.B2BCandidateForm) return

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _repo() { return window.B2BScoutRepository }
  function _categories() {
    return (window.B2BCandidates && window.B2BCandidates.CATEGORIES) || []
  }

  var _state = { saving: false, error: null, similar: [] }

  function _esc2(s) { return _esc(s) }

  // Fuzzy lookup no blur do nome (Fraqueza #11)
  async function _checkSimilar(formEl) {
    if (!window.B2BScoutRepository || !_sbRpcAvailable()) return
    var name  = (formEl.querySelector('[name="name"]').value || '').trim()
    var phone = (formEl.querySelector('[name="phone"]').value || '').trim()
    if (name.length < 3) { _state.similar = []; _renderSimilarHint(formEl); return }

    try {
      var r = await window._sbShared.rpc('b2b_candidate_find_similar', { p_name: name, p_phone: phone || null })
      if (r.error) throw new Error(r.error.message)
      _state.similar = Array.isArray(r.data) ? r.data : []
      _renderSimilarHint(formEl)
    } catch (e) {
      console.warn('[B2BCandidateForm] find_similar falhou:', e.message)
    }
  }

  function _sbRpcAvailable() {
    return !!(window._sbShared && typeof window._sbShared.rpc === 'function')
  }

  function _renderSimilarHint(formEl) {
    var host = formEl.querySelector('[data-similar-host]')
    if (!host) return
    if (!_state.similar.length) { host.innerHTML = ''; return }

    var items = _state.similar.slice(0, 5).map(function (s) {
      var simPct = s.similarity != null ? Math.round(Number(s.similarity) * 100) + '%' : '—'
      var reason = s.match_reason === 'phone' ? 'telefone bate' : 'nome ' + simPct
      return '<div class="b2b-similar-item">' +
        '<div class="b2b-similar-main">' +
          '<strong>' + _esc2(s.name) + '</strong>' +
          (s.phone ? ' · <span>' + _esc2(s.phone) + '</span>' : '') +
          (s.category ? ' · <span>' + _esc2(s.category) + '</span>' : '') +
          ' · <span style="color:#F59E0B">' + reason + '</span>' +
        '</div>' +
        '<button type="button" class="b2b-similar-link" data-similar-open="' + _esc2(s.id) + '">Ver existente</button>' +
      '</div>'
    }).join('')

    host.innerHTML =
      '<div class="b2b-similar-warn">' +
        '<div class="b2b-similar-hdr">Já existe candidato parecido — revise antes de salvar:</div>' +
        items +
      '</div>'

    host.querySelectorAll('[data-similar-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-similar-open')
        // Dispara evento que a UI de candidatos possa abrir (não bloqueia aqui)
        document.dispatchEvent(new CustomEvent('b2b:focus-candidate', { detail: { id: id } }))
        _toast() && _toast().info('Candidato existente marcado — feche esse form e abra na tab Candidatos')
      })
    })
  }

  function _toast() { return window.B2BToast }

  function _renderForm() {
    var cats = _categories()
    var catOpts = cats.map(function (c) {
      return '<option value="' + _esc(c.value) + '" data-tier="' + c.tier + '">T' + c.tier + ' · ' + _esc(c.label) + '</option>'
    }).join('')

    return '<form id="b2bCandNewForm" class="b2b-form">' +
      '<div class="b2b-form-sec">Quem é</div>' +
      '<div class="b2b-grid-2">' +
        '<label class="b2b-field"><span class="b2b-field-lbl">Nome do negócio <em>*</em></span>' +
          '<input name="name" class="b2b-input" required autofocus></label>' +
        '<label class="b2b-field"><span class="b2b-field-lbl">Categoria <em>*</em></span>' +
          '<select name="category" id="b2bCandCategorySel" class="b2b-input" required>' +
            '<option value="">Escolher…</option>' + catOpts +
          '</select></label>' +
      '</div>' +
      '<div data-similar-host></div>' +

      '<div class="b2b-form-sec">Contato</div>' +
      '<div class="b2b-grid-2">' +
        '<label class="b2b-field"><span class="b2b-field-lbl">Telefone / WhatsApp</span>' +
          '<input name="phone" class="b2b-input" placeholder="+55 44 9..."></label>' +
        '<label class="b2b-field"><span class="b2b-field-lbl">Instagram</span>' +
          '<input name="instagram_handle" class="b2b-input" placeholder="@handle"></label>' +
      '</div>' +
      '<div class="b2b-grid-2">' +
        '<label class="b2b-field"><span class="b2b-field-lbl">E-mail</span>' +
          '<input name="email" type="email" class="b2b-input"></label>' +
        '<label class="b2b-field"><span class="b2b-field-lbl">Site</span>' +
          '<input name="website" class="b2b-input" placeholder="https://..."></label>' +
      '</div>' +
      '<label class="b2b-field"><span class="b2b-field-lbl">Endereço</span>' +
        '<input name="address" class="b2b-input"></label>' +

      '<div class="b2b-form-sec">Indicação</div>' +
      '<div class="b2b-grid-2">' +
        '<label class="b2b-field"><span class="b2b-field-lbl">Quem indicou</span>' +
          '<input name="referred_by" class="b2b-input" placeholder="Nome de quem passou o contato"></label>' +
        '<label class="b2b-field"><span class="b2b-field-lbl">Contato de quem indicou</span>' +
          '<input name="referred_by_contact" class="b2b-input" placeholder="Telefone / @"></label>' +
      '</div>' +
      '<label class="b2b-field"><span class="b2b-field-lbl">Motivo / contexto da indicação</span>' +
        '<textarea name="referred_by_reason" rows="2" class="b2b-input" placeholder="Por que faz sentido? O que te fez pensar nesse parceiro?"></textarea></label>' +

      '<div class="b2b-form-sec">Avaliação inicial (opcional — pode avaliar depois com IA)</div>' +
      '<div class="b2b-grid-2">' +
        '<label class="b2b-field"><span class="b2b-field-lbl">DNA score (1-10)</span>' +
          '<input name="dna_score" type="number" min="1" max="10" step="0.1" class="b2b-input" placeholder="ex: 8.5"></label>' +
        '<label class="b2b-field"><span class="b2b-field-lbl">Tier target</span>' +
          '<select name="tier_target" class="b2b-input">' +
            '<option value="">—</option>' +
            '<option value="1">Tier 1</option><option value="2">Tier 2</option><option value="3">Tier 3</option>' +
          '</select></label>' +
      '</div>' +
      '<label class="b2b-field"><span class="b2b-field-lbl">Justificativa do score</span>' +
        '<textarea name="dna_justification" rows="2" class="b2b-input" placeholder="Por que esse score? (opcional)"></textarea></label>' +

      '<div class="b2b-form-actions">' +
        '<button type="button" class="b2b-btn" data-cand-form-close>Cancelar</button>' +
        '<button type="submit" class="b2b-btn b2b-btn-primary" id="b2bCandFormSave">' +
          (_state.saving ? 'Salvando…' : 'Adicionar candidato') +
        '</button>' +
      '</div>' +
      (_state.error ? '<div class="b2b-form-err">' + _esc(_state.error) + '</div>' : '') +
    '</form>'
  }

  function _renderOverlay() {
    return '<div class="b2b-overlay" data-cand-form-overlay>' +
      '<div class="b2b-modal">' +
        '<header class="b2b-modal-hdr">' +
          '<h2>Novo candidato (indicação)</h2>' +
          '<button type="button" class="b2b-close" data-cand-form-close aria-label="Fechar">&times;</button>' +
        '</header>' +
        '<div class="b2b-modal-body">' + _renderForm() + '</div>' +
      '</div>' +
    '</div>'
  }

  function _collectPayload(formEl) {
    var fd = new FormData(formEl)
    var out = {}
    fd.forEach(function (v, k) { if (v != null && String(v).trim() !== '') out[k] = v })

    // Tier target auto do dropdown da categoria se não preenchido
    if (!out.tier_target && out.category) {
      var sel = formEl.querySelector('#b2bCandCategorySel')
      var opt = sel && sel.querySelector('option[value="' + out.category + '"]')
      if (opt && opt.getAttribute('data-tier')) out.tier_target = opt.getAttribute('data-tier')
    }
    return out
  }

  async function _onSubmit(e) {
    e.preventDefault()
    var formEl = e.target
    var payload = _collectPayload(formEl)

    if (!payload.name) { _state.error = 'Nome obrigatório'; _rerender(); return }
    if (!payload.category) { _state.error = 'Categoria obrigatória'; _rerender(); return }

    _state.saving = true
    _state.error = null
    _rerender()

    try {
      var r = await _repo().addManual(payload)
      if (!r || !r.ok) throw new Error('Falha: ' + (r && r.error || 'desconhecida'))
      document.dispatchEvent(new CustomEvent('b2b:candidate-added', { detail: { id: r.id } }))
      _close()
    } catch (err) {
      _state.error = err.message || String(err)
      _state.saving = false
      _rerender()
    }
  }

  function _mount() {
    var host = document.getElementById('b2bCandFormOverlayHost')
    if (!host) {
      host = document.createElement('div')
      host.id = 'b2bCandFormOverlayHost'
      document.body.appendChild(host)
    }
    host.innerHTML = _renderOverlay()
    _bind(host)
  }

  function _close() {
    var host = document.getElementById('b2bCandFormOverlayHost')
    if (host) host.innerHTML = ''
    _state.saving = false; _state.error = null
  }

  function _rerender() { _mount() }

  function _bind(host) {
    host.querySelectorAll('[data-cand-form-close]').forEach(function (el) {
      el.addEventListener('click', _close)
    })
    var ov = host.querySelector('[data-cand-form-overlay]')
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) _close() })
    var form = host.querySelector('#b2bCandNewForm')
    if (form) {
      form.addEventListener('submit', _onSubmit)

      // Fuzzy similar check no blur de nome + phone (Fraqueza #11)
      var nameInput  = form.querySelector('[name="name"]')
      var phoneInput = form.querySelector('[name="phone"]')
      if (nameInput) {
        nameInput.addEventListener('blur', function () { _checkSimilar(form) })
      }
      if (phoneInput) {
        phoneInput.addEventListener('blur', function () { _checkSimilar(form) })
      }
    }
  }

  function open() { _mount() }

  document.addEventListener('b2b:open-candidate-form', open)

  window.B2BCandidateForm = Object.freeze({ open: open, close: _close })
})()
