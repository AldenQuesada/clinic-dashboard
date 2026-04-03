-- ============================================================
-- Migration: 20260542000000_migrate_local_data.sql
-- RPC de migração única do localStorage para o banco de dados
-- ============================================================

CREATE OR REPLACE FUNCTION migrate_local_data(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
  v_rooms     jsonb;
  v_techs     jsonb;
  v_profs     jsonb;
  v_injs      jsonb;
  v_procs     jsonb;
  v_room      jsonb;
  v_tech      jsonb;
  v_prof      jsonb;
  v_inj       jsonb;
  v_proc      jsonb;
  v_room_id   uuid;
  v_tech_id   uuid;
  v_prof_id   uuid;
  v_inj_id    uuid;
  v_proc_id   uuid;
  r_rooms     int := 0;
  r_techs     int := 0;
  r_profs     int := 0;
  r_injs      int := 0;
  r_procs     int := 0;
BEGIN
  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Permissão insuficiente para migração';
  END IF;

  -- ----------------------------------------------------------
  -- 1. SALAS
  -- ----------------------------------------------------------
  v_rooms := p_data -> 'rooms';
  IF jsonb_typeof(v_rooms) = 'array' THEN
    FOR v_room IN SELECT * FROM jsonb_array_elements(v_rooms)
    LOOP
      INSERT INTO clinic_rooms (clinic_id, nome, descricao)
      VALUES (
        v_clinic_id,
        v_room ->> 'nome',
        v_room ->> 'descricao'
      )
      ON CONFLICT (clinic_id, nome) DO NOTHING;
      r_rooms := r_rooms + 1;
    END LOOP;
  END IF;

  -- ----------------------------------------------------------
  -- 2. TECNOLOGIAS (resolve sala por nome)
  -- ----------------------------------------------------------
  v_techs := p_data -> 'technologies';
  IF jsonb_typeof(v_techs) = 'array' THEN
    FOR v_tech IN SELECT * FROM jsonb_array_elements(v_techs)
    LOOP
      v_room_id := NULL;
      SELECT id INTO v_room_id
      FROM clinic_rooms
      WHERE clinic_id = v_clinic_id
        AND nome      = (v_tech ->> 'sala')
      LIMIT 1;

      INSERT INTO clinic_technologies (
        clinic_id,
        sala_id,
        nome,
        categoria,
        fabricante,
        modelo,
        descricao,
        ano,
        investimento,
        ponteiras
      ) VALUES (
        v_clinic_id,
        v_room_id,
        v_tech ->> 'nome',
        v_tech ->> 'categoria',
        v_tech ->> 'fabricante',
        v_tech ->> 'modelo',
        v_tech ->> 'descricao',
        NULLIF(v_tech ->> 'ano', '')::int,
        NULLIF(v_tech ->> 'investimento', '')::numeric,
        v_tech ->> 'ponteiras'
      )
      ON CONFLICT (clinic_id, nome) DO NOTHING
      RETURNING id INTO v_tech_id;

      r_techs := r_techs + 1;
    END LOOP;
  END IF;

  -- ----------------------------------------------------------
  -- 3. PROFISSIONAIS (resolve sala por nome)
  -- ----------------------------------------------------------
  v_profs := p_data -> 'professionals';
  IF jsonb_typeof(v_profs) = 'array' THEN
    FOR v_prof IN SELECT * FROM jsonb_array_elements(v_profs)
    LOOP
      v_room_id := NULL;
      SELECT id INTO v_room_id
      FROM clinic_rooms
      WHERE clinic_id = v_clinic_id
        AND nome      = (v_prof ->> 'sala')
      LIMIT 1;

      INSERT INTO professional_profiles (
        clinic_id,
        display_name,
        specialty,
        bio,
        color,
        telefone,
        whatsapp,
        cpf,
        nascimento,
        endereco,
        horarios,
        skills,
        contrato,
        salario,
        nivel,
        cargo,
        commissions,
        goals,
        observacoes,
        sala_id,
        is_active
      ) VALUES (
        v_clinic_id,
        v_prof ->> 'nome',
        v_prof ->> 'especialidade',
        v_prof ->> 'bio',
        COALESCE(v_prof ->> 'color', '#7C3AED'),
        v_prof ->> 'telefone',
        v_prof ->> 'whatsapp',
        v_prof ->> 'cpf',
        CASE
          WHEN (v_prof ->> 'nascimento') IS NOT NULL
           AND (v_prof ->> 'nascimento') <> ''
          THEN (v_prof ->> 'nascimento')::date
          ELSE NULL
        END,
        COALESCE(v_prof -> 'endereco', '{}'),
        COALESCE(v_prof -> 'horarios', '{}'),
        COALESCE(v_prof -> 'skills', '{}'),
        v_prof ->> 'contrato',
        CASE
          WHEN (v_prof ->> 'salario') IS NOT NULL
           AND (v_prof ->> 'salario') <> ''
          THEN (v_prof ->> 'salario')::numeric
          ELSE NULL
        END,
        COALESCE(v_prof ->> 'nivel', 'funcionario'),
        v_prof ->> 'cargo',
        COALESCE(v_prof -> 'commissions', '[]'),
        COALESCE(v_prof -> 'goals', '[]'),
        v_prof ->> 'observacoes',
        v_room_id,
        COALESCE((v_prof ->> 'ativo')::boolean, true)
      )
      ON CONFLICT DO NOTHING
      RETURNING id INTO v_prof_id;

      r_profs := r_profs + 1;
    END LOOP;
  END IF;

  -- ----------------------------------------------------------
  -- 4. INJETAVEIS
  -- ----------------------------------------------------------
  v_injs := p_data -> 'injetaveis';
  IF jsonb_typeof(v_injs) = 'array' THEN
    FOR v_inj IN SELECT * FROM jsonb_array_elements(v_injs)
    LOOP
      INSERT INTO clinic_injetaveis (
        clinic_id,
        nome,
        categoria,
        fabricante,
        apresentacao,
        unidade,
        custo_unit,
        preco,
        margem,
        duracao,
        downtime,
        areas,
        indicacoes,
        contraindicacoes,
        cuidados_pre,
        cuidados_pos,
        observacoes,
        estoque_qtd,
        estoque_alerta,
        ativo
      ) VALUES (
        v_clinic_id,
        v_inj ->> 'nome',
        v_inj ->> 'categoria',
        v_inj ->> 'fabricante',
        v_inj ->> 'apresentacao',
        v_inj ->> 'unidade',
        NULLIF(v_inj ->> 'custo_unit', '')::numeric,
        NULLIF(v_inj ->> 'preco', '')::numeric,
        NULLIF(v_inj ->> 'margem', '')::numeric,
        v_inj ->> 'duracao',
        v_inj ->> 'downtime',
        COALESCE(v_inj -> 'areas', '[]'),
        COALESCE(v_inj -> 'indicacoes', '[]'),
        COALESCE(v_inj -> 'contraindicacoes', '[]'),
        COALESCE(v_inj -> 'cuidados_pre', '[]'),
        COALESCE(v_inj -> 'cuidados_pos', '[]'),
        v_inj ->> 'observacoes',
        COALESCE(NULLIF(v_inj ->> 'estoque_qtd', '')::numeric, 0),
        COALESCE(NULLIF(v_inj ->> 'estoque_alerta', '')::numeric, 0),
        COALESCE((v_inj ->> 'ativo')::boolean, true)
      )
      ON CONFLICT (clinic_id, nome) DO NOTHING;
      r_injs := r_injs + 1;
    END LOOP;
  END IF;

  -- ----------------------------------------------------------
  -- 5. PROCEDIMENTOS
  -- Insumos não são migrados: referências por nome são frágeis
  -- e os IDs de injetáveis só existem após a migração acima.
  -- ----------------------------------------------------------
  v_procs := p_data -> 'procedimentos';
  IF jsonb_typeof(v_procs) = 'array' THEN
    FOR v_proc IN SELECT * FROM jsonb_array_elements(v_procs)
    LOOP
      INSERT INTO clinic_procedimentos (
        clinic_id,
        nome,
        categoria,
        descricao,
        duracao_min,
        sessoes,
        tipo,
        preco,
        margem,
        combo_sessoes,
        combo_desconto_pct,
        combo_valor_final,
        cuidados_pre,
        cuidados_pos,
        contraindicacoes,
        observacoes,
        ativo
      ) VALUES (
        v_clinic_id,
        v_proc ->> 'nome',
        v_proc ->> 'categoria',
        v_proc ->> 'descricao',
        COALESCE(NULLIF(v_proc ->> 'duracao', '')::int, 60),
        COALESCE(NULLIF(v_proc ->> 'sessoes', '')::int, 1),
        COALESCE(v_proc ->> 'tipo', 'avulso'),
        NULLIF(v_proc ->> 'preco', '')::numeric,
        NULLIF(v_proc ->> 'margem', '')::numeric,
        NULLIF(v_proc ->> 'combo_sessoes', '')::int,
        NULLIF(v_proc ->> 'combo_desconto_pct', '')::numeric,
        NULLIF(v_proc ->> 'combo_valor_final', '')::numeric,
        COALESCE(v_proc -> 'cuidados_pre', '[]'),
        COALESCE(v_proc -> 'cuidados_pos', '[]'),
        COALESCE(v_proc -> 'contraindicacoes', '[]'),
        v_proc ->> 'observacoes',
        COALESCE((v_proc ->> 'ativo')::boolean, true)
      )
      ON CONFLICT (clinic_id, nome) DO NOTHING;
      r_procs := r_procs + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok',      true,
    'migrated', jsonb_build_object(
      'rooms',         r_rooms,
      'technologies',  r_techs,
      'professionals', r_profs,
      'injetaveis',    r_injs,
      'procedimentos', r_procs
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION migrate_local_data(jsonb) TO authenticated;
