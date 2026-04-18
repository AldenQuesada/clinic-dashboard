/**
 * VPI Attribution — Hook de vinculação lead → session_id
 *
 * Fluxo:
 * 1. Visitante chega via short-link com ?sid=xxx&utm_source=yyy
 *    (r.html já propaga esses params)
 * 2. captureFromURL() grava em sessionStorage (TTL 30d, espelha RPC)
 * 3. Quando lead é criado (js/patients.js), chama linkToLead(leadId)
 * 4. RPC vpi_link_attribution_to_lead vincula partner → lead na tabela
 *
 * Idempotente. Fire-and-forget. Silencioso em caso de erro.
 */
(function (global) {
  'use strict';

  const STORAGE_KEY = 'vpi_attribution';
  const TTL_MS      = 30 * 24 * 60 * 60 * 1000; // 30 dias

  // ── Storage helpers ──────────────────────────────────────────
  function _read() {
    try {
      var raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      if (!parsed || !parsed.sid || !parsed.capturedAt) return null;
      if ((Date.now() - parsed.capturedAt) > TTL_MS) {
        sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return parsed;
    } catch (_) { return null; }
  }

  function _write(data) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch (_) { /* quota exceeded / privacy mode — fail silent */ }
  }

  // ── API pública ──────────────────────────────────────────────
  function captureFromURL() {
    try {
      var qp  = new URLSearchParams(window.location.search);
      var sid = qp.get('sid');
      if (!sid || sid.length < 4) return null;

      // Se já capturamos esse sid na sessão, não sobrescreve UTMs
      var existing = _read();
      if (existing && existing.sid === sid) return existing;

      var data = {
        sid: sid,
        utm: {
          source:   qp.get('utm_source')   || null,
          medium:   qp.get('utm_medium')   || null,
          campaign: qp.get('utm_campaign') || null,
          content:  qp.get('utm_content')  || null,
          term:     qp.get('utm_term')     || null,
        },
        capturedAt:  Date.now(),
        linkedLeads: [], // anti-double-call
      };
      _write(data);
      if (typeof console !== 'undefined' && console.debug) {
        console.debug('[VPIAttribution] sid capturado:', sid);
      }
      return data;
    } catch (err) {
      console.warn('[VPIAttribution] captureFromURL falhou:', err);
      return null;
    }
  }

  function getSessionId() {
    var d = _read();
    return d ? d.sid : null;
  }

  function getUTMs() {
    var d = _read();
    return d ? d.utm : null;
  }

  function hasSession() {
    return !!getSessionId();
  }

  async function linkToLead(leadId) {
    if (!leadId) return { ok: false, reason: 'missing_lead_id' };

    var data = _read();
    if (!data || !data.sid) return { ok: false, reason: 'no_session' };

    // Anti double-call: mesmo sid não vincula duas vezes o mesmo lead
    if (Array.isArray(data.linkedLeads) && data.linkedLeads.indexOf(String(leadId)) !== -1) {
      return { ok: true, deduped: true };
    }

    var sb = global._sbShared;
    if (!sb || typeof sb.rpc !== 'function') {
      console.warn('[VPIAttribution] supabase client (window._sbShared) indisponível');
      return { ok: false, reason: 'no_supabase' };
    }

    try {
      var res = await sb.rpc('vpi_link_attribution_to_lead', {
        p_session_id: data.sid,
        p_lead_id:    String(leadId),
      });
      if (res && res.error) {
        console.warn('[VPIAttribution] RPC error:', res.error.message || res.error);
        return { ok: false, reason: 'rpc_error', error: res.error };
      }

      // Marca lead como linkado pra não re-chamar
      data.linkedLeads = (data.linkedLeads || []).concat([String(leadId)]);
      _write(data);

      var payload = (res && res.data) || {};
      if (payload.ok) {
        console.debug('[VPIAttribution] linked lead', leadId, '→ partner', payload.partner_id);
      } else {
        console.debug('[VPIAttribution] link no-op:', payload.reason || 'unknown');
      }
      return payload;
    } catch (err) {
      console.warn('[VPIAttribution] linkToLead falhou:', err && err.message || err);
      return { ok: false, reason: 'exception', error: err };
    }
  }

  function clear() {
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (_) {}
  }

  // ── Auto-capture no carregamento ─────────────────────────────
  // Script é carregado com defer, logo DOM já parseado e URL estável.
  captureFromURL();

  global.VPIAttribution = Object.freeze({
    captureFromURL,
    getSessionId,
    getUTMs,
    hasSession,
    linkToLead,
    clear,
    STORAGE_KEY,
  });
})(window);
