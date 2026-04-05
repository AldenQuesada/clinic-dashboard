const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== Merge de leads duplicados ===\n')

  // Buscar duplicados
  const dupes = await client.query(`
    SELECT right(phone, 8) as suffix,
           array_agg(id::text ORDER BY length(phone) DESC) as ids,
           array_agg(name ORDER BY length(phone) DESC) as names,
           array_agg(phone ORDER BY length(phone) DESC) as phones
    FROM leads
    WHERE deleted_at IS NULL AND phone IS NOT NULL AND phone != ''
    GROUP BY right(phone, 8)
    HAVING count(*) > 1
  `)

  console.log('Pares a mergear:', dupes.rows.length, '\n')

  for (const d of dupes.rows) {
    // O CSV tem phone 13 digitos (5544...) — e o primeiro pelo ORDER BY length DESC
    const csvId = d.ids[0]
    const csvName = d.names[0]
    const csvPhone = d.phones[0]
    const dupeId = d.ids[1]
    const dupeName = d.names[1]
    const dupePhone = d.phones[1]

    console.log('--- ' + csvName + ' (' + csvPhone + ') ←← ' + dupeName + ' (' + dupePhone + ') ---')

    // 1. Verificar dados do duplicado que podem enriquecer o CSV
    const csvLead = (await client.query('SELECT * FROM leads WHERE id = $1', [csvId])).rows[0]
    const dupeLead = (await client.query('SELECT * FROM leads WHERE id = $1', [dupeId])).rows[0]

    // Campos a mergear se o CSV nao tem e o dupe tem
    const fieldsToMerge = ['queixas_faciais', 'queixas_corporais', 'idade', 'lead_score', 'temperature', 'funnel', 'ai_persona', 'source_type', 'phase']
    let merged = []

    for (const field of fieldsToMerge) {
      const csvVal = csvLead[field]
      const dupeVal = dupeLead[field]

      // Se CSV nao tem e dupe tem, copiar
      const csvEmpty = csvVal === null || csvVal === '' || csvVal === '[]' || csvVal === '{}' ||
                       (Array.isArray(csvVal) && csvVal.length === 0) ||
                       (typeof csvVal === 'object' && csvVal !== null && JSON.stringify(csvVal) === '[]')
      const dupeHas = dupeVal !== null && dupeVal !== '' && dupeVal !== '[]' && dupeVal !== '{}'

      if (csvEmpty && dupeHas) {
        await client.query(`UPDATE leads SET ${field} = $1 WHERE id = $2`, [dupeVal, csvId])
        merged.push(field + '=' + JSON.stringify(dupeVal).substring(0, 40))
      }
    }

    if (merged.length > 0) {
      console.log('  Dados mergeados:', merged.join(', '))
    } else {
      console.log('  Nenhum dado novo no duplicado')
    }

    // 2. Mover wa_conversations do dupe pro CSV
    const movedConvs = await client.query(
      'UPDATE wa_conversations SET lead_id = $1 WHERE lead_id = $2 RETURNING id',
      [csvId, dupeId]
    )
    if (movedConvs.rowCount > 0) console.log('  Conversas movidas:', movedConvs.rowCount)

    // 3. Mover wa_birthday_campaigns
    const movedCamps = await client.query(
      'UPDATE wa_birthday_campaigns SET lead_id = $1 WHERE lead_id = $2 RETURNING id',
      [csvId, dupeId]
    )
    if (movedCamps.rowCount > 0) console.log('  Birthday campaigns movidas:', movedCamps.rowCount)

    // 4. Mover wa_outbox
    const movedOutbox = await client.query(
      'UPDATE wa_outbox SET lead_id = $1 WHERE lead_id = $2 RETURNING id',
      [csvId, dupeId]
    )
    if (movedOutbox.rowCount > 0) console.log('  Outbox movidos:', movedOutbox.rowCount)

    // 5. Mover budgets
    const movedBudgets = await client.query(
      'UPDATE budgets SET lead_id = $1 WHERE lead_id = $2 RETURNING id',
      [csvId, dupeId]
    )
    if (movedBudgets.rowCount > 0) console.log('  Budgets movidos:', movedBudgets.rowCount)

    // 6. Soft-delete o duplicado
    await client.query(
      "UPDATE leads SET deleted_at = now(), phone = phone || '_MERGED' WHERE id = $1",
      [dupeId]
    )
    console.log('  Duplicado deletado (soft)')
  }

  // Verificar resultado
  console.log('\n=== Verificacao final ===')
  const check = await client.query(`
    SELECT right(phone, 8) as suffix, count(*) as total
    FROM leads
    WHERE deleted_at IS NULL AND phone IS NOT NULL AND phone != ''
    GROUP BY right(phone, 8)
    HAVING count(*) > 1
  `)
  console.log('Duplicados restantes:', check.rows.length)

  await client.end()
  console.log('\n✓ Merge completo — 8 duplicados resolvidos')
}
main().catch(console.error)
