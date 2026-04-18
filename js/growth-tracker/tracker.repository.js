/**
 * Growth Tracker — Repository (Supabase + cache localStorage)
 *
 * Estratégia:
 *   - Cache localStorage ('growth-tracker-v1') mantém readAll() sync
 *     pra não mexer na UI que já funciona.
 *   - Ao boot (hydrate), puxa do Supabase via RPC growth_tracker_read_all,
 *     reescreve o cache e emite 'growth-tracker:hydrated' pra UI re-renderizar.
 *   - Ao gravar (setItemField), atualiza cache imediatamente (UX responsiva)
 *     e dispara RPC growth_tracker_set_field fire-and-forget em paralelo.
 *   - Offline-safe: se Supabase cair, cache continua servindo.
 *   - Schema versionado: cache v1 (localStorage-only legacy) → v2 (sync).
 */
(function (global) {
  'use strict';

  const KEY = 'growth-tracker-v1';
  const EVT_HYDRATED = 'growth-tracker:hydrated';

  function _sb() {
    return global._sbShared || null;
  }

  function _user() {
    try {
      var u = global._sbShared && global._sbShared.auth && global._sbShared.auth.getSession
        ? null : null;
      // best-effort: tenta currentUser do ClinicAuth se disponível
      if (global.ClinicAuth && typeof global.ClinicAuth.currentUser === 'function') {
        var cur = global.ClinicAuth.currentUser();
        if (cur && (cur.email || cur.id)) return cur.email || cur.id;
      }
      return null;
    } catch (_) { return null; }
  }

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
    // 1) escreve cache local imediatamente
    const state = readAll();
    const current = state.items[id] || {};
    current[field] = value;
    current.updatedAt = new Date().toISOString();
    state.items[id] = current;
    writeAll(state);

    // 2) sync Supabase fire-and-forget
    _pushRemote(id, field, value);

    return current;
  }

  function _pushRemote(id, field, value) {
    var sb = _sb();
    if (!sb || !sb.rpc) return;
    try {
      sb.rpc('growth_tracker_set_field', {
        p_item_id: id,
        p_field:   field,
        p_value:   value,
        p_user:    _user(),
      }).then(function (r) {
        if (r && r.error) console.warn('[growth-tracker] push fail:', r.error.message);
      }).catch(function (e) {
        console.warn('[growth-tracker] push exception:', e && e.message);
      });
    } catch (e) {
      console.warn('[growth-tracker] push sync-err:', e && e.message);
    }
  }

  function hydrate() {
    var sb = _sb();
    if (!sb || !sb.rpc) {
      console.info('[growth-tracker] sem sb shared — operando só com cache local');
      document.dispatchEvent(new CustomEvent(EVT_HYDRATED, { detail: { source: 'local' } }));
      return Promise.resolve(readAll());
    }

    return sb.rpc('growth_tracker_read_all').then(function (r) {
      if (r && r.error) {
        console.warn('[growth-tracker] hydrate fail:', r.error.message);
        document.dispatchEvent(new CustomEvent(EVT_HYDRATED, { detail: { source: 'cache-fallback' } }));
        return readAll();
      }
      var remote = (r && r.data) || { items: {}, version: 2 };
      remote.items = remote.items || {};
      writeAll(remote);
      document.dispatchEvent(new CustomEvent(EVT_HYDRATED, {
        detail: { source: 'remote', itemCount: Object.keys(remote.items).length }
      }));
      return remote;
    }).catch(function (e) {
      console.warn('[growth-tracker] hydrate exception:', e && e.message);
      document.dispatchEvent(new CustomEvent(EVT_HYDRATED, { detail: { source: 'cache-fallback' } }));
      return readAll();
    });
  }

  function resetAll() {
    localStorage.removeItem(KEY);
    var sb = _sb();
    if (sb && sb.rpc) {
      sb.rpc('growth_tracker_reset_all').catch(function (e) {
        console.warn('[growth-tracker] reset remote fail:', e && e.message);
      });
    }
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
      // best-effort: sincroniza cada item com Supabase
      var sb = _sb();
      if (sb && sb.rpc) {
        Object.keys(parsed.items).forEach(function (id) {
          var it = parsed.items[id];
          if (!it) return;
          ['checked', 'owner', 'dueDate', 'notes'].forEach(function (f) {
            if (it[f] === undefined || it[f] === null) return;
            _pushRemote(id, f, it[f]);
          });
        });
      }
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
    hydrate,
    STORAGE_KEY: KEY,
    EVT_HYDRATED: EVT_HYDRATED,
  });
})(window);
