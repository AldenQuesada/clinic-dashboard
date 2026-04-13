const { Client } = require('pg');

async function tryConnect(host, port, user, password) {
  const c = new Client({ host, port, user, password, database: 'postgres', ssl: { rejectUnauthorized: false } });
  try {
    await c.connect();
    console.log('Connected via', host + ':' + port, 'as', user);

    await c.query(`
      CREATE OR REPLACE FUNCTION public.legal_doc_purge_all()
      RETURNS jsonb
      LANGUAGE plpgsql SECURITY DEFINER
      SET search_path = public
      AS $fn$
      DECLARE v_clinic_id uuid; v_del int;
      BEGIN
        v_clinic_id := app_clinic_id();
        IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
        IF app_role() NOT IN ('admin', 'owner') THEN RAISE EXCEPTION 'Permissao insuficiente'; END IF;

        DELETE FROM legal_doc_signatures WHERE request_id IN (SELECT id FROM legal_doc_requests WHERE clinic_id = v_clinic_id);
        DELETE FROM legal_doc_token_failures WHERE slug IN (SELECT public_slug FROM legal_doc_requests WHERE clinic_id = v_clinic_id);
        DELETE FROM legal_doc_requests WHERE clinic_id = v_clinic_id;
        GET DIAGNOSTICS v_del = ROW_COUNT;
        DELETE FROM short_links WHERE code LIKE 'tc-%' AND clinic_id = v_clinic_id;

        RETURN jsonb_build_object('ok', true, 'deleted', v_del);
      END;
      $fn$
    `);
    await c.query('GRANT EXECUTE ON FUNCTION public.legal_doc_purge_all() TO authenticated');
    console.log('OK: legal_doc_purge_all created!');
    await c.end();
    return true;
  } catch (e) {
    console.log('FAIL', host + ':' + port, user, '-', e.message.substring(0, 60));
    try { c.end(); } catch {}
    return false;
  }
}

async function run() {
  // Try all possible connections
  var attempts = [
    ['db.oqboitkpcvuaudouwvkl.supabase.co', 5432, 'postgres', 'rosangela*121776'],
    ['db.oqboitkpcvuaudouwvkl.supabase.co', 5432, 'postgres', 'Rosangela*121776'],
    ['aws-0-sa-east-1.pooler.supabase.com', 6543, 'postgres.oqboitkpcvuaudouwvkl', 'rosangela*121776'],
    ['aws-0-sa-east-1.pooler.supabase.com', 6543, 'postgres.oqboitkpcvuaudouwvkl', 'Rosangela*121776'],
    ['aws-0-sa-east-1.pooler.supabase.com', 5432, 'postgres.oqboitkpcvuaudouwvkl', 'rosangela*121776'],
    ['aws-0-sa-east-1.pooler.supabase.com', 5432, 'postgres.oqboitkpcvuaudouwvkl', 'Rosangela*121776'],
  ];

  for (var a of attempts) {
    var ok = await tryConnect(a[0], a[1], a[2], a[3]);
    if (ok) return;
  }
  console.log('\nNenhuma conexao funcionou. Cole o SQL manualmente no Supabase SQL Editor.');
}

run();
