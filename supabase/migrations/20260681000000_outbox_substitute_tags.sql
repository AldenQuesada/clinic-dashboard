-- ============================================================
-- Outbox tag substitution: [nome] e [queixa] no content
-- ============================================================
-- Hoje o frontend salva content cru ("Oi [nome], sobre [queixa]...") e o n8n
-- envia direto pra Evolution sem substituir. Resultado: paciente recebe literal.
--
-- Esta migration atualiza wa_outbox_fetch_pending pra fazer replace antes de
-- entregar ao n8n. Lida com 2 tags:
--   [nome]   -> primeiro nome do lead (split_part(name, ' ', 1))
--   [queixa] -> b.target_filter->>'queixa' (queixa filtrada na criacao do broadcast)
--
-- Nao quebra mensagens existentes: replace nao acha tag, retorna texto original.

CREATE OR REPLACE FUNCTION wa_outbox_fetch_pending(p_limit int DEFAULT 10)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_result jsonb;
  v_ids uuid[];
BEGIN
  WITH pending AS (
    SELECT id, phone, content, template_id, conversation_id, lead_id, media_url, media_caption, broadcast_id
    FROM wa_outbox
    WHERE clinic_id = v_clinic_id AND status = 'pending'
      AND (scheduled_at IS NULL OR scheduled_at <= now())
      AND attempts < max_attempts
    ORDER BY priority ASC, created_at ASC
    LIMIT p_limit FOR UPDATE SKIP LOCKED
  ),
  updated AS (
    UPDATE wa_outbox SET status = 'processing', attempts = attempts + 1, processed_at = now()
    WHERE id IN (SELECT id FROM pending) RETURNING id
  )
  SELECT array_agg(id) INTO v_ids FROM updated;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',              o.id,
      'phone',           o.phone,
      'content',         (
        -- Substituicoes em cadeia: [nome] e [queixa]
        regexp_replace(
          regexp_replace(
            COALESCE(o.content, ''),
            '\[nome\]',
            COALESCE(NULLIF(split_part(COALESCE(l.name, ''), ' ', 1), ''), 'tudo bem'),
            'gi'
          ),
          '\[queixa\]',
          COALESCE(NULLIF(b.target_filter->>'queixa', ''), 'sua queixa'),
          'gi'
        )
      ),
      'conversation_id', o.conversation_id,
      'lead_id',         o.lead_id,
      'media_url',       o.media_url,
      'media_caption',   o.media_caption,
      'lead_name',       COALESCE(l.name, ''),
      'lead_queixa',     COALESCE((l.data->>'queixa_principal')::text, ''),
      'media_position',  COALESCE(b.media_position, 'above')
    )
  ), '[]'::jsonb)
  INTO v_result
  FROM wa_outbox o
  LEFT JOIN leads l         ON l.id = o.lead_id
  LEFT JOIN wa_broadcasts b ON b.id = o.broadcast_id
  WHERE o.id = ANY(COALESCE(v_ids, '{}'));

  RETURN v_result;
END;
$$;
