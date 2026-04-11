/**
 * Diagnostic round 2: confirm why no cashflow_entries have appointment_id.
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

async function q(label, sql) {
  const res = await client.query(sql);
  console.log(`\n--- ${label} ---`);
  console.log(JSON.stringify(res.rows, null, 2));
}

async function main() {
  await client.connect();
  try {
    await q(
      'all cashflow_entries (compact)',
      `SELECT id,
              appointment_id,
              procedure_name,
              professional_id,
              patient_id,
              amount,
              deleted_at,
              created_at
       FROM public.cashflow_entries
       ORDER BY created_at DESC NULLS LAST;`
    );

    await q(
      'cashflow_entries full columns',
      `SELECT column_name, data_type
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'cashflow_entries'
       ORDER BY ordinal_position;`
    );

    await q(
      'appointments count and sample ids',
      `SELECT COUNT(*)::int AS total,
              (SELECT array_agg(id) FROM (
                 SELECT id FROM public.appointments LIMIT 5
               ) t) AS sample_ids
       FROM public.appointments;`
    );
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('ERROR:', err);
  process.exitCode = 1;
  try { client.end(); } catch (_) {}
});
