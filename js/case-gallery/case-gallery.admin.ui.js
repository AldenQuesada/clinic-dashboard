/**
 * ClinicAI - Case Gallery Admin UI
 *
 * Pagina admin para cadastrar/editar/excluir casos antes-depois.
 * Renderiza em #case-gallery-admin-root.
 *
 * Layout brandbook (Champagne + Ivory + Cormorant + Montserrat).
 *
 * API:
 *   CaseGalleryAdmin.init() — chamado quando entra na pagina
 */
;(function () {
  'use strict'
  if (window._caseGalleryAdminLoaded) return
  window._caseGalleryAdminLoaded = true

  var GOLD = '#C8A97E'
  var GOLD_DARK = '#A8895E'
  var IVORY = '#F5F0E8'
  var GRAPHITE = '#2C2C2C'
  var GRAPHITE_LIGHT = '#4A4A4A'
  var BEGE = '#E8DDD0'
  var WHITE = '#FEFCF8'

  // Areas de foco padrao (alinhadas ao protocolo da clinica)
  var FOCUS_PRESETS = [
    { id: 'terco_medio',    label: 'Terço médio' },
    { id: 'mandibula',      label: 'Linha mandibular' },
    { id: 'labios',         label: 'Lábios' },
    { id: 'olheiras',       label: 'Olheiras' },
    { id: 'sulco_nasolabial', label: 'Sulco nasolabial' },
    { id: 'frontal',        label: 'Expressão frontal' },
    { id: 'rejuvenescimento_global', label: 'Rejuvenescimento global' },
    { id: 'fotona',         label: 'Fotona 4D' },
  ]

  var TAG_PRESETS = ['ha', 'botox', 'bioestimulador', 'fotona', 'fios_pdo']

  var _state = { rows: [], signedCache: {}, loading: false }

  function _esc(s) { return String(s == null ? '' : s).replace(/[<>&"']/g, function (c) { return ({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'})[c] }) }
  function _toast(msg, type) { if (window.toast) return window.toast(msg, type || 'info'); if (window.showToast) return window.showToast(msg, type || 'info'); console.log('[CaseGallery]', type, msg) }

  function _genStoragePath(prefix) {
    var id = (crypto && crypto.randomUUID) ? crypto.randomUUID() : (Date.now() + '_' + Math.random().toString(36).slice(2))
    return 'cases/' + id + '/' + prefix + '.jpg'
  }

  function _resolveSignedUrls(rows) {
    var svc = window.CaseGalleryService
    if (!svc) return Promise.resolve(rows)
    var promises = []
    rows.forEach(function (r) {
      ['photo_before_path', 'photo_after_path'].forEach(function (k) {
        var p = r[k]
        if (!p || _state.signedCache[p]) return
        promises.push(svc.signedUrl(p).then(function (u) { _state.signedCache[p] = u }))
      })
    })
    return Promise.all(promises).then(function () { return rows })
  }

  function _load() {
    if (!window.CaseGalleryService) return
    _state.loading = true
    _render()
    window.CaseGalleryService.list().then(function (rows) {
      _state.rows = rows
      return _resolveSignedUrls(rows)
    }).then(function () {
      _state.loading = false
      _render()
    })
  }

  function _renderHeader() {
    return '<div style="margin-bottom:32px;display:flex;justify-content:space-between;align-items:flex-end;flex-wrap:wrap;gap:16px">' +
      '<div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-weight:300;font-size:32px;color:' + GRAPHITE + ';line-height:1.1">Galeria de <em style="color:' + GOLD_DARK + '">casos</em></div>' +
        '<div style="font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:' + GRAPHITE_LIGHT + ';margin-top:6px">Banco de antes/depois para reports e materiais</div>' +
      '</div>' +
      '<button id="cgaNew" style="padding:14px 28px;background:' + GRAPHITE + ';color:' + IVORY + ';border:none;font-family:\'Montserrat\',sans-serif;font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;cursor:pointer">+ Novo caso</button>' +
    '</div>'
  }

  function _renderEmpty() {
    return '<div style="padding:80px 40px;text-align:center;background:' + IVORY + ';border:1px dashed ' + BEGE + '">' +
      '<div style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-size:24px;color:' + GRAPHITE_LIGHT + ';margin-bottom:14px">Nenhum caso cadastrado</div>' +
      '<div style="font-size:12px;color:' + GRAPHITE_LIGHT + ';opacity:0.7;max-width:420px;margin:0 auto;line-height:1.6">Cadastre 3 ou mais casos com perfil similar ao das suas pacientes para enriquecer os reports e materiais comerciais.</div>' +
    '</div>'
  }

  function _renderCard(r) {
    var beforeUrl = _state.signedCache[r.photo_before_path]
    var afterUrl  = _state.signedCache[r.photo_after_path]
    var imgStyle = 'width:100%;aspect-ratio:4/5;object-fit:cover;display:block;background:linear-gradient(135deg,#DFC5A0,#A8895E)'
    var phStyle  = 'width:100%;aspect-ratio:4/5;background:linear-gradient(135deg,#DFC5A0,#A8895E);display:flex;align-items:center;justify-content:center;color:rgba(245,240,232,0.65);font-family:\'Cormorant Garamond\',serif;font-style:italic;font-size:13px'
    return '<div style="background:' + WHITE + ';border:1px solid ' + BEGE + ';overflow:hidden">' +
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1px;background:' + BEGE + '">' +
        (beforeUrl ? '<img src="' + _esc(beforeUrl) + '" style="' + imgStyle + '" alt="antes">' : '<div style="' + phStyle + '">[ antes ]</div>') +
        (afterUrl ? '<img src="' + _esc(afterUrl) + '" style="' + imgStyle + '" alt="depois">' : '<div style="' + phStyle + '">[ depois ]</div>') +
      '</div>' +
      '<div style="padding:18px 20px">' +
        '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:6px">' +
          '<div style="font-family:\'Cormorant Garamond\',serif;font-weight:400;font-size:18px;color:' + GRAPHITE + '">' + _esc(r.patient_initials) + (r.patient_age ? ', ' + r.patient_age + ' anos' : '') + '</div>' +
          '<div style="font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + GOLD_DARK + ';font-weight:500">' + _esc(r.focus_label) + '</div>' +
        '</div>' +
        '<div style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-size:13px;color:' + GRAPHITE_LIGHT + ';line-height:1.5;margin-bottom:14px">' +
          (r.summary ? _esc(r.summary) : 'Procedimento ha ' + r.months_since_procedure + ' meses') +
        '</div>' +
        '<div style="display:flex;gap:6px;justify-content:flex-end">' +
          '<button data-edit="' + r.id + '" style="padding:6px 12px;background:transparent;border:1px solid ' + BEGE + ';font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:' + GRAPHITE_LIGHT + ';cursor:pointer;font-family:Montserrat,sans-serif">Editar</button>' +
          '<button data-delete="' + r.id + '" style="padding:6px 12px;background:transparent;border:1px solid rgba(196,147,122,0.4);font-size:10px;letter-spacing:0.1em;text-transform:uppercase;color:#C4937A;cursor:pointer;font-family:Montserrat,sans-serif">Excluir</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  }

  function _render() {
    var root = document.getElementById('case-gallery-admin-root')
    if (!root) return
    var grid = ''
    if (_state.loading) grid = '<div style="padding:60px;text-align:center;color:' + GRAPHITE_LIGHT + '">Carregando...</div>'
    else if (!_state.rows.length) grid = _renderEmpty()
    else grid = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(360px,1fr));gap:24px">' +
      _state.rows.map(_renderCard).join('') +
    '</div>'

    root.innerHTML = '<div style="padding:32px 40px;max-width:1200px;margin:0 auto;font-family:\'Montserrat\',sans-serif;color:' + GRAPHITE + '">' +
      _renderHeader() +
      grid +
    '</div>'

    _bind()
  }

  function _bind() {
    var root = document.getElementById('case-gallery-admin-root')
    if (!root) return
    var newBtn = root.querySelector('#cgaNew')
    if (newBtn) newBtn.addEventListener('click', function () { _openForm(null) })
    root.querySelectorAll('[data-edit]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-edit')
        var row = _state.rows.find(function (r) { return r.id === id })
        if (row) _openForm(row)
      })
    })
    root.querySelectorAll('[data-delete]').forEach(function (b) {
      b.addEventListener('click', function () {
        if (!confirm('Excluir este caso? As fotos serao removidas do storage.')) return
        var id = b.getAttribute('data-delete')
        window.CaseGalleryService.remove(id).then(function (res) {
          if (res && (res.before_path || res.after_path)) {
            window.CaseGalleryService.deleteStorageObjects([res.before_path, res.after_path]).catch(function () {})
          }
          _toast('Caso excluido', 'success')
          _load()
        }).catch(function (e) { _toast('Falha: ' + (e.message || ''), 'error') })
      })
    })
  }

  // ── Form modal ────────────────────────────────────────────
  function _openForm(existing) {
    var isEdit = !!existing
    var overlay = document.createElement('div')
    overlay.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,0.85);display:flex;align-items:center;justify-content:center;padding:24px;backdrop-filter:blur(8px);overflow-y:auto'

    var focusOptions = FOCUS_PRESETS.map(function (f) {
      var sel = existing && existing.focus_area === f.id ? ' selected' : ''
      return '<option value="' + f.id + '" data-label="' + _esc(f.label) + '"' + sel + '>' + _esc(f.label) + '</option>'
    }).join('')

    overlay.innerHTML = '<div style="background:' + WHITE + ';max-width:560px;width:100%;padding:36px;color:' + GRAPHITE + ';font-family:Montserrat,sans-serif;max-height:90vh;overflow-y:auto">' +
      '<div style="font-family:\'Cormorant Garamond\',serif;font-style:italic;font-weight:300;font-size:28px;color:' + GRAPHITE + ';margin-bottom:24px">' +
        (isEdit ? 'Editar caso' : 'Novo caso') +
      '</div>' +

      _formField('Iniciais da paciente', '<input id="cgfInitials" maxlength="6" placeholder="M., L.A." value="' + _esc(existing ? existing.patient_initials : '') + '" style="' + _inputStyle() + '">') +
      _formField('Idade', '<input id="cgfAge" type="number" min="18" max="99" placeholder="52" value="' + _esc(existing ? existing.patient_age : '') + '" style="' + _inputStyle() + '">') +
      _formField('Foco do caso', '<select id="cgfFocus" style="' + _inputStyle() + '">' + focusOptions + '</select>') +
      _formField('Tempo desde procedimento (meses)', '<input id="cgfMonths" type="number" min="0" max="60" placeholder="8" value="' + _esc(existing ? existing.months_since_procedure : '') + '" style="' + _inputStyle() + '">') +
      _formField('Resumo (opcional)', '<input id="cgfSummary" maxlength="80" placeholder="Protocolo similar — 8 meses" value="' + _esc(existing && existing.summary ? existing.summary : '') + '" style="' + _inputStyle() + '">') +

      (isEdit ? '' :
        _formField('Foto antes', '<input id="cgfBefore" type="file" accept="image/*" style="font-family:Montserrat,sans-serif;font-size:12px">') +
        _formField('Foto depois', '<input id="cgfAfter" type="file" accept="image/*" style="font-family:Montserrat,sans-serif;font-size:12px">') +
        '<div style="padding:12px 14px;background:rgba(245,158,11,0.08);border:1px solid rgba(245,158,11,0.3);margin-top:12px;margin-bottom:16px">' +
          '<label style="display:flex;align-items:flex-start;gap:8px;cursor:pointer">' +
            '<input type="checkbox" id="cgfConsent" style="margin-top:3px;accent-color:' + GOLD + '">' +
            '<span style="font-size:11px;color:' + GRAPHITE + ';line-height:1.5">Confirmo que tenho consentimento expresso da paciente para uso destas imagens em materiais comerciais (LGPD).</span>' +
          '</label>' +
        '</div>'
      ) +

      '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:24px">' +
        '<button id="cgfCancel" style="padding:10px 18px;background:transparent;border:1px solid ' + BEGE + ';font-family:Montserrat,sans-serif;font-size:11px;letter-spacing:0.15em;text-transform:uppercase;color:' + GRAPHITE_LIGHT + ';cursor:pointer">Cancelar</button>' +
        '<button id="cgfSave" style="padding:10px 22px;background:' + GRAPHITE + ';color:' + IVORY + ';border:none;font-family:Montserrat,sans-serif;font-size:11px;font-weight:500;letter-spacing:0.2em;text-transform:uppercase;cursor:pointer">Salvar</button>' +
      '</div>' +
    '</div>'

    document.body.appendChild(overlay)

    function _close() { overlay.remove() }
    overlay.querySelector('#cgfCancel').addEventListener('click', _close)
    overlay.querySelector('#cgfSave').addEventListener('click', function () {
      _saveFromForm(overlay, existing).then(function (ok) { if (ok) { _close(); _load() } })
    })
  }

  function _formField(label, control) {
    return '<div style="margin-bottom:18px">' +
      '<label style="display:block;font-size:9px;letter-spacing:0.2em;text-transform:uppercase;color:' + GOLD_DARK + ';font-weight:500;margin-bottom:6px">' + _esc(label) + '</label>' +
      control +
    '</div>'
  }
  function _inputStyle() {
    return 'width:100%;padding:10px 14px;background:' + IVORY + ';border:1px solid ' + BEGE + ';font-family:Montserrat,sans-serif;font-size:13px;color:' + GRAPHITE + ';font-weight:300'
  }

  function _saveFromForm(overlay, existing) {
    var initials = overlay.querySelector('#cgfInitials').value.trim()
    var age      = parseInt(overlay.querySelector('#cgfAge').value, 10)
    var focusEl  = overlay.querySelector('#cgfFocus')
    var focusId  = focusEl.value
    var focusLbl = focusEl.options[focusEl.selectedIndex].getAttribute('data-label')
    var months   = parseInt(overlay.querySelector('#cgfMonths').value, 10)
    var summary  = overlay.querySelector('#cgfSummary').value.trim()

    if (!initials || !age || !focusId || !months) {
      _toast('Preencha todos os campos obrigatorios', 'warn')
      return Promise.resolve(false)
    }

    var svc = window.CaseGalleryService

    if (existing) {
      // Modo edicao — atualiza so metadata, fotos nao mudam
      return svc.update(existing.id, {
        patientInitials: initials,
        patientAge:      age,
        focusArea:       focusId,
        focusLabel:      focusLbl,
        monthsSince:     months,
        summary:         summary || null,
      }).then(function () { _toast('Caso atualizado', 'success'); return true })
        .catch(function (e) { _toast('Falha: ' + (e.message || ''), 'error'); return false })
    }

    // Modo criacao — exige fotos + consent
    var beforeFile = overlay.querySelector('#cgfBefore').files[0]
    var afterFile  = overlay.querySelector('#cgfAfter').files[0]
    var consentOk  = overlay.querySelector('#cgfConsent').checked

    if (!beforeFile || !afterFile) { _toast('Suba as duas fotos', 'warn'); return Promise.resolve(false) }
    if (!consentOk) { _toast('Confirme o consentimento LGPD', 'warn'); return Promise.resolve(false) }

    return Promise.all([
      svc.uploadPhoto(beforeFile, _genStoragePath('before')),
      svc.uploadPhoto(afterFile, _genStoragePath('after')),
    ]).then(function (paths) {
      return svc.create({
        patientInitials: initials,
        patientAge:      age,
        patientGender:   'F',
        focusArea:       focusId,
        focusLabel:      focusLbl,
        tags:            [],
        photoBeforePath: paths[0],
        photoAfterPath:  paths[1],
        monthsSince:     months,
        summary:         summary || null,
        consentText:     'Consentimento LGPD da paciente confirmado pela equipe em ' + new Date().toISOString(),
      })
    }).then(function () { _toast('Caso adicionado', 'success'); return true })
      .catch(function (e) { _toast('Falha: ' + (e.message || ''), 'error'); return false })
  }

  window.CaseGalleryAdmin = { init: _load }

  document.addEventListener('DOMContentLoaded', function () {
    document.addEventListener('clinicai:page-change', function (e) {
      if (e.detail === 'case-gallery') _load()
    })
    var t = setInterval(function () {
      var page = document.getElementById('page-case-gallery')
      if (page && page.style.display !== 'none' && page.offsetParent !== null) {
        clearInterval(t); _load()
      }
    }, 500)
    setTimeout(function () { clearInterval(t) }, 30000)
  })
})()
