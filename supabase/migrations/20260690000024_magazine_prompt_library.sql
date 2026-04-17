-- ============================================================================
-- Beauty & Health Magazine — Prompt Library (B4)
-- ============================================================================
-- Tabela magazine_prompt_library: prompts salvos reutilizaveis pelo editor
-- para regeneracao de paginas. Seed com 5 prompts padrao.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.magazine_prompt_library (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  nome          text        NOT NULL,
  prompt_text   text        NOT NULL,
  aplicavel_a   text[]      DEFAULT NULL,  -- null = qualquer template; senao array de slugs
  usado_n       int         NOT NULL DEFAULT 0,
  created_by    uuid,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS magazine_prompt_library_clinic_idx
  ON public.magazine_prompt_library (clinic_id, usado_n DESC);

COMMENT ON TABLE public.magazine_prompt_library IS
  'Prompts reutilizaveis pra regeneracao de paginas. aplicavel_a filtra por template_slug (null = qualquer).';

ALTER TABLE public.magazine_prompt_library ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS magazine_prompt_library_clinic ON public.magazine_prompt_library;
CREATE POLICY magazine_prompt_library_clinic
  ON public.magazine_prompt_library FOR ALL
  USING (clinic_id = public._mag_current_clinic_id())
  WITH CHECK (clinic_id = public._mag_current_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.magazine_prompt_library TO authenticated;

-- Trigger updated_at
DROP TRIGGER IF EXISTS _magazine_prompt_library_touch ON public.magazine_prompt_library;
CREATE TRIGGER _magazine_prompt_library_touch
  BEFORE UPDATE ON public.magazine_prompt_library
  FOR EACH ROW EXECUTE FUNCTION public._magazine_touch_updated_at();

-- ----------------------------------------------------------------------------
-- RPCs upsert / list / delete / increment usado
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_prompt_library_upsert(
  p_id          uuid,       -- null = novo
  p_nome        text,
  p_prompt_text text,
  p_aplicavel_a text[] DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_id uuid;
BEGIN
  IF p_id IS NULL THEN
    INSERT INTO public.magazine_prompt_library (clinic_id, nome, prompt_text, aplicavel_a, created_by)
    VALUES (v_clinic_id, p_nome, p_prompt_text, p_aplicavel_a, auth.uid())
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.magazine_prompt_library
       SET nome = p_nome, prompt_text = p_prompt_text, aplicavel_a = p_aplicavel_a
     WHERE id = p_id AND clinic_id = v_clinic_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RAISE EXCEPTION 'Prompt % nao encontrado', p_id; END IF;
  END IF;
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.magazine_prompt_library_upsert(uuid,text,text,text[]) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_prompt_library_upsert(uuid,text,text,text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.magazine_prompt_library_list(
  p_template_slug text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_jsonb(p) ORDER BY p.usado_n DESC, p.created_at DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT id, nome, prompt_text, aplicavel_a, usado_n, created_at
        FROM public.magazine_prompt_library
       WHERE clinic_id = v_clinic_id
         AND (p_template_slug IS NULL OR aplicavel_a IS NULL OR p_template_slug = ANY(aplicavel_a))
       ORDER BY usado_n DESC, created_at DESC
       LIMIT 50
    ) p;
  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.magazine_prompt_library_list(text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_prompt_library_list(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.magazine_prompt_library_delete(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_updated int;
BEGIN
  DELETE FROM public.magazine_prompt_library WHERE id = p_id AND clinic_id = v_clinic_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END $$;

REVOKE ALL ON FUNCTION public.magazine_prompt_library_delete(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_prompt_library_delete(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.magazine_prompt_library_touch(p_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
BEGIN
  UPDATE public.magazine_prompt_library
     SET usado_n = usado_n + 1
   WHERE id = p_id AND clinic_id = v_clinic_id;
END $$;

REVOKE ALL ON FUNCTION public.magazine_prompt_library_touch(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_prompt_library_touch(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- Seed dos 5 prompts padrao (por clinica existente)
-- ----------------------------------------------------------------------------
DO $$
DECLARE
  v_clinic uuid;
  v_seeds jsonb := jsonb_build_array(
    jsonb_build_object('nome','Mais intimista, 1a pessoa',
                       'prompt_text','Reescreva em tom mais pessoal e intimista, falando em primeira pessoa como se fosse um relato proximo da leitora. Mantenha o conteudo tecnico mas com mais humanidade.'),
    jsonb_build_object('nome','Mais editorial, 3a pessoa',
                       'prompt_text','Reescreva em tom mais editorial e elegante, em 3a pessoa. Linguagem de revista de luxo, elegante e cuidadosa.'),
    jsonb_build_object('nome','Mais curto e direto',
                       'prompt_text','Reduza o texto para metade do tamanho mantendo as ideias principais. Tom direto, frases curtas.'),
    jsonb_build_object('nome','Mais emocional, menos tecnico',
                       'prompt_text','Remova linguagem tecnica ou reduza ao minimo, aumentando o lado emocional e a conexao com a leitora 45+.'),
    jsonb_build_object('nome','Foco na transformacao visual',
                       'prompt_text','Refoque o texto na transformacao visual que a leitora pode esperar — antes/depois, sensacoes, auto-percepcao.')
  );
  v_prompt jsonb;
BEGIN
  FOR v_clinic IN SELECT id FROM public.clinics LOOP
    FOR v_prompt IN SELECT * FROM jsonb_array_elements(v_seeds)
    LOOP
      INSERT INTO public.magazine_prompt_library (clinic_id, nome, prompt_text, aplicavel_a)
      SELECT v_clinic, v_prompt->>'nome', v_prompt->>'prompt_text', NULL
      WHERE NOT EXISTS (
        SELECT 1 FROM public.magazine_prompt_library
         WHERE clinic_id = v_clinic AND nome = v_prompt->>'nome'
      );
    END LOOP;
  END LOOP;
END $$;

-- ============================================================================
-- Validacao:
--   SELECT public.magazine_prompt_library_list(NULL);
-- ============================================================================
