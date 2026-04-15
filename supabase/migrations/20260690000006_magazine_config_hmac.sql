-- ============================================================================
-- Beauty & Health Magazine — Config (HMAC) + RFM Fallback
-- ============================================================================
-- Elimina dependencia de ALTER DATABASE (que exige superuser no Supabase).
-- Armazena HMAC secret em tabela dedicada e expoe via funcao SECURITY DEFINER.
-- Garante que get_lead_rfm(uuid) exista (fallback neutro se sistema RFM
-- ainda nao estiver implementado/acessivel na mesma schema).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Tabela magazine_config — chave/valor global (sem RLS publico)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.magazine_config (
  key         text PRIMARY KEY,
  value       text NOT NULL,
  description text,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.magazine_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.magazine_config FROM public, anon, authenticated;
-- Acesso exclusivo via funcoes SECURITY DEFINER; nenhuma policy concedida.

-- ----------------------------------------------------------------------------
-- 2) Helper interno para ler o HMAC secret
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._mag_current_hmac_secret()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT value FROM public.magazine_config WHERE key = 'hmac_secret' LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public._mag_current_hmac_secret() FROM public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 3) Reescreve _mag_verify_lead_hash para usar a nova fonte
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._mag_verify_lead_hash(
  p_lead_id    uuid,
  p_edition_id uuid,
  p_hash       text
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text := public._mag_current_hmac_secret();
  v_expected text;
BEGIN
  -- Sem secret configurado -> aceita apenas hash vazio (dev/staging)
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RETURN p_hash IS NULL OR length(p_hash) = 0;
  END IF;

  v_expected := encode(
    hmac(p_lead_id::text || p_edition_id::text, v_secret, 'sha256'),
    'hex'
  );

  RETURN v_expected = p_hash;
END $$;

-- ----------------------------------------------------------------------------
-- 4) Seed do HMAC secret (32 bytes random, gerado aqui)
-- ----------------------------------------------------------------------------
-- Se ja existe (idempotente), nao sobrescreve.
INSERT INTO public.magazine_config (key, value, description)
VALUES (
  'hmac_secret',
  encode(gen_random_bytes(32), 'hex'),
  'HMAC-SHA256 secret para validar lead_hash nos links publicos da revista'
)
ON CONFLICT (key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 5) Helper de sign para uso server-side (n8n, dispatch, testes)
-- ----------------------------------------------------------------------------
-- Retorna o hash esperado para um (lead_id, edition_id). NAO exposto a anon.
CREATE OR REPLACE FUNCTION public.magazine_sign_lead_link(
  p_lead_id    uuid,
  p_edition_id uuid
)
RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text := public._mag_current_hmac_secret();
BEGIN
  IF v_secret IS NULL OR length(v_secret) = 0 THEN
    RAISE EXCEPTION 'magazine.hmac_secret nao configurado';
  END IF;
  RETURN encode(
    hmac(p_lead_id::text || p_edition_id::text, v_secret, 'sha256'),
    'hex'
  );
END $$;

REVOKE ALL ON FUNCTION public.magazine_sign_lead_link(uuid,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_sign_lead_link(uuid,uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6) Fallback get_lead_rfm caso funcao nao exista
-- ----------------------------------------------------------------------------
-- A RPC magazine_start_reading captura undefined_function e usa 'active'.
-- Mas se a funcao existe com assinatura diferente, pode falhar. Criamos
-- uma overload defensiva que le do proprio sistema RFM se houver, senao
-- deduz a partir de appointments recentes.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'get_lead_rfm'
  ) THEN
    EXECUTE $f$
      CREATE OR REPLACE FUNCTION public.get_lead_rfm(p_lead_id uuid)
      RETURNS TABLE (
        lead_id uuid,
        current_segment text,
        recency_days int,
        frequency int,
        monetary numeric
      )
      LANGUAGE plpgsql STABLE SECURITY DEFINER
      SET search_path = public
      AS $inner$
      DECLARE
        v_last timestamptz;
        v_freq int := 0;
        v_mon numeric := 0;
        v_days int;
        v_seg text;
      BEGIN
        -- Tenta deduzir a partir de appointments finalizados
        BEGIN
          SELECT MAX(COALESCE(finalized_at, updated_at, created_at)),
                 COUNT(*) FILTER (WHERE status IN ('finalized','done')),
                 COALESCE(SUM(price_paid), 0)
          INTO v_last, v_freq, v_mon
          FROM public.appointments
          WHERE lead_id = p_lead_id;
        EXCEPTION WHEN undefined_table OR undefined_column THEN
          v_last := NULL;
        END;

        IF v_last IS NULL THEN
          v_seg := 'lead';
          v_days := NULL;
        ELSE
          v_days := EXTRACT(DAY FROM (now() - v_last))::int;
          v_seg := CASE
            WHEN v_mon >= 3000 AND v_days <= 90                   THEN 'vip'
            WHEN v_days <= 60                                     THEN 'active'
            WHEN v_days <= 180                                    THEN 'at_risk'
            WHEN v_days <= 365                                    THEN 'dormant'
            ELSE 'distante'
          END;
        END IF;

        RETURN QUERY SELECT p_lead_id, v_seg, v_days, v_freq, v_mon;
      END $inner$;
    $f$;

    REVOKE ALL ON FUNCTION public.get_lead_rfm(uuid) FROM public, anon;
    GRANT EXECUTE ON FUNCTION public.get_lead_rfm(uuid) TO authenticated;
  END IF;
END $$;

-- ============================================================================
-- Validacao: SELECT length(public._mag_current_hmac_secret()) > 0;
-- ============================================================================
