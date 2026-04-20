-- ============================================================================
-- Substitui dispatch via pg_net+pg_cron (buggy locks) por Edge Function call.
-- pg_cron a cada 1 min faz POST simples (fire-and-forget) na Edge Function.
-- Trigger AFTER INSERT em dispatch também invoca pra processamento imediato.
-- ============================================================================

-- Drop tudo do approach pg_net direto (deixa só Edge Function)
DROP FUNCTION IF EXISTS public._aq_process_one_dispatch(uuid);
DROP FUNCTION IF EXISTS public.aq_process_pending();
DROP FUNCTION IF EXISTS public._aq_build_prompt(uuid);

-- Helper: chama a Edge Function via pg_net (fire-and-forget)
CREATE OR REPLACE FUNCTION public._aq_invoke_lara_edge_fn()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, vault, net
AS $$
DECLARE
  v_url       text := 'https://oqboitkpcvuaudouwvkl.supabase.co/functions/v1/lara-dispatch';
  v_anon_key  text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0';
  v_req_id    bigint;
BEGIN
  -- POST sem body · função interna sabe o que fazer
  SELECT net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || v_anon_key,
      'content-type',  'application/json'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 5000
  ) INTO v_req_id;
  RETURN v_req_id;
END;
$$;

-- Trigger AFTER INSERT em anatomy_quiz_lara_dispatch · invoca imediato
CREATE OR REPLACE FUNCTION public._tr_aq_dispatch_invoke_edge()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'pending' THEN
    PERFORM public._aq_invoke_lara_edge_fn();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_aq_dispatch_invoke_edge ON public.anatomy_quiz_lara_dispatch;
CREATE TRIGGER trg_aq_dispatch_invoke_edge
  AFTER INSERT ON public.anatomy_quiz_lara_dispatch
  FOR EACH ROW
  EXECUTE FUNCTION public._tr_aq_dispatch_invoke_edge();

-- Atualiza cron · agora apenas chama a Edge Function (que faz o trabalho)
SELECT cron.unschedule('aq_lara_dispatcher')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'aq_lara_dispatcher');

SELECT cron.schedule(
  'aq_lara_dispatcher',
  '* * * * *',  -- a cada 1 min · catch-up de qualquer pendente que escapou do trigger
  $cron$ SELECT public._aq_invoke_lara_edge_fn(); $cron$
);

COMMENT ON FUNCTION public._aq_invoke_lara_edge_fn IS
  'POST fire-and-forget na Edge Function lara-dispatch · processa fila de dispatches pendentes';
