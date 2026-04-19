/**
 * ClinicAI — B2B Detail UI
 *
 * Abre um overlay com a ficha completa da parceria + ações:
 *   - Editar (emite b2b:open-form com mode=edit)
 *   - Mudar status (máquina de estados via B2BService.transitionStatus)
 *
 * Consome: B2BRepository, B2BService
 * Eventos ouvidos: 'b2b:open-detail' { id }
 * Eventos emitidos: 'b2b:partnership-saved' (pós-transição status)
 *
 * Expõe window.B2BDetail.
 */
;(function () {
  'use strict'
  if (window.B2BDetail) return

  var _state = {
    loading: false,
    error: null,
    data: null,   // { partnership, targets, events, content }
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _repo() { return window.B2BRepository }
  function _svc()  { return window.B2BService    }
  function _arr(a) { return Array.isArray(a) && a.length ? a : [] }

  function _kv(label, value) {
    if (value == null || value === '' || (Array.isArray(value) && !value.length)) return ''
    var display = Array.isArray(value) ? value.join(', ') : String(value)
    return '<div class="b2b-kv"><span class="b2b-kv-lbl">' + _esc(label) + '</span>' +
      '<span class="b2b-kv-val">' + _esc(display) + '</span></div>'
  }

  function _fmtBRL(v) {
    if (v == null || v === '') return ''
    try { return Number(v).toLocaleString('pt-BR', { style:'currency', currency:'BRL', maximumFractionDigits:0 }) }
    catch (_) { return 'R$ ' + v }
  }

  function _dnaBar(partnership) {
    var e = Number(partnership.dna_excelencia || 0)
    var s = Number(partnership.dna_estetica || 0)
    var p = Number(partnership.dna_proposito || 0)
    var score = (e + s + p) / 3
    var color = score >= 7 ? '#10B981' : score >= 5 ? '#F59E0B' : '#EF4444'
    return '<div class="b2b-dna">' +
      '<div class="b2b-dna-hdr"><span>DNA</span><strong style="color:' + color + '">' + score.toFixed(1) + '/10</strong></div>' +
      '<div class="b2b-dna-row"><span>Excelência</span><div class="b2b-dna-bar"><div style="width:' + (e*10) + '%;background:' + color + '"></div></div><span>' + e + '</span></div>' +
      '<div class="b2b-dna-row"><span>Estética</span><div class="b2b-dna-bar"><div style="width:' + (s*10) + '%;background:' + color + '"></div></div><span>' + s + '</span></div>' +
      '<div class="b2b-dna-row"><span>Propósito</span><div class="b2b-dna-bar"><div style="width:' + (p*10) + '%;background:' + color + '"></div></div><span>' + p + '</span></div>' +
    '</div>'
  }

  function _statusOptions(current) {
    var svc = _svc()
    return svc.STATUSES.map(function (st) {
      var allowed = svc.canTransition(current, st)
      return '<option value="' + st + '"' + (!allowed && st !== current ? ' disabled' : '') +
        (st === current ? ' selected' : '') + '>' + st + '</option>'
    }).join('')
  }

  function _renderBody() {
    if (_state.loading) return '<div class="b2b-empty">Carregando…</div>'
    if (_state.error)   return '<div class="b2b-empty b2b-empty-err">' + _esc(_state.error) + '</div>'
    if (!_state.data)   return ''

    var d = _state.data
    var p = d.partnership

    return '<div class="b2b-detail">' +
      '<div class="b2b-detail-hdr">' +
        '<div>' +
          '<div class="b2b-eyebrow">' + _esc(p.pillar || '') + (p.category ? ' · ' + _esc(p.category) : '') + '</div>' +
          '<h2>' + _esc(p.name) + '</h2>' +
          '<div class="b2b-detail-meta">' +
            (p.tier ? '<span class="b2b-pill b2b-pill-tier">Tier ' + p.tier + '</span>' : '') +
            '<span class="b2b-pill b2b-pill-type">' + _esc(({ transactional:'Transacional', occasion:'Ocasião', institutional:'Institucional' })[p.type] || p.type) + '</span>' +
            '<span class="b2b-pill">' + _esc(p.status) + '</span>' +
          '</div>' +
        '</div>' +
        '<div class="b2b-detail-actions">' +
          (p.is_collective
            ? '<button type="button" class="b2b-btn" data-action="groups" data-id="' + _esc(p.id) + '" data-name="' + _esc(p.name) + '" title="Registrar palestras, eventos e exposições ao grupo">Alcance do grupo</button>'
            : '') +
          '<button type="button" class="b2b-btn" data-action="playbook" data-id="' + _esc(p.id) + '" title="Aplicar playbook de abertura (tasks + content + metas por tipo)">Aplicar Playbook</button>' +
          '<button type="button" class="b2b-btn" data-action="report" data-id="' + _esc(p.id) + '">Relatório PDF</button>' +
          '<button type="button" class="b2b-btn" data-action="vouchers" data-id="' + _esc(p.id) + '" data-name="' + _esc(p.name) + '">Vouchers</button>' +
          '<button type="button" class="b2b-btn" data-action="edit" data-id="' + _esc(p.id) + '">Editar</button>' +
          '<select class="b2b-input b2b-status-sel" data-action="status" data-id="' + _esc(p.id) + '" data-current="' + _esc(p.status) + '">' +
            _statusOptions(p.status) +
          '</select>' +
        '</div>' +
      '</div>' +

      _dnaBar(p) +

      '<div class="b2b-detail-cols">' +
        '<div class="b2b-detail-col">' +
          '<div class="b2b-sec-title">Contato</div>' +
          _kv('Responsável', p.contact_name) +
          _kv('Telefone',    p.contact_phone) +
          _kv('E-mail',      p.contact_email) +
          _kv('Instagram',   p.contact_instagram) +
          _kv('Site',        p.contact_website) +

          '<div class="b2b-sec-title">Voucher</div>' +
          _kv('Combo',         p.voucher_combo) +
          _kv('Validade',      (p.voucher_validity_days || '—') + ' dias') +
          _kv('Antecedência',  (p.voucher_min_notice_days || '—') + ' dias') +
          _kv('Cap mensal',    p.voucher_monthly_cap ? p.voucher_monthly_cap + ' un.' : '') +
          _kv('Entrega',       p.voucher_delivery) +

          '<div class="b2b-sec-title">Vigência</div>' +
          _kv('Teto mensal',        _fmtBRL(p.monthly_value_cap_brl)) +
          _kv('Duração (meses)',    p.contract_duration_months) +
          _kv('Revisão (meses)',    p.review_cadence_months) +
          _kv('Sazonais',           p.sazonais) +
        '</div>' +

        '<div class="b2b-detail-col">' +
          '<div class="b2b-sec-title">Narrativa</div>' +
          (_arr(p.slogans).length ?
            '<ul class="b2b-slogans">' +
              p.slogans.map(function (s) { return '<li>' + _esc(s) + '</li>' }).join('') +
            '</ul>' : '') +
          (p.narrative_quote ?
            '<blockquote class="b2b-quote">' + _esc(p.narrative_quote) +
            (p.narrative_author ? '<cite>— ' + _esc(p.narrative_author) + '</cite>' : '') +
            '</blockquote>' : '') +
          _kv('Gatilho emocional', p.emotional_trigger) +

          '<div class="b2b-sec-title">Contrapartida</div>' +
          _kv('O que o parceiro entrega', p.contrapartida) +
          _kv('Cadência',                  p.contrapartida_cadence) +

          '<div class="b2b-sec-title">Equipe envolvida</div>' +
          _kv('Profissionais', p.involved_professionals) +
        '</div>' +
      '</div>' +

      (_arr(d.targets).length ? _renderTargets(d.targets)   : '') +
      (_arr(d.events).length  ? _renderEvents(d.events)     : '') +
      (_arr(d.content).length ? _renderContent(d.content)   : '') +
      '<div id="b2bWowActionsSection"></div>' +
      '<div id="b2bImpactSection"></div>' +
      '<div id="b2bRoiSection"></div>' +
      '<div id="b2bCostSection"></div>' +
      '<div id="b2bTrendSection"></div>' +
      '<div id="b2bCommentsSection"></div>' +
      '<div id="b2bTimelineSection"></div>' +
    '</div>'
  }

  function _mountWowActions(partnership) {
    if (window.B2BWowActions) {
      setTimeout(function () {
        window.B2BWowActions.mount('b2bWowActionsSection', partnership)
      }, 40)
    }
  }

  // Monta timeline (async) depois do body renderizar
  function _mountTimeline(id) {
    if (window.B2BTimeline) {
      setTimeout(function () { window.B2BTimeline.mount('b2bTimelineSection', id) }, 100)
    }
  }

  // Monta comentários inline (Fraqueza #7)
  function _mountComments(id) {
    if (window.B2BComments) {
      setTimeout(function () { window.B2BComments.mount('b2bCommentsSection', id) }, 80)
    }
  }

  // Monta custo real (Fraqueza #8) + tendência (Fraqueza #9) + Impact + ROI
  function _mountCostAndTrend(id) {
    if (window.B2BImpactPanel) {
      setTimeout(function () { window.B2BImpactPanel.mount('b2bImpactSection', id) }, 50)
    }
    if (window.B2BRoiPanel) {
      setTimeout(function () { window.B2BRoiPanel.mount('b2bRoiSection', id) }, 55)
    }
    if (window.B2BCostPanel) {
      setTimeout(function () { window.B2BCostPanel.mount('b2bCostSection', id) }, 60)
    }
    if (window.B2BTrendPanel) {
      setTimeout(function () { window.B2BTrendPanel.mount('b2bTrendSection', id) }, 70)
    }
  }

  function _renderTargets(targets) {
    return '<div class="b2b-sec-title">Metas operacionais</div>' +
      '<table class="b2b-table"><thead><tr><th>Indicador</th><th>Meta</th><th>Cadência</th><th>Horizonte</th><th>Benefício</th></tr></thead><tbody>' +
      targets.map(function (t) {
        return '<tr><td>' + _esc(t.indicator) + '</td><td>' + _esc(t.target_value) + '</td>' +
          '<td>' + _esc(t.cadence) + '</td><td>' + (t.horizon_days || '—') + 'd</td>' +
          '<td>' + _esc(t.benefit_label || '') + '</td></tr>'
      }).join('') + '</tbody></table>'
  }

  function _renderEvents(events) {
    return '<div class="b2b-sec-title">Eventos</div>' +
      '<table class="b2b-table"><thead><tr><th>Tipo</th><th>Título</th><th>Cadência/data</th><th>Status</th></tr></thead><tbody>' +
      events.map(function (e) {
        return '<tr><td>' + _esc(e.event_type) + '</td><td>' + _esc(e.title) + '</td>' +
          '<td>' + _esc(e.date_or_cadence) + '</td><td>' + _esc(e.status) + '</td></tr>'
      }).join('') + '</tbody></table>'
  }

  function _renderContent(content) {
    var groups = {}
    content.forEach(function (c) { (groups[c.kind] = groups[c.kind] || []).push(c) })
    return '<div class="b2b-sec-title">Playbook de conteúdo</div>' +
      Object.keys(groups).map(function (k) {
        return '<div class="b2b-content-group"><div class="b2b-content-kind">' + _esc(k) + '</div>' +
          groups[k].map(function (c) { return '<div class="b2b-content-item">' + _esc(c.content) + '</div>' }).join('') +
        '</div>'
      }).join('')
  }

  function _renderOverlay() {
    return '<div class="b2b-overlay" data-detail-overlay>' +
      '<div class="b2b-modal b2b-modal-wide">' +
        '<header class="b2b-modal-hdr">' +
          '<h2>Detalhe da parceria</h2>' +
          '<button type="button" class="b2b-close" data-detail-close aria-label="Fechar">&times;</button>' +
        '</header>' +
        '<div class="b2b-modal-body">' + _renderBody() + '</div>' +
      '</div>' +
    '</div>'
  }

  // ─── Actions ────────────────────────────────────────────────
  async function _onStatusChange(ev) {
    var sel = ev.target
    var id = sel.getAttribute('data-id')
    var current = sel.getAttribute('data-current')
    var newStatus = sel.value
    if (newStatus === current) return

    var reason = window.B2BToast
      ? await window.B2BToast.prompt('Motivo da transição ' + current + ' → ' + newStatus + ' (opcional):', '',
          { title: 'Mudar status', okLabel: 'Confirmar' })
      : (prompt('Motivo da transição ' + current + ' → ' + newStatus + ' (opcional):') || null)
    // prompt com cancel retorna null; aceitamos vazio como "sem motivo"
    if (reason === null && window.B2BToast) { sel.value = current; return }

    var partnership = _state.data && _state.data.partnership
    if (!partnership) return
    partnership.status = current

    try {
      await _svc().transitionStatus(partnership, newStatus, reason || null)
      document.dispatchEvent(new CustomEvent('b2b:partnership-saved', { detail: { id: id } }))
      window.B2BToast && window.B2BToast.success('Status atualizado para ' + newStatus)
      close()
    } catch (e) {
      window.B2BToast ? window.B2BToast.error('Falha: ' + (e.message || e)) : alert('Falha: ' + (e.message || e))
      sel.value = current
    }
  }

  async function open(id) {
    _state.loading = true
    _state.error = null
    _state.data = null
    _mount()
    try {
      var r = await _repo().get(id)
      if (!r || !r.ok) throw new Error(r && r.error || 'não encontrado')
      _state.data = r
    } catch (e) {
      _state.error = e.message || String(e)
    } finally {
      _state.loading = false
      _mount()
      if (_state.data && _state.data.partnership) {
        _mountWowActions(_state.data.partnership)
        _mountTimeline(_state.data.partnership.id)
        _mountComments(_state.data.partnership.id)
        _mountCostAndTrend(_state.data.partnership.id)
      }
    }
  }

  function close() {
    var host = document.getElementById('b2bDetailOverlayHost')
    if (host) host.innerHTML = ''
  }

  function _mount() {
    var host = document.getElementById('b2bDetailOverlayHost')
    if (!host) {
      host = document.createElement('div')
      host.id = 'b2bDetailOverlayHost'
      document.body.appendChild(host)
    }
    host.innerHTML = _renderOverlay()
    _bind(host)
  }

  function _bind(host) {
    host.querySelectorAll('[data-detail-close]').forEach(function (el) {
      el.addEventListener('click', close)
    })
    var ov = host.querySelector('[data-detail-overlay]')
    if (ov) ov.addEventListener('click', function (e) { if (e.target === ov) close() })

    var editBtn = host.querySelector('[data-action="edit"]')
    if (editBtn) {
      editBtn.addEventListener('click', function () {
        var id = editBtn.getAttribute('data-id')
        close()
        document.dispatchEvent(new CustomEvent('b2b:open-form', { detail: { mode: 'edit', id: id } }))
      })
    }

    var vouchBtn = host.querySelector('[data-action="vouchers"]')
    if (vouchBtn) {
      vouchBtn.addEventListener('click', function () {
        var id   = vouchBtn.getAttribute('data-id')
        var name = vouchBtn.getAttribute('data-name')
        document.dispatchEvent(new CustomEvent('b2b:open-vouchers', { detail: { partnershipId: id, partnershipName: name } }))
      })
    }

    var groupsBtn = host.querySelector('[data-action="groups"]')
    if (groupsBtn) {
      groupsBtn.addEventListener('click', function () {
        var id   = groupsBtn.getAttribute('data-id')
        var name = groupsBtn.getAttribute('data-name')
        document.dispatchEvent(new CustomEvent('b2b:open-groups', { detail: { partnershipId: id, partnershipName: name } }))
      })
    }

    var playbookBtn = host.querySelector('[data-action="playbook"]')
    if (playbookBtn) {
      playbookBtn.addEventListener('click', async function () {
        var id = playbookBtn.getAttribute('data-id')
        if (!window.B2BPlaybookRepository) {
          window.B2BToast && window.B2BToast.error('Playbook não carregado')
          return
        }
        var ok = window.B2BToast
          ? await window.B2BToast.confirm(
              'Vai criar tasks iniciais, carrossel padrão + 3 ganchos e metas operacionais por tipo. Idempotente — não duplica se já rodou antes.',
              { title: 'Aplicar playbook de abertura?', okLabel: 'Aplicar' })
          : confirm('Aplicar playbook?')
        if (!ok) return

        playbookBtn.disabled = true; playbookBtn.textContent = 'Aplicando…'
        try {
          var r = await window.B2BPlaybookRepository.apply(id)
          if (!r || !r.ok) throw new Error(r && r.error || 'falhou')
          window.B2BToast && window.B2BToast.success(
            r.tasks + ' tasks · ' + r.contents + ' conteúdos · ' + r.targets + ' metas',
            { title: 'Playbook ' + r.type + ' aplicado', duration: 5000 }
          )
          document.dispatchEvent(new CustomEvent('b2b:partnership-saved', { detail: { id: id } }))
          close()
          document.dispatchEvent(new CustomEvent('b2b:open-detail', { detail: { id: id } }))
        } catch (err) {
          window.B2BToast && window.B2BToast.error('Erro: ' + err.message)
          playbookBtn.disabled = false; playbookBtn.textContent = 'Aplicar Playbook'
        }
      })
    }

    var reportBtn = host.querySelector('[data-action="report"]')
    if (reportBtn) {
      reportBtn.addEventListener('click', async function () {
        var partnership = _state.data && _state.data.partnership
        if (!partnership) return
        var funnel = null
        try {
          if (window.B2BVouchersRepository) {
            funnel = await window.B2BVouchersRepository.funnel(partnership.id)
          }
        } catch (_) {}
        if (window.B2BReportService) {
          window.B2BReportService.open({ partnership: partnership, funnel: funnel })
        }
      })
    }

    var statusSel = host.querySelector('[data-action="status"]')
    if (statusSel) statusSel.addEventListener('change', _onStatusChange)
  }

  // ─── Bind global ────────────────────────────────────────────
  document.addEventListener('b2b:open-detail', function (e) {
    var id = e.detail && e.detail.id
    if (id) open(id)
  })

  // ─── API pública ────────────────────────────────────────────
  window.B2BDetail = Object.freeze({ open: open, close: close })
})()
