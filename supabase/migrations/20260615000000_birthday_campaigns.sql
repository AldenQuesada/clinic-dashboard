-- ============================================================
-- Migration: Birthday Campaign Module
-- Campanhas automaticas de aniversario com sequencia de mensagens
-- ============================================================

-- ============================================================
-- 1. Templates de mensagens (editaveis na UI)
-- ============================================================
CREATE TABLE IF NOT EXISTS wa_birthday_templates (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  day_offset  int NOT NULL,             -- dias antes do aniversario (ex: 30, 29, 28)
  send_hour   int NOT NULL DEFAULT 10,  -- hora do envio (0-23)
  label       text NOT NULL,            -- 'Oportunidade', 'Lembrete', etc
  content     text NOT NULL,            -- mensagem com [nome], [queixas], [idade], [orcamento]
  media_url   text,
  media_position text DEFAULT 'above',
  is_active   boolean DEFAULT true,
  sort_order  int DEFAULT 0,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

ALTER TABLE wa_birthday_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_birthday_templates_clinic" ON wa_birthday_templates
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- ============================================================
-- 2. Campanhas (1 por lead por ano)
-- ============================================================
CREATE TABLE IF NOT EXISTS wa_birthday_campaigns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  lead_id      text NOT NULL,
  lead_name    text,
  lead_phone   text,
  birth_date   date NOT NULL,
  campaign_year int NOT NULL,
  segment      text NOT NULL DEFAULT 'paciente',  -- paciente | orcamento | paciente_orcamento
  status       text DEFAULT 'pending',            -- pending | sending | completed | cancelled | responded
  has_open_budget boolean DEFAULT false,
  budget_id    uuid,                              -- FK budgets se tem orcamento aberto
  budget_total numeric,
  budget_title text,
  queixas      text,                              -- cache de queixas para a msg
  started_at   timestamptz,
  completed_at timestamptz,
  responded_at timestamptz,
  created_at   timestamptz DEFAULT now(),
  UNIQUE(lead_id, campaign_year)
);

ALTER TABLE wa_birthday_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY "wa_birthday_campaigns_clinic" ON wa_birthday_campaigns
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

CREATE INDEX IF NOT EXISTS idx_bday_campaigns_year ON wa_birthday_campaigns (campaign_year, status);
CREATE INDEX IF NOT EXISTS idx_bday_campaigns_lead ON wa_birthday_campaigns (lead_id);

-- ============================================================
-- 3. Mensagens individuais da sequencia
-- ============================================================
CREATE TABLE IF NOT EXISTS wa_birthday_messages (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id   uuid NOT NULL REFERENCES wa_birthday_campaigns(id) ON DELETE CASCADE,
  template_id   uuid REFERENCES wa_birthday_templates(id),
  day_offset    int NOT NULL,
  send_hour     int NOT NULL DEFAULT 10,
  content       text,                    -- mensagem ja resolvida (com variaveis substituidas)
  media_url     text,
  scheduled_at  timestamptz NOT NULL,
  outbox_id     uuid,                    -- FK wa_outbox quando enfileirada
  status        text DEFAULT 'pending',  -- pending | queued | sent | delivered | read | cancelled
  sent_at       timestamptz,
  delivered_at  timestamptz,
  read_at       timestamptz,
  created_at    timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_bday_messages_campaign ON wa_birthday_messages (campaign_id);
CREATE INDEX IF NOT EXISTS idx_bday_messages_scheduled ON wa_birthday_messages (scheduled_at, status)
  WHERE status = 'pending';

-- ============================================================
-- 4. Templates default (3 mensagens iniciais)
-- ============================================================
INSERT INTO wa_birthday_templates (day_offset, send_hour, label, content, sort_order) VALUES
(30, 10, 'Oportunidade',
'[nome], seu aniversario ta chegando! 🎂

Ja conseguiu aposentar as [queixas] que te incomodavam?

A Dra Miriam me autorizou a fazer uma doideira pra voce: *escolhe o procedimento que voce quer* e te dou 3 opcoes:

1️⃣ Desconto lindo
2️⃣ Parcela ate perder de vista
3️⃣ Faca 1 e ganhe 2

Bora se preparar pra essa virada de ciclo? Me conta aqui qual te interessa mais!', 1),

(29, 10, 'Lembrete',
'[nome], lembra da surpresa de aniversario que te falei ontem? 🎁

A oferta ainda ta de pe... mas *so ate amanha*.

Qual das 3 opcoes te interessa mais?
1️⃣ Desconto
2️⃣ Parcelamento
3️⃣ Faca 1 ganhe 2

Me conta que ja preparo tudo pra voce!', 2),

(28, 10, 'Ultima chance',
'[nome], *ultima chance!* ⏰

Hoje e o ultimo dia da sua oferta especial de aniversario. Depois disso, volta pro valor normal.

Vai deixar passar? Me responde aqui que resolvo rapidinho! 💜', 3)
ON CONFLICT DO NOTHING;

-- ============================================================
-- 5. RPC: wa_birthday_scan — Scanner diario
--    Busca leads com aniversario em N dias, cria campanhas
-- ============================================================
CREATE OR REPLACE FUNCTION wa_birthday_scan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id  uuid := '00000000-0000-0000-0000-000000000001';
  v_year       int := EXTRACT(YEAR FROM now())::int;
  v_created    int := 0;
  v_lead       record;
  v_campaign_id uuid;
  v_tmpl       record;
  v_bday       date;
  v_queixas    text;
  v_has_budget boolean;
  v_budget_id  uuid;
  v_budget_total numeric;
  v_budget_title text;
  v_segment    text;
  v_content    text;
  v_sched      timestamptz;
BEGIN
  -- Buscar templates ativos ordenados
  -- Para cada lead com aniversario nos proximos 31 dias:
  FOR v_lead IN
    SELECT l.id, l.name, l.phone, l.birth_date::date AS bd,
           l.queixas_faciais, l.queixas_corporais, l.phase,
           l.wa_opt_in, l.channel_mode
    FROM leads l
    WHERE l.clinic_id = v_clinic_id
      AND l.deleted_at IS NULL
      AND l.birth_date IS NOT NULL AND l.birth_date != ''
      AND l.phone IS NOT NULL AND l.phone != ''
      AND l.wa_opt_in = true
      -- Aniversario nos proximos 31 dias
      AND (
        make_date(v_year, EXTRACT(MONTH FROM l.birth_date::date)::int, EXTRACT(DAY FROM l.birth_date::date)::int)
        BETWEEN CURRENT_DATE AND CURRENT_DATE + 31
      )
      -- Nao tem campanha este ano ainda
      AND NOT EXISTS (
        SELECT 1 FROM wa_birthday_campaigns c
        WHERE c.lead_id = l.id AND c.campaign_year = v_year
      )
      -- Nao esta em atendimento humano
      AND COALESCE(l.channel_mode, 'ai') != 'human'
  LOOP
    -- Calcular data do aniversario este ano
    v_bday := make_date(v_year, EXTRACT(MONTH FROM v_lead.bd)::int, EXTRACT(DAY FROM v_lead.bd)::int);

    -- Resolver queixas
    v_queixas := '';
    IF v_lead.queixas_faciais IS NOT NULL AND jsonb_array_length(v_lead.queixas_faciais) > 0 THEN
      SELECT string_agg(value #>> '{}', ', ') INTO v_queixas
      FROM jsonb_array_elements(v_lead.queixas_faciais);
    END IF;
    IF v_lead.queixas_corporais IS NOT NULL AND jsonb_array_length(v_lead.queixas_corporais) > 0 THEN
      IF v_queixas != '' THEN v_queixas := v_queixas || ', '; END IF;
      SELECT v_queixas || string_agg(value #>> '{}', ', ') INTO v_queixas
      FROM jsonb_array_elements(v_lead.queixas_corporais);
    END IF;
    IF v_queixas = '' OR v_queixas IS NULL THEN v_queixas := 'aquelas coisinhas'; END IF;

    -- Verificar orcamento aberto
    v_has_budget := false;
    v_budget_id := NULL;
    v_budget_total := NULL;
    v_budget_title := NULL;
    SELECT b.id, b.total, b.title INTO v_budget_id, v_budget_total, v_budget_title
    FROM budgets b
    WHERE b.lead_id = v_lead.id
      AND b.status NOT IN ('approved', 'lost', 'cancelled')
    ORDER BY b.created_at DESC LIMIT 1;
    IF v_budget_id IS NOT NULL THEN v_has_budget := true; END IF;

    -- Determinar segmento
    IF v_lead.phase = 'paciente' AND v_has_budget THEN
      v_segment := 'paciente_orcamento';
    ELSIF v_has_budget OR v_lead.phase = 'orcamento' THEN
      v_segment := 'orcamento';
    ELSE
      v_segment := 'paciente';
    END IF;

    -- Criar campanha
    INSERT INTO wa_birthday_campaigns (
      clinic_id, lead_id, lead_name, lead_phone, birth_date,
      campaign_year, segment, status, has_open_budget,
      budget_id, budget_total, budget_title, queixas
    ) VALUES (
      v_clinic_id, v_lead.id, v_lead.name, v_lead.phone, v_bday,
      v_year, v_segment, 'pending', v_has_budget,
      v_budget_id, v_budget_total, v_budget_title, v_queixas
    )
    RETURNING id INTO v_campaign_id;

    -- Criar mensagens da sequencia a partir dos templates ativos
    FOR v_tmpl IN
      SELECT * FROM wa_birthday_templates
      WHERE clinic_id = v_clinic_id AND is_active = true
      ORDER BY sort_order, day_offset DESC
    LOOP
      -- Agendar para (aniversario - day_offset) as send_hour
      v_sched := (v_bday - v_tmpl.day_offset * interval '1 day')
                 + (v_tmpl.send_hour * interval '1 hour');

      -- So agendar se a data e futura
      IF v_sched > now() THEN
        -- Substituir variaveis no conteudo
        v_content := v_tmpl.content;
        v_content := replace(v_content, '[nome]', split_part(v_lead.name, ' ', 1));
        v_content := replace(v_content, '[Nome]', split_part(v_lead.name, ' ', 1));
        v_content := replace(v_content, '[queixas]', v_queixas);
        v_content := replace(v_content, '[idade]', (EXTRACT(YEAR FROM age(v_bday, v_lead.bd))::int + 1)::text);
        IF v_has_budget AND v_budget_title IS NOT NULL THEN
          v_content := replace(v_content, '[orcamento]', v_budget_title || ' (R$ ' || v_budget_total::text || ')');
        ELSE
          v_content := replace(v_content, '[orcamento]', '');
        END IF;

        INSERT INTO wa_birthday_messages (
          campaign_id, template_id, day_offset, send_hour,
          content, media_url, scheduled_at, status
        ) VALUES (
          v_campaign_id, v_tmpl.id, v_tmpl.day_offset, v_tmpl.send_hour,
          v_content, v_tmpl.media_url, v_sched, 'pending'
        );
      END IF;
    END LOOP;

    v_created := v_created + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'campaigns_created', v_created,
    'year', v_year
  );
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_scan() TO anon, authenticated;

-- ============================================================
-- 6. RPC: wa_birthday_enqueue — Enfileira mensagens pendentes
--    Chamada pelo cron apos o scan, move msgs para wa_outbox
-- ============================================================
CREATE OR REPLACE FUNCTION wa_birthday_enqueue()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_msg       record;
  v_outbox_id uuid;
  v_enqueued  int := 0;
  v_cancelled int := 0;
BEGIN
  FOR v_msg IN
    SELECT m.*, c.lead_id, c.lead_phone, c.status AS camp_status
    FROM wa_birthday_messages m
    JOIN wa_birthday_campaigns c ON c.id = m.campaign_id
    WHERE m.status = 'pending'
      AND m.scheduled_at <= now()
      AND c.status NOT IN ('cancelled', 'responded')
    ORDER BY m.scheduled_at
  LOOP
    -- Se campanha foi respondida ou cancelada, cancelar msg
    IF v_msg.camp_status IN ('cancelled', 'responded') THEN
      UPDATE wa_birthday_messages SET status = 'cancelled' WHERE id = v_msg.id;
      v_cancelled := v_cancelled + 1;
      CONTINUE;
    END IF;

    -- Verificar se lead respondeu (cancela resto da sequencia)
    IF EXISTS (
      SELECT 1 FROM wa_birthday_campaigns
      WHERE id = v_msg.campaign_id AND status = 'responded'
    ) THEN
      UPDATE wa_birthday_messages SET status = 'cancelled'
      WHERE campaign_id = v_msg.campaign_id AND status = 'pending';
      v_cancelled := v_cancelled + 1;
      CONTINUE;
    END IF;

    -- Inserir no outbox
    INSERT INTO wa_outbox (
      clinic_id, lead_id, phone, content, content_type,
      media_url, priority, status, scheduled_at
    ) VALUES (
      v_clinic_id, v_msg.lead_id, v_msg.lead_phone, v_msg.content,
      CASE WHEN v_msg.media_url IS NOT NULL THEN 'image' ELSE 'text' END,
      v_msg.media_url, 5, 'pending', now()
    )
    RETURNING id INTO v_outbox_id;

    -- Atualizar mensagem com outbox_id
    UPDATE wa_birthday_messages
    SET status = 'queued', outbox_id = v_outbox_id
    WHERE id = v_msg.id;

    -- Marcar campanha como sending se primeira msg
    UPDATE wa_birthday_campaigns
    SET status = 'sending', started_at = COALESCE(started_at, now())
    WHERE id = v_msg.campaign_id AND status = 'pending';

    v_enqueued := v_enqueued + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'enqueued', v_enqueued,
    'cancelled', v_cancelled
  );
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_enqueue() TO anon, authenticated;

-- ============================================================
-- 7. RPC: wa_birthday_list — Lista campanhas com stats
-- ============================================================
CREATE OR REPLACE FUNCTION wa_birthday_list(
  p_segment text DEFAULT NULL,
  p_status  text DEFAULT NULL,
  p_month   int DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.birth_date), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      c.id, c.lead_id, c.lead_name, c.lead_phone,
      c.birth_date, c.campaign_year, c.segment, c.status,
      c.has_open_budget, c.budget_total, c.budget_title,
      c.queixas, c.started_at, c.responded_at,
      EXTRACT(YEAR FROM age(c.birth_date, (SELECT l.birth_date::date FROM leads l WHERE l.id = c.lead_id)))::int + 1 AS age_turning,
      (SELECT count(*) FROM wa_birthday_messages m WHERE m.campaign_id = c.id) AS total_messages,
      (SELECT count(*) FROM wa_birthday_messages m WHERE m.campaign_id = c.id AND m.status IN ('sent','delivered','read')) AS sent_messages,
      (SELECT count(*) FROM wa_birthday_messages m WHERE m.campaign_id = c.id AND m.status = 'delivered') AS delivered_messages,
      (SELECT count(*) FROM wa_birthday_messages m WHERE m.campaign_id = c.id AND m.status = 'read') AS read_messages
    FROM wa_birthday_campaigns c
    WHERE c.clinic_id = v_clinic_id
      AND (p_segment IS NULL OR c.segment = p_segment)
      AND (p_status IS NULL OR c.status = p_status)
      AND (p_month IS NULL OR EXTRACT(MONTH FROM c.birth_date) = p_month)
  ) t;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_list(text, text, int) TO anon, authenticated;

-- ============================================================
-- 8. RPC: wa_birthday_upcoming — Proximos aniversarios (preview)
-- ============================================================
CREATE OR REPLACE FUNCTION wa_birthday_upcoming(p_days int DEFAULT 60)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_year      int := EXTRACT(YEAR FROM now())::int;
  v_result    jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.days_until), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      l.id, l.name, l.phone, l.birth_date::date AS birth_date,
      l.phase, l.queixas_faciais, l.queixas_corporais,
      make_date(v_year, EXTRACT(MONTH FROM l.birth_date::date)::int, EXTRACT(DAY FROM l.birth_date::date)::int) AS next_birthday,
      (make_date(v_year, EXTRACT(MONTH FROM l.birth_date::date)::int, EXTRACT(DAY FROM l.birth_date::date)::int) - CURRENT_DATE) AS days_until,
      EXTRACT(YEAR FROM age(
        make_date(v_year, EXTRACT(MONTH FROM l.birth_date::date)::int, EXTRACT(DAY FROM l.birth_date::date)::int),
        l.birth_date::date
      ))::int AS age_turning,
      EXISTS(SELECT 1 FROM budgets b WHERE b.lead_id = l.id AND b.status NOT IN ('approved','lost','cancelled')) AS has_open_budget,
      (SELECT b.total FROM budgets b WHERE b.lead_id = l.id AND b.status NOT IN ('approved','lost','cancelled') ORDER BY b.created_at DESC LIMIT 1) AS budget_total,
      (SELECT b.title FROM budgets b WHERE b.lead_id = l.id AND b.status NOT IN ('approved','lost','cancelled') ORDER BY b.created_at DESC LIMIT 1) AS budget_title,
      EXISTS(SELECT 1 FROM wa_birthday_campaigns c WHERE c.lead_id = l.id AND c.campaign_year = v_year) AS has_campaign
    FROM leads l
    WHERE l.clinic_id = v_clinic_id
      AND l.deleted_at IS NULL
      AND l.birth_date IS NOT NULL AND l.birth_date != ''
      AND l.phone IS NOT NULL AND l.phone != ''
      AND l.wa_opt_in = true
      AND (
        make_date(v_year, EXTRACT(MONTH FROM l.birth_date::date)::int, EXTRACT(DAY FROM l.birth_date::date)::int)
        BETWEEN CURRENT_DATE AND CURRENT_DATE + p_days
      )
  ) t;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_upcoming(int) TO anon, authenticated;

-- ============================================================
-- 9. RPC: wa_birthday_templates_list — Lista templates editaveis
-- ============================================================
CREATE OR REPLACE FUNCTION wa_birthday_templates_list()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.sort_order, t.day_offset DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT id, day_offset, send_hour, label, content, media_url, media_position, is_active, sort_order
    FROM wa_birthday_templates WHERE clinic_id = v_clinic_id
  ) t;
  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_templates_list() TO anon, authenticated;

-- ============================================================
-- 10. RPC: wa_birthday_template_save — Criar/editar template
-- ============================================================
CREATE OR REPLACE FUNCTION wa_birthday_template_save(
  p_id          uuid DEFAULT NULL,
  p_day_offset  int DEFAULT 30,
  p_send_hour   int DEFAULT 10,
  p_label       text DEFAULT 'Nova mensagem',
  p_content     text DEFAULT '',
  p_media_url   text DEFAULT NULL,
  p_media_position text DEFAULT 'above',
  p_is_active   boolean DEFAULT true,
  p_sort_order  int DEFAULT 99
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_id uuid;
BEGIN
  IF p_id IS NOT NULL THEN
    UPDATE wa_birthday_templates SET
      day_offset = p_day_offset,
      send_hour = p_send_hour,
      label = p_label,
      content = p_content,
      media_url = p_media_url,
      media_position = p_media_position,
      is_active = p_is_active,
      sort_order = p_sort_order,
      updated_at = now()
    WHERE id = p_id AND clinic_id = v_clinic_id
    RETURNING id INTO v_id;
  ELSE
    INSERT INTO wa_birthday_templates (
      clinic_id, day_offset, send_hour, label, content,
      media_url, media_position, is_active, sort_order
    ) VALUES (
      v_clinic_id, p_day_offset, p_send_hour, p_label, p_content,
      p_media_url, p_media_position, p_is_active, p_sort_order
    )
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_template_save(uuid, int, int, text, text, text, text, boolean, int) TO anon, authenticated;

-- ============================================================
-- 11. RPC: wa_birthday_template_delete
-- ============================================================
CREATE OR REPLACE FUNCTION wa_birthday_template_delete(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM wa_birthday_templates
  WHERE id = p_id AND clinic_id = '00000000-0000-0000-0000-000000000001';
  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_template_delete(uuid) TO anon, authenticated;

-- ============================================================
-- 12. RPC: wa_birthday_stats — KPIs agregados
-- ============================================================
CREATE OR REPLACE FUNCTION wa_birthday_stats(p_year int DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_year int := COALESCE(p_year, EXTRACT(YEAR FROM now())::int);
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'year', v_year,
    'total_campaigns', count(*),
    'pending', count(*) FILTER (WHERE status = 'pending'),
    'sending', count(*) FILTER (WHERE status = 'sending'),
    'completed', count(*) FILTER (WHERE status = 'completed'),
    'responded', count(*) FILTER (WHERE status = 'responded'),
    'cancelled', count(*) FILTER (WHERE status = 'cancelled'),
    'with_open_budget', count(*) FILTER (WHERE has_open_budget = true),
    'segment_paciente', count(*) FILTER (WHERE segment = 'paciente'),
    'segment_orcamento', count(*) FILTER (WHERE segment = 'orcamento'),
    'segment_paciente_orcamento', count(*) FILTER (WHERE segment = 'paciente_orcamento'),
    'response_rate', CASE WHEN count(*) FILTER (WHERE status != 'pending') > 0
      THEN round((count(*) FILTER (WHERE status = 'responded')::numeric / count(*) FILTER (WHERE status != 'pending')) * 100)
      ELSE 0 END,
    'upcoming_30d', (
      SELECT count(*) FROM leads l
      WHERE l.clinic_id = v_clinic_id AND l.deleted_at IS NULL
        AND l.birth_date IS NOT NULL AND l.birth_date != ''
        AND l.wa_opt_in = true
        AND make_date(v_year, EXTRACT(MONTH FROM l.birth_date::date)::int, EXTRACT(DAY FROM l.birth_date::date)::int)
            BETWEEN CURRENT_DATE AND CURRENT_DATE + 30
    )
  ) INTO v_result
  FROM wa_birthday_campaigns
  WHERE clinic_id = v_clinic_id AND campaign_year = v_year;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION wa_birthday_stats(int) TO anon, authenticated;
