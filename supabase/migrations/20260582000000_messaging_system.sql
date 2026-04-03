-- ============================================================
-- Migration: ClinicAI Messaging System
-- Tabelas para conversas WhatsApp, fila de envio, templates
-- ============================================================

-- 1. Numeros de WhatsApp conectados
CREATE TABLE IF NOT EXISTS wa_numbers (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL,
  phone       text NOT NULL,
  label       text DEFAULT 'Principal',
  instance_id text,                          -- Evolution API instance ID
  api_url     text,                          -- Evolution API base URL
  api_key     text,                          -- Evolution API key
  is_active   boolean DEFAULT true,
  assigned_to text DEFAULT 'geral',          -- geral, sdr, agendamento, etc
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- 2. Conversas (uma por lead por numero)
CREATE TABLE IF NOT EXISTS wa_conversations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  lead_id         text NOT NULL,
  wa_number_id    uuid REFERENCES wa_numbers(id),
  phone           text NOT NULL,              -- telefone do lead
  status          text DEFAULT 'active',      -- active, paused, closed, blocked
  ai_persona      text DEFAULT 'onboarder',   -- onboarder, sdr, closer, scheduler, recovery, confirmador
  ai_enabled      boolean DEFAULT true,       -- IA ativa ou pausada (humano assumiu)
  last_message_at timestamptz,
  last_lead_msg   timestamptz,                -- ultima msg do lead
  last_ai_msg     timestamptz,                -- ultima msg da IA
  unread_count    int DEFAULT 0,
  cadence_step    int DEFAULT 0,              -- step atual da cadencia
  cadence_paused  boolean DEFAULT false,
  tags            text[] DEFAULT '{}',        -- marcacoes: sem_resposta, perguntou_preco, etc
  metadata        jsonb DEFAULT '{}',         -- dados extras
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

-- 3. Mensagens individuais
CREATE TABLE IF NOT EXISTS wa_messages (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id uuid REFERENCES wa_conversations(id) ON DELETE CASCADE,
  clinic_id       uuid NOT NULL,
  direction       text NOT NULL,              -- inbound, outbound
  sender          text NOT NULL,              -- lead, lara, humano
  content         text NOT NULL,
  content_type    text DEFAULT 'text',        -- text, image, audio, video, document
  media_url       text,
  template_id     uuid,                       -- se veio de template
  status          text DEFAULT 'sent',        -- pending, sent, delivered, read, failed
  ai_generated    boolean DEFAULT false,
  ai_model        text,                       -- claude-sonnet-4-6, etc
  ai_tokens_used  int,
  error_message   text,
  wa_message_id   text,                       -- ID do WhatsApp (para tracking)
  sent_at         timestamptz DEFAULT now(),
  delivered_at    timestamptz,
  read_at         timestamptz,
  created_at      timestamptz DEFAULT now()
);

-- 4. Templates de mensagem editaveis
CREATE TABLE IF NOT EXISTS wa_message_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL,
  slug        text NOT NULL,
  name        text NOT NULL,
  category    text DEFAULT 'geral',           -- onboarding, follow_up, agendamento, pos_consulta, recuperacao, broadcasting
  content     text NOT NULL,                  -- com variaveis {nome}, {queixa}, {data}, etc
  is_active   boolean DEFAULT true,
  sort_order  int DEFAULT 0,
  metadata    jsonb DEFAULT '{}',
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now(),
  UNIQUE(clinic_id, slug)
);

-- 5. Cadencias (sequencias programadas)
CREATE TABLE IF NOT EXISTS wa_cadences (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL,
  name        text NOT NULL,
  trigger_phase text DEFAULT 'lead',          -- fase que ativa a cadencia
  is_active   boolean DEFAULT true,
  steps       jsonb NOT NULL DEFAULT '[]',    -- [{day: 0, hour: null, template_id: ..., ai_mode: true}, ...]
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

-- 6. Fila de envio (outbox)
CREATE TABLE IF NOT EXISTS wa_outbox (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL,
  conversation_id uuid REFERENCES wa_conversations(id),
  lead_id         text NOT NULL,
  phone           text NOT NULL,
  content         text NOT NULL,
  content_type    text DEFAULT 'text',
  media_url       text,
  template_id     uuid,
  priority        int DEFAULT 5,              -- 1=urgente, 5=normal, 10=baixa
  scheduled_at    timestamptz,                -- null = enviar agora
  business_hours  boolean DEFAULT true,       -- respeitar horario comercial
  status          text DEFAULT 'pending',     -- pending, processing, sent, failed, cancelled
  attempts        int DEFAULT 0,
  max_attempts    int DEFAULT 3,
  error_message   text,
  created_at      timestamptz DEFAULT now(),
  processed_at    timestamptz
);

-- 7. Campos adicionais no lead
ALTER TABLE leads ADD COLUMN IF NOT EXISTS wa_opt_in boolean DEFAULT true;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_contacted_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS last_response_at timestamptz;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS conversation_status text DEFAULT 'new';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS ai_persona text DEFAULT 'onboarder';

-- 8. Indexes
CREATE INDEX IF NOT EXISTS idx_wa_conversations_lead ON wa_conversations(lead_id);
CREATE INDEX IF NOT EXISTS idx_wa_conversations_status ON wa_conversations(status);
CREATE INDEX IF NOT EXISTS idx_wa_messages_conversation ON wa_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_wa_messages_sent_at ON wa_messages(sent_at);
CREATE INDEX IF NOT EXISTS idx_wa_outbox_status ON wa_outbox(status, scheduled_at);
CREATE INDEX IF NOT EXISTS idx_wa_outbox_pending ON wa_outbox(status) WHERE status = 'pending';

-- 9. RLS
ALTER TABLE wa_numbers ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_cadences ENABLE ROW LEVEL SECURITY;
ALTER TABLE wa_outbox ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wa_numbers_clinic" ON wa_numbers FOR ALL USING (clinic_id = public.app_clinic_id());
CREATE POLICY "wa_conversations_clinic" ON wa_conversations FOR ALL USING (clinic_id = public.app_clinic_id());
CREATE POLICY "wa_messages_clinic" ON wa_messages FOR ALL USING (clinic_id = public.app_clinic_id());
CREATE POLICY "wa_templates_clinic" ON wa_message_templates FOR ALL USING (clinic_id = public.app_clinic_id());
CREATE POLICY "wa_cadences_clinic" ON wa_cadences FOR ALL USING (clinic_id = public.app_clinic_id());
CREATE POLICY "wa_outbox_clinic" ON wa_outbox FOR ALL USING (clinic_id = public.app_clinic_id());
