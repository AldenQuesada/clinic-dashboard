;(function () {
  'use strict'
  if (window._clinicaiInjetaveisRepoLoaded) return
  window._clinicaiInjetaveisRepoLoaded = true

  function _sb() {
    const sb = window._sbShared
    if (!sb) throw new Error('Supabase client não inicializado')
    return sb
  }
  function _ok(data)  { return { ok: true,  data, error: null  } }
  function _err(error){ return { ok: false, data: null, error  } }

  async function getAll(apenasAtivos = true) {
    try {
      const { data, error } = await _sb().rpc('get_injetaveis', {
        p_apenas_ativos: apenasAtivos,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data ?? [])
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function upsert(inj) {
    try {
      const { data, error } = await _sb().rpc('upsert_injetavel', {
        p_id:          inj.id          ?? null,
        p_nome:        inj.nome        ?? null,
        p_marca:       inj.marca       ?? null,
        p_categoria:   inj.categoria   ?? null,
        p_descricao:   inj.descricao   ?? null,
        p_unidade:     inj.unidade     ?? null,
        p_estoque:     inj.estoque     ?? null,
        p_estoque_min: inj.estoque_min ?? null,
        p_preco_custo: inj.preco_custo ?? null,
        p_ativo:       inj.ativo       ?? null,
        p_observacoes: inj.observacoes ?? null,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function softDelete(id) {
    try {
      const { error } = await _sb().rpc('soft_delete_injetavel', { p_id: id })
      if (error) return _err(error.message || String(error))
      return _ok(null)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  async function updateEstoque(id, delta) {
    try {
      const { data, error } = await _sb().rpc('update_estoque_injetavel', {
        p_id:        id,
        p_qtd_delta: delta,
      })
      if (error) return _err(error.message || String(error))
      return _ok(data)
    } catch (err) {
      return _err(err.message || String(err))
    }
  }

  window.InjetaveisRepository = Object.freeze({ getAll, upsert, softDelete, updateEstoque })
})()
