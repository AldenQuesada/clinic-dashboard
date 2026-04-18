-- ============================================================
-- Migration: professional_profiles → agenda_enabled flag
-- ============================================================
-- Adiciona coluna agenda_enabled — controla se o profissional
-- tem espaco proprio na agenda (colunas da vista dia + aparece
-- como opcao no modal de agendamento). Membros que nao atendem
-- (social media, administrativo etc.) ficam agenda_enabled=false.
--
-- Default: true — cadastros existentes seguem aparecendo.
-- ============================================================

ALTER TABLE public.professional_profiles
  ADD COLUMN IF NOT EXISTS agenda_enabled boolean NOT NULL DEFAULT true;

-- ── RPC: get_professionals (acrescenta agenda_enabled) ──────

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
      'agenda_enabled', pp.agenda_enabled,
      'nivel',          pp.nivel,
      'cargo',          pp.cargo,
      'horarios',       pp.horarios,
      'skills',         pp.skills,
      'commissions',    pp.commissions,
      'goals',          pp.goals,
      'observacoes',    pp.observacoes,
      'user_id',        pp.user_id,
      'email',          pp.email,
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
  LEFT JOIN public.clinic_rooms      r ON r.id = pp.sala_id
  WHERE pp.clinic_id = v_clinic_id
    AND pp.is_active  = true;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_professionals() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_professionals() TO authenticated;

-- ── RPC: upsert_professional (acrescenta p_agenda_enabled) ──

DROP FUNCTION IF EXISTS public.upsert_professional(
  uuid, text, text, text, text, text,
  text, text, text, date, jsonb, jsonb, jsonb,
  text, numeric, text, text, jsonb, jsonb, text,
  uuid, uuid, numeric, text
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
  p_email          text    DEFAULT NULL,
  p_agenda_enabled boolean DEFAULT NULL
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
      sala_id, user_id, email, agenda_enabled
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
      p_sala_id, p_user_id, v_email,
      COALESCE(p_agenda_enabled, true)
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
      agenda_enabled = COALESCE(p_agenda_enabled, agenda_enabled),
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
  uuid, uuid, numeric, text, boolean
) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.upsert_professional(
  uuid, text, text, text, text, text,
  text, text, text, date, jsonb, jsonb, jsonb,
  text, numeric, text, text, jsonb, jsonb, text,
  uuid, uuid, numeric, text, boolean
) TO authenticated;
