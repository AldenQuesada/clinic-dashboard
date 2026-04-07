-- ============================================================
-- Migration: Alexa Device Registry
-- Registro centralizado de dispositivos Alexa da clinica
-- ============================================================

-- ── Tabela: clinic_alexa_devices ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.clinic_alexa_devices (
  id              uuid        NOT NULL DEFAULT gen_random_uuid(),
  clinic_id       uuid        NOT NULL DEFAULT app_clinic_id(),
  device_name     text        NOT NULL,
  room_id         uuid                 REFERENCES public.clinic_rooms(id) ON DELETE SET NULL,
  professional_id uuid                 REFERENCES public.clinic_professionals(id) ON DELETE SET NULL,
  location_label  text,
  is_active       boolean     NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT clinic_alexa_devices_pkey PRIMARY KEY (id)
);

-- RLS
ALTER TABLE public.clinic_alexa_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alexa_devices_select" ON public.clinic_alexa_devices;
CREATE POLICY "alexa_devices_select" ON public.clinic_alexa_devices
  FOR SELECT TO authenticated
  USING (clinic_id = app_clinic_id());

DROP POLICY IF EXISTS "alexa_devices_insert" ON public.clinic_alexa_devices;
CREATE POLICY "alexa_devices_insert" ON public.clinic_alexa_devices
  FOR INSERT TO authenticated
  WITH CHECK (clinic_id = app_clinic_id());

DROP POLICY IF EXISTS "alexa_devices_update" ON public.clinic_alexa_devices;
CREATE POLICY "alexa_devices_update" ON public.clinic_alexa_devices
  FOR UPDATE TO authenticated
  USING (clinic_id = app_clinic_id());

DROP POLICY IF EXISTS "alexa_devices_delete" ON public.clinic_alexa_devices;
CREATE POLICY "alexa_devices_delete" ON public.clinic_alexa_devices
  FOR DELETE TO authenticated
  USING (clinic_id = app_clinic_id());

-- ── RPC: get_alexa_devices ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_alexa_devices()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id',              d.id,
      'device_name',     d.device_name,
      'room_id',         d.room_id,
      'room_name',       r.nome,
      'professional_id', d.professional_id,
      'professional_name', p.display_name,
      'location_label',  d.location_label,
      'is_active',       d.is_active,
      'created_at',      d.created_at
    ) ORDER BY d.created_at
  ), '[]'::jsonb)
  INTO v_result
  FROM public.clinic_alexa_devices d
  LEFT JOIN public.clinic_rooms r ON r.id = d.room_id
  LEFT JOIN public.clinic_professionals p ON p.id = d.professional_id
  WHERE d.clinic_id = app_clinic_id();

  RETURN jsonb_build_object('ok', true, 'data', v_result);
END;
$$;

-- ── RPC: upsert_alexa_device ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.upsert_alexa_device(
  p_id              uuid    DEFAULT NULL,
  p_device_name     text    DEFAULT NULL,
  p_room_id         uuid    DEFAULT NULL,
  p_professional_id uuid    DEFAULT NULL,
  p_location_label  text    DEFAULT NULL,
  p_is_active       boolean DEFAULT true
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_id   uuid;
  v_name text := nullif(trim(coalesce(p_device_name, '')), '');
BEGIN
  IF v_name IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'device_name obrigatorio');
  END IF;

  IF p_id IS NOT NULL THEN
    UPDATE public.clinic_alexa_devices
    SET device_name     = v_name,
        room_id         = p_room_id,
        professional_id = p_professional_id,
        location_label  = nullif(trim(coalesce(p_location_label, '')), ''),
        is_active       = coalesce(p_is_active, true),
        updated_at      = now()
    WHERE id = p_id AND clinic_id = app_clinic_id()
    RETURNING id INTO v_id;

    IF v_id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Dispositivo nao encontrado');
    END IF;
  ELSE
    INSERT INTO public.clinic_alexa_devices (device_name, room_id, professional_id, location_label, is_active)
    VALUES (v_name, p_room_id, p_professional_id,
            nullif(trim(coalesce(p_location_label, '')), ''),
            coalesce(p_is_active, true))
    RETURNING id INTO v_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'data', v_id);
END;
$$;

-- ── RPC: delete_alexa_device ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.delete_alexa_device(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM public.clinic_alexa_devices
  WHERE id = p_id AND clinic_id = app_clinic_id();

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Dispositivo nao encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- Grants
GRANT EXECUTE ON FUNCTION public.get_alexa_devices()    TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_alexa_device(uuid,text,uuid,uuid,text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.delete_alexa_device(uuid) TO authenticated;
