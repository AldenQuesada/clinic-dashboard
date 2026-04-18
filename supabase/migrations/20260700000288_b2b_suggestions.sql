-- ============================================================
-- Migration: B2B Suggestions — Fase 3.1
--
-- Tabela b2b_plan_categories com as 24 categorias priorizadas do
-- plano (Tier 1/2/3) — source of truth das metas de cobertura.
-- RPC b2b_suggestions_snapshot() cruza com parcerias/candidatos
-- existentes e retorna gaps em 3 estados: green/yellow/red.
--
--   green  = tem >=1 parceria ativa/contrato/review na categoria
--   yellow = sem parceria, mas tem >=1 candidato ativo em triagem
--   red    = vazio — nenhuma parceria nem candidato
--
-- Idempotente. Seed dos 24 items na primeira execução.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.b2b_plan_categories (
  slug         text PRIMARY KEY,
  label        text NOT NULL,
  pillar       text NOT NULL,
  tier         int  NOT NULL CHECK (tier BETWEEN 1 AND 3),
  priority     int  NOT NULL DEFAULT 0,       -- ordem dentro do tier (maior = +prioritario)
  suggested_query text NULL,                   -- query padrão pro scout
  notes        text NULL,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.b2b_plan_categories ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_plan_categories_all" ON public.b2b_plan_categories;
CREATE POLICY "b2b_plan_categories_all" ON public.b2b_plan_categories FOR ALL USING (true) WITH CHECK (true);


-- ── Seed do plano (24 categorias priorizadas) ──────────────
INSERT INTO public.b2b_plan_categories (slug, label, pillar, tier, priority, suggested_query, notes) VALUES
  -- Tier 1 · abrir agora, ROI rápido
  ('salao_premium',         'Salão / cabeleireiro premium',         'imagem',        1, 100, 'salão de beleza premium', 'Frequência mensal, mesmo target'),
  ('endocrino_menopausa',   'Endócrino de menopausa',                'saude',         1,  98, 'endocrinologista menopausa', 'Dor ativa 45+, zero competição'),
  ('acim_confraria',        'ACIM / Confraria / 40+ / Lide Feminino','rede',          1,  96, 'associação comercial mulheres empreendedoras', 'Alavancagem B2B2B2C'),
  ('fotografo_casamento',   'Fotógrafo de casamento',                'evento',        1,  94, 'fotógrafo de casamento', 'Fecha triângulo Moinho+Osvaldo'),
  ('joalheria',             'Joalheria (1 só)',                      'status',        1,  92, 'joalheria alta joalheria', 'Ocasião + imagem'),
  ('perfumaria_nicho',      'Perfumaria de nicho',                   'imagem',        1,  90, 'perfumaria importados nicho', 'Extensão da assinatura pessoal'),
  ('psicologia_40plus',     'Psicologia / coaching 40+',             'saude',         1,  88, 'psicologia feminina coaching', 'Destrava camada emocional'),
  ('ortomolecular',         'Ortomolecular / medicina integrativa',  'saude',         1,  86, 'medicina ortomolecular integrativa', 'Completa o rejuvenescimento integral'),
  -- Tier 2 · abrir em 60-90 dias
  ('nutri_funcional',       'Nutricionista funcional',               'saude',         2,  80, 'nutricionista funcional', 'Par com endócrino'),
  ('otica_premium',         'Ótica premium (1 só)',                  'status',        2,  78, 'ótica premium grifes', 'Target usa'),
  ('vet_boutique',          'Veterinário boutique',                  'outros',        2,  76, 'veterinário boutique', 'Lifestyle marker'),
  ('fotografo_familia',     'Fotógrafo família / retrato',           'evento',        2,  74, 'fotógrafo família retrato', 'Pós-procedimento'),
  ('atelier_noiva',         'Atelier de vestido de noiva',           'evento',        2,  72, 'atelier vestido de noiva', 'Par com Moinho+Osvaldo'),
  ('farmacia_manipulacao',  'Farmácia de manipulação premium',       'saude',         2,  70, 'farmácia de manipulação dermatológica', 'Fórmula exclusiva Mirian'),
  ('floricultura_assinatura','Floricultura com assinatura mensal',   'evento',        2,  68, 'floricultura boutique', 'Presente recorrente'),
  ('personal_stylist',      'Personal stylist / organizer de closet','imagem',        2,  66, 'personal stylist', 'Par com Cazza Flor'),
  ('spa_wellness',          'SPA day / wellness destination',        'fitness',       2,  64, 'spa day wellness', 'Prepara e recupera'),
  -- Tier 3 · manter latente
  ('concessionaria',        'Concessionária alto padrão (1 só)',     'status',        3,  50, 'concessionaria audi mercedes', 'Rotacionar semestral'),
  ('imoveis_alto_padrao',   'Imóveis alto padrão',                   'status',        3,  48, 'corretor imóveis alto padrão', 'LTV absurdo'),
  ('viagem_boutique',       'Agência de viagem boutique',            'outros',        3,  46, 'agência viagem boutique', 'Ocasião + foto'),
  ('gestor_patrimonial',    'Gestor patrimonial / private',          'rede',          3,  44, 'private banking gestor patrimonial', 'Canal raro'),
  ('vinhos_sommelier',      'Clube de vinhos / sommelier',           'alimentacao',   3,  42, 'clube vinhos sommelier', 'Momento social premium'),
  ('galeria_arte',          'Galeria de arte / curadoria',           'rede',          3,  40, 'galeria arte contemporânea', 'Refinamento intelectual'),
  ('doceria_presentes',     'Doceria premium / casa de presentes',   'alimentacao',   3,  38, 'doceria artesanal premium', 'Presente de ocasião')
ON CONFLICT (slug) DO UPDATE SET
  label    = EXCLUDED.label,
  pillar   = EXCLUDED.pillar,
  tier     = EXCLUDED.tier,
  priority = EXCLUDED.priority,
  suggested_query = EXCLUDED.suggested_query,
  notes    = EXCLUDED.notes;


-- ── RPC: snapshot de gaps ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_suggestions_snapshot()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out       jsonb;
BEGIN
  WITH cat AS (
    SELECT slug, label, pillar, tier, priority, suggested_query, notes
      FROM public.b2b_plan_categories
     WHERE is_active = true
  ),
  parts AS (
    SELECT category, COUNT(*)::int AS total_parts,
           COUNT(*) FILTER (WHERE status IN ('active','contract','review'))::int AS active_parts
      FROM public.b2b_partnerships
     WHERE clinic_id = v_clinic_id
     GROUP BY category
  ),
  cands AS (
    SELECT category,
           COUNT(*) FILTER (WHERE contact_status NOT IN ('declined','archived','signed'))::int AS open_cands,
           MAX(dna_score) AS best_score
      FROM public.b2b_candidates
     WHERE clinic_id = v_clinic_id
     GROUP BY category
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'slug',            c.slug,
      'label',           c.label,
      'pillar',          c.pillar,
      'tier',            c.tier,
      'priority',        c.priority,
      'suggested_query', c.suggested_query,
      'notes',           c.notes,
      'active_partnerships', COALESCE(p.active_parts, 0),
      'total_partnerships',  COALESCE(p.total_parts, 0),
      'open_candidates',     COALESCE(cd.open_cands, 0),
      'best_candidate_score', cd.best_score,
      'state', CASE
        WHEN COALESCE(p.active_parts, 0) > 0 THEN 'green'
        WHEN COALESCE(cd.open_cands, 0) > 0  THEN 'yellow'
        ELSE 'red'
      END
    )
    ORDER BY c.tier, c.priority DESC
  ), '[]'::jsonb)
  INTO v_out
  FROM cat c
  LEFT JOIN parts p  ON p.category = c.slug
  LEFT JOIN cands cd ON cd.category = c.slug;

  RETURN jsonb_build_object(
    'ok', true,
    'generated_at', now(),
    'categories', v_out
  );
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_suggestions_snapshot() TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_plan_categories TO anon, authenticated, service_role;
