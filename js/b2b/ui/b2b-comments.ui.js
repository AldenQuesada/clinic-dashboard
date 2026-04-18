/**
 * ClinicAI — B2B Comments UI (inline, não overlay)
 *
 * Bloco inline dentro do detalhe da parceria. Lista scrollável de
 * cards de comentário + textarea + botão Postar.
 *
 * API:
 *   B2BComments.mount(containerId, partnershipId) — renderiza + carrega
 *   B2BComments.reload(partnershipId)              — recarrega lista
 *
 * Consome: B2BCommentsRepository, B2BToast (opcional), ClinicAuth (opcional).
 * Zero overlay, zero evento global (UI isolada dentro do detail).
 *
 * Expõe window.B2BComments.
 */
;(function () {
  'use strict'
  if (window.B2BComments) return

  var _mounts = {}  // containerId -> { partnershipId, items, loading, error, saving }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _repo() { return window.B2BCommentsRepository }

  function _toast() { return window.B2BToast }

  function _currentAuthor() {
    try {
      if (window.ClinicAuth && typeof window.ClinicAuth.currentUser === 'function') {
        var u = window.ClinicAuth.currentUser()
        if (u && (u.email || u.name)) return u.email || u.name
      }
    } catch (_) { /* silent */ }
    return 'admin'
  }

  function _fmtRelative(iso) {
    if (!iso) return ''
    try {
      var d = new Date(iso)
      var diff = Math.floor((Date.now() - d.getTime()) / 1000)
      if (diff < 60) return 'agora'
      if (diff < 3600) return Math.floor(diff / 60) + ' min'
      if (diff < 86400) return Math.floor(diff / 3600) + 'h'
      if (diff < 7 * 86400) return Math.floor(diff / 86400) + 'd'
      return d.toLocaleDateString('pt-BR')
    } catch (_) { return '' }
  }

  function _fmtAbs(iso) {
    if (!iso) return ''
    try { return new Date(iso).toLocaleString('pt-BR') } catch (_) { return iso }
  }

  function _renderCard(c) {
    var author = c.author_name ? _esc(c.author_name) : '<em style="opacity:0.6">sem autor</em>'
    var rel = _fmtRelative(c.created_at)
    var abs = _fmtAbs(c.created_at)
    return '<div class="b2b-comment-card" data-comment-id="' + _esc(c.id) + '">' +
      '<div class="b2b-comment-hdr">' +
        '<span class="b2b-comment-author">' + author + '</span>' +
        '<span class="b2b-comment-date" title="' + _esc(abs) + '">' + _esc(rel) + '</span>' +
        '<button type="button" class="b2b-comment-del" data-action="delete" data-id="' + _esc(c.id) + '" title="Remover">×</button>' +
      '</div>' +
      '<div class="b2b-comment-body">' + _esc(c.body).replace(/\n/g, '<br>') + '</div>' +
    '</div>'
  }

  function _render(containerId) {
    var container = document.getElementById(containerId)
    if (!container) return
    var st = _mounts[containerId]
    if (!st) return

    var listHtml
    if (st.loading) {
      listHtml = '<div class="b2b-empty" style="padding:12px">Carregando…</div>'
    } else if (st.error) {
      listHtml = '<div class="b2b-empty b2b-empty-err">' + _esc(st.error) + '</div>'
    } else if (!st.items.length) {
      listHtml = '<div class="b2b-empty" style="padding:12px;opacity:0.7">Nenhum comentário ainda. Seja o primeiro a registrar contexto.</div>'
    } else {
      listHtml = st.items.map(_renderCard).join('')
    }

    container.innerHTML =
      '<div class="b2b-sec-title">Comentários internos</div>' +
      '<div class="b2b-comments-wrap">' +
        '<div class="b2b-comments-list" data-comments-list>' + listHtml + '</div>' +
        '<div class="b2b-comments-form">' +
          '<textarea class="b2b-input b2b-comments-textarea" rows="3" placeholder="Escreva uma nota interna (contexto, ligação, decisão)…" data-comments-body></textarea>' +
          '<div class="b2b-comments-actions">' +
            '<button type="button" class="b2b-btn b2b-btn-primary" data-action="post"' + (st.saving ? ' disabled' : '') + '>' +
              (st.saving ? 'Postando…' : 'Postar') +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    _bind(container, containerId)
  }

  function _bind(container, containerId) {
    var postBtn = container.querySelector('[data-action="post"]')
    if (postBtn) postBtn.addEventListener('click', function () { _onPost(containerId) })

    container.querySelectorAll('[data-action="delete"]').forEach(function (btn) {
      btn.addEventListener('click', function () { _onDelete(containerId, btn.getAttribute('data-id')) })
    })

    var textarea = container.querySelector('[data-comments-body]')
    if (textarea) {
      textarea.addEventListener('keydown', function (e) {
        // Ctrl/Cmd + Enter envia
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
          e.preventDefault()
          _onPost(containerId)
        }
      })
    }
  }

  async function _onPost(containerId) {
    var st = _mounts[containerId]
    if (!st || st.saving) return
    var container = document.getElementById(containerId)
    if (!container) return

    var textarea = container.querySelector('[data-comments-body]')
    var body = textarea ? String(textarea.value || '').trim() : ''
    if (!body) {
      _toast() ? _toast().warn('Escreva algo antes de postar') : alert('Escreva algo antes de postar')
      return
    }

    st.saving = true
    _render(containerId)

    try {
      var author = _currentAuthor()
      var r = await _repo().add(st.partnershipId, author, body)
      if (!r || !r.ok) throw new Error(r && r.error || 'falha')
      _toast() && _toast().success('Comentário postado')
      await _load(containerId)
    } catch (err) {
      _toast() ? _toast().error('Erro: ' + err.message) : alert('Erro: ' + err.message)
      st.saving = false
      _render(containerId)
    }
  }

  async function _onDelete(containerId, id) {
    if (!id) return
    var ok = _toast()
      ? await _toast().confirm('Remover este comentário?', { title: 'Confirmar', okLabel: 'Remover' })
      : confirm('Remover este comentário?')
    if (!ok) return

    try {
      var r = await _repo().remove(id)
      if (!r || !r.ok) throw new Error(r && r.error || 'falha')
      _toast() && _toast().success('Comentário removido')
      await _load(containerId)
    } catch (err) {
      _toast() ? _toast().error('Erro: ' + err.message) : alert('Erro: ' + err.message)
    }
  }

  async function _load(containerId) {
    var st = _mounts[containerId]
    if (!st) return
    st.loading = true
    st.error = null
    _render(containerId)
    try {
      st.items = (await _repo().list(st.partnershipId)) || []
    } catch (e) {
      st.error = e.message || String(e)
      st.items = []
    } finally {
      st.loading = false
      st.saving = false
      _render(containerId)
    }
  }

  function mount(containerId, partnershipId) {
    if (!containerId || !partnershipId) return
    if (!_repo()) {
      console.warn('[B2BComments] B2BCommentsRepository não carregado')
      return
    }
    _mounts[containerId] = {
      partnershipId: partnershipId,
      items: [],
      loading: true,
      error: null,
      saving: false,
    }
    _load(containerId)
  }

  function reload(containerId) {
    if (_mounts[containerId]) _load(containerId)
  }

  window.B2BComments = Object.freeze({
    mount:  mount,
    reload: reload,
  })
})()
