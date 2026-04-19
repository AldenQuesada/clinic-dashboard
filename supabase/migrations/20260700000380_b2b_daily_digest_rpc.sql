-- ============================================================
-- Migration: B2B Daily Digest RPC
--
-- Fornece resumo diario do programa Circulo Mirian (B2B) pra
-- Mirian receber no WhatsApp, via workflow n8n existente
-- "ClinicAI - Mira Daily Digest" (6jEtFqw40Rh4dhSI).
--
-- A RPC consulta 4 secoes:
--   1. Vouchers emitidos/resgatados nas ultimas 24h
--      (quebra por source wa_mira vs admin_manual via b2b_attributions)
--   2. Candidaturas b2b_partnership_applications pending ha 48h+
--   3. Parcerias com health_color='yellow' ha 3 dias+ (b2b_health_history)
--   4. NPS consolidado do trimestre (b2b_nps_summary)
--
-- Se todas as secoes vazias: has_content=false (workflow pula envio).
--
-- Convencoes:
--   - Zero emojis (usa • como bullet)
--   - STABLE, SECURITY DEFINER
--   - RLS permissiva ja esta nas tabelas envolvidas
--   - Idempotente (CREATE OR REPLACE)
-- ============================================================

CREATE OR REPLACE FUNCTION public.b2b_daily_digest()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id   uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_now         timestamptz := now();
  v_today       date := (v_now AT TIME ZONE 'America/Sao_Paulo')::date;

  -- Vouchers
  v_v_issued_24h     int := 0;
  v_v_issued_mira    int := 0;
  v_v_redeemed_24h   int := 0;
  v_v_redeemed_list  text := '';

  -- Candidaturas
  v_apps             jsonb := '[]'::jsonb;
  v_apps_count       int := 0;

  -- Health amarelo
  v_yellow           jsonb := '[]'::jsonb;
  v_yellow_count     int := 0;

  -- NPS trimestre
  v_nps              jsonb;
  v_nps_total        int := 0;
  v_nps_score        int;

  -- Secoes de saida
  v_sections         jsonb := '[]'::jsonb;
  v_lines            text[];
  v_has_content      boolean := false;
  v_text             text := '';
  v_date_label       text;
BEGIN
  -- ── 1. Vouchers (ultimas 24h) ───────────────────────────────
  -- Source vem de b2b_attributions.source (wa_mira | admin_manual | import | backfill)
  SELECT
    COUNT(*) FILTER (WHERE v.issued_at >= v_now - interval '24 hours'),
    COUNT(*) FILTER (
      WHERE v.issued_at >= v_now - interval '24 hours'
        AND COALESCE(a.source, 'admin_manual') = 'wa_mira'
    ),
    COUNT(*) FILTER (WHERE v.redeemed_at >= v_now - interval '24 hours')
  INTO v_v_issued_24h, v_v_issued_mira, v_v_redeemed_24h
  FROM public.b2b_vouchers v
  LEFT JOIN public.b2b_attributions a ON a.voucher_id = v.id
  WHERE v.clinic_id = v_clinic_id;

  -- Nomes dos parceiros com voucher resgatado nas ultimas 24h (max 3)
  SELECT COALESCE(string_agg(DISTINCT p.name, ', '), '')
    INTO v_v_redeemed_list
    FROM public.b2b_vouchers v
    JOIN public.b2b_partnerships p ON p.id = v.partnership_id
   WHERE v.clinic_id = v_clinic_id
     AND v.redeemed_at >= v_now - interval '24 hours';

  IF v_v_issued_24h > 0 OR v_v_redeemed_24h > 0 THEN
    v_lines := ARRAY[]::text[];
    IF v_v_issued_24h > 0 THEN
      IF v_v_issued_mira > 0 THEN
        v_lines := v_lines || (v_v_issued_24h || ' emitido' ||
          CASE WHEN v_v_issued_24h > 1 THEN 's' ELSE '' END ||
          ' ontem (' || v_v_issued_mira || ' via Mira)');
      ELSE
        v_lines := v_lines || (v_v_issued_24h || ' emitido' ||
          CASE WHEN v_v_issued_24h > 1 THEN 's' ELSE '' END || ' ontem');
      END IF;
    END IF;
    IF v_v_redeemed_24h > 0 THEN
      v_lines := v_lines || (v_v_redeemed_24h || ' resgatado' ||
        CASE WHEN v_v_redeemed_24h > 1 THEN 's' ELSE '' END ||
        CASE WHEN length(v_v_redeemed_list) > 0
             THEN ' (' || v_v_redeemed_list || ')' ELSE '' END);
    END IF;
    v_sections := v_sections || jsonb_build_object(
      'title', 'Vouchers',
      'lines', to_jsonb(v_lines)
    );
    v_has_content := true;
  END IF;

  -- ── 2. Candidaturas pending ha 48h+ ─────────────────────────
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'name',  a.name,
      'days',  GREATEST(1, EXTRACT(day FROM (v_now - a.created_at))::int)
    ) ORDER BY a.created_at ASC), '[]'::jsonb),
    COUNT(*)
  INTO v_apps, v_apps_count
  FROM public.b2b_partnership_applications a
  WHERE a.clinic_id = v_clinic_id
    AND a.status = 'pending'
    AND a.created_at <= v_now - interval '48 hours';

  IF v_apps_count > 0 THEN
    v_lines := ARRAY[]::text[];
    -- Constroi uma linha por candidatura (max 5)
    FOR i IN 0 .. LEAST(4, jsonb_array_length(v_apps) - 1) LOOP
      v_lines := v_lines || (
        (v_apps->i->>'name') || ' pendente ha ' ||
        (v_apps->i->>'days') || ' dia' ||
        CASE WHEN (v_apps->i->>'days')::int > 1 THEN 's' ELSE '' END ||
        ' (manda "aprova ' || (v_apps->i->>'name') || '" se quiser)'
      );
    END LOOP;
    IF v_apps_count > 5 THEN
      v_lines := v_lines || ('+ ' || (v_apps_count - 5) || ' outra' ||
        CASE WHEN v_apps_count - 5 > 1 THEN 's' ELSE '' END);
    END IF;
    v_sections := v_sections || jsonb_build_object(
      'title', 'Candidaturas pendentes',
      'lines', to_jsonb(v_lines)
    );
    v_has_content := true;
  END IF;

  -- ── 3. Health amarelo ha 3 dias+ ────────────────────────────
  -- Criterio: parceria active com health_color='yellow' e a mudanca
  -- mais recente pra 'yellow' em b2b_health_history foi ha >= 3 dias.
  WITH yellow_since AS (
    SELECT
      p.id,
      p.name,
      MAX(h.recorded_at) AS last_yellow_at
    FROM public.b2b_partnerships p
    JOIN public.b2b_health_history h
      ON h.partnership_id = p.id
     AND h.health_color = 'yellow'
    WHERE p.clinic_id = v_clinic_id
      AND p.status = 'active'
      AND p.health_color = 'yellow'
    GROUP BY p.id, p.name
    HAVING MAX(h.recorded_at) <= v_now - interval '3 days'
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'name', name,
      'days', GREATEST(3, EXTRACT(day FROM (v_now - last_yellow_at))::int)
    ) ORDER BY last_yellow_at ASC), '[]'::jsonb),
    COUNT(*)
  INTO v_yellow, v_yellow_count
  FROM yellow_since;

  IF v_yellow_count > 0 THEN
    v_lines := ARRAY[]::text[];
    FOR i IN 0 .. LEAST(4, jsonb_array_length(v_yellow) - 1) LOOP
      v_lines := v_lines || (
        (v_yellow->i->>'name') || ' amarela ha ' ||
        (v_yellow->i->>'days') || ' dia' ||
        CASE WHEN (v_yellow->i->>'days')::int > 1 THEN 's' ELSE '' END ||
        ' — vale um toque'
      );
    END LOOP;
    IF v_yellow_count > 5 THEN
      v_lines := v_lines || ('+ ' || (v_yellow_count - 5) || ' outra' ||
        CASE WHEN v_yellow_count - 5 > 1 THEN 's' ELSE '' END);
    END IF;
    v_sections := v_sections || jsonb_build_object(
      'title', 'Saude atencao',
      'lines', to_jsonb(v_lines)
    );
    v_has_content := true;
  END IF;

  -- ── 4. NPS do trimestre ─────────────────────────────────────
  -- Chama RPC existente; apenas mostra se houve resposta
  BEGIN
    v_nps := public.b2b_nps_summary(NULL);
    v_nps_total := COALESCE((v_nps->>'responses')::int, 0);
    v_nps_score := NULLIF((v_nps->>'nps_score')::text, '')::int;
  EXCEPTION WHEN OTHERS THEN
    v_nps_total := 0;
  END;

  IF v_nps_total > 0 THEN
    v_lines := ARRAY[]::text[];
    v_lines := v_lines || (
      v_nps_total || ' resposta' ||
      CASE WHEN v_nps_total > 1 THEN 's' ELSE '' END ||
      CASE WHEN v_nps_score IS NOT NULL
           THEN ' · NPS ' || v_nps_score
           ELSE '' END
    );
    v_sections := v_sections || jsonb_build_object(
      'title', 'NPS trimestre',
      'lines', to_jsonb(v_lines)
    );
    v_has_content := true;
  END IF;

  -- ── Monta texto final ───────────────────────────────────────
  v_date_label := to_char(v_today, 'DD/MM');

  IF v_has_content THEN
    v_text := 'Resumo B2B · ' || v_date_label || ':';
    DECLARE
      v_section_lines jsonb;
      k int;
      m int;
    BEGIN
      FOR k IN 0 .. jsonb_array_length(v_sections) - 1 LOOP
        v_section_lines := v_sections->k->'lines';
        FOR m IN 0 .. jsonb_array_length(v_section_lines) - 1 LOOP
          v_text := v_text || E'\n• ' || (v_section_lines->>m);
        END LOOP;
      END LOOP;
    END;
  END IF;

  RETURN jsonb_build_object(
    'ok',          true,
    'date',        v_today,
    'has_content', v_has_content,
    'sections',    v_sections,
    'text',        v_text
  );
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_daily_digest() TO anon, authenticated, service_role;

COMMENT ON FUNCTION public.b2b_daily_digest() IS
  'Daily digest B2B pra Mira Daily Digest workflow — vouchers, candidaturas, saude, NPS';
