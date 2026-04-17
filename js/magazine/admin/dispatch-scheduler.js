/* ============================================================================
 * Beauty & Health Magazine — Dispatch Scheduler (A2)
 *
 * Modal/drawer para criar e gerenciar campanhas de dispatch agendadas.
 * Lista dispatches existentes da edicao + formulario de agendamento
 * com segmento RFM, data/hora, tipo, template (com preview WA), contagem
 * estimada de leads elegiveis, botao cancelar.
 *
 * Expoe: window.MagazineAdmin.DispatchScheduler
 *   - mount(host, sb) -> controller { open(edition) }
 * ============================================================================ */
;(function () {
  'use strict'

  var DEFAULT_TEMPLATES = {
    initial:
      'Oi {{nome}}! Saiu a edicao *{{titulo}}* da Beauty & Health.\n\n' +
      'Leitura em ~3min: {{link_revista}}\n\nEspero que goste.',
    reminder_d1:
      'Oi {{nome}}! Passei so pra lembrar da edicao de ontem — {{titulo}}.\n\n' +
      '{{link_revista}}\n\nVale 3 minutinhos.',
    reminder_d7:
      'Oi {{nome}}! Ultima chance de ler a edicao *{{titulo}}* — fecha amanha.\n\n' +
      '{{link_revista}}',
  }

  var SEGMENTS = [
    { key: 'all', label: 'Todos os leads' },
    { key: 'vip', label: 'VIP (alta recencia)' },
    { key: 'active', label: 'Ativos (< 60d)' },
    { key: 'at_risk', label: 'Em risco (60-180d)' },
    { key: 'dormant', label: 'Dormentes (> 180d)' },
  ]

  var TIPOS = [
    { key: 'initial', label: 'Inicial' },
    { key: 'reminder_d1', label: 'Lembrete D+1' },
    { key: 'reminder_d7', label: 'Lembrete D+7' },
    { key: 'manual', label: 'Manual' },
  ]

  function mount(host, sb) {
    if (!host) return null
    host.innerHTML = [
      '<div class="ds-overlay" data-open="0" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;z-index:9999;align-items:center;justify-content:center">',
      '  <div class="ds-modal" style="background:#fff;max-width:1100px;width:95vw;max-height:90vh;overflow:auto;border-radius:10px;box-shadow:0 20px 60px rgba(0,0,0,.3);padding:0">',
      '    <div class="ds-head" style="display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid #e5ddd2">',
      '      <div style="font-family:Playfair Display,serif;font-weight:700;font-size:18px">Distribuicao</div>',
      '      <div data-role="edition-label" style="color:#8a8178;font-size:13px;flex:1"></div>',
      '      <button data-act="close" style="border:none;background:none;font-size:28px;line-height:1;cursor:pointer;color:#555">&times;</button>',
      '    </div>',
      '    <div class="ds-body" style="padding:16px 20px;display:grid;grid-template-columns:1fr 1fr;gap:24px">',
      '      <div class="ds-col-left">',
      '        <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;letter-spacing:.02em">Nova campanha</h3>',
      '        <form data-role="form" style="display:flex;flex-direction:column;gap:10px">',
      '          <label style="display:block">',
      '            <span style="font-size:11px;color:#555;display:block;margin-bottom:4px">Segmento</span>',
      '            <select data-name="segment" style="width:100%;padding:8px 10px;border:1px solid #e5ddd2;border-radius:6px;font-size:13px">',
      SEGMENTS.map(function (s) { return '<option value="' + s.key + '">' + s.label + '</option>' }).join(''),
      '            </select>',
      '          </label>',
      '          <label style="display:block">',
      '            <span style="font-size:11px;color:#555;display:block;margin-bottom:4px">Data e hora (envio)</span>',
      '            <input type="datetime-local" data-name="when" style="width:100%;padding:8px 10px;border:1px solid #e5ddd2;border-radius:6px;font-size:13px" />',
      '          </label>',
      '          <label style="display:block">',
      '            <span style="font-size:11px;color:#555;display:block;margin-bottom:4px">Tipo</span>',
      '            <select data-name="tipo" style="width:100%;padding:8px 10px;border:1px solid #e5ddd2;border-radius:6px;font-size:13px">',
      TIPOS.map(function (t) { return '<option value="' + t.key + '">' + t.label + '</option>' }).join(''),
      '            </select>',
      '          </label>',
      '          <label style="display:block">',
      '            <span style="font-size:11px;color:#555;display:block;margin-bottom:4px">Template da mensagem</span>',
      '            <textarea data-name="template" rows="7" style="width:100%;padding:10px;border:1px solid #e5ddd2;border-radius:6px;font-size:13px;font-family:ui-monospace,monospace" placeholder="Use {{nome}} {{titulo}} {{subtitulo}} {{link_revista}}"></textarea>',
      '          </label>',
      '          <label style="display:flex;align-items:center;gap:8px;cursor:pointer">',
      '            <input type="checkbox" data-name="auto-reminders" checked />',
      '            <span style="font-size:12px;color:#555">Agendar reminders automaticos (D+1 e D+7) pra quem nao abrir</span>',
      '          </label>',
      '          <div style="display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px;background:#f7f3ec;border-radius:6px">',
      '            <div style="font-size:12px">',
      '              <div>Elegiveis: <strong data-role="est-eligible">—</strong></div>',
      '              <div style="color:#8a8178;font-size:11px;margin-top:2px">Sem phone: <span data-role="est-no-phone">—</span> · Blacklist: <span data-role="est-blacklist">—</span></div>',
      '            </div>',
      '            <button type="button" data-act="refresh-est" style="padding:6px 10px;border:1px solid #e5ddd2;border-radius:6px;background:#fff;font-size:12px;cursor:pointer">Recalcular</button>',
      '          </div>',
      '          <div style="display:flex;gap:8px;margin-top:4px">',
      '            <button type="submit" style="flex:1;padding:10px;background:#1a1a1a;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer">Agendar</button>',
      '          </div>',
      '          <div data-role="form-err" style="color:#b91c1c;font-size:12px;display:none"></div>',
      '        </form>',
      '        <div style="margin-top:16px">',
      '          <h4 style="margin:0 0 6px;font-size:12px;font-weight:700;color:#555">Preview WhatsApp</h4>',
      '          <div data-role="wa-preview" style="background:#d9fdd3;padding:12px;border-radius:10px;font-family:ui-sans-serif,system-ui,sans-serif;font-size:13px;line-height:1.45;white-space:pre-wrap;min-height:80px"></div>',
      '        </div>',
      '      </div>',
      '      <div class="ds-col-right">',
      '        <h3 style="margin:0 0 10px;font-size:14px;font-weight:700;letter-spacing:.02em">Campanhas agendadas</h3>',
      '        <div data-role="list" style="display:flex;flex-direction:column;gap:8px"><div style="color:#8a8178;font-size:13px">Selecione uma edicao publicada.</div></div>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>',
    ].join('\n')

    var overlay = host.querySelector('.ds-overlay')
    var edLabel = host.querySelector('[data-role="edition-label"]')
    var form = host.querySelector('[data-role="form"]')
    var segEl = form.querySelector('[data-name="segment"]')
    var whenEl = form.querySelector('[data-name="when"]')
    var tipoEl = form.querySelector('[data-name="tipo"]')
    var tplEl = form.querySelector('[data-name="template"]')
    var autoRemEl = form.querySelector('[data-name="auto-reminders"]')
    var preview = host.querySelector('[data-role="wa-preview"]')
    var listEl = host.querySelector('[data-role="list"]')
    var estEligible = host.querySelector('[data-role="est-eligible"]')
    var estNoPhone = host.querySelector('[data-role="est-no-phone"]')
    var estBlacklist = host.querySelector('[data-role="est-blacklist"]')
    var errEl = host.querySelector('[data-role="form-err"]')

    var currentEdition = null

    host.querySelector('[data-act="close"]').addEventListener('click', close)
    overlay.addEventListener('click', function (e) { if (e.target === overlay) close() })
    document.addEventListener('keydown', function (e) {
      if (overlay.dataset.open === '1' && e.key === 'Escape') close()
    })
    host.querySelector('[data-act="refresh-est"]').addEventListener('click', refreshEstimate)
    tipoEl.addEventListener('change', function () {
      var key = tipoEl.value
      if (DEFAULT_TEMPLATES[key]) tplEl.value = DEFAULT_TEMPLATES[key]
      renderPreview()
    })
    tplEl.addEventListener('input', renderPreview)
    segEl.addEventListener('change', refreshEstimate)
    form.addEventListener('submit', onSubmit)

    function open(edition) {
      currentEdition = edition
      edLabel.textContent = edition ? (edition.title || edition.slug) : ''
      overlay.dataset.open = '1'
      overlay.style.display = 'flex'
      errEl.style.display = 'none'
      // Default: agendar pra daqui 30 min
      var now = new Date(Date.now() + 30 * 60 * 1000)
      whenEl.value = toLocalInput(now)
      segEl.value = 'all'
      tipoEl.value = 'initial'
      tplEl.value = DEFAULT_TEMPLATES.initial
      autoRemEl.checked = true
      renderPreview()
      refreshEstimate()
      loadList()
    }

    function close() {
      overlay.dataset.open = '0'
      overlay.style.display = 'none'
      currentEdition = null
    }

    function toLocalInput(d) {
      var p = function (n) { return String(n).padStart(2, '0') }
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) +
             'T' + p(d.getHours()) + ':' + p(d.getMinutes())
    }

    function renderPreview() {
      var tpl = tplEl.value || ''
      var ed = currentEdition || {}
      var link = (location.origin || '') + '/revista-live.html?e=' + (ed.slug || '') + '&lead=<LEAD>'
      var rendered = tpl
        .replace(/\{\{nome\}\}/g, '[primeiro nome]')
        .replace(/\{\{titulo\}\}/g, ed.title || '[titulo]')
        .replace(/\{\{subtitulo\}\}/g, ed.subtitle || '')
        .replace(/\{\{link_revista\}\}/g, link)
      preview.textContent = rendered
    }

    async function refreshEstimate() {
      estEligible.textContent = '…'
      estNoPhone.textContent = '…'
      estBlacklist.textContent = '…'
      if (!sb) { estEligible.textContent = '—'; return }
      try {
        var segment = { rfm: segEl.value }
        var res = await sb.rpc('magazine_dispatch_estimate', {
          p_segment: segment,
          p_edition_id: currentEdition ? currentEdition.id : null,
        })
        if (res.error) throw res.error
        var r = res.data || {}
        estEligible.textContent = (r.eligible != null ? r.eligible : '—')
        estNoPhone.textContent = (r.skip_no_phone != null ? r.skip_no_phone : '—')
        estBlacklist.textContent = (r.skip_blacklist != null ? r.skip_blacklist : '—')
      } catch (err) {
        estEligible.textContent = '?'
        estNoPhone.textContent = '?'
        estBlacklist.textContent = '?'
      }
    }

    async function loadList() {
      listEl.innerHTML = '<div style="color:#8a8178;font-size:13px">Carregando…</div>'
      if (!currentEdition) { listEl.innerHTML = ''; return }
      try {
        var res = await sb.rpc('magazine_dispatch_list', { p_edition_id: currentEdition.id, p_limit: 50 })
        if (res.error) throw res.error
        var rows = res.data || []
        if (!rows.length) {
          listEl.innerHTML = '<div style="color:#8a8178;font-size:13px;padding:12px;background:#f7f3ec;border-radius:6px">Nenhuma campanha agendada ainda.</div>'
          return
        }
        listEl.innerHTML = rows.map(renderRow).join('')
        Array.prototype.forEach.call(listEl.querySelectorAll('[data-act="cancel"]'), function (btn) {
          btn.addEventListener('click', async function () {
            if (!confirm('Cancelar esta campanha?')) return
            try {
              var r = await sb.rpc('magazine_dispatch_cancel', { p_dispatch_id: btn.dataset.id })
              if (r.error) throw r.error
              loadList()
            } catch (e) { alert('Erro: ' + e.message) }
          })
        })
      } catch (err) {
        listEl.innerHTML = '<div style="color:#b91c1c;font-size:13px">Erro: ' + escapeHtml(err.message) + '</div>'
      }
    }

    function renderRow(d) {
      var stats = d.stats || {}
      var statusClass = d.status === 'completed' ? 'ok' : d.status === 'failed' ? 'err' : 'pending'
      var statusColor = {
        scheduled: '#b45309', running: '#2563eb', completed: '#2d7a43',
        failed: '#b91c1c', canceled: '#8a8178', paused: '#8a8178'
      }[d.status] || '#555'
      var tipoLabel = (TIPOS.find(function (t) { return t.key === d.tipo }) || {}).label || d.tipo
      var segLabel = (SEGMENTS.find(function (s) { return s.key === (d.segment && d.segment.rfm) }) || {}).label || 'Todos'
      var when = new Date(d.scheduled_at).toLocaleString('pt-BR')
      var progress = ''
      if (d.status === 'completed' && stats.total_leads != null) {
        progress = '<div style="margin-top:6px;font-size:11px;color:#555">Enviados: <strong>' + (stats.sent || 0) +
                   '</strong> / ' + (stats.total_leads || 0) +
                   ' · Blacklist: ' + (stats.skipped_blacklist || 0) +
                   ' · Sem phone: ' + (stats.skipped_no_phone || 0) +
                   (stats.skipped_already_opened ? ' · Ja abriu: ' + stats.skipped_already_opened : '') +
                   '</div>'
      }
      var cancelBtn = (d.status === 'scheduled' || d.status === 'paused')
        ? '<button data-act="cancel" data-id="' + d.id + '" style="padding:4px 10px;border:1px solid #e5ddd2;border-radius:6px;background:#fff;font-size:11px;cursor:pointer">Cancelar</button>'
        : ''
      return [
        '<div style="background:#fff;border:1px solid #e5ddd2;border-radius:8px;padding:10px">',
        '  <div style="display:flex;align-items:center;gap:8px">',
        '    <span style="font-size:11px;font-weight:600;padding:3px 8px;border-radius:10px;background:' + statusColor + '22;color:' + statusColor + ';text-transform:uppercase">' + d.status + '</span>',
        '    <strong style="font-size:13px">' + escapeHtml(tipoLabel) + '</strong>',
        '    <span style="color:#8a8178;font-size:11px">' + escapeHtml(segLabel) + '</span>',
        '    <span style="flex:1"></span>',
        '    ' + cancelBtn,
        '  </div>',
        '  <div style="font-size:11px;color:#555;margin-top:4px">Envio: ' + when + '</div>',
        progress,
        '</div>',
      ].join('')
    }

    async function onSubmit(e) {
      e.preventDefault()
      errEl.style.display = 'none'
      if (!currentEdition) { errEl.textContent = 'Selecione uma edicao.'; errEl.style.display = 'block'; return }
      if (!whenEl.value) { errEl.textContent = 'Selecione data/hora.'; errEl.style.display = 'block'; return }
      if (!tplEl.value.trim()) { errEl.textContent = 'Preencha o template.'; errEl.style.display = 'block'; return }

      try {
        var segment = { rfm: segEl.value }
        var scheduledAt = new Date(whenEl.value).toISOString()
        var tipo = tipoEl.value
        var res = await sb.rpc('magazine_dispatch_schedule', {
          p_edition_id: currentEdition.id,
          p_segment: segment,
          p_scheduled_at: scheduledAt,
          p_template: tplEl.value,
          p_tipo: tipo,
          p_parent_id: null,
        })
        if (res.error) throw res.error

        var parentId = res.data
        // A3: se autoRemEl marcado e tipo === 'initial', criar reminders D+1 e D+7
        if (autoRemEl.checked && tipo === 'initial') {
          var d0 = new Date(whenEl.value)
          var d1 = new Date(d0.getTime() + 24 * 60 * 60 * 1000).toISOString()
          var d7 = new Date(d0.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString()
          await sb.rpc('magazine_dispatch_schedule', {
            p_edition_id: currentEdition.id,
            p_segment: segment,
            p_scheduled_at: d1,
            p_template: DEFAULT_TEMPLATES.reminder_d1,
            p_tipo: 'reminder_d1',
            p_parent_id: parentId,
          })
          await sb.rpc('magazine_dispatch_schedule', {
            p_edition_id: currentEdition.id,
            p_segment: segment,
            p_scheduled_at: d7,
            p_template: DEFAULT_TEMPLATES.reminder_d7,
            p_tipo: 'reminder_d7',
            p_parent_id: parentId,
          })
        }
        loadList()
        errEl.style.color = '#2d7a43'
        errEl.textContent = 'Agendado com sucesso.'
        errEl.style.display = 'block'
        setTimeout(function () { errEl.style.display = 'none'; errEl.style.color = '#b91c1c' }, 2500)
      } catch (err) {
        errEl.textContent = 'Erro: ' + err.message
        errEl.style.display = 'block'
      }
    }

    function escapeHtml(s) {
      if (s == null) return ''
      return String(s).replace(/[&<>"']/g, function (c) {
        return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
      })
    }

    return { open: open, close: close }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.DispatchScheduler = { mount: mount }
})()
