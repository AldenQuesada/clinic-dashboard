/**
 * ClinicAI — Short Links UI (standalone page)
 *
 * Encurtador de links com tracking de clicks e pixels.
 * Page: short-links | Root: shortLinksRoot
 *
 * Depende de: window.ClinicEnv
 */
;(function () {
  'use strict'
  if (window._clinicaiShortLinksLoaded) return
  window._clinicaiShortLinksLoaded = true

  var _url = function () { return window.ClinicEnv?.SUPABASE_URL || '' }
  var _key = function () { return window.ClinicEnv?.SUPABASE_KEY || '' }
  function _h() {
    var h = { 'apikey': _key(), 'Content-Type': 'application/json' }
    var s = JSON.parse(sessionStorage.getItem('sb-session') || '{}')
    h['Authorization'] = 'Bearer ' + (s.access_token || _key())
    return h
  }
  async function _rpc(name, params) {
    try {
      var r = await fetch(_url() + '/rest/v1/rpc/' + name, { method: 'POST', headers: _h(), body: JSON.stringify(params || {}) })
      return await r.json()
    } catch (e) { return null }
  }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML }
  function _ico(n, sz) {
    if (typeof feather !== 'undefined' && feather.icons && feather.icons[n])
      return feather.icons[n].toSvg({ width: sz || 16, height: sz || 16, 'stroke-width': 1.8 })
    return ''
  }

  var _links = []
  var _loaded = false
  var _showForm = false
  var _editPixels = null // code do link cujos pixels estao sendo editados
  var _baseUrl = ''

  // ── Pixel definitions ─────────────────────────────────────
  var PIXEL_FIELDS = [
    { key: 'meta_pixel_id',        label: 'Meta Pixel ID',        placeholder: 'Ex: 123456789012345',  validate: /^\d{10,20}$/, icon: 'facebook',     tip: 'ID numerico do pixel (Gerenciador de Eventos Meta)' },
    { key: 'meta_event',           label: 'Meta Evento',          placeholder: 'Lead, Purchase, etc.', validate: null,          icon: null,           tip: 'Evento alem de PageView (opcional)' },
    { key: 'google_ads_id',        label: 'Google Ads ID',        placeholder: 'Ex: AW-123456789',     validate: /^AW-\d{5,15}$/, icon: 'target',    tip: 'ID da tag de conversao Google Ads' },
    { key: 'google_ads_label',     label: 'Google Ads Label',     placeholder: 'Ex: AbC-D_efG12',      validate: null,          icon: null,           tip: 'Label da conversao (opcional)' },
    { key: 'google_analytics_id',  label: 'Google Analytics ID',  placeholder: 'Ex: G-XXXXXXXXXX',     validate: /^G-[A-Z0-9]{5,15}$/, icon: 'bar-chart', tip: 'ID da propriedade GA4' },
    { key: 'ga_event',             label: 'GA Evento',            placeholder: 'generate_lead, etc.',  validate: null,          icon: null,           tip: 'Evento personalizado GA4 (opcional)' },
    { key: 'tiktok_pixel_id',      label: 'TikTok Pixel ID',     placeholder: 'Ex: CXXXXXXXXX',       validate: /^C[A-Z0-9]{5,20}$/, icon: 'video', tip: 'ID do pixel TikTok' },
    { key: 'tiktok_event',         label: 'TikTok Evento',       placeholder: 'SubmitForm, etc.',     validate: null,          icon: null,           tip: 'Evento TikTok (opcional)' },
  ]

  var META_EVENTS = ['PageView', 'Lead', 'Purchase', 'CompleteRegistration', 'Contact', 'ViewContent', 'AddToCart', 'InitiateCheckout', 'Schedule']
  var TIKTOK_EVENTS = ['PageView', 'SubmitForm', 'Contact', 'CompleteRegistration', 'ViewContent', 'ClickButton', 'Download', 'PlaceAnOrder']

  async function _loadLinks() {
    var data = await _rpc('short_link_list')
    _links = Array.isArray(data) ? data : []
    _loaded = true
  }

  // ── Count active pixels on a link ─────────────────────────
  function _countPixels(px) {
    if (!px) return 0
    var count = 0
    if (px.meta_pixel_id) count++
    if (px.google_ads_id) count++
    if (px.google_analytics_id) count++
    if (px.tiktok_pixel_id) count++
    if (px.custom_head) count++
    return count
  }

  function _render() {
    var root = document.getElementById('shortLinksRoot')
    if (!root) return
    _baseUrl = window.location.origin + '/r.html?c='

    var html = '<div class="sl-module">'

    // Header
    html += '<div class="sl-header">'
    html += '<div class="sl-title">' + _ico('link', 22) + ' <span>Encurtador de Links</span></div>'
    html += '<button class="sl-add-btn" id="slAddBtn">' + _ico('plus-circle', 14) + ' Novo link</button>'
    html += '</div>'

    // Subtitle
    html += '<p class="sl-subtitle">Crie links curtos com rastreamento de cliques e pixels de conversao para campanhas, mensagens e redes sociais.</p>'

    // Form
    html += '<div class="sl-form" id="slForm" style="display:' + (_showForm ? 'block' : 'none') + '">'
    html += '<div class="sl-form-row">'
    html += '<div class="sl-form-field sl-form-code"><label>Codigo</label><div class="sl-code-input"><span class="sl-code-prefix">/r?c=</span><input class="sl-input" id="slCode" placeholder="niver"></div></div>'
    html += '<div class="sl-form-field" style="flex:2"><label>URL de destino</label><input class="sl-input" id="slUrl" placeholder="https://..."></div>'
    html += '<div class="sl-form-field" style="flex:1"><label>Titulo (opcional)</label><input class="sl-input" id="slTitle" placeholder="Descricao"></div>'
    html += '</div>'

    // Pixel fields in create form
    html += _renderPixelSection('create', {})

    html += '<div class="sl-form-actions">'
    html += '<button class="sl-btn-save" id="slSave">' + _ico('check', 14) + ' Criar link</button>'
    html += '<button class="sl-btn-cancel" id="slCancel">Cancelar</button>'
    html += '</div>'
    html += '</div>'

    // Stats summary
    var totalClicks = 0
    var totalWithPixels = 0
    _links.forEach(function (l) {
      totalClicks += (l.clicks || 0)
      if (_countPixels(l.pixels) > 0) totalWithPixels++
    })
    html += '<div class="sl-stats">'
    html += '<div class="sl-stat"><span class="sl-stat-val">' + _links.length + '</span><span class="sl-stat-lbl">Links</span></div>'
    html += '<div class="sl-stat"><span class="sl-stat-val">' + totalClicks + '</span><span class="sl-stat-lbl">Cliques totais</span></div>'
    html += '<div class="sl-stat"><span class="sl-stat-val">' + totalWithPixels + '</span><span class="sl-stat-lbl">Com pixels</span></div>'
    html += '</div>'

    // Links list
    html += '<div class="sl-list">'
    if (!_loaded) {
      html += '<div class="sl-empty">Carregando...</div>'
    } else if (!_links.length) {
      html += '<div class="sl-empty">Nenhum link criado. Clique em "+ Novo link" para comecar.</div>'
    } else {
      _links.forEach(function (l) {
        var short = _baseUrl + l.code
        var pxCount = _countPixels(l.pixels)
        var isEditing = _editPixels === l.code

        html += '<div class="sl-item' + (isEditing ? ' sl-item-editing' : '') + '">'
        html += '<div class="sl-item-main">'
        html += '<div class="sl-item-left">'
        html += '<div class="sl-item-short" data-copy="' + _esc(short) + '">' + _ico('link', 13) + ' <span>' + _esc(short) + '</span></div>'
        html += '<div class="sl-item-dest">' + _ico('arrow-right', 10) + ' ' + _esc(l.url) + '</div>'
        if (l.title) html += '<div class="sl-item-title">' + _esc(l.title) + '</div>'
        html += '</div>'
        html += '<div class="sl-item-right">'
        html += '<div class="sl-item-clicks">' + _ico('bar-chart-2', 14) + ' <span>' + (l.clicks || 0) + '</span></div>'

        // Pixel badge
        html += '<button class="sl-item-btn sl-pixel-btn' + (pxCount > 0 ? ' sl-pixel-active' : '') + '" data-pixel-toggle="' + _esc(l.code) + '" title="' + (pxCount > 0 ? pxCount + ' pixel(s) ativo(s)' : 'Configurar pixels') + '">'
        html += _ico('zap', 14)
        if (pxCount > 0) html += '<span class="sl-pixel-badge">' + pxCount + '</span>'
        html += '</button>'

        html += '<button class="sl-item-btn sl-copy-btn" data-copy="' + _esc(short) + '" title="Copiar">' + _ico('copy', 14) + '</button>'
        html += '<button class="sl-item-btn sl-open-btn" data-open="' + _esc(short) + '" title="Abrir link">' + _ico('external-link', 14) + '</button>'
        html += '<button class="sl-item-btn sl-del-btn" data-del="' + _esc(l.code) + '" title="Excluir">' + _ico('trash-2', 14) + '</button>'
        html += '</div>'
        html += '</div>' // sl-item-main

        // Inline pixel editor
        if (isEditing) {
          html += '<div class="sl-pixel-editor">'
          html += _renderPixelSection('edit-' + l.code, l.pixels || {})
          html += '<div class="sl-form-actions">'
          html += '<button class="sl-btn-save sl-pixel-save" data-save-pixel="' + _esc(l.code) + '">' + _ico('check', 14) + ' Salvar pixels</button>'
          html += '<button class="sl-btn-cancel sl-pixel-cancel" data-cancel-pixel="' + _esc(l.code) + '">Cancelar</button>'
          html += '</div>'
          html += '</div>'
        }

        html += '</div>' // sl-item
      })
    }
    html += '</div>'
    html += '</div>'

    root.innerHTML = html
    _attachEvents()
  }

  // ── Render pixel config section ───────────────────────────
  function _renderPixelSection(prefix, pixels) {
    var html = ''
    html += '<div class="sl-pixel-section">'
    html += '<div class="sl-pixel-header">'
    html += '<span>' + _ico('zap', 14) + ' Pixels e Tags de Rastreamento</span>'
    html += '</div>'

    // Grid of pixel fields
    html += '<div class="sl-pixel-grid">'
    PIXEL_FIELDS.forEach(function (f) {
      var val = (pixels && pixels[f.key]) || ''
      var isEvent = f.key.indexOf('event') > -1 || f.key === 'ga_event'
      var parentKey = null

      // Sub-field logic: events are indented under their parent
      if (f.key === 'meta_event') parentKey = 'meta_pixel_id'
      if (f.key === 'google_ads_label') parentKey = 'google_ads_id'
      if (f.key === 'ga_event') parentKey = 'google_analytics_id'
      if (f.key === 'tiktok_event') parentKey = 'tiktok_pixel_id'

      var cls = 'sl-pixel-field' + (isEvent ? ' sl-pixel-sub' : '')
      html += '<div class="' + cls + '">'
      html += '<label>' + (f.icon ? _ico(f.icon, 12) + ' ' : '') + f.label + '</label>'

      // Datalist for known events
      if (f.key === 'meta_event') {
        html += '<input class="sl-input sl-pixel-input" data-px-key="' + f.key + '" data-px-prefix="' + prefix + '" list="meta-events-' + prefix + '" placeholder="' + f.placeholder + '" value="' + _esc(val) + '">'
        html += '<datalist id="meta-events-' + prefix + '">'
        META_EVENTS.forEach(function (e) { html += '<option value="' + e + '">' })
        html += '</datalist>'
      } else if (f.key === 'tiktok_event') {
        html += '<input class="sl-input sl-pixel-input" data-px-key="' + f.key + '" data-px-prefix="' + prefix + '" list="tt-events-' + prefix + '" placeholder="' + f.placeholder + '" value="' + _esc(val) + '">'
        html += '<datalist id="tt-events-' + prefix + '">'
        TIKTOK_EVENTS.forEach(function (e) { html += '<option value="' + e + '">' })
        html += '</datalist>'
      } else {
        html += '<input class="sl-input sl-pixel-input" data-px-key="' + f.key + '" data-px-prefix="' + prefix + '" placeholder="' + f.placeholder + '" value="' + _esc(val) + '">'
      }

      if (f.tip) html += '<span class="sl-pixel-tip">' + f.tip + '</span>'
      if (f.validate) html += '<span class="sl-pixel-error" id="pxerr-' + prefix + '-' + f.key + '"></span>'
      html += '</div>'
    })
    html += '</div>'

    // Custom head tags
    var customVal = (pixels && pixels.custom_head) || ''
    html += '<div class="sl-pixel-custom">'
    html += '<label>' + _ico('code', 12) + ' Tags personalizadas (HTML/Script)</label>'
    html += '<textarea class="sl-input sl-pixel-textarea" data-px-key="custom_head" data-px-prefix="' + prefix + '" rows="3" placeholder="Cole aqui scripts de tracking adicionais (GTM, Hotjar, etc.)">' + _esc(customVal) + '</textarea>'
    html += '<span class="sl-pixel-tip">Aceita tags &lt;script&gt; e &lt;noscript&gt;. Executado na pagina de redirecionamento antes do redirect.</span>'
    html += '</div>'

    html += '</div>'
    return html
  }

  // ── Collect pixel values from form ────────────────────────
  function _collectPixels(prefix) {
    var pixels = {}
    var valid = true

    document.querySelectorAll('[data-px-prefix="' + prefix + '"]').forEach(function (el) {
      var key = el.dataset.pxKey
      var val = (el.value || '').trim()
      if (val) pixels[key] = val
    })

    // Validate formats
    PIXEL_FIELDS.forEach(function (f) {
      var errEl = document.getElementById('pxerr-' + prefix + '-' + f.key)
      if (!errEl) return
      var val = pixels[f.key]
      if (val && f.validate && !f.validate.test(val)) {
        errEl.textContent = 'Formato invalido'
        errEl.style.display = 'block'
        valid = false
      } else {
        errEl.textContent = ''
        errEl.style.display = 'none'
      }
    })

    // Warn if event set but no pixel ID
    if (pixels.meta_event && !pixels.meta_pixel_id) { valid = false; _toast('Meta Evento requer Meta Pixel ID', 'error') }
    if (pixels.google_ads_label && !pixels.google_ads_id) { valid = false; _toast('Google Ads Label requer Google Ads ID', 'error') }
    if (pixels.ga_event && !pixels.google_analytics_id) { valid = false; _toast('GA Evento requer Google Analytics ID', 'error') }
    if (pixels.tiktok_event && !pixels.tiktok_pixel_id) { valid = false; _toast('TikTok Evento requer TikTok Pixel ID', 'error') }

    return valid ? pixels : null
  }

  function _attachEvents() {
    var addBtn = document.getElementById('slAddBtn')
    if (addBtn) addBtn.addEventListener('click', function () { _showForm = !_showForm; _editPixels = null; _render() })

    var cancelBtn = document.getElementById('slCancel')
    if (cancelBtn) cancelBtn.addEventListener('click', function () { _showForm = false; _render() })

    var saveBtn = document.getElementById('slSave')
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        var code = (document.getElementById('slCode')?.value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
        var url = (document.getElementById('slUrl')?.value || '').trim()
        var title = (document.getElementById('slTitle')?.value || '').trim()
        if (!code) { _toast('Preencha o codigo', 'error'); return }
        if (!url || !url.startsWith('http')) { _toast('URL invalida', 'error'); return }

        var pixels = _collectPixels('create')
        if (pixels === null) return // validation failed

        saveBtn.disabled = true; saveBtn.textContent = 'Criando...'
        var res = await _rpc('short_link_create', { p_code: code, p_url: url, p_title: title || null, p_pixels: pixels })
        if (res && res.error === 'code_exists') {
          _toast('Codigo ja existe, escolha outro', 'error')
          saveBtn.disabled = false; saveBtn.textContent = 'Criar link'
          return
        }
        _showForm = false
        await _loadLinks()
        _render()
        _toast('Link criado: /r.html?c=' + code, 'success')
      })
    }

    // Copy
    document.querySelectorAll('.sl-copy-btn[data-copy], .sl-item-short[data-copy]').forEach(function (el) {
      el.addEventListener('click', function () {
        navigator.clipboard.writeText(el.dataset.copy).then(function () {
          _toast('Link copiado!', 'success')
        }).catch(function () {
          var inp = document.createElement('input'); inp.value = el.dataset.copy
          document.body.appendChild(inp); inp.select(); document.execCommand('copy')
          document.body.removeChild(inp); _toast('Link copiado!', 'success')
        })
      })
    })

    // Open in new tab
    document.querySelectorAll('[data-open]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        window.open(btn.dataset.open, '_blank')
      })
    })

    // Toggle pixel editor
    document.querySelectorAll('[data-pixel-toggle]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var code = btn.dataset.pixelToggle
        _editPixels = (_editPixels === code) ? null : code
        _showForm = false
        _render()
      })
    })

    // Save pixels
    document.querySelectorAll('[data-save-pixel]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        var code = btn.dataset.savePixel
        var pixels = _collectPixels('edit-' + code)
        if (pixels === null) return

        btn.disabled = true; btn.textContent = 'Salvando...'
        await _rpc('short_link_update_pixels', { p_code: code, p_pixels: pixels })
        _editPixels = null
        await _loadLinks()
        _render()
        _toast('Pixels atualizados', 'success')
      })
    })

    // Cancel pixel edit
    document.querySelectorAll('[data-cancel-pixel]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        _editPixels = null
        _render()
      })
    })

    // Delete
    document.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (!confirm('Excluir este link?')) return
        await _rpc('short_link_delete', { p_code: btn.dataset.del })
        await _loadLinks()
        _render()
        _toast('Link excluido', 'success')
      })
    })
  }

  function _toast(msg, type) {
    var el = document.createElement('div')
    el.className = 'bday-toast bday-toast-' + (type || 'info')
    el.textContent = msg; document.body.appendChild(el)
    setTimeout(function () { el.classList.add('bday-toast-show') }, 10)
    setTimeout(function () { el.remove() }, 3000)
  }

  // Mount
  async function mount() {
    await _loadLinks()
    _render()
  }

  // Auto-mount
  document.addEventListener('DOMContentLoaded', function () {
    var check = setInterval(function () {
      var page = document.getElementById('page-short-links')
      if (page && page.style.display !== 'none' && page.offsetParent !== null) {
        clearInterval(check); mount()
      }
    }, 500)
    setTimeout(function () { clearInterval(check) }, 30000)
  })

  window.ShortLinksUI = Object.freeze({ mount: mount })
})()
