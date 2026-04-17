-- ============================================================
-- Migration: VPI "Sentindo sua falta" (Fase 7 - Entrega 7)
--
-- Parceira VPI ativa + com consent LGPD, sem procedimento em
-- appointments nos ultimos 5+ meses recebe WA de retorno
-- com os beneficios exclusivos (5x R$200 Botox, AH, Fotona, etc.)
--
-- Anti-spam: nao envia se recebeu saudade nos ultimos 60 dias.
-- Editavel pelo Funil (slug vpi_saudade_parceira).
-- pg_cron mensal dia 15 14h BRT.
--
-- Componentes:
--   1) Template WA 'vpi_saudade_parceira' em wa_agenda_automations
--   2) RPC vpi_saudade_scan(p_months) -> jsonb array partners
--   3) RPC vpi_saudade_send(p_partner_id) -> enfileira WA
--   4) RPC vpi_saudade_send_batch(p_months) -> scan+send em loop
--   5) pg_cron vpi_saudade_monthly dia 15 17h UTC = 14h BRT
--
-- Idempotente (CREATE OR REPLACE, unique slug, unschedule).
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
E'Estamos *sentindo sua falta* aqui na *Clinica Mirian de Paula Beauty & Health*...\n\n' ||
E'Faz *{{meses_desde_ultimo}} meses* desde seu ultimo procedimento conosco, e gostariamos muito de te ver de novo! \u2728\n\n' ||
E'Como *parceira oficial* do nosso programa VPI, voce tem acesso aos beneficios exclusivos:\n' ||
E'- Preco exclusivo em Botox: *5x R$ 200*\n' ||
E'- Acido Hialuronico 1ml: *5x R$ 200*\n' ||
E'- Veu de Noiva + Anovator A5 em cada procedimento\n' ||
E'- Acumulo de creditos pro Fotona 4D\n\n' ||
E'Nosso espaco esta te esperando. Que tal agendar seu retorno?\n\n' ||
E'Nos chama aqui quando quiser. \U0001F31F\n\n' ||
E'*Clinica Mirian de Paula*';

  SELECT id INTO v_id FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic AND slug = 'vpi_saudade_parceira' LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.wa_agenda_automations (
      clinic_id, slug, name, description,
      category, sort_order, trigger_type, trigger_config,
      recipient_type, channel, content_template, is_active
    ) VALUES (
      v_clinic, 'vpi_saudade_parceira',
      'VPI Sentindo Sua Falta',
      'Varredura mensal (dia 15) pra parceiras VPI ativas com consent LGPD e sem procedimento ha 5+ meses. Reactiva com beneficios exclusivos.',
      'pos', 30, 'on_demand', '{}'::jsonb,
      'patient', 'whatsapp', v_content, true
    );
    RAISE NOTICE '[vpi_saudade_parceira] template criado';
  ELSE
    UPDATE public.wa_agenda_automations
       SET content_template = v_content,
           description = 'Varredura mensal (dia 15) pra parceiras VPI ativas com consent LGPD e sem procedimento ha 5+ meses. Reactiva com beneficios exclusivos.'
     WHERE id = v_id;
    RAISE NOTICE '[vpi_saudade_parceira] template atualizado';
  END IF;
EXCEPTION
  WHEN undefined_column THEN RAISE NOTICE '[vpi_saudade] wa_agenda_automations schema ausente';
  WHEN undefined_table  THEN RAISE NOTICE '[vpi_saudade] wa_agenda_automations nao existe';
END $$;

-- ── 2. RPC: scan elegiveis ───────────────────────────────────
-- Filtros:
--   - status='ativo' AND lgpd_consent_at IS NOT NULL AND opt_out_at IS NULL
--   - sem appt finalizado em appointments nos ultimos N meses
--     (match por right(phone,8))
--   - sem saudade_sent no audit nos ultimos 60 dias
--   - com phone minimamente valido
CREATE OR REPLACE FUNCTION public.vpi_saudade_scan(
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
      SELECT p.id,
             p.nome,
             p.phone,
             p.creditos_total,
             p.tier_atual,
             p.card_token,
             -- Meses desde o ultimo procedimento em appointments
             COALESCE(
               ((current_date - (
                 SELECT MAX(a.scheduled_date)
                   FROM public.appointments a
                  WHERE a.clinic_id = v_clinic_id
                    AND a.status IN ('finalizado','realizado','completed','concluido','done')
                    AND p.phone IS NOT NULL
                    AND right(regexp_replace(COALESCE(a.patient_phone,''), '\D','','g'), 8) = right(p.phone, 8)
               )) / 30),
               999
             )::int AS meses_desde_ultimo,
             (SELECT MAX(a.scheduled_date)
                FROM public.appointments a
               WHERE a.clinic_id = v_clinic_id
                 AND a.status IN ('finalizado','realizado','completed','concluido','done')
                 AND p.phone IS NOT NULL
                 AND right(regexp_replace(COALESCE(a.patient_phone,''), '\D','','g'), 8) = right(p.phone, 8)
             ) AS ultimo_procedimento
        FROM public.vpi_partners p
       WHERE p.clinic_id = v_clinic_id
         AND p.status = 'ativo'
         AND p.lgpd_consent_at IS NOT NULL
         AND p.opt_out_at IS NULL
         AND COALESCE(p.phone, '') <> ''
         AND length(regexp_replace(p.phone, '\D','','g')) >= 8
         -- sem appt finalizado nos ultimos N meses
         AND NOT EXISTS (
           SELECT 1 FROM public.appointments a
            WHERE a.clinic_id = v_clinic_id
              AND a.status IN ('finalizado','realizado','completed','concluido','done')
              AND a.scheduled_date >= v_cutoff::date
              AND right(regexp_replace(COALESCE(a.patient_phone,''), '\D','','g'), 8) = right(p.phone, 8)
         )
         -- sem saudade recente
         AND NOT EXISTS (
           SELECT 1 FROM public.vpi_audit_log la
            WHERE la.action = 'saudade_sent'
              AND la.entity_type = 'partner'
              AND la.entity_id = p.id::text
              AND la.created_at >= now() - interval '60 days'
         )
    ) q;

  RETURN COALESCE(v_out, '[]'::jsonb);
EXCEPTION
  -- Graceful degrade se tabela appointments nao existir
  WHEN undefined_table  THEN
    RAISE NOTICE '[vpi_saudade_scan] appointments ausente; retornando []';
    RETURN '[]'::jsonb;
  WHEN undefined_column THEN
    RAISE NOTICE '[vpi_saudade_scan] coluna ausente em appointments: %', SQLERRM;
    RETURN '[]'::jsonb;
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_saudade_scan(int) TO authenticated;

-- ── 3. RPC: send pra 1 partner ───────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_saudade_send(
  p_partner_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id  uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_partner    public.vpi_partners%ROWTYPE;
  v_tpl_id     uuid;
  v_tpl_body   text;
  v_content    text;
  v_outbox     uuid;
  v_last_appt  date;
  v_meses      int := 0;
  v_first_name text;
  v_vars       jsonb;
BEGIN
  IF p_partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partner_id_required');
  END IF;

  SELECT * INTO v_partner FROM public.vpi_partners
   WHERE id = p_partner_id AND clinic_id = v_clinic_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partner_not_found');
  END IF;

  -- Gate LGPD
  IF v_partner.status <> 'ativo'
     OR v_partner.lgpd_consent_at IS NULL
     OR v_partner.opt_out_at IS NOT NULL THEN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (v_clinic_id, 'saudade_skipped_no_consent', 'partner', p_partner_id::text,
            jsonb_build_object('status', v_partner.status,
                               'has_consent', v_partner.lgpd_consent_at IS NOT NULL));
    RETURN jsonb_build_object('ok', false, 'error', 'no_consent_or_inactive');
  END IF;

  IF COALESCE(v_partner.phone, '') = '' OR length(regexp_replace(v_partner.phone, '\D','','g')) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone');
  END IF;

  -- Anti-spam: skip se ja enviou nos ultimos 60d
  IF EXISTS (
    SELECT 1 FROM public.vpi_audit_log
     WHERE action = 'saudade_sent'
       AND entity_type = 'partner'
       AND entity_id = p_partner_id::text
       AND created_at >= now() - interval '60 days'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'recent_saudade_60d');
  END IF;

  -- Calcula meses_desde_ultimo via appointments
  BEGIN
    SELECT MAX(a.scheduled_date) INTO v_last_appt
      FROM public.appointments a
     WHERE a.clinic_id = v_clinic_id
       AND a.status IN ('finalizado','realizado','completed','concluido','done')
       AND right(regexp_replace(COALESCE(a.patient_phone,''), '\D','','g'), 8)
           = right(regexp_replace(v_partner.phone, '\D','','g'), 8);
  EXCEPTION WHEN OTHERS THEN
    v_last_appt := NULL;
  END;

  IF v_last_appt IS NOT NULL THEN
    v_meses := GREATEST(1, ((current_date - v_last_appt) / 30)::int);
  ELSE
    v_meses := 6; -- fallback generico
  END IF;

  -- Template
  SELECT id, content_template INTO v_tpl_id, v_tpl_body
    FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic_id
     AND slug = 'vpi_saudade_parceira'
     AND is_active = true
   LIMIT 1;
  IF v_tpl_id IS NULL OR v_tpl_body IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_not_found');
  END IF;

  v_first_name := split_part(COALESCE(v_partner.nome, 'Parceira'), ' ', 1);
  v_vars := jsonb_build_object(
    'nome',                v_first_name,
    'nome_completo',       COALESCE(v_partner.nome, ''),
    'meses_desde_ultimo',  v_meses::text,
    'creditos',            COALESCE(v_partner.creditos_total, 0)::text
  );

  BEGIN
    v_content := public._wa_render_template(v_tpl_body, v_vars);
  EXCEPTION WHEN undefined_function THEN
    v_content := v_tpl_body;
    v_content := replace(v_content, '{{nome}}',                v_first_name);
    v_content := replace(v_content, '{{nome_completo}}',       COALESCE(v_partner.nome, ''));
    v_content := replace(v_content, '{{meses_desde_ultimo}}',  v_meses::text);
    v_content := replace(v_content, '{{creditos}}',            COALESCE(v_partner.creditos_total, 0)::text);
  END;

  BEGIN
    v_outbox := public.wa_outbox_schedule_automation(
      p_phone         => v_partner.phone,
      p_content       => v_content,
      p_lead_id       => COALESCE(v_partner.lead_id, v_partner.id::text),
      p_lead_name     => COALESCE(v_partner.nome, ''),
      p_scheduled_at  => now(),
      p_appt_ref      => NULL,
      p_rule_id       => v_tpl_id,
      p_ab_variant    => NULL,
      p_vars_snapshot => v_vars
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (v_clinic_id, 'saudade_enqueue_failed', 'partner', p_partner_id::text,
            jsonb_build_object('error', SQLERRM));
    RETURN jsonb_build_object('ok', false, 'error', 'enqueue_failed', 'detail', SQLERRM);
  END;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic_id, 'saudade_sent', 'partner', p_partner_id::text,
          jsonb_build_object(
            'outbox_id',           v_outbox,
            'meses_desde_ultimo',  v_meses,
            'ultimo_procedimento', v_last_appt
          ));

  RETURN jsonb_build_object(
    'ok',            true,
    'outbox_id',     v_outbox,
    'partner_id',    p_partner_id,
    'meses_desde_ultimo', v_meses
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_saudade_send(uuid) TO authenticated;

-- ── 4. RPC: batch ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_saudade_send_batch(
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
  v_list := public.vpi_saudade_scan(p_months);

  FOR r IN SELECT (elem->>'id')::uuid AS id
             FROM jsonb_array_elements(v_list) elem
  LOOP
    BEGIN
      v_res := public.vpi_saudade_send(r.id);
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
          'saudade_batch_done', 'partner', NULL,
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
GRANT EXECUTE ON FUNCTION public.vpi_saudade_send_batch(int) TO authenticated;

-- ── 5. pg_cron mensal dia 15 14h BRT (17h UTC) ──────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('vpi_saudade_monthly');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'vpi_saudade_monthly',
      '0 17 15 * *',
      'SELECT public.vpi_saudade_send_batch(5)'
    );
    RAISE NOTICE '[vpi_saudade_monthly] agendado 0 17 15 * * UTC = dia 15 14h BRT';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron falhou: %. Configurar manualmente.', SQLERRM;
END $$;

-- ── 6. Sanity ────────────────────────────────────────────────
DO $$
DECLARE v_tpl int; v_fn int; v_job int;
BEGIN
  SELECT count(*) INTO v_tpl FROM public.wa_agenda_automations
   WHERE slug='vpi_saudade_parceira' AND is_active = true;
  SELECT count(*) INTO v_fn FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('vpi_saudade_scan','vpi_saudade_send','vpi_saudade_send_batch');
  BEGIN
    SELECT count(*) INTO v_job FROM cron.job WHERE jobname='vpi_saudade_monthly';
  EXCEPTION WHEN OTHERS THEN v_job := -1; END;
  RAISE NOTICE '[vpi_saudade] template=% fn=% cron=%', v_tpl, v_fn, v_job;
END $$;
