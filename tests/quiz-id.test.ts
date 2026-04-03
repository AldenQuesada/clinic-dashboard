/**
 * ClinicAI — Quiz ID Utilities Unit Tests
 *
 * Testa o módulo quiz-id.js: geração de IDs, migração de respostas,
 * resolução de answers por ID/índice, e mapForDisplay.
 */
import { describe, it, expect, beforeEach } from 'vitest'

// ── Load the module once (sets window.QuizId) ───────────────────────────────
import '../js/utils/quiz-id.js'

function QI() { return (window as any).QuizId }

describe('QuizId.generateId', () => {
  it('gera string com prefixo q_', () => {
    const id = QI().generateId()
    expect(id).toMatch(/^q_/)
    expect(id.length).toBeGreaterThan(5)
  })

  it('gera IDs únicos', () => {
    const ids = new Set()
    for (let i = 0; i < 100; i++) ids.add(QI().generateId())
    expect(ids.size).toBe(100)
  })
})

describe('QuizId.ensureIds', () => {
  it('adiciona ID em perguntas sem ID', () => {
    const questions = [
      { title: 'P1', type: 'text_input' },
      { title: 'P2', type: 'single_choice' },
    ]
    const changed = QI().ensureIds(questions)
    expect(changed).toBe(true)
    expect(questions[0].id).toMatch(/^q_/)
    expect(questions[1].id).toMatch(/^q_/)
    expect(questions[0].id).not.toBe(questions[1].id)
  })

  it('não modifica perguntas que já têm ID', () => {
    const questions = [
      { id: 'q_existing', title: 'P1' },
    ]
    const changed = QI().ensureIds(questions)
    expect(changed).toBe(false)
    expect(questions[0].id).toBe('q_existing')
  })

  it('retorna false para array vazio', () => {
    expect(QI().ensureIds([])).toBe(false)
  })

  it('retorna false para input inválido', () => {
    expect(QI().ensureIds(null)).toBe(false)
    expect(QI().ensureIds(undefined)).toBe(false)
  })
})

describe('QuizId.getAnswer', () => {
  it('busca por ID primeiro', () => {
    const answers = { q_abc: 'valor_id', '0': 'valor_idx' }
    const question = { id: 'q_abc', title: 'P1' }
    expect(QI().getAnswer(answers, question, 0)).toBe('valor_id')
  })

  it('fallback para índice quando ID não encontrado', () => {
    const answers = { '0': 'valor_idx' }
    const question = { id: 'q_xyz', title: 'P1' }
    expect(QI().getAnswer(answers, question, 0)).toBe('valor_idx')
  })

  it('retorna undefined quando nada encontrado', () => {
    const answers = { '5': 'outro' }
    const question = { id: 'q_abc', title: 'P1' }
    expect(QI().getAnswer(answers, question, 0)).toBeUndefined()
  })

  it('funciona com pergunta sem ID', () => {
    const answers = { '2': 'valor' }
    const question = { title: 'P3' }
    expect(QI().getAnswer(answers, question, 2)).toBe('valor')
  })
})

describe('QuizId.setAnswer', () => {
  it('grava usando ID da pergunta', () => {
    const answers: Record<string, any> = {}
    QI().setAnswer(answers, { id: 'q_abc' }, 0, 'minha resposta')
    expect(answers.q_abc).toBe('minha resposta')
    expect(answers['0']).toBeUndefined()
  })

  it('fallback para índice se pergunta sem ID', () => {
    const answers: Record<string, any> = {}
    QI().setAnswer(answers, { title: 'P1' }, 3, 'resposta')
    expect(answers['3']).toBe('resposta')
  })
})

describe('QuizId.mapForDisplay', () => {
  const questions = [
    { id: 'q_a', title: 'Pergunta A', type: 'single_choice', options: [{ label: 'Sim', score: 3 }, { label: 'Não', score: 0 }] },
    { id: 'q_b', title: 'Pergunta B', type: 'text_input', options: [] },
    { id: 'q_c', title: 'Pergunta C', type: 'scale', options: [] },
  ]

  it('mapeia respostas por ID corretamente', () => {
    const answers = { q_a: 'Sim', q_b: 'Texto livre', q_c: 4 }
    const items = QI().mapForDisplay(answers, questions)
    expect(items).toHaveLength(3)
    expect(items[0].questionTitle).toBe('Pergunta A')
    expect(items[0].answer).toBe('Sim')
    expect(items[0].score).toBe(3)
    expect(items[1].answer).toBe('Texto livre')
    expect(items[2].answer).toBe(4)
  })

  it('mapeia respostas por índice (legacy)', () => {
    const answers = { '0': 'Não', '2': 5 }
    const items = QI().mapForDisplay(answers, questions)
    expect(items.length).toBeGreaterThanOrEqual(2)
    const a0 = items.find(i => i.questionTitle === 'Pergunta A')
    expect(a0?.answer).toBe('Não')
    expect(a0?.score).toBe(0)
  })

  it('mostra "Pergunta removida" para chaves órfãs', () => {
    const answers = { q_a: 'Sim', q_deleted: 'valor antigo' }
    const items = QI().mapForDisplay(answers, questions)
    const orphan = items.find(i => i.questionId === 'q_deleted')
    expect(orphan).toBeTruthy()
    expect(orphan?.questionTitle).toContain('removida')
    expect(orphan?.answer).toBe('valor antigo')
  })

  it('retorna array vazio para input inválido', () => {
    expect(QI().mapForDisplay(null, questions)).toEqual([])
    expect(QI().mapForDisplay({}, null)).toEqual([])
  })
})

describe('QuizId.migrateAnswers', () => {
  const questions = [
    { id: 'q_a', title: 'P1' },
    { id: 'q_b', title: 'P2' },
  ]

  it('converte chaves por índice para ID', () => {
    const answers = { '0': 'valor1', '1': 'valor2' }
    const migrated = QI().migrateAnswers(answers, questions)
    expect(migrated.q_a).toBe('valor1')
    expect(migrated.q_b).toBe('valor2')
  })

  it('preserva chaves que já são ID', () => {
    const answers = { q_a: 'valor_existente' }
    const migrated = QI().migrateAnswers(answers, questions)
    expect(migrated.q_a).toBe('valor_existente')
  })

  it('mantém chaves que não mapeiam para nenhuma pergunta', () => {
    const answers = { '99': 'perdido' }
    const migrated = QI().migrateAnswers(answers, questions)
    expect(migrated['99']).toBe('perdido')
  })
})
