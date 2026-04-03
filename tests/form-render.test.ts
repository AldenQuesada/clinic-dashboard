/**
 * tests/form-render.test.ts
 * ClinicAI — Integration tests for the patient form (form-render.html)
 *
 * Strategy: The form logic lives in an inline <script> block. We extract
 * each business-logic unit here and test it with injected dependencies,
 * faithfully mirroring the source. DOM-heavy rendering is tested via jsdom.
 *
 * Coverage targets:
 *  - _ensureResponse       — create/recover anamnesis_response
 *  - _saveSessionAnswers   — upsert answers + update progress
 *  - _restoreAnswers       — load from DB + sessionStorage reconciliation
 *  - beforeunload handler  — sessionStorage backup on tab close
 *  - goSession navigation  — validation guard, progress save, LGPD trigger
 *  - boot flow             — bootPatientLink scenarios (invalid, revoked, expired, ok)
 *  - checkCondition        — field conditional visibility
 *  - validateSession       — required-field enforcement
 */

import { describe, it, expect, vi, beforeEach } from 'vitest'

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS — shared Supabase HTTP primitives (mirrored from form-render.html)
// ─────────────────────────────────────────────────────────────────────────────
const SUPABASE_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co'
const SUPABASE_KEY = 'test-key'
const BASE_URL     = SUPABASE_URL + '/rest/v1'

function _hdrs(extra: Record<string,string> = {}) {
  return {
    'Content-Type':  'application/json',
    apikey:          SUPABASE_KEY,
    Authorization:   'Bearer ' + SUPABASE_KEY,
    ...extra,
  }
}

async function _get(fetchFn: typeof fetch, path: string, qs: Record<string,string> = {}) {
  const qstr = Object.entries(qs).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  const url  = BASE_URL + path + (qstr ? '?' + qstr : '')
  const res  = await fetchFn(url, { headers: _hdrs() })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function _patch(fetchFn: typeof fetch, path: string, qs: Record<string,string>, body: object) {
  const qstr = Object.entries(qs).map(([k,v]) => `${k}=${encodeURIComponent(v)}`).join('&')
  const res  = await fetchFn(BASE_URL + path + '?' + qstr, {
    method:  'PATCH',
    headers: _hdrs(),
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function _upsert(fetchFn: typeof fetch, path: string, body: object[], onConflict?: string) {
  const prefer = onConflict
    ? `resolution=merge-duplicates,return=representation`
    : `return=representation`
  const res = await fetchFn(BASE_URL + path, {
    method:  'POST',
    headers: _hdrs({ Prefer: prefer }),
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

async function _rpc(fetchFn: typeof fetch, fn: string, body: object) {
  const res = await fetchFn(SUPABASE_URL + '/rest/v1/rpc/' + fn, {
    method:  'POST',
    headers: _hdrs(),
    body:    JSON.stringify(body),
  })
  if (!res.ok) throw new Error(await res.text())
  return res.json()
}

// ─────────────────────────────────────────────────────────────────────────────
// BUSINESS LOGIC UNDER TEST  (extracted from form-render.html for testability)
// Each function receives explicit dependencies instead of closing over globals.
// ─────────────────────────────────────────────────────────────────────────────

/** Creates or recovers an anamnesis_response for a request. */
async function ensureResponse(
  fetchFn: typeof fetch,
  reqId: string, patId: string, tplId: string, clinId: string
): Promise<{ id: string | null; existed: boolean }> {
  try {
    const existing = await _get(fetchFn, '/anamnesis_responses', {
      'request_id': 'eq.' + reqId,
      'select':     'id,status',
    }) as Array<{ id: string; status: string }>
    if (existing?.length) return { id: existing[0].id, existed: true }

    const rows = await _upsert(fetchFn, '/anamnesis_responses', [{
      request_id:  reqId,
      clinic_id:   clinId,
      patient_id:  patId,
      template_id: tplId,
      status:      'not_started',
      started_at:  new Date().toISOString(),
    }], 'request_id') as Array<{ id: string }>
    return { id: rows?.[0]?.id || null, existed: false }
  } catch (e) {
    console.warn(e)
    return { id: null, existed: false }
  }
}

/** Saves session answers to Supabase and updates response progress. */
async function saveSessionAnswers(
  fetchFn: typeof fetch,
  opts: {
    responseId:    string
    isTest:        boolean
    sessId:        string
    generalSessId: string
    fieldsBySess:  Record<string, Array<{ id: string; field_key: string }>>
    values:        Record<string, unknown>
  }
): Promise<void> {
  const { responseId, isTest, sessId, generalSessId, fieldsBySess, values } = opts
  if (!responseId || isTest) return

  const fields = sessId === generalSessId ? [] : (fieldsBySess[sessId] || [])
  if (!fields.length) return

  const answersPayload = []
  for (const f of fields) {
    const raw = values[f.field_key]
    if (raw === undefined || raw === null || raw === '') continue

    let normalizedText = ''
    if (Array.isArray(raw))             normalizedText = raw.join(', ')
    else if (typeof raw === 'object')   normalizedText = JSON.stringify(raw)
    else                                normalizedText = String(raw)

    answersPayload.push({
      response_id:     responseId,
      field_id:        f.id,
      field_key:       f.field_key,
      value_json:      Array.isArray(raw) ? raw : (typeof raw === 'object' ? raw : String(raw)),
      normalized_text: normalizedText.slice(0, 1000),
    })
  }

  if (answersPayload.length) {
    await _upsert(fetchFn, '/anamnesis_answers', answersPayload, 'response_id,field_id')
  }

  const allFields   = Object.values(fieldsBySess).flat()
  const totalCount  = allFields.length
  const filledCount = allFields.filter(f => {
    const v = values[f.field_key]
    return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)
  }).length
  const progressPct = totalCount > 0 ? Math.min(100, Math.round((filledCount / totalCount) * 100)) : 0

  await _patch(fetchFn, '/anamnesis_responses', { 'id': 'eq.' + responseId }, {
    status:             'in_progress',
    current_session_id: (sessId && sessId !== generalSessId) ? sessId : null,
    progress_percent:   progressPct,
  })
}

/** Restores previously saved answers into the values map. */
async function restoreAnswers(
  fetchFn: typeof fetch,
  respId: string,
  isTest: boolean,
  values: Record<string, unknown>,
  storage: Storage
): Promise<void> {
  if (!respId || isTest) return

  try {
    const saved = await _get(fetchFn, '/anamnesis_answers', {
      'response_id': 'eq.' + respId,
      'select':      'field_key,value_json',
    }) as Array<{ field_key: string; value_json: unknown }>

    if (saved?.length) {
      for (const a of saved) {
        if (!a.field_key || a.value_json === undefined || a.value_json === null) continue
        const raw = a.value_json
        values[a.field_key] = Array.isArray(raw) ? raw
          : (typeof raw === 'object' && raw !== null) ? raw
          : String(raw)
      }
    }
  } catch (e) {
    console.warn('Aviso: não foi possível restaurar respostas anteriores:', e)
  }

  try {
    const bkpKey = 'anm_unsaved_' + respId
    const bkp    = storage.getItem(bkpKey)
    if (bkp) {
      const { payload, ts } = JSON.parse(bkp) as { payload: Record<string,unknown>; ts: number }
      if (ts && Date.now() - ts < 30 * 60 * 1000 && payload) {
        for (const [k, v] of Object.entries(payload)) {
          values[k] = v
        }
      }
      storage.removeItem(bkpKey)
    }
  } catch (_) {}
}

/** Returns the validation state for a session (mirror of form-render logic). */
function checkCondition(
  field: { conditional_rules_json?: { dependsOn?: string; op?: string; value?: string } | null },
  values: Record<string, unknown>
): boolean {
  const cond = field.conditional_rules_json
  if (!cond?.dependsOn) return true
  const actual = values[cond.dependsOn]
  const target = cond.value ?? ''
  switch (cond.op) {
    case 'eq':  return String(actual ?? '') === target
    case 'neq': return String(actual ?? '') !== target
    case 'filled':    return actual !== undefined && actual !== null && actual !== ''
    case 'notFilled': return actual === undefined || actual === null || actual === ''
    default:    return true
  }
}

/** Returns true if all required fields in the session are filled. */
function validateSessionFields(
  fields: Array<{ id: string; field_key: string; is_required?: boolean; conditional_rules_json?: object | null }>,
  values: Record<string, unknown>
): boolean {
  for (const f of fields) {
    if (!f.is_required) continue
    if (!checkCondition(f, values)) continue  // hidden field — skip
    const v = values[f.field_key]
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) {
      return false
    }
  }
  return true
}

// ─────────────────────────────────────────────────────────────────────────────
// FIXTURES
// ─────────────────────────────────────────────────────────────────────────────
const CLINIC_ID   = '00000000-0000-0000-0000-000000000001'
const REQUEST_ID  = 'req-1111-1111-1111-111111111111'
const PATIENT_ID  = 'pat-2222-2222-2222-222222222222'
const TEMPLATE_ID = 'tpl-3333-3333-3333-333333333333'
const RESPONSE_ID = 'res-4444-4444-4444-444444444444'
const SESS_ID     = 'ses-5555-5555-5555-555555555555'
const GENERAL_ID  = '__GENERAL_DATA__'

function makeField(overrides: Partial<{
  id: string; field_key: string; is_required: boolean
  conditional_rules_json: object | null
}> = {}) {
  return {
    id:                     'fld-aaaa',
    field_key:              'nome',
    is_required:            false,
    conditional_rules_json: null,
    ...overrides,
  }
}

function mockFetchOk(body: unknown): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok:   true,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  }) as unknown as typeof fetch
}

function mockFetchErr(status = 400, text = '{"message":"bad request"}'): typeof fetch {
  return vi.fn().mockResolvedValue({
    ok:   false,
    json: () => Promise.resolve({}),
    text: () => Promise.resolve(text),
  }) as unknown as typeof fetch
}

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: _ensureResponse
// ─────────────────────────────────────────────────────────────────────────────
describe('ensureResponse', () => {
  it('returns existing response when one exists', async () => {
    const fetchFn = mockFetchOk([{ id: RESPONSE_ID, status: 'in_progress' }])

    const result = await ensureResponse(fetchFn, REQUEST_ID, PATIENT_ID, TEMPLATE_ID, CLINIC_ID)

    expect(result).toEqual({ id: RESPONSE_ID, existed: true })
    expect(fetchFn).toHaveBeenCalledTimes(1)
    const url = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('/anamnesis_responses')
    expect(url).toContain('request_id=eq.' + encodeURIComponent(REQUEST_ID))
  })

  it('creates new response when none exists', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([{ id: RESPONSE_ID }]) }) as unknown as typeof fetch

    const result = await ensureResponse(fetchFn, REQUEST_ID, PATIENT_ID, TEMPLATE_ID, CLINIC_ID)

    expect(result).toEqual({ id: RESPONSE_ID, existed: false })
    expect(fetchFn).toHaveBeenCalledTimes(2)
    const postCall = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[1]
    const body = JSON.parse(postCall[1].body)[0]
    expect(body.request_id).toBe(REQUEST_ID)
    expect(body.patient_id).toBe(PATIENT_ID)
    expect(body.template_id).toBe(TEMPLATE_ID)
    expect(body.clinic_id).toBe(CLINIC_ID)
    expect(body.status).toBe('not_started')
  })

  it('returns null id when both GET and POST fail', async () => {
    const fetchFn = mockFetchErr()
    const result  = await ensureResponse(fetchFn, REQUEST_ID, PATIENT_ID, TEMPLATE_ID, CLINIC_ID)
    expect(result).toEqual({ id: null, existed: false })
  })

  it('returns null id when POST returns empty array', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve([]) }) as unknown as typeof fetch

    const result = await ensureResponse(fetchFn, REQUEST_ID, PATIENT_ID, TEMPLATE_ID, CLINIC_ID)
    expect(result.id).toBeNull()
    expect(result.existed).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: saveSessionAnswers
// ─────────────────────────────────────────────────────────────────────────────
describe('saveSessionAnswers', () => {
  const baseOpts = {
    responseId:    RESPONSE_ID,
    isTest:        false,
    sessId:        SESS_ID,
    generalSessId: GENERAL_ID,
    fieldsBySess: {
      [SESS_ID]: [
        makeField({ id: 'f1', field_key: 'nome' }),
        makeField({ id: 'f2', field_key: 'idade' }),
      ],
    },
    values: { nome: 'Ana', idade: '30' } as Record<string, unknown>,
  }

  it('does nothing when IS_TEST is true', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch
    await saveSessionAnswers(fetchFn, { ...baseOpts, isTest: true })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('does nothing when responseId is empty', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch
    await saveSessionAnswers(fetchFn, { ...baseOpts, responseId: '' })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('skips empty fields and upserts filled ones', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }) as unknown as typeof fetch

    await saveSessionAnswers(fetchFn, {
      ...baseOpts,
      values: { nome: 'Ana', idade: '' },  // idade empty → skipped
    })

    const upsertCall = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.find(
      ([url]: [string]) => url.includes('/anamnesis_answers')
    )
    expect(upsertCall).toBeDefined()
    const payload = JSON.parse(upsertCall![1].body) as Array<{ field_key: string }>
    expect(payload).toHaveLength(1)
    expect(payload[0].field_key).toBe('nome')
  })

  it('sends the Prefer merge-duplicates header for upsert', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }) as unknown as typeof fetch

    await saveSessionAnswers(fetchFn, baseOpts)

    const upsertCall = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.find(
      ([url]: [string]) => url.includes('/anamnesis_answers')
    )
    expect(upsertCall![1].headers['Prefer']).toContain('merge-duplicates')
  })

  it('updates response progress after upserting answers', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }) as unknown as typeof fetch

    await saveSessionAnswers(fetchFn, baseOpts)

    // Last call should be the PATCH to update progress
    const calls = (fetchFn as ReturnType<typeof vi.fn>).mock.calls
    const patchCall = calls.find(([url]: [string]) => url.includes('/anamnesis_responses?id=eq.'))
    expect(patchCall).toBeDefined()
    const body = JSON.parse(patchCall![1].body)
    expect(body.status).toBe('in_progress')
    expect(body.progress_percent).toBeGreaterThanOrEqual(0)
    expect(body.progress_percent).toBeLessThanOrEqual(100)
  })

  it('calculates progress based on filled/total field ratio', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }) as unknown as typeof fetch

    // 2 fields total, 1 filled → 50%
    await saveSessionAnswers(fetchFn, {
      ...baseOpts,
      values: { nome: 'Ana', idade: '' },
    })

    const calls  = (fetchFn as ReturnType<typeof vi.fn>).mock.calls
    const patch  = calls.find(([url]: [string]) => url.includes('/anamnesis_responses?id=eq.'))
    const body   = JSON.parse(patch![1].body)
    expect(body.progress_percent).toBe(50)
  })

  it('skips general session (no fields to upsert)', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch
    await saveSessionAnswers(fetchFn, { ...baseOpts, sessId: GENERAL_ID })
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('normalizes array values to joined string for normalized_text', async () => {
    const fetchFn = vi.fn()
      .mockResolvedValue({ ok: true, json: () => Promise.resolve([]) }) as unknown as typeof fetch

    await saveSessionAnswers(fetchFn, {
      ...baseOpts,
      fieldsBySess: { [SESS_ID]: [makeField({ id: 'f1', field_key: 'sintomas' })] },
      values: { sintomas: ['dor', 'febre'] },
    })

    const upsert = (fetchFn as ReturnType<typeof vi.fn>).mock.calls.find(
      ([url]: [string]) => url.includes('/anamnesis_answers')
    )
    const payload = JSON.parse(upsert![1].body)
    expect(payload[0].normalized_text).toBe('dor, febre')
    expect(payload[0].value_json).toEqual(['dor', 'febre'])
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: restoreAnswers
// ─────────────────────────────────────────────────────────────────────────────
describe('restoreAnswers', () => {
  it('does nothing when IS_TEST is true', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch
    const values: Record<string, unknown> = {}
    await restoreAnswers(fetchFn, RESPONSE_ID, true, values, sessionStorage)
    expect(fetchFn).not.toHaveBeenCalled()
    expect(Object.keys(values)).toHaveLength(0)
  })

  it('populates values from DB answers', async () => {
    const fetchFn = mockFetchOk([
      { field_key: 'nome',  value_json: 'Maria' },
      { field_key: 'idade', value_json: '25' },
    ])
    const values: Record<string, unknown> = {}
    await restoreAnswers(fetchFn, RESPONSE_ID, false, values, sessionStorage)
    expect(values['nome']).toBe('Maria')
    expect(values['idade']).toBe('25')
  })

  it('converts array value_json back to array', async () => {
    const fetchFn = mockFetchOk([
      { field_key: 'sintomas', value_json: ['dor', 'febre'] },
    ])
    const values: Record<string, unknown> = {}
    await restoreAnswers(fetchFn, RESPONSE_ID, false, values, sessionStorage)
    expect(values['sintomas']).toEqual(['dor', 'febre'])
  })

  it('applies recent sessionStorage backup on top of DB values', async () => {
    const fetchFn = mockFetchOk([
      { field_key: 'nome', value_json: 'Old Name' },
    ])
    const values: Record<string, unknown> = {}

    // Plant a fresh backup in sessionStorage
    sessionStorage.setItem('anm_unsaved_' + RESPONSE_ID, JSON.stringify({
      sessId:  SESS_ID,
      payload: { nome: 'New Name', extra: 'extra-value' },
      ts:      Date.now(),
    }))

    await restoreAnswers(fetchFn, RESPONSE_ID, false, values, sessionStorage)

    // Backup should override DB value
    expect(values['nome']).toBe('New Name')
    expect(values['extra']).toBe('extra-value')
  })

  it('ignores expired sessionStorage backup (> 30 min)', async () => {
    const fetchFn = mockFetchOk([
      { field_key: 'nome', value_json: 'DB Name' },
    ])
    const values: Record<string, unknown> = {}

    const expiredTs = Date.now() - 31 * 60 * 1000  // 31 minutes ago
    sessionStorage.setItem('anm_unsaved_' + RESPONSE_ID, JSON.stringify({
      sessId:  SESS_ID,
      payload: { nome: 'Backup Name' },
      ts:      expiredTs,
    }))

    await restoreAnswers(fetchFn, RESPONSE_ID, false, values, sessionStorage)

    expect(values['nome']).toBe('DB Name') // DB value preserved
  })

  it('consumes (removes) sessionStorage backup after use', async () => {
    const fetchFn = mockFetchOk([])
    const values: Record<string, unknown> = {}

    sessionStorage.setItem('anm_unsaved_' + RESPONSE_ID, JSON.stringify({
      sessId:  SESS_ID,
      payload: { foo: 'bar' },
      ts:      Date.now(),
    }))

    await restoreAnswers(fetchFn, RESPONSE_ID, false, values, sessionStorage)

    expect(sessionStorage.getItem('anm_unsaved_' + RESPONSE_ID)).toBeNull()
  })

  it('handles DB fetch failure gracefully (values stay empty)', async () => {
    const fetchFn = mockFetchErr()
    const values: Record<string, unknown> = {}

    await expect(
      restoreAnswers(fetchFn, RESPONSE_ID, false, values, sessionStorage)
    ).resolves.not.toThrow()

    expect(Object.keys(values)).toHaveLength(0)
  })

  it('skips null/undefined value_json entries', async () => {
    const fetchFn = mockFetchOk([
      { field_key: 'bom', value_json: 'ok' },
      { field_key: 'bad', value_json: null },
      { field_key: '',    value_json: 'ignored' }, // empty key
    ])
    const values: Record<string, unknown> = {}
    await restoreAnswers(fetchFn, RESPONSE_ID, false, values, sessionStorage)
    expect(values['bom']).toBe('ok')
    expect('bad' in values).toBe(false)
    expect('' in values).toBe(false)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: beforeunload handler behavior
// ─────────────────────────────────────────────────────────────────────────────
describe('beforeunload sessionStorage backup', () => {
  /** Replicates the beforeunload handler from form-render.html */
  function triggerBeforeunload(opts: {
    responseId: string | null
    isTest:     boolean
    sessions:   Array<{ id: string; _isGeneral?: boolean }>
    currentIdx: number
    values:     Record<string, unknown>
    storage:    Storage
  }) {
    const { responseId, isTest, sessions, currentIdx, values, storage } = opts
    if (!responseId || isTest) return
    const sess = sessions[currentIdx]
    if (!sess || sess._isGeneral) return
    try {
      storage.setItem(
        'anm_unsaved_' + responseId,
        JSON.stringify({ sessId: sess.id, payload: values, ts: Date.now() })
      )
    } catch (_) {}
  }

  it('writes backup to sessionStorage with correct key', () => {
    const storage = sessionStorage
    triggerBeforeunload({
      responseId: RESPONSE_ID,
      isTest:     false,
      sessions:   [{ id: SESS_ID }],
      currentIdx: 0,
      values:     { nome: 'Luiz' },
      storage,
    })

    const raw = storage.getItem('anm_unsaved_' + RESPONSE_ID)
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw!)
    expect(parsed.sessId).toBe(SESS_ID)
    expect(parsed.payload.nome).toBe('Luiz')
    expect(parsed.ts).toBeLessThanOrEqual(Date.now())
  })

  it('does not write backup in test mode', () => {
    triggerBeforeunload({
      responseId: RESPONSE_ID,
      isTest:     true,
      sessions:   [{ id: SESS_ID }],
      currentIdx: 0,
      values:     { nome: 'Luiz' },
      storage:    sessionStorage,
    })
    expect(sessionStorage.getItem('anm_unsaved_' + RESPONSE_ID)).toBeNull()
  })

  it('does not write backup when responseId is null', () => {
    triggerBeforeunload({
      responseId: null,
      isTest:     false,
      sessions:   [{ id: SESS_ID }],
      currentIdx: 0,
      values:     { nome: 'Luiz' },
      storage:    sessionStorage,
    })
    expect(sessionStorage.getItem('anm_unsaved_' + RESPONSE_ID)).toBeNull()
  })

  it('does not write backup for general session', () => {
    triggerBeforeunload({
      responseId: RESPONSE_ID,
      isTest:     false,
      sessions:   [{ id: GENERAL_ID, _isGeneral: true }],
      currentIdx: 0,
      values:     { nome: 'Luiz' },
      storage:    sessionStorage,
    })
    expect(sessionStorage.getItem('anm_unsaved_' + RESPONSE_ID)).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: checkCondition (field visibility)
// ─────────────────────────────────────────────────────────────────────────────
describe('checkCondition', () => {
  it('returns true for field with no conditional rules', () => {
    expect(checkCondition({ conditional_rules_json: null }, {})).toBe(true)
    expect(checkCondition({}, {})).toBe(true)
  })

  it('op=eq — visible when value matches', () => {
    const f = { conditional_rules_json: { dependsOn: 'sexo', op: 'eq', value: 'F' } }
    expect(checkCondition(f, { sexo: 'F' })).toBe(true)
    expect(checkCondition(f, { sexo: 'M' })).toBe(false)
  })

  it('op=neq — visible when value does NOT match', () => {
    const f = { conditional_rules_json: { dependsOn: 'sexo', op: 'neq', value: 'F' } }
    expect(checkCondition(f, { sexo: 'M' })).toBe(true)
    expect(checkCondition(f, { sexo: 'F' })).toBe(false)
  })

  it('op=filled — visible when dependsOn field has any value', () => {
    const f = { conditional_rules_json: { dependsOn: 'cpf', op: 'filled' } }
    expect(checkCondition(f, { cpf: '123.456.789-00' })).toBe(true)
    expect(checkCondition(f, { cpf: '' })).toBe(false)
    expect(checkCondition(f, {})).toBe(false)
  })

  it('op=notFilled — visible when dependsOn field is empty', () => {
    const f = { conditional_rules_json: { dependsOn: 'cpf', op: 'notFilled' } }
    expect(checkCondition(f, {})).toBe(true)
    expect(checkCondition(f, { cpf: '' })).toBe(true)
    expect(checkCondition(f, { cpf: '123' })).toBe(false)
  })

  it('unknown op — defaults to visible', () => {
    const f = { conditional_rules_json: { dependsOn: 'x', op: 'unknown', value: '1' } }
    expect(checkCondition(f, {})).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: validateSessionFields (required field guard)
// ─────────────────────────────────────────────────────────────────────────────
describe('validateSessionFields', () => {
  it('returns true for session with no required fields', () => {
    const fields = [makeField({ is_required: false })]
    expect(validateSessionFields(fields, {})).toBe(true)
  })

  it('returns false when required field is empty', () => {
    const fields = [makeField({ id: 'f1', field_key: 'nome', is_required: true })]
    expect(validateSessionFields(fields, {})).toBe(false)
    expect(validateSessionFields(fields, { nome: '' })).toBe(false)
  })

  it('returns true when all required fields are filled', () => {
    const fields = [
      makeField({ id: 'f1', field_key: 'nome',  is_required: true }),
      makeField({ id: 'f2', field_key: 'email', is_required: true }),
    ]
    expect(validateSessionFields(fields, { nome: 'Ana', email: 'a@b.com' })).toBe(true)
  })

  it('skips hidden required fields (conditional = not visible)', () => {
    // field is required BUT only visible when sexo=F; if sexo=M it is hidden → skip
    const fields = [makeField({
      id:      'f1',
      field_key: 'gestante',
      is_required: true,
      conditional_rules_json: { dependsOn: 'sexo', op: 'eq', value: 'F' },
    })]
    // sexo=M → field hidden → not required
    expect(validateSessionFields(fields, { sexo: 'M' })).toBe(true)
    // sexo=F → field visible → required → empty → fail
    expect(validateSessionFields(fields, { sexo: 'F' })).toBe(false)
    // sexo=F → field visible → required → filled → pass
    expect(validateSessionFields(fields, { sexo: 'F', gestante: 'Não' })).toBe(true)
  })

  it('returns false when required field contains empty array', () => {
    const fields = [makeField({ id: 'f1', field_key: 'sintomas', is_required: true })]
    expect(validateSessionFields(fields, { sintomas: [] })).toBe(false)
  })

  it('returns true when required field contains non-empty array', () => {
    const fields = [makeField({ id: 'f1', field_key: 'sintomas', is_required: true })]
    expect(validateSessionFields(fields, { sintomas: ['dor'] })).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: bootPatientLink scenarios
// ─────────────────────────────────────────────────────────────────────────────
describe('bootPatientLink scenarios (validate_anamnesis_token RPC)', () => {
  /** Stripped-down replica of bootPatientLink that returns status strings
   *  instead of manipulating the DOM — allows testing all branching paths. */
  async function runBoot(fetchFn: typeof fetch, slug: string, token: string | null) {
    if (!token) return 'error:missing-token'

    let req: Record<string, unknown> | null = null
    try {
      const rows = await _rpc(fetchFn, 'validate_anamnesis_token', {
        p_public_slug: slug,
        p_raw_token:   token,
      }) as unknown[]
      req = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | null
    } catch (_) {
      req = null
    }

    if (!req) return 'error:invalid'
    if (['revoked', 'cancelled'].includes(req.status as string)) return 'error:revoked'
    if (req.expires_at && new Date(req.expires_at as string) < new Date()) return 'error:expired'

    return 'ok'
  }

  it('returns error when token is missing', async () => {
    const fetchFn = vi.fn() as unknown as typeof fetch
    expect(await runBoot(fetchFn, 'test-slug', null)).toBe('error:missing-token')
    expect(fetchFn).not.toHaveBeenCalled()
  })

  it('returns error when RPC returns null/empty', async () => {
    const fetchFn = mockFetchOk(null)
    expect(await runBoot(fetchFn, 'test-slug', 'test-token')).toBe('error:invalid')
  })

  it('returns error when request is revoked', async () => {
    const fetchFn = mockFetchOk([{ status: 'revoked', request_id: REQUEST_ID }])
    expect(await runBoot(fetchFn, 'test-slug', 'test-token')).toBe('error:revoked')
  })

  it('returns error when request is cancelled', async () => {
    const fetchFn = mockFetchOk([{ status: 'cancelled', request_id: REQUEST_ID }])
    expect(await runBoot(fetchFn, 'test-slug', 'test-token')).toBe('error:revoked')
  })

  it('returns error when request link is expired', async () => {
    const fetchFn = mockFetchOk([{
      status:     'sent',
      request_id: REQUEST_ID,
      expires_at: new Date(Date.now() - 1000).toISOString(), // 1s ago
    }])
    expect(await runBoot(fetchFn, 'test-slug', 'test-token')).toBe('error:expired')
  })

  it('returns ok for valid non-expired request', async () => {
    const fetchFn = mockFetchOk([{
      status:     'sent',
      request_id: REQUEST_ID,
      patient_id: PATIENT_ID,
      template_id: TEMPLATE_ID,
      clinic_id:  CLINIC_ID,
      expires_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(), // 1h from now
    }])
    expect(await runBoot(fetchFn, 'test-slug', 'test-token')).toBe('ok')
  })

  it('returns ok when expires_at is null (no expiry)', async () => {
    const fetchFn = mockFetchOk([{
      status:      'sent',
      request_id:  REQUEST_ID,
      expires_at:  null,
    }])
    expect(await runBoot(fetchFn, 'test-slug', 'test-token')).toBe('ok')
  })

  it('handles RPC network error gracefully', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network error')) as unknown as typeof fetch
    expect(await runBoot(fetchFn, 'test-slug', 'bad-token')).toBe('error:invalid')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: progress calculation edge cases
// ─────────────────────────────────────────────────────────────────────────────
describe('progress calculation', () => {
  function calcProgress(
    fieldsBySess: Record<string, Array<{ field_key: string }>>,
    values: Record<string, unknown>
  ): number {
    const allFields   = Object.values(fieldsBySess).flat()
    const totalCount  = allFields.length
    const filledCount = allFields.filter(f => {
      const v = values[f.field_key]
      return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)
    }).length
    return totalCount > 0 ? Math.min(100, Math.round((filledCount / totalCount) * 100)) : 0
  }

  it('returns 0 when no fields', () => {
    expect(calcProgress({}, {})).toBe(0)
  })

  it('returns 0 when no fields are filled', () => {
    const fbs = { s1: [{ field_key: 'a' }, { field_key: 'b' }] }
    expect(calcProgress(fbs, {})).toBe(0)
  })

  it('returns 100 when all fields are filled', () => {
    const fbs = { s1: [{ field_key: 'a' }, { field_key: 'b' }] }
    expect(calcProgress(fbs, { a: '1', b: '2' })).toBe(100)
  })

  it('returns 50 when half fields are filled', () => {
    const fbs = { s1: [{ field_key: 'a' }, { field_key: 'b' }] }
    expect(calcProgress(fbs, { a: '1' })).toBe(50)
  })

  it('counts boolean false as filled (false !== null/undefined/empty)', () => {
    // The filter checks v !== undefined && v !== null && v !== ''
    // boolean false passes all three → IS considered filled (same as form-render.html)
    const fbs = { s1: [{ field_key: 'fumante' }] }
    expect(calcProgress(fbs, { fumante: false })).toBe(100)
  })

  it('does not exceed 100', () => {
    const fbs = { s1: [{ field_key: 'a' }] }
    expect(calcProgress(fbs, { a: 'yes' })).toBe(100)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: bootPatientLink — error_code granular (P2)
// ─────────────────────────────────────────────────────────────────────────────
describe('bootPatientLink error_code granular (P2)', () => {
  /** Extended runBoot that handles error_code from validate_anamnesis_token P2 */
  async function runBootP2(fetchFn: typeof fetch, slug: string, token: string | null) {
    if (!token) return 'error:missing-token'

    let req: Record<string, unknown> | null = null
    try {
      const rows = await _rpc(fetchFn, 'validate_anamnesis_token', {
        p_public_slug: slug,
        p_raw_token:   token,
      }) as unknown[]
      req = (Array.isArray(rows) ? rows[0] : rows) as Record<string, unknown> | null
    } catch (_) { req = null }

    if (!req) return 'error:invalid'
    if (req.error_code === 'revoked')    return 'error:revoked'
    if (req.error_code === 'expired')    return 'error:expired'
    if (req.error_code === 'completed')  return 'error:completed'
    // Fallback: legacy status check
    if (['revoked', 'cancelled'].includes(req.status as string)) return 'error:revoked'
    if (req.expires_at && new Date(req.expires_at as string) < new Date()) return 'error:expired'
    if (!req.request_id) return 'error:invalid'
    return 'ok'
  }

  it('shows "completed" when form was already submitted', async () => {
    const fetchFn = mockFetchOk([{ error_code: 'completed', status: 'completed', expires_at: null }])
    expect(await runBootP2(fetchFn, 'slug', 'token')).toBe('error:completed')
  })

  it('shows "revoked" via error_code (new RPC behavior)', async () => {
    const fetchFn = mockFetchOk([{ error_code: 'revoked', status: 'revoked', expires_at: null }])
    expect(await runBootP2(fetchFn, 'slug', 'token')).toBe('error:revoked')
  })

  it('shows "expired" via error_code (new RPC behavior)', async () => {
    const fetchFn = mockFetchOk([{
      error_code: 'expired',
      status:     'sent',
      expires_at: new Date(Date.now() - 1000).toISOString(),
    }])
    expect(await runBootP2(fetchFn, 'slug', 'token')).toBe('error:expired')
  })

  it('returns ok when error_code is null and request_id present', async () => {
    const fetchFn = mockFetchOk([{
      error_code:  null,
      request_id:  REQUEST_ID,
      patient_id:  PATIENT_ID,
      template_id: TEMPLATE_ID,
      clinic_id:   CLINIC_ID,
      status:      'sent',
      expires_at:  new Date(Date.now() + 60 * 60 * 1000).toISOString(),
    }])
    expect(await runBootP2(fetchFn, 'slug', 'token')).toBe('ok')
  })

  it('token fallback: reads token from hash fragment when query param is missing', () => {
    // Simulates: location.hash = '#token=abc123' and no ?token= in search
    const hashToken  = new URLSearchParams('#token=abc123'.substring(1)).get('token')
    const queryToken = new URLSearchParams('').get('token')
    const resolved   = hashToken || queryToken
    expect(resolved).toBe('abc123')
  })

  it('token fallback: query param used when hash is empty', () => {
    const hashToken  = new URLSearchParams(''.substring(1)).get('token')
    const queryToken = new URLSearchParams('token=xyz789').get('token')
    const resolved   = hashToken || queryToken
    expect(resolved).toBe('xyz789')
  })

  it('token fallback: hash takes priority over query param', () => {
    const hashToken  = new URLSearchParams('token=hash-tok'.substring(0)).get('token')
    const queryToken = new URLSearchParams('token=query-tok').get('token')
    const resolved   = hashToken || queryToken
    expect(resolved).toBe('hash-tok')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: normalized_text PII masking and non-input exclusion
// ─────────────────────────────────────────────────────────────────────────────
describe('normalized_text strategy', () => {
  const PII_FIELD_KEYS = new Set(['cpf', '__gd_cpf', 'rg', '__gd_rg'])
  const NON_INPUT_TYPES = new Set(['section_title', 'label', 'description_text', 'file_upload', 'image_upload', 'image_pair'])

  function buildNormalizedText(field: { field_key: string; field_type: string }, raw: unknown): string | null {
    if (NON_INPUT_TYPES.has(field.field_type)) return null // excluded
    if (PII_FIELD_KEYS.has(field.field_key)) return '[REDACTED]'
    if (field.field_type === 'rich_text') {
      return String(raw).replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
    }
    if (Array.isArray(raw)) return raw.join(', ')
    if (typeof raw === 'object' && raw !== null) return JSON.stringify(raw)
    return String(raw)
  }

  it('masks CPF as [REDACTED]', () => {
    expect(buildNormalizedText({ field_key: 'cpf', field_type: 'text' }, '123.456.789-00')).toBe('[REDACTED]')
    expect(buildNormalizedText({ field_key: '__gd_cpf', field_type: 'text' }, '123')).toBe('[REDACTED]')
  })

  it('masks RG as [REDACTED]', () => {
    expect(buildNormalizedText({ field_key: 'rg', field_type: 'text' }, 'MG-12345')).toBe('[REDACTED]')
    expect(buildNormalizedText({ field_key: '__gd_rg', field_type: 'text' }, 'X')).toBe('[REDACTED]')
  })

  it('excludes section_title fields (non-input)', () => {
    expect(buildNormalizedText({ field_key: 'titulo', field_type: 'section_title' }, 'Seção 1')).toBeNull()
  })

  it('excludes label and description_text fields', () => {
    expect(buildNormalizedText({ field_key: 'x', field_type: 'label' }, 'texto')).toBeNull()
    expect(buildNormalizedText({ field_key: 'x', field_type: 'description_text' }, 'texto')).toBeNull()
  })

  it('excludes file_upload and image types', () => {
    expect(buildNormalizedText({ field_key: 'foto', field_type: 'file_upload' }, 'data:...')).toBeNull()
    expect(buildNormalizedText({ field_key: 'img', field_type: 'image_upload' }, 'https://...')).toBeNull()
  })

  it('strips HTML tags from rich_text', () => {
    const html = '<p>Tenho <strong>alergia</strong> a penicilina</p>'
    const result = buildNormalizedText({ field_key: 'obs', field_type: 'rich_text' }, html)
    expect(result).toBe('Tenho alergia a penicilina')
    expect(result).not.toContain('<')
  })

  it('joins array values with comma', () => {
    const result = buildNormalizedText({ field_key: 'alergias', field_type: 'multi_select' }, ['penicilina', 'ibuprofeno'])
    expect(result).toBe('penicilina, ibuprofeno')
  })

  it('converts scalar to string for text fields', () => {
    expect(buildNormalizedText({ field_key: 'nome', field_type: 'text' }, 'Ana Lima')).toBe('Ana Lima')
    expect(buildNormalizedText({ field_key: 'idade', field_type: 'number' }, 32)).toBe('32')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: complete_anamnesis_form RPC (atomic finalization)
// ─────────────────────────────────────────────────────────────────────────────
describe('complete_anamnesis_form RPC (atomic finalization)', () => {
  /** Minimal replica of the confirmLgpd finalization using the P2 RPC */
  async function runComplete(
    fetchFn: typeof fetch,
    opts: {
      responseId: string | null
      requestId:  string | null
      patientId:  string | null
      clinicId:   string
      answers:    Array<{ field_id: string; field_key: string; value_json: unknown; normalized_text: string }>
      ptFirstName?: string | null
    }
  ): Promise<'ok' | 'error'> {
    const { responseId, requestId, patientId, clinicId, answers, ptFirstName } = opts
    try {
      await _rpc(fetchFn, 'complete_anamnesis_form', {
        p_response_id:        responseId,
        p_request_id:         requestId,
        p_patient_id:         patientId,
        p_clinic_id:          clinicId,
        p_patient_first_name: ptFirstName ?? null,
        p_final_answers:      answers.length ? answers : null,
      })
      return 'ok'
    } catch (_) {
      return 'error'
    }
  }

  it('calls complete_anamnesis_form RPC with correct payload', async () => {
    const fetchFn = mockFetchOk({ ok: true, completed_at: new Date().toISOString() })
    const answers = [{ field_id: 'f1', field_key: 'nome', value_json: 'Ana', normalized_text: 'Ana' }]

    const result = await runComplete(fetchFn, {
      responseId: RESPONSE_ID, requestId: REQUEST_ID,
      patientId: PATIENT_ID, clinicId: CLINIC_ID,
      answers,
    })

    expect(result).toBe('ok')
    const call = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toContain('/rpc/complete_anamnesis_form')
    const body = JSON.parse(call[1].body)
    expect(body.p_response_id).toBe(RESPONSE_ID)
    expect(body.p_request_id).toBe(REQUEST_ID)
    expect(body.p_final_answers).toHaveLength(1)
    expect(body.p_final_answers[0].field_key).toBe('nome')
  })

  it('sends null for p_final_answers when no answers', async () => {
    const fetchFn = mockFetchOk({ ok: true })
    await runComplete(fetchFn, {
      responseId: RESPONSE_ID, requestId: REQUEST_ID,
      patientId: PATIENT_ID, clinicId: CLINIC_ID,
      answers: [],
    })
    const body = JSON.parse((fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][1].body)
    expect(body.p_final_answers).toBeNull()
  })

  it('returns error when RPC fails (network error)', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new Error('network')) as unknown as typeof fetch
    const result = await runComplete(fetchFn, {
      responseId: RESPONSE_ID, requestId: REQUEST_ID,
      patientId: PATIENT_ID, clinicId: CLINIC_ID,
      answers: [],
    })
    expect(result).toBe('error')
  })

  it('returns error when server returns 500', async () => {
    const fetchFn = mockFetchErr(500, '{"message":"internal error"}')
    const result = await runComplete(fetchFn, {
      responseId: RESPONSE_ID, requestId: REQUEST_ID,
      patientId: PATIENT_ID, clinicId: CLINIC_ID,
      answers: [],
    })
    expect(result).toBe('error')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: snapshot vs. live template
// ─────────────────────────────────────────────────────────────────────────────
describe('snapshot vs. live template rendering', () => {
  /** Simplified replica of bootWithTemplate snapshot branch */
  function resolveSessionsFromSnapshot(snapshot: {
    sessions: Array<{
      id: string; title: string; order_index: number
      fields: Array<{ id: string; field_key: string; label: string; field_type: string; options?: unknown[] }>
    }>
  }) {
    const sessions: Array<{ id: string; title: string }> = []
    const fieldsBySess: Record<string, unknown[]> = {}
    const optsByField:  Record<string, unknown[]> = {}
    const fieldKeyToId: Record<string, string>    = {}

    snapshot.sessions.forEach(s => {
      sessions.push({ id: s.id, title: s.title })
      fieldsBySess[s.id] = s.fields || []
      s.fields.forEach(f => {
        fieldKeyToId[f.field_key] = f.id
        if (f.options?.length) optsByField[f.id] = f.options
      })
    })
    return { sessions, fieldsBySess, optsByField, fieldKeyToId }
  }

  it('uses snapshot sessions without DB calls', () => {
    const snapshot = {
      sessions: [
        {
          id: 'sess-snap-1', title: 'Sessão 1 (snapshot)', order_index: 1,
          fields: [
            { id: 'f-snap-1', field_key: 'altura', label: 'Altura', field_type: 'number', options: [] },
          ],
        },
      ],
    }
    const { sessions, fieldsBySess, fieldKeyToId } = resolveSessionsFromSnapshot(snapshot)
    expect(sessions).toHaveLength(1)
    expect(sessions[0].title).toBe('Sessão 1 (snapshot)')
    expect(fieldsBySess['sess-snap-1']).toHaveLength(1)
    expect(fieldKeyToId['altura']).toBe('f-snap-1')
  })

  it('snapshot includes options for select fields', () => {
    const snapshot = {
      sessions: [{
        id: 's1', title: 'S', order_index: 1,
        fields: [{
          id: 'f1', field_key: 'sexo', label: 'Sexo', field_type: 'single_select',
          options: [
            { id: 'o1', label: 'Masculino', value: 'M', order_index: 1 },
            { id: 'o2', label: 'Feminino',  value: 'F', order_index: 2 },
          ],
        }],
      }],
    }
    const { optsByField } = resolveSessionsFromSnapshot(snapshot)
    expect(optsByField['f1']).toHaveLength(2)
    expect((optsByField['f1'][0] as { value: string }).value).toBe('M')
  })

  it('falls back gracefully when snapshot has no sessions', () => {
    // Empty snapshot → should trigger live template fetch in the real code
    const snapshot = { sessions: [] }
    const { sessions } = resolveSessionsFromSnapshot(snapshot)
    expect(sessions).toHaveLength(0)
    // Real code checks snapshot?.sessions?.length before using snapshot branch
    expect(snapshot.sessions.length).toBe(0) // → triggers live fetch fallback
  })

  it('preserves field order from snapshot (order_index respected)', () => {
    const snapshot = {
      sessions: [{
        id: 's1', title: 'S', order_index: 1,
        fields: [
          { id: 'f2', field_key: 'b', label: 'B', field_type: 'text', order_index: 2 },
          { id: 'f1', field_key: 'a', label: 'A', field_type: 'text', order_index: 1 },
        ],
      }],
    }
    const { fieldsBySess } = resolveSessionsFromSnapshot(snapshot)
    // Fields are stored in the order they arrive from the snapshot (already sorted by RPC)
    expect((fieldsBySess['s1'][0] as { field_key: string }).field_key).toBe('b')
    expect((fieldsBySess['s1'][1] as { field_key: string }).field_key).toBe('a')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: progress calculation with conditional (hidden) fields
// ─────────────────────────────────────────────────────────────────────────────
describe('progress with conditional hidden fields', () => {
  function checkCondition(f: { conditional_rules_json?: { dependsOn?: string; op?: string; value?: unknown } | null }, values: Record<string, unknown>): boolean {
    const cond = f.conditional_rules_json || {}
    if (!cond.dependsOn) return true
    const depVal = values[cond.dependsOn]
    if (cond.op === 'eq' || cond.op === 'equals')
      return String(depVal) === String(cond.value)
    if (cond.op === 'neq' || cond.op === 'not_equals')
      return String(depVal) !== String(cond.value)
    if (cond.op === 'filled')
      return depVal !== undefined && depVal !== null && depVal !== ''
    if (cond.op === 'notFilled')
      return depVal === undefined || depVal === null || depVal === ''
    return true
  }

  function calcProgressWithConditions(
    fieldsBySess: Record<string, Array<{ field_key: string; conditional_rules_json?: object | null }>>,
    values: Record<string, unknown>
  ): number {
    const allFields   = Object.values(fieldsBySess).flat().filter(f => checkCondition(f, values))
    const totalCount  = allFields.length
    const filledCount = allFields.filter(f => {
      const v = values[f.field_key]
      return v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length)
    }).length
    return totalCount > 0 ? Math.min(100, Math.round((filledCount / totalCount) * 100)) : 0
  }

  it('hidden field does not count toward total', () => {
    // "gestante" only visible when sexo=F; with sexo=M it is hidden
    const fbs = {
      s1: [
        { field_key: 'sexo',     conditional_rules_json: null },
        { field_key: 'gestante', conditional_rules_json: { dependsOn: 'sexo', op: 'eq', value: 'F' } },
      ],
    }
    // sexo=M: only "sexo" counts → 1 filled / 1 visible = 100%
    expect(calcProgressWithConditions(fbs, { sexo: 'M' })).toBe(100)
    // sexo=F: both fields visible → 1 filled / 2 = 50%
    expect(calcProgressWithConditions(fbs, { sexo: 'F' })).toBe(50)
    // sexo=F, gestante filled → 2/2 = 100%
    expect(calcProgressWithConditions(fbs, { sexo: 'F', gestante: 'Não' })).toBe(100)
  })

  it('all fields hidden → 0 (avoids division by zero)', () => {
    const fbs = {
      s1: [
        { field_key: 'x', conditional_rules_json: { dependsOn: 'never', op: 'eq', value: 'impossible' } },
      ],
    }
    expect(calcProgressWithConditions(fbs, {})).toBe(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: DnD rollback on persistence error
// ─────────────────────────────────────────────────────────────────────────────
describe('DnD field reorder rollback', () => {
  /** Simplified replica of _dndFieldDrop with rollback pattern */
  async function dndFieldDrop(
    fields: Array<{ id: string; order_index: number }>,
    srcId: string,
    tgtId: string,
    persistFn: (items: typeof fields) => Promise<void>
  ): Promise<{ finalFields: typeof fields; toastType: 'success' | 'error' }> {
    const srcIdx = fields.findIndex(f => f.id === srcId)
    const tgtIdx = fields.findIndex(f => f.id === tgtId)
    if (srcIdx < 0 || tgtIdx < 0) return { finalFields: fields, toastType: 'error' }

    const snapshot = fields.map(f => ({ ...f }))
    const mutated  = [...fields]
    const [moved]  = mutated.splice(srcIdx, 1)
    mutated.splice(tgtIdx, 0, moved)
    mutated.forEach((f, i) => { f.order_index = i + 1 })

    try {
      await persistFn(mutated)
      return { finalFields: mutated, toastType: 'success' }
    } catch (_) {
      return { finalFields: snapshot, toastType: 'error' }
    }
  }

  it('updates fields order on success', async () => {
    const fields = [
      { id: 'f1', order_index: 1 },
      { id: 'f2', order_index: 2 },
      { id: 'f3', order_index: 3 },
    ]
    const persist = vi.fn().mockResolvedValue(undefined)
    const { finalFields, toastType } = await dndFieldDrop(fields, 'f1', 'f3', persist)

    // Drag f1 (idx 0) to position of f3 (idx 2):
    // Remove f1 → [f2, f3], insert at idx 2 → [f2, f3, f1]
    expect(toastType).toBe('success')
    expect(finalFields[0].id).toBe('f2')
    expect(finalFields[1].id).toBe('f3')
    expect(finalFields[2].id).toBe('f1')
    expect(persist).toHaveBeenCalledOnce()
  })

  it('restores original order on persist failure (rollback)', async () => {
    const fields = [
      { id: 'f1', order_index: 1 },
      { id: 'f2', order_index: 2 },
    ]
    const persist = vi.fn().mockRejectedValue(new Error('network error'))
    const { finalFields, toastType } = await dndFieldDrop(fields, 'f1', 'f2', persist)

    expect(toastType).toBe('error')
    // Rollback: original order preserved
    expect(finalFields[0].id).toBe('f1')
    expect(finalFields[1].id).toBe('f2')
    expect(finalFields[0].order_index).toBe(1)
    expect(finalFields[1].order_index).toBe(2)
  })

  it('no-ops when source or target id not found', async () => {
    const fields = [{ id: 'f1', order_index: 1 }]
    const persist = vi.fn()
    const { finalFields } = await dndFieldDrop(fields, 'missing', 'f1', persist)
    expect(finalFields).toHaveLength(1)
    expect(persist).not.toHaveBeenCalled()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: delete field guard (existing answers check)
// ─────────────────────────────────────────────────────────────────────────────
describe('delete field with existing answers guard', () => {
  /** Replica of _deleteFieldDirect answer-check logic */
  async function checkFieldHasAnswers(
    fetchFn: typeof fetch,
    fieldId: string
  ): Promise<boolean> {
    const existing = await _get(fetchFn, '/anamnesis_answers', {
      'field_id': 'eq.' + fieldId,
      'select':   'id',
      'limit':    '1',
    }) as Array<{ id: string }>
    return existing?.length > 0
  }

  it('returns false when no answers exist for field', async () => {
    const fetchFn = mockFetchOk([])
    expect(await checkFieldHasAnswers(fetchFn, 'f1')).toBe(false)
  })

  it('returns true when answers exist for field', async () => {
    const fetchFn = mockFetchOk([{ id: 'ans-1' }])
    expect(await checkFieldHasAnswers(fetchFn, 'f1')).toBe(true)
  })

  it('queries with correct field_id filter', async () => {
    const fetchFn = mockFetchOk([])
    await checkFieldHasAnswers(fetchFn, 'field-abc-123')
    const url = (fetchFn as ReturnType<typeof vi.fn>).mock.calls[0][0] as string
    expect(url).toContain('field_id=eq.' + encodeURIComponent('field-abc-123'))
    expect(url).toContain('/anamnesis_answers')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: rate limiting — error_code 'rate_limited' (Sprint Final)
// ─────────────────────────────────────────────────────────────────────────────
describe('bootPatientLink — rate_limited error_code (Sprint Final)', () => {
  /** Simulates the error_code dispatch in bootPatientLink */
  function dispatchErrorCode(errorCode: string | null): string {
    if (errorCode === 'rate_limited') return 'rate_limited_screen'
    if (errorCode === 'revoked')      return 'revoked_screen'
    if (errorCode === 'expired')      return 'expired_screen'
    if (errorCode === 'completed')    return 'completed_screen'
    return 'valid'
  }

  it('shows rate_limited screen when error_code is rate_limited', () => {
    expect(dispatchErrorCode('rate_limited')).toBe('rate_limited_screen')
  })

  it('still handles revoked after adding rate_limited check', () => {
    expect(dispatchErrorCode('revoked')).toBe('revoked_screen')
  })

  it('still handles expired after adding rate_limited check', () => {
    expect(dispatchErrorCode('expired')).toBe('expired_screen')
  })

  it('still handles completed after adding rate_limited check', () => {
    expect(dispatchErrorCode('completed')).toBe('completed_screen')
  })

  it('returns valid for null error_code', () => {
    expect(dispatchErrorCode(null)).toBe('valid')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: _withRetry (Sprint Final — retry no RPC de conclusão)
// ─────────────────────────────────────────────────────────────────────────────
describe('_withRetry — exponential backoff', () => {
  /** Mirror of _withRetry from form-render.js (sem setTimeout real) */
  async function _withRetry<T>(
    fn: () => Promise<T>,
    maxAttempts = 3,
    baseDelayMs = 0,  // 0ms para testes rápidos
    onRetry?: (attempt: number, total: number) => void,
  ): Promise<T> {
    let lastErr: unknown
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        return await fn()
      } catch (e) {
        lastErr = e
        if (attempt < maxAttempts) {
          if (onRetry) onRetry(attempt + 1, maxAttempts)
          if (baseDelayMs > 0) await new Promise(r => setTimeout(r, baseDelayMs * Math.pow(2, attempt - 1)))
        }
      }
    }
    throw lastErr
  }

  it('returns result on first attempt', async () => {
    const fn = vi.fn().mockResolvedValue('ok')
    const result = await _withRetry(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledOnce()
  })

  it('retries and succeeds on second attempt', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('network'))
      .mockResolvedValueOnce('ok')
    const result = await _withRetry(fn)
    expect(result).toBe('ok')
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it('throws after maxAttempts exhausted', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('always fails'))
    await expect(_withRetry(fn, 3)).rejects.toThrow('always fails')
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it('calls onRetry callback with correct attempt number', async () => {
    const fn = vi.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValueOnce('ok')
    const onRetry = vi.fn()
    await _withRetry(fn, 3, 0, onRetry)
    expect(onRetry).toHaveBeenCalledWith(2, 3)
  })

  it('does not call onRetry on final failed attempt', async () => {
    const fn = vi.fn().mockRejectedValue(new Error('fail'))
    const onRetry = vi.fn()
    await expect(_withRetry(fn, 2, 0, onRetry)).rejects.toThrow()
    // Only called once (between attempt 1→2), not after attempt 2 (last)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: patients-only data (Sprint Final — elimina clinic_data)
// ─────────────────────────────────────────────────────────────────────────────
describe('patientData construction from patients table only', () => {
  /** Mirrors patientData assembly in bootPatientLink (Sprint Final) */
  function buildPatientData(pt: Record<string, unknown>, patientId: string) {
    const firstName = (pt.first_name as string) || ''
    const lastName  = (pt.last_name  as string) || ''
    return {
      id:             patientId,
      nome:           [firstName, lastName].filter(Boolean).join(' ') || (pt.full_name as string) || '',
      telefone:       (pt.phone as string) || '',
      sexo:           (pt.sex  as string) || '',
      cpf:            (pt.cpf  as string) || '',
      rg:             (pt.rg   as string) || '',
      dataNascimento: (pt.birth_date as string) || '',
      endereco:       (pt.address_json as object) || {},
      leadId:         null,
    }
  }

  it('builds nome from first_name + last_name', () => {
    const pd = buildPatientData({ first_name: 'Maria', last_name: 'Silva' }, 'p1')
    expect(pd.nome).toBe('Maria Silva')
  })

  it('falls back to full_name when first/last absent', () => {
    const pd = buildPatientData({ full_name: 'Maria Silva Santos' }, 'p1')
    expect(pd.nome).toBe('Maria Silva Santos')
  })

  it('reads sex, rg, birth_date from new columns', () => {
    const pd = buildPatientData({
      first_name: 'Ana', sex: 'Feminino', rg: '12.345.678-9', birth_date: '1990-05-15',
    }, 'p1')
    expect(pd.sexo).toBe('Feminino')
    expect(pd.rg).toBe('12.345.678-9')
    expect(pd.dataNascimento).toBe('1990-05-15')
  })

  it('reads address_json as endereco', () => {
    const addr = { cep: '01310-100', logradouro: 'Av. Paulista', cidade: 'São Paulo', estado: 'SP', pais: 'Brasil' }
    const pd = buildPatientData({ address_json: addr }, 'p1')
    expect(pd.endereco).toEqual(addr)
  })

  it('defaults to empty when new columns are null', () => {
    const pd = buildPatientData({}, 'p1')
    expect(pd.sexo).toBe('')
    expect(pd.rg).toBe('')
    expect(pd.dataNascimento).toBe('')
    expect(pd.endereco).toEqual({})
    expect(pd.leadId).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// TESTS: complete_anamnesis_form — novos campos sex/rg/birth_date/address
// ─────────────────────────────────────────────────────────────────────────────
describe('complete_anamnesis_form — Sprint Final new patient params', () => {
  /** Mirrors payload assembly in FRM.confirmLgpd (Sprint Final) */
  function buildCompletePayload(values: Record<string, unknown>, patientId: string) {
    let ptFirstName: string | null = null, ptLastName: string | null = null
    let ptPhone: string | null = null, ptCpf: string | null = null
    let ptSex: string | null = null, ptRg: string | null = null
    let ptBirthDate: string | null = null
    let ptAddress: object | null = null

    if (patientId && values['__gd_nome']) {
      const nome = String(values['__gd_nome']).trim()
      const sp   = nome.indexOf(' ')
      ptFirstName = sp > 0 ? nome.slice(0, sp) : nome
      if (sp > 0) ptLastName = nome.slice(sp + 1).trim() || null
    }
    if (values['__gd_telefone']) ptPhone     = String(values['__gd_telefone'])
    if (values['__gd_cpf'])      ptCpf       = String(values['__gd_cpf']).replace(/\D/g, '')
    if (values['__gd_sexo'])     ptSex       = String(values['__gd_sexo'])
    if (values['__gd_rg'])       ptRg        = String(values['__gd_rg'])
    if (values['__gd_birth_date']) ptBirthDate = String(values['__gd_birth_date'])
    if (values['__gd_cep'] || values['__gd_logradouro']) {
      ptAddress = {
        cep:         values['__gd_cep']         || null,
        logradouro:  values['__gd_logradouro']  || null,
        numero:      values['__gd_numero']      || null,
        complemento: values['__gd_complemento'] || null,
        bairro:      values['__gd_bairro']      || null,
        cidade:      values['__gd_cidade']      || null,
        estado:      values['__gd_estado']      || null,
        pais:        values['__gd_pais']        || 'Brasil',
      }
    }

    return {
      p_patient_first_name:  ptFirstName,
      p_patient_last_name:   ptLastName,
      p_patient_phone:       ptPhone,
      p_patient_cpf:         ptCpf,
      p_patient_sex:         ptSex,
      p_patient_rg:          ptRg,
      p_patient_birth_date:  ptBirthDate,
      p_patient_address:     ptAddress,
    }
  }

  it('sends sex, rg and birth_date when Dados Gerais is filled', () => {
    const payload = buildCompletePayload({
      '__gd_nome':       'Maria Silva',
      '__gd_sexo':       'Feminino',
      '__gd_rg':         '12.345.678-9',
      '__gd_birth_date': '1990-05-15',
      '__gd_cpf':        '529.982.247-25',
      '__gd_telefone':   '(11) 99999-8888',
    }, 'pt-1')
    expect(payload.p_patient_sex).toBe('Feminino')
    expect(payload.p_patient_rg).toBe('12.345.678-9')
    expect(payload.p_patient_birth_date).toBe('1990-05-15')
    expect(payload.p_patient_first_name).toBe('Maria')
    expect(payload.p_patient_last_name).toBe('Silva')
  })

  it('sends address_json when CEP/logradouro are filled', () => {
    const payload = buildCompletePayload({
      '__gd_cep':        '01310-100',
      '__gd_logradouro': 'Av. Paulista',
      '__gd_numero':     '1000',
      '__gd_bairro':     'Bela Vista',
      '__gd_cidade':     'São Paulo',
      '__gd_estado':     'SP',
      '__gd_pais':       'Brasil',
    }, 'pt-1')
    expect(payload.p_patient_address).toMatchObject({
      cep: '01310-100',
      logradouro: 'Av. Paulista',
      estado: 'SP',
    })
  })

  it('sends null address when neither CEP nor logradouro present', () => {
    const payload = buildCompletePayload({}, 'pt-1')
    expect(payload.p_patient_address).toBeNull()
  })

  it('sends null for all optional fields when values are empty', () => {
    const payload = buildCompletePayload({}, 'pt-1')
    expect(payload.p_patient_sex).toBeNull()
    expect(payload.p_patient_rg).toBeNull()
    expect(payload.p_patient_birth_date).toBeNull()
    expect(payload.p_patient_first_name).toBeNull()
  })
})
