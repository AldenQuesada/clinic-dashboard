-- ============================================================
-- Migration: drop B2B referral (substituido por VPI)
--
-- O fluxo de indicação agora usa o sistema VPI existente (embaixadoras).
-- A migration 383 criou paralelo desnecessário — limpando.
-- ============================================================

DROP TRIGGER IF EXISTS trg_b2b_attribution_referral ON public.b2b_attributions;
DROP FUNCTION IF EXISTS public._b2b_attribution_referral_bridge();
DROP FUNCTION IF EXISTS public.b2b_referral_create(uuid, text, text, text);
