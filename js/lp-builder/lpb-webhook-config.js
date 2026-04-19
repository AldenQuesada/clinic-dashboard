/**
 * LP Builder · Webhook Config (Onda 27)
 *
 * Modal admin: lista webhooks configurados, permite adicionar/editar/deletar.
 * Botão "Testar" envia POST direto do browser (não via banco).
 *
 * API:
 *   LPBWebhookConfig.open()
 *   LPBWebhookConfig.openDeliveries(webhookId)
 */
;(function () {
  'use strict'
  if (window.LPBWebhookConfig) return

  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }
  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _toast(m, k) { window.LPBToast && window.LPBToast(m, k) }

  var _state = { webhooks: [], editing: null }

  async function open() {
    if (!window.LPBWebhookEngine) { _toast('Engine webhook não carregada', 'error'); return }
    await _refresh()
    _renderList()
  }

  async function _refresh() {
    try {
      var r = await LPBuilder.rpc('lp_webhook_list')
      _state.webhooks = Array.isArray(r) ? r : []
    } catch (err) { _toast('Erro: ' + err.message, 'error'); _state.webhooks = [] }
  }

  function _renderList() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    var rows = _state.webhooks.length
      ? _state.webhooks.map(_renderWebhookCard).join('')
      : '<div style="padding:30px;text-align:center;color:var(--lpb-text-2);font-size:11px">' +
          _ico('link', 22) +
          '<div style="margin-top:10px">Nenhum webhook configurado.</div>' +
          '<div style="font-size:10px;margin-top:4px">Adicione pra integrar com Zapier, n8n ou seu CRM.</div>' +
        '</div>'

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbWhBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:780px;width:96vw;max-height:92vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Webhooks · integrações</h3>' +
            '<button class="lpb-btn-icon" id="lpbWhClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div class="lpb-modal-body" style="overflow:auto;padding:0;flex:1">' + rows + '</div>' +
          '<div class="lpb-modal-footer">' +
            '<div style="font-size:10px;color:var(--lpb-text-2);line-height:1.4">' +
              _ico('info', 11) + ' Disparados via trigger no banco. Worker externo processa fila.' +
            '</div>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn primary" id="lpbWhNew">' + _ico('plus', 12) + ' Novo webhook</button>' +
          '</div>' +
        '</div></div>'

    document.getElementById('lpbWhBg').addEventListener('click', _dismiss)
    document.getElementById('lpbWhClose').onclick = _dismiss
    document.getElementById('lpbWhNew').onclick   = function () { _renderEdit(null) }
    _state.webhooks.forEach(function (w) {
      var card = document.querySelector('[data-wh-id="' + w.id + '"]')
      if (!card) return
      card.querySelector('[data-act="edit"]').onclick     = function () { _renderEdit(w) }
      card.querySelector('[data-act="test"]').onclick     = function () { _testWebhook(w) }
      card.querySelector('[data-act="delete"]').onclick   = function () { _deleteWebhook(w) }
      card.querySelector('[data-act="deliv"]').onclick    = function () { openDeliveries(w.id) }
    })
  }

  function _renderWebhookCard(w) {
    var ev = (w.events && w.events.length) ? w.events.join(', ') : '—'
    var scope = w.page_slug ? '/' + _esc(w.page_slug) : 'todas as LPs'
    var statusDot = w.active
      ? '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--lpb-success);margin-right:6px"></span>'
      : '<span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--lpb-text-2);margin-right:6px"></span>'
    return '<div class="lpb-wh-card" data-wh-id="' + _esc(w.id) + '" style="padding:14px 22px;border-bottom:1px solid var(--lpb-border)">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px">' +
        '<div style="flex:1;min-width:0">' +
          '<div style="font-size:12px;color:var(--lpb-text);font-weight:500">' + statusDot + _esc(w.label || w.url) + '</div>' +
          '<div style="font-size:10px;color:var(--lpb-text-2);margin-top:3px;word-break:break-all">' + _esc(w.url) + '</div>' +
          '<div style="display:flex;gap:8px;font-size:9px;letter-spacing:.06em;text-transform:uppercase;color:var(--lpb-text-2);margin-top:6px">' +
            '<span>' + _esc(scope) + '</span><span>·</span><span>' + _esc(ev) + '</span>' +
            (w.has_secret ? '<span>·</span><span style="color:var(--lpb-success)">' + _ico('lock', 9) + ' assinado</span>' : '') +
          '</div>' +
        '</div>' +
        '<div style="display:flex;gap:4px;flex-shrink:0">' +
          '<button class="lpb-btn-icon" data-act="deliv" title="Ver entregas">' + _ico('list', 14) + '</button>' +
          '<button class="lpb-btn-icon" data-act="test" title="Testar agora">' + _ico('send', 14) + '</button>' +
          '<button class="lpb-btn-icon" data-act="edit" title="Editar">' + _ico('edit-2', 14) + '</button>' +
          '<button class="lpb-btn-icon" data-act="delete" title="Remover" style="color:var(--lpb-danger)">' + _ico('trash-2', 14) + '</button>' +
        '</div>' +
      '</div>' +
    '</div>'
  }

  function _renderEdit(w) {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    var isNew = !w
    var isEdit = !isNew
    var pages = (LPBuilder.getPages && LPBuilder.getPages()) || []
    var slugOpts = '<option value="">— todas as LPs —</option>' + pages.map(function (p) {
      var sel = (w && w.page_slug === p.slug) ? ' selected' : ''
      return '<option value="' + _esc(p.slug) + '"' + sel + '>' + _esc(p.title) + ' · /' + _esc(p.slug) + '</option>'
    }).join('')

    var evChecks = LPBWebhookEngine.KNOWN_EVENTS.map(function (e) {
      var checked = (w && w.events && w.events.indexOf(e.id) >= 0) || (!w && e.id === 'lead.created')
      return '<label style="display:flex;gap:8px;padding:8px 0;border-bottom:1px solid var(--lpb-border);cursor:pointer">' +
        '<input type="checkbox" data-event="' + _esc(e.id) + '" ' + (checked ? 'checked' : '') + '>' +
        '<div style="flex:1">' +
          '<div style="font-size:11px;color:var(--lpb-text)">' + _esc(e.label) + ' · <code style="font-size:10px;color:var(--lpb-accent)">' + _esc(e.id) + '</code></div>' +
          '<div style="font-size:10px;color:var(--lpb-text-2);margin-top:2px">' + _esc(e.desc) + '</div>' +
        '</div>' +
      '</label>'
    }).join('')

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbWhFBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:620px;width:96vw;max-height:92vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>' + (isNew ? 'Novo webhook' : 'Editar webhook') + '</h3>' +
            '<button class="lpb-btn-icon" id="lpbWhFClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div class="lpb-modal-body" style="overflow:auto;flex:1">' +
            '<div class="lpb-field"><div class="lpb-field-label">Nome interno</div>' +
              '<input class="lpb-input" id="lpbWhFLabel" value="' + _esc((w && w.label) || '') + '" placeholder="ex: Zapier · Gmail notify"></div>' +

            '<div class="lpb-field"><div class="lpb-field-label">URL de destino *</div>' +
              '<input class="lpb-input" id="lpbWhFUrl" value="' + _esc((w && w.url) || '') + '" placeholder="https://hooks.zapier.com/..."></div>' +

            '<div class="lpb-field"><div class="lpb-field-label">Aplica a</div>' +
              '<select class="lpb-select" id="lpbWhFSlug">' + slugOpts + '</select>' +
              '<div class="lpb-field-hint">Filtra qual LP dispara este webhook. "Todas" = global.</div></div>' +

            '<div class="lpb-field"><div class="lpb-field-label">Eventos *</div>' +
              '<div style="background:var(--lpb-bg);border:1px solid var(--lpb-border);padding:4px 12px">' + evChecks + '</div></div>' +

            '<div class="lpb-field"><div class="lpb-field-label">Secret (HMAC) — opcional</div>' +
              '<input class="lpb-input" id="lpbWhFSecret" value="" placeholder="' + (isEdit && w.has_secret ? '••• mantido (digite pra alterar)' : 'gerar string aleatória') + '">' +
              '<div class="lpb-field-hint">Se preenchido, request leva header X-LP-Signature: sha256=&lt;hex&gt;.</div></div>' +

            '<div class="lpb-field" style="display:flex;align-items:center;gap:10px">' +
              '<input type="checkbox" id="lpbWhFActive" ' + (!w || w.active ? 'checked' : '') + '>' +
              '<label for="lpbWhFActive" style="cursor:pointer;font-size:12px">Ativo</label></div>' +

          '</div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn ghost" id="lpbWhFBack">Voltar</button>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn primary" id="lpbWhFOk">Salvar</button>' +
          '</div>' +
        '</div></div>'

    document.getElementById('lpbWhFBg').addEventListener('click', function () { _renderList() })
    document.getElementById('lpbWhFClose').onclick = _dismiss
    document.getElementById('lpbWhFBack').onclick  = function () { _renderList() }
    document.getElementById('lpbWhFOk').onclick    = function () { _save(w) }
  }

  async function _save(w) {
    var ok = document.getElementById('lpbWhFOk')
    ok.disabled = true
    var url = document.getElementById('lpbWhFUrl').value.trim()
    var label = document.getElementById('lpbWhFLabel').value.trim()
    var slug = document.getElementById('lpbWhFSlug').value
    var secretInp = document.getElementById('lpbWhFSecret').value.trim()
    var active = document.getElementById('lpbWhFActive').checked
    var events = []
    document.querySelectorAll('input[type="checkbox"][data-event]').forEach(function (cb) {
      if (cb.checked) events.push(cb.dataset.event)
    })

    var cfg = { url: url, events: events, headers: {} }
    var v = LPBWebhookEngine.validateConfig(cfg)
    if (!v.ok) { _toast('Inválido: ' + v.reason, 'error'); ok.disabled = false; return }

    var secret = secretInp || (w && w.has_secret ? null : null)  // null = mantém atual no UPDATE? RPC trata
    try {
      var r = await LPBuilder.rpc('lp_webhook_set', {
        p_id:         w ? w.id : null,
        p_url:        url,
        p_events:     events,
        p_page_slug:  slug || null,
        p_label:      label || null,
        p_secret:     secret,
        p_headers:    {},
        p_active:     active,
      })
      if (!r || !r.ok) throw new Error(r && r.reason || 'falhou')
      _toast(w ? 'Webhook atualizado' : 'Webhook criado', 'success')
      await _refresh()
      _renderList()
    } catch (err) {
      _toast('Erro: ' + err.message, 'error')
      ok.disabled = false
    }
  }

  async function _testWebhook(w) {
    if (!confirm('Disparar POST de teste pra ' + w.url + '?')) return
    var payload = LPBWebhookEngine.buildPayload('test.ping', {
      message: 'Teste manual via LP Builder',
      slug:    w.page_slug || '*',
    }, { source: 'lp-builder-admin' })
    var body = JSON.stringify(payload)
    try {
      var headers = await LPBWebhookEngine.buildHeaders(w, body)
      var resp = await fetch(w.url, { method: 'POST', headers: headers, body: body, mode: 'no-cors' })
      _toast('Teste enviado · status no-cors (verifique destino)', 'success')
    } catch (err) {
      _toast('Erro no envio: ' + err.message, 'error')
    }
  }

  async function _deleteWebhook(w) {
    if (!confirm('Remover webhook "' + (w.label || w.url) + '"?')) return
    try {
      var r = await LPBuilder.rpc('lp_webhook_delete', { p_id: w.id })
      if (!r || !r.ok) throw new Error(r && r.reason || 'falhou')
      _toast('Removido', 'success')
      await _refresh()
      _renderList()
    } catch (err) { _toast('Erro: ' + err.message, 'error') }
  }

  async function openDeliveries(webhookId) {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    var rows = []
    try {
      var r = await LPBuilder.rpc('lp_webhook_deliveries_list', { p_webhook_id: webhookId, p_limit: 100 })
      rows = Array.isArray(r) ? r : []
    } catch (err) { _toast('Erro: ' + err.message, 'error'); return }

    var html = rows.length
      ? '<table style="width:100%;border-collapse:collapse;font-size:11px">' +
          '<thead><tr style="background:var(--lpb-bg);text-align:left">' +
            '<th style="padding:8px 14px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--lpb-text-2)">Quando</th>' +
            '<th style="padding:8px 14px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--lpb-text-2)">Evento</th>' +
            '<th style="padding:8px 14px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--lpb-text-2)">Status</th>' +
            '<th style="padding:8px 14px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--lpb-text-2)">HTTP</th>' +
            '<th style="padding:8px 14px;font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--lpb-text-2)">Tent.</th>' +
          '</tr></thead><tbody>' +
          rows.map(_deliverRow).join('') +
        '</tbody></table>'
      : '<div style="padding:30px;text-align:center;color:var(--lpb-text-2);font-size:11px">Sem entregas registradas.</div>'

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbWhDBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:760px;max-height:90vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Entregas · últimas 100</h3>' +
            '<button class="lpb-btn-icon" id="lpbWhDClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div class="lpb-modal-body" style="padding:0;overflow:auto;flex:1">' + html + '</div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn ghost" id="lpbWhDBack">Voltar</button>' +
          '</div>' +
        '</div></div>'

    document.getElementById('lpbWhDBg').addEventListener('click', function () { _renderList() })
    document.getElementById('lpbWhDClose').onclick = _dismiss
    document.getElementById('lpbWhDBack').onclick  = function () { _renderList() }
  }

  function _deliverRow(d) {
    var statusColor = d.status === 'sent'
      ? 'var(--lpb-success)'
      : d.status === 'failed' ? 'var(--lpb-danger)' : 'var(--lpb-warn)'
    var when = '—'
    try { when = new Date(d.created_at).toLocaleString('pt-BR') } catch (_) {}
    return '<tr>' +
      '<td style="padding:8px 14px;border-bottom:1px solid var(--lpb-border);font-size:10px;color:var(--lpb-text-2)">' + _esc(when) + '</td>' +
      '<td style="padding:8px 14px;border-bottom:1px solid var(--lpb-border)"><code style="font-size:10px">' + _esc(d.event) + '</code></td>' +
      '<td style="padding:8px 14px;border-bottom:1px solid var(--lpb-border)"><span style="color:' + statusColor + ';font-size:10px;letter-spacing:.06em;text-transform:uppercase">' + _esc(d.status) + '</span></td>' +
      '<td style="padding:8px 14px;border-bottom:1px solid var(--lpb-border);font-size:10px">' + (d.response_code || '—') + '</td>' +
      '<td style="padding:8px 14px;border-bottom:1px solid var(--lpb-border);font-size:10px">' + (d.attempts || 0) + '</td>' +
    '</tr>'
  }

  function _dismiss() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (modalRoot) modalRoot.innerHTML = ''
    _state.editing = null
  }

  window.LPBWebhookConfig = Object.freeze({
    open:            open,
    openDeliveries:  openDeliveries,
  })
})()
