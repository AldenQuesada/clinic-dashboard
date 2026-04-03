-- ═══════════════════════════════════════════════════════════════════════════
--  ClinicAI — Sprint Auth: Multi-User Authentication & Authorization
--  Migration: 20260405000000_auth_multiuser_sprint1.sql
--
--  Fundação completa de autenticação multi-usuário:
--    1. Funções helper (app_clinic_id dinâmica, app_role, is_admin, is_staff)
--    2. Tabela profiles (perfil de cada membro da clínica)
--    3. Tabela clinic_invitations (convites — sem auto-cadastro)
--    4. Hook custom_access_token_hook (injeta clinic_id + app_role no JWT)
--    5. RLS em profiles e clinic_invitations
--    6. RLS authenticated em todas as tabelas existentes
--    7. RPCs: get_my_profile, invite_staff, accept_invitation,
--             list_staff, update_staff_role, deactivate_staff,
--             create_owner_profile
--
--  IMPORTANTE após aplicar:
--    Registrar o hook em:
--    Supabase Dashboard → Authentication → Hooks → Custom Access Token
--    Função: public.custom_access_token_hook
-- ═══════════════════════════════════════════════════════════════════════════


-- ── 1. FUNÇÕES HELPER ────────────────────────────────────────────────────────

-- app_clinic_id(): dinâmica para authenticated, hardcoded para anon
-- Backward-compatible: não quebra o formulário do paciente (anon)
CREATE OR REPLACE FUNCTION public.app_clinic_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() ->> 'clinic_id', '')::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  );
$$;
GRANT EXECUTE ON FUNCTION public.app_clinic_id() TO anon, authenticated;

-- app_role(): role do JWT — 'anon' para público, role real para staff
CREATE OR REPLACE FUNCTION public.app_role()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(NULLIF(auth.jwt() ->> 'app_role', ''), 'anon');
$$;
GRANT EXECUTE ON FUNCTION public.app_role() TO anon, authenticated;

-- is_admin(): true para owner e admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_role() IN ('owner', 'admin');
$$;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated;

-- is_staff(): true para qualquer role autenticada válida
CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.app_role() IN ('owner', 'admin', 'therapist', 'receptionist', 'viewer');
$$;
GRANT EXECUTE ON FUNCTION public.is_staff() TO authenticated;


-- ── 2. TABELA: profiles ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.profiles (
  id         uuid        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id  uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  role       text        NOT NULL CHECK (role IN ('owner','admin','therapist','receptionist','viewer')),
  first_name text        NOT NULL DEFAULT '',
  last_name  text        NOT NULL DEFAULT '',
  avatar_url text,
  is_active  boolean     NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_clinic_id_idx  ON public.profiles (clinic_id);
CREATE INDEX IF NOT EXISTS profiles_clinic_role_idx ON public.profiles (clinic_id, role);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public._set_updated_at();
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ── 3. TABELA: clinic_invitations ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.clinic_invitations (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  email       text        NOT NULL,
  role        text        NOT NULL CHECK (role IN ('admin','therapist','receptionist','viewer')),
  token_hash  text        NOT NULL UNIQUE,
  invited_by  uuid        NOT NULL REFERENCES public.profiles(id),
  expires_at  timestamptz NOT NULL DEFAULT now() + INTERVAL '48 hours',
  accepted_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_invitations_email_lower CHECK (email = lower(email))
);

CREATE INDEX IF NOT EXISTS clinic_invitations_clinic_idx ON public.clinic_invitations (clinic_id);
CREATE INDEX IF NOT EXISTS clinic_invitations_email_idx  ON public.clinic_invitations (email);
CREATE INDEX IF NOT EXISTS clinic_invitations_token_idx  ON public.clinic_invitations (token_hash);

ALTER TABLE public.clinic_invitations ENABLE ROW LEVEL SECURITY;


-- ── 4. HOOK: custom_access_token_hook ─────────────────────────────────────────
-- Injeta clinic_id e app_role no JWT a cada login e refresh de sessão.
-- ⚠ Após aplicar a migration, registrar em:
--   Supabase Dashboard → Authentication → Hooks → Custom Access Token
--   Função: public.custom_access_token_hook

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  claims  jsonb;
  profile record;
BEGIN
  SELECT p.clinic_id, p.role, p.is_active
  INTO   profile
  FROM   public.profiles p
  WHERE  p.id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';

  IF FOUND AND profile.is_active THEN
    -- Usuário com perfil ativo: injeta dados no JWT
    claims := jsonb_set(claims, '{clinic_id}', to_jsonb(profile.clinic_id::text));
    claims := jsonb_set(claims, '{app_role}',  to_jsonb(profile.role));
  ELSE
    -- Sem perfil ou inativo: bloqueia acesso a dados
    claims := jsonb_set(claims, '{clinic_id}', 'null'::jsonb);
    claims := jsonb_set(claims, '{app_role}',  '"no_profile"'::jsonb);
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Apenas o serviço de auth pode invocar este hook
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;


-- ── 5. RLS: profiles ──────────────────────────────────────────────────────────

-- Leitura: qualquer membro ativo da mesma clínica
CREATE POLICY profiles_select ON public.profiles
  FOR SELECT TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND is_active = true
  );

-- Atualização própria: nome e avatar (não altera role nem clinic)
CREATE POLICY profiles_update_own ON public.profiles
  FOR UPDATE TO authenticated
  USING  (id = auth.uid() AND clinic_id = public.app_clinic_id())
  WITH CHECK (
    id        = auth.uid()
    AND clinic_id = public.app_clinic_id()
    -- Impede auto-promoção de role
    AND role = (SELECT role FROM public.profiles WHERE id = auth.uid())
  );

-- Atualização por admin: role, is_active e outros campos
CREATE POLICY profiles_update_admin ON public.profiles
  FOR UPDATE TO authenticated
  USING  (clinic_id = public.app_clinic_id() AND public.is_admin())
  WITH CHECK (clinic_id = public.app_clinic_id());

-- Delete: apenas owner (preferir deactivate_staff)
CREATE POLICY profiles_delete ON public.profiles
  FOR DELETE TO authenticated
  USING (clinic_id = public.app_clinic_id() AND public.app_role() = 'owner');

-- Insert: bloqueado para direto — apenas via accept_invitation (SECURITY DEFINER)


-- ── 6. RLS: clinic_invitations ────────────────────────────────────────────────

-- Leitura: owner/admin veem todos os convites da clínica
CREATE POLICY invitations_select ON public.clinic_invitations
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id() AND public.is_admin());

-- Insert/Update: bloqueado direto — apenas via invite_staff / accept_invitation


-- ── 7. RLS AUTHENTICATED: tabelas existentes ──────────────────────────────────
-- Políticas anon existentes são mantidas intactas (formulário do paciente).
-- Novas políticas para o painel admin (role authenticated).

-- ── anamnesis_templates ──────────────────────────────────────────────────────
CREATE POLICY templates_auth_select ON public.anamnesis_templates
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

CREATE POLICY templates_auth_insert ON public.anamnesis_templates
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = public.app_clinic_id() AND public.is_admin());

CREATE POLICY templates_auth_update ON public.anamnesis_templates
  FOR UPDATE TO authenticated
  USING  (clinic_id = public.app_clinic_id() AND public.is_admin())
  WITH CHECK (clinic_id = public.app_clinic_id());

CREATE POLICY templates_auth_delete ON public.anamnesis_templates
  FOR DELETE TO authenticated
  USING (clinic_id = public.app_clinic_id() AND public.is_admin());

-- ── anamnesis_template_sessions ──────────────────────────────────────────────
CREATE POLICY sessions_auth_select ON public.anamnesis_template_sessions
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.anamnesis_templates t
    WHERE t.id = template_id AND t.clinic_id = public.app_clinic_id()
  ));

CREATE POLICY sessions_auth_insert ON public.anamnesis_template_sessions
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() AND EXISTS (
      SELECT 1 FROM public.anamnesis_templates t
      WHERE t.id = template_id AND t.clinic_id = public.app_clinic_id()
    )
  );

CREATE POLICY sessions_auth_update ON public.anamnesis_template_sessions
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() AND EXISTS (
      SELECT 1 FROM public.anamnesis_templates t
      WHERE t.id = template_id AND t.clinic_id = public.app_clinic_id()
    )
  )
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.anamnesis_templates t
    WHERE t.id = template_id AND t.clinic_id = public.app_clinic_id()
  ));

CREATE POLICY sessions_auth_delete ON public.anamnesis_template_sessions
  FOR DELETE TO authenticated
  USING (
    public.is_admin() AND EXISTS (
      SELECT 1 FROM public.anamnesis_templates t
      WHERE t.id = template_id AND t.clinic_id = public.app_clinic_id()
    )
  );

-- ── anamnesis_fields ─────────────────────────────────────────────────────────
CREATE POLICY fields_auth_select ON public.anamnesis_fields
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.anamnesis_templates t
    WHERE t.id = template_id AND t.clinic_id = public.app_clinic_id()
  ));

CREATE POLICY fields_auth_insert ON public.anamnesis_fields
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() AND EXISTS (
      SELECT 1 FROM public.anamnesis_templates t
      WHERE t.id = template_id AND t.clinic_id = public.app_clinic_id()
    )
  );

CREATE POLICY fields_auth_update ON public.anamnesis_fields
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() AND EXISTS (
      SELECT 1 FROM public.anamnesis_templates t
      WHERE t.id = template_id AND t.clinic_id = public.app_clinic_id()
    )
  )
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.anamnesis_templates t
    WHERE t.id = template_id AND t.clinic_id = public.app_clinic_id()
  ));

CREATE POLICY fields_auth_delete ON public.anamnesis_fields
  FOR DELETE TO authenticated
  USING (
    public.is_admin() AND EXISTS (
      SELECT 1 FROM public.anamnesis_templates t
      WHERE t.id = template_id AND t.clinic_id = public.app_clinic_id()
    )
  );

-- ── anamnesis_field_options ───────────────────────────────────────────────────
CREATE POLICY opts_auth_select ON public.anamnesis_field_options
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.anamnesis_fields f
    JOIN public.anamnesis_templates t ON t.id = f.template_id
    WHERE f.id = field_id AND t.clinic_id = public.app_clinic_id()
  ));

CREATE POLICY opts_auth_insert ON public.anamnesis_field_options
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_admin() AND EXISTS (
      SELECT 1 FROM public.anamnesis_fields f
      JOIN public.anamnesis_templates t ON t.id = f.template_id
      WHERE f.id = field_id AND t.clinic_id = public.app_clinic_id()
    )
  );

CREATE POLICY opts_auth_update ON public.anamnesis_field_options
  FOR UPDATE TO authenticated
  USING (
    public.is_admin() AND EXISTS (
      SELECT 1 FROM public.anamnesis_fields f
      JOIN public.anamnesis_templates t ON t.id = f.template_id
      WHERE f.id = field_id AND t.clinic_id = public.app_clinic_id()
    )
  )
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.anamnesis_fields f
    JOIN public.anamnesis_templates t ON t.id = f.template_id
    WHERE f.id = field_id AND t.clinic_id = public.app_clinic_id()
  ));

CREATE POLICY opts_auth_delete ON public.anamnesis_field_options
  FOR DELETE TO authenticated
  USING (
    public.is_admin() AND EXISTS (
      SELECT 1 FROM public.anamnesis_fields f
      JOIN public.anamnesis_templates t ON t.id = f.template_id
      WHERE f.id = field_id AND t.clinic_id = public.app_clinic_id()
    )
  );

-- ── patients ──────────────────────────────────────────────────────────────────
CREATE POLICY patients_auth_select ON public.patients
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

CREATE POLICY patients_auth_insert ON public.patients
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','receptionist','therapist')
  );

CREATE POLICY patients_auth_update ON public.patients
  FOR UPDATE TO authenticated
  USING (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','receptionist','therapist')
  )
  WITH CHECK (clinic_id = public.app_clinic_id());

CREATE POLICY patients_auth_delete ON public.patients
  FOR DELETE TO authenticated
  USING (clinic_id = public.app_clinic_id() AND public.is_admin());

-- ── anamnesis_requests ────────────────────────────────────────────────────────
CREATE POLICY requests_auth_select ON public.anamnesis_requests
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

CREATE POLICY requests_auth_insert ON public.anamnesis_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner','admin','receptionist','therapist')
  );

CREATE POLICY requests_auth_update ON public.anamnesis_requests
  FOR UPDATE TO authenticated
  USING  (clinic_id = public.app_clinic_id() AND public.is_admin())
  WITH CHECK (clinic_id = public.app_clinic_id());

CREATE POLICY requests_auth_delete ON public.anamnesis_requests
  FOR DELETE TO authenticated
  USING (clinic_id = public.app_clinic_id() AND public.is_admin());

-- ── anamnesis_responses ───────────────────────────────────────────────────────
CREATE POLICY responses_auth_select ON public.anamnesis_responses
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

-- Staff não escreve responses diretamente — feito via patient form (anon) ou RPC

-- ── anamnesis_answers ─────────────────────────────────────────────────────────
CREATE POLICY answers_auth_select ON public.anamnesis_answers
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

-- Staff não escreve answers diretamente — feito via patient form (anon) ou RPC


-- ── 8. RPCs ───────────────────────────────────────────────────────────────────

-- ── get_my_profile ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_my_profile()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_p record; BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  SELECT p.id, p.clinic_id, p.role, p.first_name, p.last_name,
         p.avatar_url, p.is_active, u.email
  INTO   v_p
  FROM   public.profiles p
  JOIN   auth.users u ON u.id = p.id
  WHERE  p.id = auth.uid();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'profile_not_found');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'id',         v_p.id,
    'clinic_id',  v_p.clinic_id,
    'role',       v_p.role,
    'first_name', v_p.first_name,
    'last_name',  v_p.last_name,
    'avatar_url', v_p.avatar_url,
    'email',      v_p.email,
    'is_active',  v_p.is_active
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.get_my_profile() TO authenticated;

-- ── create_owner_profile ─────────────────────────────────────────────────────
-- Cria o primeiro owner da clínica. Uso único no setup inicial.
-- Exige que o usuário já esteja autenticado via Supabase Auth.
CREATE OR REPLACE FUNCTION public.create_owner_profile(
  p_clinic_id  uuid,
  p_first_name text,
  p_last_name  text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;

  -- Bloqueia se já existe owner ativo para esta clínica
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE clinic_id = p_clinic_id AND role = 'owner' AND is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'owner_already_exists');
  END IF;

  -- Bloqueia se usuário já tem perfil
  IF EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_has_profile');
  END IF;

  INSERT INTO public.profiles (id, clinic_id, role, first_name, last_name)
  VALUES (auth.uid(), p_clinic_id, 'owner', p_first_name, p_last_name);

  RETURN jsonb_build_object('ok', true, 'role', 'owner', 'clinic_id', p_clinic_id);
END; $$;
GRANT EXECUTE ON FUNCTION public.create_owner_profile(uuid, text, text) TO authenticated;

-- ── invite_staff ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invite_staff(
  p_email      text,
  p_role       text,
  p_first_name text DEFAULT NULL,
  p_last_name  text DEFAULT NULL
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
  -- Apenas owner/admin podem convidar
  IF public.app_role() NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  -- Roles válidos para convite (owner não é convidado — é criado via create_owner_profile)
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

  v_raw_token  := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(sha256(v_raw_token::bytea), 'hex');

  INSERT INTO public.clinic_invitations (clinic_id, email, role, token_hash, invited_by)
  VALUES (v_clinic_id, lower(p_email), p_role, v_token_hash, auth.uid());

  -- raw_token é retornado UMA VEZ para o admin enviar por email
  -- O banco nunca armazena o token em texto claro
  RETURN jsonb_build_object(
    'ok',         true,
    'raw_token',  v_raw_token,
    'email',      lower(p_email),
    'role',       p_role,
    'expires_in', '48 hours'
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.invite_staff(text, text, text, text) TO authenticated;

-- ── accept_invitation ─────────────────────────────────────────────────────────
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

  v_token_hash := encode(sha256(p_raw_token::bytea), 'hex');

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
    'ok',        true,
    'role',      v_inv.role,
    'clinic_id', v_inv.clinic_id
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

-- ── list_staff ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_staff()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_result jsonb; BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  SELECT jsonb_agg(jsonb_build_object(
    'id',         p.id,
    'email',      u.email,
    'first_name', p.first_name,
    'last_name',  p.last_name,
    'role',       p.role,
    'is_active',  p.is_active,
    'created_at', p.created_at
  ) ORDER BY p.created_at)
  INTO   v_result
  FROM   public.profiles p
  JOIN   auth.users u ON u.id = p.id
  WHERE  p.clinic_id = public.app_clinic_id();

  RETURN jsonb_build_object('ok', true, 'staff', COALESCE(v_result, '[]'::jsonb));
END; $$;
GRANT EXECUTE ON FUNCTION public.list_staff() TO authenticated;

-- ── update_staff_role ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_staff_role(p_user_id uuid, p_new_role text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_new_role NOT IN ('owner','admin','therapist','receptionist','viewer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  -- Apenas owner pode promover/rebaixar para admin ou owner
  IF p_new_role IN ('owner','admin') AND public.app_role() != 'owner' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'only_owner_can_set_admin');
  END IF;

  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  -- Protege auto-alteração de role
  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_change_own_role');
  END IF;

  UPDATE public.profiles
  SET    role = p_new_role, updated_at = NOW()
  WHERE  id = p_user_id AND clinic_id = public.app_clinic_id();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.update_staff_role(uuid, text) TO authenticated;

-- ── deactivate_staff ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.deactivate_staff(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  IF p_user_id = auth.uid() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_deactivate_self');
  END IF;

  UPDATE public.profiles
  SET    is_active = false, updated_at = NOW()
  WHERE  id = p_user_id AND clinic_id = public.app_clinic_id();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.deactivate_staff(uuid) TO authenticated;
