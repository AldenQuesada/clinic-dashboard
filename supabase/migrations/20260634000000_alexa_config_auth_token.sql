-- ============================================================
-- Migration: 20260634000000 — Alexa Config: auth_token
--
-- Adiciona campo auth_token em clinic_alexa_config para
-- autenticacao direta no Alexa Bridge (Bearer token).
-- Elimina necessidade de n8n como intermediario.
-- ============================================================

-- ── 1. Adicionar coluna auth_token ───────────────────────────
ALTER TABLE public.clinic_alexa_config
  ADD COLUMN IF NOT EXISTS auth_token text;

COMMENT ON COLUMN public.clinic_alexa_config.auth_token IS
  'Bearer token para autenticacao no Alexa Bridge (ex: clinicai-alexa-2026)';

-- ── 2. Atualizar get_alexa_config para retornar auth_token ───
CREATE OR REPLACE FUNCTION public.get_alexa_config()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_row       jsonb;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado');
  END IF;

  SELECT jsonb_build_object(
    'id',                    c.id,
    'webhook_url',           c.webhook_url,
    'reception_device_name', c.reception_device_name,
    'welcome_template',      c.welcome_template,
    'room_template',         c.room_template,
    'is_active',             c.is_active,
    'auth_token',            c.auth_token
  )
  INTO v_row
  FROM public.clinic_alexa_config c
  WHERE c.clinic_id = v_clinic_id;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'data', NULL);
  END IF;

  RETURN jsonb_build_object('ok', true, 'data', v_row);
END;
$$;

REVOKE ALL ON FUNCTION public.get_alexa_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_alexa_config() TO authenticated;

-- ── 3. Atualizar upsert_alexa_config para aceitar auth_token ─
DROP FUNCTION IF EXISTS public.upsert_alexa_config(text, text, text, text, boolean);

CREATE OR REPLACE FUNCTION public.upsert_alexa_config(
  p_webhook_url           text,
  p_reception_device_name text    DEFAULT 'Recepcao',
  p_welcome_template      text    DEFAULT NULL,
  p_room_template         text    DEFAULT NULL,
  p_is_active             boolean DEFAULT true,
  p_auth_token            text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_role      text;
BEGIN
  v_clinic_id := app_clinic_id();
  v_role      := app_role();

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;
  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Permissao insuficiente';
  END IF;

  INSERT INTO public.clinic_alexa_config (
    clinic_id, webhook_url, reception_device_name, welcome_template, room_template, is_active, auth_token
  ) VALUES (
    v_clinic_id,
    p_webhook_url,
    COALESCE(p_reception_device_name, 'Recepcao'),
    COALESCE(p_welcome_template, 'Bem-vinda, {{nome}}! Fique a vontade, em breve voce sera atendida.'),
    COALESCE(p_room_template, 'Dra Mirian, a paciente {{nome}} ja esta na nossa recepcao.'),
    COALESCE(p_is_active, true),
    nullif(trim(p_auth_token), '')
  )
  ON CONFLICT (clinic_id)
  DO UPDATE SET
    webhook_url           = EXCLUDED.webhook_url,
    reception_device_name = EXCLUDED.reception_device_name,
    welcome_template      = EXCLUDED.welcome_template,
    room_template         = EXCLUDED.room_template,
    is_active             = EXCLUDED.is_active,
    auth_token            = EXCLUDED.auth_token,
    updated_at            = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_alexa_config(text, text, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_alexa_config(text, text, text, text, boolean, text) TO authenticated;
