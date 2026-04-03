-- ============================================================
-- Migration: 013 — SDR: Seed de Tags
-- Sprint 8 — SDR Module Foundation
--
-- Insere todas as tags pré-definidas para a clínica padrão.
-- Tags com is_system=true não podem ser deletadas pelo usuário.
--
-- IMPORTANTE: Substituir '<CLINIC_ID>' pelo UUID real da clínica
-- antes de rodar. Ou adaptar para rodar com JOIN em clinics.
--
-- Categorias e exclusividade:
--   temperatura    → is_exclusive=true (só 1 por lead)
--   prioridade     → is_exclusive=true (só 1 por lead)
--   status_contato → is_exclusive=false (múltiplas possíveis)
--   agendamento    → is_exclusive=false
--   paciente       → is_exclusive=false
--   orcamento      → is_exclusive=false
-- ============================================================

DO $$
DECLARE
  v_clinic_id uuid;
BEGIN
  -- Pega o clinic_id da primeira clínica ativa (ajustar se multi-tenant)
  SELECT id INTO v_clinic_id FROM public.clinics LIMIT 1;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma clínica encontrada — verifique a tabela clinics';
  END IF;

  -- ── FASE: captacao ─ entity_type: lead ──────────────────────

  -- Categoria: temperatura (exclusiva)
  INSERT INTO public.tags (clinic_id, slug, label, description, color, entity_type, category, is_exclusive, is_system, sort_order)
  VALUES
    (v_clinic_id, 'lead.frio',   'Lead Frio',   'Sem engajamento recente',           '#93c5fd', 'lead', 'temperatura', true,  true, 10),
    (v_clinic_id, 'lead.morno',  'Lead Morno',  'Demonstrou interesse inicial',       '#fcd34d', 'lead', 'temperatura', true,  true, 20),
    (v_clinic_id, 'lead.quente', 'Lead Quente', 'Alta intenção, pronto para avançar', '#f87171', 'lead', 'temperatura', true,  true, 30)
  ON CONFLICT (clinic_id, slug) DO NOTHING;

  -- Categoria: status_contato (não exclusiva)
  INSERT INTO public.tags (clinic_id, slug, label, description, color, entity_type, category, is_exclusive, is_system, sort_order)
  VALUES
    (v_clinic_id, 'lead.novo',               'Novo Lead',            'Acabou de entrar no sistema',          '#a78bfa', 'lead', 'status_contato', false, true,  10),
    (v_clinic_id, 'lead.sem_resposta_24h',    'Sem Resposta 24h',     'Não respondeu em 24 horas',            '#fb923c', 'lead', 'status_contato', false, true,  20),
    (v_clinic_id, 'lead.sem_resposta_48h',    'Sem Resposta 48h',     'Não respondeu em 48 horas',            '#ef4444', 'lead', 'status_contato', false, true,  30),
    (v_clinic_id, 'lead.indicacao',           'Indicação',            'Lead veio por indicação de paciente',  '#34d399', 'lead', 'status_contato', false, true,  40),
    (v_clinic_id, 'lead.prioridade_alta',     'Prioridade Alta',      'Requer atenção imediata',              '#ef4444', 'lead', 'prioridade',      true,  true,  50),
    (v_clinic_id, 'lead.em_negociacao',       'Em Negociação',        'Discutindo condições ou valor',        '#f59e0b', 'lead', 'status_contato', false, true,  60),
    (v_clinic_id, 'lead.retornar_amanha',     'Retornar Amanhã',      'SDR marcou para ligar amanhã',         '#60a5fa', 'lead', 'status_contato', false, true,  70)
  ON CONFLICT (clinic_id, slug) DO NOTHING;

  -- ── FASE: agendamento ─ entity_type: appointment ────────────

  INSERT INTO public.tags (clinic_id, slug, label, description, color, entity_type, category, is_exclusive, is_system, sort_order)
  VALUES
    (v_clinic_id, 'appointment.agendado',            'Agendado',             'Consulta marcada',                    '#34d399', 'appointment', 'status_agenda', true,  true, 10),
    (v_clinic_id, 'appointment.confirmacao_pendente', 'Confirmação Pendente', 'Aguardando confirmação do paciente',   '#fcd34d', 'appointment', 'status_agenda', true,  true, 20),
    (v_clinic_id, 'appointment.confirmado',          'Confirmado',           'Paciente confirmou presença',          '#22c55e', 'appointment', 'status_agenda', true,  true, 30),
    (v_clinic_id, 'appointment.lembrete_24h',        'Lembrete 24h',         'Lembrete automático enviado 24h antes','#93c5fd', 'appointment', 'comunicacao',   false, true, 40),
    (v_clinic_id, 'appointment.lembrete_2h',         'Lembrete 2h',          'Lembrete automático enviado 2h antes', '#93c5fd', 'appointment', 'comunicacao',   false, true, 50),
    (v_clinic_id, 'appointment.remarcar',            'Remarcar',             'Precisa ser remarcado',                '#fb923c', 'appointment', 'status_agenda', true,  true, 60),
    (v_clinic_id, 'appointment.cancelado',           'Cancelado',            'Consulta cancelada',                   '#ef4444', 'appointment', 'status_agenda', true,  true, 70),
    (v_clinic_id, 'appointment.no_show_risk',        'Risco No-Show',        'Alta probabilidade de não comparecer', '#f97316', 'appointment', 'risco',         false, true, 80),
    (v_clinic_id, 'appointment.compareceu',          'Compareceu',           'Paciente compareceu à consulta',       '#22c55e', 'appointment', 'status_agenda', true,  true, 90)
  ON CONFLICT (clinic_id, slug) DO NOTHING;

  -- ── FASE: paciente ─ entity_type: patient ───────────────────

  INSERT INTO public.tags (clinic_id, slug, label, description, color, entity_type, category, is_exclusive, is_system, sort_order)
  VALUES
    (v_clinic_id, 'patient.ativo',                'Paciente Ativo',         'Em tratamento ativo',                    '#22c55e', 'patient', 'status_paciente',   true,  true, 10),
    (v_clinic_id, 'patient.vip',                  'VIP',                    'Paciente especial / alto valor',          '#f59e0b', 'patient', 'perfil',            false, true, 20),
    (v_clinic_id, 'patient.pos_procedimento',     'Pós-Procedimento',       'Passou por procedimento recente',         '#a78bfa', 'patient', 'status_tratamento', true,  true, 30),
    (v_clinic_id, 'patient.retorno_pendente',     'Retorno Pendente',       'Tem retorno a ser agendado',              '#fb923c', 'patient', 'status_tratamento', false, true, 40),
    (v_clinic_id, 'patient.documentacao_pendente','Documentação Pendente',  'Faltam documentos ou exames',             '#fcd34d', 'patient', 'operacional',       false, true, 50),
    (v_clinic_id, 'patient.aniversariante_mes',   'Aniversariante do Mês',  'Faz aniversário neste mês',               '#f472b6', 'patient', 'engajamento',       false, true, 60),
    (v_clinic_id, 'patient.sem_retorno_90d',      'Sem Retorno 90d',        'Não retornou em 90 dias',                 '#ef4444', 'patient', 'retencao',          false, true, 70)
  ON CONFLICT (clinic_id, slug) DO NOTHING;

  -- ── FASE: orcamento ─ entity_type: budget ───────────────────

  INSERT INTO public.tags (clinic_id, slug, label, description, color, entity_type, category, is_exclusive, is_system, sort_order)
  VALUES
    (v_clinic_id, 'budget.criado',         'Orçamento Criado',      'Orçamento gerado, não enviado',       '#a78bfa', 'budget', 'status_orcamento', true,  true, 10),
    (v_clinic_id, 'budget.enviado',        'Enviado',               'Orçamento enviado ao paciente',        '#60a5fa', 'budget', 'status_orcamento', true,  true, 20),
    (v_clinic_id, 'budget.followup_1d',    'Follow-up 1 dia',       'Follow-up 1 dia após envio',           '#fcd34d', 'budget', 'followup',         false, true, 30),
    (v_clinic_id, 'budget.followup_3d',    'Follow-up 3 dias',      'Follow-up 3 dias após envio',          '#fcd34d', 'budget', 'followup',         false, true, 40),
    (v_clinic_id, 'budget.negociacao',     'Em Negociação',         'Discutindo valores ou condições',      '#f59e0b', 'budget', 'status_orcamento', true,  true, 50),
    (v_clinic_id, 'budget.aprovado',       'Aprovado',              'Paciente aceitou o orçamento',         '#22c55e', 'budget', 'status_orcamento', true,  true, 60),
    (v_clinic_id, 'budget.perdido',        'Perdido',               'Paciente recusou ou sumiu',             '#ef4444', 'budget', 'status_orcamento', true,  true, 70),
    (v_clinic_id, 'budget.sem_retorno',    'Sem Retorno',           'Não respondeu após envio',              '#9ca3af', 'budget', 'status_orcamento', true,  true, 80)
  ON CONFLICT (clinic_id, slug) DO NOTHING;

  RAISE NOTICE 'Tags criadas para clinic_id: %', v_clinic_id;
END $$;

-- ============================================================
-- VERIFICAÇÃO:
-- SELECT entity_type, category, slug, label, is_exclusive
-- FROM public.tags
-- ORDER BY entity_type, category, sort_order;
-- ============================================================
