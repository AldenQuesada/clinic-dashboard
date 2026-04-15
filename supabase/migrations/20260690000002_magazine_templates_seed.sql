-- ============================================================================
-- Beauty & Health Magazine — Seed da biblioteca de 20 templates
-- ============================================================================
-- Registra os 20 templates definidos no documento mestre.
-- Slug estavel: t{NN}_{categoria}_{variante}. Nunca mudar apos publicado.
-- ============================================================================

INSERT INTO public.magazine_templates (slug, name, category, slots_schema, html_template) VALUES

-- Capas ---------------------------------------------------------------------
('t01_cover_hero_dark', 'Hero Dark', 'cover',
  '{"required":["titulo","foto_hero","edicao_label"],"optional":["subtitulo","tag"]}'::jsonb,
  '<!-- render server-side: ver /templates/t01_cover_hero_dark.html -->'),

('t02_cover_hero_light', 'Hero Light', 'cover',
  '{"required":["titulo","foto_hero"],"optional":["subtitulo"]}'::jsonb,
  '<!-- render server-side -->'),

('t03_cover_triptych', 'Capa Tripla', 'cover',
  '{"required":["foto_1","foto_2","foto_3","titulo_1","titulo_2","titulo_3"]}'::jsonb,
  '<!-- render server-side -->'),

-- Estruturais ---------------------------------------------------------------
('t04_toc_editorial', 'Sumario Editorial', 'toc',
  '{"required":["titulo","items"],"optional":["lede","kicker"],"items":{"num":"text","titulo":"text","kicker":"text","page_id":"uuid"}}'::jsonb,
  '<!-- render server-side -->'),

('t05_editorial_letter', 'Carta da Diretora', 'editorial',
  '{"required":["titulo","foto_autora","corpo","assinatura"]}'::jsonb,
  '<!-- render server-side -->'),

('t06_back_cta', 'Contracapa CTA', 'back',
  '{"required":["titulo","contatos","cta_texto","cta_link"],"optional":["proxima_edicao"]}'::jsonb,
  '<!-- render server-side -->'),

-- Materias ------------------------------------------------------------------
('t07_feature_double', 'Materia Dupla', 'feature',
  '{"required":["kicker","titulo","lede","corpo","foto_hero"],"optional":["byline"]}'::jsonb,
  '<!-- render server-side -->'),

('t08_feature_fullbleed', 'Full Bleed', 'feature',
  '{"required":["titulo","lede","foto_full"],"optional":["overlay_color"]}'::jsonb,
  '<!-- render server-side -->'),

('t09_feature_triptych', '3 Blocos', 'feature',
  '{"required":["foto_1","texto_central","foto_2"],"optional":["legenda_1","legenda_2"]}'::jsonb,
  '<!-- render server-side -->'),

('t10_interview', 'Entrevista Q&A', 'feature',
  '{"required":["titulo","foto_entrevistado","nome","qas"],"optional":["titulo_prof"],"qas":{"q":"text","a":"text"}}'::jsonb,
  '<!-- render server-side -->'),

('t11_product_highlight', 'Destaque Tratamento', 'feature',
  '{"required":["titulo","foto","beneficios","cta"],"optional":["preco_sugerido","subtitulo"]}'::jsonb,
  '<!-- render server-side -->'),

-- Visuais -------------------------------------------------------------------
('t12_before_after_pair', 'Antes/Depois (2)', 'visual',
  '{"required":["titulo","foto_antes","foto_depois","meta","stats"]}'::jsonb,
  '<!-- render server-side -->'),

('t13_before_after_quad', 'Antes/Depois (4)', 'visual',
  '{"required":["caso_1","caso_2"],"caso_1":{"antes":"uuid","depois":"uuid","label":"text"}}'::jsonb,
  '<!-- render server-side -->'),

('t14_mosaic_gallery', 'Galeria Mosaico', 'visual',
  '{"required":["titulo","fotos"],"optional":["legenda"]}'::jsonb,
  '<!-- render server-side -->'),

('t15_evolution_timeline', 'Timeline Evolucao', 'visual',
  '{"required":["titulo","marcos"],"marcos":{"data":"text","foto":"uuid","legenda":"text"}}'::jsonb,
  '<!-- render server-side -->'),

-- Interativos ---------------------------------------------------------------
('t16_quiz_cta', 'Quiz CTA', 'interactive',
  '{"required":["titulo","lede","quiz_slug","recompensas"]}'::jsonb,
  '<!-- render server-side -->'),

('t17_poll', 'Enquete/Poll', 'interactive',
  '{"required":["pergunta","opcoes"],"optional":["resultado_visivel"]}'::jsonb,
  '<!-- render server-side -->'),

('t18_stat_feature', 'Numero em Destaque', 'interactive',
  '{"required":["numero","contexto","fonte"],"optional":["unidade"]}'::jsonb,
  '<!-- render server-side -->'),

-- Complementares ------------------------------------------------------------
('t19_ritual_steps', 'Ritual / Passo-a-passo', 'extra',
  '{"required":["titulo","passos"],"passos":{"num":"int","acao":"text","detalhe":"text","foto":"uuid"}}'::jsonb,
  '<!-- render server-side -->'),

('t20_myth_vs_fact', 'Mitos & Verdades', 'extra',
  '{"required":["titulo","items"],"items":{"afirmacao":"text","tipo":"myth|fact","resposta":"text"}}'::jsonb,
  '<!-- render server-side -->')

ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  slots_schema = EXCLUDED.slots_schema,
  updated_at = now();
