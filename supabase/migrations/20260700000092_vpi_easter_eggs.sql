-- ============================================================
-- Migration: VPI Easter Eggs por Tier (Fase 9 - Entrega 3)
--
-- Parceira ativa gestos especificos no cartao -> libera animacao
-- custom por tier. Cria culto, razoes pra voltar.
--
-- Gestos (client-side):
--   - Bronze:   3 toques rapidos no nome
--   - Prata:    5 toques rapidos
--   - Ouro:     long press 3 segundos
--   - Diamante: sequencia Konami simplificada (4 swipes)
--
-- DB:
--   - Tabela vpi_easter_discoveries (partner_id, egg_code UNIQUE)
--     pra badge futuro "Descobridora de Eggs"
--   - RPC vpi_pub_easter_triggered(token, egg_code) auditoria +
--     insere discovery + retorna already_triggered_count
-- ============================================================

-- ── 1. Tabela vpi_easter_discoveries ────────────────────────
CREATE TABLE IF NOT EXISTS public.vpi_easter_discoveries (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id        uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  partner_id       uuid NOT NULL REFERENCES public.vpi_partners(id) ON DELETE CASCADE,
  egg_code         text NOT NULL,
  discovered_at    timestamptz NOT NULL DEFAULT now(),
  triggered_count  int NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vpi_easter_uniq
  ON public.vpi_easter_discoveries(partner_id, egg_code);
CREATE INDEX IF NOT EXISTS idx_vpi_easter_partner
  ON public.vpi_easter_discoveries(partner_id, discovered_at DESC);

ALTER TABLE public.vpi_easter_discoveries ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='vpi_easter_discoveries'
       AND policyname='vpi_easter_all_read'
  ) THEN
    CREATE POLICY vpi_easter_all_read ON public.vpi_easter_discoveries
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='vpi_easter_discoveries'
       AND policyname='vpi_easter_all_write'
  ) THEN
    CREATE POLICY vpi_easter_all_write ON public.vpi_easter_discoveries
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 2. RPC vpi_pub_easter_triggered ─────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_pub_easter_triggered(
  p_token    text,
  p_egg_code text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner_id uuid;
  v_clinic     uuid;
  v_tier       text;
  v_count      int := 0;
  v_first_time boolean;
BEGIN
  IF p_token IS NULL OR p_token = '' OR p_egg_code IS NULL OR p_egg_code = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  -- Whitelist de codes validos
  IF p_egg_code NOT IN ('bronze_taps','prata_taps','ouro_press','diamante_konami') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_code');
  END IF;

  SELECT id, clinic_id, tier_atual INTO v_partner_id, v_clinic, v_tier
    FROM public.vpi_partners
   WHERE card_token = p_token;

  IF v_partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Upsert discovery (insere ou incrementa triggered_count)
  INSERT INTO public.vpi_easter_discoveries (
    clinic_id, partner_id, egg_code, discovered_at, triggered_count
  ) VALUES (
    v_clinic, v_partner_id, p_egg_code, now(), 1
  )
  ON CONFLICT (partner_id, egg_code) DO UPDATE
    SET triggered_count = vpi_easter_discoveries.triggered_count + 1
  RETURNING (triggered_count = 1), triggered_count INTO v_first_time, v_count;

  -- Audit leve
  BEGIN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (v_clinic, 'easter_triggered', 'partner', v_partner_id::text,
      jsonb_build_object('egg_code', p_egg_code, 'tier', v_tier, 'first_time', v_first_time));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object(
    'ok',                       true,
    'egg_code',                 p_egg_code,
    'already_triggered_count',  v_count,
    'first_time',               v_first_time,
    'tier',                     v_tier
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_pub_easter_triggered(text, text)
  TO anon, authenticated;

COMMENT ON TABLE public.vpi_easter_discoveries IS
  'Easter eggs descobertos por parceira. Base pra badge futuro "Descobridora". Fase 9 Entrega 3.';
COMMENT ON FUNCTION public.vpi_pub_easter_triggered(text, text) IS
  'Registra easter egg triggered por parceira. Whitelist de codes. Fase 9 Entrega 3.';
