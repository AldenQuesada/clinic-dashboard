-- ============================================================
-- Migration: B2B Referrals (indicação sem voucher)
--
-- Parceiro manda "indico Fulana, 44 99999-8877". Sem voucher físico.
-- Brinde: Véu de Noiva (Fotona Dynamis Nx) + Avaliação Corporal Anovator A5.
--
-- Arquitetura: reusa b2b_attributions com voucher_id NULL.
-- Trigger específico em INSERT de attribution sem voucher → cria lead + Lara.
--
-- Se lead já existe na base da clínica: Mira avisa sutil, não cria de novo,
-- mas registra a attribution (parceria ganha crédito futuro se converter).
--
-- Dedup: parceiro indicando mesma pessoa nos últimos 30d = ignora silenciosamente.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- RPC: cria referral e retorna status
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.b2b_referral_create(
  p_partnership_id    uuid,
  p_lead_name         text,
  p_lead_phone        text,
  p_referred_by_phone text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_last8     text;
  v_existing_lead_id text;
  v_partnership record;
  v_existing_attr_id uuid;
  v_new_attr_id uuid;
  v_lead_status text;
BEGIN
  IF p_partnership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_id_required');
  END IF;
  IF p_lead_name IS NULL OR length(trim(p_lead_name)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lead_name_required');
  END IF;
  IF p_lead_phone IS NULL OR length(regexp_replace(p_lead_phone, '\D', '', 'g')) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lead_phone_invalid');
  END IF;

  v_last8 := right(regexp_replace(p_lead_phone, '\D', '', 'g'), 8);

  SELECT id, name, slug INTO v_partnership
    FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id AND id = p_partnership_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  -- Dedup 30 dias (parceria indicou mesma pessoa recentemente?)
  SELECT id INTO v_existing_attr_id
    FROM public.b2b_attributions
   WHERE clinic_id = v_clinic_id
     AND partnership_id = p_partnership_id
     AND lead_phone_last8 = v_last8
     AND created_at >= now() - INTERVAL '30 days'
   LIMIT 1;
  IF v_existing_attr_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'duplicate', true,
      'attribution_id', v_existing_attr_id,
      'message', 'Essa indicação já foi registrada recentemente. Fica comigo.'
    );
  END IF;

  -- Checa se lead já existe na clínica (por telefone)
  SELECT id INTO v_existing_lead_id
    FROM public.leads
   WHERE clinic_id = v_clinic_id
     AND right(regexp_replace(phone, '\D', '', 'g'), 8) = v_last8
     AND deleted_at IS NULL
   ORDER BY created_at DESC LIMIT 1;

  v_lead_status := CASE WHEN v_existing_lead_id IS NOT NULL THEN 'existing' ELSE 'new' END;

  -- Cria a attribution (source = wa_mira_referral sinaliza que NÃO tem voucher,
  -- e que o flow é de indicação pura)
  INSERT INTO public.b2b_attributions (
    clinic_id, partnership_id, voucher_id,
    lead_name, lead_phone,
    source, status
  ) VALUES (
    v_clinic_id, p_partnership_id, NULL,
    p_lead_name, p_lead_phone,
    'wa_mira_referral', 'referred'
  )
  RETURNING id INTO v_new_attr_id;

  RETURN jsonb_build_object(
    'ok', true,
    'duplicate', false,
    'attribution_id', v_new_attr_id,
    'lead_status', v_lead_status,        -- 'new' ou 'existing'
    'existing_lead_id', v_existing_lead_id,
    'partnership_name', v_partnership.name,
    'partnership_slug', v_partnership.slug
  );
END $$;


-- ════════════════════════════════════════════════════════════
-- Trigger em b2b_attributions AFTER INSERT com voucher_id NULL
-- Cria lead + enfileira Lara com mensagem de INDICAÇÃO
-- (distinto do trigger de voucher, que tem mensagem diferente)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._b2b_attribution_referral_bridge()
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
  -- Só processa referrals puras (sem voucher)
  IF NEW.voucher_id IS NOT NULL THEN RETURN NEW; END IF;
  IF NEW.source <> 'wa_mira_referral' THEN RETURN NEW; END IF;

  v_phone := COALESCE(NEW.lead_phone, '')
  ; v_name  := COALESCE(NEW.lead_name, '')
  ;
  IF length(trim(v_phone)) = 0 OR length(trim(v_name)) = 0 THEN RETURN NEW; END IF;

  v_phone_last8 := right(regexp_replace(v_phone, '\D', '', 'g'), 8);
  v_first_name := COALESCE(split_part(trim(v_name), ' ', 1), '');

  -- Blacklist?
  BEGIN
    SELECT EXISTS(
      SELECT 1 FROM public.wa_phone_blacklist
       WHERE right(regexp_replace(phone, '\D', '', 'g'), 8) = v_phone_last8
    ) INTO v_is_blacklisted;
  EXCEPTION WHEN OTHERS THEN v_is_blacklisted := false;
  END;
  IF v_is_blacklisted THEN RETURN NEW; END IF;

  -- Parceria
  SELECT id, name, slug INTO v_partnership
    FROM public.b2b_partnerships WHERE id = NEW.partnership_id;
  IF NOT FOUND THEN RETURN NEW; END IF;

  -- Lead existente?
  SELECT id INTO v_existing_lead_id
    FROM public.leads
   WHERE clinic_id = v_clinic_id
     AND right(regexp_replace(phone, '\D', '', 'g'), 8) = v_phone_last8
     AND deleted_at IS NULL
   ORDER BY created_at DESC LIMIT 1;

  IF v_existing_lead_id IS NOT NULL THEN
    -- Lead existe: adiciona tags, registra parceira como indicante, NÃO manda msg
    -- (pessoa já conhece a clínica — evita reabordagem)
    v_lead_id := v_existing_lead_id;
    UPDATE public.leads SET
      tags = array(SELECT DISTINCT unnest(
        COALESCE(tags, ARRAY[]::text[]) ||
        ARRAY['indicacao_' || v_partnership.slug, 'b2b_referral']
      )),
      data = COALESCE(data, '{}'::jsonb) || jsonb_build_object(
        'b2b_referral_by_partnership', v_partnership.name,
        'b2b_referral_partnership_slug', v_partnership.slug,
        'b2b_referral_attribution_id', NEW.id,
        'b2b_referral_at', NEW.created_at
      ),
      updated_at = now()
     WHERE id = v_lead_id;
    RETURN NEW;  -- sem enqueue — pessoa já é contato nosso
  END IF;

  -- Lead novo: cria
  v_lead_id := 'b2br_' || NEW.id::text;
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
    ARRAY['indicacao_' || v_partnership.slug, 'b2b_referral'],
    jsonb_build_object(
      'b2b_referral_by_partnership', v_partnership.name,
      'b2b_referral_partnership_slug', v_partnership.slug,
      'b2b_referral_attribution_id', NEW.id,
      'b2b_referral_at', NEW.created_at,
      'source_detail', 'Indicação B2B via Mira (sem voucher)'
    ),
    true, 'new'
  )
  ON CONFLICT (id) DO NOTHING;

  -- Mensagem da Lara pra lead novo (mesma identidade mas copy de indicação + brinde)
  v_message :=
    'Oi, ' || v_first_name || '! Tudo bem?' || E'\n\n' ||
    'A ' || v_partnership.name || ' indicou você pra conhecer a Clínica Mirian de Paula. ' ||
    'Queria te dar um presente: **Véu de Noiva** (nosso tratamento com Fotona Dynamis Nx) + ' ||
    'uma **Avaliação Corporal com Anovator A5**.' || E'\n\n' ||
    'Mas antes me tira uma dúvida rápida: você já faz cuidados estéticos de algum tipo?';

  v_appt_ref := 'b2b_referral_' || NEW.id::text;

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
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[referral bridge] falha enqueue WA: %', SQLERRM;
  END;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_b2b_attribution_referral ON public.b2b_attributions;
CREATE TRIGGER trg_b2b_attribution_referral
  AFTER INSERT ON public.b2b_attributions
  FOR EACH ROW EXECUTE FUNCTION public._b2b_attribution_referral_bridge();


GRANT EXECUTE ON FUNCTION public.b2b_referral_create(uuid, text, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._b2b_attribution_referral_bridge()          TO anon, authenticated, service_role;
