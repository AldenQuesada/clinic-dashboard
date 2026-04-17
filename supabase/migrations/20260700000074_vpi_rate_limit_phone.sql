-- ============================================================
-- Migration: VPI Rate Limit Phone-Based (Fase 7 - Entrega 5)
--
-- Hoje vpi_pub_create_indication limita 10/h por partner_id. Se a
-- parceira recriar partner com novo token (via delete+recreate),
-- reseta o contador. Adicionamos limite por right(phone,8) tambem
-- (indep. de partner_id) pra prevenir bypass.
--
-- Componentes:
--   1) Reescreve vpi_pub_create_indication com 2 checks:
--      - count(audit action=public_create WHERE entity_id=partner_id)
--      - count(audit action=public_create WHERE payload->>phone_suffix=right(phone,8))
--   2) Audit grava phone_suffix explicitamente pra check ser barato
--   3) Indice GIN em audit payload (phone_suffix) pra perf
--
-- Idempotente (CREATE OR REPLACE, CREATE INDEX IF NOT EXISTS).
-- ============================================================

-- ── 1. Indice pra rate limit phone ──────────────────────────
-- Indice B-tree em expression (payload->>'phone_suffix') limitado
-- a action='public_create' pra scan barato nas ultimas 1h.
CREATE INDEX IF NOT EXISTS idx_vpi_audit_phone_suffix
  ON public.vpi_audit_log ((payload->>'phone_suffix'), created_at)
  WHERE action = 'public_create';

-- ── 2. Rewrite vpi_pub_create_indication ─────────────────────
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
  v_lead_id       uuid;
  v_existing      uuid;
  v_count_partner int;
  v_count_phone   int;
  v_ind_id        uuid;
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

  -- Rate limit #1: por partner_id (protege bombardeio de 1 parceira)
  SELECT COUNT(*)::int INTO v_count_partner
    FROM public.vpi_audit_log
   WHERE entity_type = 'vpi_indication'
     AND action      = 'public_create'
     AND entity_id   = v_partner.id::text
     AND created_at >= now() - interval '1 hour';

  IF v_count_partner >= 10 THEN
    RETURN jsonb_build_object(
      'error','rate_limit',
      'reason','partner_limit',
      'retry_after_minutes', 60
    );
  END IF;

  -- Rate limit #2: por right(phone,8) do partner (bloqueia bypass
  -- via delete+recriar partner com mesmo phone)
  SELECT COUNT(*)::int INTO v_count_phone
    FROM public.vpi_audit_log
   WHERE entity_type = 'vpi_indication'
     AND action      = 'public_create'
     AND payload->>'phone_suffix' = v_phone_suffix
     AND created_at >= now() - interval '1 hour';

  IF v_count_phone >= 10 THEN
    RETURN jsonb_build_object(
      'error','rate_limit',
      'reason','phone_limit',
      'retry_after_minutes', 60
    );
  END IF;

  -- Busca lead existente pelo telefone (right 8 digits = normalizado BR)
  SELECT id INTO v_existing
    FROM public.leads
   WHERE clinic_id = v_partner.clinic_id
     AND right(regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g'), 8) = v_phone_suffix
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    v_lead_id := v_existing;
  ELSE
    INSERT INTO public.leads (
      clinic_id, name, phone, email, source_type, funnel, phase, data
    ) VALUES (
      v_partner.clinic_id, v_nome, v_phone_digits, v_email, 'vpi_indication',
      'procedimentos', 'nao_contatado',
      jsonb_build_object(
        'vpi_partner_id', v_partner.id,
        'vpi_partner_nome', v_partner.nome,
        'procedimento_interesse', v_procedimento
      )
    )
    RETURNING id INTO v_lead_id;
  END IF;

  -- Cria indicacao (idempotente via UNIQUE partner_id+lead_id)
  INSERT INTO public.vpi_indications (
    clinic_id, partner_id, lead_id, procedimento, status, creditos
  ) VALUES (
    v_partner.clinic_id, v_partner.id, v_lead_id::text,
    COALESCE(v_procedimento,'A definir'), 'pending_close', 1
  )
  ON CONFLICT (partner_id, lead_id) DO UPDATE
    SET procedimento = COALESCE(EXCLUDED.procedimento, public.vpi_indications.procedimento)
  RETURNING id INTO v_ind_id;

  -- Audit com phone_suffix pro rate limit futuro
  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (
    v_partner.clinic_id, 'public_create', 'vpi_indication', v_partner.id::text,
    jsonb_build_object(
      'indication_id',     v_ind_id,
      'lead_id',           v_lead_id,
      'nome',              v_nome,
      'phone',             v_phone_digits,
      'phone_suffix',      v_phone_suffix,
      'procedimento',      v_procedimento,
      'via',               'public_card'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'indication_id', v_ind_id,
    'lead_id', v_lead_id,
    'existing_lead', (v_existing IS NOT NULL)
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_pub_create_indication(text, jsonb) TO anon, authenticated;

-- ── 3. Sanity ────────────────────────────────────────────────
DO $$
DECLARE v_idx int;
BEGIN
  SELECT count(*) INTO v_idx FROM pg_indexes
   WHERE schemaname='public' AND indexname='idx_vpi_audit_phone_suffix';
  RAISE NOTICE '[vpi_rate_phone] indice=%', v_idx;
END $$;
