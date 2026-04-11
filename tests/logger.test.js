import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils', 'logger.js'), 'utf8')

let Logger, env
beforeEach(() => {
  // Mock window + localStorage stub para o sandbox
  const localStorage = {
    _data: {},
    getItem(k) { return this._data[k] ?? null },
    setItem(k, v) { this._data[k] = String(v) },
    removeItem(k) { delete this._data[k] },
  }
  env = { window: {}, localStorage }
  // Mock console pra não poluir test output
  const fakeConsole = { debug() {}, info() {}, warn() {}, error() {}, log() {} }
  // eslint-disable-next-line no-new-func
  new Function('window', 'localStorage', 'console', code)(env.window, localStorage, fakeConsole)
  Logger = env.window.Logger
})

describe('Logger — basic API', () => {
  it('expõe debug/info/warn/error/setLevel/dump', () => {
    expect(typeof Logger.debug).toBe('function')
    expect(typeof Logger.info).toBe('function')
    expect(typeof Logger.warn).toBe('function')
    expect(typeof Logger.error).toBe('function')
    expect(typeof Logger.setLevel).toBe('function')
    expect(typeof Logger.dump).toBe('function')
  })
})

describe('Logger — buffer', () => {
  it('acumula entries no buffer', () => {
    Logger.warn('test:1', { x: 1 })
    Logger.warn('test:2', { x: 2 })
    const buf = Logger.dump()
    expect(buf.length).toBeGreaterThanOrEqual(2)
    expect(buf[buf.length - 2].msg).toBe('test:1')
    expect(buf[buf.length - 1].msg).toBe('test:2')
  })

  it('clear() limpa buffer', () => {
    Logger.warn('one')
    Logger.clear()
    expect(Logger.dump()).toEqual([])
  })

  it('cap em 100 entries', () => {
    Logger.clear()
    for (let i = 0; i < 150; i++) Logger.warn('msg-' + i)
    expect(Logger.dump().length).toBe(100)
    // Última entry é a mais recente
    expect(Logger.dump()[99].msg).toBe('msg-149')
  })
})

describe('Logger — níveis', () => {
  it('default level é warn', () => {
    expect(Logger.getLevel()).toBe('warn')
  })

  it('setLevel persiste em localStorage', () => {
    Logger.setLevel('debug')
    expect(Logger.getLevel()).toBe('debug')
    expect(env.localStorage.getItem('clinicai_log_level')).toBe('debug')
  })

  it('setLevel inválido é ignorado', () => {
    Logger.setLevel('warn')
    Logger.setLevel('xyz')
    expect(Logger.getLevel()).toBe('warn')
  })
})

describe('Logger — onError handler', () => {
  it('chama handler quando level=error', () => {
    let captured = null
    Logger.onError((entry) => { captured = entry })
    Logger.error('boom', { stack: 'fake' })
    expect(captured).not.toBeNull()
    expect(captured.level).toBe('error')
    expect(captured.msg).toBe('boom')
  })

  it('handler exception não trava caller', () => {
    Logger.onError(() => { throw new Error('handler bug') })
    expect(() => Logger.error('test')).not.toThrow()
  })
})
