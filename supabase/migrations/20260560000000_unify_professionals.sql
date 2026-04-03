-- ============================================================
-- Migration: Unificar professional_profiles com profiles
--
-- Problema: profissionais duplicados e sem user_id linkado
--
-- Acoes:
--   1. Copiar dados de "ALDEN JULIO" (d80c8ef2) para "Alden Quesada" (06757b9f)
--   2. Linkar user_id de Alden e Luciana
--   3. Transferir referencias do ID antigo
--   4. Remover duplicata
-- ============================================================

-- ============================================================
-- PASSO 1: Copiar dados completos para o registro principal do Alden
-- O 06757b9f e o ID que bate com profiles (auth), entao ele fica
-- ============================================================
UPDATE professional_profiles
SET
  display_name = 'ALDEN JULIO QUESADA SIFONTES',
  specialty    = 'Medicina Integrativa',
  bio          = 'Especialista em Reversao de Doencas',
  user_id      = '06757b9f-2a03-43ae-bd37-28021eb6afeb',
  sala_id      = 'bc2d49c6-3dd2-4e7e-86c9-d44677552871',
  telefone     = '(44) 99878-7673',
  whatsapp     = '(44) 99878-7673',
  nascimento   = '1982-11-08',
  contrato     = 'socio',
  salario      = 6000,
  nivel        = 'socio',
  cargo        = 'CEO',
  skills       = '{"custom":{"especialista em reversao de doencas":true}}'::jsonb,
  updated_at   = now()
WHERE id = '06757b9f-2a03-43ae-bd37-28021eb6afeb';

-- ============================================================
-- PASSO 2: Transferir todas as referencias do ID duplicado (d80c8ef2)
-- para o ID principal (06757b9f) em todas as tabelas que referenciam
-- ============================================================

-- Appointments
UPDATE appointments
SET professional_id = '06757b9f-2a03-43ae-bd37-28021eb6afeb'
WHERE professional_id = 'd80c8ef2-135f-4258-a30d-06f62a6433e9';

-- Professional technologies (junction)
UPDATE professional_technologies
SET professional_id = '06757b9f-2a03-43ae-bd37-28021eb6afeb'
WHERE professional_id = 'd80c8ef2-135f-4258-a30d-06f62a6433e9'
  AND NOT EXISTS (
    SELECT 1 FROM professional_technologies
    WHERE professional_id = '06757b9f-2a03-43ae-bd37-28021eb6afeb'
      AND technology_id = professional_technologies.technology_id
  );

-- Deletar duplicatas que nao foram transferidas (conflito de unique)
DELETE FROM professional_technologies
WHERE professional_id = 'd80c8ef2-135f-4258-a30d-06f62a6433e9';

-- Leads assigned_to
UPDATE leads
SET assigned_to = '06757b9f-2a03-43ae-bd37-28021eb6afeb'
WHERE assigned_to = 'd80c8ef2-135f-4258-a30d-06f62a6433e9';

-- Interactions created_by (se referencia professional)
-- (interactions.created_by e uuid de auth.users, nao professional)

-- ============================================================
-- PASSO 3: Remover a duplicata do Alden
-- ============================================================
DELETE FROM professional_profiles
WHERE id = 'd80c8ef2-135f-4258-a30d-06f62a6433e9';

-- ============================================================
-- PASSO 4: Linkar Luciana ao seu login
-- ============================================================
UPDATE professional_profiles
SET user_id    = 'd880c95a-170e-4303-ba69-ae42b3796cdb',
    updated_at = now()
WHERE id = '036ea1a0-3d5f-4873-8c82-128dc834815a';

-- ============================================================
-- VERIFICACAO:
--
-- SELECT id, display_name, user_id, telefone, whatsapp
-- FROM professional_profiles
-- WHERE clinic_id = '00000000-0000-0000-0000-000000000001'
-- ORDER BY display_name;
-- ============================================================
