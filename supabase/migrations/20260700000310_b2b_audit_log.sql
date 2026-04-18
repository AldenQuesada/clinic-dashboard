-- ============================================================
-- Migration: B2B Audit Log — timeline de eventos por parceria
--
-- Grava mudanças de status, edições relevantes, ações importantes.
-- Triggers automáticos + RPC read.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.b2b_audit_log (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  partnership_id uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  action         text NOT NULL,
  -- action: 'created' | 'status_change' | 'playbook_applied' | 'voucher_issued'
  --       | 'voucher_redeemed' | 'exposure_logged' | 'closure_suggested'
  --       | 'closure_approved' | 'closure_dismissed' | 'edited' | 'comment'
  from_value     text NULL,
  to_value       text NULL,
  author         text NULL,
  notes          text NULL,
  meta           jsonb NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_audit_partnership
  ON public.b2b_audit_log (partnership_id, created_at DESC);

ALTER TABLE public.b2b_audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_audit_log_all" ON public.b2b_audit_log;
CREATE POLICY "b2b_audit_log_all" ON public.b2b_audit_log FOR ALL USING (true) WITH CHECK (true);


-- Helper de inserção (usado por outras migrations/RPCs)
CREATE OR REPLACE FUNCTION public._b2b_audit(
  p_partnership_id uuid, p_action text,
  p_from text DEFAULT NULL, p_to text DEFAULT NULL,
  p_author text DEFAULT NULL, p_notes text DEFAULT NULL, p_meta jsonb DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_id uuid;
BEGIN
  INSERT INTO public.b2b_audit_log (clinic_id, partnership_id, action, from_value, to_value, author, notes, meta)
  VALUES (v_clinic_id, p_partnership_id, p_action, p_from, p_to, p_author, p_notes, p_meta)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;


-- Trigger: grava status_change automático
CREATE OR REPLACE FUNCTION public._b2b_trg_log_status_change()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._b2b_audit(NEW.id, 'created', NULL, NEW.status, NEW.created_by, NULL, NULL);
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      PERFORM public._b2b_audit(NEW.id, 'status_change',
        OLD.status, NEW.status, NULL,
        NEW.status_reason, NULL);
    END IF;
    IF NEW.closure_suggested_at IS NOT NULL AND OLD.closure_suggested_at IS NULL THEN
      PERFORM public._b2b_audit(NEW.id, 'closure_suggested',
        NULL, NEW.closure_reason, NULL, NEW.closure_reason, NULL);
    END IF;
    IF NEW.health_color IS DISTINCT FROM OLD.health_color THEN
      PERFORM public._b2b_audit(NEW.id, 'health_change',
        OLD.health_color, NEW.health_color, NULL, NULL, NULL);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_b2b_audit_partnerships ON public.b2b_partnerships;
CREATE TRIGGER trg_b2b_audit_partnerships
  AFTER INSERT OR UPDATE ON public.b2b_partnerships
  FOR EACH ROW EXECUTE FUNCTION public._b2b_trg_log_status_change();


-- Trigger vouchers (issued/redeemed/cancelled)
CREATE OR REPLACE FUNCTION public._b2b_trg_log_voucher()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._b2b_audit(NEW.partnership_id, 'voucher_issued',
      NULL, NEW.token, NULL,
      'combo: ' || COALESCE(NEW.combo, '—'),
      jsonb_build_object('voucher_id', NEW.id, 'token', NEW.token, 'combo', NEW.combo));
  ELSIF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'redeemed' THEN
      PERFORM public._b2b_audit(NEW.partnership_id, 'voucher_redeemed',
        OLD.status, 'redeemed', NULL, NEW.token, NULL);
    ELSIF NEW.status = 'cancelled' THEN
      PERFORM public._b2b_audit(NEW.partnership_id, 'voucher_cancelled',
        OLD.status, 'cancelled', NULL, NEW.token, NULL);
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_b2b_audit_vouchers ON public.b2b_vouchers;
CREATE TRIGGER trg_b2b_audit_vouchers
  AFTER INSERT OR UPDATE ON public.b2b_vouchers
  FOR EACH ROW EXECUTE FUNCTION public._b2b_trg_log_voucher();


-- Trigger exposures
CREATE OR REPLACE FUNCTION public._b2b_trg_log_exposure()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public._b2b_audit(NEW.partnership_id, 'exposure_logged',
      NULL, NEW.event_type, NULL,
      NEW.title || ' · alcance ' || NEW.reach_count || ' · leads ' || NEW.leads_count,
      jsonb_build_object('exposure_id', NEW.id, 'reach', NEW.reach_count, 'leads', NEW.leads_count));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_b2b_audit_exposures ON public.b2b_group_exposures;
CREATE TRIGGER trg_b2b_audit_exposures
  AFTER INSERT ON public.b2b_group_exposures
  FOR EACH ROW EXECUTE FUNCTION public._b2b_trg_log_exposure();


-- ── RPC leitura ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_audit_timeline(p_partnership_id uuid, p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT id, action, from_value, to_value, author, notes, meta, created_at
        FROM public.b2b_audit_log
       WHERE clinic_id = v_clinic_id AND partnership_id = p_partnership_id
       ORDER BY created_at DESC
       LIMIT GREATEST(1, p_limit)
    ) a;
  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public._b2b_audit(uuid, text, text, text, text, text, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_audit_timeline(uuid, int)                         TO anon, authenticated, service_role;
GRANT SELECT, INSERT ON public.b2b_audit_log TO anon, authenticated, service_role;
