/**
 * Growth Tracker — Service
 * Regras de negócio: progress %, stale detection, "Esta semana", CSV export.
 * Lê de GrowthTrackerData + GrowthTrackerRepository, não muta DOM.
 */
(function (global) {
  'use strict';

  const Data = global.GrowthTrackerData;
  const Repo = global.GrowthTrackerRepository;

  const STALE_WARN_DAYS   = 7;
  const STALE_DANGER_DAYS = 14;
  const THIS_WEEK_LIMIT   = 6;

  function daysSince(iso) {
    if (!iso) return null;
    const then = new Date(iso).getTime();
    if (isNaN(then)) return null;
    return Math.floor((Date.now() - then) / (1000 * 60 * 60 * 24));
  }

  function staleLevel(item, state) {
    if (state && state.checked) return null;
    if (item.monitor) return null;
    const days = daysSince(state && state.updatedAt);
    if (days === null) return null;
    if (days >= STALE_DANGER_DAYS) return 'danger';
    if (days >= STALE_WARN_DAYS)   return 'warn';
    return null;
  }

  /**
   * Dependências satisfeitas? (todas marcadas como checked)
   */
  function dependenciesMet(item, allState) {
    if (!item.dependencies || item.dependencies.length === 0) return true;
    return item.dependencies.every(depId => {
      const dep = allState.items[depId];
      return dep && dep.checked;
    });
  }

  function sprintProgress(sprintId) {
    const items = Data.itemsBySprint(sprintId).filter(it => !it.monitor);
    if (items.length === 0) return { done: 0, total: 0, pct: 0 };
    const state = Repo.readAll();
    const done = items.filter(it => (state.items[it.id] || {}).checked).length;
    return { done, total: items.length, pct: Math.round((done / items.length) * 100) };
  }

  function overallProgress() {
    const items = Data.ITEMS.filter(it => !it.monitor);
    const state = Repo.readAll();
    const done = items.filter(it => (state.items[it.id] || {}).checked).length;
    return { done, total: items.length, pct: Math.round((done / items.length) * 100) };
  }

  /**
   * "Esta semana": top N items abertos, ordenados por
   * (1) dependências satisfeitas, (2) RICE desc, (3) effort asc.
   * Monitors não entram.
   */
  function thisWeek(limit) {
    const state = Repo.readAll();
    const openItems = Data.ITEMS.filter(it => {
      if (it.monitor) return false;
      const s = state.items[it.id] || {};
      return !s.checked;
    });

    const scored = openItems.map(it => ({
      item: it,
      depsMet: dependenciesMet(it, state),
      rice: it.rice || 0,
    }));

    scored.sort((a, b) => {
      if (a.depsMet !== b.depsMet) return a.depsMet ? -1 : 1;
      if (a.rice !== b.rice) return b.rice - a.rice;
      return 0;
    });

    return scored.slice(0, limit || THIS_WEEK_LIMIT).map(s => s.item);
  }

  /**
   * Items travados: sem check e sem update recente.
   */
  function stalledItems(minDays) {
    const threshold = minDays || STALE_WARN_DAYS;
    const state = Repo.readAll();
    return Data.ITEMS.filter(it => {
      if (it.monitor) return false;
      const s = state.items[it.id] || {};
      if (s.checked) return false;
      const days = daysSince(s.updatedAt);
      return days !== null && days >= threshold;
    });
  }

  /**
   * Export CSV: id, sprint, title, where, effort, checked, owner, dueDate, notes, updatedAt
   */
  function exportCSV() {
    const state = Repo.readAll();
    const rows = [
      ['id', 'sprint', 'titulo', 'onde', 'esforco', 'feito', 'dono', 'data_alvo', 'notas', 'atualizado_em']
    ];
    Data.ITEMS.forEach(it => {
      const s = state.items[it.id] || {};
      rows.push([
        it.id,
        it.sprint,
        it.title,
        it.where,
        it.effort,
        s.checked ? 'sim' : 'nao',
        s.owner || '',
        s.dueDate || '',
        (s.notes || '').replace(/\r?\n/g, ' ').replace(/"/g, '""'),
        s.updatedAt || '',
      ]);
    });
    return rows.map(cols =>
      cols.map(c => {
        const str = String(c ?? '');
        return /[",\n;]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
      }).join(',')
    ).join('\n');
  }

  function downloadCSV() {
    const csv = exportCSV();
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `plano-growth-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 100);
  }

  global.GrowthTrackerService = Object.freeze({
    daysSince,
    staleLevel,
    dependenciesMet,
    sprintProgress,
    overallProgress,
    thisWeek,
    stalledItems,
    exportCSV,
    downloadCSV,
    STALE_WARN_DAYS,
    STALE_DANGER_DAYS,
  });
})(window);
