-- ============================================================
-- Migration: VPI Lembrete Parceira Dormente (Fase 5 - Entrega 1)
--
-- Parceiras que nao indicaram no mes recebem WA personalizado
-- calculando o progresso pro proximo tier ("faltam X indicacoes
-- pra sua proxima Fotona"). Reativa dormentes, melhora K-factor.
--
-- Componentes:
--   1. RPC vpi_dormant_partners_scan() -> lista partners eligiveis
--   2. RPC vpi_dormant_send_reminder(uuid) -> envia pra 1 partner
--   3. RPC vpi_dormant_send_reminders_batch() -> loop scan+send
--   4. Template WA 'vpi_lembrete_dormente' em wa_agenda_automations
--      (trigger_type=on_demand, nao dispara sozinho)
--   5. pg_cron mensal: dia 1 de cada mes as 10h BRT (13 UTC)
--
-- Reuso: wa_outbox_schedule_automation (dedup + auto-resync)
--        short_links / card_token dos partners pra link
--
-- Idempotente: CREATE OR REPLACE, ADD COLUMN IF NOT EXISTS,
-- slug unico do template, cron.unschedule antes de schedule.
-- ============================================================

-- ── 1. RPC: scan partners dormentes ─────────────────────────
-- Criterios:
--   - status = 'ativo'
--   - tem pelo menos 1 indication closed no historico
--   - sem indication closed nos ultimos 30 dias
--   - sem lembrete dormente enviado nos ultimos 20 dias
--   - creditos_total entre 1 e 149 (ainda tem recompensa pela frente)
CREATE OR REPLACE FUNCTION public.vpi_dormant_partners_scan()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out       jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(q.*) ORDER BY q.creditos_total DESC), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT p.id,
             p.nome,
             p.phone,
             p.creditos_total,
             p.card_token,
             p.short_link_slug,
             p.tier_atual,
             (
               SELECT MAX(i.fechada_em)
                 FROM public.vpi_indications i
                WHERE i.partner_id = p.id AND i.status = 'closed'
             ) AS last_closed_at,
             (
               SELECT COUNT(*)::int
                 FROM public.vpi_indications i
                WHERE i.partner_id = p.id AND i.status = 'closed'
             ) AS total_closed
        FROM public.vpi_partners p
       WHERE p.clinic_id = v_clinic_id
         AND p.status = 'ativo'
         AND COALESCE(p.phone, '') <> ''
         AND p.creditos_total BETWEEN 1 AND 149
         -- tem pelo menos 1 closed no historico
         AND EXISTS (
           SELECT 1 FROM public.vpi_indications i
            WHERE i.partner_id = p.id AND i.status = 'closed'
         )
         -- nenhum closed nos ultimos 30 dias
         AND NOT EXISTS (
           SELECT 1 FROM public.vpi_indications i
            WHERE i.partner_id = p.id
              AND i.status = 'closed'
              AND i.fechada_em >= now() - interval '30 days'
         )
         -- nenhum lembrete dormente nos ultimos 20 dias
         AND NOT EXISTS (
           SELECT 1 FROM public.vpi_audit_log a
            WHERE a.action = 'dormant_reminder_sent'
              AND a.entity_type = 'vpi_partners'
              AND a.entity_id = p.id::text
              AND a.created_at >= now() - interval '20 days'
         )
    ) q;

  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_dormant_partners_scan() TO authenticated;

-- ── 2. RPC: envia lembrete pra 1 partner ─────────────────────
CREATE OR REPLACE FUNCTION public.vpi_dormant_send_reminder(
  p_partner_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id     uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_partner       public.vpi_partners%ROWTYPE;
  v_tpl_id        uuid;
  v_tpl_content   text;
  v_content       text;
  v_outbox_id     uuid;
  v_next_tier     public.vpi_reward_tiers%ROWTYPE;
  v_faltam        int;
  v_pct           int;
  v_prox_recomp   text;
  v_prox_thr      int;
  v_link          text;
  v_first_name    text;
  v_vars          jsonb;
  v_ref_thr       int;
BEGIN
  IF p_partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partner_id_required');
  END IF;

  SELECT * INTO v_partner FROM public.vpi_partners
   WHERE id = p_partner_id AND clinic_id = v_clinic_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partner_not_found');
  END IF;

  IF COALESCE(v_partner.phone, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_phone');
  END IF;

  -- Proximo tier acima dos creditos atuais (milestone ou per_indication)
  SELECT * INTO v_next_tier
    FROM public.vpi_reward_tiers
   WHERE clinic_id = v_clinic_id
     AND is_active = true
     AND tipo IN ('milestone', 'per_indication')
     AND threshold > v_partner.creditos_total
   ORDER BY threshold ASC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_next_tier');
  END IF;

  v_prox_thr    := v_next_tier.threshold;
  v_prox_recomp := v_next_tier.recompensa;
  v_faltam      := GREATEST(1, v_prox_thr - v_partner.creditos_total);

  -- Calcula % do progresso em relacao a janela (tier anterior -> proximo)
  SELECT COALESCE(MAX(t.threshold), 0)
    INTO v_ref_thr
    FROM public.vpi_reward_tiers t
   WHERE t.clinic_id = v_clinic_id
     AND t.is_active = true
     AND t.tipo IN ('milestone', 'per_indication')
     AND t.threshold <= v_partner.creditos_total;

  IF v_prox_thr > v_ref_thr THEN
    v_pct := LEAST(99, GREATEST(0,
      ((v_partner.creditos_total - v_ref_thr)::numeric
         / NULLIF(v_prox_thr - v_ref_thr, 0) * 100)::int));
  ELSE
    v_pct := 0;
  END IF;

  v_first_name := split_part(COALESCE(v_partner.nome, 'Parceira'), ' ', 1);

  -- Link do cartao (usa slug curto se disponivel, fallback pro token)
  IF COALESCE(v_partner.short_link_slug, '') <> '' THEN
    v_link := 'https://clinicai-dashboard.px1hdq.easypanel.host/s/' || v_partner.short_link_slug;
  ELSIF COALESCE(v_partner.card_token, '') <> '' THEN
    v_link := 'https://clinicai-dashboard.px1hdq.easypanel.host/public_embaixadora.html?token=' || v_partner.card_token;
  ELSE
    v_link := 'https://clinicai-dashboard.px1hdq.easypanel.host/';
  END IF;

  -- Localiza template
  SELECT id, content_template
    INTO v_tpl_id, v_tpl_content
    FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic_id
     AND slug = 'vpi_lembrete_dormente'
     AND is_active = true
   LIMIT 1;

  IF v_tpl_id IS NULL OR v_tpl_content IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_not_found');
  END IF;

  v_vars := jsonb_build_object(
    'nome',                    v_first_name,
    'nome_completo',           COALESCE(v_partner.nome, ''),
    'creditos',                v_partner.creditos_total::text,
    'proximo_tier_threshold',  v_prox_thr::text,
    'faltam',                  v_faltam::text,
    'proxima_recompensa',      v_prox_recomp,
    'pct_progresso',           v_pct::text,
    'link_cartao',             v_link
  );

  -- Render via helper (fallback pra replace inline se _wa_render_template nao existir)
  BEGIN
    v_content := public._wa_render_template(v_tpl_content, v_vars);
  EXCEPTION WHEN undefined_function THEN
    v_content := v_tpl_content;
    v_content := replace(v_content, '{{nome}}',                   v_first_name);
    v_content := replace(v_content, '{{creditos}}',               v_partner.creditos_total::text);
    v_content := replace(v_content, '{{proximo_tier_threshold}}', v_prox_thr::text);
    v_content := replace(v_content, '{{faltam}}',                 v_faltam::text);
    v_content := replace(v_content, '{{proxima_recompensa}}',     v_prox_recomp);
    v_content := replace(v_content, '{{pct_progresso}}',          v_pct::text);
    v_content := replace(v_content, '{{link_cartao}}',            v_link);
  END;

  -- Enfileira (rule_id=template_id pra que auto-resync funcione)
  BEGIN
    v_outbox_id := public.wa_outbox_schedule_automation(
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
    VALUES (
      v_clinic_id, 'dormant_reminder_failed', 'vpi_partners',
      p_partner_id::text,
      jsonb_build_object('error', SQLERRM, 'faltam', v_faltam, 'tier_thr', v_prox_thr)
    );
    RETURN jsonb_build_object('ok', false, 'error', 'wa_enqueue_failed', 'detail', SQLERRM);
  END;

  -- Registra no audit (log "sent" mesmo quando outbox_id NULL por unique_violation —
  -- o dedup do outbox ja evita spam; continuar contando como tentativa vale)
  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (
    v_clinic_id, 'dormant_reminder_sent', 'vpi_partners',
    p_partner_id::text,
    jsonb_build_object(
      'outbox_id',              v_outbox_id,
      'creditos',               v_partner.creditos_total,
      'faltam',                 v_faltam,
      'proximo_tier_threshold', v_prox_thr,
      'proxima_recompensa',     v_prox_recomp,
      'pct_progresso',          v_pct
    )
  );

  RETURN jsonb_build_object(
    'ok',              true,
    'outbox_id',       v_outbox_id,
    'partner_id',      p_partner_id,
    'faltam',          v_faltam,
    'pct_progresso',   v_pct,
    'proximo_tier',    v_prox_thr,
    'content_preview', left(v_content, 180)
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_dormant_send_reminder(uuid) TO authenticated;

-- ── 3. RPC: batch envia pra todos os dormentes ──────────────
CREATE OR REPLACE FUNCTION public.vpi_dormant_send_reminders_batch()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_list       jsonb;
  r            record;
  v_sent       int := 0;
  v_skipped    int := 0;
  v_failed     int := 0;
  v_res        jsonb;
BEGIN
  v_list := public.vpi_dormant_partners_scan();

  FOR r IN SELECT (elem->>'id')::uuid AS id
             FROM jsonb_array_elements(v_list) elem
  LOOP
    BEGIN
      v_res := public.vpi_dormant_send_reminder(r.id);
      IF COALESCE((v_res->>'ok')::boolean, false) THEN
        v_sent := v_sent + 1;
      ELSE
        v_skipped := v_skipped + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',            true,
    'total_scanned', jsonb_array_length(v_list),
    'sent_count',    v_sent,
    'skipped_count', v_skipped,
    'failed_count',  v_failed
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_dormant_send_reminders_batch() TO authenticated;

-- ── 4. Template WA ───────────────────────────────────────────
DO $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_exists_id uuid;
  v_content   text;
BEGIN
  v_content :=
E'Oi, *{{nome}}*! \u2728\n\n' ||
E'Passando pra te contar: voce ja tem *{{creditos}} creditos* no nosso programa — isso e *{{pct_progresso}}%* do caminho pra sua proxima *{{proxima_recompensa}}* \U0001F381\n\n' ||
E'Faltam apenas *{{faltam}} indicacoes* pra desbloquear!\n\n' ||
E'Conhece alguem que pode aproveitar nossos protocolos? Vou deixar seu link:\n' ||
E'{{link_cartao}}\n\n' ||
E'*Clinica Mirian de Paula Beauty & Health* \U0001F49C';

  SELECT id INTO v_exists_id
    FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic_id
     AND slug = 'vpi_lembrete_dormente'
   LIMIT 1;

  IF v_exists_id IS NULL THEN
    INSERT INTO public.wa_agenda_automations (
      clinic_id, slug, name, description,
      category, sort_order,
      trigger_type, trigger_config,
      recipient_type, channel,
      content_template,
      is_active
    ) VALUES (
      v_clinic_id,
      'vpi_lembrete_dormente',
      'VPI Lembrete Dormente',
      'Enviada mensalmente (dia 1) pra parceiras ativas que nao indicaram nos ultimos 30 dias. Calcula progresso pro proximo tier e incentiva reativacao.',
      'after', 10,
      'on_demand',
      '{}'::jsonb,
      'patient', 'whatsapp',
      v_content,
      true
    );
    RAISE NOTICE '[vpi_lembrete_dormente] template criado';
  ELSE
    UPDATE public.wa_agenda_automations
       SET content_template = v_content,
           trigger_type     = 'on_demand',
           trigger_config   = '{}'::jsonb,
           description      = 'Enviada mensalmente (dia 1) pra parceiras ativas que nao indicaram nos ultimos 30 dias. Calcula progresso pro proximo tier e incentiva reativacao.'
     WHERE id = v_exists_id;
    RAISE NOTICE '[vpi_lembrete_dormente] template atualizado';
  END IF;
EXCEPTION
  WHEN undefined_column THEN RAISE NOTICE '[vpi_lembrete_dormente] wa_agenda_automations schema ausente';
  WHEN undefined_table  THEN RAISE NOTICE '[vpi_lembrete_dormente] wa_agenda_automations nao existe';
END $$;

-- ── 5. pg_cron: todo dia 1 de cada mes as 10h BRT (13 UTC) ──
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('vpi_dormant_monthly');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'vpi_dormant_monthly',
      '0 13 1 * *',
      'SELECT public.vpi_dormant_send_reminders_batch()'
    );
    RAISE NOTICE '[vpi_dormant_monthly] pg_cron agendado (0 13 1 * * = dia 1 as 10h BRT)';
  ELSE
    RAISE NOTICE 'pg_cron indisponivel; rodar manualmente via vpi_dormant_send_reminders_batch()';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron falhou: %. Configurar manualmente.', SQLERRM;
END $$;

-- ── 6. Sanity note ──────────────────────────────────────────
DO $$
DECLARE v_tpl int; v_job int;
BEGIN
  SELECT COUNT(*) INTO v_tpl FROM public.wa_agenda_automations
   WHERE slug='vpi_lembrete_dormente' AND is_active=true;
  BEGIN
    SELECT COUNT(*) INTO v_job FROM cron.job WHERE jobname='vpi_dormant_monthly';
  EXCEPTION WHEN OTHERS THEN v_job := -1;
  END;
  RAISE NOTICE '[vpi_dormant] template_ativo=% | cron_job=%', v_tpl, v_job;
END $$;
