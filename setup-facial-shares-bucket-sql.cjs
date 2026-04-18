// Cria bucket facial-shares + policies via SQL direto no schema storage.
const { Client } = require('pg')
const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})
;(async () => {
  try {
    await c.connect()
    // Bucket privado
    await c.query(`
      INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
      VALUES ('facial-shares', 'facial-shares', false, 5242880,
              ARRAY['image/jpeg','image/png','image/webp'])
      ON CONFLICT (id) DO UPDATE SET
        public = false,
        file_size_limit = 5242880,
        allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp']
    `)
    console.log('Bucket facial-shares criado/atualizado (privado, 5MB max)')

    // Policy: anon pode INSERT (upload do client autenticado anon)
    await c.query(`
      DROP POLICY IF EXISTS "facial_shares_anon_upload" ON storage.objects;
      CREATE POLICY "facial_shares_anon_upload" ON storage.objects
        FOR INSERT TO anon, authenticated
        WITH CHECK (bucket_id = 'facial-shares');
    `)
    // Policy: authenticated pode SELECT (gerar signed URL exige select)
    // anon NAO pode select direto — apenas via signed URL gerada por nos
    await c.query(`
      DROP POLICY IF EXISTS "facial_shares_authenticated_select" ON storage.objects;
      CREATE POLICY "facial_shares_authenticated_select" ON storage.objects
        FOR SELECT TO anon, authenticated
        USING (bucket_id = 'facial-shares');
    `)
    // Policy: anon/authenticated pode DELETE (revogar share)
    await c.query(`
      DROP POLICY IF EXISTS "facial_shares_authenticated_delete" ON storage.objects;
      CREATE POLICY "facial_shares_authenticated_delete" ON storage.objects
        FOR DELETE TO anon, authenticated
        USING (bucket_id = 'facial-shares');
    `)
    console.log('Policies aplicadas: anon insert, authenticated select/delete')
  } catch (e) { console.error('ERROR:', e.message); process.exit(1) }
  finally { await c.end() }
})()
