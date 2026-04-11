/**
 * Backfill cashflow_entries.procedure_name and professional_id from appointments.
 *
 * Idempotent: only touches rows where procedure_name IS NULL or professional_id IS NULL.
 * Also backfills patient_id via COALESCE when missing.
 */
const { Client } = require('pg');

const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432,
  user: 'postgres',
  password: 'Rosangela*121776',
  database: 'postgres',
  ssl: { rejectUnauthorized: false },
});

async function main() {
  const startedAt = Date.now();
  console.log('[backfill] Connecting to Postgres...');
  await client.connect();
  console.log('[backfill] Connected.');

  try {
    // 1) Count candidates BEFORE the update
    const candidateQuery = `
      SELECT COUNT(*)::int AS total
      FROM public.cashflow_entries c
      JOIN public.appointments a ON a.id = c.appointment_id
      WHERE c.appointment_id IS NOT NULL
        AND c.deleted_at IS NULL
        AND (c.procedure_name IS NULL OR c.professional_id IS NULL);
    `;
    const candidatesRes = await client.query(candidateQuery);
    const candidatesBefore = candidatesRes.rows[0].total;
    console.log(`[backfill] Candidates before UPDATE: ${candidatesBefore}`);

    if (candidatesBefore === 0) {
      console.log('[backfill] Nothing to do. Exiting.');
      return;
    }

    // 2) Perform the UPDATE
    const updateSql = `
      UPDATE public.cashflow_entries c
      SET procedure_name   = COALESCE(c.procedure_name, a.procedure_name),
          professional_id  = COALESCE(c.professional_id, a.professional_id),
          patient_id       = COALESCE(c.patient_id, a.patient_id::text),
          updated_at       = now()
      FROM public.appointments a
      WHERE c.appointment_id = a.id
        AND c.deleted_at IS NULL
        AND (c.procedure_name IS NULL OR c.professional_id IS NULL)
      RETURNING c.id, c.procedure_name, c.amount;
    `;
    console.log('[backfill] Running UPDATE...');
    const updateRes = await client.query(updateSql);
    const affected = updateRes.rowCount;
    console.log(`[backfill] Rows affected: ${affected}`);

    // 3) Sample up to 5 updated entries
    const sample = updateRes.rows.slice(0, 5).map((row) => ({
      id_short: String(row.id || '').slice(0, 8),
      procedure_name: row.procedure_name,
      amount: row.amount,
    }));

    // 4) Report
    console.log('\n========== BACKFILL REPORT ==========');
    console.log(`Candidates (before) : ${candidatesBefore}`);
    console.log(`Updated rows        : ${affected}`);
    console.log('Sample (up to 5):');
    if (sample.length === 0) {
      console.log('  (none)');
    } else {
      sample.forEach((row, i) => {
        console.log(
          `  ${i + 1}. id=${row.id_short}  procedure="${row.procedure_name}"  amount=${row.amount}`
        );
      });
    }
    console.log(`Elapsed             : ${((Date.now() - startedAt) / 1000).toFixed(2)}s`);
    console.log('=====================================\n');
  } finally {
    await client.end();
    console.log('[backfill] Connection closed.');
  }
}

main().catch((err) => {
  console.error('[backfill] ERROR:', err);
  process.exitCode = 1;
  try {
    client.end();
  } catch (_) {}
});
