-- ============================================================
-- Migration: B2B Vouchers — Fase 2
--
-- Sistema de voucher digital QR. Tracking em 4 estágios:
--   issued → delivered → opened → redeemed (ou expired)
--
-- ID público (token) curto-rastreável pra landing page.
-- Zero cruzamento com vouchers antigos (VPI usa card_token próprio).
-- ============================================================

CREATE TABLE IF NOT EXISTS public.b2b_vouchers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,

  -- Contexto
  partnership_id  uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  combo           text NOT NULL,                  -- ex: 'veu_noiva+anovator'

  -- Destinatário
  recipient_name  text NULL,
  recipient_cpf   text NULL,
  recipient_phone text NULL,

  -- Público (pra landing)
  token           text NOT NULL,                  -- curto, gerado
  valid_until     timestamptz NOT NULL,

  -- Status rastreável
  status          text NOT NULL DEFAULT 'issued'
                  CHECK (status IN ('issued','delivered','opened','redeemed','expired','cancelled')),
  issued_at       timestamptz NOT NULL DEFAULT now(),
  delivered_at    timestamptz NULL,
  opened_at       timestamptz NULL,
  redeemed_at     timestamptz NULL,

  -- Vinculo clínica (pós uso)
  redeemed_by_appointment_id text NULL,
  redeemed_by_operator       text NULL,
  notes           text NULL,

  -- Audit
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  UNIQUE (clinic_id, token)
);

CREATE INDEX IF NOT EXISTS idx_b2b_vouchers_partnership
  ON public.b2b_vouchers (partnership_id, status);
CREATE INDEX IF NOT EXISTS idx_b2b_vouchers_status
  ON public.b2b_vouchers (clinic_id, status, valid_until);
CREATE INDEX IF NOT EXISTS idx_b2b_vouchers_token
  ON public.b2b_vouchers (token);

ALTER TABLE public.b2b_vouchers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_vouchers_all" ON public.b2b_vouchers;
CREATE POLICY "b2b_vouchers_all" ON public.b2b_vouchers FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_b2b_vouchers_upd ON public.b2b_vouchers;
CREATE TRIGGER trg_b2b_vouchers_upd
  BEFORE UPDATE ON public.b2b_vouchers
  FOR EACH ROW EXECUTE FUNCTION public._b2b_set_updated_at();


-- ═══════════════ RPCs ═══════════════

-- ── Emitir voucher ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_voucher_issue(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_partnership_id uuid;
  v_combo text;
  v_validity int;
  v_token text;
  v_id uuid;
  v_try int := 0;
BEGIN
  v_partnership_id := NULLIF(p_payload->>'partnership_id','')::uuid;
  IF v_partnership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_id_required');
  END IF;

  -- Combo e validade: usa do payload ou herda da parceria
  SELECT voucher_validity_days INTO v_validity FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id AND id = v_partnership_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  v_combo := COALESCE(p_payload->>'combo',
              (SELECT voucher_combo FROM public.b2b_partnerships WHERE id = v_partnership_id),
              'voucher_default');
  v_validity := COALESCE(NULLIF(p_payload->>'validity_days','')::int, v_validity, 30);

  -- Token curto (8 chars base36, retry em colisão)
  LOOP
    v_token := lower(substr(md5(random()::text || clock_timestamp()::text), 1, 8));
    BEGIN
      INSERT INTO public.b2b_vouchers (
        clinic_id, partnership_id, combo,
        recipient_name, recipient_cpf, recipient_phone,
        token, valid_until,
        status, notes
      ) VALUES (
        v_clinic_id, v_partnership_id, v_combo,
        p_payload->>'recipient_name',
        p_payload->>'recipient_cpf',
        p_payload->>'recipient_phone',
        v_token,
        now() + (v_validity || ' days')::interval,
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
                            'valid_until', now() + (v_validity || ' days')::interval);
END $$;

-- ── Marcar entregue (parceiro confirma) ─────────────────────
CREATE OR REPLACE FUNCTION public.b2b_voucher_mark_delivered(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  UPDATE public.b2b_vouchers
     SET status = CASE WHEN status = 'issued' THEN 'delivered' ELSE status END,
         delivered_at = COALESCE(delivered_at, now()), updated_at = now()
   WHERE clinic_id = v_clinic_id AND id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── Consultar por token (landing page público) ──────────────
CREATE OR REPLACE FUNCTION public.b2b_voucher_get_by_token(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
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

-- ── Resgatar (uso no finalize do agendamento) ───────────────
CREATE OR REPLACE FUNCTION public.b2b_voucher_redeem(
  p_token text, p_appointment_id text DEFAULT NULL, p_operator text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_row public.b2b_vouchers%ROWTYPE;
BEGIN
  SELECT * INTO v_row FROM public.b2b_vouchers
   WHERE clinic_id = v_clinic_id AND token = p_token;

  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;
  IF v_row.status = 'redeemed' THEN RETURN jsonb_build_object('ok', false, 'error', 'already_redeemed', 'redeemed_at', v_row.redeemed_at); END IF;
  IF v_row.status IN ('expired','cancelled') THEN RETURN jsonb_build_object('ok', false, 'error', v_row.status); END IF;
  IF v_row.valid_until < now() THEN
    UPDATE public.b2b_vouchers SET status='expired' WHERE id = v_row.id;
    RETURN jsonb_build_object('ok', false, 'error', 'expired');
  END IF;

  UPDATE public.b2b_vouchers SET
    status = 'redeemed',
    redeemed_at = now(),
    redeemed_by_appointment_id = p_appointment_id,
    redeemed_by_operator = p_operator,
    updated_at = now()
  WHERE id = v_row.id;

  RETURN jsonb_build_object('ok', true, 'id', v_row.id, 'combo', v_row.combo,
                            'partnership_id', v_row.partnership_id);
END $$;

-- ── Cancelar voucher ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_voucher_cancel(p_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  UPDATE public.b2b_vouchers
     SET status = 'cancelled',
         notes = COALESCE(p_reason, notes),
         updated_at = now()
   WHERE clinic_id = v_clinic_id AND id = p_id AND status NOT IN ('redeemed','expired');
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── Listar por parceria ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_voucher_list_by_partnership(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(v) ORDER BY v.issued_at DESC), '[]'::jsonb)
    INTO v_out
    FROM public.b2b_vouchers v
   WHERE v.clinic_id = v_clinic_id AND v.partnership_id = p_partnership_id;
  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;

-- ── KPI de vouchers por parceria ────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_voucher_funnel(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out       jsonb;
BEGIN
  SELECT jsonb_build_object(
    'issued',    COUNT(*) FILTER (WHERE status IN ('issued','delivered','opened','redeemed','expired')),
    'delivered', COUNT(*) FILTER (WHERE status IN ('delivered','opened','redeemed')),
    'opened',    COUNT(*) FILTER (WHERE status IN ('opened','redeemed')),
    'redeemed',  COUNT(*) FILTER (WHERE status = 'redeemed'),
    'expired',   COUNT(*) FILTER (WHERE status = 'expired'),
    'cancelled', COUNT(*) FILTER (WHERE status = 'cancelled')
  ) INTO v_out
  FROM public.b2b_vouchers
  WHERE clinic_id = v_clinic_id AND partnership_id = p_partnership_id;
  RETURN COALESCE(v_out, '{}'::jsonb);
END $$;

-- ── Grants ──────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_vouchers TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_voucher_issue(jsonb)                     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_voucher_mark_delivered(uuid)             TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_voucher_get_by_token(text)               TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_voucher_redeem(text, text, text)         TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_voucher_cancel(uuid, text)               TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_voucher_list_by_partnership(uuid)        TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_voucher_funnel(uuid)                     TO anon, authenticated, service_role;
