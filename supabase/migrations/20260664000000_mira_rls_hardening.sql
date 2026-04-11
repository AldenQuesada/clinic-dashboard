-- F8: RLS granular — defende contra acesso direto a tabelas wa_pro_*
-- via role anon. Todo acesso legitimo eh via RPC SECURITY DEFINER,
-- entao podemos bloquear SELECT direto e forcar o fluxo pela RPC.
--
-- Estrategia:
--   1. Revogar SELECT direto a tabelas sensiveis pra anon
--   2. Policy nova: SELECT so pra service_role ou RPC (via definer)
--   3. INSERT/UPDATE/DELETE continuam bloqueados pra anon (nao havia)

-- ============================================================
-- wa_pro_audit_log: dados sensiveis (queries reais + respostas)
-- ============================================================
DROP POLICY IF EXISTS wa_pro_audit_admin ON public.wa_pro_audit_log;

CREATE POLICY wa_pro_audit_service_only
  ON public.wa_pro_audit_log
  FOR SELECT
  TO authenticated
  USING (
    -- So service_role ve direto. anon nao ve nada.
    -- RPCs SECURITY DEFINER bypassam essa policy.
    auth.jwt()->>'role' = 'service_role'
  );

-- anon nao deve ler nada direto
REVOKE SELECT ON public.wa_pro_audit_log FROM anon;

-- ============================================================
-- wa_pro_rate_limit: idem
-- ============================================================
DROP POLICY IF EXISTS wa_pro_rate_admin ON public.wa_pro_rate_limit;
CREATE POLICY wa_pro_rate_service_only
  ON public.wa_pro_rate_limit
  FOR SELECT
  TO authenticated
  USING (auth.jwt()->>'role' = 'service_role');
REVOKE SELECT ON public.wa_pro_rate_limit FROM anon;

-- ============================================================
-- wa_pro_context: contem texto da query do profissional
-- ============================================================
DROP POLICY IF EXISTS wa_pro_context_admin ON public.wa_pro_context;
CREATE POLICY wa_pro_context_service_only
  ON public.wa_pro_context
  FOR SELECT
  TO authenticated
  USING (auth.jwt()->>'role' = 'service_role');
REVOKE SELECT ON public.wa_pro_context FROM anon;

-- ============================================================
-- wa_pro_messages: idem
-- ============================================================
DROP POLICY IF EXISTS wa_pro_msg_admin ON public.wa_pro_messages;
CREATE POLICY wa_pro_msg_service_only
  ON public.wa_pro_messages
  FOR SELECT
  TO authenticated
  USING (auth.jwt()->>'role' = 'service_role');
REVOKE SELECT ON public.wa_pro_messages FROM anon;

-- ============================================================
-- wa_numbers: parcial — SELECT permitido so do seu proprio numero
-- ============================================================
DROP POLICY IF EXISTS wa_numbers_clinic ON public.wa_numbers;

-- Service role: tudo
CREATE POLICY wa_numbers_service ON public.wa_numbers
  FOR ALL TO authenticated
  USING (auth.jwt()->>'role' = 'service_role')
  WITH CHECK (auth.jwt()->>'role' = 'service_role');

-- anon: zero acesso direto
REVOKE ALL ON public.wa_numbers FROM anon;

-- ============================================================
-- RPCs continuam funcionando porque sao SECURITY DEFINER
-- (executam como postgres, bypassam RLS).
--
-- Quando uma RPC precisa retornar dados dessas tabelas, ela filtra
-- internamente por professional_id ou phone ja verificado via auth.
--
-- Esse setup fecha 2 buracos:
-- 1. Cliente anon (browser) nao consegue SELECT * FROM wa_pro_audit_log
-- 2. Cliente anon nao consegue enumerar professionals/phones
-- ============================================================

COMMENT ON POLICY wa_pro_audit_service_only ON public.wa_pro_audit_log
  IS 'F8: anon nao le audit direto, so via RPC SECURITY DEFINER';
