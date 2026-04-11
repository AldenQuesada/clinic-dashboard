import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils', 'feature-flags.js'), 'utf8')

let FF, env
beforeEach(() => {
  const localStorage = {
    _data: {},
    getItem(k) { return this._data[k] ?? null },
    setItem(k, v) { this._data[k] = String(v) },
    removeItem(k) { delete this._data[k] },
  }
  env = { window: {}, localStorage }
  // eslint-disable-next-line no-new-func
  new Function('window', 'localStorage', code)(env.window, localStorage)
  FF = env.window.FeatureFlags
})

describe('FeatureFlags — defaults', () => {
  it('expõe API completa', () => {
    expect(typeof FF.isEnabled).toBe('function')
    expect(typeof FF.enable).toBe('function')
    expect(typeof FF.disable).toBe('function')
    expect(typeof FF.list).toBe('function')
  })

  it('flag default true funciona', () => {
    expect(FF.isEnabled('new_payment_block')).toBe(true)
  })

  it('flag default false funciona', () => {
    expect(FF.isEnabled('audit_trail_ui')).toBe(false)
  })

  it('flag inexistente retorna false', () => {
    expect(FF.isEnabled('flag_que_nao_existe')).toBe(false)
  })
})

describe('FeatureFlags — enable/disable', () => {
  it('enable persiste em localStorage', () => {
    FF.enable('audit_trail_ui')
    expect(FF.isEnabled('audit_trail_ui')).toBe(true)
    expect(env.localStorage.getItem('clinicai_ff_audit_trail_ui')).toBe('1')
  })

  it('disable sobrescreve default true', () => {
    FF.disable('new_payment_block')
    expect(FF.isEnabled('new_payment_block')).toBe(false)
  })

  it('reset volta pro default', () => {
    FF.disable('new_payment_block')
    expect(FF.isEnabled('new_payment_block')).toBe(false)
    FF.reset('new_payment_block')
    expect(FF.isEnabled('new_payment_block')).toBe(true)
  })
})

describe('FeatureFlags — list', () => {
  it('list retorna todas as flags conhecidas', () => {
    const list = FF.list()
    expect(list).toHaveProperty('new_payment_block')
    expect(list).toHaveProperty('cortesia_per_proc')
    expect(list).toHaveProperty('audit_trail_ui')
  })

  it('list reflete overrides', () => {
    FF.disable('cortesia_per_proc')
    const list = FF.list()
    expect(list.cortesia_per_proc).toBe(false)
  })
})
