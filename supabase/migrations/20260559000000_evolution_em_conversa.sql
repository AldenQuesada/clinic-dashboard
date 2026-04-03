-- ============================================================
-- Migration: Renomear stage "contato_feito" -> "em_conversa"
-- + Trigger automatico: interacao WhatsApp inbound move lead
--   de "novo" para "em_conversa" no pipeline evolution
-- ============================================================

-- ============================================================
-- PASSO 1: Renomear o stage
-- ============================================================
UPDATE pipeline_stages
SET slug  = 'em_conversa',
    label = 'Em Conversa',
    color = '#818CF8'
WHERE slug = 'contato_feito'
  AND pipeline_id = (SELECT id FROM pipelines WHERE slug = 'evolution' LIMIT 1);

-- ============================================================
-- PASSO 2: Trigger — interacao WhatsApp inbound avanca lead
-- no pipeline evolution de "novo" para "em_conversa"
-- Tambem atribui a tag "lead_em_conversa" se disponivel
-- ============================================================
CREATE OR REPLACE FUNCTION public.trg_interaction_whatsapp_inbound()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pipeline_id  uuid;
  v_novo_id      uuid;
  v_conversa_id  uuid;
  v_current_stage uuid;
BEGIN
  -- So age em interacoes WhatsApp recebidas (inbound)
  IF NEW.type <> 'whatsapp' OR NEW.direction <> 'inbound' THEN
    RETURN NEW;
  END IF;

  IF NEW.lead_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Busca pipeline evolution da clinica
  SELECT id INTO v_pipeline_id
  FROM public.pipelines
  WHERE clinic_id = NEW.clinic_id
    AND slug = 'evolution'
    AND is_active = true
  LIMIT 1;

  IF v_pipeline_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Busca stage IDs
  SELECT id INTO v_novo_id
  FROM public.pipeline_stages
  WHERE pipeline_id = v_pipeline_id AND slug = 'novo' AND is_active = true
  LIMIT 1;

  SELECT id INTO v_conversa_id
  FROM public.pipeline_stages
  WHERE pipeline_id = v_pipeline_id AND slug = 'em_conversa' AND is_active = true
  LIMIT 1;

  IF v_novo_id IS NULL OR v_conversa_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Verifica se o lead esta no stage "novo"
  SELECT stage_id INTO v_current_stage
  FROM public.lead_pipeline_positions
  WHERE lead_id = NEW.lead_id
    AND pipeline_id = v_pipeline_id;

  -- So avanca se estiver em "novo"
  IF v_current_stage IS DISTINCT FROM v_novo_id THEN
    RETURN NEW;
  END IF;

  -- Move para "em_conversa"
  UPDATE public.lead_pipeline_positions
  SET stage_id   = v_conversa_id,
      updated_at = now(),
      origin     = 'auto'
  WHERE lead_id = NEW.lead_id
    AND pipeline_id = v_pipeline_id;

  -- Atribui tag "lead_em_conversa" (fire-and-forget, ignora erro)
  BEGIN
    PERFORM public.sdr_assign_tag('lead_em_conversa', 'lead', NEW.lead_id, 'auto');
  EXCEPTION WHEN OTHERS THEN
    -- Tag pode nao existir no Supabase, ignora
    NULL;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_evolution_whatsapp_inbound ON public.interactions;
CREATE TRIGGER trg_evolution_whatsapp_inbound
  AFTER INSERT ON public.interactions
  FOR EACH ROW EXECUTE FUNCTION public.trg_interaction_whatsapp_inbound();

-- ============================================================
-- VERIFICACAO:
--
-- SELECT ps.slug, ps.label, ps.is_active
-- FROM pipeline_stages ps
-- JOIN pipelines p ON p.id = ps.pipeline_id AND p.slug = 'evolution'
-- ORDER BY ps.sort_order;
-- ============================================================
