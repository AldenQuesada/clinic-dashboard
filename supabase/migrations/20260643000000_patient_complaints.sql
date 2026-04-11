-- ============================================================
-- Migration: 20260643000000 — Patient Complaints Tracking
--
-- Tables: patient_complaints
-- RPCs: complaint_list, complaint_upsert, complaint_resolve,
--        complaint_migrate_from_leads, complaints_pending_retouch,
--        complaints_by_type
-- Trigger: auto next_retouch_date calculation
-- ============================================================

-- 1. Table
CREATE TABLE IF NOT EXISTS public.patient_complaints (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  patient_id            text NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
  clinic_id             uuid NOT NULL DEFAULT app_clinic_id(),
  complaint             text NOT NULL,
  source                text NOT NULL DEFAULT 'manual'
                          CHECK (source IN ('quiz', 'anamnese', 'manual')),
  status                text NOT NULL DEFAULT 'pendente'
                          CHECK (status IN ('pendente', 'em_tratamento', 'tratada', 'resolvida')),
  treatment_procedure   text,
  treatment_date        timestamptz,
  retouch_interval_days int,
  next_retouch_date     date,
  retouch_count         int NOT NULL DEFAULT 0,
  resolved_at           timestamptz,
  notes                 text,
  appointment_id        text,
  professional_name     text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- 2. Indexes
CREATE INDEX IF NOT EXISTS idx_pc_clinic     ON public.patient_complaints (clinic_id);
CREATE INDEX IF NOT EXISTS idx_pc_patient    ON public.patient_complaints (patient_id);
CREATE INDEX IF NOT EXISTS idx_pc_status     ON public.patient_complaints (status);
CREATE INDEX IF NOT EXISTS idx_pc_retouch    ON public.patient_complaints (next_retouch_date)
  WHERE next_retouch_date IS NOT NULL;

-- 3. RLS
ALTER TABLE public.patient_complaints ENABLE ROW LEVEL SECURITY;

CREATE POLICY pc_select ON public.patient_complaints
  FOR SELECT TO authenticated
  USING (clinic_id = app_clinic_id());

CREATE POLICY pc_insert ON public.patient_complaints
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = app_clinic_id());

CREATE POLICY pc_update ON public.patient_complaints
  FOR UPDATE TO authenticated
  USING (clinic_id = app_clinic_id())
  WITH CHECK (clinic_id = app_clinic_id());

-- 4. Trigger: auto-calculate next_retouch_date
CREATE OR REPLACE FUNCTION public.pc_calc_retouch_date()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.treatment_date IS NOT NULL AND NEW.retouch_interval_days IS NOT NULL THEN
    NEW.next_retouch_date := (NEW.treatment_date + (NEW.retouch_interval_days || ' days')::interval)::date;
  ELSE
    NEW.next_retouch_date := NULL;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_pc_retouch ON public.patient_complaints;
CREATE TRIGGER trg_pc_retouch
  BEFORE INSERT OR UPDATE OF treatment_date, retouch_interval_days
  ON public.patient_complaints
  FOR EACH ROW EXECUTE FUNCTION public.pc_calc_retouch_date();

-- 5. RPC: complaint_list
CREATE OR REPLACE FUNCTION public.complaint_list(p_patient_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic_id uuid; v_result jsonb;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                    c.id,
      'patient_id',            c.patient_id,
      'complaint',             c.complaint,
      'source',                c.source,
      'status',                c.status,
      'treatment_procedure',   c.treatment_procedure,
      'treatment_date',        c.treatment_date,
      'retouch_interval_days', c.retouch_interval_days,
      'next_retouch_date',     c.next_retouch_date,
      'retouch_count',         c.retouch_count,
      'resolved_at',           c.resolved_at,
      'notes',                 c.notes,
      'appointment_id',        c.appointment_id,
      'professional_name',     c.professional_name,
      'created_at',            c.created_at,
      'updated_at',            c.updated_at
    ) ORDER BY c.created_at DESC
  ), '[]'::jsonb) INTO v_result
  FROM patient_complaints c
  WHERE c.patient_id = p_patient_id
    AND c.clinic_id = v_clinic_id;

  RETURN v_result;
END; $$;

-- 6. RPC: complaint_upsert
CREATE OR REPLACE FUNCTION public.complaint_upsert(
  p_id                    uuid    DEFAULT NULL,
  p_patient_id            text    DEFAULT NULL,
  p_complaint             text    DEFAULT NULL,
  p_status                text    DEFAULT 'pendente',
  p_treatment_procedure   text    DEFAULT NULL,
  p_treatment_date        timestamptz DEFAULT NULL,
  p_retouch_interval_days int     DEFAULT NULL,
  p_notes                 text    DEFAULT NULL,
  p_professional_name     text    DEFAULT NULL,
  p_appointment_id        text    DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic_id uuid; v_id uuid;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  IF p_id IS NOT NULL THEN
    -- Update existing
    UPDATE patient_complaints SET
      complaint             = COALESCE(p_complaint, complaint),
      status                = COALESCE(p_status, status),
      treatment_procedure   = COALESCE(p_treatment_procedure, treatment_procedure),
      treatment_date        = COALESCE(p_treatment_date, treatment_date),
      retouch_interval_days = COALESCE(p_retouch_interval_days, retouch_interval_days),
      notes                 = COALESCE(p_notes, notes),
      professional_name     = COALESCE(p_professional_name, professional_name),
      appointment_id        = COALESCE(p_appointment_id, appointment_id),
      updated_at            = now()
    WHERE id = p_id AND clinic_id = v_clinic_id
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN RAISE EXCEPTION 'Queixa nao encontrada ou sem permissao'; END IF;
  ELSE
    -- Insert new
    IF p_patient_id IS NULL OR p_complaint IS NULL THEN
      RAISE EXCEPTION 'patient_id e complaint sao obrigatorios';
    END IF;

    INSERT INTO patient_complaints (
      patient_id, clinic_id, complaint, status,
      treatment_procedure, treatment_date, retouch_interval_days,
      notes, professional_name, appointment_id
    ) VALUES (
      p_patient_id, v_clinic_id, p_complaint, COALESCE(p_status, 'pendente'),
      p_treatment_procedure, p_treatment_date, p_retouch_interval_days,
      p_notes, p_professional_name, p_appointment_id
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;

-- 7. RPC: complaint_resolve
CREATE OR REPLACE FUNCTION public.complaint_resolve(p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic_id uuid; v_id uuid;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  UPDATE patient_complaints
  SET status = 'resolvida', resolved_at = now(), updated_at = now()
  WHERE id = p_id AND clinic_id = v_clinic_id
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN RAISE EXCEPTION 'Queixa nao encontrada ou sem permissao'; END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END; $$;

-- 8. RPC: complaint_migrate_from_leads
CREATE OR REPLACE FUNCTION public.complaint_migrate_from_leads()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic_id uuid;
  v_lead record;
  v_queixa text;
  v_inserted int := 0;
  v_skipped int := 0;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  FOR v_lead IN
    SELECT id, queixas_faciais
    FROM leads
    WHERE clinic_id = v_clinic_id
      AND queixas_faciais IS NOT NULL
      AND jsonb_array_length(queixas_faciais) > 0
  LOOP
    FOR v_queixa IN SELECT jsonb_array_elements_text(v_lead.queixas_faciais)
    LOOP
      -- Skip if already migrated
      IF EXISTS (
        SELECT 1 FROM patient_complaints
        WHERE patient_id = v_lead.id
          AND clinic_id = v_clinic_id
          AND complaint = v_queixa
          AND source = 'quiz'
      ) THEN
        v_skipped := v_skipped + 1;
        CONTINUE;
      END IF;

      INSERT INTO patient_complaints (patient_id, clinic_id, complaint, source)
      VALUES (v_lead.id, v_clinic_id, v_queixa, 'quiz');
      v_inserted := v_inserted + 1;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', v_inserted, 'skipped', v_skipped);
END; $$;

-- 9. RPC: complaints_pending_retouch
CREATE OR REPLACE FUNCTION public.complaints_pending_retouch()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic_id uuid; v_result jsonb;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                  c.id,
      'patient_id',          c.patient_id,
      'patient_name',        l.name,
      'patient_phone',       l.phone,
      'complaint',           c.complaint,
      'treatment_procedure', c.treatment_procedure,
      'treatment_date',      c.treatment_date,
      'next_retouch_date',   c.next_retouch_date,
      'retouch_count',       c.retouch_count,
      'professional_name',   c.professional_name,
      'days_until_retouch',  c.next_retouch_date - CURRENT_DATE
    ) ORDER BY c.next_retouch_date ASC
  ), '[]'::jsonb) INTO v_result
  FROM patient_complaints c
  JOIN leads l ON l.id = c.patient_id
  WHERE c.clinic_id = v_clinic_id
    AND c.status IN ('em_tratamento', 'tratada')
    AND c.next_retouch_date IS NOT NULL
    AND c.next_retouch_date <= CURRENT_DATE + INTERVAL '7 days';

  RETURN v_result;
END; $$;

-- 10. RPC: complaints_by_type
CREATE OR REPLACE FUNCTION public.complaints_by_type()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_clinic_id uuid; v_result jsonb;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Nao autenticado'; END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'complaint', complaint,
      'total',     cnt,
      'pendente',  pendente,
      'em_tratamento', em_tratamento,
      'tratada',   tratada,
      'resolvida', resolvida
    ) ORDER BY cnt DESC
  ), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      complaint,
      COUNT(*)                                        AS cnt,
      COUNT(*) FILTER (WHERE status = 'pendente')     AS pendente,
      COUNT(*) FILTER (WHERE status = 'em_tratamento') AS em_tratamento,
      COUNT(*) FILTER (WHERE status = 'tratada')      AS tratada,
      COUNT(*) FILTER (WHERE status = 'resolvida')    AS resolvida
    FROM patient_complaints
    WHERE clinic_id = v_clinic_id
    GROUP BY complaint
  ) sub;

  RETURN v_result;
END; $$;

-- 11. GRANT all RPCs to authenticated
GRANT EXECUTE ON FUNCTION public.complaint_list(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_upsert(uuid, text, text, text, text, timestamptz, int, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_resolve(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complaint_migrate_from_leads() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complaints_pending_retouch() TO authenticated;
GRANT EXECUTE ON FUNCTION public.complaints_by_type() TO authenticated;
