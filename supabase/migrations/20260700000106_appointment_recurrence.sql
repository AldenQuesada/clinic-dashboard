-- ============================================================
-- Migration: Recorrencia de sessoes no agendamento
-- ============================================================
-- Permite que um appointment seja parte de uma serie recorrente (ex:
-- 8 sessoes de Tirzepatida a cada 7 dias). Cada appointment individual
-- permanece editavel, mas linkado via recurrence_group_id.
--
-- Seed de 1 regra "Confirmacao de Serie Recorrente" em wa_agenda_automations
-- com trigger_type='on_recurrence_created' pra que o texto da msg WhatsApp
-- enviada ao paciente seja editavel no Funil.
-- ============================================================

ALTER TABLE appointments ADD COLUMN IF NOT EXISTS recurrence_group_id uuid;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS recurrence_index    int;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS recurrence_total    int;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS recurrence_procedure text;
ALTER TABLE appointments ADD COLUMN IF NOT EXISTS recurrence_interval_days int;

CREATE INDEX IF NOT EXISTS idx_appointments_recurrence_group
  ON appointments(recurrence_group_id)
  WHERE recurrence_group_id IS NOT NULL;

-- ── Seed regra on_recurrence_created ──────────────────────────
DELETE FROM wa_agenda_automations
WHERE clinic_id = '00000000-0000-0000-0000-000000000001'
  AND trigger_type = 'on_recurrence_created';

INSERT INTO wa_agenda_automations (
  id, clinic_id, name, description,
  trigger_type, trigger_config,
  channel, content_template,
  category, is_active, sort_order,
  created_at, updated_at
)
VALUES (
  gen_random_uuid(),
  '00000000-0000-0000-0000-000000000001',
  'Confirmacao de Serie Recorrente',
  'Enviada ao paciente quando uma serie de sessoes e agendada em lote.',
  'on_recurrence_created',
  jsonb_build_object('scope', 'series'),
  'whatsapp',
  E'Oi *{{nome}}*, sua serie de *{{procedimento}}* esta confirmada!\n\n{{lista_datas}}\n\nCada sessao e fundamental para o resultado. Te esperamos!\n\n*{{clinica}}*',
  'during',
  true,
  950,
  now(), now()
);

COMMENT ON COLUMN appointments.recurrence_group_id IS 'UUID compartilhado por todos os appointments da mesma serie recorrente';
COMMENT ON COLUMN appointments.recurrence_index IS 'Posicao do appointment na serie (1-indexed: 1 de N)';
COMMENT ON COLUMN appointments.recurrence_total IS 'Total de sessoes na serie quando criada (N)';
COMMENT ON COLUMN appointments.recurrence_procedure IS 'Procedimento recorrente (nome) da serie';
COMMENT ON COLUMN appointments.recurrence_interval_days IS 'Intervalo em dias entre sessoes (ex: 7, 14, 30)';
