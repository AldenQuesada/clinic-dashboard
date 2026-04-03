/**
 * ClinicAI — Appointments Repository
 *
 * Acesso puro ao Supabase para agendamentos.
 * Zero lógica de negócio — apenas chamadas RPC com retorno normalizado.
 *
 * RPCs consumidas:
 *   appt_list(date_from, date_to, professional_ids?, limit?, offset?)
 *   appt_upsert(data jsonb)
 *   appt_delete(id text)
 *   appt_sync_batch(appointments jsonb)
 *
 * Depende de:
 *   window._sbShared  — cliente Supabase singleton
 */

;(function () {
  'use strict'

  if (window._clinicaiApptRepoLoaded) return
  window._clinicaiApptRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client (_sbShared) não inicializado')
    return sb
  }

  function _ok(data)   { return { ok: true,  data, error: null  } }
  function _err(error) { return { ok: false, data: null, error  } }

  // ── listForPeriod ─────────────────────────────────────────────
  /**
   * Lista agendamentos de um intervalo de datas.
   * @param {string} dateFrom  YYYY-MM-DD
   * @param {string} dateTo    YYYY-MM-DD
   * @param {object} [opts]
   * @param {string[]|null} [opts.professionalIds]  UUIDs; null = todos visíveis
   * @param {number} [opts.limit]
   * @param {number} [opts.offset]
   * @returns {Promise<{ok, data: object[], error}>}
   */
  async function listForPeriod(dateFrom, dateTo, { professionalIds = null, limit = 500, offset = 0 } = {}) {
    try {
      const { data, error } = await _sb().rpc('appt_list', {
        p_date_from:        dateFrom,
        p_date_to:          dateTo,
        p_professional_ids: professionalIds,
        p_limit:            limit,
        p_offset:           offset,
      })
      if (error) return _err(error.message || String(error))
      return _ok(Array.isArray(data) ? data : [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── upsert ────────────────────────────────────────────────────
  /**
   * Cria ou atualiza um agendamento.
   * @param {object} apptData  — objeto no formato localStorage (pacienteId, data, etc.)
   * @returns {Promise<{ok, data: {id}, error}>}
   */
  async function upsert(apptData) {
    try {
      const { data, error } = await _sb().rpc('appt_upsert', { p_data: apptData })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── remove (soft delete) ──────────────────────────────────────
  /**
   * @param {string} id  — appt_... ID
   * @returns {Promise<{ok, error}>}
   */
  async function remove(id) {
    try {
      const { data, error } = await _sb().rpc('appt_delete', { p_id: id })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── syncBatch ─────────────────────────────────────────────────
  /**
   * Migração em lote: envia todos os agendamentos do localStorage para Supabase.
   * Idempotente — seguro para executar múltiplas vezes.
   * @param {object[]} appointments  — array do localStorage
   * @returns {Promise<{ok, data: {inserted, updated, errors}, error}>}
   */
  async function syncBatch(appointments) {
    try {
      const { data, error } = await _sb().rpc('appt_sync_batch', {
        p_appointments: appointments,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  // ── Exposição global ──────────────────────────────────────────
  window.AppointmentsRepository = Object.freeze({
    listForPeriod,
    upsert,
    remove,
    syncBatch,
  })

})()
