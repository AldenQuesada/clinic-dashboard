/**
 * ClinicAI — LP Builder · Core (state + CRUD + undo)
 *
 * window.LPBuilder — fonte unica de estado do editor.
 *
 * Eventos disparados em document.body:
 *   lpb:state-changed        — qualquer mudanca de estado
 *   lpb:page-loaded          — carregou uma pagina pra editar
 *   lpb:pages-list-changed   — recarregou lista de paginas
 *   lpb:block-selected       — selectedBlockIdx mudou
 *   lpb:viewport-changed     — viewport mudou
 *   lpb:dirty-changed        — dirty mudou
 *   lpb:saved                — save concluido
 */
;(function () {
  'use strict'
  if (window.LPBuilder) return

  // ────────────────────────────────────────────────────────────
  // Config
  // ────────────────────────────────────────────────────────────
  var SB_URL = (window.ClinicEnv && window.ClinicEnv.SUPABASE_URL) || 'https://oqboitkpcvuaudouwvkl.supabase.co'
  var SB_KEY = (window.ClinicEnv && window.ClinicEnv.SUPABASE_KEY)
    || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'

  // ────────────────────────────────────────────────────────────
  // State
  // ────────────────────────────────────────────────────────────
  var _state = {
    view: 'list',        // 'list' | 'editor'
    pages: [],           // [{ id, slug, title, status, views, conversions, updated_at, block_count }]
    currentPage: null,   // { id, slug, title, status, blocks, tokens_override, ... }
    selectedBlockIdx: -1,
    viewport: 'desktop', // 'mobile' | 'tablet' | 'desktop'
    dirty: false,
    revisions: [],       // lista de revisions da pagina atual
    saving: false,
    error: null,
  }

  function _emit(name, detail) {
    document.body.dispatchEvent(new CustomEvent(name, { detail: detail || {} }))
  }
  function _setDirty(v) {
    if (_state.dirty === v) return
    _state.dirty = v
    _emit('lpb:dirty-changed', { dirty: v })
  }

  // ────────────────────────────────────────────────────────────
  // RPC helper
  // ────────────────────────────────────────────────────────────
  function rpc(name, params) {
    return fetch(SB_URL + '/rest/v1/rpc/' + name, {
      method: 'POST',
      headers: {
        'apikey': SB_KEY,
        'Authorization': 'Bearer ' + SB_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(params || {})
    }).then(function (r) {
      if (!r.ok) throw new Error('RPC ' + name + ' HTTP ' + r.status)
      return r.json()
    })
  }

  // ────────────────────────────────────────────────────────────
  // Pages list
  // ────────────────────────────────────────────────────────────
  async function loadPages() {
    var data = await rpc('lp_page_list')
    _state.pages = Array.isArray(data) ? data : []
    _emit('lpb:pages-list-changed', { pages: _state.pages })
    _emit('lpb:state-changed')
    return _state.pages
  }

  async function createPage(slug, title, seedBlocks) {
    if (!slug || !title) throw new Error('slug e title sao obrigatorios')
    var blocks = seedBlocks || (window.LPBSchema && window.LPBSchema.newPageBlocks()) || []
    var r = await rpc('lp_page_save', {
      p_slug: slug,
      p_title: title,
      p_blocks: blocks,
      p_status: 'draft',
    })
    if (!r || !r.ok) throw new Error(r && r.reason ? r.reason : 'create_failed')
    await loadPages()
    return r.id
  }

  async function deletePage(id, hard) {
    await rpc('lp_page_delete', { p_id: id, p_hard: !!hard })
    await loadPages()
  }

  // ────────────────────────────────────────────────────────────
  // Single page (editor)
  // ────────────────────────────────────────────────────────────
  async function loadPage(id) {
    var data = await rpc('lp_page_get', { p_id: id })
    if (!data || data.ok === false) throw new Error('page_not_found')
    _state.currentPage = data
    _state.selectedBlockIdx = -1
    _state.view = 'editor'
    _setDirty(false)
    await loadRevisions()
    // persiste no hash pra sobreviver F5
    try { window.history.replaceState(null, '', '#edit=' + id) } catch (_) {}
    _emit('lpb:page-loaded', { page: data })
    _emit('lpb:state-changed')
    return data
  }

  function exitEditor() {
    _state.currentPage = null
    _state.selectedBlockIdx = -1
    _state.view = 'list'
    _state.revisions = []
    _setDirty(false)
    try { window.history.replaceState(null, '', window.location.pathname + window.location.search) } catch (_) {}
    _emit('lpb:state-changed')
  }

  // Lê id da pagina do hash, se houver — usado no boot pra restaurar editor
  function getPageIdFromHash() {
    var h = window.location.hash || ''
    var m = h.match(/^#edit=([0-9a-f-]+)/i)
    return m ? m[1] : null
  }

  async function savePage() {
    if (!_state.currentPage || _state.saving) return
    _state.saving = true
    _emit('lpb:state-changed')
    try {
      // snapshot ANTES de salvar (revision)
      await rpc('lp_revision_create', {
        p_page_id: _state.currentPage.id,
        p_label: 'auto-save',
        p_by: 'admin',
      })
      var p = _state.currentPage
      var r = await rpc('lp_page_save', {
        p_id: p.id,
        p_slug: p.slug,
        p_title: p.title,
        p_blocks: p.blocks,
        p_tokens_override: p.tokens_override || {},
        p_meta_title: p.meta_title || null,
        p_meta_description: p.meta_description || null,
        p_og_image_url: p.og_image_url || null,
      })
      if (!r || !r.ok) throw new Error(r && r.reason ? r.reason : 'save_failed')
      _setDirty(false)
      await loadRevisions()
      _emit('lpb:saved')
    } catch (e) {
      _state.error = e.message
      console.error('[LPB] save error:', e)
    } finally {
      _state.saving = false
      _emit('lpb:state-changed')
    }
  }

  async function publishPage() {
    if (!_state.currentPage) return
    if (_state.dirty) await savePage()
    var r = await rpc('lp_page_publish', { p_id: _state.currentPage.id })
    if (r && r.ok) {
      _state.currentPage.status = 'published'
      _emit('lpb:state-changed')
    }
    return r
  }

  // ────────────────────────────────────────────────────────────
  // Block operations (mutam currentPage.blocks + setam dirty)
  // ────────────────────────────────────────────────────────────
  function getBlocks() {
    return _state.currentPage ? _state.currentPage.blocks : []
  }
  function getBlock(idx) {
    var bs = getBlocks()
    return (idx >= 0 && idx < bs.length) ? bs[idx] : null
  }

  function addBlock(type, atIndex) {
    if (!_state.currentPage) return
    var schema = window.LPBSchema
    if (!schema) return
    var meta = schema.getBlockMeta(type)
    if (!meta) return
    // singleton: nao duplicar
    if (meta.singleton && getBlocks().some(function (b) { return b.type === type })) {
      return
    }
    var block = { type: type, props: schema.defaultProps(type) }
    var idx = (typeof atIndex === 'number') ? atIndex : getBlocks().length
    _state.currentPage.blocks.splice(idx, 0, block)
    _state.selectedBlockIdx = idx
    _setDirty(true)
    _emit('lpb:block-selected', { idx: idx })
    _emit('lpb:state-changed')
  }

  function updateBlockProps(idx, propsPatch) {
    var b = getBlock(idx)
    if (!b) return
    b.props = Object.assign({}, b.props, propsPatch)
    _setDirty(true)
    _emit('lpb:state-changed')
  }

  function setBlockProp(idx, key, value) {
    var b = getBlock(idx)
    if (!b) return
    b.props = b.props || {}
    b.props[key] = value
    _setDirty(true)
    _emit('lpb:state-changed')
    // Defesa em profundidade: força re-render do canvas mesmo se o
    // listener de state-changed estiver bloqueado/condicionalmente desligado
    if (window.LPBCanvas && window.LPBCanvas.render) {
      try { window.LPBCanvas.render() } catch (_) {}
    }
  }

  function updateBlockPropDeep(idx, path, value) {
    var b = getBlock(idx)
    if (!b) return
    b.props = b.props || {}
    var parts = String(path).split('.')
    var cur = b.props
    for (var i = 0; i < parts.length - 1; i++) {
      var k = parts[i]
      if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
      cur = cur[k]
    }
    cur[parts[parts.length - 1]] = value
    _setDirty(true)
    _emit('lpb:state-changed')
    if (window.LPBCanvas && window.LPBCanvas.render) {
      try { window.LPBCanvas.render() } catch (_) {}
    }
  }

  function removeBlock(idx) {
    var bs = getBlocks()
    if (!bs[idx]) return
    bs.splice(idx, 1)
    if (_state.selectedBlockIdx >= bs.length) _state.selectedBlockIdx = bs.length - 1
    _setDirty(true)
    _emit('lpb:block-selected', { idx: _state.selectedBlockIdx })
    _emit('lpb:state-changed')
  }

  function moveBlock(idx, dir) {
    var bs = getBlocks()
    var target = idx + dir
    if (target < 0 || target >= bs.length) return
    var tmp = bs[idx]
    bs[idx] = bs[target]
    bs[target] = tmp
    _state.selectedBlockIdx = target
    _setDirty(true)
    _emit('lpb:block-selected', { idx: target })
    _emit('lpb:state-changed')
  }

  function duplicateBlock(idx) {
    var b = getBlock(idx)
    if (!b) return
    var schema = window.LPBSchema
    if (schema) {
      var meta = schema.getBlockMeta(b.type)
      if (meta && meta.singleton) return
    }
    var copy = JSON.parse(JSON.stringify(b))
    _state.currentPage.blocks.splice(idx + 1, 0, copy)
    _state.selectedBlockIdx = idx + 1
    _setDirty(true)
    _emit('lpb:block-selected', { idx: idx + 1 })
    _emit('lpb:state-changed')
  }

  function selectBlock(idx) {
    if (_state.selectedBlockIdx === idx) return
    _state.selectedBlockIdx = idx
    _emit('lpb:block-selected', { idx: idx })
    _emit('lpb:state-changed')
  }

  // ────────────────────────────────────────────────────────────
  // Page meta
  // ────────────────────────────────────────────────────────────
  function setPageMeta(key, value) {
    if (!_state.currentPage) return
    _state.currentPage[key] = value
    _setDirty(true)
    _emit('lpb:state-changed')
  }

  function setTokensOverride(map) {
    if (!_state.currentPage) return
    _state.currentPage.tokens_override = Object.assign({},
      _state.currentPage.tokens_override || {}, map || {})
    _setDirty(true)
    _emit('lpb:state-changed')
  }

  // ────────────────────────────────────────────────────────────
  // Viewport
  // ────────────────────────────────────────────────────────────
  function setViewport(vp) {
    if (['mobile', 'tablet', 'desktop'].indexOf(vp) < 0) return
    _state.viewport = vp
    _emit('lpb:viewport-changed', { viewport: vp })
    _emit('lpb:state-changed')
  }

  // ────────────────────────────────────────────────────────────
  // Revisions / undo
  // ────────────────────────────────────────────────────────────
  async function loadRevisions() {
    if (!_state.currentPage) { _state.revisions = []; return [] }
    var data = await rpc('lp_revision_list', { p_page_id: _state.currentPage.id, p_limit: 30 })
    _state.revisions = Array.isArray(data) ? data : []
    return _state.revisions
  }

  async function restoreRevision(revisionId) {
    var r = await rpc('lp_revision_restore', { p_revision_id: revisionId })
    if (r && r.ok && _state.currentPage && _state.currentPage.id === r.page_id) {
      // recarrega pagina pra refletir
      await loadPage(r.page_id)
    }
    return r
  }

  // ────────────────────────────────────────────────────────────
  // Public URL
  // ────────────────────────────────────────────────────────────
  function getPublicUrl(slug) {
    var s = slug || (_state.currentPage && _state.currentPage.slug)
    if (!s) return ''
    return window.location.origin + '/lp.html?s=' + encodeURIComponent(s)
  }

  // ────────────────────────────────────────────────────────────
  // Expose
  // ────────────────────────────────────────────────────────────
  window.LPBuilder = Object.freeze({
    // State accessors
    state: function () { return _state },
    getView: function () { return _state.view },
    getPages: function () { return _state.pages },
    getCurrentPage: function () { return _state.currentPage },
    getBlocks: getBlocks,
    getBlock: getBlock,
    getSelectedIdx: function () { return _state.selectedBlockIdx },
    getViewport: function () { return _state.viewport },
    isDirty: function () { return _state.dirty },
    isSaving: function () { return _state.saving },
    getRevisions: function () { return _state.revisions },
    // Pages
    loadPages: loadPages,
    loadPage: loadPage,
    createPage: createPage,
    deletePage: deletePage,
    exitEditor: exitEditor,
    savePage: savePage,
    publishPage: publishPage,
    // Blocks
    addBlock: addBlock,
    updateBlockProps: updateBlockProps,
    setBlockProp: setBlockProp,
    removeBlock: removeBlock,
    moveBlock: moveBlock,
    duplicateBlock: duplicateBlock,
    selectBlock: selectBlock,
    // Meta / tokens
    setPageMeta: setPageMeta,
    setTokensOverride: setTokensOverride,
    // Viewport
    setViewport: setViewport,
    // Revisions
    loadRevisions: loadRevisions,
    restoreRevision: restoreRevision,
    // Util
    getPublicUrl: getPublicUrl,
    getPageIdFromHash: getPageIdFromHash,
    rpc: rpc,
  })
})()
