-- ============================================================================
-- Quiz Alert Cron — Agendamento automático de geração de alertas
-- ============================================================================
-- Requer extensão pg_cron habilitada no Supabase (Dashboard > Database > Extensions)
-- Horário: 18h BRT (21h UTC, fuso -3)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron;

-- ── Diário: todos os dias às 18h BRT (21:00 UTC)
SELECT cron.schedule(
  'quiz-alerts-daily',
  '0 21 * * *',
  $$SELECT quiz_alerts_and_notify('daily')$$
);

-- ── Semanal: sexta-feira às 18h BRT (21:00 UTC)
SELECT cron.schedule(
  'quiz-alerts-weekly',
  '0 21 * * 5',
  $$SELECT quiz_alerts_and_notify('weekly')$$
);

-- ── Mensal: dia 1 de cada mês às 18h BRT (fechamento do mês anterior)
SELECT cron.schedule(
  'quiz-alerts-monthly',
  '0 21 1 * *',
  $$SELECT quiz_alerts_and_notify('monthly')$$
);
