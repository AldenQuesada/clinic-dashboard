/**
 * ClinicAI — Short Links UI (standalone page)
 *
 * Encurtador de links com tracking de clicks.
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
  var _baseUrl = ''

  async function _loadLinks() {
    var data = await _rpc('short_link_list')
    _links = Array.isArray(data) ? data : []
    _loaded = true
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
    html += '<p class="sl-subtitle">Crie links curtos com rastreamento de cliques para campanhas, mensagens e redes sociais.</p>'

    // Form
    html += '<div class="sl-form" id="slForm" style="display:' + (_showForm ? 'block' : 'none') + '">'
    html += '<div class="sl-form-row">'
    html += '<div class="sl-form-field sl-form-code"><label>C\u00f3digo</label><div class="sl-code-input"><span class="sl-code-prefix">/r?c=</span><input class="sl-input" id="slCode" placeholder="niver"></div></div>'
    html += '<div class="sl-form-field" style="flex:2"><label>URL de destino</label><input class="sl-input" id="slUrl" placeholder="https://..."></div>'
    html += '<div class="sl-form-field" style="flex:1"><label>T\u00edtulo (opcional)</label><input class="sl-input" id="slTitle" placeholder="Descri\u00e7\u00e3o"></div>'
    html += '</div>'
    html += '<div class="sl-form-actions">'
    html += '<button class="sl-btn-save" id="slSave">' + _ico('check', 14) + ' Criar link</button>'
    html += '<button class="sl-btn-cancel" id="slCancel">Cancelar</button>'
    html += '</div>'
    html += '</div>'

    // Stats summary
    var totalClicks = 0
    _links.forEach(function (l) { totalClicks += (l.clicks || 0) })
    html += '<div class="sl-stats">'
    html += '<div class="sl-stat"><span class="sl-stat-val">' + _links.length + '</span><span class="sl-stat-lbl">Links</span></div>'
    html += '<div class="sl-stat"><span class="sl-stat-val">' + totalClicks + '</span><span class="sl-stat-lbl">Cliques totais</span></div>'
    html += '</div>'

    // Links list
    html += '<div class="sl-list">'
    if (!_loaded) {
      html += '<div class="sl-empty">Carregando...</div>'
    } else if (!_links.length) {
      html += '<div class="sl-empty">Nenhum link criado. Clique em "+ Novo link" para come\u00e7ar.</div>'
    } else {
      _links.forEach(function (l) {
        var short = _baseUrl + l.code
        html += '<div class="sl-item">'
        html += '<div class="sl-item-left">'
        html += '<div class="sl-item-short" data-copy="' + _esc(short) + '">' + _ico('link', 13) + ' <span>' + _esc(short) + '</span></div>'
        html += '<div class="sl-item-dest">' + _ico('arrow-right', 10) + ' ' + _esc(l.url) + '</div>'
        if (l.title) html += '<div class="sl-item-title">' + _esc(l.title) + '</div>'
        html += '</div>'
        html += '<div class="sl-item-right">'
        html += '<div class="sl-item-clicks">' + _ico('bar-chart-2', 14) + ' <span>' + (l.clicks || 0) + '</span></div>'
        html += '<button class="sl-item-btn sl-copy-btn" data-copy="' + _esc(short) + '" title="Copiar">' + _ico('copy', 14) + '</button>'
        html += '<button class="sl-item-btn sl-del-btn" data-del="' + _esc(l.code) + '" title="Excluir">' + _ico('trash-2', 14) + '</button>'
        html += '</div>'
        html += '</div>'
      })
    }
    html += '</div>'
    html += '</div>'

    root.innerHTML = html
    _attachEvents()
  }

  function _attachEvents() {
    var addBtn = document.getElementById('slAddBtn')
    if (addBtn) addBtn.addEventListener('click', function () { _showForm = !_showForm; _render() })

    var cancelBtn = document.getElementById('slCancel')
    if (cancelBtn) cancelBtn.addEventListener('click', function () { _showForm = false; _render() })

    var saveBtn = document.getElementById('slSave')
    if (saveBtn) {
      saveBtn.addEventListener('click', async function () {
        var code = (document.getElementById('slCode')?.value || '').trim().toLowerCase().replace(/[^a-z0-9-]/g, '')
        var url = (document.getElementById('slUrl')?.value || '').trim()
        var title = (document.getElementById('slTitle')?.value || '').trim()
        if (!code) { _toast('Preencha o c\u00f3digo', 'error'); return }
        if (!url || !url.startsWith('http')) { _toast('URL inv\u00e1lida', 'error'); return }
        saveBtn.disabled = true; saveBtn.textContent = 'Criando...'
        await _rpc('short_link_create', { p_code: code, p_url: url, p_title: title || null })
        _showForm = false
        await _loadLinks()
        _render()
        _toast('Link criado: /r.html?c=' + code, 'success')
      })
    }

    // Copy
    document.querySelectorAll('[data-copy]').forEach(function (el) {
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

    // Delete
    document.querySelectorAll('[data-del]').forEach(function (btn) {
      btn.addEventListener('click', async function () {
        if (!confirm('Excluir este link?')) return
        await _rpc('short_link_delete', { p_code: btn.dataset.del })
        await _loadLinks()
        _render()
        _toast('Link exclu\u00eddo', 'success')
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
