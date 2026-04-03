-- ============================================================
-- Migration: 20260538000000 — clinic_technologies
--
-- Tabelas de tecnologias/equipamentos da clínica e vínculo
-- M:N com profissionais operadores.
--
-- Tabelas:  clinic_technologies, professional_technologies
-- RPCs:     get_technologies, upsert_technology,
--           set_professional_technologies, soft_delete_technology
-- ============================================================

-- ── Tabela: clinic_technologies ───────────────────────────────

CREATE TABLE IF NOT EXISTS public.clinic_technologies (
  id           uuid          NOT NULL DEFAULT gen_random_uuid(),
  clinic_id    uuid          NOT NULL,
  sala_id      uuid          REFERENCES public.clinic_rooms(id) ON DELETE SET NULL,
  nome         text          NOT NULL,
  categoria    text,
  fabricante   text,
  modelo       text,
  descricao    text,
  ano          int,
  investimento numeric(12,2),
  ponteiras    text,
  ativo        boolean       NOT NULL DEFAULT true,
  created_at   timestamptz   NOT NULL DEFAULT now(),
  updated_at   timestamptz   NOT NULL DEFAULT now(),

  CONSTRAINT clinic_technologies_pkey PRIMARY KEY (id),
  CONSTRAINT clinic_technologies_clinic_nome_unique UNIQUE (clinic_id, nome)
);

-- ── Tabela: professional_technologies (M:N) ───────────────────

CREATE TABLE IF NOT EXISTS public.professional_technologies (
  professional_id uuid NOT NULL REFERENCES public.professional_profiles(id) ON DELETE CASCADE,
  technology_id   uuid NOT NULL REFERENCES public.clinic_technologies(id)   ON DELETE CASCADE,

  CONSTRAINT professional_technologies_pkey PRIMARY KEY (professional_id, technology_id)
);

-- ── Indexes: clinic_technologies ──────────────────────────────

CREATE INDEX IF NOT EXISTS idx_clinic_tech_clinic
  ON public.clinic_technologies (clinic_id);

CREATE INDEX IF NOT EXISTS idx_clinic_tech_ativo
  ON public.clinic_technologies (clinic_id, ativo);

CREATE INDEX IF NOT EXISTS idx_clinic_tech_sala
  ON public.clinic_technologies (sala_id);

-- ── Indexes: professional_technologies ───────────────────────

CREATE INDEX IF NOT EXISTS idx_prof_tech_prof
  ON public.professional_technologies (professional_id);

CREATE INDEX IF NOT EXISTS idx_prof_tech_tech
  ON public.professional_technologies (technology_id);

-- ── Trigger updated_at ────────────────────────────────────────

CREATE TRIGGER clinic_technologies_updated_at
  BEFORE UPDATE ON public.clinic_technologies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── RLS: clinic_technologies ──────────────────────────────────

ALTER TABLE public.clinic_technologies ENABLE ROW LEVEL SECURITY;

-- SELECT: autenticado da mesma clínica
CREATE POLICY tech_select ON public.clinic_technologies
  FOR SELECT
  TO authenticated
  USING (clinic_id = app_clinic_id());

-- INSERT/UPDATE/DELETE: somente admin/owner
CREATE POLICY tech_admin_write ON public.clinic_technologies
  FOR ALL
  TO authenticated
  USING (
    clinic_id = app_clinic_id()
    AND app_role() IN ('admin', 'owner')
  )
  WITH CHECK (
    clinic_id = app_clinic_id()
    AND app_role() IN ('admin', 'owner')
  );

-- ── RLS: professional_technologies ───────────────────────────

ALTER TABLE public.professional_technologies ENABLE ROW LEVEL SECURITY;

-- SELECT: autenticado (verifica clinic_id via join com professional_profiles)
CREATE POLICY prof_tech_select ON public.professional_technologies
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.professional_profiles pp
      WHERE pp.id        = professional_technologies.professional_id
        AND pp.clinic_id = app_clinic_id()
    )
  );

-- INSERT/DELETE: somente admin/owner
CREATE POLICY prof_tech_admin_write ON public.professional_technologies
  FOR ALL
  TO authenticated
  USING (
    app_role() IN ('admin', 'owner')
    AND EXISTS (
      SELECT 1
      FROM public.professional_profiles pp
      WHERE pp.id        = professional_technologies.professional_id
        AND pp.clinic_id = app_clinic_id()
    )
  )
  WITH CHECK (
    app_role() IN ('admin', 'owner')
    AND EXISTS (
      SELECT 1
      FROM public.professional_profiles pp
      WHERE pp.id        = professional_technologies.professional_id
        AND pp.clinic_id = app_clinic_id()
    )
  );

-- ── RPC: get_technologies ─────────────────────────────────────

DROP FUNCTION IF EXISTS public.get_technologies();

CREATE OR REPLACE FUNCTION public.get_technologies()
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
      'id',          t.id,
      'nome',        t.nome,
      'categoria',   t.categoria,
      'fabricante',  t.fabricante,
      'modelo',      t.modelo,
      'descricao',   t.descricao,
      'ano',         t.ano,
      'investimento',t.investimento,
      'ponteiras',   t.ponteiras,
      'sala_id',     t.sala_id,
      'sala_nome',   r.nome,
      'operadores',  COALESCE((
        SELECT jsonb_agg(
          jsonb_build_object(
            'id',   pp.id,
            'nome', pp.display_name
          )
          ORDER BY lower(pp.display_name)
        )
        FROM public.professional_technologies pt
        JOIN public.professional_profiles     pp ON pp.id = pt.professional_id
        WHERE pt.technology_id = t.id
          AND pp.is_active = true
      ), '[]'::jsonb),
      'ativo',       t.ativo,
      'created_at',  t.created_at,
      'updated_at',  t.updated_at
    )
    ORDER BY lower(t.nome)
  )
  INTO v_rows
  FROM public.clinic_technologies t
  LEFT JOIN public.clinic_rooms    r ON r.id = t.sala_id
  WHERE t.clinic_id = v_clinic_id
    AND t.ativo = true;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_technologies() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_technologies() TO authenticated;

-- ── RPC: upsert_technology ────────────────────────────────────

DROP FUNCTION IF EXISTS public.upsert_technology(uuid, text, text, text, text, text, int, numeric, text, uuid);

CREATE OR REPLACE FUNCTION public.upsert_technology(
  p_id          uuid    DEFAULT NULL,
  p_nome        text    DEFAULT NULL,
  p_categoria   text    DEFAULT NULL,
  p_fabricante  text    DEFAULT NULL,
  p_modelo      text    DEFAULT NULL,
  p_descricao   text    DEFAULT NULL,
  p_ano         int     DEFAULT NULL,
  p_investimento numeric DEFAULT NULL,
  p_ponteiras   text    DEFAULT NULL,
  p_sala_id     uuid    DEFAULT NULL
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
    RAISE EXCEPTION 'Permissão insuficiente: apenas admin ou owner podem gerenciar tecnologias';
  END IF;

  IF p_nome IS NULL OR trim(p_nome) = '' THEN
    RAISE EXCEPTION 'O nome da tecnologia é obrigatório';
  END IF;

  IF p_id IS NULL THEN
    -- INSERT
    INSERT INTO public.clinic_technologies (
      clinic_id, nome, categoria, fabricante, modelo,
      descricao, ano, investimento, ponteiras, sala_id
    )
    VALUES (
      v_clinic_id, trim(p_nome), p_categoria, p_fabricante, p_modelo,
      p_descricao, p_ano, p_investimento, p_ponteiras, p_sala_id
    )
    ON CONFLICT (clinic_id, nome)
      DO UPDATE SET
        categoria    = EXCLUDED.categoria,
        fabricante   = EXCLUDED.fabricante,
        modelo       = EXCLUDED.modelo,
        descricao    = EXCLUDED.descricao,
        ano          = EXCLUDED.ano,
        investimento = EXCLUDED.investimento,
        ponteiras    = EXCLUDED.ponteiras,
        sala_id      = EXCLUDED.sala_id,
        updated_at   = now()
    RETURNING id INTO v_result_id;
  ELSE
    -- UPDATE por id + clinic_id
    UPDATE public.clinic_technologies
    SET
      nome         = COALESCE(trim(p_nome),   nome),
      categoria    = COALESCE(p_categoria,    categoria),
      fabricante   = COALESCE(p_fabricante,   fabricante),
      modelo       = COALESCE(p_modelo,       modelo),
      descricao    = COALESCE(p_descricao,    descricao),
      ano          = COALESCE(p_ano,          ano),
      investimento = COALESCE(p_investimento, investimento),
      ponteiras    = COALESCE(p_ponteiras,    ponteiras),
      sala_id      = p_sala_id,   -- NULL é intencional (desvincular sala)
      updated_at   = now()
    WHERE id        = p_id
      AND clinic_id = v_clinic_id
    RETURNING id INTO v_result_id;

    IF v_result_id IS NULL THEN
      RAISE EXCEPTION 'Tecnologia não encontrada ou sem permissão (id=%)', p_id;
    END IF;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_result_id);
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_technology(uuid, text, text, text, text, text, int, numeric, text, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.upsert_technology(uuid, text, text, text, text, text, int, numeric, text, uuid) TO authenticated;

-- ── RPC: set_professional_technologies ───────────────────────

DROP FUNCTION IF EXISTS public.set_professional_technologies(uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.set_professional_technologies(
  p_professional_id uuid,
  p_technology_ids  uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid;
  v_role       text;
  v_tid        uuid;
  v_count      int := 0;
BEGIN
  v_clinic_id := app_clinic_id();
  v_role      := app_role();

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF v_role NOT IN ('admin', 'owner') THEN
    RAISE EXCEPTION 'Permissão insuficiente: apenas admin ou owner podem gerenciar operadores';
  END IF;

  IF p_professional_id IS NULL THEN
    RAISE EXCEPTION 'O id do profissional é obrigatório';
  END IF;

  -- Verifica que o profissional pertence à clínica
  IF NOT EXISTS (
    SELECT 1 FROM public.professional_profiles
    WHERE id = p_professional_id AND clinic_id = v_clinic_id
  ) THEN
    RAISE EXCEPTION 'Profissional não encontrado ou não pertence à clínica (id=%)', p_professional_id;
  END IF;

  -- Remove todos os vínculos existentes
  DELETE FROM public.professional_technologies
  WHERE professional_id = p_professional_id;

  -- Insere os novos vínculos
  IF p_technology_ids IS NOT NULL THEN
    FOREACH v_tid IN ARRAY p_technology_ids LOOP
      -- Verifica que a tecnologia pertence à clínica antes de inserir
      IF EXISTS (
        SELECT 1 FROM public.clinic_technologies
        WHERE id = v_tid AND clinic_id = v_clinic_id AND ativo = true
      ) THEN
        INSERT INTO public.professional_technologies (professional_id, technology_id)
        VALUES (p_professional_id, v_tid)
        ON CONFLICT DO NOTHING;

        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.set_professional_technologies(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_professional_technologies(uuid, uuid[]) TO authenticated;

-- ── RPC: soft_delete_technology ───────────────────────────────

DROP FUNCTION IF EXISTS public.soft_delete_technology(uuid);

CREATE OR REPLACE FUNCTION public.soft_delete_technology(
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
    RAISE EXCEPTION 'Permissão insuficiente: apenas admin ou owner podem excluir tecnologias';
  END IF;

  IF p_id IS NULL THEN
    RAISE EXCEPTION 'O id da tecnologia é obrigatório';
  END IF;

  -- Verifica que a tecnologia pertence à clínica
  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_technologies
    WHERE id = p_id AND clinic_id = v_clinic_id
  ) THEN
    RAISE EXCEPTION 'Tecnologia não encontrada ou sem permissão (id=%)', p_id;
  END IF;

  -- Remove vínculos com profissionais
  DELETE FROM public.professional_technologies
  WHERE technology_id = p_id;

  -- Soft delete da tecnologia
  UPDATE public.clinic_technologies
  SET
    ativo      = false,
    updated_at = now()
  WHERE id        = p_id
    AND clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.soft_delete_technology(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.soft_delete_technology(uuid) TO authenticated;

-- ============================================================
-- VERIFICAÇÃO:
-- SELECT get_technologies();
-- SELECT upsert_technology(NULL, 'Laser CO2', 'Laser', 'Syneron', 'CO2RE');
-- SELECT set_professional_technologies('<prof_uuid>', ARRAY['<tech_uuid>']);
-- SELECT soft_delete_technology('<uuid>');
-- ============================================================
