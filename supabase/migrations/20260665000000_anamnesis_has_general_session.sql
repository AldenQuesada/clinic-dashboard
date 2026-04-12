-- ============================================================
-- Migration: anamnesis_templates.has_general_session
-- ============================================================
-- A config "mostrar Dados Gerais antes das sessões" era salva
-- apenas em localStorage do admin que criou o template
-- (anm_tpl_settings). O paciente nunca tinha esse dado, então
-- form-render.js caía no fallback false e a tela de início
-- com dados cadastrais sumia.
--
-- Agora vive no template (default true — cenário mais comum).
-- create_anamnesis_request popula o snapshot a partir daqui.
-- ============================================================

ALTER TABLE public.anamnesis_templates
  ADD COLUMN IF NOT EXISTS has_general_session boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.anamnesis_templates.has_general_session IS
  'Se true, o form-render prepende uma sessão virtual "Dados Gerais" com os campos cadastrais do paciente (nome, CPF, endereço, etc). Default true.';

-- Backfill: todos os templates existentes ganham has_general_session=true
UPDATE public.anamnesis_templates SET has_general_session = true WHERE has_general_session IS NULL;
