-- ============================================================
-- Migration: NPS pós-procedimento D+7 [s2-3 plano growth]
--
-- Fluxo end-to-end:
--   1. Paciente finaliza procedimento → regra d_after (7d, 11h)
--      enfileira WA perguntando nota 0-10
--   2. Paciente responde → trigger parse extrai numero, grava em
--      nps_responses (anti-duplicacao por appt_id)
--   3. Nota >=9 (promotora): enfileira 2a mensagem pedindo
--      AUTORIZACAO de depoimento/foto. Resposta SIM grava
--      testimonial_consent=true.
--      NAO mexe em VPI (convite ja sai D+1 via autoEnroll).
--   4. Nota <=6 (detratora): cria task alta prioridade em
--      clinic_op_tasks pra secretaria/Mirian ligar antes de virar
--      review negativo no Google.
--
-- Componentes:
--   1) Tabela nps_responses
--   2) Template WA 'nps_d7' (trigger_type=d_after, days=7, hour=11)
--   3) Template WA 'nps_depoimento_request' (on_demand)
--   4) Template WA 'nps_recuperacao_detratora' (on_demand)
--   5) Trigger AFTER INSERT em wa_messages: nps_parse_inbound()
--   6) RPC nps_kpis(period_days) pra dashboard
--   7) RPC nps_testimonials_consented(limit) pros depoimentos
--
-- Idempotente. Graceful degrade se wa_messages/wa_outbox ausentes.
-- ============================================================

-- ── 1. Tabela nps_responses ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.nps_responses (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  appt_id               text,
  lead_id               text,
  phone_suffix          text NOT NULL,
  score                 int  NOT NULL CHECK (score >= 0 AND score <= 10),
  raw_message           text,
  category              text NOT NULL CHECK (category IN ('promotora','neutra','detratora')),
  testimonial_consent   boolean DEFAULT false,
  testimonial_consent_at timestamptz,
  testimonial_text      text,
  testimonial_photo_url text,
  follow_up_task_id     text,
  created_at            timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_nps_responses_appt_unique
  ON public.nps_responses(clinic_id, appt_id)
  WHERE appt_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_nps_responses_phone_created
  ON public.nps_responses(clinic_id, phone_suffix, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nps_responses_category_created
  ON public.nps_responses(clinic_id, category, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_nps_responses_consent
  ON public.nps_responses(clinic_id, testimonial_consent, created_at DESC)
  WHERE testimonial_consent = true;

ALTER TABLE public.nps_responses ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
     WHERE schemaname='public' AND tablename='nps_responses'
       AND policyname='nps_responses_all_rw'
  ) THEN
    CREATE POLICY nps_responses_all_rw ON public.nps_responses
      FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 2. Template WA: nps_d7 (pergunta) ────────────────────────
DO $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_content text;
  v_id uuid;
BEGIN
  v_content :=
E'Oi, *{{nome}}*! \U0001F493\n\n' ||
E'Aqui e da *Clinica Mirian de Paula*.\n\n' ||
E'Faz 7 dias desde seu procedimento e gostariamos de saber como voce esta se sentindo.\n\n' ||
E'*De 0 a 10, o quanto voce recomendaria a nossa clinica pra uma amiga?*\n\n' ||
E'Sua resposta e muito importante pra gente continuar melhorando. \u2728';

  SELECT id INTO v_id FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic AND slug = 'nps_d7' LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.wa_agenda_automations (
      clinic_id, slug, name, description,
      category, sort_order, trigger_type, trigger_config,
      recipient_type, channel, content_template, is_active
    ) VALUES (
      v_clinic, 'nps_d7',
      'NPS D+7',
      'Pergunta de satisfacao 7 dias apos finalizar procedimento. Disparada via trigger d_after.',
      'pos', 32, 'd_after',
      jsonb_build_object('days', 7, 'hour', 11, 'minute', 0),
      'patient', 'whatsapp', v_content, true
    );
    RAISE NOTICE '[nps_d7] template criado';
  ELSE
    UPDATE public.wa_agenda_automations
       SET description = 'Pergunta de satisfacao 7 dias apos finalizar procedimento. Disparada via trigger d_after.',
           trigger_config = jsonb_build_object('days', 7, 'hour', 11, 'minute', 0)
     WHERE id = v_id;
    RAISE NOTICE '[nps_d7] template atualizado (content preservado)';
  END IF;
EXCEPTION
  WHEN undefined_column THEN RAISE NOTICE '[nps_d7] wa_agenda_automations schema ausente';
  WHEN undefined_table  THEN RAISE NOTICE '[nps_d7] wa_agenda_automations nao existe';
END $$;

-- ── 3. Template WA: nps_depoimento_request (apos nota >=9) ──
DO $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_content text;
  v_id uuid;
BEGIN
  v_content :=
E'*{{nome}}*, que alegria saber disso! \U0001F31F\n\n' ||
E'Historias como a sua inspiram outras mulheres a cuidarem de si com a mesma coragem.\n\n' ||
E'Voce nos autoriza a compartilhar um depoimento seu — um pequeno texto com seu primeiro nome, talvez uma foto do resultado — como inspiracao pra outras pacientes?\n\n' ||
E'Se sim, responde *AUTORIZO* aqui. Sem pressa, voce tambem pode pensar e voltar depois.\n\n' ||
E'De qualquer forma, obrigada pela confianca.';

  SELECT id INTO v_id FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic AND slug = 'nps_depoimento_request' LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.wa_agenda_automations (
      clinic_id, slug, name, description,
      category, sort_order, trigger_type, trigger_config,
      recipient_type, channel, content_template, is_active
    ) VALUES (
      v_clinic, 'nps_depoimento_request',
      'NPS Pedido de Depoimento',
      'Enviado apos paciente dar nota >=9 no NPS D+7. Pede autorizacao pra usar depoimento/foto.',
      'pos', 33, 'on_demand', '{}'::jsonb,
      'patient', 'whatsapp', v_content, true
    );
    RAISE NOTICE '[nps_depoimento_request] template criado';
  ELSE
    UPDATE public.wa_agenda_automations
       SET description = 'Enviado apos paciente dar nota >=9 no NPS D+7. Pede autorizacao pra usar depoimento/foto.'
     WHERE id = v_id;
    RAISE NOTICE '[nps_depoimento_request] template atualizado (content preservado)';
  END IF;
EXCEPTION
  WHEN undefined_column THEN RAISE NOTICE '[nps_depoimento_request] schema ausente';
  WHEN undefined_table  THEN RAISE NOTICE '[nps_depoimento_request] tabela ausente';
END $$;

-- ── 4. Template WA: nps_recuperacao_detratora (apos nota <=6) ──
DO $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_content text;
  v_id uuid;
BEGIN
  v_content :=
E'*{{nome}}*, obrigada por compartilhar sua avaliacao.\n\n' ||
E'Sua experiencia importa muito pra gente e a sua honestidade nos ajuda a melhorar.\n\n' ||
E'A *Dra. Mirian* gostaria de conversar pessoalmente com voce sobre como podemos fazer diferente. Posso marcar um retorno sem custo pra ajustarmos o que precisa?\n\n' ||
E'Me responde aqui quando puder que organizamos tudo com cuidado.';

  SELECT id INTO v_id FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic AND slug = 'nps_recuperacao_detratora' LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.wa_agenda_automations (
      clinic_id, slug, name, description,
      category, sort_order, trigger_type, trigger_config,
      recipient_type, channel, content_template, is_active
    ) VALUES (
      v_clinic, 'nps_recuperacao_detratora',
      'NPS Recuperacao Detratora',
      'Enviado apos paciente dar nota <=6 no NPS D+7. Reconhece, abre conversa, oferece retorno.',
      'pos', 34, 'on_demand', '{}'::jsonb,
      'patient', 'whatsapp', v_content, true
    );
    RAISE NOTICE '[nps_recuperacao_detratora] template criado';
  ELSE
    UPDATE public.wa_agenda_automations
       SET description = 'Enviado apos paciente dar nota <=6 no NPS D+7. Reconhece, abre conversa, oferece retorno.'
     WHERE id = v_id;
    RAISE NOTICE '[nps_recuperacao_detratora] template atualizado (content preservado)';
  END IF;
EXCEPTION
  WHEN undefined_column THEN RAISE NOTICE '[nps_recuperacao_detratora] schema ausente';
  WHEN undefined_table  THEN RAISE NOTICE '[nps_recuperacao_detratora] tabela ausente';
END $$;

-- ── 5. Trigger AFTER INSERT em wa_messages: parse resposta ───
-- Duas responsabilidades:
--   A) Se e resposta de NPS (numero 0-10 apos envio de nps_d7 em
--      72h): grava em nps_responses + dispara proxima acao
--   B) Se e resposta AUTORIZO apos nps_depoimento_request em 72h:
--      marca testimonial_consent=true
CREATE OR REPLACE FUNCTION public.nps_parse_inbound()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id    uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_phone        text;
  v_phone_suffix text;
  v_score_text   text;
  v_score        int;
  v_category     text;
  v_had_nps      boolean;
  v_had_depo     boolean;
  v_nps_rule     uuid;
  v_depo_rule    uuid;
  v_recup_rule   uuid;
  v_existing_nps public.nps_responses%ROWTYPE;
  v_appt_id      text;
  v_lead_id      text;
  v_upper        text;
  v_first_name   text;
  v_nome_full    text;
  v_tpl_body     text;
  v_content      text;
  v_vars         jsonb;
  v_task_id      text;
BEGIN
  IF NEW.direction <> 'inbound' THEN RETURN NEW; END IF;

  -- Tenta obter phone do lead via conversation
  BEGIN
    SELECT COALESCE(l.phone, c.contact_phone)
      INTO v_phone
      FROM public.wa_conversations c
      LEFT JOIN public.clinic_leads l ON l.id = c.lead_id
     WHERE c.id = NEW.conversation_id
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_phone := NULL;
  END;

  IF v_phone IS NULL OR v_phone = '' THEN RETURN NEW; END IF;

  v_phone_suffix := right(regexp_replace(v_phone, '\D','','g'), 8);
  IF length(v_phone_suffix) < 8 THEN RETURN NEW; END IF;

  v_upper := upper(trim(COALESCE(NEW.content, '')));

  -- Rule ids pra matching temporal
  SELECT id INTO v_nps_rule FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic_id AND slug = 'nps_d7' LIMIT 1;
  SELECT id INTO v_depo_rule FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic_id AND slug = 'nps_depoimento_request' LIMIT 1;
  SELECT id INTO v_recup_rule FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic_id AND slug = 'nps_recuperacao_detratora' LIMIT 1;

  -- ── Fluxo B: AUTORIZO apos nps_depoimento_request ────────
  IF v_depo_rule IS NOT NULL AND v_upper ~ '(^|[^A-Z])AUTORIZO([^A-Z]|$)' THEN
    BEGIN
      v_had_depo := EXISTS (
        SELECT 1 FROM public.wa_outbox
         WHERE rule_id = v_depo_rule
           AND right(regexp_replace(COALESCE(phone,''), '\D','','g'), 8) = v_phone_suffix
           AND sent_at IS NOT NULL
           AND sent_at >= now() - interval '72 hours'
      );
      IF v_had_depo THEN
        UPDATE public.nps_responses
           SET testimonial_consent = true,
               testimonial_consent_at = now()
         WHERE clinic_id = v_clinic_id
           AND phone_suffix = v_phone_suffix
           AND category = 'promotora'
           AND created_at >= now() - interval '15 days'
           AND (testimonial_consent IS NOT true);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      /* silencioso */ NULL;
    END;
  END IF;

  -- ── Fluxo A: nota 0-10 apos nps_d7 ───────────────────────
  IF v_nps_rule IS NULL THEN RETURN NEW; END IF;

  -- Verifica se saiu nps_d7 pra esse phone nas ultimas 72h
  BEGIN
    SELECT EXISTS (
      SELECT 1 FROM public.wa_outbox
       WHERE rule_id = v_nps_rule
         AND right(regexp_replace(COALESCE(phone,''), '\D','','g'), 8) = v_phone_suffix
         AND sent_at IS NOT NULL
         AND sent_at >= now() - interval '72 hours'
    ), (
      SELECT appt_ref FROM public.wa_outbox
       WHERE rule_id = v_nps_rule
         AND right(regexp_replace(COALESCE(phone,''), '\D','','g'), 8) = v_phone_suffix
         AND sent_at IS NOT NULL
         AND sent_at >= now() - interval '72 hours'
       ORDER BY sent_at DESC LIMIT 1
    ), (
      SELECT lead_id FROM public.wa_outbox
       WHERE rule_id = v_nps_rule
         AND right(regexp_replace(COALESCE(phone,''), '\D','','g'), 8) = v_phone_suffix
         AND sent_at IS NOT NULL
         AND sent_at >= now() - interval '72 hours'
       ORDER BY sent_at DESC LIMIT 1
    )
    INTO v_had_nps, v_appt_id, v_lead_id;
  EXCEPTION WHEN OTHERS THEN
    v_had_nps := false;
  END;

  IF NOT COALESCE(v_had_nps, false) THEN RETURN NEW; END IF;

  -- Extrai numero 0-10 da resposta.
  -- Regex pega primeiro token 0-10 isolado (match 10 antes de 0-9).
  v_score_text := (regexp_match(NEW.content, '(?:^|[^0-9])(10|[0-9])(?:[^0-9]|$)'))[1];
  IF v_score_text IS NULL THEN RETURN NEW; END IF;

  v_score := v_score_text::int;
  v_category := CASE
    WHEN v_score >= 9 THEN 'promotora'
    WHEN v_score >= 7 THEN 'neutra'
    ELSE 'detratora'
  END;

  -- Anti-duplicacao: se ja existe response pra esse appt_id, ignora
  IF v_appt_id IS NOT NULL THEN
    SELECT * INTO v_existing_nps FROM public.nps_responses
     WHERE clinic_id = v_clinic_id AND appt_id = v_appt_id LIMIT 1;
    IF FOUND THEN RETURN NEW; END IF;
  END IF;

  -- Grava response
  INSERT INTO public.nps_responses (
    clinic_id, appt_id, lead_id, phone_suffix, score, raw_message, category
  ) VALUES (
    v_clinic_id, v_appt_id, v_lead_id, v_phone_suffix, v_score,
    LEFT(COALESCE(NEW.content, ''), 500), v_category
  );

  -- Busca nome do lead pra personalizar proxima mensagem
  BEGIN
    SELECT COALESCE(l.name, '') INTO v_nome_full
      FROM public.clinic_leads l WHERE l.id = v_lead_id LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    v_nome_full := '';
  END;
  v_first_name := split_part(COALESCE(NULLIF(TRIM(v_nome_full), ''), 'amiga'), ' ', 1);

  -- ── Acao: promotora → pede depoimento ─────────────────────
  IF v_category = 'promotora' AND v_depo_rule IS NOT NULL THEN
    BEGIN
      SELECT content_template INTO v_tpl_body
        FROM public.wa_agenda_automations
       WHERE id = v_depo_rule AND is_active = true;
      IF v_tpl_body IS NOT NULL THEN
        v_vars := jsonb_build_object('nome', v_first_name, 'nome_completo', v_nome_full);
        BEGIN
          v_content := public._wa_render_template(v_tpl_body, v_vars);
        EXCEPTION WHEN undefined_function THEN
          v_content := replace(v_tpl_body, '{{nome}}', v_first_name);
          v_content := replace(v_content, '{{nome_completo}}', v_nome_full);
        END;
        PERFORM public.wa_outbox_schedule_automation(
          p_phone         => regexp_replace(v_phone, '\D','','g'),
          p_content       => v_content,
          p_lead_id       => v_lead_id,
          p_lead_name     => v_nome_full,
          p_scheduled_at  => now() + interval '2 minutes',
          p_appt_ref      => v_appt_id,
          p_rule_id       => v_depo_rule,
          p_ab_variant    => NULL,
          p_vars_snapshot => v_vars
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      /* fire-and-forget */ NULL;
    END;
  END IF;

  -- ── Acao: detratora → recuperacao + task alta prioridade ─
  IF v_category = 'detratora' AND v_recup_rule IS NOT NULL THEN
    BEGIN
      SELECT content_template INTO v_tpl_body
        FROM public.wa_agenda_automations
       WHERE id = v_recup_rule AND is_active = true;
      IF v_tpl_body IS NOT NULL THEN
        v_vars := jsonb_build_object('nome', v_first_name, 'nome_completo', v_nome_full);
        BEGIN
          v_content := public._wa_render_template(v_tpl_body, v_vars);
        EXCEPTION WHEN undefined_function THEN
          v_content := replace(v_tpl_body, '{{nome}}', v_first_name);
          v_content := replace(v_content, '{{nome_completo}}', v_nome_full);
        END;
        PERFORM public.wa_outbox_schedule_automation(
          p_phone         => regexp_replace(v_phone, '\D','','g'),
          p_content       => v_content,
          p_lead_id       => v_lead_id,
          p_lead_name     => v_nome_full,
          p_scheduled_at  => now() + interval '5 minutes',
          p_appt_ref      => v_appt_id,
          p_rule_id       => v_recup_rule,
          p_ab_variant    => NULL,
          p_vars_snapshot => v_vars
        );
      END IF;
    EXCEPTION WHEN OTHERS THEN
      /* fire-and-forget */ NULL;
    END;
    v_task_id := 'task_nps_det_' || extract(epoch from now())::bigint;
    UPDATE public.nps_responses SET follow_up_task_id = v_task_id
     WHERE clinic_id = v_clinic_id AND phone_suffix = v_phone_suffix
       AND category = 'detratora' AND created_at >= now() - interval '5 minutes';
  END IF;

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE '[nps_parse_inbound] erro: %', SQLERRM;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_nps_parse_inbound ON public.wa_messages;
CREATE TRIGGER trg_nps_parse_inbound
  AFTER INSERT ON public.wa_messages
  FOR EACH ROW
  EXECUTE FUNCTION public.nps_parse_inbound();

-- ── 6. RPC: KPIs NPS pro dashboard ──────────────────────────
CREATE OR REPLACE FUNCTION public.nps_kpis(
  p_period_days int DEFAULT 30
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_since     timestamptz;
  v_total     int;
  v_prom      int;
  v_neu       int;
  v_det       int;
  v_avg       numeric;
  v_score     numeric;
  v_consent   int;
  v_dist      jsonb;
BEGIN
  v_since := now() - (GREATEST(1, p_period_days) || ' days')::interval;

  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE category='promotora'),
    COUNT(*) FILTER (WHERE category='neutra'),
    COUNT(*) FILTER (WHERE category='detratora'),
    COALESCE(ROUND(AVG(score)::numeric, 2), 0),
    COUNT(*) FILTER (WHERE testimonial_consent = true)
  INTO v_total, v_prom, v_neu, v_det, v_avg, v_consent
  FROM public.nps_responses
  WHERE clinic_id = v_clinic_id
    AND created_at >= v_since;

  v_score := CASE WHEN v_total > 0
                 THEN ROUND(((v_prom - v_det)::numeric / v_total) * 100, 1)
                 ELSE 0 END;

  -- Distribuicao 0-10
  SELECT COALESCE(jsonb_object_agg(s::text, c), '{}'::jsonb) INTO v_dist
    FROM (
      SELECT score AS s, COUNT(*) AS c
        FROM public.nps_responses
       WHERE clinic_id = v_clinic_id
         AND created_at >= v_since
       GROUP BY score
    ) q;

  RETURN jsonb_build_object(
    'ok',              true,
    'period_days',     GREATEST(1, p_period_days),
    'since',           v_since,
    'total_responses', v_total,
    'promotoras',      v_prom,
    'neutras',         v_neu,
    'detratoras',      v_det,
    'nota_media',      v_avg,
    'nps_score',       v_score,
    'consent_count',   v_consent,
    'distribution',    v_dist
  );
EXCEPTION
  WHEN undefined_table THEN
    RETURN jsonb_build_object('ok', false, 'error', 'table_missing');
END $$;
GRANT EXECUTE ON FUNCTION public.nps_kpis(int) TO authenticated;

-- ── 7. RPC: depoimentos consentidos (pro feed) ───────────────
CREATE OR REPLACE FUNCTION public.nps_testimonials_consented(
  p_limit int DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(q.*) ORDER BY q.created_at DESC), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT r.id, r.appt_id, r.lead_id, r.phone_suffix, r.score,
             r.testimonial_text, r.testimonial_photo_url,
             r.testimonial_consent_at, r.created_at,
             l.name AS lead_name
        FROM public.nps_responses r
        LEFT JOIN public.clinic_leads l ON l.id = r.lead_id
       WHERE r.clinic_id = v_clinic_id
         AND r.testimonial_consent = true
       ORDER BY r.testimonial_consent_at DESC NULLS LAST, r.created_at DESC
       LIMIT GREATEST(1, p_limit)
    ) q;

  RETURN COALESCE(v_out, '[]'::jsonb);
EXCEPTION
  WHEN undefined_table THEN
    RETURN '[]'::jsonb;
END $$;
GRANT EXECUTE ON FUNCTION public.nps_testimonials_consented(int) TO authenticated;

-- ── 8. Sanity ────────────────────────────────────────────────
DO $$
DECLARE v_tpls int; v_fns int; v_trg int;
BEGIN
  SELECT count(*) INTO v_tpls FROM public.wa_agenda_automations
   WHERE slug IN ('nps_d7','nps_depoimento_request','nps_recuperacao_detratora')
     AND is_active = true;
  SELECT count(*) INTO v_fns FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('nps_parse_inbound','nps_kpis','nps_testimonials_consented');
  SELECT count(*) INTO v_trg FROM pg_trigger
   WHERE tgname='trg_nps_parse_inbound';
  RAISE NOTICE '[nps] templates=% fns=% trg=%', v_tpls, v_fns, v_trg;
END $$;
