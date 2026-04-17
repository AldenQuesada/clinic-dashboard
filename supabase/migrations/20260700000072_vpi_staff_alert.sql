-- ============================================================
-- Migration: VPI Staff Alert on High Tier (Fase 7 - Entrega 3)
--
-- Quando parceira bate tier 'high_performance' (Niveis 1/2/3 =
-- iPhone, R$10k, R$20k), a equipe precisa ser avisada pra entregar
-- o premio fisicamente. Hoje so a parceira recebe WA.
--
-- Componentes:
--   1) Setting staff_alert_phone/enabled em clinics.settings jsonb
--   2) Template 'vpi_alerta_staff_tier_alto' em wa_agenda_automations
--      (on_demand, editavel pelo Funil)
--   3) RPC vpi_alert_staff(partner_id, tier_id)
--   4) Hook em vpi_high_performance_check: quando registra um hit
--      high_performance, chama vpi_alert_staff best-effort
--
-- Idempotente: CREATE OR REPLACE, upsert setting via jsonb merge,
-- slug unico do template, hook best-effort.
-- ============================================================

-- ── 1. Template WA editavel pelo Funil ──────────────────────
DO $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_content text;
  v_id uuid;
BEGIN
  v_content :=
E'*[ALERTA VPI - Tier Alto]*\n\n' ||
E'*{{partner_nome}}* (Membro #{{partner_numero}}) atingiu o tier *{{tier_nome}}*.\n\n' ||
E'- Recompensa: {{tier_recompensa}}\n' ||
E'- Valor da recompensa: R$ {{tier_valor}}\n' ||
E'- Creditos totais: {{creditos_total}}\n' ||
E'- Ultima indicacao: {{ultima_indicacao_data}}\n\n' ||
E'*Acao:* entrar em contato pra combinar a entrega.\n\n' ||
E'Clinica Mirian de Paula Beauty & Health';

  SELECT id INTO v_id FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic AND slug = 'vpi_alerta_staff_tier_alto' LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.wa_agenda_automations (
      clinic_id, slug, name, description,
      category, sort_order, trigger_type, trigger_config,
      recipient_type, channel, content_template, is_active
    ) VALUES (
      v_clinic, 'vpi_alerta_staff_tier_alto',
      'VPI Alerta Staff (Tier Alto)',
      'Disparado quando parceira bate tier high_performance (Nivel 1/2/3). Enviado pro staff_alert_phone em clinics.settings.',
      'internal', 20, 'on_demand', '{}'::jsonb,
      'staff', 'whatsapp', v_content, true
    );
  ELSE
    UPDATE public.wa_agenda_automations
       SET content_template = v_content,
           description = 'Disparado quando parceira bate tier high_performance (Nivel 1/2/3). Enviado pro staff_alert_phone em clinics.settings.'
     WHERE id = v_id;
  END IF;
EXCEPTION
  WHEN undefined_column THEN RAISE NOTICE '[vpi_alerta_staff] schema wa_agenda_automations ausente';
  WHEN undefined_table  THEN RAISE NOTICE '[vpi_alerta_staff] wa_agenda_automations nao existe';
END $$;

-- ── 2. Helper: get staff alert config ───────────────────────
CREATE OR REPLACE FUNCTION public.vpi_staff_alert_config()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_settings jsonb;
  v_vpi jsonb;
BEGIN
  BEGIN
    SELECT COALESCE(settings, '{}'::jsonb) INTO v_settings
      FROM public.clinics WHERE id = v_clinic;
  EXCEPTION WHEN OTHERS THEN
    v_settings := '{}'::jsonb;
  END;

  v_vpi := COALESCE(v_settings->'vpi', '{}'::jsonb);

  RETURN jsonb_build_object(
    'phone',   NULLIF(v_vpi->>'staff_alert_phone', ''),
    'enabled', COALESCE((v_vpi->>'staff_alert_enabled')::boolean, true)
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_staff_alert_config() TO authenticated;

-- ── 3. RPC: alerta staff ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_alert_staff(
  p_partner_id uuid,
  p_tier_id    uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic   uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_partner  public.vpi_partners%ROWTYPE;
  v_tier     public.vpi_reward_tiers%ROWTYPE;
  v_cfg      jsonb;
  v_phone    text;
  v_enabled  boolean;
  v_tpl_id   uuid;
  v_tpl_body text;
  v_content  text;
  v_last     timestamptz;
  v_vars     jsonb;
  v_outbox   uuid;
BEGIN
  IF p_partner_id IS NULL OR p_tier_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'params_required');
  END IF;

  v_cfg := public.vpi_staff_alert_config();
  v_phone := v_cfg->>'phone';
  v_enabled := COALESCE((v_cfg->>'enabled')::boolean, false);

  IF NOT v_enabled THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'disabled');
  END IF;
  IF v_phone IS NULL OR length(regexp_replace(v_phone,'\D','','g')) < 8 THEN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (v_clinic, 'staff_alert_skipped_no_phone', 'partner', p_partner_id::text,
            jsonb_build_object('tier_id', p_tier_id));
    RETURN jsonb_build_object('ok', false, 'reason', 'no_phone_configured');
  END IF;

  SELECT * INTO v_partner FROM public.vpi_partners
   WHERE id = p_partner_id AND clinic_id = v_clinic;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'partner_not_found'); END IF;

  SELECT * INTO v_tier FROM public.vpi_reward_tiers
   WHERE id = p_tier_id AND clinic_id = v_clinic;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'tier_not_found'); END IF;

  SELECT id, content_template INTO v_tpl_id, v_tpl_body
    FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic AND slug = 'vpi_alerta_staff_tier_alto' AND is_active = true
   LIMIT 1;
  IF v_tpl_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'template_not_found');
  END IF;

  SELECT MAX(fechada_em) INTO v_last
    FROM public.vpi_indications
   WHERE partner_id = v_partner.id AND status = 'closed';

  v_vars := jsonb_build_object(
    'partner_nome',           COALESCE(v_partner.nome, ''),
    'partner_numero',         COALESCE(v_partner.numero_membro::text, ''),
    'tier_nome',              CASE
      WHEN v_tier.threshold = 50  THEN 'Nivel 1 (50 indicacoes)'
      WHEN v_tier.threshold = 100 THEN 'Nivel 2 (100 indicacoes)'
      WHEN v_tier.threshold = 150 THEN 'Nivel 3 (150 indicacoes)'
      ELSE 'High Performance ' || v_tier.threshold
    END,
    'tier_recompensa',        COALESCE(v_tier.recompensa, ''),
    'tier_valor',             to_char(COALESCE(v_tier.recompensa_valor, 0), 'FM9G999G999D00'),
    'creditos_total',         COALESCE(v_partner.creditos_total, 0)::text,
    'ultima_indicacao_data',  COALESCE(to_char(v_last AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'), '-')
  );

  BEGIN
    v_content := public._wa_render_template(v_tpl_body, v_vars);
  EXCEPTION WHEN undefined_function THEN
    v_content := public._vpi_render(v_tpl_body, v_vars);
  END;

  BEGIN
    v_outbox := public.wa_outbox_schedule_automation(
      p_phone         => v_phone,
      p_content       => v_content,
      p_lead_id       => v_partner.id::text,
      p_lead_name     => 'STAFF',
      p_scheduled_at  => now(),
      p_appt_ref      => NULL,
      p_rule_id       => v_tpl_id,
      p_ab_variant    => NULL,
      p_vars_snapshot => v_vars
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (v_clinic, 'staff_alert_failed', 'partner', p_partner_id::text,
            jsonb_build_object('tier_id', p_tier_id, 'error', SQLERRM));
    RETURN jsonb_build_object('ok', false, 'reason', 'enqueue_failed', 'detail', SQLERRM);
  END;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic, 'staff_tier_alert_sent', 'partner', p_partner_id::text,
          jsonb_build_object(
            'tier_id', p_tier_id,
            'threshold', v_tier.threshold,
            'recompensa', v_tier.recompensa,
            'outbox_id', v_outbox,
            'staff_phone_suffix', right(regexp_replace(v_phone,'\D','','g'), 4)
          ));

  RETURN jsonb_build_object(
    'ok', true, 'outbox_id', v_outbox,
    'partner_id', p_partner_id, 'tier_id', p_tier_id
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_alert_staff(uuid, uuid) TO authenticated;

-- ── 4. Hook em vpi_high_performance_check ───────────────────
-- Reescreve com chamada a vpi_alert_staff em cada hit registrado.
CREATE OR REPLACE FUNCTION public.vpi_high_performance_check()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic         uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_tier           public.vpi_reward_tiers%ROWTYPE;
  v_partner        public.vpi_partners%ROWTYPE;
  v_meses_ok       int;
  v_min_por_mes    int;
  v_hits           jsonb := '[]'::jsonb;
  v_emitted_count  int := 0;
  v_wa_count       int := 0;
  v_wa_failed      int := 0;
  v_last_ind       public.vpi_indications%ROWTYPE;
  v_emitted        jsonb;
  v_msg            text;
  v_vars           jsonb;
  v_can_wa         boolean;
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
          SELECT date_trunc('month', fechada_em) AS m
            FROM public.vpi_indications
           WHERE clinic_id = v_clinic
             AND partner_id = v_partner.id
             AND status = 'closed'
             AND fechada_em >= date_trunc('year', now())
           GROUP BY 1
          HAVING COUNT(*) >= v_min_por_mes
        ) meses;

      IF v_meses_ok >= COALESCE(v_tier.required_consecutive_months, 11) THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.vpi_indications i
           WHERE i.partner_id = v_partner.id
             AND i.recompensas_emitidas @> jsonb_build_array(jsonb_build_object('tier_id', v_tier.id::text))
        ) THEN
          v_hits := v_hits || jsonb_build_array(jsonb_build_object(
            'partner_id',   v_partner.id,
            'partner_nome', v_partner.nome,
            'tier_id',      v_tier.id,
            'threshold',    v_tier.threshold,
            'recompensa',   v_tier.recompensa
          ));

          -- Registra recompensa na indication mais recente
          SELECT * INTO v_last_ind
            FROM public.vpi_indications
           WHERE partner_id = v_partner.id
             AND status = 'closed'
           ORDER BY fechada_em DESC
           LIMIT 1;

          IF FOUND THEN
            v_emitted := jsonb_build_object(
              'tier_id',     v_tier.id::text,
              'threshold',   v_tier.threshold,
              'recompensa',  v_tier.recompensa,
              'emitted_at',  now(),
              'source',      'high_perf_check'
            );
            UPDATE public.vpi_indications
               SET recompensas_emitidas = recompensas_emitidas || jsonb_build_array(v_emitted)
             WHERE id = v_last_ind.id;
            v_emitted_count := v_emitted_count + 1;

            -- Notifica parceira (gate LGPD)
            v_can_wa := (
              v_partner.phone IS NOT NULL
              AND length(regexp_replace(v_partner.phone,'\D','','g')) >= 8
              AND v_partner.status = 'ativo'
              AND v_partner.lgpd_consent_at IS NOT NULL
              AND v_partner.opt_out_at IS NULL
            );

            IF v_can_wa THEN
              v_vars := jsonb_build_object(
                'nome',            split_part(v_partner.nome, ' ', 1),
                'nome_completo',   v_partner.nome,
                'threshold',       v_tier.threshold::text,
                'recompensa',      v_tier.recompensa,
                'creditos_atuais', v_partner.creditos_total::text,
                'faltam',          '0',
                'clinica',         'Clinica Mirian de Paula Beauty & Health'
              );
              v_msg := public._vpi_render(v_tier.msg_template, v_vars);
              BEGIN
                PERFORM public.wa_outbox_schedule_automation(
                  v_partner.phone, v_msg,
                  COALESCE(v_partner.lead_id, v_partner.id::text),
                  v_partner.nome, now(),
                  v_last_ind.appt_id, NULL, NULL, v_vars
                );
                v_wa_count := v_wa_count + 1;
              EXCEPTION WHEN OTHERS THEN
                v_wa_failed := v_wa_failed + 1;
              END;
            END IF;
          END IF;

          -- Alerta staff (best-effort, nao bloqueia loop)
          BEGIN
            PERFORM public.vpi_alert_staff(v_partner.id, v_tier.id);
          EXCEPTION WHEN OTHERS THEN
            INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
            VALUES (v_clinic, 'staff_alert_exception', 'partner', v_partner.id::text,
                    jsonb_build_object('tier_id', v_tier.id, 'error', SQLERRM));
          END;

          INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
          VALUES (v_clinic, 'high_perf_hit', 'partner', v_partner.id::text,
                  jsonb_build_object('tier_id', v_tier.id, 'threshold', v_tier.threshold));
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',             true,
    'hits',           v_hits,
    'emitted_count',  v_emitted_count,
    'wa_count',       v_wa_count,
    'wa_failed',      v_wa_failed
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_high_performance_check() TO anon, authenticated;

-- ── 4.b. RPCs de get/set config ─────────────────────────────
-- Leitura publica pra authenticated (UI le config atual).
-- Update seta clinics.settings->vpi->staff_alert_phone via jsonb merge.
CREATE OR REPLACE FUNCTION public.vpi_staff_alert_config_update(
  p_phone   text,
  p_enabled boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_phone_d text;
  v_current jsonb;
  v_vpi     jsonb;
  v_new     jsonb;
BEGIN
  v_phone_d := NULLIF(regexp_replace(COALESCE(p_phone,''), '\D','','g'), '');
  IF v_phone_d IS NOT NULL AND length(v_phone_d) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  END IF;

  BEGIN
    SELECT COALESCE(settings, '{}'::jsonb) INTO v_current
      FROM public.clinics WHERE id = v_clinic;
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'clinics_table_missing');
  END;

  v_vpi := COALESCE(v_current->'vpi', '{}'::jsonb);
  v_vpi := v_vpi
    || jsonb_build_object('staff_alert_phone',   COALESCE(v_phone_d, ''))
    || jsonb_build_object('staff_alert_enabled', COALESCE(p_enabled, true));

  v_new := v_current || jsonb_build_object('vpi', v_vpi);

  UPDATE public.clinics SET settings = v_new WHERE id = v_clinic;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic, 'staff_alert_config', 'setting', NULL,
          jsonb_build_object(
            'phone_set', v_phone_d IS NOT NULL,
            'phone_suffix', right(COALESCE(v_phone_d,''), 4),
            'enabled', p_enabled
          ));

  RETURN jsonb_build_object('ok', true, 'config', public.vpi_staff_alert_config());
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_staff_alert_config_update(text, boolean) TO authenticated;

-- ── 5. Sanity ────────────────────────────────────────────────
DO $$
DECLARE v_tpl int; v_fn int;
BEGIN
  SELECT count(*) INTO v_tpl FROM public.wa_agenda_automations WHERE slug='vpi_alerta_staff_tier_alto';
  SELECT count(*) INTO v_fn  FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname IN ('vpi_alert_staff','vpi_staff_alert_config');
  RAISE NOTICE '[vpi_staff_alert] template=% funcoes=%', v_tpl, v_fn;
END $$;
