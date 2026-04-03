-- ============================================================
-- Migration: 20260540000000_clinic_injetaveis.sql
-- Tabela de injetáveis da clínica com estoque, RLS e RPCs
-- ============================================================

-- ------------------------------------------------------------
-- TABLE: clinic_injetaveis
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS clinic_injetaveis (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid        NOT NULL,
  nome              text        NOT NULL,
  categoria         text,        -- 'neuro'|'ha'|'biorev'|'biopoten'|'enzima'|'fio'|'lipolitico'|'mesoterapia'|'prp'|'exossomo'|'polinucleotideo'|'fatorcrescimento'
  fabricante        text,
  apresentacao      text,
  unidade           text,        -- 'U'|'mL'|'mg'|'vial'|'seringa'|'frasco'
  custo_unit        numeric(12,4),
  preco             numeric(12,2),
  margem            numeric(6,2),
  duracao           text,        -- '3 meses'|'6 meses'|'12 meses'|'Permanente'
  downtime          text,
  areas             jsonb        NOT NULL DEFAULT '[]',
  indicacoes        jsonb        NOT NULL DEFAULT '[]',
  contraindicacoes  jsonb        NOT NULL DEFAULT '[]',
  cuidados_pre      jsonb        NOT NULL DEFAULT '[]',
  cuidados_pos      jsonb        NOT NULL DEFAULT '[]',
  observacoes       text,
  estoque_qtd       numeric(12,4) NOT NULL DEFAULT 0,
  estoque_alerta    numeric(12,4) NOT NULL DEFAULT 0,
  ativo             boolean      NOT NULL DEFAULT true,
  created_at        timestamptz  NOT NULL DEFAULT now(),
  updated_at        timestamptz  NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, nome)
);

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_injetaveis_clinic
  ON clinic_injetaveis (clinic_id);

CREATE INDEX IF NOT EXISTS idx_injetaveis_ativo
  ON clinic_injetaveis (clinic_id, ativo);

CREATE INDEX IF NOT EXISTS idx_injetaveis_categoria
  ON clinic_injetaveis (clinic_id, categoria);

-- ------------------------------------------------------------
-- TRIGGER: updated_at
-- ------------------------------------------------------------
CREATE TRIGGER clinic_injetaveis_updated_at
  BEFORE UPDATE ON clinic_injetaveis
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ------------------------------------------------------------
-- RLS
-- ------------------------------------------------------------
ALTER TABLE clinic_injetaveis ENABLE ROW LEVEL SECURITY;

CREATE POLICY injetaveis_select
  ON clinic_injetaveis
  FOR SELECT
  TO authenticated
  USING (clinic_id = app_clinic_id());

CREATE POLICY injetaveis_insert
  ON clinic_injetaveis
  FOR INSERT
  TO authenticated
  WITH CHECK (
    clinic_id = app_clinic_id()
    AND app_role() IN ('admin', 'owner')
  );

CREATE POLICY injetaveis_update
  ON clinic_injetaveis
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

CREATE POLICY injetaveis_delete
  ON clinic_injetaveis
  FOR DELETE
  TO authenticated
  USING (
    clinic_id = app_clinic_id()
    AND app_role() IN ('admin', 'owner')
  );

-- ============================================================
-- RPC 1: get_injetaveis
-- ============================================================
CREATE OR REPLACE FUNCTION get_injetaveis(
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
  SELECT jsonb_agg(row_to_json(i.*) ORDER BY i.categoria, i.nome)
  INTO v_result
  FROM clinic_injetaveis i
  WHERE i.clinic_id = v_clinic_id
    AND (NOT p_apenas_ativos OR i.ativo = true);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION get_injetaveis(boolean) TO authenticated;

-- ============================================================
-- RPC 2: upsert_injetavel
-- ============================================================
CREATE OR REPLACE FUNCTION upsert_injetavel(
  p_id               uuid    DEFAULT NULL,
  p_nome             text    DEFAULT NULL,
  p_categoria        text    DEFAULT NULL,
  p_fabricante       text    DEFAULT NULL,
  p_apresentacao     text    DEFAULT NULL,
  p_unidade          text    DEFAULT NULL,
  p_custo_unit       numeric DEFAULT NULL,
  p_preco            numeric DEFAULT NULL,
  p_margem           numeric DEFAULT NULL,
  p_duracao          text    DEFAULT NULL,
  p_downtime         text    DEFAULT NULL,
  p_areas            jsonb   DEFAULT NULL,
  p_indicacoes       jsonb   DEFAULT NULL,
  p_contraindicacoes jsonb   DEFAULT NULL,
  p_cuidados_pre     jsonb   DEFAULT NULL,
  p_cuidados_pos     jsonb   DEFAULT NULL,
  p_observacoes      text    DEFAULT NULL,
  p_estoque_qtd      numeric DEFAULT NULL,
  p_estoque_alerta   numeric DEFAULT NULL
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
BEGIN
  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Permissão insuficiente';
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'Nome do injetável é obrigatório';
  END IF;

  INSERT INTO clinic_injetaveis (
    id,
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
    estoque_alerta
  ) VALUES (
    COALESCE(p_id, gen_random_uuid()),
    v_clinic_id,
    p_nome,
    p_categoria,
    p_fabricante,
    p_apresentacao,
    p_unidade,
    p_custo_unit,
    p_preco,
    p_margem,
    p_duracao,
    p_downtime,
    COALESCE(p_areas, '[]'),
    COALESCE(p_indicacoes, '[]'),
    COALESCE(p_contraindicacoes, '[]'),
    COALESCE(p_cuidados_pre, '[]'),
    COALESCE(p_cuidados_pos, '[]'),
    p_observacoes,
    COALESCE(p_estoque_qtd, 0),
    COALESCE(p_estoque_alerta, 0)
  )
  ON CONFLICT (clinic_id, nome) DO UPDATE
    SET
      categoria        = EXCLUDED.categoria,
      fabricante       = EXCLUDED.fabricante,
      apresentacao     = EXCLUDED.apresentacao,
      unidade          = EXCLUDED.unidade,
      custo_unit       = EXCLUDED.custo_unit,
      preco            = EXCLUDED.preco,
      margem           = EXCLUDED.margem,
      duracao          = EXCLUDED.duracao,
      downtime         = EXCLUDED.downtime,
      areas            = EXCLUDED.areas,
      indicacoes       = EXCLUDED.indicacoes,
      contraindicacoes = EXCLUDED.contraindicacoes,
      cuidados_pre     = EXCLUDED.cuidados_pre,
      cuidados_pos     = EXCLUDED.cuidados_pos,
      observacoes      = EXCLUDED.observacoes,
      estoque_qtd      = EXCLUDED.estoque_qtd,
      estoque_alerta   = EXCLUDED.estoque_alerta,
      updated_at       = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION upsert_injetavel(
  uuid, text, text, text, text, text,
  numeric, numeric, numeric, text, text,
  jsonb, jsonb, jsonb, jsonb, jsonb, text,
  numeric, numeric
) TO authenticated;

-- ============================================================
-- RPC 3: soft_delete_injetavel
-- ============================================================
CREATE OR REPLACE FUNCTION soft_delete_injetavel(
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
  v_em_uso    boolean;
BEGIN
  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Permissão insuficiente';
  END IF;

  -- Verifica se está em uso em procedimentos ativos
  SELECT EXISTS (
    SELECT 1
    FROM procedimento_insumos pi
    JOIN clinic_procedimentos cp ON cp.id = pi.procedimento_id
    WHERE pi.injetavel_id = p_id
      AND cp.clinic_id   = v_clinic_id
      AND cp.ativo       = true
  ) INTO v_em_uso;

  IF v_em_uso THEN
    RAISE EXCEPTION 'Injetável em uso em procedimentos ativos';
  END IF;

  UPDATE clinic_injetaveis
    SET ativo      = false,
        updated_at = now()
  WHERE id        = p_id
    AND clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION soft_delete_injetavel(uuid) TO authenticated;

-- ============================================================
-- RPC 4: update_estoque_injetavel
-- ============================================================
CREATE OR REPLACE FUNCTION update_estoque_injetavel(
  p_id        uuid,
  p_qtd_delta numeric
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id   uuid := app_clinic_id();
  v_role        text := app_role();
  v_nova_qtd    numeric(12,4);
BEGIN
  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Permissão insuficiente';
  END IF;

  UPDATE clinic_injetaveis
    SET estoque_qtd = estoque_qtd + p_qtd_delta,
        updated_at  = now()
  WHERE id        = p_id
    AND clinic_id = v_clinic_id
  RETURNING estoque_qtd INTO v_nova_qtd;

  IF v_nova_qtd IS NULL THEN
    RAISE EXCEPTION 'Injetável não encontrado';
  END IF;

  RETURN jsonb_build_object('ok', true, 'estoque_atual', v_nova_qtd);
END;
$$;

GRANT EXECUTE ON FUNCTION update_estoque_injetavel(uuid, numeric) TO authenticated;
