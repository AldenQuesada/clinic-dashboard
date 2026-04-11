-- ============================================================
-- Migration: financial_audit_log + triggers
-- ============================================================
-- Tabela centralizada para log de mudancas em campos financeiros
-- sensiveis (valor, valor_cortesia, valor_consulta de profissional).
-- Triggers acionados em UPDATE comparam OLD vs NEW e insertam diff.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.financial_audit_log (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid          NOT NULL,
  table_name    text          NOT NULL,
  record_id     text          NOT NULL,
  field_name    text          NOT NULL,
  old_value     text,
  new_value     text,
  changed_by    uuid          REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at    timestamptz   NOT NULL DEFAULT now(),
  source_action text,
  metadata      jsonb         DEFAULT '{}'
);

CREATE INDEX IF NOT EXISTS idx_finaudit_clinic_date
  ON public.financial_audit_log (clinic_id, changed_at DESC);

CREATE INDEX IF NOT EXISTS idx_finaudit_record
  ON public.financial_audit_log (table_name, record_id);

ALTER TABLE public.financial_audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS finaudit_select ON public.financial_audit_log;
CREATE POLICY finaudit_select
  ON public.financial_audit_log FOR SELECT
  TO authenticated
  USING (clinic_id = app_clinic_id() AND app_role() IN ('owner','admin'));

DROP POLICY IF EXISTS finaudit_insert ON public.financial_audit_log;
CREATE POLICY finaudit_insert
  ON public.financial_audit_log FOR INSERT
  TO authenticated
  WITH CHECK (clinic_id = app_clinic_id());

-- ── Trigger fn: appointments financial audit ────────────────

CREATE OR REPLACE FUNCTION public.fn_audit_appt_financial()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.value IS NOT NULL AND NEW.value > 0 THEN
      INSERT INTO public.financial_audit_log (
        clinic_id, table_name, record_id, field_name, old_value, new_value, changed_by, source_action
      ) VALUES (
        NEW.clinic_id, 'appointments', NEW.id, 'value', NULL, NEW.value::text, v_user, 'insert'
      );
    END IF;
    IF COALESCE(NEW.valor_cortesia, 0) > 0 THEN
      INSERT INTO public.financial_audit_log (
        clinic_id, table_name, record_id, field_name, old_value, new_value, changed_by, source_action
      ) VALUES (
        NEW.clinic_id, 'appointments', NEW.id, 'valor_cortesia', NULL, NEW.valor_cortesia::text, v_user, 'insert'
      );
    END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF COALESCE(OLD.value, 0) IS DISTINCT FROM COALESCE(NEW.value, 0) THEN
      INSERT INTO public.financial_audit_log (
        clinic_id, table_name, record_id, field_name, old_value, new_value, changed_by, source_action
      ) VALUES (
        NEW.clinic_id, 'appointments', NEW.id, 'value',
        OLD.value::text, NEW.value::text, v_user, 'update'
      );
    END IF;
    IF COALESCE(OLD.valor_cortesia, 0) IS DISTINCT FROM COALESCE(NEW.valor_cortesia, 0) THEN
      INSERT INTO public.financial_audit_log (
        clinic_id, table_name, record_id, field_name, old_value, new_value, changed_by, source_action
      ) VALUES (
        NEW.clinic_id, 'appointments', NEW.id, 'valor_cortesia',
        OLD.valor_cortesia::text, NEW.valor_cortesia::text, v_user, 'update'
      );
    END IF;
    IF COALESCE(OLD.payment_status, '') IS DISTINCT FROM COALESCE(NEW.payment_status, '') THEN
      INSERT INTO public.financial_audit_log (
        clinic_id, table_name, record_id, field_name, old_value, new_value, changed_by, source_action
      ) VALUES (
        NEW.clinic_id, 'appointments', NEW.id, 'payment_status',
        OLD.payment_status, NEW.payment_status, v_user, 'update'
      );
    END IF;
    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_appt_financial ON public.appointments;
CREATE TRIGGER trg_audit_appt_financial
  AFTER INSERT OR UPDATE ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_appt_financial();

-- ── Trigger fn: professional valor_consulta audit ───────────

CREATE OR REPLACE FUNCTION public.fn_audit_prof_valor_consulta()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
BEGIN
  IF TG_OP = 'INSERT' AND NEW.valor_consulta IS NOT NULL AND NEW.valor_consulta > 0 THEN
    INSERT INTO public.financial_audit_log (
      clinic_id, table_name, record_id, field_name, old_value, new_value, changed_by, source_action
    ) VALUES (
      NEW.clinic_id, 'professional_profiles', NEW.id::text, 'valor_consulta',
      NULL, NEW.valor_consulta::text, v_user, 'insert'
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND COALESCE(OLD.valor_consulta, 0) IS DISTINCT FROM COALESCE(NEW.valor_consulta, 0) THEN
    INSERT INTO public.financial_audit_log (
      clinic_id, table_name, record_id, field_name, old_value, new_value, changed_by, source_action
    ) VALUES (
      NEW.clinic_id, 'professional_profiles', NEW.id::text, 'valor_consulta',
      OLD.valor_consulta::text, NEW.valor_consulta::text, v_user, 'update'
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_prof_valor_consulta ON public.professional_profiles;
CREATE TRIGGER trg_audit_prof_valor_consulta
  AFTER INSERT OR UPDATE ON public.professional_profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_prof_valor_consulta();

-- ── RPC: get_financial_audit_for_record ────────────────────
-- Lê histórico de mudanças financeiras de um registro específico
-- (pra exibir no modal de detalhes do appointment ou profissional).

DROP FUNCTION IF EXISTS public.get_financial_audit_for_record(text, text);

CREATE OR REPLACE FUNCTION public.get_financial_audit_for_record(
  p_table   text,
  p_record_id text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
  v_result    jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF v_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Permissão insuficiente';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'field',      l.field_name,
      'old',        l.old_value,
      'new',        l.new_value,
      'changed_at', l.changed_at,
      'changed_by', u.email,
      'action',     l.source_action
    ) ORDER BY l.changed_at DESC
  )
  INTO v_result
  FROM public.financial_audit_log l
  LEFT JOIN auth.users u ON u.id = l.changed_by
  WHERE l.clinic_id = v_clinic_id
    AND l.table_name = p_table
    AND l.record_id  = p_record_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_financial_audit_for_record(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_financial_audit_for_record(text, text) TO authenticated;
