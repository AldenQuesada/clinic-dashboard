const fs = require('fs')
const path = require('path')
const crypto = require('crypto')

const ROOT = path.join(__dirname, '..')
const INDEX = path.join(ROOT, 'index.html')

function hashFile(filePath) {
  try {
    const content = fs.readFileSync(filePath)
    return crypto.createHash('md5').update(content).digest('hex').slice(0, 8)
  } catch { return Date.now().toString(36) }
}

let html = fs.readFileSync(INDEX, 'utf8')
let count = 0

html = html.replace(/<(script|link)\s+[^>]*(?:src|href)="([^"?]+)(?:\?v=[^"]*)?"/g, function (match, tag, filePath) {
  const abs = path.join(ROOT, filePath)
  if (!fs.existsSync(abs)) return match
  const hash = hashFile(abs)
  count++
  return match.replace(/(?:src|href)="[^"]*"/, (tag === 'script' ? 'src' : 'href') + '="' + filePath + '?v=' + hash + '"')
})

fs.writeFileSync(INDEX, html)
console.log('Cache-busted ' + count + ' assets in index.html')
