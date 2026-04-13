-- Migration: Permissoes de modulos por role (dinamico, gerenciavel via UI)
--
-- Cada linha = 1 modulo + 1 role + allowed (true/false)
-- Se nao existir linha, usa o default do nav-config (hardcoded)
-- Ou seja: tabela so armazena OVERRIDES do default

CREATE TABLE IF NOT EXISTS public.clinic_module_permissions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  module_id  text NOT NULL,           -- section ID do nav-config (ex: 'agenda', 'financeiro')
  page_id    text,                    -- NULL = secao inteira, ou page ID especifico
  role       text NOT NULL CHECK (role IN ('owner','admin','therapist','receptionist','viewer')),
  allowed    boolean NOT NULL DEFAULT true,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, module_id, page_id, role)
);

CREATE INDEX IF NOT EXISTS idx_module_perms_clinic
  ON public.clinic_module_permissions (clinic_id);

ALTER TABLE public.clinic_module_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY module_perms_admin ON public.clinic_module_permissions
  FOR ALL TO authenticated
  USING (clinic_id = public.app_clinic_id() AND public.is_admin())
  WITH CHECK (clinic_id = public.app_clinic_id() AND public.is_admin());

-- Leitura para todos os staff (precisam ler pra saber o que podem ver)
CREATE POLICY module_perms_read ON public.clinic_module_permissions
  FOR SELECT TO authenticated
  USING (clinic_id = public.app_clinic_id());

-- ── RPC: get_module_permissions ────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_module_permissions()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid := public.app_clinic_id();
  v_result jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'module_id', module_id,
    'page_id',   page_id,
    'role',      role,
    'allowed',   allowed
  )), '[]'::jsonb)
  INTO v_result
  FROM public.clinic_module_permissions
  WHERE clinic_id = v_clinic;

  RETURN jsonb_build_object('ok', true, 'permissions', v_result);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_module_permissions() TO authenticated;

-- ── RPC: set_module_permission ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_module_permission(
  p_module_id text,
  p_page_id   text DEFAULT NULL,
  p_role       text DEFAULT NULL,
  p_allowed    boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid := public.app_clinic_id();
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  IF p_role NOT IN ('owner','admin','therapist','receptionist','viewer') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_role');
  END IF;

  -- Owner nao pode ter acesso removido (seguranca)
  IF p_role = 'owner' AND NOT p_allowed THEN
    RETURN jsonb_build_object('ok', false, 'error', 'cannot_restrict_owner');
  END IF;

  INSERT INTO public.clinic_module_permissions (clinic_id, module_id, page_id, role, allowed, updated_by)
  VALUES (v_clinic, p_module_id, p_page_id, p_role, p_allowed, auth.uid())
  ON CONFLICT (clinic_id, module_id, page_id, role)
  DO UPDATE SET allowed = p_allowed, updated_by = auth.uid(), updated_at = now();

  RETURN jsonb_build_object('ok', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_module_permission(text, text, text, boolean) TO authenticated;

-- ── RPC: bulk_set_module_permissions ───────────────────────────
-- Recebe array de {module_id, page_id, role, allowed} e aplica tudo
CREATE OR REPLACE FUNCTION public.bulk_set_module_permissions(p_permissions jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic uuid := public.app_clinic_id();
  v_item   jsonb;
  v_count  int := 0;
BEGIN
  IF NOT public.is_admin() THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_permissions)
  LOOP
    -- Owner nao pode perder acesso
    IF (v_item->>'role') = 'owner' AND (v_item->>'allowed')::boolean = false THEN
      CONTINUE;
    END IF;

    INSERT INTO public.clinic_module_permissions (clinic_id, module_id, page_id, role, allowed, updated_by)
    VALUES (
      v_clinic,
      v_item->>'module_id',
      NULLIF(v_item->>'page_id', ''),
      v_item->>'role',
      (v_item->>'allowed')::boolean,
      auth.uid()
    )
    ON CONFLICT (clinic_id, module_id, page_id, role)
    DO UPDATE SET allowed = (v_item->>'allowed')::boolean, updated_by = auth.uid(), updated_at = now();

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'updated', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_set_module_permissions(jsonb) TO authenticated;

COMMENT ON TABLE  public.clinic_module_permissions      IS 'Overrides de permissao por modulo/pagina/role. Se nao existir linha, usa default do nav-config.';
COMMENT ON FUNCTION public.get_module_permissions()     IS 'Lista todos os overrides de permissao de modulos da clinica.';
COMMENT ON FUNCTION public.set_module_permission        IS 'Define permissao para 1 modulo+role. Upsert. Owner nunca perde acesso.';
COMMENT ON FUNCTION public.bulk_set_module_permissions  IS 'Aplica batch de permissoes. Owner nunca perde acesso.';
