-- ============================================================
-- Migration: SDR — Interactions RLS + Functions
-- Sprint 8 — Feature C
--
-- RLS para a tabela interactions (criada na migration 005).
-- RPCs:
--   sdr_add_interaction(p_lead_id, p_type, p_content, p_outcome, p_direction, p_duration_sec)
--   sdr_get_interactions(p_lead_id, p_limit?)
-- ============================================================

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.interactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "interactions_clinic_select" ON public.interactions
  FOR SELECT USING (clinic_id = public._sdr_clinic_id());

CREATE POLICY "interactions_clinic_insert" ON public.interactions
  FOR INSERT WITH CHECK (clinic_id = public._sdr_clinic_id());

-- Apenas quem criou pode editar/remover (ou mesmo clinic via service_role)
CREATE POLICY "interactions_clinic_delete" ON public.interactions
  FOR DELETE USING (clinic_id = public._sdr_clinic_id());

-- ── sdr_add_interaction ───────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sdr_add_interaction(
  p_lead_id      text,
  p_type         text,
  p_content      text    DEFAULT NULL,
  p_outcome      text    DEFAULT NULL,
  p_direction    text    DEFAULT NULL,
  p_duration_sec int     DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_id        uuid;
BEGIN
  v_clinic_id := public._sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao autenticado');
  END IF;

  IF p_type NOT IN ('note', 'call', 'whatsapp', 'email', 'meeting', 'system') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tipo invalido: ' || p_type);
  END IF;

  INSERT INTO public.interactions (
    clinic_id, lead_id, type, content, outcome,
    direction, duration_sec, created_by
  ) VALUES (
    v_clinic_id, p_lead_id, p_type, p_content, p_outcome,
    p_direction, p_duration_sec, auth.uid()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'data', jsonb_build_object('id', v_id));
END;
$$;

-- ── sdr_get_interactions ──────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sdr_get_interactions(
  p_lead_id text,
  p_limit   int DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_rows      jsonb;
BEGIN
  v_clinic_id := public._sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao autenticado');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',           i.id,
      'type',         i.type,
      'direction',    i.direction,
      'content',      i.content,
      'outcome',      i.outcome,
      'duration_sec', i.duration_sec,
      'created_at',   i.created_at,
      'created_by',   i.created_by
    ) ORDER BY i.created_at DESC
  )
  INTO v_rows
  FROM public.interactions i
  WHERE i.clinic_id = v_clinic_id
    AND i.lead_id   = p_lead_id
  LIMIT p_limit;

  RETURN jsonb_build_object('ok', true, 'data', COALESCE(v_rows, '[]'::jsonb));
END;
$$;

-- ============================================================
-- VERIFICACAO:
-- SELECT sdr_add_interaction('LEAD_ID', 'note', 'Teste de nota');
-- SELECT sdr_get_interactions('LEAD_ID', 5);
-- ============================================================
