-- ============================================================
-- Migration: Trigger para iniciar onboarding Lara apos quiz
-- Quando um lead submete o quiz, enfileira a mensagem de
-- boas-vindas na wa_outbox para envio imediato
-- ============================================================

-- Funcao trigger: enfileira onboarding na wa_outbox
CREATE OR REPLACE FUNCTION wa_enqueue_onboarding()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_template    record;
  v_content     text;
  v_lead_name   text;
  v_queixa      text;
BEGIN
  -- So dispara para leads novos (INSERT, nao UPDATE)
  -- e que tenham telefone e opt-in
  IF NEW.phone IS NULL OR NEW.phone = '' THEN
    RETURN NEW;
  END IF;

  -- Verificar opt-in (default true)
  IF NEW.wa_opt_in IS NOT NULL AND NEW.wa_opt_in = false THEN
    RETURN NEW;
  END IF;

  -- Buscar template de boas-vindas
  SELECT * INTO v_template
  FROM wa_message_templates
  WHERE clinic_id = NEW.clinic_id
    AND slug = 'onboarding_welcome'
    AND is_active = true
  LIMIT 1;

  IF v_template IS NULL THEN
    RETURN NEW;
  END IF;

  -- Preparar nome e queixa
  v_lead_name := COALESCE(split_part(NEW.name, ' ', 1), 'Lead');

  -- Extrair primeira queixa do jsonb array
  SELECT COALESCE(
    (SELECT string_agg(q, ' e ')
     FROM (SELECT jsonb_array_elements_text(NEW.queixas_faciais) q LIMIT 2) sub),
    'suas queixas'
  ) INTO v_queixa;

  -- Substituir variaveis no template
  v_content := v_template.content;
  v_content := replace(v_content, '{nome}', v_lead_name);
  v_content := replace(v_content, '{queixa_principal}', v_queixa);

  -- Enfileirar na outbox para envio imediato
  INSERT INTO wa_outbox (
    clinic_id, lead_id, phone, content,
    template_id, priority, scheduled_at,
    business_hours, status
  ) VALUES (
    NEW.clinic_id,
    NEW.id,
    NEW.phone,
    v_content,
    v_template.id,
    1,          -- prioridade alta (onboarding)
    NULL,       -- enviar agora
    false,      -- nao esperar horario comercial (quiz pode ser noite)
    'pending'
  );

  -- Criar conversa automaticamente
  INSERT INTO wa_conversations (
    clinic_id, lead_id, phone, status,
    ai_persona, ai_enabled, cadence_step
  ) VALUES (
    NEW.clinic_id, NEW.id, NEW.phone, 'active',
    'onboarder', true, 0
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- Trigger na tabela leads (somente INSERT)
DROP TRIGGER IF EXISTS trg_lead_onboarding ON leads;
CREATE TRIGGER trg_lead_onboarding
  AFTER INSERT ON leads
  FOR EACH ROW
  EXECUTE FUNCTION wa_enqueue_onboarding();
