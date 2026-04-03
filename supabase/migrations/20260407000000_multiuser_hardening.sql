-- ─────────────────────────────────────────────────────────────────────────────
-- Sprint 2 Hardening — Sistema Multi-Usuário
--
-- Corrige:
--   1. clinic_id hardcoded → usa app_clinic_id() dinamicamente
--   2. accept_invitation usa p_first_name / p_last_name corretamente
--   3. Adiciona RPC activate_staff (reativar usuário desativado)
--   4. Adiciona RPC list_pending_invites (convites pendentes)
--   5. Adiciona RPC revoke_invite (revogar convite)
--   6. Índice adicional em profiles(clinic_id, is_active)
--   7. Cleanup de convites expirados via RPC
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Índice adicional para queries com is_active ───────────────────────────────
CREATE INDEX IF NOT EXISTS profiles_clinic_active_idx
  ON public.profiles (clinic_id, is_active);


-- ── invite_staff (corrigido: usa app_clinic_id, não hardcoded) ────────────────
CREATE OR REPLACE FUNCTION public.invite_staff(
  p_email      text,
  p_role       text,
  p_first_name text DEFAULT '',
  p_last_name  text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := public.app_clinic_id();
  v_raw_token  text;
  v_token_hash text;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clinic_not_found');
  END IF;

  IF public.app_role() NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  IF p_role NOT IN ('admin', 'therapist', 'receptionist', 'viewer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  IF p_role = 'admin' AND public.app_role() != 'owner' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'only_owner_can_invite_admin');
  END IF;

  -- Email já é membro ativo?
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN   auth.users u ON u.id = p.id
    WHERE  lower(u.email) = lower(p_email)
      AND  p.clinic_id    = v_clinic_id
      AND  p.is_active    = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_member');
  END IF;

  -- Expira convites pendentes anteriores para o mesmo email
  UPDATE public.clinic_invitations
  SET    expires_at = NOW()
  WHERE  clinic_id   = v_clinic_id
    AND  email       = lower(p_email)
    AND  accepted_at IS NULL
    AND  expires_at  > NOW();

  -- Token: dois UUIDs sem hífens = 64 chars / 256 bits de aleatoriedade
  v_raw_token  := replace(gen_random_uuid()::text, '-', '') ||
                  replace(gen_random_uuid()::text, '-', '');
  v_token_hash := md5(v_raw_token);

  INSERT INTO public.clinic_invitations
    (clinic_id, email, role, token_hash, invited_by)
  VALUES
    (v_clinic_id, lower(p_email), p_role, v_token_hash, auth.uid());

  RETURN jsonb_build_object(
    'ok',         true,
    'raw_token',  v_raw_token,
    'email',      lower(p_email),
    'role',       p_role,
    'expires_in', '48 hours'
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.invite_staff(text, text, text, text) TO authenticated;


-- ── accept_invitation (corrigido: salva nome no perfil) ───────────────────────
CREATE OR REPLACE FUNCTION public.accept_invitation(
  p_raw_token  text,
  p_first_name text DEFAULT '',
  p_last_name  text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_token_hash text;
  v_inv        record;
  v_user_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  v_token_hash := md5(p_raw_token);

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

  -- Já tem perfil ativo? (não permite duplicata)
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE  id        = auth.uid()
      AND  is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_has_profile');
  END IF;

  -- Usa BEGIN/EXCEPTION para garantir atomicidade
  BEGIN
    INSERT INTO public.profiles (id, clinic_id, role, first_name, last_name)
    VALUES (
      auth.uid(),
      v_inv.clinic_id,
      v_inv.role,
      coalesce(trim(p_first_name), ''),
      coalesce(trim(p_last_name),  '')
    )
    ON CONFLICT (id) DO UPDATE
      SET role       = EXCLUDED.role,
          clinic_id  = EXCLUDED.clinic_id,
          first_name = CASE WHEN trim(EXCLUDED.first_name) != ''
                            THEN EXCLUDED.first_name
                            ELSE public.profiles.first_name END,
          last_name  = CASE WHEN trim(EXCLUDED.last_name) != ''
                            THEN EXCLUDED.last_name
                            ELSE public.profiles.last_name END,
          is_active  = true,
          updated_at = NOW();

    UPDATE public.clinic_invitations
    SET    accepted_at = NOW()
    WHERE  id = v_inv.id;

  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_creation_failed');
  END;

  RETURN jsonb_build_object(
    'ok',    true,
    'role',  v_inv.role,
    'email', v_user_email
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text, text, text) TO authenticated;


-- ── activate_staff (reativar usuário desativado) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.activate_staff(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_clinic_id uuid := public.app_clinic_id();
BEGIN
  IF public.app_role() NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  -- Não pode reativar owner por este fluxo
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_user_id AND clinic_id = v_clinic_id AND role = 'owner'
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_change_owner');
  END IF;

  UPDATE public.profiles
  SET    is_active = true, updated_at = NOW()
  WHERE  id        = p_user_id
    AND  clinic_id = v_clinic_id
    AND  is_active = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found_or_already_active');
  END IF;

  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.activate_staff(uuid) TO authenticated;


-- ── list_pending_invites (convites ainda não aceitos e não expirados) ─────────
CREATE OR REPLACE FUNCTION public.list_pending_invites()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public.app_clinic_id();
  v_result    jsonb;
BEGIN
  IF public.app_role() NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',         i.id,
      'email',      i.email,
      'role',       i.role,
      'created_at', i.created_at,
      'expires_at', i.expires_at,
      'invited_by_email', u.email
    ) ORDER BY i.created_at DESC
  )
  INTO v_result
  FROM  public.clinic_invitations i
  LEFT  JOIN auth.users u ON u.id = i.invited_by
  WHERE i.clinic_id   = v_clinic_id
    AND i.accepted_at IS NULL
    AND i.expires_at  > NOW();

  RETURN jsonb_build_object(
    'ok',   true,
    'data', coalesce(v_result, '[]'::jsonb)
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.list_pending_invites() TO authenticated;


-- ── revoke_invite (revogar convite pendente) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.revoke_invite(p_invite_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_clinic_id uuid := public.app_clinic_id();
BEGIN
  IF public.app_role() NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  UPDATE public.clinic_invitations
  SET    expires_at = NOW()
  WHERE  id         = p_invite_id
    AND  clinic_id  = v_clinic_id
    AND  accepted_at IS NULL;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invite_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.revoke_invite(uuid) TO authenticated;


-- ── cleanup_expired_invites (pode ser chamado periodicamente) ─────────────────
CREATE OR REPLACE FUNCTION public.cleanup_expired_invites()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM public.clinic_invitations
  WHERE  expires_at < NOW() - INTERVAL '30 days'
    AND  accepted_at IS NULL;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END; $$;
GRANT EXECUTE ON FUNCTION public.cleanup_expired_invites() TO authenticated;
