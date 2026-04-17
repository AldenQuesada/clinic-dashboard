-- ============================================================
-- Migration: VPI Revista Full Face Spotlight
--
-- Backlog #10: Parceira com Full Face ganha pagina destaque
-- na Revista Digital Beauty & Health.
--
-- Trigger: apos vpi_indication_close com p_is_full_face=true,
-- se a indication tem consent + fotos + depoimento preenchidos,
-- cria spread editorial (t21 + t22) em DRAFT numa edicao atual
-- da revista. Se nao tem historia ainda, dispara notificacao
-- pedindo preencher via vpi-indication-story.ui.js.
--
-- Segmento: ['vip', 'active'] — so parceiras e leads engajadas veem.
-- Publicacao: sempre draft. Admin aprova via editor.
-- Notificacoes: broadcast_notification + WhatsApp staff (alert_phone).
--
-- Idempotente: CREATE OR REPLACE. Se ja gerou spread pra essa
-- indication (audit action='revista_spread_created'), nao duplica.
-- ============================================================

-- Nota: WA inline (renderizado dentro da funcao) — nao usa wa_agenda_automations
-- porque o schema dessa tabela e voltado pra automacoes de agenda/leads,
-- nao alertas de staff. wa_outbox_schedule_automation aceita content direto.

-- ── 2. Helper: upsert asset em magazine_assets ───────────
CREATE OR REPLACE FUNCTION public._vpi_revista_upsert_asset(
  p_clinic_id uuid,
  p_edition_id uuid,
  p_url text,
  p_alt text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_id uuid;
BEGIN
  IF p_url IS NULL OR length(p_url) < 5 THEN RETURN NULL; END IF;

  -- Reusa se ja existe asset com mesma URL na clinica
  SELECT id INTO v_id
    FROM public.magazine_assets
   WHERE clinic_id = p_clinic_id AND url = p_url
   LIMIT 1;

  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.magazine_assets (clinic_id, edition_id, url, type, alt)
  VALUES (p_clinic_id, p_edition_id, p_url, 'image', p_alt)
  RETURNING id INTO v_id;

  RETURN v_id;
END $$;

-- ── 3. Helper: garante edicao draft atual ────────────────
CREATE OR REPLACE FUNCTION public._vpi_revista_ensure_edition(p_clinic_id uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_edition_id uuid;
  v_next_number int;
  v_slug text;
BEGIN
  -- Edicao draft mais recente
  SELECT id INTO v_edition_id
    FROM public.magazine_editions
   WHERE clinic_id = p_clinic_id AND status = 'draft'
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_edition_id IS NOT NULL THEN RETURN v_edition_id; END IF;

  -- Cria nova edicao draft
  SELECT COALESCE(MAX(edition_number), 0) + 1 INTO v_next_number
    FROM public.magazine_editions
   WHERE clinic_id = p_clinic_id;

  v_slug := 'destaques-parceiras-' || to_char(now(), 'YYYY-MM');

  -- Evita colisao de slug sem depender de ON CONFLICT
  SELECT id INTO v_edition_id
    FROM public.magazine_editions
   WHERE clinic_id = p_clinic_id AND slug = v_slug
   LIMIT 1;
  IF v_edition_id IS NOT NULL THEN RETURN v_edition_id; END IF;

  INSERT INTO public.magazine_editions (
    clinic_id, slug, title, subtitle, theme, edition_number, status, created_by
  ) VALUES (
    p_clinic_id, v_slug,
    'Destaques de Parceiras',
    'Histórias de transformação por indicação',
    'partners-spotlight',
    v_next_number, 'draft', NULL
  )
  RETURNING id INTO v_edition_id;

  RETURN v_edition_id;
END $$;

-- ── 4. Funcao principal: gera spread editorial ───────────
CREATE OR REPLACE FUNCTION public.vpi_revista_generate_full_face_spotlight(
  p_indication_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_ind        public.vpi_indications%ROWTYPE;
  v_partner    public.vpi_partners%ROWTYPE;
  v_indicada_nome text;
  v_procedimento text;
  v_has_story  boolean;
  v_already    boolean;
  v_edition_id uuid;
  v_asset_depois uuid;
  v_asset_antes  uuid;
  v_page_t21   uuid;
  v_page_t22   uuid;
  v_slots_t21  jsonb;
  v_slots_t22  jsonb;
  v_lede       text;
  v_corpo      text;
  v_destaque   text;
  v_staff_phone text;
  v_editor_url text;
BEGIN
  -- Busca indication
  SELECT * INTO v_ind FROM public.vpi_indications WHERE id = p_indication_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'indication_not_found'); END IF;

  -- Idempotencia: ja gerou?
  SELECT EXISTS(
    SELECT 1 FROM public.vpi_audit_log
     WHERE entity_type = 'indication'
       AND entity_id::text = p_indication_id::text
       AND action      = 'revista_spread_created'
  ) INTO v_already;
  IF v_already THEN RETURN jsonb_build_object('ok', true, 'skipped', 'already_generated'); END IF;

  SELECT * INTO v_partner FROM public.vpi_partners WHERE id = v_ind.partner_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'partner_not_found'); END IF;

  v_indicada_nome := COALESCE(NULLIF(TRIM(v_ind.indicada_nome), ''), 'Uma amiga');
  v_procedimento  := COALESCE(NULLIF(TRIM(v_ind.procedimento), ''), 'Full Face');

  -- URL do editor (hardcoded pro deploy atual)
  v_editor_url := 'https://clinicai-dashboard.px1hdq.easypanel.host/?page=growth-referral#revista';

  -- Verifica se tem historia completa (consent + foto antes + foto depois + depoimento)
  v_has_story := (
    COALESCE(v_ind.consent_mostrar_na_historia, false) = true
    AND v_ind.foto_antes_url  IS NOT NULL AND length(v_ind.foto_antes_url)  > 5
    AND v_ind.foto_depois_url IS NOT NULL AND length(v_ind.foto_depois_url) > 5
    AND v_ind.depoimento IS NOT NULL AND length(TRIM(v_ind.depoimento)) > 20
  );

  -- Staff phone — le de clinics.settings.vpi.staff_alert_phone
  SELECT (settings->'vpi'->>'staff_alert_phone')
    INTO v_staff_phone
    FROM public.clinics
   WHERE id = v_partner.clinic_id
   LIMIT 1;

  -- ── Caso A: historia incompleta → notifica sem criar pagina ──
  IF NOT v_has_story THEN
    PERFORM public.broadcast_notification(
      'vpi_revista_historia_pendente',
      'Revista: falta história pra destaque',
      'Parceira ' || v_partner.nome || ' fechou Full Face com ' || v_indicada_nome ||
      '. Preencha a "História desta indicação" no dashboard pra criar o spread editorial na Revista.',
      jsonb_build_object(
        'indication_id', p_indication_id,
        'partner_id',    v_partner.id,
        'partner_nome',  v_partner.nome,
        'action',        'open_story_drawer'
      ),
      ARRAY['admin', 'owner']
    );

    -- WA pro staff (se configurado)
    IF v_staff_phone IS NOT NULL AND length(v_staff_phone) >= 8 THEN
      BEGIN
        PERFORM public.wa_outbox_schedule_automation(
          p_phone        => v_staff_phone,
          p_content      => E'💡 Full Face fechado! Falta história pra criar destaque na Revista.\n\n' ||
                            'Parceira: *' || v_partner.nome || '*\n' ||
                            'Indicada: *' || v_indicada_nome || '*\n\n' ||
                            'Preencha a "História desta indicação" no dashboard pra gerar o spread editorial:\n' ||
                            v_editor_url || E'\n\n' ||
                            '_Campos necessários: consent da indicada + fotos antes/depois + depoimento._',
          p_lead_id      => '',
          p_lead_name    => 'STAFF',
          p_scheduled_at => now()
        );
      EXCEPTION WHEN others THEN NULL; END;
    END IF;

    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (v_partner.clinic_id, 'revista_historia_pendente', 'indication', p_indication_id, jsonb_build_object(
      'reason', 'missing_consent_or_story',
      'has_consent', v_ind.consent_mostrar_na_historia,
      'has_foto_antes',  (v_ind.foto_antes_url  IS NOT NULL),
      'has_foto_depois', (v_ind.foto_depois_url IS NOT NULL),
      'has_depoimento',  (v_ind.depoimento IS NOT NULL)
    ));

    RETURN jsonb_build_object('ok', true, 'status', 'awaiting_story');
  END IF;

  -- ── Caso B: historia completa → cria spread editorial ──
  v_edition_id := public._vpi_revista_ensure_edition(v_partner.clinic_id);
  IF v_edition_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'edition_ensure_failed');
  END IF;

  -- Upsert assets
  v_asset_depois := public._vpi_revista_upsert_asset(
    v_partner.clinic_id, v_edition_id, v_ind.foto_depois_url,
    v_indicada_nome || ' — depois (' || v_procedimento || ')'
  );
  v_asset_antes := public._vpi_revista_upsert_asset(
    v_partner.clinic_id, v_edition_id, v_ind.foto_antes_url,
    v_indicada_nome || ' — antes'
  );

  -- Slots t21 (foto split)
  v_slots_t21 := jsonb_build_object(
    'foto_principal',    v_asset_depois,
    'foto_detalhe',      v_asset_antes,
    'kicker',            left(upper('DESTAQUE ' || v_procedimento), 22),
    'nome_produto',      left(v_partner.nome, 40),
    'legenda_principal', left('Transformação de ' || v_indicada_nome || ' com ' || v_procedimento, 80),
    'legenda_detalhe',   left('Antes do tratamento', 80),
    'tagline',           left('Indicação de ' || v_partner.nome || ' — Embaixadora', 60)
  );

  -- Texto editorial t22 (base — admin refinara no editor)
  v_lede := left(
    split_part(v_partner.nome, ' ', 1) || ' indicou ' || v_indicada_nome ||
    ' pra um protocolo de ' || v_procedimento ||
    '. O resultado virou história — e prova de que cuidar de quem a gente ama muda tudo.',
    200
  );

  v_corpo :=
    'Quem chega à Clinica Mirian de Paula por indicação chega com confiança — e essa confiança tem nome. ' ||
    split_part(v_partner.nome, ' ', 1) || ' é uma das embaixadoras do nosso Programa de Indicação, e foi ela quem trouxe ' ||
    v_indicada_nome || ' pra descobrir o que um protocolo de ' || v_procedimento || ' pode fazer.' || E'\n\n' ||
    'Nas palavras da própria ' || v_indicada_nome || ':' || E'\n\n' ||
    '"' || v_ind.depoimento || '"' || E'\n\n' ||
    'O ' || v_procedimento || ' é um dos protocolos mais pedidos por quem quer resultado visível sem cirurgia. ' ||
    'Restaura volume, redefine contornos e devolve brilho à pele — tudo numa sequência de sessões planejada ' ||
    'pelo time clínico da Mirian de Paula, respeitando o tempo e a anatomia de cada paciente.' || E'\n\n' ||
    'Mais que uma transformação estética, é uma história de cuidado entre amigas. ' ||
    split_part(v_partner.nome, ' ', 1) || ' já indicou outras mulheres ao longo do ano e vem subindo no ranking de ' ||
    'embaixadoras — prova de que confiança verdadeira se multiplica. ' || E'\n\n' ||
    'Se você também tem alguém que merece esse cuidado, fale com ' || split_part(v_partner.nome, ' ', 1) ||
    ' ou diretamente com a clínica. A sua indicação tem peso — e retorno.';

  v_destaque := left(
    '"' || split_part(v_ind.depoimento, '.', 1) || '."',
    140
  );

  v_slots_t22 := jsonb_build_object(
    'kicker',  left('HISTORIA DE TRANSFORMACAO', 22),
    'titulo',  left(v_indicada_nome || ' + ' || split_part(v_partner.nome, ' ', 1) || ' — uma indicação que virou história', 70),
    'lede',    v_lede,
    'corpo',   v_corpo,
    'byline',  'Redação Beauty & Health',
    'destaque', v_destaque
  );

  -- Insere paginas (bypass magazine_add_page porque esta funcao SECURITY DEFINER
  -- roda no contexto server-side sem auth.uid; acessamos magazine_pages direto)
  DECLARE v_next_order int;
  BEGIN
    SELECT COALESCE(MAX(order_index), -1) + 1 INTO v_next_order
      FROM public.magazine_pages
     WHERE edition_id = v_edition_id;

    INSERT INTO public.magazine_pages (edition_id, order_index, template_slug, slots, segment_scope)
    VALUES (v_edition_id, v_next_order, 't21_product_photo_split', v_slots_t21, ARRAY['vip','active'])
    RETURNING id INTO v_page_t21;

    INSERT INTO public.magazine_pages (edition_id, order_index, template_slug, slots, segment_scope)
    VALUES (v_edition_id, v_next_order + 1, 't22_product_feature_text', v_slots_t22, ARRAY['vip','active'])
    RETURNING id INTO v_page_t22;
  END;

  -- Notificacao admin
  PERFORM public.broadcast_notification(
    'vpi_revista_spread_created',
    'Revista: spread criado (draft)',
    'Spread editorial de ' || v_partner.nome || ' + ' || v_indicada_nome ||
    ' criado em draft. Revise no editor e publique quando estiver pronta.',
    jsonb_build_object(
      'indication_id', p_indication_id,
      'partner_id',    v_partner.id,
      'edition_id',    v_edition_id,
      'page_t21_id',   v_page_t21,
      'page_t22_id',   v_page_t22,
      'action',        'open_magazine_editor'
    ),
    ARRAY['admin', 'owner']
  );

  -- WA staff
  IF v_staff_phone IS NOT NULL AND length(v_staff_phone) >= 8 THEN
    BEGIN
      PERFORM public.wa_outbox_schedule_automation(
        p_phone        => v_staff_phone,
        p_content      => E'🎉 Spread editorial criado na Revista!\n\n' ||
                          'Parceira: *' || v_partner.nome || '*\n' ||
                          'Indicada: *' || v_indicada_nome || '*\n' ||
                          'Procedimento: ' || v_procedimento || E'\n\n' ||
                          'Novas páginas em *draft*: t21 (foto split) + t22 (matéria).\n' ||
                          'Abra o editor pra revisar e publicar:\n' ||
                          v_editor_url || E'\n\n' ||
                          '_Clínica Mirian de Paula — Beauty & Health_',
        p_lead_id      => '',
        p_lead_name    => 'STAFF',
        p_scheduled_at => now()
      );
    EXCEPTION WHEN others THEN NULL; END;
  END IF;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_partner.clinic_id, 'revista_spread_created', 'indication', p_indication_id, jsonb_build_object(
    'partner_id',  v_partner.id,
    'edition_id',  v_edition_id,
    'page_t21_id', v_page_t21,
    'page_t22_id', v_page_t22
  ));

  RETURN jsonb_build_object(
    'ok',          true,
    'status',      'created',
    'edition_id',  v_edition_id,
    'page_t21_id', v_page_t21,
    'page_t22_id', v_page_t22
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_revista_generate_full_face_spotlight(uuid)
  TO authenticated, service_role;

-- ── 5. Hook no vpi_indication_close: chama a funcao se Full Face ──
-- Estrategia: criar wrapper que chama o original + o novo hook.
-- Mais seguro que reescrever vpi_indication_close (evita regressao).
-- Nota: o close original ja roda; aqui so adicionamos o efeito colateral.
--
-- Abordagem: adicionar trigger AFTER UPDATE em vpi_indications que dispara
-- quando status muda pra 'closed' com creditos=5 (indicador de Full Face).
-- Mais robusto que chamar de dentro da funcao (que seria override).

CREATE OR REPLACE FUNCTION public._trg_vpi_revista_full_face_hook()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- So dispara em transicao pra closed + creditos=5 (proxy de Full Face)
  IF TG_OP = 'UPDATE'
     AND NEW.status = 'closed'
     AND (OLD.status IS DISTINCT FROM 'closed')
     AND COALESCE(NEW.creditos, 0) = 5
  THEN
    BEGIN
      PERFORM public.vpi_revista_generate_full_face_spotlight(NEW.id);
    EXCEPTION WHEN others THEN
      -- Best-effort: nunca quebra o close
      INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
      VALUES (NEW.clinic_id, 'revista_hook_failed', 'indication', NEW.id, jsonb_build_object(
        'error', SQLERRM
      ));
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_revista_full_face_hook ON public.vpi_indications;
CREATE TRIGGER trg_vpi_revista_full_face_hook
  AFTER UPDATE ON public.vpi_indications
  FOR EACH ROW
  EXECUTE FUNCTION public._trg_vpi_revista_full_face_hook();
