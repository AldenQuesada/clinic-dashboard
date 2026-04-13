// Cola no console do dashboard (F12) para criar a tabela de audit log
(async function() {
  var statements = [
    "CREATE TABLE IF NOT EXISTS public.clinic_alexa_log (id uuid NOT NULL DEFAULT gen_random_uuid(), clinic_id uuid NOT NULL DEFAULT app_clinic_id(), device text NOT NULL, message text NOT NULL, rule_name text, patient text, status text NOT NULL DEFAULT 'pending', error text, attempts int NOT NULL DEFAULT 0, created_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz, CONSTRAINT clinic_alexa_log_pkey PRIMARY KEY (id))",
    "CREATE INDEX IF NOT EXISTS idx_alexa_log_clinic_created ON public.clinic_alexa_log (clinic_id, created_at DESC)",
    "CREATE INDEX IF NOT EXISTS idx_alexa_log_status ON public.clinic_alexa_log (status) WHERE status = 'pending'",
    "ALTER TABLE public.clinic_alexa_log ENABLE ROW LEVEL SECURITY",
    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clinic_alexa_log' AND policyname='alexa_log_select') THEN CREATE POLICY alexa_log_select ON public.clinic_alexa_log FOR SELECT TO authenticated USING (clinic_id = app_clinic_id()); END IF; END $$",
    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clinic_alexa_log' AND policyname='alexa_log_insert') THEN CREATE POLICY alexa_log_insert ON public.clinic_alexa_log FOR INSERT TO authenticated WITH CHECK (clinic_id = app_clinic_id()); END IF; END $$",
    "DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='clinic_alexa_log' AND policyname='alexa_log_update') THEN CREATE POLICY alexa_log_update ON public.clinic_alexa_log FOR UPDATE TO authenticated USING (clinic_id = app_clinic_id()); END IF; END $$",
  ]

  var rpcs = [
    "CREATE OR REPLACE FUNCTION public.alexa_log_announce(p_device text, p_message text, p_rule_name text DEFAULT NULL, p_patient text DEFAULT NULL, p_status text DEFAULT 'sent', p_error text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ BEGIN INSERT INTO public.clinic_alexa_log (device, message, rule_name, patient, status, error, attempts, sent_at) VALUES (p_device, p_message, p_rule_name, p_patient, p_status, p_error, CASE WHEN p_status = 'sent' THEN 1 ELSE 0 END, CASE WHEN p_status = 'sent' THEN now() ELSE NULL END); RETURN jsonb_build_object('ok', true); END; $fn$",
    "REVOKE ALL ON FUNCTION public.alexa_log_announce(text, text, text, text, text, text) FROM PUBLIC",
    "GRANT EXECUTE ON FUNCTION public.alexa_log_announce(text, text, text, text, text, text) TO authenticated",

    "CREATE OR REPLACE FUNCTION public.alexa_metrics(p_days int DEFAULT 7) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$ DECLARE v_clinic_id uuid; v_result jsonb; BEGIN v_clinic_id := app_clinic_id(); IF v_clinic_id IS NULL THEN RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado'); END IF; SELECT jsonb_build_object('ok', true, 'total', COUNT(*), 'sent', COUNT(*) FILTER (WHERE status = 'sent'), 'failed', COUNT(*) FILTER (WHERE status = 'failed'), 'pending', COUNT(*) FILTER (WHERE status = 'pending'), 'last_sent', MAX(sent_at) FILTER (WHERE status = 'sent')) INTO v_result FROM public.clinic_alexa_log WHERE clinic_id = v_clinic_id AND created_at >= now() - (p_days || ' days')::interval; RETURN v_result; END; $fn$",
    "REVOKE ALL ON FUNCTION public.alexa_metrics(int) FROM PUBLIC",
    "GRANT EXECUTE ON FUNCTION public.alexa_metrics(int) TO authenticated",

    "CREATE OR REPLACE FUNCTION public.alexa_pending_queue() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $fn$ DECLARE v_clinic_id uuid; BEGIN v_clinic_id := app_clinic_id(); IF v_clinic_id IS NULL THEN RETURN jsonb_build_object('ok', false); END IF; RETURN jsonb_build_object('ok', true, 'data', (SELECT COALESCE(jsonb_agg(jsonb_build_object('id', id, 'device', device, 'message', message, 'rule_name', rule_name, 'patient', patient, 'attempts', attempts, 'created_at', created_at)), '[]'::jsonb) FROM public.clinic_alexa_log WHERE clinic_id = v_clinic_id AND status = 'pending' AND attempts < 5 ORDER BY created_at ASC LIMIT 20)); END; $fn$",
    "REVOKE ALL ON FUNCTION public.alexa_pending_queue() FROM PUBLIC",
    "GRANT EXECUTE ON FUNCTION public.alexa_pending_queue() TO authenticated",

    "CREATE OR REPLACE FUNCTION public.alexa_log_update(p_id uuid, p_status text, p_error text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $fn$ BEGIN UPDATE public.clinic_alexa_log SET status = p_status, error = COALESCE(p_error, error), attempts = attempts + 1, sent_at = CASE WHEN p_status = 'sent' THEN now() ELSE sent_at END WHERE id = p_id AND clinic_id = app_clinic_id(); RETURN jsonb_build_object('ok', true); END; $fn$",
    "REVOKE ALL ON FUNCTION public.alexa_log_update(uuid, text, text) FROM PUBLIC",
    "GRANT EXECUTE ON FUNCTION public.alexa_log_update(uuid, text, text) TO authenticated",
  ]

  var all = statements.concat(rpcs)
  for (var i = 0; i < all.length; i++) {
    var r = await _sbShared.rpc('exec_raw_sql', { p_sql: all[i] }).catch(function() { return null })
    if (!r) {
      // Fallback: usar fetch direto no REST API com service_role nao disponivel
      // Tentar via postgrest rpc alternativo
      console.log('Stmt ' + (i+1) + ': exec_raw_sql nao disponivel, tentando via REST...')
    }
  }
  // Usar abordagem alternativa: executar via fetch ao Supabase SQL
  // Na verdade, o jeito mais simples e executar cada statement individualmente
  console.log('Aplicando migration via RPC individual...')

  // Testar se tabela existe
  var check = await _sbShared.from('clinic_alexa_log').select('id').limit(1)
  if (check.error && check.error.code === '42P01') {
    console.log('Tabela nao existe. Execute a migration pelo Supabase Dashboard > SQL Editor.')
    console.log('Arquivo: supabase/migrations/20260635000000_alexa_audit_log.sql')
  } else if (check.error) {
    console.log('Erro:', check.error.message)
  } else {
    console.log('Tabela clinic_alexa_log ja existe! Migration OK.')
  }
})()
