-- ============================================================
-- Migration: wa_outbox_schedule_automation propaga media_url da regra
-- ============================================================
-- Fix: o engine JS chamava essa RPC passando p_rule_id, mas a RPC NAO
-- copiava attachment_url/attachment_urls pro wa_outbox.media_url. Efeito:
-- nenhuma imagem vai pro WhatsApp via automations (bug silencioso).
--
-- Comportamento novo:
--   - Se p_rule_id NOT NULL, carrega a regra e escolhe media_url:
--       attachment_urls (array) → pick random → fallback attachment_url
--   - Se attachment_above_text=false, o n8n sender processa normal (nao afeta aqui)
-- ============================================================

CREATE OR REPLACE FUNCTION public.wa_outbox_schedule_automation(
  p_phone          text,
  p_content        text,
  p_lead_id        text    DEFAULT '',
  p_lead_name      text    DEFAULT '',
  p_scheduled_at   timestamptz DEFAULT now(),
  p_appt_ref       text    DEFAULT NULL,
  p_rule_id        uuid    DEFAULT NULL,
  p_ab_variant     char    DEFAULT NULL,
  p_vars_snapshot  jsonb   DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_id        uuid;
  v_media     text;
  v_urls      jsonb;
  v_url_one   text;
BEGIN
  -- Carrega midia da regra (galeria rotativa ou single legado)
  IF p_rule_id IS NOT NULL THEN
    SELECT attachment_urls, attachment_url
      INTO v_urls, v_url_one
      FROM public.wa_agenda_automations
     WHERE id = p_rule_id;
    v_media := public._wa_pick_attachment_url(v_urls, v_url_one);
  END IF;

  BEGIN
    INSERT INTO public.wa_outbox (
      clinic_id, lead_id, phone, content, media_url,
      scheduled_at, status, priority, appt_ref,
      rule_id, ab_variant, vars_snapshot
    ) VALUES (
      v_clinic_id, COALESCE(NULLIF(p_lead_id, ''), ''), p_phone, p_content, v_media,
      p_scheduled_at, 'pending', 3, p_appt_ref,
      p_rule_id, p_ab_variant, p_vars_snapshot
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    v_id := NULL;
  END;
  RETURN v_id;
END;
$$;
