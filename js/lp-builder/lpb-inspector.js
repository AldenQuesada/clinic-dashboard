/**
 * LP Builder · Inspector (painel direito)
 *
 * Renderiza form do bloco selecionado, gerado a partir do schema.
 * Cada field type tem seu renderer + handler:
 *   text · textarea · richtext · image · svg · select · color · cta · bool · list
 *
 * Mudancas auto-aplicam ao state com debounce 350ms (typing).
 */
;(function () {
  'use strict'
  if (window.LPBInspector) return

  var _root = null
  var _saveDebounce = null
  var _expandedSections = { conteudo: true, ajustes: false, meta: false }
  // Controla quais campos de estilo inline estão abertos (por fieldKey)
  var _inlineStyleOpen = {}

  // Helper: renderiza controles inline de estilo para um ELEMENTO
  // Retorna HTML do bloco de controles + o trigger (botão ⚙)
  function _inlineStyleBlock(b, fieldKey) {
    var BS = window.LPBBlockStyle
    if (!BS || !b) return { trigger: '', panel: '' }
    var el = BS.elementForField(fieldKey)
    if (!el) return { trigger: '', panel: '' }
    var ctrls = BS.getControlsForElement(el)
    if (!ctrls.length) return { trigger: '', panel: '' }
    var isOpen = !!_inlineStyleOpen[fieldKey]
    var style = b._style || {}

    var trigger = '<button class="lpb-btn-icon" data-inline-style-toggle="' + _escA(fieldKey) + '" title="Ajustes de estilo deste elemento" style="' +
      (isOpen ? 'color:var(--lpb-accent);background:var(--lpb-bg)' : '') + '">' +
      _ico('sliders', 11) + '</button>'

    if (!isOpen) return { trigger: trigger, panel: '' }

    var rows = ctrls.map(function (c) {
      var v = BS.getPath(style, c.key)
      var hasOverride = v != null && v !== ''
      var resetBtn = hasOverride
        ? '<button class="lpb-btn-icon" data-style-reset="' + _escA(c.key) + '" title="Resetar">' + _ico('rotate-ccw', 10) + '</button>'
        : ''
      return _renderStyleControl(c, v, resetBtn)
    }).join('')

    var panel = '<div style="background:var(--lpb-bg);border:1px solid var(--lpb-border);border-top:2px solid var(--lpb-accent);padding:10px;margin-top:6px;margin-bottom:10px">' +
      rows +
      '</div>'
    return { trigger: trigger, panel: panel }
  }

  // Renderiza um controle individual (text/num/bool/select/color/align)
  function _renderStyleControl(c, v, resetBtn) {
    var BS = window.LPBBlockStyle
    if (c.type === 'bool') {
      return '<div class="lpb-field" style="margin-bottom:6px">' +
        '<label class="lpb-bool" style="width:100%;justify-content:space-between">' +
          '<span class="lpb-bool-label" style="font-size:11px">' + _esc(c.label) + '</span>' +
          '<span style="display:flex;align-items:center;gap:4px">' +
            resetBtn +
            '<input type="checkbox" data-style-key="' + _escA(c.key) + '" ' + (v ? 'checked' : '') + '>' +
            '<span class="track"></span>' +
          '</span>' +
        '</label>' +
        '</div>'
    }
    if (c.type === 'select') {
      var opts = c.options.map(function (o) {
        var sel = String(v != null ? v : '') === String(o.value)
        return '<option value="' + _escA(o.value) + '"' + (sel ? ' selected' : '') + '>' + _esc(o.label) + '</option>'
      }).join('')
      return '<div class="lpb-field" style="margin-bottom:6px">' +
        '<div class="lpb-field-label" style="font-size:10px"><span>' + _esc(c.label) + '</span>' + resetBtn + '</div>' +
        '<select class="lpb-select" data-style-key="' + _escA(c.key) + '" style="width:100%">' +
          '<option value="">— padrão —</option>' + opts +
        '</select>' +
        '</div>'
    }
    if (c.type === 'align') {
      var btns = BS.ALIGN_OPTIONS.map(function (o) {
        var sel = String(v || '') === o.value
        return '<button type="button" data-style-align-key="' + _escA(c.key) + '" data-style-align-val="' + _escA(o.value) + '" ' +
          'class="' + (sel ? 'is-active' : '') + '" title="' + _escA(o.title) + '" ' +
          'style="flex:1;font-size:16px;padding:4px 0;' + (sel ? 'background:var(--lpb-accent);color:#1A1A1C' : '') + '">' +
          _esc(o.label) + '</button>'
      }).join('')
      return '<div class="lpb-field" style="margin-bottom:6px">' +
        '<div class="lpb-field-label" style="font-size:10px"><span>' + _esc(c.label) + '</span>' + resetBtn + '</div>' +
        '<div class="lpb-select-btns" style="display:flex;gap:2px">' + btns + '</div>' +
        '</div>'
    }
    if (c.type === 'color') {
      var cur = v || ''
      return '<div class="lpb-field" style="margin-bottom:6px">' +
        '<div class="lpb-field-label" style="font-size:10px"><span>' + _esc(c.label) + '</span>' + resetBtn + '</div>' +
        '<div style="display:flex;gap:4px;align-items:center">' +
          '<input type="color" data-style-key="' + _escA(c.key) + '" value="' + _escA(_hexOrDefault(cur)) + '" style="width:32px;height:28px;border:1px solid var(--lpb-border);background:transparent;cursor:pointer">' +
          '<input type="text" class="lpb-input" data-style-text="' + _escA(c.key) + '" value="' + _escA(cur) + '" placeholder="#C8A97E ou rgba(...)" style="flex:1">' +
        '</div>' +
        (c.hint ? '<div class="lpb-field-hint">' + _esc(c.hint) + '</div>' : '') +
        '</div>'
    }
    // num
    var step = c.step != null ? c.step : 1
    return '<div class="lpb-field" style="margin-bottom:6px">' +
      '<div class="lpb-field-label" style="font-size:10px"><span>' + _esc(c.label) + '</span>' + resetBtn + '</div>' +
      '<div style="display:flex;gap:4px;align-items:center">' +
        '<input type="number" class="lpb-input" data-style-num="' + _escA(c.key) + '" ' +
          'value="' + _escA(v != null ? v : '') + '" ' +
          'min="' + (c.min != null ? c.min : '') + '" ' +
          'max="' + (c.max != null ? c.max : '') + '" ' +
          'step="' + step + '" ' +
          'placeholder="padrão" style="flex:1">' +
        (c.unit ? '<small style="color:var(--lpb-text-3);font-size:10px">' + _esc(c.unit) + '</small>' : '') +
      '</div>' +
      '</div>'
  }

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }
  // Escape robusto para ATRIBUTOS HTML (value, placeholder, etc) — inclui aspas
  function _escA(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
  }

  function _debounceUpdate(fn) {
    clearTimeout(_saveDebounce)
    // 120ms · ~1 char digitado por update · sensação de "live preview"
    _saveDebounce = setTimeout(fn, 120)
  }

  // Helper · escreve valor no lugar certo (top-level OU dentro de list item)
  // Detecta contexto via DOM: closest [data-list-idx] indica list item
  function _writeFieldValue(blockIdx, fieldKey, value, originElement) {
    var block = LPBuilder.getBlock(blockIdx)
    if (!block) return
    var listItem = originElement && originElement.closest && originElement.closest('[data-list-idx]')
    if (listItem) {
      var listFkey = listItem.dataset.fkey
      var listIdx  = parseInt(listItem.dataset.listIdx, 10)
      if (!listFkey || isNaN(listIdx)) {
        LPBuilder.setBlockProp(blockIdx, fieldKey, value)
        return
      }
      var arr = Array.isArray(block.props && block.props[listFkey])
        ? block.props[listFkey].slice() : []
      var item = arr[listIdx] || {}
      var update = {}
      update[fieldKey] = value
      arr[listIdx] = Object.assign({}, item, update)
      LPBuilder.setBlockProp(blockIdx, listFkey, arr)
    } else {
      LPBuilder.setBlockProp(blockIdx, fieldKey, value)
    }
  }
  // Expose pra outros módulos (gallery, crop) usarem
  window._lpbInspectorWriteField = _writeFieldValue

  // ────────────────────────────────────────────────────────────
  // Empty state
  // ────────────────────────────────────────────────────────────
  function _renderEmpty() {
    return '<div class="lpb-insp-empty">' +
      'Selecione um bloco no canvas para editar suas propriedades.' +
      '<small>Ou arraste um novo bloco da palette</small>' +
      '<div style="margin-top:24px;padding:12px;background:var(--lpb-bg);border:1px solid var(--lpb-border);font-family:Montserrat,sans-serif;font-style:normal;font-size:11px;color:var(--lpb-text-2);text-align:left;line-height:1.7">' +
        '<strong style="display:block;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--lpb-accent);margin-bottom:8px">Dicas rápidas</strong>' +
        '<div>· <strong>Duplo-clique</strong> em texto edita inline</div>' +
        '<div>· <strong>Cmd/Ctrl + S</strong> salva</div>' +
        '<div>· <strong>Cmd/Ctrl + Z</strong> desfaz</div>' +
        '<div>· <strong>?</strong> mostra todos os atalhos</div>' +
      '</div>' +
      '</div>'
  }

  // ────────────────────────────────────────────────────────────
  // Section accordion
  // ────────────────────────────────────────────────────────────
  function _section(id, label, body, opts) {
    opts = opts || {}
    // Estado: user já tocou? respeita preferência. Se não, usa defaultOpen
    var userPref = _expandedSections[id]
    var collapsed
    if (userPref === undefined) {
      collapsed = !(opts.defaultOpen === true)
    } else {
      collapsed = !userPref
    }
    var icon = opts.icon || ''
    var iconHtml = icon ? '<span class="lpb-insp-section-icon">' + _ico(icon, 12) + '</span>' : ''
    return '<div class="lpb-insp-section ' + (collapsed ? 'collapsed' : '') + '" data-section="' + id + '">' +
      '<div class="lpb-insp-section-h">' +
        iconHtml + '<span>' + _esc(label) + '</span>' +
        '<span class="chev">' + _ico('chevron-down', 14) + '</span>' +
      '</div>' +
      '<div class="lpb-insp-section-body">' + body + '</div>' +
      '</div>'
  }

  // ────────────────────────────────────────────────────────────
  // Categorização automática de fields → grupos colapsáveis
  // (nenhum field do schema precisa mudar — heurística por nome)
  // ────────────────────────────────────────────────────────────
  // ORDEM IMPORTA · primeiro grupo que match ganha o field
  // Específicos (size/color/posicao/layout/overlay) ANTES de conteúdo pra evitar
  // que `eyebrow_size` caia em "Conteúdo" porque começa com "eyebrow".
  var GROUP_DEFS = [
    { id: 'media',    label: 'Mídia',                icon: 'image',
      match: function (k, t) { return t === 'image' || /^(image|imagem|foto|bg_image|cover)/i.test(k) } },
    { id: 'itens',    label: 'Itens / Lista',        icon: 'list',
      match: function (k, t) { return t === 'list' || /^(items|slides|social|fields|links)$/i.test(k) } },
    { id: 'tamanhos', label: 'Tamanhos',             icon: 'maximize-2',
      match: function (k) { return /_size$/i.test(k) || /^size$/i.test(k) } },
    { id: 'cores',    label: 'Cores',                icon: 'droplet',
      match: function (k, t) { return /_color$/i.test(k) || /^color$/i.test(k) || t === 'color' } },
    { id: 'posicao',  label: 'Posição & Alinhamento', icon: 'move',
      match: function (k) { return /_align$|^align$|_pos$|^pos$|_y_pct|_x_pct|^y_|^x_/i.test(k) || /text_align/i.test(k) } },
    { id: 'overlay',  label: 'Overlay / Efeitos',    icon: 'cloud',
      match: function (k) { return /^(overlay|gradient|blur|filter)/i.test(k) } },
    { id: 'layout',   label: 'Layout',               icon: 'layout',
      match: function (k) { return /^(aspect|ratio|columns|columns_grid|layout|max_width|direction|spacing|bg$|fundo$)/i.test(k) } },
    { id: 'cta',      label: 'CTA / Botão',          icon: 'mouse-pointer',
      match: function (k, t) { return /^(cta|btn|button)(_|$)/i.test(k) || /_url$|^url$/i.test(k) || t === 'cta' } },
    { id: 'conteudo', label: 'Conteúdo · Texto',     icon: 'type',
      match: function (k, t) {
        // EXACT match com nomes principais (sem prefix-loose) + tipos puramente textuais
        if (/^(eyebrow|h1|h2|h3|h4|headline|subheadline|titulo|title|lead|subtitle|body|text|content|descricao|kicker|tagline|brand_name|copyright|clinic_label|message|intro|paragrafos|quote)$/i.test(k)) return true
        return (t === 'text' || t === 'textarea' || t === 'richtext' || t === 'svg')
      } },
    { id: 'outros',   label: 'Outros',               icon: 'more-horizontal',
      match: function () { return true } },  // catch-all
  ]

  function _groupFields(fields) {
    var groups = {}
    GROUP_DEFS.forEach(function (g) { groups[g.id] = [] })
    fields.forEach(function (f) {
      // Force grupo via schema explícito tem prioridade
      if (f.group && groups[f.group]) {
        groups[f.group].push(f)
        return
      }
      for (var i = 0; i < GROUP_DEFS.length; i++) {
        var g = GROUP_DEFS[i]
        if (g.match(f.k, f.type, f)) {
          groups[g.id].push(f)
          return
        }
      }
      groups.outros.push(f)
    })
    return groups
  }

  // ────────────────────────────────────────────────────────────
  // Field renderers — cada um retorna HTML + recebe attach hook
  // ────────────────────────────────────────────────────────────
  var Fields = {

    text: function (f, v, idx) {
      var len = (v || '').length
      var counter = f.max
        ? '<span class="lpb-field-counter ' + (len > f.max ? 'over' : '') + '">' + len + '/' + f.max + '</span>' : ''
      var b = LPBuilder.getBlock(idx)
      var iss = _inlineStyleBlock(b, f.k)
      return '<div class="lpb-field" data-fkey="' + _escA(f.k) + '">' +
        '<div class="lpb-field-label"><span>' + _esc(f.label) + '</span>' +
          '<span style="display:flex;gap:4px;align-items:center">' +
            iss.trigger +
            '<button class="lpb-btn-icon" data-ai-field="' + _escA(f.k) + '" title="Gerar com IA (escrever do zero)">' + _ico('zap', 11) + '</button>' +
            '<button class="lpb-btn-icon" data-polish-field="' + _escA(f.k) + '" title="Polir com IA (preserva significado)">' + _ico('feather', 11) + '</button>' +
            counter +
          '</span>' +
        '</div>' +
        '<input class="lpb-input" type="text" data-fkey="' + _escA(f.k) + '" value="' + _escA(v || '') + '">' +
        iss.panel +
        (f.hint ? '<div class="lpb-field-hint">' + _esc(f.hint) + '</div>' : '') +
        '</div>'
    },

    textarea: function (f, v, idx) {
      var len = (v || '').length
      var counter = f.max
        ? '<span class="lpb-field-counter ' + (len > f.max ? 'over' : '') + '">' + len + '/' + f.max + '</span>' : ''
      var b = LPBuilder.getBlock(idx)
      var iss = _inlineStyleBlock(b, f.k)
      return '<div class="lpb-field" data-fkey="' + _escA(f.k) + '">' +
        '<div class="lpb-field-label"><span>' + _esc(f.label) + '</span>' +
          '<span style="display:flex;gap:4px;align-items:center">' +
            iss.trigger +
            '<button class="lpb-btn-icon" data-ai-field="' + _escA(f.k) + '" title="Gerar com IA (escrever do zero)">' + _ico('zap', 11) + '</button>' +
            '<button class="lpb-btn-icon" data-polish-field="' + _escA(f.k) + '" title="Polir com IA (preserva significado)">' + _ico('feather', 11) + '</button>' +
            counter +
          '</span>' +
        '</div>' +
        '<textarea class="lpb-textarea" rows="' + (f.rows || 3) + '" data-fkey="' + _escA(f.k) + '">' + _esc(v || '') + '</textarea>' +
        iss.panel +
        (f.hint ? '<div class="lpb-field-hint">' + _esc(f.hint) + '</div>' : '') +
        '</div>'
    },

    richtext: function (f, v, idx) {
      var f2 = Object.assign({}, f, {
        hint: f.hint || 'Use *texto* para itálico accent · _texto_ para itálico simples · Enter para quebra de linha',
      })
      return Fields.textarea(f2, v, idx)
    },

    bool: function (f, v) {
      return '<div class="lpb-field" data-fkey="' + _esc(f.k) + '">' +
        '<label class="lpb-bool">' +
          '<input type="checkbox" data-fkey="' + _esc(f.k) + '" ' + (v ? 'checked' : '') + '>' +
          '<span class="track"></span>' +
          '<span class="lpb-bool-label">' + _esc(f.label) + '</span>' +
        '</label>' +
        (f.hint ? '<div class="lpb-field-hint">' + _esc(f.hint) + '</div>' : '') +
        '</div>'
    },

    select: function (f, v) {
      var opts = (f.options || []).map(function (opt) {
        var active = (v == null ? f.default : v) === opt.value
        return '<button data-fkey="' + _esc(f.k) + '" data-val="' + _esc(opt.value) + '"' +
          (active ? ' class="is-active"' : '') + '>' + _esc(opt.label) + '</button>'
      }).join('')
      return '<div class="lpb-field" data-fkey="' + _esc(f.k) + '">' +
        '<div class="lpb-field-label"><span>' + _esc(f.label) + '</span></div>' +
        '<div class="lpb-select-btns">' + opts + '</div>' +
        (f.hint ? '<div class="lpb-field-hint">' + _esc(f.hint) + '</div>' : '') +
        '</div>'
    },

    'select-anchor': function (f, v) {
      // Lista TODOS os blocos da página atual como opções de âncora
      // Reusa o helper de preview text do outline pra ficar consistente
      var blocks = (LPBuilder.getBlocks && LPBuilder.getBlocks()) || []
      function _previewText(b) {
        if (!b || !b.props) return ''
        var p = b.props
        var fields = ['headline','h1','h2','titulo','title','eyebrow','h3','lead','subtitle','subheadline']
        for (var i = 0; i < fields.length; i++) {
          var val = p[fields[i]]
          if (val && typeof val === 'string') {
            var t = val.replace(/\n/g, ' ').trim()
            if (t) return t.length > 40 ? t.slice(0, 40) + '…' : t
          }
        }
        return ''
      }
      var optionsHtml = '<option value="">— item decorativo (sem click) —</option>'
      blocks.forEach(function (b, i) {
        var anchor = 'bloco-' + i
        var prev   = _previewText(b)
        var label  = (i + 1) + '. ' + (b.type || '?') + (prev ? ' · ' + prev : '')
        var sel    = (v === anchor) ? ' selected' : ''
        optionsHtml += '<option value="' + _esc(anchor) + '"' + sel + '>' + _esc(label) + '</option>'
      })
      return '<div class="lpb-field" data-fkey="' + _esc(f.k) + '">' +
        '<div class="lpb-field-label"><span>' + _esc(f.label) + '</span></div>' +
        '<select class="lpb-select" data-fkey="' + _esc(f.k) + '" data-anchor-select="1">' +
          optionsHtml +
        '</select>' +
        (f.hint ? '<div class="lpb-field-hint">' + _esc(f.hint) + '</div>' : '') +
        '</div>'
    },

    image: function (f, v, idx) {
      // id estavel por bloco+campo — evita race quando re-renderiza durante upload
      var fileId = 'lpbf-' + (typeof idx === 'number' ? idx : 0) + '-' + f.k
      // <label for=fileId> abre o file picker NATIVAMENTE — sem JS
      var preview = v
        ? '<label for="' + fileId + '" class="lpb-image-preview" style="background-image:url(' + _esc(v) + ');cursor:pointer;display:block" title="Clique para trocar a foto"></label>'
        : '<label for="' + fileId + '" class="lpb-image-preview" style="cursor:pointer;border-style:solid;border-color:var(--lpb-accent);background:rgba(200,169,126,0.06);display:flex;align-items:center;justify-content:center">' +
            '<div style="text-align:center">' +
              '<div style="font-size:32px;color:var(--lpb-accent);margin-bottom:4px;line-height:1">+</div>' +
              '<span style="font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--lpb-accent);font-weight:500">Clique para subir foto</span>' +
            '</div>' +
          '</label>'
      return '<div class="lpb-field" data-fkey="' + _esc(f.k) + '">' +
        '<div class="lpb-field-label"><span>' + _esc(f.label) + '</span></div>' +
        // input file invisível conectado aos labels
        '<input type="file" id="' + fileId + '" accept="image/*" style="display:none" data-file-field="' + _esc(f.k) + '">' +
        // botões grandes
        '<div style="display:flex;gap:6px;margin-bottom:8px">' +
          '<label for="' + fileId + '" class="lpb-btn sm" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;margin:0" title="Enviar foto do seu computador">' +
            _ico('upload', 12) + ' Enviar' +
          '</label>' +
          '<button class="lpb-btn ghost sm" data-lib-field="' + _esc(f.k) + '" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px" title="Escolher de fotos já usadas">' +
            _ico('image', 12) + ' Galeria' +
          '</button>' +
          (v ? '<button class="lpb-btn ghost sm" data-crop-field="' + _esc(f.k) + '" style="display:flex;align-items:center;justify-content:center;gap:6px" title="Recortar imagem atual">' + _ico('crop', 12) + '</button>' : '') +
          (v && f.positioner ? '<button class="lpb-btn ghost sm" data-position-field="' + _esc(f.k) + '" style="display:flex;align-items:center;justify-content:center;gap:6px" title="Ajustar zoom e posição da foto">' + _ico('move', 12) + '</button>' : '') +
        '</div>' +
        '<input class="lpb-input" type="text" data-fkey="' + _escA(f.k) + '" value="' + _escA(v || '') + '" placeholder="ou cole uma URL https://...">' +
        preview +
        (f.hint ? '<div class="lpb-field-hint">' + _esc(f.hint) + '</div>' : '') +
        '</div>'
    },

    svg: function (f, v) {
      var preview = v
        ? '<div class="lpb-svg-preview">' + v + '</div>'
        : '<div class="lpb-svg-preview"><small style="color:var(--lpb-text-3)">SVG inline</small></div>'
      return '<div class="lpb-field" data-fkey="' + _esc(f.k) + '">' +
        '<div class="lpb-field-label"><span>' + _esc(f.label) + '</span></div>' +
        '<textarea class="lpb-textarea" rows="3" data-fkey="' + _esc(f.k) + '" placeholder="<svg width=22 ...>">' + _esc(v || '') + '</textarea>' +
        preview +
        (f.hint ? '<div class="lpb-field-hint">' + _esc(f.hint) + '</div>' : '') +
        '</div>'
    },

    color: function (f, v) {
      var safeVal = (v && /^#[0-9a-f]{3,8}$/i.test(v)) ? v : ''
      return '<div class="lpb-field" data-fkey="' + _esc(f.k) + '">' +
        '<div class="lpb-field-label"><span>' + _esc(f.label) + '</span></div>' +
        '<div style="display:flex;gap:6px;align-items:center">' +
          '<input type="color" data-color-picker-for="' + _escA(f.k) + '" value="' + _escA(safeVal || '#C8A97E') + '" style="width:36px;height:32px;border:1px solid var(--lpb-border);background:transparent;cursor:pointer;padding:0;border-radius:2px">' +
          '<input class="lpb-input" type="text" data-fkey="' + _escA(f.k) + '" value="' + _escA(v || '') + '" placeholder="vazio = padrão" style="flex:1">' +
          (v ? '<button type="button" class="lpb-btn-icon" data-color-clear="' + _escA(f.k) + '" title="Limpar (usa cor padrão)" style="color:var(--lpb-text-2)">' + _ico('x', 12) + '</button>' : '') +
        '</div>' +
        (f.hint ? '<div class="lpb-field-hint">' + _esc(f.hint) + '</div>' : '') +
        '</div>'
    },

    cta: function (f, v) {
      v = v || { label: '', message_wa: '', url: '' }
      return '<div class="lpb-field" data-fkey="' + _escA(f.k) + '">' +
        '<div class="lpb-field-label"><span>' + _esc(f.label) + '</span></div>' +
        '<div class="lpb-cta-group">' +
          '<div class="lpb-field">' +
            '<div class="lpb-field-label"><span>Texto do botão</span></div>' +
            '<input class="lpb-input" type="text" data-cta-key="label" data-fkey="' + _escA(f.k) + '" value="' + _escA(v.label || '') + '">' +
          '</div>' +
          '<div class="lpb-field">' +
            '<div class="lpb-field-label"><span>Mensagem WhatsApp</span></div>' +
            '<textarea class="lpb-textarea" rows="2" data-cta-key="message_wa" data-fkey="' + _escA(f.k) + '">' + _esc(v.message_wa || '') + '</textarea>' +
          '</div>' +
          (typeof v.url !== 'undefined'
            ? '<div class="lpb-field"><div class="lpb-field-label"><span>URL alternativa (opcional)</span></div>' +
              '<input class="lpb-input" type="text" data-cta-key="url" data-fkey="' + _escA(f.k) + '" value="' + _escA(v.url || '') + '" placeholder="#como-funciona ou https://...">' +
              '</div>'
            : '') +
        '</div>' +
        (f.hint ? '<div class="lpb-field-hint">' + _esc(f.hint) + '</div>' : '') +
        '</div>'
    },

    list: function (f, v) {
      var schema = window.LPBSchema
      var items = Array.isArray(v) ? v : []
      var itemDef = f.itemSchema ? schema.getItemSchema(f.itemSchema) : null

      var itemsHtml = items.map(function (item, i) {
        var inner = ''
        if (f.scalarItem) {
          // item escalar
          var meta = f.itemMeta || { type: 'text' }
          var renderer = Fields[meta.type] || Fields.text
          inner = renderer({
            k: '__scalar', label: 'Item ' + (i + 1),
            max: meta.max, rows: meta.rows, hint: meta.hint,
          }, item || '', i)
        } else if (itemDef) {
          // item objeto · filtra hidden (campos de posição etc · gerenciados via botões)
          inner = itemDef.filter(function (sub) { return !sub.hidden }).map(function (sub) {
            var renderer = Fields[sub.type] || Fields.text
            return renderer(sub, item ? item[sub.k] : '', i)
          }).join('')
        }
        return '<div class="lpb-list-item" data-list-idx="' + i + '" data-fkey="' + _esc(f.k) + '">' +
          '<div class="lpb-list-item-h">' +
            '<span>Item ' + (i + 1) + '</span>' +
            '<div class="lpb-list-item-actions">' +
              '<button class="lpb-btn-icon" data-list-act="up"  data-list-idx="' + i + '" data-fkey="' + _esc(f.k) + '">' + _ico('chevron-up', 12) + '</button>' +
              '<button class="lpb-btn-icon" data-list-act="dn"  data-list-idx="' + i + '" data-fkey="' + _esc(f.k) + '">' + _ico('chevron-down', 12) + '</button>' +
              '<button class="lpb-btn-icon" data-list-act="del" data-list-idx="' + i + '" data-fkey="' + _esc(f.k) + '">' + _ico('trash-2', 12) + '</button>' +
            '</div>' +
          '</div>' +
          inner +
          '</div>'
      }).join('')

      var canAdd = !f.maxItems || items.length < f.maxItems
      var addBtn = canAdd
        ? '<button class="lpb-list-add" data-list-act="add" data-fkey="' + _esc(f.k) + '">' + _ico('plus', 12) + ' Adicionar item</button>'
        : ''

      return '<div class="lpb-field" data-fkey="' + _esc(f.k) + '">' +
        '<div class="lpb-field-label">' +
          '<span>' + _esc(f.label) + '</span>' +
          '<span class="lpb-field-counter">' + items.length + (f.maxItems ? '/' + f.maxItems : '') + '</span>' +
        '</div>' +
        '<div class="lpb-list">' + itemsHtml + '</div>' +
        addBtn +
        (f.hint ? '<div class="lpb-field-hint">' + _esc(f.hint) + '</div>' : '') +
        '</div>'
    },
  }

  // ────────────────────────────────────────────────────────────
  // Render
  // ────────────────────────────────────────────────────────────
  function render() {
    if (!_root) return
    var idx = LPBuilder.getSelectedIdx()
    var b = LPBuilder.getBlock(idx)
    if (!b) {
      _root.innerHTML = _renderEmpty()
      return
    }
    var schema = window.LPBSchema
    var meta = schema.getBlockMeta(b.type)
    if (!meta) {
      _root.innerHTML = '<div class="lpb-insp-empty">Bloco desconhecido: ' + _esc(b.type) + '</div>'
      return
    }

    // Aplica i18n: pega valores do idioma sendo editado
    var editingLang = (window.LPBI18n && LPBI18n.getEditingLang) ? LPBI18n.getEditingLang() : 'pt-BR'
    var isI18nMode = window.LPBI18n && editingLang !== LPBI18n.DEFAULT_LANG

    // ────────────────────────────────────────────────────────
    // ONDA 29/30 · Companion fields (cor + tamanho aparecem JUNTO do texto)
    // Para cada field text/textarea principal (eyebrow, headline, etc.),
    // procura {nome}_size e {nome}_color e renderiza embaixo dele.
    // ────────────────────────────────────────────────────────
    var allFieldKeys = meta.fields.map(function (f) { return f.k })
    var fieldByKey = {}
    meta.fields.forEach(function (f) { fieldByKey[f.k] = f })

    function _hasCompanion(parentKey, suffix) {
      return fieldByKey[parentKey + suffix] != null
    }

    function _isCompanion(fkey) {
      // É companion se algum outro field do schema é o "pai"
      // Sufixos: _size, _color, _padx (padding lateral)
      var m = fkey.match(/^(.+)_(size|color|padx)$/)
      if (!m) return false
      return fieldByKey[m[1]] != null
    }

    // Filtra fields companions do meta.fields → não vão pro agrupamento principal
    // (eles são renderizados inline embaixo do field pai)
    var primaryFields = meta.fields.filter(function (f) { return !_isCompanion(f.k) })

    // Agrupa fields PRIMÁRIOS por categoria (heurística por nome)
    var groups = _groupFields(primaryFields)

    function _renderField(f) {
      var renderer = Fields[f.type] || Fields.text
      var v = isI18nMode
        ? LPBI18n.getValue(b, f.k, editingLang)
        : (b.props ? b.props[f.k] : undefined)
      var html = renderer(f, v, idx)

      // Renderiza companions inline (size/color/padx do mesmo nome do field)
      var companionsHtml = ''
      ;['_size', '_color', '_padx'].forEach(function (suffix) {
        var ck = f.k + suffix
        var cf = fieldByKey[ck]
        if (cf) {
          var cv = isI18nMode
            ? LPBI18n.getValue(b, ck, editingLang)
            : (b.props ? b.props[ck] : undefined)
          var cr = Fields[cf.type] || Fields.text
          companionsHtml += cr(cf, cv, idx)
        }
      })
      if (companionsHtml) {
        html += '<div class="lpb-companion-block">' +
          '<div class="lpb-companion-label">Aparência deste texto</div>' +
          companionsHtml +
        '</div>'
      }
      return html
    }

    var groupSectionsHtml = ''
    GROUP_DEFS.forEach(function (g) {
      var fs = groups[g.id]
      if (!fs || !fs.length) return
      var bodyHtml = fs.map(_renderField).join('')
      var sectionId = b.type + '__' + g.id
      // TODAS as seções abrem por default (user colapsa o que quiser)
      groupSectionsHtml += _section(sectionId, g.label, bodyHtml, {
        icon: g.icon,
        defaultOpen: false,  // acordeão · todas fechadas por default · user abre 1 por vez
      })
    })

    // Banner de modo i18n
    var i18nBanner = isI18nMode
      ? '<div style="background:rgba(200,169,126,0.12);border-left:3px solid var(--lpb-accent);padding:10px 14px;margin:0 16px 10px;font-size:11px;color:var(--lpb-accent)">' +
          '<strong style="text-transform:uppercase;letter-spacing:.15em;font-size:9px">Editando em ' + _esc(LPBI18n.getLangMeta(editingLang).label) + '</strong><br>' +
          '<span style="color:var(--lpb-text-2);font-size:11px">Campos vazios usam o texto em ' + _esc(LPBI18n.getLangMeta(LPBI18n.DEFAULT_LANG).label) + ' como fallback.</span>' +
        '</div>'
      : ''

    // Banner especial pro anatomy-quiz · botão calibrar visualmente
    var aqBanner = ''
    if (b.type === 'anatomy-quiz') {
      aqBanner = '<div style="margin:0 16px 10px;padding:12px 14px;background:linear-gradient(135deg,rgba(200,169,126,0.18),rgba(200,169,126,0.08));border:1px solid rgba(200,169,126,0.4);border-radius:8px">' +
        '<div style="font-size:11px;font-weight:600;color:var(--lpb-accent);text-transform:uppercase;letter-spacing:.12em;margin-bottom:6px">Calibrar pontos</div>' +
        '<div style="font-size:11px;color:var(--lpb-text-2);line-height:1.5;margin-bottom:10px">Arraste os pontos direto na foto · clique em área vazia adiciona ponto · botão direito remove.</div>' +
        '<div style="display:flex;gap:6px">' +
          '<button class="lpb-btn sm" data-aq-calibrate="front" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px">' +
            _ico('move', 12) + ' Calibrar Frontal' +
          '</button>' +
          '<button class="lpb-btn sm" data-aq-calibrate="side" style="flex:1;display:flex;align-items:center;justify-content:center;gap:6px">' +
            _ico('move', 12) + ' Calibrar Perfil' +
          '</button>' +
        '</div>' +
      '</div>'
    }

    var html = '' +
      '<div class="lpb-insp-header">' +
        '<div class="icon">' + _ico(meta.icon || 'square', 14) + '</div>' +
        '<div class="name">' + _esc(meta.name) + '<small>#' + idx + '</small></div>' +
        '<div class="lpb-insp-header-actions">' +
          '<button class="lpb-btn-icon" data-blk-act="up"  title="Mover para cima">' + _ico('chevron-up', 14) + '</button>' +
          '<button class="lpb-btn-icon" data-blk-act="dn"  title="Mover para baixo">' + _ico('chevron-down', 14) + '</button>' +
          '<button class="lpb-btn-icon" data-blk-act="dup" title="Duplicar">' + _ico('copy', 14) + '</button>' +
          '<button class="lpb-btn-icon" data-blk-act="del" title="Remover">' + _ico('trash-2', 14) + '</button>' +
        '</div>' +
      '</div>' +
      '<div class="lpb-insp-content">' +
        aqBanner +
        i18nBanner +
        groupSectionsHtml +
        _section(b.type + '__ajustes', 'Ajustes avançados (estilo)', _renderStyleControls(idx, b), { icon: 'sliders' }) +
      '</div>'

    // Preserva scroll · innerHTML reseta scrollTop pra 0 e perde a posição do user
    var savedScrollRoot   = _root.scrollTop
    var contentEl         = _root.querySelector('.lpb-insp-content')
    var savedScrollContent = contentEl ? contentEl.scrollTop : 0

    _root.innerHTML = html

    // Restaura scroll após re-render (microtask · DOM já novo)
    requestAnimationFrame(function () {
      _root.scrollTop = savedScrollRoot
      var newContentEl = _root.querySelector('.lpb-insp-content')
      if (newContentEl) newContentEl.scrollTop = savedScrollContent
    })

    try { _attach(idx) }
    catch (err) {
      console.error('[lpb-inspector] _attach falhou (handlers não bindados):', err)
      if (window.LPBToast) LPBToast('Erro no inspector: ' + err.message, 'error')
    }
  }

  // ────────────────────────────────────────────────────────────
  // Section "Ajustes do bloco" — apenas Layout + Cores
  // (tipografia por elemento vai inline no campo via botão ⚙)
  // ────────────────────────────────────────────────────────────
  function _renderStyleControls(idx, b) {
    var BS = window.LPBBlockStyle
    if (!BS) return '<div style="padding:10px;color:var(--lpb-text-3);font-size:11px">Módulo de estilos não carregado.</div>'
    var controls = BS.getLayoutControls()
    var style = b._style || {}

    var html = '<div style="padding:4px 0 10px;font-size:10px;color:var(--lpb-text-3);line-height:1.5">' +
      'Aqui: largura, padding e cores <em>globais</em> do bloco.' +
      '<br>Ajustes de <em>tipografia</em> estão no ícone ⚙ ao lado do label de cada campo acima.' +
      '</div>'

    controls.forEach(function (c) {
      if (c.group) {
        html += '<div style="margin-top:10px;padding:6px 0 4px;font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--lpb-accent);font-weight:600;border-bottom:1px solid var(--lpb-border)">' + _esc(c.group) + '</div>'
        return
      }
      var v = BS.getPath(style, c.key)
      var hasOverride = v != null && v !== ''
      var resetBtn = hasOverride
        ? '<button class="lpb-btn-icon" data-style-reset="' + _escA(c.key) + '" title="Resetar para padrão">' + _ico('rotate-ccw', 11) + '</button>'
        : ''
      html += _renderStyleControl(c, v, resetBtn)
    })

    // Rodapé: aplicar em todos do tipo + reset
    html += '<div style="margin-top:14px;padding-top:12px;border-top:1px solid var(--lpb-border);display:flex;gap:6px;flex-direction:column">' +
      '<button class="lpb-btn sm" data-style-apply-siblings="' + _escA(b.type) + '" style="width:100%;display:flex;align-items:center;justify-content:center;gap:6px">' +
        _ico('copy', 12) + ' Replicar TODOS os ajustes (texto+layout) em blocos deste tipo' +
      '</button>' +
      '<button class="lpb-btn ghost sm danger" data-style-reset-all="1" style="width:100%">Resetar ajustes deste bloco</button>' +
      '</div>'

    return html
  }

  function _hexOrDefault(s) {
    if (!s) return '#C8A97E'
    if (/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(s)) return s
    return '#C8A97E'
  }

  function _attach(idx) {
    // Recalcula i18n mode aqui (escopo separado de render() · evita ReferenceError)
    var editingLang = (window.LPBI18n && LPBI18n.getEditingLang) ? LPBI18n.getEditingLang() : 'pt-BR'
    var isI18nMode  = window.LPBI18n && editingLang !== (LPBI18n.DEFAULT_LANG || 'pt-BR')

    // Section accordion toggle · MODO ACORDEÃO (uma aberta por vez)
    _root.querySelectorAll('.lpb-insp-section-h').forEach(function (h) {
      h.onclick = function () {
        var sec = h.parentElement
        var id  = sec.dataset.section
        var wasCollapsed = sec.classList.contains('collapsed')
        // Fecha TODAS as outras seções primeiro (modo acordeão puro)
        _root.querySelectorAll('.lpb-insp-section').forEach(function (s) {
          if (s !== sec) {
            s.classList.add('collapsed')
            if (s.dataset.section) _expandedSections[s.dataset.section] = false
          }
        })
        // Toggle a clicada
        if (wasCollapsed) {
          sec.classList.remove('collapsed')
          _expandedSections[id] = true
          // Auto-scroll suave pra trazer a seção pro topo do scroll do inspector
          setTimeout(function () {
            var scroller = _root.querySelector('.lpb-insp-content') || _root
            var top = sec.offsetTop - 8
            scroller.scrollTo({ top: top, behavior: 'smooth' })
          }, 80)
        } else {
          sec.classList.add('collapsed')
          _expandedSections[id] = false
        }
      }
    })

    // Block actions
    _root.querySelectorAll('[data-blk-act]').forEach(function (b) {
      b.onclick = function () {
        var act = b.dataset.blkAct
        if (act === 'up')  LPBuilder.moveBlock(idx, -1)
        if (act === 'dn')  LPBuilder.moveBlock(idx,  1)
        if (act === 'dup') LPBuilder.duplicateBlock(idx)
        if (act === 'del') {
          if (confirm('Remover este bloco?')) LPBuilder.removeBlock(idx)
        }
      }
    })

    // Botões "Calibrar Frontal/Perfil" do banner anatomy-quiz
    _root.querySelectorAll('[data-aq-calibrate]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault(); e.stopPropagation()
        var view = btn.dataset.aqCalibrate || 'front'
        if (!window.LPBAnatomyQuizCalibrate) {
          if (window.LPBToast) LPBToast('Módulo calibrar não carregado · recarregue a página', 'error')
          return
        }
        // Garante que o canvas esteja exibindo a vista correta antes de ativar
        var iframe = document.getElementById('lpbIframe')
        if (iframe && iframe.contentDocument) {
          var wrap = iframe.contentDocument.querySelector('.lpb-edit-block[data-block-idx="' + idx + '"] [data-aq-photo-wrap]')
          if (wrap && wrap.getAttribute('data-aq-view') !== view) {
            wrap.setAttribute('data-aq-view', view)
            wrap.querySelectorAll('[data-aq-view-pane]').forEach(function (pn) {
              pn.hidden = pn.getAttribute('data-aq-view-pane') !== view
            })
            wrap.querySelectorAll('[data-aq-view-btn]').forEach(function (b2) {
              b2.classList.toggle('is-active', b2.getAttribute('data-aq-view-btn') === view)
            })
          }
        }
        LPBAnatomyQuizCalibrate.toggle(idx, view)
      }
    })

    // Sprint 4: AI / Library / Crop hooks
    _root.querySelectorAll('[data-ai-field]').forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault(); e.stopPropagation()
        if (window.LPBAIGenerator) window.LPBAIGenerator.openForField(idx, b.dataset.aiField)
      }
    })
    _root.querySelectorAll('[data-polish-field]').forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault(); e.stopPropagation()
        if (window.LPBAIPolish) window.LPBAIPolish.openForField(idx, b.dataset.polishField)
      }
    })
    function _detectListCtx(originEl) {
      var li = originEl && originEl.closest && originEl.closest('[data-list-idx]')
      if (!li) return null
      var n = parseInt(li.dataset.listIdx, 10)
      if (isNaN(n)) return null
      return { fkey: li.dataset.fkey, idx: n }
    }

    _root.querySelectorAll('[data-lib-field]').forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault(); e.stopPropagation()
        if (window.LPBPhotoLibrary) window.LPBPhotoLibrary.openForField(idx, b.dataset.libField, _detectListCtx(b))
      }
    })
    _root.querySelectorAll('[data-crop-field]').forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault(); e.stopPropagation()
        if (window.LPBImageCrop) window.LPBImageCrop.openForField(idx, b.dataset.cropField, _detectListCtx(b))
      }
    })
    // ── Posicionar foto · zoom + pan modal ─────────────────
    _root.querySelectorAll('[data-position-field]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault(); e.stopPropagation()
        if (!window.LPBImagePositioner) {
          if (window.LPBToast) LPBToast('Módulo posicionar não carregado · recarregue', 'error')
          return
        }
        var fk = btn.dataset.positionField           // ex: 'before_url'
        var base = fk.replace(/_url$/, '')           // 'before' ou 'after'
        var listItem = btn.closest('[data-list-idx]')
        var block = LPBuilder.getBlock(idx)
        if (!block || !block.props) return

        if (listItem) {
          // Contexto LISTA · slide do carrossel
          var listFkey = listItem.dataset.fkey
          var listIdx  = parseInt(listItem.dataset.listIdx, 10)
          var arr = Array.isArray(block.props[listFkey]) ? block.props[listFkey] : []
          var slide = arr[listIdx] || {}
          window.LPBImagePositioner.open({
            url:    slide[fk],
            zoom:   slide[base + '_zoom'] || 1,
            x:      slide[base + '_x']    || 0,
            y:      slide[base + '_y']    || 0,
            aspect: '3/4',
            onSave: function (pos) {
              var newArr = arr.slice()
              var update = {}
              update[base + '_zoom'] = pos.zoom
              update[base + '_x']    = pos.x
              update[base + '_y']    = pos.y
              newArr[listIdx] = Object.assign({}, slide, update)
              LPBuilder.setBlockProp(idx, listFkey, newArr)
              if (window.LPBToast) LPBToast('Posição da foto salva', 'success')
            },
          })
        } else {
          // Contexto TOP-LEVEL · prop direta do bloco
          window.LPBImagePositioner.open({
            url:    block.props[fk],
            zoom:   block.props[base + '_zoom'] || 1,
            x:      block.props[base + '_x']    || 0,
            y:      block.props[base + '_y']    || 0,
            aspect: '3/4',
            onSave: function (pos) {
              LPBuilder.setBlockProp(idx, base + '_zoom', pos.zoom)
              LPBuilder.setBlockProp(idx, base + '_x',    pos.x)
              LPBuilder.setBlockProp(idx, base + '_y',    pos.y)
              if (window.LPBToast) LPBToast('Posição da foto salva', 'success')
            },
          })
        }
      }
    })
    // ── Style controls (section "Ajustes") ────────────────
    var BS = window.LPBBlockStyle
    function _applyStyleChange(key, value, deleteIfEmpty) {
      var b = LPBuilder.getBlock(idx)
      if (!b) return
      if (!b._style) b._style = {}
      if (deleteIfEmpty && (value === '' || value == null)) {
        BS.deletePath(b._style, key)
      } else {
        BS.setPath(b._style, key, value)
      }
      LPBuilder.setPageMeta('updated_at', LPBuilder.getCurrentPage().updated_at)
      // força re-render do canvas (inspector não re-renderiza pra manter foco)
      if (window.LPBCanvas && window.LPBCanvas.render) window.LPBCanvas.render()
    }

    // Toggle do botao ⚙ inline (controles de estilo por elemento)
    _root.querySelectorAll('[data-inline-style-toggle]').forEach(function (el) {
      el.onclick = function (e) {
        e.preventDefault(); e.stopPropagation()
        var k = el.dataset.inlineStyleToggle
        _inlineStyleOpen[k] = !_inlineStyleOpen[k]
        render()  // re-renderiza pra mostrar/esconder panel
      }
    })

    _root.querySelectorAll('[data-style-key]').forEach(function (el) {
      var key = el.dataset.styleKey
      if (el.type === 'checkbox') {
        el.onchange = function () { _applyStyleChange(key, el.checked || null, true) }
      } else if (el.tagName === 'SELECT') {
        el.onchange = function () { _applyStyleChange(key, el.value || null, true) }
      } else if (el.type === 'color') {
        el.oninput = function () {
          _applyStyleChange(key, el.value, false)
          var partner = _root.querySelector('[data-style-text="' + key + '"]')
          if (partner) partner.value = el.value
        }
      }
    })
    // Align buttons (nova type)
    _root.querySelectorAll('[data-style-align-key]').forEach(function (btn) {
      btn.onclick = function (e) {
        e.preventDefault(); e.stopPropagation()
        var key = btn.dataset.styleAlignKey
        var val = btn.dataset.styleAlignVal
        var b = LPBuilder.getBlock(idx)
        var current = (b && b._style) ? BS.getPath(b._style, key) : null
        // toggle: click no mesmo valor desativa
        var next = (current === val) ? null : val
        _applyStyleChange(key, next, true)
        render()
      }
    })
    _root.querySelectorAll('[data-style-text]').forEach(function (el) {
      var key = el.dataset.styleText
      el.oninput = function () {
        _applyStyleChange(key, el.value || null, true)
        var partner = _root.querySelector('[data-style-key="' + key + '"]')
        if (partner && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(el.value)) partner.value = el.value
      }
    })
    _root.querySelectorAll('[data-style-num]').forEach(function (el) {
      var key = el.dataset.styleNum
      el.oninput = function () {
        var v = el.value === '' ? null : parseFloat(el.value)
        _applyStyleChange(key, isNaN(v) ? null : v, true)
      }
    })
    _root.querySelectorAll('[data-style-reset]').forEach(function (el) {
      el.onclick = function (e) {
        e.preventDefault(); e.stopPropagation()
        _applyStyleChange(el.dataset.styleReset, null, true)
        render()  // re-renderiza pra tirar o botão de reset
      }
    })
    _root.querySelectorAll('[data-style-reset-all]').forEach(function (el) {
      el.onclick = function () {
        if (!confirm('Remover TODOS os ajustes deste bloco?')) return
        BS.resetBlock(idx)
        LPBuilder.setPageMeta('updated_at', LPBuilder.getCurrentPage().updated_at)
        if (window.LPBCanvas && window.LPBCanvas.render) window.LPBCanvas.render()
        render()
        LPBToast && LPBToast('Ajustes removidos', 'success')
      }
    })
    _root.querySelectorAll('[data-style-apply-siblings]').forEach(function (el) {
      el.onclick = function () {
        var type = el.dataset.styleApplySiblings
        var b = LPBuilder.getBlock(idx)
        if (!b || !b._style) {
          LPBToast && LPBToast('Faça ajustes primeiro', 'error'); return
        }
        if (!confirm('Replicar estes ajustes em TODOS os blocos do tipo "' + type + '"?')) return
        var n = BS.applyToSiblings(type, b._style)
        LPBuilder.setPageMeta('updated_at', LPBuilder.getCurrentPage().updated_at)
        if (window.LPBCanvas && window.LPBCanvas.render) window.LPBCanvas.render()
        LPBToast && LPBToast('Aplicado em ' + n + ' bloco(s)', 'success')
      }
    })

    // Upload via <input type=file> — onchange dispara
    _root.querySelectorAll('[data-file-field]').forEach(function (inp) {
      inp.onchange = async function (e) {
        var f = e.target.files && e.target.files[0]
        if (!f) return
        var fieldKey = inp.dataset.fileField
        if (!window.LPBPhotoLibrary || !window.LPBPhotoLibrary.uploadFile) {
          LPBToast && LPBToast('Erro: módulo de upload não carregado', 'error')
          return
        }
        LPBToast && LPBToast('Enviando foto...', 'success')
        try {
          var url = await window.LPBPhotoLibrary.uploadFile(f)
          // Detecta list context · grava no slide certo se aplicável
          _writeFieldValue(idx, fieldKey, url, inp)
          if (window.LPBInspector && window.LPBInspector.render) window.LPBInspector.render()
          if (window.LPBCanvas    && window.LPBCanvas.render)    window.LPBCanvas.render()
          try { await LPBuilder.savePage() } catch (_) {}
          LPBToast && LPBToast('Foto aplicada e salva', 'success')
        } catch (err) {
          LPBToast && LPBToast('Erro no envio: ' + (err && err.message || err), 'error')
        }
        inp.value = ''
      }
    })

    // Text/textarea inputs (no CTA field, no list-item child)
    _root.querySelectorAll('input.lpb-input[data-fkey]:not([data-cta-key]), textarea.lpb-textarea[data-fkey]:not([data-cta-key])').forEach(function (el) {
      // ignora inputs DENTRO de items de lista — eles têm handler dedicado abaixo
      if (el.closest('.lpb-list-item')) return
      var flushFor = function (e) {
        try {
          var key = el.dataset.fkey
          if (!key || key === '__scalar') return
          var currentVal = el.value
          if (isI18nMode) {
            var b2 = LPBuilder.getBlock(idx)
            LPBI18n.setValue(b2, key, currentVal, editingLang)
            LPBuilder.setPageMeta('updated_at', LPBuilder.getCurrentPage().updated_at)
            if (window.LPBCanvas && window.LPBCanvas.render) window.LPBCanvas.render()
          } else {
            LPBuilder.setBlockProp(idx, key, currentVal)
          }
          var fieldEl = el.closest('.lpb-field')
          var counter = fieldEl && fieldEl.querySelector('.lpb-field-counter')
          if (counter && counter.textContent.indexOf('/') >= 0) {
            var max = parseInt(counter.textContent.split('/')[1], 10)
            counter.textContent = currentVal.length + '/' + max
            counter.classList.toggle('over', currentVal.length > max)
          }
          // Indicador visual de save (bolinha verde piscante por 1.5s)
          if (fieldEl) {
            fieldEl.classList.remove('lpb-field-saved')
            void fieldEl.offsetWidth  // force reflow pra reanimar
            fieldEl.classList.add('lpb-field-saved')
          }
        } catch (err) {
          console.error('[inspector flushFor] erro key=' + (el.dataset.fkey) + ':', err)
        }
      }
      el.oninput = function (e) {
        var val = el.value
        // FLUSH IMEDIATO se vazio · feedback instantâneo
        if (val.length === 0) {
          clearTimeout(_saveDebounce); _saveDebounce = null
          flushFor()
        } else {
          _debounceUpdate(flushFor)
        }
      }
      // Defesa: change/blur SEMPRE faz flush imediato
      // (cobre caso onde input event não disparou por algum motivo)
      el.onchange = function () {
        clearTimeout(_saveDebounce); _saveDebounce = null
        flushFor()
      }
      el.onblur = function () {
        clearTimeout(_saveDebounce); _saveDebounce = null
        flushFor()
      }
    })

    // Bool toggle
    _root.querySelectorAll('input[type=checkbox][data-fkey]').forEach(function (el) {
      el.onchange = function () {
        LPBuilder.setBlockProp(idx, el.dataset.fkey, el.checked)
      }
    })

    // Color picker (sync com input texto · força re-render canvas)
    _root.querySelectorAll('input[type="color"][data-color-picker-for]').forEach(function (cp) {
      cp.oninput = function () {
        var key = cp.dataset.colorPickerFor
        var val = cp.value
        var partner = _root.querySelector('input[data-fkey="' + key + '"]')
        if (partner) partner.value = val
        LPBuilder.setBlockProp(idx, key, val)
      }
    })
    _root.querySelectorAll('button[data-color-clear]').forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault(); e.stopPropagation()
        var key = b.dataset.colorClear
        LPBuilder.setBlockProp(idx, key, '')
        render()
      }
    })

    // Select buttons
    _root.querySelectorAll('.lpb-select-btns button[data-fkey]').forEach(function (b) {
      b.onclick = function () {
        var key = b.dataset.fkey
        var val = b.dataset.val
        // toggle visual
        b.parentElement.querySelectorAll('button').forEach(function (x) {
          x.classList.remove('is-active')
        })
        b.classList.add('is-active')
        LPBuilder.setBlockProp(idx, key, val)
      }
    })

    // CTA fields (label/message_wa/url)
    _root.querySelectorAll('[data-cta-key]').forEach(function (el) {
      el.oninput = function () {
        var key = el.dataset.fkey
        var subKey = el.dataset.ctaKey
        var current = (LPBuilder.getBlock(idx).props || {})[key] || {}
        var updated = Object.assign({}, current)
        updated[subKey] = el.value
        _debounceUpdate(function () {
          LPBuilder.setBlockProp(idx, key, updated)
        })
      }
    })

    // List actions (add/up/dn/del)
    _root.querySelectorAll('[data-list-act]').forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault()
        var act = b.dataset.listAct
        var key = b.dataset.fkey
        var i   = parseInt(b.dataset.listIdx || '-1', 10)
        var current = (LPBuilder.getBlock(idx).props || {})[key]
        var arr = Array.isArray(current) ? current.slice() : []
        var schema = window.LPBSchema
        var fmeta = schema.getFieldMeta(LPBuilder.getBlock(idx).type, key)
        if (act === 'add') {
          var newItem
          if (fmeta && fmeta.scalarItem) newItem = ''
          else if (fmeta && fmeta.itemSchema) {
            var def = schema.getItemSchema(fmeta.itemSchema) || []
            newItem = {}
            def.forEach(function (sub) {
              if (sub.type === 'list') newItem[sub.k] = []
              else if (sub.type === 'bool') newItem[sub.k] = false
              else newItem[sub.k] = ''
            })
          } else newItem = ''
          arr.push(newItem)
        } else if (act === 'del' && i >= 0) {
          arr.splice(i, 1)
        } else if (act === 'up' && i > 0) {
          var t = arr[i]; arr[i] = arr[i - 1]; arr[i - 1] = t
        } else if (act === 'dn' && i >= 0 && i < arr.length - 1) {
          var t = arr[i]; arr[i] = arr[i + 1]; arr[i + 1] = t
        }
        LPBuilder.setBlockProp(idx, key, arr)
        // setBlockProp ja dispara state-changed → render() roda de novo
      }
    })

    // List item field updates (inputs dentro de lpb-list-item)
    _root.querySelectorAll('.lpb-list-item').forEach(function (itemEl) {
      var listKey = itemEl.dataset.fkey
      var itemIdx = parseInt(itemEl.dataset.listIdx, 10)
      itemEl.querySelectorAll('input.lpb-input, textarea.lpb-textarea').forEach(function (el) {
        if (el.dataset.ctaKey) return
        el.oninput = function () {
          var subKey = el.dataset.fkey
          // IMPORTANTE: lê snapshot DENTRO do debounce, não fora.
          // Evita race quando o user edita múltiplos campos antes do debounce expirar.
          _debounceUpdate(function () {
            var freshBlock = LPBuilder.getBlock(idx)
            if (!freshBlock) return
            var freshArr = Array.isArray(freshBlock.props && freshBlock.props[listKey])
              ? freshBlock.props[listKey].slice()
              : []
            // Re-lê o valor atual do input (pode ter mudado entre input e debounce)
            if (subKey === '__scalar') {
              freshArr[itemIdx] = el.value
            } else {
              freshArr[itemIdx] = Object.assign({}, freshArr[itemIdx] || {})
              freshArr[itemIdx][subKey] = el.value
            }
            LPBuilder.setBlockProp(idx, listKey, freshArr)
          })
        }
      })
      // Selects dentro de items (ex: select-anchor do toc_item)
      itemEl.querySelectorAll('select.lpb-select[data-fkey]').forEach(function (sel) {
        sel.onchange = function () {
          var subKey = sel.dataset.fkey
          var freshBlock = LPBuilder.getBlock(idx)
          if (!freshBlock) return
          var freshArr = Array.isArray(freshBlock.props && freshBlock.props[listKey])
            ? freshBlock.props[listKey].slice()
            : []
          freshArr[itemIdx] = Object.assign({}, freshArr[itemIdx] || {})
          freshArr[itemIdx][subKey] = sel.value
          LPBuilder.setBlockProp(idx, listKey, freshArr)
        }
      })
    })
  }

  // ────────────────────────────────────────────────────────────
  // Mount + listen
  // ────────────────────────────────────────────────────────────
  function mount(rootId) {
    _root = document.getElementById(rootId)
    if (!_root) return
    render()
  }

  document.body.addEventListener('lpb:block-selected', render)
  document.body.addEventListener('lpb:state-changed', function () {
    // re-render quando state muda E nada esta sendo digitado nos proprios inputs do inspector
    if (!_root || LPBuilder.getView() !== 'editor') return
    var active = document.activeElement
    var insideInspector = active && _root.contains(active)
    if (insideInspector) return  // evita perder foco/cursor
    render()
  })

  window.LPBInspector = { mount: mount, render: render }
})()
