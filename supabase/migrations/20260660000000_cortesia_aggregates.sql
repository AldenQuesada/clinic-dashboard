-- ============================================================
-- Migration: cortesia aggregates em appointments + reports RPCs
-- ============================================================
-- Adiciona colunas agregadas para cortesias (consulta + procedimento)
-- e atualiza o RPC mira_finance_summary para reportar separadamente
-- "receita perdida em cortesias".
--
-- Fonte: pagamentos[] (novo array) e procedimentos[] (com cortesia
-- por item) — extraídos no save do agendamento.
-- ============================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS valor_cortesia       numeric(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS motivo_cortesia      text,
  ADD COLUMN IF NOT EXISTS qtd_procs_cortesia   int           DEFAULT 0;

COMMENT ON COLUMN public.appointments.valor_cortesia IS 'Soma dos valores de procedimentos marcados como cortesia neste agendamento (receita renunciada)';
COMMENT ON COLUMN public.appointments.motivo_cortesia IS 'Motivo geral concatenado das cortesias (procs ou consulta)';
COMMENT ON COLUMN public.appointments.qtd_procs_cortesia IS 'Quantidade de procedimentos marcados como cortesia no appointment';

CREATE INDEX IF NOT EXISTS idx_appts_valor_cortesia
  ON public.appointments (valor_cortesia)
  WHERE valor_cortesia > 0;

-- ── RPC: report_cortesias_periodo ──────────────────────────
-- Reporta cortesias num período: total renunciado, count,
-- breakdown por tipo (consulta vs procedimento), e por motivo.

DROP FUNCTION IF EXISTS public.report_cortesias_periodo(date, date);

CREATE OR REPLACE FUNCTION public.report_cortesias_periodo(
  p_inicio date,
  p_fim    date
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_result    jsonb;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  WITH base AS (
    SELECT
      a.id,
      a.appointment_date,
      a.valor_cortesia,
      a.qtd_procs_cortesia,
      a.motivo_cortesia,
      a.tipo_consulta,
      a.tipo_avaliacao,
      a.cortesia_motivo,
      a.valor
    FROM public.appointments a
    WHERE a.clinic_id = v_clinic_id
      AND a.appointment_date BETWEEN p_inicio AND p_fim
      AND (
        a.valor_cortesia > 0
        OR (a.tipo_consulta = 'avaliacao' AND a.tipo_avaliacao = 'cortesia')
      )
  )
  SELECT jsonb_build_object(
    'total_renunciado', COALESCE(SUM(valor_cortesia), 0)
                       + COALESCE(SUM(CASE WHEN tipo_avaliacao = 'cortesia' THEN valor ELSE 0 END), 0),
    'qtd_appts', COUNT(DISTINCT id),
    'qtd_procs_cortesia', COALESCE(SUM(qtd_procs_cortesia), 0),
    'qtd_consultas_cortesia', COUNT(DISTINCT id) FILTER (WHERE tipo_avaliacao = 'cortesia'),
    'detalhes', COALESCE(jsonb_agg(
      jsonb_build_object(
        'data', appointment_date,
        'valor_cortesia_procs', valor_cortesia,
        'motivo_procs', motivo_cortesia,
        'consulta_cortesia', (tipo_avaliacao = 'cortesia'),
        'motivo_consulta', cortesia_motivo,
        'valor_consulta', CASE WHEN tipo_avaliacao = 'cortesia' THEN valor ELSE 0 END
      ) ORDER BY appointment_date DESC
    ) FILTER (WHERE id IS NOT NULL), '[]'::jsonb)
  )
  INTO v_result
  FROM base;

  RETURN COALESCE(v_result, jsonb_build_object('total_renunciado', 0, 'qtd_appts', 0, 'detalhes', '[]'::jsonb));
END;
$$;

REVOKE ALL ON FUNCTION public.report_cortesias_periodo(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.report_cortesias_periodo(date, date) TO authenticated;
