-- ============================================================
-- Migration: Saudade para Pacientes Inativas (não-parceiras)
--
-- Story: s1-7 do Plano de Growth (2026-04-17)
--
-- Replica o padrão vpi_saudade (entregue em 20260700000075) para
-- pacientes inativas gerais — quem finalizou ao menos 1 procedimento
-- e sumiu, MAS não é parceira VPI. Reativa com WA editável.
--
-- Diferente do VPI saudade:
--   - Usa appointments.patient_phone como chave (não partner_id)
--   - Exclui quem já é vpi_partners ativa (match por right(phone,8))
--   - Template separado (patients_saudade) sem benefícios VPI
--   - pg_cron dia 20 14h BRT (15 é do VPI — espaça cadência)
--   - Anti-spam via vpi_audit_log com entity_type='patient_phone'
--     e entity_id=phone_suffix (8 últimos dígitos)
--
-- Componentes:
--   1) Template WA 'patients_saudade' em wa_agenda_automations
--   2) RPC patients_saudade_scan(p_months) → jsonb array
--   3) RPC patients_saudade_send(p_phone, p_name, p_meses) → enfileira
--   4) RPC patients_saudade_send_batch(p_months) → scan + send loop
--   5) pg_cron patients_saudade_monthly dia 20 17h UTC = 14h BRT
--
-- Idempotente (CREATE OR REPLACE, unique slug, unschedule).
-- Graceful degrade se appointments/wa_agenda_automations não existirem.
-- ============================================================

-- ── 1. Template WA ───────────────────────────────────────────
DO $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_content text;
  v_id uuid;
BEGIN
  v_content :=
E'Oi, *{{nome}}*! \U0001F49C\n\n' ||
E'Estamos *sentindo sua falta* aqui na *Clinica Mirian de Paula Beauty & Health*.\n\n' ||
E'Faz *{{meses_desde_ultimo}} meses* desde seu ultimo procedimento conosco. \u2728\n\n' ||
E'Sabemos que os resultados sao gradativos e que manter o protocolo e o que faz toda diferenca — e gostariamos muito de te ver de volta.\n\n' ||
E'Que tal agendar uma avaliacao de retorno?\n\n' ||
E'Nos responde aqui que a gente organiza um horario tranquilo pra voce. \U0001F31F\n\n' ||
E'*Clinica Mirian de Paula*';

  SELECT id INTO v_id FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic AND slug = 'patients_saudade' LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.wa_agenda_automations (
      clinic_id, slug, name, description,
      category, sort_order, trigger_type, trigger_config,
      recipient_type, channel, content_template, is_active
    ) VALUES (
      v_clinic, 'patients_saudade',
      'Saudade Pacientes Inativas',
      'Varredura mensal (dia 20) pra pacientes que finalizaram ao menos 1 procedimento e sumiram. Exclui parceiras VPI (tem fluxo proprio) e anti-spam 60d.',
      'pos', 31, 'on_demand', '{}'::jsonb,
      'patient', 'whatsapp', v_content, true
    );
    RAISE NOTICE '[patients_saudade] template criado';
  ELSE
    UPDATE public.wa_agenda_automations
       SET description = 'Varredura mensal (dia 20) pra pacientes que finalizaram ao menos 1 procedimento e sumiram. Exclui parceiras VPI (tem fluxo proprio) e anti-spam 60d.'
     WHERE id = v_id;
    RAISE NOTICE '[patients_saudade] template atualizado (content preservado)';
  END IF;
EXCEPTION
  WHEN undefined_column THEN RAISE NOTICE '[patients_saudade] wa_agenda_automations schema ausente';
  WHEN undefined_table  THEN RAISE NOTICE '[patients_saudade] wa_agenda_automations nao existe';
END $$;

-- ── 2. RPC: scan elegiveis ───────────────────────────────────
-- Pacientes = pessoas unicas em appointments (agrupadas por right(phone,8))
-- que tem >=1 appt finalizado em qualquer tempo, MAS:
--   - sem appt finalizado nos ultimos N meses
--   - nao sao vpi_partners ativas (fluxo VPI cuida delas)
--   - sem saudade enviada nos ultimos 60 dias (audit anti-spam)
--   - phone minimamente valido (>=8 digitos)
CREATE OR REPLACE FUNCTION public.patients_saudade_scan(
  p_months int DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_cutoff    timestamptz;
  v_months    int := GREATEST(1, COALESCE(p_months, 5));
  v_out       jsonb;
BEGIN
  v_cutoff := now() - (v_months || ' months')::interval;

  SELECT COALESCE(jsonb_agg(row_to_json(q.*) ORDER BY q.meses_desde_ultimo DESC), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT
        grouped.phone_suffix,
        grouped.phone,
        grouped.nome,
        grouped.ultimo_procedimento,
        ((current_date - grouped.ultimo_procedimento) / 30)::int AS meses_desde_ultimo
      FROM (
        SELECT
          right(regexp_replace(COALESCE(a.patient_phone,''), '\D','','g'), 8) AS phone_suffix,
          (array_agg(a.patient_phone ORDER BY a.scheduled_date DESC))[1] AS phone,
          (array_agg(a.patient_name  ORDER BY a.scheduled_date DESC))[1] AS nome,
          MAX(a.scheduled_date) AS ultimo_procedimento
        FROM public.appointments a
        WHERE a.clinic_id = v_clinic_id
          AND a.status IN ('finalizado','realizado','completed','concluido','done')
          AND COALESCE(a.patient_phone,'') <> ''
          AND length(regexp_replace(a.patient_phone, '\D','','g')) >= 8
        GROUP BY right(regexp_replace(COALESCE(a.patient_phone,''), '\D','','g'), 8)
      ) grouped
      WHERE grouped.phone_suffix IS NOT NULL
        AND grouped.phone_suffix <> ''
        AND grouped.ultimo_procedimento IS NOT NULL
        AND grouped.ultimo_procedimento < v_cutoff::date
        -- Exclui parceiras VPI ativas (tem fluxo proprio)
        AND NOT EXISTS (
          SELECT 1 FROM public.vpi_partners p
           WHERE p.clinic_id = v_clinic_id
             AND p.status = 'ativo'
             AND right(regexp_replace(COALESCE(p.phone,''), '\D','','g'), 8) = grouped.phone_suffix
        )
        -- Anti-spam: sem saudade_sent nos ultimos 60d
        AND NOT EXISTS (
          SELECT 1 FROM public.vpi_audit_log la
           WHERE la.action = 'patients_saudade_sent'
             AND la.entity_type = 'patient_phone'
             AND la.entity_id = grouped.phone_suffix
             AND la.created_at >= now() - interval '60 days'
        )
    ) q;

  RETURN COALESCE(v_out, '[]'::jsonb);
EXCEPTION
  WHEN undefined_table  THEN
    RAISE NOTICE '[patients_saudade_scan] tabela ausente; retornando []';
    RETURN '[]'::jsonb;
  WHEN undefined_column THEN
    RAISE NOTICE '[patients_saudade_scan] coluna ausente: %', SQLERRM;
    RETURN '[]'::jsonb;
END $$;
GRANT EXECUTE ON FUNCTION public.patients_saudade_scan(int) TO authenticated;

-- ── 3. RPC: send pra 1 paciente ──────────────────────────────
CREATE OR REPLACE FUNCTION public.patients_saudade_send(
  p_phone   text,
  p_name    text DEFAULT NULL,
  p_meses   int  DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id   uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_phone_clean text;
  v_phone_suffix text;
  v_tpl_id      uuid;
  v_tpl_body    text;
  v_content     text;
  v_outbox      uuid;
  v_last_appt   date;
  v_meses       int;
  v_first_name  text;
  v_nome        text;
  v_lead_id     text;
  v_vars        jsonb;
BEGIN
  IF p_phone IS NULL OR p_phone = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_required');
  END IF;

  v_phone_clean  := regexp_replace(p_phone, '\D','','g');
  IF length(v_phone_clean) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone');
  END IF;
  v_phone_suffix := right(v_phone_clean, 8);

  -- Gate: paciente nao pode ser parceira VPI ativa
  IF EXISTS (
    SELECT 1 FROM public.vpi_partners p
     WHERE p.clinic_id = v_clinic_id
       AND p.status = 'ativo'
       AND right(regexp_replace(COALESCE(p.phone,''), '\D','','g'), 8) = v_phone_suffix
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'is_vpi_partner');
  END IF;

  -- Anti-spam 60d
  IF EXISTS (
    SELECT 1 FROM public.vpi_audit_log la
     WHERE la.action = 'patients_saudade_sent'
       AND la.entity_type = 'patient_phone'
       AND la.entity_id = v_phone_suffix
       AND la.created_at >= now() - interval '60 days'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'recent_saudade_60d');
  END IF;

  -- Busca ultimo_procedimento + nome mais recente do appointments
  BEGIN
    SELECT MAX(a.scheduled_date),
           (array_agg(a.patient_name ORDER BY a.scheduled_date DESC) FILTER (WHERE a.patient_name IS NOT NULL))[1]
      INTO v_last_appt, v_nome
      FROM public.appointments a
     WHERE a.clinic_id = v_clinic_id
       AND a.status IN ('finalizado','realizado','completed','concluido','done')
       AND right(regexp_replace(COALESCE(a.patient_phone,''), '\D','','g'), 8) = v_phone_suffix;
  EXCEPTION WHEN OTHERS THEN
    v_last_appt := NULL;
    v_nome := NULL;
  END;

  IF v_last_appt IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_finalized_appt');
  END IF;

  v_meses := COALESCE(p_meses, GREATEST(1, ((current_date - v_last_appt) / 30)::int));
  v_nome  := COALESCE(NULLIF(TRIM(p_name), ''), NULLIF(TRIM(v_nome), ''), 'amiga');

  -- Template
  SELECT id, content_template INTO v_tpl_id, v_tpl_body
    FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic_id
     AND slug = 'patients_saudade'
     AND is_active = true
   LIMIT 1;
  IF v_tpl_id IS NULL OR v_tpl_body IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_not_found');
  END IF;

  v_first_name := split_part(v_nome, ' ', 1);
  v_vars := jsonb_build_object(
    'nome',                v_first_name,
    'nome_completo',       v_nome,
    'meses_desde_ultimo',  v_meses::text
  );

  BEGIN
    v_content := public._wa_render_template(v_tpl_body, v_vars);
  EXCEPTION WHEN undefined_function THEN
    v_content := v_tpl_body;
    v_content := replace(v_content, '{{nome}}',                v_first_name);
    v_content := replace(v_content, '{{nome_completo}}',       v_nome);
    v_content := replace(v_content, '{{meses_desde_ultimo}}',  v_meses::text);
  END;

  -- lead_id nao disponivel de forma confiavel em appointments — usa phone_suffix como key
  v_lead_id := 'patient_' || v_phone_suffix;

  BEGIN
    v_outbox := public.wa_outbox_schedule_automation(
      p_phone         => v_phone_clean,
      p_content       => v_content,
      p_lead_id       => v_lead_id,
      p_lead_name     => v_nome,
      p_scheduled_at  => now(),
      p_appt_ref      => NULL,
      p_rule_id       => v_tpl_id,
      p_ab_variant    => NULL,
      p_vars_snapshot => v_vars
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (v_clinic_id, 'patients_saudade_enqueue_failed', 'patient_phone', v_phone_suffix,
            jsonb_build_object('error', SQLERRM, 'nome', v_nome));
    RETURN jsonb_build_object('ok', false, 'error', 'enqueue_failed', 'detail', SQLERRM);
  END;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic_id, 'patients_saudade_sent', 'patient_phone', v_phone_suffix,
          jsonb_build_object(
            'outbox_id',           v_outbox,
            'nome',                v_nome,
            'meses_desde_ultimo',  v_meses,
            'ultimo_procedimento', v_last_appt
          ));

  RETURN jsonb_build_object(
    'ok',                  true,
    'outbox_id',           v_outbox,
    'phone_suffix',        v_phone_suffix,
    'nome',                v_nome,
    'meses_desde_ultimo',  v_meses
  );
END $$;
GRANT EXECUTE ON FUNCTION public.patients_saudade_send(text, text, int) TO authenticated;

-- ── 4. RPC: batch ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.patients_saudade_send_batch(
  p_months int DEFAULT 5
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_list       jsonb;
  r            record;
  v_sent       int := 0;
  v_skipped    int := 0;
  v_failed     int := 0;
  v_res        jsonb;
  v_reasons    jsonb := '{}'::jsonb;
  v_reason     text;
BEGIN
  v_list := public.patients_saudade_scan(p_months);

  FOR r IN SELECT elem->>'phone' AS phone,
                  elem->>'nome'  AS nome,
                  (elem->>'meses_desde_ultimo')::int AS meses
             FROM jsonb_array_elements(v_list) elem
  LOOP
    BEGIN
      v_res := public.patients_saudade_send(r.phone, r.nome, r.meses);
      IF COALESCE((v_res->>'ok')::boolean, false) THEN
        v_sent := v_sent + 1;
      ELSE
        v_skipped := v_skipped + 1;
        v_reason := COALESCE(v_res->>'error', 'unknown');
        v_reasons := v_reasons || jsonb_build_object(
          v_reason,
          COALESCE((v_reasons->>v_reason)::int, 0) + 1
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES ('00000000-0000-0000-0000-000000000001'::uuid,
          'patients_saudade_batch_done', 'patient_phone', NULL,
          jsonb_build_object(
            'scanned', jsonb_array_length(v_list),
            'sent',    v_sent,
            'skipped', v_skipped,
            'failed',  v_failed,
            'months',  p_months,
            'reasons', v_reasons
          ));

  RETURN jsonb_build_object(
    'ok',              true,
    'total_scanned',   jsonb_array_length(v_list),
    'sent_count',      v_sent,
    'skipped_count',   v_skipped,
    'failed_count',    v_failed,
    'skipped_reasons', v_reasons
  );
END $$;
GRANT EXECUTE ON FUNCTION public.patients_saudade_send_batch(int) TO authenticated;

-- ── 5. pg_cron mensal dia 20 14h BRT (17h UTC) ──────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('patients_saudade_monthly');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'patients_saudade_monthly',
      '0 17 20 * *',
      'SELECT public.patients_saudade_send_batch(5)'
    );
    RAISE NOTICE '[patients_saudade_monthly] agendado 0 17 20 * * UTC = dia 20 14h BRT';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron falhou: %. Configurar manualmente.', SQLERRM;
END $$;

-- ── 6. Sanity ────────────────────────────────────────────────
DO $$
DECLARE v_tpl int; v_fn int; v_job int;
BEGIN
  SELECT count(*) INTO v_tpl FROM public.wa_agenda_automations
   WHERE slug='patients_saudade' AND is_active = true;
  SELECT count(*) INTO v_fn FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('patients_saudade_scan','patients_saudade_send','patients_saudade_send_batch');
  BEGIN
    SELECT count(*) INTO v_job FROM cron.job WHERE jobname='patients_saudade_monthly';
  EXCEPTION WHEN OTHERS THEN v_job := -1; END;
  RAISE NOTICE '[patients_saudade] template=% fn=% cron=%', v_tpl, v_fn, v_job;
END $$;
