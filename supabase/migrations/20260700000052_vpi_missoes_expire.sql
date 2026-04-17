-- ============================================================
-- Migration: VPI Missoes Expire (Fase 5 - Entrega 3)
--
-- Missoes com valid_until < now() continuam com is_active=true
-- indefinidamente. Esta migration:
--   1. RPC vpi_missoes_expire_scan() - seta is_active=false onde
--      valid_until ja passou.
--   2. RPC vpi_missao_reativar(p_id, p_dias) - reativa missao
--      prorrogando valid_until por +N dias (default 7).
--   3. pg_cron diario as 3h BRT (6 UTC).
--
-- UI na aba Missoes ganhou secao "Expiradas" separada + botao
-- "Reativar" por card.
-- ============================================================

-- ── 1. RPC: scan e expira missoes vencidas ──────────────────
CREATE OR REPLACE FUNCTION public.vpi_missoes_expire_scan()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_count     int;
  v_ids       uuid[];
BEGIN
  WITH expired AS (
    UPDATE public.vpi_missoes
       SET is_active = false,
           updated_at = now()
     WHERE clinic_id = v_clinic_id
       AND is_active = true
       AND valid_until IS NOT NULL
       AND valid_until < now()
    RETURNING id
  )
  SELECT COUNT(*)::int, array_agg(id) INTO v_count, v_ids FROM expired;

  v_count := COALESCE(v_count, 0);

  IF v_count > 0 THEN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (
      v_clinic_id, 'missoes_expired', 'vpi_missoes', NULL,
      jsonb_build_object('count', v_count, 'missao_ids', to_jsonb(v_ids))
    );
  END IF;

  RETURN jsonb_build_object(
    'ok',          true,
    'expired_count', v_count,
    'missao_ids',  COALESCE(to_jsonb(v_ids), '[]'::jsonb),
    'checked_at',  now()
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_missoes_expire_scan() TO authenticated;

-- ── 2. RPC: reativa missao prorrogando valid_until ───────────
CREATE OR REPLACE FUNCTION public.vpi_missao_reativar(
  p_id   uuid,
  p_dias int DEFAULT 7
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_new_until timestamptz;
  v_titulo    text;
BEGIN
  IF p_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'id_required');
  END IF;

  IF COALESCE(p_dias, 0) <= 0 THEN
    p_dias := 7;
  END IF;

  -- Base: max(now, valid_until) + p_dias (evita retrocesso de data)
  UPDATE public.vpi_missoes
     SET valid_until = GREATEST(now(), COALESCE(valid_until, now())) + (p_dias || ' days')::interval,
         is_active   = true,
         updated_at  = now()
   WHERE id = p_id AND clinic_id = v_clinic_id
  RETURNING valid_until, titulo INTO v_new_until, v_titulo;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missao_not_found');
  END IF;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (
    v_clinic_id, 'missao_reativada', 'vpi_missoes', p_id::text,
    jsonb_build_object('dias', p_dias, 'new_valid_until', v_new_until, 'titulo', v_titulo)
  );

  RETURN jsonb_build_object(
    'ok', true, 'id', p_id,
    'new_valid_until', v_new_until,
    'dias_adicionados', p_dias
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_missao_reativar(uuid, int) TO authenticated;

-- ── 3. pg_cron: diario as 3h BRT (6 UTC) ─────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('vpi_missoes_expire_daily');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'vpi_missoes_expire_daily',
      '0 6 * * *',
      'SELECT public.vpi_missoes_expire_scan()'
    );
    RAISE NOTICE '[vpi_missoes_expire_daily] pg_cron agendado (0 6 * * * = todo dia as 3h BRT)';
  ELSE
    RAISE NOTICE 'pg_cron indisponivel; rodar manualmente via vpi_missoes_expire_scan()';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron falhou: %. Configurar manualmente.', SQLERRM;
END $$;

-- ── 4. Sanity ─────────────────────────────────────────────────
DO $$
DECLARE v_job int;
BEGIN
  BEGIN
    SELECT COUNT(*) INTO v_job FROM cron.job WHERE jobname='vpi_missoes_expire_daily';
  EXCEPTION WHEN OTHERS THEN v_job := -1;
  END;
  RAISE NOTICE '[vpi_missoes_expire] cron_job=%', v_job;
END $$;
