-- ============================================================
-- Migration: B2B Painel Público do Parceiro (WOW #2) + Geo (WOW #3)
--
-- Objetivo:
--   W2 — Painel público read-only: link com token para o parceiro
--        acompanhar vouchers, métricas e próximos eventos sem login.
--   W3 — Mapa vivo: coluna lat/lng pra plotar parcerias em Maringá.
--
-- Idempotente. RLS permissiva. SECURITY DEFINER nas RPCs públicas.
-- ============================================================

-- ── 1. Colunas novas em b2b_partnerships ────────────────────
ALTER TABLE public.b2b_partnerships
  ADD COLUMN IF NOT EXISTS public_token text NULL,
  ADD COLUMN IF NOT EXISTS lat          numeric NULL,
  ADD COLUMN IF NOT EXISTS lng          numeric NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ux_b2b_partnerships_public_token
  ON public.b2b_partnerships (public_token) WHERE public_token IS NOT NULL;

COMMENT ON COLUMN public.b2b_partnerships.public_token IS
  'Token curto pra link público do painel do parceiro (WOW #2). Gerado sob demanda via b2b_partner_panel_issue_token.';
COMMENT ON COLUMN public.b2b_partnerships.lat IS
  'Latitude (decimal) pra mapa vivo (WOW #3). Nullable até geocoding.';
COMMENT ON COLUMN public.b2b_partnerships.lng IS
  'Longitude (decimal) pra mapa vivo (WOW #3).';


-- ── 2. Emitir / rotacionar token público ────────────────────
CREATE OR REPLACE FUNCTION public.b2b_partner_panel_issue_token(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_token text;
  v_try int := 0;
BEGIN
  PERFORM 1 FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id AND id = p_partnership_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  LOOP
    v_token := lower(substr(md5(random()::text || clock_timestamp()::text || p_partnership_id::text), 1, 12));
    BEGIN
      UPDATE public.b2b_partnerships
         SET public_token = v_token, updated_at = now()
       WHERE clinic_id = v_clinic_id AND id = p_partnership_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_try := v_try + 1;
      IF v_try > 5 THEN RAISE; END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'token', v_token);
END $$;


-- ── 3. Buscar dados do painel por token (público) ───────────
CREATE OR REPLACE FUNCTION public.b2b_partner_panel_get(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_p         public.b2b_partnerships%ROWTYPE;
  v_vouchers  jsonb;
  v_funnel    jsonb;
  v_events    jsonb;
  v_targets   jsonb;
BEGIN
  SELECT * INTO v_p FROM public.b2b_partnerships WHERE public_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_token');
  END IF;

  -- vouchers: só contadores agregados (sem dados sensíveis)
  SELECT jsonb_build_object(
    'issued',    COUNT(*) FILTER (WHERE status IN ('issued','delivered','opened','redeemed','expired')),
    'delivered', COUNT(*) FILTER (WHERE status IN ('delivered','opened','redeemed')),
    'opened',    COUNT(*) FILTER (WHERE status IN ('opened','redeemed')),
    'redeemed',  COUNT(*) FILTER (WHERE status = 'redeemed'),
    'expired',   COUNT(*) FILTER (WHERE status = 'expired')
  ) INTO v_funnel
    FROM public.b2b_vouchers WHERE partnership_id = v_p.id;

  -- últimos 5 vouchers (só combo+status+datas, sem telefone/CPF)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'combo', combo,
    'status', status,
    'issued_at', issued_at,
    'redeemed_at', redeemed_at
  ) ORDER BY issued_at DESC), '[]'::jsonb)
    INTO v_vouchers
    FROM (
      SELECT combo, status, issued_at, redeemed_at
        FROM public.b2b_vouchers
       WHERE partnership_id = v_p.id
       ORDER BY issued_at DESC
       LIMIT 5
    ) v;

  -- próximos 3 eventos
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'title', title,
    'next_occurrence', next_occurrence,
    'status', status
  ) ORDER BY next_occurrence ASC NULLS LAST), '[]'::jsonb)
    INTO v_events
    FROM (
      SELECT title, next_occurrence, status
        FROM public.b2b_partnership_events
       WHERE partnership_id = v_p.id
         AND (next_occurrence IS NULL OR next_occurrence >= current_date)
       ORDER BY next_occurrence ASC NULLS LAST
       LIMIT 3
    ) e;

  -- targets (metas pactuadas)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'indicator', indicator,
    'target_value', target_value,
    'cadence', cadence,
    'benefit_label', benefit_label
  ) ORDER BY sort_order), '[]'::jsonb)
    INTO v_targets
    FROM public.b2b_partnership_targets WHERE partnership_id = v_p.id;

  RETURN jsonb_build_object(
    'ok', true,
    'partnership', jsonb_build_object(
      'id',             v_p.id,
      'name',           v_p.name,
      'slogans',        v_p.slogans,
      'pillar',         v_p.pillar,
      'tier',           v_p.tier,
      'emotional_trigger', v_p.emotional_trigger,
      'narrative_quote', v_p.narrative_quote,
      'narrative_author', v_p.narrative_author,
      'status',         v_p.status,
      'health_color',   v_p.health_color,
      'since',          v_p.created_at
    ),
    'funnel',   v_funnel,
    'vouchers', v_vouchers,
    'events',   v_events,
    'targets',  v_targets
  );
END $$;


-- ── 4. Revogar token (rotaciona / desativa) ─────────────────
CREATE OR REPLACE FUNCTION public.b2b_partner_panel_revoke(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  UPDATE public.b2b_partnerships
     SET public_token = NULL, updated_at = now()
   WHERE clinic_id = v_clinic_id AND id = p_partnership_id;
  RETURN jsonb_build_object('ok', true);
END $$;


-- ── 5. Geo — lista parcerias com coord (mapa) ───────────────
CREATE OR REPLACE FUNCTION public.b2b_partnerships_geo_list()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',           id,
    'name',         name,
    'slug',         slug,
    'pillar',       pillar,
    'tier',         tier,
    'status',       status,
    'health_color', health_color,
    'lat',          lat,
    'lng',          lng
  ) ORDER BY tier NULLS LAST, name), '[]'::jsonb)
    INTO v_out
    FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id
     AND lat IS NOT NULL AND lng IS NOT NULL
     AND status NOT IN ('closed');
  RETURN v_out;
END $$;


-- ── 6. Atualizar coord (admin) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_partnership_set_geo(
  p_partnership_id uuid, p_lat numeric, p_lng numeric
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  UPDATE public.b2b_partnerships
     SET lat = p_lat, lng = p_lng, updated_at = now()
   WHERE clinic_id = v_clinic_id AND id = p_partnership_id;
  RETURN jsonb_build_object('ok', true);
END $$;


-- ── Grants ──────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.b2b_partner_panel_issue_token(uuid)    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_partner_panel_get(text)            TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_partner_panel_revoke(uuid)         TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_partnerships_geo_list()            TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_partnership_set_geo(uuid, numeric, numeric) TO anon, authenticated, service_role;
