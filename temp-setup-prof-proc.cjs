const { Client } = require('pg');
const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});

async function run() {
  await c.connect();
  var v = '00000000-0000-0000-0000-000000000001';

  // 1. Criar tabela
  await c.query(`
    CREATE TABLE IF NOT EXISTS public.professional_procedimentos (
      professional_id uuid NOT NULL REFERENCES public.professional_profiles(id) ON DELETE CASCADE,
      procedimento_id uuid NOT NULL REFERENCES public.clinic_procedimentos(id) ON DELETE CASCADE,
      clinic_id       uuid NOT NULL DEFAULT app_clinic_id(),
      is_primary      boolean NOT NULL DEFAULT false,
      created_at      timestamptz NOT NULL DEFAULT now(),
      CONSTRAINT pp_pkey PRIMARY KEY (professional_id, procedimento_id)
    )
  `);
  await c.query('CREATE INDEX IF NOT EXISTS idx_pp_clinic ON public.professional_procedimentos (clinic_id)');
  await c.query('CREATE INDEX IF NOT EXISTS idx_pp_proc ON public.professional_procedimentos (procedimento_id)');
  await c.query('ALTER TABLE public.professional_procedimentos ENABLE ROW LEVEL SECURITY');
  await c.query(`DO $$ BEGIN CREATE POLICY pp_select ON public.professional_procedimentos FOR SELECT TO authenticated USING (clinic_id = app_clinic_id()); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  await c.query(`DO $$ BEGIN CREATE POLICY pp_admin ON public.professional_procedimentos FOR ALL TO authenticated USING (clinic_id = app_clinic_id() AND app_role() IN ('admin','owner')) WITH CHECK (clinic_id = app_clinic_id() AND app_role() IN ('admin','owner')); EXCEPTION WHEN duplicate_object THEN NULL; END $$`);
  console.log('OK: tabela + RLS');

  // 2. Corrigir Tirzepatida -> Anovator
  var upd = await c.query("UPDATE clinic_procedimentos SET nome='Anovator' WHERE clinic_id=$1 AND nome LIKE '%Tirzepatida%' RETURNING nome", [v]);
  console.log(upd.rows.length ? 'OK: Tirzepatida -> Anovator' : 'SKIP: ja corrigido');

  // 3. Adicionar integrativos
  var integ = [
    { nome: 'Acompanhamento Integrativo de Doencas Cronicas', desc: 'Protocolo personalizado para reversao e manejo de doencas cronicas' },
    { nome: 'Protocolo de Saude Metabo-Hormonal', desc: 'Avaliacao e tratamento de desequilibrios metabolicos e hormonais' },
    { nome: 'Protocolo Anti-Aging Integrativo', desc: 'Estrategia multimodal de longevidade e prevencao do envelhecimento' },
  ];
  for (var p of integ) {
    var ex = await c.query('SELECT 1 FROM clinic_procedimentos WHERE clinic_id=$1 AND nome=$2', [v, p.nome]);
    if (!ex.rows.length) {
      await c.query('INSERT INTO clinic_procedimentos (clinic_id, nome, categoria, descricao, ativo) VALUES ($1,$2,$3,$4,true)', [v, p.nome, 'integrativo', p.desc]);
      console.log('  criado:', p.nome);
    }
  }
  console.log('OK: integrativos');

  // 4. Buscar IDs
  var alden = (await c.query("SELECT id FROM professional_profiles WHERE display_name ILIKE '%ALDEN%' LIMIT 1")).rows[0]?.id;
  var mirian = (await c.query("SELECT id FROM professional_profiles WHERE display_name ILIKE '%MIRIAN%' LIMIT 1")).rows[0]?.id;
  var priscila = (await c.query("SELECT id FROM professional_profiles WHERE display_name ILIKE '%PRISCILA%' LIMIT 1")).rows[0]?.id;
  console.log('Alden:', alden);
  console.log('Mirian:', mirian);
  console.log('Priscila:', priscila);

  // 5. Todos procedimentos
  var procs = (await c.query('SELECT id, nome, categoria FROM clinic_procedimentos WHERE clinic_id=$1', [v])).rows;
  console.log('Procedimentos:', procs.length);

  // 6. Mapeamento
  var maps = [];
  for (var pr of procs) {
    var n = pr.nome.toLowerCase();
    var cat = pr.categoria;

    if (cat === 'integrativo') {
      maps.push({ prof: alden, proc: pr.id, primary: true });
    } else if (cat === 'manual') {
      maps.push({ prof: priscila, proc: pr.id, primary: true });
    } else if (n === 'anovator') {
      maps.push({ prof: alden, proc: pr.id, primary: true });
      maps.push({ prof: mirian, proc: pr.id, primary: false });
    } else if (n.includes('ozonoterapia')) {
      maps.push({ prof: alden, proc: pr.id, primary: true });
    } else if (cat === 'injetavel') {
      maps.push({ prof: mirian, proc: pr.id, primary: true });
    } else if (cat === 'tecnologia') {
      maps.push({ prof: mirian, proc: pr.id, primary: true });
    }
  }

  var ok = 0;
  for (var m of maps) {
    if (!m.prof || !m.proc) continue;
    await c.query(
      'INSERT INTO professional_procedimentos (professional_id, procedimento_id, clinic_id, is_primary) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING',
      [m.prof, m.proc, v, m.primary]
    );
    ok++;
  }
  console.log('OK:', ok, 'mapeamentos inseridos');

  // 7. RPC para resolver profissional por procedimento
  await c.query(`
    CREATE OR REPLACE FUNCTION public.resolve_professional_for_procedure(p_procedure text)
    RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE v_clinic_id uuid; v_result jsonb;
    BEGIN
      v_clinic_id := app_clinic_id();
      IF v_clinic_id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;

      SELECT jsonb_build_object(
        'ok', true,
        'professional_id', pp.id,
        'display_name', pp.display_name,
        'crm', pp.crm,
        'specialty', pp.specialty
      ) INTO v_result
      FROM professional_procedimentos ppr
      JOIN professional_profiles pp ON pp.id = ppr.professional_id
      JOIN clinic_procedimentos cp ON cp.id = ppr.procedimento_id
      WHERE ppr.clinic_id = v_clinic_id
        AND ppr.is_primary = true
        AND LOWER(cp.nome) = LOWER(p_procedure)
      LIMIT 1;

      IF v_result IS NULL THEN
        -- Fallback: buscar por match parcial
        SELECT jsonb_build_object(
          'ok', true,
          'professional_id', pp.id,
          'display_name', pp.display_name,
          'crm', pp.crm,
          'specialty', pp.specialty
        ) INTO v_result
        FROM professional_procedimentos ppr
        JOIN professional_profiles pp ON pp.id = ppr.professional_id
        JOIN clinic_procedimentos cp ON cp.id = ppr.procedimento_id
        WHERE ppr.clinic_id = v_clinic_id
          AND ppr.is_primary = true
          AND LOWER(cp.nome) LIKE '%' || LOWER(p_procedure) || '%'
        LIMIT 1;
      END IF;

      RETURN COALESCE(v_result, jsonb_build_object('ok', false));
    END;
    $fn$
  `);
  await c.query('GRANT EXECUTE ON FUNCTION public.resolve_professional_for_procedure(text) TO authenticated');
  console.log('OK: RPC resolve_professional_for_procedure');

  // 8. RPC para listar mapeamentos
  await c.query(`
    CREATE OR REPLACE FUNCTION public.list_professional_procedimentos()
    RETURNS jsonb
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE v_clinic_id uuid;
    BEGIN
      v_clinic_id := app_clinic_id();
      IF v_clinic_id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;

      RETURN jsonb_build_object('ok', true, 'data', (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
          'professional_id', pp.id,
          'professional_name', pp.display_name,
          'procedimento_id', cp.id,
          'procedimento_nome', cp.nome,
          'categoria', cp.categoria,
          'is_primary', ppr.is_primary
        ) ORDER BY pp.display_name, cp.categoria, cp.nome), '[]'::jsonb)
        FROM professional_procedimentos ppr
        JOIN professional_profiles pp ON pp.id = ppr.professional_id
        JOIN clinic_procedimentos cp ON cp.id = ppr.procedimento_id
        WHERE ppr.clinic_id = v_clinic_id
      ));
    END;
    $fn$
  `);
  await c.query('GRANT EXECUTE ON FUNCTION public.list_professional_procedimentos() TO authenticated');
  console.log('OK: RPC list_professional_procedimentos');

  // 9. RPC para setar mapeamentos de um profissional
  await c.query(`
    CREATE OR REPLACE FUNCTION public.set_professional_procedimentos(
      p_professional_id uuid,
      p_procedimento_ids jsonb,
      p_primary_ids jsonb DEFAULT '[]'::jsonb
    )
    RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path = public
    AS $fn$
    DECLARE v_clinic_id uuid; v_pid uuid; v_inserted int := 0;
    BEGIN
      v_clinic_id := app_clinic_id();
      IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
      IF app_role() NOT IN ('admin','owner') THEN RAISE EXCEPTION 'Permissao insuficiente'; END IF;

      -- Deletar existentes
      DELETE FROM professional_procedimentos WHERE professional_id = p_professional_id AND clinic_id = v_clinic_id;

      -- Inserir novos
      FOR v_pid IN SELECT jsonb_array_elements_text(p_procedimento_ids)::uuid LOOP
        INSERT INTO professional_procedimentos (professional_id, procedimento_id, clinic_id, is_primary)
        VALUES (p_professional_id, v_pid, v_clinic_id, p_primary_ids ? v_pid::text);
        v_inserted := v_inserted + 1;
      END LOOP;

      RETURN jsonb_build_object('ok', true, 'count', v_inserted);
    END;
    $fn$
  `);
  await c.query('GRANT EXECUTE ON FUNCTION public.set_professional_procedimentos(uuid, jsonb, jsonb) TO authenticated');
  console.log('OK: RPC set_professional_procedimentos');

  // 10. Verificar resultado final
  var res = await c.query(`
    SELECT pp.display_name, cp.nome, cp.categoria, ppr.is_primary
    FROM professional_procedimentos ppr
    JOIN professional_profiles pp ON pp.id = ppr.professional_id
    JOIN clinic_procedimentos cp ON cp.id = ppr.procedimento_id
    ORDER BY pp.display_name, cp.categoria, cp.nome
  `);
  var cur = '';
  res.rows.forEach(r => {
    if (r.display_name !== cur) { console.log('\n' + r.display_name + ':'); cur = r.display_name; }
    console.log('  ' + (r.is_primary ? '[P]' : '[ ]') + ' [' + r.categoria + '] ' + r.nome);
  });

  console.log('\nTotal mapeamentos:', res.rows.length);
  await c.end();
}
run().catch(e => { console.log('Error:', e.message); c.end(); });
