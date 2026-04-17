-- ============================================================
-- Migration: VPI Shoutout + Impact (Fase 3 - Viralidade)
--
-- RPCs publicos (SECURITY DEFINER, GRANT anon):
--   vpi_pub_shoutout_atual(token)  - top 1 do mes + ranking top 10
--                                    (nomes da consultante revelada;
--                                    outros blurred na UI)
--   vpi_pub_impact()               - total embaixadoras, indicacoes
--                                    do ano, valor total indicado,
--                                    mes atual counts
--
-- Indice de performance:
--   idx_vpi_indications_month_closed (clinic_id, fechada_em)
--     WHERE status='closed'
--
-- Idempotente: CREATE INDEX IF NOT EXISTS, CREATE OR REPLACE.
-- ============================================================

-- ── 1. Indice de performance para ranking mensal ────────────
CREATE INDEX IF NOT EXISTS idx_vpi_indications_month_closed
  ON public.vpi_indications (clinic_id, fechada_em DESC)
  WHERE status = 'closed';

CREATE INDEX IF NOT EXISTS idx_vpi_indications_partner_closed_date
  ON public.vpi_indications (partner_id, fechada_em DESC)
  WHERE status = 'closed';

-- ── 2. RPC publica: vpi_pub_shoutout_atual ──────────────────
-- Retorna top 10 do mes. A parceira atual e identificada pelo
-- token; o frontend destaca a posicao dela e blura o resto.
-- O nome retornado e mascarado server-side (first-name-only)
-- para outras posicoes; a posicao da parceira vem com nome full.
CREATE OR REPLACE FUNCTION public.vpi_pub_shoutout_atual(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner   public.vpi_partners%ROWTYPE;
  v_ranking   jsonb;
  v_leader    jsonb;
  v_self_pos  int;
  v_self_qt   int;
BEGIN
  IF COALESCE(p_token,'') = '' THEN RETURN jsonb_build_object('error','invalid_token'); END IF;

  SELECT * INTO v_partner FROM public.vpi_partners
   WHERE card_token = p_token AND status <> 'inativo' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  -- Top 10 do mes
  WITH ranking_mes AS (
    SELECT
      p.id,
      p.nome,
      p.avatar_url,
      p.tier_atual,
      p.numero_membro,
      COALESCE((
        SELECT COUNT(*)::int FROM public.vpi_indications i
         WHERE i.partner_id = p.id
           AND i.status = 'closed'
           AND i.fechada_em >= date_trunc('month', now())
      ), 0) AS qtd,
      row_number() OVER (ORDER BY
        COALESCE((
          SELECT COUNT(*)::int FROM public.vpi_indications i2
           WHERE i2.partner_id = p.id
             AND i2.status = 'closed'
             AND i2.fechada_em >= date_trunc('month', now())
        ), 0) DESC,
        p.creditos_total DESC,
        p.created_at ASC
      ) AS pos
    FROM public.vpi_partners p
    WHERE p.clinic_id = v_partner.clinic_id
      AND p.status = 'ativo'
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'pos',           r.pos,
           'qtd',           r.qtd,
           'is_self',       (r.id = v_partner.id),
           'nome',          CASE WHEN r.id = v_partner.id THEN r.nome
                                 ELSE split_part(COALESCE(r.nome,'Embaixadora'), ' ', 1)
                            END,
           'tier',          r.tier_atual,
           'avatar_url',    r.avatar_url
         ) ORDER BY r.pos ASC), '[]'::jsonb)
    INTO v_ranking
    FROM ranking_mes r
   WHERE r.pos <= 10;

  -- Leader do mes (pos 1 com pelo menos 1 indicacao)
  SELECT jsonb_build_object(
           'nome',          rm.nome,
           'avatar_url',    rm.avatar_url,
           'tier',          rm.tier_atual,
           'numero_membro', rm.numero_membro,
           'qtd',           rm.qtd,
           'is_self',       (rm.id = v_partner.id)
         ),
         (SELECT COUNT(*)::int FROM public.vpi_indications i3
           WHERE i3.partner_id = v_partner.id
             AND i3.status = 'closed'
             AND i3.fechada_em >= date_trunc('month', now()))
    INTO v_leader, v_self_qt
    FROM (
      SELECT p.id, p.nome, p.avatar_url, p.tier_atual, p.numero_membro,
        COALESCE((
          SELECT COUNT(*)::int FROM public.vpi_indications i
           WHERE i.partner_id = p.id
             AND i.status = 'closed'
             AND i.fechada_em >= date_trunc('month', now())
        ), 0) AS qtd
        FROM public.vpi_partners p
       WHERE p.clinic_id = v_partner.clinic_id AND p.status = 'ativo'
       ORDER BY qtd DESC, p.creditos_total DESC, p.created_at ASC
       LIMIT 1
    ) rm
   WHERE rm.qtd > 0;

  -- Self pos
  SELECT pos INTO v_self_pos
    FROM (
      SELECT p.id,
        row_number() OVER (ORDER BY
          COALESCE((
            SELECT COUNT(*)::int FROM public.vpi_indications i
             WHERE i.partner_id = p.id
               AND i.status = 'closed'
               AND i.fechada_em >= date_trunc('month', now())
          ), 0) DESC,
          p.creditos_total DESC,
          p.created_at ASC
        ) AS pos
      FROM public.vpi_partners p
      WHERE p.clinic_id = v_partner.clinic_id AND p.status = 'ativo'
    ) x
   WHERE x.id = v_partner.id;

  RETURN jsonb_build_object(
    'leader',    v_leader,
    'ranking',   v_ranking,
    'self_pos',  v_self_pos,
    'self_qtd',  COALESCE(v_self_qt, 0),
    'fetched_at', now()
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_pub_shoutout_atual(text) TO anon, authenticated;

-- ── 3. RPC publica: vpi_pub_impact ──────────────────────────
-- Dados agregados para card "Impacto coletivo".
-- valor_total_ano: soma recompensa_valor das tiers emitidas
-- por indicacoes fechadas no ano + fallback de R$1.200 medio
-- por indicacao quando nao ha recompensa registrada.
CREATE OR REPLACE FUNCTION public.vpi_pub_impact(p_clinic_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_emb_ativas    int;
  v_ind_ano       int;
  v_ind_mes       int;
  v_valor_ano     numeric;
  v_media_ticket  numeric := 1200; -- ticket medio fallback (configuravel via env no futuro)
  v_rec_emitidas  numeric;
BEGIN
  SELECT COUNT(*)::int INTO v_emb_ativas
    FROM public.vpi_partners
   WHERE clinic_id = p_clinic_id AND status = 'ativo';

  SELECT COUNT(*)::int INTO v_ind_ano
    FROM public.vpi_indications
   WHERE clinic_id = p_clinic_id
     AND status = 'closed'
     AND fechada_em >= date_trunc('year', now());

  SELECT COUNT(*)::int INTO v_ind_mes
    FROM public.vpi_indications
   WHERE clinic_id = p_clinic_id
     AND status = 'closed'
     AND fechada_em >= date_trunc('month', now());

  -- Valor emitido em recompensas no ano (somatorio dos tiers atingidos)
  SELECT COALESCE(SUM(
    COALESCE(
      (SELECT SUM((elem->>'valor')::numeric)
         FROM jsonb_array_elements(COALESCE(i.recompensas_emitidas, '[]'::jsonb)) elem),
      0
    )
  ), 0) INTO v_rec_emitidas
    FROM public.vpi_indications i
   WHERE i.clinic_id = p_clinic_id
     AND i.status = 'closed'
     AND i.fechada_em >= date_trunc('year', now());

  -- valor_total_ano combina: ticket medio por indicacao + recompensas emitidas
  v_valor_ano := (COALESCE(v_ind_ano,0) * v_media_ticket) + COALESCE(v_rec_emitidas,0);

  RETURN jsonb_build_object(
    'total_embaixadoras',   v_emb_ativas,
    'total_indicacoes_ano', v_ind_ano,
    'total_indicacoes_mes', v_ind_mes,
    'valor_total_ano',      v_valor_ano,
    'recompensas_emitidas_ano', v_rec_emitidas,
    'media_ticket_ref',     v_media_ticket,
    'ano_ref',              extract(year FROM now())::int,
    'fetched_at',           now()
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_pub_impact(uuid) TO anon, authenticated;

-- Remove overload sem params (ambiguo com o default): o caller anon
-- chama sempre passando p_clinic_id (o supabase-js pode passar null,
-- caindo no default).
DROP FUNCTION IF EXISTS public.vpi_pub_impact();
