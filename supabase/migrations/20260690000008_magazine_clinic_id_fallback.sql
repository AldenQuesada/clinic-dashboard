-- ============================================================================
-- Beauty & Health Magazine — _mag_current_clinic_id() fallback single-tenant
-- ============================================================================
-- Alinha com app_clinic_id() do resto do sistema: JWT claim -> fallback
-- para a unica clinica cadastrada (setup single-tenant Mirian).
-- ============================================================================

CREATE OR REPLACE FUNCTION public._mag_current_clinic_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    NULLIF(auth.jwt() ->> 'clinic_id', '')::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid
  );
$$;
