-- Migration: RPCs para pagina de configuracao da Mira no dashboard
-- wa_pro_dashboard_stats: KPIs e metricas de uso
-- wa_pro_audit_list: lista queries com paginacao
-- wa_pro_update_number: atualizar permissoes/scope de um numero
-- wa_pro_remove_number: desativar numero cadastrado

-- ── 1. Dashboard Stats ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_pro_dashboard_stats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001';
  v_today  date := current_date;
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'numbers_active', (
      SELECT count(*) FROM wa_numbers
      WHERE clinic_id = v_clinic
        AND number_type = 'professional_private'
        AND is_active = true
    ),
    'queries_today', (
      SELECT coalesce(sum(query_count), 0) FROM wa_pro_rate_limit
      WHERE clinic_id = v_clinic AND date = v_today
    ),
    'queries_week', (
      SELECT count(*) FROM wa_pro_audit_log
      WHERE clinic_id = v_clinic
        AND created_at >= (v_today - interval '7 days')
    ),
    'queries_month', (
      SELECT count(*) FROM wa_pro_audit_log
      WHERE clinic_id = v_clinic
        AND created_at >= date_trunc('month', v_today::timestamp)
    ),
    'top_intents', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT intent, count(*) as total
        FROM wa_pro_audit_log
        WHERE clinic_id = v_clinic
          AND created_at >= (v_today - interval '30 days')
          AND intent IS NOT NULL
          AND intent != 'unknown'
        GROUP BY intent
        ORDER BY total DESC
        LIMIT 8
      ) t
    ),
    'queries_by_day', (
      SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb)
      FROM (
        SELECT created_at::date as day, count(*) as total
        FROM wa_pro_audit_log
        WHERE clinic_id = v_clinic
          AND created_at >= (v_today - interval '14 days')
        GROUP BY created_at::date
        ORDER BY day
      ) t
    ),
    'avg_response_ms', (
      SELECT coalesce(round(avg(response_ms)), 0) FROM wa_pro_audit_log
      WHERE clinic_id = v_clinic
        AND created_at >= (v_today - interval '7 days')
        AND response_ms IS NOT NULL
    ),
    'error_rate', (
      SELECT CASE
        WHEN count(*) = 0 THEN 0
        ELSE round(100.0 * count(*) FILTER (WHERE success = false) / count(*), 1)
      END
      FROM wa_pro_audit_log
      WHERE clinic_id = v_clinic
        AND created_at >= (v_today - interval '7 days')
    ),
    'voice_count_month', (
      SELECT count(*) FROM wa_pro_transcripts
      WHERE clinic_id = v_clinic
        AND created_at >= date_trunc('month', v_today::timestamp)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_dashboard_stats() TO authenticated;

-- ── 2. Audit List (paginada) ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_pro_audit_list(
  p_limit  int DEFAULT 50,
  p_offset int DEFAULT 0,
  p_phone  text DEFAULT NULL,
  p_intent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001';
  v_rows   jsonb;
  v_total  bigint;
BEGIN
  -- Total
  SELECT count(*) INTO v_total
  FROM wa_pro_audit_log a
  WHERE a.clinic_id = v_clinic
    AND (p_phone IS NULL OR a.phone LIKE '%' || right(p_phone, 8))
    AND (p_intent IS NULL OR a.intent = p_intent);

  -- Rows
  SELECT coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      a.id,
      a.phone,
      a.intent,
      a.query,
      a.response,
      a.success,
      a.response_ms,
      a.created_at,
      pp.display_name as professional_name
    FROM wa_pro_audit_log a
    LEFT JOIN professional_profiles pp ON pp.id = a.professional_id
    WHERE a.clinic_id = v_clinic
      AND (p_phone IS NULL OR a.phone LIKE '%' || right(p_phone, 8))
      AND (p_intent IS NULL OR a.intent = p_intent)
    ORDER BY a.created_at DESC
    LIMIT p_limit OFFSET p_offset
  ) t;

  RETURN jsonb_build_object(
    'ok', true,
    'rows', v_rows,
    'total', v_total,
    'limit', p_limit,
    'offset', p_offset
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_audit_list(int, int, text, text) TO authenticated;

-- ── 3. Update Number (permissoes/scope) ────────────────────────
CREATE OR REPLACE FUNCTION public.wa_pro_update_number(
  p_wa_number_id uuid,
  p_access_scope text DEFAULT NULL,
  p_permissions  jsonb DEFAULT NULL,
  p_is_active    boolean DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  UPDATE wa_numbers SET
    access_scope = coalesce(p_access_scope, access_scope),
    permissions  = coalesce(p_permissions, permissions),
    is_active    = coalesce(p_is_active, is_active),
    updated_at   = now()
  WHERE id = p_wa_number_id
    AND clinic_id = v_clinic
    AND number_type = 'professional_private';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'number_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_update_number(uuid, text, jsonb, boolean) TO authenticated;

-- ── 4. Remove Number (soft delete) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.wa_pro_remove_number(p_wa_number_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  UPDATE wa_numbers SET
    is_active  = false,
    updated_at = now()
  WHERE id = p_wa_number_id
    AND clinic_id = v_clinic
    AND number_type = 'professional_private';

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'number_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_pro_remove_number(uuid) TO authenticated;

COMMENT ON FUNCTION public.wa_pro_dashboard_stats  IS 'Mira Dashboard: KPIs, top intents, queries por dia, error rate';
COMMENT ON FUNCTION public.wa_pro_audit_list       IS 'Mira Dashboard: lista audit log paginada com filtros';
COMMENT ON FUNCTION public.wa_pro_update_number    IS 'Mira Dashboard: atualiza permissoes/scope de numero profissional';
COMMENT ON FUNCTION public.wa_pro_remove_number    IS 'Mira Dashboard: desativa numero profissional (soft delete)';
