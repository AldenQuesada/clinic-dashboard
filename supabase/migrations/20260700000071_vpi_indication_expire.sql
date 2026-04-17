-- ============================================================
-- Migration: VPI Expire Stale Indications (Fase 7 - Entrega 2)
--
-- Indications com status='pending_close' sem fechamento em 90 dias
-- auto-marcam como 'invalid' (invalid_reason='stale_90d') pra nao
-- inflar KPIs de pipeline. pg_cron diario roda todo dia 4h BRT.
--
-- Componentes:
--   1) Coluna invalid_reason text em vpi_indications
--   2) RPC vpi_indication_expire_stale(p_days int default 90)
--   3) pg_cron vpi_indication_expire_daily (0 7 * * * UTC = 4h BRT)
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE,
-- cron.unschedule em bloco EXCEPTION.
-- ============================================================

-- ── 1. Coluna invalid_reason ─────────────────────────────────
ALTER TABLE public.vpi_indications
  ADD COLUMN IF NOT EXISTS invalid_reason text;

-- ── 2. RPC expire stale ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_indication_expire_stale(
  p_days int DEFAULT 90
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_days   int  := GREATEST(1, COALESCE(p_days, 90));
  v_count  int  := 0;
  v_ids    jsonb := '[]'::jsonb;
BEGIN
  WITH expired AS (
    UPDATE public.vpi_indications
       SET status         = 'invalid',
           invalid_reason = 'stale_' || v_days || 'd'
     WHERE clinic_id = v_clinic
       AND status    = 'pending_close'
       AND created_at < now() - (v_days || ' days')::interval
    RETURNING id, partner_id, lead_id
  )
  SELECT count(*)::int,
         COALESCE(jsonb_agg(jsonb_build_object(
           'id',         id,
           'partner_id', partner_id,
           'lead_id',    lead_id
         )), '[]'::jsonb)
    INTO v_count, v_ids
    FROM expired;

  IF v_count > 0 THEN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (v_clinic, 'expire_stale', 'indication', NULL,
            jsonb_build_object(
              'count', v_count,
              'days',  v_days,
              'ids',   v_ids
            ));
  END IF;

  RETURN jsonb_build_object(
    'ok',    true,
    'count', v_count,
    'days',  v_days
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_indication_expire_stale(int) TO authenticated;

-- ── 3. pg_cron diario ────────────────────────────────────────
-- 0 7 * * * UTC = 4h BRT (sem horario de verao no Brasil)
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('vpi_indication_expire_daily');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'vpi_indication_expire_daily',
      '0 7 * * *',
      'SELECT public.vpi_indication_expire_stale(90)'
    );
    RAISE NOTICE '[vpi_indication_expire_daily] agendado 0 7 * * * UTC = 4h BRT';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron falhou: %. Configurar manualmente.', SQLERRM;
END $$;

-- ── 4. Sanity ────────────────────────────────────────────────
DO $$
DECLARE v_col int; v_fn int; v_job int;
BEGIN
  SELECT count(*) INTO v_col FROM information_schema.columns
   WHERE table_schema='public' AND table_name='vpi_indications' AND column_name='invalid_reason';
  SELECT count(*) INTO v_fn FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='vpi_indication_expire_stale';
  BEGIN
    SELECT count(*) INTO v_job FROM cron.job WHERE jobname='vpi_indication_expire_daily';
  EXCEPTION WHEN OTHERS THEN v_job := -1; END;
  RAISE NOTICE '[vpi_expire] col=% fn=% cron=%', v_col, v_fn, v_job;
END $$;
