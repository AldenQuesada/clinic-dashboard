;(function () {
  'use strict'
  if (window._clinicaiProcedimentosRepoLoaded) return
  window._clinicaiProcedimentosRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client não inicializado')
    return sb
  }
  function _ok(data)  { return { ok: true,  data, error: null  } }
  function _err(error){ return { ok: false, data: null, error  } }

  async function getAll(apenasAtivos = true) {
    try {
      const { data, error } = await _sb().rpc('get_procedimentos', {
        p_apenas_ativos: apenasAtivos,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data ?? [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function upsert(proc) {
    try {
      const { data, error } = await _sb().rpc('upsert_procedimento', {
        p_id:           proc.id           ?? null,
        p_nome:         proc.nome         ?? null,
        p_categoria:    proc.categoria    ?? null,
        p_descricao:    proc.descricao    ?? null,
        p_duracao_min:  proc.duracao_min  ?? null,
        p_valor:        proc.valor        ?? null,
        p_sessoes:      proc.sessoes      ?? null,
        p_intervalo:    proc.intervalo    ?? null,
        p_tecnologia_id:proc.tecnologia_id ?? null,
        p_sala_id:      proc.sala_id      ?? null,
        p_ativo:        proc.ativo        ?? null,
        p_observacoes:  proc.observacoes  ?? null,
        p_insumos:      proc.insumos      ?? null,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function softDelete(id) {
    try {
      const { error } = await _sb().rpc('soft_delete_procedimento', { p_id: id })
      if (error) return _err(error.message || String(error))
      return _ok(null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  window.ProcedimentosRepository = Object.freeze({ getAll, upsert, softDelete })
})()
