-- ============================================================
-- Migration: Expand wa_agenda_automations
-- Add task fields, new categories, migrate all templates
-- from Tags e Fluxos (localStorage) to unified DB table.
-- ============================================================

-- ── 1. Add task fields ───────────────────────────────────────
ALTER TABLE wa_agenda_automations ADD COLUMN IF NOT EXISTS task_title text DEFAULT '';
ALTER TABLE wa_agenda_automations ADD COLUMN IF NOT EXISTS task_assignee text DEFAULT 'sdr';
ALTER TABLE wa_agenda_automations ADD COLUMN IF NOT EXISTS task_priority text DEFAULT 'normal';
ALTER TABLE wa_agenda_automations ADD COLUMN IF NOT EXISTS task_deadline_hours int DEFAULT 24;

-- ── 2. Expand channel check (add 'task') ─────────────────────
-- channel now supports: whatsapp | alert | task | whatsapp_alert | whatsapp_task | alert_task | all
-- No constraint needed since it's text, just documenting.

-- ── 3. Seed: Captacao (leads) ────────────────────────────────
INSERT INTO wa_agenda_automations (name, description, category, sort_order, trigger_type, trigger_config, recipient_type, channel, content_template, alert_title, alert_type, task_title, task_assignee, task_priority, task_deadline_hours) VALUES

-- Captacao: messages
('Boas-vindas Lead', 'Primeiro contato com lead novo', 'captacao', 1,
 'on_tag', '{"tag":"lead_novo"}', 'patient', 'whatsapp',
 'Ola {{nome}}! Seja bem-vindo(a) a {{clinica}}! Estamos aqui para te ajudar a se sentir ainda mais bonita. Como posso te ajudar hoje?',
 '', 'info', '', 'sdr', 'normal', 24),

('Follow-up Lead Frio', 'Reengajar lead sem resposta', 'captacao', 2,
 'on_tag', '{"tag":"lead_frio"}', 'patient', 'whatsapp',
 'Oi {{nome}}, tudo bem? Passando para ver se voce ainda tem interesse em conhecer nossos procedimentos. Podemos te ajudar?',
 '', 'info', '', 'sdr', 'normal', 48),

('Follow-up Lead Morno', 'Lead com interesse medio', 'captacao', 3,
 'on_tag', '{"tag":"lead_morno"}', 'patient', 'whatsapp',
 'Ola {{nome}}! Que tal agendar uma avaliacao gratuita? Temos horarios esta semana. Qual seria o melhor para voce?',
 '', 'info', '', 'sdr', 'normal', 24),

('Follow-up Lead Quente', 'Lead pronto pra agendar', 'captacao', 4,
 'on_tag', '{"tag":"lead_quente"}', 'patient', 'whatsapp',
 '{{nome}}, otima noticia! Temos um horario disponivel. Posso reservar para voce?',
 '', 'info', '', 'sdr', 'normal', 4),

-- Captacao: alerts
('Alerta Novo Lead', 'Notificar SDR de lead novo', 'captacao', 5,
 'on_tag', '{"tag":"lead_novo"}', 'professional', 'alert',
 '', 'Novo lead recebido', 'info', '', 'sdr', 'normal', 24),

('Alerta Lead Quente', 'Acao imediata pra lead quente', 'captacao', 6,
 'on_tag', '{"tag":"lead_quente"}', 'professional', 'alert',
 '', 'Lead quente — acao imediata!', 'warning', '', 'sdr', 'normal', 4),

-- Captacao: tasks
('Tarefa Qualificar Lead', 'Criar tarefa ao receber lead', 'captacao', 7,
 'on_tag', '{"tag":"lead_novo"}', 'professional', 'task',
 '', '', 'info', 'Qualificar lead recem chegado', 'sdr', 'alta', 24),

('Tarefa Follow-up Frio', 'Criar tarefa pra lead frio', 'captacao', 8,
 'on_tag', '{"tag":"lead_frio"}', 'professional', 'task',
 '', '', 'info', 'Enviar follow-up para lead frio', 'sdr', 'normal', 48),

('Tarefa Agendar Urgente', 'Lead quente precisa agendar', 'captacao', 9,
 'on_tag', '{"tag":"lead_quente"}', 'professional', 'task',
 '', '', 'info', 'Converter lead quente em agendamento — URGENTE', 'sdr', 'urgente', 4),

-- === POS (pos-consulta) ===
('Pos-procedimento D+1', 'Como esta se sentindo?', 'pos', 1,
 'd_after', '{"days":1,"hour":10,"minute":0}', 'patient', 'whatsapp',
 'Oi {{nome}}! Como voce esta se sentindo? Tudo ocorrendo bem com o resultado? Estamos acompanhando!',
 '', 'info', '', '', 'normal', 24),

('Pos-procedimento D+2', 'Acompanhamento dia 2', 'pos', 2,
 'd_after', '{"days":2,"hour":10,"minute":0}', 'patient', 'whatsapp',
 '{{nome}}, ja faz 2 dias do seu procedimento! O resultado esta te agradando? Qualquer sinal diferente entre em contato.',
 '', 'info', '', '', 'normal', 24),

('Pos-procedimento D+3', 'Conferir resultado final', 'pos', 3,
 'd_after', '{"days":3,"hour":10,"minute":0}', 'patient', 'whatsapp',
 'Ola {{nome}}! Chegou a hora de conferir o resultado final. Esta feliz? Adorariamos ver uma foto!',
 '', 'info', '', '', 'normal', 24),

('Tarefa Acompanhamento Pos', 'Ligar 72h apos procedimento', 'pos', 4,
 'd_after', '{"days":3,"hour":10,"minute":0}', 'professional', 'task',
 '', '', 'info', 'Ligar 72h apos procedimento para acompanhamento', 'cs', 'alta', 72),

-- === ORCAMENTO ===
('Orcamento Enviado', 'Mensagem ao enviar orcamento', 'orcamento', 1,
 'on_tag', '{"tag":"orcamento-aberto"}', 'patient', 'whatsapp',
 '{{nome}}, segue seu orcamento personalizado. Qualquer duvida ou se quiser negociar e so falar! Aguardamos seu retorno.',
 '', 'info', '', 'sdr', 'normal', 48),

('Orcamento Aprovado', 'Agendar procedimento', 'orcamento', 2,
 'on_tag', '{"tag":"orcamento_fechado"}', 'patient', 'whatsapp',
 '{{nome}}, que otima noticia! Vamos agendar seu procedimento. Qual o melhor horario para voce?',
 '', 'info', '', 'sdr', 'normal', 12),

('Follow-up Orcamento Preco', 'Objecao de preco', 'orcamento', 3,
 'on_tag', '{"tag":"orc_em_negociacao"}', 'patient', 'whatsapp',
 'Oi {{nome}}! Entendo que o investimento pode ser um fator. Temos opcoes de parcelamento. Posso te apresentar?',
 '', 'info', '', 'sdr', 'normal', 24),

('Tarefa Follow-up Orcamento', 'Criar tarefa de follow-up', 'orcamento', 4,
 'on_tag', '{"tag":"orcamento-aberto"}', 'professional', 'task',
 '', '', 'info', 'Follow-up do orcamento em aberto', 'sdr', 'alta', 48),

('Alerta Negociacao', 'Paciente pediu negociacao', 'orcamento', 5,
 'on_tag', '{"tag":"orc_em_negociacao"}', 'professional', 'alert',
 '', 'Paciente pediu negociacao de orcamento', 'warning', '', 'sdr', 'normal', 24),

-- === Agenda: tasks (complementando os 15 existentes) ===
('Tarefa Preparar Prontuario', 'Ao confirmar agendamento', 'before', 7,
 'on_status', '{"status":"confirmado"}', 'professional', 'task',
 '', '', 'info', 'Preparar prontuario e sala para consulta', 'secretaria', 'alta', 2),

('Tarefa Confirmar Presenca', 'D-1 confirmar presenca', 'before', 8,
 'd_before', '{"days":1,"hour":9,"minute":0}', 'professional', 'task',
 '', '', 'info', 'Confirmar presenca do paciente', 'secretaria', 'alta', 24),

('Tarefa Recuperar Cancelamento', 'Ao cancelar', 'after', 7,
 'on_status', '{"status":"cancelado"}', 'professional', 'task',
 '', '', 'info', 'Tentar reagendar consulta cancelada', 'sdr', 'alta', 24),

('Tarefa Recuperar No-show', 'Ao registrar no-show', 'after', 8,
 'on_status', '{"status":"no_show"}', 'professional', 'task',
 '', '', 'info', 'Tentar reagendar no-show', 'sdr', 'alta', 24)

ON CONFLICT DO NOTHING;
