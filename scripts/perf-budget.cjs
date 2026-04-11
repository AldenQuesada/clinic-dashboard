/**
 * ClinicAI — Performance Budget Audit
 *
 * Lê index.html, extrai todos os <script src="js/...">
 * e mede o tamanho de cada arquivo.
 *
 * Reporta:
 *  - top 10 maiores
 *  - tamanho total carregado no boot
 *  - flags amarelas (>50KB) e vermelhas (>150KB)
 *
 * Uso:
 *   node scripts/perf-budget.cjs
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.join(__dirname, '..')
const INDEX = path.join(ROOT, 'index.html')

const YELLOW_KB = 50
const RED_KB = 150

function colorize(text, code) { return '\x1b[' + code + 'm' + text + '\x1b[0m' }
const RED = 31, GREEN = 32, YELLOW = 33, GRAY = 90, BOLD = 1, CYAN = 36

function fmtSize(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / 1024 / 1024).toFixed(2) + ' MB'
  if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return bytes + ' B'
}

function colorBySize(bytes) {
  var kb = bytes / 1024
  if (kb >= RED_KB) return RED
  if (kb >= YELLOW_KB) return YELLOW
  return GREEN
}

function main() {
  if (!fs.existsSync(INDEX)) {
    console.error('index.html não encontrado em', INDEX)
    process.exit(1)
  }

  const html = fs.readFileSync(INDEX, 'utf8')
  const re = /<script\s+src="(js\/[^"?]+)(?:\?[^"]*)?"\s*(?:defer|async)?\s*>/g
  const scripts = []
  let m
  while ((m = re.exec(html)) !== null) {
    const rel = m[1]
    const abs = path.join(ROOT, rel)
    if (!fs.existsSync(abs)) continue
    const stats = fs.statSync(abs)
    scripts.push({ path: rel, bytes: stats.size })
  }

  if (!scripts.length) {
    console.error('Nenhum <script src="js/..."> encontrado em index.html')
    process.exit(1)
  }

  const total = scripts.reduce(function (s, x) { return s + x.bytes }, 0)
  scripts.sort(function (a, b) { return b.bytes - a.bytes })

  console.log(colorize('Performance Budget Audit — ' + new Date().toISOString(), BOLD))
  console.log('Index: ' + INDEX)
  console.log()
  console.log(colorize('Total scripts: ', GRAY) + scripts.length)
  console.log(colorize('Total size:    ', GRAY) + colorize(fmtSize(total), colorBySize(total)))
  console.log()
  console.log(colorize('Top 15 maiores:', BOLD))
  console.log(colorize('  ' + 'Tamanho'.padEnd(12) + 'Arquivo', GRAY))
  console.log(colorize('  ' + '─'.repeat(60), GRAY))
  scripts.slice(0, 15).forEach(function (s) {
    var size = fmtSize(s.bytes).padEnd(12)
    console.log('  ' + colorize(size, colorBySize(s.bytes)) + s.path)
  })

  // Análise por categoria
  const byCategory = {}
  scripts.forEach(function (s) {
    const parts = s.path.split('/')
    const cat = parts.length > 2 ? parts[1] : 'root'
    if (!byCategory[cat]) byCategory[cat] = { count: 0, bytes: 0 }
    byCategory[cat].count++
    byCategory[cat].bytes += s.bytes
  })

  console.log()
  console.log(colorize('Por categoria (subpasta):', BOLD))
  Object.keys(byCategory)
    .sort(function (a, b) { return byCategory[b].bytes - byCategory[a].bytes })
    .forEach(function (cat) {
      var info = byCategory[cat]
      var pct = ((info.bytes / total) * 100).toFixed(1)
      console.log('  ' + (cat + '/').padEnd(20) + fmtSize(info.bytes).padEnd(12) + colorize('(' + pct + '%)', GRAY) + colorize(' [' + info.count + ' files]', GRAY))
    })

  // Flags
  const yellow = scripts.filter(function (s) { return s.bytes / 1024 >= YELLOW_KB && s.bytes / 1024 < RED_KB })
  const red = scripts.filter(function (s) { return s.bytes / 1024 >= RED_KB })
  console.log()
  console.log(colorize('Status:', BOLD))
  console.log(colorize('  ✓ ', GREEN) + (scripts.length - yellow.length - red.length) + ' arquivos OK (<' + YELLOW_KB + ' KB)')
  if (yellow.length) console.log(colorize('  ⚠ ', YELLOW) + yellow.length + ' arquivos AMARELO (>' + YELLOW_KB + ' KB)')
  if (red.length) console.log(colorize('  ✗ ', RED) + red.length + ' arquivos VERMELHO (>' + RED_KB + ' KB) — candidatos a split/lazy load')

  console.log()
}

main()
