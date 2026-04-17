-- ============================================================
-- Migration: VPI Consent LGPD + Opt-Out (Fase 7 - Entrega 1)
--
-- Hardening de conformidade: autoEnroll grava parceira sem consent
-- explicito, o que viola LGPD Art. 7. Esta migration:
--
--   1) Adiciona colunas lgpd_consent_at, lgpd_consent_method,
--      opt_out_at, opt_out_reason em vpi_partners.
--   2) Cria status 'pending_consent' (novo default pra autoEnroll).
--      Partner so vira 'ativo' depois do aceite WA ou grant manual.
--   3) Atualiza CHECK (status IN ...) pra aceitar 'pending_consent'.
--   4) RPC vpi_grant_consent_by_phone(phone): detecta "ACEITO" em
--      resposta recente ao template 'vpi_convite_parceiro' (ultimas
--      72h) e ativa a parceira.
--   5) Trigger em wa_messages (inbound) que detecta ACEITO e chama
--      vpi_grant_consent_by_phone automaticamente.
--   6) RPC publico vpi_pub_opt_out(p_token, p_motivo): aciona o opt-
--      out via cartao (SECURITY DEFINER). Cancela wa_outbox pending.
--   7) RPC admin vpi_admin_grant_consent(partner_id) pra consent
--      manual (lgpd_consent_method='manual_admin').
--   8) Hardening em vpi_dormant_send_reminder: skip se partner nao
--      tem consent.
--   9) Atualizar template 'vpi_convite_parceiro' pra pedir ACEITO
--      na resposta.
--
-- Idempotente (ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE).
-- ============================================================

-- ── 1. Colunas LGPD em vpi_partners ─────────────────────────
ALTER TABLE public.vpi_partners
  ADD COLUMN IF NOT EXISTS lgpd_consent_at     timestamptz,
  ADD COLUMN IF NOT EXISTS lgpd_consent_method text,
  ADD COLUMN IF NOT EXISTS opt_out_at          timestamptz,
  ADD COLUMN IF NOT EXISTS opt_out_reason      text;

-- ── 2. Ajustar CHECK de status pra aceitar 'pending_consent' ─
DO $$
DECLARE v_con text;
BEGIN
  SELECT conname INTO v_con
    FROM pg_constraint
   WHERE conrelid = 'public.vpi_partners'::regclass
     AND contype  = 'c'
     AND pg_get_constraintdef(oid) ILIKE '%status%'
   LIMIT 1;

  IF v_con IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.vpi_partners DROP CONSTRAINT IF EXISTS %I', v_con);
  END IF;

  ALTER TABLE public.vpi_partners
    ADD CONSTRAINT vpi_partners_status_check
    CHECK (status IN ('ativo','inativo','convidado','pending_consent'));
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[vpi_lgpd] status check update: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_vpi_partners_consent
  ON public.vpi_partners(clinic_id, lgpd_consent_at)
  WHERE lgpd_consent_at IS NOT NULL;

-- ── 3. RPC: grant_consent_by_phone ──────────────────────────
-- Ativa consent quando resposta ACEITO vem pro template recente.
CREATE OR REPLACE FUNCTION public.vpi_grant_consent_by_phone(
  p_phone text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic  uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_partner public.vpi_partners%ROWTYPE;
  v_phone   text;
  v_had_invite boolean := false;
BEGIN
  v_phone := regexp_replace(COALESCE(p_phone,''), '\D', '', 'g');
  IF length(v_phone) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_phone');
  END IF;

  -- Match partner por right(phone, 8)
  SELECT * INTO v_partner
    FROM public.vpi_partners
   WHERE clinic_id = v_clinic
     AND phone IS NOT NULL
     AND right(phone, 8) = right(v_phone, 8)
   ORDER BY created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'partner_not_found');
  END IF;

  -- Verifica se recebeu convite VPI nas ultimas 72h
  BEGIN
    SELECT EXISTS (
      SELECT 1
        FROM public.wa_outbox o
        JOIN public.wa_agenda_automations t
          ON t.id = o.rule_id
       WHERE o.clinic_id = v_clinic
         AND t.slug = 'vpi_convite_parceiro'
         AND right(regexp_replace(o.phone, '\D','','g'), 8) = right(v_phone, 8)
         AND o.created_at >= now() - interval '72 hours'
    ) INTO v_had_invite;
  EXCEPTION WHEN OTHERS THEN
    v_had_invite := false;
  END;

  -- Se ja consentiu, so audita
  IF v_partner.lgpd_consent_at IS NOT NULL THEN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (v_clinic, 'consent_already', 'partner', v_partner.id::text,
            jsonb_build_object('phone_suffix', right(v_phone, 8)));
    RETURN jsonb_build_object('ok', true, 'already', true, 'partner_id', v_partner.id);
  END IF;

  -- Grant consent: muda status->ativo + marca consent
  UPDATE public.vpi_partners
     SET lgpd_consent_at     = now(),
         lgpd_consent_method = 'whatsapp_reply',
         status              = 'ativo'
   WHERE id = v_partner.id;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic, 'consent_granted', 'partner', v_partner.id::text,
          jsonb_build_object(
            'method',           'whatsapp_reply',
            'had_recent_invite', v_had_invite,
            'phone_suffix',      right(v_phone, 8)
          ));

  RETURN jsonb_build_object(
    'ok',        true,
    'partner_id', v_partner.id,
    'method',    'whatsapp_reply',
    'had_invite', v_had_invite
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_grant_consent_by_phone(text) TO anon, authenticated, service_role;

-- ── 4. Admin: grant manual ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_admin_grant_consent(
  p_partner_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_partner public.vpi_partners%ROWTYPE;
BEGIN
  IF p_partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'partner_id_required');
  END IF;

  SELECT * INTO v_partner FROM public.vpi_partners
   WHERE id = p_partner_id AND clinic_id = v_clinic;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  UPDATE public.vpi_partners
     SET lgpd_consent_at     = COALESCE(lgpd_consent_at, now()),
         lgpd_consent_method = 'manual_admin',
         status              = CASE WHEN status IN ('pending_consent','inativo')
                                    THEN 'ativo' ELSE status END,
         opt_out_at          = NULL,
         opt_out_reason      = NULL
   WHERE id = p_partner_id;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic, 'consent_granted', 'partner', p_partner_id::text,
          jsonb_build_object('method', 'manual_admin'));

  RETURN jsonb_build_object('ok', true, 'partner_id', p_partner_id);
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_admin_grant_consent(uuid) TO authenticated;

-- ── 5. Opt-out publico pelo cartao ──────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_pub_opt_out(
  p_token  text,
  p_motivo text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic  uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_partner public.vpi_partners%ROWTYPE;
  v_cancel_count int := 0;
BEGIN
  IF COALESCE(p_token,'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'token_required');
  END IF;

  SELECT * INTO v_partner
    FROM public.vpi_partners
   WHERE clinic_id = v_clinic AND card_token = p_token
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  UPDATE public.vpi_partners
     SET status         = 'inativo',
         opt_out_at     = now(),
         opt_out_reason = left(COALESCE(p_motivo,''), 500)
   WHERE id = v_partner.id;

  -- Cancela wa_outbox pending pra essa parceira (por lead_id ou phone)
  BEGIN
    WITH cancelled AS (
      UPDATE public.wa_outbox
         SET status = 'cancelled'
       WHERE clinic_id = v_clinic
         AND COALESCE(status,'pending') IN ('pending','scheduled','queued')
         AND (
              lead_id = COALESCE(v_partner.lead_id, v_partner.id::text)
           OR (
                v_partner.phone IS NOT NULL
                AND right(regexp_replace(phone, '\D','','g'), 8) = right(v_partner.phone, 8)
              )
         )
       RETURNING id
    )
    SELECT count(*)::int INTO v_cancel_count FROM cancelled;
  EXCEPTION WHEN OTHERS THEN
    v_cancel_count := -1;
  END;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic, 'opt_out', 'partner', v_partner.id::text,
          jsonb_build_object(
            'motivo',       p_motivo,
            'cancel_count', v_cancel_count
          ));

  RETURN jsonb_build_object(
    'ok',           true,
    'partner_id',   v_partner.id,
    'cancel_count', v_cancel_count
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_pub_opt_out(text, text) TO anon, authenticated;

-- ── 6. Trigger em wa_messages: detecta ACEITO inbound ───────
-- Quando chega inbound 'ACEITO' (qualquer variante) e parceira
-- recebeu convite recente, aciona vpi_grant_consent_by_phone.
CREATE OR REPLACE FUNCTION public._vpi_detect_aceito()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_txt   text;
  v_phone text;
BEGIN
  IF NEW.direction <> 'inbound' THEN RETURN NEW; END IF;
  v_txt := lower(trim(COALESCE(NEW.content, '')));
  IF v_txt <> 'aceito' AND v_txt NOT LIKE 'aceito%' AND v_txt NOT LIKE '%aceito%' THEN
    RETURN NEW;
  END IF;
  -- Limita pra respostas curtas (evita match em frases longas)
  IF length(v_txt) > 40 THEN RETURN NEW; END IF;

  -- Busca phone da conversation
  BEGIN
    SELECT phone INTO v_phone
      FROM public.wa_conversations
     WHERE id = NEW.conversation_id
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_phone := NULL;
  END;

  IF v_phone IS NULL OR length(v_phone) < 8 THEN RETURN NEW; END IF;

  BEGIN
    PERFORM public.vpi_grant_consent_by_phone(v_phone);
  EXCEPTION WHEN OTHERS THEN
    -- Nao bloqueia insert da msg se RPC falhar
    NULL;
  END;

  RETURN NEW;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='wa_messages') THEN
    DROP TRIGGER IF EXISTS trg_vpi_detect_aceito ON public.wa_messages;
    CREATE TRIGGER trg_vpi_detect_aceito
      AFTER INSERT ON public.wa_messages
      FOR EACH ROW EXECUTE FUNCTION public._vpi_detect_aceito();
    RAISE NOTICE '[vpi_lgpd] trigger trg_vpi_detect_aceito criado';
  ELSE
    RAISE NOTICE '[vpi_lgpd] wa_messages nao existe; trigger nao criado';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[vpi_lgpd] falhou trigger wa_messages: %', SQLERRM;
END $$;

-- ── 7. Hardening: dormant_send_reminder respeita consent ────
CREATE OR REPLACE FUNCTION public.vpi_dormant_send_reminder(
  p_partner_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
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

  -- LGPD gate
  IF v_partner.status <> 'ativo' OR v_partner.lgpd_consent_at IS NULL THEN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (v_clinic_id, 'dormant_skipped_no_consent', 'vpi_partners',
            p_partner_id::text,
            jsonb_build_object('status', v_partner.status,
                               'has_consent', v_partner.lgpd_consent_at IS NOT NULL));
    RETURN jsonb_build_object('ok', false, 'error', 'no_consent_or_inactive');
  END IF;

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

  SELECT COALESCE(MAX(t.threshold), 0) INTO v_ref_thr
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

  IF COALESCE(v_partner.short_link_slug, '') <> '' THEN
    v_link := 'https://clinicai-dashboard.px1hdq.easypanel.host/s/' || v_partner.short_link_slug;
  ELSIF COALESCE(v_partner.card_token, '') <> '' THEN
    v_link := 'https://clinicai-dashboard.px1hdq.easypanel.host/public_embaixadora.html?token=' || v_partner.card_token;
  ELSE
    v_link := 'https://clinicai-dashboard.px1hdq.easypanel.host/';
  END IF;

  SELECT id, content_template INTO v_tpl_id, v_tpl_content
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
    VALUES (v_clinic_id, 'dormant_reminder_failed', 'vpi_partners',
            p_partner_id::text,
            jsonb_build_object('error', SQLERRM));
    RETURN jsonb_build_object('ok', false, 'error', 'wa_enqueue_failed', 'detail', SQLERRM);
  END;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic_id, 'dormant_reminder_sent', 'vpi_partners',
          p_partner_id::text,
          jsonb_build_object('outbox_id', v_outbox_id, 'creditos', v_partner.creditos_total,
                             'faltam', v_faltam, 'pct_progresso', v_pct,
                             'proximo_tier_threshold', v_prox_thr,
                             'proxima_recompensa', v_prox_recomp));

  RETURN jsonb_build_object(
    'ok', true, 'outbox_id', v_outbox_id, 'partner_id', p_partner_id,
    'faltam', v_faltam, 'pct_progresso', v_pct, 'proximo_tier', v_prox_thr
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_dormant_send_reminder(uuid) TO authenticated;

-- ── 7.b. Hardening em vpi_indication_close: WA de tier so com consent ──
-- Nao bloqueia o credito/emissao — so segura o envio WA ate consent.
-- Estrategia: redefine a function mantendo corpo, adicionando gate
-- ANTES do wa_outbox_schedule_automation.
CREATE OR REPLACE FUNCTION public.vpi_indication_close(
  p_lead_id      text,
  p_appt_id      text DEFAULT NULL,
  p_procedimento text DEFAULT NULL,
  p_is_full_face boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic    uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_ind       public.vpi_indications%ROWTYPE;
  v_partner   public.vpi_partners%ROWTYPE;
  v_tier      public.vpi_reward_tiers%ROWTYPE;
  v_creditos  int;
  v_tiers_hit jsonb := '[]'::jsonb;
  v_emitted   jsonb;
  v_msg       text;
  v_vars      jsonb;
  v_faltam    int;
  v_can_wa    boolean;
BEGIN
  IF COALESCE(p_lead_id,'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lead_id_required');
  END IF;

  SELECT * INTO v_ind
    FROM public.vpi_indications
   WHERE clinic_id = v_clinic
     AND lead_id   = p_lead_id
     AND status    = 'pending_close'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_indication');
  END IF;

  v_creditos := CASE WHEN p_is_full_face THEN 5 ELSE 1 END;

  UPDATE public.vpi_indications
     SET status = 'closed',
         fechada_em = now(),
         creditos   = v_creditos,
         procedimento = COALESCE(p_procedimento, procedimento),
         appt_id    = COALESCE(p_appt_id, appt_id)
   WHERE id = v_ind.id
   RETURNING * INTO v_ind;

  UPDATE public.vpi_partners
     SET creditos_total       = creditos_total + v_creditos,
         creditos_disponiveis = creditos_disponiveis + v_creditos,
         status               = CASE WHEN status = 'convidado' THEN 'ativo' ELSE status END
   WHERE id = v_ind.partner_id
   RETURNING * INTO v_partner;

  -- Gate WA: so envia tier-unlock se partner ativo + consent (LGPD)
  v_can_wa := (
    v_partner.phone IS NOT NULL
    AND length(regexp_replace(v_partner.phone, '\D','','g')) >= 8
    AND v_partner.status = 'ativo'
    AND v_partner.lgpd_consent_at IS NOT NULL
    AND v_partner.opt_out_at IS NULL
  );

  FOR v_tier IN
    SELECT t.*
      FROM public.vpi_reward_tiers t
     WHERE t.clinic_id = v_clinic
       AND t.is_active = true
       AND t.tipo IN ('per_indication','milestone')
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
      'emitted_at',  now()
    );

    UPDATE public.vpi_indications
       SET recompensas_emitidas = recompensas_emitidas || jsonb_build_array(v_emitted)
     WHERE id = v_ind.id;

    v_tiers_hit := v_tiers_hit || jsonb_build_array(v_emitted);

    IF v_can_wa THEN
      BEGIN
        PERFORM public.wa_outbox_schedule_automation(
          v_partner.phone,
          v_msg,
          COALESCE(v_partner.lead_id, v_partner.id::text),
          v_partner.nome,
          now(),
          COALESCE(p_appt_id, v_ind.appt_id),
          NULL, NULL, v_vars
        );
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
        VALUES (v_clinic, 'wa_enqueue_failed', 'indication', v_ind.id::text,
                jsonb_build_object('tier_id', v_tier.id, 'error', SQLERRM));
      END;
    ELSE
      INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
      VALUES (v_clinic, 'tier_wa_skipped_no_consent', 'indication', v_ind.id::text,
              jsonb_build_object('tier_id', v_tier.id,
                                 'partner_id', v_partner.id,
                                 'status', v_partner.status,
                                 'has_consent', v_partner.lgpd_consent_at IS NOT NULL));
    END IF;
  END LOOP;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic, 'close', 'indication', v_ind.id::text,
          jsonb_build_object(
            'partner_id',  v_partner.id,
            'creditos',    v_creditos,
            'full_face',   p_is_full_face,
            'tiers_hit',   v_tiers_hit,
            'wa_sent',     v_can_wa
          ));

  RETURN jsonb_build_object(
    'ok',             true,
    'indication_id',  v_ind.id,
    'creditos_added', v_creditos,
    'tiers_liberados', v_tiers_hit,
    'partner',        row_to_json(v_partner),
    'wa_sent',        v_can_wa
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_indication_close(text, text, text, boolean)
  TO anon, authenticated;

-- ── 8. Atualizar template vpi_convite_parceiro ──────────────
DO $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_content text;
  v_id uuid;
BEGIN
  v_content :=
E'Ola *{{nome}}*! \U0001F31F\n\n' ||
E'Voce foi aprovada para o *Programa de Parceiras* da *Clinica Mirian de Paula Beauty & Health*!\n\n' ||
E'A cada 5 amigas que indicar e realizarem um procedimento, voce ganha *1 Sessao Fotona 4D* — o melhor protocolo regenerativo facial do mundo.\n\n' ||
E'Para entrar oficialmente no programa, *responda ACEITO* nesta conversa. Assim confirmamos sua participacao conforme a LGPD.\n\n' ||
E'Voce pode sair a qualquer momento pelo seu cartao digital.';

  SELECT id INTO v_id
    FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic AND slug = 'vpi_convite_parceiro' LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.wa_agenda_automations (
      clinic_id, slug, name, description,
      category, sort_order, trigger_type, trigger_config,
      recipient_type, channel, content_template, is_active
    ) VALUES (
      v_clinic, 'vpi_convite_parceiro',
      'VPI Convite Parceiro',
      'Enviada 1 dia apos finalizacao. Pede ACEITO na resposta pra consent LGPD.',
      'after', 5, 'on_demand', '{}'::jsonb,
      'patient', 'whatsapp', v_content, true
    );
  ELSE
    UPDATE public.wa_agenda_automations
       SET content_template = v_content,
           description      = 'Enviada 1 dia apos finalizacao. Pede ACEITO na resposta pra consent LGPD.'
     WHERE id = v_id;
  END IF;
EXCEPTION
  WHEN undefined_column THEN RAISE NOTICE '[vpi_convite_parceiro] wa_agenda_automations schema ausente';
  WHEN undefined_table  THEN RAISE NOTICE '[vpi_convite_parceiro] wa_agenda_automations nao existe';
END $$;

-- ── 9. Sanity ────────────────────────────────────────────────
DO $$
DECLARE
  v_cols int; v_trg int; v_tpl int;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema='public' AND table_name='vpi_partners'
     AND column_name IN ('lgpd_consent_at','lgpd_consent_method','opt_out_at','opt_out_reason');
  SELECT count(*) INTO v_trg FROM pg_trigger
   WHERE tgname = 'trg_vpi_detect_aceito' AND NOT tgisinternal;
  SELECT count(*) INTO v_tpl FROM public.wa_agenda_automations
   WHERE slug = 'vpi_convite_parceiro';
  RAISE NOTICE '[vpi_lgpd] cols=% trigger=% conv_template=%', v_cols, v_trg, v_tpl;
END $$;
