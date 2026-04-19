-- ============================================================
-- Migration: Estado de conversação da Mira
--
-- Permite onboarding multi-turno + pendências de dados no meio
-- do fluxo de emissão de voucher/rejeição.
--
-- Chave = phone. TTL automático: 2h sem update → state expira.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.mira_conversation_state (
  phone       text PRIMARY KEY,
  state       jsonb NOT NULL,
  context     text NULL,   -- ex: 'b2b_onboarding', 'b2b_voucher_pending', 'b2b_reject_reason'
  updated_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + INTERVAL '2 hours')
);

CREATE INDEX IF NOT EXISTS idx_mira_state_expires
  ON public.mira_conversation_state (expires_at);

ALTER TABLE public.mira_conversation_state ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "mira_state_all" ON public.mira_conversation_state;
CREATE POLICY "mira_state_all" ON public.mira_conversation_state FOR ALL USING (true) WITH CHECK (true);


-- Get + auto-expire
CREATE OR REPLACE FUNCTION public.mira_state_get(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_row record;
BEGIN
  -- Limpa expirados
  DELETE FROM public.mira_conversation_state
   WHERE expires_at < now();

  SELECT state, context INTO v_row
    FROM public.mira_conversation_state
   WHERE phone = p_phone;
  IF NOT FOUND THEN RETURN NULL; END IF;
  RETURN jsonb_build_object('state', v_row.state, 'context', v_row.context);
END $$;


-- Upsert com renovação de TTL
CREATE OR REPLACE FUNCTION public.mira_state_set(
  p_phone text, p_state jsonb, p_context text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF p_state IS NULL OR p_state = 'null'::jsonb THEN
    DELETE FROM public.mira_conversation_state WHERE phone = p_phone;
    RETURN jsonb_build_object('ok', true, 'cleared', true);
  END IF;

  INSERT INTO public.mira_conversation_state (phone, state, context, updated_at, expires_at)
  VALUES (p_phone, p_state, p_context, now(), now() + INTERVAL '2 hours')
  ON CONFLICT (phone) DO UPDATE SET
    state = EXCLUDED.state,
    context = EXCLUDED.context,
    updated_at = now(),
    expires_at = now() + INTERVAL '2 hours';

  RETURN jsonb_build_object('ok', true);
END $$;


GRANT SELECT, INSERT, UPDATE, DELETE ON public.mira_conversation_state TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mira_state_get(text)          TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mira_state_set(text, jsonb, text) TO anon, authenticated, service_role;
