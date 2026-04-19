/**
 * ClinicAI — B2B Form UI
 *
 * Modal/overlay com formulário completo de parceria (todos os primitivos
 * dos 6 modelos analisados). Abre em modo 'new' ou 'edit'.
 *
 * Consome: B2BRepository, B2BService
 * Eventos ouvidos: 'b2b:open-form' { mode, id? }
 * Eventos emitidos: 'b2b:partnership-saved' { id, slug }
 *
 * Expõe window.B2BForm (apenas open/close, sem API extra).
 */
;(function () {
  'use strict'
  if (window.B2BForm) return

  var _state = {
    mode: 'new',
    partnership: null,
    saving: false,
    error: null,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _repo() { return window.B2BRepository }
  function _svc()  { return window.B2BService    }

  // ─── Helpers de campo ───────────────────────────────────────
  function _textInput(name, label, value, placeholder, required) {
    return _fieldWrap(label, required,
      '<input type="text" name="' + name + '" value="' + _esc(value || '') + '" ' +
        (placeholder ? 'placeholder="' + _esc(placeholder) + '" ' : '') +
        (required ? 'required ' : '') + 'class="b2b-input">')
  }
  function _numInput(name, label, value, min, max) {
    return _fieldWrap(label, false,
      '<input type="number" name="' + name + '" value="' + _esc(value == null ? '' : value) + '" ' +
      (min != null ? 'min="' + min + '" ' : '') + (max != null ? 'max="' + max + '" ' : '') +
      'class="b2b-input">')
  }
  function _textareaInput(name, label, value, rows) {
    return _fieldWrap(label, false,
      '<textarea name="' + name + '" rows="' + (rows || 3) + '" class="b2b-input">' + _esc(value || '') + '</textarea>')
  }
  function _selectInput(name, label, options, selected, required) {
    var opts = options.map(function (o) {
      var v = typeof o === 'string' ? o : o.value
      var l = typeof o === 'string' ? o : o.label
      return '<option value="' + _esc(v) + '"' + (v === selected ? ' selected' : '') + '>' + _esc(l) + '</option>'
    }).join('')
    return _fieldWrap(label, required,
      '<select name="' + name + '" class="b2b-input" ' + (required ? 'required' : '') + '>' +
        (required ? '' : '<option value="">—</option>') + opts + '</select>')
  }
  function _arrayInput(name, label, value, placeholder) {
    var joined = Array.isArray(value) ? value.join(', ') : (value || '')
    return _fieldWrap(label, false,
      '<input type="text" name="' + name + '" value="' + _esc(joined) + '" ' +
      'placeholder="' + _esc(placeholder || 'Separar por vírgula') + '" class="b2b-input">')
  }
  function _fieldWrap(label, required, inner) {
    return '<label class="b2b-field">' +
      '<span class="b2b-field-lbl">' + _esc(label) + (required ? ' <em>*</em>' : '') + '</span>' +
      inner +
    '</label>'
  }
  function _section(title) {
    return '<div class="b2b-form-sec">' + _esc(title) + '</div>'
  }

  // ─── Render ─────────────────────────────────────────────────
  function _renderForm() {
    var p = _state.partnership || {}
    var pillars = _svc().PILLARS.map(function (s) { return { value: s, label: s } })
    var types = _svc().TYPES.map(function (t) {
      return { value: t, label: ({ transactional: 'Transacional', occasion: 'Ocasião', institutional: 'Institucional' })[t] }
    })
    var statuses = _svc().STATUSES.map(function (s) { return { value: s, label: s } })

    return '<form id="b2bFormEl" class="b2b-form" autocomplete="off">' +

      _section('Identidade') +
      '<div class="b2b-grid-2">' +
        _textInput('name',     'Nome',            p.name, 'Ex.: Moinho Buffet', true) +
        _textInput('slug',     'Slug (opcional)', p.slug, 'Gerado do nome se vazio') +
      '</div>' +
      '<div class="b2b-grid-3">' +
        _selectInput('pillar',   'Pilar',    pillars, p.pillar || 'outros', true) +
        _textInput('category',  'Categoria', p.category, 'Ex.: fotografo_casamento') +
        _numInput('tier',       'Tier (1-3)', p.tier, 1, 3) +
      '</div>' +
      _selectInput('type', 'Tipo', types, p.type || 'institutional', true) +

      _section('DNA · gate de entrada (0-10)') +
      '<div class="b2b-grid-3">' +
        _numInput('dna_excelencia', 'Excelência', p.dna_excelencia, 0, 10) +
        _numInput('dna_estetica',   'Estética',   p.dna_estetica,   0, 10) +
        _numInput('dna_proposito',  'Propósito',  p.dna_proposito,  0, 10) +
      '</div>' +

      _section('Contato do parceiro') +
      '<div class="b2b-grid-2">' +
        _textInput('contact_name',      'Nome do responsável', p.contact_name) +
        _textInput('contact_phone',     'Telefone / WhatsApp', p.contact_phone) +
      '</div>' +
      '<div class="b2b-grid-2">' +
        _textInput('contact_email',     'E-mail',     p.contact_email) +
        _textInput('contact_instagram', 'Instagram',  p.contact_instagram, '@handle') +
      '</div>' +
      _textInput('contact_website', 'Site', p.contact_website) +

      _section('Localização (mapa vivo)') +
      '<div class="b2b-grid-2">' +
        _numInput('lat', 'Latitude (decimal)', p.lat) +
        _numInput('lng', 'Longitude (decimal)', p.lng) +
      '</div>' +

      _section('Voucher') +
      _textInput('voucher_combo', 'Combo do voucher', p.voucher_combo, 'Ex.: veu_noiva+anovator') +
      '<div class="b2b-grid-3">' +
        _numInput('voucher_validity_days',   'Validade (dias)',   p.voucher_validity_days   || 30) +
        _numInput('voucher_min_notice_days', 'Antecedência (dias)', p.voucher_min_notice_days || 15) +
        _numInput('voucher_monthly_cap',     'Cap mensal (un.)',  p.voucher_monthly_cap) +
      '</div>' +
      '<div class="b2b-grid-2">' +
        _numInput('voucher_unit_cost_brl', 'Custo real por voucher (R$)', p.voucher_unit_cost_brl, 0) +
      '</div>' +
      _arrayInput('voucher_delivery', 'Entrega do voucher', p.voucher_delivery || ['digital'], 'digital, print, gamified') +

      _section('Contrapartida do parceiro') +
      _arrayInput('contrapartida', 'Contrapartidas', p.contrapartida, 'Ex.: foto_video_mensal, mentoria_mirian') +
      _selectInput('contrapartida_cadence', 'Cadência', ['monthly', 'quarterly', 'ad_hoc'], p.contrapartida_cadence) +

      _section('Vigência & valuation') +
      '<div class="b2b-grid-3">' +
        _numInput('monthly_value_cap_brl',    'Teto mensal (R$)',    p.monthly_value_cap_brl) +
        _numInput('contract_duration_months', 'Duração (meses)',    p.contract_duration_months) +
        _numInput('review_cadence_months',    'Revisão (meses)',     p.review_cadence_months || 3) +
      '</div>' +
      _arrayInput('sazonais', 'Sazonais', p.sazonais, 'Ex.: dia_das_maes, natal, bf') +

      _section('Narrativa') +
      _arrayInput('slogans', 'Slogans (separar por |)', (p.slogans || []).join('|'), 'Usa | pra separar frases longas') +
      _textareaInput('narrative_quote', 'Citação do parceiro', p.narrative_quote, 3) +
      _textInput('narrative_author', 'Autor da citação', p.narrative_author) +
      _textInput('emotional_trigger', 'Gatilho emocional', p.emotional_trigger, 'Ex.: quando o Osvaldo diz pode beijar a noiva') +

      _section('Profissionais envolvidos (lado clínica)') +
      _arrayInput('involved_professionals', 'Profissionais', p.involved_professionals || ['mirian'], 'mirian, quesada, ...') +

      _section('Grupo / Confraria (B2B2B2C)') +
      '<label class="b2b-field"><span class="b2b-field-lbl">Esta parceria é com um grupo coletivo?</span>' +
        '<label style="display:flex;align-items:center;gap:8px;padding:8px 0;cursor:pointer;font-size:13px">' +
          '<input type="checkbox" name="is_collective" value="true"' + (p.is_collective ? ' checked' : '') + '> ' +
          '<span>Sim (ex.: ACIM, Confraria, Lide Feminino)</span>' +
        '</label>' +
      '</label>' +
      '<div class="b2b-grid-2">' +
        _numInput('member_count',            'Membras cadastradas',   p.member_count) +
        _numInput('estimated_monthly_reach', 'Alcance mensal estimado', p.estimated_monthly_reach) +
      '</div>' +

      _section('Status inicial') +
      _selectInput('status', 'Status', statuses, p.status || 'prospect') +

      '<div class="b2b-form-actions">' +
        '<button type="button" class="b2b-btn" data-form-close>Cancelar</button>' +
        '<button type="submit" class="b2b-btn b2b-btn-primary" id="b2bFormSaveBtn">' +
          (_state.saving ? 'Salvando…' : (_state.mode === 'new' ? 'Criar parceria' : 'Salvar alterações')) +
        '</button>' +
      '</div>' +

      (_state.error ? '<div class="b2b-form-err">' + _esc(_state.error) + '</div>' : '') +
    '</form>'
  }

  function _renderOverlay() {
    return '<div class="b2b-overlay" data-form-overlay>' +
      '<div class="b2b-modal">' +
        '<header class="b2b-modal-hdr">' +
          '<h2>' + (_state.mode === 'new' ? 'Nova parceria' : 'Editar parceria') + '</h2>' +
          '<button type="button" class="b2b-close" data-form-close aria-label="Fechar">&times;</button>' +
        '</header>' +
        '<div class="b2b-modal-body">' + _renderForm() + '</div>' +
      '</div>' +
    '</div>'
  }

  // ─── Lógica de submit ───────────────────────────────────────
  function _collectPayload(formEl) {
    var fd = new FormData(formEl)
    var out = {}
    fd.forEach(function (v, k) { out[k] = v })
    // Checkbox is_collective — se não vier no FormData, é false
    out.is_collective = fd.has('is_collective')

    // Arrays a partir de comma-separated
    ;['voucher_delivery','contrapartida','sazonais','involved_professionals'].forEach(function (k) {
      if (out[k] != null && typeof out[k] === 'string') {
        out[k] = out[k].split(',').map(function (s) { return s.trim() }).filter(Boolean)
      }
    })

    // Slogans com separador |
    if (out.slogans != null && typeof out.slogans === 'string') {
      out.slogans = out.slogans.split('|').map(function (s) { return s.trim() }).filter(Boolean)
    }

    return _svc().normalizePayload(out)
  }

  async function _onSubmit(e) {
    e.preventDefault()
    var formEl = e.target
    var payload = _collectPayload(formEl)

    if (!payload.name) { _state.error = 'Nome obrigatório'; _rerender(); return }
    if (!payload.slug) { _state.error = 'Slug inválido (gere a partir do nome)'; _rerender(); return }

    _state.saving = true
    _state.error = null
    _rerender()

    try {
      var r = await _repo().upsert(payload.slug, payload)
      if (!r || !r.ok) throw new Error('Falha ao salvar: ' + (r && r.error || 'desconhecido'))
      document.dispatchEvent(new CustomEvent('b2b:partnership-saved', {
        detail: { id: r.id, slug: r.slug }
      }))
      close()
    } catch (err) {
      _state.error = err.message || String(err)
    } finally {
      _state.saving = false
      _rerender()
    }
  }

  // ─── Monta/desmonta overlay ─────────────────────────────────
  function open(mode, id) {
    _state.mode = mode || 'new'
    _state.error = null
    _state.saving = false

    var mount = function () {
      var host = document.getElementById('b2bFormOverlayHost')
      if (!host) {
        host = document.createElement('div')
        host.id = 'b2bFormOverlayHost'
        document.body.appendChild(host)
      }
      host.innerHTML = _renderOverlay()
      _bind(host)
    }

    if (mode === 'edit' && id) {
      _repo().get(id).then(function (r) {
        _state.partnership = (r && r.ok) ? r.partnership : null
        mount()
      }).catch(function (e) {
        _state.error = 'Erro carregando: ' + (e.message || e)
        _state.partnership = null
        mount()
      })
    } else {
      _state.partnership = null
      mount()
    }
  }

  function close() {
    var host = document.getElementById('b2bFormOverlayHost')
    if (host) host.innerHTML = ''
  }

  function _rerender() {
    var host = document.getElementById('b2bFormOverlayHost')
    if (!host) return
    host.innerHTML = _renderOverlay()
    _bind(host)
  }

  function _bind(host) {
    host.querySelectorAll('[data-form-close]').forEach(function (el) {
      el.addEventListener('click', close)
    })
    var ov = host.querySelector('[data-form-overlay]')
    if (ov) {
      ov.addEventListener('click', function (e) {
        if (e.target === ov) close()
      })
    }
    var formEl = host.querySelector('#b2bFormEl')
    if (formEl) formEl.addEventListener('submit', _onSubmit)
  }

  // ─── Bind global ────────────────────────────────────────────
  document.addEventListener('b2b:open-form', function (e) {
    var d = e.detail || {}
    open(d.mode || 'new', d.id)
  })

  // ─── API pública ────────────────────────────────────────────
  window.B2BForm = Object.freeze({ open: open, close: close })
})()
