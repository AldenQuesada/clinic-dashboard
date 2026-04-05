-- ============================================================
-- Migration: 20260622000000 — Quiz Recovery
--
-- 1. Adiciona colunas faltantes em wa_message_templates
--    (slug, category, content, is_active, metadata)
-- 2. Atualiza constraint chk_wmt_type para aceitar 'recuperacao'
-- 3. Insere template de recuperacao de quiz
-- 4. Cria RPC wa_quiz_recovery_scan()
-- ============================================================

-- ── 1. Colunas faltantes ────────────────────────────────────

ALTER TABLE public.wa_message_templates
  ADD COLUMN IF NOT EXISTS slug     text,
  ADD COLUMN IF NOT EXISTS category text DEFAULT 'geral',
  ADD COLUMN IF NOT EXISTS content  text,
  ADD COLUMN IF NOT EXISTS is_active boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}';

-- Indice unico slug por clinica (ignora nulls pra nao quebrar existentes)
CREATE UNIQUE INDEX IF NOT EXISTS idx_wmt_clinic_slug
  ON public.wa_message_templates (clinic_id, slug)
  WHERE slug IS NOT NULL;

-- ── 2. Constraint atualizada ────────────────────────────────

ALTER TABLE public.wa_message_templates
  DROP CONSTRAINT IF EXISTS chk_wmt_type;

ALTER TABLE public.wa_message_templates
  ADD CONSTRAINT chk_wmt_type
    CHECK (type IN (
      'confirmacao','lembrete','engajamento','boas_vindas',
      'consent_img','consent_info','recuperacao'
    ));

-- ── 3. Template de recuperacao ──────────────────────────────

INSERT INTO public.wa_message_templates (
  clinic_id, type, name, message, slug, category, content, is_active, sort_order
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'recuperacao',
  'Recuperacao Quiz - Nao finalizou',
  'Oi {nome}, tudo bem? Aqui é a Lara, da equipe da Dra. Mirian

Vi que você começou nossa avaliação e se incomoda com {queixas}, mas por algum motivo não finalizou.

Acontece bastante, às vezes a correria não deixa, né?

Me conta o que mais te incomoda hoje ao ponto de estar procurando ajuda?',
  'recovery_quiz_abandoned',
  'recuperacao',
  'Oi {nome}, tudo bem? Aqui é a Lara, da equipe da Dra. Mirian

Vi que você começou nossa avaliação e se incomoda com {queixas}, mas por algum motivo não finalizou.

Acontece bastante, às vezes a correria não deixa, né?

Me conta o que mais te incomoda hoje ao ponto de estar procurando ajuda?',
  true,
  10
)
ON CONFLICT DO NOTHING;

-- ── 4. RPC wa_quiz_recovery_scan ────────────────────────────

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
  FROM wa_message_templates
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
    IF v_first_name = '' THEN v_first_name := 'você'; END IF;

    -- Queixas: primeiro do quiz_events.metadata, fallback pra leads.queixas_faciais
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

    v_msg := v_template.message;
    v_msg := replace(v_msg, '{nome}', v_first_name);
    IF v_queixas != '' AND v_queixas IS NOT NULL THEN
      v_msg := replace(v_msg, '{queixas}', lower(v_queixas));
    ELSE
      v_msg := replace(v_msg, ' e se incomoda com {queixas},', ',');
    END IF;

    INSERT INTO wa_outbox (
      clinic_id, lead_id, phone, content, content_type,
      priority, status, scheduled_at
    ) VALUES (
      v_clinic_id,
      CASE WHEN v_lead IS NOT NULL THEN v_lead.id::text ELSE 'unknown' END,
      v_phone,
      v_msg,
      'text',
      5,
      'pending',
      now()
    );

    v_enqueued := v_enqueued + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'enqueued', v_enqueued);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.wa_quiz_recovery_scan() TO anon, authenticated;

-- ── PostgREST reload ────────────────────────────────────────

NOTIFY pgrst, 'reload schema';

-- ============================================================
-- VERIFICACAO:
--   SELECT wa_quiz_recovery_scan();  -- dispara scan
-- ============================================================
