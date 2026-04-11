import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils', 'html.js'), 'utf8')

let html
beforeAll(() => {
  const env = { module: { exports: {} }, window: {}, globalThis: {} }
  // eslint-disable-next-line no-new-func
  new Function('module', 'window', 'globalThis', code)(env.module, env.window, env.globalThis)
  html = env.module.exports && typeof env.module.exports === 'function'
    ? env.module.exports
    : (env.window.html || env.globalThis.html)
})

describe('html template tag — escape default', () => {
  it('escapa < > & " \' em valores interpolados', () => {
    const name = '<script>alert("xss")</script>'
    const result = html`<div>${name}</div>`
    expect(result).toBe('<div>&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;</div>')
  })
  it('não escapa literais estáticos da template string', () => {
    const x = 'ok'
    const result = html`<div class="safe">${x}</div>`
    expect(result).toBe('<div class="safe">ok</div>')
  })
  it('trata null e undefined como string vazia', () => {
    expect(html`<b>${null}</b>`).toBe('<b></b>')
    expect(html`<b>${undefined}</b>`).toBe('<b></b>')
  })
  it('converte números e booleanos', () => {
    expect(html`<b>${42}</b>`).toBe('<b>42</b>')
    expect(html`<b>${true}</b>`).toBe('<b>true</b>')
  })
})

describe('html.raw — opt-out explícito', () => {
  it('mantém HTML bruto quando marcado como raw', () => {
    const trusted = '<b>bold</b>'
    const result = html`<div>${html.raw(trusted)}</div>`
    expect(result).toBe('<div><b>bold</b></div>')
  })
  it('raw não afeta outros valores', () => {
    const safe = html.raw('<span>x</span>')
    const unsafe = '<script>y</script>'
    const result = html`${safe}-${unsafe}`
    expect(result).toBe('<span>x</span>-&lt;script&gt;y&lt;/script&gt;')
  })
})

describe('html com arrays', () => {
  it('concatena array de strings escapadas', () => {
    const items = ['a', '<b>', 'c']
    const result = html`<ul>${items}</ul>`
    expect(result).toBe('<ul>a&lt;b&gt;c</ul>')
  })
})

describe('html.escape / html.attr helpers', () => {
  it('escape como função pura', () => {
    expect(html.escape('<a>')).toBe('&lt;a&gt;')
    expect(html.escape(null)).toBe('')
  })
  it('attr escapa aspas', () => {
    expect(html.attr('a"b')).toBe('a&quot;b')
  })
})
