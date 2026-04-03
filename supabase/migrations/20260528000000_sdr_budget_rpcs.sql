-- ============================================================
-- Migration: 20260528000000 — SDR Sprint 11: Budget RPCs
--
-- Gap fechado: tabela `budgets` estava orfã — nenhuma RPC existia.
-- JS usava lead.customFields.orcamentos (localStorage/API).
--
-- RPCs criadas:
--   sdr_get_budgets(p_lead_id)          — lista orçamentos do lead c/ itens
--   sdr_upsert_budget(...)              — cria ou atualiza orçamento + itens
--   sdr_delete_budget(p_budget_id)      — remove orçamento + itens (FK)
--   sdr_update_budget_status(...)       — muda status + seta timestamps
--
-- Blindagens:
--   - SECURITY DEFINER + _sdr_clinic_id() (isolamento por clínica)
--   - CHECK de status via lista válida
--   - Cálculo de subtotal/total server-side (não confia no cliente)
--   - DELETE de items antes do budget (FK safe, mas budget_items tem CASCADE)
--   - lead_id validado: pertence à clínica do usuário
-- ============================================================

-- ── sdr_get_budgets ───────────────────────────────────────────

DROP FUNCTION IF EXISTS public.sdr_get_budgets(text);

CREATE OR REPLACE FUNCTION public.sdr_get_budgets(p_lead_id text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_rows      jsonb;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado ou sem clinica');
  END IF;

  -- Valida que o lead pertence à clínica do usuário
  IF NOT EXISTS (
    SELECT 1 FROM leads WHERE id = p_lead_id AND clinic_id = v_clinic_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Lead nao encontrado');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',           b.id,
      'title',        b.title,
      'notes',        b.notes,
      'status',       b.status,
      'subtotal',     b.subtotal,
      'discount',     b.discount,
      'total',        b.total,
      'valid_until',  b.valid_until,
      'sent_at',      b.sent_at,
      'viewed_at',    b.viewed_at,
      'approved_at',  b.approved_at,
      'lost_at',      b.lost_at,
      'created_at',   b.created_at,
      'items', (
        SELECT COALESCE(jsonb_agg(
          jsonb_build_object(
            'id',          bi.id,
            'description', bi.description,
            'quantity',    bi.quantity,
            'unit_price',  bi.unit_price,
            'total_price', bi.total_price
          ) ORDER BY bi.sort_order ASC
        ), '[]'::jsonb)
        FROM budget_items bi
        WHERE bi.budget_id = b.id
      )
    ) ORDER BY b.created_at DESC
  )
  INTO v_rows
  FROM budgets b
  WHERE b.lead_id   = p_lead_id
    AND b.clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true, 'data', COALESCE(v_rows, '[]'::jsonb));
END;
$$;

-- ── sdr_upsert_budget ─────────────────────────────────────────

DROP FUNCTION IF EXISTS public.sdr_upsert_budget(uuid, text, text, text, text, jsonb, date);

CREATE OR REPLACE FUNCTION public.sdr_upsert_budget(
  p_id          uuid    DEFAULT NULL,
  p_lead_id     text    DEFAULT NULL,
  p_title       text    DEFAULT NULL,
  p_notes       text    DEFAULT NULL,
  p_status      text    DEFAULT 'draft',
  p_items       jsonb   DEFAULT '[]',
  p_valid_until date    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid;
  v_budget_id  uuid;
  v_subtotal   numeric(12,2) := 0;
  v_item       jsonb;
  v_qty        int;
  v_price      numeric(12,2);
  v_item_total numeric(12,2);
  v_sort       int := 0;
  v_is_update  boolean := (p_id IS NOT NULL);
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado ou sem clinica');
  END IF;

  -- Validações
  IF NOT v_is_update AND p_lead_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'lead_id obrigatorio para novos orcamentos');
  END IF;

  IF p_status NOT IN ('draft','sent','viewed','followup','negotiation','approved','lost') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Status invalido: ' || COALESCE(p_status, 'null'));
  END IF;

  -- Calcula subtotal server-side
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS t(value)
  LOOP
    v_qty   := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));
    v_price := GREATEST(0, COALESCE((v_item->>'unit_price')::numeric, 0));
    v_subtotal := v_subtotal + (v_qty * v_price);
  END LOOP;

  IF v_is_update THEN
    -- Verifica propriedade do orçamento
    IF NOT EXISTS (
      SELECT 1 FROM budgets WHERE id = p_id AND clinic_id = v_clinic_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Orcamento nao encontrado');
    END IF;

    UPDATE budgets
    SET title       = COALESCE(p_title, title),
        notes       = p_notes,
        status      = COALESCE(p_status, status),
        subtotal    = v_subtotal,
        total       = v_subtotal,   -- sem desconto por ora
        valid_until = p_valid_until,
        updated_at  = now()
    WHERE id = p_id AND clinic_id = v_clinic_id
    RETURNING id INTO v_budget_id;

    -- Substitui items (delete + re-insert é mais simples e seguro)
    DELETE FROM budget_items WHERE budget_id = v_budget_id;

  ELSE
    -- Valida que o lead pertence à clínica
    IF NOT EXISTS (
      SELECT 1 FROM leads WHERE id = p_lead_id AND clinic_id = v_clinic_id
    ) THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Lead nao encontrado');
    END IF;

    INSERT INTO budgets (
      clinic_id, lead_id, title, notes,
      status, subtotal, total, valid_until, created_by
    ) VALUES (
      v_clinic_id, p_lead_id,
      NULLIF(trim(COALESCE(p_title, '')), ''),
      p_notes,
      COALESCE(p_status, 'draft'),
      v_subtotal, v_subtotal,
      p_valid_until,
      auth.uid()
    )
    RETURNING id INTO v_budget_id;
  END IF;

  -- Insere items
  FOR v_item IN SELECT value FROM jsonb_array_elements(COALESCE(p_items, '[]'::jsonb)) AS t(value)
  LOOP
    v_qty        := GREATEST(1, COALESCE((v_item->>'quantity')::int, 1));
    v_price      := GREATEST(0, COALESCE((v_item->>'unit_price')::numeric, 0));
    v_item_total := v_qty * v_price;

    INSERT INTO budget_items (budget_id, description, quantity, unit_price, total_price, sort_order)
    VALUES (
      v_budget_id,
      COALESCE(NULLIF(trim(v_item->>'description'), ''), 'Item sem descrição'),
      v_qty,
      v_price,
      v_item_total,
      v_sort
    );
    v_sort := v_sort + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_budget_id, 'is_update', v_is_update);
END;
$$;

-- ── sdr_delete_budget ─────────────────────────────────────────

DROP FUNCTION IF EXISTS public.sdr_delete_budget(uuid);

CREATE OR REPLACE FUNCTION public.sdr_delete_budget(p_budget_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado ou sem clinica');
  END IF;

  -- budget_items tem ON DELETE CASCADE — basta deletar o budget
  DELETE FROM budgets
  WHERE id = p_budget_id AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Orcamento nao encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── sdr_update_budget_status ──────────────────────────────────

DROP FUNCTION IF EXISTS public.sdr_update_budget_status(uuid, text);

CREATE OR REPLACE FUNCTION public.sdr_update_budget_status(
  p_budget_id uuid,
  p_status    text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado ou sem clinica');
  END IF;

  IF p_status NOT IN ('draft','sent','viewed','followup','negotiation','approved','lost') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Status invalido');
  END IF;

  UPDATE budgets
  SET status      = p_status,
      -- Seta timestamps relevantes apenas uma vez
      sent_at     = CASE WHEN p_status = 'sent'     AND sent_at    IS NULL THEN now() ELSE sent_at     END,
      viewed_at   = CASE WHEN p_status = 'viewed'   AND viewed_at  IS NULL THEN now() ELSE viewed_at   END,
      approved_at = CASE WHEN p_status = 'approved' AND approved_at IS NULL THEN now() ELSE approved_at END,
      lost_at     = CASE WHEN p_status = 'lost'     AND lost_at    IS NULL THEN now() ELSE lost_at     END,
      updated_at  = now()
  WHERE id = p_budget_id AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Orcamento nao encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- VERIFICACAO:
--   SELECT sdr_get_budgets('lead_id_aqui');
--   SELECT sdr_upsert_budget(
--     NULL, 'lead_id', 'Implante', NULL, 'draft',
--     '[{"description":"Implante","quantity":1,"unit_price":3500}]', NULL
--   );
-- ============================================================
