-- ============================================================
-- Migration: VPI Fotona Transferivel + Troca (Fase 8 - Entrega 5)
--
-- Doc oficial prevê: apos 3 Fotonas/ano, parceira pode transferir
-- para terceiro OU trocar por outro protocolo (smooth_eyes, nx_runner,
-- estrias, capilar, intimo, depilacao, generico).
--
-- Implementacao:
--   1. Colunas em vpi_partners: fotonas_transferidas / fotonas_trocadas
--   2. RPCs publicas vpi_pub_fotona_transfer(token, dest, numero)
--      e vpi_pub_fotona_exchange(token, protocolo, numero)
--   3. Valida: Fotona numero "alcancada" (fotonas_usadas_ano >= n-1)
--   4. Envia WA confirmacao via _wa_render_template + outbox
--   5. Audit log
--
-- Idempotente: IF NOT EXISTS + CREATE OR REPLACE.
-- ============================================================

-- ── 1. Colunas em vpi_partners ──────────────────────────────
ALTER TABLE public.vpi_partners
  ADD COLUMN IF NOT EXISTS fotonas_transferidas jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS fotonas_trocadas     jsonb NOT NULL DEFAULT '[]'::jsonb;

-- ── 2. Template WA de confirmacao (idempotente) ──────────────
DO $$
DECLARE v_exists boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.wa_agenda_automations WHERE slug='vpi_fotona_transfer') INTO v_exists;
  IF NOT v_exists THEN
    INSERT INTO public.wa_agenda_automations (
      slug, name, category, channel, trigger_type, trigger_config,
      recipient_type, is_active, content_template, description, clinic_id
    ) VALUES (
      'vpi_fotona_transfer',
      'VPI - Fotona transferida',
      'pos', 'whatsapp', 'on_demand', '{}'::jsonb, 'patient', true,
      E'Oi *{{nome}}*!\n\nSua Fotona 4D #{{numero}} foi *transferida* para {{destinatario}}.\n\nA pessoa recebera o contato para agendar. Obrigada pela generosidade!',
      'Enviado quando embaixadora transfere Fotona (doc oficial).',
      '00000000-0000-0000-0000-000000000001'::uuid
    );
  END IF;

  SELECT EXISTS(SELECT 1 FROM public.wa_agenda_automations WHERE slug='vpi_fotona_exchange') INTO v_exists;
  IF NOT v_exists THEN
    INSERT INTO public.wa_agenda_automations (
      slug, name, category, channel, trigger_type, trigger_config,
      recipient_type, is_active, content_template, description, clinic_id
    ) VALUES (
      'vpi_fotona_exchange',
      'VPI - Fotona trocada por outro protocolo',
      'pos', 'whatsapp', 'on_demand', '{}'::jsonb, 'patient', true,
      E'Oi *{{nome}}*!\n\nSua Fotona 4D #{{numero}} foi *trocada* por *{{protocolo}}*.\n\nJa pode agendar quando quiser!',
      'Enviado quando embaixadora troca Fotona por outro protocolo.',
      '00000000-0000-0000-0000-000000000001'::uuid
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Templates WA vpi_fotona_*: skip (%)', SQLERRM;
END $$;

-- ── 3. Helper para enviar WA de confirmacao ─────────────────
CREATE OR REPLACE FUNCTION public._vpi_send_fotona_notification(
  p_partner_id uuid,
  p_slug       text,
  p_vars       jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner  record;
  v_tpl_id   uuid;
  v_tpl_body text;
  v_content  text;
BEGIN
  SELECT * INTO v_partner FROM public.vpi_partners WHERE id=p_partner_id;
  IF NOT FOUND OR COALESCE(v_partner.phone, '') = '' THEN RETURN; END IF;

  -- LGPD gating
  IF v_partner.status <> 'ativo' OR v_partner.lgpd_consent_at IS NULL OR v_partner.opt_out_at IS NOT NULL THEN
    RETURN;
  END IF;

  SELECT id, content_template INTO v_tpl_id, v_tpl_body
    FROM public.wa_agenda_automations
   WHERE slug = p_slug AND is_active = true
   LIMIT 1;

  IF v_tpl_id IS NULL THEN RETURN; END IF;

  BEGIN
    v_content := public._wa_render_template(v_tpl_body, p_vars);
  EXCEPTION WHEN OTHERS THEN
    v_content := v_tpl_body;
  END;

  BEGIN
    PERFORM public.wa_outbox_schedule_automation(
      p_phone         => v_partner.phone,
      p_content       => v_content,
      p_lead_id       => COALESCE(v_partner.lead_id, v_partner.id::text),
      p_lead_name     => COALESCE(v_partner.nome, ''),
      p_scheduled_at  => now(),
      p_appt_ref      => NULL,
      p_rule_id       => v_tpl_id,
      p_ab_variant    => NULL,
      p_vars_snapshot => p_vars
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

-- ── 4. RPC publica: transferir Fotona ───────────────────────
CREATE OR REPLACE FUNCTION public.vpi_pub_fotona_transfer(
  p_token          text,
  p_to_partner_token text DEFAULT NULL,
  p_external       jsonb DEFAULT NULL,
  p_fotona_numero  int  DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner     record;
  v_dest        record;
  v_entry       jsonb;
  v_dest_label  text;
  v_already     boolean;
BEGIN
  IF p_token IS NULL OR p_fotona_numero IS NULL OR p_fotona_numero < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  SELECT * INTO v_partner FROM public.vpi_partners WHERE card_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  -- Valida: Fotona numero alcancada
  IF p_fotona_numero > COALESCE(v_partner.fotonas_usadas_ano, 0) + 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_unlocked',
      'unlocked_until', COALESCE(v_partner.fotonas_usadas_ano, 0) + 1);
  END IF;

  -- Valida: Fotona numero ja transferida/trocada
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_partner.fotonas_transferidas, '[]'::jsonb)) x
     WHERE (x->>'fotona_numero')::int = p_fotona_numero
  ) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_transferred');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_partner.fotonas_trocadas, '[]'::jsonb)) x
     WHERE (x->>'fotona_numero')::int = p_fotona_numero
  ) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_exchanged');
  END IF;

  -- Resolver destinatario
  IF p_to_partner_token IS NOT NULL AND length(p_to_partner_token) > 0 THEN
    SELECT * INTO v_dest FROM public.vpi_partners WHERE card_token = p_to_partner_token;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'dest_partner_not_found');
    END IF;
    v_dest_label := COALESCE(v_dest.nome, 'Parceira');
    v_entry := jsonb_build_object(
      'to_partner_id',   v_dest.id,
      'external_nome',   NULL,
      'external_phone',  NULL,
      'fotona_numero',   p_fotona_numero,
      'transferred_at',  now()
    );
  ELSIF p_external IS NOT NULL
    AND COALESCE(p_external->>'nome', '') <> ''
    AND COALESCE(p_external->>'phone', '') <> ''
  THEN
    v_dest_label := p_external->>'nome';
    v_entry := jsonb_build_object(
      'to_partner_id',   NULL,
      'external_nome',   p_external->>'nome',
      'external_phone',  regexp_replace(p_external->>'phone', '\D', '', 'g'),
      'fotona_numero',   p_fotona_numero,
      'transferred_at',  now()
    );
  ELSE
    RETURN jsonb_build_object('ok', false, 'reason', 'missing_destination');
  END IF;

  -- Grava
  UPDATE public.vpi_partners
     SET fotonas_transferidas = COALESCE(fotonas_transferidas, '[]'::jsonb) || jsonb_build_array(v_entry),
         fotonas_usadas_ano   = GREATEST(COALESCE(fotonas_usadas_ano, 0), p_fotona_numero),
         updated_at           = now()
   WHERE id = v_partner.id;

  -- WA confirmacao (fire-and-forget)
  PERFORM public._vpi_send_fotona_notification(
    v_partner.id,
    'vpi_fotona_transfer',
    jsonb_build_object(
      'nome',          split_part(COALESCE(v_partner.nome, 'Parceira'), ' ', 1),
      'numero',        p_fotona_numero::text,
      'destinatario',  v_dest_label
    )
  );

  -- Audit
  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (
    v_partner.clinic_id, 'fotona_transferred', 'partner', v_partner.id::text,
    jsonb_build_object('entry', v_entry, 'destinatario', v_dest_label)
  );

  RETURN jsonb_build_object('ok', true, 'entry', v_entry);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_pub_fotona_transfer(text, text, jsonb, int) TO anon, authenticated;

-- ── 5. RPC publica: trocar Fotona por outro protocolo ───────
CREATE OR REPLACE FUNCTION public.vpi_pub_fotona_exchange(
  p_token          text,
  p_protocolo      text,
  p_fotona_numero  int
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner      record;
  v_valid        text[] := ARRAY['smooth_eyes','nx_runner','estrias','capilar','intimo','depilacao','generico'];
  v_already      boolean;
  v_entry        jsonb;
BEGIN
  IF p_token IS NULL OR p_protocolo IS NULL OR p_fotona_numero IS NULL OR p_fotona_numero < 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_input');
  END IF;

  IF NOT (p_protocolo = ANY (v_valid)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_protocol', 'valid', to_jsonb(v_valid));
  END IF;

  SELECT * INTO v_partner FROM public.vpi_partners WHERE card_token = p_token;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  IF p_fotona_numero > COALESCE(v_partner.fotonas_usadas_ano, 0) + 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_unlocked');
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_partner.fotonas_transferidas, '[]'::jsonb)) x
     WHERE (x->>'fotona_numero')::int = p_fotona_numero
  ) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_transferred');
  END IF;
  SELECT EXISTS (
    SELECT 1 FROM jsonb_array_elements(COALESCE(v_partner.fotonas_trocadas, '[]'::jsonb)) x
     WHERE (x->>'fotona_numero')::int = p_fotona_numero
  ) INTO v_already;
  IF v_already THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_exchanged');
  END IF;

  v_entry := jsonb_build_object(
    'protocolo',     p_protocolo,
    'fotona_numero', p_fotona_numero,
    'exchanged_at',  now()
  );

  UPDATE public.vpi_partners
     SET fotonas_trocadas    = COALESCE(fotonas_trocadas, '[]'::jsonb) || jsonb_build_array(v_entry),
         fotonas_usadas_ano  = GREATEST(COALESCE(fotonas_usadas_ano, 0), p_fotona_numero),
         updated_at          = now()
   WHERE id = v_partner.id;

  PERFORM public._vpi_send_fotona_notification(
    v_partner.id,
    'vpi_fotona_exchange',
    jsonb_build_object(
      'nome',       split_part(COALESCE(v_partner.nome, 'Parceira'), ' ', 1),
      'numero',     p_fotona_numero::text,
      'protocolo',  CASE p_protocolo
        WHEN 'smooth_eyes' THEN 'Smooth Eyes (olheiras)'
        WHEN 'nx_runner'   THEN 'NX Runner (peeling laser)'
        WHEN 'estrias'     THEN 'Laser para estrias'
        WHEN 'capilar'     THEN 'Laser capilar'
        WHEN 'intimo'      THEN 'Laser intimo'
        WHEN 'depilacao'   THEN 'Depilacao a laser'
        ELSE                    'Protocolo Fotona generico'
      END
    )
  );

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (
    v_partner.clinic_id, 'fotona_exchanged', 'partner', v_partner.id::text,
    jsonb_build_object('entry', v_entry)
  );

  RETURN jsonb_build_object('ok', true, 'entry', v_entry);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_pub_fotona_exchange(text, text, int) TO anon, authenticated;

-- ── 6. Estender vpi_pub_get_card com info de Fotonas ───────
CREATE OR REPLACE FUNCTION public.vpi_pub_get_card(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner      public.vpi_partners%ROWTYPE;
  v_indications  jsonb;
  v_next_tier    jsonb;
  v_ranking_pos  int;
  v_total_partners int;
  v_ind_mes      int;
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

  SELECT COALESCE(jsonb_agg(row_to_json(i.*)), '[]'::jsonb)
    INTO v_indications
    FROM (
      SELECT id, procedimento, creditos, status, fechada_em, created_at
        FROM public.vpi_indications
       WHERE partner_id = v_partner.id
       ORDER BY COALESCE(fechada_em, created_at) DESC
       LIMIT 20
    ) i;

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

  SELECT COUNT(*)::int INTO v_ind_mes
    FROM public.vpi_indications
   WHERE partner_id = v_partner.id
     AND status = 'closed'
     AND fechada_em >= date_trunc('month', now());

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
      'id',              v_partner.id,
      'nome',            v_partner.nome,
      'avatar_url',      v_partner.avatar_url,
      'tier_atual',      v_partner.tier_atual,
      'creditos_total',  v_partner.creditos_total,
      'creditos_disponiveis', v_partner.creditos_disponiveis,
      'numero_membro',   v_partner.numero_membro,
      'streak_meses',    v_partner.streak_meses,
      'short_link_slug', v_partner.short_link_slug,
      'created_at',      v_partner.created_at,
      -- Fotonas (Fase 8 Entrega 5)
      'fotonas_usadas_ano',    COALESCE(v_partner.fotonas_usadas_ano, 0),
      'fotonas_transferidas',  COALESCE(v_partner.fotonas_transferidas, '[]'::jsonb),
      'fotonas_trocadas',      COALESCE(v_partner.fotonas_trocadas, '[]'::jsonb)
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

COMMENT ON FUNCTION public.vpi_pub_fotona_transfer(text, text, jsonb, int) IS
  'Transfere Fotona para outra parceira (token) ou externo (jsonb nome+phone). Valida desbloqueio, dedup, audit, WA. Fase 8 Entrega 5.';
COMMENT ON FUNCTION public.vpi_pub_fotona_exchange(text, text, int) IS
  'Troca Fotona por outro protocolo (smooth_eyes|nx_runner|estrias|capilar|intimo|depilacao|generico). Fase 8 Entrega 5.';
