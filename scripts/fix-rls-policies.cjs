const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== Corrigindo RLS Policies ===\n')

  // ── 1. REMOVER POLICIES PERIGOSAS ─────────────────

  // patients: remover allow_anon ALL true
  await client.query(`DROP POLICY IF EXISTS "patients_allow_anon" ON patients`)
  console.log('1. patients_allow_anon REMOVIDA')

  // clinic_data: allow_all → clinic-scoped (clinic_id e TEXT)
  await client.query(`DROP POLICY IF EXISTS "allow_all" ON clinic_data`)
  await client.query(`
    CREATE POLICY clinic_data_auth ON clinic_data
    FOR ALL USING (clinic_id = app_clinic_id()::text)
  `)
  console.log('2. clinic_data → clinic-scoped')

  // app_users: allow_anon → requer auth
  await client.query(`DROP POLICY IF EXISTS "app_users_allow_anon" ON app_users`)
  await client.query(`
    CREATE POLICY app_users_auth ON app_users
    FOR ALL USING (auth.uid() IS NOT NULL)
  `)
  console.log('3. app_users → requer auth')

  // audit_logs: allow_anon → auth leitura, insert livre
  await client.query(`DROP POLICY IF EXISTS "audit_logs_allow_anon" ON audit_logs`)
  await client.query(`
    CREATE POLICY audit_logs_select ON audit_logs
    FOR SELECT USING (auth.uid() IS NOT NULL)
  `)
  await client.query(`
    CREATE POLICY audit_logs_insert ON audit_logs
    FOR INSERT WITH CHECK (true)
  `)
  console.log('4. audit_logs → select auth, insert livre')

  // wa_auto_reply_templates: allow_all → clinic-scoped
  await client.query(`DROP POLICY IF EXISTS "auto_reply_templates_all" ON wa_auto_reply_templates`)
  await client.query(`
    CREATE POLICY wa_auto_reply_auth ON wa_auto_reply_templates
    FOR ALL USING (clinic_id = app_clinic_id())
  `)
  console.log('5. wa_auto_reply_templates → clinic-scoped')

  // clinics: allow_anon (ja tem clinic_members_can_read)
  await client.query(`DROP POLICY IF EXISTS "clinics_allow_anon" ON clinics`)
  console.log('6. clinics allow_anon REMOVIDA')

  // anamnesis_request_access_logs
  await client.query(`DROP POLICY IF EXISTS "anamnesis_request_access_logs_allow_anon" ON anamnesis_request_access_logs`)
  await client.query(`CREATE POLICY aral_insert ON anamnesis_request_access_logs FOR INSERT WITH CHECK (true)`)
  await client.query(`CREATE POLICY aral_select ON anamnesis_request_access_logs FOR SELECT USING (auth.uid() IS NOT NULL)`)
  console.log('7. anamnesis_request_access_logs → insert livre, select auth')

  // anamnesis_response_flags (precisa ser acessivel por anamnese publica)
  await client.query(`DROP POLICY IF EXISTS "anamnesis_response_flags_allow_anon" ON anamnesis_response_flags`)
  await client.query(`CREATE POLICY arf_all ON anamnesis_response_flags FOR ALL USING (true) WITH CHECK (true)`)
  console.log('8. anamnesis_response_flags → mantido aberto (anamnese publica)')

  // anamnesis_response_protocol_suggestions
  await client.query(`DROP POLICY IF EXISTS "anamnesis_response_protocol_suggestions_allow_anon" ON anamnesis_response_protocol_suggestions`)
  await client.query(`CREATE POLICY arps_all ON anamnesis_response_protocol_suggestions FOR ALL USING (true) WITH CHECK (true)`)
  console.log('9. anamnesis_response_protocol_suggestions → mantido aberto')

  // ── 2. HABILITAR RLS NAS TABELAS SEM ──────────────

  console.log('')
  const tables = [
    'ai_interactions', 'ai_personas', 'automation_flows', 'automation_logs',
    'broadcast_recipients', 'broadcasts', 'conversations',
    'facial_analyses', 'lead_tags', 'message_templates', 'messages',
    'procedures', 'tenants', 'users', 'wa_birthday_messages', 'whatsapp_instances'
  ]

  for (const t of tables) {
    try {
      await client.query(`ALTER TABLE public.${t} ENABLE ROW LEVEL SECURITY`)
      await client.query(`CREATE POLICY ${t}_auth ON public.${t} FOR ALL USING (auth.uid() IS NOT NULL) WITH CHECK (auth.uid() IS NOT NULL)`)
      console.log('RLS ON:', t)
    } catch (e) {
      console.log('SKIP', t, ':', e.message?.substring(0, 80))
    }
  }

  // ── 3. VERIFICAR ──────────────────────────────────

  console.log('\n=== RESULTADO ===')
  const r1 = await client.query(`
    SELECT tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (policyname LIKE '%allow_anon%' OR policyname LIKE '%allow_all%')
  `)
  console.log('Policies allow_anon/allow_all restantes:', r1.rows.length)
  r1.rows.forEach(row => console.log('  ', row.tablename, '|', row.policyname))

  const r2 = await client.query(`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND NOT rowsecurity
  `)
  console.log('\nTabelas sem RLS restantes:', r2.rows.length)
  r2.rows.forEach(row => console.log('  ', row.tablename))

  await client.end()
  console.log('\nSEGURANCA ATUALIZADA')
}
main().catch(err => { console.error(err); process.exit(1) })
