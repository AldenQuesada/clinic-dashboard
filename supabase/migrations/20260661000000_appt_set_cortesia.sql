-- ============================================================
-- Migration: appt_set_cortesia helper RPC
-- ============================================================
-- RPC complementar chamado pelo frontend após appt_upsert para
-- popular as colunas de agregados de cortesia. Mantido isolado
-- para não tocar no RPC principal (que tem 100+ linhas).
-- ============================================================

DROP FUNCTION IF EXISTS public.appt_set_cortesia(text, numeric, text, int);

CREATE OR REPLACE FUNCTION public.appt_set_cortesia(
  p_id                text,
  p_valor_cortesia    numeric DEFAULT 0,
  p_motivo            text    DEFAULT NULL,
  p_qtd_procs         int     DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
BEGIN
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF v_role NOT IN ('owner','admin','receptionist','therapist') THEN
    RAISE EXCEPTION 'Permissão insuficiente';
  END IF;

  UPDATE public.appointments
     SET valor_cortesia     = COALESCE(p_valor_cortesia, 0),
         motivo_cortesia    = NULLIF(p_motivo, ''),
         qtd_procs_cortesia = COALESCE(p_qtd_procs, 0),
         updated_at         = now()
   WHERE id = p_id
     AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Appointment não encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.appt_set_cortesia(text, numeric, text, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.appt_set_cortesia(text, numeric, text, int) TO authenticated;
