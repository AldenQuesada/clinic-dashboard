-- ============================================================
-- Migration: Pluggy Connections
-- Tabela para tracking de contas bancarias conectadas via Pluggy
-- ============================================================

-- ── 1. Tabela pluggy_connections ────────────────────────────

CREATE TABLE IF NOT EXISTS public.pluggy_connections (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id         uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  item_id           text NOT NULL UNIQUE,        -- ID do Item no Pluggy
  institution_id    text,
  institution_name  text,                          -- "Sicredi", "Itau", etc.
  account_id        text,                          -- ID da conta especifica
  account_name      text,
  status            text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error', 'disconnected')),
  last_sync_at      timestamptz,
  last_sync_error   text,
  total_synced      int NOT NULL DEFAULT 0,
  metadata          jsonb DEFAULT '{}'::jsonb,
  created_by        uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pluggy_clinic_status
  ON public.pluggy_connections (clinic_id, status);

DROP TRIGGER IF EXISTS trg_pluggy_updated_at ON public.pluggy_connections;
CREATE TRIGGER trg_pluggy_updated_at
  BEFORE UPDATE ON public.pluggy_connections
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. RLS ──────────────────────────────────────────────────

ALTER TABLE public.pluggy_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pluggy_select ON public.pluggy_connections;
DROP POLICY IF EXISTS pluggy_admin_all ON public.pluggy_connections;

CREATE POLICY pluggy_select ON public.pluggy_connections
  FOR SELECT TO authenticated
  USING (clinic_id = public._sdr_clinic_id());

CREATE POLICY pluggy_admin_all ON public.pluggy_connections
  FOR ALL TO authenticated
  USING (clinic_id = public._sdr_clinic_id() AND public.is_admin())
  WITH CHECK (clinic_id = public._sdr_clinic_id() AND public.is_admin());

-- ── 3. RPC: pluggy_register_connection ──────────────────────
-- Chamado pelo frontend apos sucesso no widget Pluggy

CREATE OR REPLACE FUNCTION public.pluggy_register_connection(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_user_id   uuid := auth.uid();
  v_id        uuid;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nao autenticado');
  END IF;

  INSERT INTO public.pluggy_connections (
    clinic_id, item_id, institution_id, institution_name,
    account_id, account_name, status, metadata, created_by
  ) VALUES (
    v_clinic_id,
    p_data->>'item_id',
    p_data->>'institution_id',
    p_data->>'institution_name',
    p_data->>'account_id',
    p_data->>'account_name',
    'active',
    COALESCE(p_data->'metadata', '{}'::jsonb),
    v_user_id
  )
  ON CONFLICT (item_id) DO UPDATE
    SET status = 'active',
        updated_at = now()
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pluggy_register_connection(jsonb) TO authenticated;

-- ── 4. RPC: pluggy_list_connections ─────────────────────────

CREATE OR REPLACE FUNCTION public.pluggy_list_connections()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
  v_result    jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN '[]'::jsonb;
  END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',               id,
      'item_id',          item_id,
      'institution_name', institution_name,
      'account_name',     account_name,
      'status',           status,
      'last_sync_at',     last_sync_at,
      'last_sync_error',  last_sync_error,
      'total_synced',     total_synced,
      'created_at',       created_at
    )
    ORDER BY created_at DESC
  ), '[]'::jsonb)
  INTO v_result
  FROM public.pluggy_connections
  WHERE clinic_id = v_clinic_id;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.pluggy_list_connections() TO authenticated;

-- ── 5. RPC: pluggy_disconnect ───────────────────────────────

CREATE OR REPLACE FUNCTION public.pluggy_disconnect(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._sdr_clinic_id();
BEGIN
  UPDATE public.pluggy_connections
  SET status = 'disconnected', updated_at = now()
  WHERE id = p_id AND clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pluggy_disconnect(uuid) TO authenticated;

-- ── 6. RPC: pluggy_update_sync_status ───────────────────────
-- Usado pelo n8n cron para registrar tentativa de sync

CREATE OR REPLACE FUNCTION public.pluggy_update_sync_status(
  p_item_id text,
  p_success boolean,
  p_count   int DEFAULT 0,
  p_error   text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.pluggy_connections
  SET last_sync_at    = now(),
      last_sync_error = CASE WHEN p_success THEN NULL ELSE p_error END,
      total_synced    = total_synced + COALESCE(p_count, 0),
      status          = CASE WHEN p_success THEN 'active' ELSE 'error' END,
      updated_at      = now()
  WHERE item_id = p_item_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pluggy_update_sync_status(text, boolean, int, text) TO authenticated, service_role;

COMMENT ON TABLE public.pluggy_connections IS
  'Conexoes Pluggy ativas (Sicredi e outros bancos via Open Finance). item_id e o ID do Item no Pluggy.';
