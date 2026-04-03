/**
 * ClinicAI — Medical Record Editor UI
 *
 * Componente completo de prontuário:
 *   • Card de resumo do paciente (total de registros + contadores por tipo)
 *   • Formulário de novo registro (tipo, título, conteúdo, confidencial)
 *   • Timeline de histórico com paginação
 *   • Inline edit + confirmação de exclusão
 *
 * Uso:
 *   MedicalRecordEditorUI.mount(containerId, { patientId, patientName })
 *   MedicalRecordEditorUI.unmount(containerId)
 *
 * Depende de:
 *   MedicalRecordsService   (medical-records.service.js)
 */

;(function () {
  'use strict'

  if (window._clinicaiMrEditorLoaded) return
  window._clinicaiMrEditorLoaded = true

  // ── Constantes ────────────────────────────────────────────────
  const PAGE_SIZE = 20

  const TYPE_LABELS = {
    nota_clinica: 'Nota Clínica',
    evolucao:     'Evolução',
    prescricao:   'Prescrição',
    alerta:       'Alerta',
    observacao:   'Observação',
    procedimento: 'Procedimento',
  }

  const TYPE_COLORS = {
    nota_clinica: '#3B82F6',
    evolucao:     '#10B981',
    prescricao:   '#8B5CF6',
    alerta:       '#EF4444',
    observacao:   '#F59E0B',
    procedimento: '#06B6D4',
  }

  // Ícones SVG inline (Feather style)
  const ICONS = {
    plus:       `<svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    edit:       `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>`,
    trash:      `<svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`,
    lock:       `<svg width="12" height="12" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    chevronDown:`<svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="6 9 12 15 18 9"/></svg>`,
    clipboard:  `<svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>`,
  }

  // ── Estado por instância ──────────────────────────────────────
  const _instances = {}

  function _state(containerId) {
    if (!_instances[containerId]) {
      _instances[containerId] = {
        patientId:   null,
        patientName: '',
        records:     [],
        total:       0,
        offset:      0,
        hasMore:     false,
        loading:     false,
        typeFilter:  null,
        editingId:   null,
        summary:     { total: 0, last_record: null, by_type: {} },
      }
    }
    return _instances[containerId]
  }

  // ── Helpers de formatação ─────────────────────────────────────
  function _fmtDate(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    })
  }

  function _fmtDateShort(iso) {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('pt-BR', {
      day: '2-digit', month: 'short', year: 'numeric',
    })
  }

  function _esc(str) {
    return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  }

  // ── Render: Summary Card ──────────────────────────────────────
  function _renderSummary(state) {
    const s = state.summary
    const byType = s.by_type || {}
    const pills = Object.entries(TYPE_LABELS)
      .filter(([k]) => byType[k])
      .map(([k, label]) => {
        const color = TYPE_COLORS[k] || '#6B7280'
        return `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${color}1A;color:${color}">
          ${_esc(label)} <span style="font-weight:700">${byType[k]}</span>
        </span>`
      }).join('')

    return `<div style="background:var(--surface);border:1.5px solid var(--border);border-radius:12px;padding:16px 20px;margin-bottom:20px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:12px">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="width:38px;height:38px;border-radius:10px;background:#3B82F61A;display:flex;align-items:center;justify-content:center;color:#3B82F6">${ICONS.clipboard}</div>
        <div>
          <div style="font-size:13px;font-weight:700;color:var(--text-primary)">${_esc(state.patientName)}</div>
          <div style="font-size:12px;color:var(--text-muted)">${s.total || 0} registro${s.total !== 1 ? 's' : ''} · Último em ${_fmtDateShort(s.last_record)}</div>
        </div>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:6px">${pills || '<span style="font-size:12px;color:var(--text-muted)">Nenhum registro ainda</span>'}</div>
    </div>`
  }

  // ── Render: Formulário de novo registro ───────────────────────
  function _renderNewForm(state, containerId) {
    const svc = window.MedicalRecordsService
    if (!svc?.canCreate()) return ''

    const typeOptions = Object.entries(TYPE_LABELS)
      .map(([v, l]) => `<option value="${v}">${l}</option>`).join('')

    return `<div id="mr-new-form-${_esc(containerId)}" style="background:var(--surface);border:1.5px solid var(--accent-gold);border-radius:12px;padding:20px;margin-bottom:20px">
      <div style="font-size:13px;font-weight:700;color:var(--text-primary);margin-bottom:14px;display:flex;align-items:center;gap:7px">
        ${ICONS.plus} Novo Registro de Prontuário
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Tipo</label>
          <select id="mr-new-type-${_esc(containerId)}" style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-primary);outline:none;cursor:pointer">
            ${typeOptions}
          </select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Título <span style="font-weight:400;text-transform:none">(opcional)</span></label>
          <input id="mr-new-title-${_esc(containerId)}" type="text" placeholder="Ex: Consulta inicial, Retorno..." maxlength="200"
            style="width:100%;padding:9px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-primary);outline:none;box-sizing:border-box">
        </div>
      </div>
      <div style="margin-bottom:12px">
        <label style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Conteúdo <span style="color:#EF4444">*</span></label>
        <textarea id="mr-new-content-${_esc(containerId)}" rows="4" placeholder="Descreva a evolução, prescrição ou observação clínica..."
          style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-primary);outline:none;resize:vertical;box-sizing:border-box;font-family:inherit;line-height:1.5"></textarea>
      </div>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px">
        <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;color:var(--text-secondary)">
          <input type="checkbox" id="mr-new-confidential-${_esc(containerId)}" style="accent-color:var(--accent-gold);width:14px;height:14px">
          <span style="display:flex;align-items:center;gap:4px">${ICONS.lock} Registro confidencial (somente você e admins)</span>
        </label>
        <div style="display:flex;gap:8px;align-items:center">
          <span id="mr-new-error-${_esc(containerId)}" style="font-size:12px;color:#EF4444;display:none"></span>
          <button onclick="MedicalRecordEditorUI._saveNew('${_esc(containerId)}')"
            style="padding:9px 20px;background:var(--accent-gold);color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:6px;transition:opacity .15s"
            onmouseover="this.style.opacity='.85'" onmouseout="this.style.opacity='1'">
            ${ICONS.plus} Salvar Registro
          </button>
        </div>
      </div>
    </div>`
  }

  // ── Render: Filtro de tipo ────────────────────────────────────
  function _renderTypeFilter(state, containerId) {
    const all = state.typeFilter === null
    const makeBtn = (value, label, color) => {
      const active = state.typeFilter === value
      const bg = active ? color : 'transparent'
      const fc = active ? '#fff' : (color || 'var(--text-secondary)')
      const bd = active ? color : 'var(--border)'
      return `<button onclick="MedicalRecordEditorUI._setFilter('${_esc(containerId)}', ${value ? `'${value}'` : 'null'})"
        style="padding:5px 12px;border:1.5px solid ${bd};border-radius:20px;font-size:12px;font-weight:600;background:${bg};color:${fc};cursor:pointer;transition:all .15s">
        ${_esc(label)}
      </button>`
    }

    const allBg = all ? 'var(--accent-gold)' : 'transparent'
    const allFc = all ? '#fff' : 'var(--text-secondary)'
    const allBd = all ? 'var(--accent-gold)' : 'var(--border)'

    return `<div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px">
      <button onclick="MedicalRecordEditorUI._setFilter('${_esc(containerId)}', null)"
        style="padding:5px 12px;border:1.5px solid ${allBd};border-radius:20px;font-size:12px;font-weight:600;background:${allBg};color:${allFc};cursor:pointer;transition:all .15s">
        Todos
      </button>
      ${Object.entries(TYPE_LABELS).map(([v, l]) => makeBtn(v, l, TYPE_COLORS[v])).join('')}
    </div>`
  }

  // ── Render: Linha de registro ─────────────────────────────────
  function _renderRecord(rec, state, containerId) {
    const svc = window.MedicalRecordsService
    const color = TYPE_COLORS[rec.record_type] || '#6B7280'
    const label = TYPE_LABELS[rec.record_type] || rec.record_type
    const canEdit   = svc?.canEdit(rec)
    const canDelete = svc?.canDelete(rec)
    const isEditing = state.editingId === rec.id

    if (isEditing) {
      return _renderEditForm(rec, state, containerId)
    }

    return `<div id="mr-record-${_esc(rec.id)}" style="background:var(--surface);border:1.5px solid var(--border);border-radius:10px;padding:16px;transition:box-shadow .15s" onmouseover="this.style.boxShadow='0 2px 8px rgba(0,0,0,.06)'" onmouseout="this.style.boxShadow='none'">
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px">
        <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
          <span style="padding:3px 10px;border-radius:20px;font-size:11px;font-weight:600;background:${color}1A;color:${color}">${_esc(label)}</span>
          ${rec.is_confidential ? `<span style="display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:20px;font-size:11px;font-weight:600;background:#F3F4F6;color:#6B7280">${ICONS.lock} Confidencial</span>` : ''}
          ${rec.title ? `<span style="font-size:13px;font-weight:600;color:var(--text-primary)">${_esc(rec.title)}</span>` : ''}
        </div>
        <div style="display:flex;align-items:center;gap:6px;flex-shrink:0">
          ${canEdit   ? `<button title="Editar" onclick="MedicalRecordEditorUI._startEdit('${_esc(containerId)}','${_esc(rec.id)}')" style="width:28px;height:28px;border:1.5px solid var(--border);border-radius:6px;background:transparent;color:var(--text-muted);cursor:pointer;display:flex;align-items:center;justify-content:center" onmouseover="this.style.background='#F3F4F6'" onmouseout="this.style.background='transparent'">${ICONS.edit}</button>` : ''}
          ${canDelete ? `<button title="Excluir" onclick="MedicalRecordEditorUI._confirmDelete('${_esc(containerId)}','${_esc(rec.id)}')" style="width:28px;height:28px;border:1.5px solid var(--border);border-radius:6px;background:transparent;color:#EF4444;cursor:pointer;display:flex;align-items:center;justify-content:center" onmouseover="this.style.background='#FEF2F2'" onmouseout="this.style.background='transparent'">${ICONS.trash}</button>` : ''}
        </div>
      </div>
      <div style="font-size:13px;color:var(--text-primary);line-height:1.6;white-space:pre-wrap;word-break:break-word">${_esc(rec.content)}</div>
      <div style="margin-top:10px;display:flex;align-items:center;gap:8px;font-size:11px;color:var(--text-muted)">
        <span>${_fmtDate(rec.created_at)}</span>
        ${rec.professional_name ? `<span>·</span><span>${_esc(rec.professional_name)}</span>` : ''}
        ${rec.is_mine ? `<span style="color:var(--accent-gold);font-weight:600">· Você</span>` : ''}
        ${rec.updated_at !== rec.created_at ? `<span>· editado</span>` : ''}
      </div>
    </div>`
  }

  // ── Render: Formulário inline de edição ───────────────────────
  function _renderEditForm(rec, state, containerId) {
    const typeOptions = Object.entries(TYPE_LABELS)
      .map(([v, l]) => `<option value="${v}" ${v === rec.record_type ? 'selected' : ''}>${l}</option>`).join('')

    return `<div id="mr-record-${_esc(rec.id)}" style="background:var(--surface);border:2px solid var(--accent-gold);border-radius:10px;padding:16px">
      <div style="font-size:12px;font-weight:700;color:var(--accent-gold);margin-bottom:12px;text-transform:uppercase;letter-spacing:.05em">Editando registro</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px">Tipo</label>
          <select id="mr-edit-type-${_esc(rec.id)}" style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-primary);outline:none">${typeOptions}</select>
        </div>
        <div>
          <label style="font-size:11px;font-weight:700;color:var(--text-muted);display:block;margin-bottom:4px">Título</label>
          <input id="mr-edit-title-${_esc(rec.id)}" type="text" value="${_esc(rec.title || '')}" maxlength="200"
            style="width:100%;padding:8px 10px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-primary);outline:none;box-sizing:border-box">
        </div>
      </div>
      <textarea id="mr-edit-content-${_esc(rec.id)}" rows="4"
        style="width:100%;padding:10px 12px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:var(--surface);color:var(--text-primary);outline:none;resize:vertical;box-sizing:border-box;font-family:inherit;margin-bottom:10px">${_esc(rec.content)}</textarea>
      <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px">
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:12px;color:var(--text-secondary)">
          <input type="checkbox" id="mr-edit-confidential-${_esc(rec.id)}" ${rec.is_confidential ? 'checked' : ''} style="accent-color:var(--accent-gold)">
          ${ICONS.lock} Confidencial
        </label>
        <div style="display:flex;gap:8px">
          <button onclick="MedicalRecordEditorUI._cancelEdit('${_esc(containerId)}')"
            style="padding:7px 14px;border:1.5px solid var(--border);border-radius:8px;font-size:12px;background:transparent;color:var(--text-secondary);cursor:pointer">
            Cancelar
          </button>
          <button onclick="MedicalRecordEditorUI._saveEdit('${_esc(containerId)}','${_esc(rec.id)}')"
            style="padding:7px 14px;background:var(--accent-gold);color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">
            Salvar
          </button>
        </div>
      </div>
    </div>`
  }

  // ── Render: Timeline ──────────────────────────────────────────
  function _renderTimeline(state, containerId) {
    if (state.loading) {
      return `<div style="text-align:center;padding:40px;color:var(--text-muted);font-size:13px">Carregando registros...</div>`
    }
    if (!state.records.length) {
      return `<div style="text-align:center;padding:40px;color:var(--text-muted)">
        <div style="font-size:32px;margin-bottom:10px">📋</div>
        <div style="font-size:14px;font-weight:600;margin-bottom:4px">Nenhum registro encontrado</div>
        <div style="font-size:12px">${state.typeFilter ? 'Nenhum registro deste tipo para este paciente.' : 'Crie o primeiro registro de prontuário acima.'}</div>
      </div>`
    }

    const items = state.records.map(r => _renderRecord(r, state, containerId)).join('')

    const loadMore = state.hasMore ? `
      <div style="text-align:center;padding:16px">
        <button onclick="MedicalRecordEditorUI._loadMore('${_esc(containerId)}')"
          style="padding:9px 20px;border:1.5px solid var(--border);border-radius:8px;font-size:13px;background:transparent;color:var(--text-secondary);cursor:pointer">
          Carregar mais registros ${ICONS.chevronDown}
        </button>
      </div>` : ''

    return `<div style="display:flex;flex-direction:column;gap:10px">${items}</div>${loadMore}`
  }

  // ── Render completo ───────────────────────────────────────────
  function _render(containerId) {
    const container = document.getElementById(containerId)
    if (!container) return

    const state = _state(containerId)

    container.innerHTML = `
      <div id="mr-root-${_esc(containerId)}">
        <div id="mr-summary-${_esc(containerId)}">${_renderSummary(state)}</div>
        ${_renderNewForm(state, containerId)}
        ${_renderTypeFilter(state, containerId)}
        <div id="mr-timeline-${_esc(containerId)}">${_renderTimeline(state, containerId)}</div>
      </div>`
  }

  function _reRenderTimeline(containerId) {
    const el = document.getElementById(`mr-timeline-${containerId}`)
    if (el) el.innerHTML = _renderTimeline(_state(containerId), containerId)
  }

  function _reRenderSummary(containerId) {
    const el = document.getElementById(`mr-summary-${containerId}`)
    if (el) el.innerHTML = _renderSummary(_state(containerId))
  }

  // ── Ações públicas ────────────────────────────────────────────

  async function _loadRecords(containerId, append = false) {
    const state = _state(containerId)
    const svc = window.MedicalRecordsService
    if (!svc) return

    state.loading = true
    _reRenderTimeline(containerId)

    const result = await svc.listForPatient(state.patientId, {
      limit:      PAGE_SIZE,
      offset:     state.offset,
      typeFilter: state.typeFilter,
    })

    state.loading = false
    state.total   = result.total
    state.hasMore = result.has_more

    if (append) {
      state.records = [...state.records, ...result.records]
    } else {
      state.records = result.records
    }

    _reRenderTimeline(containerId)
  }

  async function _loadSummary(containerId) {
    const state = _state(containerId)
    const svc = window.MedicalRecordsService
    if (!svc) return
    state.summary = await svc.getPatientSummary(state.patientId)
    _reRenderSummary(containerId)
  }

  async function _saveNew(containerId) {
    const svc = window.MedicalRecordsService
    const state = _state(containerId)
    const errEl = document.getElementById(`mr-new-error-${containerId}`)
    if (errEl) errEl.style.display = 'none'

    const type    = document.getElementById(`mr-new-type-${containerId}`)?.value || 'nota_clinica'
    const title   = document.getElementById(`mr-new-title-${containerId}`)?.value.trim() || ''
    const content = document.getElementById(`mr-new-content-${containerId}`)?.value.trim() || ''
    const conf    = document.getElementById(`mr-new-confidential-${containerId}`)?.checked || false

    if (!content) {
      if (errEl) { errEl.textContent = 'O conteúdo não pode estar vazio.'; errEl.style.display = 'inline' }
      return
    }

    const btn = document.querySelector(`#mr-new-form-${containerId} button[onclick*="_saveNew"]`)
    if (btn) { btn.disabled = true; btn.style.opacity = '.5' }

    const result = await svc.create({
      patientId:      state.patientId,
      recordType:     type,
      title,
      content,
      isConfidential: conf,
    })

    if (btn) { btn.disabled = false; btn.style.opacity = '1' }

    if (!result.ok) {
      if (errEl) { errEl.textContent = result.error || 'Erro ao salvar.'; errEl.style.display = 'inline' }
      return
    }

    // Limpa form
    const contentEl = document.getElementById(`mr-new-content-${containerId}`)
    const titleEl   = document.getElementById(`mr-new-title-${containerId}`)
    const confEl    = document.getElementById(`mr-new-confidential-${containerId}`)
    if (contentEl) contentEl.value = ''
    if (titleEl)   titleEl.value   = ''
    if (confEl)    confEl.checked  = false

    // Recarrega lista e summary
    state.offset  = 0
    state.records = []
    await _loadRecords(containerId)
    await _loadSummary(containerId)
  }

  function _setFilter(containerId, typeFilter) {
    const state = _state(containerId)
    state.typeFilter = typeFilter
    state.offset     = 0
    state.records    = []
    _loadRecords(containerId)
    // Re-render filtro para refletir seleção ativa
    const filterEl = document.querySelector(`#mr-root-${containerId} > div:nth-child(3)`)
    if (filterEl) filterEl.outerHTML = _renderTypeFilter(state, containerId)
  }

  async function _loadMore(containerId) {
    const state = _state(containerId)
    state.offset += PAGE_SIZE
    await _loadRecords(containerId, true)
  }

  function _startEdit(containerId, recordId) {
    const state = _state(containerId)
    state.editingId = recordId
    _reRenderTimeline(containerId)
  }

  function _cancelEdit(containerId) {
    const state = _state(containerId)
    state.editingId = null
    _reRenderTimeline(containerId)
  }

  async function _saveEdit(containerId, recordId) {
    const svc   = window.MedicalRecordsService
    const state = _state(containerId)
    const rec   = state.records.find(r => r.id === recordId)
    if (!rec) return

    const type    = document.getElementById(`mr-edit-type-${recordId}`)?.value || rec.record_type
    const title   = document.getElementById(`mr-edit-title-${recordId}`)?.value.trim() || ''
    const content = document.getElementById(`mr-edit-content-${recordId}`)?.value.trim() || ''
    const conf    = document.getElementById(`mr-edit-confidential-${recordId}`)?.checked ?? rec.is_confidential

    const result = await svc.update(recordId, rec, {
      title,
      content,
      recordType:     type,
      isConfidential: conf,
    })

    if (!result.ok) {
      alert(result.error || 'Erro ao editar registro.')
      return
    }

    state.editingId = null
    state.offset    = 0
    state.records   = []
    await _loadRecords(containerId)
    await _loadSummary(containerId)
  }

  async function _confirmDelete(containerId, recordId) {
    if (!confirm('Remover este registro do prontuário? O histórico clínico será preservado (soft delete).')) return

    const svc   = window.MedicalRecordsService
    const state = _state(containerId)
    const rec   = state.records.find(r => r.id === recordId)
    if (!rec) return

    const result = await svc.remove(recordId, rec)
    if (!result.ok) {
      alert(result.error || 'Erro ao remover registro.')
      return
    }

    state.offset  = 0
    state.records = []
    await _loadRecords(containerId)
    await _loadSummary(containerId)
  }

  // ── API Pública ───────────────────────────────────────────────

  /**
   * Monta o editor de prontuário dentro de um container HTML.
   * @param {string} containerId   — id do elemento HTML raiz
   * @param {object} opts
   * @param {string} opts.patientId
   * @param {string} opts.patientName
   */
  async function mount(containerId, { patientId, patientName = '' } = {}) {
    const state = _state(containerId)
    state.patientId   = patientId
    state.patientName = patientName
    state.records     = []
    state.offset      = 0
    state.editingId   = null
    state.typeFilter  = null

    _render(containerId)
    await Promise.all([
      _loadSummary(containerId),
      _loadRecords(containerId),
    ])
  }

  /**
   * Limpa o container e libera o estado da instância.
   */
  function unmount(containerId) {
    const container = document.getElementById(containerId)
    if (container) container.innerHTML = ''
    delete _instances[containerId]
  }

  // ── Exposição global ──────────────────────────────────────────
  window.MedicalRecordEditorUI = {
    mount,
    unmount,
    // Internos chamados por onclick no HTML gerado
    _saveNew,
    _setFilter,
    _loadMore,
    _startEdit,
    _cancelEdit,
    _saveEdit,
    _confirmDelete,
  }

})()
