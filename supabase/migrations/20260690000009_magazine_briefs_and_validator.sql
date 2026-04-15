-- ============================================================================
-- Beauty & Health Magazine — Briefs + Validator
-- ============================================================================
-- Tabela magazine_briefs: user envia conteudo bruto (brief + blocos + fotos)
-- Claude le, editorializa, gera magazine_pages conforme playbook.
-- Funcao magazine_validate_section: checa limites por template antes do insert.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tabela magazine_briefs — entrada bruta do usuario
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.magazine_briefs (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  edition_id      uuid        REFERENCES public.magazine_editions(id) ON DELETE SET NULL,
  -- Meta
  theme           text,                                    -- "Olhar que renasce"
  tone            text,                                    -- "editorial, cuidadoso, pessoal"
  objective       text,                                    -- "reativar base inativa + gerar leads Smooth Eyes"
  month_year      text,                                    -- "abril-2026"
  -- Conteudo estruturado
  sections        jsonb       NOT NULL DEFAULT '[]'::jsonb, -- array [{template_slug, raw_content, order}]
  asset_ids       uuid[]      DEFAULT ARRAY[]::uuid[],     -- referencias a magazine_assets ja enviadas
  references_text text,                                    -- urls/notas/fontes soltas (multi-linha)
  -- Status
  status          text        NOT NULL DEFAULT 'draft',    -- draft | submitted | processing | done | error
  submitted_at    timestamptz,
  processed_at    timestamptz,
  error_message   text,
  created_by      uuid        DEFAULT auth.uid(),
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT magazine_briefs_status_chk CHECK (status IN ('draft','submitted','processing','done','error'))
);

CREATE INDEX IF NOT EXISTS magazine_briefs_clinic_status_idx
  ON public.magazine_briefs (clinic_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS magazine_briefs_edition_idx
  ON public.magazine_briefs (edition_id) WHERE edition_id IS NOT NULL;

COMMENT ON TABLE public.magazine_briefs IS
  'Entrada bruta do usuario para producao de edicoes. Claude consome sections e asset_ids pra gerar magazine_pages polidas.';

-- ----------------------------------------------------------------------------
-- 2) RLS
-- ----------------------------------------------------------------------------
ALTER TABLE public.magazine_briefs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS magazine_briefs_clinic ON public.magazine_briefs;
CREATE POLICY magazine_briefs_clinic
  ON public.magazine_briefs
  FOR ALL
  USING (clinic_id = public._mag_current_clinic_id())
  WITH CHECK (clinic_id = public._mag_current_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.magazine_briefs TO authenticated;

-- ----------------------------------------------------------------------------
-- 3) Trigger updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._mag_briefs_touch()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS magazine_briefs_touch ON public.magazine_briefs;
CREATE TRIGGER magazine_briefs_touch
  BEFORE UPDATE ON public.magazine_briefs
  FOR EACH ROW EXECUTE FUNCTION public._mag_briefs_touch();

-- ----------------------------------------------------------------------------
-- 4) RPCs
-- ----------------------------------------------------------------------------

-- Criar/atualizar rascunho
CREATE OR REPLACE FUNCTION public.magazine_upsert_brief(
  p_brief_id        uuid,         -- null = novo
  p_theme           text,
  p_tone            text,
  p_objective       text,
  p_month_year      text,
  p_sections        jsonb,
  p_asset_ids       uuid[],
  p_references_text text,
  p_edition_id      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_id uuid;
BEGIN
  IF p_brief_id IS NULL THEN
    INSERT INTO public.magazine_briefs (
      clinic_id, edition_id, theme, tone, objective, month_year,
      sections, asset_ids, references_text, status
    ) VALUES (
      v_clinic_id, p_edition_id, p_theme, p_tone, p_objective, p_month_year,
      COALESCE(p_sections, '[]'::jsonb), COALESCE(p_asset_ids, ARRAY[]::uuid[]),
      p_references_text, 'draft'
    )
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.magazine_briefs SET
      theme = p_theme,
      tone = p_tone,
      objective = p_objective,
      month_year = p_month_year,
      sections = COALESCE(p_sections, '[]'::jsonb),
      asset_ids = COALESCE(p_asset_ids, ARRAY[]::uuid[]),
      references_text = p_references_text,
      edition_id = COALESCE(p_edition_id, edition_id)
    WHERE id = p_brief_id AND clinic_id = v_clinic_id
    RETURNING id INTO v_id;
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Brief % nao encontrado ou sem permissao', p_brief_id;
    END IF;
  END IF;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.magazine_upsert_brief(uuid,text,text,text,text,jsonb,uuid[],text,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_upsert_brief(uuid,text,text,text,text,jsonb,uuid[],text,uuid) TO authenticated;

-- Enviar brief pro Claude
CREATE OR REPLACE FUNCTION public.magazine_submit_brief(p_brief_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.magazine_briefs%ROWTYPE;
BEGIN
  UPDATE public.magazine_briefs
     SET status = 'submitted', submitted_at = now()
   WHERE id = p_brief_id
     AND clinic_id = public._mag_current_clinic_id()
     AND status IN ('draft','error')
   RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Brief % nao pode ser enviado (inexistente ou ja submetido)', p_brief_id;
  END IF;

  RETURN jsonb_build_object(
    'brief_id', v_row.id,
    'status', v_row.status,
    'sections_count', jsonb_array_length(v_row.sections),
    'assets_count', coalesce(array_length(v_row.asset_ids, 1), 0)
  );
END $$;

REVOKE ALL ON FUNCTION public.magazine_submit_brief(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_submit_brief(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 5) Validator: magazine_validate_section
-- ----------------------------------------------------------------------------
-- Valida conteudo de uma secao conforme contrato do playbook.
-- Retorna jsonb {ok: bool, errors: text[], warnings: text[]}.
-- Claude DEVE chamar antes de inserir cada pagina.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.magazine_validate_section(
  p_template_slug text,
  p_slots         jsonb
)
RETURNS jsonb
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  v_errors   text[] := ARRAY[]::text[];
  v_warnings text[] := ARRAY[]::text[];
  v_required text[];
  v_missing  text[];
  v_val      text;
  v_arr      jsonb;
  v_len      int;
BEGIN
  -- regra comum: required nao pode ser null/vazio
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
    FOR i IN 1..3 LOOP
      IF length(COALESCE(p_slots->>('titulo_' || i),'')) > 22 THEN v_errors := array_append(v_errors, 'titulo_' || i || ' > 22 chars'); END IF;
    END LOOP;

  WHEN 't04_toc_editorial' THEN
    v_required := ARRAY['titulo','items'];
    IF length(COALESCE(p_slots->>'titulo','')) > 24 THEN v_errors := array_append(v_errors, 'titulo > 24 chars'); END IF;
    v_arr := p_slots->'items';
    IF jsonb_typeof(v_arr) <> 'array' THEN
      v_errors := array_append(v_errors, 'items deve ser array');
    ELSE
      v_len := jsonb_array_length(v_arr);
      IF v_len < 4 THEN v_errors := array_append(v_errors, 'items precisa >= 4 itens'); END IF;
      IF v_len > 8 THEN v_errors := array_append(v_errors, 'items > 8 itens'); END IF;
    END IF;
    IF length(COALESCE(p_slots->>'lede','')) > 180 THEN v_errors := array_append(v_errors, 'lede > 180 chars'); END IF;
    IF length(COALESCE(p_slots->>'kicker','')) > 12 THEN v_errors := array_append(v_errors, 'kicker > 12 chars'); END IF;

  WHEN 't05_editorial_letter' THEN
    v_required := ARRAY['titulo','foto_autora','corpo','assinatura'];
    IF length(COALESCE(p_slots->>'titulo','')) > 50 THEN v_errors := array_append(v_errors, 'titulo > 50 chars'); END IF;
    v_val := p_slots->>'corpo';
    IF v_val IS NOT NULL THEN
      v_len := array_length(regexp_split_to_array(v_val, '\s+'), 1);
      IF v_len < 180 THEN v_warnings := array_append(v_warnings, 'corpo curto (< 180 palavras)'); END IF;
      IF v_len > 320 THEN v_errors := array_append(v_errors, 'corpo > 280 palavras'); END IF;
    END IF;

  WHEN 't06_back_cta' THEN
    v_required := ARRAY['titulo','contatos','cta_texto','cta_link'];
    IF length(COALESCE(p_slots->>'titulo','')) > 50 THEN v_errors := array_append(v_errors, 'titulo > 50 chars'); END IF;
    IF length(COALESCE(p_slots->>'cta_texto','')) > 30 THEN v_errors := array_append(v_errors, 'cta_texto > 30 chars'); END IF;
    v_arr := p_slots->'contatos';
    IF jsonb_typeof(v_arr) = 'array' THEN
      v_len := jsonb_array_length(v_arr);
      IF v_len < 2 THEN v_errors := array_append(v_errors, 'contatos precisa >= 2'); END IF;
      IF v_len > 4 THEN v_errors := array_append(v_errors, 'contatos > 4'); END IF;
    END IF;
    IF length(COALESCE(p_slots->>'proxima_edicao','')) > 60 THEN v_errors := array_append(v_errors, 'proxima_edicao > 60 chars'); END IF;

  WHEN 't07_feature_double' THEN
    v_required := ARRAY['kicker','titulo','lede','corpo','foto_hero'];
    IF length(COALESCE(p_slots->>'kicker','')) > 22 THEN v_errors := array_append(v_errors, 'kicker > 22 chars'); END IF;
    IF length(COALESCE(p_slots->>'titulo','')) > 70 THEN v_errors := array_append(v_errors, 'titulo > 70 chars'); END IF;
    IF length(COALESCE(p_slots->>'lede','')) > 200 THEN v_errors := array_append(v_errors, 'lede > 200 chars'); END IF;
    IF length(COALESCE(p_slots->>'lede','')) < 100 THEN v_warnings := array_append(v_warnings, 'lede curto (< 100 chars)'); END IF;
    v_val := p_slots->>'corpo';
    IF v_val IS NOT NULL THEN
      v_len := array_length(regexp_split_to_array(v_val, '\s+'), 1);
      IF v_len < 400 THEN v_warnings := array_append(v_warnings, 'corpo curto (< 400 palavras)'); END IF;
      IF v_len > 750 THEN v_errors := array_append(v_errors, 'corpo > 700 palavras'); END IF;
    END IF;

  WHEN 't08_feature_fullbleed' THEN
    v_required := ARRAY['titulo','foto_full','lede'];
    IF length(COALESCE(p_slots->>'titulo','')) > 60 THEN v_errors := array_append(v_errors, 'titulo > 60 chars'); END IF;
    IF length(COALESCE(p_slots->>'lede','')) > 160 THEN v_errors := array_append(v_errors, 'lede > 160 chars'); END IF;

  WHEN 't09_feature_triptych' THEN
    v_required := ARRAY['foto_1','foto_2','texto_central'];
    IF length(COALESCE(p_slots->>'texto_central','')) > 180 THEN v_errors := array_append(v_errors, 'texto_central > 180 chars'); END IF;

  WHEN 't10_interview' THEN
    v_required := ARRAY['titulo','foto_entrevistado','nome','qas'];
    IF length(COALESCE(p_slots->>'titulo','')) > 60 THEN v_errors := array_append(v_errors, 'titulo > 60 chars'); END IF;
    IF length(COALESCE(p_slots->>'nome','')) > 40 THEN v_errors := array_append(v_errors, 'nome > 40 chars'); END IF;
    IF length(COALESCE(p_slots->>'titulo_prof','')) > 50 THEN v_errors := array_append(v_errors, 'titulo_prof > 50 chars'); END IF;
    v_arr := p_slots->'qas';
    IF jsonb_typeof(v_arr) <> 'array' THEN
      v_errors := array_append(v_errors, 'qas deve ser array');
    ELSE
      v_len := jsonb_array_length(v_arr);
      IF v_len < 3 THEN v_errors := array_append(v_errors, 'qas precisa >= 3'); END IF;
      IF v_len > 6 THEN v_errors := array_append(v_errors, 'qas > 6'); END IF;
      FOR i IN 0..(v_len-1) LOOP
        IF length(COALESCE(v_arr->i->>'q','')) > 120 THEN v_errors := array_append(v_errors, 'qas[' || i || '].q > 120 chars'); END IF;
      END LOOP;
    END IF;

  WHEN 't11_product_highlight' THEN
    v_required := ARRAY['titulo','foto','beneficios','cta'];
    IF length(COALESCE(p_slots->>'titulo','')) > 40 THEN v_errors := array_append(v_errors, 'titulo > 40 chars'); END IF;
    IF length(COALESCE(p_slots->>'subtitulo','')) > 100 THEN v_errors := array_append(v_errors, 'subtitulo > 100 chars'); END IF;
    IF length(COALESCE(p_slots->>'cta','')) > 30 THEN v_errors := array_append(v_errors, 'cta > 30 chars'); END IF;
    v_arr := p_slots->'beneficios';
    IF jsonb_typeof(v_arr) = 'array' THEN
      v_len := jsonb_array_length(v_arr);
      IF v_len < 3 THEN v_errors := array_append(v_errors, 'beneficios precisa >= 3'); END IF;
      IF v_len > 6 THEN v_errors := array_append(v_errors, 'beneficios > 6'); END IF;
    END IF;

  WHEN 't12_before_after_pair' THEN
    v_required := ARRAY['titulo','foto_antes','foto_depois','meta','stats'];
    IF length(COALESCE(p_slots->>'titulo','')) > 50 THEN v_errors := array_append(v_errors, 'titulo > 50 chars'); END IF;
    IF length(COALESCE(p_slots->>'meta','')) > 140 THEN v_errors := array_append(v_errors, 'meta > 140 chars'); END IF;
    v_arr := p_slots->'stats';
    IF jsonb_typeof(v_arr) = 'array' THEN
      v_len := jsonb_array_length(v_arr);
      IF v_len < 2 THEN v_errors := array_append(v_errors, 'stats precisa >= 2'); END IF;
      IF v_len > 4 THEN v_errors := array_append(v_errors, 'stats > 4'); END IF;
    END IF;

  WHEN 't13_before_after_quad' THEN
    v_required := ARRAY['caso_1','caso_2'];

  WHEN 't14_mosaic_gallery' THEN
    v_required := ARRAY['titulo','fotos'];
    IF length(COALESCE(p_slots->>'titulo','')) > 40 THEN v_errors := array_append(v_errors, 'titulo > 40 chars'); END IF;
    IF length(COALESCE(p_slots->>'legenda','')) > 120 THEN v_errors := array_append(v_errors, 'legenda > 120 chars'); END IF;
    v_arr := p_slots->'fotos';
    IF jsonb_typeof(v_arr) = 'array' THEN
      v_len := jsonb_array_length(v_arr);
      IF v_len < 3 THEN v_errors := array_append(v_errors, 'fotos precisa >= 3'); END IF;
      IF v_len > 5 THEN v_errors := array_append(v_errors, 'fotos > 5'); END IF;
    END IF;

  WHEN 't15_evolution_timeline' THEN
    v_required := ARRAY['titulo','marcos'];
    IF length(COALESCE(p_slots->>'titulo','')) > 50 THEN v_errors := array_append(v_errors, 'titulo > 50 chars'); END IF;
    v_arr := p_slots->'marcos';
    IF jsonb_typeof(v_arr) = 'array' THEN
      v_len := jsonb_array_length(v_arr);
      IF v_len < 3 THEN v_errors := array_append(v_errors, 'marcos precisa >= 3'); END IF;
      IF v_len > 6 THEN v_errors := array_append(v_errors, 'marcos > 6'); END IF;
    END IF;

  WHEN 't16_quiz_cta' THEN
    v_required := ARRAY['titulo','lede','quiz_slug','recompensas'];
    IF length(COALESCE(p_slots->>'titulo','')) > 50 THEN v_errors := array_append(v_errors, 'titulo > 50 chars'); END IF;
    IF length(COALESCE(p_slots->>'lede','')) > 180 THEN v_errors := array_append(v_errors, 'lede > 180 chars'); END IF;
    v_arr := p_slots->'recompensas';
    IF jsonb_typeof(v_arr) = 'array' THEN
      v_len := jsonb_array_length(v_arr);
      IF v_len < 2 THEN v_errors := array_append(v_errors, 'recompensas precisa >= 2'); END IF;
      IF v_len > 4 THEN v_errors := array_append(v_errors, 'recompensas > 4'); END IF;
    END IF;

  WHEN 't17_poll' THEN
    v_required := ARRAY['pergunta','opcoes'];
    IF length(COALESCE(p_slots->>'pergunta','')) > 140 THEN v_errors := array_append(v_errors, 'pergunta > 140 chars'); END IF;
    IF (p_slots->>'pergunta') !~ '\?\s*$' THEN v_warnings := array_append(v_warnings, 'pergunta nao termina com "?"'); END IF;
    v_arr := p_slots->'opcoes';
    IF jsonb_typeof(v_arr) = 'array' THEN
      v_len := jsonb_array_length(v_arr);
      IF v_len < 2 THEN v_errors := array_append(v_errors, 'opcoes precisa >= 2'); END IF;
      IF v_len > 4 THEN v_errors := array_append(v_errors, 'opcoes > 4'); END IF;
    END IF;

  WHEN 't18_stat_feature' THEN
    v_required := ARRAY['numero','titulo','fonte'];
    IF length(COALESCE(p_slots->>'numero','')) > 10 THEN v_errors := array_append(v_errors, 'numero > 10 chars'); END IF;
    IF length(COALESCE(p_slots->>'titulo','')) > 120 THEN v_errors := array_append(v_errors, 'titulo > 120 chars'); END IF;
    IF length(COALESCE(p_slots->>'fonte','')) > 100 THEN v_errors := array_append(v_errors, 'fonte > 100 chars'); END IF;

  WHEN 't19_ritual_steps' THEN
    v_required := ARRAY['titulo','passos'];
    IF length(COALESCE(p_slots->>'titulo','')) > 50 THEN v_errors := array_append(v_errors, 'titulo > 50 chars'); END IF;
    v_arr := p_slots->'passos';
    IF jsonb_typeof(v_arr) = 'array' THEN
      v_len := jsonb_array_length(v_arr);
      IF v_len < 3 THEN v_errors := array_append(v_errors, 'passos precisa >= 3'); END IF;
      IF v_len > 6 THEN v_errors := array_append(v_errors, 'passos > 6'); END IF;
    END IF;

  WHEN 't20_myth_vs_fact' THEN
    v_required := ARRAY['titulo','pares'];
    IF length(COALESCE(p_slots->>'titulo','')) > 40 THEN v_errors := array_append(v_errors, 'titulo > 40 chars'); END IF;
    v_arr := p_slots->'pares';
    IF jsonb_typeof(v_arr) = 'array' THEN
      v_len := jsonb_array_length(v_arr);
      IF v_len < 3 THEN v_errors := array_append(v_errors, 'pares precisa >= 3'); END IF;
      IF v_len > 5 THEN v_errors := array_append(v_errors, 'pares > 5'); END IF;
      FOR i IN 0..(v_len-1) LOOP
        IF length(COALESCE(v_arr->i->>'mito','')) > 120 THEN v_errors := array_append(v_errors, 'pares[' || i || '].mito > 120 chars'); END IF;
        IF length(COALESCE(v_arr->i->>'fato','')) > 200 THEN v_errors := array_append(v_errors, 'pares[' || i || '].fato > 200 chars'); END IF;
      END LOOP;
    END IF;

  ELSE
    v_errors := array_append(v_errors, 'template_slug desconhecido: ' || p_template_slug);
  END CASE;

  -- Check required genericos
  IF v_required IS NOT NULL THEN
    SELECT array_agg(k) INTO v_missing
      FROM unnest(v_required) AS k
      WHERE COALESCE(p_slots->>k,'') = '' OR p_slots->k IS NULL;
    IF v_missing IS NOT NULL AND array_length(v_missing,1) > 0 THEN
      v_errors := v_missing || v_errors;
    END IF;
  END IF;

  -- Check proibicao de emojis em textos editoriais
  FOR v_val IN SELECT jsonb_object_keys(p_slots) LOOP
    IF v_val NOT IN ('quiz_slug','cta_link') AND
       p_slots->>v_val ~ '[\U0001F300-\U0001FAFF\U00002600-\U000027BF]' THEN
      v_warnings := array_append(v_warnings, 'emoji detectado em ' || v_val || ' (remover para tom editorial)');
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', array_length(v_errors,1) IS NULL,
    'errors', to_jsonb(COALESCE(v_errors, ARRAY[]::text[])),
    'warnings', to_jsonb(COALESCE(v_warnings, ARRAY[]::text[]))
  );
END $$;

REVOKE ALL ON FUNCTION public.magazine_validate_section(text,jsonb) FROM public;
GRANT EXECUTE ON FUNCTION public.magazine_validate_section(text,jsonb) TO anon, authenticated;

COMMENT ON FUNCTION public.magazine_validate_section IS
  'Valida slots de uma pagina conforme contrato do playbook. Retorna {ok,errors,warnings}. Chamar antes de inserir pagina.';
