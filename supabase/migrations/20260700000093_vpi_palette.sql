-- ============================================================
-- Migration: VPI Paleta Personalizada por Tier (Fase 9 - Entrega 4)
--
-- Cada tier tem 3 variantes visuais. Parceira escolhe a que combina
-- mais com ela. Identidade pessoal dentro do sistema.
--
-- Variants por tier:
--   - bronze:   classico | rose | cobre
--   - prata:    classico | sage | perla
--   - ouro:     classico | rose-gold | champagne
--   - diamante: classico | blackout | rainbow-hologram
--
-- Estrutura:
--   1) Coluna vpi_partners.palette_variant
--   2) CHECK: variant valida pro tier atual (soft check; JS refinou)
--   3) RPC vpi_pub_set_palette(token, variant)
--   4) vpi_pub_get_card exposto ja retorna tier_atual; adicionamos
--      palette_variant pelo mesmo caminho (campo direto do select)
--
-- Idempotente.
-- ============================================================

-- ── 1. Coluna palette_variant ───────────────────────────────
ALTER TABLE public.vpi_partners
  ADD COLUMN IF NOT EXISTS palette_variant text NOT NULL DEFAULT 'classico';

-- ── 2. Helper: valida variant pro tier ──────────────────────
CREATE OR REPLACE FUNCTION public._vpi_palette_is_valid(
  p_tier    text,
  p_variant text
) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE lower(COALESCE(p_tier, 'bronze'))
    WHEN 'bronze'   THEN lower(COALESCE(p_variant,'')) IN ('classico','rose','cobre')
    WHEN 'prata'    THEN lower(COALESCE(p_variant,'')) IN ('classico','sage','perla')
    WHEN 'ouro'     THEN lower(COALESCE(p_variant,'')) IN ('classico','rose-gold','champagne')
    WHEN 'diamante' THEN lower(COALESCE(p_variant,'')) IN ('classico','blackout','rainbow-hologram')
    ELSE false
  END;
$$;

-- ── 3. RPC publica: set_palette ─────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_pub_set_palette(
  p_token   text,
  p_variant text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner public.vpi_partners%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_token');
  END IF;
  IF p_variant IS NULL OR p_variant = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_variant');
  END IF;

  SELECT * INTO v_partner FROM public.vpi_partners WHERE card_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF NOT public._vpi_palette_is_valid(v_partner.tier_atual, p_variant) THEN
    RETURN jsonb_build_object(
      'ok',              false,
      'reason',          'invalid_variant_for_tier',
      'tier',            v_partner.tier_atual,
      'variant_attempted', p_variant
    );
  END IF;

  UPDATE public.vpi_partners
     SET palette_variant = p_variant,
         updated_at      = now()
   WHERE id = v_partner.id;

  -- Audit leve
  BEGIN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (v_partner.clinic_id, 'palette_change', 'partner', v_partner.id::text,
      jsonb_build_object('variant', p_variant, 'tier', v_partner.tier_atual));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('ok', true, 'variant', p_variant, 'tier', v_partner.tier_atual);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_pub_set_palette(text, text)
  TO anon, authenticated;

-- ── 4. Extender vpi_pub_get_card pra retornar palette_variant ──
-- Estrategia: detectamos a function atual e acrescentamos o campo
-- no jsonb retornado sem reescrever a logica. Abordagem: wrapping
-- ao inves de reescrita — usa view do partner direto.
--
-- Como a RPC original monta jsonb, o jeito mais robusto sem quebrar
-- compat e adicionar pos-processamento via UPDATE no partner row pra
-- garantir palette_variant sempre ter valor (default 'classico' ja
-- cobre). O consumer JS le d.partner.palette_variant diretamente.
--
-- Defensivo: garante que todo partner tenha variant valida pro tier.
UPDATE public.vpi_partners
   SET palette_variant = 'classico'
 WHERE NOT public._vpi_palette_is_valid(tier_atual, palette_variant);

-- ── 5. RPC publica: retorna palette_variant separado ────────
-- Light-weight endpoint, evita reescrever vpi_pub_get_card.
-- O JS le via fetch separado apos o get_card.
CREATE OR REPLACE FUNCTION public.vpi_pub_get_palette(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner public.vpi_partners%ROWTYPE;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_token');
  END IF;
  SELECT * INTO v_partner FROM public.vpi_partners WHERE card_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  RETURN jsonb_build_object(
    'ok',              true,
    'tier',            v_partner.tier_atual,
    'variant',         COALESCE(v_partner.palette_variant, 'classico')
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_pub_get_palette(text)
  TO anon, authenticated;

COMMENT ON COLUMN public.vpi_partners.palette_variant IS
  'Variante visual dentro do tier (bronze: classico|rose|cobre; prata: classico|sage|perla; ouro: classico|rose-gold|champagne; diamante: classico|blackout|rainbow-hologram). Fase 9 Entrega 4.';
COMMENT ON FUNCTION public.vpi_pub_set_palette(text, text) IS
  'Seta palette_variant do partner via cartao publico. Valida variant vs tier. Fase 9 Entrega 4.';
