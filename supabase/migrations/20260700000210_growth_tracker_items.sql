-- ============================================================
-- Migration: Growth Tracker Items — persistência Supabase
--
-- Story: infra do Plano de Growth (2026-04-18)
--
-- Tracker interativo em plano-growth.html hoje persiste apenas em
-- localStorage. Isso esconde progresso cross-device e impede equipe
-- de ver estado real.
--
-- Esta migration cria:
--   1) Tabela growth_tracker_items — 1 linha por item (ids de
--      GrowthTrackerData.ITEMS: s1-1, s1-2, ..., rk-5)
--   2) RPC growth_tracker_read_all() — leitura cross-device
--   3) RPC growth_tracker_set_field(p_id, p_field, p_value) — escrita
--      um campo por vez (alinha com setItemField do repository JS)
--   4) RPC growth_tracker_reset_all() — mesmo comportamento do botão
--
-- Multi-user safe: updated_by registra email/id de quem mudou.
-- Idempotente. Graceful degrade se schema ausente no primeiro load.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.growth_tracker_items (
  clinic_id   uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001'::uuid,
  item_id     text        NOT NULL,
  checked     boolean     NOT NULL DEFAULT false,
  owner       text        NULL,
  due_date    date        NULL,
  notes       text        NULL,
  updated_at  timestamptz NOT NULL DEFAULT now(),
  updated_by  text        NULL,
  PRIMARY KEY (clinic_id, item_id)
);

CREATE INDEX IF NOT EXISTS idx_growth_tracker_items_updated
  ON public.growth_tracker_items (clinic_id, updated_at DESC);

-- RLS consistente com outras tabelas do projeto (policies abertas)
ALTER TABLE public.growth_tracker_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "growth_tracker_items_read"  ON public.growth_tracker_items;
DROP POLICY IF EXISTS "growth_tracker_items_write" ON public.growth_tracker_items;

CREATE POLICY "growth_tracker_items_read"
  ON public.growth_tracker_items FOR SELECT USING (true);

CREATE POLICY "growth_tracker_items_write"
  ON public.growth_tracker_items FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- RPC: read_all — retorna estado completo em formato equivalente
-- ao localStorage legacy { items: { "s1-1": {checked,...}, ... } }
-- ============================================================
CREATE OR REPLACE FUNCTION public.growth_tracker_read_all()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_items     jsonb;
BEGIN
  SELECT COALESCE(
    jsonb_object_agg(
      item_id,
      jsonb_build_object(
        'checked',    checked,
        'owner',      owner,
        'dueDate',    due_date,
        'notes',      notes,
        'updatedAt',  updated_at,
        'updatedBy',  updated_by
      )
    ),
    '{}'::jsonb
  )
  INTO v_items
  FROM public.growth_tracker_items
  WHERE clinic_id = v_clinic_id;

  RETURN jsonb_build_object('version', 2, 'items', v_items);
END;
$$;

-- ============================================================
-- RPC: set_field — escreve UM campo de UM item, upsert idempotente
-- Aceita: 'checked' (boolean), 'owner' (text), 'dueDate' (date),
-- 'notes' (text)
-- ============================================================
CREATE OR REPLACE FUNCTION public.growth_tracker_set_field(
  p_item_id  text,
  p_field    text,
  p_value    jsonb,
  p_user     text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_row       public.growth_tracker_items%ROWTYPE;
BEGIN
  IF p_item_id IS NULL OR length(trim(p_item_id)) = 0 THEN
    RAISE EXCEPTION 'item_id vazio';
  END IF;

  -- Garantir linha existente (insert idempotente)
  INSERT INTO public.growth_tracker_items (clinic_id, item_id, updated_by)
  VALUES (v_clinic_id, p_item_id, p_user)
  ON CONFLICT (clinic_id, item_id) DO NOTHING;

  -- Atualizar campo específico
  IF p_field = 'checked' THEN
    UPDATE public.growth_tracker_items
       SET checked    = COALESCE((p_value#>>'{}')::boolean, false),
           updated_at = now(),
           updated_by = p_user
     WHERE clinic_id = v_clinic_id AND item_id = p_item_id;
  ELSIF p_field = 'owner' THEN
    UPDATE public.growth_tracker_items
       SET owner      = NULLIF(p_value#>>'{}', ''),
           updated_at = now(),
           updated_by = p_user
     WHERE clinic_id = v_clinic_id AND item_id = p_item_id;
  ELSIF p_field = 'dueDate' THEN
    UPDATE public.growth_tracker_items
       SET due_date   = NULLIF(p_value#>>'{}', '')::date,
           updated_at = now(),
           updated_by = p_user
     WHERE clinic_id = v_clinic_id AND item_id = p_item_id;
  ELSIF p_field = 'notes' THEN
    UPDATE public.growth_tracker_items
       SET notes      = NULLIF(p_value#>>'{}', ''),
           updated_at = now(),
           updated_by = p_user
     WHERE clinic_id = v_clinic_id AND item_id = p_item_id;
  ELSE
    RAISE EXCEPTION 'campo invalido: %', p_field;
  END IF;

  SELECT * INTO v_row
    FROM public.growth_tracker_items
   WHERE clinic_id = v_clinic_id AND item_id = p_item_id;

  RETURN jsonb_build_object(
    'checked',   v_row.checked,
    'owner',     v_row.owner,
    'dueDate',   v_row.due_date,
    'notes',     v_row.notes,
    'updatedAt', v_row.updated_at,
    'updatedBy', v_row.updated_by
  );
END;
$$;

-- ============================================================
-- RPC: reset_all — limpa tudo da clinica atual
-- ============================================================
CREATE OR REPLACE FUNCTION public.growth_tracker_reset_all()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  DELETE FROM public.growth_tracker_items WHERE clinic_id = v_clinic_id;
END;
$$;

-- ============================================================
-- Seed inicial: marca s1-1 e s1-7 como done (já entregues em 17/04)
-- Só insere se ainda não existirem
-- ============================================================
INSERT INTO public.growth_tracker_items (clinic_id, item_id, checked, updated_by, updated_at)
VALUES
  ('00000000-0000-0000-0000-000000000001'::uuid, 's1-1', true, 'system-seed', '2026-04-17T21:00:00Z'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 's1-7', true, 'system-seed', '2026-04-17T22:26:00Z'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 's1-2', true, 'system-seed', '2026-04-17T09:11:00Z'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 's1-4', true, 'system-seed', '2026-04-17T08:28:00Z'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 'qw-4', true, 'system-seed', '2026-04-17T06:39:00Z'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 's2-3', true, 'system-seed', '2026-04-17T23:12:00Z'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 's2-5', true, 'system-seed', '2026-04-17T23:32:00Z'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 's2-6', true, 'system-seed', '2026-04-17T22:56:00Z'),
  ('00000000-0000-0000-0000-000000000001'::uuid, 's3-3', true, 'system-seed', '2026-04-17T04:29:00Z')
ON CONFLICT (clinic_id, item_id) DO NOTHING;

-- ============================================================
-- Grants
-- ============================================================
GRANT EXECUTE ON FUNCTION public.growth_tracker_read_all()         TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.growth_tracker_set_field(text, text, jsonb, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.growth_tracker_reset_all()        TO anon, authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.growth_tracker_items TO anon, authenticated, service_role;
