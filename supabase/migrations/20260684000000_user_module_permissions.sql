-- Migration: Permissoes de modulos POR USUARIO (nao so por role)
-- Cada usuario pode ter overrides individuais alem do padrao do cargo.
-- Prioridade: user override > role override > nav-config default

-- Tabela para permissoes individuais por usuario
CREATE TABLE IF NOT EXISTS public.user_module_permissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  module_id  text NOT NULL,
  page_id    text,
  allowed    boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, user_id, module_id, page_id)
);

CREATE INDEX IF NOT EXISTS idx_user_module_perms_user
  ON public.user_module_permissions (clinic_id, user_id);

ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_module_perms_admin ON public.user_module_permissions
  FOR ALL TO authenticated
  USING (clinic_id = public.app_clinic_id() AND public.is_admin())
  WITH CHECK (clinic_id = public.app_clinic_id() AND public.is_admin());

-- Leitura para todos (precisam saber suas proprias permissoes)
CREATE POLICY user_module_perms_self ON public.user_module_permissions
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id() AND user_id = auth.uid());

-- ── RPC: get_user_permissions ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_user_permissions(p_user_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid := public.app_clinic_id();
  v_target uuid := COALESCE(p_user_id, auth.uid());
  v_result jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'user_id',   user_id,
    'module_id', module_id,
    'page_id',   page_id,
    'allowed',   allowed
  )), '[]'::jsonb)
  INTO v_result
  FROM public.user_module_permissions
  WHERE clinic_id = v_clinic AND user_id = v_target;

  RETURN jsonb_build_object('ok', true, 'permissions', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_user_permissions(uuid) TO authenticated;

-- ── RPC: set_user_permissions (batch) ──────────────────────────
CREATE OR REPLACE FUNCTION public.set_user_permissions(p_user_id uuid, p_permissions jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid := public.app_clinic_id();
  v_item   jsonb;
  v_count  int := 0;
  v_target_role text;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  -- Nao pode alterar permissoes do owner
  SELECT role INTO v_target_role FROM public.profiles WHERE id = p_user_id AND clinic_id = v_clinic;
  IF v_target_role = 'owner' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_modify_owner');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_permissions)
  LOOP
    INSERT INTO public.user_module_permissions (clinic_id, user_id, module_id, page_id, allowed, updated_by)
    VALUES (
      v_clinic,
      p_user_id,
      v_item->>'module_id',
      NULLIF(v_item->>'page_id', ''),
      (v_item->>'allowed')::boolean,
      auth.uid()
    )
    ON CONFLICT (clinic_id, user_id, module_id, page_id)
    DO UPDATE SET allowed = (v_item->>'allowed')::boolean, updated_by = auth.uid(), updated_at = now();
    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'updated', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_user_permissions(uuid, jsonb) TO authenticated;

-- ── RPC: get_my_effective_permissions ───────────────────────────
-- Retorna permissoes efetivas do usuario logado (user override > role override)
CREATE OR REPLACE FUNCTION public.get_my_effective_permissions()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid := public.app_clinic_id();
  v_uid    uuid := auth.uid();
  v_role   text;
  v_role_perms jsonb;
  v_user_perms jsonb;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = v_uid AND clinic_id = v_clinic;

  -- Role-level overrides
  SELECT coalesce(jsonb_object_agg(module_id || '|' || coalesce(page_id, ''), allowed), '{}'::jsonb)
  INTO v_role_perms
  FROM public.clinic_module_permissions
  WHERE clinic_id = v_clinic AND role = v_role;

  -- User-level overrides (higher priority)
  SELECT coalesce(jsonb_object_agg(module_id || '|' || coalesce(page_id, ''), allowed), '{}'::jsonb)
  INTO v_user_perms
  FROM public.user_module_permissions
  WHERE clinic_id = v_clinic AND user_id = v_uid;

  RETURN jsonb_build_object(
    'ok', true,
    'role', v_role,
    'role_overrides', v_role_perms,
    'user_overrides', v_user_perms
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_effective_permissions() TO authenticated;

COMMENT ON TABLE  public.user_module_permissions        IS 'Permissoes de modulo por USUARIO individual. Override > role override > nav-config default.';
COMMENT ON FUNCTION public.get_user_permissions(uuid)   IS 'Lista overrides de permissao de um usuario especifico.';
COMMENT ON FUNCTION public.set_user_permissions         IS 'Define permissoes de modulos para um usuario (batch upsert). Admin only.';
COMMENT ON FUNCTION public.get_my_effective_permissions  IS 'Retorna permissoes efetivas do usuario logado (user > role > default).';
