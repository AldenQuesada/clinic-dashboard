-- ============================================================
-- Migration: B2B Health Tendência — Fraqueza #9
--
-- Registra snapshots periódicos do health_color de cada parceria
-- pra mostrar tendência (melhorando/estável/piorando) nos últimos 90d.
--
-- Estrutura:
--   b2b_health_history — uma linha por parceria × dia (quando houve mudança ou via cron)
--
-- Trigger escreve SOMENTE quando health_color muda (economia).
-- RPC retorna série temporal + trend consolidado.
--
-- Idempotente. RLS permissiva.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.b2b_health_history (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id      uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  partnership_id uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  health_color   text NOT NULL CHECK (health_color IN ('unknown','green','yellow','red')),
  previous_color text NULL,
  recorded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_b2b_health_history_partnership
  ON public.b2b_health_history (partnership_id, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_b2b_health_history_clinic
  ON public.b2b_health_history (clinic_id, recorded_at DESC);

ALTER TABLE public.b2b_health_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_health_history_all" ON public.b2b_health_history;
CREATE POLICY "b2b_health_history_all" ON public.b2b_health_history FOR ALL USING (true) WITH CHECK (true);


-- ── Trigger: registra mudança de health_color ───────────────
CREATE OR REPLACE FUNCTION public._b2b_health_history_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF (TG_OP = 'INSERT' AND NEW.health_color IS NOT NULL AND NEW.health_color <> 'unknown') OR
     (TG_OP = 'UPDATE' AND NEW.health_color IS DISTINCT FROM OLD.health_color) THEN
    INSERT INTO public.b2b_health_history (
      clinic_id, partnership_id, health_color, previous_color, recorded_at
    ) VALUES (
      NEW.clinic_id, NEW.id, NEW.health_color,
      CASE WHEN TG_OP = 'UPDATE' THEN OLD.health_color ELSE NULL END,
      now()
    );
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_b2b_health_history ON public.b2b_partnerships;
CREATE TRIGGER trg_b2b_health_history
  AFTER INSERT OR UPDATE OF health_color ON public.b2b_partnerships
  FOR EACH ROW EXECUTE FUNCTION public._b2b_health_history_log();


-- ── RPC: série temporal + trend de UMA parceria ─────────────
CREATE OR REPLACE FUNCTION public.b2b_health_trend(
  p_partnership_id uuid, p_days int DEFAULT 90
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_current text;
  v_first_in_window text;
  v_history jsonb;
  v_trend text;
  v_score_current int;
  v_score_first int;
  v_total_changes int;
  v_red_days int;
  v_green_days int;
BEGIN
  SELECT health_color INTO v_current
    FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id AND id = p_partnership_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found');
  END IF;

  SELECT health_color INTO v_first_in_window
    FROM public.b2b_health_history
   WHERE clinic_id = v_clinic_id AND partnership_id = p_partnership_id
     AND recorded_at >= now() - (p_days || ' days')::interval
   ORDER BY recorded_at ASC LIMIT 1;

  -- score numérico: green=3 yellow=2 red=1 unknown=0
  v_score_current := CASE COALESCE(v_current, 'unknown')
                       WHEN 'green' THEN 3 WHEN 'yellow' THEN 2
                       WHEN 'red' THEN 1 ELSE 0 END;
  v_score_first   := CASE COALESCE(v_first_in_window, v_current, 'unknown')
                       WHEN 'green' THEN 3 WHEN 'yellow' THEN 2
                       WHEN 'red' THEN 1 ELSE 0 END;

  v_trend := CASE
    WHEN v_score_current > v_score_first THEN 'improving'
    WHEN v_score_current < v_score_first THEN 'worsening'
    ELSE 'stable'
  END;

  SELECT COUNT(*) INTO v_total_changes
    FROM public.b2b_health_history
   WHERE clinic_id = v_clinic_id AND partnership_id = p_partnership_id
     AND recorded_at >= now() - (p_days || ' days')::interval;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'color', health_color,
      'previous', previous_color,
      'at', recorded_at
    ) ORDER BY recorded_at ASC
  ), '[]'::jsonb) INTO v_history
    FROM public.b2b_health_history
   WHERE clinic_id = v_clinic_id AND partnership_id = p_partnership_id
     AND recorded_at >= now() - (p_days || ' days')::interval;

  SELECT COUNT(*) FILTER (WHERE health_color = 'red'),
         COUNT(*) FILTER (WHERE health_color = 'green')
    INTO v_red_days, v_green_days
    FROM public.b2b_health_history
   WHERE clinic_id = v_clinic_id AND partnership_id = p_partnership_id
     AND recorded_at >= now() - (p_days || ' days')::interval;

  RETURN jsonb_build_object(
    'ok', true,
    'current', v_current,
    'first_in_window', v_first_in_window,
    'trend', v_trend,
    'days_window', p_days,
    'changes', v_total_changes,
    'red_changes', v_red_days,
    'green_changes', v_green_days,
    'history', v_history
  );
END $$;


-- ── RPC: snapshot agregado da clínica (dashboard saúde) ─────
CREATE OR REPLACE FUNCTION public.b2b_health_trend_summary(p_days int DEFAULT 90)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  WITH partnerships_with_trend AS (
    SELECT
      p.id, p.name, p.health_color AS current_color,
      (SELECT health_color FROM public.b2b_health_history h
         WHERE h.partnership_id = p.id
           AND h.recorded_at >= now() - (p_days || ' days')::interval
         ORDER BY h.recorded_at ASC LIMIT 1) AS first_color
    FROM public.b2b_partnerships p
    WHERE p.clinic_id = v_clinic_id AND p.status NOT IN ('closed')
  ),
  scored AS (
    SELECT
      id, name, current_color, first_color,
      CASE COALESCE(current_color, 'unknown')
        WHEN 'green' THEN 3 WHEN 'yellow' THEN 2 WHEN 'red' THEN 1 ELSE 0 END AS score_now,
      CASE COALESCE(first_color, current_color, 'unknown')
        WHEN 'green' THEN 3 WHEN 'yellow' THEN 2 WHEN 'red' THEN 1 ELSE 0 END AS score_start
    FROM partnerships_with_trend
  )
  SELECT jsonb_build_object(
    'improving', COUNT(*) FILTER (WHERE score_now > score_start),
    'stable',    COUNT(*) FILTER (WHERE score_now = score_start),
    'worsening', COUNT(*) FILTER (WHERE score_now < score_start),
    'days_window', p_days,
    'worsening_list', COALESCE(jsonb_agg(
      jsonb_build_object('id', id, 'name', name, 'from', first_color, 'to', current_color)
      ORDER BY score_start - score_now DESC
    ) FILTER (WHERE score_now < score_start), '[]'::jsonb)
  ) INTO v_out
  FROM scored;

  RETURN COALESCE(v_out, '{}'::jsonb);
END $$;


GRANT SELECT, INSERT ON public.b2b_health_history         TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_health_trend(uuid, int)     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_health_trend_summary(int)   TO anon, authenticated, service_role;
