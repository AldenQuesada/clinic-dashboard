-- ============================================================
-- Migration: B2B Playbook de abertura — Fase 3.2
--
-- RPC b2b_playbook_apply(partnership_id) semeia:
--   - tasks (primeiros 30 dias por tipo)
--   - content (ganchos, carrosseis, slogans)
--   - targets (KPIs operacionais)
--
-- Conteudo diferente por type: transactional | occasion | institutional.
-- Template-based — edita depois no detalhe da parceria.
-- Idempotente via flag meta.playbook_applied no audit interno
-- (se já rodou uma vez, pula criação).
-- ============================================================

-- ── Helper: cria task B2B só se não existir do mesmo kind ───
CREATE OR REPLACE FUNCTION public._b2b_playbook_task(
  p_partnership_id uuid, p_kind text, p_title text, p_desc text, p_due_days int
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.b2b_tasks
   WHERE clinic_id = v_clinic AND partnership_id = p_partnership_id
     AND kind = p_kind AND status = 'open'
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.b2b_tasks (clinic_id, partnership_id, kind, title, description, due_date)
  VALUES (v_clinic, p_partnership_id, p_kind, p_title, p_desc, (now() + (p_due_days || ' days')::interval)::date)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ── Helper: cria content se não existir ────────────────────
CREATE OR REPLACE FUNCTION public._b2b_playbook_content(
  p_partnership_id uuid, p_kind text, p_label text, p_content text, p_sort int
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.b2b_partnership_content
   WHERE partnership_id = p_partnership_id AND kind = p_kind AND label = p_label
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.b2b_partnership_content (partnership_id, kind, label, content, sort_order)
  VALUES (p_partnership_id, p_kind, p_label, p_content, p_sort)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ── Helper: cria target se não existir ─────────────────────
CREATE OR REPLACE FUNCTION public._b2b_playbook_target(
  p_partnership_id uuid, p_indicator text, p_target numeric,
  p_cadence text, p_horizon int, p_benefit text, p_sort int
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM public.b2b_partnership_targets
   WHERE partnership_id = p_partnership_id AND indicator = p_indicator
   LIMIT 1;
  IF v_id IS NOT NULL THEN RETURN v_id; END IF;

  INSERT INTO public.b2b_partnership_targets (partnership_id, indicator, target_value, cadence, horizon_days, benefit_label, sort_order)
  VALUES (p_partnership_id, p_indicator, p_target, p_cadence, p_horizon, p_benefit, p_sort)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;


-- ═══════════════ PLAYBOOK APPLY ═══════════════
CREATE OR REPLACE FUNCTION public.b2b_playbook_apply(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_p         public.b2b_partnerships%ROWTYPE;
  v_tasks     int := 0;
  v_contents  int := 0;
  v_targets   int := 0;
  v_name      text;
BEGIN
  SELECT * INTO v_p FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id AND id = p_partnership_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found'); END IF;

  v_name := v_p.name;

  -- ════ COMMON (todos os tipos) ════
  PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_kickoff',
    'Kickoff: gravar Reel de abertura · ' || v_name,
    'Grave 1 Reel curto (até 45s) apresentando a parceria. Pode ser em parceria com o parceiro ou solo da Mirian. Mencione slogan e valor.',
    7);
  v_tasks := v_tasks + 1;

  PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_posting',
    'Post: Carrossel "Por dentro da Parceria" · ' || v_name,
    'Publicar carrossel de 4 slides (programa · como ganhar · o que está incluso · depoimentos). Template já está em content da parceria.',
    10);
  v_tasks := v_tasks + 1;

  -- Carrossel "Por dentro da Parceria" (padrão)
  PERFORM public._b2b_playbook_content(p_partnership_id, 'carrossel_slides', 'Por dentro da Parceria · slide 1',
    E'Slide 1 — O que é o programa\n\nTítulo: Uma nova união de cuidado\nCorpo: A Clínica Mirian de Paula + ' || v_name || E' unem forças pra entregar uma experiência única.', 1);
  v_contents := v_contents + 1;

  PERFORM public._b2b_playbook_content(p_partnership_id, 'carrossel_slides', 'Por dentro da Parceria · slide 2',
    E'Slide 2 — Como ganhar o presente\n\nTítulo: Simples e exclusivo\nCorpo: [descreva o mecanismo de voucher do parceiro]', 2);
  v_contents := v_contents + 1;

  PERFORM public._b2b_playbook_content(p_partnership_id, 'carrossel_slides', 'Por dentro da Parceria · slide 3',
    E'Slide 3 — O que está incluso\n\nTítulo: Sua vez de brilhar\nCorpo: [combo do voucher — ex: Véu de Noiva + Anovator, com validade 30 dias]', 3);
  v_contents := v_contents + 1;

  PERFORM public._b2b_playbook_content(p_partnership_id, 'carrossel_slides', 'Por dentro da Parceria · slide 4',
    E'Slide 4 — Depoimentos\n\nTítulo: Quem já viveu\nCorpo: [colar 1-2 depoimentos das primeiras pacientes que usaram o voucher]', 4);
  v_contents := v_contents + 1;

  -- 3 ganchos padrão
  PERFORM public._b2b_playbook_content(p_partnership_id, 'gancho', 'Curiosidade',
    'Você sabia que existe um jeito de ganhar um tratamento premium sem pagar a mais? É assim que funciona a parceria ' || v_name || ' × Clínica Mirian.', 1);
  v_contents := v_contents + 1;

  PERFORM public._b2b_playbook_content(p_partnership_id, 'gancho', 'Transformação',
    'Uma escolha sua, dois cuidados. ' || v_name || ' cuida de [A], a Clínica cuida de você.', 2);
  v_contents := v_contents + 1;

  PERFORM public._b2b_playbook_content(p_partnership_id, 'gancho', 'Emoção',
    'Autoestima não é vaidade. É cuidado. E quando duas marcas que entendem isso se unem, o resultado é pura arte.', 3);
  v_contents := v_contents + 1;

  -- ════ POR TIPO ════
  IF v_p.type = 'transactional' THEN
    PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_vouchers',
      'Emitir 10 vouchers piloto · ' || v_name,
      'Gerar 10 vouchers e enviar ao parceiro pra ele distribuir nos primeiros 30 dias. Acompanhar taxa de resgate.',
      3);
    v_tasks := v_tasks + 1;

    PERFORM public._b2b_playbook_target(p_partnership_id, 'Vouchers entregues', 15, 'monthly', 60, 'Volume de alcance', 1);
    v_targets := v_targets + 1;
    PERFORM public._b2b_playbook_target(p_partnership_id, 'Taxa de resgate (%)', 25, 'monthly', 60, 'Eficiência', 2);
    v_targets := v_targets + 1;
    PERFORM public._b2b_playbook_target(p_partnership_id, 'Reels co-criados', 2, 'monthly', 60, 'Autoridade compartilhada', 3);
    v_targets := v_targets + 1;

  ELSIF v_p.type = 'occasion' THEN
    PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_events_map',
      'Mapear próximos 3 eventos · ' || v_name,
      'Pegar com o parceiro a agenda dos próximos 3 eventos (datas e nomes). Criar vouchers atrelados.',
      5);
    v_tasks := v_tasks + 1;

    PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_voucher_template',
      'Criar template de voucher para o evento · ' || v_name,
      'Voucher com copy específico do contexto (ex: casamento, festa de 15, debut). Validade recomendada 60 dias pra harmonização.',
      7);
    v_tasks := v_tasks + 1;

    PERFORM public._b2b_playbook_target(p_partnership_id, 'Eventos atendidos', 1, 'monthly', 90, 'Engajamento local', 1);
    v_targets := v_targets + 1;
    PERFORM public._b2b_playbook_target(p_partnership_id, 'Avaliações pré-evento', 4, 'monthly', 90, 'Leads qualificados', 2);
    v_targets := v_targets + 1;
    PERFORM public._b2b_playbook_target(p_partnership_id, 'Procedimentos fechados', 2, 'monthly', 90, 'Conversão', 3);
    v_targets := v_targets + 1;

  ELSIF v_p.type = 'institutional' THEN
    PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_contract',
      'Assinar contrato anual · ' || v_name,
      'Redigir + assinar termo de 12 meses com revisões trimestrais. Incluir cláusula de exclusividade setorial.',
      5);
    v_tasks := v_tasks + 1;

    PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_meeting',
      'Primeira reunião estratégica (30d) · ' || v_name,
      'Alinhar: posicionamento, cadência de conteúdo, calendário de eventos, KPIs trimestrais.',
      25);
    v_tasks := v_tasks + 1;

    PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_positioning_kit',
      'Gerar kit de posicionamento · ' || v_name,
      'Copy curto + slogan + manifesto conjunto + citação do parceiro. Material de referência pra todo conteúdo futuro.',
      14);
    v_tasks := v_tasks + 1;

    PERFORM public._b2b_playbook_target(p_partnership_id, 'Indicações diretas', 15, 'monthly', 90, 'Aumento de pacientes', 1);
    v_targets := v_targets + 1;
    PERFORM public._b2b_playbook_target(p_partnership_id, 'Conteúdos co-criados', 2, 'monthly', 90, 'Autoridade compartilhada', 2);
    v_targets := v_targets + 1;
    PERFORM public._b2b_playbook_target(p_partnership_id, 'Eventos mensais', 1, 'monthly', 90, 'Engajamento presencial', 3);
    v_targets := v_targets + 1;
    PERFORM public._b2b_playbook_target(p_partnership_id, 'NPS do público cativo', 8, 'quarterly', 90, 'Saúde da relação', 4);
    v_targets := v_targets + 1;
  END IF;

  -- Task de revisão dos 30d
  PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_review_30d',
    'Review dos 30 dias · ' || v_name,
    'Revisar resultados: vouchers usados, engajamento, tasks pendentes. Ajustar metas se necessário.',
    30);
  v_tasks := v_tasks + 1;

  RETURN jsonb_build_object(
    'ok',       true,
    'type',     v_p.type,
    'tasks',    v_tasks,
    'contents', v_contents,
    'targets',  v_targets
  );
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_playbook_apply(uuid) TO anon, authenticated, service_role;
