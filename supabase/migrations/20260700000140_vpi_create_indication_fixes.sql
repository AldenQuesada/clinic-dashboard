-- ============================================================
-- Migration: VPI Create Indication — 3 fixes + notificacoes
--
-- Bugs encontrados na RPC vpi_pub_create_indication:
-- 1. SELECT lead existente nao filtrava deleted_at IS NULL,
--    entao reusava lead soft-deleted (orfao) em vez de criar novo.
-- 2. Sem notificacao pro admin quando indicacao nova entra.
-- 3. Sem WA pro staff (Mirian).
--
-- Tambem: backfill da indicacao 34abe011-... criada hoje sem
-- lead valido (foi linkada ao lead 34abe... do Alden deletado).
--
-- Idempotente: CREATE OR REPLACE + audit action='backfill_orphan'.
-- ============================================================

-- ── 1. Rewrite vpi_pub_create_indication com 3 fixes ──
CREATE OR REPLACE FUNCTION public.vpi_pub_create_indication(
  p_token text,
  p_lead  jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner       public.vpi_partners%ROWTYPE;
  v_nome          text;
  v_phone         text;
  v_phone_digits  text;
  v_phone_suffix  text;
  v_email         text;
  v_procedimento  text;
  v_lead_id       text;
  v_existing      text;
  v_count_partner int;
  v_count_phone   int;
  v_ind_id        uuid;
  v_staff_phone   text;
  v_new_lead_id   text;
BEGIN
  IF COALESCE(p_token,'') = '' THEN
    RETURN jsonb_build_object('error','invalid_token');
  END IF;

  SELECT * INTO v_partner FROM public.vpi_partners
   WHERE card_token = p_token AND status <> 'inativo' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  v_nome         := NULLIF(trim(COALESCE(p_lead->>'nome','')), '');
  v_phone        := NULLIF(trim(COALESCE(p_lead->>'phone','')), '');
  v_email        := NULLIF(trim(COALESCE(p_lead->>'email','')), '');
  v_procedimento := NULLIF(trim(COALESCE(p_lead->>'procedimento','')), '');

  IF v_nome IS NULL OR v_phone IS NULL THEN
    RETURN jsonb_build_object('error','invalid_input','detail','nome e telefone sao obrigatorios');
  END IF;

  v_phone_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');
  IF length(v_phone_digits) < 10 THEN
    RETURN jsonb_build_object('error','invalid_phone');
  END IF;
  v_phone_suffix := right(v_phone_digits, 8);

  -- Rate limit #1: por partner_id
  SELECT COUNT(*)::int INTO v_count_partner
    FROM public.vpi_audit_log
   WHERE entity_type = 'referral'
     AND action      = 'public_create'
     AND entity_id   = v_partner.id::text
     AND created_at >= now() - interval '1 hour';

  IF v_count_partner >= 10 THEN
    RETURN jsonb_build_object(
      'error','rate_limit','reason','partner_limit','retry_after_minutes', 60
    );
  END IF;

  -- Rate limit #2: por right(phone,8)
  SELECT COUNT(*)::int INTO v_count_phone
    FROM public.vpi_audit_log
   WHERE entity_type = 'referral'
     AND action      = 'public_create'
     AND payload->>'phone_suffix' = v_phone_suffix
     AND created_at >= now() - interval '1 hour';

  IF v_count_phone >= 10 THEN
    RETURN jsonb_build_object(
      'error','rate_limit','reason','phone_limit','retry_after_minutes', 60
    );
  END IF;

  -- FIX #1: Busca lead existente ATIVO (deleted_at IS NULL)
  SELECT id::text INTO v_existing
    FROM public.leads
   WHERE clinic_id = v_partner.clinic_id
     AND right(regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g'), 8) = v_phone_suffix
     AND deleted_at IS NULL
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    v_lead_id := v_existing;
    -- Tag o lead existente como indicado por esta parceira (merge no data jsonb)
    UPDATE public.leads
       SET data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
             'vpi_partner_id',       v_partner.id,
             'vpi_partner_nome',     v_partner.nome,
             'procedimento_interesse', v_procedimento,
             'indicado_em',          now()
           ),
           updated_at = now()
     WHERE id::text = v_lead_id;
  ELSE
    v_lead_id := gen_random_uuid()::text;
    INSERT INTO public.leads (
      id, clinic_id, name, phone, email, source_type, funnel, phase, data
    ) VALUES (
      v_lead_id, v_partner.clinic_id, v_nome, v_phone_digits, v_email, 'referral',
      'procedimentos', 'lead',
      jsonb_build_object(
        'vpi_partner_id',       v_partner.id,
        'vpi_partner_nome',     v_partner.nome,
        'procedimento_interesse', v_procedimento,
        'indicado_em',          now()
      )
    );
  END IF;

  -- Cria indicacao (idempotente via UNIQUE partner_id+lead_id)
  INSERT INTO public.vpi_indications (
    clinic_id, partner_id, lead_id, procedimento, status, creditos
  ) VALUES (
    v_partner.clinic_id, v_partner.id, v_lead_id,
    COALESCE(v_procedimento,'A definir'), 'pending_close', 1
  )
  ON CONFLICT (partner_id, lead_id) DO UPDATE
    SET procedimento = COALESCE(EXCLUDED.procedimento, public.vpi_indications.procedimento)
  RETURNING id INTO v_ind_id;

  -- Audit
  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (
    v_partner.clinic_id, 'public_create', 'referral', v_partner.id::text,
    jsonb_build_object(
      'indication_id',     v_ind_id,
      'lead_id',           v_lead_id,
      'nome',              v_nome,
      'phone',             v_phone_digits,
      'phone_suffix',      v_phone_suffix,
      'procedimento',      v_procedimento,
      'via',               'public_card',
      'existing_lead',     (v_existing IS NOT NULL)
    )
  );

  -- FIX #2: broadcast_notification pros admins
  BEGIN
    PERFORM public.broadcast_notification(
      'vpi_nova_indicacao',
      'Nova indicação recebida!',
      v_partner.nome || ' indicou ' || v_nome || ' (' || v_phone_digits || ')' ||
        CASE WHEN v_procedimento IS NOT NULL THEN ' para ' || v_procedimento ELSE '' END ||
        '. Lead no funil Procedimentos — entre em contato.',
      jsonb_build_object(
        'indication_id', v_ind_id,
        'lead_id',       v_lead_id,
        'partner_id',    v_partner.id,
        'partner_nome',  v_partner.nome,
        'procedimento',  v_procedimento,
        'action',        'open_lead'
      ),
      ARRAY['admin', 'owner']
    );
  EXCEPTION WHEN others THEN NULL; END;

  -- FIX #3: WA pro staff (inline, via clinics.settings.vpi.staff_alert_phone)
  SELECT (settings->'vpi'->>'staff_alert_phone')
    INTO v_staff_phone
    FROM public.clinics
   WHERE id = v_partner.clinic_id
   LIMIT 1;

  IF v_staff_phone IS NOT NULL AND length(v_staff_phone) >= 8 THEN
    BEGIN
      PERFORM public.wa_outbox_schedule_automation(
        p_phone        => v_staff_phone,
        p_content      => E'✨ Nova indicação recebida!\n\n' ||
                          'Parceira: *' || v_partner.nome || '*\n' ||
                          'Indicou: *' || v_nome || '*\n' ||
                          'WhatsApp: ' || v_phone_digits || E'\n' ||
                          'Procedimento: ' || COALESCE(v_procedimento, 'a definir') || E'\n\n' ||
                          'Lead está no funil *Procedimentos* (fase nao_contatado).\n' ||
                          'Entre em contato assim que puder.\n\n' ||
                          '_Clínica Mirian de Paula — Programa de Indicação_',
        p_lead_id      => v_lead_id,
        p_lead_name    => 'STAFF',
        p_scheduled_at => now()
      );
    EXCEPTION WHEN others THEN NULL; END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'indication_id', v_ind_id,
    'lead_id', v_lead_id,
    'existing_lead', (v_existing IS NOT NULL)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_pub_create_indication(text, jsonb) TO anon, authenticated;

-- ── 2. Backfill: indicacoes orfas (lead_id aponta pra lead deletado) ──
-- Cria novo lead pra cada indicacao pendente que aponta pra lead deletado,
-- usando dados do audit log (nome/phone) da criacao.
DO $$
DECLARE
  r RECORD;
  v_new_lead_id text;
  v_payload jsonb;
BEGIN
  FOR r IN
    SELECT i.id AS ind_id,
           i.lead_id,
           i.partner_id,
           i.clinic_id,
           i.procedimento,
           i.status,
           l.deleted_at,
           l.name AS old_name,
           (SELECT al.payload
              FROM public.vpi_audit_log al
             WHERE al.action = 'public_create'
               AND al.entity_type = 'referral'
               AND al.payload->>'indication_id' = i.id::text
             ORDER BY al.created_at DESC LIMIT 1) AS audit_payload
      FROM public.vpi_indications i
      JOIN public.leads l ON l.id::text = i.lead_id
     WHERE l.deleted_at IS NOT NULL
       AND i.status IN ('pending_close')  -- so corrige pendentes (nao mexe em closed)
  LOOP
    v_payload := r.audit_payload;
    IF v_payload IS NULL THEN CONTINUE; END IF;

    -- Cria novo lead com dados do audit
    v_new_lead_id := gen_random_uuid()::text;
    INSERT INTO public.leads (
      id, clinic_id, name, phone, email, source_type, funnel, phase, data
    ) VALUES (
      v_new_lead_id,
      r.clinic_id,
      COALESCE(v_payload->>'nome', r.old_name, 'Indicada sem nome'),
      COALESCE(v_payload->>'phone', ''),
      '',
      'referral',
      'procedimentos',
      'lead',
      jsonb_build_object(
        'vpi_partner_id',       r.partner_id,
        'procedimento_interesse', r.procedimento,
        'indicado_em',          now(),
        'backfilled_from_orphan', r.lead_id
      )
    );

    -- Re-aponta indicacao pro novo lead
    UPDATE public.vpi_indications
       SET lead_id = v_new_lead_id,
           updated_at = now()
     WHERE id = r.ind_id;

    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (r.clinic_id, 'backfill_orphan', 'referral', r.ind_id::text,
      jsonb_build_object(
        'old_lead_id', r.lead_id,
        'new_lead_id', v_new_lead_id,
        'reason',      'soft_deleted_lead_replaced'
      )
    );

    RAISE NOTICE 'Backfill: indicacao % orfa substituida — novo lead %', r.ind_id, v_new_lead_id;
  END LOOP;
END $$;
