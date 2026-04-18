-- ============================================================
-- Migration: B2B Partnership Comments — Fraqueza #7
--
-- Notas curtas por parceria para registrar contexto, ligações,
-- negociações e decisões. Zero moderação; RLS aberto (padrão
-- do projeto single-clinic). Sem edição — só add/delete pra
-- manter histórico limpo.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.b2b_partnership_comments (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  partnership_id uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  author_name    text NULL,
  body           text NOT NULL CHECK (length(trim(body)) > 0),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_partnership_comments_partnership
  ON public.b2b_partnership_comments (partnership_id, created_at DESC);

ALTER TABLE public.b2b_partnership_comments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS b2b_partnership_comments_all ON public.b2b_partnership_comments;
CREATE POLICY b2b_partnership_comments_all
  ON public.b2b_partnership_comments
  FOR ALL
  USING (true)
  WITH CHECK (true);


-- ── Adicionar comentário ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_comment_add(
  p_partnership_id uuid,
  p_author         text,
  p_body           text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_id        uuid;
BEGIN
  IF p_body IS NULL OR length(trim(p_body)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'empty_body');
  END IF;

  -- Verifica que a parceria existe
  PERFORM 1 FROM public.b2b_partnerships
    WHERE id = p_partnership_id AND clinic_id = v_clinic_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  INSERT INTO public.b2b_partnership_comments
    (clinic_id, partnership_id, author_name, body)
  VALUES
    (v_clinic_id, p_partnership_id, NULLIF(trim(COALESCE(p_author,'')),''), trim(p_body))
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;


-- ── Listar comentários da parceria ─────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_comments_list(
  p_partnership_id uuid
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',          id,
      'author_name', author_name,
      'body',        body,
      'created_at',  created_at
    )
    ORDER BY created_at DESC
  ), '[]'::jsonb)
  INTO v_out
  FROM public.b2b_partnership_comments
  WHERE clinic_id = v_clinic_id
    AND partnership_id = p_partnership_id;

  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;


-- ── Remover comentário ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_comment_delete(
  p_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_count     int;
BEGIN
  DELETE FROM public.b2b_partnership_comments
   WHERE id = p_id AND clinic_id = v_clinic_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;


GRANT EXECUTE ON FUNCTION public.b2b_comment_add(uuid, text, text)    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_comments_list(uuid)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_comment_delete(uuid)             TO anon, authenticated, service_role;
