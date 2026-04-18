/**
 * ClinicAI — B2B Candidates UI (tab Scout)
 *
 * Renderiza a tab 'candidates' do shell. Consome B2BScoutRepository.
 * Ignora outras UIs (lista, form, detail). Zero código cruzado.
 *
 * Features:
 *   - Top banner: scout ativo/bloqueado + consumo vs budget
 *   - Botão "Nova varredura" (chama can_scan antes; se OK, dispara evento)
 *   - Lista ordenada por dna_score desc
 *   - Ações por candidato: aprovar · abordar · promover · descartar
 *
 * Eventos ouvidos:
 *   'b2b:tab-change' (tab === 'candidates')
 *   'b2b:scout-config-updated' (reload banner)
 *
 * Eventos emitidos:
 *   'b2b:scout-scan-request'       { category }     // edge function (Fase 2b)
 *   'b2b:partnership-saved'        { id }           // quando promove
 *   'b2b:candidate-status-changed' { id, status }
 *
 * Expõe window.B2BCandidates.
 */
;(function () {
  'use strict'
  if (window.B2BCandidates) return

  var CATEGORIES = [
    // Tier 1
    { value: 'salao_premium',        label: 'Salão premium',               tier: 1 },
    { value: 'endocrino_menopausa',  label: 'Endócrino menopausa',         tier: 1 },
    { value: 'acim_confraria',       label: 'ACIM / Confraria / 40+',      tier: 1 },
    { value: 'fotografo_casamento',  label: 'Fotógrafo de casamento',      tier: 1 },
    { value: 'joalheria',            label: 'Joalheria',                   tier: 1 },
    { value: 'perfumaria_nicho',     label: 'Perfumaria de nicho',         tier: 1 },
    { value: 'psicologia_40plus',    label: 'Psicologia / coaching 40+',   tier: 1 },
    { value: 'ortomolecular',        label: 'Ortomolecular / integrativa', tier: 1 },
    // Tier 2
    { value: 'nutri_funcional',      label: 'Nutri funcional',             tier: 2 },
    { value: 'otica_premium',        label: 'Ótica premium',               tier: 2 },
    { value: 'vet_boutique',         label: 'Vet boutique',                tier: 2 },
    { value: 'fotografo_familia',    label: 'Fotógrafo família',           tier: 2 },
    { value: 'atelier_noiva',        label: 'Atelier de noiva',            tier: 2 },
    { value: 'farmacia_manipulacao', label: 'Farmácia manipulação',        tier: 2 },
    { value: 'floricultura_assinatura', label: 'Floricultura assinatura',  tier: 2 },
    { value: 'personal_stylist',     label: 'Personal stylist',            tier: 2 },
    { value: 'spa_wellness',         label: 'SPA / wellness',              tier: 2 },
  ]

  var STATUS_OPTIONS = [
    { value: 'new',          label: 'Novo' },
    { value: 'approved',     label: 'Aprovado' },
    { value: 'approached',   label: 'Abordado' },
    { value: 'responded',    label: 'Respondeu' },
    { value: 'negotiating',  label: 'Negociando' },
    { value: 'signed',       label: 'Fechado' },
    { value: 'declined',     label: 'Recusou' },
    { value: 'archived',     label: 'Arquivado' },
  ]

  var _state = {
    candidates: [],
    consumption: null,
    loading: false,
    error: null,
    filterStatus: null,
    filterCategory: null,
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _repo() { return window.B2BScoutRepository }

  function _statusLabel(s) {
    var o = STATUS_OPTIONS.find(function (x) { return x.value === s })
    return o ? o.label : s
  }

  function _scoreColor(score) {
    if (score == null) return '#9CA3AF'
    if (score >= 8) return '#10B981'
    if (score >= 6) return '#F59E0B'
    return '#EF4444'
  }

  // ─── Render ─────────────────────────────────────────────────
  function _renderBanner() {
    var c = _state.consumption || {}
    var enabled = !!c.scout_enabled
    var consumed = Number(c.total_brl || 0)
    var budget   = Number(c.budget_cap_brl || 100)
    var balance  = Math.max(0, budget - consumed)
    var pct      = Number(c.pct_used || 0)
    var brk      = c.breakdown || {}
    var scans    = (brk.google_maps_scan && brk.google_maps_scan.count) || 0
    var lastScan = c.last_scan_at ? _fmtRelative(c.last_scan_at) : null

    var statusText = !enabled
      ? '<strong style="color:#EF4444">Scout desligado</strong> · ative no toggle do topo pra buscar candidatos.'
      : (c.capped
          ? '<strong style="color:#EF4444">Budget cap atingido</strong> · pausado até próximo mês.'
          : '<strong style="color:#10B981">Scout ativo</strong>')

    // Linha compacta de stats (só aparece se o scout está ativo)
    var statsLine = enabled
      ? '<div class="b2b-scout-stats">' +
          '<span>' + scans + ' varredura' + (scans === 1 ? '' : 's') + '</span>' +
          '<span>R$ ' + consumed.toFixed(2) + ' usados</span>' +
          '<span>R$ ' + balance.toFixed(2) + ' saldo</span>' +
          '<span>' + pct + '% do cap</span>' +
          (lastScan ? '<span>últ. ' + lastScan + '</span>' : '') +
        '</div>'
      : ''

    return '<div class="b2b-scout-banner" data-scout-banner>' +
      '<div class="b2b-scout-banner-txt">' + statusText + statsLine + '</div>' +
      '<div class="b2b-scout-scan">' +
        // Adicionar manualmente — sempre disponível
        '<button type="button" class="b2b-btn" id="b2bCandNewBtn" title="Adicionar candidato por indicação">+ Adicionar</button>' +
        (enabled && !c.capped
          ? '<select class="b2b-input" id="b2bScoutCatSel" style="max-width:240px">' +
              '<option value="">Escolher categoria…</option>' +
              CATEGORIES.map(function (cat) {
                return '<option value="' + cat.value + '">T' + cat.tier + ' · ' + _esc(cat.label) + '</option>'
              }).join('') +
            '</select>' +
            '<button type="button" class="b2b-btn b2b-btn-primary" id="b2bScoutScanBtn">Varrer</button>'
          : '') +
      '</div>' +
    '</div>'
  }

  function _fmtRelative(iso) {
    if (!iso) return ''
    try {
      var diff = Date.now() - new Date(iso).getTime()
      var min  = Math.floor(diff / 60000)
      if (min < 1)   return 'agora'
      if (min < 60)  return min + 'min'
      var h = Math.floor(min / 60)
      if (h < 24)    return h + 'h'
      var d = Math.floor(h / 24)
      if (d < 30)    return d + 'd'
      return new Date(iso).toLocaleDateString('pt-BR')
    } catch (_) { return '' }
  }

  function _renderCandidateStats() {
    if (!_state.candidates.length) return ''
    var byStatus = {}
    _state.candidates.forEach(function (c) {
      byStatus[c.contact_status] = (byStatus[c.contact_status] || 0) + 1
    })
    var total = _state.candidates.length
    var parts = ['<span><strong>' + total + '</strong> candidatos</span>']
    ;[
      ['new',         'novos'],
      ['approved',    'aprovados'],
      ['approached',  'abordados'],
      ['responded',   'responderam'],
      ['negotiating', 'negociando'],
      ['signed',      'fechados'],
    ].forEach(function (pair) {
      var n = byStatus[pair[0]] || 0
      if (n > 0) parts.push('<span>' + n + ' ' + pair[1] + '</span>')
    })

    // Score médio dos com dna_score
    var withScore = _state.candidates.filter(function (c) { return c.dna_score != null })
    if (withScore.length) {
      var avg = withScore.reduce(function (s, c) { return s + Number(c.dna_score) }, 0) / withScore.length
      parts.push('<span>score médio <strong>' + avg.toFixed(1) + '</strong></span>')
    }
    return '<div class="b2b-cand-stats">' + parts.join('') + '</div>'
  }

  function _renderFilters() {
    var statusOpts = STATUS_OPTIONS.map(function (o) {
      return '<option value="' + o.value + '"' + (_state.filterStatus === o.value ? ' selected' : '') + '>' + _esc(o.label) + '</option>'
    }).join('')
    return '<div class="b2b-cand-filters">' +
      '<label class="b2b-field" style="margin:0">' +
        '<span class="b2b-field-lbl">Status</span>' +
        '<select class="b2b-input" id="b2bCandStatusFilter" style="min-width:160px">' +
          '<option value="">Todos</option>' + statusOpts +
        '</select>' +
      '</label>' +
    '</div>'
  }

  function _renderRow(c) {
    var scoreColor = _scoreColor(c.dna_score)
    var score = c.dna_score != null ? Number(c.dna_score).toFixed(1) : '—'
    return '<div class="b2b-cand-row" data-cand-id="' + _esc(c.id) + '">' +
      '<div class="b2b-cand-score" style="color:' + scoreColor + '">' + score + '</div>' +
      '<div class="b2b-cand-body">' +
        '<div class="b2b-cand-top">' +
          '<strong>' + _esc(c.name) + '</strong>' +
          '<span class="b2b-pill">' + _esc(_statusLabel(c.contact_status)) + '</span>' +
          (c.tier_target ? '<span class="b2b-pill b2b-pill-tier">T' + c.tier_target + '</span>' : '') +
          '<span class="b2b-pill">' + _esc(c.category) + '</span>' +
        '</div>' +
        '<div class="b2b-cand-meta">' +
          (c.address    ? '<span>' + _esc(c.address) + '</span>' : '') +
          (c.phone      ? '<span>' + _esc(c.phone) + '</span>' : '') +
          (c.instagram_handle ? '<span>IG: ' + _esc(c.instagram_handle) + '</span>' : '') +
          (c.google_rating ? '<span>★ ' + c.google_rating + ' (' + (c.google_reviews || 0) + ')</span>' : '') +
        '</div>' +
        (c.dna_justification ? '<div class="b2b-cand-just">' + _esc(c.dna_justification) + '</div>' : '') +
        (c.fit_reasons && c.fit_reasons.length ?
          '<div class="b2b-cand-reasons"><strong>Fit:</strong> ' + c.fit_reasons.map(_esc).join(' · ') + '</div>' : '') +
        (c.risk_flags && c.risk_flags.length ?
          '<div class="b2b-cand-risks"><strong>Riscos:</strong> ' + c.risk_flags.map(_esc).join(' · ') + '</div>' : '') +
      '</div>' +
      '<div class="b2b-cand-actions">' +
        _actionsFor(c) +
      '</div>' +
    '</div>'
  }

  function _actionsFor(c) {
    var btns = []
    // Avaliar com IA (só se ainda sem score)
    if (c.dna_score == null) {
      btns.push('<button class="b2b-btn" data-cand-action="evaluate-ia" data-id="' + c.id + '" title="Avaliar DNA com IA (custo R$ 0,08)">Avaliar IA</button>')
    }
    if (c.contact_status === 'new') btns.push('<button class="b2b-btn" data-cand-action="approved"  data-id="' + c.id + '">Aprovar</button>')
    if (c.contact_status === 'approved' || c.contact_status === 'new') btns.push('<button class="b2b-btn" data-cand-action="approached" data-id="' + c.id + '">Abordar</button>')
    if (c.contact_status === 'approached') btns.push('<button class="b2b-btn" data-cand-action="responded" data-id="' + c.id + '">Respondeu</button>')
    if (['approached','responded'].indexOf(c.contact_status) !== -1) btns.push('<button class="b2b-btn" data-cand-action="negotiating" data-id="' + c.id + '">Negociando</button>')
    if (['negotiating','responded'].indexOf(c.contact_status) !== -1) btns.push('<button class="b2b-btn b2b-btn-primary" data-cand-action="promote" data-id="' + c.id + '">Promover</button>')
    if (['new','approved','approached','responded','negotiating'].indexOf(c.contact_status) !== -1) btns.push('<button class="b2b-btn" data-cand-action="declined" data-id="' + c.id + '">Recusou</button>')
    btns.push('<button class="b2b-btn" data-cand-action="archived" data-id="' + c.id + '">Arquivar</button>')
    return btns.join('')
  }

  function _renderBody() {
    var body = window.B2BShell ? window.B2BShell.getTabBody() : document.getElementById('b2bTabBody')
    if (!body) return
    body.innerHTML =
      _renderBanner() +
      _renderFilters() +
      _renderCandidateStats() +
      (_state.loading
        ? '<div class="b2b-empty">Carregando candidatos…</div>'
        : _state.error
          ? '<div class="b2b-empty b2b-empty-err">' + _esc(_state.error) + '</div>'
          : (_state.candidates.length
              ? '<div class="b2b-cand-list">' + _state.candidates.map(_renderRow).join('') + '</div>'
              : '<div class="b2b-empty">Nenhum candidato ainda. Ative o scout e dispare uma varredura.</div>'))
    _bind(body)
  }

  // ─── Bind ───────────────────────────────────────────────────
  function _bind(root) {
    var scanBtn = root.querySelector('#b2bScoutScanBtn')
    if (scanBtn) scanBtn.addEventListener('click', _onScanClick)

    var newBtn = root.querySelector('#b2bCandNewBtn')
    if (newBtn) newBtn.addEventListener('click', function () {
      document.dispatchEvent(new CustomEvent('b2b:open-candidate-form'))
    })

    var statusFilter = root.querySelector('#b2bCandStatusFilter')
    if (statusFilter) {
      statusFilter.addEventListener('change', function (e) {
        _state.filterStatus = e.target.value || null
        _load()
      })
    }

    root.querySelectorAll('[data-cand-action]').forEach(function (btn) {
      btn.addEventListener('click', _onAction)
    })
  }

  async function _onScanClick() {
    var sel = document.getElementById('b2bScoutCatSel')
    var btn = document.getElementById('b2bScoutScanBtn')
    var cat = sel && sel.value
    if (!cat) { window.B2BToast && window.B2BToast.warn('Escolha uma categoria'); return }

    try {
      var canRun = await _repo().canScan(cat)
      if (!canRun || !canRun.ok) {
        window.B2BToast && window.B2BToast.error('Varredura bloqueada: ' + (canRun && canRun.reason || 'desconhecido'))
        return
      }
    } catch (e) {
      window.B2BToast && window.B2BToast.error('Erro na validação: ' + (e.message || e))
      return
    }

    var ok = window.B2BToast
      ? await window.B2BToast.confirm(
          'Disparar varredura da categoria "' + cat + '"?\n\nCusto estimado: R$ 1,60 (Google Maps + ~15 candidatos × Claude).\nTempo: 30-90 segundos.',
          { title: 'Confirmar varredura', okLabel: 'Varrer agora' }
        )
      : confirm('Varrer "' + cat + '"? Custo ~R$ 1,60')
    if (!ok) return

    btn.disabled = true
    btn.textContent = 'Varrendo…'

    try {
      var sb = window._sbShared
      // Deno functions endpoint: <SUPABASE_URL>/functions/v1/<name>
      var baseUrl = (window.ClinicEnv && window.ClinicEnv.SUPABASE_URL) || ''
      var anonKey = (window.ClinicEnv && (window.ClinicEnv.SUPABASE_KEY || window.ClinicEnv.SUPABASE_ANON_KEY)) || ''

      if (!baseUrl) throw new Error('SUPABASE_URL ausente em ClinicEnv')

      var resp = await fetch(baseUrl.replace(/\/+$/, '') + '/functions/v1/b2b-scout-scan', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + anonKey,
          'apikey': anonKey,
        },
        body: JSON.stringify({ category: cat, limit: 15 }),
      })
      var data = await resp.json()

      if (!resp.ok || !data.ok) {
        window.B2BToast && window.B2BToast.error('Falha: ' + (data.error || resp.status + ' ' + resp.statusText))
        return
      }

      document.dispatchEvent(new CustomEvent('b2b:scout-scan-done', { detail: data }))
      window.B2BToast && window.B2BToast.success(
        data.created + ' candidatos criados · ' + data.failed + ' falhas · R$ ' + data.total_cost_brl,
        { title: 'Varredura concluída · ' + data.results + ' encontrados', duration: 6000 }
      )
      await _load()
    } catch (e) {
      window.B2BToast && window.B2BToast.error('Erro: ' + (e.message || e))
    } finally {
      btn.disabled = false
      btn.textContent = 'Varrer'
    }
  }

  async function _onAction(e) {
    var btn = e.currentTarget
    var action = btn.getAttribute('data-cand-action')
    var id = btn.getAttribute('data-id')
    if (!id) return

    try {
      if (action === 'evaluate-ia') {
        if (!confirm('Avaliar DNA deste candidato com IA?\n\nCusto: R$ 0,08 (só Claude, sem varredura).')) return
        btn.disabled = true; btn.textContent = 'Avaliando…'
        var baseUrl = (window.ClinicEnv && window.ClinicEnv.SUPABASE_URL) || ''
        var anonKey = (window.ClinicEnv && (window.ClinicEnv.SUPABASE_KEY || window.ClinicEnv.SUPABASE_ANON_KEY)) || ''
        var resp = await fetch(baseUrl.replace(/\/+$/, '') + '/functions/v1/b2b-candidate-evaluate', {
          method: 'POST',
          headers: { 'Content-Type':'application/json', 'Authorization':'Bearer ' + anonKey, 'apikey': anonKey },
          body: JSON.stringify({ candidate_id: id }),
        })
        var data = await resp.json()
        if (!resp.ok || !data.ok) {
          alert('Falha: ' + (data.error || resp.status))
          btn.disabled = false; btn.textContent = 'Avaliar IA'
          return
        }
        await _load()
      } else if (action === 'promote') {
        if (!confirm('Promover candidato a parceria (status=prospect)?')) return
        var sb = window._sbShared
        var r = await sb.rpc('b2b_candidate_promote', { p_id: id })
        if (r.error) throw r.error
        var data = r.data || {}
        if (!data.ok) throw new Error(data.error || 'falha')
        document.dispatchEvent(new CustomEvent('b2b:partnership-saved', { detail: { id: data.partnership_id } }))
        alert('Candidato promovido a parceria (em status prospect).')
        await _load()
      } else {
        var notes = (action === 'declined' || action === 'archived')
          ? (prompt('Motivo (opcional):') || null)
          : null
        await _repo().setStatus(id, action, notes)
        document.dispatchEvent(new CustomEvent('b2b:candidate-status-changed', { detail: { id: id, status: action } }))
        await _load()
      }
    } catch (err) {
      alert('Erro: ' + (err.message || err))
    }
  }

  // ─── Data ───────────────────────────────────────────────────
  async function _load() {
    _state.loading = true
    _state.error = null
    _renderBody()
    try {
      var results = await Promise.all([
        _repo().list({ status: _state.filterStatus, limit: 200 }),
        _repo().consumedCurrentMonth(),
      ])
      _state.candidates  = results[0] || []
      _state.consumption = results[1] || null
    } catch (e) {
      _state.error = e.message || String(e)
      _state.candidates = []
    } finally {
      _state.loading = false
      _renderBody()
      // Contador — só "new" (abertos pra triagem)
      var openCount = _state.candidates.filter(function (c) {
        return ['new','approved','approached','responded','negotiating'].indexOf(c.contact_status) !== -1
      }).length
      document.dispatchEvent(new CustomEvent('b2b:tab-count', {
        detail: { tab: 'candidates', count: openCount }
      }))
    }
  }

  // ─── Bind global ────────────────────────────────────────────
  document.addEventListener('b2b:tab-change', function (e) {
    if (e.detail && e.detail.tab === 'candidates') _load()
  })

  document.addEventListener('b2b:scout-config-updated', function () {
    var cur = window.B2BShell && window.B2BShell.getActiveTab()
    if (cur === 'candidates') _load()
  })

  document.addEventListener('b2b:candidate-added', function () {
    var cur = window.B2BShell && window.B2BShell.getActiveTab()
    if (cur === 'candidates') _load()
  })

  // ─── API pública ────────────────────────────────────────────
  window.B2BCandidates = Object.freeze({
    reload: _load,
    CATEGORIES: CATEGORIES,
  })
})()
