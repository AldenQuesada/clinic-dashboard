-- ============================================================
-- Migration: B2B Attributions — Registro & Conversão
--
-- Cada voucher emitido vira uma linha na b2b_attributions.
-- Cron diário cruza telefone com appointments da clínica
-- e atualiza status: referred → matched → converted.
--
-- Permite medir ROI REAL de cada parceria:
--   - Quantos leads indicou?
--   - Quantos foram à clínica?
--   - Quantos converteram em procedimento?
--   - Quanto faturou?
--   - Qual o ROI líquido (revenue - cost)?
--
-- Idempotente. RLS permissiva.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.b2b_attributions (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id          uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  partnership_id     uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  voucher_id         uuid NULL REFERENCES public.b2b_vouchers(id) ON DELETE SET NULL,

  -- Dados do lead no momento da emissão
  lead_name          text NULL,
  lead_phone         text NULL,
  lead_phone_last8   text GENERATED ALWAYS AS (
    CASE WHEN lead_phone IS NOT NULL
      THEN right(regexp_replace(lead_phone, '\D', '', 'g'), 8)
      ELSE NULL END
  ) STORED,

  -- Origem: wa_mira | admin_manual | import
  source             text NOT NULL DEFAULT 'admin_manual',

  -- Status da jornada
  status             text NOT NULL DEFAULT 'referred'
                     CHECK (status IN ('referred','matched','converted','lost')),

  -- Cruzamentos com appointments
  first_appointment_id     text NULL,
  first_appointment_at     timestamptz NULL,
  converted_appointment_ids text[] NULL,

  -- Receita atribuída
  revenue_brl        numeric NOT NULL DEFAULT 0,

  -- Audit
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  last_scan_at       timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_b2b_attr_partnership
  ON public.b2b_attributions (partnership_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_attr_phone
  ON public.b2b_attributions (clinic_id, lead_phone_last8) WHERE lead_phone_last8 IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_b2b_attr_voucher
  ON public.b2b_attributions (voucher_id) WHERE voucher_id IS NOT NULL;

ALTER TABLE public.b2b_attributions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_attributions_all" ON public.b2b_attributions;
CREATE POLICY "b2b_attributions_all" ON public.b2b_attributions FOR ALL USING (true) WITH CHECK (true);

DROP TRIGGER IF EXISTS trg_b2b_attr_upd ON public.b2b_attributions;
CREATE TRIGGER trg_b2b_attr_upd
  BEFORE UPDATE ON public.b2b_attributions
  FOR EACH ROW EXECUTE FUNCTION public._b2b_set_updated_at();


-- ════════════════════════════════════════════════════════════
-- Trigger: voucher emitido → cria attribution automaticamente
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._b2b_attribution_from_voucher()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.b2b_attributions (
      clinic_id, partnership_id, voucher_id,
      lead_name, lead_phone,
      source, status
    ) VALUES (
      NEW.clinic_id, NEW.partnership_id, NEW.id,
      NEW.recipient_name, NEW.recipient_phone,
      COALESCE(NEW.notes->>'source', 'admin_manual'),
      'referred'
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_b2b_attribution_from_voucher ON public.b2b_vouchers;
CREATE TRIGGER trg_b2b_attribution_from_voucher
  AFTER INSERT ON public.b2b_vouchers
  FOR EACH ROW EXECUTE FUNCTION public._b2b_attribution_from_voucher();


-- ════════════════════════════════════════════════════════════
-- RPC: Cruzamento com appointments (cron + on-demand)
-- ════════════════════════════════════════════════════════════

-- Dada uma janela (default 180 dias), procura matches entre
-- b2b_attributions.lead_phone_last8 e appointments.patient_phone.
-- Critério de conversão: appointment tem value > 0 e
--   status NOT IN ('cancelado','cancelada','no_show')
--   E NOT deleted
CREATE OR REPLACE FUNCTION public.b2b_attribution_scan(p_days int DEFAULT 180)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_matched int := 0;
  v_converted int := 0;
  v_lost int := 0;
  v_now timestamptz := now();
  v_cutoff timestamptz := v_now - (p_days || ' days')::interval;
BEGIN
  -- Atualiza matched + converted num CTE agregando por phone_last8
  WITH attrs AS (
    SELECT a.id, a.partnership_id, a.lead_phone_last8, a.created_at, a.status
      FROM public.b2b_attributions a
     WHERE a.clinic_id = v_clinic_id
       AND a.lead_phone_last8 IS NOT NULL
       AND a.status IN ('referred','matched')
       AND a.created_at >= v_cutoff
  ),
  apt_match AS (
    SELECT
      attr.id AS attribution_id,
      MIN(apt.created_at) FILTER (WHERE apt.created_at >= attr.created_at) AS first_apt_at,
      (array_agg(apt.id ORDER BY apt.created_at)
        FILTER (WHERE apt.created_at >= attr.created_at))[1] AS first_apt_id,
      array_agg(apt.id ORDER BY apt.created_at) FILTER (
        WHERE apt.value IS NOT NULL
          AND apt.value > 0
          AND apt.deleted_at IS NULL
          AND COALESCE(apt.status,'') NOT IN ('cancelado','cancelada','no_show','cancelled')
          AND apt.created_at >= attr.created_at
      ) AS converted_ids,
      COALESCE(SUM(apt.value) FILTER (
        WHERE apt.value IS NOT NULL
          AND apt.value > 0
          AND apt.deleted_at IS NULL
          AND COALESCE(apt.status,'') NOT IN ('cancelado','cancelada','no_show','cancelled')
          AND apt.created_at >= attr.created_at
      ), 0) AS revenue
    FROM attrs attr
    JOIN public.appointments apt
      ON apt.clinic_id = v_clinic_id
     AND apt.patient_phone IS NOT NULL
     AND right(regexp_replace(apt.patient_phone, '\D', '', 'g'), 8) = attr.lead_phone_last8
    GROUP BY attr.id
  )
  UPDATE public.b2b_attributions a
     SET status = CASE
                    WHEN m.converted_ids IS NOT NULL AND array_length(m.converted_ids, 1) > 0 THEN 'converted'
                    WHEN m.first_apt_id IS NOT NULL THEN 'matched'
                    ELSE a.status
                  END,
         first_appointment_id     = COALESCE(a.first_appointment_id, m.first_apt_id),
         first_appointment_at     = COALESCE(a.first_appointment_at, m.first_apt_at),
         converted_appointment_ids = m.converted_ids,
         revenue_brl              = m.revenue,
         last_scan_at             = v_now,
         updated_at               = v_now
    FROM apt_match m
   WHERE a.id = m.attribution_id;

  GET DIAGNOSTICS v_matched = ROW_COUNT;

  -- Marca attributions velhas (>180d) sem match como 'lost'
  UPDATE public.b2b_attributions
     SET status = 'lost', updated_at = v_now, last_scan_at = v_now
   WHERE clinic_id = v_clinic_id
     AND status = 'referred'
     AND created_at < v_now - INTERVAL '180 days';

  GET DIAGNOSTICS v_lost = ROW_COUNT;

  SELECT COUNT(*) INTO v_converted
    FROM public.b2b_attributions
   WHERE clinic_id = v_clinic_id AND status = 'converted';

  RETURN jsonb_build_object(
    'ok', true,
    'scanned_days', p_days,
    'rows_updated', v_matched,
    'lost_marked', v_lost,
    'total_converted', v_converted
  );
END $$;


-- Cron diário 04:00 UTC (antes do expiry e health)
DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('b2b_cron_attribution_scan'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule(
    'b2b_cron_attribution_scan',
    '0 4 * * *',
    'SELECT public.b2b_attribution_scan(180)'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponível — attribution_scan manual';
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC: ROI consolidado por parceria
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.b2b_partnership_roi(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_referred int;
  v_matched  int;
  v_converted int;
  v_lost int;
  v_revenue numeric;
  v_cost_data jsonb;
  v_cost numeric;
  v_roi numeric;
  v_conversion_rate numeric;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE status IN ('referred','matched','converted','lost')),
    COUNT(*) FILTER (WHERE status IN ('matched','converted')),
    COUNT(*) FILTER (WHERE status = 'converted'),
    COUNT(*) FILTER (WHERE status = 'lost'),
    COALESCE(SUM(revenue_brl) FILTER (WHERE status = 'converted'), 0)
    INTO v_referred, v_matched, v_converted, v_lost, v_revenue
    FROM public.b2b_attributions
   WHERE clinic_id = v_clinic_id AND partnership_id = p_partnership_id;

  -- Puxa custo da função existente
  v_cost_data := public.b2b_partnership_cost(p_partnership_id);
  v_cost := COALESCE((v_cost_data->>'total_cost')::numeric, 0);

  v_conversion_rate := CASE WHEN v_referred > 0
    THEN ROUND((v_converted::numeric / v_referred) * 100, 1)
    ELSE 0 END;

  v_roi := CASE WHEN v_cost > 0
    THEN ROUND(((v_revenue - v_cost) / v_cost) * 100, 1)
    ELSE NULL END;

  RETURN jsonb_build_object(
    'partnership_id',   p_partnership_id,
    'referred',         v_referred,
    'matched',          v_matched,
    'converted',        v_converted,
    'lost',             v_lost,
    'conversion_rate',  v_conversion_rate,
    'revenue_brl',      v_revenue,
    'cost_brl',         v_cost,
    'net_brl',          v_revenue - v_cost,
    'roi_pct',          v_roi
  );
END $$;


-- ════════════════════════════════════════════════════════════
-- RPC: Histórico de leads da parceria (pra UI)
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.b2b_partnership_leads_history(
  p_partnership_id uuid, p_limit int DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',               a.id,
    'lead_name',        a.lead_name,
    'lead_phone',       a.lead_phone,
    'source',           a.source,
    'status',           a.status,
    'revenue_brl',      a.revenue_brl,
    'first_appointment_at', a.first_appointment_at,
    'voucher_token',    v.token,
    'voucher_status',   v.status,
    'created_at',       a.created_at
  ) ORDER BY a.created_at DESC), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT * FROM public.b2b_attributions
       WHERE clinic_id = v_clinic_id AND partnership_id = p_partnership_id
       ORDER BY created_at DESC LIMIT p_limit
    ) a
    LEFT JOIN public.b2b_vouchers v ON v.id = a.voucher_id;
  RETURN v_out;
END $$;


-- ════════════════════════════════════════════════════════════
-- Popula attributions retroativas (vouchers já existentes)
-- ════════════════════════════════════════════════════════════
INSERT INTO public.b2b_attributions (
  clinic_id, partnership_id, voucher_id, lead_name, lead_phone, source, status, created_at
)
SELECT v.clinic_id, v.partnership_id, v.id, v.recipient_name, v.recipient_phone,
       'backfill', 'referred', v.issued_at
  FROM public.b2b_vouchers v
  LEFT JOIN public.b2b_attributions a ON a.voucher_id = v.id
 WHERE a.id IS NULL
ON CONFLICT DO NOTHING;


-- ════════════════════════════════════════════════════════════
-- GRANTS
-- ════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE ON public.b2b_attributions                 TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_attribution_scan(int)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_partnership_roi(uuid)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_partnership_leads_history(uuid, int) TO anon, authenticated, service_role;
