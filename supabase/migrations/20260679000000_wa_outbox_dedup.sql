-- Dedup defensivo em wa_outbox.
-- Mesma msg (appt + horario + conteudo) nunca entra 2x, independente do caminho de código.

-- 0. Limpa duplicatas existentes (mantem uma por grupo)
DELETE FROM public.wa_outbox w
WHERE status IN ('pending', 'scheduled')
  AND appt_ref IS NOT NULL
  AND EXISTS (
    SELECT 1 FROM public.wa_outbox w2
    WHERE w2.appt_ref = w.appt_ref
      AND w2.scheduled_at = w.scheduled_at
      AND md5(coalesce(w2.content, '')) = md5(coalesce(w.content, ''))
      AND w2.status IN ('pending', 'scheduled')
      AND w2.id < w.id
  );

CREATE OR REPLACE FUNCTION public._wa_outbox_content_hash(content text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT md5(coalesce(content, ''))
$$;

-- Indice unico parcial: so aplica a registros nao-terminais (pending/scheduled).
-- Assim, re-enqueue apos falha/cancelamento ainda e possivel.
DROP INDEX IF EXISTS public.wa_outbox_dedup_uidx;
CREATE UNIQUE INDEX wa_outbox_dedup_uidx
  ON public.wa_outbox (appt_ref, scheduled_at, public._wa_outbox_content_hash(content))
  WHERE appt_ref IS NOT NULL AND status IN ('pending', 'scheduled');

-- Atualiza RPC para ignorar duplicatas ao inves de falhar
CREATE OR REPLACE FUNCTION public.wa_outbox_schedule_automation(
  p_phone        text,
  p_content      text,
  p_lead_id      text    DEFAULT '',
  p_lead_name    text    DEFAULT '',
  p_scheduled_at timestamptz DEFAULT now(),
  p_appt_ref     text    DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001';
  v_id uuid;
BEGIN
  BEGIN
    INSERT INTO public.wa_outbox (
      clinic_id, lead_id, phone, content,
      scheduled_at, status, priority, appt_ref
    ) VALUES (
      v_clinic_id, COALESCE(NULLIF(p_lead_id,''), ''), p_phone, p_content,
      p_scheduled_at, 'pending', 3, p_appt_ref
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    -- Duplicata silenciosamente ignorada (ja existe msg identica pending/scheduled)
    v_id := NULL;
  END;

  RETURN v_id;
END;
$$;
