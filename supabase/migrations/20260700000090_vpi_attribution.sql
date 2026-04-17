-- ============================================================
-- Migration: VPI UTM + Attribution ROI (Fase 9 - Entrega 1)
--
-- Objetivo: conectar clicks do short-link -> lead criado -> appt
-- fechado, com UTMs. Parceira consegue ver ROI ("voce gerou R$ X").
--
-- Fluxo:
--   1) Short-link redirect chama vpi_track_attribution(partner_id,
--      session_id, utms) gravando attribution pending.
--   2) Lead novo chama vpi_link_attribution_to_lead(session_id, lead)
--      pra vincular ao session_id mais recente do mesmo partner.
--   3) Trigger AFTER UPDATE em vpi_indications WHEN status=closed:
--      marca converted + valor_estimado + appt_id.
--   4) RPC vpi_partner_attribution_summary(partner, days) entrega
--      metricas pra UI do cartao.
--
-- Idempotente.
-- ============================================================

-- ── 1. Tabela vpi_partner_attribution ───────────────────────
CREATE TABLE IF NOT EXISTS public.vpi_partner_attribution (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  partner_id        uuid NOT NULL REFERENCES public.vpi_partners(id) ON DELETE CASCADE,
  session_id        text NOT NULL,
  lead_id           text,
  appt_id           text,
  converted         boolean NOT NULL DEFAULT false,
  valor_estimado    numeric NOT NULL DEFAULT 0,
  source            text,
  medium            text,
  campaign          text,
  content           text,
  clicked_at        timestamptz NOT NULL DEFAULT now(),
  converted_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vpi_attr_partner_clicked
  ON public.vpi_partner_attribution(partner_id, clicked_at DESC);
CREATE INDEX IF NOT EXISTS idx_vpi_attr_session
  ON public.vpi_partner_attribution(session_id);
CREATE INDEX IF NOT EXISTS idx_vpi_attr_lead
  ON public.vpi_partner_attribution(lead_id) WHERE lead_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vpi_attr_converted
  ON public.vpi_partner_attribution(partner_id, converted, converted_at DESC)
  WHERE converted = true;

ALTER TABLE public.vpi_partner_attribution ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='vpi_partner_attribution'
       AND policyname='vpi_attr_all_read'
  ) THEN
    CREATE POLICY vpi_attr_all_read ON public.vpi_partner_attribution
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='vpi_partner_attribution'
       AND policyname='vpi_attr_all_write'
  ) THEN
    CREATE POLICY vpi_attr_all_write ON public.vpi_partner_attribution
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 2. RPC vpi_track_attribution ────────────────────────────
-- Chamada no redirect do short-link (ou via link-tracker).
-- Grava attribution pending com UTMs. Anti-spam: dedup por
-- (partner_id, session_id) via UNIQUE constraint leve.
CREATE OR REPLACE FUNCTION public.vpi_track_attribution(
  p_partner_id uuid,
  p_session_id text,
  p_utm_params jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001';
  v_id     uuid;
  v_exists uuid;
BEGIN
  IF p_partner_id IS NULL OR p_session_id IS NULL OR p_session_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  -- Garantir que partner existe
  IF NOT EXISTS (SELECT 1 FROM public.vpi_partners WHERE id = p_partner_id) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'partner_not_found');
  END IF;

  -- Dedup: se ja existe row com essa (partner, session) nas ultimas 2h, retorna existente
  SELECT id INTO v_exists
    FROM public.vpi_partner_attribution
   WHERE partner_id = p_partner_id
     AND session_id = p_session_id
     AND clicked_at > now() - INTERVAL '2 hours'
   ORDER BY clicked_at DESC
   LIMIT 1;

  IF v_exists IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'id', v_exists, 'deduped', true);
  END IF;

  INSERT INTO public.vpi_partner_attribution (
    clinic_id, partner_id, session_id,
    source, medium, campaign, content, clicked_at
  ) VALUES (
    v_clinic, p_partner_id, p_session_id,
    COALESCE(p_utm_params->>'source',   'vpi'),
    COALESCE(p_utm_params->>'medium',   'partner_card'),
    COALESCE(p_utm_params->>'campaign', 'referral'),
    p_utm_params->>'content',
    now()
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'deduped', false);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_track_attribution(uuid, text, jsonb)
  TO anon, authenticated;

-- ── 3. RPC vpi_link_attribution_to_lead ─────────────────────
-- Quando um lead e criado (modal agendamento, quiz, etc), chamar
-- essa RPC com o session_id capturado na landing page. Vincula
-- ao row mais recente com esse session_id.
CREATE OR REPLACE FUNCTION public.vpi_link_attribution_to_lead(
  p_session_id text,
  p_lead_id    text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_attr public.vpi_partner_attribution%ROWTYPE;
  v_rows int;
BEGIN
  IF p_session_id IS NULL OR p_session_id = '' OR p_lead_id IS NULL OR p_lead_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  SELECT * INTO v_attr
    FROM public.vpi_partner_attribution
   WHERE session_id = p_session_id
     AND lead_id IS NULL
     AND clicked_at > now() - INTERVAL '30 days'
   ORDER BY clicked_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_attribution');
  END IF;

  UPDATE public.vpi_partner_attribution
     SET lead_id = p_lead_id
   WHERE id = v_attr.id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;

  RETURN jsonb_build_object(
    'ok',           true,
    'attribution_id', v_attr.id,
    'partner_id',     v_attr.partner_id,
    'rows',           v_rows
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_link_attribution_to_lead(text, text)
  TO anon, authenticated;

-- ── 4. Trigger: closed indication -> mark attribution converted ─
CREATE OR REPLACE FUNCTION public._vpi_attribution_on_close()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_attr_id  uuid;
  v_valor    numeric;
BEGIN
  IF NEW.status <> 'closed' THEN RETURN NEW; END IF;
  IF OLD.status = 'closed' THEN RETURN NEW; END IF;
  IF NEW.lead_id IS NULL THEN RETURN NEW; END IF;

  -- Busca attribution pending vinculada ao lead
  SELECT id INTO v_attr_id
    FROM public.vpi_partner_attribution
   WHERE lead_id = NEW.lead_id
     AND converted = false
   ORDER BY clicked_at DESC
   LIMIT 1;

  IF v_attr_id IS NULL THEN RETURN NEW; END IF;

  -- Valor estimado: appt.value se houver, fallback R$1200
  v_valor := 1200;
  IF NEW.appt_id IS NOT NULL THEN
    BEGIN
      SELECT COALESCE(NULLIF(a.value, 0), 1200) INTO v_valor
        FROM public.appointments a
       WHERE a.id::text = NEW.appt_id
       LIMIT 1;
    EXCEPTION WHEN OTHERS THEN
      v_valor := 1200;
    END;
  END IF;

  UPDATE public.vpi_partner_attribution
     SET converted      = true,
         valor_estimado = COALESCE(v_valor, 1200),
         converted_at   = now(),
         appt_id        = NEW.appt_id
   WHERE id = v_attr_id;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Fire-and-forget
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_attribution_on_close ON public.vpi_indications;
CREATE TRIGGER trg_vpi_attribution_on_close
  AFTER UPDATE ON public.vpi_indications
  FOR EACH ROW
  EXECUTE FUNCTION public._vpi_attribution_on_close();

-- ── 5. RPC pub summary: stats pro cartao embaixadora ────────
CREATE OR REPLACE FUNCTION public.vpi_partner_attribution_summary(
  p_partner_id  uuid,
  p_period_days int DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_since        timestamptz;
  v_clicks       int;
  v_visitors     int;
  v_leads        int;
  v_conversoes   int;
  v_valor_total  numeric;
  v_ctr          numeric;
  v_is_top_10    boolean := false;
  v_all_ranked   int;
  v_partner_rank int;
BEGIN
  IF p_partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  v_since := now() - (GREATEST(1, COALESCE(p_period_days, 30)) || ' days')::interval;

  SELECT
    COUNT(*)::int,
    COUNT(DISTINCT session_id)::int,
    COUNT(DISTINCT lead_id) FILTER (WHERE lead_id IS NOT NULL)::int,
    COUNT(*) FILTER (WHERE converted = true)::int,
    COALESCE(SUM(valor_estimado) FILTER (WHERE converted = true), 0)
  INTO v_clicks, v_visitors, v_leads, v_conversoes, v_valor_total
  FROM public.vpi_partner_attribution
  WHERE partner_id = p_partner_id
    AND clicked_at >= v_since;

  v_ctr := CASE WHEN v_clicks > 0
                THEN ROUND((v_leads::numeric / v_clicks) * 100, 2)
                ELSE 0 END;

  -- Top 10% ranking (por valor_total no periodo)
  BEGIN
    SELECT COUNT(*) INTO v_all_ranked
      FROM public.vpi_partner_attribution
     WHERE clicked_at >= v_since;

    IF v_all_ranked > 0 THEN
      SELECT rank INTO v_partner_rank FROM (
        SELECT partner_id,
               RANK() OVER (ORDER BY SUM(valor_estimado) FILTER (WHERE converted = true) DESC) AS rank
          FROM public.vpi_partner_attribution
         WHERE clicked_at >= v_since
         GROUP BY partner_id
      ) t WHERE partner_id = p_partner_id;

      IF v_partner_rank IS NOT NULL THEN
        v_is_top_10 := (
          v_partner_rank <= GREATEST(1, CEIL(v_all_ranked * 0.1))
          AND v_valor_total > 0
        );
      END IF;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_is_top_10 := false;
  END;

  RETURN jsonb_build_object(
    'ok',             true,
    'period_days',    COALESCE(p_period_days, 30),
    'clicks_total',   v_clicks,
    'visitors_unicos', v_visitors,
    'leads_gerados',  v_leads,
    'conversoes',     v_conversoes,
    'valor_total',    v_valor_total,
    'ctr_pct',        v_ctr,
    'is_top_10',      v_is_top_10
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_partner_attribution_summary(uuid, int)
  TO anon, authenticated;

-- ── 6. RPC publica por token (pro cartao) ───────────────────
CREATE OR REPLACE FUNCTION public.vpi_pub_attribution_summary(
  p_token       text,
  p_period_days int DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner_id uuid;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_token');
  END IF;

  SELECT id INTO v_partner_id
    FROM public.vpi_partners
   WHERE card_token = p_token;

  IF v_partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  RETURN public.vpi_partner_attribution_summary(v_partner_id, p_period_days);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_pub_attribution_summary(text, int)
  TO anon, authenticated;

-- ── 7. RPC publica por token pro tracking (client-side) ─────
-- Permite gravar attribution a partir do cartao sem expor partner_id.
CREATE OR REPLACE FUNCTION public.vpi_pub_track_attribution(
  p_token      text,
  p_session_id text,
  p_utm_params jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner_id uuid;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_token');
  END IF;
  IF p_session_id IS NULL OR p_session_id = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_session');
  END IF;

  SELECT id INTO v_partner_id
    FROM public.vpi_partners
   WHERE card_token = p_token;

  IF v_partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  RETURN public.vpi_track_attribution(v_partner_id, p_session_id, COALESCE(p_utm_params, '{}'::jsonb));
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_pub_track_attribution(text, text, jsonb)
  TO anon, authenticated;

COMMENT ON TABLE public.vpi_partner_attribution IS
  'Attribution: click no short-link -> lead -> conversao. Fase 9 Entrega 1.';
COMMENT ON FUNCTION public.vpi_track_attribution(uuid, text, jsonb) IS
  'Registra click attributado no short-link. Chamada do redirect (r.html). Fase 9.';
COMMENT ON FUNCTION public.vpi_link_attribution_to_lead(text, text) IS
  'Vincula lead novo ao session_id mais recente. Fase 9.';
COMMENT ON FUNCTION public.vpi_partner_attribution_summary(uuid, int) IS
  'Summary de attribution por partner: clicks, leads, conversoes, valor, CTR, top 10. Fase 9.';
