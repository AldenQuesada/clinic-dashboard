-- ============================================================
-- Migration: Refactor RPCs backend para ler de wa_agenda_automations
-- Data: 2026-04-16
-- Objetivo: Eliminar dependencia de wa_message_templates nos RPCs
-- automaticos. Fonte unica agora e wa_agenda_automations.
--
-- RPCs afetados:
--   1. wa_auto_confirm_appointment() — trigger em wa_messages inbound
--      le slugs 'auto_reply_confirmed' e 'auto_reply_cancelled'
--   2. wa_quiz_recovery_scan()       — scan de quiz abandonado
--      le slug 'recovery_quiz_abandoned'
--   3. wa_enqueue_onboarding()       — trigger em leads
--      Lara sendo refeita por Ivan: remove lookup de template,
--      apenas cria conversa com ai_enabled=true
-- ============================================================

BEGIN;

-- ─── 1. Adiciona coluna slug para lookups programaticos ─────

ALTER TABLE wa_agenda_automations
  ADD COLUMN IF NOT EXISTS slug text;

COMMENT ON COLUMN wa_agenda_automations.slug IS
  'Identificador estavel para lookup em RPCs backend (ex: auto_reply_confirmed). NULL para regras criadas via UI.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_wa_agenda_auto_clinic_slug
  ON wa_agenda_automations(clinic_id, slug)
  WHERE slug IS NOT NULL;

-- ─── 2. Popula slugs nas 2 regras existentes ────────────────

UPDATE wa_agenda_automations
SET slug = 'auto_reply_confirmed'
WHERE name = 'Resposta Confirmacao'
  AND trigger_type = 'on_status'
  AND slug IS NULL;

UPDATE wa_agenda_automations
SET slug = 'auto_reply_cancelled'
WHERE name = 'Cancelamento'
  AND trigger_type = 'on_status'
  AND slug IS NULL;

-- ─── 3. Upsert regra de recuperacao de quiz (slug fixo) ─────

INSERT INTO wa_agenda_automations (
  clinic_id, name, description, category, trigger_type, trigger_config,
  recipient_type, channel, content_template, sort_order, is_active, slug
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Recuperacao Quiz Abandonado',
  'Enviada pelo scan wa_quiz_recovery_scan quando lead abandona quiz fullface',
  'after', 'on_tag', jsonb_build_object('tag', 'quiz_abandonado'),
  'patient', 'whatsapp',
  'Oi {{nome}}, tudo bem? Aqui e a Lara, da equipe da Dra. Mirian

Vi que voce comecou nossa avaliacao e se incomoda com {{queixas}}, mas por algum motivo nao finalizou.

Acontece bastante, as vezes a correria nao deixa, ne?

Me conta o que mais te incomoda hoje ao ponto de estar procurando ajuda?',
  5, true, 'recovery_quiz_abandoned'
)
ON CONFLICT (clinic_id, slug) WHERE slug IS NOT NULL
DO UPDATE SET content_template = EXCLUDED.content_template, updated_at = now();

-- ─── 4. Refactor wa_auto_confirm_appointment ────────────────

CREATE OR REPLACE FUNCTION public.wa_auto_confirm_appointment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $fn$
DECLARE
  v_phone text;
  v_content text;
  v_appt record;
  v_is_confirm boolean;
  v_is_cancel boolean;
  v_tpl_content text;
  v_reply text;
  v_clinica text;
BEGIN
  IF NEW.direction != 'inbound' THEN RETURN NEW; END IF;

  v_phone := NEW.phone;
  v_content := lower(trim(COALESCE(NEW.content, '')));
  IF length(v_content) > 50 THEN RETURN NEW; END IF;

  v_is_confirm := v_content IN (
    'sim', 'si', 'yes', 'ok', 'confirmo', 'confirmado', 'confirmada',
    'vou sim', 'estarei la', 'pode confirmar', 'tudo certo',
    'com certeza', 'claro', 'positivo', 's', '1'
  ) OR v_content LIKE 'sim%' OR v_content LIKE 'confirm%';

  v_is_cancel := v_content IN (
    'nao', 'não', 'no', 'cancela', 'cancelar', 'cancelado',
    'nao vou', 'nao posso', 'desmarcar', 'remarcar', 'n', '2'
  ) OR v_content LIKE 'nao%' OR v_content LIKE 'não%' OR v_content LIKE 'cancel%';

  IF NOT v_is_confirm AND NOT v_is_cancel THEN RETURN NEW; END IF;

  SELECT a.* INTO v_appt FROM appointments a
  WHERE a.patient_phone IS NOT NULL
    AND right(a.patient_phone, 8) = right(v_phone, 8)
    AND a.status IN ('agendado', 'aguardando_confirmacao')
    AND a.data >= CURRENT_DATE
  ORDER BY a.data ASC, a."horaInicio" ASC LIMIT 1;

  IF v_appt.id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE((data->>'nome'), 'Clinica') INTO v_clinica
  FROM clinic_data WHERE key = 'clinicai_clinic_settings' LIMIT 1;

  IF v_is_confirm THEN
    UPDATE appointments SET status = 'confirmado', updated_at = now() WHERE id = v_appt.id;
    SELECT content_template INTO v_tpl_content FROM wa_agenda_automations
    WHERE slug = 'auto_reply_confirmed' AND is_active = true LIMIT 1;
    v_reply := COALESCE(v_tpl_content, 'Confirmado! Te esperamos.');
  END IF;

  IF v_is_cancel THEN
    UPDATE appointments SET status = 'cancelado', updated_at = now() WHERE id = v_appt.id;
    SELECT content_template INTO v_tpl_content FROM wa_agenda_automations
    WHERE slug = 'auto_reply_cancelled' AND is_active = true LIMIT 1;
    v_reply := COALESCE(v_tpl_content, 'Sem problemas! Se quiser remarcar, e so avisar.');
  END IF;

  -- Suporta double braces (padrao Funnel) e single braces (legado)
  v_reply := regexp_replace(v_reply, '\{\{\s*nome\s*\}\}|\{nome\}', COALESCE(v_appt.patient_name, ''), 'gi');
  v_reply := regexp_replace(v_reply, '\{\{\s*data\s*\}\}|\{data\}', to_char(v_appt.data, 'DD/MM'), 'gi');
  v_reply := regexp_replace(v_reply, '\{\{\s*hora\s*\}\}|\{hora\}', COALESCE(v_appt."horaInicio", ''), 'gi');
  v_reply := regexp_replace(v_reply, '\{\{\s*clinica\s*\}\}|\{clinica\}', v_clinica, 'gi');
  v_reply := regexp_replace(v_reply, '\{\{\s*profissional\s*\}\}|\{profissional\}', COALESCE(v_appt.professional_name, ''), 'gi');

  INSERT INTO wa_outbox (clinic_id, lead_id, phone, content, status, scheduled_at, priority, appt_ref)
  VALUES (v_appt.clinic_id, COALESCE(v_appt.patient_id::text, ''), v_phone, v_reply, 'pending', now(), 1, v_appt.id);

  RETURN NEW;
END;
$fn$;

-- ─── 5. Refactor wa_quiz_recovery_scan ──────────────────────

CREATE OR REPLACE FUNCTION public.wa_quiz_recovery_scan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_template  record;
  v_event     record;
  v_msg       text;
  v_phone     text;
  v_first_name text;
  v_queixas   text;
  v_enqueued  int := 0;
  v_lead      record;
  v_queixas_arr jsonb;
BEGIN
  SELECT * INTO v_template
  FROM wa_agenda_automations
  WHERE slug = 'recovery_quiz_abandoned'
    AND clinic_id = v_clinic_id
    AND is_active = true
  LIMIT 1;

  IF v_template IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template not found');
  END IF;

  FOR v_event IN
    SELECT
      e.contact_name,
      e.contact_phone,
      max(e.created_at) as last_event,
      (SELECT ev2.metadata->'queixas'
       FROM quiz_events ev2
       WHERE ev2.contact_phone = e.contact_phone
         AND ev2.metadata->'queixas' IS NOT NULL
         AND jsonb_typeof(ev2.metadata->'queixas') = 'array'
       ORDER BY ev2.created_at DESC
       LIMIT 1
      ) as quiz_queixas
    FROM quiz_events e
    WHERE e.contact_phone IS NOT NULL
      AND e.contact_phone != ''
      AND e.event_type = 'step_view'
      AND e.step_index >= 10
      AND NOT EXISTS (
        SELECT 1 FROM quiz_responses r
        WHERE r.contact_phone = e.contact_phone
      )
      AND NOT EXISTS (
        SELECT 1 FROM wa_outbox o
        WHERE o.phone LIKE '%' || right(regexp_replace(e.contact_phone, '[^0-9]', '', 'g'), 8)
          AND o.content LIKE '%finalizou%'
          AND o.created_at > now() - interval '7 days'
      )
    GROUP BY e.contact_name, e.contact_phone
    ORDER BY max(e.created_at) DESC
  LOOP
    v_phone := '55' || regexp_replace(v_event.contact_phone, '[^0-9]', '', 'g');

    SELECT * INTO v_lead
    FROM leads
    WHERE phone LIKE '%' || right(v_phone, 8)
      AND deleted_at IS NULL
    LIMIT 1;

    v_first_name := split_part(COALESCE(v_event.contact_name, ''), ' ', 1);
    IF v_first_name = '' THEN v_first_name := 'voce'; END IF;

    v_queixas := '';
    v_queixas_arr := v_event.quiz_queixas;

    IF v_queixas_arr IS NOT NULL AND jsonb_typeof(v_queixas_arr) = 'array'
       AND jsonb_array_length(v_queixas_arr) > 0 THEN
      SELECT string_agg(value #>> '{}', ', ') INTO v_queixas
      FROM (SELECT value FROM jsonb_array_elements(v_queixas_arr) LIMIT 3) sub;
    ELSIF v_lead IS NOT NULL AND v_lead.queixas_faciais IS NOT NULL
          AND jsonb_typeof(v_lead.queixas_faciais) = 'array'
          AND jsonb_array_length(v_lead.queixas_faciais) > 0 THEN
      SELECT string_agg(value #>> '{}', ', ') INTO v_queixas
      FROM (SELECT value FROM jsonb_array_elements(v_lead.queixas_faciais) LIMIT 3) sub;
    END IF;

    v_msg := v_template.content_template;
    -- Suporta double braces (padrao Funnel) e single braces (legado)
    v_msg := regexp_replace(v_msg, '\{\{\s*nome\s*\}\}|\{nome\}', v_first_name, 'gi');
    IF v_queixas != '' AND v_queixas IS NOT NULL THEN
      v_msg := regexp_replace(v_msg, '\{\{\s*queixas\s*\}\}|\{queixas\}', lower(v_queixas), 'gi');
    ELSE
      v_msg := replace(v_msg, ' e se incomoda com {{queixas}},', ',');
      v_msg := replace(v_msg, ' e se incomoda com {queixas},', ',');
    END IF;

    INSERT INTO wa_outbox (
      clinic_id, lead_id, phone, content, content_type,
      priority, status, scheduled_at
    ) VALUES (
      v_clinic_id,
      CASE WHEN v_lead IS NOT NULL THEN v_lead.id::text ELSE 'unknown' END,
      v_phone, v_msg, 'text', 5, 'pending', now()
    );

    v_enqueued := v_enqueued + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'enqueued', v_enqueued);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.wa_quiz_recovery_scan() TO anon, authenticated;

-- ─── 6. Refactor wa_enqueue_onboarding ──────────────────────
-- Lara sendo refeita por Ivan: remove lookup de template + insert outbox.
-- Apenas cria wa_conversations com ai_enabled conforme segmentacao.

CREATE OR REPLACE FUNCTION public.wa_enqueue_onboarding()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_funnel text;
BEGIN
  IF NEW.phone IS NULL OR NEW.phone = '' THEN RETURN NEW; END IF;
  IF NEW.wa_opt_in IS NOT NULL AND NEW.wa_opt_in = false THEN RETURN NEW; END IF;

  v_funnel := NEW.funnel;

  -- Leads nao vindos do quiz/landing: cria conversa com Lara desativada
  IF NEW.source_type NOT IN ('quiz', 'landing_page') THEN
    INSERT INTO wa_conversations (clinic_id, lead_id, phone, status, ai_persona, ai_enabled, funnel)
    VALUES (NEW.clinic_id, NEW.id, NEW.phone, 'active', 'onboarder', false, v_funnel)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  -- Sem funil fullface: cria conversa com Lara desativada
  IF v_funnel IS NULL OR v_funnel != 'fullface' THEN
    INSERT INTO wa_conversations (clinic_id, lead_id, phone, status, ai_persona, ai_enabled, funnel)
    VALUES (NEW.clinic_id, NEW.id, NEW.phone, 'active', 'onboarder', false, v_funnel)
    ON CONFLICT DO NOTHING;
    RETURN NEW;
  END IF;

  -- Quiz fullface: conversa pronta pra Lara (Ivan ativa via workflow proprio)
  -- NAO enfileira mensagem de boas-vindas aqui — Ivan cuida via n8n/Lara v2
  INSERT INTO wa_conversations (clinic_id, lead_id, phone, status, ai_persona, ai_enabled, cadence_step, funnel)
  VALUES (NEW.clinic_id, NEW.id, NEW.phone, 'active', 'onboarder', true, 0, 'fullface')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- ─── 7. PostgREST reload ────────────────────────────────────

NOTIFY pgrst, 'reload schema';

COMMIT;

-- ============================================================
-- VERIFICACAO:
--   SELECT slug, name, trigger_type FROM wa_agenda_automations
--   WHERE slug IS NOT NULL ORDER BY slug;
--
-- Esperado: 3 rows
--   auto_reply_cancelled    | Cancelamento              | on_status
--   auto_reply_confirmed    | Resposta Confirmacao      | on_status
--   recovery_quiz_abandoned | Recuperacao Quiz Abandonado | on_tag
-- ============================================================
