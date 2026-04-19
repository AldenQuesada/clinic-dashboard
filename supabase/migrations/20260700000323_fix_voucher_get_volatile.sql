-- ============================================================
-- Hotfix: b2b_voucher_get_by_token precisa ser VOLATILE
-- porque faz UPDATE (marca opened_at na 1a vez que abre)
--
-- Antes estava STABLE → Postgres rejeita com
-- "UPDATE is not allowed in a non-volatile function"
-- ============================================================

CREATE OR REPLACE FUNCTION public.b2b_voucher_get_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_out jsonb;
  v_id uuid;
BEGIN
  SELECT v.id, jsonb_build_object(
    'id', v.id,
    'token', v.token,
    'combo', v.combo,
    'recipient_name', v.recipient_name,
    'valid_until', v.valid_until,
    'status', v.status,
    'partnership', jsonb_build_object(
      'id', p.id, 'name', p.name, 'slogans', p.slogans, 'pillar', p.pillar
    )
  )
  INTO v_id, v_out
    FROM public.b2b_vouchers v
    JOIN public.b2b_partnerships p ON p.id = v.partnership_id
   WHERE v.token = p_token;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  -- Marca como 'opened' na primeira vez
  UPDATE public.b2b_vouchers
     SET status = CASE WHEN status IN ('issued','delivered') THEN 'opened' ELSE status END,
         opened_at = COALESCE(opened_at, now())
   WHERE id = v_id;

  RETURN jsonb_build_object('ok', true, 'voucher', v_out);
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_voucher_get_by_token(text) TO anon, authenticated, service_role;
