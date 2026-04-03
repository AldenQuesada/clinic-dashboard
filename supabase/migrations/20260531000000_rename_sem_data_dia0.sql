-- ============================================================
-- Migration: 20260531000000 — Renomeia "Sem Data" para "Dia 0"
--
-- Altera apenas o label de exibição da coluna inicial do
-- pipeline seven_days. O slug 'sem_data' e toda a lógica
-- de avanço (sdr_advance_day_buckets) permanecem inalterados.
-- ============================================================

UPDATE public.pipeline_stages ps
SET    label = 'Dia 0'
FROM   public.pipelines p
WHERE  ps.pipeline_id = p.id
  AND  p.slug         = 'seven_days'
  AND  ps.slug        = 'sem_data'
  AND  ps.label       = 'Sem Data';

-- ============================================================
-- VERIFICAÇÃO:
-- SELECT slug, label FROM public.pipeline_stages ps
-- JOIN public.pipelines p ON p.id = ps.pipeline_id
-- WHERE p.slug = 'seven_days' ORDER BY ps.sort_order;
-- Deve mostrar: dia_0 'Dia 0', dia_1 'Dia 1', ...
-- ============================================================
