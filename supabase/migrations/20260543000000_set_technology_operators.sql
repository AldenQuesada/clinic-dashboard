-- ============================================================
-- Migration: 20260543000000 — set_technology_operators
-- RPC para gerenciar operadores de uma tecnologia (direção tech→prof)
-- ============================================================

CREATE OR REPLACE FUNCTION public.set_technology_operators(
  p_technology_id   uuid,
  p_professional_ids uuid[]
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
  v_pid       uuid;
  v_count     int  := 0;
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF v_role NOT IN ('admin','owner') THEN RAISE EXCEPTION 'Permissão insuficiente'; END IF;
  IF p_technology_id IS NULL THEN RAISE EXCEPTION 'Id da tecnologia é obrigatório'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.clinic_technologies
    WHERE id = p_technology_id AND clinic_id = v_clinic_id
  ) THEN
    RAISE EXCEPTION 'Tecnologia não encontrada (id=%)', p_technology_id;
  END IF;

  -- Remove todos os vínculos existentes para esta tecnologia
  DELETE FROM public.professional_technologies WHERE technology_id = p_technology_id;

  -- Insere os novos vínculos
  IF p_professional_ids IS NOT NULL THEN
    FOREACH v_pid IN ARRAY p_professional_ids LOOP
      IF EXISTS (
        SELECT 1 FROM public.professional_profiles
        WHERE id = v_pid AND clinic_id = v_clinic_id AND is_active = true
      ) THEN
        INSERT INTO public.professional_technologies (professional_id, technology_id)
        VALUES (v_pid, p_technology_id)
        ON CONFLICT DO NOTHING;
        v_count := v_count + 1;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'count', v_count);
END;
$$;

REVOKE ALL ON FUNCTION public.set_technology_operators(uuid, uuid[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_technology_operators(uuid, uuid[]) TO authenticated;
