const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== FIX DEFINITIVO DE TELEFONE ===\n')

  // ══════════════════════════════════════════════════
  // 1. TRIGGER DE NORMALIZACAO — INSERT/UPDATE automatico
  // ══════════════════════════════════════════════════

  // Trigger function reutilizavel
  await client.query(`
    CREATE OR REPLACE FUNCTION trg_normalize_phone()
    RETURNS trigger
    LANGUAGE plpgsql
    AS $fn$
    DECLARE
      v_normalized text;
    BEGIN
      IF NEW.phone IS NOT NULL AND NEW.phone != '' THEN
        v_normalized := normalize_phone(NEW.phone);
        IF v_normalized IS NOT NULL THEN
          NEW.phone := v_normalized;
        END IF;
      END IF;
      RETURN NEW;
    END;
    $fn$
  `)
  console.log('1a. trg_normalize_phone() criada')

  // Aplicar em leads
  await client.query(`DROP TRIGGER IF EXISTS trg_leads_normalize_phone ON leads`)
  await client.query(`
    CREATE TRIGGER trg_leads_normalize_phone
    BEFORE INSERT OR UPDATE OF phone ON leads
    FOR EACH ROW EXECUTE FUNCTION trg_normalize_phone()
  `)
  console.log('1b. Trigger em leads')

  // Aplicar em wa_conversations
  await client.query(`DROP TRIGGER IF EXISTS trg_wa_conv_normalize_phone ON wa_conversations`)
  await client.query(`
    CREATE TRIGGER trg_wa_conv_normalize_phone
    BEFORE INSERT OR UPDATE OF phone ON wa_conversations
    FOR EACH ROW EXECUTE FUNCTION trg_normalize_phone()
  `)
  console.log('1c. Trigger em wa_conversations')

  // Aplicar em wa_outbox
  await client.query(`DROP TRIGGER IF EXISTS trg_wa_outbox_normalize_phone ON wa_outbox`)
  await client.query(`
    CREATE TRIGGER trg_wa_outbox_normalize_phone
    BEFORE INSERT OR UPDATE OF phone ON wa_outbox
    FOR EACH ROW EXECUTE FUNCTION trg_normalize_phone()
  `)
  console.log('1d. Trigger em wa_outbox')

  // Aplicar em wa_numbers
  await client.query(`DROP TRIGGER IF EXISTS trg_wa_numbers_normalize_phone ON wa_numbers`)
  await client.query(`
    CREATE TRIGGER trg_wa_numbers_normalize_phone
    BEFORE INSERT OR UPDATE OF phone ON wa_numbers
    FOR EACH ROW EXECUTE FUNCTION trg_normalize_phone()
  `)
  console.log('1e. Trigger em wa_numbers')

  // ══════════════════════════════════════════════════
  // 2. BACKFILL — normalizar todos os phones existentes
  // ══════════════════════════════════════════════════

  // Leads
  const r1 = await client.query(`
    UPDATE leads SET phone = normalize_phone(phone)
    WHERE phone IS NOT NULL AND phone != ''
      AND phone != normalize_phone(phone)
      AND deleted_at IS NULL
  `)
  console.log('\n2a. Leads normalizados:', r1.rowCount)

  // wa_conversations
  const r2 = await client.query(`
    UPDATE wa_conversations SET phone = normalize_phone(phone)
    WHERE phone IS NOT NULL
      AND phone != normalize_phone(phone)
  `)
  console.log('2b. Conversas normalizadas:', r2.rowCount)

  // wa_outbox
  const r3 = await client.query(`
    UPDATE wa_outbox SET phone = normalize_phone(phone)
    WHERE phone IS NOT NULL
      AND phone != normalize_phone(phone)
  `)
  console.log('2c. Outbox normalizados:', r3.rowCount)

  // ══════════════════════════════════════════════════
  // 3. MERGE CONVERSAS DUPLICADAS
  // ══════════════════════════════════════════════════

  const dups = await client.query(`
    SELECT phone, array_agg(id ORDER BY created_at ASC) as ids,
           array_agg(display_name ORDER BY created_at ASC) as names
    FROM wa_conversations
    WHERE status = 'active'
    GROUP BY phone
    HAVING count(*) > 1
  `)

  for (const dup of dups.rows) {
    const keepId = dup.ids[0] // manter a mais antiga
    const deleteIds = dup.ids.slice(1)

    // Mover mensagens pra conversa principal
    for (const delId of deleteIds) {
      await client.query(`
        UPDATE wa_messages SET conversation_id = $1
        WHERE conversation_id = $2
      `, [keepId, delId])
    }

    // Deletar conversas duplicadas
    await client.query(`
      DELETE FROM wa_conversations WHERE id = ANY($1)
    `, [deleteIds])

    console.log('3. Merged', dup.phone, ':', deleteIds.length, 'duplicatas → manteve', keepId.substring(0, 8))
  }

  // ══════════════════════════════════════════════════
  // 4. LIMPEZA DE DADOS DE TESTE
  // ══════════════════════════════════════════════════

  // Quiz events de teste (Mirian, Alden, pion, Name, Amanda, etc.)
  const r4 = await client.query(`
    DELETE FROM quiz_events
    WHERE contact_name IN ('Mirian', 'Mirian okiveira', 'Mirna', 'pion', 'Name', 'Amanda')
      OR contact_phone LIKE '%(43)%42424%'
      OR contact_phone LIKE '%(44) 54553%'
      OR contact_phone LIKE '%(49) 34034%'
    RETURNING contact_name
  `)
  console.log('\n4a. Quiz events de teste removidos:', r4.rowCount)

  // Appointment antigo da Mirian (02/04 nunca finalizado)
  const r5 = await client.query(`
    UPDATE appointments SET deleted_at = now()
    WHERE patient_name ILIKE '%mirian%'
      AND status = 'agendado'
      AND scheduled_date < '2026-04-05'
      AND deleted_at IS NULL
  `)
  console.log('4b. Appointments antigos soft-deleted:', r5.rowCount)

  // Outbox cancelados/failed antigos
  const r6 = await client.query(`
    DELETE FROM wa_outbox
    WHERE status IN ('cancelled', 'failed')
      AND created_at < now() - interval '7 days'
  `)
  console.log('4c. Outbox cancelados/failed antigos removidos:', r6.rowCount)

  // ══════════════════════════════════════════════════
  // 5. VERIFICACAO FINAL
  // ══════════════════════════════════════════════════

  console.log('\n=== VERIFICACAO FINAL ===')

  const v1 = await client.query(`
    SELECT count(*) FILTER (WHERE phone ~ '^55[0-9]{10,11}$') as ok,
           count(*) FILTER (WHERE NOT phone ~ '^55[0-9]{10,11}$') as bad
    FROM leads WHERE deleted_at IS NULL AND phone IS NOT NULL AND phone != ''
  `)
  console.log('Leads phones:', v1.rows[0])

  const v2 = await client.query(`
    SELECT count(*) FILTER (WHERE phone ~ '^55[0-9]{10,11}$') as ok,
           count(*) FILTER (WHERE NOT phone ~ '^55[0-9]{10,11}$') as bad
    FROM wa_conversations WHERE phone IS NOT NULL
  `)
  console.log('Conversas phones:', v2.rows[0])

  const v3 = await client.query(`
    SELECT phone, count(*) as qty
    FROM wa_conversations
    WHERE status = 'active'
    GROUP BY phone HAVING count(*) > 1
  `)
  console.log('Conversas duplicadas restantes:', v3.rows.length)

  // Testar que o trigger funciona
  const v4 = await client.query(`SELECT normalize_phone('(44) 99878-2003') as result`)
  console.log('\nTeste normalize_phone("(44) 99878-2003"):', v4.rows[0].result)

  await client.query("NOTIFY pgrst, 'reload schema'")
  await client.end()
  console.log('\n=== FIX DEFINITIVO COMPLETO ===')
}
main().catch(err => { console.error(err); process.exit(1) })
