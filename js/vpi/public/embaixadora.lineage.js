/**
 * VPI Embaixadora - Linhagem (Fase 8 - Entrega 6)
 *
 * Mostra arvore de 2 niveis:
 *   - Voce
 *     - Filhas diretas
 *       - Netas (filhas das filhas)
 *
 * Expoe window.VPIEmbLineage.
 */
;(function () {
  'use strict'
  if (window._vpiEmbLineageLoaded) return
  window._vpiEmbLineageLoaded = true

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _sb() { return window._sbShared }
  function _getToken() {
    return window.VPIEmbApp && window.VPIEmbApp.getToken && window.VPIEmbApp.getToken()
  }

  function _initials(nome) {
    if (!nome) return '?'
    var parts = String(nome).trim().split(/\s+/)
    return ((parts[0] || '')[0] + (parts.length > 1 ? (parts[parts.length - 1] || '')[0] : '')).toUpperCase()
  }

  function _tierChip(tier) {
    var map = {
      diamante: { bg: '#0F172A', cl: '#fff',    txt: 'Diamante' },
      ouro:     { bg: '#F59E0B', cl: '#fff',    txt: 'Ouro'     },
      prata:    { bg: '#E5E7EB', cl: '#374151', txt: 'Prata'    },
      bronze:   { bg: '#F3E8D3', cl: '#92400E', txt: 'Bronze'   },
    }
    var t = map[tier] || map.bronze
    return '<span style="display:inline-block;padding:1px 6px;border-radius:8px;background:' + t.bg + ';color:' + t.cl + ';font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.04em">' + t.txt + '</span>'
  }

  function _chipFilha(f) {
    var avatar = f.avatar_url
      ? '<img src="' + _esc(f.avatar_url) + '" alt="" style="width:28px;height:28px;border-radius:50%;object-fit:cover"/>'
      : '<div style="width:28px;height:28px;border-radius:50%;background:#7C3AED;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700">' + _esc(_initials(f.nome)) + '</div>'
    var netaPad = f.netas_count > 0
      ? '<span style="background:#F59E0B;color:#fff;font-size:9px;font-weight:700;padding:1px 5px;border-radius:8px;margin-left:4px">+' + f.netas_count + '</span>'
      : ''
    return '<div style="display:flex;align-items:center;gap:8px;padding:8px 10px;background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.1);border-radius:10px">' +
      avatar +
      '<div style="min-width:0;flex:1">' +
        '<div style="font-size:12px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + _esc(f.nome) + netaPad + '</div>' +
        '<div style="margin-top:2px">' + _tierChip(f.tier_atual) + '</div>' +
      '</div>' +
    '</div>'
  }

  async function render() {
    var mount = document.getElementById('vpi-emb-lineage')
    if (!mount) return

    var token = _getToken()
    if (!token) { mount.innerHTML = ''; return }

    var sb = _sb()
    if (!sb) { mount.innerHTML = ''; return }

    try {
      var res = await sb.rpc('vpi_pub_partner_lineage', { p_token: token })
      if (res.error) throw new Error(res.error.message)
      var d = res.data || {}
      if (!d.ok) { mount.innerHTML = ''; return }

      var filhas = d.filhas_diretas || []
      var total  = d.total_embaixadoras_familia || 0
      var cascata = d.creditos_cascata_ano || 0
      var limite  = d.limite_cascata_ano || 10

      if (filhas.length === 0) {
        // Nao mostrar secao vazia
        mount.innerHTML = ''
        return
      }

      var filhasHtml = filhas.map(_chipFilha).join('')

      mount.innerHTML =
        '<div class="vpi-lineage" style="background:linear-gradient(135deg,#1e1b4b,#312e81);border-radius:14px;padding:18px;margin:14px 0;color:#fff">' +
          '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">' +
            '<svg width="18" height="18" fill="none" stroke="#C4B5FD" stroke-width="2" viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' +
            '<h3 style="margin:0;font-size:14px;font-weight:700;color:#fff">Minha Linhagem</h3>' +
          '</div>' +

          '<div style="text-align:center;padding:16px 0;border-bottom:1px solid rgba(255,255,255,.15);margin-bottom:14px">' +
            '<div style="font-size:36px;font-weight:800;color:#fff;line-height:1">' + total + '</div>' +
            '<div style="font-size:11px;color:#C4B5FD;margin-top:4px">embaixadora' + (total === 1 ? '' : 's') + ' da minha familia</div>' +
          '</div>' +

          '<div style="font-size:11px;color:#C4B5FD;margin-bottom:8px;text-transform:uppercase;letter-spacing:.05em">Filhas diretas (' + filhas.length + ')</div>' +
          '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(140px,1fr));gap:8px">' +
            filhasHtml +
          '</div>' +

          '<div style="margin-top:14px;padding:10px 12px;background:rgba(255,255,255,.06);border-radius:10px;font-size:11px;color:#DDD6FE;line-height:1.5">' +
            'A cada indicacao das suas filhas voce ganha *30% de credito cascata*. ' +
            'Ja usou <strong>' + cascata + '</strong> de <strong>' + limite + '</strong> creditos cascata este ano.' +
          '</div>' +
        '</div>'
    } catch (e) {
      if (window.console && console.warn) console.warn('[VPIEmbLineage]', e && e.message)
      mount.innerHTML = ''
    }
  }

  function init() {
    if (window.VPIEmbApp && window.VPIEmbApp.onStateChange) {
      window.VPIEmbApp.onStateChange(function () { render() })
    }
    render()
  }

  window.VPIEmbLineage = {
    init:   init,
    render: render,
  }
})()
