-- ============================================================
-- Migration: 20260700000082 — fix gen_random_bytes sem schema
--
-- `gen_random_bytes` vive em schema `extensions` no Supabase.
-- Funcoes com `SET search_path = public` nao acham. Sintoma:
--   "function gen_random_bytes(integer) does not exist"
--
-- Recriamos trigger functions e referencias VPI com prefixo
-- `extensions.gen_random_bytes(...)` explicito.
-- ============================================================

-- ── Trigger BEFORE INSERT em vpi_partners ─────────────────────
CREATE OR REPLACE FUNCTION public._vpi_partner_before_insert()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  IF NEW.card_token IS NULL OR NEW.card_token = '' THEN
    NEW.card_token := encode(extensions.gen_random_bytes(12), 'hex');
  END IF;
  IF NEW.numero_membro IS NULL THEN
    NEW.numero_membro := nextval('public.vpi_partners_membro_seq');
  END IF;
  NEW.tier_atual := public._vpi_calc_tier(NEW.creditos_total);
  IF NEW.short_link_slug IS NULL OR NEW.short_link_slug = '' THEN
    NEW.short_link_slug := 'emb-' || public._vpi_slugify(split_part(COALESCE(NEW.nome,'parceira'),' ',1))
                           || '-' || substring(NEW.card_token, 1, 6);
  END IF;
  RETURN NEW;
END $$;

-- ── vpi_partner_upsert: search_path expandido ─────────────────
-- Garante que qualquer chamada indireta a gen_random_bytes/uuid
-- resolva pelo schema extensions.
ALTER FUNCTION public.vpi_partner_upsert(jsonb) SET search_path = public, extensions;

-- ── Fix shortlinks fallback ───────────────────────────────────
-- (fallback defensivo; raramente acionado, mas evita erro)
ALTER FUNCTION public.vpi_partner_ensure_short_link(uuid) SET search_path = public, extensions;

-- ── Fix invite_staff e accept_invitation (migration 80) ───────
-- Estas ja estao com SET search_path = public. Adiciona extensions.
ALTER FUNCTION public.invite_staff(text, text, text, text, jsonb, uuid) SET search_path = public, extensions;
ALTER FUNCTION public.accept_invitation(text) SET search_path = public, extensions;

-- ── Verificacao ──────────────────────────────────────────────
-- SELECT vpi_partner_upsert('{"nome":"Teste","phone":"11999999999"}'::jsonb);
