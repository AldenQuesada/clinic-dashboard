-- ============================================================
-- Migration: Corrigir e ativar rules de agendamento
--
-- 1. Atualizar condition "agendamento" -> "agendado" (nome novo)
-- 2. Ativar a regra de alerta para recepcao
-- 3. Criar regra de task "Preparar prontuario"
-- ============================================================

-- PASSO 1: Atualizar regra existente de alerta
UPDATE automation_rules
SET conditions = '[{"field": "to_phase", "op": "eq", "value": "agendado"}]'::jsonb,
    is_active  = true,
    updated_at = now()
WHERE slug = 'fase_agendamento_alerta_recepcao';

-- PASSO 2: Atualizar outras regras que referenciam "agendamento" ou "captacao"
UPDATE automation_rules
SET conditions = replace(conditions::text, '"agendamento"', '"agendado"')::jsonb,
    updated_at = now()
WHERE conditions::text LIKE '%"agendamento"%';

UPDATE automation_rules
SET conditions = replace(conditions::text, '"captacao"', '"lead"')::jsonb,
    updated_at = now()
WHERE conditions::text LIKE '%"captacao"%';

-- PASSO 3: Criar regra de task "Preparar prontuario"
INSERT INTO automation_rules (
  clinic_id, slug, name, description,
  trigger_event, conditions, actions,
  is_active, priority
) VALUES (
  (SELECT id FROM clinics LIMIT 1),
  'fase_agendado_task_prontuario',
  'Agendado: criar task de prontuario',
  'Quando lead e agendado, cria task para recepcao preparar prontuario.',
  'phase_changed',
  '[{"field": "to_phase", "op": "eq", "value": "agendado"}]',
  '[{"type": "create_task", "titulo": "Preparar prontuario para consulta", "para": "recepcao", "prazo_horas": 24, "prioridade": "normal"}]',
  true,
  21
) ON CONFLICT (clinic_id, slug) DO NOTHING;

-- PASSO 4: Regra de alerta quando lead comparece
INSERT INTO automation_rules (
  clinic_id, slug, name, description,
  trigger_event, conditions, actions,
  is_active, priority
) VALUES (
  (SELECT id FROM clinics LIMIT 1),
  'fase_compareceu_alerta',
  'Compareceu: alerta para profissional',
  'Quando lead comparece a consulta, alerta o profissional para decidir se vira paciente ou orcamento.',
  'phase_changed',
  '[{"field": "to_phase", "op": "eq", "value": "compareceu"}]',
  '[{"type": "create_alert", "titulo": "Paciente compareceu - aguardando decisao", "corpo": "O lead compareceu a consulta. Marque como Paciente ou Orcamento apos finalizar.", "tipo": "info", "para": "profissional"}]',
  true,
  22
) ON CONFLICT (clinic_id, slug) DO NOTHING;

-- ============================================================
-- VERIFICACAO:
-- SELECT slug, name, is_active, conditions, actions
-- FROM automation_rules
-- WHERE trigger_event = 'phase_changed'
-- ORDER BY priority;
-- ============================================================
