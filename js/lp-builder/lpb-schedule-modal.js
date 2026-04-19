/**
 * LP Builder · Schedule Modal (Onda 23)
 *
 * Modal admin pra agendar publicação/despublicação. Não decide nada —
 * só lê config atual, valida via engine e persiste via RPC.
 *
 * API:
 *   LPBScheduleModal.open(pageId)
 */
;(function () {
  'use strict'
  if (window.LPBScheduleModal) return

  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }
  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _toast(m, k) { window.LPBToast && window.LPBToast(m, k) }

  var REASON_TXT = {
    publish_at_past:           'A data de publicação já passou. Use uma futura.',
    unpublish_at_past:         'A data de expiração já passou.',
    unpublish_before_publish:  'A data de expiração precisa ser depois da publicação.',
    publish_at_invalid:        'Data de publicação inválida.',
    unpublish_at_invalid:      'Data de expiração inválida.',
  }

  async function open(pageId) {
    if (!pageId) { _toast('Página inválida', 'error'); return }
    if (!window.LPBScheduleEngine) { _toast('Engine de agenda não carregada', 'error'); return }

    var page = null
    try {
      var r = await LPBuilder.rpc('lp_page_get', { p_id: pageId })
      page = (r && r.ok) ? r : null
    } catch (_) {}
    if (!page) { _toast('Erro ao carregar página', 'error'); return }

    _render(page)
  }

  function _render(page) {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    var state = LPBScheduleEngine.computeState(page)
    var pIn = LPBScheduleEngine.toLocalInput(page.publish_at)
    var uIn = LPBScheduleEngine.toLocalInput(page.unpublish_at)

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbScdBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:560px;width:96vw">' +
          '<div class="lpb-modal-h">' +
            '<h3>Agendar publicação</h3>' +
            '<button class="lpb-btn-icon" id="lpbScdClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div class="lpb-modal-body">' +

            '<div style="background:var(--lpb-bg);border:1px solid var(--lpb-border);padding:12px 14px;margin-bottom:16px;font-size:11px;color:var(--lpb-text-2);line-height:1.6">' +
              _ico('info', 11) + ' Status atual: <strong style="color:var(--lpb-text)">' + _esc(state.message) + '</strong>' +
              '<br>Cron roda a cada 5min. Após salvar, a transição é automática.' +
            '</div>' +

            '<div class="lpb-field">' +
              '<div class="lpb-field-label">' + _ico('upload-cloud', 12) + ' Publicar em (opcional)</div>' +
              '<input type="datetime-local" class="lpb-input" id="lpbScdPub" value="' + _esc(pIn) + '">' +
              '<div class="lpb-field-hint">Se preencher, a página passa de rascunho a publicada automaticamente nesta data/hora.</div>' +
            '</div>' +

            '<div class="lpb-field" style="margin-top:14px">' +
              '<div class="lpb-field-label">' + _ico('archive', 12) + ' Expirar em (opcional · campanha sazonal)</div>' +
              '<input type="datetime-local" class="lpb-input" id="lpbScdUnpub" value="' + _esc(uIn) + '">' +
              '<div class="lpb-field-hint">Se preencher, a página será arquivada automaticamente. Útil pra promoções por tempo limitado.</div>' +
            '</div>' +

            '<div style="background:var(--lpb-surface-2);border:1px solid var(--lpb-border);padding:10px 12px;margin-top:18px;font-size:10px;color:var(--lpb-text-2);line-height:1.55">' +
              _ico('zap', 11) + ' <strong>Dica:</strong> Mãe (10/maio) → publique a campanha em 01/maio às 08:00 e expire em 14/maio às 23:59.' +
            '</div>' +

          '</div>' +
          '<div class="lpb-modal-footer">' +
            (page.publish_at || page.unpublish_at
              ? '<button class="lpb-btn ghost" id="lpbScdClear" style="color:var(--lpb-danger)">' + _ico('trash-2', 12) + ' Limpar agendamento</button>'
              : '<div></div>') +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn ghost" id="lpbScdCancel">Cancelar</button>' +
            '<button class="lpb-btn primary" id="lpbScdOk">Salvar</button>' +
          '</div>' +
        '</div></div>'

    document.getElementById('lpbScdBg').addEventListener('click', _dismiss)
    document.getElementById('lpbScdClose').onclick  = _dismiss
    document.getElementById('lpbScdCancel').onclick = _dismiss

    var clearBtn = document.getElementById('lpbScdClear')
    if (clearBtn) clearBtn.onclick = function () { _clear(page.id) }

    document.getElementById('lpbScdOk').onclick = function () { _save(page.id) }
  }

  async function _save(pageId) {
    var ok = document.getElementById('lpbScdOk')
    ok.disabled = true
    var pubInp   = document.getElementById('lpbScdPub').value
    var unpubInp = document.getElementById('lpbScdUnpub').value
    var publishAt   = LPBScheduleEngine.fromLocalInput(pubInp)
    var unpublishAt = LPBScheduleEngine.fromLocalInput(unpubInp)

    var v = LPBScheduleEngine.validateRange(publishAt, unpublishAt)
    if (!v.ok) {
      _toast(REASON_TXT[v.reason] || ('Inválido: ' + v.reason), 'error')
      ok.disabled = false
      return
    }
    if (!publishAt && !unpublishAt) {
      _toast('Preencha pelo menos uma data ou clique em Limpar agendamento', 'error')
      ok.disabled = false
      return
    }

    try {
      var r = await LPBuilder.rpc('lp_page_set_schedule', {
        p_id:           pageId,
        p_publish_at:   publishAt,
        p_unpublish_at: unpublishAt,
      })
      if (!r || !r.ok) throw new Error(r && r.reason || 'falhou')
      _toast('Agendamento salvo · cron aplica a cada 5min', 'success')
      _dismiss()
      await LPBuilder.loadPages()
    } catch (err) {
      _toast('Erro: ' + err.message, 'error')
      ok.disabled = false
    }
  }

  async function _clear(pageId) {
    if (!confirm('Remover agendamento desta LP?')) return
    try {
      var r = await LPBuilder.rpc('lp_page_clear_schedule', { p_id: pageId })
      if (!r || !r.ok) throw new Error(r && r.reason || 'falhou')
      _toast('Agendamento removido', 'success')
      _dismiss()
      await LPBuilder.loadPages()
    } catch (err) { _toast('Erro: ' + err.message, 'error') }
  }

  function _dismiss() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (modalRoot) modalRoot.innerHTML = ''
  }

  window.LPBScheduleModal = Object.freeze({ open: open })
})()
