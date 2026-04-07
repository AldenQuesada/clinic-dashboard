-- ============================================================
-- Migration: Agenda Automations — configurable rules engine
--
-- Replaces hardcoded WA_TPLS, scheduleAutomations(),
-- _enviarConsentimento(), and wa_daily_summary() templates
-- with a database-driven rules table editable from the UI.
-- ============================================================

-- ── 1. Table ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wa_agenda_automations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',

  -- Identity
  name          text NOT NULL,
  description   text DEFAULT '',
  category      text NOT NULL DEFAULT 'before',  -- before | during | after | summary
  sort_order    int  DEFAULT 0,
  is_active     boolean DEFAULT true,

  -- Trigger
  trigger_type  text NOT NULL,
  -- d_before     : { days: N, hour: H, minute: M }
  -- d_zero       : { hour: H, minute: M }
  -- min_before   : { minutes: N }
  -- on_status    : { status: 'na_clinica' }
  -- on_tag       : { tag: 'orcamento-aberto' }
  -- on_finalize  : {}
  -- d_after      : { days: N, hour: H, minute: M }
  -- daily_summary: { hour: H, minute: M }
  trigger_config jsonb NOT NULL DEFAULT '{}',

  -- Recipient
  recipient_type text NOT NULL DEFAULT 'patient', -- patient | professional | both

  -- Channel
  channel       text NOT NULL DEFAULT 'whatsapp', -- whatsapp | alert | both

  -- Content (WhatsApp)
  content_template text NOT NULL DEFAULT '',
  -- Variables: {{nome}}, {{data}}, {{hora}}, {{profissional}},
  --            {{procedimento}}, {{clinica}}, {{link_anamnese}},
  --            {{status}}, {{obs}}

  -- Content (Alert)
  alert_title    text DEFAULT '',
  alert_type     text DEFAULT 'info', -- info | warning | success | error

  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_wa_agenda_auto_clinic
  ON wa_agenda_automations(clinic_id, is_active);
CREATE INDEX IF NOT EXISTS idx_wa_agenda_auto_trigger
  ON wa_agenda_automations(trigger_type);

-- RLS
ALTER TABLE wa_agenda_automations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_agenda_auto_clinic" ON wa_agenda_automations
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001');

-- ── 2. CRUD RPCs ─────────────────────────────────────────────

-- List all automations
CREATE OR REPLACE FUNCTION wa_agenda_auto_list()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic_id uuid := COALESCE(app_clinic_id(), '00000000-0000-0000-0000-000000000001');
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(a.*) ORDER BY a.category, a.sort_order, a.name)
    FROM wa_agenda_automations a
    WHERE a.clinic_id = v_clinic_id
  ), '[]'::jsonb);
END; $$;
GRANT EXECUTE ON FUNCTION wa_agenda_auto_list() TO anon, authenticated;

-- Upsert (create or update)
CREATE OR REPLACE FUNCTION wa_agenda_auto_upsert(p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic_id uuid := COALESCE(app_clinic_id(), '00000000-0000-0000-0000-000000000001');
  v_id uuid;
BEGIN
  v_id := COALESCE((p_data->>'id')::uuid, gen_random_uuid());

  INSERT INTO wa_agenda_automations (
    id, clinic_id, name, description, category, sort_order, is_active,
    trigger_type, trigger_config, recipient_type, channel,
    content_template, alert_title, alert_type
  ) VALUES (
    v_id, v_clinic_id,
    COALESCE(p_data->>'name', ''),
    COALESCE(p_data->>'description', ''),
    COALESCE(p_data->>'category', 'before'),
    COALESCE((p_data->>'sort_order')::int, 0),
    COALESCE((p_data->>'is_active')::boolean, true),
    COALESCE(p_data->>'trigger_type', 'd_before'),
    COALESCE(p_data->'trigger_config', '{}'::jsonb),
    COALESCE(p_data->>'recipient_type', 'patient'),
    COALESCE(p_data->>'channel', 'whatsapp'),
    COALESCE(p_data->>'content_template', ''),
    COALESCE(p_data->>'alert_title', ''),
    COALESCE(p_data->>'alert_type', 'info')
  )
  ON CONFLICT (id) DO UPDATE SET
    name             = EXCLUDED.name,
    description      = EXCLUDED.description,
    category         = EXCLUDED.category,
    sort_order       = EXCLUDED.sort_order,
    is_active        = EXCLUDED.is_active,
    trigger_type     = EXCLUDED.trigger_type,
    trigger_config   = EXCLUDED.trigger_config,
    recipient_type   = EXCLUDED.recipient_type,
    channel          = EXCLUDED.channel,
    content_template = EXCLUDED.content_template,
    alert_title      = EXCLUDED.alert_title,
    alert_type       = EXCLUDED.alert_type,
    updated_at       = now();

  RETURN v_id;
END; $$;
GRANT EXECUTE ON FUNCTION wa_agenda_auto_upsert(jsonb) TO anon, authenticated;

-- Delete
CREATE OR REPLACE FUNCTION wa_agenda_auto_delete(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM wa_agenda_automations WHERE id = p_id;
  RETURN FOUND;
END; $$;
GRANT EXECUTE ON FUNCTION wa_agenda_auto_delete(uuid) TO anon, authenticated;

-- Toggle active
CREATE OR REPLACE FUNCTION wa_agenda_auto_toggle(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_new boolean;
BEGIN
  UPDATE wa_agenda_automations
  SET is_active = NOT is_active, updated_at = now()
  WHERE id = p_id
  RETURNING is_active INTO v_new;
  RETURN v_new;
END; $$;
GRANT EXECUTE ON FUNCTION wa_agenda_auto_toggle(uuid) TO anon, authenticated;

-- ── 3. Seed default rules ────────────────────────────────────
INSERT INTO wa_agenda_automations (name, description, category, sort_order, trigger_type, trigger_config, recipient_type, channel, content_template, alert_title, alert_type) VALUES

-- === BEFORE (antes da consulta) ===
('Confirmacao Agendamento', 'Enviado ao criar o agendamento', 'before', 1,
 'on_status', '{"status":"agendado"}', 'patient', 'whatsapp',
 'Ola, *{{nome}}*!\n\nSeu agendamento foi confirmado!\n\n📅 *Data:* {{data}}\n⏰ *Horario:* {{hora}}\n👨‍⚕️ *Profissional:* {{profissional}}\n💆 *Procedimento:* {{procedimento}}\n\n📍 {{clinica}}\n\nQualquer duvida estamos aqui!',
 '', 'info'),

('Confirmacao D-1', 'Dia anterior as 10h', 'before', 2,
 'd_before', '{"days":1,"hour":10,"minute":0}', 'patient', 'whatsapp',
 'Ola, *{{nome}}*! ✨\n\nAmanha voce tem consulta conosco:\n\n📅 *{{data}}* as *{{hora}}*\n👨‍⚕️ *{{profissional}}*\n\nConfirme sua presenca respondendo *SIM* ou entre em contato para remarcar.\n\n📍 {{clinica}}',
 '', 'info'),

('Chegou o Dia', 'Mesmo dia as 8h', 'before', 3,
 'd_zero', '{"hour":8,"minute":0}', 'patient', 'whatsapp',
 'Bom dia, *{{nome}}*! ☀️\n\nHoje e o seu dia! Sua consulta e as *{{hora}}*.\n\n👨‍⚕️ {{profissional}}\n📍 {{clinica}}\n\nTe esperamos!',
 '', 'info'),

('30 Min Antes', '30 minutos antes da consulta', 'before', 4,
 'min_before', '{"minutes":30}', 'patient', 'whatsapp',
 'Ola, *{{nome}}*! ⏰\n\nSua consulta comeca em *30 minutos* ({{hora}}).\n\nEstamos te aguardando!\n\n📍 {{clinica}}',
 '', 'info'),

('Alerta 10 Min', 'Alerta interno 10 min antes', 'before', 5,
 'min_before', '{"minutes":10}', 'professional', 'alert',
 '', 'Proximo paciente em 10 min: {{nome}} — {{procedimento}}', 'warning'),

('Resumo Diario', 'Agenda do dia as 8h para cada profissional', 'before', 6,
 'daily_summary', '{"hour":8,"minute":0}', 'professional', 'whatsapp',
 '*Clinica — Agenda do Dia*\n{{dia_semana}}, {{data}}\n{{total_agendamentos}} agendamento{{plural}}\n━━━━━━━━━━━━━━\n\n{{lista_pacientes}}\n━━━━━━━━━━━━━━\nBom dia e sucesso {{primeiro_nome}}!',
 '', 'info'),

-- === DURING (durante a consulta) ===
('Paciente Chegou', 'Ao marcar Na Clinica', 'during', 1,
 'on_status', '{"status":"na_clinica"}', 'professional', 'alert',
 '', 'Paciente chegou: {{nome}}', 'success'),

('Consentimento Imagem', 'Ao marcar Na Clinica — consent automatico', 'during', 2,
 'on_status', '{"status":"na_clinica"}', 'patient', 'whatsapp',
 'Ola, *{{nome}}*!\n\nPara darmos continuidade ao seu atendimento, precisamos do seu consentimento para uso de imagem.\n\nPor favor, leia e confirme respondendo *ACEITO*:\n\nAutorizo o uso de imagens do meu rosto para fins de acompanhamento clinico e documentacao do tratamento.\n\n*{{clinica}}*',
 '', 'info'),

('Em Consulta', 'Alerta ao iniciar consulta', 'during', 3,
 'on_status', '{"status":"em_consulta"}', 'professional', 'alert',
 '', 'Consulta iniciada: {{nome}} — {{procedimento}}', 'info'),

-- === AFTER (apos a consulta) ===
('Consentimento Procedimento', 'Ao finalizar — consent procedimento', 'after', 1,
 'on_finalize', '{}', 'patient', 'whatsapp',
 'Ola, *{{nome}}*!\n\nSegue o termo de consentimento do procedimento realizado hoje.\n\nPor favor, leia e confirme respondendo *ACEITO*:\n\nDeclaro que fui informada sobre o procedimento, seus beneficios, riscos e cuidados pos.\n\n*{{clinica}}*',
 '', 'info'),

('Pos-Atendimento', 'Mensagem apos finalizar consulta', 'after', 2,
 'on_finalize', '{}', 'patient', 'whatsapp',
 'Ola, *{{nome}}*!\n\nFoi um prazer atender voce hoje!\n\nSe tiver qualquer duvida sobre os cuidados, pode nos chamar.\n\nSua avaliacao significa muito para nos!\n\n*{{clinica}}*',
 '', 'info'),

('Remarcamento', 'Ao remarcar consulta', 'after', 3,
 'on_status', '{"status":"remarcado"}', 'patient', 'whatsapp',
 'Ola, *{{nome}}*! 📅\n\nSua consulta foi remarcada para:\n\n📅 *{{data}}* as *{{hora}}*\n👨‍⚕️ *{{profissional}}*\n\nQualquer duvida entre em contato.\n\n📍 {{clinica}}',
 '', 'info'),

('Cancelamento', 'Ao cancelar consulta', 'after', 4,
 'on_status', '{"status":"cancelado"}', 'patient', 'whatsapp',
 'Ola, *{{nome}}*!\n\nSua consulta de {{data}} foi cancelada.\n\nQueremos te atender em breve! Quando quiser reagendar e so nos chamar. 💜\n\n{{clinica}}',
 '', 'info'),

('Recuperacao No-show', 'Ao marcar no-show', 'after', 5,
 'on_status', '{"status":"no_show"}', 'patient', 'whatsapp',
 'Ola, *{{nome}}*! 🌸\n\nNotamos que voce nao pode comparecer hoje. Tudo bem?\n\nEstamos a disposicao para reagendar quando for melhor para voce.\n\n📍 {{clinica}}',
 '', 'info'),

('Pedir Avaliacao', '3 dias apos a consulta', 'after', 6,
 'd_after', '{"days":3,"hour":10,"minute":0}', 'patient', 'whatsapp',
 'Ola, *{{nome}}*!\n\nEsperamos que esteja se sentindo bem apos o atendimento!\n\nSua opiniao nos ajuda muito a melhorar. Poderia nos avaliar?\n\nhttps://g.page/r/YOUR_GOOGLE_REVIEW_LINK/review\n\nMuito obrigado!\n\n*{{clinica}}*',
 '', 'info')

ON CONFLICT DO NOTHING;
