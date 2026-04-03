-- ============================================================
-- Migration: 20260529000000 — SDR Sprint 11: WA Message Templates
--
-- Gap fechado: templates WA estavam em localStorage apenas.
-- Múltiplos usuários da mesma clínica não compartilhavam templates.
--
-- Tabela criada:
--   wa_message_templates → templates de mensagens WA por clínica
--
-- RPCs criadas:
--   sdr_get_wa_templates()            — lista templates da clínica
--   sdr_upsert_wa_template(...)       — cria ou atualiza template
--   sdr_delete_wa_template(p_id)      — remove template
--
-- Blindagens:
--   - SECURITY DEFINER + _sdr_clinic_id()
--   - RLS ativa na tabela
--   - type validado via CHECK
--   - localStorage como fallback offline (tratado no JS)
-- ============================================================

-- ── Tabela ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.wa_message_templates (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

  type       text NOT NULL,   -- confirmacao | lembrete | engajamento | boas_vindas | consent_img | consent_info
  name       text NOT NULL,
  message    text NOT NULL,
  day        int  NOT NULL DEFAULT 0,  -- relativo à consulta (negativo = antes)
  active     boolean NOT NULL DEFAULT true,
  sort_order int  NOT NULL DEFAULT 0,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.wa_message_templates
  ADD CONSTRAINT chk_wmt_type
    CHECK (type IN ('confirmacao','lembrete','engajamento','boas_vindas','consent_img','consent_info'));

CREATE INDEX IF NOT EXISTS idx_wmt_clinic
  ON public.wa_message_templates (clinic_id, sort_order, day);

CREATE TRIGGER trg_wmt_updated_at
  BEFORE UPDATE ON public.wa_message_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_sdr();

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.wa_message_templates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wmt_clinic_all" ON public.wa_message_templates;
CREATE POLICY "wmt_clinic_all" ON public.wa_message_templates
  FOR ALL USING (clinic_id = public._sdr_clinic_id());

-- ── sdr_get_wa_templates ──────────────────────────────────────

DROP FUNCTION IF EXISTS public.sdr_get_wa_templates();

CREATE OR REPLACE FUNCTION public.sdr_get_wa_templates()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_rows      jsonb;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado ou sem clinica');
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',         t.id,
      'type',       t.type,
      'name',       t.name,
      'message',    t.message,
      'day',        t.day,
      'active',     t.active,
      'sort_order', t.sort_order,
      'updated_at', t.updated_at
    ) ORDER BY t.sort_order ASC, t.day ASC, t.created_at ASC
  )
  INTO v_rows
  FROM wa_message_templates t
  WHERE t.clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true, 'data', COALESCE(v_rows, '[]'::jsonb));
END;
$$;

-- ── sdr_upsert_wa_template ────────────────────────────────────

DROP FUNCTION IF EXISTS public.sdr_upsert_wa_template(uuid, text, text, text, int, boolean, int);

CREATE OR REPLACE FUNCTION public.sdr_upsert_wa_template(
  p_id         uuid    DEFAULT NULL,
  p_type       text    DEFAULT NULL,
  p_name       text    DEFAULT NULL,
  p_message    text    DEFAULT NULL,
  p_day        int     DEFAULT 0,
  p_active     boolean DEFAULT true,
  p_sort_order int     DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_tmpl_id   uuid;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado ou sem clinica');
  END IF;

  -- Validações
  IF p_type IS NULL OR p_type NOT IN ('confirmacao','lembrete','engajamento','boas_vindas','consent_img','consent_info') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tipo invalido');
  END IF;
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nome obrigatorio');
  END IF;
  IF p_message IS NULL OR trim(p_message) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Mensagem obrigatoria');
  END IF;

  IF p_id IS NOT NULL THEN
    -- Update
    UPDATE wa_message_templates
    SET type       = p_type,
        name       = trim(p_name),
        message    = p_message,
        day        = COALESCE(p_day, 0),
        active     = COALESCE(p_active, true),
        sort_order = COALESCE(p_sort_order, 0),
        updated_at = now()
    WHERE id = p_id AND clinic_id = v_clinic_id
    RETURNING id INTO v_tmpl_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Template nao encontrado');
    END IF;
  ELSE
    -- Insert
    INSERT INTO wa_message_templates (
      clinic_id, type, name, message, day, active, sort_order
    ) VALUES (
      v_clinic_id, p_type, trim(p_name), p_message,
      COALESCE(p_day, 0), COALESCE(p_active, true), COALESCE(p_sort_order, 0)
    )
    RETURNING id INTO v_tmpl_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_tmpl_id);
END;
$$;

-- ── sdr_delete_wa_template ────────────────────────────────────

DROP FUNCTION IF EXISTS public.sdr_delete_wa_template(uuid);

CREATE OR REPLACE FUNCTION public.sdr_delete_wa_template(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado ou sem clinica');
  END IF;

  DELETE FROM wa_message_templates
  WHERE id = p_id AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Template nao encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- VERIFICACAO:
--   SELECT sdr_get_wa_templates();
--   SELECT sdr_upsert_wa_template(
--     NULL, 'confirmacao', 'Confirmação de Consulta',
--     'Olá, {{nome}}! Sua consulta é amanhã às {{hora}}.', -1, true, 0
--   );
-- ============================================================
