-- ============================================================
-- Migration: B2B Tasks — delegação (owner por task)
-- ============================================================

ALTER TABLE public.b2b_tasks
  ADD COLUMN IF NOT EXISTS owner text NULL;

CREATE INDEX IF NOT EXISTS idx_b2b_tasks_owner
  ON public.b2b_tasks (clinic_id, owner, status)
  WHERE owner IS NOT NULL;


-- RPC atribuir
CREATE OR REPLACE FUNCTION public.b2b_task_assign(p_id uuid, p_owner text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  UPDATE public.b2b_tasks
     SET owner = NULLIF(trim(p_owner), ''),
         updated_at = now()
   WHERE clinic_id = v_clinic_id AND id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- b2b_tasks_list estendida com filtro owner
CREATE OR REPLACE FUNCTION public.b2b_tasks_list(
  p_status text DEFAULT 'open',
  p_kind   text DEFAULT NULL,
  p_owner  text DEFAULT NULL,
  p_limit  int DEFAULT 200
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    to_jsonb(t) || jsonb_build_object('partnership_name',
      (SELECT name FROM public.b2b_partnerships WHERE id = t.partnership_id))
    ORDER BY due_date ASC NULLS LAST, created_at DESC
  ), '[]'::jsonb)
  INTO v_out
  FROM public.b2b_tasks t
  WHERE t.clinic_id = v_clinic_id
    AND (p_status IS NULL OR t.status = p_status)
    AND (p_kind   IS NULL OR t.kind = p_kind)
    AND (p_owner  IS NULL OR t.owner = p_owner)
  LIMIT GREATEST(1, p_limit);
  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;


GRANT EXECUTE ON FUNCTION public.b2b_task_assign(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_tasks_list(text, text, text, int) TO anon, authenticated, service_role;
