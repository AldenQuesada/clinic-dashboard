-- ============================================================
-- Migration: 20260526000000 — SDR: Professionals for Tasks
--
-- Alterações:
--   ALTER TABLE professional_profiles ADD COLUMN phone text
--
-- Função:
--   sdr_get_professionals() — lista profissionais ativos da clínica
--     Retorna: id, name, role, phone
--     Uso: tasks.js (atribuição de responsáveis em tarefas manuais)
--
-- Blindagens:
--   - SECURITY DEFINER + _sdr_clinic_id()
--   - Retorna apenas is_active = true
--   - phone nullable (não obrigatório)
-- ============================================================

-- Adiciona campo phone ao perfil de profissionais (nullable, sem breaking change)
ALTER TABLE public.professional_profiles
  ADD COLUMN IF NOT EXISTS phone text;

-- ── sdr_get_professionals ─────────────────────────────────────

DROP FUNCTION IF EXISTS public.sdr_get_professionals();

CREATE OR REPLACE FUNCTION public.sdr_get_professionals()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_rows      jsonb;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado ou sem clinica');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',    pp.id,
      'name',  pp.display_name,
      'role',  COALESCE(pp.specialty, p.role),
      'phone', pp.phone
    )
    ORDER BY lower(pp.display_name)
  )
  INTO v_rows
  FROM public.professional_profiles pp
  JOIN public.profiles p ON p.id = pp.id
  WHERE pp.clinic_id = v_clinic_id
    AND pp.is_active  = true;

  RETURN jsonb_build_object('ok', true, 'data', COALESCE(v_rows, '[]'::jsonb));
END;
$$;

-- ============================================================
-- VERIFICACAO:
-- SELECT sdr_get_professionals();
-- ============================================================
