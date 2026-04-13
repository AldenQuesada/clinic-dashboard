-- Migration: Permissoes no convite — usuario ja entra com restricoes
-- 1. Adiciona coluna permissions na clinic_invitations
-- 2. Atualiza invite_staff para aceitar permissions
-- 3. Atualiza accept_invitation para copiar permissions pro user_module_permissions

-- ── 1. Coluna permissions no convite ───────────────────────────
ALTER TABLE public.clinic_invitations
  ADD COLUMN IF NOT EXISTS module_permissions jsonb DEFAULT NULL;

COMMENT ON COLUMN public.clinic_invitations.module_permissions IS 'Permissoes de modulos definidas no convite. Aplicadas automaticamente ao aceitar.';

-- ── 2. invite_staff v2 — aceita permissions ────────────────────
DROP FUNCTION IF EXISTS public.invite_staff(text, text);
DROP FUNCTION IF EXISTS public.invite_staff(text, text, text, text);

CREATE OR REPLACE FUNCTION public.invite_staff(
  p_email       text,
  p_role        text,
  p_first_name  text DEFAULT '',
  p_last_name   text DEFAULT '',
  p_permissions jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := public.app_clinic_id();
  v_caller     uuid := auth.uid();
  v_caller_role text;
  v_raw_token  text;
  v_token_hash text;
  v_invite_id  uuid;
BEGIN
  -- Validacoes
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  IF p_role NOT IN ('admin','therapist','receptionist','viewer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  SELECT role INTO v_caller_role FROM public.profiles WHERE id = v_caller AND clinic_id = v_clinic_id;
  IF p_role = 'admin' AND v_caller_role != 'owner' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'only_owner_can_invite_admin');
  END IF;

  -- Verifica se ja e membro
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE lower(u.email) = lower(p_email) AND p.clinic_id = v_clinic_id AND p.is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_member');
  END IF;

  -- Gera token
  v_raw_token  := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(sha256(v_raw_token::bytea), 'hex');

  INSERT INTO public.clinic_invitations (clinic_id, email, role, token_hash, invited_by, module_permissions)
  VALUES (v_clinic_id, lower(p_email), p_role, v_token_hash, v_caller, p_permissions)
  RETURNING id INTO v_invite_id;

  RETURN jsonb_build_object(
    'ok',        true,
    'invite_id', v_invite_id,
    'email',     lower(p_email),
    'role',      p_role,
    'raw_token', v_raw_token
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_staff(text, text, text, text, jsonb) TO authenticated;

-- ── 3. accept_invitation v2 — copia permissions ────────────────
DROP FUNCTION IF EXISTS public.accept_invitation(text);
DROP FUNCTION IF EXISTS public.accept_invitation(text, text, text);

CREATE OR REPLACE FUNCTION public.accept_invitation(p_raw_token text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_hash text := encode(sha256(p_raw_token::bytea), 'hex');
  v_inv        record;
  v_user_email text;
  v_perm       jsonb;
BEGIN
  SELECT * INTO v_inv
  FROM   public.clinic_invitations
  WHERE  token_hash  = v_token_hash
    AND  accepted_at IS NULL
    AND  expires_at  > NOW();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_or_expired_token');
  END IF;

  SELECT lower(email) INTO v_user_email
  FROM   auth.users WHERE id = auth.uid();

  IF v_user_email != v_inv.email THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_has_profile');
  END IF;

  -- Cria perfil
  INSERT INTO public.profiles (id, clinic_id, role, first_name, last_name)
  VALUES (auth.uid(), v_inv.clinic_id, v_inv.role, '', '');

  -- Marca convite como aceito
  UPDATE public.clinic_invitations
  SET accepted_at = NOW()
  WHERE id = v_inv.id;

  -- Copia permissoes de modulos do convite para o usuario
  IF v_inv.module_permissions IS NOT NULL AND jsonb_array_length(v_inv.module_permissions) > 0 THEN
    FOR v_perm IN SELECT * FROM jsonb_array_elements(v_inv.module_permissions)
    LOOP
      INSERT INTO public.user_module_permissions (clinic_id, user_id, module_id, page_id, allowed, updated_by)
      VALUES (
        v_inv.clinic_id,
        auth.uid(),
        v_perm->>'module_id',
        NULLIF(v_perm->>'page_id', ''),
        (v_perm->>'allowed')::boolean,
        v_inv.invited_by
      )
      ON CONFLICT (clinic_id, user_id, module_id, page_id) DO NOTHING;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'ok',        true,
    'role',      v_inv.role,
    'clinic_id', v_inv.clinic_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

COMMENT ON FUNCTION public.invite_staff  IS 'Convida membro com permissoes de modulos opcionais. Permissoes sao aplicadas ao aceitar.';
COMMENT ON FUNCTION public.accept_invitation IS 'Aceita convite, cria perfil e copia permissoes de modulos do convite.';
