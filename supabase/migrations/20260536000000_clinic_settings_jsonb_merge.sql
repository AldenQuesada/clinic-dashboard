-- ============================================================
-- Fix: update_clinic_settings — merge inteligente de jsonb
--
-- Problema anterior: COALESCE(p_address, address) substitui
-- o objeto inteiro quando p_address não é NULL, apagando
-- campos não enviados.
--
-- Solução: usar || (jsonb merge) — preserva chaves existentes
-- e só atualiza as enviadas. NULL continua protegido por COALESCE.
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_clinic_settings(
  p_name            text        DEFAULT NULL,
  p_phone           text        DEFAULT NULL,
  p_whatsapp        text        DEFAULT NULL,
  p_email           text        DEFAULT NULL,
  p_website         text        DEFAULT NULL,
  p_description     text        DEFAULT NULL,
  p_address         jsonb       DEFAULT NULL,
  p_social          jsonb       DEFAULT NULL,
  p_fiscal          jsonb       DEFAULT NULL,
  p_operating_hours jsonb       DEFAULT NULL,
  p_settings        jsonb       DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
BEGIN
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF v_role NOT IN ('admin','owner') THEN
    RAISE EXCEPTION 'Permissão insuficiente para salvar configurações';
  END IF;

  IF p_name IS NOT NULL AND v_role <> 'owner' THEN
    RAISE EXCEPTION 'Somente o proprietário pode alterar o nome da clínica';
  END IF;

  IF p_fiscal IS NOT NULL AND v_role <> 'owner' THEN
    RAISE EXCEPTION 'Somente o proprietário pode alterar dados fiscais';
  END IF;

  UPDATE public.clinics SET
    -- Campos texto: COALESCE — só atualiza se enviado
    name            = COALESCE(p_name,        name),
    phone           = COALESCE(p_phone,       phone),
    whatsapp        = COALESCE(p_whatsapp,    whatsapp),
    email           = COALESCE(p_email,       email),
    website         = COALESCE(p_website,     website),
    description     = COALESCE(p_description, description),
    -- Campos jsonb: merge com || — preserva chaves existentes, atualiza as enviadas
    address         = CASE WHEN p_address IS NOT NULL
                        THEN COALESCE(address, '{}') || p_address
                        ELSE address END,
    social          = CASE WHEN p_social IS NOT NULL
                        THEN COALESCE(social, '{}') || p_social
                        ELSE social END,
    fiscal          = CASE WHEN p_fiscal IS NOT NULL
                        THEN COALESCE(fiscal, '{}') || p_fiscal
                        ELSE fiscal END,
    operating_hours = CASE WHEN p_operating_hours IS NOT NULL
                        THEN p_operating_hours
                        ELSE operating_hours END,
    settings        = CASE WHEN p_settings IS NOT NULL
                        THEN COALESCE(settings, '{}') || p_settings
                        ELSE settings END
  WHERE id = v_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clínica não encontrada ou sem permissão';
  END IF;

  RETURN jsonb_build_object('ok', true, 'updated_at', now());
END;
$$;

REVOKE ALL ON FUNCTION public.update_clinic_settings(
  text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.update_clinic_settings(
  text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) TO authenticated;
