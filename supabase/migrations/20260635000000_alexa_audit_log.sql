-- ============================================================
-- Migration: 20260635000000 — Alexa Audit Log
--
-- Registra cada announce enviado (device, mensagem, status).
-- Permite metricas, debug e fila de retry offline.
-- ============================================================

-- ── 1. Tabela de audit log ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clinic_alexa_log (
  id          uuid        NOT NULL DEFAULT gen_random_uuid(),
  clinic_id   uuid        NOT NULL DEFAULT app_clinic_id(),
  device      text        NOT NULL,
  message     text        NOT NULL,
  rule_name   text,
  patient     text,
  status      text        NOT NULL DEFAULT 'pending',
  error       text,
  attempts    int         NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz,

  CONSTRAINT clinic_alexa_log_pkey PRIMARY KEY (id)
);

CREATE INDEX idx_alexa_log_clinic_created ON public.clinic_alexa_log (clinic_id, created_at DESC);
CREATE INDEX idx_alexa_log_status ON public.clinic_alexa_log (status) WHERE status = 'pending';

ALTER TABLE public.clinic_alexa_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY alexa_log_select ON public.clinic_alexa_log
  FOR SELECT TO authenticated
  USING (clinic_id = app_clinic_id());

CREATE POLICY alexa_log_insert ON public.clinic_alexa_log
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = app_clinic_id());

CREATE POLICY alexa_log_update ON public.clinic_alexa_log
  FOR UPDATE TO authenticated
  USING (clinic_id = app_clinic_id());

-- ── 2. RPC: log announce ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public.alexa_log_announce(
  p_device    text,
  p_message   text,
  p_rule_name text DEFAULT NULL,
  p_patient   text DEFAULT NULL,
  p_status    text DEFAULT 'sent',
  p_error     text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.clinic_alexa_log (device, message, rule_name, patient, status, error, attempts, sent_at)
  VALUES (
    p_device, p_message, p_rule_name, p_patient, p_status, p_error,
    CASE WHEN p_status = 'sent' THEN 1 ELSE 0 END,
    CASE WHEN p_status = 'sent' THEN now() ELSE NULL END
  );
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.alexa_log_announce(text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alexa_log_announce(text, text, text, text, text, text) TO authenticated;

-- ── 3. RPC: metricas ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.alexa_metrics(
  p_days int DEFAULT 7
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_result    jsonb;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado');
  END IF;

  SELECT jsonb_build_object(
    'ok', true,
    'total',     COUNT(*),
    'sent',      COUNT(*) FILTER (WHERE status = 'sent'),
    'failed',    COUNT(*) FILTER (WHERE status = 'failed'),
    'pending',   COUNT(*) FILTER (WHERE status = 'pending'),
    'by_device', (
      SELECT jsonb_agg(jsonb_build_object('device', device, 'total', cnt, 'sent', sent, 'failed', failed))
      FROM (
        SELECT device, COUNT(*) as cnt,
               COUNT(*) FILTER (WHERE status = 'sent') as sent,
               COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM public.clinic_alexa_log
        WHERE clinic_id = v_clinic_id AND created_at >= now() - (p_days || ' days')::interval
        GROUP BY device ORDER BY cnt DESC
      ) sub
    ),
    'by_day', (
      SELECT jsonb_agg(jsonb_build_object('date', dia, 'sent', sent, 'failed', failed))
      FROM (
        SELECT created_at::date as dia,
               COUNT(*) FILTER (WHERE status = 'sent') as sent,
               COUNT(*) FILTER (WHERE status = 'failed') as failed
        FROM public.clinic_alexa_log
        WHERE clinic_id = v_clinic_id AND created_at >= now() - (p_days || ' days')::interval
        GROUP BY dia ORDER BY dia DESC
      ) sub
    ),
    'last_sent', (SELECT MAX(sent_at) FROM public.clinic_alexa_log WHERE clinic_id = v_clinic_id AND status = 'sent'),
    'last_error', (SELECT error FROM public.clinic_alexa_log WHERE clinic_id = v_clinic_id AND status = 'failed' ORDER BY created_at DESC LIMIT 1)
  )
  INTO v_result
  FROM public.clinic_alexa_log
  WHERE clinic_id = v_clinic_id AND created_at >= now() - (p_days || ' days')::interval;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.alexa_metrics(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alexa_metrics(int) TO authenticated;

-- ── 4. RPC: pending retry queue ──────────────────────────────
CREATE OR REPLACE FUNCTION public.alexa_pending_queue()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := app_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false);
  END IF;

  RETURN jsonb_build_object('ok', true, 'data', (
    SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'device', device, 'message', message,
      'rule_name', rule_name, 'patient', patient,
      'attempts', attempts, 'created_at', created_at
    )), '[]'::jsonb)
    FROM public.clinic_alexa_log
    WHERE clinic_id = v_clinic_id AND status = 'pending' AND attempts < 5
    ORDER BY created_at ASC LIMIT 20
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.alexa_pending_queue() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alexa_pending_queue() TO authenticated;

-- ── 5. RPC: update log status ────────────────────────────────
CREATE OR REPLACE FUNCTION public.alexa_log_update(
  p_id     uuid,
  p_status text,
  p_error  text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.clinic_alexa_log
  SET status = p_status,
      error = COALESCE(p_error, error),
      attempts = attempts + 1,
      sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END
  WHERE id = p_id AND clinic_id = app_clinic_id();
  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.alexa_log_update(uuid, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.alexa_log_update(uuid, text, text) TO authenticated;
