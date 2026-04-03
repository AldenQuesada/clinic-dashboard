-- ============================================================
-- Migration: Template Editor RPCs
-- RPCs para listar e atualizar templates de mensagem WhatsApp
-- ============================================================

-- 1. Listar todos os templates ordenados por categoria e sort_order
CREATE OR REPLACE FUNCTION wa_templates_list()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'ok', true,
    'data', COALESCE(jsonb_agg(row_to_json(t)::jsonb ORDER BY t.category, t.sort_order, t.name), '[]'::jsonb)
  )
  INTO v_result
  FROM wa_message_templates t;

  RETURN v_result;
END;
$$;

-- 2. Atualizar conteudo e status de um template
CREATE OR REPLACE FUNCTION wa_template_update(
  p_id        uuid,
  p_content   text,
  p_is_active boolean
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  -- Validacao
  IF p_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'ID do template e obrigatorio');
  END IF;

  IF p_content IS NULL OR trim(p_content) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Conteudo do template nao pode ser vazio');
  END IF;

  -- Verificar existencia
  IF NOT EXISTS (SELECT 1 FROM wa_message_templates WHERE id = p_id) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Template nao encontrado');
  END IF;

  -- Atualizar
  UPDATE wa_message_templates
  SET content    = p_content,
      is_active  = COALESCE(p_is_active, is_active),
      updated_at = now()
  WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'id', p_id);
END;
$$;
