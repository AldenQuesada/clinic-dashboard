-- ============================================================
-- Migration: Complete lead fields from CSV import
-- Adds missing columns and ensures all data flows safely
-- ============================================================

-- New columns (only if not exist)
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tipo text DEFAULT 'Paciente';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cnpj text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS convenio text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS cor text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS sexo text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS estado_civil text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS profissao text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS endereco text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS origem text;
ALTER TABLE leads ADD COLUMN IF NOT EXISTS tags_clinica text[];
ALTER TABLE leads ADD COLUMN IF NOT EXISTS queixas_corporais jsonb DEFAULT '[]';
