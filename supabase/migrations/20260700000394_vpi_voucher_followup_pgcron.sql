-- ============================================================
-- Migration: pg_cron pra vpi_voucher_followup_scan
-- ============================================================
-- Substitui a dependencia externa (n8n) por pg_cron nativo — mesmo
-- padrao das outras automacoes server-side (vpi_*, b2b_*, wa-*).
--
-- Diario as 07:30 UTC. Scan enfileira msgs em wa_outbox, que o worker
-- outbox-direct processa normalmente.
-- ============================================================

-- Remove job antigo se existir (idempotencia)
DO $$ BEGIN
  PERFORM cron.unschedule('vpi_voucher_followup_daily');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'vpi_voucher_followup_daily',
  '30 7 * * *',
  $$SELECT public.vpi_voucher_followup_scan()$$
);
