/**
 * ClinicAI — B2B Timeline UI
 *
 * Renderiza timeline de eventos dentro do detail da parceria.
 * Mount inline (não overlay). Consome B2BAuditRepository.
 *
 * API: B2BTimeline.mount(containerId, partnershipId)
 */
;(function () {
  'use strict'
  if (window.B2BTimeline) return

  var ACTION_META = {
    created:            { icon: '●', color: '#C9A96E', label: 'Criada' },
    status_change:      { icon: '→', color: '#C9A96E', label: 'Status' },
    health_change:      { icon: '○', color: '#8A9E88', label: 'Saúde' },
    playbook_applied:   { icon: '✓', color: '#8A9E88', label: 'Playbook aplicado' },
    voucher_issued:     { icon: '+', color: '#C4937A', label: 'Voucher emitido' },
    voucher_redeemed:   { icon: '✓', color: '#10B981', label: 'Voucher resgatado' },
    voucher_cancelled:  { icon: '✕', color: '#EF4444', label: 'Voucher cancelado' },
    exposure_logged:    { icon: '◆', color: '#C9A96E', label: 'Exposição' },
    closure_suggested:  { icon: '⚠', color: '#F59E0B', label: 'Sugerido encerramento' },
    closure_approved:   { icon: '✕', color: '#EF4444', label: 'Encerrada' },
    closure_dismissed:  { icon: '↩', color: '#8A9E88', label: 'Mantida ativa' },
    edited:             { icon: '✎', color: '#B5A894', label: 'Editada' },
    comment:            { icon: '✉', color: '#C9A96E', label: 'Comentário' },
  }

  var HEALTH_LABELS = { green:'Verde', yellow:'Amarelo', red:'Vermelho', unknown:'Sem dado' }
  var STATUS_LABELS = {
    prospect:'Prospect', dna_check:'DNA check', contract:'Contrato',
    active:'Ativa', review:'Em revisão', paused:'Pausada', closed:'Encerrada',
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }
  function _repo() { return window.B2BAuditRepository }

  function _fmtDate(iso) {
    if (!iso) return '—'
    try {
      var d = new Date(iso)
      return d.toLocaleDateString('pt-BR') + ' · ' + d.toLocaleTimeString('pt-BR', { hour:'2-digit', minute:'2-digit' })
    } catch (_) { return iso }
  }

  function _fmtRelative(iso) {
    if (!iso) return ''
    try {
      var diff = Date.now() - new Date(iso).getTime()
      var min = Math.floor(diff / 60000)
      if (min < 1)  return 'agora'
      if (min < 60) return min + 'min atrás'
      var h = Math.floor(min / 60)
      if (h < 24)   return h + 'h atrás'
      var d = Math.floor(h / 24)
      if (d < 7)    return d + 'd atrás'
      return _fmtDate(iso)
    } catch (_) { return '' }
  }

  function _describe(item) {
    var a = item.action
    var from = item.from_value, to = item.to_value

    if (a === 'status_change') {
      var fromL = STATUS_LABELS[from] || from || '—'
      var toL   = STATUS_LABELS[to]   || to   || '—'
      return fromL + ' → <strong>' + toL + '</strong>'
    }
    if (a === 'health_change') {
      var fromH = HEALTH_LABELS[from] || from || '—'
      var toH   = HEALTH_LABELS[to]   || to   || '—'
      return fromH + ' → <strong>' + toH + '</strong>'
    }
    if (a === 'voucher_issued')    return 'token <code>#' + _esc(to) + '</code>'
    if (a === 'voucher_redeemed')  return 'token <code>#' + _esc(to) + '</code>'
    if (a === 'voucher_cancelled') return 'token <code>#' + _esc(to) + '</code>'
    if (a === 'exposure_logged')   return _esc(to || '')
    if (a === 'created')           return 'em <strong>' + _esc(to || '—') + '</strong>'
    if (a === 'closure_suggested') return 'motivo: <strong>' + _esc(to || '—') + '</strong>'
    return ''
  }

  function _renderRow(item) {
    var meta = ACTION_META[item.action] || { icon: '•', color: '#9CA3AF', label: item.action }
    return '<div class="b2b-tl-row">' +
      '<div class="b2b-tl-dot" style="color:' + meta.color + '">' + meta.icon + '</div>' +
      '<div class="b2b-tl-body">' +
        '<div class="b2b-tl-top">' +
          '<span class="b2b-tl-label" style="color:' + meta.color + '">' + _esc(meta.label) + '</span> ' +
          '<span class="b2b-tl-desc">' + _describe(item) + '</span>' +
          (item.author ? '<span class="b2b-tl-author">· ' + _esc(item.author) + '</span>' : '') +
        '</div>' +
        (item.notes ? '<div class="b2b-tl-notes">' + _esc(item.notes) + '</div>' : '') +
        '<div class="b2b-tl-when" title="' + _esc(_fmtDate(item.created_at)) + '">' +
          _esc(_fmtRelative(item.created_at)) +
        '</div>' +
      '</div>' +
    '</div>'
  }

  async function mount(containerId, partnershipId) {
    var el = document.getElementById(containerId)
    if (!el) return
    el.innerHTML = '<div class="b2b-sec-title">Histórico</div><div class="b2b-empty" style="padding:16px">Carregando…</div>'

    try {
      var items = await _repo().timeline(partnershipId, 50)
      if (!items || !items.length) {
        el.innerHTML = '<div class="b2b-sec-title">Histórico</div><div class="b2b-empty">Nenhuma ação registrada ainda.</div>'
        return
      }
      el.innerHTML =
        '<div class="b2b-sec-title">Histórico (' + items.length + ')</div>' +
        '<div class="b2b-tl">' +
          items.map(_renderRow).join('') +
        '</div>'
    } catch (e) {
      el.innerHTML = '<div class="b2b-sec-title">Histórico</div><div class="b2b-empty b2b-empty-err">Erro: ' + _esc(e.message || e) + '</div>'
    }
  }

  window.B2BTimeline = Object.freeze({ mount: mount })
})()
