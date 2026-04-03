-- ============================================================
-- Migration: Backfill lead_pipeline_positions
--
-- Problema: leads criados manualmente, por planilha ou antes
-- da migration 20260551 nao foram inicializados nos pipelines.
-- Resultado: Kanban 7 Dias e Evolucao mostram menos leads
-- do que a tabela.
--
-- Solucao: para cada lead ativo que NAO tem posicao em um
-- pipeline ativo da sua clinica, insere na primeira stage.
-- Nao sobrescreve posicoes existentes (ON CONFLICT DO NOTHING).
-- ============================================================

INSERT INTO public.lead_pipeline_positions (lead_id, pipeline_id, stage_id, origin)
SELECT
  l.id          AS lead_id,
  p.id          AS pipeline_id,
  first_stage.id AS stage_id,
  'auto'        AS origin
FROM public.leads l
CROSS JOIN public.pipelines p
INNER JOIN LATERAL (
  SELECT ps.id
  FROM public.pipeline_stages ps
  WHERE ps.pipeline_id = p.id
    AND ps.is_active = true
  ORDER BY ps.sort_order ASC
  LIMIT 1
) first_stage ON true
WHERE l.deleted_at IS NULL
  AND l.clinic_id = p.clinic_id
  AND p.is_active = true
  AND NOT EXISTS (
    SELECT 1 FROM public.lead_pipeline_positions lpp
    WHERE lpp.lead_id = l.id
      AND lpp.pipeline_id = p.id
  )
ON CONFLICT (lead_id, pipeline_id) DO NOTHING;

-- ============================================================
-- Tambem garante que leads sem day_bucket recebam bucket 1
-- (necessario para aparecer no Kanban 7 Dias)
-- ============================================================
UPDATE public.leads
SET day_bucket = 1
WHERE day_bucket IS NULL
  AND deleted_at IS NULL
  AND phase IN ('lead', 'agendado', 'reagendado');

-- ============================================================
-- VERIFICACAO:
--
-- SELECT
--   (SELECT count(*) FROM leads WHERE deleted_at IS NULL) AS total_leads,
--   (SELECT count(DISTINCT lead_id) FROM lead_pipeline_positions) AS leads_in_pipelines,
--   (SELECT count(DISTINCT lpp.lead_id)
--    FROM lead_pipeline_positions lpp
--    JOIN pipelines p ON p.id = lpp.pipeline_id
--    WHERE p.slug = 'seven_days') AS in_seven_days,
--   (SELECT count(DISTINCT lpp.lead_id)
--    FROM lead_pipeline_positions lpp
--    JOIN pipelines p ON p.id = lpp.pipeline_id
--    WHERE p.slug = 'evolution') AS in_evolution;
-- ============================================================
