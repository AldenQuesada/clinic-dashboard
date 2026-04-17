-- ============================================================
-- Migration: VPI Partner Score (Fase 6 - Entrega 2)
--
-- Cada parceira tem score 0-100 composto de 5 dimensoes + alertas
-- contextuais. Classe (diamante|quente|morna|fria|dormente) visivel
-- no ranking e no detalhe. Alertas listados abaixo do score.
--
-- Dimensoes e pesos:
--   - Produtividade (40): creditos dos closed nos ultimos 90d x 5
--   - Engajamento   (25): cliques no short_link nos ultimos 30d
--   - Recorrencia   (15): streak_meses x 10
--   - Cadastro      (10): % de campos preenchidos (6 campos)
--   - Criterio      (10): has_injetavel_12m -> 100 senao 0
--
-- Alertas:
--   - cadastro_incompleto (score_cadastro < 70)
--   - criterio_expirado (criterio=0) — CTA reativacao WA
--   - dormente (dias_sem_indicar >= 30)
--   - em_crescimento (streak_meses >= 3)
--
-- Template WA vpi_reativacao_criterio (on_demand, edit pela UI).
-- pg_cron diario 02h BRT recalcula tudo.
-- ============================================================

-- ── 1. Colunas de score em vpi_partners ─────────────────────
ALTER TABLE public.vpi_partners ADD COLUMN IF NOT EXISTS score_total            int  DEFAULT 0;
ALTER TABLE public.vpi_partners ADD COLUMN IF NOT EXISTS score_produtividade    int  DEFAULT 0;
ALTER TABLE public.vpi_partners ADD COLUMN IF NOT EXISTS score_engajamento      int  DEFAULT 0;
ALTER TABLE public.vpi_partners ADD COLUMN IF NOT EXISTS score_recorrencia      int  DEFAULT 0;
ALTER TABLE public.vpi_partners ADD COLUMN IF NOT EXISTS score_cadastro         int  DEFAULT 0;
ALTER TABLE public.vpi_partners ADD COLUMN IF NOT EXISTS score_criterio_entrada int  DEFAULT 0;
ALTER TABLE public.vpi_partners ADD COLUMN IF NOT EXISTS score_classe           text DEFAULT 'dormente';
ALTER TABLE public.vpi_partners ADD COLUMN IF NOT EXISTS alertas                jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.vpi_partners ADD COLUMN IF NOT EXISTS score_atualizado_em    timestamptz;

CREATE INDEX IF NOT EXISTS idx_vpi_partners_score_total ON public.vpi_partners (score_total DESC);
CREATE INDEX IF NOT EXISTS idx_vpi_partners_score_classe ON public.vpi_partners (score_classe);

-- ── 2. RPC: compute score de 1 partner ──────────────────────
CREATE OR REPLACE FUNCTION public.vpi_partner_compute_score(
  p_partner_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_p              public.vpi_partners%ROWTYPE;
  v_sum_cred_90    int := 0;
  v_clicks_30      int := 0;
  v_campos         int := 0;
  v_campos_total   int := 6;
  v_campos_faltam  text := '';
  v_criterio       int := 0;
  v_last_closed    timestamptz;
  v_days_sem_ind   int := 999;

  v_sc_prod        int := 0;
  v_sc_eng         int := 0;
  v_sc_rec         int := 0;
  v_sc_cad         int := 0;
  v_sc_cri         int := 0;
  v_sc_total       int := 0;
  v_classe         text;
  v_alertas        jsonb := '[]'::jsonb;
  v_missing        text[];
BEGIN
  IF p_partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partner_id_required');
  END IF;

  SELECT * INTO v_p FROM public.vpi_partners
   WHERE id = p_partner_id AND clinic_id = v_clinic_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partner_not_found');
  END IF;

  -- Produtividade: soma creditos dos closed nos 90d x 5, cap 100
  SELECT COALESCE(SUM(i.creditos), 0)::int INTO v_sum_cred_90
    FROM public.vpi_indications i
   WHERE i.partner_id = v_p.id
     AND i.clinic_id  = v_clinic_id
     AND i.status     = 'closed'
     AND i.fechada_em >= now() - interval '90 days';

  v_sc_prod := LEAST(100, GREATEST(0, v_sum_cred_90 * 5));

  -- Engajamento: clicks no short link nos 30d
  BEGIN
    IF COALESCE(v_p.short_link_slug, '') <> '' THEN
      SELECT COALESCE(SUM(sl.clicks), 0)::int INTO v_clicks_30
        FROM public.short_links sl
       WHERE sl.clinic_id = v_clinic_id
         AND sl.code      = v_p.short_link_slug
         AND sl.created_at >= now() - interval '90 days';
      -- Nota: tabela short_links tem clicks acumulado (total). Sem histograma de eventos,
      -- usa clicks total cap 100 com fator (clicks / 5) — 5 cliques = 100.
      v_sc_eng := LEAST(100, GREATEST(0, v_clicks_30 * 20));
    ELSE
      v_sc_eng := 0;
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_sc_eng := 0;
  END;

  -- Recorrencia: streak_meses x 10, cap 100
  v_sc_rec := LEAST(100, GREATEST(0, COALESCE(v_p.streak_meses, 0) * 10));

  -- Cadastro: % dos 6 campos preenchidos
  v_campos := 0;
  v_missing := ARRAY[]::text[];
  IF COALESCE(v_p.nome, '')      <> '' THEN v_campos := v_campos + 1; ELSE v_missing := array_append(v_missing, 'nome'); END IF;
  IF COALESCE(v_p.phone, '')     <> '' THEN v_campos := v_campos + 1; ELSE v_missing := array_append(v_missing, 'telefone'); END IF;
  IF COALESCE(v_p.cidade, '')    <> '' THEN v_campos := v_campos + 1; ELSE v_missing := array_append(v_missing, 'cidade'); END IF;
  IF COALESCE(v_p.estado, '')    <> '' THEN v_campos := v_campos + 1; ELSE v_missing := array_append(v_missing, 'estado'); END IF;
  IF COALESCE(v_p.profissao, '') <> '' THEN v_campos := v_campos + 1; ELSE v_missing := array_append(v_missing, 'profissao'); END IF;
  IF COALESCE(v_p.avatar_url, '')<> '' THEN v_campos := v_campos + 1; ELSE v_missing := array_append(v_missing, 'avatar'); END IF;
  v_sc_cad := (v_campos::numeric / v_campos_total::numeric * 100)::int;
  v_campos_faltam := array_to_string(v_missing, ', ');

  -- Criterio de entrada: injetavel 12m
  -- (Reusa logica de vpi_search_candidates — mas RPC isolada seria circular.
  -- Inline: busca appointments do partner nos ultimos 365d)
  IF EXISTS (
    SELECT 1 FROM public.appointments a
     WHERE a.clinic_id = v_clinic_id
       AND a.deleted_at IS NULL
       AND a.scheduled_date >= (CURRENT_DATE - interval '365 days')
       AND COALESCE(a.status, '') IN ('completed', 'concluido', 'finalizado', 'presente', 'atendido')
       AND (
         right(regexp_replace(COALESCE(a.patient_phone, ''), '\D', '', 'g'), 8)
           = right(regexp_replace(COALESCE(v_p.phone, ''), '\D', '', 'g'), 8)
         AND length(regexp_replace(COALESCE(v_p.phone, ''), '\D', '', 'g')) >= 8
       )
       AND (
         lower(COALESCE(a.procedure_name, '')) LIKE '%botox%'
         OR lower(COALESCE(a.procedure_name, '')) LIKE '%toxina%'
         OR lower(COALESCE(a.procedure_name, '')) LIKE '%hialuron%'
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(a.procedimentos, '[]'::jsonb)) x
            WHERE lower(COALESCE(x->>'nome', '')) LIKE '%botox%'
               OR lower(COALESCE(x->>'nome', '')) LIKE '%toxina%'
               OR lower(COALESCE(x->>'nome', '')) LIKE '%hialuron%'
         )
       )
  ) THEN
    v_sc_cri  := 100;
    v_criterio := 1;
  ELSE
    v_sc_cri  := 0;
    v_criterio := 0;
  END IF;

  -- Dias sem indicar (pra alerta dormente)
  SELECT MAX(i.fechada_em) INTO v_last_closed
    FROM public.vpi_indications i
   WHERE i.partner_id = v_p.id AND i.status = 'closed';
  IF v_last_closed IS NOT NULL THEN
    v_days_sem_ind := EXTRACT(DAY FROM (now() - v_last_closed))::int;
  END IF;

  -- Score total
  v_sc_total := ROUND(
    v_sc_prod * 0.40 +
    v_sc_eng  * 0.25 +
    v_sc_rec  * 0.15 +
    v_sc_cad  * 0.10 +
    v_sc_cri  * 0.10
  )::int;

  -- Classe
  v_classe := CASE
    WHEN v_sc_total >= 80 THEN 'diamante'
    WHEN v_sc_total >= 60 THEN 'quente'
    WHEN v_sc_total >= 40 THEN 'morna'
    WHEN v_sc_total >= 20 THEN 'fria'
    ELSE                       'dormente'
  END;

  -- Alertas
  v_alertas := '[]'::jsonb;

  IF v_sc_cad < 70 THEN
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object(
      'tipo',  'cadastro_incompleto',
      'texto', 'Faltam campos: ' || COALESCE(NULLIF(v_campos_faltam, ''), '—'),
      'cor',   'orange'
    ));
  END IF;

  IF v_sc_cri = 0 THEN
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object(
      'tipo',  'criterio_expirado',
      'texto', 'Nao fez injetavel ha 12m — reativar',
      'cor',   'red',
      'cta',   jsonb_build_object('label', 'Enviar WA reativacao', 'action', 'vpi_send_reativacao')
    ));
  END IF;

  IF v_days_sem_ind >= 30 AND v_last_closed IS NOT NULL THEN
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object(
      'tipo',  'dormente',
      'texto', v_days_sem_ind::text || ' dias sem indicar',
      'cor',   'yellow'
    ));
  END IF;

  IF COALESCE(v_p.streak_meses, 0) >= 3 THEN
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object(
      'tipo',  'em_crescimento',
      'texto', COALESCE(v_p.streak_meses, 0)::text || ' meses consecutivos',
      'cor',   'green'
    ));
  END IF;

  -- Persist
  UPDATE public.vpi_partners
     SET score_total            = v_sc_total,
         score_produtividade    = v_sc_prod,
         score_engajamento      = v_sc_eng,
         score_recorrencia      = v_sc_rec,
         score_cadastro         = v_sc_cad,
         score_criterio_entrada = v_sc_cri,
         score_classe           = v_classe,
         alertas                = v_alertas,
         score_atualizado_em    = now()
   WHERE id = v_p.id;

  RETURN jsonb_build_object(
    'ok',                    true,
    'partner_id',            v_p.id,
    'score_total',           v_sc_total,
    'score_produtividade',   v_sc_prod,
    'score_engajamento',     v_sc_eng,
    'score_recorrencia',     v_sc_rec,
    'score_cadastro',        v_sc_cad,
    'score_criterio_entrada',v_sc_cri,
    'score_classe',          v_classe,
    'alertas',               v_alertas,
    'breakdown',             jsonb_build_object(
      'creditos_90d',   v_sum_cred_90,
      'clicks_90d',     v_clicks_30,
      'streak_meses',   COALESCE(v_p.streak_meses, 0),
      'campos_ok',      v_campos,
      'campos_total',   v_campos_total,
      'campos_faltam',  v_campos_faltam,
      'has_injetavel_12m', v_criterio = 1,
      'days_sem_indicar',  v_days_sem_ind,
      'last_closed_at',    v_last_closed
    )
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_partner_compute_score(uuid) TO authenticated;

-- ── 3. RPC: batch recompute all partners ───────────────────
CREATE OR REPLACE FUNCTION public.vpi_partner_compute_scores_all()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  r           record;
  v_count     int := 0;
  v_failed    int := 0;
BEGIN
  FOR r IN SELECT id FROM public.vpi_partners
            WHERE clinic_id = v_clinic_id AND status <> 'inativo'
  LOOP
    BEGIN
      PERFORM public.vpi_partner_compute_score(r.id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',            true,
    'updated_count', v_count,
    'failed_count',  v_failed
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_partner_compute_scores_all() TO authenticated;

-- ── 4. Trigger: recalcula partner apos close de indicacao ──
CREATE OR REPLACE FUNCTION public._vpi_trg_score_after_indication()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.partner_id IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status)
  THEN
    BEGIN
      PERFORM public.vpi_partner_compute_score(NEW.partner_id);
    EXCEPTION WHEN OTHERS THEN
      -- nao bloqueia insert/update se o score falhar
      RAISE NOTICE '[vpi_score trigger] falhou: %', SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_ind_score ON public.vpi_indications;
CREATE TRIGGER trg_vpi_ind_score
AFTER INSERT OR UPDATE OF status ON public.vpi_indications
FOR EACH ROW
EXECUTE FUNCTION public._vpi_trg_score_after_indication();

-- ── 5. Template WA vpi_reativacao_criterio ─────────────────
DO $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_exists_id uuid;
  v_content   text;
BEGIN
  v_content :=
E'Oi, *{{nome}}*! \U0001F49C\n\n' ||
E'Faz ja um tempinho desde seu ultimo procedimento conosco! Como voce e nossa *parceira oficial do programa de indicacao*, queremos te lembrar que pra manter os beneficios exclusivos (inclusive o preco parceiro em Botox/Acido Hialuronico) o ideal e agendar seu proximo procedimento em breve.\n\n' ||
E'Quer que eu ja reserve um horario pra voce? \u2728\n\n' ||
E'*Clinica Mirian de Paula*';

  SELECT id INTO v_exists_id
    FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic_id AND slug = 'vpi_reativacao_criterio'
   LIMIT 1;

  IF v_exists_id IS NULL THEN
    INSERT INTO public.wa_agenda_automations (
      clinic_id, slug, name, description,
      category, sort_order, trigger_type, trigger_config,
      recipient_type, channel, content_template, is_active
    ) VALUES (
      v_clinic_id,
      'vpi_reativacao_criterio',
      'VPI Reativacao Criterio (injetavel)',
      'Enviada on-demand quando o score flag criterio_expirado (sem injetavel ha 12m). Reativa a parceira lembrando do beneficio exclusivo.',
      'after', 11, 'on_demand', '{}'::jsonb,
      'patient', 'whatsapp', v_content, true
    );
    RAISE NOTICE '[vpi_reativacao_criterio] template criado';
  ELSE
    UPDATE public.wa_agenda_automations
       SET content_template = v_content,
           trigger_type     = 'on_demand',
           description      = 'Enviada on-demand quando o score flag criterio_expirado (sem injetavel ha 12m). Reativa a parceira lembrando do beneficio exclusivo.'
     WHERE id = v_exists_id;
    RAISE NOTICE '[vpi_reativacao_criterio] template atualizado';
  END IF;
EXCEPTION
  WHEN undefined_column THEN RAISE NOTICE '[vpi_reativacao_criterio] schema ausente';
  WHEN undefined_table  THEN RAISE NOTICE '[vpi_reativacao_criterio] tabela nao existe';
END $$;

-- ── 6. RPC: envia reativacao (CTA do alerta) ────────────────
CREATE OR REPLACE FUNCTION public.vpi_send_reativacao(
  p_partner_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id  uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_p          public.vpi_partners%ROWTYPE;
  v_tpl_id     uuid;
  v_tpl_cont   text;
  v_content    text;
  v_outbox_id  uuid;
  v_first_name text;
  v_vars       jsonb;
BEGIN
  IF p_partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partner_id_required');
  END IF;

  SELECT * INTO v_p FROM public.vpi_partners
   WHERE id = p_partner_id AND clinic_id = v_clinic_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partner_not_found');
  END IF;
  IF COALESCE(v_p.phone, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no_phone');
  END IF;

  SELECT id, content_template INTO v_tpl_id, v_tpl_cont
    FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic_id AND slug = 'vpi_reativacao_criterio' AND is_active = true
   LIMIT 1;

  IF v_tpl_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_not_found');
  END IF;

  v_first_name := split_part(COALESCE(v_p.nome, 'Parceira'), ' ', 1);
  v_vars := jsonb_build_object('nome', v_first_name, 'nome_completo', COALESCE(v_p.nome, ''));

  BEGIN
    v_content := public._wa_render_template(v_tpl_cont, v_vars);
  EXCEPTION WHEN undefined_function THEN
    v_content := replace(v_tpl_cont, '{{nome}}', v_first_name);
  END;

  BEGIN
    v_outbox_id := public.wa_outbox_schedule_automation(
      p_phone         => v_p.phone,
      p_content       => v_content,
      p_lead_id       => COALESCE(v_p.lead_id, v_p.id::text),
      p_lead_name     => COALESCE(v_p.nome, ''),
      p_scheduled_at  => now(),
      p_appt_ref      => NULL,
      p_rule_id       => v_tpl_id,
      p_ab_variant    => NULL,
      p_vars_snapshot => v_vars
    );
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (v_clinic_id, 'reativacao_failed', 'vpi_partners', p_partner_id::text,
            jsonb_build_object('error', SQLERRM));
    RETURN jsonb_build_object('ok', false, 'error', 'wa_enqueue_failed', 'detail', SQLERRM);
  END;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic_id, 'reativacao_sent', 'vpi_partners', p_partner_id::text,
          jsonb_build_object('outbox_id', v_outbox_id, 'template_id', v_tpl_id));

  RETURN jsonb_build_object(
    'ok',        true,
    'outbox_id', v_outbox_id,
    'partner_id', p_partner_id,
    'content_preview', left(v_content, 180)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_send_reativacao(uuid) TO authenticated;

-- ── 7. pg_cron: recompute diario 2h BRT (05 UTC) ────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('vpi_partner_score_daily');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    PERFORM cron.schedule(
      'vpi_partner_score_daily',
      '0 5 * * *',
      'SELECT public.vpi_partner_compute_scores_all()'
    );
    RAISE NOTICE '[vpi_partner_score_daily] agendado (0 5 * * * = 2h BRT)';
  ELSE
    RAISE NOTICE 'pg_cron indisponivel; rodar vpi_partner_compute_scores_all() manualmente';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron falhou: %. Configurar manualmente.', SQLERRM;
END $$;

-- ── 8. Sanity ──────────────────────────────────────────────
DO $$
DECLARE v_fn int; v_cols int; v_job int;
BEGIN
  SELECT COUNT(*) INTO v_fn
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
   WHERE n.nspname='public'
     AND p.proname IN ('vpi_partner_compute_score', 'vpi_partner_compute_scores_all', 'vpi_send_reativacao');

  SELECT COUNT(*) INTO v_cols
    FROM information_schema.columns
   WHERE table_schema='public' AND table_name='vpi_partners'
     AND column_name IN ('score_total', 'score_classe', 'alertas');

  BEGIN
    SELECT COUNT(*) INTO v_job FROM cron.job WHERE jobname='vpi_partner_score_daily';
  EXCEPTION WHEN OTHERS THEN v_job := -1;
  END;

  RAISE NOTICE '[vpi_partner_score] rpcs=%/3 cols=%/3 cron=%', v_fn, v_cols, v_job;
END $$;
