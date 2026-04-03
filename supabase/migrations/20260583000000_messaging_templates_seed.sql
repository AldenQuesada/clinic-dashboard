-- ============================================================
-- Seed: Templates de mensagem iniciais
-- ============================================================

-- Usar clinic_id fixo (sera atualizado quando multi-tenant)
INSERT INTO wa_message_templates (clinic_id, slug, name, category, content, sort_order) VALUES
-- Onboarding
('00000000-0000-0000-0000-000000000001', 'onboarding_welcome', 'Boas-vindas Quiz', 'onboarding',
 'Oi {nome}! 😊\n\nAqui é a Lara, da equipe da Dra. Mirian.\n\nVi que você fez nossa avaliação e tem interesse em tratar {queixa_principal}. A Dra. Mirian é especialista exatamente nesses procedimentos!\n\nPosso te contar como funciona a avaliação? É bem rápida e sem compromisso 💜', 1),

('00000000-0000-0000-0000-000000000001', 'onboarding_followup_1', 'Follow-up Dia 1', 'onboarding',
 'Oi {nome}!\n\nÉ a Lara novamente 😊\n\nVi que não conseguimos conversar ontem. Só queria te dizer que a Dra. Mirian tem horários especiais essa semana para avaliação.\n\nQuer que eu veja um horário que funcione pra você?', 2),

-- Follow-up
('00000000-0000-0000-0000-000000000001', 'followup_social_proof', 'Prova Social', 'follow_up',
 '{nome}, olha só o resultado dessa paciente que tinha {queixa_principal} parecida com a sua!\n\nEla fez o procedimento há 3 meses e ficou super satisfeita 😍\n\nQuer saber mais sobre como funciona?', 3),

('00000000-0000-0000-0000-000000000001', 'followup_urgency', 'Urgência Suave', 'follow_up',
 'Oi {nome}!\n\nSó passando pra avisar que a agenda da Dra. Mirian está bem concorrida esse mês.\n\nSe quiser garantir um horário para sua avaliação, me avisa que reservo pra você ✨', 4),

('00000000-0000-0000-0000-000000000001', 'followup_last', 'Última Tentativa', 'follow_up',
 '{nome}, tudo bem?\n\nComo não consegui falar com você, vou encerrar seu atendimento por aqui.\n\nMas fica tranquila — se mudar de ideia, é só me chamar que te ajudo com prazer! 💜\n\nUm abraço, Lara', 5),

-- Agendamento
('00000000-0000-0000-0000-000000000001', 'scheduling_confirm', 'Confirmação de Agendamento', 'agendamento',
 'Perfeito, {nome}! ✅\n\nSua avaliação está confirmada:\n📅 {data_consulta}\n🕐 {hora_consulta}\n📍 {endereco_clinica}\n\nChegue 10 minutinhos antes, tá? 😊\n\nQualquer dúvida, é só me chamar!', 6),

('00000000-0000-0000-0000-000000000001', 'scheduling_reminder', 'Lembrete Véspera', 'agendamento',
 'Oi {nome}! 😊\n\nSó lembrando que amanhã você tem sua avaliação com a Dra. Mirian!\n\n📅 {data_consulta} às {hora_consulta}\n📍 {endereco_clinica}\n\nTá confirmada? 💜', 7),

('00000000-0000-0000-0000-000000000001', 'scheduling_reschedule', 'Reagendamento', 'agendamento',
 'Sem problemas, {nome}!\n\nVou reagendar sua avaliação. Qual dia e horário ficaria melhor pra você?\n\nTenho disponibilidade essa semana ainda 😊', 8),

-- Pós-consulta
('00000000-0000-0000-0000-000000000001', 'post_consultation', 'Pós-consulta', 'pos_consulta',
 'Oi {nome}! 😊\n\nComo foi sua consulta com a Dra. Mirian?\n\nEspero que tenha gostado! Se tiver qualquer dúvida sobre o plano de tratamento, estou aqui 💜', 9),

-- Recuperação
('00000000-0000-0000-0000-000000000001', 'recovery_value', 'Recuperação com Valor', 'recuperacao',
 'Oi {nome}!\n\nPassando pra compartilhar algo que acho que vai te interessar 😊\n\nA Dra. Mirian publicou um conteúdo sobre {queixa_principal} que explica direitinho como funciona o tratamento.\n\nQuer que eu te envie?', 10),

('00000000-0000-0000-0000-000000000001', 'recovery_promo', 'Recuperação Promoção', 'recuperacao',
 '{nome}, tudo bem?\n\nA Dra. Mirian está com condições especiais essa semana para avaliação.\n\nSe ainda tem interesse em tratar {queixa_principal}, esse é um ótimo momento! 💜\n\nQuer saber mais?', 11)

ON CONFLICT (clinic_id, slug) DO NOTHING;

-- Cadencia padrão de onboarding
INSERT INTO wa_cadences (clinic_id, name, trigger_phase, steps) VALUES
('00000000-0000-0000-0000-000000000001', 'Onboarding Quiz Lead', 'lead',
 '[
   {"day": 0, "hour": null, "template_slug": "onboarding_welcome", "ai_mode": true, "immediate": true},
   {"day": 1, "hour": 10, "template_slug": "onboarding_followup_1", "ai_mode": true},
   {"day": 2, "hour": 14, "template_slug": "followup_social_proof", "ai_mode": true},
   {"day": 3, "hour": 10, "template_slug": "followup_urgency", "ai_mode": true},
   {"day": 5, "hour": 10, "template_slug": "followup_last", "ai_mode": false}
 ]'::jsonb)
ON CONFLICT DO NOTHING;
