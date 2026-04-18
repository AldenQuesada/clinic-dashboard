/**
 * ClinicAI — B2B Groups UI
 *
 * Overlay pra parcerias collective (B2B2B2C — grupos/confrarias):
 *   - Stats (alcance total, leads, conversões, taxa lead/reach)
 *   - Lista de exposições (palestra, evento, email, post)
 *   - Form de nova exposição
 *
 * Consome: B2BGroupsRepository.
 * Eventos ouvidos: 'b2b:open-groups' { partnershipId, partnershipName }
 * Eventos emitidos: 'b2b:exposure-logged' { id }
 *
 * Expõe window.B2BGroups.
 */
;(function () {
  'use strict'
  if (window.B2BGroups) return

  var EVENT_TYPES = [
    { value: 'palestra',         label: 'Palestra' },
    { value: 'evento_presencial',label: 'Evento presencial' },
    { value: 'email_blast',      label: 'E-mail ao grupo' },
    { value: 'post_exclusivo',   label: 'Post exclusivo' },
    { value: 'mencao_stories',   label: 'Menção em stories' },
    { value: 'newsletter',       label: 'Newsletter' },
    { value: 'outro',            label: 'Outro' },
  ]

  var _state = {
    partnershipId: null,
    partnershipName: null,
    stats: null,
    exposures: [],
    loading: false,
    error: null,
    showForm: false,
    saving: false,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _repo() { return window.B2BGroupsRepository }
  function _typeLabel(t) {
    var o = EVENT_TYPES.find(function (e) { return e.value === t })
    return o ? o.label : t
  }
  function _fmtDate(iso) {
    if (!iso) return '—'
    try { return new Date(iso).toLocaleDateString('pt-BR') } catch (_) { return iso }
  }

  function _renderKPIs() {
    var s = _state.stats || {}
    var p = s.partnership || {}
    return '<div class="b2b-groups-kpis">' +
      '<div><div class="v">' + (p.member_count || '—') + '</div><div class="l">Membras cadastradas</div></div>' +
      '<div><div class="v">' + (s.total_reach || 0) + '</div><div class="l">Alcance total</div></div>' +
      '<div><div class="v">' + (s.total_leads || 0) + '</div><div class="l">Leads gerados</div></div>' +
      '<div><div class="v">' + (s.total_conversions || 0) + '</div><div class="l">Conversões</div></div>' +
      '<div><div class="v">' + (s.lead_rate_pct || 0) + '%</div><div class="l">Taxa alcance→lead</div></div>' +
    '</div>'
  }

  function _renderExposureRow(e) {
    return '<tr>' +
      '<td>' + _fmtDate(e.date_occurred) + '</td>' +
      '<td>' + _esc(_typeLabel(e.event_type)) + '</td>' +
      '<td>' + _esc(e.title) + '</td>' +
      '<td class="num">' + (e.reach_count || 0) + '</td>' +
      '<td class="num">' + (e.leads_count || 0) + '</td>' +
      '<td class="num">' + (e.conversions != null ? e.conversions : '—') + '</td>' +
    '</tr>'
  }

  function _renderExposures() {
    if (!_state.exposures.length) {
      return '<div class="b2b-empty">Nenhuma exposição registrada ainda.</div>'
    }
    return '<table class="b2b-table b2b-groups-table">' +
      '<thead><tr>' +
        '<th>Data</th><th>Tipo</th><th>Título</th>' +
        '<th class="num">Alcance</th><th class="num">Leads</th><th class="num">Conv.</th>' +
      '</tr></thead>' +
      '<tbody>' + _state.exposures.map(_renderExposureRow).join('') + '</tbody>' +
    '</table>'
  }

  function _renderForm() {
    if (!_state.showForm) return '<button type="button" class="b2b-btn b2b-btn-primary" data-group-new>+ Registrar exposição</button>'
    var opts = EVENT_TYPES.map(function (t) { return '<option value="' + t.value + '">' + _esc(t.label) + '</option>' }).join('')
    return '<form class="b2b-voucher-form" id="b2bGroupExpForm">' +
      '<div class="b2b-grid-2">' +
        '<label class="b2b-field"><span class="b2b-field-lbl">Tipo</span>' +
          '<select name="event_type" class="b2b-input" required>' + opts + '</select></label>' +
        '<label class="b2b-field"><span class="b2b-field-lbl">Data</span>' +
          '<input type="date" name="date_occurred" class="b2b-input" value="' + new Date().toISOString().slice(0,10) + '"></label>' +
      '</div>' +
      '<label class="b2b-field"><span class="b2b-field-lbl">Título / descrição <em>*</em></span>' +
        '<input name="title" class="b2b-input" required placeholder="Ex.: Palestra mensal da ACIM"></label>' +
      '<div class="b2b-grid-3">' +
        '<label class="b2b-field"><span class="b2b-field-lbl">Alcance</span>' +
          '<input type="number" min="0" name="reach_count" class="b2b-input" placeholder="Pessoas alcançadas"></label>' +
        '<label class="b2b-field"><span class="b2b-field-lbl">Leads</span>' +
          '<input type="number" min="0" name="leads_count" class="b2b-input" placeholder="Contatos diretos"></label>' +
        '<label class="b2b-field"><span class="b2b-field-lbl">Conversões</span>' +
          '<input type="number" min="0" name="conversions" class="b2b-input" placeholder="Fechados (opc.)"></label>' +
      '</div>' +
      '<label class="b2b-field"><span class="b2b-field-lbl">Notas</span>' +
        '<textarea name="notes" rows="2" class="b2b-input" placeholder="Observações (opcional)"></textarea></label>' +
      '<div class="b2b-form-actions">' +
        '<button type="button" class="b2b-btn" data-group-cancel>Cancelar</button>' +
        '<button type="submit" class="b2b-btn b2b-btn-primary">' + (_state.saving ? 'Salvando…' : 'Registrar') + '</button>' +
      '</div>' +
    '</form>'
  }

  function _renderBody() {
    if (_state.loading) return '<div class="b2b-empty">Carregando…</div>'
    if (_state.error)   return '<div class="b2b-empty b2b-empty-err">' + _esc(_state.error) + '</div>'
    return _renderKPIs() +
      '<div class="b2b-voucher-actions-top">' + _renderForm() + '</div>' +
      _renderExposures()
  }

  function _renderOverlay() {
    return '<div class="b2b-overlay" data-group-overlay>' +
      '<div class="b2b-modal b2b-modal-wide">' +
        '<header class="b2b-modal-hdr">' +
          '<h2>Alcance do grupo · ' + _esc(_state.partnershipName || '') + '</h2>' +
          '<button type="button" class="b2b-close" data-group-close>&times;</button>' +
        '</header>' +
        '<div class="b2b-modal-body">' + _renderBody() + '</div>' +
      '</div>' +
    '</div>'
  }

  function _mount() {
    var host = document.getElementById('b2bGroupsOverlayHost')
    if (!host) {
      host = document.createElement('div')
      host.id = 'b2bGroupsOverlayHost'
      document.body.appendChild(host)
    }
    host.innerHTML = _renderOverlay()
    _bind(host)
  }

  function _close() {
    var host = document.getElementById('b2bGroupsOverlayHost')
    if (host) host.innerHTML = ''
    _state.partnershipId = null; _state.showForm = false
  }

  function _bind(host) {
    host.querySelectorAll('[data-group-close]').forEach(function (el) { el.addEventListener('click', _close) })
    var ov = host.querySelector('[data-group-overlay]')
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) _close() })

    var newBtn = host.querySelector('[data-group-new]')
    if (newBtn) newBtn.addEventListener('click', function () { _state.showForm = true; _mount() })

    var cancelBtn = host.querySelector('[data-group-cancel]')
    if (cancelBtn) cancelBtn.addEventListener('click', function () { _state.showForm = false; _mount() })

    var form = host.querySelector('#b2bGroupExpForm')
    if (form) form.addEventListener('submit', _onSubmit)
  }

  async function _onSubmit(e) {
    e.preventDefault()
    var fd = new FormData(e.target)
    var payload = { partnership_id: _state.partnershipId }
    fd.forEach(function (v, k) { if (v != null && String(v).trim() !== '') payload[k] = v })

    _state.saving = true
    try {
      var r = await _repo().logExposure(payload)
      if (!r || !r.ok) throw new Error(r && r.error || 'falha')
      document.dispatchEvent(new CustomEvent('b2b:exposure-logged', { detail: r }))
      _state.showForm = false
      await _load()
    } catch (err) {
      alert('Falha: ' + err.message)
    } finally {
      _state.saving = false
    }
  }

  async function _load() {
    if (!_state.partnershipId) return
    _state.loading = true
    _mount()
    try {
      var results = await Promise.all([
        _repo().stats(_state.partnershipId),
        _repo().listExposures(_state.partnershipId),
      ])
      _state.stats     = results[0] || null
      _state.exposures = results[1] || []
    } catch (e) {
      _state.error = e.message || String(e)
    } finally {
      _state.loading = false
      _mount()
    }
  }

  function open(partnershipId, partnershipName) {
    _state.partnershipId = partnershipId
    _state.partnershipName = partnershipName || ''
    _state.showForm = false
    _state.error = null
    _load()
  }

  document.addEventListener('b2b:open-groups', function (e) {
    var d = e.detail || {}
    if (d.partnershipId) open(d.partnershipId, d.partnershipName)
  })

  window.B2BGroups = Object.freeze({ open: open, close: _close })
})()
