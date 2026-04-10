-- ============================================================
-- Migration: 20260639000000 — Professional ↔ Procedimentos (M:N)
--
-- Relacao entre profissionais e procedimentos que executam.
-- is_primary = true indica o profissional padrao para TCLE.
-- RPCs: resolve_professional_for_procedure, list, set
-- ============================================================

CREATE TABLE IF NOT EXISTS public.professional_procedimentos (
  professional_id uuid NOT NULL REFERENCES public.professional_profiles(id) ON DELETE CASCADE,
  procedimento_id uuid NOT NULL REFERENCES public.clinic_procedimentos(id) ON DELETE CASCADE,
  clinic_id       uuid NOT NULL DEFAULT app_clinic_id(),
  is_primary      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pp_pkey PRIMARY KEY (professional_id, procedimento_id)
);

CREATE INDEX IF NOT EXISTS idx_pp_clinic ON public.professional_procedimentos (clinic_id);
CREATE INDEX IF NOT EXISTS idx_pp_proc ON public.professional_procedimentos (procedimento_id);

ALTER TABLE public.professional_procedimentos ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY pp_select ON public.professional_procedimentos
    FOR SELECT TO authenticated USING (clinic_id = app_clinic_id());
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE POLICY pp_admin ON public.professional_procedimentos
    FOR ALL TO authenticated
    USING (clinic_id = app_clinic_id() AND app_role() IN ('admin','owner'))
    WITH CHECK (clinic_id = app_clinic_id() AND app_role() IN ('admin','owner'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ── Resolver profissional por procedimento ──────────────────
CREATE OR REPLACE FUNCTION public.resolve_professional_for_procedure(p_procedure text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_clinic_id uuid; v_result jsonb;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;

  -- Match exato
  SELECT jsonb_build_object(
    'ok', true,
    'professional_id', pp.id,
    'display_name', pp.display_name,
    'crm', pp.crm,
    'specialty', pp.specialty
  ) INTO v_result
  FROM professional_procedimentos ppr
  JOIN professional_profiles pp ON pp.id = ppr.professional_id
  JOIN clinic_procedimentos cp ON cp.id = ppr.procedimento_id
  WHERE ppr.clinic_id = v_clinic_id
    AND ppr.is_primary = true
    AND LOWER(cp.nome) = LOWER(p_procedure)
  LIMIT 1;

  -- Fallback: match parcial
  IF v_result IS NULL THEN
    SELECT jsonb_build_object(
      'ok', true,
      'professional_id', pp.id,
      'display_name', pp.display_name,
      'crm', pp.crm,
      'specialty', pp.specialty
    ) INTO v_result
    FROM professional_procedimentos ppr
    JOIN professional_profiles pp ON pp.id = ppr.professional_id
    JOIN clinic_procedimentos cp ON cp.id = ppr.procedimento_id
    WHERE ppr.clinic_id = v_clinic_id
      AND ppr.is_primary = true
      AND LOWER(cp.nome) LIKE '%' || LOWER(p_procedure) || '%'
    LIMIT 1;
  END IF;

  RETURN COALESCE(v_result, jsonb_build_object('ok', false));
END;
$$;

GRANT EXECUTE ON FUNCTION public.resolve_professional_for_procedure(text) TO authenticated;

-- ── Listar mapeamentos ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.list_professional_procedimentos()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_clinic_id uuid;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF;

  RETURN jsonb_build_object('ok', true, 'data', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'professional_id', pp.id,
      'professional_name', pp.display_name,
      'procedimento_id', cp.id,
      'procedimento_nome', cp.nome,
      'categoria', cp.categoria,
      'is_primary', ppr.is_primary
    ) ORDER BY pp.display_name, cp.categoria, cp.nome), '[]'::jsonb)
    FROM professional_procedimentos ppr
    JOIN professional_profiles pp ON pp.id = ppr.professional_id
    JOIN clinic_procedimentos cp ON cp.id = ppr.procedimento_id
    WHERE ppr.clinic_id = v_clinic_id
  ));
END;
$$;

GRANT EXECUTE ON FUNCTION public.list_professional_procedimentos() TO authenticated;

-- ── Setar mapeamentos de um profissional ────────────────────
CREATE OR REPLACE FUNCTION public.set_professional_procedimentos(
  p_professional_id uuid,
  p_procedimento_ids jsonb,
  p_primary_ids jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_clinic_id uuid; v_pid uuid; v_inserted int := 0;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF app_role() NOT IN ('admin','owner') THEN RAISE EXCEPTION 'Permissao insuficiente'; END IF;

  DELETE FROM professional_procedimentos WHERE professional_id = p_professional_id AND clinic_id = v_clinic_id;

  FOR v_pid IN SELECT jsonb_array_elements_text(p_procedimento_ids)::uuid LOOP
    INSERT INTO professional_procedimentos (professional_id, procedimento_id, clinic_id, is_primary)
    VALUES (p_professional_id, v_pid, v_clinic_id, p_primary_ids ? v_pid::text);
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'count', v_inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_professional_procedimentos(uuid, jsonb, jsonb) TO authenticated;
