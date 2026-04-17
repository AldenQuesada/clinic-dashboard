-- ============================================================================
-- Beauty & Health Magazine — Dispatch Analytics RPC
-- ============================================================================
-- Agrega metricas por edicao em 1 jsonb: envio, abertura, leitura, quiz,
-- conversoes, CTR, top 10 engajadas. Por segmento e por tipo de dispatch.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.magazine_dispatch_analytics(p_edition_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_edition public.magazine_editions%ROWTYPE;
  v_result jsonb;
  v_totals jsonb;
  v_funnel jsonb;
  v_by_segment jsonb;
  v_by_tipo jsonb;
  v_top jsonb;
BEGIN
  SELECT * INTO v_edition FROM public.magazine_editions
   WHERE id = p_edition_id AND clinic_id = v_clinic_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Edicao nao encontrada';
  END IF;

  -- Totais
  WITH sent AS (
    SELECT
      COALESCE(SUM((stats->>'sent')::int), 0) AS total_sent,
      COUNT(*) FILTER (WHERE status = 'completed') AS dispatches_done
      FROM public.magazine_dispatches
     WHERE edition_id = p_edition_id
  ),
  reads AS (
    SELECT
      COUNT(*) FILTER (WHERE opened_at IS NOT NULL) AS opened,
      COUNT(*) FILTER (WHERE completed = true) AS completed,
      COUNT(*) FILTER (WHERE quiz_completed = true) AS quiz_done,
      COUNT(*) FILTER (WHERE hidden_icon_found = true) AS hidden_found,
      COUNT(*) FILTER (WHERE shared = true) AS shared,
      COALESCE(AVG(time_spent_sec)::int, 0) AS avg_time,
      COALESCE(SUM(time_spent_sec), 0) AS total_time
      FROM public.magazine_reads
     WHERE edition_id = p_edition_id
  ),
  conversions AS (
    -- Leads que leram a edicao e depois tiveram novo appointment
    SELECT COUNT(DISTINCT r.lead_id) AS converted
      FROM public.magazine_reads r
      JOIN public.patients p ON p."leadId" = r.lead_id::text
     WHERE r.edition_id = p_edition_id
       AND r.completed = true
       AND p."lastProcedureAt" > COALESCE(r.opened_at, r.created_at)
  )
  SELECT jsonb_build_object(
    'sent',       s.total_sent,
    'opened',     rd.opened,
    'completed',  rd.completed,
    'quiz_done',  rd.quiz_done,
    'hidden_found', rd.hidden_found,
    'shared',     rd.shared,
    'converted',  c.converted,
    'avg_time_sec', rd.avg_time,
    'dispatches_done', s.dispatches_done,
    'ctr',        CASE WHEN s.total_sent > 0 THEN round((rd.opened::numeric / s.total_sent) * 100, 1) ELSE 0 END,
    'read_rate',  CASE WHEN rd.opened > 0 THEN round((rd.completed::numeric / rd.opened) * 100, 1) ELSE 0 END,
    'quiz_rate',  CASE WHEN rd.opened > 0 THEN round((rd.quiz_done::numeric / rd.opened) * 100, 1) ELSE 0 END
  )
  INTO v_totals
  FROM sent s, reads rd, conversions c;

  -- Funil simples: Enviado -> Aberto -> Lido 80% -> Quiz
  v_funnel := jsonb_build_array(
    jsonb_build_object('step','Enviado','value', (v_totals->>'sent')::int),
    jsonb_build_object('step','Aberto','value', (v_totals->>'opened')::int),
    jsonb_build_object('step','Lido','value', (v_totals->>'completed')::int),
    jsonb_build_object('step','Quiz','value', (v_totals->>'quiz_done')::int)
  );

  -- Por segmento
  SELECT COALESCE(jsonb_agg(row_to_jsonb(t) ORDER BY t.segment), '[]'::jsonb)
    INTO v_by_segment
    FROM (
      SELECT
        COALESCE(r.segment, 'n/a') AS segment,
        COUNT(*) AS leads,
        COUNT(*) FILTER (WHERE r.opened_at IS NOT NULL) AS opened,
        COUNT(*) FILTER (WHERE r.completed = true) AS completed,
        COUNT(*) FILTER (WHERE r.quiz_completed = true) AS quiz_done
        FROM public.magazine_reads r
       WHERE r.edition_id = p_edition_id
       GROUP BY COALESCE(r.segment, 'n/a')
    ) t;

  -- Por tipo de dispatch: abre rate por (initial / d1 / d7)
  -- Aproximacao: se wa_outbox.vars_snapshot tem dispatch_id, busca tipo
  SELECT COALESCE(jsonb_agg(row_to_jsonb(t) ORDER BY t.tipo), '[]'::jsonb)
    INTO v_by_tipo
    FROM (
      SELECT
        d.tipo,
        COUNT(*) AS dispatches,
        COALESCE(SUM((d.stats->>'sent')::int), 0) AS sent,
        COALESCE(SUM((d.stats->>'total_leads')::int), 0) AS total_leads
        FROM public.magazine_dispatches d
       WHERE d.edition_id = p_edition_id
         AND d.status = 'completed'
       GROUP BY d.tipo
    ) t;

  -- Top 10 leads mais engajadas: mais tempo lido + mais paginas completadas
  SELECT COALESCE(jsonb_agg(row_to_jsonb(t) ORDER BY t.score DESC), '[]'::jsonb)
    INTO v_top
    FROM (
      SELECT
        r.lead_id,
        COALESCE(l.name, '—') AS lead_name,
        r.time_spent_sec,
        array_length(r.pages_completed, 1) AS pages_done,
        r.quiz_completed,
        r.hidden_icon_found,
        r.shared,
        r.segment,
        (
          COALESCE(r.time_spent_sec, 0) / 60
          + COALESCE(array_length(r.pages_completed, 1), 0) * 5
          + (CASE WHEN r.quiz_completed THEN 20 ELSE 0 END)
          + (CASE WHEN r.hidden_icon_found THEN 10 ELSE 0 END)
          + (CASE WHEN r.shared THEN 15 ELSE 0 END)
        ) AS score
        FROM public.magazine_reads r
        LEFT JOIN public.leads l ON l.id = r.lead_id
       WHERE r.edition_id = p_edition_id
         AND r.opened_at IS NOT NULL
       ORDER BY score DESC
       LIMIT 10
    ) t;

  v_result := jsonb_build_object(
    'edition_id', p_edition_id,
    'edition_title', v_edition.title,
    'edition_slug', v_edition.slug,
    'totals', v_totals,
    'funnel', v_funnel,
    'by_segment', v_by_segment,
    'by_tipo', v_by_tipo,
    'top_engaged', v_top
  );

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.magazine_dispatch_analytics(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_dispatch_analytics(uuid) TO authenticated;

-- ============================================================================
-- Validacao:
--   SELECT public.magazine_dispatch_analytics('<edition_id>'::uuid);
-- ============================================================================
