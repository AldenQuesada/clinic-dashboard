-- ============================================================
-- Migration: VPI Impact Stories (Fase 9 - Entrega 5)
--
-- Card "Meu Impacto" no cartao mostra:
--   - Counter: voce transformou N vidas
--   - Slider horizontal com antes/depois + depoimento das indicadas
--     (consent-based, so primeiro nome)
--
-- Estrutura:
--   1) Colunas em vpi_indications: depoimento, foto_antes_url,
--      foto_depois_url, consent_mostrar_na_historia
--   2) RPC vpi_pub_my_impact(token) retorna counter + stories
--   3) RPC admin vpi_indication_story_update(id, data jsonb)
--
-- Idempotente.
-- ============================================================

-- ── 1. Colunas em vpi_indications ───────────────────────────
ALTER TABLE public.vpi_indications
  ADD COLUMN IF NOT EXISTS depoimento                    text,
  ADD COLUMN IF NOT EXISTS foto_antes_url                text,
  ADD COLUMN IF NOT EXISTS foto_depois_url               text,
  ADD COLUMN IF NOT EXISTS consent_mostrar_na_historia   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS indicada_nome                 text;  -- primeiro nome da indicada (opcional, cache)

CREATE INDEX IF NOT EXISTS idx_vpi_ind_stories_consent
  ON public.vpi_indications(partner_id, consent_mostrar_na_historia, fechada_em DESC)
  WHERE consent_mostrar_na_historia = true AND status = 'closed';

-- ── 2. Helper: primeiro nome (client-safe) ──────────────────
-- Tabelas reais: leads.name e patients.name (sem prefixo clinic_).
CREATE OR REPLACE FUNCTION public._vpi_first_name_from_lead(p_lead_id text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_nome text;
BEGIN
  IF p_lead_id IS NULL OR p_lead_id = '' THEN RETURN NULL; END IF;
  -- Tenta patients primeiro
  BEGIN
    SELECT split_part(COALESCE(name,''), ' ', 1) INTO v_nome
      FROM public.patients
     WHERE id::text = p_lead_id OR "leadId" = p_lead_id
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_nome := NULL; END;
  IF v_nome IS NOT NULL AND length(v_nome) > 0 THEN RETURN v_nome; END IF;
  -- Fallback leads
  BEGIN
    SELECT split_part(COALESCE(name,''), ' ', 1) INTO v_nome
      FROM public.leads
     WHERE id::text = p_lead_id
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_nome := NULL; END;
  RETURN v_nome;
END $$;

-- ── 3. RPC publica: my impact ───────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_pub_my_impact(p_token text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner  public.vpi_partners%ROWTYPE;
  v_vidas    int;
  v_stories  jsonb;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_token');
  END IF;

  SELECT * INTO v_partner FROM public.vpi_partners WHERE card_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  SELECT COUNT(*)::int INTO v_vidas
    FROM public.vpi_indications
   WHERE partner_id = v_partner.id
     AND status     = 'closed';

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',              i.id,
      'procedimento',    i.procedimento,
      'fechada_em',      i.fechada_em,
      'depoimento',      i.depoimento,
      'foto_antes_url',  i.foto_antes_url,
      'foto_depois_url', i.foto_depois_url,
      'primeiro_nome',   COALESCE(NULLIF(i.indicada_nome, ''),
                                  public._vpi_first_name_from_lead(i.lead_id),
                                  'Amiga')
    ) ORDER BY i.fechada_em DESC
  ), '[]'::jsonb) INTO v_stories
  FROM public.vpi_indications i
  WHERE i.partner_id = v_partner.id
    AND i.status     = 'closed'
    AND i.consent_mostrar_na_historia = true
    AND (
      (i.foto_antes_url  IS NOT NULL AND i.foto_antes_url  <> '') OR
      (i.foto_depois_url IS NOT NULL AND i.foto_depois_url <> '') OR
      (i.depoimento      IS NOT NULL AND i.depoimento      <> '')
    );

  RETURN jsonb_build_object(
    'ok',                    true,
    'vidas_transformadas',   v_vidas,
    'stories',               v_stories
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_pub_my_impact(text)
  TO anon, authenticated;

-- ── 4. RPC admin: atualiza story data ───────────────────────
CREATE OR REPLACE FUNCTION public.vpi_indication_story_update(
  p_indication_id uuid,
  p_data          jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_rows int;
BEGIN
  IF p_indication_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  UPDATE public.vpi_indications
     SET depoimento                   = COALESCE(p_data->>'depoimento',       depoimento),
         foto_antes_url               = COALESCE(p_data->>'foto_antes_url',   foto_antes_url),
         foto_depois_url              = COALESCE(p_data->>'foto_depois_url',  foto_depois_url),
         indicada_nome                = COALESCE(p_data->>'indicada_nome',    indicada_nome),
         consent_mostrar_na_historia  = COALESCE(
           (p_data->>'consent_mostrar_na_historia')::boolean,
           consent_mostrar_na_historia
         ),
         updated_at                   = now()
   WHERE id = p_indication_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_indication_story_update(uuid, jsonb)
  TO authenticated;

-- ── 5. RPC admin: list com stories ──────────────────────────
-- Util pra aba admin mostrar indications fechadas e editar stories.
CREATE OR REPLACE FUNCTION public.vpi_indication_stories_list(
  p_partner_id uuid DEFAULT NULL,
  p_limit      int  DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                          i.id,
      'partner_id',                  i.partner_id,
      'partner_nome',                p.nome,
      'procedimento',                i.procedimento,
      'fechada_em',                  i.fechada_em,
      'depoimento',                  i.depoimento,
      'foto_antes_url',              i.foto_antes_url,
      'foto_depois_url',             i.foto_depois_url,
      'indicada_nome',               i.indicada_nome,
      'consent_mostrar_na_historia', i.consent_mostrar_na_historia
    ) ORDER BY i.fechada_em DESC NULLS LAST
  ), '[]'::jsonb) INTO v_rows
  FROM public.vpi_indications i
  LEFT JOIN public.vpi_partners p ON p.id = i.partner_id
  WHERE i.status = 'closed'
    AND (p_partner_id IS NULL OR i.partner_id = p_partner_id)
  LIMIT GREATEST(10, LEAST(500, COALESCE(p_limit, 50)));

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_indication_stories_list(uuid, int)
  TO authenticated;

COMMENT ON COLUMN public.vpi_indications.consent_mostrar_na_historia IS
  'Consent explicito da indicada pra aparecer na historia publica do cartao. Fase 9 Entrega 5.';
COMMENT ON FUNCTION public.vpi_pub_my_impact(text) IS
  'Counter de vidas transformadas + stories consentidas (anonimizadas com primeiro nome). Fase 9 Entrega 5.';
