-- ============================================================
-- Migration: B2B Playbook IA Assistente (WOW #4)
--
-- Permite ao admin pedir "Gerar conteúdo com IA" para 1 parceria:
-- a edge function b2b-playbook-ia chama Claude Haiku e preenche
-- automaticamente o b2b_partnership_content (carrosseis + ganchos).
--
-- Essa migration apenas cria:
--   - b2b_playbook_ia_runs  (auditoria: quem gerou, quanto custou, status)
--   - RPCs pra ler/limpar runs
--   - RPC b2b_playbook_ia_bulk_insert_content (usada pela edge function)
--
-- Edge function em supabase/functions/b2b-playbook-ia.
-- Idempotente. RLS permissiva.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.b2b_playbook_ia_runs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  partnership_id  uuid NOT NULL REFERENCES public.b2b_partnerships(id) ON DELETE CASCADE,
  scope           text NOT NULL CHECK (scope IN ('carrossel','ganchos','all')),
  status          text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','done','failed')),
  items_created   int  NOT NULL DEFAULT 0,
  error           text NULL,
  input_tokens    int  NULL,
  output_tokens   int  NULL,
  cost_usd        numeric NULL,
  requested_by    text NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  finished_at     timestamptz NULL
);

CREATE INDEX IF NOT EXISTS idx_b2b_playbook_ia_runs_partnership
  ON public.b2b_playbook_ia_runs (partnership_id, created_at DESC);

ALTER TABLE public.b2b_playbook_ia_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "b2b_playbook_ia_runs_all" ON public.b2b_playbook_ia_runs;
CREATE POLICY "b2b_playbook_ia_runs_all" ON public.b2b_playbook_ia_runs FOR ALL USING (true) WITH CHECK (true);


-- ── RPC: registrar início de run ────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_playbook_ia_run_start(
  p_partnership_id uuid, p_scope text, p_requested_by text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE v_id uuid;
BEGIN
  INSERT INTO public.b2b_playbook_ia_runs (partnership_id, scope, requested_by)
  VALUES (p_partnership_id, COALESCE(p_scope, 'all'), p_requested_by)
  RETURNING id INTO v_id;
  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;


-- ── RPC: encerrar run com contadores ────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_playbook_ia_run_finish(
  p_run_id uuid,
  p_status text,
  p_items_created int DEFAULT 0,
  p_input_tokens int DEFAULT NULL,
  p_output_tokens int DEFAULT NULL,
  p_cost_usd numeric DEFAULT NULL,
  p_error text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.b2b_playbook_ia_runs SET
    status = p_status,
    items_created = p_items_created,
    input_tokens = p_input_tokens,
    output_tokens = p_output_tokens,
    cost_usd = p_cost_usd,
    error = p_error,
    finished_at = now()
  WHERE id = p_run_id;
  RETURN jsonb_build_object('ok', true);
END $$;


-- ── RPC: inserir conteúdo em bulk (usado pela edge) ─────────
-- payload: { items: [{kind, title, body, sort_order}, ...] }
CREATE OR REPLACE FUNCTION public.b2b_playbook_ia_bulk_insert_content(
  p_partnership_id uuid,
  p_items jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_item jsonb;
  v_count int := 0;
BEGIN
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'items_must_be_array');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO public.b2b_partnership_content (
      partnership_id, kind, title, body, sort_order, created_at
    ) VALUES (
      p_partnership_id,
      COALESCE(v_item->>'kind', 'gancho'),
      COALESCE(v_item->>'title', 'Gerado por IA'),
      COALESCE(v_item->>'body', ''),
      COALESCE(NULLIF(v_item->>'sort_order','')::int, 0),
      now()
    );
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'inserted', v_count);
END $$;


-- ── RPC: listar runs (auditoria) ────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_playbook_ia_runs_list(p_partnership_id uuid, p_limit int DEFAULT 20)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'scope', scope, 'status', status,
    'items_created', items_created,
    'cost_usd', cost_usd,
    'requested_by', requested_by,
    'error', error,
    'created_at', created_at, 'finished_at', finished_at
  ) ORDER BY created_at DESC), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT * FROM public.b2b_playbook_ia_runs
       WHERE partnership_id = p_partnership_id
       ORDER BY created_at DESC LIMIT p_limit
    ) r;
  RETURN v_out;
END $$;


-- ── Grants ──────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION public.b2b_playbook_ia_run_start(uuid, text, text)                TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_playbook_ia_run_finish(uuid, text, int, int, int, numeric, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_playbook_ia_bulk_insert_content(uuid, jsonb)           TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_playbook_ia_runs_list(uuid, int)                       TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.b2b_playbook_ia_runs                         TO anon, authenticated, service_role;
