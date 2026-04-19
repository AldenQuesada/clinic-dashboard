-- ============================================================
-- Migration: coluna theme em b2b_vouchers
-- Permite admin escolher dark/light por voucher.
-- ============================================================

ALTER TABLE public.b2b_vouchers
  ADD COLUMN IF NOT EXISTS theme text NOT NULL DEFAULT 'dark'
    CHECK (theme IN ('dark','light'));

COMMENT ON COLUMN public.b2b_vouchers.theme IS
  'Paleta visual da landing do voucher. dark = preto/champagne (default); light = creme/bordô.';


-- ── Update b2b_voucher_issue pra aceitar theme ──────────────
CREATE OR REPLACE FUNCTION public.b2b_voucher_issue(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_partnership_id uuid;
  v_combo text;
  v_validity int;
  v_theme text;
  v_token text;
  v_id uuid;
  v_try int := 0;
BEGIN
  v_partnership_id := NULLIF(p_payload->>'partnership_id','')::uuid;
  IF v_partnership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_id_required');
  END IF;

  SELECT voucher_validity_days INTO v_validity FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id AND id = v_partnership_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  v_combo := COALESCE(p_payload->>'combo',
              (SELECT voucher_combo FROM public.b2b_partnerships WHERE id = v_partnership_id),
              'voucher_default');
  v_validity := COALESCE(NULLIF(p_payload->>'validity_days','')::int, v_validity, 30);
  v_theme := COALESCE(NULLIF(p_payload->>'theme',''), 'dark');
  IF v_theme NOT IN ('dark','light') THEN v_theme := 'dark'; END IF;

  LOOP
    v_token := lower(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    BEGIN
      INSERT INTO public.b2b_vouchers (
        clinic_id, partnership_id, combo,
        recipient_name, recipient_cpf, recipient_phone,
        token, valid_until, theme,
        status, notes
      ) VALUES (
        v_clinic_id, v_partnership_id, v_combo,
        p_payload->>'recipient_name',
        p_payload->>'recipient_cpf',
        p_payload->>'recipient_phone',
        v_token,
        now() + (v_validity || ' days')::interval,
        v_theme,
        'issued',
        p_payload->>'notes'
      ) RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_try := v_try + 1;
      IF v_try > 5 THEN RAISE; END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'token', v_token,
                            'theme', v_theme,
                            'valid_until', now() + (v_validity || ' days')::interval);
END $$;


-- ── Update b2b_voucher_get_by_token pra retornar theme ──────
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
    'theme', v.theme,
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

  UPDATE public.b2b_vouchers
     SET status = CASE WHEN status IN ('issued','delivered') THEN 'opened' ELSE status END,
         opened_at = COALESCE(opened_at, now())
   WHERE id = v_id;

  RETURN jsonb_build_object('ok', true, 'voucher', v_out);
END $$;


-- ── RPC: mudar theme sem re-emitir ──────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_voucher_set_theme(p_id uuid, p_theme text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF p_theme NOT IN ('dark','light') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_theme');
  END IF;
  UPDATE public.b2b_vouchers
     SET theme = p_theme, updated_at = now()
   WHERE clinic_id = v_clinic_id AND id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;


GRANT EXECUTE ON FUNCTION public.b2b_voucher_issue(jsonb)           TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_voucher_get_by_token(text)     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_voucher_set_theme(uuid, text)  TO anon, authenticated, service_role;
