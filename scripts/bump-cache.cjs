/* ============================================================
 * bump-cache.cjs
 *
 * Adiciona cache buster ?v={hash} em todos os scripts e CSS
 * locais (não externos) de lp.html e lp-builder.html.
 * Hash curto baseado em timestamp atual garante que cada deploy
 * força o browser a baixar fresh.
 *
 * Uso: node scripts/bump-cache.cjs
 *
 * Faz parte do deploy workflow · rodar antes de git push.
 * ============================================================ */
const fs = require('fs')
const path = require('path')

var FILES = [
  path.resolve(__dirname, '..', 'lp.html'),
  path.resolve(__dirname, '..', 'lp-builder.html'),
]

// Hash curto baseado em timestamp
var hash = Date.now().toString(36)  // ex: "lz3kf9p"

function bump(file) {
  var content = fs.readFileSync(file, 'utf8')
  var before = content

  // <script src="js/..." ...> (local · sem http/https)
  content = content.replace(
    /<script\s+src="(js\/[^"]+?\.js)(\?v=[^"]*)?"/g,
    '<script src="$1?v=' + hash + '"'
  )
  // <link ... href="css/..." ...> (local)
  content = content.replace(
    /<link([^>]*?)\s+href="(css\/[^"]+?\.css)(\?v=[^"]*)?"/g,
    '<link$1 href="$2?v=' + hash + '"'
  )

  if (content !== before) {
    fs.writeFileSync(file, content)
    console.log('✓ ' + path.basename(file) + ' · v=' + hash)
  } else {
    console.log('· ' + path.basename(file) + ' · nada pra mudar')
  }
}

FILES.forEach(bump)

// Também adiciona/atualiza meta no-cache dentro do <head> pra garantir
// que o próprio HTML não fica cachado
FILES.forEach(function (file) {
  var content = fs.readFileSync(file, 'utf8')
  var before = content
  if (content.indexOf('http-equiv="Cache-Control"') < 0) {
    content = content.replace(
      /<meta charset="UTF-8">/,
      '<meta charset="UTF-8">\n<meta http-equiv="Cache-Control" content="no-cache, no-store, must-revalidate">\n<meta http-equiv="Pragma" content="no-cache">\n<meta http-equiv="Expires" content="0">'
    )
    if (content !== before) {
      fs.writeFileSync(file, content)
      console.log('✓ ' + path.basename(file) + ' · meta no-cache adicionada')
    }
  }
})

console.log('\nCache bump completo · v=' + hash)
