/**
 * Growth Tracker — UI
 * Render de rows, progress bars, "Esta semana", wiring de eventos.
 * Única camada que toca no DOM. Lê estado via Repo/Service.
 */
(function (global) {
  'use strict';

  const Data = global.GrowthTrackerData;
  const Repo = global.GrowthTrackerRepository;
  const Svc  = global.GrowthTrackerService;

  // ── Icons ─────────────────────────────────────────────────────
  const ICON_CHEVRON = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>';
  const ICON_WARN    = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>';
  const ICON_LOCK    = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

  // ── Render helpers ────────────────────────────────────────────
  function html(strings, ...values) {
    return strings.reduce((acc, str, i) =>
      acc + str + (values[i] !== undefined ? escapeHtml(values[i]) : ''), '');
  }

  function escapeHtml(v) {
    if (v === null || v === undefined) return '';
    return String(v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderOwnerOptions(selected) {
    const opts = ['<option value="">— dono —</option>']
      .concat(Data.OWNERS.map(o =>
        `<option value="${o.id}"${selected === o.id ? ' selected' : ''}>${escapeHtml(o.label)}</option>`
      ));
    return opts.join('');
  }

  function renderRow(item, options) {
    options = options || {};
    const state = Repo.getItem(item.id) || {};
    const checked = !!state.checked;
    const owner = state.owner || '';
    const dueDate = state.dueDate || '';
    const notes = state.notes || '';
    const stale = Svc.staleLevel(item, state);
    const fullState = Repo.readAll();
    const depsMet = Svc.dependenciesMet(item, fullState);

    const staleBadge = stale
      ? `<span class="tracker-stale tracker-stale--${stale}" title="Sem atualização há ${Svc.daysSince(state.updatedAt)} dias">${ICON_WARN}</span>`
      : '';

    const depsBadge = (!depsMet && !checked)
      ? `<span class="tracker-deps" title="Depende de: ${item.dependencies.join(', ')}">${ICON_LOCK}</span>`
      : '';

    const qwBadge = item.quickWin
      ? '<span class="tracker-tag tracker-tag--qw">QW</span>'
      : '';

    const monitorBadge = item.monitor
      ? '<span class="tracker-tag tracker-tag--monitor">Monitor</span>'
      : '';

    const compact = options.compact ? ' tracker-row--compact' : '';

    return `
      <div class="tracker-row${compact}${checked ? ' tracker-row--done' : ''}" data-item-id="${item.id}">
        <label class="tracker-check">
          <input type="checkbox" class="tracker-checkbox" data-field="checked"${checked ? ' checked' : ''}>
          <span class="tracker-checkmark" aria-hidden="true"></span>
        </label>
        <div class="tracker-main">
          <div class="tracker-title">
            ${escapeHtml(item.title)}
            ${qwBadge}${monitorBadge}${staleBadge}${depsBadge}
          </div>
          <div class="tracker-meta">
            <span class="tracker-where">${escapeHtml(item.where)}</span>
            <span class="tracker-effort">${escapeHtml(item.effort)}</span>
          </div>
        </div>
        <div class="tracker-controls">
          <select class="tracker-owner" data-field="owner" aria-label="Dono">
            ${renderOwnerOptions(owner)}
          </select>
          <input type="date" class="tracker-date" data-field="dueDate" value="${escapeHtml(dueDate)}" aria-label="Data alvo">
          <button type="button" class="tracker-notes-toggle" aria-label="Abrir notas" aria-expanded="false">
            ${ICON_CHEVRON}
          </button>
        </div>
        <div class="tracker-notes-wrap" hidden>
          <textarea class="tracker-notes" data-field="notes" rows="2" placeholder="Travou? Próximo passo? Decisão pendente?">${escapeHtml(notes)}</textarea>
        </div>
      </div>
    `;
  }

  // ── Events (delegation) ──────────────────────────────────────
  function wireEvents(container) {
    container.addEventListener('change', (e) => {
      const row = e.target.closest('.tracker-row');
      if (!row) return;
      const id = row.dataset.itemId;
      const field = e.target.dataset.field;
      if (!field) return;

      let value;
      if (field === 'checked') {
        value = e.target.checked;
        row.classList.toggle('tracker-row--done', value);
      } else {
        value = e.target.value;
      }
      Repo.setItemField(id, field, value);
      emitChange(id, field, value);
    });

    container.addEventListener('input', (e) => {
      if (!e.target.matches('.tracker-notes')) return;
      const row = e.target.closest('.tracker-row');
      if (!row) return;
      clearTimeout(row._notesTimer);
      row._notesTimer = setTimeout(() => {
        Repo.setItemField(row.dataset.itemId, 'notes', e.target.value);
        emitChange(row.dataset.itemId, 'notes', e.target.value);
      }, 400);
    });

    container.addEventListener('click', (e) => {
      const btn = e.target.closest('.tracker-notes-toggle');
      if (!btn) return;
      const row = btn.closest('.tracker-row');
      const wrap = row.querySelector('.tracker-notes-wrap');
      const expanded = btn.getAttribute('aria-expanded') === 'true';
      btn.setAttribute('aria-expanded', String(!expanded));
      wrap.hidden = expanded;
      btn.classList.toggle('is-open', !expanded);
    });
  }

  function emitChange(itemId, field, value) {
    window.dispatchEvent(new CustomEvent('growth-tracker:change', {
      detail: { itemId, field, value }
    }));
  }

  // ── Progress bar ─────────────────────────────────────────────
  function renderProgressBar(pct, label) {
    return `
      <div class="tracker-progress">
        <div class="tracker-progress-track">
          <div class="tracker-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="tracker-progress-label">${label}</div>
      </div>
    `;
  }

  function updateSprintProgress(sprintId) {
    const p = Svc.sprintProgress(sprintId);
    const el = document.querySelector(`[data-sprint-progress="${sprintId}"]`);
    if (!el) return;
    el.innerHTML = renderProgressBar(
      p.pct,
      `${p.done} de ${p.total} · ${p.pct}%`
    );
  }

  function updateOverallProgress() {
    const p = Svc.overallProgress();
    const el = document.querySelector('[data-overall-progress]');
    if (!el) return;
    el.innerHTML = renderProgressBar(
      p.pct,
      `${p.done} de ${p.total} · ${p.pct}% do plano total`
    );
  }

  // ── "Esta semana" ────────────────────────────────────────────
  function renderThisWeek() {
    const container = document.querySelector('[data-this-week]');
    if (!container) return;
    const items = Svc.thisWeek();
    if (items.length === 0) {
      container.innerHTML = `
        <div class="tracker-empty">
          <strong>Tudo fechado.</strong> Sem pendências abertas. Hora de abrir o próximo sprint ou ajustar o plano.
        </div>
      `;
      return;
    }
    container.innerHTML = items.map(it => renderRow(it, { compact: true })).join('');
  }

  // ── Stall warnings ───────────────────────────────────────────
  function renderStallWarnings() {
    const container = document.querySelector('[data-stalled]');
    if (!container) return;
    const stalled = Svc.stalledItems();
    if (stalled.length === 0) {
      container.innerHTML = '';
      container.hidden = true;
      return;
    }
    container.hidden = false;
    container.innerHTML = `
      <div class="tracker-stall-warning">
        <div class="tracker-stall-title">${stalled.length} item(s) parados há mais de ${Svc.STALE_WARN_DAYS} dias</div>
        <ul class="tracker-stall-list">
          ${stalled.map(it => {
            const st = Repo.getItem(it.id) || {};
            const days = Svc.daysSince(st.updatedAt);
            return `<li><a href="#${it.sprint}" data-jump-to="${it.id}">${escapeHtml(it.title)}</a> <span class="tracker-stall-days">${days}d</span></li>`;
          }).join('')}
        </ul>
      </div>
    `;
  }

  // ── Rerender tudo que reage a state ──────────────────────────
  function rerenderDerived() {
    Data.SPRINTS.forEach(s => updateSprintProgress(s.id));
    updateOverallProgress();
    renderThisWeek();
    renderStallWarnings();
  }

  global.GrowthTrackerUI = Object.freeze({
    renderRow,
    renderProgressBar,
    updateSprintProgress,
    updateOverallProgress,
    renderThisWeek,
    renderStallWarnings,
    rerenderDerived,
    wireEvents,
  });
})(window);
