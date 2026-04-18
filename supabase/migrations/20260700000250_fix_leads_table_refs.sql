-- ============================================================
-- Hotfix: trocar public.clinic_leads -> public.leads
--
-- Bug descoberto 2026-04-18: RPCs das migrations 190, 200, 230
-- referenciam `public.clinic_leads` que nao existe. Tabela real
-- eh `public.leads`. O EXCEPTION handler em 200 mascarou como
-- "table_missing" no dashboard Oportunidades IG.
--
-- Corrige:
--   - growth_content_opportunities (migration 200)
--   - nps_testimonials_consented   (migration 190, estendida em 230)
-- ============================================================

-- ── Fix growth_content_opportunities ─────────────────────────
CREATE OR REPLACE FUNCTION public.growth_content_opportunities(
  p_period_days int DEFAULT 30,
  p_limit       int DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_since     timestamptz;
  v_out       jsonb;
BEGIN
  v_since := now() - (GREATEST(1, p_period_days) || ' days')::interval;

  WITH all_opps AS (
    -- ── A) Depoimentos NPS consentidos ───────────────────────
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
    LEFT JOIN public.leads l ON l.id = r.lead_id
    WHERE r.clinic_id = v_clinic_id
      AND r.testimonial_consent = true
      AND COALESCE(r.testimonial_consent_at, r.created_at) >= v_since
      AND r.instagram_posted_at IS NULL

    UNION ALL

    -- ── B) VPI celebrations consentidas ──────────────────────
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

    -- ── C) Tier upgrades pra ouro/diamante ───────────────────
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

GRANT EXECUTE ON FUNCTION public.growth_content_opportunities(int, int)
  TO authenticated, service_role, anon;

-- ── Fix nps_testimonials_consented ───────────────────────────
CREATE OR REPLACE FUNCTION public.nps_testimonials_consented(
  p_limit int DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(q.*) ORDER BY q.created_at DESC), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT r.id, r.appt_id, r.lead_id, r.phone_suffix, r.score,
             r.testimonial_text, r.testimonial_photo_url,
             r.testimonial_consent_at, r.created_at,
             r.magazine_page_id,
             l.name AS lead_name
        FROM public.nps_responses r
        LEFT JOIN public.leads l ON l.id = r.lead_id
       WHERE r.clinic_id = v_clinic_id
         AND r.testimonial_consent = true
       ORDER BY r.testimonial_consent_at DESC NULLS LAST, r.created_at DESC
       LIMIT GREATEST(1, p_limit)
    ) q;

  RETURN COALESCE(v_out, '[]'::jsonb);
EXCEPTION
  WHEN undefined_table THEN
    RETURN '[]'::jsonb;
END $$;

GRANT EXECUTE ON FUNCTION public.nps_testimonials_consented(int)
  TO anon, authenticated, service_role;
