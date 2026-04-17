-- ============================================================
-- Migration: VPI Missao CRUD (Fase 4 - Entrega 4)
--
-- RPCs pra gerenciar missoes pela UI admin sem tocar em SQL:
--   vpi_missao_upsert(p_data jsonb)       - INSERT/UPDATE
--   vpi_missao_list(p_include_inactive)   - lista com counts
--   vpi_missao_completions(p_missao_id)   - quem completou
--
-- Nao altera schema — reusa vpi_missoes + vpi_missao_progresso
-- criadas na migration 31 e a logica de emissao da migration 41.
--
-- Idempotente: CREATE OR REPLACE.
-- ============================================================

-- ── 1. vpi_missao_upsert ────────────────────────────────────
-- Espera p_data com: id (opcional), titulo, descricao, criterio (jsonb),
-- recompensa_texto, recompensa_valor, msg_template_sucesso,
-- valid_from, valid_until, is_active, sort_order.
CREATE OR REPLACE FUNCTION public.vpi_missao_upsert(
  p_data jsonb
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_id        uuid;
  v_is_new    boolean := false;
  v_titulo    text;
  v_desc      text;
  v_crit      jsonb;
  v_rtxt      text;
  v_rval      numeric;
  v_msg       text;
  v_from      timestamptz;
  v_until     timestamptz;
  v_active    boolean;
  v_sort      int;
BEGIN
  IF p_data IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'data_required');
  END IF;

  v_titulo := NULLIF(trim(COALESCE(p_data->>'titulo', '')), '');
  v_desc   := COALESCE(p_data->>'descricao', '');
  v_crit   := COALESCE(p_data->'criterio',
                        '{"tipo":"indicacoes_fechadas","quantidade":1,"periodo":"7d"}'::jsonb);
  v_rtxt   := COALESCE(p_data->>'recompensa_texto', '');
  v_rval   := COALESCE((p_data->>'recompensa_valor')::numeric, 0);
  v_msg    := p_data->>'msg_template_sucesso';
  v_from   := COALESCE((p_data->>'valid_from')::timestamptz, now());
  v_until  := NULLIF(p_data->>'valid_until', '')::timestamptz;
  v_active := COALESCE((p_data->>'is_active')::boolean, true);
  v_sort   := COALESCE((p_data->>'sort_order')::int, 0);

  IF v_titulo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'titulo_required');
  END IF;

  IF v_crit->>'tipo' IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'criterio_tipo_required');
  END IF;

  IF v_until IS NOT NULL AND v_until <= v_from THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_date_range');
  END IF;

  v_id := NULLIF(p_data->>'id', '')::uuid;

  IF v_id IS NULL THEN
    INSERT INTO public.vpi_missoes (
      clinic_id, titulo, descricao, criterio, recompensa_texto,
      recompensa_valor, msg_template_sucesso, valid_from, valid_until,
      is_active, sort_order
    ) VALUES (
      v_clinic_id, v_titulo, v_desc, v_crit, v_rtxt,
      v_rval, v_msg, v_from, v_until, v_active, v_sort
    )
    RETURNING id INTO v_id;
    v_is_new := true;
  ELSE
    UPDATE public.vpi_missoes
       SET titulo               = v_titulo,
           descricao            = v_desc,
           criterio             = v_crit,
           recompensa_texto     = v_rtxt,
           recompensa_valor     = v_rval,
           msg_template_sucesso = v_msg,
           valid_from           = v_from,
           valid_until          = v_until,
           is_active            = v_active,
           sort_order           = v_sort,
           updated_at           = now()
     WHERE id = v_id AND clinic_id = v_clinic_id;

    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'error', 'missao_not_found');
    END IF;
  END IF;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (
    v_clinic_id,
    CASE WHEN v_is_new THEN 'missao_created' ELSE 'missao_updated' END,
    'vpi_missoes', v_id::text,
    jsonb_build_object('titulo', v_titulo, 'is_active', v_active)
  );

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'created', v_is_new);
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_missao_upsert(jsonb) TO authenticated;

-- ── 2. vpi_missao_list ──────────────────────────────────────
-- Retorna missoes com contadores: total_progresso, completos, emitidos,
-- pendentes (completos sem recompensa).
CREATE OR REPLACE FUNCTION public.vpi_missao_list(
  p_include_inactive boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out       jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(q.*) ORDER BY q.sort_order ASC, q.created_at DESC), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT m.id, m.titulo, m.descricao, m.criterio, m.recompensa_texto,
             m.recompensa_valor, m.msg_template_sucesso,
             m.valid_from, m.valid_until, m.is_active, m.sort_order,
             m.created_at, m.updated_at,
             (m.valid_until IS NOT NULL AND m.valid_until < now()) AS is_expired,
             (SELECT COUNT(*)::int FROM public.vpi_missao_progresso p
               WHERE p.missao_id = m.id) AS total_progresso,
             (SELECT COUNT(*)::int FROM public.vpi_missao_progresso p
               WHERE p.missao_id = m.id AND p.completed_at IS NOT NULL) AS total_completos,
             (SELECT COUNT(*)::int FROM public.vpi_missao_progresso p
               WHERE p.missao_id = m.id AND p.recompensa_emitida = true) AS total_emitidos,
             (SELECT COUNT(*)::int FROM public.vpi_missao_progresso p
               WHERE p.missao_id = m.id
                 AND p.completed_at IS NOT NULL
                 AND p.recompensa_emitida = false) AS total_pendentes
        FROM public.vpi_missoes m
       WHERE m.clinic_id = v_clinic_id
         AND (p_include_inactive OR m.is_active = true)
    ) q;
  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_missao_list(boolean) TO authenticated;

-- ── 3. vpi_missao_completions ───────────────────────────────
-- Lista partners que completaram + status da emissao.
CREATE OR REPLACE FUNCTION public.vpi_missao_completions(
  p_missao_id uuid
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out       jsonb;
BEGIN
  IF p_missao_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missao_id_required');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(q.*) ORDER BY q.completed_at DESC NULLS LAST), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT mp.id AS progresso_id,
             mp.partner_id,
             p.nome            AS partner_nome,
             p.phone           AS partner_phone,
             p.tier_atual      AS partner_tier,
             p.card_token      AS card_token,
             mp.progresso_atual,
             mp.target,
             mp.completed_at,
             mp.recompensa_emitida,
             mp.recompensa_emitida_at
        FROM public.vpi_missao_progresso mp
        JOIN public.vpi_partners p ON p.id = mp.partner_id
       WHERE mp.missao_id = p_missao_id
         AND mp.clinic_id = v_clinic_id
    ) q;

  RETURN jsonb_build_object(
    'ok', true,
    'missao_id', p_missao_id,
    'completions', COALESCE(v_out, '[]'::jsonb)
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_missao_completions(uuid) TO authenticated;

-- ── 4. vpi_missao_delete ─────────────────────────────────────
-- Remove missao (e cascade em progresso via FK ON DELETE CASCADE).
CREATE OR REPLACE FUNCTION public.vpi_missao_delete(
  p_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_titulo    text;
BEGIN
  SELECT titulo INTO v_titulo
    FROM public.vpi_missoes
   WHERE id = p_id AND clinic_id = v_clinic_id;

  IF v_titulo IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missao_not_found');
  END IF;

  DELETE FROM public.vpi_missoes
   WHERE id = p_id AND clinic_id = v_clinic_id;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic_id, 'missao_deleted', 'vpi_missoes', p_id::text,
          jsonb_build_object('titulo', v_titulo));

  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_missao_delete(uuid) TO authenticated;
