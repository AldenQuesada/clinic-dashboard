-- ============================================================
-- Migration: 20260700000080 — equipe_usuarios_integration
--
-- Integra o modulo Equipe (professional_profiles) com o modulo
-- Usuarios (profiles + clinic_invitations + user_module_permissions).
--
-- Mudancas:
--   1. professional_profiles.email      — contato do profissional
--   2. clinic_invitations.professional_id — vincula convite ao profissional
--   3. get_professionals                — retorna email, user_email, invite_status
--   4. upsert_professional              — aceita p_email
--   5. invite_staff                     — aceita p_professional_id (opcional)
--   6. accept_invitation                — seta professional_profiles.user_id ao aceitar
--   7. invite_professional_as_user      — wrapper dedicado da tela Equipe
-- ============================================================

-- ── 1. Colunas novas ──────────────────────────────────────────

ALTER TABLE public.professional_profiles
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.clinic_invitations
  ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES public.professional_profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_prof_profiles_email
  ON public.professional_profiles (lower(email))
  WHERE email IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_clinic_invitations_professional
  ON public.clinic_invitations (professional_id)
  WHERE professional_id IS NOT NULL;

-- ── 2. get_professionals — inclui email, user_email, invite_status ───

DROP FUNCTION IF EXISTS public.get_professionals();

CREATE OR REPLACE FUNCTION public.get_professionals()
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
      'id',             pp.id,
      'display_name',   pp.display_name,
      'specialty',      pp.specialty,
      'crm',            pp.crm,
      'color',          pp.color,
      'bio',            pp.bio,
      'telefone',       pp.telefone,
      'whatsapp',       pp.whatsapp,
      'phone',          pp.phone,
      'cpf',            pp.cpf,
      'nascimento',     pp.nascimento,
      'endereco',       pp.endereco,
      'sala_id',        pp.sala_id,
      'sala_nome',      r.nome,
      'contrato',       pp.contrato,
      'salario',        pp.salario,
      'valor_consulta', pp.valor_consulta,
      'nivel',          pp.nivel,
      'cargo',          pp.cargo,
      'horarios',       pp.horarios,
      'skills',         pp.skills,
      'commissions',    pp.commissions,
      'goals',          pp.goals,
      'observacoes',    pp.observacoes,
      -- Integracao com Usuarios
      'email',          pp.email,
      'user_id',        pp.user_id,
      'user_email',     au.email,
      'user_role',      pr.role,
      'user_active',    pr.is_active,
      'invite_status',  CASE
        WHEN pp.user_id IS NOT NULL AND pr.is_active = true THEN 'active'
        WHEN pp.user_id IS NOT NULL AND pr.is_active = false THEN 'inactive'
        WHEN EXISTS (
          SELECT 1 FROM public.clinic_invitations ci
          WHERE ci.clinic_id = pp.clinic_id
            AND ci.accepted_at IS NULL
            AND ci.expires_at > NOW()
            AND (ci.professional_id = pp.id
                 OR (pp.email IS NOT NULL AND lower(ci.email) = lower(pp.email)))
        ) THEN 'pending'
        ELSE 'none'
      END,
      'tecnologias',    COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',        ct.id,
            'nome',      ct.nome,
            'categoria', ct.categoria
          )
          ORDER BY lower(ct.nome)
        )
        FROM public.professional_technologies pt
        JOIN public.clinic_technologies       ct ON ct.id = pt.technology_id
        WHERE pt.professional_id = pp.id
          AND ct.ativo = true
      ), '[]'::jsonb),
      'is_active',  pp.is_active,
      'created_at', pp.created_at,
      'updated_at', pp.updated_at
    )
    ORDER BY lower(pp.display_name)
  )
  INTO v_rows
  FROM public.professional_profiles pp
  LEFT JOIN public.clinic_rooms      r  ON r.id  = pp.sala_id
  LEFT JOIN auth.users               au ON au.id = pp.user_id
  LEFT JOIN public.profiles          pr ON pr.id = pp.user_id
  WHERE pp.clinic_id = v_clinic_id
    AND pp.is_active  = true;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_professionals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_professionals() TO authenticated;

-- ── 3. upsert_professional — aceita p_email ───────────────────

DROP FUNCTION IF EXISTS public.upsert_professional(
  uuid, text, text, text, text, text,
  text, text, text, date, jsonb, jsonb, jsonb,
  text, numeric, text, text, jsonb, jsonb, text,
  uuid, uuid, numeric
);

CREATE OR REPLACE FUNCTION public.upsert_professional(
  p_id             uuid    DEFAULT NULL,
  p_display_name   text    DEFAULT NULL,
  p_specialty      text    DEFAULT NULL,
  p_crm            text    DEFAULT NULL,
  p_color          text    DEFAULT '#7C3AED',
  p_bio            text    DEFAULT NULL,
  p_telefone       text    DEFAULT NULL,
  p_whatsapp       text    DEFAULT NULL,
  p_cpf            text    DEFAULT NULL,
  p_nascimento     date    DEFAULT NULL,
  p_endereco       jsonb   DEFAULT NULL,
  p_horarios       jsonb   DEFAULT NULL,
  p_skills         jsonb   DEFAULT NULL,
  p_contrato       text    DEFAULT NULL,
  p_salario        numeric DEFAULT NULL,
  p_nivel          text    DEFAULT NULL,
  p_cargo          text    DEFAULT NULL,
  p_commissions    jsonb   DEFAULT NULL,
  p_goals          jsonb   DEFAULT NULL,
  p_observacoes    text    DEFAULT NULL,
  p_sala_id        uuid    DEFAULT NULL,
  p_user_id        uuid    DEFAULT NULL,
  p_valor_consulta numeric DEFAULT NULL,
  p_email          text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_role      text;
  v_result_id uuid;
  v_email     text;
BEGIN
  v_clinic_id := app_clinic_id();
  v_role      := app_role();

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Permissão insuficiente: apenas admin ou owner podem gerenciar profissionais';
  END IF;

  IF p_display_name IS NULL OR trim(p_display_name) = '' THEN
    RAISE EXCEPTION 'O nome do profissional é obrigatório';
  END IF;

  v_email := NULLIF(lower(trim(COALESCE(p_email, ''))), '');

  IF p_id IS NULL THEN
    INSERT INTO public.professional_profiles (
      clinic_id,
      display_name, specialty, crm, color, bio,
      telefone, whatsapp, cpf, nascimento, endereco,
      horarios, skills,
      contrato, salario, valor_consulta, nivel, cargo,
      commissions, goals,
      observacoes,
      sala_id, user_id, email
    )
    VALUES (
      v_clinic_id,
      trim(p_display_name), p_specialty, p_crm,
      COALESCE(p_color, '#7C3AED'), p_bio,
      p_telefone, p_whatsapp, p_cpf, p_nascimento,
      COALESCE(p_endereco, '{}'),
      COALESCE(p_horarios, '{}'),
      COALESCE(p_skills, '{}'),
      p_contrato, p_salario, p_valor_consulta,
      COALESCE(p_nivel, 'funcionario'), p_cargo,
      COALESCE(p_commissions, '[]'),
      COALESCE(p_goals, '[]'),
      p_observacoes,
      p_sala_id, p_user_id, v_email
    )
    RETURNING id INTO v_result_id;
  ELSE
    UPDATE public.professional_profiles
    SET
      display_name   = COALESCE(trim(p_display_name), display_name),
      specialty      = COALESCE(p_specialty,    specialty),
      crm            = COALESCE(p_crm,          crm),
      color          = COALESCE(p_color,        color),
      bio            = COALESCE(p_bio,          bio),
      telefone       = COALESCE(p_telefone,     telefone),
      whatsapp       = COALESCE(p_whatsapp,     whatsapp),
      cpf            = COALESCE(p_cpf,          cpf),
      nascimento     = COALESCE(p_nascimento,   nascimento),
      endereco       = CASE WHEN p_endereco IS NOT NULL
                         THEN COALESCE(endereco, '{}') || p_endereco
                         ELSE endereco END,
      horarios       = CASE WHEN p_horarios IS NOT NULL
                         THEN p_horarios
                         ELSE horarios END,
      skills         = CASE WHEN p_skills IS NOT NULL
                         THEN COALESCE(skills, '{}') || p_skills
                         ELSE skills END,
      contrato       = COALESCE(p_contrato,     contrato),
      salario        = COALESCE(p_salario,      salario),
      valor_consulta = COALESCE(p_valor_consulta, valor_consulta),
      nivel          = COALESCE(p_nivel,        nivel),
      cargo          = COALESCE(p_cargo,        cargo),
      commissions    = CASE WHEN p_commissions IS NOT NULL
                         THEN p_commissions
                         ELSE commissions END,
      goals          = CASE WHEN p_goals IS NOT NULL
                         THEN p_goals
                         ELSE goals END,
      observacoes    = COALESCE(p_observacoes,  observacoes),
      sala_id        = p_sala_id,
      user_id        = COALESCE(p_user_id, user_id),
      email          = COALESCE(v_email, email),
      updated_at     = now()
    WHERE id        = p_id
      AND clinic_id = v_clinic_id
    RETURNING id INTO v_result_id;

    IF v_result_id IS NULL THEN
      RAISE EXCEPTION 'Profissional não encontrado ou sem permissão (id=%)', p_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_result_id);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_professional(
  uuid, text, text, text, text, text,
  text, text, text, date, jsonb, jsonb, jsonb,
  text, numeric, text, text, jsonb, jsonb, text,
  uuid, uuid, numeric, text
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_professional(
  uuid, text, text, text, text, text,
  text, text, text, date, jsonb, jsonb, jsonb,
  text, numeric, text, text, jsonb, jsonb, text,
  uuid, uuid, numeric, text
) TO authenticated;

-- ── 4. invite_staff — aceita p_professional_id opcional ───────

DROP FUNCTION IF EXISTS public.invite_staff(text, text, text, text, jsonb);

CREATE OR REPLACE FUNCTION public.invite_staff(
  p_email           text,
  p_role            text,
  p_first_name      text DEFAULT '',
  p_last_name       text DEFAULT '',
  p_permissions     jsonb DEFAULT NULL,
  p_professional_id uuid  DEFAULT NULL
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
  v_norm_email text := lower(trim(p_email));
BEGIN
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

  IF EXISTS (
    SELECT 1 FROM public.profiles p
    JOIN auth.users u ON u.id = p.id
    WHERE lower(u.email) = v_norm_email AND p.clinic_id = v_clinic_id AND p.is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'already_member');
  END IF;

  -- Reaproveita convite pendente para o mesmo email+clinic (sem duplicar)
  UPDATE public.clinic_invitations
  SET accepted_at = NOW(), expires_at = NOW()
  WHERE clinic_id = v_clinic_id
    AND lower(email) = v_norm_email
    AND accepted_at IS NULL;

  -- Valida professional_id pertence a esta clinica
  IF p_professional_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.professional_profiles
    WHERE id = p_professional_id AND clinic_id = v_clinic_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'professional_not_found');
  END IF;

  v_raw_token  := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(sha256(v_raw_token::bytea), 'hex');

  INSERT INTO public.clinic_invitations (
    clinic_id, email, role, token_hash, invited_by, module_permissions, professional_id
  )
  VALUES (
    v_clinic_id, v_norm_email, p_role, v_token_hash, v_caller, p_permissions, p_professional_id
  )
  RETURNING id INTO v_invite_id;

  RETURN jsonb_build_object(
    'ok',              true,
    'invite_id',       v_invite_id,
    'email',           v_norm_email,
    'role',            p_role,
    'raw_token',       v_raw_token,
    'professional_id', p_professional_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_staff(text, text, text, text, jsonb, uuid) TO authenticated;

-- ── 5. accept_invitation — linka professional_id ──────────────

DROP FUNCTION IF EXISTS public.accept_invitation(text);

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
  v_prof_id    uuid;
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

  INSERT INTO public.profiles (id, clinic_id, role, first_name, last_name)
  VALUES (auth.uid(), v_inv.clinic_id, v_inv.role, '', '');

  UPDATE public.clinic_invitations
  SET accepted_at = NOW()
  WHERE id = v_inv.id;

  -- Vincula ao professional_profiles:
  -- 1) Se o convite tem professional_id explicito, usa ele.
  -- 2) Caso contrario, tenta casar por email na mesma clinica.
  v_prof_id := v_inv.professional_id;
  IF v_prof_id IS NULL THEN
    SELECT id INTO v_prof_id
    FROM   public.professional_profiles
    WHERE  clinic_id = v_inv.clinic_id
      AND  is_active = true
      AND  email IS NOT NULL
      AND  lower(email) = v_inv.email
      AND  user_id IS NULL
    LIMIT 1;
  END IF;

  IF v_prof_id IS NOT NULL THEN
    UPDATE public.professional_profiles
    SET user_id = auth.uid(), updated_at = now()
    WHERE id = v_prof_id AND clinic_id = v_inv.clinic_id;
  END IF;

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
    'ok',              true,
    'role',            v_inv.role,
    'clinic_id',       v_inv.clinic_id,
    'professional_id', v_prof_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.accept_invitation(text) TO authenticated;

-- ── 6. invite_professional_as_user — wrapper da tela Equipe ───

CREATE OR REPLACE FUNCTION public.invite_professional_as_user(
  p_professional_id uuid,
  p_email           text,
  p_role            text,
  p_permissions     jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := public.app_clinic_id();
  v_norm_email text := lower(trim(COALESCE(p_email, '')));
  v_prof_name  text;
  v_has_user   uuid;
  v_invite     jsonb;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  IF v_norm_email = '' OR v_norm_email NOT LIKE '%@%' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_email');
  END IF;

  SELECT display_name, user_id INTO v_prof_name, v_has_user
  FROM public.professional_profiles
  WHERE id = p_professional_id AND clinic_id = v_clinic_id AND is_active = true;

  IF v_prof_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'professional_not_found');
  END IF;

  IF v_has_user IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'professional_already_linked');
  END IF;

  -- Persiste o email no professional_profiles caso esteja vazio
  UPDATE public.professional_profiles
  SET email = COALESCE(email, v_norm_email), updated_at = now()
  WHERE id = p_professional_id AND clinic_id = v_clinic_id;

  -- Delega a invite_staff com professional_id vinculado
  v_invite := public.invite_staff(
    v_norm_email,
    p_role,
    split_part(v_prof_name, ' ', 1),
    NULLIF(substring(v_prof_name from position(' ' in v_prof_name) + 1), ''),
    p_permissions,
    p_professional_id
  );

  RETURN v_invite;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invite_professional_as_user(uuid, text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.invite_professional_as_user IS
  'Convida profissional existente como usuario. Persiste email no profissional e vincula user_id ao aceitar.';
COMMENT ON FUNCTION public.invite_staff IS
  'Convida membro com permissoes opcionais. professional_id opcional linka ao aceitar.';
COMMENT ON FUNCTION public.accept_invitation IS
  'Aceita convite, cria profile, copia permissoes e vincula professional_profiles.user_id.';

-- ============================================================
-- VERIFICACAO:
-- SELECT jsonb_pretty(get_professionals());
-- SELECT invite_professional_as_user('<prof-uuid>', 'x@y.com', 'therapist', '[]'::jsonb);
-- ============================================================
