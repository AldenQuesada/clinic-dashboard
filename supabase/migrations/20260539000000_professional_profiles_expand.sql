-- ============================================================
-- Migration: 20260539000000 — professional_profiles_expand
--
-- Expande professional_profiles com campos de RH, agenda,
-- comissões e metas. Cria RPCs ricas para uso em captação,
-- agendamento e gestão de equipe.
--
-- Alterações:  ALTER TABLE professional_profiles ADD COLUMN IF NOT EXISTS ...
-- RPCs:        get_professionals, upsert_professional, soft_delete_professional
-- ============================================================

-- ── Expand: professional_profiles ────────────────────────────

ALTER TABLE public.professional_profiles
  ADD COLUMN IF NOT EXISTS user_id      uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sala_id      uuid        REFERENCES public.clinic_rooms(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS telefone     text,
  ADD COLUMN IF NOT EXISTS whatsapp     text,
  ADD COLUMN IF NOT EXISTS cpf          text,
  ADD COLUMN IF NOT EXISTS nascimento   date,
  ADD COLUMN IF NOT EXISTS endereco     jsonb       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS horarios     jsonb       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS skills       jsonb       NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS contrato     text,
  ADD COLUMN IF NOT EXISTS salario      numeric(12,2),
  ADD COLUMN IF NOT EXISTS nivel        text        NOT NULL DEFAULT 'funcionario',
  ADD COLUMN IF NOT EXISTS cargo        text,
  ADD COLUMN IF NOT EXISTS commissions  jsonb       NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS goals        jsonb       NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS observacoes  text;

-- ── Indexes novos ─────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_prof_profiles_user
  ON public.professional_profiles (user_id);

CREATE INDEX IF NOT EXISTS idx_prof_profiles_sala
  ON public.professional_profiles (sala_id);

-- ── RPC: get_professionals ────────────────────────────────────

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
      -- Identificação
      'id',           pp.id,
      'display_name', pp.display_name,
      'specialty',    pp.specialty,
      'crm',          pp.crm,
      'color',        pp.color,
      'bio',          pp.bio,
      -- Contato
      'telefone',     pp.telefone,
      'whatsapp',     pp.whatsapp,
      'phone',        pp.phone,
      -- Pessoal
      'cpf',          pp.cpf,
      'nascimento',   pp.nascimento,
      'endereco',     pp.endereco,
      -- Vínculo de sala
      'sala_id',      pp.sala_id,
      'sala_nome',    r.nome,
      -- RH / contratual
      'contrato',     pp.contrato,
      'salario',      pp.salario,
      'nivel',        pp.nivel,
      'cargo',        pp.cargo,
      -- Configurações de trabalho
      'horarios',     pp.horarios,
      'skills',       pp.skills,
      -- Comercial
      'commissions',  pp.commissions,
      'goals',        pp.goals,
      -- Observações
      'observacoes',  pp.observacoes,
      -- Vínculo de usuário
      'user_id',      pp.user_id,
      -- Tecnologias operadas
      'tecnologias',  COALESCE((
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
      -- Status e datas
      'is_active',    pp.is_active,
      'created_at',   pp.created_at,
      'updated_at',   pp.updated_at
    )
    ORDER BY lower(pp.display_name)
  )
  INTO v_rows
  FROM public.professional_profiles pp
  LEFT JOIN public.clinic_rooms      r ON r.id = pp.sala_id
  WHERE pp.clinic_id = v_clinic_id
    AND pp.is_active  = true;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_professionals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_professionals() TO authenticated;

-- ── RPC: upsert_professional ──────────────────────────────────

DROP FUNCTION IF EXISTS public.upsert_professional(
  uuid, text, text, text, text, text,
  text, text, text, date, jsonb, jsonb, jsonb,
  text, numeric, text, text, jsonb, jsonb, text,
  uuid, uuid
);

CREATE OR REPLACE FUNCTION public.upsert_professional(
  p_id           uuid    DEFAULT NULL,
  p_display_name text    DEFAULT NULL,
  p_specialty    text    DEFAULT NULL,
  p_crm          text    DEFAULT NULL,
  p_color        text    DEFAULT '#7C3AED',
  p_bio          text    DEFAULT NULL,
  -- Contato
  p_telefone     text    DEFAULT NULL,
  p_whatsapp     text    DEFAULT NULL,
  p_cpf          text    DEFAULT NULL,
  p_nascimento   date    DEFAULT NULL,
  p_endereco     jsonb   DEFAULT NULL,
  -- Agenda e competências
  p_horarios     jsonb   DEFAULT NULL,
  p_skills       jsonb   DEFAULT NULL,
  -- RH
  p_contrato     text    DEFAULT NULL,
  p_salario      numeric DEFAULT NULL,
  p_nivel        text    DEFAULT NULL,
  p_cargo        text    DEFAULT NULL,
  -- Comercial
  p_commissions  jsonb   DEFAULT NULL,
  p_goals        jsonb   DEFAULT NULL,
  -- Extra
  p_observacoes  text    DEFAULT NULL,
  p_sala_id      uuid    DEFAULT NULL,
  p_user_id      uuid    DEFAULT NULL
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
    RAISE EXCEPTION 'Permissão insuficiente: apenas admin ou owner podem gerenciar profissionais';
  END IF;

  IF p_display_name IS NULL OR trim(p_display_name) = '' THEN
    RAISE EXCEPTION 'O nome do profissional é obrigatório';
  END IF;

  IF p_id IS NULL THEN
    -- INSERT
    INSERT INTO public.professional_profiles (
      clinic_id,
      display_name, specialty, crm, color, bio,
      telefone, whatsapp, cpf, nascimento, endereco,
      horarios, skills,
      contrato, salario, nivel, cargo,
      commissions, goals,
      observacoes,
      sala_id, user_id
    )
    VALUES (
      v_clinic_id,
      trim(p_display_name), p_specialty, p_crm,
      COALESCE(p_color, '#7C3AED'), p_bio,
      p_telefone, p_whatsapp, p_cpf, p_nascimento,
      COALESCE(p_endereco, '{}'),
      COALESCE(p_horarios, '{}'),
      COALESCE(p_skills, '{}'),
      p_contrato, p_salario,
      COALESCE(p_nivel, 'funcionario'), p_cargo,
      COALESCE(p_commissions, '[]'),
      COALESCE(p_goals, '[]'),
      p_observacoes,
      p_sala_id, p_user_id
    )
    RETURNING id INTO v_result_id;
  ELSE
    -- UPDATE por id + clinic_id
    UPDATE public.professional_profiles
    SET
      display_name = COALESCE(trim(p_display_name), display_name),
      specialty    = COALESCE(p_specialty,   specialty),
      crm          = COALESCE(p_crm,         crm),
      color        = COALESCE(p_color,       color),
      bio          = COALESCE(p_bio,         bio),
      telefone     = COALESCE(p_telefone,    telefone),
      whatsapp     = COALESCE(p_whatsapp,    whatsapp),
      cpf          = COALESCE(p_cpf,         cpf),
      nascimento   = COALESCE(p_nascimento,  nascimento),
      endereco     = CASE WHEN p_endereco IS NOT NULL
                       THEN COALESCE(endereco, '{}') || p_endereco
                       ELSE endereco END,
      horarios     = CASE WHEN p_horarios IS NOT NULL
                       THEN p_horarios
                       ELSE horarios END,
      skills       = CASE WHEN p_skills IS NOT NULL
                       THEN COALESCE(skills, '{}') || p_skills
                       ELSE skills END,
      contrato     = COALESCE(p_contrato,    contrato),
      salario      = COALESCE(p_salario,     salario),
      nivel        = COALESCE(p_nivel,       nivel),
      cargo        = COALESCE(p_cargo,       cargo),
      commissions  = CASE WHEN p_commissions IS NOT NULL
                       THEN p_commissions
                       ELSE commissions END,
      goals        = CASE WHEN p_goals IS NOT NULL
                       THEN p_goals
                       ELSE goals END,
      observacoes  = COALESCE(p_observacoes, observacoes),
      sala_id      = p_sala_id,   -- NULL é intencional (desvincular sala)
      user_id      = COALESCE(p_user_id, user_id),
      updated_at   = now()
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
  uuid, uuid
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_professional(
  uuid, text, text, text, text, text,
  text, text, text, date, jsonb, jsonb, jsonb,
  text, numeric, text, text, jsonb, jsonb, text,
  uuid, uuid
) TO authenticated;

-- ── RPC: soft_delete_professional ────────────────────────────

DROP FUNCTION IF EXISTS public.soft_delete_professional(uuid);

CREATE OR REPLACE FUNCTION public.soft_delete_professional(
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
    RAISE EXCEPTION 'Permissão insuficiente: apenas admin ou owner podem desativar profissionais';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'O id do profissional é obrigatório';
  END IF;

  -- Verifica que o profissional pertence à clínica
  IF NOT EXISTS (
    SELECT 1 FROM public.professional_profiles
    WHERE id = p_id AND clinic_id = v_clinic_id
  ) THEN
    RAISE EXCEPTION 'Profissional não encontrado ou sem permissão (id=%)', p_id;
  END IF;

  -- Remove vínculos com tecnologias
  DELETE FROM public.professional_technologies
  WHERE professional_id = p_id;

  -- Soft delete do profissional
  UPDATE public.professional_profiles
  SET
    is_active  = false,
    updated_at = now()
  WHERE id        = p_id
    AND clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_professional(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_professional(uuid) TO authenticated;

-- ============================================================
-- VERIFICAÇÃO:
-- SELECT get_professionals();
-- SELECT upsert_professional(NULL, 'Dra. Ana Lima', 'Dermatologia', 'CRM12345');
-- SELECT soft_delete_professional('<uuid>');
-- ============================================================
