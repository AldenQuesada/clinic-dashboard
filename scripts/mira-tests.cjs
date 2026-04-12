#!/usr/bin/env node
/**
 * Mira Test Suite — cobre RPCs via pg direto + REST.
 *
 * Uso:
 *   node scripts/mira-tests.cjs
 *   node scripts/mira-tests.cjs --only=handle_message
 *
 * Sai com exit code 0 se todos passarem, 1 se qualquer falhar.
 *
 * Substitutes pgTAP (extension não habilitada). Pode rodar em CI.
 */

const pg = require('pg');

const DB = {
  host: process.env.SUPABASE_DB_HOST || 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432,
  user: 'postgres',
  password: process.env.SUPABASE_DB_PASSWORD || 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
};

// Profissionais pra teste
const ALDEN_FULL = '5544998787673';   // scope=full
const MIRIAN_OWN = '554498782003';    // scope=own
const UNKNOWN    = '5511999888777';   // nao cadastrado

let pass = 0, fail = 0;
const failures = [];

let _resetRateLimit = null;
async function test(name, fn) {
  try {
    if (_resetRateLimit) await _resetRateLimit();
    await fn();
    pass++;
    console.log(' ✓', name);
  } catch (e) {
    fail++;
    failures.push({ name, error: e.message });
    console.log(' ✗', name);
    console.log('   →', e.message.slice(0, 150));
  }
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg || 'assertion failed');
}

function assertEq(actual, expected, msg) {
  if (actual !== expected) throw new Error((msg || 'not equal') + ': expected ' + JSON.stringify(expected) + ', got ' + JSON.stringify(actual));
}

function assertIncludes(haystack, needle, msg) {
  if (!String(haystack).includes(needle)) throw new Error((msg || 'does not include') + ': "' + needle + '" not in "' + String(haystack).slice(0, 100) + '"');
}

(async () => {
  const c = new pg.Client(DB);
  await c.connect();

  async function rpc(name, params = {}) {
    const keys = Object.keys(params);
    const vals = keys.map((_, i) => '$' + (i + 1));
    const assigns = keys.map((k, i) => `${k} := $${i + 1}`).join(', ');
    const r = await c.query(`SELECT ${name}(${assigns}) as r`, Object.values(params));
    return r.rows[0].r;
  }

  console.log('\n━━━ Mira Test Suite ━━━\n');

  async function resetRateLimit() {
    await c.query(`UPDATE wa_pro_rate_limit SET query_count = 0, minute_count = 0, minute_window_start = null, max_per_day = 99999 WHERE date = (now() AT TIME ZONE 'America/Sao_Paulo')::date`);
    // Ensure row exists for both test professionals even if not yet created today
    await c.query(`
      INSERT INTO wa_pro_rate_limit (clinic_id, professional_id, date, query_count, minute_count, max_per_day)
      SELECT '00000000-0000-0000-0000-000000000001'::uuid, professional_id, (now() AT TIME ZONE 'America/Sao_Paulo')::date, 0, 0, 99999
      FROM wa_numbers WHERE number_type = 'professional_private'
      ON CONFLICT (clinic_id, professional_id, date) DO UPDATE SET query_count = 0, minute_count = 0, minute_window_start = null, max_per_day = 99999
    `);
  }
  async function resetState() {
    await resetRateLimit();
    await c.query(`DELETE FROM wa_pro_context`);
    await c.query(`UPDATE wa_numbers SET permissions = jsonb_set(COALESCE(permissions, '{}'::jsonb), '{markdown}', 'true'::jsonb) WHERE number_type = 'professional_private'`);
  }
  _resetRateLimit = resetRateLimit;
  await resetState();
  console.log('(state reset: rate_limit + context + markdown=true)\n');

  // ========================================
  // GROUP: Auth / Resolve
  // ========================================
  console.log('auth / resolve');

  await test('authenticate: numero conhecido full scope', async () => {
    const r = await rpc('wa_pro_authenticate', { p_phone: ALDEN_FULL });
    assertEq(r.ok, true, 'ok');
    assertEq(r.access_scope, 'full', 'scope');
    assert(r.professional_id, 'professional_id presente');
  });

  await test('authenticate: numero conhecido scope own', async () => {
    const r = await rpc('wa_pro_authenticate', { p_phone: MIRIAN_OWN });
    assertEq(r.ok, true, 'ok');
    assertEq(r.access_scope, 'own', 'scope');
  });

  await test('authenticate: numero desconhecido', async () => {
    const r = await rpc('wa_pro_authenticate', { p_phone: UNKNOWN });
    assertEq(r.ok, false, 'ok=false');
    assertEq(r.error, 'unauthorized', 'error=unauthorized');
  });

  await test('authenticate: right(8) compat 9 extra BR', async () => {
    // 554498787673 (sem 9) vs 5544998787673 (com 9) — last 8 identicos
    const r = await rpc('wa_pro_authenticate', { p_phone: '554498787673' });
    assertEq(r.ok, true, 'right(8) compat');
  });

  // ========================================
  // GROUP: Patient Search (fuzzy + scope)
  // ========================================
  console.log('\npatient_search');

  await test('patient_search: exact match', async () => {
    const r = await rpc('wa_pro_patient_search', { p_phone: ALDEN_FULL, p_query: 'Josceli', p_limit: 5 });
    assertEq(r.ok, true);
    assert(r.results.length > 0, 'tem results');
    assertIncludes(r.results[0].name, 'Josceli');
  });

  await test('patient_search: fuzzy typo', async () => {
    const r = await rpc('wa_pro_patient_search', { p_phone: ALDEN_FULL, p_query: 'Joscely', p_limit: 5 });
    assertEq(r.ok, true);
    assert(r.results.length > 0, 'fuzzy achou match');
    assert(r.results[0].score > 0.5, 'score >= 0.5');
  });

  await test('patient_search: query curta rejeita', async () => {
    const r = await rpc('wa_pro_patient_search', { p_phone: ALDEN_FULL, p_query: 'a', p_limit: 5 });
    assertEq(r.ok, false);
    assertEq(r.error, 'query_too_short');
  });

  await test('patient_search: scope own filtra via appointments', async () => {
    const rFull = await rpc('wa_pro_patient_search', { p_phone: ALDEN_FULL, p_query: 'Maria', p_limit: 10 });
    const rOwn  = await rpc('wa_pro_patient_search', { p_phone: MIRIAN_OWN, p_query: 'Maria', p_limit: 10 });
    assert(rFull.results.length >= rOwn.results.length, 'full >= own');
  });

  await test('patient_search: unauthorized retorna error', async () => {
    const r = await rpc('wa_pro_patient_search', { p_phone: UNKNOWN, p_query: 'Maria', p_limit: 5 });
    assertEq(r.ok, false);
    assertEq(r.error, 'unauthorized');
  });

  // ========================================
  // GROUP: Patient Balance (multi-match)
  // ========================================
  console.log('\npatient_balance');

  await test('patient_balance: single match retorna saldo', async () => {
    const r = await rpc('wa_pro_patient_balance', { p_phone: ALDEN_FULL, p_patient_query: 'Josceli Aparecida Marchiori' });
    assertEq(r.ok, true);
    assert(!r.multiple_matches, 'single match');
    assert(r.patient, 'tem patient');
    assertIncludes(r.patient.name, 'Josceli');
  });

  await test('patient_balance: multi match retorna lista', async () => {
    const r = await rpc('wa_pro_patient_balance', { p_phone: ALDEN_FULL, p_patient_query: 'Maria' });
    assertEq(r.ok, true);
    assertEq(r.multiple_matches, true, 'multi');
    assert(Array.isArray(r.matches), 'matches array');
    assert(r.matches.length > 1, '>1 matches');
  });

  await test('patient_balance: not found', async () => {
    const r = await rpc('wa_pro_patient_balance', { p_phone: ALDEN_FULL, p_patient_query: 'ZZYYXXNonExistent' });
    assertEq(r.ok, false);
    assertEq(r.error, 'patient_not_found');
  });

  // ========================================
  // GROUP: Agenda
  // ========================================
  console.log('\nagenda');

  await test('agenda: hoje retorna estrutura', async () => {
    const r = await rpc('wa_pro_agenda', { p_phone: ALDEN_FULL, p_date: '2026-04-11' });
    assertEq(r.ok, true);
    assert('total' in r, 'total field');
    assert(Array.isArray(r.appointments), 'appointments array');
  });

  await test('agenda_free_slots: retorna busy', async () => {
    const r = await rpc('wa_pro_agenda_free_slots', { p_phone: ALDEN_FULL, p_date: '2026-04-11' });
    assertEq(r.ok, true);
    assert(Array.isArray(r.busy), 'busy array');
  });

  // ========================================
  // GROUP: Finance
  // ========================================
  console.log('\nfinance');

  await test('finance_summary: periodo valido', async () => {
    const r = await rpc('wa_pro_finance_summary', { p_phone: ALDEN_FULL, p_start_date: '2026-04-01', p_end_date: '2026-04-30' });
    assertEq(r.ok, true);
    assert('bruto' in r, 'bruto field');
    assert('qtd' in r, 'qtd field');
  });

  await test('finance_commission: retorna bruto+comissao', async () => {
    const r = await rpc('wa_pro_finance_commission', { p_phone: ALDEN_FULL, p_start_date: '2026-04-01', p_end_date: '2026-04-30' });
    assertEq(r.ok, true);
    assert('bruto' in r, 'bruto field');
  });

  await test('recent_payments: lista com total', async () => {
    const r = await rpc('wa_pro_recent_payments', { p_phone: ALDEN_FULL, p_start_date: '2026-04-01', p_end_date: '2026-04-30' });
    assertEq(r.ok, true);
    assert(Array.isArray(r.payments), 'payments array');
    assert('sum' in r, 'sum field');
  });

  // ========================================
  // GROUP: handle_message (SSOT)
  // ========================================
  console.log('\nhandle_message (SSOT)');

  await test('handle_message: /ajuda retorna help', async () => {
    const r = await rpc('wa_pro_handle_message', { p_phone: ALDEN_FULL, p_text: '/ajuda' });
    assertEq(r.intent, 'help');
    assertIncludes(r.response, '👋');
    assert(r.quota, 'quota presente');
  });

  await test('handle_message: agenda hoje', async () => {
    const r = await rpc('wa_pro_handle_message', { p_phone: ALDEN_FULL, p_text: 'tenho agenda hoje?' });
    assertEq(r.intent, 'agenda_today');
    assertIncludes(r.response, '📅');
  });

  await test('handle_message: receita semana', async () => {
    const r = await rpc('wa_pro_handle_message', { p_phone: ALDEN_FULL, p_text: 'quanto faturei essa semana' });
    assertEq(r.intent, 'finance_revenue');
    assertIncludes(r.response, 'R$');
  });

  await test('handle_message: quota', async () => {
    const r = await rpc('wa_pro_handle_message', { p_phone: ALDEN_FULL, p_text: 'minha quota' });
    assertEq(r.intent, 'quota');
    assertIncludes(r.response, 'Usadas');
  });

  await test('handle_message: sanitiza input longo', async () => {
    const longText = 'ajuda ' + 'x'.repeat(2000);
    const r = await rpc('wa_pro_handle_message', { p_phone: ALDEN_FULL, p_text: longText });
    assert(r.ok !== undefined, 'nao explode');
  });

  await test('handle_message: unauthorized', async () => {
    const r = await rpc('wa_pro_handle_message', { p_phone: UNKNOWN, p_text: '/ajuda' });
    assertEq(r.ok, false);
    assertEq(r.intent, 'unauthorized');
  });

  await test('handle_message: patient_balance multi-match', async () => {
    await c.query("DELETE FROM wa_pro_context WHERE phone = $1", [ALDEN_FULL]);
    const r = await rpc('wa_pro_handle_message', { p_phone: ALDEN_FULL, p_text: 'quanto a Maria me deve' });
    assert(r.intent === 'patient_balance' || r.intent === 'patient_balance_disambig', 'intent: ' + r.intent);
    assertIncludes(r.response, 'Encontrei');
  });

  await test('handle_message: multi-turn resolve "2"', async () => {
    await c.query("DELETE FROM wa_pro_context WHERE phone = $1", [ALDEN_FULL]);
    await rpc('wa_pro_handle_message', { p_phone: ALDEN_FULL, p_text: 'quanto a Maria me deve' });
    const r = await rpc('wa_pro_handle_message', { p_phone: ALDEN_FULL, p_text: '2' });
    assertEq(r.intent, 'patient_balance');
    assertIncludes(r.response, 'Saldo');
    assertEq(r.resolved_from_context, true);
  });

  await test('handle_message: multi-turn resolve "primeira"', async () => {
    await c.query("DELETE FROM wa_pro_context WHERE phone = $1", [ALDEN_FULL]);
    await rpc('wa_pro_handle_message', { p_phone: ALDEN_FULL, p_text: 'quanto a Maria me deve' });
    const r = await rpc('wa_pro_handle_message', { p_phone: ALDEN_FULL, p_text: 'primeira' });
    assertEq(r.intent, 'patient_balance');
    assertIncludes(r.response, 'Saldo');
  });

  await test('handle_message: unknown cai em formatUnknown', async () => {
    await resetState();
    const r = await rpc('wa_pro_handle_message', { p_phone: ALDEN_FULL, p_text: 'abracadabra' });
    assertEq(r.intent, 'unknown');
  });

  // ========================================
  // GROUP: Context
  // ========================================
  console.log('\ncontext');

  await test('context: salva apos handle_message', async () => {
    await c.query('DELETE FROM wa_pro_context WHERE phone = $1', [ALDEN_FULL]);
    await rpc('wa_pro_handle_message', { p_phone: ALDEN_FULL, p_text: '/ajuda' });
    const r = await c.query('SELECT last_intent, turns FROM wa_pro_context WHERE phone = $1', [ALDEN_FULL]);
    assert(r.rows.length > 0, 'context row existe');
    assertEq(r.rows[0].last_intent, 'help');
  });

  // ========================================
  // GROUP: Audit log
  // ========================================
  console.log('\naudit_log');

  await test('audit_log: response_ms populado', async () => {
    await rpc('wa_pro_handle_message', { p_phone: ALDEN_FULL, p_text: 'tenho agenda hoje' });
    const r = await c.query("SELECT response_ms FROM wa_pro_audit_log WHERE phone = $1 AND intent = 'agenda_today' ORDER BY created_at DESC LIMIT 1", [ALDEN_FULL]);
    assert(r.rows.length > 0, 'log row');
    assert(r.rows[0].response_ms !== null, 'response_ms nao null');
  });

  // ========================================
  // GROUP: Quota RPC
  // ========================================
  console.log('\nquota');

  await test('my_quota: retorna estrutura completa', async () => {
    const r = await rpc('wa_pro_my_quota', { p_phone: ALDEN_FULL });
    assertEq(r.ok, true);
    assert('day_used' in r);
    assert('day_max' in r);
    assert('day_remaining' in r);
  });

  // ========================================
  // GROUP: Tier 2 (execute_tool)
  // ========================================
  console.log('\ntier 2 execute_tool');

  await test('execute_tool: get_agenda hoje', async () => {
    const r = await rpc('wa_pro_execute_tool', { p_phone: ALDEN_FULL, p_tool_name: 'get_agenda', p_args: { date_offset: 0 } });
    assertEq(r.ok, true);
    assertIncludes(r.response, 'Agenda');
  });

  await test('execute_tool: list_payments ontem (period custom)', async () => {
    const r = await rpc('wa_pro_execute_tool', { p_phone: ALDEN_FULL, p_tool_name: 'list_payments', p_args: { period: 'ontem' } });
    assertEq(r.ok, true);
    assertIncludes(r.response, 'ontem');
  });

  await test('execute_tool: list_payments semana_passada', async () => {
    const r = await rpc('wa_pro_execute_tool', { p_phone: ALDEN_FULL, p_tool_name: 'list_payments', p_args: { period: 'semana_passada' } });
    assertEq(r.ok, true);
    assertIncludes(r.response, 'passada');
  });

  await test('execute_tool: tool desconhecida', async () => {
    const r = await rpc('wa_pro_execute_tool', { p_phone: ALDEN_FULL, p_tool_name: 'foo_bar', p_args: {} });
    assertEq(r.ok, true);
    assertIncludes(r.response, 'desconhecida');
  });

  await test('execute_tool: unauthorized', async () => {
    const r = await rpc('wa_pro_execute_tool', { p_phone: UNKNOWN, p_tool_name: 'get_agenda', p_args: {} });
    assertEq(r.ok, false);
  });

  // ========================================
  // GROUP: Markdown toggle (F12)
  // ========================================
  console.log('\nmarkdown toggle');

  await test('markdown default ON → response tem asteriscos', async () => {
    await resetState();
    const r = await rpc('wa_pro_handle_message', { p_phone: ALDEN_FULL, p_text: '/ajuda' });
    assert(r.response.includes('*'), 'asteriscos presentes');
  });

  await test('markdown OFF → response sem asteriscos', async () => {
    await c.query("UPDATE wa_numbers SET permissions = jsonb_set(COALESCE(permissions,'{}'::jsonb), '{markdown}', 'false'::jsonb) WHERE phone = $1", [ALDEN_FULL]);
    try {
      const r = await rpc('wa_pro_handle_message', { p_phone: ALDEN_FULL, p_text: '/ajuda' });
      assert(!r.response.includes('*'), 'sem asteriscos');
    } finally {
      await c.query("UPDATE wa_numbers SET permissions = jsonb_set(permissions, '{markdown}', 'true'::jsonb) WHERE phone = $1", [ALDEN_FULL]);
    }
  });

  // ========================================
  // GROUP: RLS hardening (F8)
  // ========================================
  console.log('\nrls hardening');

  await test('anon bloqueado de SELECT direto wa_pro_audit_log', async () => {
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0';
    const res = await fetch('https://oqboitkpcvuaudouwvkl.supabase.co/rest/v1/wa_pro_audit_log?select=*&limit=1', {
      headers: { apikey: anonKey, Authorization: 'Bearer ' + anonKey },
    });
    const body = await res.json();
    assert(body.code === '42501' || res.status === 401 || res.status === 403, 'anon deve receber permission denied. Got: ' + JSON.stringify(body).slice(0, 100));
  });

  await test('anon chama RPC handle_message (bypass RLS via SECURITY DEFINER)', async () => {
    await c.query('UPDATE wa_pro_rate_limit SET query_count = 0, minute_count = 0, minute_window_start = null WHERE date = CURRENT_DATE');
    const anonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0';
    const res = await fetch('https://oqboitkpcvuaudouwvkl.supabase.co/rest/v1/rpc/wa_pro_handle_message', {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: 'Bearer ' + anonKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_phone: ALDEN_FULL, p_text: '/ajuda' }),
    });
    const body = await res.json();
    assert(res.status === 200, 'HTTP 200 (nao permission denied)');
    assert(body.response, 'response presente (nao bloqueio RLS)');
    assert(body.intent === 'help' || body.intent === 'rate_limited_minute', 'intent valido, got: ' + body.intent);
  });

  // ========================================
  // Resultado
  // ========================================
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`✓ ${pass} passed   ✗ ${fail} failed`);
  if (failures.length) {
    console.log('\nFalhas:');
    failures.forEach(f => console.log('  •', f.name, '→', f.error));
  }

  await c.end();
  process.exit(fail > 0 ? 1 : 0);
})();
