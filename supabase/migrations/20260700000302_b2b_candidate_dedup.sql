-- ============================================================
-- Migration: B2B Candidate Fuzzy Dedup — Fraqueza #11
--
-- Adiciona similaridade por nome + match por últimos 8 dígitos
-- de telefone. Tenta pg_trgm/unaccent; cai pra função custom se
-- indisponível.
--
-- Estrutura:
--   _b2b_normalize(text)          — lower + strip acentos via translate
--   b2b_candidates.search_key     — GENERATED (lower+strip)
--   b2b_candidates.phone_digits   — GENERATED (só dígitos)
--   b2b_candidate_find_similar()  — RPC de busca
-- ============================================================

-- 1. Extensão unaccent se disponível (não falha se não puder)
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS unaccent;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[b2b_dedup] unaccent indisponivel: %', SQLERRM;
END $$;

-- 2. Extensão pg_trgm se disponível
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS pg_trgm;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[b2b_dedup] pg_trgm indisponivel: %', SQLERRM;
END $$;


-- 3. Normalizador custom (fallback se unaccent não responder)
--    IMMUTABLE + zero deps externas — serve como base das generated columns.
CREATE OR REPLACE FUNCTION public._b2b_normalize(t text)
RETURNS text
LANGUAGE sql IMMUTABLE STRICT AS $$
  SELECT lower(translate(
    COALESCE(t, ''),
    'ÁÀÂÃÄáàâãäÉÈÊËéèêëÍÌÎÏíìîïÓÒÔÕÖóòôõöÚÙÛÜúùûüÇçÑñ',
    'AAAAAaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuCcNn'
  ));
$$;


-- 4. Colunas geradas em b2b_candidates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='b2b_candidates' AND column_name='search_key'
  ) THEN
    ALTER TABLE public.b2b_candidates
      ADD COLUMN search_key text GENERATED ALWAYS AS (public._b2b_normalize(name)) STORED;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema='public' AND table_name='b2b_candidates' AND column_name='phone_digits'
  ) THEN
    ALTER TABLE public.b2b_candidates
      ADD COLUMN phone_digits text GENERATED ALWAYS AS (regexp_replace(COALESCE(phone,''), '\D', '', 'g')) STORED;
  END IF;
END $$;


-- 5. Index trigram em search_key (se pg_trgm disponível)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname='pg_trgm') THEN
    CREATE INDEX IF NOT EXISTS idx_b2b_candidates_search_key_trgm
      ON public.b2b_candidates USING gin (search_key gin_trgm_ops);
  ELSE
    CREATE INDEX IF NOT EXISTS idx_b2b_candidates_search_key
      ON public.b2b_candidates (search_key);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_b2b_candidates_phone_digits
  ON public.b2b_candidates (phone_digits)
  WHERE phone_digits != '';


-- 6. RPC de busca por similaridade
--    Retorna candidatos com similarity > 0.6 no nome OU últimos 8
--    dígitos do telefone iguais.
CREATE OR REPLACE FUNCTION public.b2b_candidate_find_similar(
  p_name  text,
  p_phone text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id   uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_norm_name   text;
  v_phone_tail  text;
  v_has_trgm    boolean;
  v_out         jsonb;
BEGIN
  v_norm_name := public._b2b_normalize(p_name);
  v_phone_tail := CASE
    WHEN p_phone IS NULL THEN NULL
    ELSE right(regexp_replace(p_phone, '\D', '', 'g'), 8)
  END;

  IF v_phone_tail IS NOT NULL AND length(v_phone_tail) < 8 THEN
    v_phone_tail := NULL;  -- telefone curto demais, não usa
  END IF;

  SELECT EXISTS(SELECT 1 FROM pg_extension WHERE extname='pg_trgm') INTO v_has_trgm;

  IF v_has_trgm THEN
    -- Caminho trigram: similarity() > 0.6 ou phone tail match
    SELECT COALESCE(jsonb_agg(row ORDER BY sim DESC), '[]'::jsonb) INTO v_out
    FROM (
      SELECT jsonb_build_object(
               'id',            c.id,
               'name',          c.name,
               'phone',         c.phone,
               'category',      c.category,
               'status',        c.contact_status,
               'dna_score',     c.dna_score,
               'created_at',    c.created_at,
               'match_reason',
                 CASE
                   WHEN v_phone_tail IS NOT NULL AND c.phone_digits != '' AND right(c.phone_digits, 8) = v_phone_tail
                     THEN 'phone'
                   ELSE 'name'
                 END,
               'similarity',    similarity(c.search_key, v_norm_name)
             ) AS row,
             similarity(c.search_key, v_norm_name) AS sim
        FROM public.b2b_candidates c
       WHERE c.clinic_id = v_clinic_id
         AND length(COALESCE(v_norm_name, '')) >= 3
         AND (
           similarity(c.search_key, v_norm_name) > 0.6
           OR (v_phone_tail IS NOT NULL AND c.phone_digits != '' AND right(c.phone_digits, 8) = v_phone_tail)
         )
       LIMIT 10
    ) s;
  ELSE
    -- Fallback LIKE + phone tail
    SELECT COALESCE(jsonb_agg(row), '[]'::jsonb) INTO v_out
    FROM (
      SELECT jsonb_build_object(
               'id',           c.id,
               'name',         c.name,
               'phone',        c.phone,
               'category',     c.category,
               'status',       c.contact_status,
               'dna_score',    c.dna_score,
               'created_at',   c.created_at,
               'match_reason',
                 CASE
                   WHEN v_phone_tail IS NOT NULL AND c.phone_digits != '' AND right(c.phone_digits, 8) = v_phone_tail
                     THEN 'phone'
                   ELSE 'name'
                 END,
               'similarity',   NULL::numeric
             ) AS row
        FROM public.b2b_candidates c
       WHERE c.clinic_id = v_clinic_id
         AND length(COALESCE(v_norm_name, '')) >= 3
         AND (
           c.search_key LIKE '%' || v_norm_name || '%'
           OR v_norm_name LIKE '%' || c.search_key || '%'
           OR (v_phone_tail IS NOT NULL AND c.phone_digits != '' AND right(c.phone_digits, 8) = v_phone_tail)
         )
       LIMIT 10
    ) s;
  END IF;

  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;


GRANT EXECUTE ON FUNCTION public._b2b_normalize(text)                       TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_candidate_find_similar(text, text)      TO anon, authenticated, service_role;
