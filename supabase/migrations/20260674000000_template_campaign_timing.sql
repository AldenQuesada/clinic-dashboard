-- ============================================================
-- Migration: delay granular (horas/minutos) + trigger_phase nos templates
-- ============================================================
-- Cada categoria de template vira uma campanha.
-- Quando o paciente entra numa fase, todos os templates ativos
-- daquela categoria sao enfileirados com o delay configurado.
-- ============================================================

-- Delay granular: horas e minutos alem de dias
ALTER TABLE wa_message_templates ADD COLUMN IF NOT EXISTS delay_hours integer DEFAULT 0;
ALTER TABLE wa_message_templates ADD COLUMN IF NOT EXISTS delay_minutes integer DEFAULT 0;

-- Fase do funil que dispara esta categoria
-- Se null, nao dispara automaticamente (so manual/disparo)
ALTER TABLE wa_message_templates ADD COLUMN IF NOT EXISTS trigger_phase text;

-- Ordem dentro da campanha (primeira msg = 0, segunda = 1, etc)
-- Reutiliza sort_order que ja existe

-- Atualizar templates existentes com trigger_phase baseado na categoria
UPDATE wa_message_templates SET trigger_phase = 'agendado'   WHERE category = 'agendamento'   AND trigger_phase IS NULL;
UPDATE wa_message_templates SET trigger_phase = 'lead'       WHERE category = 'onboarding'    AND trigger_phase IS NULL;
UPDATE wa_message_templates SET trigger_phase = 'lead'       WHERE category = 'follow_up'     AND trigger_phase IS NULL;
UPDATE wa_message_templates SET trigger_phase = 'paciente'   WHERE category = 'pos_consulta'  AND trigger_phase IS NULL;
UPDATE wa_message_templates SET trigger_phase = 'perdido'    WHERE category = 'recuperacao'    AND trigger_phase IS NULL;

-- Atualizar RPC wa_template_update para incluir novos campos
DROP FUNCTION IF EXISTS public.wa_template_update(uuid, text, boolean, integer, text, text, jsonb, text);

CREATE OR REPLACE FUNCTION public.wa_template_update(
  p_id uuid, p_content text DEFAULT NULL, p_is_active boolean DEFAULT NULL,
  p_day integer DEFAULT NULL, p_category text DEFAULT NULL,
  p_name text DEFAULT NULL, p_metadata jsonb DEFAULT NULL,
  p_type text DEFAULT NULL, p_delay_hours integer DEFAULT NULL,
  p_delay_minutes integer DEFAULT NULL, p_trigger_phase text DEFAULT NULL,
  p_sort_order integer DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public' AS $fn$
BEGIN
  IF p_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'ID obrigatorio'); END IF;
  IF NOT EXISTS (SELECT 1 FROM wa_message_templates WHERE id = p_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nao encontrado');
  END IF;
  UPDATE wa_message_templates SET
    content       = COALESCE(p_content, content),
    is_active     = COALESCE(p_is_active, is_active),
    active        = COALESCE(p_is_active, active),
    day           = CASE WHEN p_day IS NOT NULL THEN p_day ELSE day END,
    delay_hours   = CASE WHEN p_delay_hours IS NOT NULL THEN p_delay_hours ELSE delay_hours END,
    delay_minutes = CASE WHEN p_delay_minutes IS NOT NULL THEN p_delay_minutes ELSE delay_minutes END,
    category      = COALESCE(p_category, category),
    name          = COALESCE(p_name, name),
    metadata      = CASE WHEN p_metadata IS NOT NULL THEN p_metadata ELSE metadata END,
    type          = CASE WHEN p_type IS NOT NULL THEN p_type ELSE type END,
    trigger_phase = CASE WHEN p_trigger_phase IS NOT NULL THEN p_trigger_phase ELSE trigger_phase END,
    sort_order    = CASE WHEN p_sort_order IS NOT NULL THEN p_sort_order ELSE sort_order END,
    updated_at    = now()
  WHERE id = p_id;
  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$fn$;

-- RPC para buscar templates por fase (usado pelo engine ao mudar status)
CREATE OR REPLACE FUNCTION public.wa_templates_for_phase(p_phase text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public' AS $fn$
BEGIN
  RETURN (SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'slug', slug, 'name', name, 'content', content,
    'day', COALESCE(day, 0), 'delay_hours', COALESCE(delay_hours, 0),
    'delay_minutes', COALESCE(delay_minutes, 0),
    'sort_order', sort_order, 'metadata', metadata
  ) ORDER BY sort_order, day, delay_hours, delay_minutes), '[]'::jsonb)
  FROM wa_message_templates
  WHERE clinic_id = app_clinic_id()
    AND trigger_phase = p_phase
    AND is_active = true);
END;
$fn$;

NOTIFY pgrst, 'reload schema';
