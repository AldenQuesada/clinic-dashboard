/* ============================================================
 * apply-lp-assets-bucket.cjs
 *
 * Cria bucket Storage 'lp-assets' (public) com policies
 * pra upload + select + delete via anon/authenticated.
 *
 * Idempotente.
 * ============================================================ */

const { Client } = require('pg')

const sql = `
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lp-assets', 'lp-assets', true, 8388608,
        ARRAY['image/jpeg','image/png','image/webp','image/avif','image/gif'])
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 8388608,
  allowed_mime_types = ARRAY['image/jpeg','image/png','image/webp','image/avif','image/gif'];

DROP POLICY IF EXISTS "lp_assets_upload" ON storage.objects;
CREATE POLICY "lp_assets_upload" ON storage.objects
  FOR INSERT TO anon, authenticated
  WITH CHECK (bucket_id = 'lp-assets');

DROP POLICY IF EXISTS "lp_assets_select" ON storage.objects;
CREATE POLICY "lp_assets_select" ON storage.objects
  FOR SELECT TO anon, authenticated
  USING (bucket_id = 'lp-assets');

DROP POLICY IF EXISTS "lp_assets_update" ON storage.objects;
CREATE POLICY "lp_assets_update" ON storage.objects
  FOR UPDATE TO anon, authenticated
  USING (bucket_id = 'lp-assets')
  WITH CHECK (bucket_id = 'lp-assets');

DROP POLICY IF EXISTS "lp_assets_delete" ON storage.objects;
CREATE POLICY "lp_assets_delete" ON storage.objects
  FOR DELETE TO anon, authenticated
  USING (bucket_id = 'lp-assets');
`

const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

;(async () => {
  try {
    await c.connect()
    await c.query(sql)
    console.log('[lp-assets] bucket + policies aplicadas')

    var b = await c.query(`SELECT id, public, file_size_limit FROM storage.buckets WHERE id='lp-assets'`)
    console.log('[lp-assets] bucket:', b.rows[0])

    var p = await c.query(`
      SELECT polname FROM pg_policy
      WHERE polname LIKE 'lp_assets_%'
      ORDER BY polname
    `)
    console.log('[lp-assets] policies:', p.rows.map(r => r.polname).join(', '))
  } catch (e) {
    console.error('ERROR:', e.message); process.exit(1)
  } finally { await c.end() }
})()
