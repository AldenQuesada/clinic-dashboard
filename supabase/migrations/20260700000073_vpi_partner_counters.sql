-- ============================================================
-- Migration: VPI Materializar Counters (Fase 7 - Entrega 4)
--
-- vpi_partner_list hoje faz 2 subqueries COUNT por partner
-- (indicacoes_mes + indicacoes_ano). Com 1000 parceiras = 2000
-- COUNTs a cada render. Materializamos em colunas, atualizadas
-- por trigger em vpi_indications + refresh semanal.
--
-- Componentes:
--   1) Colunas indicacoes_mes_cache + indicacoes_ano_cache +
--      counters_atualizados_em em vpi_partners
--   2) Funcao _vpi_refresh_counters(partner_id) recalcula + UPDATE
--   3) Trigger em vpi_indications (INS/UPD/DEL) chama _refresh
--   4) Rewrite vpi_partner_list lendo das colunas (zero subquery)
--   5) RPC vpi_refresh_all_counters() pra forca-bruta
--   6) pg_cron semanal domingo 5h BRT (8 UTC)
--   7) Backfill inicial
--
-- Idempotente.
-- ============================================================

-- ── 1. Colunas cache ─────────────────────────────────────────
ALTER TABLE public.vpi_partners
  ADD COLUMN IF NOT EXISTS indicacoes_mes_cache    int default 0,
  ADD COLUMN IF NOT EXISTS indicacoes_ano_cache    int default 0,
  ADD COLUMN IF NOT EXISTS counters_atualizados_em timestamptz;

-- ── 2. Helper: refresh counters de 1 partner ────────────────
CREATE OR REPLACE FUNCTION public._vpi_refresh_counters(p_partner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_mes int := 0; v_ano int := 0;
BEGIN
  IF p_partner_id IS NULL THEN RETURN; END IF;

  SELECT COUNT(*)::int INTO v_mes
    FROM public.vpi_indications
   WHERE partner_id = p_partner_id
     AND status     = 'closed'
     AND fechada_em IS NOT NULL
     AND date_trunc('month', fechada_em) = date_trunc('month', now());

  SELECT COUNT(*)::int INTO v_ano
    FROM public.vpi_indications
   WHERE partner_id = p_partner_id
     AND status     = 'closed'
     AND fechada_em IS NOT NULL
     AND date_trunc('year', fechada_em) = date_trunc('year', now());

  UPDATE public.vpi_partners
     SET indicacoes_mes_cache    = v_mes,
         indicacoes_ano_cache    = v_ano,
         counters_atualizados_em = now()
   WHERE id = p_partner_id;
END $$;

-- ── 3. Trigger em vpi_indications ───────────────────────────
CREATE OR REPLACE FUNCTION public._vpi_indications_counters_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    BEGIN
      PERFORM public._vpi_refresh_counters(OLD.partner_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    RETURN OLD;
  END IF;

  BEGIN
    PERFORM public._vpi_refresh_counters(NEW.partner_id);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  -- Se partner_id mudou no UPDATE, refresh o anterior tambem
  IF TG_OP = 'UPDATE' AND OLD.partner_id IS DISTINCT FROM NEW.partner_id THEN
    BEGIN
      PERFORM public._vpi_refresh_counters(OLD.partner_id);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_indications_counters ON public.vpi_indications;
CREATE TRIGGER trg_vpi_indications_counters
  AFTER INSERT OR UPDATE OR DELETE ON public.vpi_indications
  FOR EACH ROW EXECUTE FUNCTION public._vpi_indications_counters_trg();

-- ── 4. RPC: refresh_all ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_refresh_all_counters()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_count  int  := 0;
  r record;
BEGIN
  FOR r IN SELECT id FROM public.vpi_partners WHERE clinic_id = v_clinic LOOP
    PERFORM public._vpi_refresh_counters(r.id);
    v_count := v_count + 1;
  END LOOP;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic, 'counters_refresh_all', 'partner', NULL,
          jsonb_build_object('count', v_count));

  RETURN jsonb_build_object('ok', true, 'count', v_count);
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_refresh_all_counters() TO authenticated;

-- ── 5. Rewrite vpi_partner_list SEM subqueries ──────────────
CREATE OR REPLACE FUNCTION public.vpi_partner_list(
  p_search text DEFAULT NULL,
  p_sort   text DEFAULT 'ranking'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_rows jsonb;
BEGIN
  WITH base AS (
    SELECT p.*,
           COALESCE(p.indicacoes_mes_cache, 0) AS indicacoes_mes,
           COALESCE(p.indicacoes_ano_cache, 0) AS indicacoes_ano
      FROM public.vpi_partners p
     WHERE p.clinic_id = v_clinic
       AND (p_search IS NULL OR p_search = ''
            OR p.nome ILIKE '%' || p_search || '%'
            OR COALESCE(p.profissao,'') ILIKE '%' || p_search || '%'
            OR COALESCE(p.cidade,'')    ILIKE '%' || p_search || '%'
            OR COALESCE(p.phone,'')     ILIKE '%' || p_search || '%')
  )
  SELECT jsonb_agg(row_to_json(b.*) ORDER BY
    CASE WHEN p_sort = 'name'   THEN b.nome END ASC,
    CASE WHEN p_sort = 'recent' THEN b.created_at END DESC,
    CASE WHEN p_sort = 'oldest' THEN b.created_at END ASC,
    CASE WHEN p_sort NOT IN ('name','recent','oldest') THEN b.creditos_total END DESC
  )
  INTO v_rows FROM base b;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_partner_list(text, text) TO anon, authenticated;

-- ── 6. Backfill inicial ──────────────────────────────────────
DO $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  r record;
  v_cnt int := 0;
BEGIN
  FOR r IN SELECT id FROM public.vpi_partners WHERE clinic_id = v_clinic LOOP
    PERFORM public._vpi_refresh_counters(r.id);
    v_cnt := v_cnt + 1;
  END LOOP;
  RAISE NOTICE '[vpi_counters] backfill: % partners', v_cnt;
END $$;

-- ── 7. pg_cron semanal domingo 5h BRT (8 UTC) ───────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('vpi_counters_weekly');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'vpi_counters_weekly',
      '0 8 * * 0',
      'SELECT public.vpi_refresh_all_counters()'
    );
    RAISE NOTICE '[vpi_counters_weekly] agendado 0 8 * * 0 UTC = domingo 5h BRT';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron falhou: %. Configurar manualmente.', SQLERRM;
END $$;

-- ── 8. Sanity ────────────────────────────────────────────────
DO $$
DECLARE v_cols int; v_trg int; v_job int;
BEGIN
  SELECT count(*) INTO v_cols FROM information_schema.columns
   WHERE table_schema='public' AND table_name='vpi_partners'
     AND column_name IN ('indicacoes_mes_cache','indicacoes_ano_cache','counters_atualizados_em');
  SELECT count(*) INTO v_trg FROM pg_trigger
   WHERE tgname='trg_vpi_indications_counters' AND NOT tgisinternal;
  BEGIN
    SELECT count(*) INTO v_job FROM cron.job WHERE jobname='vpi_counters_weekly';
  EXCEPTION WHEN OTHERS THEN v_job := -1; END;
  RAISE NOTICE '[vpi_counters] cols=% trg=% cron=%', v_cols, v_trg, v_job;
END $$;
