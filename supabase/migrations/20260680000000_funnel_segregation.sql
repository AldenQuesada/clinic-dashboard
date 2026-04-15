-- ============================================================
-- Funnel Segregation — carimbar leads com funil (fullface | procedimentos)
-- ============================================================
-- Motivo: os kanbans Full Face Premium e Procedimentos carregavam da mesma
-- base sem filtro. Com o quiz de Procedimentos rodando a partir de 2026-04-16,
-- precisamos segregar por funil.
--
-- Regra: cada ponto de entrada (quiz, import, manual, whatsapp) grava o funil.
-- Leads antigos sem funil → 'procedimentos' (decisão do produto).

-- 1. Backfill de leads antigos
UPDATE public.leads
SET funnel = 'procedimentos'
WHERE funnel IS NULL;

-- 2. Default + CHECK
ALTER TABLE public.leads
  ALTER COLUMN funnel SET DEFAULT 'procedimentos';

-- CHECK permite fullface e procedimentos; futuro pode adicionar outros valores
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'leads_funnel_check'
  ) THEN
    ALTER TABLE public.leads
      ADD CONSTRAINT leads_funnel_check
      CHECK (funnel IN ('fullface', 'procedimentos'));
  END IF;
END $$;

-- Index pra filtrar kanbans
CREATE INDEX IF NOT EXISTS idx_leads_funnel
  ON public.leads (funnel)
  WHERE deleted_at IS NULL;

-- 3. Atualizar submit_quiz_response pra gravar funnel
--    Derivado do p_kanban_target que o quiz já envia:
--      'kanban-fullface'   → 'fullface'
--      'kanban-protocolos' → 'procedimentos'
--      qualquer outro      → 'procedimentos' (default seguro)
CREATE OR REPLACE FUNCTION submit_quiz_response(
  p_quiz_id uuid, p_clinic_id uuid, p_answers jsonb, p_score int, p_temperature text,
  p_contact_name text, p_contact_phone text, p_contact_email text,
  p_utm_source text, p_utm_medium text, p_utm_campaign text, p_kanban_target text,
  p_queixas_faciais jsonb DEFAULT '[]'::jsonb, p_idade int DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_response_id uuid; v_lead_id text; v_pipeline_id uuid; v_stage_id uuid; v_recent_count int;
  v_funnel text;
BEGIN
  -- Mapa kanban_target → funnel
  v_funnel := CASE
    WHEN p_kanban_target = 'kanban-fullface'   THEN 'fullface'
    WHEN p_kanban_target = 'kanban-protocolos' THEN 'procedimentos'
    ELSE 'procedimentos'
  END;

  IF p_contact_phone IS NOT NULL AND trim(p_contact_phone) <> '' THEN
    SELECT count(*) INTO v_recent_count FROM quiz_responses
    WHERE contact_phone = p_contact_phone AND submitted_at > now() - interval '1 hour';
    IF v_recent_count >= 5 THEN
      RETURN jsonb_build_object('error', 'rate_limit', 'message', 'Muitas tentativas.');
    END IF;
  END IF;

  INSERT INTO quiz_responses (quiz_id, clinic_id, answers, score, temperature,
    contact_name, contact_phone, contact_email, utm_source, utm_medium, utm_campaign,
    queixas_faciais, idade)
  VALUES (p_quiz_id, p_clinic_id, p_answers, p_score, p_temperature,
    p_contact_name, p_contact_phone, p_contact_email,
    p_utm_source, p_utm_medium, p_utm_campaign, p_queixas_faciais, p_idade)
  RETURNING id INTO v_response_id;

  IF p_contact_phone IS NOT NULL AND trim(p_contact_phone) <> '' THEN
    INSERT INTO leads (id, name, phone, email, clinic_id, temperature, phase,
      queixas_faciais, source_type, source_quiz_id, idade, day_bucket, funnel)
    VALUES (gen_random_uuid()::text, COALESCE(p_contact_name,''), p_contact_phone,
      COALESCE(trim(p_contact_email),''), p_clinic_id, COALESCE(p_temperature,'hot'),
      'lead', p_queixas_faciais, 'quiz', p_quiz_id, p_idade, 0, v_funnel)
    ON CONFLICT DO NOTHING RETURNING id INTO v_lead_id;

    IF v_lead_id IS NULL THEN
      -- Já existe: atualiza queixas e idade, mas NÃO mexe em funnel
      -- (lead existente mantém o funil original — decisão do produto)
      UPDATE leads SET queixas_faciais = p_queixas_faciais,
        idade = COALESCE(p_idade, idade), updated_at = now()
      WHERE phone = p_contact_phone AND clinic_id = p_clinic_id
      RETURNING id INTO v_lead_id;
    END IF;

    IF v_lead_id IS NOT NULL THEN
      UPDATE quiz_responses SET lead_id = v_lead_id::uuid WHERE id = v_response_id;
    END IF;

    IF v_lead_id IS NOT NULL THEN
      FOR v_pipeline_id IN SELECT p.id FROM pipelines p WHERE p.clinic_id = p_clinic_id AND p.is_active = true LOOP
        SELECT ps.id INTO v_stage_id FROM pipeline_stages ps
        WHERE ps.pipeline_id = v_pipeline_id AND ps.is_active = true ORDER BY ps.sort_order ASC LIMIT 1;
        IF v_stage_id IS NOT NULL THEN
          INSERT INTO lead_pipeline_positions (lead_id, pipeline_id, stage_id, origin)
          VALUES (v_lead_id, v_pipeline_id, v_stage_id, 'auto') ON CONFLICT (lead_id, pipeline_id) DO NOTHING;
        END IF;
      END LOOP;
    END IF;
  END IF;

  RETURN jsonb_build_object('quiz_response_id', v_response_id, 'lead_id', v_lead_id, 'funnel', v_funnel);
END; $$;

-- 4. Atualizar sdr_get_kanban_evolution pra retornar funnel em cada lead
CREATE OR REPLACE FUNCTION sdr_get_kanban_evolution(p_phase text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_clinic_id uuid;
    v_result    jsonb;
  BEGIN
    v_clinic_id := public._sdr_clinic_id();
    IF v_clinic_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado');
    END IF;

    SELECT jsonb_build_object(
      'stages', (
        SELECT jsonb_agg(jsonb_build_object(
          'slug',       s.slug,
          'label',      s.label,
          'color',      s.color,
          'sort_order', s.sort_order,
          'leads', COALESCE((
            SELECT jsonb_agg(jsonb_build_object(
              'id',               l.id,
              'name',             l.name,
              'phone',            l.phone,
              'status',           l.status,
              'phase',            l.phase,
              'temperature',      l.temperature,
              'priority',         l.priority,
              'assigned_to',      l.assigned_to,
              'created_at',       l.created_at,
              'queixas_faciais',  COALESCE(l.queixas_faciais, '[]'::jsonb),
              'idade',            l.idade,
              'funnel',           COALESCE(l.funnel, 'procedimentos')
            ) ORDER BY l.priority DESC, l.created_at ASC)
            FROM public.lead_pipeline_positions lpp
            JOIN public.leads l ON l.id = lpp.lead_id
            WHERE lpp.stage_id   = s.id
              AND l.clinic_id    = v_clinic_id
              AND l.deleted_at   IS NULL
              AND (p_phase IS NULL OR l.phase = p_phase)
          ), '[]'::jsonb)
        ) ORDER BY s.sort_order)
        FROM public.pipeline_stages s
        JOIN public.pipelines p ON p.id = s.pipeline_id
        WHERE p.clinic_id = v_clinic_id
          AND p.slug      = 'evolution'
          AND p.is_active = true
          AND s.is_active = true
      )
    ) INTO v_result;

    RETURN jsonb_build_object('ok', true, 'data', COALESCE(v_result, '{}'::jsonb));
  END;
$$;
