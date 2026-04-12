-- ============================================================
-- Migration: wa_message_templates — novo/retorno para agendamento
-- ============================================================
-- Cria 2 variantes do template de confirmacao de agendamento:
--   scheduling_confirm_novo   → com link da Ficha de Anamnese
--   scheduling_confirm_retorno → sem link (paciente ja preencheu)
--
-- A secretaria pode editar ambos no Settings > Templates de Mensagem.
-- O _enviarMsgAgendamento em api.js escolhe qual usar baseado em
-- appt.tipoPaciente ('novo' | 'retorno').
--
-- Mantém scheduling_confirm legado como fallback.
-- ============================================================

INSERT INTO public.wa_message_templates (
  clinic_id, slug, category, name, content, is_active, active, type, sort_order
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'scheduling_confirm_novo',
  'agendamento',
  'Confirmacao — Paciente Novo (com Ficha de Anamnese)',
$content$Olá, *{nome}*! 🌸

Seu agendamento na *{clinica}* foi confirmado com sucesso! ✅
{linha_procedimento}
👩‍⚕️ *Profissional:* {profissional}
📅 *Data:* {data}
🕐 *Horário:* {hora}

Para garantirmos o melhor atendimento personalizado, pedimos que preencha sua *Ficha de Anamnese* antes da consulta:

👉 {link_anamnese}

O preenchimento é rápido (≈5 min) e nos ajuda a entender melhor o seu histórico e objetivos. 😊

Qualquer dúvida estamos à disposição!
*Equipe {clinica}* 💜$content$,
  true, true, 'confirmacao', 10
)
ON CONFLICT (clinic_id, slug) DO UPDATE SET
  content = EXCLUDED.content,
  name    = EXCLUDED.name,
  updated_at = now();

INSERT INTO public.wa_message_templates (
  clinic_id, slug, category, name, content, is_active, active, type, sort_order
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'scheduling_confirm_retorno',
  'agendamento',
  'Confirmacao — Paciente Retorno (sem Ficha)',
$content$Olá, *{nome}*! 🌸

Seu retorno na *{clinica}* foi confirmado com sucesso! ✅
{linha_procedimento}
👩‍⚕️ *Profissional:* {profissional}
📅 *Data:* {data}
🕐 *Horário:* {hora}

Já estamos preparando tudo pra te receber. Se precisar remarcar ou tiver alguma dúvida, é só responder esta mensagem.

Até breve!
*Equipe {clinica}* 💜$content$,
  true, true, 'confirmacao', 11
)
ON CONFLICT (clinic_id, slug) DO UPDATE SET
  content = EXCLUDED.content,
  name    = EXCLUDED.name,
  updated_at = now();

-- Constraint de unicidade (idempotente pro caso do ON CONFLICT acima)
CREATE UNIQUE INDEX IF NOT EXISTS uniq_wa_templates_clinic_slug
  ON public.wa_message_templates (clinic_id, slug);
