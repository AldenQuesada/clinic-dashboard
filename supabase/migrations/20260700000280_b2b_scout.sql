-- ============================================================
-- Migration: B2B Scout — Fase 2
--
-- Duas tabelas + RPCs pra operar o scout de candidatos:
--   b2b_candidates     — candidatos descobertos, enriquecidos e triagem
--   b2b_scout_usage    — registro de cada chamada (Apify/Claude) com custo real
--
-- Controles embutidos:
--   - Toggle master já vive em b2b_scout_config (da migration 270)
--   - Budget cap mensal checado via b2b_scout_consumed_current_month()
--   - Dedup por nome+endereço ou phone nos últimos N dias
--   - Rate limit 1 varredura/categoria/dia
--
-- Idempotente. SECURITY DEFINER nas RPCs.
-- ============================================================

-- ── 1. Candidatos ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_candidates (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,

  -- Identificação
  category        text NOT NULL,                 -- ex: 'salao_premium', 'endocrino_menopausa'
  tier_target     int  NULL CHECK (tier_target BETWEEN 1 AND 3),
  name            text NOT NULL,
  address         text NULL,
  phone           text NULL,
  whatsapp        text NULL,
  email           text NULL,
  instagram_handle text NULL,
  website         text NULL,

  -- Source
  source          text NOT NULL DEFAULT 'google_maps'
                  CHECK (source IN ('google_maps','instagram','manual','referral')),
  raw_data        jsonb NULL,

  -- Sinal de qualidade (google)
  google_rating       numeric NULL,
  google_reviews      int     NULL,

  -- Enrichment IA (preenchido pelo scout/crawl)
  dna_score          numeric NULL CHECK (dna_score BETWEEN 0 AND 10),
  dna_justification  text NULL,
  fit_reasons        text[] DEFAULT ARRAY[]::text[],
  risk_flags         text[] DEFAULT ARRAY[]::text[],
  approach_message   text NULL,

  -- Triagem
  contact_status  text NOT NULL DEFAULT 'new'
                  CHECK (contact_status IN (
                    'new','approved','approached','responded',
                    'negotiating','signed','declined','archived'
                  )),
  last_contact_at timestamptz NULL,
  notes           text NULL,

  -- Conversao para parceria formal (quando signed)
  partnership_id  uuid NULL REFERENCES public.b2b_partnerships(id) ON DELETE SET NULL,

  -- Audit
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  -- Dedup key (name+phone normalizado ou name+address)
  dedup_key       text GENERATED ALWAYS AS (
    lower(coalesce(name,'') || '|' ||
          coalesce(regexp_replace(phone,'\D','','g'), address, ''))
  ) STORED,
  UNIQUE (clinic_id, dedup_key)
);

CREATE INDEX IF NOT EXISTS idx_b2b_candidates_status
  ON public.b2b_candidates (clinic_id, contact_status, dna_score DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_candidates_category
  ON public.b2b_candidates (clinic_id, category, dna_score DESC);

-- ── 2. Usage (tracking de custo real) ───────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_scout_usage (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  event_type   text NOT NULL CHECK (event_type IN (
                 'google_maps_scan','instagram_enrich','claude_dna','claude_approach'
               )),
  category     text NULL,                -- se aplicavel (scan)
  candidate_id uuid NULL REFERENCES public.b2b_candidates(id) ON DELETE SET NULL,
  cost_brl     numeric NOT NULL,
  meta         jsonb NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_scout_usage_month
  ON public.b2b_scout_usage (clinic_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_scout_usage_candidate
  ON public.b2b_scout_usage (candidate_id) WHERE candidate_id IS NOT NULL;

-- Custo unitário referência (usado em projecao):
COMMENT ON TABLE public.b2b_scout_usage IS
  'Custo real. Referencia: google_maps_scan=0.40, instagram_enrich=0.15, claude_dna=0.08, claude_approach=0.05';

-- ── 3. RLS ──────────────────────────────────────────────────
ALTER TABLE public.b2b_candidates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_scout_usage  ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  EXECUTE 'DROP POLICY IF EXISTS "b2b_candidates_all"  ON public.b2b_candidates';
  EXECUTE 'CREATE POLICY "b2b_candidates_all"  ON public.b2b_candidates  FOR ALL USING (true) WITH CHECK (true)';
  EXECUTE 'DROP POLICY IF EXISTS "b2b_scout_usage_all" ON public.b2b_scout_usage';
  EXECUTE 'CREATE POLICY "b2b_scout_usage_all" ON public.b2b_scout_usage FOR ALL USING (true) WITH CHECK (true)';
END $$;

-- Trigger updated_at (reusa helper da migration 270)
DROP TRIGGER IF EXISTS trg_b2b_candidates_upd ON public.b2b_candidates;
CREATE TRIGGER trg_b2b_candidates_upd
  BEFORE UPDATE ON public.b2b_candidates
  FOR EACH ROW EXECUTE FUNCTION public._b2b_set_updated_at();


-- ═══════════════ RPCs ═══════════════

-- ── Registrar um candidato (insert/upsert por dedup_key) ───
CREATE OR REPLACE FUNCTION public.b2b_candidate_register(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_id        uuid;
BEGIN
  IF p_payload->>'name' IS NULL OR p_payload->>'category' IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_and_category_required');
  END IF;

  INSERT INTO public.b2b_candidates (
    clinic_id, category, tier_target, name,
    address, phone, whatsapp, email, instagram_handle, website,
    source, raw_data, google_rating, google_reviews,
    dna_score, dna_justification, fit_reasons, risk_flags, approach_message
  ) VALUES (
    v_clinic_id,
    p_payload->>'category',
    NULLIF(p_payload->>'tier_target','')::int,
    p_payload->>'name',
    p_payload->>'address', p_payload->>'phone', p_payload->>'whatsapp',
    p_payload->>'email', p_payload->>'instagram_handle', p_payload->>'website',
    COALESCE(p_payload->>'source', 'google_maps'),
    p_payload->'raw_data',
    NULLIF(p_payload->>'google_rating','')::numeric,
    NULLIF(p_payload->>'google_reviews','')::int,
    NULLIF(p_payload->>'dna_score','')::numeric,
    p_payload->>'dna_justification',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'fit_reasons')), ARRAY[]::text[]),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'risk_flags')), ARRAY[]::text[]),
    p_payload->>'approach_message'
  )
  ON CONFLICT (clinic_id, dedup_key) DO UPDATE SET
    -- Só atualiza campos enrichment; mantém triagem que operador já fez
    dna_score         = COALESCE(EXCLUDED.dna_score,         public.b2b_candidates.dna_score),
    dna_justification = COALESCE(EXCLUDED.dna_justification, public.b2b_candidates.dna_justification),
    fit_reasons       = COALESCE(EXCLUDED.fit_reasons,       public.b2b_candidates.fit_reasons),
    risk_flags        = COALESCE(EXCLUDED.risk_flags,        public.b2b_candidates.risk_flags),
    approach_message  = COALESCE(EXCLUDED.approach_message,  public.b2b_candidates.approach_message),
    google_rating     = COALESCE(EXCLUDED.google_rating,     public.b2b_candidates.google_rating),
    google_reviews    = COALESCE(EXCLUDED.google_reviews,    public.b2b_candidates.google_reviews),
    instagram_handle  = COALESCE(EXCLUDED.instagram_handle,  public.b2b_candidates.instagram_handle),
    website           = COALESCE(EXCLUDED.website,           public.b2b_candidates.website),
    raw_data          = COALESCE(EXCLUDED.raw_data,          public.b2b_candidates.raw_data),
    updated_at        = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- ── Listar candidatos (filtros) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_candidate_list(
  p_status    text DEFAULT NULL,
  p_category  text DEFAULT NULL,
  p_min_score numeric DEFAULT NULL,
  p_limit     int DEFAULT 100
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out       jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.dna_score DESC NULLS LAST, c.created_at DESC), '[]'::jsonb)
    INTO v_out
    FROM public.b2b_candidates c
   WHERE c.clinic_id = v_clinic_id
     AND (p_status    IS NULL OR c.contact_status = p_status)
     AND (p_category  IS NULL OR c.category = p_category)
     AND (p_min_score IS NULL OR c.dna_score >= p_min_score)
   ORDER BY c.dna_score DESC NULLS LAST, c.created_at DESC
   LIMIT GREATEST(1, p_limit);
  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;

-- ── Mudar status (triagem) ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_candidate_set_status(
  p_id uuid, p_status text, p_notes text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF p_status NOT IN ('new','approved','approached','responded','negotiating','signed','declined','archived') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;
  UPDATE public.b2b_candidates
     SET contact_status = p_status,
         last_contact_at = CASE WHEN p_status IN ('approached','responded','negotiating') THEN now() ELSE last_contact_at END,
         notes = COALESCE(p_notes, notes),
         updated_at = now()
   WHERE clinic_id = v_clinic_id AND id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── Registrar custo (chamada Apify/Claude) ─────────────────
CREATE OR REPLACE FUNCTION public.b2b_scout_usage_log(
  p_event_type text,
  p_cost_brl   numeric,
  p_category   text DEFAULT NULL,
  p_candidate_id uuid DEFAULT NULL,
  p_meta       jsonb DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_id        uuid;
BEGIN
  INSERT INTO public.b2b_scout_usage (
    clinic_id, event_type, category, candidate_id, cost_brl, meta
  ) VALUES (
    v_clinic_id, p_event_type, p_category, p_candidate_id, p_cost_brl, p_meta
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- ── Consumo do mês atual ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_scout_consumed_current_month()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_month_start date := date_trunc('month', now())::date;
  v_total_brl  numeric := 0;
  v_breakdown  jsonb;
  v_cfg        record;
  v_pct        numeric := 0;
BEGIN
  SELECT COALESCE(SUM(cost_brl), 0) INTO v_total_brl
    FROM public.b2b_scout_usage
   WHERE clinic_id = v_clinic_id AND created_at >= v_month_start;

  SELECT COALESCE(jsonb_object_agg(event_type, sub), '{}'::jsonb) INTO v_breakdown
    FROM (
      SELECT event_type, jsonb_build_object(
               'count', COUNT(*),
               'cost',  ROUND(SUM(cost_brl)::numeric, 2)
             ) AS sub
        FROM public.b2b_scout_usage
       WHERE clinic_id = v_clinic_id AND created_at >= v_month_start
       GROUP BY event_type
    ) t;

  SELECT scout_enabled, budget_cap_monthly, alert_threshold_pct
    INTO v_cfg FROM public.b2b_scout_config WHERE clinic_id = v_clinic_id;

  IF v_cfg.budget_cap_monthly IS NOT NULL AND v_cfg.budget_cap_monthly > 0 THEN
    v_pct := ROUND((v_total_brl / v_cfg.budget_cap_monthly) * 100, 1);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'month_start',      v_month_start,
    'total_brl',        ROUND(v_total_brl::numeric, 2),
    'budget_cap_brl',   COALESCE(v_cfg.budget_cap_monthly, 100),
    'pct_used',         v_pct,
    'alert_threshold',  COALESCE(v_cfg.alert_threshold_pct, 80),
    'scout_enabled',    COALESCE(v_cfg.scout_enabled, false),
    'capped',           v_pct >= 100,
    'breakdown',        v_breakdown
  );
END $$;

-- ── Pode rodar varredura? (toggle + budget + rate limit) ───
CREATE OR REPLACE FUNCTION public.b2b_scout_can_scan(p_category text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_cfg       record;
  v_consumed  jsonb;
  v_today_scans int;
BEGIN
  SELECT scout_enabled, budget_cap_monthly, rate_limit_per_day
    INTO v_cfg FROM public.b2b_scout_config WHERE clinic_id = v_clinic_id;

  IF NOT COALESCE(v_cfg.scout_enabled, false) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'scout_disabled');
  END IF;

  v_consumed := public.b2b_scout_consumed_current_month();
  IF (v_consumed->>'capped')::boolean THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'budget_cap_reached',
                              'consumed', v_consumed);
  END IF;

  SELECT COUNT(*) INTO v_today_scans
    FROM public.b2b_scout_usage
   WHERE clinic_id = v_clinic_id
     AND event_type = 'google_maps_scan'
     AND category = p_category
     AND created_at >= date_trunc('day', now());

  IF v_today_scans >= COALESCE(v_cfg.rate_limit_per_day, 1) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'rate_limit_exceeded');
  END IF;

  RETURN jsonb_build_object('ok', true);
END $$;


-- ── Promover candidato → parceria (status=signed) ──────────
CREATE OR REPLACE FUNCTION public.b2b_candidate_promote(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_cand      record;
  v_slug      text;
  v_upsert    jsonb;
  v_new_id    uuid;
BEGIN
  SELECT * INTO v_cand FROM public.b2b_candidates
   WHERE clinic_id = v_clinic_id AND id = p_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'candidate_not_found');
  END IF;

  -- Slug a partir do nome
  v_slug := lower(regexp_replace(v_cand.name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := regexp_replace(v_slug, '^-+|-+$', '', 'g');

  -- Cria parceria em status 'prospect' (DNA ainda precisa ser validado)
  v_upsert := public.b2b_partnership_upsert(v_slug, jsonb_build_object(
    'name',             v_cand.name,
    'pillar',           'outros',           -- admin ajusta depois
    'category',         v_cand.category,
    'tier',             v_cand.tier_target,
    'type',             'institutional',
    'contact_phone',    COALESCE(v_cand.whatsapp, v_cand.phone),
    'contact_email',    v_cand.email,
    'contact_instagram', v_cand.instagram_handle,
    'contact_website',  v_cand.website,
    'status',           'prospect'
  ));

  IF NOT COALESCE((v_upsert->>'ok')::boolean, false) THEN
    RETURN v_upsert;
  END IF;

  v_new_id := (v_upsert->>'id')::uuid;

  UPDATE public.b2b_candidates
     SET contact_status = 'signed',
         partnership_id = v_new_id,
         last_contact_at = now(),
         updated_at = now()
   WHERE id = p_id;

  RETURN jsonb_build_object('ok', true, 'partnership_id', v_new_id, 'candidate_id', p_id);
END $$;


-- ── Grants ──────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.b2b_candidates, public.b2b_scout_usage
  TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.b2b_candidate_register(jsonb)                        TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_candidate_list(text, text, numeric, int)         TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_candidate_set_status(uuid, text, text)           TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_candidate_promote(uuid)                          TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_scout_usage_log(text, numeric, text, uuid, jsonb) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_scout_consumed_current_month()                    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_scout_can_scan(text)                              TO anon, authenticated, service_role;
