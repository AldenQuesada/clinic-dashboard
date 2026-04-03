-- ============================================================
-- Migration: 20260541000000_clinic_procedimentos.sql
-- Tabelas de procedimentos e insumos por procedimento
-- ============================================================

-- ------------------------------------------------------------
-- TABLE: clinic_procedimentos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinic_procedimentos (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid        NOT NULL,
  nome                text        NOT NULL,
  categoria           text,        -- 'injetavel'|'manual'|'tecnologia'
  descricao           text,
  duracao_min         int          NOT NULL DEFAULT 60,
  sessoes             int          NOT NULL DEFAULT 1,
  tipo                text        NOT NULL DEFAULT 'avulso',  -- 'avulso'|'combo'
  preco               numeric(12,2),
  margem              numeric(6,2),
  combo_sessoes       int,
  combo_desconto_pct  numeric(6,2),
  combo_valor_final   numeric(12,2),
  cuidados_pre        jsonb        NOT NULL DEFAULT '[]',
  cuidados_pos        jsonb        NOT NULL DEFAULT '[]',
  contraindicacoes    jsonb        NOT NULL DEFAULT '[]',
  observacoes         text,
  ativo               boolean      NOT NULL DEFAULT true,
  created_at          timestamptz  NOT NULL DEFAULT now(),
  updated_at          timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, nome)
);

-- ------------------------------------------------------------
-- TABLE: procedimento_insumos
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS procedimento_insumos (
  id               uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  procedimento_id  uuid         NOT NULL REFERENCES clinic_procedimentos (id) ON DELETE CASCADE,
  injetavel_id     uuid         NOT NULL REFERENCES clinic_injetaveis (id) ON DELETE RESTRICT,
  qtd_por_sessao   numeric(12,4) NOT NULL DEFAULT 1,
  UNIQUE (procedimento_id, injetavel_id)
);

-- ------------------------------------------------------------
-- INDEXES: clinic_procedimentos
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_procedimentos_clinic
  ON clinic_procedimentos (clinic_id);

CREATE INDEX IF NOT EXISTS idx_procedimentos_ativo
  ON clinic_procedimentos (clinic_id, ativo);

CREATE INDEX IF NOT EXISTS idx_procedimentos_categoria
  ON clinic_procedimentos (clinic_id, categoria);

-- ------------------------------------------------------------
-- INDEXES: procedimento_insumos
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_proc_insumos_proc
  ON procedimento_insumos (procedimento_id);

CREATE INDEX IF NOT EXISTS idx_proc_insumos_inj
  ON procedimento_insumos (injetavel_id);

-- ------------------------------------------------------------
-- TRIGGER: updated_at
-- ------------------------------------------------------------
CREATE TRIGGER clinic_procedimentos_updated_at
  BEFORE UPDATE ON clinic_procedimentos
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- RLS: clinic_procedimentos
-- ------------------------------------------------------------
ALTER TABLE clinic_procedimentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY procedimentos_select
  ON clinic_procedimentos
  FOR SELECT
  TO authenticated
  USING (clinic_id = app_clinic_id());

CREATE POLICY procedimentos_insert
  ON clinic_procedimentos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id = app_clinic_id()
    AND app_role() IN ('admin', 'owner')
  );

CREATE POLICY procedimentos_update
  ON clinic_procedimentos
  FOR UPDATE
  TO authenticated
  USING (
    clinic_id = app_clinic_id()
    AND app_role() IN ('admin', 'owner')
  )
  WITH CHECK (
    clinic_id = app_clinic_id()
    AND app_role() IN ('admin', 'owner')
  );

CREATE POLICY procedimentos_delete
  ON clinic_procedimentos
  FOR DELETE
  TO authenticated
  USING (
    clinic_id = app_clinic_id()
    AND app_role() IN ('admin', 'owner')
  );

-- ------------------------------------------------------------
-- RLS: procedimento_insumos
-- ------------------------------------------------------------
ALTER TABLE procedimento_insumos ENABLE ROW LEVEL SECURITY;

-- SELECT: authenticated, restrito à clínica via JOIN
CREATE POLICY proc_insumos_select
  ON procedimento_insumos
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM clinic_procedimentos cp
      WHERE cp.id        = procedimento_insumos.procedimento_id
        AND cp.clinic_id = app_clinic_id()
    )
  );

-- INSERT: admin/owner, restrito à clínica via JOIN
CREATE POLICY proc_insumos_insert
  ON procedimento_insumos
  FOR INSERT
  TO authenticated
  WITH CHECK (
    app_role() IN ('admin', 'owner')
    AND EXISTS (
      SELECT 1
      FROM clinic_procedimentos cp
      WHERE cp.id        = procedimento_insumos.procedimento_id
        AND cp.clinic_id = app_clinic_id()
    )
  );

-- UPDATE: admin/owner, restrito à clínica via JOIN
CREATE POLICY proc_insumos_update
  ON procedimento_insumos
  FOR UPDATE
  TO authenticated
  USING (
    app_role() IN ('admin', 'owner')
    AND EXISTS (
      SELECT 1
      FROM clinic_procedimentos cp
      WHERE cp.id        = procedimento_insumos.procedimento_id
        AND cp.clinic_id = app_clinic_id()
    )
  )
  WITH CHECK (
    app_role() IN ('admin', 'owner')
    AND EXISTS (
      SELECT 1
      FROM clinic_procedimentos cp
      WHERE cp.id        = procedimento_insumos.procedimento_id
        AND cp.clinic_id = app_clinic_id()
    )
  );

-- DELETE: admin/owner, restrito à clínica via JOIN
CREATE POLICY proc_insumos_delete
  ON procedimento_insumos
  FOR DELETE
  TO authenticated
  USING (
    app_role() IN ('admin', 'owner')
    AND EXISTS (
      SELECT 1
      FROM clinic_procedimentos cp
      WHERE cp.id        = procedimento_insumos.procedimento_id
        AND cp.clinic_id = app_clinic_id()
    )
  );

-- ============================================================
-- RPC 1: get_procedimentos
-- ============================================================
CREATE OR REPLACE FUNCTION get_procedimentos(
  p_apenas_ativos boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_result    jsonb;
BEGIN
  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                cp.id,
      'clinic_id',         cp.clinic_id,
      'nome',              cp.nome,
      'categoria',         cp.categoria,
      'descricao',         cp.descricao,
      'duracao_min',       cp.duracao_min,
      'sessoes',           cp.sessoes,
      'tipo',              cp.tipo,
      'preco',             cp.preco,
      'margem',            cp.margem,
      'combo_sessoes',     cp.combo_sessoes,
      'combo_desconto_pct', cp.combo_desconto_pct,
      'combo_valor_final', cp.combo_valor_final,
      'cuidados_pre',      cp.cuidados_pre,
      'cuidados_pos',      cp.cuidados_pos,
      'contraindicacoes',  cp.contraindicacoes,
      'observacoes',       cp.observacoes,
      'ativo',             cp.ativo,
      'created_at',        cp.created_at,
      'updated_at',        cp.updated_at,
      'insumos',           COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'injetavel_id',    pi.injetavel_id,
            'injetavel_nome',  ci.nome,
            'qtd_por_sessao',  pi.qtd_por_sessao
          )
          ORDER BY ci.nome
        )
        FROM procedimento_insumos pi
        JOIN clinic_injetaveis ci ON ci.id = pi.injetavel_id
        WHERE pi.procedimento_id = cp.id
      ), '[]'::jsonb)
    )
    ORDER BY cp.categoria, cp.nome
  )
  INTO v_result
  FROM clinic_procedimentos cp
  WHERE cp.clinic_id = v_clinic_id
    AND (NOT p_apenas_ativos OR cp.ativo = true);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION get_procedimentos(boolean) TO authenticated;

-- ============================================================
-- RPC 2: upsert_procedimento
-- ============================================================
CREATE OR REPLACE FUNCTION upsert_procedimento(
  p_id                 uuid    DEFAULT NULL,
  p_nome               text    DEFAULT NULL,
  p_categoria          text    DEFAULT NULL,
  p_descricao          text    DEFAULT NULL,
  p_duracao_min        int     DEFAULT NULL,
  p_sessoes            int     DEFAULT NULL,
  p_tipo               text    DEFAULT NULL,
  p_preco              numeric DEFAULT NULL,
  p_margem             numeric DEFAULT NULL,
  p_combo_sessoes      int     DEFAULT NULL,
  p_combo_desconto_pct numeric DEFAULT NULL,
  p_combo_valor_final  numeric DEFAULT NULL,
  p_cuidados_pre       jsonb   DEFAULT NULL,
  p_cuidados_pos       jsonb   DEFAULT NULL,
  p_contraindicacoes   jsonb   DEFAULT NULL,
  p_observacoes        text    DEFAULT NULL,
  p_insumos            jsonb   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
  v_id        uuid;
  v_insumo    jsonb;
BEGIN
  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Permissão insuficiente';
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'Nome do procedimento é obrigatório';
  END IF;

  INSERT INTO clinic_procedimentos (
    id,
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
    observacoes
  ) VALUES (
    COALESCE(p_id, gen_random_uuid()),
    v_clinic_id,
    p_nome,
    p_categoria,
    p_descricao,
    COALESCE(p_duracao_min, 60),
    COALESCE(p_sessoes, 1),
    COALESCE(p_tipo, 'avulso'),
    p_preco,
    p_margem,
    p_combo_sessoes,
    p_combo_desconto_pct,
    p_combo_valor_final,
    COALESCE(p_cuidados_pre, '[]'),
    COALESCE(p_cuidados_pos, '[]'),
    COALESCE(p_contraindicacoes, '[]'),
    p_observacoes
  )
  ON CONFLICT (clinic_id, nome) DO UPDATE
    SET
      categoria          = EXCLUDED.categoria,
      descricao          = EXCLUDED.descricao,
      duracao_min        = EXCLUDED.duracao_min,
      sessoes            = EXCLUDED.sessoes,
      tipo               = EXCLUDED.tipo,
      preco              = EXCLUDED.preco,
      margem             = EXCLUDED.margem,
      combo_sessoes      = EXCLUDED.combo_sessoes,
      combo_desconto_pct = EXCLUDED.combo_desconto_pct,
      combo_valor_final  = EXCLUDED.combo_valor_final,
      cuidados_pre       = EXCLUDED.cuidados_pre,
      cuidados_pos       = EXCLUDED.cuidados_pos,
      contraindicacoes   = EXCLUDED.contraindicacoes,
      observacoes        = EXCLUDED.observacoes,
      updated_at         = now()
  RETURNING id INTO v_id;

  -- Sincroniza insumos se fornecidos
  IF p_insumos IS NOT NULL THEN
    DELETE FROM procedimento_insumos
    WHERE procedimento_id = v_id;

    FOR v_insumo IN SELECT * FROM jsonb_array_elements(p_insumos)
    LOOP
      INSERT INTO procedimento_insumos (procedimento_id, injetavel_id, qtd_por_sessao)
      VALUES (
        v_id,
        (v_insumo ->> 'injetavel_id')::uuid,
        COALESCE((v_insumo ->> 'qtd_por_sessao')::numeric, 1)
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_procedimento(
  uuid, text, text, text, int, int, text,
  numeric, numeric, int, numeric, numeric,
  jsonb, jsonb, jsonb, text, jsonb
) TO authenticated;

-- ============================================================
-- RPC 3: soft_delete_procedimento
-- ============================================================
CREATE OR REPLACE FUNCTION soft_delete_procedimento(
  p_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
BEGIN
  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Permissão insuficiente';
  END IF;

  UPDATE clinic_procedimentos
    SET ativo      = false,
        updated_at = now()
  WHERE id        = p_id
    AND clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION soft_delete_procedimento(uuid) TO authenticated;
