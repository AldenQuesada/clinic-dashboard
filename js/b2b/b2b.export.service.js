/**
 * ClinicAI — B2B Export Service
 *
 * Serviço puro para conversão de arrays de parcerias em CSV.
 * Zero DOM, zero I/O. Testável isolado. Expõe window.B2BExportService.
 *
 * BOM UTF-8 no início pra Excel abrir acentos direito.
 */
;(function () {
  'use strict'
  if (window.B2BExportService) return

  // Colunas e labels (pt-BR) na ordem da planilha
  var COLUMNS = [
    { key: 'name',                   label: 'Nome' },
    { key: 'slug',                   label: 'Slug' },
    { key: 'pillar',                 label: 'Pilar' },
    { key: 'category',               label: 'Categoria' },
    { key: 'tier',                   label: 'Tier' },
    { key: 'type',                   label: 'Tipo' },
    { key: 'status',                 label: 'Status' },
    { key: 'status_reason',          label: 'Motivo Status' },
    { key: 'dna_excelencia',         label: 'DNA Excelência' },
    { key: 'dna_estetica',           label: 'DNA Estética' },
    { key: 'dna_proposito',          label: 'DNA Propósito' },
    { key: 'dna_score',              label: 'DNA Score' },
    { key: 'health_color',           label: 'Saúde' },
    { key: 'contact_name',           label: 'Contato' },
    { key: 'contact_phone',          label: 'Telefone' },
    { key: 'contact_email',          label: 'E-mail' },
    { key: 'instagram',              label: 'Instagram' },
    { key: 'website',                label: 'Site' },
    { key: 'is_collective',          label: 'Coletiva' },
    { key: 'member_count',           label: 'Membros' },
    { key: 'voucher_combo',          label: 'Voucher Combo' },
    { key: 'voucher_validity_days',  label: 'Validade Voucher (d)' },
    { key: 'voucher_monthly_cap',    label: 'Cap Mensal Voucher' },
    { key: 'monthly_value_cap_brl',  label: 'Teto Mensal (R$)' },
    { key: 'contract_duration_months', label: 'Contrato (meses)' },
    { key: 'sazonais',               label: 'Sazonais' },
    { key: 'involved_professionals', label: 'Profissionais' },
    { key: 'closure_suggested_at',   label: 'Encerramento Sugerido Em' },
    { key: 'closure_reason',         label: 'Motivo Encerramento' },
    { key: 'created_at',             label: 'Criada Em' },
    { key: 'updated_at',             label: 'Atualizada Em' },
  ]

  // Escapa um valor pra CSV: aspas duplas e separador vírgula.
  // - null/undefined -> ''
  // - arrays -> 'a|b|c' (pipe evita conflito com comma do CSV)
  // - booleans -> 'sim'/'nao'
  // - ISO dates -> dd/mm/yyyy hh:mm
  function _normalizeCell(v) {
    if (v == null) return ''
    if (typeof v === 'boolean') return v ? 'sim' : 'não'
    if (Array.isArray(v)) return v.map(function (x) { return String(x == null ? '' : x) }).join(' | ')
    if (typeof v === 'number') {
      // normaliza decimal pra vírgula (padrão BR)
      return String(v).replace('.', ',')
    }
    if (typeof v === 'string') {
      // ISO date? tenta formatar
      if (/^\d{4}-\d{2}-\d{2}T/.test(v)) {
        try {
          var d = new Date(v)
          if (!isNaN(d.getTime())) {
            var pad = function (n) { return n < 10 ? '0' + n : String(n) }
            return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear() +
              ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes())
          }
        } catch (_) { /* fallback abaixo */ }
      }
      return v
    }
    return String(v)
  }

  function _escapeCsvField(v) {
    var s = String(v == null ? '' : v)
    // Se contiver vírgula, aspas duplas, CR ou LF, precisa aspar e escapar aspas
    if (/[",\r\n]/.test(s)) {
      s = '"' + s.replace(/"/g, '""') + '"'
    }
    return s
  }

  /**
   * Converte array de parcerias em string CSV.
   * @param {Array<Object>} rows
   * @param {Object} [opts] { columns?: COLUMNS customizadas, separator?: ',' }
   * @returns {string} CSV completo (com header) SEM BOM — o BOM é adicionado no downloadCSV
   */
  function toCSV(rows, opts) {
    opts = opts || {}
    var cols = opts.columns || COLUMNS
    var sep  = opts.separator || ','

    var headerLine = cols.map(function (c) { return _escapeCsvField(c.label) }).join(sep)

    var bodyLines = (rows || []).map(function (r) {
      return cols.map(function (c) {
        return _escapeCsvField(_normalizeCell(r && r[c.key]))
      }).join(sep)
    })

    return headerLine + '\r\n' + bodyLines.join('\r\n')
  }

  /**
   * Gera nome default: b2b-parcerias-YYYYMMDD-HHmm.csv
   */
  function defaultFilename(prefix) {
    var d = new Date()
    var pad = function (n) { return n < 10 ? '0' + n : String(n) }
    var stamp = d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) +
                '-' + pad(d.getHours()) + pad(d.getMinutes())
    return (prefix || 'b2b-parcerias') + '-' + stamp + '.csv'
  }

  /**
   * Dispara download do CSV.
   * Adiciona BOM UTF-8 (\uFEFF) pro Excel abrir acentos direito.
   */
  function downloadCSV(filename, rows, opts) {
    var csv = toCSV(rows, opts)
    var BOM = '\uFEFF'
    var blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' })
    var url  = URL.createObjectURL(blob)
    var a    = document.createElement('a')
    a.href = url
    a.download = filename || defaultFilename()
    a.style.display = 'none'
    document.body.appendChild(a)
    a.click()
    setTimeout(function () {
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }, 100)
  }

  window.B2BExportService = Object.freeze({
    COLUMNS:         COLUMNS,
    toCSV:           toCSV,
    downloadCSV:     downloadCSV,
    defaultFilename: defaultFilename,
  })
})()
