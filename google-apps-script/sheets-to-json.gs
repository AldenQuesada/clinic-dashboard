/**
 * ClinicAI — Google Apps Script
 * Expõe os leads do Quiz (Full Face) como JSON para o dashboard.
 *
 * INSTRUÇÕES:
 *   1. Abra a planilha no Google Sheets
 *   2. Extensões → Apps Script
 *   3. Cole este código, salve (Ctrl+S)
 *   4. Clique em "Implantar" → "Nova implantação"
 *   5. Tipo: "App da Web"
 *   6. Executar como: "Eu mesmo"
 *   7. Quem tem acesso: "Qualquer pessoa"
 *   8. Clique em "Implantar" e copie a URL gerada
 *   9. Cole essa URL nas Configurações do dashboard (Integração > Planilha Full Face)
 */

// Índices das colunas na planilha (base 0)
var COL = {
  nome:                    0,
  por_que_lifting:         1,
  antes_de_avancar:        2,
  apresentacao_avaliacao:  3,
  resultados:              4,
  telefone:                5,
  procedimentos_anteriores:6,
  investimento_1:          7,
  utm_content:             8,
  utm_term:                9,
  correct_answers:         10,
  max_score:               11,
  quiz_score:              12,
  total_scorable:          13,
  investimento_2:          14,
  queixa_principal:        15,
  submitted_at:            16,
}

function doGet(e) {
  try {
    var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheets()[0]
    var data  = sheet.getDataRange().getValues()

    if (data.length < 2) {
      return _json({ ok: true, leads: [], total: 0 })
    }

    // Linhas de dados (ignora cabeçalho)
    var rows = data.slice(1)

    var leads = []

    rows.forEach(function (row, i) {
      var nome     = String(row[COL.nome]     || '').trim()
      var telefone = String(row[COL.telefone] || '').trim().replace(/\D/g, '')

      // Ignora linhas sem nome ou telefone
      if (!nome || !telefone) return

      // Deduplica por telefone (mantém a entrada mais recente — planilha deve estar em ordem cronológica)
      var jaExiste = leads.find(function(l) { return l.phone === telefone })
      if (jaExiste) return

      var submittedAt = row[COL.submitted_at]
      var createdAt   = ''
      if (submittedAt) {
        try { createdAt = new Date(submittedAt).toISOString() } catch(e) {}
      }

      var investimento = String(row[COL.investimento_2] || row[COL.investimento_1] || '').trim()
      var quizScore    = parseInt(row[COL.quiz_score] || '0', 10) || 0

      leads.push({
        name:       nome,
        phone:      telefone,
        source:     'quiz_fullface',
        temperature: _calcTemperature(quizScore, investimento),
        phase:      'captacao',
        leadScore:  quizScore,
        created_at: createdAt || new Date().toISOString(),
        customFields: {
          procedimentosAnteriores: String(row[COL.procedimentos_anteriores] || '').trim(),
          investimento:            investimento,
          queixaPrincipal:         String(row[COL.queixa_principal] || '').trim(),
          utmContent:              String(row[COL.utm_content] || '').trim(),
          utmTerm:                 String(row[COL.utm_term] || '').trim(),
          quizScore:               quizScore,
          origem:                  'Planilha Quiz Full Face',
        },
      })
    })

    return _json({ ok: true, leads: leads, total: leads.length })

  } catch (err) {
    return _json({ ok: false, error: err.message, leads: [] })
  }
}

// Calcula temperatura do lead baseada no score e investimento declarado
function _calcTemperature(score, investimento) {
  var inv = investimento.toLowerCase()
  var altoPoder = inv.indexOf('5.000') >= 0 || inv.indexOf('5000') >= 0
               || inv.indexOf('acima') >= 0 || inv.indexOf('mais de') >= 0
               || inv.indexOf('10.000') >= 0 || inv.indexOf('10000') >= 0

  if (altoPoder || score >= 70) return 'hot'
  if (score >= 40)              return 'warm'
  return 'cold'
}

function _json(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON)
}
