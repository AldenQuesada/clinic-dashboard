-- Multi-camada dedupe OFX:
--   1. Hash do arquivo inteiro — bloqueia re-upload do mesmo .ofx
--   2. FITID por transacao — ja existe (ON CONFLICT em cashflow_create_entry)
--   3. Signature (data + valor + descricao normalizada) — bloqueia duplicata
--      mesmo quando banco gera novo FITID ao re-exportar

-- ── 1. Tabela ofx_imports ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ofx_imports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL,
  file_hash     text NOT NULL,
  file_name     text,
  file_size     bigint,
  row_count     int,
  first_date    date,
  last_date     date,
  total_credits numeric(12,2),
  total_debits  numeric(12,2),
  imported_by   uuid,
  imported_at   timestamptz DEFAULT now(),
  deleted_at    timestamptz,
  CONSTRAINT ofx_imports_hash_unique UNIQUE (clinic_id, file_hash)
);

CREATE INDEX IF NOT EXISTS ofx_imports_clinic_idx ON public.ofx_imports (clinic_id, imported_at DESC);

ALTER TABLE public.ofx_imports ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ofx_imports_clinic_read ON public.ofx_imports;
CREATE POLICY ofx_imports_clinic_read ON public.ofx_imports
  FOR SELECT TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS ofx_imports_clinic_write ON public.ofx_imports;
CREATE POLICY ofx_imports_clinic_write ON public.ofx_imports
  FOR INSERT TO authenticated, anon
  WITH CHECK (true);

-- ── 2. Coluna signature em cashflow_entries ───────────────
ALTER TABLE public.cashflow_entries
  ADD COLUMN IF NOT EXISTS signature text;

-- Unique index parcial — so aplica em OFX vivo com signature
CREATE UNIQUE INDEX IF NOT EXISTS cashflow_entries_ofx_signature_unique
  ON public.cashflow_entries (clinic_id, signature)
  WHERE source = 'ofx_import' AND deleted_at IS NULL AND signature IS NOT NULL;

-- ── 3. RPC: ofx_check_file_hash ────────────────────────────
-- Retorna se o hash ja foi importado. Chamada ANTES do parse.
CREATE OR REPLACE FUNCTION public.ofx_check_file_hash(p_file_hash text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  v_rec       record;
BEGIN
  IF p_file_hash IS NULL OR LENGTH(p_file_hash) < 32 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_hash');
  END IF;

  SELECT file_name, imported_at, row_count, first_date, last_date, total_credits, total_debits
  INTO v_rec
  FROM public.ofx_imports
  WHERE clinic_id = v_clinic_id
    AND file_hash = p_file_hash
    AND deleted_at IS NULL
  ORDER BY imported_at DESC
  LIMIT 1;

  IF v_rec IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'duplicated', false);
  END IF;

  RETURN jsonb_build_object(
    'ok',            true,
    'duplicated',    true,
    'file_name',     v_rec.file_name,
    'imported_at',   v_rec.imported_at,
    'row_count',     v_rec.row_count,
    'first_date',    v_rec.first_date,
    'last_date',     v_rec.last_date,
    'total_credits', v_rec.total_credits,
    'total_debits',  v_rec.total_debits
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.ofx_check_file_hash(text) TO authenticated, anon;

-- ── 4. RPC: ofx_register_import ────────────────────────────
-- Grava metadata do arquivo apos import bem-sucedido.
CREATE OR REPLACE FUNCTION public.ofx_register_import(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  v_id uuid;
BEGIN
  INSERT INTO public.ofx_imports (
    clinic_id, file_hash, file_name, file_size, row_count,
    first_date, last_date, total_credits, total_debits, imported_by
  ) VALUES (
    v_clinic_id,
    p_data->>'file_hash',
    p_data->>'file_name',
    NULLIF((p_data->>'file_size')::bigint, NULL),
    NULLIF((p_data->>'row_count')::int, NULL),
    NULLIF((p_data->>'first_date')::date, NULL),
    NULLIF((p_data->>'last_date')::date, NULL),
    NULLIF((p_data->>'total_credits')::numeric, NULL),
    NULLIF((p_data->>'total_debits')::numeric, NULL),
    auth.uid()
  )
  ON CONFLICT (clinic_id, file_hash) DO UPDATE
    SET imported_at = now(),
        row_count = EXCLUDED.row_count
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ofx_register_import(jsonb) TO authenticated, anon;

-- ── 5. Atualiza cashflow_create_entry pra persistir signature ────
-- Pega o signature do payload e grava. Unique index (clinic_id, signature)
-- pra source=ofx_import impede duplicatas em um nivel diferente do FITID.
CREATE OR REPLACE FUNCTION public.cashflow_create_entry(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  v_id        uuid;
  v_user_id   uuid := auth.uid();
  v_sig       text := NULLIF(p_data->>'signature','');
  v_source    text := COALESCE(p_data->>'source', 'manual');
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado');
  END IF;

  -- Camada 3: se tem signature, checar se ja existe
  IF v_sig IS NOT NULL AND v_source = 'ofx_import' THEN
    SELECT id INTO v_id
    FROM public.cashflow_entries
    WHERE clinic_id = v_clinic_id
      AND source = 'ofx_import'
      AND signature = v_sig
      AND deleted_at IS NULL
    LIMIT 1;

    IF v_id IS NOT NULL THEN
      RETURN jsonb_build_object('ok', true, 'id', v_id, 'duplicated', true, 'reason', 'signature_match');
    END IF;
  END IF;

  INSERT INTO public.cashflow_entries (
    clinic_id, transaction_date, transaction_datetime,
    direction, amount, payment_method, description, category,
    source, external_id, signature, raw_data,
    patient_id, appointment_id, match_confidence,
    installment_number, installment_total, parent_entry_id,
    created_by
  ) VALUES (
    v_clinic_id,
    COALESCE((p_data->>'transaction_date')::date, CURRENT_DATE),
    NULLIF(p_data->>'transaction_datetime','')::timestamptz,
    COALESCE(p_data->>'direction', 'credit'),
    COALESCE((p_data->>'amount')::numeric, 0),
    COALESCE(p_data->>'payment_method', 'other'),
    NULLIF(p_data->>'description',''),
    NULLIF(p_data->>'category',''),
    v_source,
    NULLIF(p_data->>'external_id',''),
    v_sig,
    COALESCE(p_data->'raw_data', '{}'::jsonb),
    NULLIF(p_data->>'patient_id','')::uuid,
    NULLIF(p_data->>'appointment_id',''),
    COALESCE(p_data->>'match_confidence', 'none'),
    NULLIF((p_data->>'installment_number')::int, NULL),
    NULLIF((p_data->>'installment_total')::int, NULL),
    NULLIF(p_data->>'parent_entry_id','')::uuid,
    v_user_id
  )
  ON CONFLICT (source, external_id) WHERE external_id IS NOT NULL AND deleted_at IS NULL
  DO NOTHING
  RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    -- Camada 1: FITID conflict
    SELECT id INTO v_id
    FROM public.cashflow_entries
    WHERE source = v_source
      AND external_id = NULLIF(p_data->>'external_id','')
      AND deleted_at IS NULL
    LIMIT 1;
    RETURN jsonb_build_object('ok', true, 'id', v_id, 'duplicated', true, 'reason', 'fitid_match');
  END IF;

  IF (p_data->>'appointment_id') IS NOT NULL AND (p_data->>'appointment_id') != '' THEN
    UPDATE public.cashflow_entries
    SET reconciled_at = now(),
        reconciled_by = v_user_id
    WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'duplicated', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cashflow_create_entry(jsonb) TO authenticated, anon;

COMMENT ON TABLE  public.ofx_imports              IS 'Tracking de uploads OFX (camada 1: file hash dedupe)';
COMMENT ON COLUMN public.cashflow_entries.signature IS 'Camada 3: hash normalizado data+valor+descricao pra dedupe mesmo sem FITID';
COMMENT ON FUNCTION public.ofx_check_file_hash(text) IS 'Verifica se um hash SHA-256 de OFX ja foi importado (camada 1)';
COMMENT ON FUNCTION public.ofx_register_import(jsonb) IS 'Registra metadata do OFX importado apos sucesso';
