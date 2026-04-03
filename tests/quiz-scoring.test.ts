/**
 * ClinicAI — Quiz Scoring & Temperature Unit Tests
 *
 * Testa a lógica de cálculo de score e classificação de temperatura
 * que roda no quiz-render.js quando o lead finaliza o quiz.
 */
import { describe, it, expect, beforeEach } from 'vitest'

// ── Reproduce scoring logic from quiz-render.js ─────────────────────────────
// Extracted as pure functions for testability

function calcScore(
  questions: Array<{ type: string; options?: Array<{ label: string; score?: number }>; selection?: { mode?: string } }>,
  answers: Record<string, any>
): number {
  let total = 0
  questions.forEach((q, idx) => {
    const key = q.id || String(idx)
    const ans = answers[key] !== undefined ? answers[key] : answers[String(idx)]
    if (ans === undefined || ans === null) return

    if (q.type === 'single_choice' || q.type === 'image_choice') {
      const opt = (q.options || []).find(o => o.label === ans)
      if (opt && typeof opt.score === 'number') total += opt.score
    } else if (q.type === 'multiple_choice') {
      const selected = Array.isArray(ans) ? ans : []
      selected.forEach(label => {
        const o = (q.options || []).find(o => o.label === label)
        if (o && typeof o.score === 'number') total += o.score
      })
    } else if (q.type === 'multi_choice_with_image') {
      const mode = (q.selection || {}).mode || 'single'
      const selLabels = mode === 'multiple' ? (Array.isArray(ans) ? ans : []) : (ans ? [ans] : [])
      selLabels.forEach(label => {
        const o = (q.options || []).find(o => o.label === label)
        if (o && typeof o.score === 'number') total += o.score
      })
    } else if (q.type === 'scale') {
      total += (typeof ans === 'number' ? ans : parseInt(ans, 10)) || 0
    }
  })
  return total
}

function calcTemperature(
  score: number,
  scoring: { hot?: { min?: number }; warm?: { min?: number } }
): string {
  const hot = scoring.hot?.min ?? 8
  const warm = scoring.warm?.min ?? 4
  if (score >= hot) return 'hot'
  if (score >= warm) return 'warm'
  return 'cold'
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('calcScore', () => {
  const questions = [
    {
      id: 'q_1', type: 'single_choice',
      options: [
        { label: 'Sim', score: 3 },
        { label: 'Não', score: 0 },
        { label: 'Talvez', score: 1 },
      ],
    },
    {
      id: 'q_2', type: 'multiple_choice',
      options: [
        { label: 'A', score: 2 },
        { label: 'B', score: 1 },
        { label: 'C', score: 3 },
      ],
    },
    {
      id: 'q_3', type: 'scale',
    },
    {
      id: 'q_4', type: 'text_input',
    },
    {
      id: 'q_5', type: 'image_choice',
      options: [
        { label: 'Foto1', score: 5 },
        { label: 'Foto2', score: 2 },
      ],
    },
    {
      id: 'q_6', type: 'multi_choice_with_image',
      selection: { mode: 'multiple' },
      options: [
        { label: 'X', score: 1 },
        { label: 'Y', score: 2 },
        { label: 'Z', score: 3 },
      ],
    },
  ]

  it('soma score de single_choice corretamente', () => {
    expect(calcScore(questions, { q_1: 'Sim' })).toBe(3)
    expect(calcScore(questions, { q_1: 'Não' })).toBe(0)
    expect(calcScore(questions, { q_1: 'Talvez' })).toBe(1)
  })

  it('soma score de multiple_choice (soma todas selecionadas)', () => {
    expect(calcScore(questions, { q_2: ['A', 'C'] })).toBe(5)
    expect(calcScore(questions, { q_2: ['B'] })).toBe(1)
    expect(calcScore(questions, { q_2: [] })).toBe(0)
  })

  it('soma score de scale (valor direto)', () => {
    expect(calcScore(questions, { q_3: 4 })).toBe(4)
    expect(calcScore(questions, { q_3: '3' })).toBe(3)
    expect(calcScore(questions, { q_3: 0 })).toBe(0)
  })

  it('ignora text_input (sem score)', () => {
    expect(calcScore(questions, { q_4: 'qualquer texto' })).toBe(0)
  })

  it('soma score de image_choice', () => {
    expect(calcScore(questions, { q_5: 'Foto1' })).toBe(5)
    expect(calcScore(questions, { q_5: 'Foto2' })).toBe(2)
  })

  it('soma score de multi_choice_with_image (modo multiple)', () => {
    expect(calcScore(questions, { q_6: ['X', 'Z'] })).toBe(4)
    expect(calcScore(questions, { q_6: ['Y'] })).toBe(2)
  })

  it('soma total de múltiplas perguntas', () => {
    const answers = {
      q_1: 'Sim',     // 3
      q_2: ['A', 'B'], // 3
      q_3: 5,          // 5
      q_5: 'Foto1',    // 5
      q_6: ['X', 'Y'], // 3
    }
    expect(calcScore(questions, answers)).toBe(19)
  })

  it('retorna 0 sem respostas', () => {
    expect(calcScore(questions, {})).toBe(0)
  })

  it('ignora respostas com opção inexistente', () => {
    expect(calcScore(questions, { q_1: 'Opção que não existe' })).toBe(0)
  })

  it('funciona com chaves por índice (legacy)', () => {
    expect(calcScore(questions, { '0': 'Sim' })).toBe(3)
    expect(calcScore(questions, { '2': 4 })).toBe(4)
  })

  it('funciona com opções sem score definido', () => {
    const q = [{ id: 'q_x', type: 'single_choice', options: [{ label: 'A' }] }]
    expect(calcScore(q, { q_x: 'A' })).toBe(0)
  })

  it('multi_choice_with_image modo single (string, não array)', () => {
    const q = [{
      id: 'q_s', type: 'multi_choice_with_image',
      selection: { mode: 'single' },
      options: [{ label: 'X', score: 7 }],
    }]
    expect(calcScore(q, { q_s: 'X' })).toBe(7)
  })
})

describe('calcTemperature', () => {
  it('classifica hot quando score >= hot.min', () => {
    expect(calcTemperature(10, { hot: { min: 8 }, warm: { min: 4 } })).toBe('hot')
    expect(calcTemperature(8, { hot: { min: 8 }, warm: { min: 4 } })).toBe('hot')
  })

  it('classifica warm quando score entre warm.min e hot.min', () => {
    expect(calcTemperature(5, { hot: { min: 8 }, warm: { min: 4 } })).toBe('warm')
    expect(calcTemperature(4, { hot: { min: 8 }, warm: { min: 4 } })).toBe('warm')
    expect(calcTemperature(7, { hot: { min: 8 }, warm: { min: 4 } })).toBe('warm')
  })

  it('classifica cold quando score < warm.min', () => {
    expect(calcTemperature(3, { hot: { min: 8 }, warm: { min: 4 } })).toBe('cold')
    expect(calcTemperature(0, { hot: { min: 8 }, warm: { min: 4 } })).toBe('cold')
  })

  it('usa defaults (hot=8, warm=4) quando scoring vazio', () => {
    expect(calcTemperature(10, {})).toBe('hot')
    expect(calcTemperature(5, {})).toBe('warm')
    expect(calcTemperature(2, {})).toBe('cold')
  })

  it('respeita thresholds personalizados', () => {
    expect(calcTemperature(15, { hot: { min: 20 }, warm: { min: 10 } })).toBe('warm')
    expect(calcTemperature(25, { hot: { min: 20 }, warm: { min: 10 } })).toBe('hot')
    expect(calcTemperature(5, { hot: { min: 20 }, warm: { min: 10 } })).toBe('cold')
  })

  it('score negativo é cold', () => {
    expect(calcTemperature(-1, { hot: { min: 8 }, warm: { min: 4 } })).toBe('cold')
  })

  it('score zero é cold com defaults', () => {
    expect(calcTemperature(0, {})).toBe('cold')
  })

  it('score exatamente no limite é inclusivo (>=)', () => {
    expect(calcTemperature(8, { hot: { min: 8 } })).toBe('hot')
    expect(calcTemperature(4, { warm: { min: 4 } })).toBe('warm')
  })
})
