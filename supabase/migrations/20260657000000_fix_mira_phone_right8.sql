-- Fix: wa_pro_authenticate e wa_pro_resolve_phone faziam match exato de phone.
-- Brasil tem o "9" extra depois do DDD (13 vs 12 digitos) — Evolution/WhatsApp
-- multi-device (LID) envia no formato SEM o 9, cadastro em wa_numbers tem COM.
-- Solucao: match por right(8), mesmo padrao usado em todas as outras RPCs do projeto.

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
  IF v_phone = '' OR LENGTH(v_phone) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_required');
  END IF;

  SELECT n.id, n.professional_id, n.access_scope, n.label
  INTO v_wa_number
  FROM public.wa_numbers n
  WHERE n.clinic_id = v_clinic_id
    AND n.number_type = 'professional_private'
    AND n.is_active = true
    AND right(REGEXP_REPLACE(n.phone, '[^0-9]', '', 'g'), 8) = right(v_phone, 8)
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
    'label',           v_wa_number.label,
    'wa_number_id',    v_wa_number.id,
    'access_scope',    v_wa_number.access_scope,
    'permissions',     jsonb_build_object('agenda', true, 'pacientes', true, 'financeiro', true)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_authenticate(text) TO authenticated, anon;


CREATE OR REPLACE FUNCTION public.wa_pro_resolve_phone(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  v_phone     text := REGEXP_REPLACE(COALESCE(p_phone, ''), '[^0-9]', '', 'g');
  v_rec       record;
BEGIN
  IF v_phone = '' OR LENGTH(v_phone) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'phone_required');
  END IF;

  SELECT n.id, n.professional_id, n.access_scope, p.display_name
  INTO v_rec
  FROM public.wa_numbers n
  LEFT JOIN public.professional_profiles p ON p.id = n.professional_id
  WHERE n.clinic_id = v_clinic_id
    AND n.number_type = 'professional_private'
    AND n.is_active = true
    AND right(REGEXP_REPLACE(n.phone, '[^0-9]', '', 'g'), 8) = right(v_phone, 8)
  LIMIT 1;

  IF v_rec.professional_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'unauthorized');
  END IF;

  RETURN jsonb_build_object(
    'ok',              true,
    'clinic_id',       v_clinic_id,
    'professional_id', v_rec.professional_id,
    'wa_number_id',    v_rec.id,
    'name',            v_rec.display_name,
    'access_scope',    v_rec.access_scope
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_resolve_phone(text) TO authenticated, anon;
