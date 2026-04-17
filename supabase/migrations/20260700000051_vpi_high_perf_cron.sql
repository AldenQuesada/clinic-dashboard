-- ============================================================
-- Migration: VPI High Performance Cron (Fase 5 - Entrega 2)
--
-- A RPC vpi_high_performance_check ja existia desde a migration
-- 20 mas nunca foi agendada. Esta migration:
--   1. Estende vpi_high_performance_check para, alem de detectar,
--      registrar recompensa em vpi_indications.recompensas_emitidas
--      (idempotente) e enfileirar msg WA usando tier.msg_template.
--   2. Agenda pg_cron mensal (dia 1 as 11h BRT, 30min apos dormant).
--
-- Idempotencia: tier_id NOT IN recompensas_emitidas + advisory
-- lock. WA enfileirado via wa_outbox_schedule_automation (com
-- unique_violation isolado). Sem duplicacao de premio.
--
-- Botao "Verificar alta performance agora" adicionado na aba
-- Ranking da pagina growth-referral via alteracao em index.html
-- + js/vpi/ui/vpi-shell.ui.js (entry point vpiCheckHighPerfNow).
-- ============================================================

-- ── 1. Estende vpi_high_performance_check ────────────────────
-- Agora: alem de detectar, registra recompensa e enfileira WA.
-- Mantem backward compat (mesma assinatura, mesmo retorno no
-- campo 'hits'). Adiciona 'emitted_count'/'wa_count' no retorno.
CREATE OR REPLACE FUNCTION public.vpi_high_performance_check()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic        uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_tier          public.vpi_reward_tiers%ROWTYPE;
  v_partner       public.vpi_partners%ROWTYPE;
  v_meses_ok      int;
  v_min_por_mes   int;
  v_hits          jsonb := '[]'::jsonb;
  v_emitted       int   := 0;
  v_wa            int   := 0;
  v_wa_failed     int   := 0;
  v_recent_ind_id uuid;
  v_tpl           text;
  v_content       text;
  v_vars          jsonb;
  v_outbox_id     uuid;
  v_first_name    text;
  v_creditos_txt  text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('vpi_high_perf'));

  FOR v_tier IN
    SELECT * FROM public.vpi_reward_tiers
     WHERE clinic_id = v_clinic AND tipo = 'high_performance' AND is_active = true
     ORDER BY threshold ASC
  LOOP
    v_min_por_mes := CASE
      WHEN v_tier.threshold = 50  THEN 5
      WHEN v_tier.threshold = 100 THEN 10
      WHEN v_tier.threshold = 150 THEN 15
      ELSE GREATEST(1, v_tier.threshold / COALESCE(v_tier.required_consecutive_months, 11))
    END;

    FOR v_partner IN
      SELECT * FROM public.vpi_partners
       WHERE clinic_id = v_clinic AND status = 'ativo' AND creditos_total >= v_tier.threshold
    LOOP
      SELECT COUNT(*)::int INTO v_meses_ok
        FROM (
          SELECT date_trunc('month', fechada_em) AS m, COUNT(*) AS qtd
            FROM public.vpi_indications
           WHERE clinic_id = v_clinic
             AND partner_id = v_partner.id
             AND status = 'closed'
             AND fechada_em >= date_trunc('year', now())
           GROUP BY 1
          HAVING COUNT(*) >= v_min_por_mes
        ) meses;

      IF v_meses_ok >= COALESCE(v_tier.required_consecutive_months, 11) THEN
        -- Ja emitido? (tier_id aparece em recompensas_emitidas de alguma indication)
        IF NOT EXISTS (
          SELECT 1 FROM public.vpi_indications i
           WHERE i.partner_id = v_partner.id
             AND i.recompensas_emitidas @> jsonb_build_array(jsonb_build_object('tier_id', v_tier.id::text))
        ) THEN
          v_hits := v_hits || jsonb_build_array(jsonb_build_object(
            'partner_id', v_partner.id,
            'partner_nome', v_partner.nome,
            'tier_id',    v_tier.id,
            'threshold',  v_tier.threshold,
            'recompensa', v_tier.recompensa
          ));

          -- Registra recompensa na indication mais recente desse partner
          SELECT id INTO v_recent_ind_id
            FROM public.vpi_indications
           WHERE clinic_id = v_clinic
             AND partner_id = v_partner.id
             AND status = 'closed'
           ORDER BY fechada_em DESC NULLS LAST
           LIMIT 1;

          IF v_recent_ind_id IS NOT NULL THEN
            UPDATE public.vpi_indications
               SET recompensas_emitidas = COALESCE(recompensas_emitidas, '[]'::jsonb)
                                           || jsonb_build_array(jsonb_build_object(
                                                'tier_id',    v_tier.id::text,
                                                'threshold',  v_tier.threshold,
                                                'recompensa', v_tier.recompensa,
                                                'emitted_at', now(),
                                                'tipo',       'high_performance'
                                              ))
             WHERE id = v_recent_ind_id;
            v_emitted := v_emitted + 1;
          END IF;

          -- Audit hit (mantido)
          INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
          VALUES (v_clinic, 'high_perf_hit', 'partner', v_partner.id::text,
                  jsonb_build_object('tier_id', v_tier.id, 'threshold', v_tier.threshold,
                                      'recompensa', v_tier.recompensa));

          -- Enfileira msg WA usando tier.msg_template
          IF COALESCE(v_partner.phone, '') <> '' AND COALESCE(v_tier.msg_template, '') <> '' THEN
            v_first_name   := split_part(COALESCE(v_partner.nome, 'Campea'), ' ', 1);
            v_creditos_txt := v_partner.creditos_total::text;

            v_vars := jsonb_build_object(
              'nome',             v_first_name,
              'nome_completo',    COALESCE(v_partner.nome, ''),
              'threshold',        v_tier.threshold::text,
              'recompensa',       v_tier.recompensa,
              'creditos_atuais',  v_creditos_txt,
              'faltam',           '0'
            );

            v_tpl := v_tier.msg_template;
            BEGIN
              v_content := public._wa_render_template(v_tpl, v_vars);
            EXCEPTION WHEN undefined_function THEN
              v_content := v_tpl;
              v_content := replace(v_content, '{{nome}}',            v_first_name);
              v_content := replace(v_content, '{{threshold}}',       v_tier.threshold::text);
              v_content := replace(v_content, '{{recompensa}}',      v_tier.recompensa);
              v_content := replace(v_content, '{{creditos_atuais}}', v_creditos_txt);
              v_content := replace(v_content, '{{faltam}}',          '0');
            END;

            BEGIN
              v_outbox_id := public.wa_outbox_schedule_automation(
                p_phone         => v_partner.phone,
                p_content       => v_content,
                p_lead_id       => COALESCE(v_partner.lead_id, v_partner.id::text),
                p_lead_name     => COALESCE(v_partner.nome, ''),
                p_scheduled_at  => now(),
                p_appt_ref      => NULL,
                p_rule_id       => NULL,
                p_ab_variant    => NULL,
                p_vars_snapshot => v_vars
              );
              v_wa := v_wa + 1;

              INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
              VALUES (v_clinic, 'high_perf_wa_sent', 'partner', v_partner.id::text,
                      jsonb_build_object('tier_id', v_tier.id, 'outbox_id', v_outbox_id));
            EXCEPTION WHEN OTHERS THEN
              v_wa_failed := v_wa_failed + 1;
              INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
              VALUES (v_clinic, 'high_perf_wa_failed', 'partner', v_partner.id::text,
                      jsonb_build_object('tier_id', v_tier.id, 'error', SQLERRM));
            END;
          END IF;
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',            true,
    'hits',          v_hits,
    'emitted_count', v_emitted,
    'wa_count',      v_wa,
    'wa_failed',     v_wa_failed,
    'checked_at',    now()
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_high_performance_check() TO anon, authenticated;

-- ── 2. pg_cron: todo dia 1 as 11h BRT (14 UTC, 30min apos dormant) ──
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('vpi_high_perf_monthly');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'vpi_high_perf_monthly',
      '0 14 1 * *',
      'SELECT public.vpi_high_performance_check()'
    );
    RAISE NOTICE '[vpi_high_perf_monthly] pg_cron agendado (0 14 1 * * = dia 1 as 11h BRT)';
  ELSE
    RAISE NOTICE 'pg_cron indisponivel; rodar manualmente via vpi_high_performance_check()';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron falhou: %. Configurar manualmente.', SQLERRM;
END $$;

-- ── 3. Sanity ─────────────────────────────────────────────────
DO $$
DECLARE v_job int;
BEGIN
  BEGIN
    SELECT COUNT(*) INTO v_job FROM cron.job WHERE jobname='vpi_high_perf_monthly';
  EXCEPTION WHEN OTHERS THEN v_job := -1;
  END;
  RAISE NOTICE '[vpi_high_perf] cron_job=%', v_job;
END $$;
