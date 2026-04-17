-- ============================================================
-- Migration: VPI Partner Pricing (Fase 5 - Entrega 4)
--
-- Parceiras ativas pagam preco diferente em Botox/AH: 5x R$200
-- cada, em vez de 5x R$300 do publico geral. Doc oficial
-- estabelece isso como beneficio exclusivo.
--
-- Mudancas:
--   1. Coluna clinic_procedimentos.partner_pricing_json jsonb
--      (NULL = sem preco especial; populado = { parcelas, valor_por_parcela }).
--   2. Seed: Botox e Acido Hialuronico 1ml com 5x R$200.
--   3. RPC procedures_with_partner_pricing(p_lead_id text) retorna
--      procedimentos enriquecidos; se lead e partner ativo,
--      substitui preco pela base do partner_pricing_json.
--   4. RPC vpi_is_active_partner(p_lead_id text) helper boolean.
--
-- Integracoes JS (aplicadas fora desta migration):
--   - js/agenda-smart.js: modal finalize consulta RPC pra enriquecer
--     catalog com partner_pricing + badge dourado no card.
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, ON CONFLICT nos seeds,
-- CREATE OR REPLACE nas RPCs.
-- ============================================================

-- ── 1. Coluna ────────────────────────────────────────────────
ALTER TABLE public.clinic_procedimentos
  ADD COLUMN IF NOT EXISTS partner_pricing_json jsonb;

COMMENT ON COLUMN public.clinic_procedimentos.partner_pricing_json IS
  'Preco exclusivo pra parceiras VPI ativas. Ex: {"parcelas":5,"valor_por_parcela":200}. NULL = sem preco especial.';

-- ── 2. Seed: Botox e AH 1ml ──────────────────────────────────
-- Idempotente: atualiza apenas se nao houver JSON ja definido.
-- Aplica em qualquer proc cujo nome match (case-insensitive) com
-- "botox" ou "acido hialuronico" e nao tenha json manual.
UPDATE public.clinic_procedimentos
   SET partner_pricing_json = '{"parcelas":5,"valor_por_parcela":200}'::jsonb,
       updated_at = now()
 WHERE ativo = true
   AND partner_pricing_json IS NULL
   AND (
     lower(nome) LIKE '%botox%'
     OR lower(nome) LIKE '%acido hialuronico 1ml%'
     OR lower(nome) LIKE '%ah 1ml%'
     OR lower(nome) LIKE '%ac hialuronico 1ml%'
   );

-- ── 3. Helper: vpi_is_active_partner ─────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_is_active_partner(
  p_lead_id text
)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.vpi_partners
     WHERE clinic_id = '00000000-0000-0000-0000-000000000001'::uuid
       AND lead_id   = p_lead_id
       AND status    = 'ativo'
  );
$$;
GRANT EXECUTE ON FUNCTION public.vpi_is_active_partner(text) TO anon, authenticated;

-- ── 4. RPC: procedures_with_partner_pricing ──────────────────
-- Retorna lista de procedimentos ativos com preco "efetivo".
-- Se lead e parceira ativa E proc tem partner_pricing_json, o
-- preco vira parcelas*valor_por_parcela e os campos partner_*
-- sao preenchidos. Caso contrario, preco normal + partner_*=null.
CREATE OR REPLACE FUNCTION public.procedures_with_partner_pricing(
  p_lead_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id   uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_is_partner  boolean := false;
  v_result      jsonb;
BEGIN
  IF COALESCE(p_lead_id, '') <> '' THEN
    v_is_partner := public.vpi_is_active_partner(p_lead_id);
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                   cp.id,
      'nome',                 cp.nome,
      'categoria',            cp.categoria,
      'preco',                cp.preco,
      'preco_promo',          cp.preco_promo,
      'partner_pricing',      cp.partner_pricing_json,
      'is_partner_active',    v_is_partner,
      -- Preco efetivo aplicado ao lead atual
      'partner_eligible',     (v_is_partner AND cp.partner_pricing_json IS NOT NULL),
      'partner_preco_total',
        CASE WHEN v_is_partner AND cp.partner_pricing_json IS NOT NULL
          THEN COALESCE((cp.partner_pricing_json->>'parcelas')::numeric, 1)
             * COALESCE((cp.partner_pricing_json->>'valor_por_parcela')::numeric, 0)
        END,
      'partner_parcelas',
        CASE WHEN v_is_partner AND cp.partner_pricing_json IS NOT NULL
          THEN (cp.partner_pricing_json->>'parcelas')::int
        END,
      'partner_valor_por_parcela',
        CASE WHEN v_is_partner AND cp.partner_pricing_json IS NOT NULL
          THEN (cp.partner_pricing_json->>'valor_por_parcela')::numeric
        END,
      'preco_efetivo',
        CASE WHEN v_is_partner AND cp.partner_pricing_json IS NOT NULL
          THEN COALESCE((cp.partner_pricing_json->>'parcelas')::numeric, 1)
             * COALESCE((cp.partner_pricing_json->>'valor_por_parcela')::numeric, 0)
          ELSE cp.preco
        END
    )
    ORDER BY cp.categoria, cp.nome
  ), '[]'::jsonb)
  INTO v_result
  FROM public.clinic_procedimentos cp
  WHERE cp.clinic_id = v_clinic_id
    AND cp.ativo = true;

  RETURN jsonb_build_object(
    'ok',              true,
    'lead_id',         p_lead_id,
    'is_partner_active', v_is_partner,
    'procedures',      v_result
  );
END $$;
GRANT EXECUTE ON FUNCTION public.procedures_with_partner_pricing(text) TO authenticated;

-- ── 5. get_procedimentos (ja existe): estender pra emitir o campo ──
-- Nao reescrevemos pra nao conflitar; o JS que precisa de partner
-- pricing usa a RPC nova. get_procedimentos continua retornando
-- preco base + acrescentamos partner_pricing_json via regeneracao.
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
      'id',                   cp.id,
      'clinic_id',            cp.clinic_id,
      'nome',                 cp.nome,
      'categoria',            cp.categoria,
      'descricao',            cp.descricao,
      'duracao_min',          cp.duracao_min,
      'sessoes',              cp.sessoes,
      'tipo',                 cp.tipo,
      'preco',                cp.preco,
      'preco_promo',          cp.preco_promo,
      'custo_estimado',       cp.custo_estimado,
      'margem',               cp.margem,
      'combo_sessoes',        cp.combo_sessoes,
      'combo_desconto_pct',   cp.combo_desconto_pct,
      'combo_valor_final',    cp.combo_valor_final,
      'combo_bonus',          cp.combo_bonus,
      'combo_descricao',      cp.combo_descricao,
      'usa_tecnologia',       cp.usa_tecnologia,
      'tecnologia_protocolo', cp.tecnologia_protocolo,
      'tecnologia_sessoes',   cp.tecnologia_sessoes,
      'tecnologia_custo',     cp.tecnologia_custo,
      'cuidados_pre',         cp.cuidados_pre,
      'cuidados_pos',         cp.cuidados_pos,
      'contraindicacoes',     cp.contraindicacoes,
      'observacoes',          cp.observacoes,
      'ativo',                cp.ativo,
      'partner_pricing_json', cp.partner_pricing_json,
      'created_at',           cp.created_at,
      'updated_at',           cp.updated_at,
      'insumos',              COALESCE((
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

-- ── 6. Sanity ────────────────────────────────────────────────
DO $$
DECLARE
  v_count_col int;
  v_count_seed int;
BEGIN
  SELECT COUNT(*) INTO v_count_col
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='clinic_procedimentos'
     AND column_name='partner_pricing_json';

  SELECT COUNT(*) INTO v_count_seed
    FROM public.clinic_procedimentos
   WHERE partner_pricing_json IS NOT NULL;

  RAISE NOTICE '[vpi_partner_pricing] coluna_criada=% | procedimentos_com_partner_pricing=%',
    v_count_col, v_count_seed;
END $$;
