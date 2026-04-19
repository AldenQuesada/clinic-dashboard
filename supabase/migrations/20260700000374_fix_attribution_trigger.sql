-- ============================================================
-- Hotfix: _b2b_attribution_from_voucher fazia NEW.notes->>'source'
-- mas notes é text, não jsonb. Parse defensivo.
-- ============================================================

CREATE OR REPLACE FUNCTION public._b2b_attribution_from_voucher()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_source text := 'admin_manual';
  v_notes_json jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- Tenta parsear notes como JSON pra extrair source; se falhar, mantém 'admin_manual'
    IF NEW.notes IS NOT NULL AND length(trim(NEW.notes)) > 0 AND NEW.notes ~ '^\s*\{' THEN
      BEGIN
        v_notes_json := NEW.notes::jsonb;
        v_source := COALESCE(v_notes_json->>'source', v_source);
      EXCEPTION WHEN OTHERS THEN
        v_source := 'admin_manual';
      END;
    END IF;

    INSERT INTO public.b2b_attributions (
      clinic_id, partnership_id, voucher_id,
      lead_name, lead_phone,
      source, status
    ) VALUES (
      NEW.clinic_id, NEW.partnership_id, NEW.id,
      NEW.recipient_name, NEW.recipient_phone,
      v_source, 'referred'
    );
  END IF;
  RETURN NEW;
END $$;
