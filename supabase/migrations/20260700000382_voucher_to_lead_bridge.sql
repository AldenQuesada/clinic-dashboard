-- ============================================================
-- Migration: Bridge Voucher B2B → Lead + Lara handoff
--
-- Quando um voucher é emitido com recipient_phone:
--   1. Verifica blacklist (staff/teste) — se sim, não faz nada
--   2. Procura lead existente pelo phone_last8
--      - Se existe: adiciona tag "voucher_<slug>" e guarda voucher_token em data
--      - Se não existe: cria novo lead com origem=<parceria>, source_type=voucher_b2b
--   3. Enfileira mensagem da Lara em wa_outbox pra iniciar conversa
--
-- Idempotente por voucher_id (dedup pelo `wa_outbox.appt_ref`).
-- ============================================================

CREATE OR REPLACE FUNCTION public._b2b_voucher_to_lead_bridge()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := NEW.clinic_id;
  v_phone text;
  v_phone_last8 text;
  v_name text;
  v_first_name text;
  v_partnership record;
  v_existing_lead_id text;
  v_lead_id text;
  v_message text;
  v_appt_ref text;
  v_is_blacklisted boolean := false;
BEGIN
  v_phone := COALESCE(NEW.recipient_phone, '');
  v_name  := COALESCE(NEW.recipient_name, '');

  -- Telefone ausente → skip silencioso
  IF length(trim(v_phone)) = 0 THEN RETURN NEW; END IF;
  IF length(trim(v_name))  = 0 THEN RETURN NEW; END IF;

  v_phone_last8 := right(regexp_replace(v_phone, '\D', '', 'g'), 8);
  v_first_name := COALESCE(split_part(trim(v_name), ' ', 1), '');

  -- Blacklist?
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM public.wa_phone_blacklist
       WHERE right(regexp_replace(phone, '\D', '', 'g'), 8) = v_phone_last8
    ) INTO v_is_blacklisted;
  EXCEPTION WHEN OTHERS THEN
    v_is_blacklisted := false;
  END;
  IF v_is_blacklisted THEN RETURN NEW; END IF;

  -- Pega parceria
  SELECT id, name, slug INTO v_partnership
    FROM public.b2b_partnerships WHERE id = NEW.partnership_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Procura lead existente
  SELECT id INTO v_existing_lead_id
    FROM public.leads
   WHERE clinic_id = v_clinic_id
     AND right(regexp_replace(phone, '\D', '', 'g'), 8) = v_phone_last8
     AND deleted_at IS NULL
   ORDER BY created_at DESC LIMIT 1;

  IF v_existing_lead_id IS NOT NULL THEN
    -- Lead já existe: atualiza tags + data
    v_lead_id := v_existing_lead_id;
    UPDATE public.leads SET
      tags = array(
        SELECT DISTINCT unnest(
          COALESCE(tags, ARRAY[]::text[]) || ARRAY['voucher_' || v_partnership.slug]
        )
      ),
      data = COALESCE(data, '{}'::jsonb) ||
        jsonb_build_object(
          'b2b_voucher_token', NEW.token,
          'b2b_voucher_id', NEW.id,
          'b2b_partnership_name', v_partnership.name,
          'b2b_partnership_slug', v_partnership.slug,
          'b2b_voucher_issued_at', NEW.issued_at
        ),
      updated_at = now()
     WHERE id = v_lead_id;
  ELSE
    -- Cria lead novo
    v_lead_id := 'b2bv_' || NEW.token;
    INSERT INTO public.leads (
      id, clinic_id, name, phone, status, phase, temperature, priority,
      channel_mode, ai_persona, funnel, tipo,
      source_type, origem,
      tags, data, wa_opt_in, conversation_status
    ) VALUES (
      v_lead_id, v_clinic_id, v_name, v_phone,
      'new', 'lead', 'hot', 'normal',
      'whatsapp', 'onboarder', 'procedimentos', 'Lead',
      'referral', v_partnership.name,
      ARRAY['voucher_' || v_partnership.slug, 'b2b'],
      jsonb_build_object(
        'b2b_voucher_token', NEW.token,
        'b2b_voucher_id', NEW.id,
        'b2b_partnership_name', v_partnership.name,
        'b2b_partnership_slug', v_partnership.slug,
        'b2b_voucher_issued_at', NEW.issued_at,
        'source_detail', 'Voucher B2B emitido via Mira'
      ),
      true, 'new'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  -- Monta mensagem da Lara pro lead (idempotente via appt_ref)
  v_message :=
    'Oi, ' || v_first_name || '! ' || E'\n\n' ||
    'Aqui é da Clínica Mirian de Paula. Vi que você acabou de ganhar um Voucher Presente da ' ||
    v_partnership.name || '. Que delícia! ' || E'\n\n' ||
    'Você já viu o voucher? Quer que eu te ajude a marcar uma avaliação pra usar?';

  v_appt_ref := 'b2b_voucher_' || NEW.id::text;

  -- Enfileira direto na wa_outbox (a RPC wa_outbox_enqueue_appt tem bug com
  -- coluna lead_name que não existe mais — INSERT direto é mais seguro)
  BEGIN
    INSERT INTO public.wa_outbox (
      clinic_id, phone, content, content_type, priority,
      scheduled_at, business_hours, status, attempts, max_attempts,
      appt_ref, lead_id, created_at
    ) VALUES (
      v_clinic_id, v_phone, v_message, 'text', 5,
      now() + INTERVAL '2 minutes', true, 'pending', 0, 3,
      v_appt_ref, v_lead_id, now()
    )
    ON CONFLICT DO NOTHING;  -- appt_ref dedupe
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[voucher→lead bridge] falha ao enfileirar WA: %', SQLERRM;
  END;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_b2b_voucher_to_lead ON public.b2b_vouchers;
CREATE TRIGGER trg_b2b_voucher_to_lead
  AFTER INSERT ON public.b2b_vouchers
  FOR EACH ROW EXECUTE FUNCTION public._b2b_voucher_to_lead_bridge();

GRANT EXECUTE ON FUNCTION public._b2b_voucher_to_lead_bridge() TO anon, authenticated, service_role;
