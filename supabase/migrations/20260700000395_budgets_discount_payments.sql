-- ============================================================
-- Migration: budgets com desconto + formas de pagamento (jsonb)
-- ============================================================
-- Amplia sdr_upsert_budget pra aceitar:
--   p_discount  (numeric)   — desconto sobre subtotal
--   p_payments  (jsonb)     — array de formas de pagamento propostas
--                             [{forma, valor, parcelas, valorParcela, status, comentario}]
-- Adiciona coluna budgets.payments jsonb (ficava em notes antes).
-- ============================================================

ALTER TABLE public.budgets
  ADD COLUMN IF NOT EXISTS payments jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.budgets.payments IS
  'Condicao de pagamento proposta no orcamento. Array de {forma, valor, parcelas, valorParcela, status, comentario}.';

DROP FUNCTION IF EXISTS public.sdr_upsert_budget(
  uuid, text, text, text, text, jsonb, date
);

CREATE OR REPLACE FUNCTION public.sdr_upsert_budget(
  p_id          uuid    DEFAULT NULL,
  p_lead_id     text    DEFAULT NULL,
  p_title       text    DEFAULT NULL,
  p_notes       text    DEFAULT NULL,
  p_status      text    DEFAULT 'draft',
  p_items       jsonb   DEFAULT '[]'::jsonb,
  p_valid_until date    DEFAULT NULL,
  p_discount    numeric DEFAULT 0,
  p_payments    jsonb   DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_budget_id uuid;
  v_subtotal  numeric(12,2) := 0;
  v_total     numeric(12,2) := 0;
  v_item      jsonb;
  v_qty       int;
  v_price     numeric(12,2);
  v_sort      int := 0;
  v_is_update boolean := (p_id IS NOT NULL);
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado'); END IF;
  IF NOT v_is_update AND p_lead_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lead_id obrigatorio');
  END IF;
  IF p_status NOT IN ('draft','sent','viewed','followup','negotiation','approved','lost') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Status invalido');
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS t(value) LOOP
    v_qty   := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));
    v_price := GREATEST(0, COALESCE((v_item->>'unit_price')::numeric, 0));
    v_subtotal := v_subtotal + (v_qty * v_price);
  END LOOP;

  v_total := GREATEST(0, v_subtotal - COALESCE(p_discount, 0));

  IF v_is_update THEN
    IF NOT EXISTS (SELECT 1 FROM budgets WHERE id = p_id AND clinic_id = v_clinic_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Orcamento nao encontrado');
    END IF;
    UPDATE budgets SET
      title       = COALESCE(p_title, title),
      notes       = p_notes,
      status      = COALESCE(p_status, status),
      subtotal    = v_subtotal,
      discount    = COALESCE(p_discount, 0),
      total       = v_total,
      payments    = COALESCE(p_payments, '[]'::jsonb),
      valid_until = p_valid_until,
      updated_at  = now()
    WHERE id = p_id AND clinic_id = v_clinic_id
    RETURNING id INTO v_budget_id;
    DELETE FROM budget_items WHERE budget_id = v_budget_id;
  ELSE
    IF NOT EXISTS (SELECT 1 FROM leads WHERE id = p_lead_id AND clinic_id = v_clinic_id) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Lead nao encontrado');
    END IF;
    INSERT INTO budgets (
      clinic_id, lead_id, title, notes, status, subtotal, discount, total,
      payments, valid_until, created_by
    )
    VALUES (
      v_clinic_id, p_lead_id, NULLIF(trim(COALESCE(p_title, '')), ''), p_notes, COALESCE(p_status, 'draft'),
      v_subtotal, COALESCE(p_discount, 0), v_total,
      COALESCE(p_payments, '[]'::jsonb), p_valid_until, auth.uid()
    )
    RETURNING id INTO v_budget_id;
  END IF;

  -- Re-insere items
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS t(value) LOOP
    v_qty   := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));
    v_price := GREATEST(0, COALESCE((v_item->>'unit_price')::numeric, 0));
    v_sort  := v_sort + 1;
    INSERT INTO budget_items (budget_id, description, quantity, unit_price, total_price, sort_order)
    VALUES (
      v_budget_id,
      COALESCE(NULLIF(trim(COALESCE(v_item->>'description', '')), ''), 'Item sem descricao'),
      v_qty, v_price, v_qty * v_price, v_sort
    );
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_budget_id, 'is_update', v_is_update,
                            'subtotal', v_subtotal, 'total', v_total);
END;
$$;

GRANT EXECUTE ON FUNCTION public.sdr_upsert_budget(
  uuid, text, text, text, text, jsonb, date, numeric, jsonb
) TO authenticated;
