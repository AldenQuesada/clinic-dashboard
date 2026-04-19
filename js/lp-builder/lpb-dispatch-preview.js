/**
 * LP Builder · Dispatch Preview (mockup WhatsApp)
 *
 * Modal mostra o link da LP em 3 mockups de mensagem WhatsApp
 * (D+0 / D+7 / D+14) com UTM auto-gerado. Permite copiar
 * mensagem inteira ou só o link.
 *
 * Independente do resto — testável isolado:
 *   var url = LPBDispatch.buildLink('lifting-5d', 'd0')
 *   LPBDispatch.open()
 */
;(function () {
  'use strict'
  if (window.LPBDispatch) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  // ────────────────────────────────────────────────────────────
  // Templates
  // ────────────────────────────────────────────────────────────
  var TEMPLATES = [
    {
      id: 'd0',
      label: 'D+0 · Logo após avaliação',
      text:  'Oi {{nome}}! Como combinado na avaliação, segue o material completo do {{titulo}}:\n\n{{link}}\n\nQualquer dúvida, é só me chamar por aqui.',
    },
    {
      id: 'd7',
      label: 'D+7 · Lembrança contextual',
      text:  'Oi {{nome}}, tudo bem? Lembrando que separei pra você os detalhes do {{titulo}}. Se quiser conversar sem compromisso, é só responder.\n\n{{link}}',
    },
    {
      id: 'd14',
      label: 'D+14 · Última lembrança',
      text:  '{{nome}}, espero que esteja bem. Vi que ainda não conversamos sobre o {{titulo}}. Se preferir, posso te chamar pra uma conversa rápida — me diz qual horário fica melhor.',
    },
  ]

  // ────────────────────────────────────────────────────────────
  // API
  // ────────────────────────────────────────────────────────────
  function buildLink(slug, day) {
    if (!slug) return ''
    var origin = window.location.origin
    var sid = 'wa_' + Math.random().toString(36).slice(2, 9)
    var qs = [
      's=' + encodeURIComponent(slug),
      'utm_source=wa',
      'utm_medium=lara',
      'utm_campaign=' + encodeURIComponent(slug),
      'utm_content=' + encodeURIComponent(day || 'msg'),
      'sid=' + sid,
    ]
    return origin + '/lp.html?' + qs.join('&')
  }

  function buildMessage(template, slug, title) {
    var link = buildLink(slug, template.id)
    return template.text
      .replace(/\{\{nome\}\}/g,   '{{nome}}')      // mantém placeholder pro user
      .replace(/\{\{titulo\}\}/g, title || slug)
      .replace(/\{\{link\}\}/g,   link)
  }

  // ────────────────────────────────────────────────────────────
  // Modal UI
  // ────────────────────────────────────────────────────────────
  function open() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    if (!window.LPBuilder) return
    var page = LPBuilder.getCurrentPage()
    if (!page) {
      LPBToast && LPBToast('Abra uma página primeiro', 'error')
      return
    }
    var slug  = page.slug
    var title = page.title
    var isDraft = page.status !== 'published'

    var msgsHtml = TEMPLATES.map(function (tpl) {
      var msg = buildMessage(tpl, slug, title)
      return '<div style="border-bottom:1px solid var(--lpb-border);padding:14px 18px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">' +
          '<small style="color:var(--lpb-accent);font-size:9px;letter-spacing:.2em;text-transform:uppercase;font-weight:600">' + _esc(tpl.label) + '</small>' +
          '<button class="lpb-btn sm" data-copy-msg="' + _esc(tpl.id) + '">' + _ico('copy', 11) + ' Copiar</button>' +
        '</div>' +
        '<div data-msg-text="' + _esc(tpl.id) + '" style="background:#DCF8C6;color:#0D2F2C;padding:12px 14px;font-family:-apple-system,BlinkMacSystemFont,sans-serif;font-size:12.5px;line-height:1.55;white-space:pre-wrap;border-radius:0 8px 8px 8px;max-width:84%;position:relative">' +
          _esc(msg) +
        '</div>' +
        '</div>'
    }).join('')

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbDsBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:560px;max-height:90vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Pré-visualizar disparo · WhatsApp</h3>' +
            '<button class="lpb-btn-icon" id="lpbDsClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div style="background:#075E54;padding:14px 18px;color:#fff;display:flex;align-items:center;gap:10px">' +
            '<div style="width:36px;height:36px;border-radius:100%;background:#1FAF54;display:flex;align-items:center;justify-content:center;font-family:Cormorant Garamond,serif;font-size:18px;font-style:italic">M</div>' +
            '<div>' +
              '<div style="font-size:13px;font-weight:500">Lara · Clínica Mirian</div>' +
              '<div style="font-size:10px;opacity:.8">online</div>' +
            '</div>' +
            '<div style="flex:1;text-align:right;font-size:9px;opacity:.7;letter-spacing:.1em">PREVIEW</div>' +
          '</div>' +
          '<div class="lpb-modal-body" style="flex:1;overflow:auto;padding:0;background:#E5DDD5">' +
            (isDraft
              ? '<div style="background:rgba(251,191,36,0.12);border-bottom:1px solid var(--lpb-border);padding:10px 18px;font-size:11px;color:var(--lpb-warn)">' +
                  _ico('alert-triangle', 12) + ' Página em rascunho — link só funciona após publicar.' +
                '</div>'
              : '') +
            msgsHtml +
          '</div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn ghost" id="lpbDsCancel">Fechar</button>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn" id="lpbDsCopyLink">' + _ico('link', 12) + ' Copiar só o link' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg     = document.getElementById('lpbDsBg')
    var close  = document.getElementById('lpbDsClose')
    var cancel = document.getElementById('lpbDsCancel')
    var copyLn = document.getElementById('lpbDsCopyLink')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
    cancel.onclick = dismiss

    copyLn.onclick = function () {
      var link = buildLink(slug, 'msg')
      _copy(link, 'Link copiado')
    }

    modalRoot.querySelectorAll('[data-copy-msg]').forEach(function (b) {
      b.onclick = function () {
        var id = b.dataset.copyMsg
        var tpl = TEMPLATES.find(function (t) { return t.id === id })
        if (!tpl) return
        var msg = buildMessage(tpl, slug, title)
        _copy(msg, 'Mensagem copiada')
      }
    })
  }

  function _copy(text, toastMsg) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        LPBToast && LPBToast(toastMsg, 'success')
      }).catch(function () {
        _fallbackCopy(text, toastMsg)
      })
    } else {
      _fallbackCopy(text, toastMsg)
    }
  }
  function _fallbackCopy(text, toastMsg) {
    var ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'; ta.style.opacity = '0'
    document.body.appendChild(ta)
    ta.select()
    try { document.execCommand('copy'); LPBToast && LPBToast(toastMsg, 'success') } catch (_) {}
    document.body.removeChild(ta)
  }

  window.LPBDispatch = Object.freeze({
    TEMPLATES:    TEMPLATES,
    buildLink:    buildLink,
    buildMessage: buildMessage,
    open:         open,
  })
})()
