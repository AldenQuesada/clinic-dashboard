-- ============================================================
-- Migration: 014 — SDR: Seed de Pipelines
-- Sprint 8 — SDR Module Foundation
--
-- Cria os 2 pipelines padrão com seus stages:
--
--   seven_days  → Kanban 7 Dias (temporal)
--     Sem Data | Dia 1 | Dia 2 | Dia 3 | Dia 4 | Dia 5 | Dia 6 | Dia 7+
--
--   evolution   → Kanban Evolução (comportamental)
--     Novo | Contato Feito | Interesse Confirmado | Proposta Enviada |
--     Em Negociação | Agendado | Convertido | Perdido
--
-- Cada pipeline tem is_system=true (não deletável).
-- ============================================================

DO $$
DECLARE
  v_clinic_id    uuid;
  v_pipeline_7d  uuid;
  v_pipeline_ev  uuid;
BEGIN
  SELECT id INTO v_clinic_id FROM public.clinics LIMIT 1;

  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Nenhuma clínica encontrada';
  END IF;

  -- ── Pipeline: Kanban 7 Dias ─────────────────────────────────
  INSERT INTO public.pipelines (clinic_id, slug, name, description, applies_to_phase, is_system, sort_order)
  VALUES (
    v_clinic_id,
    'seven_days',
    'Kanban 7 Dias',
    'Visão temporal: onde o lead está na janela de 7 dias',
    NULL, -- aplica-se a todas as fases
    true,
    10
  )
  ON CONFLICT (clinic_id, slug) DO NOTHING
  RETURNING id INTO v_pipeline_7d;

  -- Se já existia, busca o id
  IF v_pipeline_7d IS NULL THEN
    SELECT id INTO v_pipeline_7d FROM public.pipelines
    WHERE clinic_id = v_clinic_id AND slug = 'seven_days';
  END IF;

  -- Stages do Kanban 7 Dias
  INSERT INTO public.pipeline_stages (pipeline_id, slug, label, color, day_number, sort_order)
  VALUES
    (v_pipeline_7d, 'sem_data', 'Dia 0',     '#f3f4f6', NULL, 0),
    (v_pipeline_7d, 'dia_1',    'Dia 1',     '#dbeafe', 1,    10),
    (v_pipeline_7d, 'dia_2',    'Dia 2',     '#bfdbfe', 2,    20),
    (v_pipeline_7d, 'dia_3',    'Dia 3',     '#93c5fd', 3,    30),
    (v_pipeline_7d, 'dia_4',    'Dia 4',     '#fef3c7', 4,    40),
    (v_pipeline_7d, 'dia_5',    'Dia 5',     '#fde68a', 5,    50),
    (v_pipeline_7d, 'dia_6',    'Dia 6',     '#fed7aa', 6,    60),
    (v_pipeline_7d, 'dia_7_plus','Dia 7+',   '#fecaca', 7,    70)
  ON CONFLICT (pipeline_id, slug) DO NOTHING;

  -- ── Pipeline: Kanban Evolução ───────────────────────────────
  INSERT INTO public.pipelines (clinic_id, slug, name, description, applies_to_phase, is_system, sort_order)
  VALUES (
    v_clinic_id,
    'evolution',
    'Kanban Evolução',
    'Visão comportamental: como o lead está evoluindo no funil',
    NULL, -- aplica-se a todas as fases
    true,
    20
  )
  ON CONFLICT (clinic_id, slug) DO NOTHING
  RETURNING id INTO v_pipeline_ev;

  IF v_pipeline_ev IS NULL THEN
    SELECT id INTO v_pipeline_ev FROM public.pipelines
    WHERE clinic_id = v_clinic_id AND slug = 'evolution';
  END IF;

  -- Stages do Kanban Evolução
  INSERT INTO public.pipeline_stages (pipeline_id, slug, label, color, sort_order)
  VALUES
    (v_pipeline_ev, 'novo',               'Novo',                '#f3f4f6', 10),
    (v_pipeline_ev, 'contato_feito',      'Contato Feito',       '#dbeafe', 20),
    (v_pipeline_ev, 'interesse_confirmado','Interesse Confirmado','#bfdbfe', 30),
    (v_pipeline_ev, 'proposta_enviada',   'Proposta Enviada',    '#fef3c7', 40),
    (v_pipeline_ev, 'em_negociacao',      'Em Negociação',       '#fed7aa', 50),
    (v_pipeline_ev, 'agendado',           'Agendado',            '#d1fae5', 60),
    (v_pipeline_ev, 'convertido',         'Convertido',          '#a7f3d0', 70),
    (v_pipeline_ev, 'perdido',            'Perdido',             '#fecaca', 80)
  ON CONFLICT (pipeline_id, slug) DO NOTHING;

  RAISE NOTICE 'Pipelines criados — 7 Dias: %, Evolução: %', v_pipeline_7d, v_pipeline_ev;
END $$;

-- ============================================================
-- VERIFICAÇÃO:
-- SELECT p.slug AS pipeline, s.slug AS stage, s.label, s.sort_order
-- FROM public.pipelines p
-- JOIN public.pipeline_stages s ON s.pipeline_id = p.id
-- ORDER BY p.sort_order, s.sort_order;
-- ============================================================
