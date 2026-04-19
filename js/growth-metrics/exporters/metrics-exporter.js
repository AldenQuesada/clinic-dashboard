/**
 * ClinicAI — MetricsExporter (reaproveitado em Growth + B2B Metrics)
 *
 * IIFE puro, zero deps externas. Expõe window.MetricsExporter.
 *
 * Funcionalidades:
 *   - toCSV(filename, rows[, opts]) ....... download de CSV (BOM UTF-8 + sep `;`)
 *   - toPrintPDF(title, containerSelector) . nova aba com print stylesheet + window.print()
 *   - buildReport(metricsData) ............. HTML formatado consolidando funnel, quality, etc
 *
 * Padrão BR:
 *   - Separador `;` (Excel BR)
 *   - BOM UTF-8 `\uFEFF` pra acentos
 *   - Datas em pt-BR (dd/mm/yyyy HH:mm)
 *   - Arrays com ' | ' (pipe padding) como separador de célula
 *   - Decimais com vírgula
 *   - Booleans em 'sim' / 'não'
 */
;(function () {
  'use strict'
  if (window.MetricsExporter) return

  // ---------- helpers ----------

  function _pad(n) { return n < 10 ? '0' + n : String(n) }

  function _formatDateBR(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return ''
    return _pad(d.getDate()) + '/' + _pad(d.getMonth() + 1) + '/' + d.getFullYear()
  }

  function _formatDateTimeBR(d) {
    if (!(d instanceof Date) || isNaN(d.getTime())) return ''
    return _formatDateBR(d) + ' ' + _pad(d.getHours()) + ':' + _pad(d.getMinutes())
  }

  function _esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' })[c]
    })
  }

  function _normalizeCell(v) {
    if (v == null) return ''
    if (typeof v === 'boolean') return v ? 'sim' : 'não'
    if (Array.isArray(v)) {
      return v.map(function (x) { return x == null ? '' : String(x) }).join(' | ')
    }
    if (typeof v === 'number') {
      if (!isFinite(v)) return ''
      // decimal vírgula (BR)
      return String(v).replace('.', ',')
    }
    if (v instanceof Date) return _formatDateTimeBR(v)
    if (typeof v === 'string') {
      // ISO date? formata pra pt-BR
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
        try {
          var d = new Date(v)
          if (!isNaN(d.getTime())) return _formatDateTimeBR(d)
        } catch (_) { /* passa adiante */ }
      }
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        try {
          var d2 = new Date(v + 'T00:00:00')
          if (!isNaN(d2.getTime())) return _formatDateBR(d2)
        } catch (_) { /* passa adiante */ }
      }
      return v
    }
    if (typeof v === 'object') {
      try { return JSON.stringify(v) } catch (_) { return String(v) }
    }
    return String(v)
  }

  function _csvField(v, sep) {
    var s = String(v == null ? '' : v)
    if (s.indexOf(sep) !== -1 || s.indexOf('"') !== -1 || /[\r\n]/.test(s)) {
      s = '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }

  /**
   * Infere colunas a partir de rows (união das chaves, preserva ordem de aparição).
   */
  function _inferColumns(rows) {
    var seen = Object.create(null)
    var out = []
    ;(rows || []).forEach(function (r) {
      if (!r || typeof r !== 'object') return
      Object.keys(r).forEach(function (k) {
        if (!seen[k]) { seen[k] = true; out.push({ key: k, label: k }) }
      })
    })
    return out
  }

  // ---------- CSV ----------

  /**
   * Converte rows em string CSV (sem BOM).
   * @param {Array<Object>} rows
   * @param {Object} [opts] { columns?, separator? }
   * @returns {string}
   */
  function rowsToCSV(rows, opts) {
    opts = opts || {}
    var sep = opts.separator || ';'
    var cols = (opts.columns && opts.columns.length) ? opts.columns : _inferColumns(rows)
    if (!cols.length) return ''

    var header = cols.map(function (c) { return _csvField(c.label || c.key, sep) }).join(sep)
    var body = (rows || []).map(function (r) {
      return cols.map(function (c) {
        return _csvField(_normalizeCell(r && r[c.key]), sep)
      }).join(sep)
    })
    return header + '\r\n' + body.join('\r\n')
  }

  /**
   * Dispara download do CSV. BOM UTF-8 + separador `;` (Excel BR).
   * @param {string} filename
   * @param {Array<Object>} rows
   * @param {Object} [opts] { columns?, separator? }
   */
  function toCSV(filename, rows, opts) {
    var csv = rowsToCSV(rows, opts)
    var BOM = '\uFEFF'
    var blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
    var url = URL.createObjectURL(blob)
    var a = document.createElement('a')
    a.href = url
    a.download = filename || _defaultFilename('export', 'csv')
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(function () {
      try { document.body.removeChild(a) } catch (_) { /* ok */ }
      URL.revokeObjectURL(url)
    }, 120)
  }

  function _defaultFilename(prefix, ext) {
    var d = new Date()
    var stamp = d.getFullYear() + '-' + _pad(d.getMonth() + 1) + '-' + _pad(d.getDate())
    return (prefix || 'export') + '-' + stamp + '.' + (ext || 'csv')
  }

  // ---------- PRINT / PDF ----------

  /**
   * CSS aplicado na nova aba de impressão — otimizado pra A4 landscape.
   */
  var PRINT_CSS = '' +
    '@page { size: A4 landscape; margin: 14mm 12mm; }' +
    '*, *::before, *::after { box-sizing: border-box; }' +
    'html, body {' +
      'margin:0; padding:0; background:#fff; color:#111;' +
      "font-family: 'Montserrat', Arial, sans-serif; font-size:11px; line-height:1.45;" +
    '}' +
    '.mex-page { padding: 0 6mm; }' +
    '.mex-head {' +
      'display:flex; justify-content:space-between; align-items:flex-end;' +
      'border-bottom:1px solid #C9A96E; padding:6px 0 10px; margin-bottom:14px;' +
    '}' +
    '.mex-head-title {' +
      "font-family:'Cormorant Garamond', Georgia, serif; font-size:22px; font-weight:400;" +
      'letter-spacing:0.4px; color:#111;' +
    '}' +
    '.mex-head-title em { color:#8a7239; font-style:italic; font-weight:500; }' +
    '.mex-eyebrow {' +
      'font-size:9px; letter-spacing:3px; text-transform:uppercase; color:#8a7239;' +
      'margin-bottom:4px;' +
    '}' +
    '.mex-meta { font-size:10px; color:#555; text-align:right; }' +
    '.mex-meta strong { color:#111; }' +
    '.mex-body { }' +
    '.mex-section {' +
      'break-inside: avoid; page-break-inside: avoid;' +
      'margin-bottom:14px; padding:10px 12px;' +
      'border:1px solid #ddd; border-radius:6px; background:#fff;' +
    '}' +
    '.mex-section h2 {' +
      "font-family:'Cormorant Garamond', Georgia, serif; font-size:15px; font-weight:500;" +
      'margin:0 0 8px; color:#111;' +
    '}' +
    '.mex-kv { display:grid; grid-template-columns: repeat(4, 1fr); gap:6px 14px; }' +
    '.mex-kv-item { font-size:10px; }' +
    '.mex-kv-lbl { color:#666; letter-spacing:1px; text-transform:uppercase; font-size:8px; }' +
    '.mex-kv-val { color:#111; font-weight:600; font-size:13px; }' +
    '.mex-table { width:100%; border-collapse:collapse; font-size:10px; }' +
    '.mex-table th, .mex-table td {' +
      'border-bottom:1px solid #eee; padding:5px 6px; text-align:left; vertical-align:top;' +
    '}' +
    '.mex-table th {' +
      'font-size:8px; letter-spacing:1.2px; text-transform:uppercase; color:#666;' +
      'border-bottom:1px solid #bbb; font-weight:700;' +
    '}' +
    '.mex-table td.num, .mex-table th.num { text-align:right; font-variant-numeric: tabular-nums; }' +
    '.mex-footer {' +
      'margin-top:18px; padding-top:8px; border-top:1px solid #ddd;' +
      'font-size:9px; color:#777; display:flex; justify-content:space-between;' +
    '}' +
    '.mex-badge {' +
      'display:inline-block; padding:1px 6px; font-size:8px; letter-spacing:1px;' +
      'text-transform:uppercase; border-radius:3px; background:#eee; color:#333;' +
    '}' +
    '.mex-badge-ouro { background:#f4e4ba; color:#7a5a10; }' +
    '.mex-badge-boa  { background:#d1f0d8; color:#1f5a32; }' +
    '.mex-badge-media { background:#e6e6ef; color:#444; }' +
    '.mex-badge-baixa { background:#fbdada; color:#7a1414; }' +
    '.mex-snapshot {' +
      'border:1px solid #ddd; padding:10px; background:#fff;' +
      'border-radius:6px; margin-bottom:14px;' +
    '}' +
    '.mex-snapshot .mex-snapshot-grid {' +
      'display:grid; grid-template-columns:1fr 1fr; gap:12px;' +
    '}' +
    '.mex-snapshot-card {' +
      'border:1px solid #e3e3e3; border-radius:4px; padding:8px;' +
      'background:#fafafa; break-inside: avoid;' +
    '}' +
    '.mex-snapshot-card h3 {' +
      'margin:0 0 6px; font-size:11px; letter-spacing:1px;' +
      'text-transform:uppercase; color:#8a7239;' +
    '}' +
    '.mex-snapshot-card .mex-raw {' +
      'font-family: ui-monospace, SFMono-Regular, Menlo, monospace;' +
      'font-size:9px; color:#222; white-space:pre-wrap; word-break:break-word;' +
    '}'

  /**
   * Abre nova aba com o HTML renderizado otimizado pra print, chama window.print().
   * @param {string} title        Cabeçalho (ex.: "Clínica Mirian · Growth Metrics · abril/2026")
   * @param {string|Object} source Selector CSS para clonar o DOM atual, OU objeto { html: string }
   *                               OU objeto { report: {...} } que usa buildReport(report)
   */
  function toPrintPDF(title, source) {
    var now = new Date()
    var metaDate = _formatDateTimeBR(now)

    var bodyHtml = ''
    if (source && typeof source === 'object' && source.html) {
      bodyHtml = String(source.html)
    } else if (source && typeof source === 'object' && source.report) {
      bodyHtml = buildReport(source.report)
    } else if (typeof source === 'string') {
      var container = document.querySelector(source)
      if (container) {
        // Clone para HTML estático — imprime o snapshot atual dos widgets
        bodyHtml = '<div class="mex-snapshot"><div class="mex-snapshot-grid">' +
          _extractWidgetsHtml(container) +
          '</div></div>'
      } else {
        bodyHtml = '<div class="mex-snapshot"><p>Container não encontrado: ' + _esc(source) + '</p></div>'
      }
    } else {
      bodyHtml = '<div class="mex-snapshot"><p>Nenhum conteúdo fornecido.</p></div>'
    }

    var ttl = _esc(title || 'Relatório')
    var titleSplit = _splitEmTitle(ttl)

    var html = '<!DOCTYPE html><html lang="pt-BR"><head>' +
      '<meta charset="UTF-8">' +
      '<title>' + ttl + '</title>' +
      '<link rel="preconnect" href="https://fonts.googleapis.com">' +
      '<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
      '<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500&family=Montserrat:wght@400;500;600;700&display=swap" rel="stylesheet">' +
      '<style>' + PRINT_CSS + '</style>' +
      '</head><body><div class="mex-page">' +
        '<header class="mex-head">' +
          '<div>' +
            '<div class="mex-eyebrow">Clínica Mirian de Paula</div>' +
            '<div class="mex-head-title">' + titleSplit + '</div>' +
          '</div>' +
          '<div class="mex-meta">' +
            '<div>Gerado em</div><div><strong>' + _esc(metaDate) + '</strong></div>' +
          '</div>' +
        '</header>' +
        '<main class="mex-body">' + bodyHtml + '</main>' +
        '<footer class="mex-footer">' +
          '<span>Relatório interno — uso restrito</span>' +
          '<span>' + _esc(metaDate) + '</span>' +
        '</footer>' +
      '</div>' +
      '<script>window.addEventListener("load", function(){ setTimeout(function(){ try { window.focus(); window.print(); } catch(e){} }, 350); });<\/script>' +
      '</body></html>'

    var w = window.open('', '_blank')
    if (!w) {
      try { window.alert('Permita pop-ups para gerar o PDF.') } catch (_) { /* ok */ }
      return null
    }
    w.document.open()
    w.document.write(html)
    w.document.close()
    return w
  }

  // Destaca a última palavra do título em <em> (estilo dos dashboards)
  function _splitEmTitle(ttl) {
    var parts = String(ttl || '').split(' · ')
    if (parts.length >= 2) {
      return _esc(parts[0]) + ' · <em>' + _esc(parts.slice(1).join(' · ')) + '</em>'
    }
    return ttl
  }

  // Extrai cada widget como card individual pro snapshot print
  function _extractWidgetsHtml(container) {
    // Tenta achar cards conhecidos (.gm-card | .b2bm-card). Se não houver,
    // clona o container inteiro como fallback.
    var cards = container.querySelectorAll('.gm-card, .b2bm-card')
    if (!cards.length) {
      return '<div class="mex-snapshot-card"><div class="mex-raw">' +
        _esc(container.innerText || '').slice(0, 4000) +
        '</div></div>'
    }
    var out = []
    cards.forEach(function (c) {
      var title = ''
      var t = c.querySelector('.gm-widget-title, .b2bm-widget-title')
      if (t) title = t.textContent || ''
      var sub = ''
      var s = c.querySelector('.gm-widget-sub, .b2bm-widget-sub')
      if (s) sub = s.textContent || ''
      // Pega texto bruto do card inteiro, tirando títulos já renderizados
      var txt = (c.innerText || '').trim()
      // Remove as primeiras linhas que já estão no título/sub
      if (title) txt = txt.replace(title, '').trim()
      if (sub) txt = txt.replace(sub, '').trim()
      out.push('<div class="mex-snapshot-card">' +
        '<h3>' + _esc(title || 'Widget') + '</h3>' +
        '<div class="mex-raw">' + _esc(txt).replace(/\n/g, '<br>') + '</div>' +
      '</div>')
    })
    return out.join('')
  }

  // ---------- REPORT BUILDER ----------

  /**
   * Constrói HTML formatado pra print a partir de um objeto com seções.
   *
   * @param {Object} data ex.:
   *   {
   *     summary: { ... pares chave/valor ... },
   *     funnel:  { days, total, closed, conv_pct, ... },
   *     forecast:{ meta, projecao, gap, ... },
   *     quality: { days, partners: [ {nome, total, closed, conversion_pct, tier, quality_class}, ... ] },
   *     velocity:{ days, mediana_dias, ... },
   *     payback: { days, total_recompensas, ... },
   *     cohort:  { rows: [...] },
   *     nps:     { ... },
   *     extra:   [ { title, rows: [], columns: [] }, ... ]
   *   }
   * @returns {string} HTML
   */
  function buildReport(data) {
    data = data || {}
    var parts = []

    if (data.summary && typeof data.summary === 'object') {
      parts.push(_kvSection('Resumo', data.summary))
    }
    if (data.funnel) {
      parts.push(_kvSection('Funil' + _dayLabel(data.funnel.days), _pickKV(data.funnel, [
        ['total', 'Total'],
        ['qualified', 'Qualificadas'],
        ['scheduled', 'Agendadas'],
        ['closed', 'Fechadas'],
        ['conv_pct', 'Conversão (%)'],
        ['avg_ticket', 'Ticket médio'],
      ])))
    }
    if (data.forecast) {
      parts.push(_kvSection('Forecast do mês', _pickKV(data.forecast, [
        ['meta', 'Meta'],
        ['projecao', 'Projeção'],
        ['gap', 'Gap'],
        ['atingido_pct', 'Atingimento (%)'],
        ['mediana_diaria', 'Mediana diária'],
      ])))
    }
    if (data.velocity) {
      parts.push(_kvSection('Velocidade' + _dayLabel(data.velocity.days), _pickKV(data.velocity, [
        ['mediana_dias', 'Mediana (dias)'],
        ['p25', 'P25'],
        ['p75', 'P75'],
        ['amostra', 'Amostra'],
      ])))
    }
    if (data.payback) {
      parts.push(_kvSection('Payback' + _dayLabel(data.payback.days), _pickKV(data.payback, [
        ['total_recompensas', 'Recompensas pagas'],
        ['receita_gerada', 'Receita gerada'],
        ['roi_pct', 'ROI (%)'],
        ['payback_dias', 'Payback (dias)'],
      ])))
    }
    if (data.quality && Array.isArray(data.quality.partners) && data.quality.partners.length) {
      parts.push(_qualityTable('Ranking — Qualidade' + _dayLabel(data.quality.days), data.quality.partners))
    }
    if (data.cohort && Array.isArray(data.cohort.rows) && data.cohort.rows.length) {
      parts.push(_genericTable('Coorte de retenção', data.cohort.rows))
    }
    if (data.nps) {
      parts.push(_kvSection('NPS', _pickKV(data.nps, [
        ['score', 'NPS'],
        ['promoters', 'Promotores'],
        ['detractors', 'Detratores'],
        ['sample', 'Amostra'],
      ])))
    }
    if (Array.isArray(data.extra)) {
      data.extra.forEach(function (e) {
        if (e && Array.isArray(e.rows) && e.rows.length) {
          parts.push(_genericTable(e.title || 'Dados', e.rows, e.columns))
        } else if (e && e.kv) {
          parts.push(_kvSection(e.title || 'Dados', e.kv))
        }
      })
    }

    if (!parts.length) {
      parts.push('<section class="mex-section"><h2>Sem dados</h2><p>Nenhuma métrica disponível para gerar relatório.</p></section>')
    }
    return parts.join('')
  }

  function _dayLabel(d) {
    if (d == null || d === '') return ''
    return ' · ' + Number(d) + 'd'
  }

  function _pickKV(obj, pairs) {
    var out = {}
    pairs.forEach(function (p) {
      var k = p[0], label = p[1]
      if (obj[k] != null && obj[k] !== '') out[label] = obj[k]
    })
    return out
  }

  function _kvSection(title, kv) {
    var items = Object.keys(kv || {}).map(function (k) {
      var v = kv[k]
      return '<div class="mex-kv-item">' +
        '<div class="mex-kv-lbl">' + _esc(k) + '</div>' +
        '<div class="mex-kv-val">' + _esc(_normalizeCell(v)) + '</div>' +
      '</div>'
    }).join('')
    if (!items) return ''
    return '<section class="mex-section">' +
      '<h2>' + _esc(title) + '</h2>' +
      '<div class="mex-kv">' + items + '</div>' +
    '</section>'
  }

  function _qualityTable(title, partners) {
    var rows = partners.slice(0, 25).map(function (p, i) {
      var qc = String(p.quality_class || '').toLowerCase()
      var qCls = ({ ouro:'mex-badge-ouro', boa:'mex-badge-boa', media:'mex-badge-media', baixa:'mex-badge-baixa' })[qc] || 'mex-badge-media'
      var qTxt = qc ? qc.toUpperCase() : '—'
      return '<tr>' +
        '<td class="num">' + (i + 1) + '</td>' +
        '<td>' + _esc(p.nome || '—') + '</td>' +
        '<td>' + _esc(p.tier || '—') + '</td>' +
        '<td><span class="mex-badge ' + qCls + '">' + _esc(qTxt) + '</span></td>' +
        '<td class="num">' + _esc(_normalizeCell(p.total || 0)) + '</td>' +
        '<td class="num">' + _esc(_normalizeCell(p.closed || 0)) + '</td>' +
        '<td class="num">' + Number(p.conversion_pct || 0).toFixed(1).replace('.', ',') + '%</td>' +
      '</tr>'
    }).join('')
    return '<section class="mex-section">' +
      '<h2>' + _esc(title) + '</h2>' +
      '<table class="mex-table">' +
        '<thead><tr>' +
          '<th class="num">#</th><th>Nome</th><th>Tier</th><th>Classe</th>' +
          '<th class="num">Total</th><th class="num">Fechadas</th><th class="num">Conv.</th>' +
        '</tr></thead>' +
        '<tbody>' + rows + '</tbody>' +
      '</table>' +
    '</section>'
  }

  function _genericTable(title, rows, columns) {
    var cols = (columns && columns.length) ? columns : _inferColumns(rows)
    if (!cols.length) return ''
    var th = cols.map(function (c) { return '<th>' + _esc(c.label || c.key) + '</th>' }).join('')
    var body = rows.slice(0, 50).map(function (r) {
      return '<tr>' + cols.map(function (c) {
        var v = _normalizeCell(r && r[c.key])
        var isNum = typeof (r && r[c.key]) === 'number'
        return '<td' + (isNum ? ' class="num"' : '') + '>' + _esc(v) + '</td>'
      }).join('') + '</tr>'
    }).join('')
    return '<section class="mex-section">' +
      '<h2>' + _esc(title) + '</h2>' +
      '<table class="mex-table"><thead><tr>' + th + '</tr></thead><tbody>' + body + '</tbody></table>' +
    '</section>'
  }

  // ---------- public API ----------

  window.MetricsExporter = Object.freeze({
    toCSV:        toCSV,
    rowsToCSV:    rowsToCSV,
    toPrintPDF:   toPrintPDF,
    buildReport:  buildReport,
    _defaultFilename: _defaultFilename,
    _formatDateBR: _formatDateBR,
    _formatDateTimeBR: _formatDateTimeBR,
  })
})()
