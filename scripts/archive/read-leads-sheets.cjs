/**
 * Le as 3 planilhas e mostra um sample de cada uma para entender estrutura
 */
const XLSX = require('xlsx')
const path = require('path')

const FILES = [
  'C:/Users/alden/Downloads/Anti-Curioso _ Dra. Mirian.xlsx',
  'C:/Users/alden/Downloads/Dra. Mirian de Paula _ Novo.xlsx',
  'C:/Users/alden/Downloads/Dra. Mirian _ [A_B].xlsx',
]

for (const file of FILES) {
  console.log('\n' + '='.repeat(80))
  console.log('ARQUIVO:', path.basename(file))
  console.log('='.repeat(80))

  try {
    const wb = XLSX.readFile(file)
    console.log('Sheets:', wb.SheetNames.join(', '))

    for (const sheetName of wb.SheetNames) {
      const sheet = wb.Sheets[sheetName]
      const range = XLSX.utils.decode_range(sheet['!ref'] || 'A1')
      const totalRows = range.e.r - range.s.r + 1
      const rows = XLSX.utils.sheet_to_json(sheet, { defval: null, raw: false })

      console.log('\n--- SHEET:', sheetName, '---')
      console.log('Total linhas:', totalRows, '| linhas com dados:', rows.length)

      if (rows.length > 0) {
        console.log('Colunas:', Object.keys(rows[0]).join(' | '))
        console.log('\nPrimeiras 3 linhas:')
        rows.slice(0, 3).forEach((r, i) => {
          console.log('  [' + (i+1) + ']', JSON.stringify(r))
        })
      } else {
        // Try raw read
        const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null })
        console.log('Linhas raw:', raw.length)
        if (raw.length > 0) {
          console.log('Primeiras 5 linhas raw:')
          raw.slice(0, 5).forEach((r, i) => console.log('  [' + i + ']', JSON.stringify(r)))
        }
      }
    }
  } catch (e) {
    console.log('ERRO:', e.message)
  }
}
