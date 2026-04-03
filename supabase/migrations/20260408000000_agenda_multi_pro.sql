-- =============================================================================
-- Sprint 3 - Agenda Multi-Profissional
--
-- Cria:
--   1. professional_profiles  — dados clínicos de profissionais registrados
--   2. agenda_visibility      — controla quem pode ver/editar a agenda de quem
--   3. RPC list_visible_professionals  — profissionais acessíveis ao usuário atual
--   4. RPC list_all_professionals      — todos os profissionais (admin/owner)
--   5. RPC set_agenda_visibility       — concede ou revoga acesso
--   6. RPC list_agenda_grants          — quem tem acesso à agenda de um profissional
--   7. RPC upsert_professional_profile — cria/atualiza perfil clínico
--
-- Regras de visibilidade:
--   owner / admin       => veem TODOS os profissionais com permissão 'edit'
--   receptionist        => veem TODOS com permissão 'edit' (precisam agendar por qualquer um)
--   therapist           => vê a PRÓPRIA agenda (edit) + o que for compartilhado explicitamente
--   viewer              => vê APENAS o que for compartilhado explicitamente (só 'view')
-- =============================================================================


-- -----------------------------------------------------------------------------
-- TABELA: professional_profiles
-- Opt-in: um usuário se torna profissional ao ter linha nesta tabela.
-- Vincula profiles.id ao perfil clínico (especialidade, CRM, cor na agenda).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.professional_profiles (
  id           uuid        PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  clinic_id    uuid        NOT NULL,
  display_name text        NOT NULL,
  specialty    text,
  crm          text,
  color        text        NOT NULL DEFAULT '#7C3AED',
  bio          text,
  is_active    boolean     NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prof_profiles_clinic_idx ON public.professional_profiles (clinic_id, is_active);


-- -----------------------------------------------------------------------------
-- TABELA: agenda_visibility
-- Registra quem pode ver (view) ou editar (edit) a agenda de cada profissional.
-- Apenas necessário para therapist e viewer — admin/owner/receptionist tem acesso
-- implícito via RPC (sem linha nesta tabela).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.agenda_visibility (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid        NOT NULL,
  owner_id    uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  viewer_id   uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  permission  text        NOT NULL DEFAULT 'view'
                          CHECK (permission IN ('view', 'edit')),
  granted_by  uuid        REFERENCES public.profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, owner_id, viewer_id)
);

CREATE INDEX IF NOT EXISTS agenda_vis_viewer_idx ON public.agenda_visibility (clinic_id, viewer_id);
CREATE INDEX IF NOT EXISTS agenda_vis_owner_idx  ON public.agenda_visibility (clinic_id, owner_id);


-- -----------------------------------------------------------------------------
-- RLS: professional_profiles
-- Qualquer membro autenticado da clínica pode ler.
-- Apenas admin/owner ou o próprio profissional podem escrever.
-- -----------------------------------------------------------------------------
ALTER TABLE public.professional_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pp_select" ON public.professional_profiles;
CREATE POLICY "pp_select" ON public.professional_profiles
  FOR SELECT USING (clinic_id = public.app_clinic_id());

DROP POLICY IF EXISTS "pp_insert" ON public.professional_profiles;
CREATE POLICY "pp_insert" ON public.professional_profiles
  FOR INSERT WITH CHECK (
    clinic_id = public.app_clinic_id()
    AND (
      public.app_role() IN ('owner', 'admin')
      OR id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pp_update" ON public.professional_profiles;
CREATE POLICY "pp_update" ON public.professional_profiles
  FOR UPDATE USING (
    clinic_id = public.app_clinic_id()
    AND (
      public.app_role() IN ('owner', 'admin')
      OR id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "pp_delete" ON public.professional_profiles;
CREATE POLICY "pp_delete" ON public.professional_profiles
  FOR DELETE USING (
    clinic_id = public.app_clinic_id()
    AND public.app_role() IN ('owner', 'admin')
  );


-- -----------------------------------------------------------------------------
-- RLS: agenda_visibility
-- Leitura: admin/owner, ou o owner/viewer envolvidos na linha.
-- Escrita: via RPCs com SECURITY DEFINER (não exposta diretamente).
-- -----------------------------------------------------------------------------
ALTER TABLE public.agenda_visibility ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "av_select" ON public.agenda_visibility;
CREATE POLICY "av_select" ON public.agenda_visibility
  FOR SELECT USING (
    clinic_id = public.app_clinic_id()
    AND (
      public.app_role() IN ('owner', 'admin')
      OR owner_id  = auth.uid()
      OR viewer_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "av_insert" ON public.agenda_visibility;
CREATE POLICY "av_insert" ON public.agenda_visibility
  FOR INSERT WITH CHECK (false);  -- apenas via RPCs

DROP POLICY IF EXISTS "av_update" ON public.agenda_visibility;
CREATE POLICY "av_update" ON public.agenda_visibility
  FOR UPDATE USING (false);

DROP POLICY IF EXISTS "av_delete" ON public.agenda_visibility;
CREATE POLICY "av_delete" ON public.agenda_visibility
  FOR DELETE USING (false);


-- =============================================================================
-- RPCs
-- =============================================================================


-- -----------------------------------------------------------------------------
-- list_visible_professionals
-- Retorna os profissionais que o usuário atual pode ver na agenda,
-- junto com a permissão efetiva (view | edit).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_visible_professionals()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public.app_clinic_id();
  v_uid       uuid := auth.uid();
  v_role      text := public.app_role();
  v_result    jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clinic_not_found');
  END IF;

  -- owner / admin / receptionist => acesso total com permissao 'edit'
  IF v_role IN ('owner', 'admin', 'receptionist') THEN
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',           pp.id,
        'display_name', pp.display_name,
        'specialty',    pp.specialty,
        'crm',          pp.crm,
        'color',        pp.color,
        'bio',          pp.bio,
        'permission',   'edit',
        'is_self',      (pp.id = v_uid)
      )
      ORDER BY (pp.id = v_uid) DESC, lower(pp.display_name)
    )
    INTO v_result
    FROM public.professional_profiles pp
    WHERE pp.clinic_id = v_clinic_id
      AND pp.is_active  = true;

  -- therapist => própria agenda (edit) + explicitamente compartilhadas
  -- viewer    => apenas explicitamente compartilhadas
  ELSE
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',           pp.id,
        'display_name', pp.display_name,
        'specialty',    pp.specialty,
        'crm',          pp.crm,
        'color',        pp.color,
        'bio',          pp.bio,
        'permission',   CASE
                          WHEN pp.id = v_uid THEN 'edit'
                          ELSE av.permission
                        END,
        'is_self',      (pp.id = v_uid)
      )
      ORDER BY (pp.id = v_uid) DESC, lower(pp.display_name)
    )
    INTO v_result
    FROM public.professional_profiles pp
    LEFT JOIN public.agenda_visibility av
           ON av.owner_id  = pp.id
          AND av.viewer_id = v_uid
          AND av.clinic_id = v_clinic_id
    WHERE pp.clinic_id = v_clinic_id
      AND pp.is_active  = true
      AND (
        pp.id = v_uid          -- própria agenda
        OR av.id IS NOT NULL   -- explicitamente compartilhada
      );
  END IF;

  RETURN jsonb_build_object(
    'ok',   true,
    'data', coalesce(v_result, '[]'::jsonb)
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.list_visible_professionals() TO authenticated;


-- -----------------------------------------------------------------------------
-- list_all_professionals
-- Retorna TODOS os profissionais da clínica (admin/owner).
-- Usado no painel de configuração de visibilidade.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_all_professionals()
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
      'id',           pp.id,
      'display_name', pp.display_name,
      'specialty',    pp.specialty,
      'crm',          pp.crm,
      'color',        pp.color,
      'is_active',    pp.is_active
    )
    ORDER BY lower(pp.display_name)
  )
  INTO v_result
  FROM public.professional_profiles pp
  WHERE pp.clinic_id = v_clinic_id;

  RETURN jsonb_build_object(
    'ok',   true,
    'data', coalesce(v_result, '[]'::jsonb)
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.list_all_professionals() TO authenticated;


-- -----------------------------------------------------------------------------
-- list_agenda_grants
-- Retorna quem tem acesso à agenda de um profissional específico.
-- Permitido para: admin/owner, ou o próprio profissional (owner_id = caller).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_agenda_grants(p_owner_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public.app_clinic_id();
  v_result    jsonb;
BEGIN
  -- Apenas admin/owner ou o próprio profissional podem consultar
  IF public.app_role() NOT IN ('owner', 'admin') AND auth.uid() != p_owner_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'grant_id',    av.id,
      'viewer_id',   av.viewer_id,
      'viewer_name', coalesce(pp.display_name, p.first_name || ' ' || p.last_name),
      'viewer_role', pr.role,
      'permission',  av.permission,
      'created_at',  av.created_at
    )
    ORDER BY lower(coalesce(pp.display_name, p.first_name || ' ' || p.last_name))
  )
  INTO v_result
  FROM public.agenda_visibility av
  JOIN public.profiles pr ON pr.id = av.viewer_id
  JOIN auth.users p        ON p.id  = av.viewer_id  -- auth.users para fallback de nome
  LEFT JOIN public.professional_profiles pp ON pp.id = av.viewer_id AND pp.clinic_id = v_clinic_id
  WHERE av.clinic_id = v_clinic_id
    AND av.owner_id  = p_owner_id;

  RETURN jsonb_build_object(
    'ok',   true,
    'data', coalesce(v_result, '[]'::jsonb)
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.list_agenda_grants(uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- set_agenda_visibility
-- Concede ou revoga acesso à agenda de um profissional.
--
-- p_permission = 'view'  => acesso somente leitura
-- p_permission = 'edit'  => pode criar/mover agendamentos
-- p_permission = 'none'  => revoga qualquer acesso existente
--
-- Quem pode chamar:
--   admin / owner   => pode configurar para qualquer par
--   therapist       => pode compartilhar APENAS sua própria agenda
--   receptionist / viewer => bloqueado
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_agenda_visibility(
  p_owner_id   uuid,
  p_viewer_id  uuid,
  p_permission text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id   uuid := public.app_clinic_id();
  v_role        text := public.app_role();
  v_viewer_role text;
BEGIN
  -- Validação de permissão do chamador
  IF v_role IN ('receptionist', 'viewer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  -- Therapist só pode compartilhar a própria agenda
  IF v_role = 'therapist' AND auth.uid() != p_owner_id THEN
    RETURN jsonb_build_object('ok', false, 'error', 'can_only_share_own_agenda');
  END IF;

  -- Validação dos valores permitidos
  IF p_permission NOT IN ('view', 'edit', 'none') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_permission');
  END IF;

  -- owner/admin nunca precisam de entrada explícita (acesso implícito)
  -- Não cria linha para evitar ruído na tabela
  IF p_permission != 'none' THEN
    SELECT role INTO v_viewer_role
    FROM public.profiles
    WHERE id = p_viewer_id AND clinic_id = v_clinic_id;

    IF v_viewer_role IN ('owner', 'admin') THEN
      RETURN jsonb_build_object('ok', true, 'note', 'admin_owner_have_implicit_access');
    END IF;
  END IF;

  IF p_permission = 'none' THEN
    DELETE FROM public.agenda_visibility
    WHERE clinic_id = v_clinic_id
      AND owner_id  = p_owner_id
      AND viewer_id = p_viewer_id;
  ELSE
    INSERT INTO public.agenda_visibility (clinic_id, owner_id, viewer_id, permission, granted_by)
    VALUES (v_clinic_id, p_owner_id, p_viewer_id, p_permission, auth.uid())
    ON CONFLICT (clinic_id, owner_id, viewer_id)
    DO UPDATE SET
      permission = EXCLUDED.permission,
      granted_by = EXCLUDED.granted_by;
  END IF;

  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.set_agenda_visibility(uuid, uuid, text) TO authenticated;


-- -----------------------------------------------------------------------------
-- upsert_professional_profile
-- Cria ou atualiza o perfil clínico de um profissional.
-- Qualquer usuário autenticado pode criar/atualizar o PRÓPRIO perfil.
-- Admin/owner podem criar/atualizar o perfil de qualquer membro da clínica.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_professional_profile(
  p_target_id   uuid     DEFAULT NULL,  -- NULL = próprio usuário
  p_display_name text    DEFAULT NULL,
  p_specialty   text     DEFAULT NULL,
  p_crm         text     DEFAULT NULL,
  p_color       text     DEFAULT '#7C3AED',
  p_bio         text     DEFAULT NULL,
  p_is_active   boolean  DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public.app_clinic_id();
  v_uid       uuid := auth.uid();
  v_target    uuid := coalesce(p_target_id, v_uid);
  v_name      text;
BEGIN
  -- Não pode gerenciar perfil de outro usuário se não for admin/owner
  IF v_target != v_uid AND public.app_role() NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  -- Target deve ser membro ativo da clínica
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = v_target AND clinic_id = v_clinic_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'user_not_found');
  END IF;

  -- display_name fallback: nome do perfil
  IF p_display_name IS NULL OR trim(p_display_name) = '' THEN
    SELECT coalesce(trim(first_name || ' ' || last_name), '') INTO v_name
    FROM public.profiles WHERE id = v_target;
  ELSE
    v_name := trim(p_display_name);
  END IF;

  INSERT INTO public.professional_profiles
    (id, clinic_id, display_name, specialty, crm, color, bio, is_active)
  VALUES
    (v_target, v_clinic_id, v_name,
     p_specialty, p_crm, coalesce(p_color, '#7C3AED'), p_bio, p_is_active)
  ON CONFLICT (id) DO UPDATE SET
    display_name = EXCLUDED.display_name,
    specialty    = EXCLUDED.specialty,
    crm          = EXCLUDED.crm,
    color        = EXCLUDED.color,
    bio          = EXCLUDED.bio,
    is_active    = EXCLUDED.is_active,
    updated_at   = now();

  RETURN jsonb_build_object('ok', true, 'id', v_target);
END; $$;
GRANT EXECUTE ON FUNCTION public.upsert_professional_profile(uuid, text, text, text, text, text, boolean) TO authenticated;
