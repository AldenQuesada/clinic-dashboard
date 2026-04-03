// tests/setup.ts
// Global test setup for ClinicAI form-render integration tests

import { afterEach, vi } from 'vitest'

// ── Reset mocks after each test ──────────────────────────────────────────────
afterEach(() => {
  vi.restoreAllMocks()
  sessionStorage.clear()
  localStorage.clear()
})
