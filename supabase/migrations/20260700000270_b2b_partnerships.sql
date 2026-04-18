-- ============================================================
-- Migration: B2B Partnerships — Fase 1 Fundação
--
-- Fonte: plano-b2b.html (Círculo Mirian de Paula)
--
-- Taxonomia de parcerias (3 tipos fundamentalmente diferentes):
--   transactional → voucher por compra (Cazza Flor, Dom Novilho)
--   occasion      → voucher por evento agendado (Moinho, Osvaldo)
--   institutional → contrato anual + publico cativo (Mentora, Academia, Mormaii)
--
-- Arquitetura modular por tabela (zero cruzamento com growth/vpi):
--   b2b_partnerships              — ficha principal
--   b2b_partnership_targets       — metas operacionais (KPIs cadenciados)
--   b2b_partnership_events        — eventos sazonais/recorrentes por parceria
--   b2b_partnership_content       — playbook de conteudo (ganchos, carrosseis)
--   b2b_monthly_targets           — meta mensal da CLINICA (novas parcerias/mes)
--   b2b_scout_config              — toggle + budget do scout (uma linha singleton)
--
-- Idempotente. RLS permissiva (alinha convencao do projeto).
-- SECURITY DEFINER nas RPCs.
-- ============================================================

-- ── 1. Tabela principal ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_partnerships (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,

  -- Identidade
  name           text NOT NULL,
  slug           text NOT NULL,
  pillar         text NOT NULL,           -- imagem | evento | institucional | fitness | alimentacao | saude | status | rede
  category       text NULL,               -- sub-pilar (ex: 'joalheria', 'fotografo_casamento')
  tier           int  NULL CHECK (tier BETWEEN 1 AND 3),

  -- Tipo (discriminador)
  type           text NOT NULL CHECK (type IN ('transactional','occasion','institutional')),

  -- DNA / gate de entrada
  dna_excelencia int  NULL CHECK (dna_excelencia BETWEEN 1 AND 10),
  dna_estetica   int  NULL CHECK (dna_estetica BETWEEN 1 AND 10),
  dna_proposito  int  NULL CHECK (dna_proposito BETWEEN 1 AND 10),
  dna_score      numeric GENERATED ALWAYS AS (
    (COALESCE(dna_excelencia,0) + COALESCE(dna_estetica,0) + COALESCE(dna_proposito,0))::numeric / 3
  ) STORED,

  -- Contato do parceiro
  contact_name       text NULL,
  contact_phone      text NULL,
  contact_email      text NULL,
  contact_instagram  text NULL,
  contact_website    text NULL,

  -- Voucher
  voucher_combo           text NULL,            -- ex: 'veu_noiva+anovator'
  voucher_validity_days   int  NULL DEFAULT 30,
  voucher_min_notice_days int  NULL DEFAULT 15,
  voucher_monthly_cap     int  NULL,            -- ex: 4 procedimentos/mes
  voucher_delivery        text[] DEFAULT ARRAY['digital'],  -- digital, print, gamified, etc

  -- Contrapartida do parceiro
  contrapartida           text[] DEFAULT ARRAY[]::text[],  -- ex: ['foto_video_mensal','mentoria_mirian']
  contrapartida_cadence   text NULL,            -- 'monthly' | 'quarterly' | 'ad_hoc'

  -- Valuation / vigencia
  monthly_value_cap_brl   numeric NULL,         -- teto financeiro da permuta
  contract_duration_months int NULL,
  review_cadence_months   int  NULL DEFAULT 3,
  sazonais                text[] DEFAULT ARRAY[]::text[],  -- ex: ['dia_das_maes','natal','bf']

  -- Copy / storytelling
  slogans                 text[] DEFAULT ARRAY[]::text[],
  narrative_quote         text NULL,
  narrative_author        text NULL,
  emotional_trigger       text NULL,            -- ex: 'quando o Osvaldo diz pode beijar a noiva'

  -- Profissionais envolvidos na entrega (lado clinica)
  involved_professionals  text[] DEFAULT ARRAY['mirian'],

  -- Lifecycle
  status        text NOT NULL DEFAULT 'prospect'
                CHECK (status IN ('prospect','dna_check','contract','active','review','paused','closed')),
  status_reason text NULL,

  -- Health (derivado, atualizado via trigger/cron posteriormente)
  health_color  text DEFAULT 'unknown' CHECK (health_color IN ('unknown','green','yellow','red')),

  -- Audit
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  created_by    text NULL,

  UNIQUE (clinic_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_b2b_partnerships_status
  ON public.b2b_partnerships (clinic_id, status) WHERE status IN ('active','review');
CREATE INDEX IF NOT EXISTS idx_b2b_partnerships_pillar
  ON public.b2b_partnerships (clinic_id, pillar);
CREATE INDEX IF NOT EXISTS idx_b2b_partnerships_tier
  ON public.b2b_partnerships (clinic_id, tier);


-- ── 2. Metas operacionais (KPIs por parceria) ───────────────
CREATE TABLE IF NOT EXISTS public.b2b_partnership_targets (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  indicator      text NOT NULL,            -- ex: 'Avaliacoes A51', 'Reels co-criados'
  target_value   numeric NOT NULL,
  cadence        text NOT NULL,            -- 'weekly' | 'monthly' | 'quarterly'
  horizon_days   int NULL DEFAULT 60,
  benefit_label  text NULL,                -- ex: 'Leads qualificados'
  sort_order     int DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_targets_partnership
  ON public.b2b_partnership_targets (partnership_id, sort_order);


-- ── 3. Eventos (sazonais + recorrentes) ─────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_partnership_events (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  event_type     text NOT NULL CHECK (event_type IN ('sazonal','recorrente','pontual')),
  title          text NOT NULL,
  description    text NULL,
  date_or_cadence text NOT NULL,           -- ex: '2026-10-25' ou 'monthly:1st_friday'
  format         text NULL,                -- ex: 'palestra+demo'
  deliverables   text[] DEFAULT ARRAY[]::text[],
  next_occurrence timestamptz NULL,
  status         text DEFAULT 'planned' CHECK (status IN ('planned','done','cancelled')),
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_events_partnership
  ON public.b2b_partnership_events (partnership_id, next_occurrence);


-- ── 4. Content playbook ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_partnership_content (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  partnership_id uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  kind           text NOT NULL CHECK (kind IN ('gancho','carrossel_slides','legenda_template','reel_roteiro')),
  label          text NULL,
  content        text NOT NULL,
  meta           jsonb NULL,
  sort_order     int DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_content_partnership
  ON public.b2b_partnership_content (partnership_id, kind, sort_order);


-- ── 5. Meta mensal da clínica (novas parcerias/mes) ─────────
CREATE TABLE IF NOT EXISTS public.b2b_monthly_targets (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  month         date NOT NULL,                  -- primeiro dia do mes
  target_count  int  NOT NULL DEFAULT 2,
  actual_count  int  NOT NULL DEFAULT 0,
  tier_focus    int[]  DEFAULT ARRAY[1]::int[],
  status        text DEFAULT 'active' CHECK (status IN ('active','achieved','missed','archived')),
  notes         text NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, month)
);

CREATE INDEX IF NOT EXISTS idx_b2b_monthly_targets_month
  ON public.b2b_monthly_targets (clinic_id, month DESC);


-- ── 6. Scout config (singleton por clinica) ─────────────────
CREATE TABLE IF NOT EXISTS public.b2b_scout_config (
  clinic_id           uuid PRIMARY KEY DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  scout_enabled       boolean NOT NULL DEFAULT false,      -- toggle master
  budget_cap_monthly  numeric NOT NULL DEFAULT 100,        -- R$ 100/mes default
  alert_threshold_pct int NOT NULL DEFAULT 80,
  dedup_window_days   int NOT NULL DEFAULT 90,
  rate_limit_per_day  int NOT NULL DEFAULT 1,
  updated_at          timestamptz NOT NULL DEFAULT now(),
  updated_by          text NULL
);

-- Seed inicial do config (se não existir)
INSERT INTO public.b2b_scout_config (clinic_id, scout_enabled, budget_cap_monthly)
VALUES ('00000000-0000-0000-0000-000000000001'::uuid, false, 100)
ON CONFLICT (clinic_id) DO NOTHING;


-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.b2b_partnerships              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_partnership_targets       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_partnership_events        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_partnership_content       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_monthly_targets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.b2b_scout_config              ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'b2b_partnerships','b2b_partnership_targets','b2b_partnership_events',
    'b2b_partnership_content','b2b_monthly_targets','b2b_scout_config'
  ]) LOOP
    EXECUTE format('DROP POLICY IF EXISTS "%s_all" ON public.%s', t, t);
    EXECUTE format('CREATE POLICY "%s_all" ON public.%s FOR ALL USING (true) WITH CHECK (true)', t, t);
  END LOOP;
END $$;


-- ── Trigger updated_at ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public._b2b_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_b2b_partnerships_upd ON public.b2b_partnerships;
CREATE TRIGGER trg_b2b_partnerships_upd
  BEFORE UPDATE ON public.b2b_partnerships
  FOR EACH ROW EXECUTE FUNCTION public._b2b_set_updated_at();

DROP TRIGGER IF EXISTS trg_b2b_monthly_targets_upd ON public.b2b_monthly_targets;
CREATE TRIGGER trg_b2b_monthly_targets_upd
  BEFORE UPDATE ON public.b2b_monthly_targets
  FOR EACH ROW EXECUTE FUNCTION public._b2b_set_updated_at();


-- ═══════════════ RPCs BASE ═══════════════

-- ── Criar/atualizar parceria ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_partnership_upsert(
  p_slug     text,
  p_payload  jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_id        uuid;
BEGIN
  IF p_slug IS NULL OR length(trim(p_slug)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'slug_empty');
  END IF;

  INSERT INTO public.b2b_partnerships (
    clinic_id, slug, name, pillar, category, tier, type,
    dna_excelencia, dna_estetica, dna_proposito,
    contact_name, contact_phone, contact_email, contact_instagram, contact_website,
    voucher_combo, voucher_validity_days, voucher_min_notice_days, voucher_monthly_cap, voucher_delivery,
    contrapartida, contrapartida_cadence,
    monthly_value_cap_brl, contract_duration_months, review_cadence_months, sazonais,
    slogans, narrative_quote, narrative_author, emotional_trigger,
    involved_professionals, status, created_by
  ) VALUES (
    v_clinic_id,
    p_slug,
    p_payload->>'name',
    COALESCE(p_payload->>'pillar', 'outros'),
    p_payload->>'category',
    NULLIF(p_payload->>'tier','')::int,
    COALESCE(p_payload->>'type', 'institutional'),
    NULLIF(p_payload->>'dna_excelencia','')::int,
    NULLIF(p_payload->>'dna_estetica','')::int,
    NULLIF(p_payload->>'dna_proposito','')::int,
    p_payload->>'contact_name', p_payload->>'contact_phone', p_payload->>'contact_email',
    p_payload->>'contact_instagram', p_payload->>'contact_website',
    p_payload->>'voucher_combo',
    COALESCE(NULLIF(p_payload->>'voucher_validity_days','')::int, 30),
    COALESCE(NULLIF(p_payload->>'voucher_min_notice_days','')::int, 15),
    NULLIF(p_payload->>'voucher_monthly_cap','')::int,
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'voucher_delivery')), ARRAY['digital']),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'contrapartida')), ARRAY[]::text[]),
    p_payload->>'contrapartida_cadence',
    NULLIF(p_payload->>'monthly_value_cap_brl','')::numeric,
    NULLIF(p_payload->>'contract_duration_months','')::int,
    COALESCE(NULLIF(p_payload->>'review_cadence_months','')::int, 3),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'sazonais')), ARRAY[]::text[]),
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'slogans')), ARRAY[]::text[]),
    p_payload->>'narrative_quote',
    p_payload->>'narrative_author',
    p_payload->>'emotional_trigger',
    COALESCE(ARRAY(SELECT jsonb_array_elements_text(p_payload->'involved_professionals')), ARRAY['mirian']),
    COALESCE(p_payload->>'status','prospect'),
    p_payload->>'created_by'
  )
  ON CONFLICT (clinic_id, slug) DO UPDATE SET
    name = EXCLUDED.name,
    pillar = EXCLUDED.pillar,
    category = EXCLUDED.category,
    tier = EXCLUDED.tier,
    type = EXCLUDED.type,
    dna_excelencia = EXCLUDED.dna_excelencia,
    dna_estetica = EXCLUDED.dna_estetica,
    dna_proposito = EXCLUDED.dna_proposito,
    contact_name = EXCLUDED.contact_name,
    contact_phone = EXCLUDED.contact_phone,
    contact_email = EXCLUDED.contact_email,
    contact_instagram = EXCLUDED.contact_instagram,
    contact_website = EXCLUDED.contact_website,
    voucher_combo = EXCLUDED.voucher_combo,
    voucher_validity_days = EXCLUDED.voucher_validity_days,
    voucher_min_notice_days = EXCLUDED.voucher_min_notice_days,
    voucher_monthly_cap = EXCLUDED.voucher_monthly_cap,
    voucher_delivery = EXCLUDED.voucher_delivery,
    contrapartida = EXCLUDED.contrapartida,
    contrapartida_cadence = EXCLUDED.contrapartida_cadence,
    monthly_value_cap_brl = EXCLUDED.monthly_value_cap_brl,
    contract_duration_months = EXCLUDED.contract_duration_months,
    review_cadence_months = EXCLUDED.review_cadence_months,
    sazonais = EXCLUDED.sazonais,
    slogans = EXCLUDED.slogans,
    narrative_quote = EXCLUDED.narrative_quote,
    narrative_author = EXCLUDED.narrative_author,
    emotional_trigger = EXCLUDED.emotional_trigger,
    involved_professionals = EXCLUDED.involved_professionals,
    status = EXCLUDED.status,
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'slug', p_slug);
END $$;

-- ── Listar parcerias ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_partnership_list(
  p_status text DEFAULT NULL,
  p_tier   int  DEFAULT NULL,
  p_pillar text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(p) ORDER BY p.tier NULLS LAST, p.created_at DESC), '[]'::jsonb)
    INTO v_out
    FROM public.b2b_partnerships p
   WHERE p.clinic_id = v_clinic_id
     AND (p_status IS NULL OR p.status = p_status)
     AND (p_tier   IS NULL OR p.tier = p_tier)
     AND (p_pillar IS NULL OR p.pillar = p_pillar);
  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;

-- ── Detalhe (com relacionados) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_partnership_get(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_part jsonb; v_targets jsonb; v_events jsonb; v_content jsonb;
BEGIN
  SELECT to_jsonb(p) INTO v_part FROM public.b2b_partnerships p
   WHERE p.clinic_id = v_clinic_id AND p.id = p_id;

  IF v_part IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  SELECT COALESCE(jsonb_agg(to_jsonb(t) ORDER BY t.sort_order), '[]'::jsonb) INTO v_targets
    FROM public.b2b_partnership_targets t WHERE t.partnership_id = p_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.next_occurrence NULLS LAST), '[]'::jsonb) INTO v_events
    FROM public.b2b_partnership_events e WHERE e.partnership_id = p_id;

  SELECT COALESCE(jsonb_agg(to_jsonb(c) ORDER BY c.kind, c.sort_order), '[]'::jsonb) INTO v_content
    FROM public.b2b_partnership_content c WHERE c.partnership_id = p_id;

  RETURN jsonb_build_object(
    'ok', true,
    'partnership', v_part,
    'targets',     v_targets,
    'events',      v_events,
    'content',     v_content
  );
END $$;

-- ── Mudar status (lifecycle) ────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_partnership_set_status(
  p_id uuid, p_status text, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  IF p_status NOT IN ('prospect','dna_check','contract','active','review','paused','closed') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_status');
  END IF;
  UPDATE public.b2b_partnerships
     SET status = p_status, status_reason = p_reason, updated_at = now()
   WHERE clinic_id = v_clinic_id AND id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── Scout config: read + toggle ─────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_scout_config_get()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT to_jsonb(c) INTO v_out FROM public.b2b_scout_config c WHERE c.clinic_id = v_clinic_id;
  RETURN COALESCE(v_out, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.b2b_scout_config_update(p_payload jsonb, p_user text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  UPDATE public.b2b_scout_config SET
    scout_enabled       = COALESCE((p_payload->>'scout_enabled')::boolean, scout_enabled),
    budget_cap_monthly  = COALESCE((p_payload->>'budget_cap_monthly')::numeric, budget_cap_monthly),
    alert_threshold_pct = COALESCE((p_payload->>'alert_threshold_pct')::int, alert_threshold_pct),
    dedup_window_days   = COALESCE((p_payload->>'dedup_window_days')::int, dedup_window_days),
    rate_limit_per_day  = COALESCE((p_payload->>'rate_limit_per_day')::int, rate_limit_per_day),
    updated_at = now(),
    updated_by = p_user
  WHERE clinic_id = v_clinic_id;
  RETURN public.b2b_scout_config_get();
END $$;

-- ── Meta mensal: read/upsert ────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_monthly_target_get(p_month date DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_m date := COALESCE(p_month, date_trunc('month', now())::date);
  v_out jsonb;
BEGIN
  SELECT to_jsonb(t) INTO v_out FROM public.b2b_monthly_targets t
   WHERE t.clinic_id = v_clinic_id AND t.month = v_m;
  RETURN COALESCE(v_out, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.b2b_monthly_target_set(
  p_month date, p_target_count int, p_tier_focus int[] DEFAULT ARRAY[1]::int[]
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  INSERT INTO public.b2b_monthly_targets (clinic_id, month, target_count, tier_focus)
  VALUES (v_clinic_id, p_month, p_target_count, p_tier_focus)
  ON CONFLICT (clinic_id, month) DO UPDATE SET
    target_count = EXCLUDED.target_count,
    tier_focus   = EXCLUDED.tier_focus,
    updated_at   = now();
  RETURN public.b2b_monthly_target_get(p_month);
END $$;

-- ── Grants ──────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.b2b_partnerships, public.b2b_partnership_targets, public.b2b_partnership_events,
  public.b2b_partnership_content, public.b2b_monthly_targets, public.b2b_scout_config
  TO anon, authenticated, service_role;

GRANT EXECUTE ON FUNCTION public.b2b_partnership_upsert(text, jsonb)    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_partnership_list(text, int, text)  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_partnership_get(uuid)              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_partnership_set_status(uuid, text, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_scout_config_get()                 TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_scout_config_update(jsonb, text)   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_monthly_target_get(date)           TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_monthly_target_set(date, int, int[]) TO anon, authenticated, service_role;
