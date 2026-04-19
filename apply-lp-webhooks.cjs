/* ============================================================
 * apply-lp-webhooks.cjs (Onda 27)
 *
 * Webhooks disparados quando lead é capturado em LP:
 *   · lp_webhooks — slug, url, events[], headers jsonb, secret, active
 *   · lp_webhook_deliveries — registro de cada disparo (status, response)
 *   · RPCs: lp_webhook_set, lp_webhook_list, lp_webhook_delete
 *           lp_webhook_test (echo de payload)
 *           lp_webhook_deliveries_list
 *   · Trigger em lp_leads INSERT que enfileira em lp_webhook_pending
 *
 * O dispatch real (HTTP POST) acontece em edge function ou worker —
 * aqui só preparamos a fila. Se você quiser dispatch via pg, basta
 * usar net.http_post (extension pg_net se disponível).
 *
 * Idempotente. Uso: node apply-lp-webhooks.cjs
 * ============================================================ */
const { Client } = require('pg')
const sql = `
CREATE TABLE IF NOT EXISTS public.lp_webhooks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  page_slug   text,                    -- NULL = todas as LPs
  url         text NOT NULL,
  events      text[] NOT NULL DEFAULT '{lead.created}',
  headers     jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret      text,                    -- pra HMAC (opcional)
  active      boolean NOT NULL DEFAULT true,
  label       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_lp_webhooks_slug ON public.lp_webhooks (page_slug, active);

CREATE TABLE IF NOT EXISTS public.lp_webhook_deliveries (
  id            bigserial PRIMARY KEY,
  webhook_id    uuid NOT NULL REFERENCES public.lp_webhooks(id) ON DELETE CASCADE,
  event         text NOT NULL,
  payload       jsonb NOT NULL,
  status        text NOT NULL DEFAULT 'pending',  -- pending|sent|failed
  response_code int,
  response_body text,
  attempts      int NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now(),
  delivered_at  timestamptz
);

CREATE INDEX IF NOT EXISTS idx_lp_webhook_deliv_status ON public.lp_webhook_deliveries (status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lp_webhook_deliv_webhook ON public.lp_webhook_deliveries (webhook_id, created_at DESC);

ALTER TABLE public.lp_webhooks            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lp_webhook_deliveries  ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lp_webhooks_clinic ON public.lp_webhooks;
DROP POLICY IF EXISTS lp_webhook_deliv_clinic ON public.lp_webhook_deliveries;
CREATE POLICY lp_webhooks_clinic ON public.lp_webhooks
  FOR ALL USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);
CREATE POLICY lp_webhook_deliv_clinic ON public.lp_webhook_deliveries
  FOR ALL USING (true);  -- relaciona via FK

CREATE OR REPLACE FUNCTION public.lp_webhook_set(
  p_id        uuid,
  p_url       text,
  p_events    text[],
  p_page_slug text DEFAULT NULL,
  p_label     text DEFAULT NULL,
  p_secret    text DEFAULT NULL,
  p_headers   jsonb DEFAULT '{}'::jsonb,
  p_active    boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_id uuid;
BEGIN
  IF p_url IS NULL OR p_url !~ '^https?://' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'url_invalid');
  END IF;
  IF p_id IS NULL THEN
    INSERT INTO public.lp_webhooks (page_slug, url, events, headers, secret, active, label)
    VALUES (NULLIF(p_page_slug, ''), p_url, COALESCE(p_events, ARRAY['lead.created']), COALESCE(p_headers, '{}'::jsonb), p_secret, p_active, p_label)
    RETURNING id INTO v_id;
  ELSE
    UPDATE public.lp_webhooks
       SET page_slug = NULLIF(p_page_slug, ''),
           url       = p_url,
           events    = COALESCE(p_events, events),
           headers   = COALESCE(p_headers, '{}'::jsonb),
           secret    = p_secret,
           active    = p_active,
           label     = p_label,
           updated_at = now()
     WHERE id = p_id
     RETURNING id INTO v_id;
    IF v_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  END IF;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;
GRANT EXECUTE ON FUNCTION public.lp_webhook_set(uuid, text, text[], text, text, text, jsonb, boolean) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.lp_webhook_list()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',         w.id,
      'page_slug',  w.page_slug,
      'url',        w.url,
      'events',     to_jsonb(w.events),
      'headers',    w.headers,
      'has_secret', w.secret IS NOT NULL,
      'active',     w.active,
      'label',      w.label,
      'created_at', w.created_at,
      'updated_at', w.updated_at
    ) ORDER BY w.created_at DESC)
    FROM public.lp_webhooks w
  ), '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.lp_webhook_list() TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.lp_webhook_delete(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  DELETE FROM public.lp_webhooks WHERE id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  RETURN jsonb_build_object('ok', true);
END $$;
GRANT EXECUTE ON FUNCTION public.lp_webhook_delete(uuid) TO anon, authenticated;

-- Deliveries de 1 webhook
CREATE OR REPLACE FUNCTION public.lp_webhook_deliveries_list(p_webhook_id uuid, p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
      'id',            d.id,
      'event',         d.event,
      'status',        d.status,
      'response_code', d.response_code,
      'attempts',      d.attempts,
      'created_at',    d.created_at,
      'delivered_at',  d.delivered_at
    ) ORDER BY d.created_at DESC)
    FROM (
      SELECT * FROM public.lp_webhook_deliveries
       WHERE webhook_id = p_webhook_id
       ORDER BY created_at DESC
       LIMIT GREATEST(1, LEAST(p_limit, 200))
    ) d
  ), '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.lp_webhook_deliveries_list(uuid, int) TO anon, authenticated;

-- Enfileira delivery (chamada por trigger ou manualmente p/ test)
CREATE OR REPLACE FUNCTION public.lp_webhook_enqueue(p_event text, p_payload jsonb, p_slug text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_count int := 0;
BEGIN
  INSERT INTO public.lp_webhook_deliveries (webhook_id, event, payload)
  SELECT w.id, p_event, p_payload
    FROM public.lp_webhooks w
   WHERE w.active
     AND p_event = ANY(w.events)
     AND (w.page_slug IS NULL OR w.page_slug = p_slug);
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'enqueued', v_count);
END $$;
GRANT EXECUTE ON FUNCTION public.lp_webhook_enqueue(text, jsonb, text) TO anon, authenticated;

-- Trigger em lp_leads pra enfileirar (best-effort, não falha o INSERT)
CREATE OR REPLACE FUNCTION public.lp_leads_webhook_trg()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM public.lp_webhook_enqueue(
    'lead.created',
    jsonb_build_object(
      'lead_id',    NEW.id,
      'page_slug',  NEW.page_slug,
      'name',       NEW.name,
      'phone',      NEW.phone,
      'email',      NEW.email,
      'message',    NEW.message,
      'utm',        COALESCE(NEW.utm, '{}'::jsonb),
      'created_at', NEW.created_at
    ),
    NEW.page_slug
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- nunca quebra captura de lead por causa de webhook
  RETURN NEW;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name='lp_leads') THEN
    DROP TRIGGER IF EXISTS lp_leads_webhook_trg ON public.lp_leads;
    CREATE TRIGGER lp_leads_webhook_trg
      AFTER INSERT ON public.lp_leads
      FOR EACH ROW EXECUTE FUNCTION public.lp_leads_webhook_trg();
  END IF;
END $$;

COMMENT ON TABLE public.lp_webhooks IS 'Configuração de webhooks por LP/global (Onda 27)';
COMMENT ON TABLE public.lp_webhook_deliveries IS 'Fila + histórico de entregas. Worker externo lê WHERE status=pending';
`
const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})
;(async () => {
  try {
    await c.connect(); await c.query(sql); await c.query("NOTIFY pgrst, 'reload schema'")
    console.log('[webhooks] migration aplicada')
  } catch (e) { console.error('ERROR:', e.message); process.exit(1) }
  finally { await c.end() }
})()
