/**
 * LP Builder · Pages List (tela inicial)
 *
 * Lista as LPs existentes em grid, botao "Nova LP" abre modal.
 */
;(function () {
  'use strict'
  if (window.LPBPagesList) return

  var _root = null

  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }
  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }

  function _fmtDate(s) {
    if (!s) return ''
    var d = new Date(s)
    if (isNaN(d.getTime())) return ''
    var now = new Date()
    var diffMin = Math.round((now - d) / 60000)
    if (diffMin < 1)    return 'agora'
    if (diffMin < 60)   return diffMin + ' min'
    if (diffMin < 1440) return Math.round(diffMin / 60) + 'h'
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
  }

  function _statusLabel(s) {
    return s === 'published' ? 'Publicado' : (s === 'draft' ? 'Rascunho' : s)
  }

  function _renderEmpty() {
    return '<div class="lpb-pages-empty">' +
      'Nenhuma landing page criada ainda.<br>' +
      '<small style="font-size:11px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3);font-style:normal">' +
      'Use o botão "Nova LP" no topo</small>' +
      '</div>'
  }

  function _renderCard(p) {
    var publicUrl = window.location.origin + '/lp.html?s=' + encodeURIComponent(p.slug)
    var trackingActive = p.tracking && Object.keys(p.tracking).length > 0
    var abActive = !!p.ab_variant_slug
    var trackingPills = ''
    if (trackingActive) {
      var t = p.tracking
      var tagBadges = []
      if (t.ga4_id)     tagBadges.push('GA4')
      if (t.fb_pixel_id) tagBadges.push('FB')
      if (t.gtm_id)     tagBadges.push('GTM')
      if (t.custom_head_html) tagBadges.push('CST')
      trackingPills = tagBadges.map(function (l) {
        return '<span style="display:inline-block;padding:1px 5px;background:rgba(168,137,94,.2);color:var(--lpb-accent);font-size:8px;letter-spacing:1px;text-transform:uppercase;font-weight:600;margin-right:4px">' + l + '</span>'
      }).join('')
    }
    var abBadge = abActive
      ? '<span style="display:inline-block;padding:1px 5px;background:rgba(74,222,128,.18);color:var(--lpb-success);font-size:8px;letter-spacing:1px;text-transform:uppercase;font-weight:600">A/B → ' + _esc(p.ab_variant_slug) + '</span>'
      : ''

    return '' +
      '<article class="lpb-page-card" data-page-id="' + _esc(p.id) + '">' +
        '<div class="lpb-page-card-actions">' +
          '<button class="lpb-btn-icon" title="Abrir pública" data-action="open-public" data-url="' + _esc(publicUrl) + '">' +
            _ico('external-link', 14) +
          '</button>' +
          '<button class="lpb-btn-icon" title="Duplicar página" data-action="duplicate" data-id="' + _esc(p.id) + '" data-title="' + _esc(p.title) + '" data-slug="' + _esc(p.slug) + '">' +
            _ico('copy', 14) +
          '</button>' +
          '<button class="lpb-btn-icon" title="Pixels e tags de tracking" data-action="tracking" data-id="' + _esc(p.id) + '">' +
            _ico('activity', 14) +
          '</button>' +
          '<button class="lpb-btn-icon" title="A/B test" data-action="ab" data-id="' + _esc(p.id) + '" data-slug="' + _esc(p.slug) + '">' +
            _ico('shuffle', 14) +
          '</button>' +
          '<button class="lpb-btn-icon" title="Schema.org · rich snippets Google" data-action="schema" data-id="' + _esc(p.id) + '">' +
            _ico('award', 14) +
          '</button>' +
          '<button class="lpb-btn-icon" title="Histórico de versões" data-action="history" data-id="' + _esc(p.id) + '">' +
            _ico('clock', 14) +
          '</button>' +
          '<button class="lpb-btn-icon" title="LGPD · cookie consent" data-action="lgpd" data-id="' + _esc(p.id) + '">' +
            _ico('shield', 14) +
          '</button>' +
          '<button class="lpb-btn-icon" title="Agendar publicação/expiração" data-action="schedule" data-id="' + _esc(p.id) + '">' +
            _ico('calendar', 14) +
          '</button>' +
          '<button class="lpb-btn-icon" title="Arquivar" data-action="delete" data-id="' + _esc(p.id) + '">' +
            _ico('trash-2', 14) +
          '</button>' +
        '</div>' +
        '<div class="lpb-page-card-h">' +
          '<div style="flex:1;min-width:0">' +
            '<div class="lpb-page-card-title">' + _esc(p.title) + '</div>' +
            '<small class="lpb-page-card-slug">/lp.html?s=' + _esc(p.slug) + '</small>' +
            (function () {
              var schedBadge = (window.LPBScheduleBadge && LPBScheduleBadge.html(p)) || ''
              return (trackingPills || abBadge || schedBadge)
                ? '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:4px;align-items:center">' + trackingPills + abBadge + schedBadge + '</div>'
                : ''
            })() +
          '</div>' +
          '<span class="lpb-tb-status ' + _esc(p.status) + '">' + _statusLabel(p.status) + '</span>' +
        '</div>' +
        '<div class="lpb-page-card-stats">' +
          '<div><strong>' + (p.views || 0) + '</strong>visitas</div>' +
          '<div><strong>' + (p.conversions || 0) + '</strong>conversões</div>' +
          '<div><strong>' + (p.block_count || 0) + '</strong>blocos</div>' +
          '<div style="margin-left:auto">' + _fmtDate(p.updated_at) + '</div>' +
        '</div>' +
      '</article>'
  }

  function render() {
    if (!_root) return
    var pages = LPBuilder.getPages()
    var html = '' +
      '<div class="lpb-pages-header">' +
        '<h2>Landing Pages<small>Construtor profissional</small></h2>' +
        '<button class="lpb-btn primary" id="lpbCreatePageBtn">' + _ico('plus', 14) + ' Nova LP</button>' +
      '</div>'

    if (!pages.length) {
      html += _renderEmpty()
    } else {
      html += '<div class="lpb-pages-grid">'
      pages.forEach(function (p) { html += _renderCard(p) })
      html += '</div>'
    }
    _root.innerHTML = html
    _attach()
  }

  function _attach() {
    var btnNew = document.getElementById('lpbCreatePageBtn')
    if (btnNew) btnNew.onclick = openCreateModal

    _root.querySelectorAll('.lpb-page-card').forEach(function (card) {
      card.addEventListener('click', function (e) {
        var actBtn = e.target.closest('[data-action]')
        if (actBtn) {
          e.stopPropagation()
          var act = actBtn.dataset.action
          if (act === 'open-public') {
            window.open(actBtn.dataset.url, '_blank')
          } else if (act === 'delete') {
            if (confirm('Arquivar esta LP? (pode ser restaurada via banco)')) {
              LPBuilder.deletePage(actBtn.dataset.id).then(function () {
                LPBToast && LPBToast('Página arquivada', 'success')
              })
            }
          } else if (act === 'duplicate') {
            _openDuplicateModal(actBtn.dataset.id, actBtn.dataset.title, actBtn.dataset.slug)
          } else if (act === 'tracking') {
            _openTrackingModal(actBtn.dataset.id)
          } else if (act === 'ab') {
            _openAbModal(actBtn.dataset.id, actBtn.dataset.slug)
          } else if (act === 'schema') {
            _openSchemaModal(actBtn.dataset.id)
          } else if (act === 'history') {
            window.LPBHistory && window.LPBHistory.openModal(actBtn.dataset.id)
          } else if (act === 'lgpd') {
            window.LPBLgpdConfig && window.LPBLgpdConfig.open(actBtn.dataset.id)
          } else if (act === 'schedule') {
            window.LPBScheduleModal && window.LPBScheduleModal.open(actBtn.dataset.id)
          }
          return
        }
        // click no card → abre editor
        var id = card.dataset.pageId
        if (id) {
          LPBuilder.loadPage(id).catch(function () {
            LPBToast && LPBToast('Erro ao abrir página', 'error')
          })
        }
      })
    })
  }

  // ────────────────────────────────────────────────────────────
  // Modais rápidos (duplicar, tracking, AB)
  // ────────────────────────────────────────────────────────────
  function _openDuplicateModal(sourceId, srcTitle, srcSlug) {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbDupBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()">' +
          '<div class="lpb-modal-h"><h3>Duplicar página</h3><button class="lpb-btn-icon" id="lpbDupClose">' + _ico('x', 16) + '</button></div>' +
          '<div class="lpb-modal-body">' +
            '<div style="background:var(--lpb-bg);border:1px solid var(--lpb-border);padding:10px 12px;margin-bottom:14px;font-size:11px;color:var(--lpb-text-2)">' +
              'Cria uma cópia de <strong>' + _esc(srcTitle) + '</strong> como <em>rascunho</em>. Blocos, tokens e estilos são preservados.' +
            '</div>' +
            '<div class="lpb-field">' +
              '<div class="lpb-field-label">Novo título</div>' +
              '<input class="lpb-input" id="lpbDupTitle" value="' + _esc(srcTitle + ' (cópia)') + '">' +
            '</div>' +
            '<div class="lpb-field">' +
              '<div class="lpb-field-label">Novo slug</div>' +
              '<input class="lpb-input" id="lpbDupSlug" value="' + _esc(srcSlug + '-copia') + '">' +
              '<div class="lpb-field-hint">URL pública será /lp.html?s=&lt;slug&gt;</div>' +
            '</div>' +
            '<div style="background:var(--lpb-surface-2);border:1px solid var(--lpb-border);padding:12px;margin-top:14px">' +
              '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-accent);font-weight:600;margin-bottom:8px">' +
                _ico('zap', 11) + ' Substituir no texto ao copiar (opcional)' +
              '</div>' +
              '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' +
                '<input class="lpb-input" id="lpbDupFind" placeholder="Ex: Lifting 5D">' +
                '<input class="lpb-input" id="lpbDupReplace" placeholder="Ex: Botox Pleno">' +
              '</div>' +
              '<div class="lpb-field-hint">Substitui todas as ocorrências em todos os campos · transforma esta em outra LP em segundos.</div>' +
            '</div>' +
          '</div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn ghost" id="lpbDupCancel">Cancelar</button>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn primary" id="lpbDupOk">Duplicar</button>' +
          '</div>' +
        '</div></div>'
    var bg = document.getElementById('lpbDupBg')
    var close = document.getElementById('lpbDupClose')
    var cancel = document.getElementById('lpbDupCancel')
    var ok = document.getElementById('lpbDupOk')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
    cancel.onclick = dismiss
    ok.onclick = async function () {
      var t = (document.getElementById('lpbDupTitle').value || '').trim()
      var s = (document.getElementById('lpbDupSlug').value || '').trim().toLowerCase()
      var findStr    = (document.getElementById('lpbDupFind').value || '').trim()
      var replaceStr = (document.getElementById('lpbDupReplace').value || '').trim()
      if (!t || !s) { LPBToast && LPBToast('Preencha título e slug', 'error'); return }
      if (!/^[a-z0-9-]+$/.test(s)) { LPBToast && LPBToast('Slug inválido', 'error'); return }
      ok.disabled = true
      try {
        var r = await LPBuilder.rpc('lp_page_duplicate', {
          p_source_id: sourceId, p_new_slug: s, p_new_title: t,
        })
        if (!r || !r.ok) {
          LPBToast && LPBToast('Erro: ' + (r && r.reason || 'falhou'), 'error')
          ok.disabled = false
          return
        }
        dismiss()
        await LPBuilder.loadPages()

        // Se user preencheu find-replace, abre a LP recém-criada e executa
        if (findStr && replaceStr) {
          await LPBuilder.loadPage(r.id)
          await _applyFindReplaceOnCurrentPage(findStr, replaceStr)
          LPBToast && LPBToast('Página duplicada e atualizada', 'success')
        } else {
          LPBToast && LPBToast('Página duplicada', 'success')
        }
      } catch (err) {
        LPBToast && LPBToast('Erro: ' + err.message, 'error')
        ok.disabled = false
      }
    }
  }

  // Aplica find-replace em todos os campos textuais da página atual
  async function _applyFindReplaceOnCurrentPage(needle, replacement) {
    var page = LPBuilder.getCurrentPage()
    if (!page) return
    var re = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')

    function walk(val) {
      if (typeof val === 'string') return val.replace(re, replacement)
      if (Array.isArray(val)) return val.map(walk)
      if (val && typeof val === 'object') {
        var out = {}
        Object.keys(val).forEach(function (k) { out[k] = walk(val[k]) })
        return out
      }
      return val
    }

    var n = 0
    ;(page.blocks || []).forEach(function (b) {
      if (!b.props) return
      Object.keys(b.props).forEach(function (k) {
        var before = b.props[k]
        var after  = walk(before)
        if (JSON.stringify(before) !== JSON.stringify(after)) {
          b.props[k] = after
          n++
        }
      })
    })
    if (n > 0) {
      LPBuilder.setPageMeta('updated_at', page.updated_at)
      if (window.LPBCanvas && window.LPBCanvas.render) window.LPBCanvas.render()
      try { await LPBuilder.savePage() } catch (_) {}
    }
  }

  async function _openTrackingModal(pageId) {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    // Carrega tracking atual
    var current = {}
    try {
      var r = await LPBuilder.rpc('lp_page_get', { p_id: pageId })
      if (r && r.ok) current = r.tracking || {}
    } catch (_) {}

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbTrBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:540px">' +
          '<div class="lpb-modal-h"><h3>Pixels e tags</h3><button class="lpb-btn-icon" id="lpbTrClose">' + _ico('x', 16) + '</button></div>' +
          '<div class="lpb-modal-body">' +
            '<div style="background:var(--lpb-bg);border:1px solid var(--lpb-border);padding:10px 12px;margin-bottom:14px;font-size:11px;color:var(--lpb-text-2);line-height:1.6">' +
              'Adicione tags de tracking · aplicados automaticamente na LP pública.' +
              '<br>Ativos: ' +
                (current.ga4_id        ? '<strong style="color:var(--lpb-accent)">GA4</strong> ' : '') +
                (current.fb_pixel_id   ? '<strong style="color:var(--lpb-accent)">FB Pixel</strong> ' : '') +
                (current.gtm_id        ? '<strong style="color:var(--lpb-accent)">GTM</strong> ' : '') +
                (current.custom_head_html ? '<strong style="color:var(--lpb-accent)">Custom HTML</strong> ' : '') +
                (Object.keys(current).length ? '' : '<span style="color:var(--lpb-text-3);font-style:italic">nenhum</span>') +
            '</div>' +
            '<div class="lpb-field">' +
              '<div class="lpb-field-label">Google Analytics 4 · Measurement ID</div>' +
              '<input class="lpb-input" id="lpbTrGa4" value="' + _esc(current.ga4_id || '') + '" placeholder="G-XXXXXXXXXX">' +
            '</div>' +
            '<div class="lpb-field">' +
              '<div class="lpb-field-label">Facebook Pixel ID</div>' +
              '<input class="lpb-input" id="lpbTrFb" value="' + _esc(current.fb_pixel_id || '') + '" placeholder="1234567890">' +
            '</div>' +
            '<div class="lpb-field">' +
              '<div class="lpb-field-label">Google Tag Manager · Container ID</div>' +
              '<input class="lpb-input" id="lpbTrGtm" value="' + _esc(current.gtm_id || '') + '" placeholder="GTM-XXXXXXX">' +
            '</div>' +
            '<div class="lpb-field">' +
              '<div class="lpb-field-label">HTML custom no &lt;head&gt; (avançado)</div>' +
              '<textarea class="lpb-textarea" id="lpbTrCustom" rows="4" placeholder="&lt;script&gt; ... &lt;/script&gt;">' + _esc(current.custom_head_html || '') + '</textarea>' +
              '<div class="lpb-field-hint">Qualquer HTML que deva ir no head da página. Cuidado: sua responsabilidade.</div>' +
            '</div>' +
          '</div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn ghost" id="lpbTrCancel">Cancelar</button>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn primary" id="lpbTrOk">Salvar</button>' +
          '</div>' +
        '</div></div>'

    var bg = document.getElementById('lpbTrBg')
    var close = document.getElementById('lpbTrClose')
    var cancel = document.getElementById('lpbTrCancel')
    var ok = document.getElementById('lpbTrOk')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
    cancel.onclick = dismiss
    ok.onclick = async function () {
      ok.disabled = true
      var tracking = {
        ga4_id:           (document.getElementById('lpbTrGa4').value    || '').trim(),
        fb_pixel_id:      (document.getElementById('lpbTrFb').value     || '').trim(),
        gtm_id:           (document.getElementById('lpbTrGtm').value    || '').trim(),
        custom_head_html: (document.getElementById('lpbTrCustom').value || '').trim(),
      }
      // remove vazios
      Object.keys(tracking).forEach(function (k) { if (!tracking[k]) delete tracking[k] })
      try {
        var r = await LPBuilder.rpc('lp_page_set_tracking', {
          p_id: pageId, p_tracking: tracking
        })
        if (!r || !r.ok) throw new Error(r && r.reason || 'falhou')
        dismiss()
        await LPBuilder.loadPages()
        LPBToast && LPBToast('Tracking atualizado', 'success')
      } catch (err) {
        LPBToast && LPBToast('Erro: ' + err.message, 'error')
        ok.disabled = false
      }
    }
  }

  async function _openAbModal(pageId, currentSlug) {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    var pages = LPBuilder.getPages() || []
    var others = pages.filter(function (p) {
      return p.id !== pageId && p.status === 'published'
    })
    var currentVariant = ''
    try {
      var r = await LPBuilder.rpc('lp_page_get', { p_id: pageId })
      currentVariant = (r && r.ok && r.ab_variant_slug) || ''
    } catch (_) {}

    var options = '<option value="">— sem A/B test —</option>' +
      others.map(function (p) {
        var sel = p.slug === currentVariant ? ' selected' : ''
        return '<option value="' + _esc(p.slug) + '"' + sel + '>' + _esc(p.title) + ' · /' + _esc(p.slug) + '</option>'
      }).join('')

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbAbBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()">' +
          '<div class="lpb-modal-h"><h3>A/B test</h3><button class="lpb-btn-icon" id="lpbAbClose">' + _ico('x', 16) + '</button></div>' +
          '<div class="lpb-modal-body">' +
            '<div style="background:var(--lpb-bg);border:1px solid var(--lpb-border);padding:10px 12px;margin-bottom:14px;font-size:11px;color:var(--lpb-text-2);line-height:1.6">' +
              'Quando habilitado, visitantes de <strong>/' + _esc(currentSlug) + '</strong> serão divididos 50/50 entre esta página e a variant escolhida. A sessão persiste (mesmo visitante sempre vê a mesma variant).' +
              '<br><br>Métricas de views/conversões aparecem separadas por LP no <strong>Analytics</strong>.' +
            '</div>' +
            '<div class="lpb-field">' +
              '<div class="lpb-field-label">Variant B</div>' +
              '<select class="lpb-select" id="lpbAbSel" style="width:100%">' + options + '</select>' +
              '<div class="lpb-field-hint">Só LPs publicadas aparecem aqui.</div>' +
            '</div>' +
          '</div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn ghost" id="lpbAbCancel">Cancelar</button>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn primary" id="lpbAbOk">Salvar</button>' +
          '</div>' +
        '</div></div>'

    var bg = document.getElementById('lpbAbBg')
    var close = document.getElementById('lpbAbClose')
    var cancel = document.getElementById('lpbAbCancel')
    var ok = document.getElementById('lpbAbOk')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
    cancel.onclick = dismiss
    ok.onclick = async function () {
      ok.disabled = true
      var val = (document.getElementById('lpbAbSel').value || '').trim()
      try {
        var r = await LPBuilder.rpc('lp_page_set_ab_variant', {
          p_id: pageId, p_variant_slug: val || null,
        })
        if (!r || !r.ok) throw new Error(r && r.reason || 'falhou')
        dismiss()
        await LPBuilder.loadPages()
        LPBToast && LPBToast(val ? 'A/B habilitado' : 'A/B removido', 'success')
      } catch (err) {
        LPBToast && LPBToast('Erro: ' + err.message, 'error')
        ok.disabled = false
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  // Schema.org modal (Onda 18) — config da clínica para rich snippets
  // ────────────────────────────────────────────────────────────
  async function _openSchemaModal(pageId) {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    var current = {}
    try {
      var r = await LPBuilder.rpc('lp_page_get', { p_id: pageId })
      current = (r && r.ok && r.schema_org) || {}
    } catch (_) {}

    function v(k) { return _esc(current[k] || '') }

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbScBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:680px">' +
          '<div class="lpb-modal-h"><h3>Schema.org · rich snippets</h3><button class="lpb-btn-icon" id="lpbScClose">' + _ico('x', 16) + '</button></div>' +
          '<div class="lpb-modal-body">' +
            '<div style="background:var(--lpb-bg);border:1px solid var(--lpb-border);padding:10px 12px;margin-bottom:14px;font-size:11px;color:var(--lpb-text-2);line-height:1.6">' +
              'Estes dados geram <strong>JSON-LD</strong> que aparece no Google como rich snippets (estrelas, endereço, horário, FAQ). ' +
              'Reviews, FAQ e serviços são inferidos automaticamente dos blocos da página — você só precisa configurar a clínica aqui.' +
            '</div>' +

            '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-accent);font-weight:600;margin:6px 0 10px">Identificação</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
              '<div class="lpb-field"><div class="lpb-field-label">Nome da clínica *</div>' +
                '<input class="lpb-input" id="lpbScName" value="' + v('name') + '" placeholder="Clínica Mirian de Paula"></div>' +
              '<div class="lpb-field"><div class="lpb-field-label">URL canônica</div>' +
                '<input class="lpb-input" id="lpbScUrl" value="' + v('url') + '" placeholder="https://clinicamirian.com.br"></div>' +
              '<div class="lpb-field" style="grid-column:1/-1"><div class="lpb-field-label">Imagem (logo ou fachada)</div>' +
                '<input class="lpb-input" id="lpbScImage" value="' + v('image') + '" placeholder="https://..."></div>' +
              '<div class="lpb-field"><div class="lpb-field-label">Telefone</div>' +
                '<input class="lpb-input" id="lpbScPhone" value="' + v('telephone') + '" placeholder="+55 81 99999-0000"></div>' +
              '<div class="lpb-field"><div class="lpb-field-label">Especialidade</div>' +
                '<input class="lpb-input" id="lpbScSpec" value="' + v('medicalSpecialty') + '" placeholder="Medicina Estética"></div>' +
              '<div class="lpb-field"><div class="lpb-field-label">Faixa de preço</div>' +
                '<input class="lpb-input" id="lpbScPrice" value="' + v('priceRange') + '" placeholder="$$$"></div>' +
              '<div class="lpb-field"><div class="lpb-field-label">Horário de atendimento</div>' +
                '<input class="lpb-input" id="lpbScHours" value="' + v('openingHours') + '" placeholder="Mo-Fr 09:00-18:00, Sa 09:00-13:00"></div>' +
            '</div>' +

            '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-accent);font-weight:600;margin:18px 0 10px">Endereço</div>' +
            '<div style="display:grid;grid-template-columns:2fr 1fr;gap:10px">' +
              '<div class="lpb-field"><div class="lpb-field-label">Rua e número</div>' +
                '<input class="lpb-input" id="lpbScStreet" value="' + v('street') + '" placeholder="Av. Conselheiro Aguiar, 1234"></div>' +
              '<div class="lpb-field"><div class="lpb-field-label">CEP</div>' +
                '<input class="lpb-input" id="lpbScZip" value="' + v('zip') + '" placeholder="51020-031"></div>' +
              '<div class="lpb-field"><div class="lpb-field-label">Cidade</div>' +
                '<input class="lpb-input" id="lpbScCity" value="' + v('city') + '" placeholder="Recife"></div>' +
              '<div class="lpb-field"><div class="lpb-field-label">UF</div>' +
                '<input class="lpb-input" id="lpbScState" value="' + v('state') + '" placeholder="PE"></div>' +
              '<div class="lpb-field"><div class="lpb-field-label">País</div>' +
                '<input class="lpb-input" id="lpbScCountry" value="' + v('country') + '" placeholder="BR"></div>' +
            '</div>' +

            '<div style="font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-accent);font-weight:600;margin:18px 0 10px">Geo (opcional)</div>' +
            '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">' +
              '<div class="lpb-field"><div class="lpb-field-label">Latitude</div>' +
                '<input class="lpb-input" id="lpbScLat" value="' + v('latitude') + '" placeholder="-8.1234"></div>' +
              '<div class="lpb-field"><div class="lpb-field-label">Longitude</div>' +
                '<input class="lpb-input" id="lpbScLng" value="' + v('longitude') + '" placeholder="-34.5678"></div>' +
            '</div>' +

            '<div style="background:var(--lpb-surface-2);border:1px solid var(--lpb-border);padding:10px 12px;margin-top:16px;font-size:10px;color:var(--lpb-text-2);line-height:1.6">' +
              _ico('info', 11) + ' Validar depois em <strong>search.google.com/test/rich-results</strong> com a URL pública.' +
            '</div>' +
          '</div>' +
          '<div class="lpb-modal-footer">' +
            '<button class="lpb-btn ghost" id="lpbScCancel">Cancelar</button>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn primary" id="lpbScOk">Salvar</button>' +
          '</div>' +
        '</div></div>'

    var bg = document.getElementById('lpbScBg')
    var close = document.getElementById('lpbScClose')
    var cancel = document.getElementById('lpbScCancel')
    var ok = document.getElementById('lpbScOk')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss
    cancel.onclick = dismiss
    ok.onclick = async function () {
      ok.disabled = true
      function val(id) { return (document.getElementById(id).value || '').trim() }
      var data = {
        name:             val('lpbScName'),
        url:              val('lpbScUrl'),
        image:            val('lpbScImage'),
        telephone:        val('lpbScPhone'),
        medicalSpecialty: val('lpbScSpec'),
        priceRange:       val('lpbScPrice'),
        openingHours:     val('lpbScHours'),
        street:           val('lpbScStreet'),
        zip:              val('lpbScZip'),
        city:             val('lpbScCity'),
        state:            val('lpbScState'),
        country:          val('lpbScCountry'),
        latitude:         val('lpbScLat'),
        longitude:        val('lpbScLng'),
      }
      Object.keys(data).forEach(function (k) { if (!data[k]) delete data[k] })

      if (!data.name) {
        LPBToast && LPBToast('Nome da clínica é obrigatório', 'error')
        ok.disabled = false
        return
      }
      try {
        var r = await LPBuilder.rpc('lp_page_set_schema', {
          p_id: pageId, p_data: data
        })
        if (!r || !r.ok) throw new Error(r && r.reason || 'falhou')
        dismiss()
        await LPBuilder.loadPages()
        LPBToast && LPBToast('Schema.org salvo · valide em search.google.com/test/rich-results', 'success')
      } catch (err) {
        LPBToast && LPBToast('Erro: ' + err.message, 'error')
        ok.disabled = false
      }
    }
  }

  // ────────────────────────────────────────────────────────────
  // Create modal
  // ────────────────────────────────────────────────────────────
  // ────────────────────────────────────────────────────────────
  // Modal "Nova LP" — galeria de templates + opção legado
  // ────────────────────────────────────────────────────────────
  var _createActiveTab = 'templates'   // 'templates' | 'basic'
  var _selectedTemplate = null         // id do template escolhido
  var _selectedCategory = 'all'

  async function openCreateModal() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbModalBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:780px;max-height:92vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Nova Landing Page</h3>' +
            '<button class="lpb-btn-icon" id="lpbModalClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div style="display:flex;border-bottom:1px solid var(--lpb-border);padding:0 12px" id="lpbCrTabs">' +
            _tabBtn('templates', 'Templates premium', 'grid') +
            _tabBtn('basic',     'Em branco · cópia', 'file') +
          '</div>' +
          '<div class="lpb-modal-body" id="lpbCrBody" style="flex:1;overflow:auto;padding:0">' +
            '<div style="padding:40px;text-align:center;color:var(--lpb-text-3);font-style:italic">Carregando templates...</div>' +
          '</div>' +
          '<div class="lpb-modal-footer" id="lpbCrFooter" style="display:none">' +
            '<button class="lpb-btn ghost" id="lpbModalCancel">Cancelar</button>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn primary" id="lpbModalCreate">Criar página</button>' +
          '</div>' +
        '</div>' +
      '</div>'

    var bg     = document.getElementById('lpbModalBg')
    var close  = document.getElementById('lpbModalClose')
    bg.addEventListener('click', _dismissCreate)
    close.onclick = _dismissCreate

    _attachCreateTabs()
    await _renderCreateTab()
  }

  function _tabBtn(id, label, icon) {
    var active = id === _createActiveTab
    return '<button class="lpb-cr-tab-btn" data-cr-tab="' + id + '" ' +
      'style="background:transparent;border:0;color:' + (active ? 'var(--lpb-accent)' : 'var(--lpb-text-2)') + ';' +
      'padding:12px 14px;font-size:11px;letter-spacing:.1em;text-transform:uppercase;font-weight:500;' +
      'border-bottom:2px solid ' + (active ? 'var(--lpb-accent)' : 'transparent') + ';' +
      'cursor:pointer;display:inline-flex;align-items:center;gap:6px">' +
      _ico(icon, 12) + ' ' + _esc(label) + '</button>'
  }

  function _attachCreateTabs() {
    document.querySelectorAll('#lpbCrTabs .lpb-cr-tab-btn').forEach(function (b) {
      b.onclick = async function () {
        _createActiveTab = b.dataset.crTab
        _selectedTemplate = null
        // re-render header tabs
        var bar = document.getElementById('lpbCrTabs')
        if (bar) bar.innerHTML = _tabBtn('templates', 'Templates premium', 'grid') + _tabBtn('basic', 'Em branco · cópia', 'file')
        _attachCreateTabs()
        await _renderCreateTab()
      }
    })
  }

  function _dismissCreate() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (modalRoot) modalRoot.innerHTML = ''
    _selectedTemplate = null
  }

  async function _renderCreateTab() {
    if (_createActiveTab === 'basic') return _renderBasicTab()
    return _renderTemplatesTab()
  }

  // ── Templates premium ─────────────────────────────────────
  async function _renderTemplatesTab() {
    var body = document.getElementById('lpbCrBody')
    var footer = document.getElementById('lpbCrFooter')
    if (!body) return
    body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--lpb-text-3);font-style:italic">Carregando templates...</div>'
    footer.style.display = 'none'

    var templates = []
    try {
      templates = await LPBuilder.rpc('lp_template_list') || []
    } catch (e) {
      body.innerHTML = '<div style="padding:40px;text-align:center;color:var(--lpb-danger)">Erro: ' + _esc(e.message) + '</div>'
      return
    }

    if (!templates.length) {
      body.innerHTML = '<div style="padding:60px;text-align:center;color:var(--lpb-text-3);font-style:italic;font-family:Cormorant Garamond,serif;font-size:18px">' +
        'Nenhum template cadastrado. Use a aba "Em branco · cópia".</div>'
      return
    }

    var cats = [{ id: 'all', label: 'Todos' },
                { id: 'protocolo', label: 'Protocolo integrado' },
                { id: 'sessao',    label: 'Sessão única' },
                { id: 'educativo', label: 'Educativo' },
                { id: 'promo',     label: 'Promoção' },
                { id: 'social',    label: 'Prova social' }]

    var filters = '<div style="display:flex;gap:6px;padding:12px 18px;border-bottom:1px solid var(--lpb-border);flex-wrap:wrap">' +
      cats.map(function (c) {
        var active = _selectedCategory === c.id
        return '<button class="lpb-cat-filter" data-cat="' + c.id + '" ' +
          'style="background:' + (active ? 'var(--lpb-accent)' : 'transparent') + ';' +
          'border:1px solid ' + (active ? 'var(--lpb-accent)' : 'var(--lpb-border)') + ';' +
          'color:' + (active ? '#1A1A1C' : 'var(--lpb-text-2)') + ';' +
          'padding:5px 12px;font-size:10px;letter-spacing:1.5px;text-transform:uppercase;font-weight:500;cursor:pointer">' +
          _esc(c.label) + '</button>'
      }).join('') + '</div>'

    var filtered = _selectedCategory === 'all'
      ? templates
      : templates.filter(function (t) { return t.category === _selectedCategory })

    var cards = filtered.length
      ? '<div style="display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:18px">' +
          filtered.map(_renderTemplateCard).join('') +
        '</div>'
      : '<div style="padding:40px;text-align:center;color:var(--lpb-text-3);font-style:italic">Nenhum template nesta categoria.</div>'

    body.innerHTML = filters + cards

    // wire filtros
    body.querySelectorAll('.lpb-cat-filter').forEach(function (b) {
      b.onclick = function () {
        _selectedCategory = b.dataset.cat
        _selectedTemplate = null
        _renderTemplatesTab()
      }
    })
    // wire seleção
    body.querySelectorAll('[data-tpl-id]').forEach(function (card) {
      card.onclick = function () {
        _selectedTemplate = card.dataset.tplId
        body.querySelectorAll('[data-tpl-id]').forEach(function (c) {
          c.style.borderColor = c.dataset.tplId === _selectedTemplate
            ? 'var(--lpb-accent)' : 'var(--lpb-border)'
          c.style.boxShadow = c.dataset.tplId === _selectedTemplate
            ? '0 0 0 2px rgba(200,169,126,.2)' : 'none'
        })
        _showCreateFooter()
      }
    })
    if (_selectedTemplate) _showCreateFooter()
  }

  function _renderTemplateCard(t) {
    var types = (t.block_types || []).filter(Boolean)
    var typeChips = types.slice(0, 8).map(function (ty) {
      return '<span style="display:inline-block;font-size:9px;letter-spacing:.05em;padding:2px 6px;background:rgba(168,137,94,.12);color:var(--lpb-text-2);margin:1px">' + _esc(ty) + '</span>'
    }).join('')
    if (types.length > 8) typeChips += '<span style="font-size:9px;color:var(--lpb-text-3);margin-left:2px">+' + (types.length - 8) + '</span>'

    var catColors = {
      protocolo: 'var(--lpb-accent)',
      sessao:    'var(--lpb-success)',
      educativo: 'var(--lpb-text-2)',
      promo:     'var(--lpb-warn)',
      social:    'var(--lpb-accent-lt)',
    }
    var catColor = catColors[t.category] || 'var(--lpb-text-2)'

    return '<div class="lpb-tpl-card" data-tpl-id="' + _esc(t.id) + '" ' +
      'style="background:var(--lpb-surface);border:1px solid var(--lpb-border);padding:18px;cursor:pointer;transition:all .15s;display:flex;flex-direction:column;gap:10px">' +
      '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">' +
        '<div style="flex:1">' +
          '<div style="font-family:Cormorant Garamond,serif;font-size:20px;font-style:italic;color:var(--lpb-text);line-height:1.2">' + _esc(t.name) + '</div>' +
          '<div style="font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:' + catColor + ';margin-top:4px;font-weight:600">' + _esc(t.category) + '</div>' +
        '</div>' +
        '<span style="font-family:monospace;font-size:11px;color:var(--lpb-text-3);white-space:nowrap">' + (t.block_count || 0) + ' blocos</span>' +
      '</div>' +
      '<div style="font-size:12px;color:var(--lpb-text-2);line-height:1.5">' + _esc(t.description || '') + '</div>' +
      '<div style="margin-top:4px;padding-top:10px;border-top:1px solid var(--lpb-border);line-height:1.8">' + typeChips + '</div>' +
      '</div>'
  }

  function _showCreateFooter() {
    var footer = document.getElementById('lpbCrFooter')
    if (footer) footer.style.display = ''
    var cancel = document.getElementById('lpbModalCancel')
    var create = document.getElementById('lpbModalCreate')
    if (cancel) cancel.onclick = _dismissCreate
    if (create) create.onclick = _askNameAndCreate
  }

  async function _askNameAndCreate() {
    // Sub-modal pra pedir título + slug
    var modalRoot = document.getElementById('lpbModalRoot')
    // inline replace
    var body = document.getElementById('lpbCrBody')
    if (!body) return

    var defaultName = ''
    if (_createActiveTab === 'templates' && _selectedTemplate) {
      try {
        var tpl = (await LPBuilder.rpc('lp_template_list') || [])
          .find(function (t) { return t.id === _selectedTemplate })
        if (tpl) defaultName = tpl.name
      } catch (_) {}
    }

    body.innerHTML = '<div style="padding:40px 28px">' +
      '<div class="lpb-field">' +
        '<div class="lpb-field-label">Título da página</div>' +
        '<input class="lpb-input" id="lpbNewTitle" value="' + _esc(defaultName) + '" placeholder="Ex: Protocolo Smooth Eyes Premium">' +
      '</div>' +
      '<div class="lpb-field">' +
        '<div class="lpb-field-label">Slug (URL)</div>' +
        '<input class="lpb-input" id="lpbNewSlug" placeholder="ex: smooth-eyes-premium">' +
        '<div class="lpb-field-hint">Acessível em /lp.html?s=&lt;slug&gt; · só letras minúsculas, números e hífen</div>' +
      '</div>' +
      '</div>'

    var title = document.getElementById('lpbNewTitle')
    var slug  = document.getElementById('lpbNewSlug')
    title.addEventListener('input', function () {
      if (slug.dataset.touched) return
      slug.value = title.value
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    })
    slug.addEventListener('input', function () { slug.dataset.touched = '1' })
    if (defaultName) {
      slug.value = defaultName.toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    }
    setTimeout(function () { title.focus(); title.select() }, 50)

    var create = document.getElementById('lpbModalCreate')
    if (create) create.onclick = async function () {
      var t = (title.value || '').trim()
      var s = (slug.value  || '').trim().toLowerCase()
      if (!t || !s) { LPBToast && LPBToast('Preencha título e slug', 'error'); return }
      if (!/^[a-z0-9-]+$/.test(s)) {
        LPBToast && LPBToast('Slug só pode ter letras, números e hífen', 'error'); return
      }
      create.disabled = true
      try {
        var newId
        if (_createActiveTab === 'templates' && _selectedTemplate) {
          var r = await LPBuilder.rpc('lp_template_use', {
            p_id: _selectedTemplate, p_new_slug: s, p_new_title: t,
          })
          if (!r || !r.ok) throw new Error(r && r.reason || 'falhou')
          newId = r.id
        } else {
          // seedKind já definido no basic tab
          var blocks = await _seedBlocks(_seedKind || 'default')
          newId = await LPBuilder.createPage(s, t, blocks)
        }
        _dismissCreate()
        await LPBuilder.loadPages()
        LPBToast && LPBToast('Página criada', 'success')
        await LPBuilder.loadPage(newId)
      } catch (e) {
        LPBToast && LPBToast('Erro: ' + (e.message || 'falha ao criar'), 'error')
        create.disabled = false
      }
    }
  }

  // ── Tab "Em branco · cópia" (legacy) ──────────────────────
  var _seedKind = 'default'
  function _renderBasicTab() {
    var body = document.getElementById('lpbCrBody')
    var footer = document.getElementById('lpbCrFooter')
    if (!body) return
    body.innerHTML = '<div style="padding:22px 24px">' +
      '<div style="background:var(--lpb-bg);border:1px solid var(--lpb-border);padding:10px 12px;margin-bottom:14px;font-size:11px;color:var(--lpb-text-2);line-height:1.6">' +
        'Pra começos rápidos sem template. Use se quiser controlar cada bloco desde o zero ou copiar uma LP existente.' +
      '</div>' +
      '<div class="lpb-field">' +
        '<div class="lpb-field-label">Começar com</div>' +
        '<div class="lpb-select-btns" id="lpbNewSeed" style="flex-wrap:wrap">' +
          _seedBtn('default',    'Estrutura básica', true) +
          _seedBtn('tratamento', 'Tratamento (médio)') +
          _seedBtn('promo',      'Promoção (curta)') +
          _seedBtn('autoridade', 'Autoridade (longa)') +
          _seedBtn('lifting',    'Cópia Lifting 5D') +
          _seedBtn('smooth',     'Cópia Smooth Eyes') +
          _seedBtn('blank',      'Em branco') +
        '</div>' +
        '<div class="lpb-field-hint">Você edita tudo depois.</div>' +
      '</div>' +
      '</div>'

    footer.style.display = ''
    var cancel = document.getElementById('lpbModalCancel')
    var create = document.getElementById('lpbModalCreate')
    cancel.onclick = _dismissCreate
    create.onclick = _askNameAndCreate

    document.querySelectorAll('#lpbNewSeed button').forEach(function (b) {
      b.onclick = function () {
        document.querySelectorAll('#lpbNewSeed button').forEach(function (x) {
          x.classList.remove('is-active')
        })
        b.classList.add('is-active')
        _seedKind = b.dataset.seed
      }
    })
  }
  function _seedBtn(val, label, active) {
    return '<button class="' + (active ? 'is-active' : '') + '" data-seed="' + val + '">' + _esc(label) + '</button>'
  }

  async function _seedBlocks(kind) {
    var schema = window.LPBSchema
    if (!schema) return []
    if (kind === 'blank') return []
    if (kind === 'default') return schema.newPageBlocks()
    // copia de pagina existente
    if (kind === 'lifting' || kind === 'smooth') {
      var slug = kind === 'lifting' ? 'lifting-5d' : 'smooth-eyes'
      try {
        var data = await LPBuilder.rpc('lp_page_resolve', { p_slug: slug })
        if (data && data.ok && Array.isArray(data.blocks)) {
          return JSON.parse(JSON.stringify(data.blocks))
        }
      } catch (_) {}
    }
    // templates programaticos
    if (kind === 'tratamento') {
      return [
        { type: 'nav',             props: schema.defaultProps('nav') },
        { type: 'hero-split',      props: schema.defaultProps('hero-split') },
        { type: 'problema-center', props: schema.defaultProps('problema-center') },
        { type: 'cards-2col',      props: schema.defaultProps('cards-2col') },
        { type: 'benefits-grid',   props: schema.defaultProps('benefits-grid') },
        { type: 'investimento',    props: schema.defaultProps('investimento') },
        { type: 'faq',             props: schema.defaultProps('faq') },
        { type: 'cta-final',       props: schema.defaultProps('cta-final') },
        { type: 'footer',          props: schema.defaultProps('footer') },
      ]
    }
    if (kind === 'promo') {
      return [
        { type: 'nav',          props: schema.defaultProps('nav') },
        { type: 'hero-split',   props: schema.defaultProps('hero-split') },
        { type: 'investimento', props: schema.defaultProps('investimento') },
        { type: 'cta-final',    props: schema.defaultProps('cta-final') },
        { type: 'footer',       props: schema.defaultProps('footer') },
      ]
    }
    if (kind === 'autoridade') {
      return [
        { type: 'nav',             props: schema.defaultProps('nav') },
        { type: 'hero-split',      props: schema.defaultProps('hero-split') },
        { type: 'problema-center', props: schema.defaultProps('problema-center') },
        { type: 'doctor-block',    props: schema.defaultProps('doctor-block') },
        { type: 'quote-narrative', props: schema.defaultProps('quote-narrative') },
        { type: 'cards-2col',      props: schema.defaultProps('cards-2col') },
        { type: 'list-rich',       props: schema.defaultProps('list-rich') },
        { type: 'benefits-grid',   props: schema.defaultProps('benefits-grid') },
        { type: 'investimento',    props: schema.defaultProps('investimento') },
        { type: 'faq',             props: schema.defaultProps('faq') },
        { type: 'cta-final',       props: schema.defaultProps('cta-final') },
        { type: 'footer',          props: schema.defaultProps('footer') },
      ]
    }
    return schema.newPageBlocks()
  }

  // ────────────────────────────────────────────────────────────
  // Mount + listen state changes
  // ────────────────────────────────────────────────────────────
  function mount(rootId) {
    _root = document.getElementById(rootId)
    if (!_root) return
    render()
  }

  document.body.addEventListener('lpb:pages-list-changed', render)

  window.LPBPagesList = { mount: mount, render: render, openCreateModal: openCreateModal }
})()
