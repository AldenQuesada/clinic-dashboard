-- ============================================================
-- Migration: Helper pra Mira resolver VPI partner pelo phone
--
-- A Mira recebe mensagens de quem indicou; precisa saber se quem manda
-- é uma embaixadora VPI (e qual).
--
-- Reusa o sistema VPI existente — evita duplicar infra.
-- ============================================================

CREATE OR REPLACE FUNCTION public.vpi_partner_by_phone(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_last8 text := right(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 8);
  v_row record;
BEGIN
  IF length(v_last8) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone');
  END IF;

  SELECT id, lead_id, nome, phone, status, tier_atual, numero_membro
    INTO v_row
    FROM public.vpi_partners
   WHERE clinic_id = v_clinic_id
     AND right(regexp_replace(phone, '\D', '', 'g'), 8) = v_last8
     AND status IN ('ativo','pendente')
     AND opt_out_at IS NULL
   ORDER BY created_at DESC LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_partner');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'partner_id', v_row.id,
    'lead_id', v_row.lead_id,
    'nome', v_row.nome,
    'status', v_row.status,
    'tier', v_row.tier_atual,
    'numero_membro', v_row.numero_membro
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_partner_by_phone(text) TO anon, authenticated, service_role;


-- ════════════════════════════════════════════════════════════
-- Helper: upsert lead pra receber indicação VPI
-- (Evita duplicar lead se já existe por telefone)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.vpi_lead_upsert_for_referral(
  p_name text,
  p_phone text,
  p_partner_name text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_last8 text := right(regexp_replace(COALESCE(p_phone, ''), '\D', '', 'g'), 8);
  v_lead_id text;
  v_status text;
BEGIN
  IF p_name IS NULL OR length(trim(p_name)) < 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_required');
  END IF;
  IF length(v_last8) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_invalid');
  END IF;

  -- Procura lead existente
  SELECT id INTO v_lead_id
    FROM public.leads
   WHERE clinic_id = v_clinic_id
     AND right(regexp_replace(phone, '\D', '', 'g'), 8) = v_last8
     AND deleted_at IS NULL
   ORDER BY created_at DESC LIMIT 1;

  IF v_lead_id IS NOT NULL THEN
    v_status := 'existing';
    -- Garante tag de indicação
    UPDATE public.leads SET
      tags = array(SELECT DISTINCT unnest(
        COALESCE(tags, ARRAY[]::text[]) || ARRAY['indicacao_vpi']
      )),
      updated_at = now()
     WHERE id = v_lead_id;
  ELSE
    v_status := 'new';
    v_lead_id := 'vpi_ind_' || substr(md5(random()::text || p_phone), 1, 12);
    INSERT INTO public.leads (
      id, clinic_id, name, phone, status, phase, temperature, priority,
      channel_mode, ai_persona, funnel, tipo,
      source_type, origem,
      tags, data, wa_opt_in, conversation_status
    ) VALUES (
      v_lead_id, v_clinic_id, p_name, p_phone,
      'new', 'lead', 'hot', 'normal',
      'whatsapp', 'onboarder', 'procedimentos', 'Lead',
      'referral', COALESCE(p_partner_name, 'Indicação VPI'),
      ARRAY['indicacao_vpi'],
      jsonb_build_object(
        'source_detail', 'Indicação VPI via Mira',
        'referred_by_partner_name', p_partner_name
      ),
      true, 'new'
    )
    ON CONFLICT (id) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'lead_id', v_lead_id,
    'lead_status', v_status  -- 'new' | 'existing'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_lead_upsert_for_referral(text, text, text) TO anon, authenticated, service_role;
