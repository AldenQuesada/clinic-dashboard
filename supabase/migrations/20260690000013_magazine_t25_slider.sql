-- ============================================================================
-- Beauty & Health — Template t25 antes/depois com slider arrastavel (B3 wow)
-- ============================================================================

INSERT INTO public.magazine_templates (slug, name, category, slots_schema, html_template)
VALUES ('t25_before_after_slider', 'Antes/Depois · Slider', 'visual',
  '{"required":["titulo","foto_antes","foto_depois"],"optional":["subtitulo","meta"]}'::jsonb,
  '<!-- render server-side -->')
ON CONFLICT (slug) DO UPDATE
  SET name = EXCLUDED.name, slots_schema = EXCLUDED.slots_schema, updated_at = now();

-- Adicionar case do t25 no validator
CREATE OR REPLACE FUNCTION public.magazine_validate_section(
  p_template_slug text, p_slots jsonb
)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_errors text[] := ARRAY[]::text[];
  v_warnings text[] := ARRAY[]::text[];
  v_required text[]; v_missing text[]; v_val text; v_arr jsonb; v_len int;
BEGIN
  CASE p_template_slug
  WHEN 't01_cover_hero_dark' THEN
    v_required := ARRAY['titulo','foto_hero','edicao_label'];
    IF length(COALESCE(p_slots->>'titulo','')) > 40 THEN v_errors := array_append(v_errors, 'titulo > 40 chars'); END IF;
    IF length(COALESCE(p_slots->>'edicao_label','')) > 30 THEN v_errors := array_append(v_errors, 'edicao_label > 30 chars'); END IF;
    IF length(COALESCE(p_slots->>'subtitulo','')) > 140 THEN v_errors := array_append(v_errors, 'subtitulo > 140 chars'); END IF;
    IF length(COALESCE(p_slots->>'tag','')) > 18 THEN v_errors := array_append(v_errors, 'tag > 18 chars'); END IF;
  WHEN 't02_cover_hero_light' THEN
    v_required := ARRAY['titulo','foto_hero'];
    IF length(COALESCE(p_slots->>'titulo','')) > 40 THEN v_errors := array_append(v_errors, 'titulo > 40 chars'); END IF;
    IF length(COALESCE(p_slots->>'subtitulo','')) > 140 THEN v_errors := array_append(v_errors, 'subtitulo > 140 chars'); END IF;
  WHEN 't03_cover_triptych' THEN
    v_required := ARRAY['foto_1','foto_2','foto_3','titulo_1','titulo_2','titulo_3'];
    FOR i IN 1..3 LOOP IF length(COALESCE(p_slots->>('titulo_' || i),'')) > 22 THEN v_errors := array_append(v_errors, 'titulo_' || i || ' > 22'); END IF; END LOOP;
  WHEN 't04_toc_editorial' THEN
    v_required := ARRAY['titulo','items'];
    IF length(COALESCE(p_slots->>'titulo','')) > 24 THEN v_errors := array_append(v_errors, 'titulo > 24'); END IF;
    v_arr := p_slots->'items';
    IF jsonb_typeof(v_arr) = 'array' THEN v_len := jsonb_array_length(v_arr); IF v_len < 4 THEN v_errors := array_append(v_errors, 'items >= 4'); END IF; IF v_len > 8 THEN v_errors := array_append(v_errors, 'items > 8'); END IF; END IF;
  WHEN 't05_editorial_letter' THEN
    v_required := ARRAY['titulo','foto_autora','corpo','assinatura'];
    IF length(COALESCE(p_slots->>'titulo','')) > 50 THEN v_errors := array_append(v_errors, 'titulo > 50'); END IF;
    v_val := p_slots->>'corpo';
    IF v_val IS NOT NULL THEN v_len := array_length(regexp_split_to_array(v_val, '\s+'), 1); IF v_len > 320 THEN v_errors := array_append(v_errors, 'corpo > 280 palavras'); END IF; END IF;
  WHEN 't06_back_cta' THEN
    v_required := ARRAY['titulo','contatos','cta_texto','cta_link'];
    IF length(COALESCE(p_slots->>'titulo','')) > 50 THEN v_errors := array_append(v_errors, 'titulo > 50'); END IF;
    IF length(COALESCE(p_slots->>'cta_texto','')) > 30 THEN v_errors := array_append(v_errors, 'cta_texto > 30'); END IF;
  WHEN 't07_feature_double' THEN
    v_required := ARRAY['kicker','titulo','lede','corpo','foto_hero'];
    IF length(COALESCE(p_slots->>'kicker','')) > 22 THEN v_errors := array_append(v_errors, 'kicker > 22'); END IF;
    IF length(COALESCE(p_slots->>'titulo','')) > 70 THEN v_errors := array_append(v_errors, 'titulo > 70'); END IF;
    IF length(COALESCE(p_slots->>'lede','')) > 200 THEN v_errors := array_append(v_errors, 'lede > 200'); END IF;
    v_val := p_slots->>'corpo';
    IF v_val IS NOT NULL THEN v_len := array_length(regexp_split_to_array(v_val, '\s+'), 1); IF v_len > 750 THEN v_errors := array_append(v_errors, 'corpo > 700 palavras'); END IF; END IF;
  WHEN 't08_feature_fullbleed' THEN
    v_required := ARRAY['titulo','foto_full','lede'];
    IF length(COALESCE(p_slots->>'titulo','')) > 60 THEN v_errors := array_append(v_errors, 'titulo > 60'); END IF;
    IF length(COALESCE(p_slots->>'lede','')) > 160 THEN v_errors := array_append(v_errors, 'lede > 160'); END IF;
  WHEN 't09_feature_triptych' THEN
    v_required := ARRAY['foto_1','foto_2','texto_central'];
    IF length(COALESCE(p_slots->>'texto_central','')) > 180 THEN v_errors := array_append(v_errors, 'texto_central > 180'); END IF;
  WHEN 't10_interview' THEN
    v_required := ARRAY['titulo','foto_entrevistado','nome','qas'];
    IF length(COALESCE(p_slots->>'titulo','')) > 60 THEN v_errors := array_append(v_errors, 'titulo > 60'); END IF;
  WHEN 't11_product_highlight' THEN
    v_required := ARRAY['titulo','foto','beneficios','cta'];
    IF length(COALESCE(p_slots->>'titulo','')) > 40 THEN v_errors := array_append(v_errors, 'titulo > 40'); END IF;
  WHEN 't12_before_after_pair' THEN
    v_required := ARRAY['titulo','foto_antes','foto_depois','meta','stats'];
    IF length(COALESCE(p_slots->>'titulo','')) > 50 THEN v_errors := array_append(v_errors, 'titulo > 50'); END IF;
  WHEN 't13_before_after_quad' THEN v_required := ARRAY['caso_1','caso_2'];
  WHEN 't14_mosaic_gallery' THEN
    v_required := ARRAY['titulo','fotos'];
    IF length(COALESCE(p_slots->>'titulo','')) > 40 THEN v_errors := array_append(v_errors, 'titulo > 40'); END IF;
  WHEN 't15_evolution_timeline' THEN
    v_required := ARRAY['titulo','marcos'];
    IF length(COALESCE(p_slots->>'titulo','')) > 50 THEN v_errors := array_append(v_errors, 'titulo > 50'); END IF;
  WHEN 't16_quiz_cta' THEN
    v_required := ARRAY['titulo','lede','quiz_slug','recompensas'];
  WHEN 't17_poll' THEN
    v_required := ARRAY['pergunta','opcoes'];
    IF length(COALESCE(p_slots->>'pergunta','')) > 140 THEN v_errors := array_append(v_errors, 'pergunta > 140'); END IF;
  WHEN 't18_stat_feature' THEN
    v_required := ARRAY['numero','titulo','fonte'];
    IF length(COALESCE(p_slots->>'numero','')) > 10 THEN v_errors := array_append(v_errors, 'numero > 10'); END IF;
  WHEN 't19_ritual_steps' THEN
    v_required := ARRAY['titulo','passos'];
    IF length(COALESCE(p_slots->>'titulo','')) > 50 THEN v_errors := array_append(v_errors, 'titulo > 50'); END IF;
  WHEN 't20_myth_vs_fact' THEN
    v_required := ARRAY['titulo','pares'];
    IF length(COALESCE(p_slots->>'titulo','')) > 40 THEN v_errors := array_append(v_errors, 'titulo > 40'); END IF;
  WHEN 't21_product_photo_split' THEN
    v_required := ARRAY['foto_principal','foto_detalhe','kicker','nome_produto'];
    IF length(COALESCE(p_slots->>'kicker','')) > 22 THEN v_errors := array_append(v_errors, 'kicker > 22'); END IF;
    IF length(COALESCE(p_slots->>'nome_produto','')) > 40 THEN v_errors := array_append(v_errors, 'nome_produto > 40'); END IF;
  WHEN 't22_product_feature_text' THEN
    v_required := ARRAY['kicker','titulo','lede','corpo'];
    IF length(COALESCE(p_slots->>'titulo','')) > 70 THEN v_errors := array_append(v_errors, 'titulo > 70'); END IF;
    v_val := p_slots->>'corpo';
    IF v_val IS NOT NULL THEN v_len := array_length(regexp_split_to_array(v_val, '\s+'), 1); IF v_len > 750 THEN v_errors := array_append(v_errors, 'corpo > 700 palavras'); END IF; END IF;
  WHEN 't25_before_after_slider' THEN
    v_required := ARRAY['titulo','foto_antes','foto_depois'];
    IF length(COALESCE(p_slots->>'titulo','')) > 50 THEN v_errors := array_append(v_errors, 'titulo > 50'); END IF;
    IF length(COALESCE(p_slots->>'subtitulo','')) > 160 THEN v_errors := array_append(v_errors, 'subtitulo > 160'); END IF;
    IF length(COALESCE(p_slots->>'meta','')) > 120 THEN v_errors := array_append(v_errors, 'meta > 120'); END IF;
  ELSE
    v_errors := array_append(v_errors, 'template_slug desconhecido: ' || p_template_slug);
  END CASE;

  IF v_required IS NOT NULL THEN
    SELECT array_agg(k) INTO v_missing FROM unnest(v_required) AS k WHERE COALESCE(p_slots->>k,'') = '' OR p_slots->k IS NULL;
    IF v_missing IS NOT NULL AND array_length(v_missing,1) > 0 THEN v_errors := v_missing || v_errors; END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', array_length(v_errors,1) IS NULL,
    'errors', to_jsonb(COALESCE(v_errors, ARRAY[]::text[])),
    'warnings', to_jsonb(COALESCE(v_warnings, ARRAY[]::text[]))
  );
END $$;
