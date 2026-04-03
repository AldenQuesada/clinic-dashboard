-- ============================================================
-- Migration: 20260532000000 — Lead: temperatura padrão = 'hot'
--
-- Altera o DEFAULT da coluna temperature de 'cold' para 'hot',
-- garantindo que todo novo lead entre automaticamente como Quente.
--
-- Camada DB: robusta contra qualquer caminho de inserção
-- (Supabase direto, trigger, RPC, import em massa, etc.)
-- ============================================================

ALTER TABLE public.leads
  ALTER COLUMN temperature SET DEFAULT 'hot';

-- ============================================================
-- VERIFICAÇÃO:
-- SELECT column_name, column_default
-- FROM information_schema.columns
-- WHERE table_schema = 'public'
--   AND table_name   = 'leads'
--   AND column_name  = 'temperature';
-- Deve mostrar: column_default = 'hot'::text
-- ============================================================
