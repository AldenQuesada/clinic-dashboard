/**
 * ClinicAI — B2B UX Kit
 *
 * Utilidades globais: tecla ESC fecha overlays, contadores nas tabs,
 * link de volta ao app. Zero dependência cruzada com módulos de UI.
 * Expõe window.B2BUXKit.
 */
;(function () {
  'use strict'
  if (window.B2BUXKit) return

  var _tabCounts = {}

  // ─── ESC fecha qualquer overlay B2B aberto ──────────────────
  function _onKey(e) {
    if (e.key !== 'Escape') return
    // Tenta fechar cada overlay conhecido em ordem
    var overlays = [
      'b2bFormOverlayHost',
      'b2bDetailOverlayHost',
      'b2bVouchersOverlayHost',
      'b2bGroupsOverlayHost',
      'b2bCandFormOverlayHost',
      'b2bTasksOverlayHost',
    ]
    for (var i = 0; i < overlays.length; i++) {
      var host = document.getElementById(overlays[i])
      if (host && host.innerHTML) {
        host.innerHTML = ''
        return
      }
    }
  }
  document.addEventListener('keydown', _onKey)

  // ─── Contadores nas tabs (ex: Candidatos · 9) ───────────────
  function setTabCount(tabId, count) {
    _tabCounts[tabId] = count
    // Atualiza DOM se tab existir
    var btn = document.querySelector('[data-tab="' + tabId + '"]')
    if (!btn) return
    var label = btn.getAttribute('data-label') || btn.textContent.replace(/\s·\s\d+$/, '')
    if (!btn.getAttribute('data-label')) btn.setAttribute('data-label', label)
    btn.textContent = count > 0 ? (label + ' · ' + count) : label
  }

  function getTabCount(tabId) { return _tabCounts[tabId] || 0 }

  // Escuta eventos de atualização de contadores
  document.addEventListener('b2b:tab-count', function (e) {
    var d = e.detail || {}
    if (d.tab) setTabCount(d.tab, d.count || 0)
  })

  // ─── Inserir link de volta ao app na shell ──────────────────
  function injectBackLink() {
    var title = document.querySelector('.b2b-title')
    if (!title || document.getElementById('b2bBackLink')) return
    var link = document.createElement('a')
    link.id = 'b2bBackLink'
    link.href = '/index.html'
    link.textContent = '← Voltar ao app'
    link.style.cssText = 'display:inline-block;font-size:11px;color:rgba(201,169,110,0.7);text-decoration:none;letter-spacing:.05em;margin-bottom:6px;transition:color .15s'
    link.addEventListener('mouseenter', function () { link.style.color = '#DFC5A0' })
    link.addEventListener('mouseleave', function () { link.style.color = 'rgba(201,169,110,0.7)' })
    title.parentNode.insertBefore(link, title.parentNode.firstChild)
  }

  // Observa quando a shell monta o header
  var obs = new MutationObserver(function () {
    if (document.querySelector('.b2b-title') && !document.getElementById('b2bBackLink')) {
      injectBackLink()
    }
  })
  obs.observe(document.body, { childList: true, subtree: true })

  // Também tenta uma vez imediato (caso shell já esteja pronta)
  setTimeout(injectBackLink, 300)

  // ─── Skeleton loading ───────────────────────────────────────
  // rows: número de linhas · compact: bool (linhas finas)
  function skeleton(opts) {
    opts = opts || {}
    var rows = opts.rows || 4
    var compact = !!opts.compact
    var height = compact ? 24 : 46
    var out = '<div class="b2b-skel-wrap">'
    for (var i = 0; i < rows; i++) {
      out += '<div class="b2b-skel" style="height:' + height + 'px"></div>'
    }
    out += '</div>'
    return out
  }

  window.B2BUXKit = Object.freeze({
    setTabCount: setTabCount,
    getTabCount: getTabCount,
    skeleton: skeleton,
  })
})()
