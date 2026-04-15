-- ============================================================================
-- Beauty & Health — Tracking detalhado por pagina + RPC de relatorios
-- ============================================================================
-- Adiciona magazine_reads.page_metrics jsonb {page_idx: {time_ms, views}}
-- + RPC magazine_edition_report para hub (lista leads + per-page stats)
-- ============================================================================

ALTER TABLE public.magazine_reads
  ADD COLUMN IF NOT EXISTS page_metrics jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.magazine_reads.page_metrics IS
  'Tracking por pagina: { "0": {"time_ms": 12000, "views": 1}, "1": {...} }';

-- ----------------------------------------------------------------------------
-- magazine_track_page: incremento de tempo+views numa pagina especifica
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_track_page(
  p_edition_id uuid,
  p_lead_id    uuid,
  p_hash       text,
  p_page_index int,
  p_time_ms    int
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_key text := p_page_index::text;
  v_existing jsonb;
  v_new_time int;
  v_new_views int;
BEGIN
  IF NOT public._mag_verify_lead_hash(p_lead_id, p_edition_id, p_hash) THEN
    RAISE EXCEPTION 'Link invalido';
  END IF;

  -- pega valores existentes (se houver)
  SELECT page_metrics->v_key INTO v_existing
  FROM public.magazine_reads
  WHERE edition_id = p_edition_id AND lead_id = p_lead_id;

  v_new_time  := COALESCE((v_existing->>'time_ms')::int, 0) + GREATEST(0, LEAST(p_time_ms, 600000));
  v_new_views := COALESCE((v_existing->>'views')::int, 0) + 1;

  UPDATE public.magazine_reads
     SET page_metrics = page_metrics || jsonb_build_object(
           v_key,
           jsonb_build_object('time_ms', v_new_time, 'views', v_new_views)
         )
   WHERE edition_id = p_edition_id AND lead_id = p_lead_id;
END $$;

REVOKE ALL ON FUNCTION public.magazine_track_page(uuid,uuid,text,int,int) FROM public;
GRANT EXECUTE ON FUNCTION public.magazine_track_page(uuid,uuid,text,int,int) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- magazine_edition_report: dados agregados pra hub/dashboard
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_edition_report(p_edition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_total_pages int;
  v_summary jsonb;
  v_per_page jsonb;
  v_leads jsonb;
BEGIN
  SELECT clinic_id INTO v_clinic_id
  FROM public.magazine_editions WHERE id = p_edition_id;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Edicao nao encontrada';
  END IF;
  IF v_clinic_id <> public._mag_current_clinic_id() THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT COUNT(*) INTO v_total_pages
  FROM public.magazine_pages WHERE edition_id = p_edition_id;

  -- Sumario geral
  SELECT jsonb_build_object(
    'total_pages', v_total_pages,
    'leads_opened', COUNT(*) FILTER (WHERE opened_at IS NOT NULL),
    'leads_completed', COUNT(*) FILTER (WHERE completed),
    'leads_quiz', COUNT(*) FILTER (WHERE quiz_completed),
    'leads_shared', COUNT(*) FILTER (WHERE shared),
    'leads_hidden_icon', COUNT(*) FILTER (WHERE hidden_icon_found),
    'avg_time_sec', COALESCE(AVG(time_spent_sec) FILTER (WHERE time_spent_sec > 0), 0)::int,
    'total_cashback', COALESCE((SELECT SUM(amount) FROM public.magazine_rewards WHERE edition_id = p_edition_id), 0)
  ) INTO v_summary
  FROM public.magazine_reads
  WHERE edition_id = p_edition_id;

  -- Por pagina (heatmap)
  WITH page_stats AS (
    SELECT
      idx::int AS page_index,
      COUNT(*) FILTER (WHERE m.page_metrics->idx::text->>'time_ms' IS NOT NULL) AS unique_views,
      COALESCE(AVG(((m.page_metrics->idx::text->>'time_ms')::int)/1000.0)::numeric(10,1), 0) AS avg_time_sec,
      COALESCE(SUM((m.page_metrics->idx::text->>'time_ms')::int), 0)/1000 AS total_time_sec
    FROM generate_series(0, v_total_pages - 1) AS idx
    LEFT JOIN public.magazine_reads m
      ON m.edition_id = p_edition_id
     AND m.page_metrics ? idx::text
    GROUP BY idx
    ORDER BY idx
  )
  SELECT jsonb_agg(jsonb_build_object(
    'page_index', page_index,
    'unique_views', unique_views,
    'avg_time_sec', avg_time_sec,
    'total_time_sec', total_time_sec
  ) ORDER BY page_index)
  INTO v_per_page
  FROM page_stats;

  -- Lista de leads (pra export CSV)
  SELECT jsonb_agg(jsonb_build_object(
    'lead_id', lead_id,
    'segment', segment,
    'opened_at', opened_at,
    'last_page_index', last_page_index,
    'pages_completed_count', COALESCE(array_length(pages_completed, 1), 0),
    'time_spent_sec', time_spent_sec,
    'completed', completed,
    'quiz_completed', quiz_completed,
    'hidden_icon_found', hidden_icon_found,
    'shared', shared
  ) ORDER BY opened_at DESC NULLS LAST)
  INTO v_leads
  FROM public.magazine_reads
  WHERE edition_id = p_edition_id;

  RETURN jsonb_build_object(
    'edition_id', p_edition_id,
    'summary', v_summary,
    'per_page', COALESCE(v_per_page, '[]'::jsonb),
    'leads', COALESCE(v_leads, '[]'::jsonb)
  );
END $$;

REVOKE ALL ON FUNCTION public.magazine_edition_report(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_edition_report(uuid) TO authenticated;
