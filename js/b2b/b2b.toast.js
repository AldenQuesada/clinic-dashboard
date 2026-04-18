/**
 * ClinicAI — B2B Toast system
 *
 * Substituto dos alert/confirm nativos. Zero dependência, zero DOM cruzado.
 * Expõe window.B2BToast.
 *
 * API:
 *   B2BToast.success(msg, opts?)
 *   B2BToast.error(msg, opts?)
 *   B2BToast.info(msg, opts?)
 *   B2BToast.warn(msg, opts?)
 *   B2BToast.confirm(msg, opts?) → Promise<boolean>   (substitui confirm())
 *   B2BToast.prompt(msg, defaultVal?, opts?) → Promise<string|null>
 *
 * Opts: { duration?: ms (default 4000), title?, action?: { label, onClick } }
 */
;(function () {
  'use strict'
  if (window.B2BToast) return

  var COLORS = {
    success: { bg:'#064E3B', border:'#10B981', icon:'✓' },
    error:   { bg:'#4C0F0F', border:'#EF4444', icon:'✕' },
    info:    { bg:'#1E2E4A', border:'#6B8AD3', icon:'ⓘ' },
    warn:    { bg:'#4C3300', border:'#F59E0B', icon:'⚠' },
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _host() {
    var h = document.getElementById('b2bToastHost')
    if (!h) {
      h = document.createElement('div')
      h.id = 'b2bToastHost'
      h.style.cssText = 'position:fixed;top:20px;right:20px;z-index:2000;display:flex;flex-direction:column;gap:10px;max-width:420px;pointer-events:none'
      document.body.appendChild(h)
    }
    return h
  }

  function _render(kind, msg, opts) {
    opts = opts || {}
    var c = COLORS[kind] || COLORS.info
    var el = document.createElement('div')
    el.style.cssText =
      'background:' + c.bg + ';border-left:3px solid ' + c.border + ';' +
      'color:#F5F0E8;padding:14px 16px;border-radius:6px;' +
      'font-family:Montserrat,sans-serif;font-size:13px;line-height:1.5;' +
      'box-shadow:0 8px 24px rgba(0,0,0,0.4);' +
      'display:flex;align-items:flex-start;gap:12px;' +
      'opacity:0;transform:translateX(20px);transition:all .25s ease-out;' +
      'pointer-events:auto;cursor:pointer'

    var closeIcon = '<span aria-hidden="true" style="position:absolute;top:8px;right:10px;color:rgba(245,240,232,0.5);font-size:16px;line-height:1">×</span>'
    el.innerHTML =
      '<span style="color:' + c.border + ';font-size:16px;flex-shrink:0;margin-top:1px">' + c.icon + '</span>' +
      '<div style="flex:1;min-width:0;position:relative;padding-right:16px">' +
        (opts.title ? '<div style="font-weight:600;margin-bottom:2px">' + _esc(opts.title) + '</div>' : '') +
        '<div>' + _esc(msg) + '</div>' +
        (opts.action
          ? '<button type="button" style="margin-top:8px;padding:4px 10px;background:transparent;border:1px solid ' + c.border + ';color:' + c.border + ';border-radius:4px;font-size:11px;cursor:pointer;font-weight:600;letter-spacing:.5px">' + _esc(opts.action.label) + '</button>'
          : '') +
        closeIcon +
      '</div>'

    _host().appendChild(el)
    // in
    requestAnimationFrame(function () {
      el.style.opacity = '1'
      el.style.transform = 'translateX(0)'
    })

    var removed = false
    function remove() {
      if (removed) return; removed = true
      el.style.opacity = '0'
      el.style.transform = 'translateX(20px)'
      setTimeout(function () { el.remove() }, 250)
    }

    var actionBtn = el.querySelector('button')
    if (actionBtn && opts.action) {
      actionBtn.addEventListener('click', function (e) {
        e.stopPropagation()
        try { opts.action.onClick && opts.action.onClick() } catch (_) {}
        remove()
      })
    }

    el.addEventListener('click', remove)

    var duration = opts.duration != null ? opts.duration : 4000
    if (duration > 0) setTimeout(remove, duration)
    return remove
  }

  function success(msg, opts) { return _render('success', msg, opts) }
  function error(msg, opts)   { return _render('error',   msg, opts) }
  function info(msg, opts)    { return _render('info',    msg, opts) }
  function warn(msg, opts)    { return _render('warn',    msg, opts) }

  // ─── Confirm modal (promise) ────────────────────────────
  function confirmModal(msg, opts) {
    opts = opts || {}
    return new Promise(function (resolve) {
      var overlay = document.createElement('div')
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,13,10,0.82);z-index:2100;display:flex;align-items:center;justify-content:center;padding:20px'
      overlay.innerHTML =
        '<div style="background:#1A1713;border:1px solid rgba(201,169,110,0.35);border-radius:10px;max-width:460px;width:100%;padding:28px 28px 20px;color:#F5F0E8;font-family:Montserrat,sans-serif">' +
          (opts.title ? '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:#C9A96E;margin-bottom:10px">' + _esc(opts.title) + '</div>' : '') +
          '<div style="font-size:14px;line-height:1.6;margin-bottom:24px;white-space:pre-wrap">' + _esc(msg) + '</div>' +
          '<div style="display:flex;justify-content:flex-end;gap:10px">' +
            '<button data-cancel class="b2b-btn" type="button">' + _esc(opts.cancelLabel || 'Cancelar') + '</button>' +
            '<button data-ok class="b2b-btn b2b-btn-primary" type="button">' + _esc(opts.okLabel || 'Confirmar') + '</button>' +
          '</div>' +
        '</div>'
      document.body.appendChild(overlay)

      function cleanup(value) {
        overlay.remove()
        document.removeEventListener('keydown', onKey)
        resolve(value)
      }
      function onKey(e) {
        if (e.key === 'Escape') cleanup(false)
        if (e.key === 'Enter')  cleanup(true)
      }
      overlay.querySelector('[data-ok]').addEventListener('click',     function () { cleanup(true) })
      overlay.querySelector('[data-cancel]').addEventListener('click', function () { cleanup(false) })
      overlay.addEventListener('click', function (e) { if (e.target === overlay) cleanup(false) })
      document.addEventListener('keydown', onKey)
      // Autofocus no OK
      overlay.querySelector('[data-ok]').focus()
    })
  }

  // ─── Prompt modal (promise → string|null) ─────────────────
  function promptModal(msg, defaultVal, opts) {
    opts = opts || {}
    return new Promise(function (resolve) {
      var overlay = document.createElement('div')
      overlay.style.cssText = 'position:fixed;inset:0;background:rgba(15,13,10,0.82);z-index:2100;display:flex;align-items:center;justify-content:center;padding:20px'
      overlay.innerHTML =
        '<form style="background:#1A1713;border:1px solid rgba(201,169,110,0.35);border-radius:10px;max-width:520px;width:100%;padding:28px;color:#F5F0E8;font-family:Montserrat,sans-serif">' +
          (opts.title ? '<div style="font-family:\'Cormorant Garamond\',serif;font-size:22px;color:#C9A96E;margin-bottom:10px">' + _esc(opts.title) + '</div>' : '') +
          '<div style="font-size:14px;line-height:1.6;margin-bottom:14px">' + _esc(msg) + '</div>' +
          '<input type="text" value="' + _esc(defaultVal || '') + '" style="width:100%;padding:10px 12px;background:#211D17;border:1px solid rgba(201,169,110,0.35);border-radius:5px;color:#F5F0E8;font-family:inherit;font-size:13px;box-sizing:border-box;margin-bottom:20px" autofocus>' +
          '<div style="display:flex;justify-content:flex-end;gap:10px">' +
            '<button data-cancel type="button" class="b2b-btn">Cancelar</button>' +
            '<button data-ok type="submit" class="b2b-btn b2b-btn-primary">' + _esc(opts.okLabel || 'OK') + '</button>' +
          '</div>' +
        '</form>'
      document.body.appendChild(overlay)

      var form = overlay.querySelector('form')
      var input = overlay.querySelector('input')

      function cleanup(value) {
        overlay.remove()
        document.removeEventListener('keydown', onKey)
        resolve(value)
      }
      function onKey(e) { if (e.key === 'Escape') cleanup(null) }

      form.addEventListener('submit', function (e) {
        e.preventDefault()
        cleanup(input.value)
      })
      overlay.querySelector('[data-cancel]').addEventListener('click', function () { cleanup(null) })
      overlay.addEventListener('click', function (e) { if (e.target === overlay) cleanup(null) })
      document.addEventListener('keydown', onKey)
      setTimeout(function () { input.select() }, 30)
    })
  }

  window.B2BToast = Object.freeze({
    success: success,
    error:   error,
    info:    info,
    warn:    warn,
    confirm: confirmModal,
    prompt:  promptModal,
  })
})()
