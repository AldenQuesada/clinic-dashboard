-- ============================================================
-- Migration: VPI Desafios Sazonais (Fase 9 - Entrega 2)
--
-- Multiplier temporario nos creditos durante periodos especificos
-- (Carnaval, Dia das Maes, Black November, etc). Fricção reduzida
-- + FOMO.
--
-- Estrutura:
--   1) Tabela vpi_challenges: slug unico, periodo, multiplier,
--      bonus_fixo, templates WA inicio/fim, is_active.
--   2) 3 seeds desativados como exemplo (Carnaval 2026 1.5x,
--      Mes Maes 1.5x, Black November 2x).
--   3) _vpi_active_challenge() retorna challenge ativo agora.
--   4) vpi_indication_close estendida: aplica multiplier + bonus.
--   5) RPCs admin: vpi_challenge_upsert/list.
--   6) RPC publica: vpi_pub_active_challenge() pra banner do cartao.
--
-- Idempotente.
-- ============================================================

-- ── 1. Tabela vpi_challenges ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vpi_challenges (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  slug                  text NOT NULL,
  titulo                text NOT NULL,
  descricao             text,
  emoji                 text,
  cor                   text DEFAULT '#7C3AED',
  periodo_inicio        timestamptz NOT NULL,
  periodo_fim           timestamptz NOT NULL,
  multiplier            numeric NOT NULL DEFAULT 1.5,
  bonus_fixo            int NOT NULL DEFAULT 0,
  is_active             boolean NOT NULL DEFAULT false,
  msg_template_inicio   text,
  msg_template_fim      text,
  sort_order            int NOT NULL DEFAULT 0,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (multiplier >= 1.0 AND multiplier <= 5.0),
  CHECK (bonus_fixo >= 0),
  CHECK (periodo_fim > periodo_inicio)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vpi_challenges_slug
  ON public.vpi_challenges(clinic_id, slug);
CREATE INDEX IF NOT EXISTS idx_vpi_challenges_active_period
  ON public.vpi_challenges(clinic_id, is_active, periodo_inicio, periodo_fim)
  WHERE is_active = true;

ALTER TABLE public.vpi_challenges ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='vpi_challenges'
       AND policyname='vpi_challenges_all_read'
  ) THEN
    CREATE POLICY vpi_challenges_all_read ON public.vpi_challenges
      FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='vpi_challenges'
       AND policyname='vpi_challenges_all_write'
  ) THEN
    CREATE POLICY vpi_challenges_all_write ON public.vpi_challenges
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 2. Trigger updated_at ───────────────────────────────────
CREATE OR REPLACE FUNCTION public._vpi_challenges_touch_updated()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_vpi_challenges_touch_updated ON public.vpi_challenges;
CREATE TRIGGER trg_vpi_challenges_touch_updated
  BEFORE UPDATE ON public.vpi_challenges
  FOR EACH ROW EXECUTE FUNCTION public._vpi_challenges_touch_updated();

-- ── 3. Seeds desativados ────────────────────────────────────
INSERT INTO public.vpi_challenges (
  slug, titulo, descricao, emoji, cor,
  periodo_inicio, periodo_fim, multiplier, bonus_fixo,
  is_active, msg_template_inicio, msg_template_fim, sort_order
) VALUES
  (
    'carnaval_2026',
    'Carnaval Indicador',
    'Suas indicacoes valem 50% mais durante o carnaval.',
    E'\U0001F389',  -- 🎉
    '#F59E0B',
    '2026-02-07 00:00:00-03',
    '2026-02-14 23:59:59-03',
    1.5, 0, false,
    E'Oi *{{nome}}*! 🎉\n\nComeca agora o *Carnaval Indicador* — suas indicacoes valem *1.5x mais* ate 14/02.\n\nIndique e ganhe mais rapido!',
    E'*{{nome}}*, o Carnaval Indicador terminou! 🎉\n\nObrigada pela sua participacao. Continue indicando — suas recompensas seguem em frente, so sem o bonus.',
    10
  ),
  (
    'dia_maes_2026',
    'Dia das Maes: indique e celebre',
    'Homenagem especial as maes. Creditos em dobro no multiplicador.',
    E'\U0001F497',  -- 💗
    '#EC4899',
    '2026-05-01 00:00:00-03',
    '2026-05-12 23:59:59-03',
    1.5, 0, false,
    E'Oi *{{nome}}*! 💗\n\nComeca o *Dia das Maes* no programa. Suas indicacoes valem *1.5x* ate 12/05.\n\nHomenageie sua mae (e as maes que voce conhece) com um convite especial!',
    E'Obrigada por celebrar o Dia das Maes com a gente, *{{nome}}*! 💗\n\nO bonus acabou, mas suas indicacoes continuam valendo muito.',
    20
  ),
  (
    'black_november_2026',
    'Black November VPI',
    'Uma semana gigante: creditos em DOBRO.',
    E'\U0001F525',  -- 🔥
    '#0A0A0A',
    '2026-11-23 00:00:00-03',
    '2026-11-30 23:59:59-03',
    2.0, 0, false,
    E'Oi *{{nome}}*! 🔥\n\n*BLACK NOVEMBER VPI* comecou — creditos em *DOBRO* ate 30/11.\n\nIndique agora — a oportunidade do ano.',
    E'*{{nome}}*, o Black November acabou! 🔥\n\nFoi uma semana gigante. Suas indicacoes continuam valendo, agora no padrao.',
    30
  )
ON CONFLICT (clinic_id, slug) DO NOTHING;

-- ── 4. Helper: active challenge ─────────────────────────────
CREATE OR REPLACE FUNCTION public._vpi_active_challenge()
RETURNS public.vpi_challenges
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_row public.vpi_challenges%ROWTYPE;
BEGIN
  SELECT * INTO v_row
    FROM public.vpi_challenges
   WHERE is_active = true
     AND now() >= periodo_inicio
     AND now() <= periodo_fim
   ORDER BY sort_order DESC, periodo_inicio DESC
   LIMIT 1;
  RETURN v_row;
END $$;

GRANT EXECUTE ON FUNCTION public._vpi_active_challenge() TO anon, authenticated;

-- ── 5. Hook em vpi_indication_close: aplica multiplier ──────
-- Reconstroi a function preservando comportamento anterior e
-- adicionando challenge multiplier + bonus_fixo.
CREATE OR REPLACE FUNCTION public.vpi_indication_close(
  p_lead_id      text,
  p_appt_id      text DEFAULT NULL,
  p_procedimento text DEFAULT NULL,
  p_is_full_face boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic         uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_ind            public.vpi_indications%ROWTYPE;
  v_partner        public.vpi_partners%ROWTYPE;
  v_tier           public.vpi_reward_tiers%ROWTYPE;
  v_creditos_base  int;
  v_creditos       int;
  v_tiers_hit      jsonb := '[]'::jsonb;
  v_emitted        jsonb;
  v_msg            text;
  v_vars           jsonb;
  v_faltam         int;
  v_can_wa         boolean;
  v_challenge      public.vpi_challenges%ROWTYPE;
  v_ch_applied     boolean := false;
BEGIN
  IF COALESCE(p_lead_id,'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lead_id_required');
  END IF;

  SELECT * INTO v_ind
    FROM public.vpi_indications
   WHERE clinic_id = v_clinic
     AND lead_id   = p_lead_id
     AND status    = 'pending_close'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_indication');
  END IF;

  v_creditos_base := CASE WHEN p_is_full_face THEN 5 ELSE 1 END;
  v_creditos      := v_creditos_base;

  -- Fase 9 Entrega 2: aplica multiplier do challenge ativo
  v_challenge := public._vpi_active_challenge();
  IF v_challenge.id IS NOT NULL THEN
    v_creditos := floor(v_creditos_base * COALESCE(v_challenge.multiplier, 1))::int + COALESCE(v_challenge.bonus_fixo, 0);
    IF v_creditos > v_creditos_base THEN
      v_ch_applied := true;
    END IF;
  END IF;

  UPDATE public.vpi_indications
     SET status       = 'closed',
         fechada_em   = now(),
         creditos     = v_creditos,
         procedimento = COALESCE(p_procedimento, procedimento),
         appt_id      = COALESCE(p_appt_id, appt_id)
   WHERE id = v_ind.id
   RETURNING * INTO v_ind;

  UPDATE public.vpi_partners
     SET creditos_total       = creditos_total + v_creditos,
         creditos_disponiveis = creditos_disponiveis + v_creditos,
         status               = CASE WHEN status = 'convidado' THEN 'ativo' ELSE status END
   WHERE id = v_ind.partner_id
   RETURNING * INTO v_partner;

  -- Audit do challenge (pra rastreabilidade)
  IF v_ch_applied THEN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (v_clinic, 'challenge_applied', 'indication', v_ind.id::text,
      jsonb_build_object(
        'challenge_id',   v_challenge.id,
        'challenge_slug', v_challenge.slug,
        'multiplier',     v_challenge.multiplier,
        'bonus_fixo',     v_challenge.bonus_fixo,
        'creditos_base',  v_creditos_base,
        'creditos_final', v_creditos
      ));
  END IF;

  v_can_wa := (
    v_partner.phone IS NOT NULL
    AND length(regexp_replace(v_partner.phone, '\D','','g')) >= 8
    AND v_partner.status = 'ativo'
    AND v_partner.lgpd_consent_at IS NOT NULL
    AND v_partner.opt_out_at IS NULL
  );

  FOR v_tier IN
    SELECT t.*
      FROM public.vpi_reward_tiers t
     WHERE t.clinic_id = v_clinic
       AND t.is_active = true
       AND t.tipo IN ('per_indication','milestone')
       AND t.threshold <= v_partner.creditos_total
       AND NOT EXISTS (
         SELECT 1 FROM public.vpi_indications i
          WHERE i.partner_id = v_partner.id
            AND i.recompensas_emitidas @> jsonb_build_array(jsonb_build_object('tier_id', t.id::text))
       )
     ORDER BY t.threshold ASC
  LOOP
    v_faltam := GREATEST(0, v_tier.threshold - v_partner.creditos_total);
    v_vars := jsonb_build_object(
      'nome',             split_part(v_partner.nome, ' ', 1),
      'nome_completo',    v_partner.nome,
      'threshold',        v_tier.threshold::text,
      'recompensa',       v_tier.recompensa,
      'creditos_atuais',  v_partner.creditos_total::text,
      'faltam',           v_faltam::text,
      'clinica',          'Clinica Mirian de Paula Beauty & Health'
    );
    v_msg := public._vpi_render(v_tier.msg_template, v_vars);

    -- Se challenge aplicado, acrescenta linha (xN Desafio)
    IF v_ch_applied THEN
      v_msg := v_msg || E'\n\n(x' || v_challenge.multiplier::text || ' Desafio ' || v_challenge.titulo || ')';
    END IF;

    v_emitted := jsonb_build_object(
      'tier_id',     v_tier.id::text,
      'threshold',   v_tier.threshold,
      'recompensa',  v_tier.recompensa,
      'emitted_at',  now()
    );

    UPDATE public.vpi_indications
       SET recompensas_emitidas = recompensas_emitidas || jsonb_build_array(v_emitted)
     WHERE id = v_ind.id;

    v_tiers_hit := v_tiers_hit || jsonb_build_array(v_emitted);

    IF v_can_wa THEN
      BEGIN
        PERFORM public.wa_outbox_schedule_automation(
          v_partner.phone,
          v_msg,
          COALESCE(v_partner.lead_id, v_partner.id::text),
          v_partner.nome,
          now(),
          COALESCE(p_appt_id, v_ind.appt_id),
          NULL, NULL, v_vars
        );
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
        VALUES (v_clinic, 'wa_enqueue_failed', 'indication', v_ind.id::text,
                jsonb_build_object('tier_id', v_tier.id, 'error', SQLERRM));
      END;
    ELSE
      INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
      VALUES (v_clinic, 'tier_wa_skipped_no_consent', 'indication', v_ind.id::text,
              jsonb_build_object('tier_id', v_tier.id,
                                 'partner_id', v_partner.id,
                                 'status', v_partner.status,
                                 'has_consent', v_partner.lgpd_consent_at IS NOT NULL));
    END IF;
  END LOOP;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic, 'close', 'indication', v_ind.id::text,
          jsonb_build_object(
            'partner_id',   v_partner.id,
            'creditos',     v_creditos,
            'creditos_base', v_creditos_base,
            'full_face',    p_is_full_face,
            'tiers_hit',    v_tiers_hit,
            'wa_sent',      v_can_wa,
            'challenge',    CASE WHEN v_ch_applied THEN v_challenge.slug ELSE NULL END
          ));

  RETURN jsonb_build_object(
    'ok',              true,
    'indication_id',   v_ind.id,
    'creditos_added',  v_creditos,
    'creditos_base',   v_creditos_base,
    'challenge',       CASE WHEN v_ch_applied THEN jsonb_build_object(
                            'slug', v_challenge.slug,
                            'titulo', v_challenge.titulo,
                            'multiplier', v_challenge.multiplier,
                            'bonus_fixo', v_challenge.bonus_fixo
                          ) ELSE NULL END,
    'tiers_liberados', v_tiers_hit,
    'partner',         row_to_json(v_partner),
    'wa_sent',         v_can_wa
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_indication_close(text, text, text, boolean)
  TO anon, authenticated;

-- ── 6. RPCs admin: upsert/list ──────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_challenge_upsert(
  p_data jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_id      uuid;
  v_clinic  uuid := '00000000-0000-0000-0000-000000000001';
  v_slug    text;
BEGIN
  IF p_data IS NULL OR (p_data->>'slug') IS NULL OR (p_data->>'titulo') IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_fields');
  END IF;

  v_slug := regexp_replace(lower(trim(p_data->>'slug')), '[^a-z0-9_-]+', '_', 'g');
  v_id   := NULLIF(p_data->>'id', '')::uuid;

  IF v_id IS NULL THEN
    INSERT INTO public.vpi_challenges (
      clinic_id, slug, titulo, descricao, emoji, cor,
      periodo_inicio, periodo_fim,
      multiplier, bonus_fixo, is_active,
      msg_template_inicio, msg_template_fim, sort_order
    ) VALUES (
      v_clinic,
      v_slug,
      p_data->>'titulo',
      p_data->>'descricao',
      p_data->>'emoji',
      COALESCE(p_data->>'cor', '#7C3AED'),
      (p_data->>'periodo_inicio')::timestamptz,
      (p_data->>'periodo_fim')::timestamptz,
      COALESCE((p_data->>'multiplier')::numeric, 1.5),
      COALESCE((p_data->>'bonus_fixo')::int, 0),
      COALESCE((p_data->>'is_active')::boolean, false),
      p_data->>'msg_template_inicio',
      p_data->>'msg_template_fim',
      COALESCE((p_data->>'sort_order')::int, 0)
    )
    ON CONFLICT (clinic_id, slug) DO UPDATE
      SET titulo             = EXCLUDED.titulo,
          descricao          = EXCLUDED.descricao,
          emoji              = EXCLUDED.emoji,
          cor                = EXCLUDED.cor,
          periodo_inicio     = EXCLUDED.periodo_inicio,
          periodo_fim        = EXCLUDED.periodo_fim,
          multiplier         = EXCLUDED.multiplier,
          bonus_fixo         = EXCLUDED.bonus_fixo,
          is_active          = EXCLUDED.is_active,
          msg_template_inicio = EXCLUDED.msg_template_inicio,
          msg_template_fim    = EXCLUDED.msg_template_fim,
          sort_order         = EXCLUDED.sort_order,
          updated_at         = now()
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.vpi_challenges
       SET slug                = v_slug,
           titulo              = p_data->>'titulo',
           descricao           = p_data->>'descricao',
           emoji               = p_data->>'emoji',
           cor                 = COALESCE(p_data->>'cor', cor),
           periodo_inicio      = (p_data->>'periodo_inicio')::timestamptz,
           periodo_fim         = (p_data->>'periodo_fim')::timestamptz,
           multiplier          = COALESCE((p_data->>'multiplier')::numeric, multiplier),
           bonus_fixo          = COALESCE((p_data->>'bonus_fixo')::int, bonus_fixo),
           is_active           = COALESCE((p_data->>'is_active')::boolean, is_active),
           msg_template_inicio = p_data->>'msg_template_inicio',
           msg_template_fim    = p_data->>'msg_template_fim',
           sort_order          = COALESCE((p_data->>'sort_order')::int, sort_order),
           updated_at          = now()
     WHERE id = v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_challenge_upsert(jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.vpi_challenge_list()
RETURNS SETOF public.vpi_challenges
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT * FROM public.vpi_challenges
   ORDER BY sort_order DESC, periodo_inicio DESC;
$$;

GRANT EXECUTE ON FUNCTION public.vpi_challenge_list() TO authenticated;

CREATE OR REPLACE FUNCTION public.vpi_challenge_delete(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  DELETE FROM public.vpi_challenges WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_challenge_delete(uuid) TO authenticated;

-- ── 7. RPC publica: banner do cartao ────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_pub_active_challenge()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_ch public.vpi_challenges%ROWTYPE;
BEGIN
  v_ch := public._vpi_active_challenge();
  IF v_ch.id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'active', false);
  END IF;
  RETURN jsonb_build_object(
    'ok',            true,
    'active',        true,
    'slug',          v_ch.slug,
    'titulo',        v_ch.titulo,
    'descricao',     v_ch.descricao,
    'emoji',         v_ch.emoji,
    'cor',           v_ch.cor,
    'multiplier',    v_ch.multiplier,
    'bonus_fixo',    v_ch.bonus_fixo,
    'periodo_fim',   v_ch.periodo_fim
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_pub_active_challenge() TO anon, authenticated;

COMMENT ON TABLE public.vpi_challenges IS
  'Desafios sazonais: multiplier temporario em indicacoes. Fase 9 Entrega 2.';
COMMENT ON FUNCTION public._vpi_active_challenge() IS
  'Retorna challenge ativo agora (maior sort_order se multiplos). Fase 9 Entrega 2.';
