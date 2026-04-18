-- ============================================================
-- Hotfix: b2b_candidate_list — mover ORDER BY + LIMIT para subquery
--
-- Bug: misturar ORDER BY dentro de jsonb_agg com ORDER BY externo + LIMIT
-- causava "column c.dna_score must appear in the GROUP BY clause".
-- ============================================================

CREATE OR REPLACE FUNCTION public.b2b_candidate_list(
  p_status    text DEFAULT NULL,
  p_category  text DEFAULT NULL,
  p_min_score numeric DEFAULT NULL,
  p_limit     int DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out       jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_data), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT to_jsonb(c.*) AS row_data
        FROM public.b2b_candidates c
       WHERE c.clinic_id = v_clinic_id
         AND (p_status    IS NULL OR c.contact_status = p_status)
         AND (p_category  IS NULL OR c.category = p_category)
         AND (p_min_score IS NULL OR c.dna_score >= p_min_score)
       ORDER BY c.dna_score DESC NULLS LAST, c.created_at DESC
       LIMIT GREATEST(1, p_limit)
    ) sub;
  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_candidate_list(text, text, numeric, int)
  TO anon, authenticated, service_role;
