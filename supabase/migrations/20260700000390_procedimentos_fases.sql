-- ============================================================
-- Migration: fases (cadencia multi-etapas) em clinic_procedimentos
-- ============================================================
-- Permite cadastrar tratamentos com cadencia mista, onde cada fase
-- tem seu proprio numero de sessoes e intervalo.
--
-- Exemplo Tirzepatida:
--   fases = [
--     { "nome": "Inducao", "sessoes": 8, "intervalo_dias": 7 },
--     { "nome": "Desmame", "sessoes": 2, "intervalo_dias": 15 }
--   ]
--   Total: 10 sessoes. Cronograma: 7 semanais + 2 quinzenais.
--
-- Retrocompat: se fases = [] (ou NULL), usa sessoes + intervalo_sessoes_dias.
-- ============================================================

ALTER TABLE public.clinic_procedimentos
  ADD COLUMN IF NOT EXISTS fases jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.clinic_procedimentos.fases IS
  'Cadencia multi-fase. Array de {nome, sessoes, intervalo_dias}. Vazio/null = usa intervalo unico legado.';

-- ── RPC: get_procedimentos ─────────────────────────────────
DROP FUNCTION IF EXISTS public.get_procedimentos(boolean);

CREATE OR REPLACE FUNCTION public.get_procedimentos(
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
      'id',                     cp.id,
      'clinic_id',              cp.clinic_id,
      'nome',                   cp.nome,
      'categoria',              cp.categoria,
      'descricao',              cp.descricao,
      'duracao_min',            cp.duracao_min,
      'sessoes',                cp.sessoes,
      'intervalo_sessoes_dias', cp.intervalo_sessoes_dias,
      'fases',                  COALESCE(cp.fases, '[]'::jsonb),
      'tipo',                   cp.tipo,
      'preco',                  cp.preco,
      'preco_promo',            cp.preco_promo,
      'custo_estimado',         cp.custo_estimado,
      'margem',                 cp.margem,
      'combo_sessoes',          cp.combo_sessoes,
      'combo_desconto_pct',     cp.combo_desconto_pct,
      'combo_valor_final',      cp.combo_valor_final,
      'combo_bonus',            cp.combo_bonus,
      'combo_descricao',        cp.combo_descricao,
      'usa_tecnologia',         cp.usa_tecnologia,
      'tecnologia_protocolo',   cp.tecnologia_protocolo,
      'tecnologia_sessoes',     cp.tecnologia_sessoes,
      'tecnologia_custo',       cp.tecnologia_custo,
      'cuidados_pre',           cp.cuidados_pre,
      'cuidados_pos',           cp.cuidados_pos,
      'contraindicacoes',       cp.contraindicacoes,
      'observacoes',            cp.observacoes,
      'ativo',                  cp.ativo,
      'partner_pricing_json',   cp.partner_pricing_json,
      'created_at',             cp.created_at,
      'updated_at',             cp.updated_at,
      'insumos',                COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'injetavel_id',    pi.injetavel_id,
            'injetavel_nome',  ci.nome,
            'qtd_por_sessao',  pi.qtd_por_sessao
          )
          ORDER BY ci.nome
        )
        FROM public.procedimento_insumos pi
        JOIN public.clinic_injetaveis    ci ON ci.id = pi.injetavel_id
        WHERE pi.procedimento_id = cp.id
      ), '[]'::jsonb)
    )
    ORDER BY cp.categoria, cp.nome
  )
  INTO v_result
  FROM public.clinic_procedimentos cp
  WHERE cp.clinic_id = v_clinic_id
    AND (NOT p_apenas_ativos OR cp.ativo = true);

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_procedimentos(boolean) TO authenticated;

-- ── RPC: upsert_procedimento — aceita p_fases ─────────────
DROP FUNCTION IF EXISTS public.upsert_procedimento(
  uuid, text, text, text, int, int, text,
  numeric, numeric, numeric, numeric, int, numeric, numeric,
  text, text, boolean, text, int, numeric,
  jsonb, jsonb, jsonb, text, jsonb, int
);

CREATE OR REPLACE FUNCTION public.upsert_procedimento(
  p_id                     uuid    DEFAULT NULL,
  p_nome                   text    DEFAULT NULL,
  p_categoria              text    DEFAULT NULL,
  p_descricao              text    DEFAULT NULL,
  p_duracao_min            int     DEFAULT NULL,
  p_sessoes                int     DEFAULT NULL,
  p_tipo                   text    DEFAULT NULL,
  p_preco                  numeric DEFAULT NULL,
  p_preco_promo            numeric DEFAULT NULL,
  p_custo_estimado         numeric DEFAULT NULL,
  p_margem                 numeric DEFAULT NULL,
  p_combo_sessoes          int     DEFAULT NULL,
  p_combo_desconto_pct     numeric DEFAULT NULL,
  p_combo_valor_final      numeric DEFAULT NULL,
  p_combo_bonus            text    DEFAULT NULL,
  p_combo_descricao        text    DEFAULT NULL,
  p_usa_tecnologia         boolean DEFAULT NULL,
  p_tecnologia_protocolo   text    DEFAULT NULL,
  p_tecnologia_sessoes     int     DEFAULT NULL,
  p_tecnologia_custo       numeric DEFAULT NULL,
  p_cuidados_pre           jsonb   DEFAULT NULL,
  p_cuidados_pos           jsonb   DEFAULT NULL,
  p_contraindicacoes       jsonb   DEFAULT NULL,
  p_observacoes            text    DEFAULT NULL,
  p_insumos                jsonb   DEFAULT NULL,
  p_intervalo_sessoes_dias int     DEFAULT NULL,
  p_fases                  jsonb   DEFAULT NULL
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
  v_fase      jsonb;
  v_total     int := 0;
BEGIN
  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Permissao insuficiente';
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'Nome do procedimento e obrigatorio';
  END IF;

  -- Validar fases e calcular total de sessoes derivado
  IF p_fases IS NOT NULL AND jsonb_typeof(p_fases) = 'array' AND jsonb_array_length(p_fases) > 0 THEN
    FOR v_fase IN SELECT * FROM jsonb_array_elements(p_fases)
    LOOP
      IF (v_fase ->> 'sessoes') IS NULL OR (v_fase ->> 'sessoes')::int < 1 THEN
        RAISE EXCEPTION 'Cada fase precisa ter sessoes >= 1 (fase: %)', v_fase ->> 'nome';
      END IF;
      IF (v_fase ->> 'intervalo_dias') IS NULL OR (v_fase ->> 'intervalo_dias')::int < 1 THEN
        RAISE EXCEPTION 'Cada fase precisa ter intervalo_dias >= 1 (fase: %)', v_fase ->> 'nome';
      END IF;
      v_total := v_total + (v_fase ->> 'sessoes')::int;
    END LOOP;
  END IF;

  INSERT INTO public.clinic_procedimentos (
    id, clinic_id, nome, categoria, descricao,
    duracao_min, sessoes, intervalo_sessoes_dias, fases, tipo, preco,
    preco_promo, custo_estimado, margem,
    combo_sessoes, combo_desconto_pct, combo_valor_final, combo_bonus, combo_descricao,
    usa_tecnologia, tecnologia_protocolo, tecnologia_sessoes, tecnologia_custo,
    cuidados_pre, cuidados_pos, contraindicacoes, observacoes
  ) VALUES (
    COALESCE(p_id, gen_random_uuid()),
    v_clinic_id, p_nome, p_categoria, p_descricao,
    COALESCE(p_duracao_min, 60),
    -- Se tem fases, sessoes vira o total derivado; senao usa p_sessoes
    CASE WHEN v_total > 0 THEN v_total ELSE COALESCE(p_sessoes, 1) END,
    p_intervalo_sessoes_dias,
    COALESCE(p_fases, '[]'::jsonb),
    COALESCE(p_tipo, 'avulso'), p_preco,
    p_preco_promo, p_custo_estimado, p_margem,
    p_combo_sessoes, p_combo_desconto_pct, p_combo_valor_final, p_combo_bonus, p_combo_descricao,
    COALESCE(p_usa_tecnologia, false), p_tecnologia_protocolo, p_tecnologia_sessoes, p_tecnologia_custo,
    COALESCE(p_cuidados_pre, '[]'),
    COALESCE(p_cuidados_pos, '[]'),
    COALESCE(p_contraindicacoes, '[]'),
    p_observacoes
  )
  ON CONFLICT (clinic_id, nome) DO UPDATE
    SET
      categoria              = EXCLUDED.categoria,
      descricao              = EXCLUDED.descricao,
      duracao_min            = EXCLUDED.duracao_min,
      sessoes                = EXCLUDED.sessoes,
      intervalo_sessoes_dias = EXCLUDED.intervalo_sessoes_dias,
      fases                  = EXCLUDED.fases,
      tipo                   = EXCLUDED.tipo,
      preco                  = EXCLUDED.preco,
      preco_promo            = EXCLUDED.preco_promo,
      custo_estimado         = EXCLUDED.custo_estimado,
      margem                 = EXCLUDED.margem,
      combo_sessoes          = EXCLUDED.combo_sessoes,
      combo_desconto_pct     = EXCLUDED.combo_desconto_pct,
      combo_valor_final      = EXCLUDED.combo_valor_final,
      combo_bonus            = EXCLUDED.combo_bonus,
      combo_descricao        = EXCLUDED.combo_descricao,
      usa_tecnologia         = EXCLUDED.usa_tecnologia,
      tecnologia_protocolo   = EXCLUDED.tecnologia_protocolo,
      tecnologia_sessoes     = EXCLUDED.tecnologia_sessoes,
      tecnologia_custo       = EXCLUDED.tecnologia_custo,
      cuidados_pre           = EXCLUDED.cuidados_pre,
      cuidados_pos           = EXCLUDED.cuidados_pos,
      contraindicacoes       = EXCLUDED.contraindicacoes,
      observacoes            = EXCLUDED.observacoes,
      updated_at             = now()
  RETURNING id INTO v_id;

  IF p_insumos IS NOT NULL THEN
    DELETE FROM public.procedimento_insumos WHERE procedimento_id = v_id;
    FOR v_insumo IN SELECT * FROM jsonb_array_elements(p_insumos)
    LOOP
      INSERT INTO public.procedimento_insumos (procedimento_id, injetavel_id, qtd_por_sessao)
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

GRANT EXECUTE ON FUNCTION public.upsert_procedimento(
  uuid, text, text, text, int, int, text,
  numeric, numeric, numeric, numeric, int, numeric, numeric,
  text, text, boolean, text, int, numeric,
  jsonb, jsonb, jsonb, text, jsonb, int, jsonb
) TO authenticated;
