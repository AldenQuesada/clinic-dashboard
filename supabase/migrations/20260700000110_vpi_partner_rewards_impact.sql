-- ============================================================
-- Migration: VPI Partner Rewards Impact (ajuste etico)
--
-- Contexto: A RPC vpi_pub_impact retornava 'valor_total_ano'
-- baseado em ticket medio × indicacoes — ou seja, RECEITA gerada
-- pelas parceiras. Isso era exibido publicamente no cartao das
-- embaixadoras, o que nao e etico (expoe faturamento).
--
-- Novo foco: mostrar o VALOR DAS RECOMPENSAS JA ENTREGUES as
-- parceiras no ano (procedimentos + bonus materiais). E o que
-- elas ganharam — nao quanto a clinica ganhou com elas.
--
-- Mudancas:
--   1. vpi_indication_close agora grava 'valor' no jsonb
--      recompensas_emitidas (puxa de vpi_reward_tiers.recompensa_valor)
--   2. vpi_pub_impact calcula recompensas_emitidas_ano via JOIN
--      com vpi_reward_tiers (robusto mesmo se valor nao estiver
--      gravado no jsonb legado)
--   3. Removido valor_total_ano (receita) do retorno publico
--      — mantido apenas total_embaixadoras, indicacoes_ano/mes,
--      recompensas_emitidas_ano, ano_ref
--
-- Idempotente: CREATE OR REPLACE.
-- ============================================================

-- ── 1. Atualizar vpi_indication_close para gravar 'valor' ───
-- (Reescreve com adicao do campo valor no v_emitted)
CREATE OR REPLACE FUNCTION public.vpi_indication_close(
  p_lead_id        uuid,
  p_appt_id        uuid,
  p_procedimento   text,
  p_is_full_face   boolean DEFAULT false
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_ind       public.vpi_indications%ROWTYPE;
  v_partner   public.vpi_partners%ROWTYPE;
  v_tier      public.vpi_reward_tiers%ROWTYPE;
  v_creditos  int;
  v_emitted   jsonb;
  v_tiers_hit jsonb := '[]'::jsonb;
  v_msg       text;
  v_vars      jsonb;
  v_faltam    int;
BEGIN
  -- Busca indication pending_close para este lead (com lock)
  SELECT * INTO v_ind FROM public.vpi_indications
   WHERE lead_id = p_lead_id
     AND status  = 'pending_close'
   ORDER BY created_at DESC
   LIMIT 1 FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_indication');
  END IF;

  SELECT * INTO v_partner FROM public.vpi_partners WHERE id = v_ind.partner_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'partner_not_found');
  END IF;

  -- Creditos: 5 se Full Face, senao 1
  v_creditos := CASE WHEN p_is_full_face THEN 5 ELSE 1 END;

  -- Atualiza indication (fechada) + partner (creditos)
  UPDATE public.vpi_indications
     SET status         = 'closed',
         appt_id        = COALESCE(p_appt_id, appt_id),
         procedimento   = COALESCE(p_procedimento, procedimento),
         creditos       = v_creditos,
         fechada_em     = now()
   WHERE id = v_ind.id;

  UPDATE public.vpi_partners
     SET creditos_total       = creditos_total + v_creditos,
         creditos_disponiveis = creditos_disponiveis + v_creditos,
         status               = CASE WHEN status = 'convidado' THEN 'ativo' ELSE status END
   WHERE id = v_partner.id
   RETURNING * INTO v_partner;

  -- Itera tiers elegiveis (threshold <= creditos_total, ainda nao emitidos)
  FOR v_tier IN
    SELECT t.*
      FROM public.vpi_reward_tiers t
     WHERE t.clinic_id = v_partner.clinic_id
       AND t.is_active = true
       AND t.tipo IN ('per_indication', 'milestone')
       AND t.threshold <= v_partner.creditos_total
       AND NOT EXISTS (
         SELECT 1 FROM public.vpi_indications i
          WHERE i.partner_id = v_partner.id
            AND i.recompensas_emitidas @> jsonb_build_array(jsonb_build_object('tier_id', t.id::text))
       )
     ORDER BY t.threshold ASC
  LOOP
    v_faltam := GREATEST(0, v_tier.threshold - v_partner.creditos_total);
    v_vars := jsonb_build_object(
      'nome',             split_part(v_partner.nome, ' ', 1),
      'nome_completo',    v_partner.nome,
      'threshold',        v_tier.threshold::text,
      'recompensa',       v_tier.recompensa,
      'creditos_atuais',  v_partner.creditos_total::text,
      'faltam',           v_faltam::text,
      'clinica',          'Clinica Mirian de Paula Beauty & Health'
    );
    v_msg := public._vpi_render(v_tier.msg_template, v_vars);

    v_emitted := jsonb_build_object(
      'tier_id',     v_tier.id::text,
      'threshold',   v_tier.threshold,
      'recompensa',  v_tier.recompensa,
      'valor',       COALESCE(v_tier.recompensa_valor, 0),
      'emitted_at',  now()
    );

    UPDATE public.vpi_indications
       SET recompensas_emitidas = recompensas_emitidas || jsonb_build_array(v_emitted)
     WHERE id = v_ind.id;

    v_tiers_hit := v_tiers_hit || jsonb_build_array(v_emitted);

    -- Agenda mensagem WA (gated por LGPD consent — reusa helper existente)
    IF v_partner.phone IS NOT NULL AND length(v_partner.phone) >= 8 THEN
      BEGIN
        PERFORM public.wa_outbox_schedule_automation(
          p_phone        => v_partner.phone,
          p_template_slug => 'vpi_tier_emitido',
          p_lead_id       => NULL,
          p_payload_meta  => jsonb_build_object(
            'partner_id',  v_partner.id::text,
            'indication_id', v_ind.id::text,
            'tier_id',     v_tier.id::text,
            'recompensa',  v_tier.recompensa,
            'msg',         v_msg
          ),
          p_send_at       => now()
        );
      EXCEPTION WHEN unique_violation THEN
        -- Dedup em wa_outbox; ok
        NULL;
      WHEN others THEN
        -- Audit do erro isolado; nao quebra a transacao VPI
        INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
        VALUES (v_partner.clinic_id, 'wa_fail', 'tier_emit', v_tier.id, jsonb_build_object(
          'error', SQLERRM, 'partner_id', v_partner.id
        ));
      END;
    END IF;
  END LOOP;

  -- Audit
  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_partner.clinic_id, 'indication_closed', 'indication', v_ind.id, jsonb_build_object(
    'partner_id',   v_partner.id,
    'creditos',     v_creditos,
    'full_face',    p_is_full_face,
    'tiers_hit',    v_tiers_hit
  ));

  RETURN jsonb_build_object(
    'ok', true,
    'indication_id', v_ind.id,
    'partner_id',    v_partner.id,
    'creditos_novos', v_creditos,
    'creditos_total', v_partner.creditos_total,
    'tiers_hit',     v_tiers_hit
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_indication_close(uuid, uuid, text, boolean) TO authenticated;

-- ── 2. Atualizar vpi_pub_impact: foco em recompensas entregues ───
-- Usa JOIN com vpi_reward_tiers para robustez (nao depende do jsonb
-- ter o campo 'valor' gravado — funciona com dados legados).
CREATE OR REPLACE FUNCTION public.vpi_pub_impact(p_clinic_id uuid DEFAULT '00000000-0000-0000-0000-000000000001'::uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_emb_ativas    int;
  v_ind_ano       int;
  v_ind_mes       int;
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

  -- Valor das recompensas ja entregues no ano
  -- Tenta primeiro o campo 'valor' no jsonb (dados novos);
  -- fallback faz JOIN com vpi_reward_tiers via tier_id (dados legados).
  WITH emitted AS (
    SELECT
      (elem->>'tier_id')::uuid AS tier_id,
      COALESCE((elem->>'valor')::numeric, NULL) AS valor_inline
    FROM public.vpi_indications i,
         jsonb_array_elements(COALESCE(i.recompensas_emitidas, '[]'::jsonb)) elem
    WHERE i.clinic_id = p_clinic_id
      AND i.status = 'closed'
      AND i.fechada_em >= date_trunc('year', now())
  )
  SELECT COALESCE(SUM(
    COALESCE(e.valor_inline, t.recompensa_valor, 0)
  ), 0)
    INTO v_rec_emitidas
    FROM emitted e
    LEFT JOIN public.vpi_reward_tiers t ON t.id = e.tier_id;

  RETURN jsonb_build_object(
    'total_embaixadoras',   v_emb_ativas,
    'total_indicacoes_ano', v_ind_ano,
    'total_indicacoes_mes', v_ind_mes,
    'recompensas_emitidas_ano', COALESCE(v_rec_emitidas, 0),
    'ano_ref',              extract(year FROM now())::int,
    'fetched_at',           now()
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_pub_impact(uuid) TO anon, authenticated;
