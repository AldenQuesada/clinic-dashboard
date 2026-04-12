-- ============================================================
-- Migration: fix upsert_injetavel — adiciona p_ativo, p_riscos_complicacoes, p_texto_consentimento
-- ============================================================
-- O RPC original omitia 3 colunas que existem na tabela clinic_injetaveis.
-- O repo frontend enviava 6 nomes errados e omitia 10 params (corrigido no JS).
-- ============================================================

CREATE OR REPLACE FUNCTION public.upsert_injetavel(
  p_id                   uuid    DEFAULT NULL,
  p_nome                 text    DEFAULT NULL,
  p_categoria            text    DEFAULT NULL,
  p_fabricante           text    DEFAULT NULL,
  p_apresentacao         text    DEFAULT NULL,
  p_unidade              text    DEFAULT NULL,
  p_custo_unit           numeric DEFAULT NULL,
  p_preco                numeric DEFAULT NULL,
  p_margem               numeric DEFAULT NULL,
  p_duracao              text    DEFAULT NULL,
  p_downtime             text    DEFAULT NULL,
  p_areas                jsonb   DEFAULT NULL,
  p_indicacoes           jsonb   DEFAULT NULL,
  p_contraindicacoes     jsonb   DEFAULT NULL,
  p_cuidados_pre         jsonb   DEFAULT NULL,
  p_cuidados_pos         jsonb   DEFAULT NULL,
  p_observacoes          text    DEFAULT NULL,
  p_estoque_qtd          numeric DEFAULT NULL,
  p_estoque_alerta       numeric DEFAULT NULL,
  p_ativo                boolean DEFAULT true,
  p_riscos_complicacoes  jsonb   DEFAULT NULL,
  p_texto_consentimento  text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
  v_id        uuid;
BEGIN
  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Permissao insuficiente';
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'Nome do injetavel e obrigatorio';
  END IF;

  INSERT INTO clinic_injetaveis (
    id, clinic_id, nome, categoria, fabricante, apresentacao, unidade,
    custo_unit, preco, margem, duracao, downtime,
    areas, indicacoes, contraindicacoes, cuidados_pre, cuidados_pos,
    observacoes, estoque_qtd, estoque_alerta,
    ativo, riscos_complicacoes, texto_consentimento
  ) VALUES (
    COALESCE(p_id, gen_random_uuid()),
    v_clinic_id,
    p_nome, p_categoria, p_fabricante, p_apresentacao, p_unidade,
    p_custo_unit, p_preco, p_margem, p_duracao, p_downtime,
    COALESCE(p_areas, '[]'), COALESCE(p_indicacoes, '[]'),
    COALESCE(p_contraindicacoes, '[]'), COALESCE(p_cuidados_pre, '[]'),
    COALESCE(p_cuidados_pos, '[]'),
    p_observacoes,
    COALESCE(p_estoque_qtd, 0), COALESCE(p_estoque_alerta, 0),
    COALESCE(p_ativo, true),
    COALESCE(p_riscos_complicacoes, '[]'),
    p_texto_consentimento
  )
  ON CONFLICT (clinic_id, nome) DO UPDATE SET
    categoria            = EXCLUDED.categoria,
    fabricante           = EXCLUDED.fabricante,
    apresentacao         = EXCLUDED.apresentacao,
    unidade              = EXCLUDED.unidade,
    custo_unit           = EXCLUDED.custo_unit,
    preco                = EXCLUDED.preco,
    margem               = EXCLUDED.margem,
    duracao              = EXCLUDED.duracao,
    downtime             = EXCLUDED.downtime,
    areas                = EXCLUDED.areas,
    indicacoes           = EXCLUDED.indicacoes,
    contraindicacoes     = EXCLUDED.contraindicacoes,
    cuidados_pre         = EXCLUDED.cuidados_pre,
    cuidados_pos         = EXCLUDED.cuidados_pos,
    observacoes          = EXCLUDED.observacoes,
    estoque_qtd          = EXCLUDED.estoque_qtd,
    estoque_alerta       = EXCLUDED.estoque_alerta,
    ativo                = EXCLUDED.ativo,
    riscos_complicacoes  = EXCLUDED.riscos_complicacoes,
    texto_consentimento  = EXCLUDED.texto_consentimento,
    updated_at           = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$function$;

NOTIFY pgrst, 'reload schema';
