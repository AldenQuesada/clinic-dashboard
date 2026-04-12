-- ============================================================
-- Migration: fix trigger camelCase + lgpd_consent column
-- ============================================================
-- Bug 1: update_updated_at_column() é uma fn global que faz
--   NEW."updatedAt" = now()
-- Escrita pra tabelas camelCase (patients, leads). Mas está
-- aplicada em anamnesis_responses que é snake_case, quebrando
-- qualquer UPDATE com "record NEW has no field updatedAt".
--
-- Fix: nova fn snake_case e substitui o trigger.
--
-- Bug 2: frontend tenta salvar lgpd_consent mas a coluna
-- não existe. Adiciona.
-- ============================================================

-- ── Bug 2: coluna lgpd_consent ──────────────────────────────
ALTER TABLE public.anamnesis_responses
  ADD COLUMN IF NOT EXISTS lgpd_consent jsonb;

COMMENT ON COLUMN public.anamnesis_responses.lgpd_consent IS
  'Registro do consentimento LGPD capturado no form-render: { accepted, accepted_at, ip_hash, consent_version }';

-- ── Bug 1: fn snake_case para tabelas snake_case ───────────
CREATE OR REPLACE FUNCTION public.update_updated_at_column_snake()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Substitui o trigger que usava a fn camelCase pela snake_case
DROP TRIGGER IF EXISTS trg_anamnesis_responses_updated_at ON public.anamnesis_responses;

CREATE TRIGGER trg_anamnesis_responses_updated_at
  BEFORE UPDATE ON public.anamnesis_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column_snake();

-- Também corrige outras tabelas anamnesis_* que podem ter o
-- mesmo problema (idempotente: só substitui se o trigger usar
-- a fn antiga camelCase).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT t.tgname, c.relname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relname LIKE 'anamnesis_%'
      AND p.proname = 'update_updated_at_column'
      AND t.tgname NOT LIKE 'pg_%'
  LOOP
    RAISE NOTICE 'Migrando trigger % em % para snake_case', r.tgname, r.relname;
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', r.tgname, r.relname);
    EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE ON public.%I FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column_snake()', r.tgname, r.relname);
  END LOOP;
END $$;
