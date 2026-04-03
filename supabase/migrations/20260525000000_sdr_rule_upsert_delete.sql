-- ============================================================
-- Migration: 20260525000000 — SDR: Rule Upsert + Delete
-- Sprint 9
--
-- Funcoes:
--   sdr_upsert_rule(...)  — cria ou atualiza regra de automação
--   sdr_delete_rule(...)  — exclui regra da clínica
--
-- Blindagens:
--   - SECURITY DEFINER + _sdr_clinic_id() em ambas
--   - nome e trigger_event obrigatorios
--   - slug auto-gerado (com anti-colisao por sufixo randômico)
--   - UPDATE verifica clinic_id (isola clínicas)
--   - DELETE verifica clinic_id
-- ============================================================

DROP FUNCTION IF EXISTS public.sdr_upsert_rule(uuid, text, text, text, text, jsonb, jsonb, boolean, int, int, int);
DROP FUNCTION IF EXISTS public.sdr_delete_rule(uuid);

-- ── sdr_upsert_rule ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sdr_upsert_rule(
  p_id             uuid     DEFAULT NULL,
  p_slug           text     DEFAULT NULL,
  p_name           text     DEFAULT '',
  p_description    text     DEFAULT NULL,
  p_trigger_event  text     DEFAULT 'manual',
  p_conditions     jsonb    DEFAULT '[]'::jsonb,
  p_actions        jsonb    DEFAULT '[]'::jsonb,
  p_is_active      boolean  DEFAULT false,
  p_priority       int      DEFAULT 50,
  p_cooldown_hours int      DEFAULT NULL,
  p_max_executions int      DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_slug      text;
  v_id        uuid;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado ou sem clinica');
  END IF;

  -- Validações obrigatórias
  IF p_name IS NULL OR trim(p_name) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nome da regra e obrigatorio');
  END IF;
  IF p_trigger_event IS NULL OR trim(p_trigger_event) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Evento gatilho e obrigatorio');
  END IF;
  IF p_actions IS NULL OR jsonb_array_length(p_actions) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A regra precisa ter ao menos uma acao');
  END IF;

  -- Sanitiza slug: usa o fornecido ou gera a partir do nome
  v_slug := COALESCE(
    NULLIF(trim(p_slug), ''),
    lower(regexp_replace(
      regexp_replace(trim(p_name), '[^a-zA-Z0-9\s_]', '', 'g'),
      '\s+', '_', 'g'
    ))
  );
  -- Garante que slug não fica vazio
  IF v_slug = '' OR v_slug IS NULL THEN
    v_slug := 'regra_' || floor(extract(epoch FROM now()))::text;
  END IF;

  IF p_id IS NOT NULL THEN
    -- ── Atualiza regra existente ──────────────────────────────
    UPDATE automation_rules
    SET name            = p_name,
        description     = p_description,
        trigger_event   = p_trigger_event,
        conditions      = COALESCE(p_conditions, '[]'::jsonb),
        actions         = COALESCE(p_actions,    '[]'::jsonb),
        is_active       = p_is_active,
        priority        = COALESCE(p_priority, 50),
        cooldown_hours  = p_cooldown_hours,
        max_executions  = p_max_executions,
        updated_at      = now()
    WHERE id        = p_id
      AND clinic_id = v_clinic_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Regra nao encontrada ou sem permissao');
    END IF;
    v_id := p_id;

  ELSE
    -- ── Insere nova regra (anti-colisão de slug) ──────────────
    LOOP
      BEGIN
        INSERT INTO automation_rules (
          clinic_id, slug, name, description,
          trigger_event, conditions, actions,
          is_active, priority, cooldown_hours, max_executions
        ) VALUES (
          v_clinic_id, v_slug, p_name, p_description,
          p_trigger_event,
          COALESCE(p_conditions, '[]'::jsonb),
          COALESCE(p_actions,    '[]'::jsonb),
          p_is_active, COALESCE(p_priority, 50),
          p_cooldown_hours, p_max_executions
        )
        RETURNING id INTO v_id;
        EXIT; -- INSERT bem-sucedido
      EXCEPTION WHEN unique_violation THEN
        -- Adiciona sufixo numérico ao slug e tenta novamente
        v_slug := v_slug || '_' || floor(random() * 9000 + 1000)::text;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;


-- ── sdr_delete_rule ───────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.sdr_delete_rule(
  p_rule_id uuid
)
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

  -- Remove execuções vinculadas primeiro (FK)
  DELETE FROM rule_executions
  WHERE rule_id = p_rule_id
    AND rule_id IN (
      SELECT id FROM automation_rules WHERE clinic_id = v_clinic_id
    );

  DELETE FROM automation_rules
  WHERE id        = p_rule_id
    AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Regra nao encontrada ou sem permissao');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- VERIFICACAO:
-- SELECT sdr_upsert_rule(NULL, NULL, 'Teste', NULL, 'phase_changed',
--   '[{"field":"phase","op":"eq","value":"captacao"}]'::jsonb,
--   '[{"type":"add_tag","tag_slug":"lead.teste"}]'::jsonb,
--   false, 99, NULL, NULL);
-- SELECT sdr_delete_rule('<uuid>');
-- ============================================================
