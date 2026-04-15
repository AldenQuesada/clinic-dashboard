-- leads_list passa a retornar funnel (default 'procedimentos' se NULL)
-- Necessario pra paginas Leads Full Face / Leads Procedimentos filtrarem corretamente

CREATE OR REPLACE FUNCTION leads_list(
  p_search text DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_limit  int  DEFAULT 2000,
  p_offset int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
  v_result    jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;
  IF v_role NOT IN ('owner','admin','receptionist','therapist','viewer') THEN
    RAISE EXCEPTION 'Permissao insuficiente para acessar leads';
  END IF;

  SELECT COALESCE(jsonb_agg(row ORDER BY row.updated_at DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      l.data
      || jsonb_build_object(
        'id',               l.id,
        'name',             l.name,
        'phone',            l.phone,
        'email',            l.email,
        'status',           l.status,
        'leadScore',        l.lead_score,
        'dataNascimento',   NULLIF(l.birth_date, ''),
        'createdAt',        l.created_at,
        'queixas_faciais',  COALESCE(l.queixas_faciais, '[]'::jsonb),
        'idade',            l.idade,
        'temperature',      l.temperature,
        'phase',            l.phase,
        'is_active',        l.is_active,
        'source_type',      l.source_type,
        'funnel',           COALESCE(l.funnel, 'procedimentos'),
        '_synced',          true
      )                                       AS data,
      l.updated_at
    FROM public.leads l
    WHERE l.clinic_id  = v_clinic_id
      AND l.deleted_at IS NULL
      AND (p_status IS NULL OR l.status = p_status)
      AND (
        p_search IS NULL
        OR l.name  ILIKE '%' || p_search || '%'
        OR l.phone ILIKE '%' || p_search || '%'
        OR l.email ILIKE '%' || p_search || '%'
      )
    ORDER BY l.updated_at DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) row;

  RETURN v_result;
END;
$$;
