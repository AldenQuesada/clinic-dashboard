/**
 * Growth Tracker — Repository
 * Persistência localStorage. Schema versionado pra futuras migrações.
 * Shape por item: { checked, owner, dueDate, notes, updatedAt }
 */
(function (global) {
  'use strict';

  const KEY = 'growth-tracker-v1';

  function readAll() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { items: {}, version: 1 };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { items: {}, version: 1 };
      parsed.items = parsed.items || {};
      return parsed;
    } catch (err) {
      console.error('[growth-tracker] readAll failed:', err);
      return { items: {}, version: 1 };
    }
  }

  function writeAll(state) {
    try {
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (err) {
      console.error('[growth-tracker] writeAll failed:', err);
    }
  }

  function getItem(id) {
    const state = readAll();
    return state.items[id] || null;
  }

  function setItemField(id, field, value) {
    const state = readAll();
    const current = state.items[id] || {};
    current[field] = value;
    current.updatedAt = new Date().toISOString();
    state.items[id] = current;
    writeAll(state);
    return current;
  }

  function resetAll() {
    localStorage.removeItem(KEY);
  }

  function exportJSON() {
    return JSON.stringify(readAll(), null, 2);
  }

  function importJSON(json) {
    try {
      const parsed = JSON.parse(json);
      if (!parsed || typeof parsed !== 'object' || !parsed.items) {
        throw new Error('JSON inválido: estrutura esperada { items: {...} }');
      }
      writeAll(parsed);
      return true;
    } catch (err) {
      console.error('[growth-tracker] importJSON failed:', err);
      return false;
    }
  }

  global.GrowthTrackerRepository = Object.freeze({
    readAll,
    writeAll,
    getItem,
    setItemField,
    resetAll,
    exportJSON,
    importJSON,
    STORAGE_KEY: KEY,
  });
})(window);
