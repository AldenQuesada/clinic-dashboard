-- ============================================================
-- Migration: B2B Grupos/Confrarias (B2B2B2C) — Fase 3.3
--
-- Para parcerias com grupos (ACIM, Confrarias, Lide Feminino),
-- o modelo é diferente: 1 parceria = N membras expostas.
-- Tracking de exposições (palestras, eventos, mail blasts) pra
-- medir alcance real e conversão em leads individuais.
--
-- Mantém type='institutional' e adiciona flag is_collective=true.
-- Zero quebra de código existente.
-- ============================================================

-- Extensões do schema principal
ALTER TABLE public.b2b_partnerships
  ADD COLUMN IF NOT EXISTS is_collective          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS member_count           int NULL,
  ADD COLUMN IF NOT EXISTS estimated_monthly_reach int NULL;


-- ── Tabela de exposições ao grupo ───────────────────────────
CREATE TABLE IF NOT EXISTS public.b2b_group_exposures (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  partnership_id uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,

  event_type     text NOT NULL CHECK (event_type IN (
                   'palestra','evento_presencial','email_blast','post_exclusivo',
                   'mencao_stories','newsletter','outro'
                 )),
  title          text NOT NULL,
  date_occurred  date NOT NULL DEFAULT current_date,
  reach_count    int  NOT NULL DEFAULT 0,      -- quantas pessoas alcançadas
  leads_count    int  NOT NULL DEFAULT 0,      -- quantas viraram lead direto
  conversions    int  NULL,                      -- virou procedimento? (nullable, atualiza depois)
  notes          text NULL,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_exposures_partnership
  ON public.b2b_group_exposures (partnership_id, date_occurred DESC);

ALTER TABLE public.b2b_group_exposures ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_group_exposures_all" ON public.b2b_group_exposures;
CREATE POLICY "b2b_group_exposures_all" ON public.b2b_group_exposures FOR ALL USING (true) WITH CHECK (true);


-- ═══════════════ RPCs ═══════════════

-- ── Registrar exposição ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_group_exposure_log(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_partnership_id uuid;
  v_id uuid;
BEGIN
  v_partnership_id := NULLIF(p_payload->>'partnership_id','')::uuid;
  IF v_partnership_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_id_required');
  END IF;

  INSERT INTO public.b2b_group_exposures (
    clinic_id, partnership_id, event_type, title, date_occurred,
    reach_count, leads_count, conversions, notes
  ) VALUES (
    v_clinic_id, v_partnership_id,
    COALESCE(p_payload->>'event_type', 'outro'),
    COALESCE(NULLIF(p_payload->>'title',''), 'Exposição'),
    COALESCE(NULLIF(p_payload->>'date_occurred','')::date, current_date),
    COALESCE(NULLIF(p_payload->>'reach_count','')::int, 0),
    COALESCE(NULLIF(p_payload->>'leads_count','')::int, 0),
    NULLIF(p_payload->>'conversions','')::int,
    p_payload->>'notes'
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;

-- ── Listar exposições ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_group_exposures_list(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(e) ORDER BY e.date_occurred DESC, e.created_at DESC), '[]'::jsonb)
    INTO v_out
    FROM public.b2b_group_exposures e
   WHERE e.clinic_id = v_clinic_id AND e.partnership_id = p_partnership_id;
  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;

-- ── Stats agregadas por grupo ──────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_group_stats(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
  v_p   record;
BEGIN
  SELECT id, name, member_count, estimated_monthly_reach, is_collective
    INTO v_p FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id AND id = p_partnership_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'partnership', jsonb_build_object(
      'id',             v_p.id,
      'name',           v_p.name,
      'is_collective',  v_p.is_collective,
      'member_count',   v_p.member_count,
      'estimated_monthly_reach', v_p.estimated_monthly_reach
    ),
    'total_exposures',  COALESCE(COUNT(*), 0),
    'total_reach',      COALESCE(SUM(reach_count), 0),
    'total_leads',      COALESCE(SUM(leads_count), 0),
    'total_conversions', COALESCE(SUM(conversions), 0),
    'by_type',          COALESCE(jsonb_object_agg(event_type,
                          jsonb_build_object(
                            'count', COUNT(*),
                            'reach', SUM(reach_count),
                            'leads', SUM(leads_count)
                          )) FILTER (WHERE event_type IS NOT NULL), '{}'::jsonb),
    'last_exposure_at', MAX(date_occurred),
    'lead_rate_pct',    CASE WHEN COALESCE(SUM(reach_count),0) > 0
                          THEN ROUND((SUM(leads_count)::numeric / SUM(reach_count)::numeric) * 100, 1)
                          ELSE 0 END
  ) INTO v_out
  FROM public.b2b_group_exposures
  WHERE clinic_id = v_clinic_id AND partnership_id = p_partnership_id
  GROUP BY v_p.id, v_p.name, v_p.member_count, v_p.estimated_monthly_reach, v_p.is_collective;

  IF v_out IS NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'partnership', jsonb_build_object(
        'id', v_p.id, 'name', v_p.name, 'is_collective', v_p.is_collective,
        'member_count', v_p.member_count,
        'estimated_monthly_reach', v_p.estimated_monthly_reach
      ),
      'total_exposures', 0, 'total_reach', 0, 'total_leads', 0, 'total_conversions', 0,
      'by_type', '{}'::jsonb, 'last_exposure_at', null, 'lead_rate_pct', 0
    );
  END IF;
  RETURN v_out;
END $$;


-- ── Estende b2b_playbook_apply — injeta passos collective ──
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

  -- ════ COMMON ════
  PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_kickoff',
    'Kickoff: gravar Reel de abertura · ' || v_name,
    'Grave 1 Reel curto (até 45s) apresentando a parceria. Pode ser solo da Mirian ou em parceria.',
    7);
  v_tasks := v_tasks + 1;

  PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_posting',
    'Post: Carrossel "Por dentro da Parceria" · ' || v_name,
    'Publicar carrossel de 4 slides já gerado em content da parceria.',
    10);
  v_tasks := v_tasks + 1;

  -- Carrossel padrão (idempotente via helper)
  PERFORM public._b2b_playbook_content(p_partnership_id, 'carrossel_slides', 'Por dentro da Parceria · slide 1',
    E'Slide 1 — O que é o programa\n\nTítulo: Uma nova união de cuidado\nCorpo: A Clínica Mirian de Paula + ' || v_name || E' unem forças pra entregar uma experiência única.', 1);
  PERFORM public._b2b_playbook_content(p_partnership_id, 'carrossel_slides', 'Por dentro da Parceria · slide 2',
    E'Slide 2 — Como ganhar o presente\n\nTítulo: Simples e exclusivo\nCorpo: [descreva o mecanismo de voucher do parceiro]', 2);
  PERFORM public._b2b_playbook_content(p_partnership_id, 'carrossel_slides', 'Por dentro da Parceria · slide 3',
    E'Slide 3 — O que está incluso\n\nTítulo: Sua vez de brilhar\nCorpo: [combo do voucher]', 3);
  PERFORM public._b2b_playbook_content(p_partnership_id, 'carrossel_slides', 'Por dentro da Parceria · slide 4',
    E'Slide 4 — Depoimentos\n\nTítulo: Quem já viveu\nCorpo: [colar depoimentos]', 4);
  v_contents := v_contents + 4;

  PERFORM public._b2b_playbook_content(p_partnership_id, 'gancho', 'Curiosidade',
    'Você sabia que existe um jeito de ganhar um tratamento premium sem pagar a mais? É assim que funciona a parceria ' || v_name || ' × Clínica Mirian.', 1);
  PERFORM public._b2b_playbook_content(p_partnership_id, 'gancho', 'Transformação',
    'Uma escolha sua, dois cuidados. ' || v_name || ' cuida de [A], a Clínica cuida de você.', 2);
  PERFORM public._b2b_playbook_content(p_partnership_id, 'gancho', 'Emoção',
    'Autoestima não é vaidade. É cuidado. E quando duas marcas que entendem isso se unem, o resultado é pura arte.', 3);
  v_contents := v_contents + 3;

  -- ════ POR TIPO ════
  IF v_p.type = 'transactional' THEN
    PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_vouchers',
      'Emitir 10 vouchers piloto · ' || v_name,
      'Gerar 10 vouchers e enviar ao parceiro pra ele distribuir nos primeiros 30 dias.',
      3);
    v_tasks := v_tasks + 1;
    PERFORM public._b2b_playbook_target(p_partnership_id, 'Vouchers entregues', 15, 'monthly', 60, 'Volume de alcance', 1);
    PERFORM public._b2b_playbook_target(p_partnership_id, 'Taxa de resgate (%)', 25, 'monthly', 60, 'Eficiência', 2);
    PERFORM public._b2b_playbook_target(p_partnership_id, 'Reels co-criados', 2, 'monthly', 60, 'Autoridade compartilhada', 3);
    v_targets := v_targets + 3;

  ELSIF v_p.type = 'occasion' THEN
    PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_events_map',
      'Mapear próximos 3 eventos · ' || v_name,
      'Pegar com o parceiro a agenda dos próximos 3 eventos. Criar vouchers atrelados.', 5);
    v_tasks := v_tasks + 1;
    PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_voucher_template',
      'Criar template de voucher para o evento · ' || v_name,
      'Voucher com copy específico do contexto. Validade recomendada 60 dias.', 7);
    v_tasks := v_tasks + 1;
    PERFORM public._b2b_playbook_target(p_partnership_id, 'Eventos atendidos', 1, 'monthly', 90, 'Engajamento local', 1);
    PERFORM public._b2b_playbook_target(p_partnership_id, 'Avaliações pré-evento', 4, 'monthly', 90, 'Leads qualificados', 2);
    PERFORM public._b2b_playbook_target(p_partnership_id, 'Procedimentos fechados', 2, 'monthly', 90, 'Conversão', 3);
    v_targets := v_targets + 3;

  ELSIF v_p.type = 'institutional' THEN
    -- Sub-caminho: collective (grupos/confrarias)
    IF COALESCE(v_p.is_collective, false) THEN
      PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_group_reach_plan',
        'Plano de alcance ao grupo · ' || v_name,
        'Combinar com a liderança do grupo: palestra inicial, pauta, data, canais de divulgação (email, grupo de WhatsApp). Objetivo: alcançar ' ||
        COALESCE(v_p.estimated_monthly_reach, 0) || ' membras/mês.',
        7);
      v_tasks := v_tasks + 1;

      PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_group_palestra',
        'Primeira palestra / evento presencial · ' || v_name,
        'Agendar 1 palestra da Mirian no grupo nos primeiros 30 dias. Duração 45min + Q&A. Levar material impresso simples (sem vouchers físicos).',
        25);
      v_tasks := v_tasks + 1;

      PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_group_exclusive_voucher',
        'Voucher exclusivo para membras · ' || v_name,
        'Criar voucher "exclusivo membras ' || v_name || '" com copy personalizado. Enviar via canal do grupo, não individualmente.',
        14);
      v_tasks := v_tasks + 1;

      -- Targets collective (métricas de alcance)
      PERFORM public._b2b_playbook_target(p_partnership_id, 'Exposições ao grupo', 2, 'monthly', 90, 'Manter top of mind', 1);
      PERFORM public._b2b_playbook_target(p_partnership_id, 'Leads individuais (membras)',
        GREATEST(5, COALESCE(v_p.estimated_monthly_reach, 50) / 10), 'monthly', 90, 'Conversão coletiva->individual', 2);
      PERFORM public._b2b_playbook_target(p_partnership_id, 'Agendamentos de membras', 3, 'monthly', 90, 'Receita efetiva', 3);
      PERFORM public._b2b_playbook_target(p_partnership_id, 'Taxa de conversão alcance→lead (%)', 10, 'quarterly', 90, 'Eficácia do grupo', 4);
      v_targets := v_targets + 4;

      -- Content específico
      PERFORM public._b2b_playbook_content(p_partnership_id, 'gancho', 'Exclusividade do grupo',
        'Se você é membra da ' || v_name || ', tem algo especial te esperando na Clínica Mirian de Paula. Presente exclusivo. Só pra quem já entende de cuidado.', 4);
      v_contents := v_contents + 1;

    ELSE
      -- Institutional padrão (não-collective)
      PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_contract',
        'Assinar contrato anual · ' || v_name,
        'Redigir + assinar termo de 12 meses com revisões trimestrais. Incluir cláusula de exclusividade setorial.', 5);
      v_tasks := v_tasks + 1;
      PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_meeting',
        'Primeira reunião estratégica (30d) · ' || v_name,
        'Alinhar: posicionamento, cadência de conteúdo, calendário de eventos, KPIs trimestrais.', 25);
      v_tasks := v_tasks + 1;
      PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_positioning_kit',
        'Gerar kit de posicionamento · ' || v_name,
        'Copy curto + slogan + manifesto conjunto + citação do parceiro.', 14);
      v_tasks := v_tasks + 1;
      PERFORM public._b2b_playbook_target(p_partnership_id, 'Indicações diretas', 15, 'monthly', 90, 'Aumento de pacientes', 1);
      PERFORM public._b2b_playbook_target(p_partnership_id, 'Conteúdos co-criados', 2, 'monthly', 90, 'Autoridade compartilhada', 2);
      PERFORM public._b2b_playbook_target(p_partnership_id, 'Eventos mensais', 1, 'monthly', 90, 'Engajamento presencial', 3);
      PERFORM public._b2b_playbook_target(p_partnership_id, 'NPS do público cativo', 8, 'quarterly', 90, 'Saúde da relação', 4);
      v_targets := v_targets + 4;
    END IF;
  END IF;

  -- Review 30d (todos)
  PERFORM public._b2b_playbook_task(p_partnership_id, 'playbook_review_30d',
    'Review dos 30 dias · ' || v_name,
    'Revisar resultados: alcance/vouchers/eventos, engajamento, tasks pendentes. Ajustar metas.',
    30);
  v_tasks := v_tasks + 1;

  RETURN jsonb_build_object(
    'ok',       true,
    'type',     v_p.type,
    'collective', COALESCE(v_p.is_collective, false),
    'tasks',    v_tasks,
    'contents', v_contents,
    'targets',  v_targets
  );
END $$;


GRANT EXECUTE ON FUNCTION public.b2b_group_exposure_log(jsonb)       TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_group_exposures_list(uuid)      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_group_stats(uuid)               TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_group_exposures   TO anon, authenticated, service_role;
