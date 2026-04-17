-- ============================================================
-- Migration: 20260700000081 — link_user_to_professional
--
-- Permite vincular/desvincular um usuario existente a um
-- profissional existente (caso nao coberto pelo fluxo de convite,
-- por exemplo quando o user foi criado antes da entidade Equipe).
--
-- RPCs:
--   link_user_to_professional(p_user_id, p_professional_id)
--   unlink_user_from_professional(p_user_id)
--   list_unlinked_professionals() — profissionais sem user_id
-- ============================================================

-- ── link_user_to_professional ─────────────────────────────────

CREATE OR REPLACE FUNCTION public.link_user_to_professional(
  p_user_id         uuid,
  p_professional_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public.app_clinic_id();
  v_existing  uuid;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  -- Valida que user existe nesta clinica
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND clinic_id = v_clinic_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  -- Valida que profissional existe nesta clinica
  IF NOT EXISTS (
    SELECT 1 FROM public.professional_profiles
    WHERE id = p_professional_id AND clinic_id = v_clinic_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'professional_not_found');
  END IF;

  -- Verifica se profissional ja tem outro user vinculado
  SELECT user_id INTO v_existing
  FROM public.professional_profiles
  WHERE id = p_professional_id;

  IF v_existing IS NOT NULL AND v_existing != p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'professional_already_linked');
  END IF;

  -- Verifica se user ja esta vinculado a outro profissional
  IF EXISTS (
    SELECT 1 FROM public.professional_profiles
    WHERE user_id = p_user_id AND id != p_professional_id AND clinic_id = v_clinic_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_already_linked_to_another');
  END IF;

  -- Linka + seta email se estiver vazio (usa email do auth.users)
  UPDATE public.professional_profiles pp
  SET user_id    = p_user_id,
      email      = COALESCE(pp.email, (SELECT lower(email) FROM auth.users WHERE id = p_user_id)),
      updated_at = now()
  WHERE id = p_professional_id AND clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true, 'professional_id', p_professional_id, 'user_id', p_user_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.link_user_to_professional(uuid, uuid) TO authenticated;

-- ── unlink_user_from_professional ─────────────────────────────

CREATE OR REPLACE FUNCTION public.unlink_user_from_professional(
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public.app_clinic_id();
  v_count     int;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  UPDATE public.professional_profiles
  SET user_id    = NULL,
      updated_at = now()
  WHERE user_id = p_user_id
    AND clinic_id = v_clinic_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object('ok', true, 'unlinked_count', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.unlink_user_from_professional(uuid) TO authenticated;

-- ── list_unlinked_professionals ───────────────────────────────

CREATE OR REPLACE FUNCTION public.list_unlinked_professionals()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public.app_clinic_id();
  v_rows      jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',           pp.id,
    'display_name', pp.display_name,
    'specialty',    pp.specialty,
    'nivel',        pp.nivel,
    'email',        pp.email
  ) ORDER BY lower(pp.display_name)), '[]'::jsonb)
  INTO v_rows
  FROM public.professional_profiles pp
  WHERE pp.clinic_id = v_clinic_id
    AND pp.is_active = true
    AND pp.user_id   IS NULL;

  RETURN jsonb_build_object('ok', true, 'professionals', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_unlinked_professionals() TO authenticated;

-- ── list_staff — adiciona professional vinculado ───────────────

-- Ler definicao atual para nao perder campos.
-- Versao atual retorna: id, email, role, is_active, first_name, last_name, created_at
-- Acrescentamos professional (id + display_name) quando houver linkagem.

DROP FUNCTION IF EXISTS public.list_staff();

CREATE OR REPLACE FUNCTION public.list_staff()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public.app_clinic_id();
  v_rows      jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',           p.id,
    'email',        au.email,
    'role',         p.role,
    'is_active',    p.is_active,
    'first_name',   p.first_name,
    'last_name',    p.last_name,
    'created_at',   p.created_at,
    'professional', CASE
      WHEN pp.id IS NOT NULL THEN jsonb_build_object(
        'id',           pp.id,
        'display_name', pp.display_name,
        'specialty',    pp.specialty
      )
      ELSE NULL
    END
  ) ORDER BY p.is_active DESC, lower(p.first_name)), '[]'::jsonb)
  INTO v_rows
  FROM public.profiles p
  JOIN auth.users au ON au.id = p.id
  LEFT JOIN public.professional_profiles pp
    ON pp.user_id = p.id AND pp.clinic_id = v_clinic_id AND pp.is_active = true
  WHERE p.clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true, 'staff', v_rows);
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_staff() TO authenticated;

COMMENT ON FUNCTION public.link_user_to_professional    IS 'Vincula user existente a profissional existente (admin only).';
COMMENT ON FUNCTION public.unlink_user_from_professional IS 'Remove vinculo user-profissional (admin only).';
COMMENT ON FUNCTION public.list_unlinked_professionals   IS 'Lista profissionais sem user vinculado (admin only).';
COMMENT ON FUNCTION public.list_staff                    IS 'Lista staff com professional vinculado quando houver.';
