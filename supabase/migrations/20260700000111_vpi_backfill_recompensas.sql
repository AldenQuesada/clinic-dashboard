-- ============================================================
-- Migration: VPI Backfill Recompensas Emitidas
--
-- Contexto: 5 indications fechadas antes da Fase 9 ficaram com
-- recompensas_emitidas = [] (bug: loop de tiers no close nunca
-- rodou). Isso zerava o card "Nossas parceiras ja ganharam".
--
-- Backfill: para cada partner ativo, verifica quais tiers ela
-- ja deveria ter atingido (por creditos_total) e popula a
-- indication mais recente dela com as recompensas faltantes.
--
-- Idempotente: so insere tiers ausentes (nao duplica).
-- ============================================================

DO $$
DECLARE
  v_partner public.vpi_partners%ROWTYPE;
  v_tier    public.vpi_reward_tiers%ROWTYPE;
  v_last_ind_id uuid;
  v_emitted jsonb;
  v_count   int := 0;
BEGIN
  FOR v_partner IN
    SELECT * FROM public.vpi_partners WHERE creditos_total > 0
  LOOP
    -- Indication mais recente fechada desse partner
    SELECT id INTO v_last_ind_id
      FROM public.vpi_indications
     WHERE partner_id = v_partner.id
       AND status = 'closed'
     ORDER BY fechada_em DESC NULLS LAST
     LIMIT 1;

    IF v_last_ind_id IS NULL THEN CONTINUE; END IF;

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
      v_emitted := jsonb_build_object(
        'tier_id',     v_tier.id::text,
        'threshold',   v_tier.threshold,
        'recompensa',  v_tier.recompensa,
        'valor',       COALESCE(v_tier.recompensa_valor, 0),
        'emitted_at',  now(),
        'backfilled',  true
      );

      UPDATE public.vpi_indications
         SET recompensas_emitidas = recompensas_emitidas || jsonb_build_array(v_emitted)
       WHERE id = v_last_ind_id;

      v_count := v_count + 1;

      -- Audit da entrada backfilled
      INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
      VALUES (v_partner.clinic_id, 'tier_backfilled', 'indication', v_last_ind_id, jsonb_build_object(
        'partner_id',  v_partner.id,
        'tier_id',     v_tier.id,
        'threshold',   v_tier.threshold,
        'valor',       COALESCE(v_tier.recompensa_valor, 0)
      ));
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Backfill concluido: % tiers emitidos', v_count;
END $$;
