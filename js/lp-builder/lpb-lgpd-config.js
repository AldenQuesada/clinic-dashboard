/**
 * LP Builder · LGPD Config Modal (Onda 21)
 *
 * Modal admin pra configurar banner LGPD por LP. Sem lógica de banner,
 * só persiste config via RPC lp_page_set_lgpd. O preview real do banner
 * usa a engine pura LPBLgpdEngine.
 *
 * API:
 *   LPBLgpdConfig.open(pageId)
 */
;(function () {
  'use strict'
  if (window.LPBLgpdConfig) return

  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }
  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _toast(m, k) { window.LPBToast && window.LPBToast(m, k) }

  var _state = { pageId: null, config: null }

  async function open(pageId) {
    if (!pageId) { _toast('Página inválida', 'error'); return }
    if (!window.LPBLgpdEngine) { _toast('Engine LGPD não carregada', 'error'); return }

    _state.pageId = pageId
    var current = {}
    try {
      var r = await LPBuilder.rpc('lp_page_get', { p_id: pageId })
      current = (r && r.ok && r.lgpd_config) || {}
    } catch (_) {}

    _state.config = LPBLgpdEngine.resolveConfig(current)
    _render()
  }

  function _render() {
    var c = _state.config
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbLgBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:760px;width:96vw;max-height:92vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>LGPD · Cookie consent</h3>' +
            '<button class="lpb-btn-icon" id="lpbLgClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div class="lpb-modal-body" style="overflow:auto;flex:1">' +

            '<div style="background:var(--lpb-bg);border:1px solid var(--lpb-border);padding:10px 12px;margin-bottom:14px;font-size:11px;color:var(--lpb-text-2);line-height:1.6">' +
              'A LGPD (Lei 13.709/18) exige consentimento explícito antes de capturar dados pessoais. ' +
              'Este banner aparece na primeira visita e bloqueia GA4/FB Pixel até decisão.' +
            '</div>' +

            '<div class="lpb-field" style="display:flex;align-items:center;gap:10px;margin-bottom:14px">' +
              '<input type="checkbox" id="lpbLgEnabled" ' + (c.enabled ? 'checked' : '') + '>' +
              '<label for="lpbLgEnabled" style="cursor:pointer;font-size:12px">Ativar banner LGPD nesta LP</label>' +
            '</div>' +

            '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-accent);font-weight:600;margin:6px 0 10px">Aparência</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
              '<div class="lpb-field"><div class="lpb-field-label">Modo</div>' +
                '<select class="lpb-select" id="lpbLgMode">' +
                  '<option value="banner"' + (c.mode === 'banner' ? ' selected' : '') + '>Banner (rodapé · não bloqueia)</option>' +
                  '<option value="modal"' + (c.mode === 'modal' ? ' selected' : '') + '>Modal (centro · bloqueante)</option>' +
                '</select></div>' +
              '<div class="lpb-field"><div class="lpb-field-label">URL da Política de Privacidade</div>' +
                '<input class="lpb-input" id="lpbLgPolicy" value="' + _esc(c.policy_url) + '" placeholder="https://clinicamirian.com.br/privacidade"></div>' +
            '</div>' +
            '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:6px">' +
              _color('lpbLgT_bg',     'Fundo',   c.theme.bg) +
              _color('lpbLgT_text',   'Texto',   c.theme.text) +
              _color('lpbLgT_accent', 'Acento',  c.theme.accent) +
              _color('lpbLgT_atext',  'Texto btn', c.theme.accent_text) +
              _color('lpbLgT_border', 'Borda',   c.theme.border) +
            '</div>' +

            '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-accent);font-weight:600;margin:18px 0 10px">Textos</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
              _txt('lpbLgX_title',      'Título',           c.texts.title) +
              _txt('lpbLgX_accept',     'Botão aceitar',    c.texts.accept_all) +
              _txta('lpbLgX_message',   'Mensagem principal', c.texts.message, 2) +
              _txt('lpbLgX_reject',     'Botão recusar',    c.texts.reject_all) +
              _txt('lpbLgX_customize',  'Botão personalizar', c.texts.customize) +
              _txt('lpbLgX_save',       'Botão salvar',     c.texts.save) +
            '</div>' +

            '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-accent);font-weight:600;margin:18px 0 10px">Preview ao vivo</div>' +
            '<div id="lpbLgPreview" style="border:1px dashed var(--lpb-border);background:var(--lpb-bg);min-height:140px;position:relative;overflow:hidden;border-radius:2px"></div>' +
            '<div style="font-size:10px;color:var(--lpb-text-2);margin-top:6px;font-style:italic">Preview não persiste a escolha — só visualização.</div>' +
          '</div>' +
          '<div class="lpb-modal-footer">' +
            '<div style="font-size:10px;color:var(--lpb-text-2)">' + _ico('shield', 11) + ' Categoria <strong>Essenciais</strong> sempre ativa (LGPD).</div>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn ghost" id="lpbLgCancel">Cancelar</button>' +
            '<button class="lpb-btn primary" id="lpbLgOk">Salvar</button>' +
          '</div>' +
        '</div></div>'

    document.getElementById('lpbLgBg').addEventListener('click', _dismiss)
    document.getElementById('lpbLgClose').onclick  = _dismiss
    document.getElementById('lpbLgCancel').onclick = _dismiss
    document.getElementById('lpbLgOk').onclick     = _save
    _attachLive()
    _renderPreview()
  }

  function _color(id, label, val) {
    return '<div class="lpb-field"><div class="lpb-field-label">' + _esc(label) + '</div>' +
      '<input class="lpb-input" type="color" id="' + id + '" value="' + _esc(val) + '" style="height:36px;padding:2px"></div>'
  }
  function _txt(id, label, val) {
    return '<div class="lpb-field"><div class="lpb-field-label">' + _esc(label) + '</div>' +
      '<input class="lpb-input" id="' + id + '" value="' + _esc(val) + '"></div>'
  }
  function _txta(id, label, val, rows) {
    return '<div class="lpb-field" style="grid-column:1/-1"><div class="lpb-field-label">' + _esc(label) + '</div>' +
      '<textarea class="lpb-input" id="' + id + '" rows="' + (rows || 2) + '" style="resize:vertical">' + _esc(val) + '</textarea></div>'
  }

  function _readForm() {
    var c = JSON.parse(JSON.stringify(_state.config))
    c.enabled    = document.getElementById('lpbLgEnabled').checked
    c.mode       = document.getElementById('lpbLgMode').value
    c.policy_url = document.getElementById('lpbLgPolicy').value.trim()
    c.theme.bg          = document.getElementById('lpbLgT_bg').value
    c.theme.text        = document.getElementById('lpbLgT_text').value
    c.theme.accent      = document.getElementById('lpbLgT_accent').value
    c.theme.accent_text = document.getElementById('lpbLgT_atext').value
    c.theme.border      = document.getElementById('lpbLgT_border').value
    c.texts.title      = document.getElementById('lpbLgX_title').value
    c.texts.accept_all = document.getElementById('lpbLgX_accept').value
    c.texts.message    = document.getElementById('lpbLgX_message').value
    c.texts.reject_all = document.getElementById('lpbLgX_reject').value
    c.texts.customize  = document.getElementById('lpbLgX_customize').value
    c.texts.save       = document.getElementById('lpbLgX_save').value
    c.version          = String(c.version || '1.0')
    return c
  }

  function _attachLive() {
    var ids = ['lpbLgEnabled','lpbLgMode','lpbLgPolicy','lpbLgT_bg','lpbLgT_text','lpbLgT_accent','lpbLgT_atext','lpbLgT_border','lpbLgX_title','lpbLgX_accept','lpbLgX_message','lpbLgX_reject','lpbLgX_customize','lpbLgX_save']
    ids.forEach(function (id) {
      var el = document.getElementById(id)
      if (el) el.addEventListener('input', _renderPreview)
    })
  }

  function _renderPreview() {
    var preview = document.getElementById('lpbLgPreview')
    if (!preview) return
    var c = _readForm()
    // força inline pra preview ficar dentro do container
    var html = LPBLgpdEngine.buildBannerHTML(c)
    preview.innerHTML = html.replace('position:fixed', 'position:absolute')
                            .replace('z-index:9999', 'z-index:1')
                            .replace('z-index:9998', 'z-index:1')
  }

  async function _save() {
    var ok = document.getElementById('lpbLgOk')
    ok.disabled = true
    var config = _readForm()
    var v = LPBLgpdEngine.validateConfig(config)
    if (!v.ok) { _toast('Config inválida: ' + v.reason, 'error'); ok.disabled = false; return }

    try {
      var r = await LPBuilder.rpc('lp_page_set_lgpd', {
        p_id: _state.pageId, p_config: config
      })
      if (!r || !r.ok) throw new Error(r && r.reason || 'falhou')
      _toast(config.enabled ? 'Banner LGPD ativado · próximos visitantes verão' : 'Config salva (banner desativado)', 'success')
      _dismiss()
      await LPBuilder.loadPages()
    } catch (err) {
      _toast('Erro: ' + err.message, 'error')
      ok.disabled = false
    }
  }

  function _dismiss() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (modalRoot) modalRoot.innerHTML = ''
    _state = { pageId: null, config: null }
  }

  window.LPBLgpdConfig = Object.freeze({ open: open })
})()
