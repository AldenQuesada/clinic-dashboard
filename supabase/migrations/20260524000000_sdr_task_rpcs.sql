-- ============================================================
-- Migration: 20260524000000 -- SDR: Task RPCs
-- Sprint 9
--
-- Funcoes:
--   sdr_get_tasks(p_status, p_limit, p_offset) -- lista tarefas da clinica
--   sdr_update_task_status(p_task_id, p_status) -- atualiza status de uma tarefa
--
-- Blindagens:
--   - SECURITY DEFINER + _sdr_clinic_id() em ambas
--   - p_status NULL = retorna todos os status (exceto cancelled)
--   - status invalido -> retorna erro (sem silent fail)
--   - task_id nao pertence a clinica -> retorna erro
-- ============================================================

DROP FUNCTION IF EXISTS public.sdr_get_tasks(text, int, int);

CREATE OR REPLACE FUNCTION public.sdr_get_tasks(
  p_status text DEFAULT NULL,
  p_limit  int  DEFAULT 50,
  p_offset int  DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado ou sem clinica');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'data', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'id',           t.id,
          'lead_id',      t.lead_id,
          'type',         t.type,
          'title',        t.title,
          'description',  t.description,
          'status',       t.status,
          'due_at',       t.due_at,
          'triggered_by', t.triggered_by,
          'created_at',   t.created_at,
          'updated_at',   t.updated_at
        ) ORDER BY t.created_at DESC
      )
      FROM (
        SELECT * FROM tasks
        WHERE clinic_id = v_clinic_id
          AND status   <> 'cancelled'
          AND (p_status IS NULL OR status = p_status)
        ORDER BY created_at DESC
        LIMIT  p_limit
        OFFSET p_offset
      ) t
    ), '[]'::jsonb),
    'total', (
      SELECT COUNT(*) FROM tasks
      WHERE clinic_id = v_clinic_id
        AND status   <> 'cancelled'
        AND (p_status IS NULL OR status = p_status)
    )
  );
END;
$$;


DROP FUNCTION IF EXISTS public.sdr_update_task_status(uuid, text);

CREATE OR REPLACE FUNCTION public.sdr_update_task_status(
  p_task_id uuid,
  p_status  text
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
BEGIN
  v_clinic_id := _sdr_clinic_id();
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Usuario nao autenticado ou sem clinica');
  END IF;

  IF p_status NOT IN ('pending', 'in_progress', 'done', 'cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Status invalido: ' || COALESCE(p_status, 'null'));
  END IF;

  UPDATE tasks
  SET status     = p_status,
      updated_at = now()
  WHERE id        = p_task_id
    AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Tarefa nao encontrada');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ============================================================
-- VERIFICACAO:
-- SELECT sdr_get_tasks(NULL, 10, 0);
-- SELECT sdr_update_task_status('<uuid>', 'done');
-- ============================================================
