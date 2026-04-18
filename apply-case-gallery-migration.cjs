const { Client } = require('pg')
const fs = require('fs')
const sql = fs.readFileSync(__dirname + '/supabase/migrations/20260700000170_case_gallery.sql', 'utf8')
const bucketSql = `
  INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  VALUES ('case-gallery', 'case-gallery', false, 8388608, ARRAY['image/jpeg','image/png','image/webp'])
  ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = 8388608;
  DROP POLICY IF EXISTS "case_gallery_upload" ON storage.objects;
  CREATE POLICY "case_gallery_upload" ON storage.objects FOR INSERT TO anon, authenticated
    WITH CHECK (bucket_id = 'case-gallery');
  DROP POLICY IF EXISTS "case_gallery_select" ON storage.objects;
  CREATE POLICY "case_gallery_select" ON storage.objects FOR SELECT TO anon, authenticated
    USING (bucket_id = 'case-gallery');
  DROP POLICY IF EXISTS "case_gallery_delete" ON storage.objects;
  CREATE POLICY "case_gallery_delete" ON storage.objects FOR DELETE TO anon, authenticated
    USING (bucket_id = 'case-gallery');
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
    await c.query(bucketSql)
    await c.query("NOTIFY pgrst, 'reload schema'")
    console.log('migration + bucket aplicados')
    const t = await c.query(`SELECT count(*) FROM case_gallery`)
    console.log('case_gallery rows:', t.rows[0].count)
    const fns = await c.query(`
      SELECT proname FROM pg_proc
      WHERE proname IN ('case_gallery_create','case_gallery_update','case_gallery_delete','case_gallery_list')
      ORDER BY proname
    `)
    console.log('RPCs:', fns.rows.map(r => r.proname).join(', '))
  } catch (e) { console.error('ERROR:', e.message); process.exit(1) }
  finally { await c.end() }
})()
