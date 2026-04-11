-- ============================================================
-- Migration: Mira Permissions — checkboxes por area de dado
-- Substitui o conceito unico de access_scope por permissoes
-- granulares (agenda, pacientes, financeiro) sem quebrar o
-- modelo antigo (access_scope continua existindo como hint).
-- ============================================================

-- ── 1. Coluna permissions em wa_numbers ─────────────────────

ALTER TABLE public.wa_numbers
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL
  DEFAULT '{"agenda": true, "pacientes": true, "financeiro": true}'::jsonb;

COMMENT ON COLUMN public.wa_numbers.permissions IS
  'Mira: areas que o profissional pode consultar via WhatsApp interno. Default: tudo true.';

-- ── 2. wa_pro_authenticate v2 — retorna permissions ────────

CREATE OR REPLACE FUNCTION public.wa_pro_authenticate(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  v_phone     text := REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  v_prof      record;
  v_wa_number record;
BEGIN
  IF v_phone = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_required');
  END IF;

  SELECT n.id, n.professional_id, n.access_scope, n.label, n.permissions
  INTO v_wa_number
  FROM public.wa_numbers n
  WHERE n.clinic_id = v_clinic_id
    AND n.number_type = 'professional_private'
    AND n.is_active = true
    AND REGEXP_REPLACE(n.phone, '[^0-9]', '', 'g') = v_phone
  LIMIT 1;

  IF v_wa_number.id IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', 'unauthorized',
      'message', 'Numero nao registrado como profissional. Peca ao admin pra cadastrar.'
    );
  END IF;

  SELECT id, display_name, specialty, is_active
  INTO v_prof
  FROM public.professional_profiles
  WHERE id = v_wa_number.professional_id
    AND clinic_id = v_clinic_id;

  IF v_prof.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'professional_not_found');
  END IF;

  IF NOT v_prof.is_active THEN
    RETURN jsonb_build_object('ok', false, 'error', 'professional_inactive');
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'professional_id', v_prof.id,
    'name',            v_prof.display_name,
    'specialty',       v_prof.specialty,
    'access_scope',    v_wa_number.access_scope,
    'permissions',     COALESCE(v_wa_number.permissions, '{"agenda": true, "pacientes": true, "financeiro": true}'::jsonb),
    'wa_number_id',    v_wa_number.id,
    'label',           v_wa_number.label
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_authenticate(text) TO authenticated, anon;

-- ── 3. wa_pro_register_number v2 — aceita permissions ──────

DROP FUNCTION IF EXISTS public.wa_pro_register_number(text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.wa_pro_register_number(
  p_phone           text,
  p_professional_id uuid,
  p_label           text  DEFAULT NULL,
  p_access_scope    text  DEFAULT 'own',
  p_permissions     jsonb DEFAULT '{"agenda": true, "pacientes": true, "financeiro": true}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_id        uuid;
  v_phone     text := REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
BEGIN
  IF v_clinic_id IS NULL OR NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  IF v_phone = '' OR p_professional_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_data');
  END IF;

  -- Upsert: se ja existe um numero com esse phone como professional_private, atualiza
  INSERT INTO public.wa_numbers (
    clinic_id, phone, label, instance_id, is_active,
    number_type, professional_id, access_scope, permissions
  ) VALUES (
    v_clinic_id, v_phone, COALESCE(p_label, 'Mira ' || v_phone), 'mira-' || v_phone, true,
    'professional_private', p_professional_id, COALESCE(p_access_scope, 'own'),
    COALESCE(p_permissions, '{"agenda": true, "pacientes": true, "financeiro": true}'::jsonb)
  )
  ON CONFLICT DO NOTHING
  RETURNING id INTO v_id;

  -- Se nao inseriu (ja existia), atualiza
  IF v_id IS NULL THEN
    UPDATE public.wa_numbers
    SET professional_id = p_professional_id,
        access_scope    = COALESCE(p_access_scope, 'own'),
        permissions     = COALESCE(p_permissions, permissions),
        label           = COALESCE(p_label, label),
        is_active       = true
    WHERE clinic_id = v_clinic_id
      AND REGEXP_REPLACE(phone, '[^0-9]', '', 'g') = v_phone
      AND number_type = 'professional_private'
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_register_number(text, uuid, text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.wa_pro_authenticate    IS 'Mira v2: autentica + retorna permissions JSONB';
COMMENT ON FUNCTION public.wa_pro_register_number IS 'Mira v2: cadastra/atualiza numero professional_private com permissions';
