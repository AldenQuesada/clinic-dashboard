-- ============================================================
-- Migration: 20260527000000 — SDR Sprint 10: Time Elapsed Scanner
--
-- Gap fechado: trigger_event = 'time_elapsed' nunca disparava.
-- Solução: sdr_scan_time_elapsed() roda sem auth context (pg_cron
-- ou Edge Function) e avalia regras de tempo para todos os leads.
--
-- Blindagens:
--   - Sem dependência de _sdr_clinic_id() (auth context ausente no cron)
--   - Itera apenas clínicas com regras time_elapsed ativas (eficiente)
--   - Cooldown + max_executions respeitados por lead
--   - EXCEPTION por lead isolada: falha em um lead não cancela os demais
--   - SECURITY DEFINER: acessa tabelas direto sem RLS
--
-- Agendamento:
--   - pg_cron (Supabase Pro): registrado automaticamente abaixo
--   - Edge Function (Free/Starter): chamar sdr_scan_time_elapsed() a cada hora
--     via `supabase functions deploy sdr-cron` (ver docs)
-- ============================================================

CREATE OR REPLACE FUNCTION public.sdr_scan_time_elapsed()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id     uuid;
  v_lead_id       text;
  v_rule          automation_rules%ROWTYPE;
  v_action        jsonb;
  v_act_result    jsonb;
  v_actions_run   jsonb;
  v_exec_ok       boolean;
  v_in_cooldown   boolean;
  v_over_limit    boolean;
  v_leads_scanned int := 0;
  v_rules_fired   int := 0;
  v_errors        int := 0;
BEGIN

  -- ── Itera apenas clínicas com regras time_elapsed ativas ─────
  FOR v_clinic_id IN
    SELECT DISTINCT clinic_id
    FROM automation_rules
    WHERE trigger_event = 'time_elapsed'
      AND is_active     = true
  LOOP

    -- ── Itera leads ativos da clínica ──────────────────────────
    FOR v_lead_id IN
      SELECT id FROM leads
      WHERE clinic_id = v_clinic_id
        AND is_active = true
    LOOP
      v_leads_scanned := v_leads_scanned + 1;

      -- Tratamento isolado por lead: erro em um não cancela os demais
      BEGIN

        FOR v_rule IN
          SELECT * FROM automation_rules
          WHERE clinic_id     = v_clinic_id
            AND trigger_event = 'time_elapsed'
            AND is_active     = true
          ORDER BY priority ASC, created_at ASC
        LOOP

          -- ── Cooldown ──────────────────────────────────────────
          IF v_rule.cooldown_hours IS NOT NULL THEN
            SELECT EXISTS (
              SELECT 1 FROM rule_executions
              WHERE rule_id    = v_rule.id
                AND lead_id    = v_lead_id
                AND executed_at > now() - (v_rule.cooldown_hours * INTERVAL '1 hour')
                AND success    = true
            ) INTO v_in_cooldown;
            IF v_in_cooldown THEN CONTINUE; END IF;
          END IF;

          -- ── Max executions por lead ───────────────────────────
          IF v_rule.max_executions IS NOT NULL THEN
            SELECT (COUNT(*) >= v_rule.max_executions)
            FROM rule_executions
            WHERE rule_id = v_rule.id
              AND lead_id = v_lead_id
              AND success = true
            INTO v_over_limit;
            IF v_over_limit THEN CONTINUE; END IF;
          END IF;

          -- ── Avalia conditions (v_clinic_id direto, sem auth) ──
          IF NOT _sdr_eval_conditions(v_lead_id, v_clinic_id, v_rule.conditions, '{}') THEN
            CONTINUE;
          END IF;

          -- ── Executa actions em sequência ──────────────────────
          v_actions_run := '[]'::jsonb;
          v_exec_ok     := true;

          FOR v_action IN
            SELECT value FROM jsonb_array_elements(v_rule.actions) AS t(value)
          LOOP
            v_act_result := _sdr_exec_action(
              v_clinic_id,
              v_lead_id,
              v_action || jsonb_build_object('rule_slug', v_rule.slug)
            );
            v_actions_run := v_actions_run || jsonb_build_array(
              jsonb_build_object(
                'type',  v_action->>'type',
                'ok',    (v_act_result->>'ok')::boolean,
                'error', v_act_result->>'error'
              )
            );
            IF (v_act_result->>'ok')::boolean = false THEN
              v_exec_ok := false;
              EXIT;
            END IF;
          END LOOP;

          -- ── Log de execução ───────────────────────────────────
          INSERT INTO rule_executions (rule_id, lead_id, success, actions_run, error)
          VALUES (
            v_rule.id, v_lead_id, v_exec_ok, v_actions_run,
            CASE WHEN NOT v_exec_ok THEN 'Acao falhou — ver actions_run' ELSE NULL END
          );

          UPDATE automation_rules
          SET last_run_at = now(),
              run_count   = run_count + 1
          WHERE id = v_rule.id;

          IF v_exec_ok THEN v_rules_fired := v_rules_fired + 1; END IF;

        END LOOP; -- rules

      EXCEPTION WHEN OTHERS THEN
        -- Falha isolada por lead — registra e continua
        v_errors := v_errors + 1;
        INSERT INTO rule_executions (rule_id, lead_id, success, error)
        VALUES (
          v_rule.id, v_lead_id, false,
          'SCAN_ERROR: ' || SQLERRM
        );
      END;

    END LOOP; -- leads
  END LOOP; -- clinics

  RETURN jsonb_build_object(
    'ok',            true,
    'leads_scanned', v_leads_scanned,
    'rules_fired',   v_rules_fired,
    'errors',        v_errors,
    'ran_at',        now()
  );
END;
$$;

-- pg_cron acessa via service_role — sem auth context
GRANT EXECUTE ON FUNCTION public.sdr_scan_time_elapsed() TO service_role;

COMMENT ON FUNCTION public.sdr_scan_time_elapsed() IS
  'Avalia regras time_elapsed para todos os leads ativos de todas as clinicas.'
  ' Chamar a cada hora via pg_cron (Supabase Pro) ou Edge Function (Free/Starter).';

-- ── pg_cron: registra job a cada hora ────────────────────────
-- Disponível no Supabase Pro/Enterprise. No Free/Starter:
--   Criar Edge Function `sdr-cron` com Deno.cron("0 * * * *", ...)
--   que chame: supabase.rpc('sdr_scan_time_elapsed')

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    -- Remove job anterior (idempotente)
    BEGIN
      PERFORM cron.unschedule('sdr-time-elapsed');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'sdr-time-elapsed',
      '0 * * * *',
      'SELECT public.sdr_scan_time_elapsed()'
    );
    RAISE NOTICE 'pg_cron: sdr-time-elapsed agendado (0 * * * * — a cada hora).';
  ELSE
    RAISE NOTICE 'pg_cron indisponivel neste tier. Agendar sdr_scan_time_elapsed via Edge Function.';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponivel: %. Agendar via Edge Function.', SQLERRM;
END;
$$;

-- ============================================================
-- VERIFICACAO:
--   SELECT sdr_scan_time_elapsed();
--   SELECT * FROM cron.job WHERE jobname = 'sdr-time-elapsed';
-- ============================================================
