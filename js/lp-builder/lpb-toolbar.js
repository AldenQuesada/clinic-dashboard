/**
 * LP Builder · Toolbar (topbar + subtoolbar)
 *
 * TOPBAR principal (52px):
 *   esq:    voltar + breadcrumb + status + dirty
 *   centro: device switcher
 *   direita:autosave indicator + ?  + save + publish
 *
 * SUBTOOLBAR (40px, só no editor):
 *   5 dropdowns (Texto · Estilo · Mídia · Visualizar · Verificar)
 *   direita: preview público
 */
;(function () {
  'use strict'
  if (window.LPBToolbar) return

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  var _openMenu = null  // qual menu está aberto (id) — exclusivo

  function render() {
    var bar = document.getElementById('lpbTopbar')
    var sub = document.getElementById('lpbSubtoolbar')
    var app = document.getElementById('lpbApp')
    if (!bar) return
    var view = LPBuilder.getView()

    if (view === 'editor') {
      _renderEditor(bar)
      if (sub) {
        sub.style.display = ''
        sub.innerHTML = _renderSubtoolbar()
      }
      if (app) app.classList.add('with-subtoolbar')
      _attachEditor()
      _attachSubtoolbar()
    } else {
      _renderList(bar)
      if (sub) sub.style.display = 'none'
      if (app) app.classList.remove('with-subtoolbar')
      _attachList()
    }
  }

  // ────────────────────────────────────────────────────────────
  // List mode
  // ────────────────────────────────────────────────────────────
  function _renderList(bar) {
    bar.innerHTML = '' +
      '<div class="lpb-tb-section">' +
        '<div class="lpb-tb-title">LP Builder<small>· Construtor</small></div>' +
      '</div>' +
      '<div class="lpb-tb-spacer"></div>' +
      '<div class="lpb-tb-section">' +
        '<button class="lpb-btn ghost" onclick="window.location.href=\'/\'">' +
          _ico('arrow-left', 14) + ' Voltar ao painel' +
        '</button>' +
      '</div>'
  }
  function _attachList() {}

  // ────────────────────────────────────────────────────────────
  // Editor — TOPBAR principal
  // ────────────────────────────────────────────────────────────
  function _renderEditor(bar) {
    var p  = LPBuilder.getCurrentPage()
    if (!p) { _renderList(bar); return }
    var vp = LPBuilder.getViewport()
    var dirty   = LPBuilder.isDirty()
    var saving  = LPBuilder.isSaving()

    bar.innerHTML = '' +
      '<div class="lpb-tb-section">' +
        '<button class="lpb-tb-back" id="lpbTbBack">' +
          _ico('chevron-left', 14) + 'Páginas' +
        '</button>' +
        '<div class="lpb-tb-title">' + _esc(p.title) +
          '<small>· /' + _esc(p.slug) + '</small>' +
          ' <span class="lpb-tb-status ' + _esc(p.status) + '">' + (p.status === 'published' ? 'Publicado' : 'Rascunho') + '</span>' +
          (dirty ? ' <span class="lpb-tb-dirty" title="Mudancas nao salvas"></span>' : '') +
        '</div>' +
      '</div>' +

      '<div class="lpb-tb-spacer"></div>' +

      _editingLangPill() +

      // Device switcher (centro)
      '<div class="lpb-device" id="lpbDevice">' +
        _devBtn('mobile',  'smartphone', vp) +
        _devBtn('tablet',  'tablet',     vp) +
        _devBtn('desktop', 'monitor',    vp) +
      '</div>' +

      '<div class="lpb-tb-spacer"></div>' +

      // Actions (direita) — só essenciais
      '<div class="lpb-tb-section">' +
        _autosaveIndicator() +
        '<button class="lpb-btn-icon" id="lpbTbHelp" title="Atalhos (?)">' +
          _ico('help-circle', 14) +
        '</button>' +
        '<button class="lpb-btn sm" id="lpbTbSave" ' + (saving || !dirty ? 'disabled' : '') + '>' +
          _ico('save', 14) + (saving ? ' Salvando...' : ' Salvar') +
        '</button>' +
        '<button class="lpb-btn primary sm" id="lpbTbPublish">' +
          _ico('upload-cloud', 14) + ' ' + (p.status === 'published' ? 'Republicar' : 'Publicar') +
        '</button>' +
      '</div>'
  }

  function _autosaveIndicator() {
    if (!window.LPBAutosave) return ''
    var enabled = LPBAutosave.isEnabled()
    var last    = LPBAutosave.getLastSaveAt()
    var label
    if (!enabled) label = 'Auto: off'
    else if (!last) label = 'Auto: on'
    else {
      var diffSec = Math.round((Date.now() - last.getTime()) / 1000)
      label = diffSec < 60 ? 'Salvo ' + diffSec + 's' : 'Salvo ' + Math.round(diffSec / 60) + 'm'
    }
    return '<span title="Auto-save · clique para alternar" id="lpbAutoIndicator" ' +
      'style="font-size:10px;letter-spacing:.1em;text-transform:uppercase;color:' +
      (enabled ? 'var(--lpb-success)' : 'var(--lpb-text-3)') + ';cursor:pointer;padding:0 6px">' +
      label + '</span>'
  }

  // Pill clicável com idioma sendo editado
  function _editingLangPill() {
    if (!window.LPBI18n) return ''
    var lang = LPBI18n.getEditingLang()
    var meta = LPBI18n.getLangMeta(lang)
    var isDefault = lang === LPBI18n.DEFAULT_LANG
    return '<button class="lpb-btn-icon" id="lpbTbLang" title="Idioma sendo editado · click pra trocar" ' +
      'style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;font-size:11px;letter-spacing:.1em;font-weight:500;' +
      'border:1px solid var(--lpb-border);background:' + (isDefault ? 'transparent' : 'rgba(200,169,126,.12)') + ';color:' + (isDefault ? 'var(--lpb-text-2)' : 'var(--lpb-accent)') + '">' +
      _ico('globe', 12) + ' ' + _esc(meta.short) +
      '</button>'
  }

  function _devBtn(vp, icon, current) {
    var label = vp === 'mobile' ? 'Mobile' : (vp === 'tablet' ? 'Tablet' : 'Desktop')
    return '<button data-vp="' + vp + '" class="' + (vp === current ? 'is-active' : '') + '">' +
      _ico(icon, 12) + ' ' + label + '</button>'
  }

  // ────────────────────────────────────────────────────────────
  // SUBTOOLBAR (5 dropdowns + ações diretas)
  // ────────────────────────────────────────────────────────────
  function _renderSubtoolbar() {
    var v = (window.LPBValidatorPanel && window.LPBValidatorPanel.getBadge()) ||
            { errors: 0, warnings: 0, score: 100 }
    var validateBadge = (v.errors + v.warnings) > 0
      ? ' <span style="background:' + (v.errors > 0 ? 'var(--lpb-danger)' : 'var(--lpb-warn)') +
        ';color:#1A1A1C;padding:0 6px;font-size:9px;font-weight:600;margin-left:4px;font-family:monospace">' +
        (v.errors + v.warnings) + '</span>'
      : ' <span style="color:var(--lpb-success);margin-left:4px;font-family:monospace">' + v.score + '</span>'

    return '' +
      // ─── Texto ──────────────────────────────────────────
      _menu('text', 'Texto', 'type', [
        { id: 'find',     label: 'Buscar e substituir',  icon: 'search',         meta: 'Cmd F' },
        { id: 'bulk',     label: 'Editor de textos',     icon: 'list',           meta: 'Cmd B' },
        { id: 'wcount',   label: 'Contagem · leitura',   icon: 'bar-chart-2' },
        { id: 'polishAll',label: 'Polir tudo (IA)',      icon: 'feather' },
      ]) +

      // ─── Estilo ─────────────────────────────────────────
      _menu('style', 'Estilo', 'droplet', [
        { id: 'styles',  label: 'Tokens (cores · fontes · espaços)', icon: 'sliders' },
        { id: 'palette', label: 'Extrair paleta da foto hero',       icon: 'droplet' },
      ]) +

      // ─── Mídia ──────────────────────────────────────────
      _menu('media', 'Mídia', 'image', [
        { id: 'photoLib', label: 'Biblioteca de fotos', icon: 'image' },
      ]) +

      // ─── Visualizar ─────────────────────────────────────
      _menu('view', 'Visualizar', 'eye', [
        { id: 'previewFs',  label: 'Preview iPhone',         icon: 'smartphone',  meta: 'Cmd P' },
        { id: 'ab',         label: 'Comparar A/B',            icon: 'columns' },
        { id: 'dispatch',   label: 'Mockup de envio WhatsApp', icon: 'send' },
        { id: 'previewPub', label: 'Abrir página pública',   icon: 'external-link' },
        { id: 'exportHtml', label: 'Exportar HTML estático',  icon: 'download' },
      ]) +

      // ─── Verificar ──────────────────────────────────────
      _menu('check', 'Verificar' + validateBadge, 'check-circle', [
        { id: 'validate',    label: 'Validar página',                 icon: 'check-circle' },
        { id: 'autofix',     label: 'Autofix · varrer e corrigir IA', icon: 'zap' },
        { id: 'submissions', label: 'Submissões · Leads capturados',  icon: 'inbox' },
        { id: 'analytics',   label: 'Analytics · Todas as LPs',       icon: 'bar-chart-2' },
        { id: 'seo',         label: 'SEO checker · Esta página',      icon: 'search' },
        { id: 'perf',        label: 'Performance · Core Web Vitals (Ctrl+Shift+P)', icon: 'zap' },
        { id: 'a11y',        label: 'Acessibilidade · WCAG 2.1 (Ctrl+Shift+A)',     icon: 'eye' },
        { id: 'imgOptim',    label: 'Imagens · auditoria de peso',    icon: 'image' },
        { id: 'schedule',    label: 'Agendar publicação/expiração',   icon: 'calendar' },
        { id: 'lgpdLog',     label: 'LGPD · log de consentimentos',   icon: 'shield' },
        { id: 'journey',     label: 'Jornada · paths cross-LP',       icon: 'git-branch' },
        { id: 'heatmap',     label: 'Heatmap · clicks + scroll depth', icon: 'mouse-pointer' },
        { id: 'webhooks',    label: 'Webhooks · integrações',         icon: 'link' },
        { id: 'history',     label: 'Histórico de versões (Ctrl+Shift+H)', icon: 'clock' },
        { id: 'diff',        label: 'Comparar com versão anterior',   icon: 'git-commit' },
      ]) +

      '<div class="lpb-sub-spacer"></div>'
  }

  function _menu(id, label, icon, items) {
    var isOpen = (_openMenu === id)
    var pop = ''
    if (isOpen) {
      pop = '<div class="lpb-menu-pop">' +
        items.map(function (it) {
          return '<div class="lpb-menu-item" data-menu-act="' + _esc(it.id) + '">' +
            '<span class="icon">' + _ico(it.icon, 14) + '</span>' +
            '<span>' + _esc(it.label) + '</span>' +
            (it.meta ? '<span class="meta">' + _esc(it.meta) + '</span>' : '') +
            '</div>'
        }).join('') +
      '</div>'
    }
    return '<div class="lpb-menu" data-menu-id="' + _esc(id) + '">' +
      '<button class="lpb-menu-btn ' + (isOpen ? 'is-open' : '') + '" data-menu-toggle="' + _esc(id) + '">' +
        _ico(icon, 12) + ' ' + label +
        '<svg class="chev" viewBox="0 0 10 10"><path d="M2 4l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>' +
      '</button>' +
      pop +
      '</div>'
  }

  // ────────────────────────────────────────────────────────────
  // Attach handlers
  // ────────────────────────────────────────────────────────────
  function _attachEditor() {
    var back = document.getElementById('lpbTbBack')
    if (back) back.onclick = function () {
      if (LPBuilder.isDirty()) {
        if (!confirm('Você tem mudanças não salvas. Sair mesmo assim?')) return
      }
      LPBuilder.exitEditor()
    }
    var dev = document.getElementById('lpbDevice')
    if (dev) dev.querySelectorAll('button').forEach(function (b) {
      b.onclick = function () { LPBuilder.setViewport(b.dataset.vp) }
    })
    var save = document.getElementById('lpbTbSave')
    if (save) save.onclick = async function () {
      try { await LPBuilder.savePage(); LPBToast && LPBToast('Salvo', 'success') }
      catch (e) { LPBToast && LPBToast('Erro ao salvar', 'error') }
    }
    var pub = document.getElementById('lpbTbPublish')
    if (pub) pub.onclick = async function () {
      if (!confirm('Publicar esta LP? Será acessível em /lp.html?s=' + LPBuilder.getCurrentPage().slug)) return
      pub.disabled = true
      try { await LPBuilder.publishPage(); LPBToast && LPBToast('Publicado!', 'success') }
      catch (e) { LPBToast && LPBToast('Erro ao publicar', 'error') }
      finally { pub.disabled = false }
    }
    var help = document.getElementById('lpbTbHelp')
    if (help) help.onclick = function () { window.LPBShortcuts && window.LPBShortcuts.showHelp() }
    var auto = document.getElementById('lpbAutoIndicator')
    if (auto) auto.onclick = function () { window.LPBAutosave && window.LPBAutosave.toggle(); render() }

    var langBtn = document.getElementById('lpbTbLang')
    if (langBtn && window.LPBI18n) langBtn.onclick = function (e) {
      e.stopPropagation()
      _openLangMenu(langBtn)
    }
  }

  // Menu dropdown de idiomas (abre ao clicar no pill)
  function _openLangMenu(anchor) {
    if (!window.LPBI18n) return
    var existing = document.getElementById('lpbLangMenu')
    if (existing) { existing.remove(); return }
    var rect = anchor.getBoundingClientRect()
    var menu = document.createElement('div')
    menu.id = 'lpbLangMenu'
    menu.className = 'lpb-menu-pop'
    menu.style.position = 'fixed'
    menu.style.top  = (rect.bottom + 4) + 'px'
    menu.style.left = rect.left + 'px'
    menu.style.zIndex = '600'
    var current = LPBI18n.getEditingLang()
    var html = ''
    LPBI18n.SUPPORTED.forEach(function (l) {
      var active = l.code === current
      html += '<div class="lpb-menu-item" data-lang-set="' + _esc(l.code) + '" ' +
        'style="' + (active ? 'background:var(--lpb-surface-2);color:var(--lpb-accent)' : '') + '">' +
        '<span class="icon">' + _ico('globe', 14) + '</span>' +
        '<span>' + _esc(l.label) + '</span>' +
        '<span class="meta">' + _esc(l.short) + '</span>' +
        '</div>'
    })
    menu.innerHTML = html
    document.body.appendChild(menu)
    menu.querySelectorAll('[data-lang-set]').forEach(function (el) {
      el.onclick = function () {
        LPBI18n.setEditingLang(el.dataset.langSet)
        menu.remove()
        render()
        if (window.LPBCanvas    && window.LPBCanvas.render)    window.LPBCanvas.render()
        if (window.LPBInspector && window.LPBInspector.render) window.LPBInspector.render()
        LPBToast && LPBToast('Editando em ' + LPBI18n.getLangMeta(el.dataset.langSet).label, 'success')
      }
    })
    setTimeout(function () {
      document.addEventListener('click', function close() {
        var m = document.getElementById('lpbLangMenu')
        if (m) m.remove()
        document.removeEventListener('click', close)
      }, { once: true })
    }, 50)
  }

  function _attachSubtoolbar() {
    var sub = document.getElementById('lpbSubtoolbar')
    if (!sub) return
    sub.querySelectorAll('[data-menu-toggle]').forEach(function (b) {
      b.onclick = function (e) {
        e.stopPropagation()
        var id = b.dataset.menuToggle
        _openMenu = (_openMenu === id) ? null : id
        render()
      }
    })
    sub.querySelectorAll('[data-menu-act]').forEach(function (el) {
      el.onclick = function (e) {
        e.stopPropagation()
        var act = el.dataset.menuAct
        _openMenu = null
        _dispatchAction(act)
        render()
      }
    })
  }

  // fecha menu ao click fora
  document.addEventListener('click', function () {
    if (_openMenu) { _openMenu = null; render() }
  })

  // ────────────────────────────────────────────────────────────
  // Action dispatcher
  // ────────────────────────────────────────────────────────────
  function _dispatchAction(act) {
    switch (act) {
      // Texto
      case 'find':      window.LPBFindReplace && window.LPBFindReplace.open(); break
      case 'bulk':      window.LPBBulkText && window.LPBBulkText.open(); break
      case 'wcount':    window.LPBWordCount && window.LPBWordCount.open(); break
      case 'polishAll': window.LPBAIPolish && window.LPBAIPolish.openBatch(); break
      // Estilo
      case 'styles':    window.LPBStylesPanel && window.LPBStylesPanel.open(); break
      case 'palette':   window.LPBDynamicPalette && window.LPBDynamicPalette.openModal(); break
      // Midia
      case 'photoLib':  _openPhotoLibGlobal(); break
      // Visualizar
      case 'previewFs':  window.LPBPreviewFS && window.LPBPreviewFS.open(); break
      case 'ab':         window.LPBABCompare && window.LPBABCompare.open(); break
      case 'dispatch':   window.LPBDispatch && window.LPBDispatch.open(); break
      case 'previewPub': var url = LPBuilder.getPublicUrl(); if (url) window.open(url, '_blank'); break
      case 'exportHtml': window.LPBExportHtml && window.LPBExportHtml.open(); break
      // Verificar
      case 'validate':    window.LPBValidatorPanel && window.LPBValidatorPanel.open(); break
      case 'autofix':     window.LPBAutofix && window.LPBAutofix.open(); break
      case 'submissions': window.LPBLeadsAdmin && window.LPBLeadsAdmin.open(); break
      case 'analytics':   window.LPBAnalytics  && window.LPBAnalytics.open();  break
      case 'seo':         window.LPBSeoChecker && window.LPBSeoChecker.open(); break
      case 'perf':        window.LPBPerfPanel && window.LPBPerfPanel.open(); break
      case 'a11y':        window.LPBA11yPanel && window.LPBA11yPanel.open(); break
      case 'imgOptim':    window.LPBImgOptimPanel && window.LPBImgOptimPanel.open(); break
      case 'schedule':    var cp = LPBuilder.getCurrentPage(); if (cp && window.LPBScheduleModal) LPBScheduleModal.open(cp.id); break
      case 'lgpdLog':     window.LPBLgpdLog && window.LPBLgpdLog.open(LPBuilder.getCurrentPage() && LPBuilder.getCurrentPage().slug); break
      case 'journey':     window.LPBJourneyViewer && window.LPBJourneyViewer.open(); break
      case 'heatmap':     window.LPBHeatmapViewer && window.LPBHeatmapViewer.open(); break
      case 'webhooks':    window.LPBWebhookConfig && window.LPBWebhookConfig.open(); break
      case 'history':     openHistoryModal(); break
      case 'diff':        window.LPBDiff && window.LPBDiff.open(); break
    }
  }

  function _openPhotoLibGlobal() {
    // Abre photo library em modo "browse" (sem field destino, só lista/upload)
    if (window.LPBPhotoLibrary && window.LPBPhotoLibrary.openBrowse) {
      window.LPBPhotoLibrary.openBrowse()
    } else if (window.LPBPhotoLibrary) {
      // fallback: abre com field generico que nao vai aplicar
      LPBToast && LPBToast('Selecione um campo de imagem primeiro pra inserir', 'error')
    }
  }

  // ────────────────────────────────────────────────────────────
  // History modal (mantido aqui por simplicidade)
  // ────────────────────────────────────────────────────────────
  function openHistoryModal() {
    // Onda 19: delega pro módulo dedicado (timeline + diff + restore)
    if (window.LPBHistory && LPBHistory.openCurrent) {
      LPBHistory.openCurrent()
      return
    }
    LPBToast && LPBToast('Módulo de histórico não carregado', 'error')
  }

  // re-render hooks
  document.body.addEventListener('lpb:state-changed', render)
  document.body.addEventListener('lpb:viewport-changed', render)
  document.body.addEventListener('lpb:dirty-changed', render)
  document.body.addEventListener('lpb:autosave-status', render)

  window.LPBToolbar = { render: render, openHistoryModal: openHistoryModal }
})()
