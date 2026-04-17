-- ============================================================
-- Migration: VPI Indication Revert (Fase 8 - Entrega 2)
--
-- Reverte indication closed quando o appointment associado
-- e cancelado ou marcado como no_show. Evita creditos indevidos
-- persistindo no partner.
--
-- Fluxo:
--   1. RPC vpi_indication_revert_by_appt(appt_id, reason)
--      - Busca indication closed com aquele appt_id
--      - Seta status='invalid', invalid_reason=reason
--      - Decrementa creditos do partner (GREATEST 0)
--      - Audita acao 'indication_reverted'
--      - Trigger trg_vpi_ind_score (existente) recalcula score
--
--   2. Trigger AFTER UPDATE em appointments
--      - Dispara vpi_indication_revert_by_appt quando status muda
--        para cancelado/no_show a partir de outro valor
--      - fire-and-forget (erro nao bloqueia update do appt)
--
-- Idempotente: DROP IF EXISTS + CREATE OR REPLACE.
-- ============================================================

-- ── 1. Garantir coluna invalid_reason (deve existir de fase 7) ──
ALTER TABLE public.vpi_indications
  ADD COLUMN IF NOT EXISTS invalid_reason text;

-- ── 2. RPC: reverter indication por appt_id ──────────────────
CREATE OR REPLACE FUNCTION public.vpi_indication_revert_by_appt(
  p_appt_id text,
  p_reason  text DEFAULT 'appt_cancelled'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_ind       record;
  v_creditos  int;
  v_clinic    uuid;
BEGIN
  IF p_appt_id IS NULL OR p_appt_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_appt_id');
  END IF;

  SELECT i.*
    INTO v_ind
    FROM public.vpi_indications i
   WHERE i.appt_id = p_appt_id
     AND i.status  = 'closed'
   ORDER BY i.fechada_em DESC NULLS LAST
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found', 'appt_id', p_appt_id);
  END IF;

  v_creditos := COALESCE(v_ind.creditos, 0);
  v_clinic   := v_ind.clinic_id;

  -- Marca invalid + motivo
  UPDATE public.vpi_indications
     SET status         = 'invalid',
         invalid_reason = COALESCE(p_reason, 'appt_cancelled'),
         updated_at     = now()
   WHERE id = v_ind.id;

  -- Decrementa creditos do partner (nunca abaixo de 0)
  UPDATE public.vpi_partners
     SET creditos_total       = GREATEST(0, COALESCE(creditos_total, 0)       - v_creditos),
         creditos_disponiveis = GREATEST(0, COALESCE(creditos_disponiveis, 0) - v_creditos),
         updated_at           = now()
   WHERE id = v_ind.partner_id;

  -- Audit
  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (
    v_clinic, 'indication_reverted', 'indication', v_ind.id::text,
    jsonb_build_object(
      'appt_id',         p_appt_id,
      'partner_id',      v_ind.partner_id,
      'lead_id',         v_ind.lead_id,
      'creditos_revert', v_creditos,
      'reason',          COALESCE(p_reason, 'appt_cancelled')
    )
  );

  RETURN jsonb_build_object(
    'ok',              true,
    'indication_id',   v_ind.id,
    'partner_id',      v_ind.partner_id,
    'creditos_revert', v_creditos,
    'reason',          COALESCE(p_reason, 'appt_cancelled')
  );
EXCEPTION WHEN OTHERS THEN
  -- Nunca quebrar o fluxo do appt por erro aqui
  BEGIN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (
      COALESCE(v_clinic, '00000000-0000-0000-0000-000000000001'::uuid),
      'indication_revert_failed', 'appointment', p_appt_id,
      jsonb_build_object('error', SQLERRM, 'reason', COALESCE(p_reason, 'appt_cancelled'))
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;
  RETURN jsonb_build_object('ok', false, 'reason', 'exception', 'error', SQLERRM);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_indication_revert_by_appt(text, text) TO authenticated;

-- ── 3. Trigger function: dispara em UPDATE de appointments ──
CREATE OR REPLACE FUNCTION public._vpi_appt_revert_on_cancel()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_cancel_statuses text[] := ARRAY['cancelado','cancelled','no_show','nao_compareceu'];
BEGIN
  -- So dispara se status mudou PARA cancel/no_show
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status = ANY(v_cancel_statuses)
     AND (OLD.status IS NULL OR NOT (OLD.status = ANY(v_cancel_statuses)))
  THEN
    BEGIN
      PERFORM public.vpi_indication_revert_by_appt(
        NEW.id::text,
        CASE
          WHEN NEW.status IN ('no_show','nao_compareceu') THEN 'appt_no_show'
          ELSE 'appt_cancelled'
        END
      );
    EXCEPTION WHEN OTHERS THEN
      -- fire-and-forget
      NULL;
    END;
  END IF;
  RETURN NEW;
END $$;

-- ── 4. Trigger em appointments ──────────────────────────────
DROP TRIGGER IF EXISTS trg_vpi_revert_on_cancel ON public.appointments;

CREATE TRIGGER trg_vpi_revert_on_cancel
  AFTER UPDATE OF status ON public.appointments
  FOR EACH ROW
  EXECUTE FUNCTION public._vpi_appt_revert_on_cancel();

COMMENT ON FUNCTION public.vpi_indication_revert_by_appt(text, text) IS
  'Reverte indication closed (appt cancelado/no_show). Decrementa creditos GREATEST 0, audita, trigger de score recalcula. Fase 8 Entrega 2.';
