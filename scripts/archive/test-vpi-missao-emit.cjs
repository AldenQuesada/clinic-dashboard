/**
 * Teste sintetico: VPI Missao Emit Reward.
 *
 * Escopo:
 *   1. Pega 1 partner existente.
 *   2. Cria uma missao temporaria (valid_until curto).
 *   3. Insere vpi_missao_progresso com completed_at=now() e
 *      recompensa_emitida=false.
 *   4. Verifica que:
 *      - Trigger AFTER INSERT disparou vpi_emit_missao_reward
 *      - recompensa_emitida virou true
 *      - wa_outbox recebeu INSERT
 *      - vpi_audit_log tem missao_reward_emitted
 *   5. Limpa artefatos (DELETE).
 *
 * Uso: node scripts/archive/test-vpi-missao-emit.cjs
 */
const { Client } = require('pg')
const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const client = new Client({
  host:     'aws-0-us-west-2.pooler.supabase.com',
  port:     5432,
  user:     'postgres.oqboitkpcvuaudouwvkl',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl:      { rejectUnauthorized: false },
})

async function main() {
  console.log('=== Teste VPI Missao Emit Reward ===\n')
  await client.connect()

  // 1. Partner com phone
  const p = await client.query(`
    SELECT id, nome, phone, clinic_id
      FROM public.vpi_partners
     WHERE phone IS NOT NULL AND length(phone) >= 10
     ORDER BY created_at DESC
     LIMIT 1
  `)
  if (!p.rows.length) {
    console.log('SKIP: sem partner com phone. Crie um antes de rodar o teste.')
    await client.end()
    return
  }
  const partner = p.rows[0]
  console.log('Partner teste:', partner.nome, '| phone:', partner.phone)

  // 2. Missao temporaria (titulo suficientemente unico)
  const ts = Date.now()
  const missaoTitulo = 'TEST_MISSAO_EMIT_' + ts
  const mk = await client.query(`
    INSERT INTO public.vpi_missoes (
      clinic_id, titulo, descricao, criterio, recompensa_texto,
      recompensa_valor, msg_template_sucesso, valid_from, valid_until,
      is_active, sort_order
    ) VALUES (
      $1,
      $2,
      'Teste sintetico de emissao - gera e apaga',
      '{"tipo":"indicacoes_fechadas","quantidade":1,"periodo":"7d"}'::jsonb,
      'Kit teste R$1',
      1,
      'Parabens {{nome}}! Missao {{missao_titulo}} completa = {{recompensa_texto}} (teste, ignore).',
      now(),
      now() + interval '1 hour',
      true,
      9999
    )
    RETURNING id
  `, [partner.clinic_id, missaoTitulo])
  const missaoId = mk.rows[0].id
  console.log('Missao teste criada:', missaoId)

  // Contadores antes
  const before = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public.wa_outbox WHERE lead_id = $1::text) AS outbox_leads,
      (SELECT COUNT(*)::int FROM public.vpi_audit_log
        WHERE entity_type='vpi_missao_progresso'
          AND action='missao_reward_emitted'
          AND (payload->>'missao_id')::uuid = $2::uuid) AS audit_emitted
  `, [partner.id, missaoId])
  console.log('\nAntes: outbox p/lead =', before.rows[0].outbox_leads,
              '| audit emitted =', before.rows[0].audit_emitted)

  // 3. INSERT progresso ja completo -> trigger AFTER INSERT deve disparar
  const prog = await client.query(`
    INSERT INTO public.vpi_missao_progresso (
      clinic_id, partner_id, missao_id, progresso_atual, target,
      completed_at, recompensa_emitida
    ) VALUES ($1, $2, $3, 1, 1, now(), false)
    RETURNING id
  `, [partner.clinic_id, partner.id, missaoId])
  const progId = prog.rows[0].id
  console.log('Progresso inserido com completed_at=now():', progId)

  // Espera breve (trigger e sincrono mas a pool pode ter overhead)
  await new Promise(r => setTimeout(r, 500))

  // 4. Verifica estado
  const verify = await client.query(`
    SELECT recompensa_emitida, recompensa_emitida_at
      FROM public.vpi_missao_progresso
     WHERE id = $1
  `, [progId])
  const row = verify.rows[0]
  console.log('\nApos INSERT:')
  console.log('  - recompensa_emitida   :', row.recompensa_emitida)
  console.log('  - recompensa_emitida_at:', row.recompensa_emitida_at)

  const after = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM public.wa_outbox
        WHERE lead_id = $1::text
          AND created_at >= now() - interval '1 minute') AS outbox_new,
      (SELECT COUNT(*)::int FROM public.vpi_audit_log
        WHERE entity_type='vpi_missao_progresso'
          AND action='missao_reward_emitted'
          AND (payload->>'missao_id')::uuid = $2::uuid) AS audit_emitted,
      (SELECT content FROM public.wa_outbox
        WHERE lead_id = $1::text
        ORDER BY created_at DESC LIMIT 1) AS last_content
  `, [partner.id, missaoId])
  console.log('  - wa_outbox novo       :', after.rows[0].outbox_new)
  console.log('  - audit emitted       :', after.rows[0].audit_emitted)
  if (after.rows[0].last_content) {
    console.log('  - content preview     :', after.rows[0].last_content.slice(0, 120))
  }

  // Teste idempotencia: chamar RPC direto de novo nao deve re-enfileirar
  const again = await client.query(
    `SELECT public.vpi_emit_missao_reward($1::uuid) AS r`,
    [progId]
  )
  console.log('\nSegunda chamada (deve ser skip):', JSON.stringify(again.rows[0].r))

  // 5. Cleanup
  console.log('\n--- Cleanup ---')
  // Apaga o outbox gerado pelo teste primeiro (FK nao existe, mas mantemos limpo)
  const delOutbox = await client.query(`
    DELETE FROM public.wa_outbox
     WHERE lead_id = $1::text
       AND created_at >= now() - interval '2 minutes'
       AND content LIKE '%TEST_MISSAO_EMIT_${ts}%'
  `, [partner.id])
  console.log('wa_outbox deletados:', delOutbox.rowCount)

  await client.query(`DELETE FROM public.vpi_missao_progresso WHERE id = $1`, [progId])
  await client.query(`DELETE FROM public.vpi_missoes WHERE id = $1`, [missaoId])
  await client.query(
    `DELETE FROM public.vpi_audit_log
      WHERE entity_type='vpi_missao_progresso'
        AND (payload->>'missao_id')::uuid = $1::uuid`,
    [missaoId]
  )
  console.log('Missao + progresso + audit removidos.')

  // Veredito
  const okEmitted = row.recompensa_emitida === true
  const okOutbox  = (after.rows[0].outbox_new || 0) >= 1
  const okAudit   = (after.rows[0].audit_emitted || 0) >= 1

  console.log('\n=== VEREDITO ===')
  console.log('  emitida          :', okEmitted ? 'OK' : 'FAIL')
  console.log('  outbox inserido  :', okOutbox ? 'OK' : 'FAIL')
  console.log('  audit registrado :', okAudit ? 'OK' : 'FAIL')
  console.log((okEmitted && okOutbox && okAudit) ? '\nPASS\n' : '\nFAIL\n')

  await client.end()
}

main().catch(e => { console.error(e); process.exit(1) })
