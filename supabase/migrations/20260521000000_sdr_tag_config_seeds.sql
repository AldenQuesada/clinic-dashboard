-- ============================================================
-- Migration: 20260521000000 — SDR: Tag Config Seeds (Sprint 9)
--
-- Popula as tabelas criadas em 20260519000000 com todos os
-- dados dos seeds de tags-data.js:
--   TAG_GROUP_SEEDS        → tag_groups (5 grupos)
--   MESSAGE_TEMPLATE_SEEDS → tag_msg_templates (19 templates)
--   ALERT_TEMPLATE_SEEDS   → tag_alert_templates (8 alertas)
--   TASK_TEMPLATE_SEEDS    → tag_task_templates (14 tarefas)
--   TAG_SEEDS_V2           → tags + colunas de metadata (40 tags)
--
-- Usa ON CONFLICT DO NOTHING para grupos/templates (idempotente).
-- Usa ON CONFLICT DO UPDATE para tags (atualiza metadata columns).
-- ============================================================

DO $$
DECLARE
  v_clinic_id uuid;
BEGIN
  SELECT id INTO v_clinic_id FROM public.clinics LIMIT 1;
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma clínica encontrada — verifique a tabela clinics';
  END IF;

  -- ══════════════════════════════════════════════════════════════
  -- 1. tag_groups
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO public.tag_groups (clinic_id, slug, nome, cor, icone, descricao, ordem, ativo)
  VALUES
    (v_clinic_id, 'pre_agendamento', 'Pré-agendamento',     '#6366F1', 'user-plus',  'Lead qualificado, interesse confirmado, aguardando agendamento.',                                          1, true),
    (v_clinic_id, 'agendamento',     'Agendamento',          '#3B82F6', 'calendar',   'Consulta ou procedimento agendado. Controla confirmações, lembretes e no-shows.',                         2, true),
    (v_clinic_id, 'paciente',        'Paciente',             '#10B981', 'heart',      'Paciente com procedimento realizado. Controla pós-procedimento e retenção.',                              3, true),
    (v_clinic_id, 'orcamento',       'Orçamento',            '#F59E0B', 'clipboard',  'Realizou consulta, não fez procedimento, saiu com orçamento. Fluxo de conversão.',                       4, true),
    (v_clinic_id, 'pac_orcamento',   'Paciente + Orçamento', '#8B5CF6', 'file-text',  'Fez procedimento E saiu com orçamento para outro tratamento.',                                            5, true)
  ON CONFLICT (clinic_id, slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════
  -- 2. tag_msg_templates (WhatsApp)
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO public.tag_msg_templates (clinic_id, slug, nome, canal, conteudo, variaveis)
  VALUES
    (v_clinic_id, 'boas_vindas_lead',        'Boas-vindas Lead',           'whatsapp',
      'Olá {{nome}}! Seja bem-vindo(a) à {{clinica}}! Estamos aqui para te ajudar a se sentir ainda mais bonita. Como posso te ajudar hoje?',
      ARRAY['nome','clinica']),

    (v_clinic_id, 'followup_lead_frio',      'Follow-up Lead Frio',        'whatsapp',
      'Oi {{nome}}, tudo bem? Passando para ver se você ainda tem interesse em conhecer nossos procedimentos. Podemos te ajudar?',
      ARRAY['nome']),

    (v_clinic_id, 'followup_lead_morno',     'Follow-up Lead Morno',       'whatsapp',
      'Olá {{nome}}! Que tal agendar uma avaliação gratuita? Temos horários esta semana. Qual seria o melhor para você?',
      ARRAY['nome']),

    (v_clinic_id, 'followup_lead_quente',    'Follow-up Lead Quente',      'whatsapp',
      '{{nome}}, ótima notícia! Temos um horário disponível {{data_hora}}. Posso reservar para você?',
      ARRAY['nome','data_hora']),

    (v_clinic_id, 'confirmacao_agendamento', 'Confirmação de Agendamento', 'whatsapp',
      'Olá {{nome}}! Sua consulta está confirmada para {{data}} às {{hora}} com {{profissional}}. Qualquer dúvida pode falar comigo!',
      ARRAY['nome','data','hora','profissional']),

    (v_clinic_id, 'lembrete_confirmacao',    'Lembrete de Confirmação',    'whatsapp',
      'Oi {{nome}}! Lembrete da sua consulta amanhã, {{data}} às {{hora}}. Por favor confirme sua presença respondendo SIM ou NÃO.',
      ARRAY['nome','data','hora']),

    (v_clinic_id, 'lembrete_1_dia_antes',    'Lembrete 1 Dia Antes',       'whatsapp',
      '{{nome}}, amanhã é o grande dia! Sua consulta é às {{hora}} em {{endereco}}. Estamos te esperando!',
      ARRAY['nome','hora','endereco']),

    (v_clinic_id, 'lembrete_mesmo_dia',      'Lembrete Mesmo Dia',         'whatsapp',
      'Bom dia {{nome}}! Só para lembrar que hoje é sua consulta às {{hora}}. Até logo!',
      ARRAY['nome','hora']),

    (v_clinic_id, 'mensagem_cancelamento',   'Mensagem de Cancelamento',   'whatsapp',
      'Olá {{nome}}, entendemos que você precisou cancelar. Quando quiser remarcar é só falar! Ficamos à disposição.',
      ARRAY['nome']),

    (v_clinic_id, 'mensagem_reagendamento',  'Mensagem de Reagendamento',  'whatsapp',
      '{{nome}}, confirmamos o reagendamento para {{data}} às {{hora}}. Até lá!',
      ARRAY['nome','data','hora']),

    (v_clinic_id, 'reagendamento_noshow',    'Reagendamento após No-show', 'whatsapp',
      'Olá {{nome}}, sentimos sua falta hoje! Vamos remarcar? Temos horários disponíveis esta semana.',
      ARRAY['nome']),

    (v_clinic_id, 'pos_procedimento_dia_0',  'Pós-procedimento (Dia 0)',   'whatsapp',
      '{{nome}}, foi um prazer te atender! Segue abaixo as orientações de cuidados. Qualquer dúvida estou aqui!',
      ARRAY['nome']),

    (v_clinic_id, 'pos_procedimento_dia_1',  'Pós-procedimento (Dia 1)',   'whatsapp',
      'Oi {{nome}}! Como você está se sentindo? Tudo ocorrendo bem com o resultado? Estamos acompanhando!',
      ARRAY['nome']),

    (v_clinic_id, 'pos_procedimento_dia_2',  'Pós-procedimento (Dia 2)',   'whatsapp',
      '{{nome}}, já faz 2 dias do seu procedimento! O resultado está te agradando? Qualquer sinal diferente entre em contato.',
      ARRAY['nome']),

    (v_clinic_id, 'pos_procedimento_dia_3',  'Pós-procedimento (Dia 3)',   'whatsapp',
      'Olá {{nome}}! Chegou a hora de conferir o resultado final. Está feliz? Adoraríamos ver uma foto!',
      ARRAY['nome']),

    (v_clinic_id, 'pedido_avaliacao',        'Pedido de Avaliação',        'whatsapp',
      '{{nome}}, adoramos te atender! Você poderia deixar uma avaliação no Google? Leva apenas 1 minuto e ajuda muito. {{link_avaliacao}}',
      ARRAY['nome','link_avaliacao']),

    (v_clinic_id, 'orcamento_enviado',       'Orçamento Enviado',          'whatsapp',
      '{{nome}}, segue seu orçamento personalizado. Qualquer dúvida ou se quiser negociar é só falar! Aguardamos seu retorno.',
      ARRAY['nome']),

    (v_clinic_id, 'orcamento_aprovado',      'Orçamento Aprovado',         'whatsapp',
      '{{nome}}, que ótima notícia! Vamos agendar seu procedimento. Qual o melhor horário para você?',
      ARRAY['nome']),

    (v_clinic_id, 'lembrete_retorno',        'Lembrete de Retorno',        'whatsapp',
      '{{nome}}, está quase na hora do seu retorno! Sua consulta é {{data}}. Estamos te esperando!',
      ARRAY['nome','data'])

  ON CONFLICT (clinic_id, slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════
  -- 3. tag_alert_templates (alertas internos)
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO public.tag_alert_templates (clinic_id, slug, nome, titulo, corpo, tipo, para)
  VALUES
    (v_clinic_id, 'alert_lead_novo',        'Novo Lead',               'Novo lead recebido',           'Lead entrou no sistema. Qualificar em até 24h.',        'info',    'sdr'),
    (v_clinic_id, 'alert_lead_quente',      'Lead Quente',             'Lead quente — ação imediata!', 'Lead demonstrou alto interesse. Fazer contato AGORA.',  'warning', 'sdr'),
    (v_clinic_id, 'alert_lead_qualificado', 'Lead Qualificado',        'Lead pronto para agendar',     'Lead qualificado. Oferecer horário de agendamento.',    'success', 'sdr'),
    (v_clinic_id, 'alert_novo_agendamento', 'Novo Agendamento',        'Novo agendamento confirmado',  'Novo agendamento realizado. Preparar prontuário.',      'info',    'secretaria'),
    (v_clinic_id, 'alert_reagendamento',    'Reagendamento',           'Consulta reagendada',          'Consulta reagendada para nova data. Verificar agenda.', 'warning', 'secretaria'),
    (v_clinic_id, 'alert_cancelamento',     'Cancelamento',            'Consulta cancelada',           'Consulta cancelada. Iniciar fluxo de recuperação.',     'error',   'sdr'),
    (v_clinic_id, 'alert_noshow',           'No-show',                 'Falta — No-show registrado',   'Paciente não compareceu. Tentar reagendar em 24h.',     'error',   'sdr'),
    (v_clinic_id, 'alert_negociacao',       'Negociação de Orçamento', 'Paciente pediu negociação',    'Paciente quer negociar o orçamento. Acionar SDR.',      'warning', 'sdr')
  ON CONFLICT (clinic_id, slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════
  -- 4. tag_task_templates (tarefas operacionais)
  -- ══════════════════════════════════════════════════════════════
  INSERT INTO public.tag_task_templates (clinic_id, slug, nome, titulo, prazo_horas, prioridade, responsavel)
  VALUES
    (v_clinic_id, 'task_qualificar_lead',        'Qualificar Lead',        'Qualificar lead recém chegado',                    24,  'alta',    'sdr'),
    (v_clinic_id, 'task_followup_frio',          'Follow-up Frio',         'Enviar follow-up para lead frio',                  48,  'normal',  'sdr'),
    (v_clinic_id, 'task_followup_morno',         'Follow-up Morno',        'Ligar para lead morno — oferecer horário',         24,  'alta',    'sdr'),
    (v_clinic_id, 'task_agendar_urgente',        'Agendar Urgente',        'Converter lead quente em agendamento — URGENTE',   4,   'urgente', 'sdr'),
    (v_clinic_id, 'task_tentativa_contato',      'Tentativa de Contato',   'Nova tentativa de contato (sem resposta)',         24,  'normal',  'sdr'),
    (v_clinic_id, 'task_agendar_consulta',       'Agendar Consulta',       'Agendar consulta com lead qualificado',            12,  'alta',    'sdr'),
    (v_clinic_id, 'task_preparar_prontuario',    'Preparar Prontuário',    'Preparar prontuário e sala para consulta',         2,   'alta',    'secretaria'),
    (v_clinic_id, 'task_confirmar_presenca',     'Confirmar Presença',     'Confirmar presença do paciente',                   24,  'alta',    'secretaria'),
    (v_clinic_id, 'task_recuperar_cancelamento', 'Recuperar Cancelamento', 'Tentar reagendar consulta cancelada',              24,  'alta',    'sdr'),
    (v_clinic_id, 'task_recuperar_noshow',       'Recuperar No-show',      'Tentar reagendar no-show',                         24,  'alta',    'sdr'),
    (v_clinic_id, 'task_acompanhamento_pos',     'Acompanhamento Pós',     'Ligar 72h após procedimento para acompanhamento',  72,  'alta',    'cs'),
    (v_clinic_id, 'task_followup_orcamento',     'Follow-up Orçamento',    'Follow-up do orçamento em aberto',                 48,  'alta',    'sdr'),
    (v_clinic_id, 'task_proposta_negociacao',    'Proposta de Negociação', 'Apresentar proposta de negociação',                24,  'urgente', 'sdr'),
    (v_clinic_id, 'task_followup_agendamento',   'Follow-up Agendamento',  'Contato de follow-up conforme combinado',          0,   'normal',  'sdr')
  ON CONFLICT (clinic_id, slug) DO NOTHING;

  -- ══════════════════════════════════════════════════════════════
  -- 5. Tags com metadata (TAG_SEEDS_V2)
  -- Insere novas tags ou atualiza metadata nas existentes.
  -- entity_type: lead / appointment / patient / budget
  -- ══════════════════════════════════════════════════════════════

  -- ── 5a. Pré-agendamento (entity_type = lead) ─────────────────
  INSERT INTO public.tags (
    clinic_id, slug, label, description, color,
    entity_type, category, is_exclusive, is_system, sort_order,
    group_slug, icon, kanban_coluna, cor_calendario,
    msg_template_id, alert_template_id, task_template_id,
    proxima_acao, regras_aplicacao, incompativeis
  ) VALUES
    (v_clinic_id, 'lead_novo',           'Lead Novo',         'Aplicada ao criar um novo lead.',                           '#A78BFA', 'lead', 'status_captacao', false, true, 10,
     'pre_agendamento', 'user-plus',      'Novo lead',      null,
     null,                   'alert_lead_novo',        'task_qualificar_lead',
     'Qualificar lead em 24h.',              'Aplicada automaticamente ao criar um novo lead.',           ARRAY['lead_desqualificado']),

    (v_clinic_id, 'lead_em_conversa',    'Em Conversa',       'SDR iniciou contato ativo com o lead.',                     '#818CF8', 'lead', 'status_captacao', false, true, 20,
     'pre_agendamento', 'message-circle', 'Em conversa',    null,
     'boas_vindas_lead',     null,                     null,
     'Acompanhar e qualificar.',             'SDR iniciou contato ativo com o lead.',                     ARRAY[]::text[]),

    (v_clinic_id, 'lead_frio',           'Lead Frio',         'Baixo interesse ou inatividade acima de 7 dias.',           '#93C5FD', 'lead', 'status_captacao', false, true, 30,
     'pre_agendamento', 'thermometer',    'Frio',           null,
     'followup_lead_frio',   null,                     'task_followup_frio',
     'Fluxo de reaquecimento.',              'Baixo interesse ou inatividade acima de 7 dias.',           ARRAY['lead_quente','lead_morno']),

    (v_clinic_id, 'lead_morno',          'Lead Morno',        'Interesse moderado — respondeu mas não agendou.',           '#FDE68A', 'lead', 'status_captacao', false, true, 40,
     'pre_agendamento', 'thermometer',    'Morno',          null,
     'followup_lead_morno',  null,                     'task_followup_morno',
     'Oferecer horário disponível.',         'Interesse moderado — respondeu mas não agendou.',           ARRAY['lead_frio','lead_quente']),

    (v_clinic_id, 'lead_quente',         'Lead Quente',       'Alto interesse, pediu informações de agenda.',              '#FCA5A5', 'lead', 'status_captacao', false, true, 50,
     'pre_agendamento', 'thermometer',    'Quente',         null,
     'followup_lead_quente', 'alert_lead_quente',      'task_agendar_urgente',
     'Agendar imediatamente.',               'Alto interesse, pediu informações de agenda.',              ARRAY['lead_frio','lead_morno']),

    (v_clinic_id, 'lead_sem_resposta',   'Sem Resposta',      'Tentativa de contato sem resposta. Máximo 3 tentativas.',   '#9CA3AF', 'lead', 'status_captacao', false, true, 60,
     'pre_agendamento', 'phone-missed',   'Sem resposta',   null,
     null,                   null,                     'task_tentativa_contato',
     'Nova tentativa em 24-48h.',            'Tentativa de contato sem resposta. Máximo 3 tentativas.',  ARRAY[]::text[]),

    (v_clinic_id, 'lead_qualificado',    'Qualificado',       'Lead com perfil, interesse e capacidade confirmados.',      '#6EE7B7', 'lead', 'status_captacao', false, true, 70,
     'pre_agendamento', 'check-circle',   'Qualificado',    null,
     null,                   'alert_lead_qualificado', 'task_agendar_consulta',
     'Converter em agendamento.',            'Lead com perfil, interesse e capacidade confirmados.',     ARRAY['lead_desqualificado']),

    (v_clinic_id, 'lead_desqualificado', 'Desqualificado',    'Perfil não compatível ou sem capacidade de investimento.',  '#D1D5DB', 'lead', 'status_captacao', false, true, 80,
     'pre_agendamento', 'x-circle',       'Desqualificado', null,
     null,                   null,                     null,
     'Encerrar fluxo.',                      'Perfil não compatível ou sem capacidade de investimento.', ARRAY['lead_qualificado']),

    (v_clinic_id, 'lead_followup',       'Follow-up',         'Aguardando retorno do lead para decisão.',                  '#C4B5FD', 'lead', 'status_captacao', false, true, 90,
     'pre_agendamento', 'clock',          'Em conversa',    null,
     null,                   null,                     'task_followup_agendamento',
     'Contato em data programada.',          'Aguardando retorno do lead para decisão.',                 ARRAY[]::text[]),

    (v_clinic_id, 'lead_prioritario',    'Prioritário',       'Lead indicado pela gestão como alta prioridade.',           '#EF4444', 'lead', 'status_captacao', false, true, 100,
     'pre_agendamento', 'alert-triangle', 'Quente',         null,
     null,                   'alert_lead_quente',      'task_agendar_urgente',
     'Atendimento prioritário e imediato.',  'Lead indicado pela gestão como alta prioridade.',          ARRAY[]::text[])

  ON CONFLICT (clinic_id, slug) DO UPDATE SET
    group_slug        = EXCLUDED.group_slug,
    icon              = EXCLUDED.icon,
    kanban_coluna     = EXCLUDED.kanban_coluna,
    cor_calendario    = EXCLUDED.cor_calendario,
    msg_template_id   = EXCLUDED.msg_template_id,
    alert_template_id = EXCLUDED.alert_template_id,
    task_template_id  = EXCLUDED.task_template_id,
    proxima_acao      = EXCLUDED.proxima_acao,
    regras_aplicacao  = EXCLUDED.regras_aplicacao,
    incompativeis     = EXCLUDED.incompativeis;

  -- ── 5b. Agendamento (entity_type = appointment) ───────────────
  INSERT INTO public.tags (
    clinic_id, slug, label, description, color,
    entity_type, category, is_exclusive, is_system, sort_order,
    group_slug, icon, kanban_coluna, cor_calendario,
    msg_template_id, alert_template_id, task_template_id,
    proxima_acao, regras_aplicacao, incompativeis
  ) VALUES
    (v_clinic_id, 'agendado',              'Agendado',               'Consulta ou procedimento inserido na agenda.',           '#3B82F6', 'appointment', 'status_agenda', false, true, 10,
     'agendamento', 'calendar',    'Agendado',                '#3B82F6',
     'confirmacao_agendamento', 'alert_novo_agendamento', 'task_preparar_prontuario',
     'Confirmar presença 48h antes.',    'Consulta ou procedimento inserido na agenda.',            ARRAY['cancelado','falta']),

    (v_clinic_id, 'aguardando_confirmacao','Aguardando Confirmação',  'Lembrete enviado, aguardando resposta do paciente.',     '#F59E0B', 'appointment', 'status_agenda', false, true, 20,
     'agendamento', 'clock',       'Aguardando confirmação',  '#F59E0B',
     'lembrete_confirmacao',    null,                      'task_confirmar_presenca',
     'Confirmar em até 24h antes.',      'Lembrete enviado, aguardando resposta do paciente.',      ARRAY[]::text[]),

    (v_clinic_id, 'confirmado',            'Confirmado',             'Paciente confirmou presença.',                           '#059669', 'appointment', 'status_agenda', false, true, 30,
     'agendamento', 'check-circle','Confirmado',              '#059669',
     'lembrete_1_dia_antes',    null,                      null,
     'Preparar sala e materiais.',       'Paciente confirmou presença.',                            ARRAY['cancelado']),

    (v_clinic_id, 'reagendado',            'Reagendado',             'Consulta reagendada — registrar data anterior e nova.',  '#F97316', 'appointment', 'status_agenda', false, true, 40,
     'agendamento', 'refresh-cw',  'Reagendado',              '#F97316',
     'mensagem_reagendamento',  'alert_reagendamento',    null,
     'Reconfirmar 24h antes.',           'Consulta reagendada — registrar data anterior e nova.',   ARRAY[]::text[]),

    (v_clinic_id, 'cancelado',             'Cancelado',              'Paciente cancelou a consulta.',                          '#EF4444', 'appointment', 'status_agenda', false, true, 50,
     'agendamento', 'x',           'Cancelado',               '#EF4444',
     'mensagem_cancelamento',   'alert_cancelamento',     'task_recuperar_cancelamento',
     'Iniciar fluxo de recuperação.',    'Paciente cancelou a consulta.',                           ARRAY['confirmado']),

    (v_clinic_id, 'falta',                 'Falta (No-show)',         'Paciente não compareceu sem aviso prévio.',              '#DC2626', 'appointment', 'status_agenda', false, true, 60,
     'agendamento', 'x-circle',    'Falta',                   '#DC2626',
     'reagendamento_noshow',    'alert_noshow',           'task_recuperar_noshow',
     'Tentar reagendar em 24h.',         'Paciente não compareceu sem aviso prévio.',               ARRAY[]::text[]),

    (v_clinic_id, 'encaixe',               'Encaixe',                'Encaixe de urgência fora do horário normal.',            '#8B5CF6', 'appointment', 'status_agenda', false, true, 70,
     'agendamento', 'zap',         'Agendado',                '#8B5CF6',
     'confirmacao_agendamento', 'alert_novo_agendamento', null,
     'Confirmar horário imediatamente.', 'Encaixe de urgência fora do horário normal.',             ARRAY[]::text[]),

    (v_clinic_id, 'prioridade_agenda',     'Prioridade na Agenda',   'Paciente VIP ou urgência clínica.',                      '#DB2777', 'appointment', 'status_agenda', false, true, 80,
     'agendamento', 'alert-circle','Agendado',                '#DB2777',
     null,                      'alert_lead_quente',      'task_confirmar_presenca',
     'Atendimento preferencial.',        'Paciente VIP ou urgência clínica.',                      ARRAY[]::text[])

  ON CONFLICT (clinic_id, slug) DO UPDATE SET
    group_slug        = EXCLUDED.group_slug,
    icon              = EXCLUDED.icon,
    kanban_coluna     = EXCLUDED.kanban_coluna,
    cor_calendario    = EXCLUDED.cor_calendario,
    msg_template_id   = EXCLUDED.msg_template_id,
    alert_template_id = EXCLUDED.alert_template_id,
    task_template_id  = EXCLUDED.task_template_id,
    proxima_acao      = EXCLUDED.proxima_acao,
    regras_aplicacao  = EXCLUDED.regras_aplicacao,
    incompativeis     = EXCLUDED.incompativeis;

  -- ── 5c. Paciente (entity_type = patient) ──────────────────────
  INSERT INTO public.tags (
    clinic_id, slug, label, description, color,
    entity_type, category, is_exclusive, is_system, sort_order,
    group_slug, icon, kanban_coluna, cor_calendario,
    msg_template_id, alert_template_id, task_template_id,
    proxima_acao, regras_aplicacao, incompativeis
  ) VALUES
    (v_clinic_id, 'paciente_ativo',         'Paciente Ativo',         'Paciente com procedimento em andamento ou recente.', '#10B981', 'patient', 'status_paciente', false, true, 10,
     'paciente', 'heart',       'Em atendimento',  '#10B981',
     null,                    null, null,
     'Monitorar retorno.',               'Paciente com procedimento em andamento ou recente.',  ARRAY[]::text[]),

    (v_clinic_id, 'consulta_realizada',     'Consulta Realizada',     'Consulta finalizada — iniciar fluxo de pós.',        '#34D399', 'patient', 'status_paciente', false, true, 20,
     'paciente', 'check',       'Pós-consulta',    '#34D399',
     'pos_procedimento_dia_0', null, 'task_acompanhamento_pos',
     'Enviar pós-consulta no mesmo dia.', 'Consulta finalizada — iniciar fluxo de pós.',        ARRAY[]::text[]),

    (v_clinic_id, 'procedimento_realizado', 'Procedimento Realizado', 'Procedimento estético finalizado com sucesso.',       '#6EE7B7', 'patient', 'status_paciente', false, true, 30,
     'paciente', 'activity',    'Pós-procedimento','#6EE7B7',
     'pos_procedimento_dia_0', null, 'task_acompanhamento_pos',
     'Iniciar fluxo D0 a D3.',           'Procedimento estético finalizado com sucesso.',       ARRAY[]::text[]),

    (v_clinic_id, 'pos_consulta',           'Pós-consulta',           'Em acompanhamento pós-consulta (D0 a D7).',           '#A7F3D0', 'patient', 'status_paciente', false, true, 40,
     'paciente', 'sun',         'Pós-consulta',    null,
     'pos_procedimento_dia_1', null, 'task_acompanhamento_pos',
     'Ligar 72h após procedimento.',     'Em acompanhamento pós-consulta (D0 a D7).',           ARRAY[]::text[]),

    (v_clinic_id, 'pos_procedimento',       'Pós-procedimento',       'Acompanhamento pós-procedimento estético ativo.',     '#14B8A6', 'patient', 'status_paciente', false, true, 50,
     'paciente', 'heart',       'Pós-procedimento',null,
     'pos_procedimento_dia_0', null, 'task_acompanhamento_pos',
     'Acompanhar dias 1, 2 e 3.',        'Acompanhamento pós-procedimento estético ativo.',     ARRAY[]::text[]),

    (v_clinic_id, 'aguardando_retorno',     'Aguardando Retorno',     'Retorno ou manutenção agendada futuramente.',         '#0EA5E9', 'patient', 'status_paciente', false, true, 60,
     'paciente', 'refresh-cw',  'Aguardando retorno',null,
     'lembrete_retorno',       null, null,
     'Lembrar 7 dias antes.',            'Retorno ou manutenção agendada futuramente.',         ARRAY[]::text[]),

    (v_clinic_id, 'avaliacao_pendente',     'Avaliação Pendente',     'Pedido de avaliação ainda não enviado.',              '#FBBF24', 'patient', 'status_paciente', false, true, 70,
     'paciente', 'star',        'Pós-consulta',    null,
     'pedido_avaliacao',       null, null,
     'Solicitar avaliação no D+3.',      'Pedido de avaliação ainda não enviado.',              ARRAY['avaliacao_realizada']),

    (v_clinic_id, 'avaliacao_realizada',    'Avaliação Realizada',    'Paciente deixou avaliação online.',                   '#F59E0B', 'patient', 'status_paciente', false, true, 80,
     'paciente', 'award',       'Pós-consulta',    null,
     null,                     null, null,
     'Agradecer e fidelizar.',           'Paciente deixou avaliação online.',                   ARRAY['avaliacao_pendente'])

  ON CONFLICT (clinic_id, slug) DO UPDATE SET
    group_slug        = EXCLUDED.group_slug,
    icon              = EXCLUDED.icon,
    kanban_coluna     = EXCLUDED.kanban_coluna,
    cor_calendario    = EXCLUDED.cor_calendario,
    msg_template_id   = EXCLUDED.msg_template_id,
    alert_template_id = EXCLUDED.alert_template_id,
    task_template_id  = EXCLUDED.task_template_id,
    proxima_acao      = EXCLUDED.proxima_acao,
    regras_aplicacao  = EXCLUDED.regras_aplicacao,
    incompativeis     = EXCLUDED.incompativeis;

  -- ── 5d. Orçamento (entity_type = budget) ──────────────────────
  INSERT INTO public.tags (
    clinic_id, slug, label, description, color,
    entity_type, category, is_exclusive, is_system, sort_order,
    group_slug, icon, kanban_coluna, cor_calendario,
    msg_template_id, alert_template_id, task_template_id,
    proxima_acao, regras_aplicacao, incompativeis
  ) VALUES
    (v_clinic_id, 'orc_em_aberto',    'Orçamento em Aberto', 'Consulta realizada, saiu com orçamento aberto.',      '#FCD34D', 'budget', 'status_orcamento', false, true, 10,
     'orcamento', 'clipboard',  'Em aberto',        '#F59E0B',
     'orcamento_enviado',  null,               'task_followup_orcamento',
     'Follow-up em 48h.',                  'Consulta realizada, saiu com orçamento aberto. Sem procedimento feito.', ARRAY['orc_perdido']),

    (v_clinic_id, 'orc_enviado',      'Orçamento Enviado',   'Orçamento enviado por WhatsApp ou e-mail.',           '#F59E0B', 'budget', 'status_orcamento', false, true, 20,
     'orcamento', 'send',        'Orçamento enviado','#F59E0B',
     'orcamento_enviado',  null,               'task_followup_orcamento',
     'Confirmar recebimento em 24h.',      'Orçamento enviado por WhatsApp ou e-mail.',                              ARRAY['orc_aprovado','orc_perdido']),

    (v_clinic_id, 'orc_em_negociacao','Em Negociação',       'Pessoa pediu negociação de valor ou condição.',       '#F97316', 'budget', 'status_orcamento', false, true, 30,
     'orcamento', 'git-merge',   'Em negociação',    '#F97316',
     null,                 'alert_negociacao', 'task_proposta_negociacao',
     'Resposta em até 24h.',               'Pessoa pediu negociação de valor ou condição.',                         ARRAY['orc_aprovado','orc_perdido']),

    (v_clinic_id, 'orc_followup',     'Follow-up Pendente',  'Sem resposta há mais de 48h.',                        '#FDE68A', 'budget', 'status_orcamento', false, true, 40,
     'orcamento', 'clock',       'Follow-up',        null,
     null,                 null,               'task_followup_orcamento',
     'Identificar objeção e acionar template.','Sem resposta há mais de 48h. Acionar fluxo por objeção.',           ARRAY['orc_aprovado','orc_perdido']),

    (v_clinic_id, 'orc_aprovado',     'Aprovado — Agendar',  'Pessoa aprovou o orçamento.',                         '#059669', 'budget', 'status_orcamento', false, true, 50,
     'orcamento', 'check-circle','Aprovado',         '#059669',
     'orcamento_aprovado', 'alert_novo_agendamento','task_agendar_consulta',
     'Agendar procedimento.',              'Pessoa aprovou o orçamento. Mover para Agendamento imediatamente.',     ARRAY['orc_perdido']),

    (v_clinic_id, 'orc_perdido',      'Perdido',             'Pessoa recusou o orçamento definitivamente.',         '#9CA3AF', 'budget', 'status_orcamento', false, true, 60,
     'orcamento', 'x-circle',   'Perdido',          null,
     null,                 null,               null,
     'Reativar em 90 dias.',               'Pessoa recusou o orçamento definitivamente.',                           ARRAY['orc_aprovado'])

  ON CONFLICT (clinic_id, slug) DO UPDATE SET
    group_slug        = EXCLUDED.group_slug,
    icon              = EXCLUDED.icon,
    kanban_coluna     = EXCLUDED.kanban_coluna,
    cor_calendario    = EXCLUDED.cor_calendario,
    msg_template_id   = EXCLUDED.msg_template_id,
    alert_template_id = EXCLUDED.alert_template_id,
    task_template_id  = EXCLUDED.task_template_id,
    proxima_acao      = EXCLUDED.proxima_acao,
    regras_aplicacao  = EXCLUDED.regras_aplicacao,
    incompativeis     = EXCLUDED.incompativeis;

  -- ── 5e. Paciente + Orçamento (entity_type = budget) ───────────
  INSERT INTO public.tags (
    clinic_id, slug, label, description, color,
    entity_type, category, is_exclusive, is_system, sort_order,
    group_slug, icon, kanban_coluna, cor_calendario,
    msg_template_id, alert_template_id, task_template_id,
    proxima_acao, regras_aplicacao, incompativeis
  ) VALUES
    (v_clinic_id, 'orcamento_aberto',        'Orçamento Aberto', 'Orçamento criado e ainda sem resposta.',           '#A78BFA', 'budget', 'status_orcamento', false, true, 10,
     'pac_orcamento', 'file-plus',   'Orçamento aberto', '#8B5CF6',
     'orcamento_enviado',  null,               'task_followup_orcamento',
     'Follow-up em 48h.',             'Orçamento criado e ainda sem resposta.',            ARRAY['orcamento_fechado','orcamento_perdido']),

    (v_clinic_id, 'orcamento_enviado',       'Orçamento Enviado','Orçamento enviado por WhatsApp.',                  '#8B5CF6', 'budget', 'status_orcamento', false, true, 20,
     'pac_orcamento', 'send',        'Orçamento aberto', '#8B5CF6',
     'orcamento_enviado',  null,               'task_followup_orcamento',
     'Confirmar recebimento em 24h.', 'Orçamento enviado por WhatsApp.',                   ARRAY['orcamento_fechado']),

    (v_clinic_id, 'orcamento_em_negociacao', 'Em Negociação',    'Paciente solicitou negociação de valor.',          '#F59E0B', 'budget', 'status_orcamento', false, true, 30,
     'pac_orcamento', 'git-merge',   'Em negociação',    '#F59E0B',
     null,                 'alert_negociacao', 'task_proposta_negociacao',
     'Resposta em até 24h.',          'Paciente solicitou negociação de valor.',           ARRAY['orcamento_fechado']),

    (v_clinic_id, 'orcamento_followup',      'Follow-up',        'Aguardando decisão do paciente.',                  '#C4B5FD', 'budget', 'status_orcamento', false, true, 40,
     'pac_orcamento', 'clock',       'Follow-up',        null,
     null,                 null,               'task_followup_orcamento',
     'Ativar fluxo por objeção.',     'Aguardando decisão do paciente.',                  ARRAY['orcamento_fechado','orcamento_perdido']),

    (v_clinic_id, 'orcamento_fechado',       'Fechado',          'Orçamento aprovado e procedimento agendado.',      '#059669', 'budget', 'status_orcamento', false, true, 50,
     'pac_orcamento', 'check-circle','Fechado',          '#059669',
     'orcamento_aprovado', 'alert_lead_novo',  'task_preparar_prontuario',
     'Agendar procedimento.',         'Orçamento aprovado e procedimento agendado.',      ARRAY['orcamento_perdido']),

    (v_clinic_id, 'orcamento_perdido',       'Perdido',          'Paciente recusou definitivamente.',                '#9CA3AF', 'budget', 'status_orcamento', false, true, 60,
     'pac_orcamento', 'x-circle',   'Perdido',          null,
     null,                 null,               null,
     'Reativar em 90 dias.',          'Paciente recusou definitivamente.',                ARRAY['orcamento_fechado'])

  ON CONFLICT (clinic_id, slug) DO UPDATE SET
    group_slug        = EXCLUDED.group_slug,
    icon              = EXCLUDED.icon,
    kanban_coluna     = EXCLUDED.kanban_coluna,
    cor_calendario    = EXCLUDED.cor_calendario,
    msg_template_id   = EXCLUDED.msg_template_id,
    alert_template_id = EXCLUDED.alert_template_id,
    task_template_id  = EXCLUDED.task_template_id,
    proxima_acao      = EXCLUDED.proxima_acao,
    regras_aplicacao  = EXCLUDED.regras_aplicacao,
    incompativeis     = EXCLUDED.incompativeis;

END;
$$;
