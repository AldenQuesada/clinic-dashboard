-- ============================================================
-- Migration: VPI Hierarquia Multilevel / Linhagem (Fase 8 - Entrega 6)
--
-- "A indicou B. B virou parceira. B indica C.
--  A ganha bonus reduzido (30%) sobre as indicacoes de B."
--
-- Lever de viralidade, com guardrails anti-piramidação:
--   - SOMENTE 1 nivel de cascata (nao cascateia pro avo)
--   - 30% fixo (nao progressivo)
--   - Limite 10 creditos cascata/ano
--   - Anti-ciclo: parent.referred_by_partner_id != partner.id
--   - Creditos cascata NAO destravam tiers high_performance
--     (so contam pra classes de score, nao pra milestones)
--
-- Estrutura:
--   - Coluna referred_by_partner_id em vpi_partners
--   - Coluna creditos_cascata_ano int NOT NULL DEFAULT 0
--   - Logica inline em vpi_indication_close (wrapping)
--   - RPC publica vpi_pub_partner_lineage(token) pra UI
--
-- Idempotente.
-- ============================================================

-- ── 1. Colunas em vpi_partners ──────────────────────────────
ALTER TABLE public.vpi_partners
  ADD COLUMN IF NOT EXISTS referred_by_partner_id uuid,
  ADD COLUMN IF NOT EXISTS creditos_cascata_ano   int NOT NULL DEFAULT 0;

-- FK com ON DELETE SET NULL (manual, idempotente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
     WHERE table_schema='public' AND table_name='vpi_partners'
       AND constraint_name='vpi_partners_referred_by_fk'
  ) THEN
    ALTER TABLE public.vpi_partners
      ADD CONSTRAINT vpi_partners_referred_by_fk
      FOREIGN KEY (referred_by_partner_id)
      REFERENCES public.vpi_partners(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_vpi_partners_referred_by
  ON public.vpi_partners(clinic_id, referred_by_partner_id)
  WHERE referred_by_partner_id IS NOT NULL;

-- ── 2. Trigger para setar referred_by_partner_id no autoEnroll ──
-- Quando um novo partner e criado, verifica se o lead veio de uma
-- indication anterior. Se sim, popula o campo parent.
CREATE OR REPLACE FUNCTION public._vpi_partner_set_lineage()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_parent uuid;
BEGIN
  IF NEW.lead_id IS NULL OR NEW.lead_id = '' THEN RETURN NEW; END IF;
  IF NEW.referred_by_partner_id IS NOT NULL THEN RETURN NEW; END IF;

  -- Busca indication (qualquer status) que aponta esse lead
  SELECT partner_id INTO v_parent
    FROM public.vpi_indications
   WHERE clinic_id = NEW.clinic_id
     AND lead_id   = NEW.lead_id
   ORDER BY created_at ASC
   LIMIT 1;

  -- Anti-ciclo: parent nao pode ser o proprio partner
  IF v_parent IS NOT NULL AND v_parent <> NEW.id THEN
    NEW.referred_by_partner_id := v_parent;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_partner_set_lineage ON public.vpi_partners;

CREATE TRIGGER trg_vpi_partner_set_lineage
  BEFORE INSERT ON public.vpi_partners
  FOR EACH ROW
  EXECUTE FUNCTION public._vpi_partner_set_lineage();

-- Backfill retroativo: tentar popular existentes (one-shot, idempotente)
UPDATE public.vpi_partners p
   SET referred_by_partner_id = ind.partner_id
  FROM public.vpi_indications ind
 WHERE p.referred_by_partner_id IS NULL
   AND p.lead_id IS NOT NULL
   AND ind.lead_id  = p.lead_id
   AND ind.clinic_id = p.clinic_id
   AND ind.partner_id <> p.id;

-- ── 3. Helper: credita cascata 30% pro parent ────────────────
CREATE OR REPLACE FUNCTION public._vpi_credit_cascade(
  p_partner_id uuid,  -- a embaixadora que indicou (filha)
  p_creditos   int    -- os creditos da indication base (1 ou 5)
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_child   record;
  v_parent  record;
  v_grant   int;
  v_limit   int := 10;    -- limite anual de creditos cascata
  v_share   numeric := 0.30;
BEGIN
  IF p_creditos <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'zero_credits');
  END IF;

  SELECT * INTO v_child FROM public.vpi_partners WHERE id = p_partner_id;
  IF NOT FOUND OR v_child.referred_by_partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_parent');
  END IF;

  -- Anti-ciclo
  IF v_child.referred_by_partner_id = v_child.id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'self_ref');
  END IF;

  SELECT * INTO v_parent FROM public.vpi_partners WHERE id = v_child.referred_by_partner_id;
  IF NOT FOUND OR v_parent.status = 'inativo' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'parent_inactive');
  END IF;

  -- Limite anual
  IF COALESCE(v_parent.creditos_cascata_ano, 0) >= v_limit THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'limit_reached',
      'atual', COALESCE(v_parent.creditos_cascata_ano, 0), 'limit', v_limit);
  END IF;

  v_grant := GREATEST(1, floor(p_creditos * v_share)::int);
  -- Nao ultrapassar o limite
  IF COALESCE(v_parent.creditos_cascata_ano, 0) + v_grant > v_limit THEN
    v_grant := v_limit - COALESCE(v_parent.creditos_cascata_ano, 0);
  END IF;

  IF v_grant <= 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_at_limit');
  END IF;

  UPDATE public.vpi_partners
     SET creditos_total        = COALESCE(creditos_total, 0)        + v_grant,
         creditos_cascata_ano  = COALESCE(creditos_cascata_ano, 0)  + v_grant,
         updated_at            = now()
   WHERE id = v_parent.id;

  -- Audit pra ter rastreabilidade do cascade
  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (
    v_parent.clinic_id, 'cascade_credit', 'partner', v_parent.id::text,
    jsonb_build_object(
      'from_partner_id',   v_child.id,
      'from_partner_nome', v_child.nome,
      'creditos_base',     p_creditos,
      'creditos_cascata',  v_grant,
      'cascata_ano_total', COALESCE(v_parent.creditos_cascata_ano, 0) + v_grant
    )
  );

  -- Fire-and-forget WA opcional — so pro parent ativo com consent LGPD
  IF v_parent.phone IS NOT NULL
     AND length(regexp_replace(v_parent.phone, '\D','','g')) >= 8
     AND v_parent.status = 'ativo'
     AND v_parent.lgpd_consent_at IS NOT NULL
     AND v_parent.opt_out_at IS NULL
  THEN
    BEGIN
      PERFORM public.wa_outbox_schedule_automation(
        v_parent.phone,
        'Oi *' || split_part(v_parent.nome, ' ', 1) || '*! ' ||
        E'\n\nAlguem da sua familia trouxe uma indicacao — voce ganhou *' ||
        v_grant || E' credito(s) cascata*!\n\nSeu saldo continua crescendo ' ||
        E'mesmo quando suas filhas indicam. ' ||
        '(Ja usou ' || (COALESCE(v_parent.creditos_cascata_ano, 0) + v_grant) || ' de ' || v_limit || ' do limite anual)',
        COALESCE(v_parent.lead_id, v_parent.id::text),
        v_parent.nome,
        now(),
        NULL, NULL, NULL,
        jsonb_build_object('cascade', true, 'from_partner', v_child.nome)
      );
    EXCEPTION WHEN OTHERS THEN NULL; END;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'parent_id',        v_parent.id,
    'creditos_cascata', v_grant,
    'cascata_ano_total', COALESCE(v_parent.creditos_cascata_ano, 0) + v_grant,
    'limit',            v_limit
  );
END $$;

GRANT EXECUTE ON FUNCTION public._vpi_credit_cascade(uuid, int) TO authenticated;

-- ── 4. Trigger AFTER UPDATE em vpi_indications ──────────────
-- Quando indication status mudar pra 'closed', disparar cascade.
-- Nao modificamos vpi_indication_close diretamente pra evitar
-- quebrar compat retroativa.
CREATE OR REPLACE FUNCTION public._vpi_trigger_cascade_on_close()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'closed' AND (OLD.status IS NULL OR OLD.status <> 'closed') THEN
    BEGIN
      PERFORM public._vpi_credit_cascade(NEW.partner_id, COALESCE(NEW.creditos, 1));
    EXCEPTION WHEN OTHERS THEN
      -- Fire-and-forget: nao quebra a indication
      NULL;
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_cascade_on_close ON public.vpi_indications;

CREATE TRIGGER trg_vpi_cascade_on_close
  AFTER UPDATE ON public.vpi_indications
  FOR EACH ROW
  EXECUTE FUNCTION public._vpi_trigger_cascade_on_close();

-- ── 5. RPC publica: linhagem do partner ─────────────────────
CREATE OR REPLACE FUNCTION public.vpi_pub_partner_lineage(
  p_token text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner        record;
  v_filhas_diretas jsonb;
  v_netas_flat     jsonb;
  v_total          int;
BEGIN
  IF p_token IS NULL OR p_token = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_token');
  END IF;

  SELECT * INTO v_partner FROM public.vpi_partners WHERE card_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Filhas diretas
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',           f.id,
      'nome',         f.nome,
      'avatar_url',   f.avatar_url,
      'tier_atual',   f.tier_atual,
      'created_at',   f.created_at,
      'card_token',   f.card_token,
      'netas_count',  (
        SELECT COUNT(*)::int FROM public.vpi_partners n
         WHERE n.referred_by_partner_id = f.id
           AND n.status <> 'inativo'
      )
    )
    ORDER BY f.created_at ASC
  ), '[]'::jsonb) INTO v_filhas_diretas
  FROM public.vpi_partners f
  WHERE f.referred_by_partner_id = v_partner.id
    AND f.status <> 'inativo';

  -- Netas (filhas das filhas) - so nome/avatar flat pra UI
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',               n.id,
      'nome',             n.nome,
      'avatar_url',       n.avatar_url,
      'tier_atual',       n.tier_atual,
      'mae_partner_id',   n.referred_by_partner_id
    )
    ORDER BY n.created_at ASC
  ), '[]'::jsonb) INTO v_netas_flat
  FROM public.vpi_partners n
  WHERE n.referred_by_partner_id IN (
    SELECT f.id FROM public.vpi_partners f
     WHERE f.referred_by_partner_id = v_partner.id
       AND f.status <> 'inativo'
  )
  AND n.status <> 'inativo';

  SELECT jsonb_array_length(v_filhas_diretas) + jsonb_array_length(v_netas_flat) INTO v_total;

  RETURN jsonb_build_object(
    'ok',                      true,
    'partner_id',              v_partner.id,
    'filhas_diretas',          v_filhas_diretas,
    'netas',                   v_netas_flat,
    'total_embaixadoras_familia', COALESCE(v_total, 0),
    'creditos_cascata_ano',    COALESCE(v_partner.creditos_cascata_ano, 0),
    'limite_cascata_ano',      10
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_pub_partner_lineage(text) TO anon, authenticated;

COMMENT ON FUNCTION public._vpi_credit_cascade(uuid, int) IS
  'Credita 30% cascata pro parent da partner (1 nivel). Limite 10/ano. Anti-ciclo. WA opcional se consent. Fase 8 Entrega 6.';
COMMENT ON FUNCTION public.vpi_pub_partner_lineage(text) IS
  'Retorna linhagem 2 niveis (filhas diretas + netas) para UI do cartao. Fase 8 Entrega 6.';
