-- ============================================================
-- Migration: B2B WOW Bloco 2 — Tier A (emoção)
--
-- W5 — Ritual de aniversário de parceria
-- W7 — Hall das parcerias (listagem pública)
-- W8 — Fluxo WhatsApp de boas-vindas
--
-- (W6 voucher falado é 100% cliente no voucher.html — sem migration)
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- W5 — ANIVERSÁRIO DE PARCERIA
-- ════════════════════════════════════════════════════════════

-- ── Função que detecta aniversários no mês corrente ─────────
-- Aniversários "marcantes": 1, 2, 3, 5, 10 anos
CREATE OR REPLACE FUNCTION public.b2b_anniversaries_scan()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_row  record;
  v_task_id uuid;
  v_created int := 0;
  v_due date;
  v_years int;
  v_milestone boolean;
  v_title text;
  v_descr text;
BEGIN
  FOR v_row IN
    SELECT id, name, created_at,
           EXTRACT(YEAR  FROM age(now(), created_at))::int AS years_completed,
           EXTRACT(MONTH FROM created_at)::int             AS month_created
      FROM public.b2b_partnerships
     WHERE clinic_id = v_clinic_id
       AND status = 'active'
       AND created_at IS NOT NULL
       AND EXTRACT(MONTH FROM created_at) = EXTRACT(MONTH FROM now())
  LOOP
    v_years := v_row.years_completed;
    IF v_years < 1 THEN CONTINUE; END IF;

    v_milestone := v_years IN (1, 2, 3, 5, 10);
    v_due := make_date(EXTRACT(YEAR FROM now())::int, v_row.month_created, LEAST(EXTRACT(DAY FROM v_row.created_at)::int, 28));

    v_title := CASE
      WHEN v_years = 1  THEN '1 ano de parceria · ' || v_row.name
      WHEN v_years = 10 THEN '10 anos de parceria (!) · ' || v_row.name
      ELSE v_years::text || ' anos de parceria · ' || v_row.name
    END;

    v_descr := 'Aniversário da parceria com ' || v_row.name || '. ' ||
      CASE
        WHEN v_milestone THEN
          'Aniversário marcante — considere: post de celebração, mensagem personalizada da Mirian, presente simbólico, relatório executivo do ano.'
        ELSE
          'Aniversário da parceria. Considere um simples "obrigada" via WhatsApp.'
      END;

    v_task_id := public._b2b_task_create_unique(
      v_row.id, 'anniversary', v_title, v_descr, v_due,
      jsonb_build_object('years', v_years, 'milestone', v_milestone)
    );
    IF v_task_id IS NOT NULL THEN v_created := v_created + 1; END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'created', v_created);
END $$;


-- ── Agenda o cron semanal (segunda 08:00 BRT) ──────────────
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('b2b_cron_anniversaries');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  PERFORM cron.schedule(
    'b2b_cron_anniversaries',
    '0 11 * * 1',   -- toda segunda 11:00 UTC = 08:00 BRT
    'SELECT public.b2b_anniversaries_scan()'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponível — anniversaries_scan fica manual';
END $$;


-- ════════════════════════════════════════════════════════════
-- W7 — HALL DAS PARCERIAS (listagem pública)
-- ════════════════════════════════════════════════════════════

-- Lista só ativas + campos "de vitrine" (sem contato, sem DNA, sem custo)
CREATE OR REPLACE FUNCTION public.b2b_partnerships_hall()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',            id,
    'slug',          slug,
    'name',          name,
    'pillar',        pillar,
    'category',      category,
    'tier',          tier,
    'slogans',       slogans,
    'narrative_quote', narrative_quote,
    'narrative_author', narrative_author,
    'since',         created_at
  ) ORDER BY tier NULLS LAST, name), '[]'::jsonb)
    INTO v_out
    FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id
     AND status = 'active';
  RETURN v_out;
END $$;


-- ════════════════════════════════════════════════════════════
-- W8 — FLUXO WA BOAS-VINDAS DO PARCEIRO NOVO
-- ════════════════════════════════════════════════════════════

-- Trigger detecta transição status → 'active' e cria tarefas
-- com templates de boas-vindas em 3 etapas (D+0, D+2, D+7).
-- O admin dispara via tab Tarefas (não envia automaticamente —
-- parceiro novo merece revisão humana antes da primeira mensagem).

CREATE OR REPLACE FUNCTION public._b2b_on_partnership_active()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'active' AND (OLD.status IS NULL OR OLD.status <> 'active') THEN
    -- D+0 — boas-vindas
    PERFORM public._b2b_task_create_unique(
      NEW.id, 'welcome_d0',
      'Enviar boas-vindas · ' || NEW.name,
      E'Texto sugerido (personalize antes de enviar):\n\n' ||
      'Oi! Que alegria termos a ' || NEW.name || ' no Círculo Mirian de Paula. ' ||
      E'A gente acredita que parceria boa se constrói no tempo, e começa com um bom café.\n\n' ||
      'Na próxima semana te mando o kit de boas-vindas com o playbook da parceria, combinado?',
      current_date,
      jsonb_build_object('channel','whatsapp','sequence_step',1)
    );

    -- D+2 — kit/playbook
    PERFORM public._b2b_task_create_unique(
      NEW.id, 'welcome_d2',
      'Enviar kit da parceria · ' || NEW.name,
      E'Texto sugerido:\n\n' ||
      'Oi! Segue o kit da nossa parceria:\n\n' ||
      '• Slogan pactuado\n• Primeiro conteúdo co-criado (posso gerar com IA na plataforma)\n' ||
      '• Mecânica de voucher\n• Link do painel pra você acompanhar os números em tempo real\n\n' ||
      'Qualquer coisa, me chama. Estamos começando uma história bonita.',
      current_date + INTERVAL '2 days',
      jsonb_build_object('channel','whatsapp','sequence_step',2)
    );

    -- D+7 — primeiro check-in
    PERFORM public._b2b_task_create_unique(
      NEW.id, 'welcome_d7',
      'Check-in primeira semana · ' || NEW.name,
      E'Texto sugerido:\n\n' ||
      'Oi! Faz uma semana que formalizamos nossa parceria. ' ||
      'Queria saber: alguma dúvida? Algo que posso ajustar do nosso lado? ' ||
      E'O primeiro mês é o que define o ritmo — quero que comece leve pra você.',
      current_date + INTERVAL '7 days',
      jsonb_build_object('channel','whatsapp','sequence_step',3)
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_b2b_partnership_on_active ON public.b2b_partnerships;
CREATE TRIGGER trg_b2b_partnership_on_active
  AFTER UPDATE OF status ON public.b2b_partnerships
  FOR EACH ROW EXECUTE FUNCTION public._b2b_on_partnership_active();


-- ── Grants ──────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.b2b_anniversaries_scan()     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_partnerships_hall()      TO anon, authenticated, service_role;
