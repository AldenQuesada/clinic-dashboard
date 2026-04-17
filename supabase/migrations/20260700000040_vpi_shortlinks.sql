-- ============================================================
-- Migration: VPI Short-Links - Fase 4 (Entrega 1)
--
-- Objetivo: garantir que todo vpi_partner tenha um short_links
-- apontando pra /public_embaixadora.html?token=<card_token>.
-- Reusa a infra existente (tabela short_links, /r.html?c=<code>).
--
-- Estrategia:
--   1. Trigger AFTER INSERT em vpi_partners cria um short_links
--      row se ainda nao existir com aquele code. Usa code =
--      short_link_slug gerado pelo BEFORE INSERT da migration 30.
--      Dedup via ON CONFLICT nao e possivel (short_links nao tem
--      UNIQUE em code puro, so em (clinic_id,code)), entao usa
--      INSERT ... WHERE NOT EXISTS.
--   2. Trigger AFTER UPDATE sincroniza short_links.url se o
--      card_token mudar (raro mas possivel).
--   3. RPC vpi_partner_ensure_short_link(p_partner_id) - helper
--      idempotente pra backfill e chamada externa (JS).
--   4. Indice sem impacto (short_links.code ja indexed pela PK/
--      unique da clinica).
--
-- Reusa: wa_birthday_track_link_open (ja incrementa clicks).
-- Nao cria coluna nova em vpi_partners (short_link_slug ja existe
-- da migration 30).
--
-- Idempotente: CREATE OR REPLACE, DROP IF EXISTS, IF NOT EXISTS.
-- ============================================================

-- ── 1. Helper: monta a URL do cartao publico ────────────────
CREATE OR REPLACE FUNCTION public._vpi_card_url(p_token text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  -- Base path; a origin (host) sera substituida no JS quando
  -- montar o share link. Aqui armazenamos o path absoluto para
  -- o redirect em r.html resolver.
  SELECT '/public_embaixadora.html?token=' || COALESCE(p_token,'');
$$;

-- ── 2. RPC idempotente: garante short_link pro partner ──────
CREATE OR REPLACE FUNCTION public.vpi_partner_ensure_short_link(
  p_partner_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner  public.vpi_partners%ROWTYPE;
  v_slug     text;
  v_url      text;
  v_existing text;
  v_created  boolean := false;
BEGIN
  SELECT * INTO v_partner FROM public.vpi_partners WHERE id = p_partner_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partner_not_found');
  END IF;

  -- Slug: usa o que ja foi gerado pelo BEFORE INSERT; fallback
  -- reconstroi se por algum motivo estiver nulo (defensivo).
  v_slug := v_partner.short_link_slug;
  IF v_slug IS NULL OR v_slug = '' THEN
    v_slug := 'emb-' || public._vpi_slugify(
      split_part(COALESCE(v_partner.nome,'parceira'),' ',1)
    ) || '-' || substring(COALESCE(v_partner.card_token, encode(gen_random_bytes(6),'hex')), 1, 6);
    UPDATE public.vpi_partners SET short_link_slug = v_slug WHERE id = p_partner_id;
  END IF;

  v_url := public._vpi_card_url(v_partner.card_token);

  -- Verifica se ja existe um short_links com este code na clinica
  SELECT code INTO v_existing
    FROM public.short_links
   WHERE clinic_id = v_partner.clinic_id
     AND code = v_slug
   LIMIT 1;

  IF v_existing IS NULL THEN
    BEGIN
      INSERT INTO public.short_links (clinic_id, code, url, title, pixels)
      VALUES (
        v_partner.clinic_id,
        v_slug,
        v_url,
        'Cartao de Embaixadora - ' || COALESCE(v_partner.nome, ''),
        '{}'::jsonb
      );
      v_created := true;
    EXCEPTION WHEN unique_violation THEN
      -- Concorrencia: outro processo criou entre o SELECT e o INSERT.
      v_created := false;
    END;
  ELSE
    -- Link ja existe; sincroniza URL se mudou (card_token re-gerado
    -- e bem raro, mas garante consistencia).
    UPDATE public.short_links
       SET url = v_url
     WHERE clinic_id = v_partner.clinic_id
       AND code = v_slug
       AND url IS DISTINCT FROM v_url;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'slug', v_slug,
    'url_path', v_url,
    'created', v_created
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_partner_ensure_short_link(uuid) TO authenticated, anon;

-- ── 3. Trigger AFTER INSERT em vpi_partners ─────────────────
-- Gera o short_links automaticamente. Usa AFTER pra garantir
-- que os campos gerados pelo BEFORE (card_token, short_link_slug)
-- ja estejam disponiveis.
CREATE OR REPLACE FUNCTION public._vpi_partner_after_insert_shortlink()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  BEGIN
    PERFORM public.vpi_partner_ensure_short_link(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    -- Isolado: nunca quebra o INSERT principal do partner.
    RAISE WARNING '[vpi_shortlinks] falha ao criar short_link pro partner %: %', NEW.id, SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_partner_after_insert_shortlink ON public.vpi_partners;
CREATE TRIGGER trg_vpi_partner_after_insert_shortlink
  AFTER INSERT ON public.vpi_partners
  FOR EACH ROW EXECUTE FUNCTION public._vpi_partner_after_insert_shortlink();

-- ── 4. Trigger AFTER UPDATE em vpi_partners ─────────────────
-- Se card_token ou short_link_slug mudar, re-sincroniza.
CREATE OR REPLACE FUNCTION public._vpi_partner_after_update_shortlink()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.card_token       IS DISTINCT FROM OLD.card_token
  OR NEW.short_link_slug  IS DISTINCT FROM OLD.short_link_slug THEN
    BEGIN
      PERFORM public.vpi_partner_ensure_short_link(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[vpi_shortlinks] falha no resync pro partner %: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_partner_after_update_shortlink ON public.vpi_partners;
CREATE TRIGGER trg_vpi_partner_after_update_shortlink
  AFTER UPDATE ON public.vpi_partners
  FOR EACH ROW EXECUTE FUNCTION public._vpi_partner_after_update_shortlink();

-- ── 5. Backfill: garante short_link pra todo partner existente ─
DO $$
DECLARE
  r record;
  v_created int := 0;
  v_skipped int := 0;
  v_res jsonb;
BEGIN
  FOR r IN
    SELECT id FROM public.vpi_partners
     WHERE card_token IS NOT NULL
  LOOP
    v_res := public.vpi_partner_ensure_short_link(r.id);
    IF (v_res->>'created')::boolean THEN
      v_created := v_created + 1;
    ELSE
      v_skipped := v_skipped + 1;
    END IF;
  END LOOP;
  RAISE NOTICE '[vpi_shortlinks backfill] created=%, skipped=%', v_created, v_skipped;
END $$;
