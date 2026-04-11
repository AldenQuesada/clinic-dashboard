-- ============================================================
-- Migration: wa_outbox_list_for_appt RPC
-- ============================================================
-- Lista mensagens enfileiradas em wa_outbox para um agendamento
-- específico — usado pelo modal pra mostrar feedback "WhatsApp
-- agendado para X" após salvar.
-- ============================================================

DROP FUNCTION IF EXISTS public.wa_outbox_list_for_appt(text);

CREATE OR REPLACE FUNCTION public.wa_outbox_list_for_appt(p_appt_ref text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_result    jsonb;
BEGIN
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',            o.id,
      'phone',         o.phone,
      'content',       LEFT(o.content, 80),
      'status',        o.status,
      'scheduled_at',  o.scheduled_at,
      'sent_at',       o.sent_at,
      'delivered_at',  o.delivered_at
    ) ORDER BY o.scheduled_at ASC
  )
  INTO v_result
  FROM public.wa_outbox o
  WHERE o.appt_ref = p_appt_ref
    AND o.clinic_id = v_clinic_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.wa_outbox_list_for_appt(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.wa_outbox_list_for_appt(text) TO authenticated;
