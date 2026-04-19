-- ============================================================
-- Migration: B2B Pacote de Automações Operacionais
--
-- Da auditoria final — zero-touch operacional semanal.
--
-- Top 1 — Automações:
--   A. Voucher expire batch + cron diário
--   B. Weekly insight auto-trigger + cron segunda
--   C. Playbook IA auto-trigger ao passar pra 'contract'
--   D. Bridge brief → wa_outbox (RPC)
--
-- Top 2 — Inteligência:
--   E. NPS detrator → insight crítico automático (trigger)
--   F. Impact ROI por parceria (RPC)
--
-- Usa pg_net (já instalado) pra invocar edge functions.
-- Idempotente. RLS permissiva.
-- ============================================================

-- URL base Supabase + helper seguro pra chamar edge functions
CREATE OR REPLACE FUNCTION public._b2b_invoke_edge(p_path text, p_body jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_url text := 'https://oqboitkpcvuaudouwvkl.supabase.co/functions/v1/' || p_path;
  v_request_id bigint;
BEGIN
  -- Fire-and-forget: pg_net é assíncrono, não espera resposta
  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json'),
    body    := p_body,
    timeout_milliseconds := 30000
  ) INTO v_request_id;
  RETURN jsonb_build_object('ok', true, 'request_id', v_request_id, 'url', v_url);
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'edge invoke falhou (%): %', p_path, SQLERRM;
  RETURN jsonb_build_object('ok', false, 'error', SQLERRM);
END $$;


-- ════════════════════════════════════════════════════════════
-- A. VOUCHER EXPIRE BATCH + CRON
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.b2b_vouchers_expire_batch()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count int;
BEGIN
  WITH upd AS (
    UPDATE public.b2b_vouchers
       SET status = 'expired', updated_at = now()
     WHERE status IN ('issued','delivered','opened')
       AND valid_until IS NOT NULL
       AND valid_until < now()
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM upd;
  RETURN jsonb_build_object('ok', true, 'expired', v_count);
END $$;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('b2b_cron_voucher_expiry'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule(
    'b2b_cron_voucher_expiry',
    '0 6 * * *',   -- diário 06:00 UTC = 03:00 BRT
    'SELECT public.b2b_vouchers_expire_batch()'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponível — voucher_expiry manual';
END $$;


-- ════════════════════════════════════════════════════════════
-- B. WEEKLY INSIGHT AUTO-TRIGGER
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.b2b_weekly_insight_trigger()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN public._b2b_invoke_edge('b2b-weekly-insight', '{}'::jsonb);
END $$;

DO $$
BEGIN
  BEGIN PERFORM cron.unschedule('b2b_cron_weekly_insight'); EXCEPTION WHEN OTHERS THEN NULL; END;
  PERFORM cron.schedule(
    'b2b_cron_weekly_insight',
    '0 10 * * 1',   -- toda segunda 10:00 UTC = 07:00 BRT
    'SELECT public.b2b_weekly_insight_trigger()'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponível — weekly_insight manual';
END $$;


-- ════════════════════════════════════════════════════════════
-- C. PLAYBOOK IA AUTO-TRIGGER AO 'CONTRACT'
-- ════════════════════════════════════════════════════════════

-- Quando uma parceria passa pra status 'contract' E ainda não tem
-- nenhum conteúdo em b2b_partnership_content, dispara o Playbook IA.
CREATE OR REPLACE FUNCTION public._b2b_on_partnership_contract()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_has_content int;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.status = 'contract' AND
     (OLD.status IS NULL OR OLD.status <> 'contract') THEN
    SELECT COUNT(*) INTO v_has_content
      FROM public.b2b_partnership_content
     WHERE partnership_id = NEW.id;
    IF v_has_content = 0 THEN
      PERFORM public._b2b_invoke_edge(
        'b2b-playbook-ia',
        jsonb_build_object('partnership_id', NEW.id, 'scope', 'all', 'requested_by', 'auto_contract')
      );
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_b2b_partnership_on_contract ON public.b2b_partnerships;
CREATE TRIGGER trg_b2b_partnership_on_contract
  AFTER UPDATE OF status ON public.b2b_partnerships
  FOR EACH ROW EXECUTE FUNCTION public._b2b_on_partnership_contract();


-- ════════════════════════════════════════════════════════════
-- D. BRIDGE BRIEF → WA_OUTBOX
-- ════════════════════════════════════════════════════════════

-- Dada uma task (kind='brief_monthly' ou similar), monta mensagem e
-- enfileira em wa_outbox_schedule_automation. Resolve task como 'done'.
CREATE OR REPLACE FUNCTION public.b2b_brief_dispatch_to_wa(p_task_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_task      record;
  v_partnership record;
  v_content text;
  v_phone text;
  v_enqueue_id text;
BEGIN
  SELECT * INTO v_task FROM public.b2b_tasks
   WHERE clinic_id = v_clinic_id AND id = p_task_id AND status = 'open';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'task_not_found_or_not_open');
  END IF;

  SELECT * INTO v_partnership FROM public.b2b_partnerships
   WHERE id = v_task.partnership_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  v_phone := v_partnership.contact_phone;
  IF v_phone IS NULL OR length(trim(v_phone)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_without_phone');
  END IF;

  v_content := COALESCE(v_task.description,
    'Oi, ' || COALESCE(v_partnership.contact_name, 'parceira(o)') || '! ' ||
    'Aqui é da Clínica Mirian de Paula. Tô passando pra um check-in rápido da nossa parceria.');

  -- Enfileira
  SELECT public.wa_outbox_enqueue_appt(
    p_phone     := v_phone,
    p_content   := v_content,
    p_lead_name := COALESCE(v_partnership.contact_name, v_partnership.name),
    p_appt_ref  := 'b2b_brief_' || p_task_id::text,
    p_lead_id   := ''
  ) INTO v_enqueue_id;

  -- Resolve a task
  UPDATE public.b2b_tasks
     SET status = 'done', resolved_at = now(), updated_at = now()
   WHERE id = p_task_id;

  RETURN jsonb_build_object('ok', true, 'enqueue_ref', v_enqueue_id, 'task_id', p_task_id);
END $$;


-- ════════════════════════════════════════════════════════════
-- E. NPS DETRATOR → INSIGHT CRÍTICO AUTOMÁTICO
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public._b2b_on_nps_detractor()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner_name text;
  v_headline text;
  v_detail text;
BEGIN
  IF NEW.score IS NOT NULL AND NEW.score <= 6 AND
     (OLD.score IS NULL OR OLD.score IS DISTINCT FROM NEW.score) THEN
    SELECT name INTO v_partner_name FROM public.b2b_partnerships WHERE id = NEW.partnership_id;

    v_headline := 'Parceira deu NPS ' || NEW.score || ' · ' || COALESCE(v_partner_name, 'sem nome');
    v_detail := 'A parceira respondeu ' || NEW.score || '/10 na pesquisa trimestral de ' ||
      TO_CHAR(NEW.quarter_ref, 'Mon/YYYY') || '. ' ||
      CASE
        WHEN NEW.comment IS NOT NULL AND length(NEW.comment) > 0
          THEN 'Comentário: "' || NEW.comment || '"'
        ELSE 'Sem comentário adicional.'
      END;

    PERFORM public.b2b_insight_add(jsonb_build_object(
      'partnership_id',    NEW.partnership_id,
      'severity',          CASE WHEN NEW.score <= 3 THEN 'critical' ELSE 'warning' END,
      'headline',          v_headline,
      'detail',            v_detail,
      'suggested_action',  'Agendar conversa 1-a-1 com ' || COALESCE(v_partner_name, 'a parceira') ||
                           ' nos próximos 7 dias. Foco em ouvir, não em defender.',
      'data',              jsonb_build_object('source', 'nps_detractor', 'nps_score', NEW.score)
    ));
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_b2b_nps_detractor ON public.b2b_nps_responses;
CREATE TRIGGER trg_b2b_nps_detractor
  AFTER INSERT OR UPDATE OF score ON public.b2b_nps_responses
  FOR EACH ROW EXECUTE FUNCTION public._b2b_on_nps_detractor();


-- ════════════════════════════════════════════════════════════
-- F. IMPACT ROI POR PARCERIA
-- ════════════════════════════════════════════════════════════

-- Score = (vouchers_redeemed × nps_score × (1 + reach_factor)) / (1 + total_cost/1000)
-- Normalizado em 0-100. Quanto maior, melhor.
CREATE OR REPLACE FUNCTION public.b2b_partnership_impact_score(p_partnership_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  WITH base AS (
    SELECT
      p.id, p.name, p.tier, p.pillar, p.status, p.health_color,
      COALESCE((SELECT COUNT(*) FROM public.b2b_vouchers v
                 WHERE v.partnership_id = p.id AND v.status = 'redeemed'), 0) AS vouchers_redeemed,
      COALESCE((SELECT SUM(reach_count) FROM public.b2b_group_exposures ge
                 WHERE ge.partnership_id = p.id), 0) AS total_reach,
      COALESCE(p.voucher_unit_cost_brl, 0) *
        COALESCE((SELECT COUNT(*) FROM public.b2b_vouchers v
                   WHERE v.partnership_id = p.id AND v.status = 'redeemed'), 0) +
      COALESCE((SELECT SUM(cost_estimate_brl) FROM public.b2b_group_exposures ge
                 WHERE ge.partnership_id = p.id), 0) AS total_cost,
      COALESCE((SELECT AVG(score)::numeric FROM public.b2b_nps_responses n
                 WHERE n.partnership_id = p.id AND n.score IS NOT NULL), 0) AS avg_nps
      FROM public.b2b_partnerships p
     WHERE p.clinic_id = v_clinic_id
       AND (p_partnership_id IS NULL OR p.id = p_partnership_id)
       AND p.status NOT IN ('closed')
  ),
  scored AS (
    SELECT
      *,
      -- Impact score bruto
      (vouchers_redeemed::numeric * GREATEST(avg_nps, 1) * (1 + total_reach::numeric / 1000))
      / GREATEST(1 + total_cost / 1000, 1) AS raw_score
    FROM base
  ),
  normalized AS (
    SELECT *,
      CASE WHEN MAX(raw_score) OVER () > 0
        THEN ROUND((raw_score / MAX(raw_score) OVER ()) * 100)
        ELSE 0
      END AS impact_score
    FROM scored
  )
  SELECT CASE
    WHEN p_partnership_id IS NOT NULL THEN
      COALESCE(to_jsonb(n.*), jsonb_build_object('ok', false, 'error', 'not_found'))
    ELSE
      COALESCE(jsonb_agg(to_jsonb(n.*) ORDER BY n.impact_score DESC), '[]'::jsonb)
    END
  INTO v_out
  FROM normalized n;

  RETURN v_out;
END $$;


-- ════════════════════════════════════════════════════════════
-- GRANTS
-- ════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public._b2b_invoke_edge(text, jsonb)             TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_vouchers_expire_batch()               TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_weekly_insight_trigger()              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_brief_dispatch_to_wa(uuid)            TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_partnership_impact_score(uuid)        TO anon, authenticated, service_role;
