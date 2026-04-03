-- ============================================================
-- Migration: 20260544000000 — Fix professional_profiles.id
--
-- Problema:
--   professional_profiles.id foi criado como FK para profiles(id)
--   sem DEFAULT, impedindo inserções de profissionais sem conta
--   de usuário (upsert_professional e migrate_local_data falhavam).
--
-- Correção:
--   1. Remove FK constraint de id → profiles(id)
--   2. Adiciona DEFAULT gen_random_uuid() em id
--   O campo user_id (adicionado em 20260539) mantém o vínculo
--   opcional com auth.users para profissionais que têm login.
-- ============================================================

-- 1. Remove FK constraint de id → profiles(id)
DO $$
DECLARE
  v_constraint text;
BEGIN
  SELECT conname INTO v_constraint
  FROM pg_constraint
  WHERE conrelid = 'public.professional_profiles'::regclass
    AND contype   = 'f'
    AND conkey    = ARRAY(
          SELECT attnum FROM pg_attribute
          WHERE attrelid = 'public.professional_profiles'::regclass
            AND attname  = 'id'
        );

  IF v_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.professional_profiles DROP CONSTRAINT %I', v_constraint);
  END IF;
END $$;

-- 2. Adiciona DEFAULT gen_random_uuid() em id
ALTER TABLE public.professional_profiles
  ALTER COLUMN id SET DEFAULT gen_random_uuid();
