-- =============================================================================
-- Sprint 3 - Notificações Internas
--
-- Cria:
--   1. notifications              — tabela principal com RLS por recipient
--   2. send_notification          — envia para um usuário específico
--   3. broadcast_notification     — envia para todos ou por role
--   4. list_my_notifications      — paginada, do mais recente ao mais antigo
--   5. get_unread_count           — contagem rápida para o badge
--   6. mark_notification_read     — marca uma notificação como lida
--   7. mark_all_read              — marca todas as notificações do usuário como lidas
--   8. cleanup_old_notifications  — remove notificações com mais de 90 dias
--
-- Tipos suportados (extensível sem alterar schema):
--   invite_accepted, appointment_created, appointment_cancelled,
--   appointment_reminder, staff_deactivated, system
-- =============================================================================


-- -----------------------------------------------------------------------------
-- TABELA: notifications
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid        NOT NULL,
  recipient_id uuid        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  sender_id    uuid        REFERENCES public.profiles(id) ON DELETE SET NULL,
  type         text        NOT NULL DEFAULT 'system',
  title        text        NOT NULL,
  body         text,
  data         jsonb,
  is_read      boolean     NOT NULL DEFAULT false,
  read_at      timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Indices para as queries mais frequentes
CREATE INDEX IF NOT EXISTS notif_recipient_idx
  ON public.notifications (clinic_id, recipient_id, created_at DESC);

CREATE INDEX IF NOT EXISTS notif_unread_idx
  ON public.notifications (clinic_id, recipient_id, is_read)
  WHERE is_read = false;


-- -----------------------------------------------------------------------------
-- RLS: notifications
-- Cada usuário vê e gerencia apenas as próprias notificações.
-- Escrita: apenas via RPCs com SECURITY DEFINER.
-- -----------------------------------------------------------------------------
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notif_select" ON public.notifications;
CREATE POLICY "notif_select" ON public.notifications
  FOR SELECT USING (
    clinic_id    = public.app_clinic_id()
    AND recipient_id = auth.uid()
  );

DROP POLICY IF EXISTS "notif_update" ON public.notifications;
CREATE POLICY "notif_update" ON public.notifications
  FOR UPDATE USING (
    clinic_id    = public.app_clinic_id()
    AND recipient_id = auth.uid()
  );

DROP POLICY IF EXISTS "notif_insert" ON public.notifications;
CREATE POLICY "notif_insert" ON public.notifications
  FOR INSERT WITH CHECK (false);  -- apenas via RPCs

DROP POLICY IF EXISTS "notif_delete" ON public.notifications;
CREATE POLICY "notif_delete" ON public.notifications
  FOR DELETE USING (
    clinic_id    = public.app_clinic_id()
    AND recipient_id = auth.uid()
  );


-- =============================================================================
-- RPCs
-- =============================================================================


-- -----------------------------------------------------------------------------
-- send_notification
-- Envia uma notificação para um usuário específico da clínica.
-- Quem pode chamar: admin / owner.
-- Também usada internamente por outras RPCs (broadcast, etc.).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_notification(
  p_recipient_id uuid,
  p_type         text    DEFAULT 'system',
  p_title        text    DEFAULT '',
  p_body         text    DEFAULT NULL,
  p_data         jsonb   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public.app_clinic_id();
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clinic_not_found');
  END IF;

  IF public.app_role() NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  IF trim(p_title) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'title_required');
  END IF;

  -- Verifica se o destinatário é membro ativo da clínica
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = p_recipient_id AND clinic_id = v_clinic_id AND is_active = true
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'recipient_not_found');
  END IF;

  INSERT INTO public.notifications (clinic_id, recipient_id, sender_id, type, title, body, data)
  VALUES (v_clinic_id, p_recipient_id, auth.uid(), p_type, trim(p_title), p_body, p_data);

  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.send_notification(uuid, text, text, text, jsonb) TO authenticated;


-- -----------------------------------------------------------------------------
-- broadcast_notification
-- Envia a mesma notificação para todos os membros ativos da clínica,
-- opcionalmente filtrados por role.
--
-- p_roles = NULL ou '{}' => envia para TODOS
-- p_roles = '{"therapist","receptionist"}' => envia apenas para esses roles
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.broadcast_notification(
  p_type   text     DEFAULT 'system',
  p_title  text     DEFAULT '',
  p_body   text     DEFAULT NULL,
  p_data   jsonb    DEFAULT NULL,
  p_roles  text[]   DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public.app_clinic_id();
  v_count     int  := 0;
BEGIN
  IF public.app_role() NOT IN ('owner', 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'insufficient_permissions');
  END IF;

  IF trim(p_title) = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'title_required');
  END IF;

  INSERT INTO public.notifications (clinic_id, recipient_id, sender_id, type, title, body, data)
  SELECT
    v_clinic_id,
    p.id,
    auth.uid(),
    p_type,
    trim(p_title),
    p_body,
    p_data
  FROM public.profiles p
  WHERE p.clinic_id = v_clinic_id
    AND p.is_active  = true
    AND p.id        != auth.uid()  -- não envia para si mesmo
    AND (
      p_roles IS NULL
      OR array_length(p_roles, 1) IS NULL
      OR p.role = ANY(p_roles)
    );

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'sent_to', v_count);
END; $$;
GRANT EXECUTE ON FUNCTION public.broadcast_notification(text, text, text, jsonb, text[]) TO authenticated;


-- -----------------------------------------------------------------------------
-- list_my_notifications
-- Retorna as notificações do usuário atual, paginadas, do mais recente ao mais antigo.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.list_my_notifications(
  p_limit  int DEFAULT 20,
  p_offset int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public.app_clinic_id();
  v_uid       uuid := auth.uid();
  v_result    jsonb;
  v_total     int;
  v_unread    int;
BEGIN
  IF v_clinic_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'clinic_not_found');
  END IF;

  -- Contagens
  SELECT
    COUNT(*)                          AS total,
    COUNT(*) FILTER (WHERE NOT is_read) AS unread
  INTO v_total, v_unread
  FROM public.notifications
  WHERE clinic_id    = v_clinic_id
    AND recipient_id = v_uid;

  -- Lista paginada
  SELECT jsonb_agg(row ORDER BY row.created_at DESC)
  INTO v_result
  FROM (
    SELECT
      id,
      type,
      title,
      body,
      data,
      is_read,
      read_at,
      created_at,
      sender_id
    FROM public.notifications
    WHERE clinic_id    = v_clinic_id
      AND recipient_id = v_uid
    ORDER BY created_at DESC
    LIMIT  p_limit
    OFFSET p_offset
  ) row;

  RETURN jsonb_build_object(
    'ok',     true,
    'data',   coalesce(v_result, '[]'::jsonb),
    'total',  v_total,
    'unread', v_unread
  );
END; $$;
GRANT EXECUTE ON FUNCTION public.list_my_notifications(int, int) TO authenticated;


-- -----------------------------------------------------------------------------
-- get_unread_count
-- Contagem rápida de notificações não lidas. Usado para atualizar o badge.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_unread_count()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
BEGIN
  SELECT COUNT(*)
  INTO v_count
  FROM public.notifications
  WHERE clinic_id    = public.app_clinic_id()
    AND recipient_id = auth.uid()
    AND is_read      = false;

  RETURN jsonb_build_object('ok', true, 'count', v_count);
END; $$;
GRANT EXECUTE ON FUNCTION public.get_unread_count() TO authenticated;


-- -----------------------------------------------------------------------------
-- mark_notification_read
-- Marca uma notificação específica como lida.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_notification_read(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.notifications
  SET    is_read = true, read_at = now()
  WHERE  id           = p_id
    AND  clinic_id    = public.app_clinic_id()
    AND  recipient_id = auth.uid()
    AND  is_read      = false;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'notification_not_found');
  END IF;

  RETURN jsonb_build_object('ok', true);
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_notification_read(uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- mark_all_read
-- Marca todas as notificações não lidas do usuário atual como lidas.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_all_read()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_count int;
BEGIN
  UPDATE public.notifications
  SET    is_read = true, read_at = now()
  WHERE  clinic_id    = public.app_clinic_id()
    AND  recipient_id = auth.uid()
    AND  is_read      = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'marked', v_count);
END; $$;
GRANT EXECUTE ON FUNCTION public.mark_all_read() TO authenticated;


-- -----------------------------------------------------------------------------
-- cleanup_old_notifications
-- Remove notificações lidas com mais de 90 dias.
-- Pode ser chamada periodicamente (ex: via pg_cron ou manualmente).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cleanup_old_notifications()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_deleted int;
BEGIN
  DELETE FROM public.notifications
  WHERE  is_read   = true
    AND  created_at < now() - INTERVAL '90 days';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_deleted);
END; $$;
GRANT EXECUTE ON FUNCTION public.cleanup_old_notifications() TO authenticated;
