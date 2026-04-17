-- ============================================================
-- Migration: 20260700000083 — aceita origem='manual_filtro'
--
-- vpi-shell.ui.js envia origem='manual_filtro' quando o parceiro
-- vem do fluxo "buscar candidato existente". A constraint atual
-- so aceita 'auto'|'manual' e rejeita o insert.
--
-- Expande para ('auto','manual','manual_filtro').
-- ============================================================

ALTER TABLE public.vpi_partners
  DROP CONSTRAINT IF EXISTS vpi_partners_origem_check;

ALTER TABLE public.vpi_partners
  ADD CONSTRAINT vpi_partners_origem_check
  CHECK (origem IN ('auto','manual','manual_filtro'));

COMMENT ON COLUMN public.vpi_partners.origem IS
  'auto = enroll automatico pos-atendimento | manual = cadastro manual | manual_filtro = cadastro via busca de candidato existente';
