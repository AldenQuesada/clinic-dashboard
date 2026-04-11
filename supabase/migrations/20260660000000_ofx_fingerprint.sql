-- Camada 1 reformulada: fingerprint semantica em vez de hash de bytes.
-- Fingerprint = qtd | first_date | last_date | total_credits | total_debits
-- Invariante a DTSERVER e qualquer mudanca cosmetica do arquivo.

ALTER TABLE public.ofx_imports
  ADD COLUMN IF NOT EXISTS fingerprint text;

-- Unique index parcial (so linhas vivas)
DROP INDEX IF EXISTS ofx_imports_fingerprint_unique;
CREATE UNIQUE INDEX ofx_imports_fingerprint_unique
  ON public.ofx_imports (clinic_id, fingerprint)
  WHERE fingerprint IS NOT NULL AND deleted_at IS NULL;

-- ── RPC: ofx_check_fingerprint ─────────────────────────────
CREATE OR REPLACE FUNCTION public.ofx_check_fingerprint(p_fingerprint text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  v_rec       record;
BEGIN
  IF p_fingerprint IS NULL OR LENGTH(p_fingerprint) < 8 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_fingerprint');
  END IF;

  SELECT file_name, imported_at, row_count, first_date, last_date, total_credits, total_debits
  INTO v_rec
  FROM public.ofx_imports
  WHERE clinic_id = v_clinic_id
    AND fingerprint = p_fingerprint
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

GRANT EXECUTE ON FUNCTION public.ofx_check_fingerprint(text) TO authenticated, anon;

-- ── Atualiza ofx_register_import pra aceitar fingerprint ───
CREATE OR REPLACE FUNCTION public.ofx_register_import(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := COALESCE(public._sdr_clinic_id(), '00000000-0000-0000-0000-000000000001'::uuid);
  v_id uuid;
  v_fingerprint text := NULLIF(p_data->>'fingerprint','');
BEGIN
  -- Se tem fingerprint, usa como chave de dedupe (camada 1 semantica)
  IF v_fingerprint IS NOT NULL THEN
    INSERT INTO public.ofx_imports (
      clinic_id, file_hash, file_name, file_size, fingerprint, row_count,
      first_date, last_date, total_credits, total_debits, imported_by
    ) VALUES (
      v_clinic_id,
      p_data->>'file_hash',
      p_data->>'file_name',
      NULLIF((p_data->>'file_size')::bigint, NULL),
      v_fingerprint,
      NULLIF((p_data->>'row_count')::int, NULL),
      NULLIF((p_data->>'first_date')::date, NULL),
      NULLIF((p_data->>'last_date')::date, NULL),
      NULLIF((p_data->>'total_credits')::numeric, NULL),
      NULLIF((p_data->>'total_debits')::numeric, NULL),
      auth.uid()
    )
    ON CONFLICT (clinic_id, fingerprint)
      WHERE fingerprint IS NOT NULL AND deleted_at IS NULL
    DO UPDATE SET
      imported_at = now(),
      row_count = EXCLUDED.row_count,
      file_name = EXCLUDED.file_name,
      file_hash = EXCLUDED.file_hash
    RETURNING id INTO v_id;
  ELSE
    -- Fallback: sem fingerprint, usa hash (compat)
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
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.ofx_register_import(jsonb) TO authenticated, anon;

COMMENT ON COLUMN public.ofx_imports.fingerprint IS 'Camada 1 semantica: qtd|first_date|last_date|total_credits|total_debits';
COMMENT ON FUNCTION public.ofx_check_fingerprint(text) IS 'Mira/OFX: checa duplicata por fingerprint semantica (invariante a re-export)';
