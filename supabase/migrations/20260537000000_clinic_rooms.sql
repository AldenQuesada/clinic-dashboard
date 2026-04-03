-- ============================================================
-- Migration: 20260537000000 — clinic_rooms
--
-- Tabela de salas/consultórios da clínica com isolamento por
-- clinic_id via RLS. RPCs de CRUD com controle de role.
--
-- Tabela:  clinic_rooms
-- RPCs:    get_rooms, upsert_room, soft_delete_room
-- ============================================================

-- ── Tabela ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.clinic_rooms (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  clinic_id   uuid        NOT NULL DEFAULT app_clinic_id(),
  nome        text        NOT NULL,
  descricao   text,
  ativo       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT clinic_rooms_pkey PRIMARY KEY (id),
  CONSTRAINT clinic_rooms_clinic_nome_unique UNIQUE (clinic_id, nome)
);

-- ── Indexes ───────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_clinic_rooms_clinic
  ON public.clinic_rooms (clinic_id);

CREATE INDEX IF NOT EXISTS idx_clinic_rooms_ativo
  ON public.clinic_rooms (clinic_id, ativo);

-- ── Trigger updated_at ────────────────────────────────────────

CREATE TRIGGER clinic_rooms_updated_at
  BEFORE UPDATE ON public.clinic_rooms
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ───────────────────────────────────────────────────────

ALTER TABLE public.clinic_rooms ENABLE ROW LEVEL SECURITY;

-- SELECT: qualquer usuário autenticado da mesma clínica
CREATE POLICY rooms_select ON public.clinic_rooms
  FOR SELECT
  TO authenticated
  USING (clinic_id = app_clinic_id());

-- INSERT/UPDATE/DELETE: somente admin/owner
CREATE POLICY rooms_admin_write ON public.clinic_rooms
  FOR ALL
  TO authenticated
  USING (
    clinic_id = app_clinic_id()
    AND app_role() IN ('admin', 'owner')
  )
  WITH CHECK (
    clinic_id = app_clinic_id()
    AND app_role() IN ('admin', 'owner')
  );

-- ── RPC: get_rooms ────────────────────────────────────────────

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
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',         r.id,
      'nome',       r.nome,
      'descricao',  r.descricao,
      'ativo',      r.ativo,
      'created_at', r.created_at,
      'updated_at', r.updated_at
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

-- ── RPC: upsert_room ──────────────────────────────────────────

DROP FUNCTION IF EXISTS public.upsert_room(uuid, text, text);

CREATE OR REPLACE FUNCTION public.upsert_room(
  p_id        uuid DEFAULT NULL,
  p_nome      text DEFAULT NULL,
  p_descricao text DEFAULT NULL
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
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Permissão insuficiente: apenas admin ou owner podem gerenciar salas';
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'O nome da sala é obrigatório';
  END IF;

  IF p_id IS NULL THEN
    -- INSERT com ON CONFLICT para garantir idempotência
    INSERT INTO public.clinic_rooms (clinic_id, nome, descricao)
    VALUES (v_clinic_id, trim(p_nome), p_descricao)
    ON CONFLICT (clinic_id, nome)
      DO UPDATE SET
        descricao  = EXCLUDED.descricao,
        updated_at = now()
    RETURNING id INTO v_result_id;
  ELSE
    -- UPDATE por id + clinic_id
    UPDATE public.clinic_rooms
    SET
      nome       = COALESCE(trim(p_nome), nome),
      descricao  = p_descricao,
      updated_at = now()
    WHERE id        = p_id
      AND clinic_id = v_clinic_id
    RETURNING id INTO v_result_id;

    IF v_result_id IS NULL THEN
      RAISE EXCEPTION 'Sala não encontrada ou sem permissão (id=%)', p_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_result_id);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_room(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_room(uuid, text, text) TO authenticated;

-- ── RPC: soft_delete_room ─────────────────────────────────────

DROP FUNCTION IF EXISTS public.soft_delete_room(uuid);

CREATE OR REPLACE FUNCTION public.soft_delete_room(
  p_id uuid
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
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Permissão insuficiente: apenas admin ou owner podem excluir salas';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'O id da sala é obrigatório';
  END IF;

  -- Desvincula a sala de clinic_technologies (tabela pode ainda não existir)
  BEGIN
    UPDATE public.clinic_technologies
    SET sala_id = NULL
    WHERE sala_id = p_id;
  EXCEPTION
    WHEN undefined_table THEN
      NULL; -- tabela ainda não existe, ignorar
  END;

  -- Desvincula a sala de professional_profiles (campo pode ainda não existir)
  BEGIN
    UPDATE public.professional_profiles
    SET sala_id = NULL
    WHERE sala_id = p_id;
  EXCEPTION
    WHEN undefined_table THEN
      NULL; -- tabela ainda não existe, ignorar
    WHEN undefined_column THEN
      NULL; -- coluna ainda não existe, ignorar
  END;

  -- Soft delete da sala
  UPDATE public.clinic_rooms
  SET
    ativo      = false,
    updated_at = now()
  WHERE id        = p_id
    AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sala não encontrada ou sem permissão (id=%)', p_id;
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_room(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_room(uuid) TO authenticated;

-- ============================================================
-- VERIFICAÇÃO:
-- SELECT get_rooms();
-- SELECT upsert_room(NULL, 'Sala 1', 'Sala principal');
-- SELECT soft_delete_room('<uuid>');
-- ============================================================
