-- ============================================================
-- Migration: Delete broadcast + associated outbox messages
-- ============================================================

CREATE OR REPLACE FUNCTION wa_broadcast_delete(p_broadcast_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_broadcast wa_broadcasts%ROWTYPE;
  v_removed int;
BEGIN
  SELECT * INTO v_broadcast
  FROM wa_broadcasts
  WHERE id = p_broadcast_id AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Broadcast nao encontrado');
  END IF;

  -- Cannot delete while sending
  IF v_broadcast.status = 'sending' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Nao e possivel deletar um disparo em andamento. Cancele primeiro.');
  END IF;

  -- Remove outbox messages
  DELETE FROM wa_outbox WHERE broadcast_id = p_broadcast_id AND clinic_id = v_clinic_id;
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  -- Remove broadcast
  DELETE FROM wa_broadcasts WHERE id = p_broadcast_id AND clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true, 'removed_outbox', v_removed);
END;
$$;

GRANT EXECUTE ON FUNCTION wa_broadcast_delete(uuid) TO anon, authenticated;
