-- ============================================================
-- Migration: Unificacao wa_message_templates -> wa_agenda_automations
-- Data: 2026-04-16
-- Objetivo: Fonte unica de regras. Todas as mensagens automaticas
-- passam a viver em wa_agenda_automations. wa_message_templates
-- fica reservada apenas para textos sob demanda (scheduling_confirm_*).
-- ============================================================

BEGIN;

-- ─── 1. Schema extension ──────────────────────────────────────

-- 1.1 Attachment URL para imagens (editor vai usar)
ALTER TABLE wa_agenda_automations
  ADD COLUMN IF NOT EXISTS attachment_url text;

-- 1.2 trigger_config ja e jsonb — novas chaves:
--     delay_days, delay_hours, delay_minutes em on_tag (delay apos aplicar tag)
--     Nao precisa ALTER, apenas convencao.

COMMENT ON COLUMN wa_agenda_automations.attachment_url IS
  'URL de imagem anexada. Enviada junto com content_template no WhatsApp.';
COMMENT ON COLUMN wa_agenda_automations.trigger_config IS
  'jsonb com config do trigger. Para on_tag: {tag, delay_days?, delay_hours?, delay_minutes?}. Para d_before/d_zero: {days?, hour, minute}. Para min_before: {minutes}. Para on_status: {status}.';

-- ─── 2. Fusao Categoria 3 — atualiza regras existentes ────────

-- Fusao 1: Cancelamento (funde empatia do auto_reply_cancelled)
UPDATE wa_agenda_automations
SET content_template = 'Ola, *{{nome}}*! 😊

Sua consulta de {{data}} foi cancelada.

Sem problemas — se quiser remarcar, e so me avisar por aqui. Estamos a disposicao! 💜

*{{clinica}}*'
WHERE name = 'Cancelamento' AND trigger_type = 'on_status';

-- Fusao 3: Pos-procedimento D+3 (adiciona cuidados do paciente_pos_consulta)
UPDATE wa_agenda_automations
SET content_template = 'Oi, *{{nome}}*! 💜

Ja sao 3 dias desde seu procedimento. Como voce esta se sentindo?

*Lembretes de cuidado:*
- Evitar sol direto na regiao tratada
- Manter a pele hidratada
- Qualquer vermelhidao incomum, nos avise!

Esta feliz com o resultado? Adorariamos ver uma foto! 📸

*{{clinica}}*'
WHERE name = 'Pos-procedimento D+3' AND trigger_type = 'd_after';

-- Fusao 4: Pos-procedimento D+1 (usa tags procedimento/profissional)
UPDATE wa_agenda_automations
SET content_template = 'Oi, *{{nome}}*! 💜

Como voce esta se sentindo apos o *{{procedimento}}*?

Lembre-se de seguir os cuidados indicados por *{{profissional}}*.

Qualquer duvida, estamos aqui! 🏥

— *{{clinica}}*'
WHERE name = 'Pos-procedimento D+1' AND trigger_type = 'd_after';

-- Fusao 5: menu_da_clinica era so "Ola, {nome}!" — descartar sem fundir.
-- Consentimento Imagem permanece intacto.

-- ─── 3. Novas regras (Categoria 4 + Fusao 3-sem-equivalente) ──

-- Auto reply quando paciente confirma presenca
INSERT INTO wa_agenda_automations (
  name, description, category, trigger_type, trigger_config,
  channel, content_template, sort_order, is_active
) VALUES (
  'Resposta Confirmacao', 'Msg automatica quando paciente confirma presenca',
  'during', 'on_status', jsonb_build_object('status', 'confirmado'),
  'whatsapp',
  'Obrigada por confirmar, *{{nome}}*! 💜

Te esperamos no dia *{{data}}* as *{{hora}}*.

Chegue 10 minutinhos antes, ta? Qualquer duvida, e so me chamar!

*Equipe {{clinica}}*',
  100, true
);

-- Aguardando confirmacao: lembrete D-1 12:30
INSERT INTO wa_agenda_automations (
  name, description, category, trigger_type, trigger_config,
  channel, content_template, sort_order, is_active
) VALUES (
  'Lembrete Aguard. Confirmacao',
  'Enviado quando status e aguardando_confirmacao, 1 dia antes as 12:30',
  'before', 'on_status', jsonb_build_object('status', 'aguardando_confirmacao'),
  'whatsapp',
  'Oi, *{{nome}}*!

Lembrando que amanha voce tem horario na *{{clinica}}*!

👩‍⚕️ *Profissional:* {{profissional}}
📅 *{{data}}* as *{{hora}}*

Por favor confirme sua presenca respondendo *SIM* ou *NAO*. 💜',
  101, true
);

-- Paciente aguardando retorno (lead/paciente dormante)
INSERT INTO wa_agenda_automations (
  name, description, category, trigger_type, trigger_config,
  channel, content_template, sort_order, is_active
) VALUES (
  'Aguardando Retorno',
  'Paciente sem visita ha muito tempo — disparada via tag aguardando_retorno',
  'during', 'on_tag',
  jsonb_build_object('tag', 'aguardando_retorno'),
  'whatsapp',
  'Oi, *{{nome}}*!

Ja faz um tempinho desde sua ultima visita na *{{clinica}}*.

Que tal agendar um retorno? Temos horarios disponiveis essa semana. 💜',
  102, true
);

-- Consulta realizada — msg 1 dia depois
INSERT INTO wa_agenda_automations (
  name, description, category, trigger_type, trigger_config,
  channel, content_template, sort_order, is_active
) VALUES (
  'Apos Consulta D+1',
  'Msg 1 dia apos a consulta (finalizada) — verifica impressoes',
  'after', 'd_after', jsonb_build_object('days', 1, 'hour', 10, 'minute', 0),
  'whatsapp',
  'Oi {{nome}}! 😊

Como foi sua consulta com *{{profissional}}*?

Espero que tenha gostado! Se tiver qualquer duvida sobre o plano de tratamento, estou aqui. 💜',
  103, true
);

-- Orcamento em negociacao — 7 dias de urgencia suave
INSERT INTO wa_agenda_automations (
  name, description, category, trigger_type, trigger_config,
  channel, content_template, sort_order, is_active
) VALUES (
  'Orcamento Urgencia 7d',
  'Urgencia suave 7 dias apos tag em_negociacao aplicada',
  'during', 'on_tag',
  jsonb_build_object('tag', 'em_negociacao', 'delay_days', 7),
  'whatsapp',
  'Oi, *{{nome}}*! ✨

Sei que decidir sobre um procedimento estetico e algo importante, e quero que voce tenha seguranca na sua escolha.

Estamos a disposicao pra tirar qualquer duvida! 💜

*{{clinica}}*',
  104, true
);

-- Encaixe confirmacao (vaga rapida)
INSERT INTO wa_agenda_automations (
  name, description, category, trigger_type, trigger_config,
  channel, content_template, sort_order, is_active
) VALUES (
  'Encaixe Confirmacao',
  'Disparada quando paciente e encaixado em vaga que abriu',
  'before', 'on_tag', jsonb_build_object('tag', 'encaixe'),
  'whatsapp',
  'Ola, *{{nome}}*! 🌸

Conseguimos um encaixe pra voce na *{{clinica}}*! ✅

👩‍⚕️ *Profissional:* {{profissional}}
📅 *{{data}}* as *{{hora}}*

Confirme sua presenca respondendo *SIM*. 💜',
  105, true
);

-- Orcamento enviado — disparada por tag orcamento-aberto
INSERT INTO wa_agenda_automations (
  name, description, category, trigger_type, trigger_config,
  channel, content_template, sort_order, is_active
) VALUES (
  'Orcamento Enviado Msg',
  'Enviada quando secretaria envia orcamento (tag orcamento-aberto)',
  'during', 'on_tag', jsonb_build_object('tag', 'orcamento-aberto'),
  'whatsapp',
  'Oi, *{{nome}}*! 💜

Seu orcamento da *{{clinica}}* esta pronto!

Preparamos um plano personalizado pra voce. Qualquer duvida ou se quiser negociar, e so me chamar. 😊',
  106, true
);

-- Orcamento follow-up D+3 (tag orcamento-aberto + delay 3d)
INSERT INTO wa_agenda_automations (
  name, description, category, trigger_type, trigger_config,
  channel, content_template, sort_order, is_active
) VALUES (
  'Orcamento Follow-up 3d',
  'Follow-up 3 dias apos aplicar tag orcamento-aberto',
  'during', 'on_tag',
  jsonb_build_object('tag', 'orcamento-aberto', 'delay_days', 3, 'delay_hours', 10),
  'whatsapp',
  'Oi, *{{nome}}*!

Passando pra saber se voce conseguiu ver o orcamento que enviei.

Ficou alguma duvida? Posso te ajudar a escolher o melhor plano! 💜

*{{clinica}}*',
  107, true
);

-- Paciente fechou procedimento (tag orcamento_fechado)
INSERT INTO wa_agenda_automations (
  name, description, category, trigger_type, trigger_config,
  channel, content_template, sort_order, is_active
) VALUES (
  'Orcamento Fechado',
  'Disparada ao aplicar tag orcamento_fechado (paciente aceitou)',
  'during', 'on_tag', jsonb_build_object('tag', 'orcamento_fechado'),
  'whatsapp',
  '*{{nome}}*, que otima noticia!

Seu plano de tratamento esta confirmado na *{{clinica}}*.

Em breve te mando os proximos passos! 💜',
  108, true
);

-- Post-consultation — 2h depois (uso diferente do D+1)
-- Opcional: manter separado se user quiser "como foi" logo apos + D+1 formal
-- Decisao: DESCARTAR (redundante com Apos Consulta D+1)

-- ─── 4. Campanha Lara (lead_novo) — 18 regras INATIVAS ────────
-- Migradas como INATIVAS porque formam 3 sequencias distintas
-- (onboarding / ff fullface / proc olheiras) que nao devem rodar juntas.
-- Usuario reativa conforme definir a logica de segmentacao por tag.

-- Onboarding base (tag lead_novo padrao)
INSERT INTO wa_agenda_automations (name, description, category, trigger_type, trigger_config, channel, content_template, sort_order, is_active)
SELECT
  'Lara: ' || name,
  'Migrada de wa_message_templates. REVISAR DELAY antes de ativar.',
  'during', 'on_tag',
  jsonb_build_object(
    'tag', 'lead_novo',
    'delay_days', CASE slug
      WHEN 'onboarding_welcome' THEN 0
      WHEN 'onboarding_followup_1' THEN 1
      WHEN 'followup_social_proof' THEN 2
      WHEN 'followup_urgency' THEN 3
      WHEN 'followup_last' THEN 5
      ELSE 0 END
  ),
  'whatsapp',
  regexp_replace(content, '\{(\w+)\}', '{{\1}}', 'g'),
  sort_order,
  false  -- INATIVO ate user revisar
FROM wa_message_templates
WHERE slug IN ('onboarding_welcome','onboarding_followup_1','followup_social_proof','followup_urgency','followup_last')
  AND is_active = true;

-- Sequencia FF Fullface (tag lead_novo_fullface — a ser aplicada por logica de quiz)
INSERT INTO wa_agenda_automations (name, description, category, trigger_type, trigger_config, channel, content_template, sort_order, is_active)
SELECT
  'Lara FF: ' || name,
  'Campanha Fullface. Aplicar tag lead_novo_fullface. REVISAR antes de ativar.',
  'during', 'on_tag',
  jsonb_build_object(
    'tag', 'lead_novo_fullface',
    'delay_days', CASE slug
      WHEN 'ff_followup_day1' THEN 1
      WHEN 'ff_followup_day2' THEN 2
      WHEN 'ff_followup_day3' THEN 3
      WHEN 'ff_followup_day5' THEN 5
      WHEN 'ff_followup_day7' THEN 7
      WHEN 'ff_followup_day10' THEN 10
      WHEN 'ff_story_sandra' THEN 4
      WHEN 'ff_story_cinthia' THEN 6
      WHEN 'ff_story_gedina' THEN 8
      ELSE 0 END
  ),
  'whatsapp',
  regexp_replace(content, '\{(\w+)\}', '{{\1}}', 'g'),
  sort_order,
  false
FROM wa_message_templates
WHERE slug IN ('ff_followup_day1','ff_followup_day2','ff_followup_day3','ff_followup_day5','ff_followup_day7','ff_followup_day10','ff_story_sandra','ff_story_cinthia','ff_story_gedina')
  AND is_active = true;

-- Sequencia Proc Olheiras (tag lead_novo_olheiras)
INSERT INTO wa_agenda_automations (name, description, category, trigger_type, trigger_config, channel, content_template, sort_order, is_active)
SELECT
  'Lara Olheiras: ' || name,
  'Campanha Olheiras/Smooth Eyes. Aplicar tag lead_novo_olheiras. REVISAR antes de ativar.',
  'during', 'on_tag',
  jsonb_build_object(
    'tag', 'lead_novo_olheiras',
    'delay_days', CASE slug
      WHEN 'proc_followup_day1' THEN 1
      WHEN 'proc_followup_day2' THEN 2
      WHEN 'proc_followup_day3' THEN 3
      WHEN 'proc_followup_day5' THEN 5
      ELSE 0 END
  ),
  'whatsapp',
  regexp_replace(content, '\{(\w+)\}', '{{\1}}', 'g'),
  sort_order,
  false
FROM wa_message_templates
WHERE slug IN ('proc_followup_day1','proc_followup_day2','proc_followup_day3','proc_followup_day5')
  AND is_active = true;

-- ─── 5. Recuperacao 'perdido' (3 regras) ──────────────────────
INSERT INTO wa_agenda_automations (name, description, category, trigger_type, trigger_config, channel, content_template, sort_order, is_active)
SELECT
  'Recuperacao: ' || name,
  'Recuperacao de lead perdido. Aplicar tag perdido.',
  'during', 'on_tag',
  jsonb_build_object('tag', 'perdido', 'delay_days',
    CASE slug WHEN 'recovery_quiz_abandoned' THEN 0
              WHEN 'recovery_value' THEN 2
              WHEN 'recovery_promo' THEN 5 END),
  'whatsapp',
  regexp_replace(content, '\{(\w+)\}', '{{\1}}', 'g'),
  sort_order,
  false
FROM wa_message_templates
WHERE slug IN ('recovery_quiz_abandoned','recovery_value','recovery_promo')
  AND is_active = true;

-- ─── 6. D3 Correcoes impecaveis ───────────────────────────────

-- 6.1 Nao ha referencia a 'falta_no_show_' em wa_agenda_automations
--     (nunca foi usado). Descartado naturalmente.

-- 6.2 Templates com fases inconsistentes ja NAO foram migrados
--     ('reagendado' descartado — aliased no status 'remarcado' ja existente).
--     'orcamento_em_aberto' / 'orcamento_aberto' unificados sob tag 'orcamento-aberto'.

-- ─── 7. Deprecar wa_message_templates ─────────────────────────
-- Mantem scheduling_confirm_novo / scheduling_confirm_retorno (textos sob demanda).
-- Desativa TODOS os outros (nao DROP — rollback seguro por 30 dias).

UPDATE wa_message_templates
SET is_active = false,
    active = false,
    updated_at = now()
WHERE is_active = true
  AND slug NOT IN ('scheduling_confirm_novo', 'scheduling_confirm_retorno');

-- ─── 8. Validacao final ───────────────────────────────────────
-- Checagem: quantas regras ativas em wa_agenda_automations agora?
-- SELECT COUNT(*) FROM wa_agenda_automations WHERE is_active = true;
-- Checagem: templates ainda ativos em wa_message_templates (deve ser 2)
-- SELECT COUNT(*) FROM wa_message_templates WHERE is_active = true;

COMMIT;

-- ============================================================
-- Rollback (se necessario nas primeiras 24h):
--
-- BEGIN;
--   UPDATE wa_message_templates SET is_active = true, active = true
--   WHERE is_active = false;
--   DELETE FROM wa_agenda_automations WHERE description LIKE 'Migrada de wa_message_templates%'
--      OR description LIKE 'Campanha Fullface%' OR description LIKE 'Campanha Olheiras%'
--      OR description LIKE 'Recuperacao de lead perdido%'
--      OR name IN ('Resposta Confirmacao', 'Lembrete Aguard. Confirmacao',
--                  'Aguardando Retorno', 'Apos Consulta D+1',
--                  'Orcamento Urgencia 7d', 'Encaixe Confirmacao',
--                  'Orcamento Enviado Msg', 'Orcamento Follow-up 3d',
--                  'Orcamento Fechado');
--   ALTER TABLE wa_agenda_automations DROP COLUMN attachment_url;
-- COMMIT;
-- ============================================================
