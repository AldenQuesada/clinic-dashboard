-- ─────────────────────────────────────────────────────────────────────────────
-- Fix: remove dependência de pgcrypto nas funções invite_staff e accept_invitation
-- Usa gen_random_uuid() + md5() que são built-ins do PostgreSQL (sem extensão)
--
-- Problema: gen_random_bytes() e sha256() pertencem à extensão pgcrypto
--           que não estava habilitada no projeto
-- Solução:  token = dois UUIDs concatenados sem hífens (64 chars hex, 256 bits)
--           hash  = md5(token) — suficiente como chave de lookup
-- ─────────────────────────────────────────────────────────────────────────────

-- ── invite_staff (corrigido) ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invite_staff(
  p_email     text,
  p_role      text,
  p_first_name text DEFAULT '',
  p_last_name  text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_raw_token  text;
  v_token_hash text;
BEGIN
  -- Apenas owner/admin podem convidar
  IF public.app_role() NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  -- Roles válidos para convite
  IF p_role NOT IN ('admin', 'therapist', 'receptionist', 'viewer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  -- Apenas owner pode convidar admin
  IF p_role = 'admin' AND public.app_role() != 'owner' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'only_owner_can_invite_admin');
  END IF;

  -- Email já é membro ativo?
  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE lower(u.email) = lower(p_email)
      AND p.clinic_id = v_clinic_id
      AND p.is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_member');
  END IF;

  -- Cancela convite pendente anterior para o mesmo email
  UPDATE public.clinic_invitations
  SET    expires_at = NOW()
  WHERE  clinic_id   = v_clinic_id
    AND  email       = lower(p_email)
    AND  accepted_at IS NULL;

  -- Gera token com dois UUIDs sem hífens (64 chars = 256 bits de aleatoriedade)
  v_raw_token  := replace(gen_random_uuid()::text, '-', '') ||
                  replace(gen_random_uuid()::text, '-', '');
  v_token_hash := md5(v_raw_token);

  INSERT INTO public.clinic_invitations (clinic_id, email, role, token_hash, invited_by)
  VALUES (v_clinic_id, lower(p_email), p_role, v_token_hash, auth.uid());

  RETURN jsonb_build_object(
    'ok',         true,
    'raw_token',  v_raw_token,
    'email',      lower(p_email),
    'role',       p_role,
    'expires_in', '48 hours'
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.invite_staff(text, text, text, text) TO authenticated;


-- ── accept_invitation (corrigido) ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_invitation(p_raw_token text)
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

  -- Hash do token usando md5 (consistente com invite_staff)
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

  -- Garante que o email do convite bate com o usuário logado
  IF v_user_email != v_inv.email THEN
    RETURN jsonb_build_object('ok', false, 'error', 'email_mismatch');
  END IF;

  -- Usuário não deve ter perfil ativo
  IF EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_has_profile');
  END IF;

  INSERT INTO public.profiles (id, clinic_id, role, first_name, last_name)
  VALUES (auth.uid(), v_inv.clinic_id, v_inv.role, '', '');

  UPDATE public.clinic_invitations
  SET accepted_at = NOW()
  WHERE id = v_inv.id;

  RETURN jsonb_build_object(
    'ok',      true,
    'role',    v_inv.role,
    'email',   v_user_email
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;
