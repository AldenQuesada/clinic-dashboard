-- ============================================================
-- Migration: Growth Content Opportunities [s2-5 plano growth]
--
-- Agregador de oportunidades de conteudo pra Instagram.
-- Consolida depoimentos NPS consentidos + VPI celebrations
-- consentidas + tier upgrades recentes em uma unica lista
-- ordenavel pro admin copiar copy e marcar como postado.
--
-- Componentes:
--   1) Coluna nps_responses.instagram_posted_at
--   2) Coluna nps_responses.instagram_url
--   3) Coluna vpi_partners.tier_upgrade_posted_at (tracking de
--      post de tier upgrade diamante/ouro)
--   4) RPC growth_content_opportunities(period_days, limit) — lista
--   5) RPC growth_content_mark_posted(type, source_id, url) — marca
--
-- Idempotente. Graceful degrade se tabelas ausentes.
-- ============================================================

-- ── 1. Colunas tracking em nps_responses ────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='nps_responses') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='nps_responses' AND column_name='instagram_posted_at') THEN
      ALTER TABLE public.nps_responses ADD COLUMN instagram_posted_at timestamptz;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='nps_responses' AND column_name='instagram_url') THEN
      ALTER TABLE public.nps_responses ADD COLUMN instagram_url text;
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[growth_content] nps_responses schema update skipped: %', SQLERRM;
END $$;

-- ── 2. Coluna em vpi_partners pra tier upgrade post tracking ─
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='vpi_partners') THEN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema='public' AND table_name='vpi_partners' AND column_name='tier_upgrade_posted_at') THEN
      ALTER TABLE public.vpi_partners ADD COLUMN tier_upgrade_posted_at timestamptz;
    END IF;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[growth_content] vpi_partners schema update skipped: %', SQLERRM;
END $$;

-- ── 3. RPC: lista de oportunidades ──────────────────────────
-- Fontes agregadas:
--   A) NPS testimonials consentidos (testimonial_consent=true) sem post
--   B) VPI celebrations consentidas sem posted_at
--   C) Parceiras que subiram pra ouro/diamante sem post de tier ainda
CREATE OR REPLACE FUNCTION public.growth_content_opportunities(
  p_period_days int DEFAULT 60,
  p_limit       int DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_since timestamptz;
  v_out jsonb;
BEGIN
  v_since := now() - (GREATEST(1, p_period_days) || ' days')::interval;

  WITH all_opps AS (
    -- ── A) NPS testimonials consentidos ────────────────────
    SELECT
      'nps_testimonial'::text              AS type,
      r.id::text                            AS source_id,
      COALESCE(r.testimonial_consent_at, r.created_at) AS sort_at,
      r.score                               AS score,
      COALESCE(l.name, '')                  AS person_name,
      COALESCE(r.testimonial_text, '')      AS testimonial_text,
      COALESCE(r.testimonial_photo_url, '') AS photo_url,
      CASE WHEN r.score >= 10 THEN 'Nota 10'
           WHEN r.score >= 9  THEN 'Nota ' || r.score
           ELSE 'Depoimento'
      END                                   AS tag,
      (r.instagram_posted_at IS NOT NULL)   AS posted
    FROM public.nps_responses r
    LEFT JOIN public.clinic_leads l ON l.id = r.lead_id
    WHERE r.clinic_id = v_clinic_id
      AND r.testimonial_consent = true
      AND COALESCE(r.testimonial_consent_at, r.created_at) >= v_since
      AND r.instagram_posted_at IS NULL

    UNION ALL

    -- ── B) VPI celebrations consentidas ────────────────────
    SELECT
      'vpi_celebration'::text               AS type,
      c.id::text                            AS source_id,
      COALESCE(c.consent_granted_at, c.reacted_at) AS sort_at,
      NULL::int                             AS score,
      COALESCE(p.nome, '')                  AS person_name,
      COALESCE(c.context_text, '')          AS testimonial_text,
      NULL::text                            AS photo_url,
      'Embaixadora VPI reagiu'              AS tag,
      (c.posted_at IS NOT NULL)             AS posted
    FROM public.vpi_celebrations c
    LEFT JOIN public.vpi_partners p ON p.id = c.partner_id
    WHERE c.clinic_id = v_clinic_id
      AND c.consent_story = true
      AND COALESCE(c.consent_granted_at, c.reacted_at) >= v_since
      AND c.posted_at IS NULL

    UNION ALL

    -- ── C) Tier upgrades pra ouro/diamante ─────────────────
    SELECT
      'tier_upgrade'::text                  AS type,
      p.id::text                            AS source_id,
      p.updated_at                          AS sort_at,
      NULL::int                             AS score,
      COALESCE(p.nome, '')                  AS person_name,
      'Nova ' || COALESCE(p.tier_atual, 'parceira') AS testimonial_text,
      NULL::text                            AS photo_url,
      initcap(COALESCE(p.tier_atual, ''))   AS tag,
      (p.tier_upgrade_posted_at IS NOT NULL) AS posted
    FROM public.vpi_partners p
    WHERE p.clinic_id = v_clinic_id
      AND p.tier_atual IN ('ouro', 'diamante')
      AND p.updated_at >= v_since
      AND p.tier_upgrade_posted_at IS NULL
      AND p.status = 'ativo'
  )
  SELECT COALESCE(jsonb_agg(row_to_json(o.*) ORDER BY o.sort_at DESC), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT * FROM all_opps WHERE posted = false
      LIMIT GREATEST(1, p_limit)
    ) o;

  RETURN jsonb_build_object(
    'ok',              true,
    'period_days',     GREATEST(1, p_period_days),
    'since',           v_since,
    'opportunities',   COALESCE(v_out, '[]'::jsonb),
    'total',           jsonb_array_length(COALESCE(v_out, '[]'::jsonb))
  );
EXCEPTION
  WHEN undefined_table THEN
    RAISE NOTICE '[growth_content_opportunities] tabela ausente: %', SQLERRM;
    RETURN jsonb_build_object('ok', false, 'error', 'table_missing', 'detail', SQLERRM);
END $$;
GRANT EXECUTE ON FUNCTION public.growth_content_opportunities(int, int) TO authenticated;

-- ── 4. RPC: marcar como postado ─────────────────────────────
CREATE OR REPLACE FUNCTION public.growth_content_mark_posted(
  p_type       text,
  p_source_id  text,
  p_url        text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_rows int := 0;
BEGIN
  IF p_type IS NULL OR p_source_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missing_params');
  END IF;

  IF p_type = 'nps_testimonial' THEN
    UPDATE public.nps_responses
       SET instagram_posted_at = now(),
           instagram_url = p_url
     WHERE id = p_source_id::uuid
       AND clinic_id = v_clinic_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  ELSIF p_type = 'vpi_celebration' THEN
    UPDATE public.vpi_celebrations
       SET posted_at = now()
     WHERE id = p_source_id::uuid
       AND clinic_id = v_clinic_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  ELSIF p_type = 'tier_upgrade' THEN
    UPDATE public.vpi_partners
       SET tier_upgrade_posted_at = now()
     WHERE id = p_source_id::uuid
       AND clinic_id = v_clinic_id;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'unknown_type');
  END IF;

  RETURN jsonb_build_object('ok', v_rows > 0, 'rows', v_rows, 'type', p_type);
EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'error', 'exception', 'detail', SQLERRM);
END $$;
GRANT EXECUTE ON FUNCTION public.growth_content_mark_posted(text, text, text) TO authenticated;

-- ── Sanity ──────────────────────────────────────────────────
DO $$
DECLARE v_fn int;
BEGIN
  SELECT count(*) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('growth_content_opportunities','growth_content_mark_posted');
  RAISE NOTICE '[growth_content] fns=%', v_fn;
END $$;
