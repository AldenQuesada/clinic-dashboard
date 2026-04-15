-- Inclui personalization_config na resposta da RPC publica
CREATE OR REPLACE FUNCTION public.magazine_get_edition_public(
  p_edition_slug text, p_lead_id uuid, p_hash text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_edition public.magazine_editions%ROWTYPE;
  v_segment text; v_lead_name text;
  v_pages jsonb; v_reactions jsonb;
  v_expired boolean := false;
BEGIN
  SELECT * INTO v_edition FROM public.magazine_editions
  WHERE slug = p_edition_slug AND status = 'published';
  IF NOT FOUND THEN RETURN NULL; END IF;

  IF NOT public._mag_verify_lead_hash(p_lead_id, v_edition.id, p_hash) THEN
    RAISE EXCEPTION 'Link invalido';
  END IF;

  IF v_edition.expires_at IS NOT NULL AND v_edition.expires_at < now() THEN v_expired := true; END IF;

  SELECT segment INTO v_segment FROM public.magazine_reads
  WHERE edition_id = v_edition.id AND lead_id = p_lead_id;
  v_segment := COALESCE(v_segment, 'active');

  BEGIN
    SELECT COALESCE(NULLIF(name,''), NULLIF(nome,''), NULL) INTO v_lead_name
    FROM public.leads WHERE id = p_lead_id;
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_lead_name := NULL; END;

  SELECT jsonb_agg(jsonb_build_object(
    'id', p.id, 'order_index', p.order_index, 'template_slug', p.template_slug,
    'slots', p.slots, 'is_hidden_icon_page', (p.id = v_edition.hidden_icon_page_id),
    'hidden_icon_pos', p.hidden_icon_pos
  ) ORDER BY p.order_index)
  INTO v_pages
  FROM public.magazine_pages p
  WHERE p.edition_id = v_edition.id
    AND ('all' = ANY(p.segment_scope) OR v_segment = ANY(p.segment_scope));

  SELECT jsonb_object_agg(page_id::text,
    jsonb_build_object('heart', heart_count, 'sparkle', sparkle_count, 'wow', wow_count))
  INTO v_reactions
  FROM (
    SELECT page_id,
      COUNT(*) FILTER (WHERE reaction_type = 'heart')   AS heart_count,
      COUNT(*) FILTER (WHERE reaction_type = 'sparkle') AS sparkle_count,
      COUNT(*) FILTER (WHERE reaction_type = 'wow')     AS wow_count
    FROM public.magazine_reactions
    WHERE edition_id = v_edition.id GROUP BY page_id
  ) r;

  RETURN jsonb_build_object(
    'id', v_edition.id, 'slug', v_edition.slug, 'title', v_edition.title,
    'subtitle', v_edition.subtitle, 'edition_number', v_edition.edition_number,
    'theme', v_edition.theme, 'published_at', v_edition.published_at,
    'expires_at', v_edition.expires_at, 'expired', v_expired,
    'segment', v_segment, 'lead_name', v_lead_name,
    'pages', COALESCE(v_pages, '[]'::jsonb),
    'reactions', COALESCE(v_reactions, '{}'::jsonb),
    'hidden_icon_page_id', v_edition.hidden_icon_page_id,
    'personalization_config', COALESCE(v_edition.personalization_config, '{}'::jsonb)
  );
END $$;
