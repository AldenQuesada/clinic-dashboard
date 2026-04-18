-- ============================================================
-- Migration: pg_cron para auto-expirar links de share
-- Roda fm_share_expire_old() todo dia as 3h UTC (~0h BRT) para marcar
-- como 'expired' os links cujo expires_at ja passou.
--
-- Observacoes:
--   - Idempotente: cron.schedule e UPSERT-like. Re-rodar a migration nao
--     duplica o job.
--   - pg_cron ja vem habilitado no schema cron em projetos Supabase.
--   - Job name unico: 'fm-share-expire-old'.
-- ============================================================

-- Garante extensao (no-op se ja existir)
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA cron;

-- Remove job antigo se existir, depois cria novo (idempotencia)
DO $$
DECLARE
  v_job_id bigint;
BEGIN
  SELECT jobid INTO v_job_id FROM cron.job WHERE jobname = 'fm-share-expire-old';
  IF v_job_id IS NOT NULL THEN
    PERFORM cron.unschedule(v_job_id);
  END IF;
END $$;

-- Agenda: todo dia as 3h UTC
SELECT cron.schedule(
  'fm-share-expire-old',
  '0 3 * * *',
  $$SELECT fm_share_expire_old()$$
);
