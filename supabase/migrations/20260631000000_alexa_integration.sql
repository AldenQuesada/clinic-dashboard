-- ============================================================
-- Migration: 20260631000000 — Alexa Integration
--
-- Adiciona suporte a notificacoes Alexa nas salas da clinica.
-- Cada sala pode ter um dispositivo Alexa vinculado.
-- Config global (device recepcao, webhook URL) em clinic_config.
--
-- Alteracoes:
--   clinic_rooms: +alexa_device_name
--   get_rooms: retorna alexa_device_name
--   upsert_room: aceita p_alexa_device_name
--   clinic_alexa_config: tabela de config global
--   RPCs: get_alexa_config, upsert_alexa_config
-- ============================================================

-- ── 1. Adicionar coluna alexa_device_name em clinic_rooms ─────

ALTER TABLE public.clinic_rooms
  ADD COLUMN IF NOT EXISTS alexa_device_name text;

COMMENT ON COLUMN public.clinic_rooms.alexa_device_name IS
  'Nome do dispositivo Echo/Alexa nesta sala (ex: "Sala 1 Echo", "Consultorio Dra Mirian")';

-- ── 2. Atualizar RPC get_rooms para retornar alexa_device_name ─

DROP FUNCTION IF EXISTS public.get_rooms();

CREATE OR REPLACE FUNCTION public.get_rooms()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_rows      jsonb;
BEGIN
  v_clinic_id := app_clinic_id();

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',                r.id,
      'nome',              r.nome,
      'descricao',         r.descricao,
      'ativo',             r.ativo,
      'alexa_device_name', r.alexa_device_name,
      'created_at',        r.created_at,
      'updated_at',        r.updated_at
    )
    ORDER BY lower(r.nome)
  )
  INTO v_rows
  FROM public.clinic_rooms r
  WHERE r.clinic_id = v_clinic_id
    AND r.ativo = true;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_rooms() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_rooms() TO authenticated;

-- ── 3. Atualizar RPC upsert_room para aceitar alexa_device_name ─

DROP FUNCTION IF EXISTS public.upsert_room(uuid, text, text);
DROP FUNCTION IF EXISTS public.upsert_room(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.upsert_room(
  p_id                uuid DEFAULT NULL,
  p_nome              text DEFAULT NULL,
  p_descricao         text DEFAULT NULL,
  p_alexa_device_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_role      text;
  v_result_id uuid;
BEGIN
  v_clinic_id := app_clinic_id();
  v_role      := app_role();

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Nao autenticado';
  END IF;

  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Permissao insuficiente: apenas admin ou owner podem gerenciar salas';
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'O nome da sala e obrigatorio';
  END IF;

  IF p_id IS NULL THEN
    INSERT INTO public.clinic_rooms (clinic_id, nome, descricao, alexa_device_name)
    VALUES (v_clinic_id, trim(p_nome), p_descricao, nullif(trim(p_alexa_device_name), ''))
    ON CONFLICT (clinic_id, nome)
      DO UPDATE SET
        descricao         = EXCLUDED.descricao,
        alexa_device_name = EXCLUDED.alexa_device_name,
        updated_at        = now()
    RETURNING id INTO v_result_id;
  ELSE
    UPDATE public.clinic_rooms
    SET
      nome              = COALESCE(trim(p_nome), nome),
      descricao         = p_descricao,
      alexa_device_name = nullif(trim(p_alexa_device_name), ''),
      updated_at        = now()
    WHERE id        = p_id
      AND clinic_id = v_clinic_id
    RETURNING id INTO v_result_id;

    IF v_result_id IS NULL THEN
      RAISE EXCEPTION 'Sala nao encontrada ou sem permissao (id=%)', p_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_result_id);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_room(uuid, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_room(uuid, text, text, text) TO authenticated;

-- ── 4. Tabela clinic_alexa_config ─────────────────────────────

CREATE TABLE IF NOT EXISTS public.clinic_alexa_config (
  id                    uuid        NOT NULL DEFAULT gen_random_uuid(),
  clinic_id             uuid        NOT NULL DEFAULT app_clinic_id(),
  webhook_url           text        NOT NULL,
  reception_device_name text        NOT NULL DEFAULT 'Recepcao',
  welcome_template      text        NOT NULL DEFAULT 'Bem-vinda, {{nome}}! Fique a vontade, em breve voce sera atendida.',
  room_template         text        NOT NULL DEFAULT 'Dra Mirian, a paciente {{nome}} ja esta na nossa recepcao.',
  is_active             boolean     NOT NULL DEFAULT true,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT clinic_alexa_config_pkey PRIMARY KEY (id),
  CONSTRAINT clinic_alexa_config_clinic_unique UNIQUE (clinic_id)
);

CREATE TRIGGER clinic_alexa_config_updated_at
  BEFORE UPDATE ON public.clinic_alexa_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.clinic_alexa_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY alexa_config_select ON public.clinic_alexa_config
  FOR SELECT TO authenticated
  USING (clinic_id = app_clinic_id());

CREATE POLICY alexa_config_admin_write ON public.clinic_alexa_config
  FOR ALL TO authenticated
  USING (clinic_id = app_clinic_id() AND app_role() IN ('admin', 'owner'))
  WITH CHECK (clinic_id = app_clinic_id() AND app_role() IN ('admin', 'owner'));

-- ── 5. RPC: get_alexa_config ──────────────────────────────────

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
    'is_active',             c.is_active
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

-- ── 6. RPC: upsert_alexa_config ───────────────────────────────

CREATE OR REPLACE FUNCTION public.upsert_alexa_config(
  p_webhook_url           text,
  p_reception_device_name text DEFAULT 'Recepcao',
  p_welcome_template      text DEFAULT NULL,
  p_room_template         text DEFAULT NULL,
  p_is_active             boolean DEFAULT true
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
    clinic_id, webhook_url, reception_device_name, welcome_template, room_template, is_active
  ) VALUES (
    v_clinic_id,
    p_webhook_url,
    COALESCE(p_reception_device_name, 'Recepcao'),
    COALESCE(p_welcome_template, 'Bem-vinda, {{nome}}! Fique a vontade, em breve voce sera atendida.'),
    COALESCE(p_room_template, 'Dra Mirian, a paciente {{nome}} ja esta na nossa recepcao.'),
    COALESCE(p_is_active, true)
  )
  ON CONFLICT (clinic_id)
  DO UPDATE SET
    webhook_url           = EXCLUDED.webhook_url,
    reception_device_name = EXCLUDED.reception_device_name,
    welcome_template      = EXCLUDED.welcome_template,
    room_template         = EXCLUDED.room_template,
    is_active             = EXCLUDED.is_active,
    updated_at            = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_alexa_config(text, text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_alexa_config(text, text, text, text, boolean) TO authenticated;

-- ============================================================
-- VERIFICACAO:
-- SELECT get_rooms();
-- SELECT get_alexa_config();
-- SELECT upsert_alexa_config('https://flows.aldenquesada.site/webhook/alexa-announce');
-- SELECT upsert_room(NULL, 'Sala 1', 'Consultorio principal', 'Sala 1 Echo');
-- ============================================================
