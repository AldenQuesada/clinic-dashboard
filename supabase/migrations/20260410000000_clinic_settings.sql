-- ============================================================
-- ClinicAI — Clinic Settings (Sprint 3 — Passo 5)
-- Adiciona coluna settings jsonb na tabela clinics e RPCs
-- de leitura/atualização com controle de permissão.
--
-- Estratégia:
--   • Campos estruturados (name, phone, email, etc.) ficam em
--     colunas próprias para indexação e consultas futuras.
--   • Dados ricos (horários, logos, cores, responsáveis, etc.)
--     ficam em settings jsonb.
--   • RLS + SECURITY DEFINER garante que somente membros da
--     clínica leiam e que somente admin/owner salvem.
-- ============================================================

-- ── Extensão de colunas na tabela clinics ────────────────────
ALTER TABLE public.clinics
  ADD COLUMN IF NOT EXISTS phone           text,
  ADD COLUMN IF NOT EXISTS whatsapp        text,
  ADD COLUMN IF NOT EXISTS email           text,
  ADD COLUMN IF NOT EXISTS website         text,
  ADD COLUMN IF NOT EXISTS description     text,
  ADD COLUMN IF NOT EXISTS address         jsonb    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS social          jsonb    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS fiscal          jsonb    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS operating_hours jsonb    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS settings        jsonb    DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS updated_at      timestamptz DEFAULT now();

-- Trigger para atualizar updated_at automaticamente
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS clinics_updated_at ON public.clinics;
CREATE TRIGGER clinics_updated_at
  BEFORE UPDATE ON public.clinics
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS ──────────────────────────────────────────────────────
-- Supõe que RLS já está habilitado na tabela clinics.
-- Caso não esteja, habilita:
ALTER TABLE public.clinics ENABLE ROW LEVEL SECURITY;

-- Membros da clínica podem ler os próprios dados
DROP POLICY IF EXISTS "clinic_members_can_read" ON public.clinics;
CREATE POLICY "clinic_members_can_read"
  ON public.clinics FOR SELECT
  USING ( id = app_clinic_id() );

-- Apenas admin/owner podem atualizar via UPDATE direto
-- (as RPCs abaixo fazem a validação mais granular)
DROP POLICY IF EXISTS "clinic_admins_can_update" ON public.clinics;
CREATE POLICY "clinic_admins_can_update"
  ON public.clinics FOR UPDATE
  USING ( id = app_clinic_id() AND app_role() IN ('admin','owner') );

-- ── RPC: get_clinic_settings ─────────────────────────────────
-- Retorna o registro completo da clínica atual.
-- Qualquer membro autenticado pode chamar.
CREATE OR REPLACE FUNCTION public.get_clinic_settings()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_row       public.clinics%ROWTYPE;
BEGIN
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT * INTO v_row
    FROM public.clinics
   WHERE id = v_clinic_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Clínica não encontrada';
  END IF;

  RETURN jsonb_build_object(
    'id',              v_row.id,
    'name',            v_row.name,
    'phone',           v_row.phone,
    'whatsapp',        v_row.whatsapp,
    'email',           v_row.email,
    'website',         v_row.website,
    'description',     v_row.description,
    'address',         COALESCE(v_row.address,     '{}'),
    'social',          COALESCE(v_row.social,       '{}'),
    'fiscal',          COALESCE(v_row.fiscal,       '{}'),
    'operating_hours', COALESCE(v_row.operating_hours, '{}'),
    'settings',        COALESCE(v_row.settings,    '{}'),
    'updated_at',      v_row.updated_at
  );
END;
$$;

-- ── RPC: update_clinic_settings ──────────────────────────────
-- Salva as configurações da clínica.
-- Requer role admin ou owner.
-- owner pode alterar campos exclusivos (name, slug, fiscal).
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
  v_clinic_id uuid    := app_clinic_id();
  v_role      text    := app_role();
BEGIN
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Somente admin e owner podem salvar configurações
  IF v_role NOT IN ('admin','owner') THEN
    RAISE EXCEPTION 'Permissão insuficiente para salvar configurações';
  END IF;

  -- name e fiscal são exclusivos do owner
  IF p_name IS NOT NULL AND v_role <> 'owner' THEN
    RAISE EXCEPTION 'Somente o proprietário pode alterar o nome da clínica';
  END IF;
  IF p_fiscal IS NOT NULL AND v_role <> 'owner' THEN
    RAISE EXCEPTION 'Somente o proprietário pode alterar dados fiscais';
  END IF;

  UPDATE public.clinics SET
    name            = COALESCE(p_name,            name),
    phone           = COALESCE(p_phone,           phone),
    whatsapp        = COALESCE(p_whatsapp,        whatsapp),
    email           = COALESCE(p_email,           email),
    website         = COALESCE(p_website,         website),
    description     = COALESCE(p_description,     description),
    address         = COALESCE(p_address,         address),
    social          = COALESCE(p_social,          social),
    fiscal          = COALESCE(p_fiscal,          fiscal),
    operating_hours = COALESCE(p_operating_hours, operating_hours),
    settings        = COALESCE(p_settings,        settings)
  WHERE id = v_clinic_id;

  RETURN jsonb_build_object('ok', true, 'updated_at', now());
END;
$$;

-- ── Permissões de execução das RPCs ─────────────────────────
REVOKE ALL ON FUNCTION public.get_clinic_settings()       FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_clinic_settings(
  text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.get_clinic_settings()       TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_clinic_settings(
  text, text, text, text, text, text, jsonb, jsonb, jsonb, jsonb, jsonb
) TO authenticated;
