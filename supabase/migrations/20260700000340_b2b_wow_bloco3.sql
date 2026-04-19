-- ============================================================
-- Migration: B2B WOW Bloco 3 — Tier B (operacional premium)
--
-- W9  — Insight semanal por IA (b2b_insights)
-- W11 — NPS do parceiro em 1 clique (b2b_nps_responses)
--
-- W10 (certificado PDF) é 100% cliente — só HTML.
-- W12 (modo pitch) é 100% cliente — só overlay fullscreen.
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- W9 — INSIGHTS SEMANAIS
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.b2b_insights (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  week_ref        date NOT NULL DEFAULT date_trunc('week', now())::date,
  partnership_id  uuid NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  severity        text NOT NULL DEFAULT 'info'
                  CHECK (severity IN ('info','opportunity','warning','critical')),
  headline        text NOT NULL,
  detail          text NULL,
  suggested_action text NULL,
  data            jsonb NULL,
  dismissed_at    timestamptz NULL,
  seen_at         timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_insights_week
  ON public.b2b_insights (clinic_id, week_ref DESC, dismissed_at);
CREATE INDEX IF NOT EXISTS idx_b2b_insights_partnership
  ON public.b2b_insights (partnership_id, created_at DESC);

ALTER TABLE public.b2b_insights ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_insights_all" ON public.b2b_insights;
CREATE POLICY "b2b_insights_all" ON public.b2b_insights FOR ALL USING (true) WITH CHECK (true);


-- ── RPC: lista insights não descartados (pra toast de abertura) ──
CREATE OR REPLACE FUNCTION public.b2b_insights_list(p_limit int DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',              i.id,
    'week_ref',        i.week_ref,
    'severity',        i.severity,
    'headline',        i.headline,
    'detail',          i.detail,
    'suggested_action', i.suggested_action,
    'partnership_id',  i.partnership_id,
    'partnership_name', p.name,
    'data',            i.data,
    'seen_at',         i.seen_at,
    'created_at',      i.created_at
  ) ORDER BY i.created_at DESC), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT * FROM public.b2b_insights
       WHERE clinic_id = v_clinic_id AND dismissed_at IS NULL
       ORDER BY created_at DESC
       LIMIT p_limit
    ) i
    LEFT JOIN public.b2b_partnerships p ON p.id = i.partnership_id;
  RETURN v_out;
END $$;


-- ── RPC: marca como visto ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_insight_mark_seen(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.b2b_insights SET seen_at = COALESCE(seen_at, now())
   WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── RPC: dispensa (esconde do toast) ────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_insight_dismiss(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.b2b_insights SET dismissed_at = now() WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;

-- ── RPC: insere insight (edge function chama) ───────────────
CREATE OR REPLACE FUNCTION public.b2b_insight_add(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_id uuid;
BEGIN
  INSERT INTO public.b2b_insights (
    clinic_id, partnership_id, severity, headline, detail, suggested_action, data
  ) VALUES (
    v_clinic_id,
    NULLIF(p_payload->>'partnership_id','')::uuid,
    COALESCE(p_payload->>'severity','info'),
    p_payload->>'headline',
    p_payload->>'detail',
    p_payload->>'suggested_action',
    p_payload->'data'
  ) RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;


-- ════════════════════════════════════════════════════════════
-- W11 — NPS DO PARCEIRO
-- ════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.b2b_nps_responses (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  partnership_id  uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  token           text NOT NULL,
  quarter_ref     date NOT NULL DEFAULT date_trunc('quarter', now())::date,
  score           int NULL CHECK (score BETWEEN 0 AND 10),
  comment         text NULL,
  responded_at    timestamptz NULL,
  opened_at       timestamptz NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, token)
);

CREATE INDEX IF NOT EXISTS idx_b2b_nps_partnership
  ON public.b2b_nps_responses (partnership_id, quarter_ref DESC);

ALTER TABLE public.b2b_nps_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_nps_responses_all" ON public.b2b_nps_responses;
CREATE POLICY "b2b_nps_responses_all" ON public.b2b_nps_responses FOR ALL USING (true) WITH CHECK (true);


-- ── RPC: emitir token NPS pra uma parceria ──────────────────
CREATE OR REPLACE FUNCTION public.b2b_nps_issue(p_partnership_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_token text;
  v_try int := 0;
  v_id uuid;
BEGIN
  PERFORM 1 FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id AND id = p_partnership_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  LOOP
    v_token := lower(substr(md5(random()::text || clock_timestamp()::text || p_partnership_id::text), 1, 10));
    BEGIN
      INSERT INTO public.b2b_nps_responses (partnership_id, token)
      VALUES (p_partnership_id, v_token)
      RETURNING id INTO v_id;
      EXIT;
    EXCEPTION WHEN unique_violation THEN
      v_try := v_try + 1;
      IF v_try > 5 THEN RAISE; END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'id', v_id, 'token', v_token);
END $$;


-- ── RPC: public get por token (marca opened_at) ─────────────
CREATE OR REPLACE FUNCTION public.b2b_nps_get(p_token text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_id uuid;
  v_score int;
  v_name text;
BEGIN
  SELECT n.id, n.score, p.name
    INTO v_id, v_score, v_name
    FROM public.b2b_nps_responses n
    JOIN public.b2b_partnerships p ON p.id = n.partnership_id
   WHERE n.token = p_token;
  IF v_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  UPDATE public.b2b_nps_responses
     SET opened_at = COALESCE(opened_at, now())
   WHERE id = v_id;

  RETURN jsonb_build_object(
    'ok', true,
    'partnership_name', v_name,
    'already_answered', v_score IS NOT NULL,
    'score', v_score
  );
END $$;


-- ── RPC: submeter resposta ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_nps_submit(p_token text, p_score int, p_comment text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_score IS NULL OR p_score < 0 OR p_score > 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'score_out_of_range');
  END IF;

  UPDATE public.b2b_nps_responses
     SET score = p_score,
         comment = p_comment,
         responded_at = now()
   WHERE token = p_token AND score IS NULL
   RETURNING id INTO v_id;

  IF v_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token_invalid_or_used');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;


-- ── RPC: agregado NPS (por parceria) ────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_nps_summary(p_partnership_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_total int;
  v_promoters int;
  v_passives int;
  v_detractors int;
  v_nps int;
  v_avg numeric;
BEGIN
  SELECT COUNT(*) FILTER (WHERE score IS NOT NULL),
         COUNT(*) FILTER (WHERE score >= 9),
         COUNT(*) FILTER (WHERE score BETWEEN 7 AND 8),
         COUNT(*) FILTER (WHERE score <= 6 AND score IS NOT NULL),
         AVG(score) FILTER (WHERE score IS NOT NULL)
    INTO v_total, v_promoters, v_passives, v_detractors, v_avg
    FROM public.b2b_nps_responses
   WHERE clinic_id = v_clinic_id
     AND (p_partnership_id IS NULL OR partnership_id = p_partnership_id);

  v_nps := CASE WHEN v_total > 0 THEN
    ROUND(((v_promoters::numeric / v_total) - (v_detractors::numeric / v_total)) * 100)::int
  ELSE NULL END;

  RETURN jsonb_build_object(
    'responses',   v_total,
    'promoters',   v_promoters,
    'passives',    v_passives,
    'detractors',  v_detractors,
    'avg_score',   CASE WHEN v_avg IS NOT NULL THEN ROUND(v_avg, 1) ELSE NULL END,
    'nps_score',   v_nps
  );
END $$;


-- ── RPC: cria tarefas NPS trimestrais (1 por parceria active) ──
CREATE OR REPLACE FUNCTION public.b2b_nps_quarterly_dispatch()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_row record;
  v_token_res jsonb;
  v_url text;
  v_created int := 0;
BEGIN
  FOR v_row IN
    SELECT id, name FROM public.b2b_partnerships
     WHERE clinic_id = v_clinic_id AND status = 'active'
  LOOP
    v_token_res := public.b2b_nps_issue(v_row.id);
    IF (v_token_res->>'ok')::boolean THEN
      v_url := '/nps.html?t=' || (v_token_res->>'token');
      PERFORM public._b2b_task_create_unique(
        v_row.id, 'nps_dispatch',
        'Enviar NPS trimestral · ' || v_row.name,
        'Link exclusivo (copie e mande via WhatsApp ao parceiro): ' || v_url,
        current_date + INTERVAL '7 days',
        jsonb_build_object('nps_token', v_token_res->>'token', 'nps_url', v_url)
      );
      v_created := v_created + 1;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'dispatched', v_created);
END $$;


-- ── Cron trimestral: 1º dia do trimestre 11:00 UTC ─────────
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('b2b_cron_nps_quarterly');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  PERFORM cron.schedule(
    'b2b_cron_nps_quarterly',
    '0 11 1 1,4,7,10 *',
    'SELECT public.b2b_nps_quarterly_dispatch()'
  );
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron indisponível — nps quarterly fica manual';
END $$;


-- ── Grants ──────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.b2b_insights_list(int)                  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_insight_mark_seen(uuid)             TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_insight_dismiss(uuid)               TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_insight_add(jsonb)                  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_nps_issue(uuid)                     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_nps_get(text)                       TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_nps_submit(text, int, text)         TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_nps_summary(uuid)                   TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_nps_quarterly_dispatch()            TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_insights              TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_nps_responses         TO anon, authenticated, service_role;
