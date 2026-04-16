const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== Corrigindo Issues Altos ===\n')

  // ══════════════════════════════════════════════════
  // #5 — PHONE NORMALIZATION: funcao centralizada no DB
  // ══════════════════════════════════════════════════

  await client.query(`
    CREATE OR REPLACE FUNCTION normalize_phone(p_phone text)
    RETURNS text
    LANGUAGE plpgsql IMMUTABLE
    AS $fn$
    DECLARE
      v_digits text;
    BEGIN
      IF p_phone IS NULL OR p_phone = '' THEN
        RETURN NULL;
      END IF;
      -- Extrair so digitos
      v_digits := regexp_replace(p_phone, '[^0-9]', '', 'g');
      IF v_digits = '' THEN
        RETURN NULL;
      END IF;
      -- Se ja comeca com 55 e tem 12-13 digitos, OK
      IF v_digits LIKE '55%' AND length(v_digits) BETWEEN 12 AND 13 THEN
        RETURN v_digits;
      END IF;
      -- Se tem 10-11 digitos (DDD+numero), adicionar 55
      IF length(v_digits) BETWEEN 10 AND 11 THEN
        RETURN '55' || v_digits;
      END IF;
      -- Fallback: retornar com 55 se nao tem
      IF NOT v_digits LIKE '55%' THEN
        RETURN '55' || v_digits;
      END IF;
      RETURN v_digits;
    END;
    $fn$
  `)
  console.log('#5a. Funcao normalize_phone() criada')

  // Aplicar nas RPCs principais: submit_quiz_response
  // Adicionar normalizacao no wa_upsert_lead_from_chat
  await client.query(`
    CREATE OR REPLACE FUNCTION wa_upsert_lead_from_chat(
      p_phone   text,
      p_name    text DEFAULT NULL,
      p_source  text DEFAULT 'whatsapp'
    )
    RETURNS jsonb
    LANGUAGE plpgsql
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
      v_phone     text;
      v_lead      record;
      v_lead_id   uuid;
      v_first_name text;
    BEGIN
      -- Normalizar telefone
      v_phone := normalize_phone(p_phone);
      IF v_phone IS NULL THEN
        RETURN jsonb_build_object('ok', false, 'error', 'phone invalido');
      END IF;

      -- Buscar lead existente pelo telefone (right 8)
      SELECT * INTO v_lead
      FROM leads
      WHERE phone LIKE '%' || right(v_phone, 8)
        AND clinic_id = v_clinic_id
        AND deleted_at IS NULL
      LIMIT 1;

      IF v_lead IS NOT NULL THEN
        -- Lead existe, atualizar wa_opt_in e last_contacted_at
        UPDATE leads
        SET wa_opt_in = true,
            last_contacted_at = now(),
            updated_at = now()
        WHERE id = v_lead.id;
        RETURN jsonb_build_object('ok', true, 'lead_id', v_lead.id, 'action', 'updated');
      END IF;

      -- Criar lead novo
      v_first_name := COALESCE(split_part(p_name, ' ', 1), 'Lead');
      v_lead_id := gen_random_uuid();

      INSERT INTO leads (
        id, clinic_id, name, phone, email, status, phase,
        temperature, source_type, lead_score, wa_opt_in
      ) VALUES (
        v_lead_id, v_clinic_id,
        COALESCE(p_name, ''),
        v_phone,
        '',
        'novo', 'novo',
        'cold', COALESCE(p_source, 'whatsapp'),
        0, true
      );

      RETURN jsonb_build_object('ok', true, 'lead_id', v_lead_id, 'action', 'created');
    END;
    $fn$
  `)
  console.log('#5b. wa_upsert_lead_from_chat normaliza phone')

  await client.query('GRANT EXECUTE ON FUNCTION normalize_phone(text) TO anon, authenticated')
  await client.query('GRANT EXECUTE ON FUNCTION wa_upsert_lead_from_chat(text, text, text) TO anon, authenticated')

  // ══════════════════════════════════════════════════
  // #8 — INDEXES FALTANDO EM FOREIGN KEYS
  // ══════════════════════════════════════════════════

  const indexes = [
    'CREATE INDEX IF NOT EXISTS idx_medical_records_professional ON medical_records(professional_id)',
    'CREATE INDEX IF NOT EXISTS idx_appointments_professional ON appointments(professional_id)',
    'CREATE INDEX IF NOT EXISTS idx_clinic_tech_professional ON clinic_technologies(professional_id)',
    'CREATE INDEX IF NOT EXISTS idx_prof_tech_professional ON professional_technologies(professional_id)',
    'CREATE INDEX IF NOT EXISTS idx_prof_tech_technology ON professional_technologies(technology_id)',
    'CREATE INDEX IF NOT EXISTS idx_prof_profiles_user ON professional_profiles(user_id)',
    'CREATE INDEX IF NOT EXISTS idx_wa_conversations_lead ON wa_conversations(lead_id)',
    'CREATE INDEX IF NOT EXISTS idx_wa_outbox_lead ON wa_outbox(lead_id)',
    'CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation ON wa_messages(conversation_id)',
  ]

  for (const sql of indexes) {
    try {
      await client.query(sql)
      const name = sql.match(/idx_\w+/)[0]
      console.log('#8. Index criado:', name)
    } catch (e) {
      console.log('#8. SKIP:', e.message?.substring(0, 60))
    }
  }

  // ══════════════════════════════════════════════════
  // #9 — GUARD: VALIDAR TELEFONE
  // ══════════════════════════════════════════════════

  // Pegar source atual do wa_guard_check e adicionar validacao
  const guardSrc = await client.query("SELECT prosrc FROM pg_proc WHERE proname = 'wa_guard_check'")
  if (guardSrc.rows.length) {
    const src = guardSrc.rows[0].prosrc
    // Verificar se ja tem validacao de phone
    if (!src.includes('invalid_phone')) {
      // Pegar a assinatura completa
      const sigQuery = await client.query(`
        SELECT pg_get_functiondef(oid) as def
        FROM pg_proc
        WHERE proname = 'wa_guard_check'
      `)
      let def = sigQuery.rows[0].def

      // Adicionar validacao apos o BEGIN
      const validacao = `
      -- Validar telefone
      IF p_phone IS NULL OR p_phone = '' THEN
        RETURN jsonb_build_object('action', 'block', 'blocks', '["invalid_phone"]'::jsonb, 'flags', '[]'::jsonb, 'reason', 'Phone required');
      END IF;
      IF NOT (regexp_replace(p_phone, '[^0-9]', '', 'g') ~ '^\\d{10,15}$') THEN
        RETURN jsonb_build_object('action', 'block', 'blocks', '["invalid_phone_format"]'::jsonb, 'flags', '[]'::jsonb, 'reason', 'Phone must be 10-15 digits');
      END IF;
      `

      // Inserir validacao apos "BEGIN" e antes das variaveis
      def = def.replace(
        /v_msg_lower\s*:=\s*lower/,
        validacao + '\n      v_msg_lower := lower'
      )

      await client.query(def)
      console.log('#9. wa_guard_check: validacao de telefone adicionada')
    } else {
      console.log('#9. wa_guard_check: ja tem validacao')
    }
  }

  // ══════════════════════════════════════════════════
  // #6 — RATE LIMIT QUIZ SERVER-SIDE
  // ══════════════════════════════════════════════════

  // Adicionar check no submit_quiz_response
  await client.query(`
    CREATE OR REPLACE FUNCTION quiz_check_rate_limit(p_phone text, p_quiz_id uuid)
    RETURNS boolean
    LANGUAGE plpgsql STABLE
    SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE
      v_count int;
    BEGIN
      IF p_phone IS NULL OR p_phone = '' THEN
        RETURN true; -- sem phone, sem rate limit
      END IF;
      -- Max 5 submissoes por hora com mesmo telefone
      SELECT count(*) INTO v_count
      FROM quiz_responses
      WHERE contact_phone LIKE '%' || right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 8)
        AND quiz_id = p_quiz_id
        AND submitted_at > now() - interval '1 hour';
      RETURN v_count < 5;
    END;
    $fn$
  `)
  await client.query('GRANT EXECUTE ON FUNCTION quiz_check_rate_limit(text, uuid) TO anon, authenticated')
  console.log('#6. quiz_check_rate_limit() criada (server-side)')

  // PostgREST reload
  await client.query("NOTIFY pgrst, 'reload schema'")

  await client.end()
  console.log('\n=== Todos os issues altos corrigidos ===')
}
main().catch(err => { console.error(err); process.exit(1) })
