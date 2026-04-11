/**
 * ClinicAI — Cashflow UI
 * Pagina "Fluxo de Caixa" dentro de Relatorios Financeiros
 *
 * Renderiza em #finCashflowRoot
 */
;(function () {
  'use strict'
  if (window._clinicaiCashflowUiLoaded) return
  window._clinicaiCashflowUiLoaded = true

  var _state = {
    period:    'month',  // month | last30 | custom
    startDate: null,
    endDate:   null,
    direction: '',       // '' | credit | debit
    method:    '',
    onlyUnreconciled: false,
    entries:   [],
    summary:   {},
    loading:   false,
  }

  // ── Init ──────────────────────────────────────────────────

  function init() {
    var root = document.getElementById('finCashflowRoot')
    if (!root) return

    // Periodo default: mes atual
    var range = window.CashflowService.monthRange()
    _state.startDate = range.start
    _state.endDate   = range.end

    _renderShell()
    _loadData()
  }

  // ── Carregamento ──────────────────────────────────────────

  async function _loadData() {
    _state.loading = true
    _renderBody()

    try {
      var [sumRes, listRes] = await Promise.all([
        window.CashflowService.getSummary(_state.startDate, _state.endDate),
        window.CashflowService.listEntries({
          startDate: _state.startDate,
          endDate:   _state.endDate,
          direction: _state.direction || null,
          method:    _state.method    || null,
          onlyUnreconciled: _state.onlyUnreconciled,
        }),
      ])

      _state.summary = (sumRes && sumRes.ok) ? sumRes.data : {}
      _state.entries = (listRes && listRes.ok) ? listRes.data : []
    } catch (e) {
      console.error('[CashflowUI] load error:', e)
      _state.summary = {}
      _state.entries = []
    }

    _state.loading = false
    _renderBody()
  }

  // ── Render shell (cabecalho fixo) ─────────────────────────

  function _renderShell() {
    var root = document.getElementById('finCashflowRoot')
    if (!root) return

    root.innerHTML = ''
      + '<div style="padding:28px 32px;max-width:1200px;margin:0 auto">'

      // Breadcrumb
      + '<div style="display:flex;align-items:center;gap:10px;margin-bottom:20px">'
        + '<button onclick="navigateTo(\'fin-reports\')" style="all:unset;cursor:pointer;display:flex;align-items:center;gap:4px;font-size:13px;color:#6b7280">'
          + _icon('chevron-left', 14) + ' Relatorios'
        + '</button>'
        + '<span style="color:#d1d5db">/</span>'
        + '<span style="color:#10b981">' + _icon('dollar-sign', 14) + '</span>'
        + '<span style="font-size:13px;font-weight:600;color:#111827">Fluxo de Caixa</span>'
      + '</div>'

      // Titulo + acoes
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:20px;gap:12px;flex-wrap:wrap">'
        + '<div>'
          + '<h2 style="margin:0;font-size:22px;font-weight:700;color:#111827">Fluxo de Caixa</h2>'
          + '<p style="margin:4px 0 0;font-size:13px;color:#6b7280">Movimentos financeiros do periodo, vinculados a agendamentos quando possivel</p>'
        + '</div>'
        + '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">'
          + _periodSelect()
          + '<button id="cfBankBtn" title="Gerenciar bancos conectados (Pluggy)" style="display:flex;align-items:center;gap:6px;background:#fff;color:#8b5cf6;border:1.5px solid #ddd6fe;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">'
            + _icon('link', 14) + ' Bancos'
          + '</button>'
          + '<button id="cfReconcileBtn" title="Casar movimentos com agendamentos" style="display:flex;align-items:center;gap:6px;background:#fff;color:#6366f1;border:1.5px solid #c7d2fe;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">'
            + _icon('zap', 14) + ' Reconciliar'
          + '</button>'
          + '<button id="cfNewBtn" style="display:flex;align-items:center;gap:6px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(16,185,129,.3)">'
            + _icon('plus', 14) + ' Novo Lancamento'
          + '</button>'
          + '<button id="cfImportBtn" title="Importar extrato OFX (Sicredi)" style="display:flex;align-items:center;gap:6px;background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:9px 14px;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer">'
            + _icon('upload', 14) + ' Importar OFX'
          + '</button>'
        + '</div>'
      + '</div>'

      // Body container (re-renderizado por _renderBody)
      + '<div id="cfBody"></div>'
    + '</div>'

    document.getElementById('cfNewBtn').addEventListener('click', function() { _openNewModal() })
    document.getElementById('cfImportBtn').addEventListener('click', function() {
      if (window.OfxImportUI && window.OfxImportUI.open) {
        window.OfxImportUI.open()
      } else {
        alert('Modulo de importacao OFX nao carregado. Recarregue a pagina (Ctrl+Shift+R).')
      }
    })
    document.getElementById('cfReconcileBtn').addEventListener('click', _runReconcile)
    document.getElementById('cfBankBtn').addEventListener('click', function() {
      if (window.PluggyConnectUI && window.PluggyConnectUI.open) {
        window.PluggyConnectUI.open()
      } else {
        alert('Modulo de conexao bancaria ainda nao carregado. Recarregue a pagina.')
      }
    })
    var sel = document.getElementById('cfPeriodSelect')
    if (sel) sel.addEventListener('change', function(e) { _onPeriodChange(e.target.value) })
  }

  function _periodSelect() {
    return ''
      + '<select id="cfPeriodSelect" style="background:#fff;color:#374151;border:1.5px solid #e5e7eb;padding:9px 12px;border-radius:10px;font-size:13px;font-weight:500;cursor:pointer">'
        + '<option value="month">Mes Atual</option>'
        + '<option value="last30">Ultimos 30 dias</option>'
        + '<option value="last7">Ultimos 7 dias</option>'
      + '</select>'
  }

  function _onPeriodChange(value) {
    _state.period = value
    var today = new Date()
    if (value === 'month') {
      var r = window.CashflowService.monthRange()
      _state.startDate = r.start
      _state.endDate   = r.end
    } else if (value === 'last30') {
      var d30 = new Date(today.getTime() - 30 * 86400000)
      _state.startDate = _isoDate(d30)
      _state.endDate   = _isoDate(today)
    } else if (value === 'last7') {
      var d7 = new Date(today.getTime() - 7 * 86400000)
      _state.startDate = _isoDate(d7)
      _state.endDate   = _isoDate(today)
    }
    _loadData()
  }

  function _isoDate(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
  }

  // ── Render body (KPIs + tabela) ───────────────────────────

  function _renderBody() {
    var body = document.getElementById('cfBody')
    if (!body) return

    if (_state.loading) {
      body.innerHTML = '<div style="text-align:center;padding:60px;color:#9ca3af;font-size:13px">Carregando...</div>'
      return
    }

    var s   = _state.summary || {}
    var fmt = window.CashflowService.fmtCurrency

    body.innerHTML = ''
      // KPIs
      + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px">'
        + _kpi('Entradas',     fmt(s.credits || 0),   '#10b981', _icon('arrow-down-circle', 16))
        + _kpi('Saidas',       fmt(s.debits  || 0),   '#ef4444', _icon('arrow-up-circle', 16))
        + _kpi('Saldo',        fmt(s.balance || 0),   (s.balance || 0) >= 0 ? '#10b981' : '#ef4444', _icon('dollar-sign', 16))
        + _kpi('Pendentes',    String(s.unreconciled || 0), '#f59e0b', _icon('alert-circle', 16), 'sem vinculo')
      + '</div>'

      // Quebra por metodo
      + _byMethod(s.by_method || {})

      // Filtros
      + _filters()

      // Tabela de movimentos
      + _table()
  }

  function _kpi(label, value, color, iconHtml, suffix) {
    return ''
      + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px">'
        + '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">'
          + '<span style="color:' + color + '">' + iconHtml + '</span>'
          + '<div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px">' + label + '</div>'
        + '</div>'
        + '<div style="font-size:22px;font-weight:700;color:' + color + ';margin-bottom:2px">' + value + '</div>'
        + (suffix ? '<div style="font-size:11px;color:#9ca3af">' + suffix + '</div>' : '')
      + '</div>'
  }

  function _byMethod(byMethod) {
    var entries = Object.entries(byMethod || {})
    if (entries.length === 0) {
      return ''
    }
    var fmt = window.CashflowService.fmtCurrency
    var label = window.CashflowService.methodLabel
    var total = entries.reduce(function(s, e) { return s + Number(e[1] || 0) }, 0)

    var html = '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:16px 18px;margin-bottom:24px">'
      + '<div style="font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:12px">Entradas por metodo</div>'
      + '<div style="display:flex;flex-wrap:wrap;gap:10px">'

    entries.sort(function(a, b) { return Number(b[1]) - Number(a[1]) }).forEach(function(e) {
      var pct = total > 0 ? ((Number(e[1]) / total) * 100).toFixed(1) : '0'
      html += ''
        + '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:10px 14px;min-width:140px">'
          + '<div style="font-size:11px;color:#6b7280;font-weight:500;margin-bottom:2px">' + label(e[0]) + '</div>'
          + '<div style="font-size:15px;font-weight:700;color:#111827">' + fmt(e[1]) + '</div>'
          + '<div style="font-size:10px;color:#9ca3af">' + pct + '% do total</div>'
        + '</div>'
    })

    html += '</div></div>'
    return html
  }

  function _filters() {
    var methods = window.CashflowService.PAYMENT_METHODS
    var html = '<div style="display:flex;gap:8px;align-items:center;margin-bottom:12px;flex-wrap:wrap">'
      + '<select id="cfFilterDir" style="background:#fff;border:1.5px solid #e5e7eb;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:500">'
        + '<option value="">Todos</option>'
        + '<option value="credit"' + (_state.direction === 'credit' ? ' selected' : '') + '>Entradas</option>'
        + '<option value="debit"'  + (_state.direction === 'debit'  ? ' selected' : '') + '>Saidas</option>'
      + '</select>'
      + '<select id="cfFilterMethod" style="background:#fff;border:1.5px solid #e5e7eb;padding:8px 12px;border-radius:8px;font-size:12px;font-weight:500">'
        + '<option value="">Todos metodos</option>'

    methods.forEach(function(m) {
      html += '<option value="' + m.id + '"' + (_state.method === m.id ? ' selected' : '') + '>' + m.label + '</option>'
    })

    html += '</select>'
      + '<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#374151;cursor:pointer">'
        + '<input type="checkbox" id="cfFilterUnrec"' + (_state.onlyUnreconciled ? ' checked' : '') + ' style="cursor:pointer"> So nao reconciliados'
      + '</label>'
      + '<div style="margin-left:auto;font-size:12px;color:#6b7280">' + _state.entries.length + ' movimentos</div>'
    + '</div>'

    setTimeout(function() {
      var d = document.getElementById('cfFilterDir')
      var m = document.getElementById('cfFilterMethod')
      var u = document.getElementById('cfFilterUnrec')
      if (d) d.addEventListener('change', function(e) { _state.direction = e.target.value; _loadData() })
      if (m) m.addEventListener('change', function(e) { _state.method = e.target.value; _loadData() })
      if (u) u.addEventListener('change', function(e) { _state.onlyUnreconciled = e.target.checked; _loadData() })
    }, 0)

    return html
  }

  function _table() {
    if (_state.entries.length === 0) {
      return ''
        + '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;padding:48px;text-align:center">'
          + '<div style="color:#9ca3af;margin-bottom:8px">' + _icon('inbox', 36) + '</div>'
          + '<div style="font-size:14px;color:#6b7280">Nenhum movimento no periodo</div>'
          + '<div style="font-size:12px;color:#9ca3af;margin-top:4px">Clique em "Novo Lancamento" para comecar</div>'
        + '</div>'
    }

    var fmt   = window.CashflowService.fmtCurrency
    var fmtD  = window.CashflowService.fmtDate
    var label = window.CashflowService.methodLabel

    var html = '<div style="background:#fff;border:1px solid #e5e7eb;border-radius:12px;overflow:hidden">'
      + '<table style="width:100%;border-collapse:collapse;font-size:13px">'
        + '<thead>'
          + '<tr style="background:#f9fafb">'
            + '<th style="padding:12px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Data</th>'
            + '<th style="padding:12px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Descricao</th>'
            + '<th style="padding:12px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Metodo</th>'
            + '<th style="padding:12px 14px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Paciente</th>'
            + '<th style="padding:12px 14px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Valor</th>'
            + '<th style="padding:12px 14px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb">Status</th>'
            + '<th style="padding:12px 14px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;border-bottom:1px solid #e5e7eb"></th>'
          + '</tr>'
        + '</thead>'
        + '<tbody>'

    _state.entries.forEach(function(e) {
      var isCredit = e.direction === 'credit'
      var color = isCredit ? '#10b981' : '#ef4444'
      var sign  = isCredit ? '+' : '-'
      var statusBadge = _statusBadge(e)

      html += ''
        + '<tr style="border-bottom:1px solid #f3f4f6">'
          + '<td style="padding:12px 14px;color:#374151;white-space:nowrap">' + fmtD(e.transaction_date) + '</td>'
          + '<td style="padding:12px 14px;color:#111827">'
            + (e.description || '<span style="color:#9ca3af">(sem descricao)</span>')
            + (e.installment_number ? '<span style="font-size:11px;color:#6b7280;margin-left:6px">[' + e.installment_number + '/' + e.installment_total + ']</span>' : '')
          + '</td>'
          + '<td style="padding:12px 14px;color:#6b7280">' + label(e.payment_method) + '</td>'
          + '<td style="padding:12px 14px;color:#374151">' + (e.patient_name || '<span style="color:#9ca3af">—</span>') + '</td>'
          + '<td style="padding:12px 14px;text-align:right;font-weight:700;color:' + color + '">' + sign + ' ' + fmt(e.amount) + '</td>'
          + '<td style="padding:12px 14px;text-align:center">' + statusBadge + '</td>'
          + '<td style="padding:12px 14px;text-align:center">'
            + '<button data-id="' + e.id + '" class="cf-del-btn" style="all:unset;cursor:pointer;color:#9ca3af;padding:4px" title="Excluir">' + _icon('trash-2', 14) + '</button>'
          + '</td>'
        + '</tr>'
    })

    html += '</tbody></table></div>'

    setTimeout(function() {
      var btns = document.querySelectorAll('.cf-del-btn')
      btns.forEach(function(b) {
        b.addEventListener('click', function() {
          var id = b.getAttribute('data-id')
          if (confirm('Excluir este lancamento?')) _delete(id)
        })
      })
    }, 0)

    return html
  }

  function _statusBadge(e) {
    if (e.match_confidence === 'manual' || e.match_confidence === 'auto_high') {
      return '<span style="background:rgba(16,185,129,.12);color:#10b981;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px">VINCULADO</span>'
    }
    if (e.match_confidence === 'pending_bank_confirmation') {
      return '<span style="background:rgba(245,158,11,.12);color:#f59e0b;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px">AGUARDANDO</span>'
    }
    if (e.match_confidence === 'auto_low') {
      return '<span style="background:rgba(99,102,241,.12);color:#6366f1;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px">SUGERIDO</span>'
    }
    return '<span style="background:#f3f4f6;color:#6b7280;font-size:10px;font-weight:700;padding:3px 8px;border-radius:6px">SEM VINCULO</span>'
  }

  // ── Auto-reconcile ────────────────────────────────────────

  async function _runReconcile(opts) {
    opts = opts || {}
    var btn = document.getElementById('cfReconcileBtn')
    if (btn) {
      btn.disabled = true
      btn.style.opacity = '0.6'
      btn.innerHTML = _icon('zap', 14) + ' Reconciliando...'
    }

    var res = await window.CashflowService.autoReconcile(_state.startDate, _state.endDate)
    var d = (res && res.ok) ? res.data : {}

    if (btn) {
      btn.disabled = false
      btn.style.opacity = '1'
      btn.innerHTML = _icon('zap', 14) + ' Reconciliar'
    }

    if (!opts.silent) {
      var msg = 'Reconciliacao concluida\n\n'
        + 'Processados: ' + (d.processed || 0) + '\n'
        + 'Vinculados automaticamente: ' + (d.auto_high || 0) + '\n'
        + 'Sugestoes (review): ' + (d.auto_low || 0) + '\n'
        + 'Sem match: ' + (d.no_match || 0) + '\n'
        + 'Confirmados pelo banco: ' + (d.pending_confirmed || 0)
      alert(msg)
    }

    await _loadData()
    if ((d.auto_low || 0) > 0) await _loadAndShowSuggestions()
  }

  async function _loadAndShowSuggestions() {
    var res = await window.CashflowService.getSuggestions(_state.startDate, _state.endDate)
    if (!res || !res.ok || !res.data || res.data.length === 0) return
    _renderSuggestionsPanel(res.data)
  }

  function _renderSuggestionsPanel(suggestions) {
    var existing = document.getElementById('cfSuggestionsPanel')
    if (existing) existing.remove()

    var fmt = window.CashflowService.fmtCurrency
    var fmtD = window.CashflowService.fmtDate

    var html = '<div id="cfSuggestionsPanel" style="background:#fff;border:1px solid #c7d2fe;border-radius:12px;padding:18px;margin-bottom:20px">'
      + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">'
        + '<div style="display:flex;align-items:center;gap:10px">'
          + '<span style="color:#6366f1">' + _icon('zap', 18) + '</span>'
          + '<div>'
            + '<div style="font-size:14px;font-weight:700;color:#111827">Sugestoes de reconciliacao</div>'
            + '<div style="font-size:11px;color:#6b7280">' + suggestions.length + ' movimentos com mais de um agendamento candidato</div>'
          + '</div>'
        + '</div>'
        + '<button id="cfSuggClose" style="all:unset;cursor:pointer;color:#9ca3af;padding:4px">' + _icon('x', 16) + '</button>'
      + '</div>'

    suggestions.forEach(function(s) {
      html += '<div style="border:1px solid #e5e7eb;border-radius:10px;padding:12px;margin-bottom:10px">'
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">'
          + '<div>'
            + '<div style="font-size:13px;font-weight:600;color:#111827">' + (s.description || 'Sem descricao') + '</div>'
            + '<div style="font-size:11px;color:#6b7280">' + fmtD(s.transaction_date) + ' | ' + fmt(s.amount) + '</div>'
          + '</div>'
          + '<button data-entry="' + s.entry_id + '" class="cf-sugg-reject" style="all:unset;cursor:pointer;color:#9ca3af;font-size:11px;text-decoration:underline">Ignorar</button>'
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:6px">'

      ;(s.candidates || []).forEach(function(c) {
        html += '<button class="cf-sugg-link" data-entry="' + s.entry_id + '" data-appt="' + c.appointment_id + '" data-patient="' + (c.patient_id || '') + '" '
          + 'style="all:unset;cursor:pointer;display:flex;align-items:center;justify-content:space-between;padding:8px 12px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px">'
          + '<div style="font-size:12px;color:#374151">'
            + '<strong>' + (c.patient_name || 'Sem nome') + '</strong>'
            + ' | ' + fmtD(c.date)
            + (c.start_time ? ' ' + c.start_time.substring(0, 5) : '')
            + ' | ' + fmt(c.valor || c.valor_pago || 0)
          + '</div>'
          + '<span style="font-size:11px;color:#10b981;font-weight:600">VINCULAR ' + _icon('check-circle', 12) + '</span>'
          + '</button>'
      })

      html += '</div></div>'
    })

    html += '</div>'

    var body = document.getElementById('cfBody')
    if (body) body.insertAdjacentHTML('afterbegin', html)

    document.getElementById('cfSuggClose').addEventListener('click', function() {
      var p = document.getElementById('cfSuggestionsPanel')
      if (p) p.remove()
    })

    document.querySelectorAll('.cf-sugg-link').forEach(function(b) {
      b.addEventListener('click', async function() {
        var entryId = b.getAttribute('data-entry')
        var apptId  = b.getAttribute('data-appt')
        var patId   = b.getAttribute('data-patient') || null
        await window.CashflowService.linkAppointment(entryId, apptId, patId)
        _loadData()
        var p = document.getElementById('cfSuggestionsPanel')
        if (p) p.remove()
        setTimeout(_loadAndShowSuggestions, 300)
      })
    })

    document.querySelectorAll('.cf-sugg-reject').forEach(function(b) {
      b.addEventListener('click', async function() {
        var entryId = b.getAttribute('data-entry')
        await window.CashflowService.rejectSuggestion(entryId)
        _loadData()
        var p = document.getElementById('cfSuggestionsPanel')
        if (p) p.remove()
        setTimeout(_loadAndShowSuggestions, 300)
      })
    })
  }

  // ── Delete ────────────────────────────────────────────────

  async function _delete(id) {
    var res = await window.CashflowService.deleteEntry(id)
    if (res && res.ok) _loadData()
    else alert('Erro ao excluir: ' + (res && res.error || 'desconhecido'))
  }

  // ── Modal Novo Lancamento ─────────────────────────────────

  function _openNewModal() {
    var existing = document.getElementById('cfModalBackdrop')
    if (existing) existing.remove()

    var methods = window.CashflowService.PAYMENT_METHODS
    var cats    = window.CashflowService.CATEGORIES
    var today   = window.CashflowService.todayISO()

    var html = ''
      + '<div id="cfModalBackdrop" style="position:fixed;inset:0;background:rgba(0,0,0,.5);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px">'
        + '<div style="background:#fff;border-radius:16px;width:100%;max-width:560px;max-height:90vh;overflow:auto;box-shadow:0 25px 50px rgba(0,0,0,.25)">'
          // Header
          + '<div style="padding:20px 24px;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;justify-content:space-between">'
            + '<div>'
              + '<h3 style="margin:0;font-size:18px;font-weight:700;color:#111827">Novo Lancamento</h3>'
              + '<p style="margin:4px 0 0;font-size:12px;color:#6b7280">Registre uma entrada ou saida no fluxo de caixa</p>'
            + '</div>'
            + '<button id="cfModalClose" style="all:unset;cursor:pointer;color:#9ca3af;padding:8px">' + _icon('x', 20) + '</button>'
          + '</div>'

          // Body
          + '<div style="padding:24px;display:flex;flex-direction:column;gap:14px">'
            // Tipo
            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Tipo</label>'
              + '<div style="display:flex;gap:8px">'
                + '<button type="button" data-dir="credit" class="cf-dir-btn" style="flex:1;padding:10px;background:#10b981;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Entrada</button>'
                + '<button type="button" data-dir="debit" class="cf-dir-btn" style="flex:1;padding:10px;background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Saida</button>'
              + '</div>'
            + '</div>'
            // Data + Valor
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
              + '<div>'
                + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Data</label>'
                + '<input type="date" id="cfDate" value="' + today + '" style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">'
              + '</div>'
              + '<div>'
                + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Valor (R$)</label>'
                + '<input type="number" id="cfAmount" step="0.01" min="0" placeholder="0,00" style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">'
              + '</div>'
            + '</div>'
            // Metodo + Categoria
            + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">'
              + '<div>'
                + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Metodo</label>'
                + '<select id="cfMethod" style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">'
                  + methods.map(function(m) { return '<option value="' + m.id + '">' + m.label + '</option>' }).join('')
                + '</select>'
              + '</div>'
              + '<div>'
                + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Categoria</label>'
                + '<select id="cfCategory" style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">'
                  + cats.map(function(c) { return '<option value="' + c.id + '">' + c.label + '</option>' }).join('')
                + '</select>'
              + '</div>'
            + '</div>'
            // Descricao
            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Descricao</label>'
              + '<input type="text" id="cfDesc" placeholder="Ex: Consulta paciente Maria Silva" style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">'
            + '</div>'
            // Vincular paciente (opcional)
            + '<div>'
              + '<label style="display:block;font-size:12px;font-weight:600;color:#374151;margin-bottom:6px">Vincular paciente <span style="color:#9ca3af;font-weight:400">(opcional)</span></label>'
              + '<input type="text" id="cfPatientSearch" placeholder="Buscar paciente por nome..." style="width:100%;padding:10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px">'
              + '<div id="cfPatientResults" style="display:none;max-height:140px;overflow:auto;border:1px solid #e5e7eb;border-radius:8px;margin-top:4px"></div>'
              + '<input type="hidden" id="cfPatientId">'
              + '<input type="hidden" id="cfAppointmentId">'
              + '<div id="cfPatientChosen" style="display:none;margin-top:6px;padding:8px 10px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:12px;color:#065f46"></div>'
            + '</div>'
          + '</div>'

          // Footer
          + '<div style="padding:16px 24px;border-top:1px solid #e5e7eb;display:flex;gap:8px;justify-content:flex-end">'
            + '<button id="cfModalCancel" style="background:#fff;color:#6b7280;border:1.5px solid #e5e7eb;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>'
            + '<button id="cfModalSave" style="background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">Salvar</button>'
          + '</div>'

        + '</div>'
      + '</div>'

    document.body.insertAdjacentHTML('beforeend', html)

    var dir = 'credit'
    document.querySelectorAll('.cf-dir-btn').forEach(function(b) {
      b.addEventListener('click', function() {
        dir = b.getAttribute('data-dir')
        document.querySelectorAll('.cf-dir-btn').forEach(function(x) {
          var isActive = x.getAttribute('data-dir') === dir
          var color = dir === 'credit' ? '#10b981' : '#ef4444'
          x.style.background = isActive ? color : '#fff'
          x.style.color      = isActive ? '#fff'  : '#6b7280'
          x.style.border     = isActive ? 'none'  : '1.5px solid #e5e7eb'
        })
      })
    })

    document.getElementById('cfModalClose').addEventListener('click', _closeModal)
    document.getElementById('cfModalCancel').addEventListener('click', _closeModal)
    document.getElementById('cfModalBackdrop').addEventListener('click', function(e) {
      if (e.target.id === 'cfModalBackdrop') _closeModal()
    })

    // Patient search
    var patSearch = document.getElementById('cfPatientSearch')
    var debounceTimer
    patSearch.addEventListener('input', function() {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(function() { _searchPatients(patSearch.value) }, 300)
    })

    document.getElementById('cfModalSave').addEventListener('click', function() { _save(dir) })
  }

  function _closeModal() {
    var b = document.getElementById('cfModalBackdrop')
    if (b) b.remove()
  }

  function _searchPatients(q) {
    var resultsDiv = document.getElementById('cfPatientResults')
    if (!q || q.length < 2) {
      resultsDiv.style.display = 'none'
      return
    }

    var leads = window.LeadsService ? (window.LeadsService.getLocal ? window.LeadsService.getLocal() : []) : []
    var qLow = q.toLowerCase()
    var matches = leads.filter(function(l) {
      return (l.name || '').toLowerCase().indexOf(qLow) >= 0
    }).slice(0, 8)

    if (matches.length === 0) {
      resultsDiv.innerHTML = '<div style="padding:8px 12px;font-size:12px;color:#9ca3af">Nenhum paciente encontrado</div>'
      resultsDiv.style.display = 'block'
      return
    }

    resultsDiv.innerHTML = matches.map(function(p) {
      return '<div class="cf-pat-item" data-id="' + p.id + '" data-name="' + (p.name || '').replace(/"/g, '&quot;') + '" style="padding:10px 12px;font-size:13px;color:#111827;cursor:pointer;border-bottom:1px solid #f3f4f6">'
        + (p.name || 'Sem nome') + '<span style="color:#9ca3af;margin-left:8px">' + (p.phone || '') + '</span>'
        + '</div>'
    }).join('')
    resultsDiv.style.display = 'block'

    document.querySelectorAll('.cf-pat-item').forEach(function(it) {
      it.addEventListener('click', function() {
        var id   = it.getAttribute('data-id')
        var name = it.getAttribute('data-name')
        document.getElementById('cfPatientId').value = id
        var chosen = document.getElementById('cfPatientChosen')
        chosen.innerHTML = '✓ ' + name
        chosen.style.display = 'block'
        document.getElementById('cfPatientResults').style.display = 'none'
        document.getElementById('cfPatientSearch').value = name
      })
    })
  }

  async function _save(direction) {
    var data = {
      transaction_date: document.getElementById('cfDate').value,
      direction:        direction,
      amount:           parseFloat(document.getElementById('cfAmount').value || 0),
      payment_method:   document.getElementById('cfMethod').value,
      category:         document.getElementById('cfCategory').value,
      description:      document.getElementById('cfDesc').value || null,
      patient_id:       document.getElementById('cfPatientId').value || null,
      source:           'manual',
    }

    if (!data.transaction_date || !data.amount || data.amount <= 0) {
      alert('Preencha data e valor (maior que zero)')
      return
    }

    var res = await window.CashflowService.createEntry(data)
    if (res && res.ok) {
      _closeModal()
      _loadData()
    } else {
      alert('Erro ao salvar: ' + (res && res.error || 'desconhecido'))
    }
  }

  // ── Icons ─────────────────────────────────────────────────

  function _icon(name, size) {
    size = size || 16
    var icons = {
      'plus':              '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
      'upload':            '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>',
      'dollar-sign':       '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>',
      'arrow-down-circle': '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="8 12 12 16 16 12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>',
      'arrow-up-circle':   '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="16 12 12 8 8 12"/><line x1="12" y1="16" x2="12" y2="8"/></svg>',
      'alert-circle':      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
      'chevron-left':      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>',
      'trash-2':           '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>',
      'x':                 '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
      'inbox':             '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></svg>',
      'zap':               '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>',
      'link':              '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>',
      'check-circle':      '<svg width="' + size + '" height="' + size + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>',
    }
    return icons[name] || ''
  }

  // ── Expose ────────────────────────────────────────────────

  window.CashflowUI = Object.freeze({
    init:           init,
    reload:         _loadData,
    runReconcile:   _runReconcile,
    showSuggestions: _loadAndShowSuggestions,
  })
})()
