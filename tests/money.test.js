import { describe, it, expect, beforeAll } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Load money.js in a sandbox (browser-style script, not ESM/CJS)
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const code = fs.readFileSync(path.join(__dirname, '..', 'js', 'utils', 'money.js'), 'utf8')

let Money
beforeAll(() => {
  const env = { module: { exports: {} }, window: {}, globalThis: {} }
  // eslint-disable-next-line no-new-func
  new Function('module', 'window', 'globalThis', code)(env.module, env.window, env.globalThis)
  Money = env.module.exports && Object.keys(env.module.exports).length
    ? env.module.exports
    : (env.window.Money || env.globalThis.Money)
})

describe('Money.toCents / fromCents', () => {
  it('converte float para centavos (int)', () => {
    expect(Money.toCents(10.50)).toBe(1050)
    expect(Money.toCents(0.01)).toBe(1)
    expect(Money.toCents(999.99)).toBe(99999)
  })
  it('trata null, undefined, string vazia como 0', () => {
    expect(Money.toCents(null)).toBe(0)
    expect(Money.toCents(undefined)).toBe(0)
    expect(Money.toCents('')).toBe(0)
  })
  it('converte de centavos para float', () => {
    expect(Money.fromCents(1050)).toBe(10.5)
    expect(Money.fromCents(99999)).toBe(999.99)
  })
  it('lida com aritmética clássica de float (0.1 + 0.2)', () => {
    expect(Money.eq(0.1 + 0.2, 0.3)).toBe(true)
  })
})

describe('Money.sum / sumEq', () => {
  it('soma array sem drift', () => {
    expect(Money.sum([0.1, 0.2, 0.3])).toBe(0.6)
    expect(Money.sum([1.11, 2.22, 3.33])).toBe(6.66)
  })
  it('sumEq detecta soma igual ao total esperado', () => {
    expect(Money.sumEq([100, 200, 300], 600)).toBe(true)
    expect(Money.sumEq([100, 200, 300], 599.99)).toBe(false)
    expect(Money.sumEq([0.1, 0.2], 0.3)).toBe(true)
  })
  it('ignora array vazio', () => {
    expect(Money.sum([])).toBe(0)
    expect(Money.sumEq([], 0)).toBe(true)
  })
})

describe('Money.add / sub', () => {
  it('add soma n argumentos', () => {
    expect(Money.add(0.1, 0.2, 0.3)).toBe(0.6)
    expect(Money.add(100, 50, 25)).toBe(175)
  })
  it('sub subtrai b de a', () => {
    expect(Money.sub(100, 30)).toBe(70)
    expect(Money.sub(0.3, 0.1)).toBe(0.2)
  })
})

describe('Money.div', () => {
  it('divide valor em parcelas arredondando', () => {
    expect(Money.div(300, 3)).toBe(100)
    expect(Money.div(100, 3)).toBe(33.33)
    expect(Money.div(1, 0)).toBe(1)
  })
})

describe('Money.parse (formato BR)', () => {
  it('aceita 1.234,56', () => { expect(Money.parse('1.234,56')).toBe(1234.56) })
  it('aceita 1234,56', () => { expect(Money.parse('1234,56')).toBe(1234.56) })
  it('aceita 1234.56', () => { expect(Money.parse('1234.56')).toBe(1234.56) })
  it('aceita R$ 500,00', () => { expect(Money.parse('R$ 500,00')).toBe(500) })
  it('trata lixo', () => {
    expect(Money.parse('')).toBe(0)
    expect(Money.parse('abc')).toBe(0)
    expect(Money.parse(null)).toBe(0)
  })
})

describe('Money.format', () => {
  it('formata com R$ por padrão', () => {
    expect(Money.format(1234.56)).toBe('R$ 1.234,56')
    expect(Money.format(0)).toBe('R$ 0,00')
  })
  it('sem símbolo quando withSymbol=false', () => {
    expect(Money.format(1234.56, false)).toBe('1.234,56')
  })
})

describe('Money.isZero / clamp', () => {
  it('isZero considera valores minúsculos', () => {
    expect(Money.isZero(0)).toBe(true)
    expect(Money.isZero(0.001)).toBe(true)
    expect(Money.isZero(0.01)).toBe(false)
  })
  it('clamp respeita min/max', () => {
    expect(Money.clamp(5, 10, 100)).toBe(10)
    expect(Money.clamp(150, 10, 100)).toBe(100)
    expect(Money.clamp(50, 10, 100)).toBe(50)
  })
})

// ═════ Lógica financeira do agendamento ═════
describe('_apptValorTotalPagar logic', () => {
  function apptValorTotalPagar(tipo, pagaValor, procs, descontoVal) {
    if (tipo === 'procedimento') {
      const subtotal = procs.reduce((s, p) => s + (p.cortesia ? 0 : (parseFloat(p.valor) || 0)), 0)
      return Math.max(0, Money.sub(subtotal, descontoVal || 0))
    }
    return parseFloat(pagaValor) || 0
  }

  it('consulta paga retorna valor direto', () => {
    expect(apptValorTotalPagar('avaliacao', 300, [], 0)).toBe(300)
  })
  it('procedimento soma procs não-cortesia', () => {
    const procs = [
      { valor: 500, cortesia: false },
      { valor: 200, cortesia: true },
      { valor: 300, cortesia: false },
    ]
    expect(apptValorTotalPagar('procedimento', 0, procs, 0)).toBe(800)
  })
  it('todos cortesia → total zero', () => {
    const procs = [
      { valor: 500, cortesia: true },
      { valor: 300, cortesia: true },
    ]
    expect(apptValorTotalPagar('procedimento', 0, procs, 0)).toBe(0)
  })
  it('procedimento com desconto', () => {
    const procs = [{ valor: 1000, cortesia: false }]
    expect(apptValorTotalPagar('procedimento', 0, procs, 100)).toBe(900)
  })
  it('desconto não pode gerar valor negativo', () => {
    const procs = [{ valor: 100, cortesia: false }]
    expect(apptValorTotalPagar('procedimento', 0, procs, 200)).toBe(0)
  })
})

describe('statusPagamento derivation', () => {
  function deriveStatus(pagamentos) {
    if (!pagamentos || !pagamentos.length) return 'pendente'
    const pagos = pagamentos.filter(p => p.status === 'pago').length
    if (pagos === 0) return 'aberto'
    if (pagos === pagamentos.length) return 'pago'
    return 'parcial'
  }

  it('sem pagamentos → pendente', () => {
    expect(deriveStatus([])).toBe('pendente')
    expect(deriveStatus(null)).toBe('pendente')
  })
  it('todos abertos → aberto', () => {
    expect(deriveStatus([{ status: 'aberto' }, { status: 'aberto' }])).toBe('aberto')
  })
  it('todos pagos → pago', () => {
    expect(deriveStatus([{ status: 'pago' }, { status: 'pago' }])).toBe('pago')
  })
  it('misto → parcial', () => {
    expect(deriveStatus([{ status: 'pago' }, { status: 'aberto' }])).toBe('parcial')
  })
})

describe('_finConsultaAberta logic', () => {
  function finConsultaAberta(appt) {
    if (!appt) return 0
    if (appt.tipoConsulta !== 'avaliacao' || appt.tipoAvaliacao !== 'paga') return 0
    const pagamentos = Array.isArray(appt.pagamentos) ? appt.pagamentos : []
    if (pagamentos.length === 0) {
      return (appt.statusPagamento === 'pago') ? 0 : (parseFloat(appt.valor) || 0)
    }
    return pagamentos
      .filter(p => p.status !== 'pago')
      .reduce((s, p) => s + (parseFloat(p.valor) || 0), 0)
  }

  it('não é consulta paga → zero', () => {
    expect(finConsultaAberta({ tipoConsulta: 'procedimento' })).toBe(0)
    expect(finConsultaAberta({ tipoConsulta: 'avaliacao', tipoAvaliacao: 'cortesia' })).toBe(0)
  })
  it('consulta paga sem pagamentos + status pago → zero', () => {
    expect(finConsultaAberta({
      tipoConsulta: 'avaliacao', tipoAvaliacao: 'paga',
      valor: 300, statusPagamento: 'pago'
    })).toBe(0)
  })
  it('consulta paga sem pagamentos + status pendente → valor total', () => {
    expect(finConsultaAberta({
      tipoConsulta: 'avaliacao', tipoAvaliacao: 'paga',
      valor: 300, statusPagamento: 'pendente'
    })).toBe(300)
  })
  it('consulta com pagamentos parciais → soma só dos abertos', () => {
    expect(finConsultaAberta({
      tipoConsulta: 'avaliacao', tipoAvaliacao: 'paga',
      valor: 500,
      pagamentos: [
        { valor: 200, status: 'pago' },
        { valor: 300, status: 'aberto' },
      ]
    })).toBe(300)
  })
})
