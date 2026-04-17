-- ============================================================
-- Migration: VPI Card Tokens - Cartao Digital de Embaixadora Fase 1
--
-- Adiciona campos de identidade premium em vpi_partners:
--   card_token  - slug hex16 unico para URL publica
--   avatar_url  - foto opcional
--   tier_atual  - bronze|prata|ouro|diamante (calculado)
--   streak_meses - meses consecutivos indicando
--   numero_membro - serial crescente por clinica
--   short_link_slug - slug usado no sistema short_links
--
-- Cria RPC publica vpi_pub_get_card(p_token) que retorna
-- partner + timeline + next_tier + ranking_pos (SECURITY DEFINER,
-- anon-executable). Bump tiers calculados via _vpi_calc_tier.
--
-- Trigger BEFORE INSERT gera token + numero_membro automatico.
-- Trigger BEFORE UPDATE recalcula tier_atual quando creditos mudam.
--
-- Idempotente: IF NOT EXISTS, CREATE OR REPLACE.
-- ============================================================

-- ── 1. Sequence para numero_membro ──────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.vpi_partners_membro_seq
  START WITH 1 INCREMENT BY 1;

-- ── 2. Colunas novas em vpi_partners ────────────────────────
ALTER TABLE public.vpi_partners
  ADD COLUMN IF NOT EXISTS card_token      text UNIQUE,
  ADD COLUMN IF NOT EXISTS avatar_url      text,
  ADD COLUMN IF NOT EXISTS tier_atual      text,
  ADD COLUMN IF NOT EXISTS streak_meses    int  NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS numero_membro   int,
  ADD COLUMN IF NOT EXISTS short_link_slug text;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
     WHERE constraint_schema='public' AND constraint_name='vpi_partners_tier_chk'
  ) THEN
    ALTER TABLE public.vpi_partners
      ADD CONSTRAINT vpi_partners_tier_chk
      CHECK (tier_atual IS NULL OR tier_atual IN ('bronze','prata','ouro','diamante'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vpi_partners_token
  ON public.vpi_partners(card_token) WHERE card_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vpi_partners_tier
  ON public.vpi_partners(clinic_id, tier_atual);

-- ── 3. Helper: calcula tier a partir de creditos_total ──────
CREATE OR REPLACE FUNCTION public._vpi_calc_tier(p_creditos int)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN COALESCE(p_creditos,0) >= 50 THEN 'diamante'
    WHEN COALESCE(p_creditos,0) >= 15 THEN 'ouro'
    WHEN COALESCE(p_creditos,0) >= 5  THEN 'prata'
    ELSE 'bronze'
  END;
$$;

-- ── 4. Helper: gera slug a partir do nome ───────────────────
CREATE OR REPLACE FUNCTION public._vpi_slugify(p_text text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT lower(
    regexp_replace(
      regexp_replace(
        translate(COALESCE(p_text,''),
          'ÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇáàãâäéèêëíìîïóòõôöúùûüç',
          'AAAAAEEEEIIIIOOOOOUUUUCaaaaaeeeeiiiiooooouuuuc'),
        '[^a-zA-Z0-9]+', '-', 'g'),
      '(^-+|-+$)', '', 'g')
  );
$$;

-- ── 5. Trigger: seta token + numero_membro + tier no INSERT ─
CREATE OR REPLACE FUNCTION public._vpi_partner_before_insert()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.card_token IS NULL OR NEW.card_token = '' THEN
    NEW.card_token := encode(gen_random_bytes(12), 'hex');
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

DROP TRIGGER IF EXISTS trg_vpi_partner_before_insert ON public.vpi_partners;
CREATE TRIGGER trg_vpi_partner_before_insert
  BEFORE INSERT ON public.vpi_partners
  FOR EACH ROW EXECUTE FUNCTION public._vpi_partner_before_insert();

-- ── 6. Trigger: recalcula tier_atual quando creditos mudam ──
CREATE OR REPLACE FUNCTION public._vpi_partner_before_update_tier()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.creditos_total IS DISTINCT FROM OLD.creditos_total THEN
    NEW.tier_atual := public._vpi_calc_tier(NEW.creditos_total);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_partner_before_update_tier ON public.vpi_partners;
CREATE TRIGGER trg_vpi_partner_before_update_tier
  BEFORE UPDATE ON public.vpi_partners
  FOR EACH ROW EXECUTE FUNCTION public._vpi_partner_before_update_tier();

-- ── 7. Backfill idempotente para registros antigos ──────────
UPDATE public.vpi_partners
   SET card_token = encode(gen_random_bytes(12), 'hex')
 WHERE card_token IS NULL;

UPDATE public.vpi_partners
   SET tier_atual = public._vpi_calc_tier(creditos_total)
 WHERE tier_atual IS NULL;

UPDATE public.vpi_partners
   SET numero_membro = nextval('public.vpi_partners_membro_seq')
 WHERE numero_membro IS NULL;

UPDATE public.vpi_partners
   SET short_link_slug = 'emb-' || public._vpi_slugify(split_part(COALESCE(nome,'parceira'),' ',1))
                         || '-' || substring(card_token, 1, 6)
 WHERE short_link_slug IS NULL;

-- Alinha a sequence para evitar colisoes futuras
SELECT setval('public.vpi_partners_membro_seq',
              GREATEST(COALESCE((SELECT MAX(numero_membro) FROM public.vpi_partners), 0), 1),
              true);

-- ── 8. RPC publica: vpi_pub_get_card ────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_pub_get_card(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner      public.vpi_partners%ROWTYPE;
  v_indications  jsonb;
  v_next_tier    jsonb;
  v_ranking_pos  int;
  v_total_partners int;
  v_ind_mes      int;
  v_faltam       int;
BEGIN
  IF COALESCE(p_token,'') = '' THEN
    RETURN jsonb_build_object('error','invalid_token');
  END IF;

  SELECT * INTO v_partner
    FROM public.vpi_partners
   WHERE card_token = p_token
     AND status <> 'inativo'
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('error','not_found');
  END IF;

  -- Timeline - ultimas 20 indicacoes (sem PII de outros leads)
  SELECT COALESCE(jsonb_agg(row_to_json(i.*)), '[]'::jsonb)
    INTO v_indications
    FROM (
      SELECT id, procedimento, creditos, status, fechada_em, created_at
        FROM public.vpi_indications
       WHERE partner_id = v_partner.id
       ORDER BY COALESCE(fechada_em, created_at) DESC
       LIMIT 20
    ) i;

  -- Proximo tier
  SELECT jsonb_build_object(
           'threshold',   t.threshold,
           'recompensa',  t.recompensa,
           'faltam',      GREATEST(0, t.threshold - v_partner.creditos_total),
           'tipo',        t.tipo
         )
    INTO v_next_tier
    FROM public.vpi_reward_tiers t
   WHERE t.clinic_id = v_partner.clinic_id
     AND t.is_active = true
     AND t.tipo IN ('milestone','per_indication')
     AND t.threshold > v_partner.creditos_total
   ORDER BY t.threshold ASC
   LIMIT 1;

  -- Indicacoes do mes (do partner)
  SELECT COUNT(*)::int INTO v_ind_mes
    FROM public.vpi_indications
   WHERE partner_id = v_partner.id
     AND status = 'closed'
     AND fechada_em >= date_trunc('month', now());

  -- Posicao no ranking mensal (1-based, ties share highest pos)
  SELECT COUNT(*)+1 INTO v_ranking_pos
    FROM (
      SELECT p2.id,
        (SELECT COUNT(*) FROM public.vpi_indications i2
          WHERE i2.partner_id=p2.id AND i2.status='closed'
            AND i2.fechada_em >= date_trunc('month', now())) AS cnt
        FROM public.vpi_partners p2
       WHERE p2.clinic_id=v_partner.clinic_id AND p2.status='ativo'
    ) q
   WHERE q.cnt > v_ind_mes;

  SELECT COUNT(*)::int INTO v_total_partners
    FROM public.vpi_partners
   WHERE clinic_id = v_partner.clinic_id AND status='ativo';

  RETURN jsonb_build_object(
    'partner', jsonb_build_object(
      'id',             v_partner.id,
      'nome',           v_partner.nome,
      'avatar_url',     v_partner.avatar_url,
      'tier_atual',     v_partner.tier_atual,
      'creditos_total', v_partner.creditos_total,
      'creditos_disponiveis', v_partner.creditos_disponiveis,
      'numero_membro',  v_partner.numero_membro,
      'streak_meses',   v_partner.streak_meses,
      'short_link_slug', v_partner.short_link_slug,
      'created_at',     v_partner.created_at
    ),
    'indications',     v_indications,
    'next_tier',       v_next_tier,
    'ranking_pos',     v_ranking_pos,
    'ind_mes',         v_ind_mes,
    'total_partners',  v_total_partners,
    'fetched_at',      now()
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_pub_get_card(text) TO anon, authenticated;

-- ── 9. RPC auxiliar: atualiza short_link_slug (uso interno) ─
CREATE OR REPLACE FUNCTION public.vpi_partner_set_short_slug(
  p_partner_id uuid,
  p_slug       text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.vpi_partners
     SET short_link_slug = p_slug
   WHERE id = p_partner_id;
  RETURN FOUND;
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_partner_set_short_slug(uuid,text) TO authenticated;

-- ── 10. Atualiza template WA convite para incluir link ──────
UPDATE public.wa_agenda_automations
   SET content_template = E'Ola {{nome}}! \U0001F31F\n\nPassando para te dar uma otima noticia!\n\nVoce foi aprovada para o *Programa de Parceiros da Clinica Mirian de Paula Beauty & Health*! \U0001F389\n\nA cada 5 amigas que voce indicar e realizarem um procedimento conosco, voce ganha *1 Sessao de Fotona 4D* - o melhor protocolo de rejuvenescimento facial do mundo.\n\nSeu Cartao Digital de Embaixadora esta pronto:\n{{link_cartao}}\n\nAbra agora e veja seu tier, seu progresso e comece a indicar com 1 toque.'
 WHERE slug = 'vpi_convite_parceiro'
   AND content_template NOT LIKE '%{{link_cartao}}%';
