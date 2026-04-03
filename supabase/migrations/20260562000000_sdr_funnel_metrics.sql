-- ============================================================
-- RPC: sdr_funnel_metrics
-- Agrega metricas do funil por fase usando a tabela leads
-- Retorna contagens por fase + taxas de conversao
--
-- Funil: Lead -> Agendado -> Compareceu -> Paciente
--                                       -> Orcamento -> Paciente
-- ============================================================

CREATE OR REPLACE FUNCTION public.sdr_funnel_metrics(
  p_from timestamptz DEFAULT (now() - interval '7 days'),
  p_to   timestamptz DEFAULT now()
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_result    jsonb;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'nao autenticado');
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'data', jsonb_build_object(
      -- Contagens atuais (leads ativos por fase)
      'total_leads',    (SELECT count(*) FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL AND created_at BETWEEN p_from AND p_to),
      'leads',          (SELECT count(*) FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL AND phase = 'lead' AND created_at BETWEEN p_from AND p_to),
      'agendados',      (SELECT count(*) FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL AND phase IN ('agendado', 'reagendado') AND created_at BETWEEN p_from AND p_to),
      'compareceram',   (SELECT count(*) FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL AND phase = 'compareceu' AND created_at BETWEEN p_from AND p_to),
      'pacientes',      (SELECT count(*) FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL AND phase = 'paciente' AND created_at BETWEEN p_from AND p_to),
      'orcamentos',     (SELECT count(*) FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL AND phase = 'orcamento' AND created_at BETWEEN p_from AND p_to),
      'perdidos',       (SELECT count(*) FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL AND phase = 'perdido' AND created_at BETWEEN p_from AND p_to),

      -- Transicoes historicas (quantos leads JA PASSARAM por cada fase, mesmo que ja avancaram)
      'ever_agendado',    (SELECT count(DISTINCT lead_id) FROM phase_history WHERE to_phase IN ('agendado','reagendado') AND created_at BETWEEN p_from AND p_to
                           AND lead_id IN (SELECT id FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL)),
      'ever_compareceu',  (SELECT count(DISTINCT lead_id) FROM phase_history WHERE to_phase = 'compareceu' AND created_at BETWEEN p_from AND p_to
                           AND lead_id IN (SELECT id FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL)),
      'ever_paciente',    (SELECT count(DISTINCT lead_id) FROM phase_history WHERE to_phase = 'paciente' AND created_at BETWEEN p_from AND p_to
                           AND lead_id IN (SELECT id FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL)),
      'ever_orcamento',   (SELECT count(DISTINCT lead_id) FROM phase_history WHERE to_phase = 'orcamento' AND created_at BETWEEN p_from AND p_to
                           AND lead_id IN (SELECT id FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL)),
      'ever_perdido',     (SELECT count(DISTINCT lead_id) FROM phase_history WHERE to_phase = 'perdido' AND created_at BETWEEN p_from AND p_to
                           AND lead_id IN (SELECT id FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL)),

      -- Conversoes de orcamento para paciente
      'orcamento_para_paciente', (SELECT count(DISTINCT lead_id) FROM phase_history WHERE from_phase = 'orcamento' AND to_phase = 'paciente' AND created_at BETWEEN p_from AND p_to
                                  AND lead_id IN (SELECT id FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL)),

      -- No-shows (agendados que viraram perdido sem passar por compareceu)
      'no_shows', (SELECT count(DISTINCT ph.lead_id)
                   FROM phase_history ph
                   WHERE ph.to_phase = 'perdido'
                     AND ph.from_phase IN ('agendado', 'reagendado')
                     AND ph.created_at BETWEEN p_from AND p_to
                     AND ph.lead_id IN (SELECT id FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL)),

      -- Temperatura
      'temp_hot',  (SELECT count(*) FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL AND temperature = 'hot' AND created_at BETWEEN p_from AND p_to),
      'temp_warm', (SELECT count(*) FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL AND temperature = 'warm' AND created_at BETWEEN p_from AND p_to),
      'temp_cold', (SELECT count(*) FROM leads WHERE clinic_id = v_clinic_id AND deleted_at IS NULL AND temperature = 'cold' AND created_at BETWEEN p_from AND p_to)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION sdr_funnel_metrics(timestamptz, timestamptz) TO authenticated;
