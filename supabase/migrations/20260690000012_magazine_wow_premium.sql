-- ============================================================================
-- Beauty & Health — Wow Effects (Onda Premium)
-- ============================================================================
-- A1 Capa com nome | A6 VIP scope | A7 Segmento na resposta
-- D1 Hidden icon (jah no schema) | D5 Reactions
-- E3 Open Graph rico | F1 Continue (jah em last_page_index) | G1 Expiry
-- I4 Dashboard insights
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Edition: expiracao + dedicatoria default
-- ----------------------------------------------------------------------------
ALTER TABLE public.magazine_editions
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_icon_page_id uuid REFERENCES public.magazine_pages(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.magazine_editions.expires_at IS 'Data limite de acesso ao link publico (G1 wow effect)';
COMMENT ON COLUMN public.magazine_editions.hidden_icon_page_id IS 'Pagina onde o hidden icon esta escondido';

-- ----------------------------------------------------------------------------
-- 2) Tabela de reactions (D5)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.magazine_reactions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  edition_id    uuid NOT NULL REFERENCES public.magazine_editions(id) ON DELETE CASCADE,
  page_id       uuid REFERENCES public.magazine_pages(id) ON DELETE CASCADE,
  lead_id       uuid NOT NULL,
  reaction_type text NOT NULL CHECK (reaction_type IN ('heart','sparkle','wow')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT magazine_reactions_unique UNIQUE (edition_id, page_id, lead_id, reaction_type)
);

CREATE INDEX IF NOT EXISTS magazine_reactions_edition_idx
  ON public.magazine_reactions (edition_id, page_id);

ALTER TABLE public.magazine_reactions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS magazine_reactions_clinic ON public.magazine_reactions;
CREATE POLICY magazine_reactions_clinic
  ON public.magazine_reactions FOR SELECT
  USING (clinic_id = public._mag_current_clinic_id());

-- INSERT eh feito via RPC SECURITY DEFINER (publico via HMAC)
GRANT SELECT ON public.magazine_reactions TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) RPC magazine_react: registra reaction (anon+auth, valida HMAC)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_react(
  p_edition_id  uuid,
  p_page_id     uuid,
  p_lead_id     uuid,
  p_hash        text,
  p_reaction    text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_total int;
BEGIN
  IF NOT public._mag_verify_lead_hash(p_lead_id, p_edition_id, p_hash) THEN
    RAISE EXCEPTION 'Link invalido';
  END IF;
  IF p_reaction NOT IN ('heart','sparkle','wow') THEN
    RAISE EXCEPTION 'Reaction invalida: %', p_reaction;
  END IF;

  SELECT clinic_id INTO v_clinic_id FROM public.magazine_editions WHERE id = p_edition_id;
  IF v_clinic_id IS NULL THEN RAISE EXCEPTION 'Edicao nao existe'; END IF;

  INSERT INTO public.magazine_reactions (clinic_id, edition_id, page_id, lead_id, reaction_type)
  VALUES (v_clinic_id, p_edition_id, p_page_id, p_lead_id, p_reaction)
  ON CONFLICT (edition_id, page_id, lead_id, reaction_type) DO NOTHING;

  -- contagem total dessa reaction nessa pagina (para mostrar live)
  SELECT COUNT(*) INTO v_total
  FROM public.magazine_reactions
  WHERE edition_id = p_edition_id AND page_id = p_page_id AND reaction_type = p_reaction;

  RETURN jsonb_build_object('ok', true, 'reaction', p_reaction, 'total', v_total);
END $$;

REVOKE ALL ON FUNCTION public.magazine_react(uuid,uuid,uuid,text,text) FROM public;
GRANT EXECUTE ON FUNCTION public.magazine_react(uuid,uuid,uuid,text,text) TO anon, authenticated;

-- ----------------------------------------------------------------------------
-- 4) Atualiza magazine_get_edition_public para incluir:
--    - lead_name (A1 capa personalizada)
--    - segment color hint (A7)
--    - expires_at (G1)
--    - reactions count por pagina (D5)
--    - hidden_icon_page_id (D1)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_get_edition_public(
  p_edition_slug text,
  p_lead_id      uuid,
  p_hash         text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edition public.magazine_editions%ROWTYPE;
  v_segment text;
  v_lead_name text;
  v_pages jsonb;
  v_reactions jsonb;
  v_expired boolean := false;
BEGIN
  SELECT * INTO v_edition
  FROM public.magazine_editions
  WHERE slug = p_edition_slug AND status = 'published';

  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT public._mag_verify_lead_hash(p_lead_id, v_edition.id, p_hash) THEN
    RAISE EXCEPTION 'Link invalido';
  END IF;

  -- expirou?
  IF v_edition.expires_at IS NOT NULL AND v_edition.expires_at < now() THEN
    v_expired := true;
  END IF;

  -- segmento + nome do lead
  SELECT segment INTO v_segment
  FROM public.magazine_reads
  WHERE edition_id = v_edition.id AND lead_id = p_lead_id;
  v_segment := COALESCE(v_segment, 'active');

  -- nome da paciente (busca em leads se existir)
  BEGIN
    SELECT COALESCE(NULLIF(name,''), NULLIF(nome,''), NULL)
    INTO v_lead_name
    FROM public.leads WHERE id = p_lead_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_lead_name := NULL;
  END;

  -- pages filtradas por segmento
  SELECT jsonb_agg(jsonb_build_object(
    'id', p.id,
    'order_index', p.order_index,
    'template_slug', p.template_slug,
    'slots', p.slots,
    'is_hidden_icon_page', (p.id = v_edition.hidden_icon_page_id),
    'hidden_icon_pos', p.hidden_icon_pos
  ) ORDER BY p.order_index)
  INTO v_pages
  FROM public.magazine_pages p
  WHERE p.edition_id = v_edition.id
    AND ('all' = ANY(p.segment_scope) OR v_segment = ANY(p.segment_scope));

  -- contagem de reactions por pagina (para mostrar live)
  SELECT jsonb_object_agg(
    page_id::text,
    jsonb_build_object('heart', heart_count, 'sparkle', sparkle_count, 'wow', wow_count)
  )
  INTO v_reactions
  FROM (
    SELECT page_id,
      COUNT(*) FILTER (WHERE reaction_type = 'heart')   AS heart_count,
      COUNT(*) FILTER (WHERE reaction_type = 'sparkle') AS sparkle_count,
      COUNT(*) FILTER (WHERE reaction_type = 'wow')     AS wow_count
    FROM public.magazine_reactions
    WHERE edition_id = v_edition.id
    GROUP BY page_id
  ) r;

  RETURN jsonb_build_object(
    'id', v_edition.id,
    'slug', v_edition.slug,
    'title', v_edition.title,
    'subtitle', v_edition.subtitle,
    'edition_number', v_edition.edition_number,
    'theme', v_edition.theme,
    'published_at', v_edition.published_at,
    'expires_at', v_edition.expires_at,
    'expired', v_expired,
    'segment', v_segment,
    'lead_name', v_lead_name,
    'pages', COALESCE(v_pages, '[]'::jsonb),
    'reactions', COALESCE(v_reactions, '{}'::jsonb),
    'hidden_icon_page_id', v_edition.hidden_icon_page_id
  );
END $$;

-- ----------------------------------------------------------------------------
-- 5) RPC magazine_dashboard: agregados pra Mirian (I4)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_dashboard()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_summary jsonb;
  v_top_editions jsonb;
  v_top_pages jsonb;
  v_segment_breakdown jsonb;
  v_recent_reactions jsonb;
BEGIN
  -- Sumario geral
  SELECT jsonb_build_object(
    'total_editions',     COUNT(DISTINCT e.id),
    'published_editions', COUNT(DISTINCT e.id) FILTER (WHERE e.status='published'),
    'total_opens',        COUNT(r.*) FILTER (WHERE r.opened_at IS NOT NULL),
    'total_reads_80',     COUNT(r.*) FILTER (WHERE r.completed),
    'total_quiz',         COUNT(r.*) FILTER (WHERE r.quiz_completed),
    'total_cashback',     COALESCE(SUM(rw.amount), 0)
  )
  INTO v_summary
  FROM public.magazine_editions e
  LEFT JOIN public.magazine_reads r ON r.edition_id = e.id
  LEFT JOIN public.magazine_rewards rw ON rw.edition_id = e.id
  WHERE e.clinic_id = v_clinic_id;

  -- Top 5 edicoes por aberturas
  SELECT jsonb_agg(jsonb_build_object(
    'id', id, 'title', title, 'slug', slug, 'opens', opens,
    'reads_80', reads_80, 'cashback', cashback
  ) ORDER BY opens DESC)
  INTO v_top_editions
  FROM (
    SELECT e.id, e.title, e.slug,
      COUNT(r.*) FILTER (WHERE r.opened_at IS NOT NULL) AS opens,
      COUNT(r.*) FILTER (WHERE r.completed) AS reads_80,
      COALESCE((SELECT SUM(amount) FROM public.magazine_rewards WHERE edition_id = e.id), 0) AS cashback
    FROM public.magazine_editions e
    LEFT JOIN public.magazine_reads r ON r.edition_id = e.id
    WHERE e.clinic_id = v_clinic_id AND e.status = 'published'
    GROUP BY e.id
    ORDER BY opens DESC
    LIMIT 5
  ) sub;

  -- Top 5 paginas com mais tempo medio (cross-edicao)
  WITH page_times AS (
    SELECT
      p.id AS page_id,
      p.template_slug,
      e.title AS edition_title,
      AVG(((r.page_metrics->p.order_index::text->>'time_ms')::int)/1000.0)::numeric(10,1) AS avg_time_sec,
      COUNT(*) FILTER (WHERE r.page_metrics ? p.order_index::text) AS views
    FROM public.magazine_pages p
    JOIN public.magazine_editions e ON e.id = p.edition_id
    LEFT JOIN public.magazine_reads r ON r.edition_id = e.id
    WHERE e.clinic_id = v_clinic_id AND e.status = 'published'
    GROUP BY p.id, p.template_slug, e.title
    HAVING COUNT(*) FILTER (WHERE r.page_metrics ? p.order_index::text) > 0
  )
  SELECT jsonb_agg(jsonb_build_object(
    'page_id', page_id, 'template', template_slug, 'edition', edition_title,
    'avg_time_sec', avg_time_sec, 'views', views
  ) ORDER BY avg_time_sec DESC)
  INTO v_top_pages
  FROM (SELECT * FROM page_times ORDER BY avg_time_sec DESC LIMIT 5) t;

  -- Distribuicao por segmento (so dos que abriram)
  SELECT jsonb_object_agg(segment, count) INTO v_segment_breakdown
  FROM (
    SELECT segment, COUNT(*)::int AS count
    FROM public.magazine_reads
    WHERE clinic_id = v_clinic_id AND opened_at IS NOT NULL
    GROUP BY segment
  ) s;

  -- Reactions recentes (5 mais novas)
  SELECT jsonb_agg(jsonb_build_object(
    'reaction', reaction_type, 'edition', edition_title,
    'when', created_at
  ) ORDER BY created_at DESC)
  INTO v_recent_reactions
  FROM (
    SELECT mr.reaction_type, e.title AS edition_title, mr.created_at
    FROM public.magazine_reactions mr
    JOIN public.magazine_editions e ON e.id = mr.edition_id
    WHERE mr.clinic_id = v_clinic_id
    ORDER BY mr.created_at DESC
    LIMIT 5
  ) r;

  RETURN jsonb_build_object(
    'summary', v_summary,
    'top_editions', COALESCE(v_top_editions, '[]'::jsonb),
    'top_pages', COALESCE(v_top_pages, '[]'::jsonb),
    'segment_breakdown', COALESCE(v_segment_breakdown, '{}'::jsonb),
    'recent_reactions', COALESCE(v_recent_reactions, '[]'::jsonb)
  );
END $$;

REVOKE ALL ON FUNCTION public.magazine_dashboard() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_dashboard() TO authenticated;
