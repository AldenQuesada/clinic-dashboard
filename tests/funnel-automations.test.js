import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..', 'js', 'ui', 'funnel-automations')

function loadBrowserScript(filePath, win) {
  const code = fs.readFileSync(filePath, 'utf8')
  new Function('window', 'globalThis', code)(win, win)
}

let win
beforeAll(() => {
  win = { location: { origin: 'http://localhost' }, localStorage: { getItem: () => null, setItem: () => {} } }
  loadBrowserScript(path.join(ROOT, 'shared.js'), win)
  ;['pre_agendamento', 'agendamento', 'paciente', 'orcamento', 'paciente_orcamento', 'perdido'].forEach(m => {
    loadBrowserScript(path.join(ROOT, 'modules', `${m}.module.js`), win)
  })
})

describe('AAShared.validatePlaceholders', () => {
  it('reconhece placeholders validos', () => {
    expect(win.AAShared.validatePlaceholders('Oi {{nome}}, sua consulta e {{data}} {{hora}}')).toEqual([])
  })
  it('detecta placeholder invalido', () => {
    const bad = win.AAShared.validatePlaceholders('Oi {{xyz}} em {{data}}')
    expect(bad).toContain('xyz')
    expect(bad).not.toContain('data')
  })
  it('aceita espacos dentro das chaves', () => {
    expect(win.AAShared.validatePlaceholders('Oi {{ nome }}')).toEqual([])
  })
  it('validatePlaceholdersInForm agrega multiplos campos', () => {
    const bad = win.AAShared.validatePlaceholdersInForm({
      content_template: 'Ola {{nome}} em {{ruim1}}',
      alert_title: 'Titulo {{ruim2}}',
    })
    expect(bad.sort()).toEqual(['ruim1', 'ruim2'])
  })
})

describe('AAShared.renderTemplate', () => {
  it('substitui vars presentes e limpa ausentes', () => {
    const out = win.AAShared.renderTemplate('{{nome}} {{xyz}}', { nome: 'Ana' })
    expect(out).toBe('Ana ')
  })
})

describe('AAShared.channelIncludes', () => {
  it('canal combinado inclui ambos', () => {
    expect(win.AAShared.channelIncludes('whatsapp_alert', 'whatsapp')).toBe(true)
    expect(win.AAShared.channelIncludes('whatsapp_alert', 'alert')).toBe(true)
    expect(win.AAShared.channelIncludes('whatsapp_alert', 'task')).toBe(false)
  })
  it('all inclui qualquer canal', () => {
    expect(win.AAShared.channelIncludes('all', 'alexa')).toBe(true)
  })
})

describe('Modulos — contrato padrao', () => {
  const mods = ['pre_agendamento', 'agendamento', 'paciente', 'orcamento', 'paciente_orcamento', 'perdido']
  it.each(mods)('%s exporta contrato completo', id => {
    const m = win.FAModules[id]
    expect(m).toBeDefined()
    expect(m.id).toBe(id)
    expect(typeof m.matchesRule).toBe('function')
    expect(typeof m.toTrigger).toBe('function')
    expect(typeof m.fromRule).toBe('function')
    expect(typeof m.validate).toBe('function')
    expect(typeof m.renderTriggerFields).toBe('function')
    expect(typeof m.readTriggerForm).toBe('function')
    expect(typeof m.applyStatusDefaults).toBe('function')
    expect(typeof m.isValidCombination).toBe('function')
    expect(Array.isArray(m.statuses)).toBe(true)
    expect(m.statuses.length).toBeGreaterThan(0)
  })
})

describe('Modulo agendamento — regras de negocio', () => {
  let m
  beforeAll(() => { m = win.FAModules.agendamento })

  it('validate exige status e when', () => {
    expect(m.validate({}).ok).toBe(false)
    expect(m.validate({ status: 'agendado' }).ok).toBe(false)
    expect(m.validate({ status: 'agendado', when: 'immediate' }).ok).toBe(true)
  })
  it('isValidCombination bloqueia em_consulta com days_before', () => {
    expect(m.isValidCombination('em_consulta', 'days_before')).toBe(false)
    expect(m.isValidCombination('em_consulta', 'immediate')).toBe(true)
  })
  it('toTrigger/fromRule sao inversos para days_before', () => {
    const form = { status: 'agendado', when: 'days_before', days: 1, hour: 10, minute: 0 }
    const trig = m.toTrigger(form)
    expect(trig.trigger_type).toBe('d_before')
    const back = m.fromRule({ trigger_type: 'd_before', trigger_config: trig.trigger_config })
    expect(back.when).toBe('days_before')
    expect(back.days).toBe(1)
  })
  it('applyStatusDefaults preserva when valido, senao aplica default', () => {
    const def = m.applyStatusDefaults({ when: 'days_before', days: 2, hour: 9 }, 'aguardando_confirmacao')
    expect(def.when).toBe('days_before')
    expect(def.days).toBe(2)
    const forced = m.applyStatusDefaults({ when: 'days_before' }, 'em_consulta')
    expect(forced.when).not.toBe('days_before')
  })
})

describe('Modulo orcamento — slugs e grupos', () => {
  it('matchesRule reconhece tag de orcamento', () => {
    const m = win.FAModules.orcamento
    expect(m.matchesRule({ trigger_type: 'on_tag', trigger_config: { tag: 'em_negociacao' } })).toBe(true)
    expect(m.matchesRule({ trigger_type: 'on_tag', trigger_config: { tag: 'perdido' } })).toBe(false)
  })
  it('groupRule categoriza por sort_order', () => {
    const m = win.FAModules.orcamento
    expect(m.groupRule({ sort_order: 10 })).toBe('novo')
    expect(m.groupRule({ sort_order: 60 })).toBe('negociacao')
    expect(m.groupRule({ sort_order: 100 })).toBe('fechamento')
  })
})

describe('Modulo perdido — isolamento', () => {
  it('nao reconhece tags de outros modulos', () => {
    const m = win.FAModules.perdido
    expect(m.matchesRule({ trigger_type: 'on_tag', trigger_config: { tag: 'perdido' } })).toBe(true)
    expect(m.matchesRule({ trigger_type: 'on_tag', trigger_config: { tag: 'em_negociacao' } })).toBe(false)
    expect(m.matchesRule({ trigger_type: 'on_tag', trigger_config: { tag: 'orcamento_fechado' } })).toBe(false)
  })
})
