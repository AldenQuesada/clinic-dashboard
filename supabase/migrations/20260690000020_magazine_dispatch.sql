-- ============================================================================
-- Beauty & Health Magazine — Dispatch batch + agendamento
-- ============================================================================
-- Tabela magazine_dispatches: campanhas agendadas por edicao.
-- Worker magazine_dispatch_run: processa batch (segment RFM, skip blacklist,
-- renderiza template, enfileira via wa_outbox_schedule_automation).
-- pg_cron magazine_dispatch_runner: a cada 10min processa pending.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) Audit log leve (se nao existir) — reusa padrao dos outros modulos
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.magazine_audit_log (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id  uuid        NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  actor      text,
  action     text        NOT NULL,
  subject    text,
  meta       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS magazine_audit_log_created_idx
  ON public.magazine_audit_log (created_at DESC);

ALTER TABLE public.magazine_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.magazine_audit_log FROM public, anon, authenticated;

-- ----------------------------------------------------------------------------
-- 2) Tabela magazine_dispatches
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.magazine_dispatches (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id          uuid        NOT NULL REFERENCES public.magazine_editions(id) ON DELETE CASCADE,
  clinic_id           uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  segment             jsonb       NOT NULL DEFAULT '{"rfm":"all"}'::jsonb,
  scheduled_at        timestamptz NOT NULL,
  status              text        NOT NULL DEFAULT 'scheduled',
  stats               jsonb       NOT NULL DEFAULT '{}'::jsonb,
  message_template    text        NOT NULL,
  tipo                text        NOT NULL DEFAULT 'initial',
  parent_dispatch_id  uuid        REFERENCES public.magazine_dispatches(id) ON DELETE SET NULL,
  executed_at         timestamptz,
  error_message       text,
  created_by          uuid,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT magazine_dispatches_status_chk
    CHECK (status IN ('scheduled','running','completed','failed','paused','canceled')),
  CONSTRAINT magazine_dispatches_tipo_chk
    CHECK (tipo IN ('initial','reminder_d1','reminder_d7','manual'))
);

CREATE INDEX IF NOT EXISTS magazine_dispatches_edition_idx
  ON public.magazine_dispatches (edition_id, scheduled_at);

CREATE INDEX IF NOT EXISTS magazine_dispatches_pending_idx
  ON public.magazine_dispatches (status, scheduled_at)
  WHERE status = 'scheduled';

CREATE INDEX IF NOT EXISTS magazine_dispatches_parent_idx
  ON public.magazine_dispatches (parent_dispatch_id)
  WHERE parent_dispatch_id IS NOT NULL;

COMMENT ON TABLE public.magazine_dispatches IS
  'Campanhas de dispatch agendadas por edicao. Worker processa batch (segment RFM, skip blacklist).';

-- ----------------------------------------------------------------------------
-- 3) RLS — clinic-scoped
-- ----------------------------------------------------------------------------
ALTER TABLE public.magazine_dispatches ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS magazine_dispatches_clinic ON public.magazine_dispatches;
CREATE POLICY magazine_dispatches_clinic
  ON public.magazine_dispatches
  FOR ALL
  USING (clinic_id = public._mag_current_clinic_id())
  WITH CHECK (clinic_id = public._mag_current_clinic_id());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.magazine_dispatches TO authenticated;

-- Trigger updated_at (reusa _magazine_touch_updated_at)
DROP TRIGGER IF EXISTS _magazine_dispatches_touch ON public.magazine_dispatches;
CREATE TRIGGER _magazine_dispatches_touch
  BEFORE UPDATE ON public.magazine_dispatches
  FOR EACH ROW EXECUTE FUNCTION public._magazine_touch_updated_at();

-- ----------------------------------------------------------------------------
-- 4) Helper: renderiza template com {{nome}} / {{link_revista}} / {{titulo}} / {{subtitulo}}
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._magazine_render_dispatch_msg(
  p_template text,
  p_lead_name text,
  p_link_revista text,
  p_titulo text,
  p_subtitulo text
)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT
    replace(
      replace(
        replace(
          replace(
            COALESCE(p_template,''),
            '{{nome}}', COALESCE(NULLIF(split_part(COALESCE(p_lead_name,''),' ',1),''), 'tudo bem')
          ),
          '{{link_revista}}', COALESCE(p_link_revista,'')
        ),
        '{{titulo}}', COALESCE(p_titulo,'')
      ),
      '{{subtitulo}}', COALESCE(p_subtitulo,'')
    );
$$;

-- ----------------------------------------------------------------------------
-- 5) RPC magazine_dispatch_schedule — cria dispatch agendado
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_dispatch_schedule(
  p_edition_id     uuid,
  p_segment        jsonb,
  p_scheduled_at   timestamptz,
  p_template       text,
  p_tipo           text DEFAULT 'initial',
  p_parent_id      uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.magazine_editions
     WHERE id = p_edition_id AND clinic_id = v_clinic_id
  ) THEN
    RAISE EXCEPTION 'Edicao nao encontrada ou sem permissao';
  END IF;

  INSERT INTO public.magazine_dispatches (
    edition_id, clinic_id, segment, scheduled_at, status,
    message_template, tipo, parent_dispatch_id, created_by
  ) VALUES (
    p_edition_id, v_clinic_id,
    COALESCE(p_segment, '{"rfm":"all"}'::jsonb),
    p_scheduled_at, 'scheduled',
    p_template, COALESCE(p_tipo, 'initial'),
    p_parent_id, auth.uid()
  )
  RETURNING id INTO v_id;

  INSERT INTO public.magazine_audit_log (clinic_id, actor, action, subject, meta)
  VALUES (v_clinic_id, COALESCE(auth.uid()::text,'system'), 'dispatch_schedule', v_id::text,
          jsonb_build_object('edition_id', p_edition_id, 'scheduled_at', p_scheduled_at, 'tipo', p_tipo));

  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.magazine_dispatch_schedule(uuid,jsonb,timestamptz,text,text,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_dispatch_schedule(uuid,jsonb,timestamptz,text,text,uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6) RPC magazine_dispatch_cancel
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_dispatch_cancel(p_dispatch_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_updated int;
BEGIN
  UPDATE public.magazine_dispatches
     SET status = 'canceled'
   WHERE id = p_dispatch_id
     AND clinic_id = v_clinic_id
     AND status IN ('scheduled','paused');
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated > 0 THEN
    INSERT INTO public.magazine_audit_log (clinic_id, actor, action, subject)
    VALUES (v_clinic_id, COALESCE(auth.uid()::text,'system'), 'dispatch_cancel', p_dispatch_id::text);
  END IF;

  RETURN v_updated > 0;
END $$;

REVOKE ALL ON FUNCTION public.magazine_dispatch_cancel(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_dispatch_cancel(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7) RPC magazine_dispatch_list — lista + stats por edicao
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_dispatch_list(
  p_edition_id uuid,
  p_limit      int DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_result jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_jsonb(d) ORDER BY d.scheduled_at DESC), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT id, edition_id, segment, scheduled_at, status, stats,
             message_template, tipo, parent_dispatch_id, executed_at,
             error_message, created_at
        FROM public.magazine_dispatches
       WHERE edition_id = p_edition_id
         AND clinic_id = v_clinic_id
       ORDER BY scheduled_at DESC
       LIMIT COALESCE(p_limit, 50)
    ) d;

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.magazine_dispatch_list(uuid,int) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_dispatch_list(uuid,int) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8) RPC magazine_dispatch_estimate — estimativa de leads elegiveis
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_dispatch_estimate(
  p_segment jsonb,
  p_edition_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_rfm text := COALESCE(p_segment->>'rfm','all');
  v_total int := 0;
  v_skip_blacklist int := 0;
  v_skip_no_phone int := 0;
  v_skip_already_opened int := 0;
BEGIN
  -- Contagem total elegivel por segmento.
  -- Classificacao RFM: usa patients."lastProcedureAt" quando lead->patient existe.
  WITH base AS (
    SELECT l.id, l.phone, l.name,
           (SELECT MAX(p."lastProcedureAt")
              FROM public.patients p
             WHERE p."leadId" = l.id::text AND p.deleted_at IS NULL) AS last_appt
      FROM public.leads l
     WHERE l.deleted_at IS NULL
  ),
  classified AS (
    SELECT b.*,
      CASE
        WHEN b.last_appt IS NULL THEN 'lead'
        WHEN EXTRACT(DAY FROM (now() - b.last_appt))::int <= 60 THEN 'active'
        WHEN EXTRACT(DAY FROM (now() - b.last_appt))::int <= 180 THEN 'at_risk'
        WHEN EXTRACT(DAY FROM (now() - b.last_appt))::int <= 365 THEN 'dormant'
        ELSE 'distante'
      END AS segmento
      FROM base b
  ),
  filtered AS (
    SELECT *
      FROM classified c
     WHERE
       v_rfm = 'all'
       OR (v_rfm = 'vip' AND c.segmento = 'active' AND c.last_appt IS NOT NULL)
       OR (v_rfm = 'active' AND c.segmento = 'active')
       OR (v_rfm = 'at_risk' AND c.segmento = 'at_risk')
       OR (v_rfm = 'dormant' AND c.segmento IN ('dormant','distante'))
  )
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE f.phone IS NULL OR f.phone = ''),
    COUNT(*) FILTER (WHERE f.phone IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.wa_phone_blacklist bl WHERE right(regexp_replace(bl.phone, '\D', '', 'g'), 8) = right(regexp_replace(f.phone, '\D', '', 'g'), 8)
    ))
    INTO v_total, v_skip_no_phone, v_skip_blacklist
    FROM filtered f;

  RETURN jsonb_build_object(
    'total', v_total,
    'eligible', GREATEST(v_total - v_skip_no_phone - v_skip_blacklist, 0),
    'skip_no_phone', v_skip_no_phone,
    'skip_blacklist', v_skip_blacklist
  );
END $$;

REVOKE ALL ON FUNCTION public.magazine_dispatch_estimate(jsonb,uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_dispatch_estimate(jsonb,uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9) RPC magazine_dispatch_run — worker que processa o batch
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_dispatch_run(p_dispatch_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_disp public.magazine_dispatches%ROWTYPE;
  v_edition public.magazine_editions%ROWTYPE;
  v_rfm text;
  v_sent int := 0;
  v_skip_blacklist int := 0;
  v_skip_no_phone int := 0;
  v_skip_already_opened int := 0;
  v_failed int := 0;
  v_total int := 0;
  v_lead record;
  v_hash text;
  v_link text;
  v_content text;
  v_wa_id uuid;
  v_filter_opened boolean;
BEGIN
  SELECT * INTO v_disp FROM public.magazine_dispatches WHERE id = p_dispatch_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Dispatch % nao encontrado', p_dispatch_id;
  END IF;

  IF v_disp.status NOT IN ('scheduled','paused') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'dispatch nao esta em status processavel: '||v_disp.status);
  END IF;

  SELECT * INTO v_edition FROM public.magazine_editions WHERE id = v_disp.edition_id;

  -- Marca como running
  UPDATE public.magazine_dispatches
     SET status = 'running', executed_at = COALESCE(executed_at, now())
   WHERE id = p_dispatch_id;

  v_rfm := COALESCE(v_disp.segment->>'rfm', 'all');
  v_filter_opened := v_disp.tipo IN ('reminder_d1','reminder_d7');

  BEGIN
    FOR v_lead IN
      WITH base AS (
        SELECT l.id, l.phone, l.name,
               (SELECT MAX(p."lastProcedureAt")
                  FROM public.patients p
                 WHERE p."leadId" = l.id::text AND p.deleted_at IS NULL) AS last_appt
          FROM public.leads l
         WHERE l.clinic_id = v_disp.clinic_id
           AND l.deleted_at IS NULL
      ),
      classified AS (
        SELECT b.*,
          CASE
            WHEN b.last_appt IS NULL THEN 'lead'
            WHEN EXTRACT(DAY FROM (now() - b.last_appt))::int <= 60 THEN 'active'
            WHEN EXTRACT(DAY FROM (now() - b.last_appt))::int <= 180 THEN 'at_risk'
            WHEN EXTRACT(DAY FROM (now() - b.last_appt))::int <= 365 THEN 'dormant'
            ELSE 'distante'
          END AS segmento
          FROM base b
      )
      SELECT c.*
        FROM classified c
       WHERE
         v_rfm = 'all'
         OR (v_rfm = 'vip' AND c.segmento = 'active' AND c.last_appt IS NOT NULL)
         OR (v_rfm = 'active' AND c.segmento = 'active')
         OR (v_rfm = 'at_risk' AND c.segmento = 'at_risk')
         OR (v_rfm = 'dormant' AND c.segmento IN ('dormant','distante'))
    LOOP
      v_total := v_total + 1;

      -- skip sem phone
      IF v_lead.phone IS NULL OR v_lead.phone = '' THEN
        v_skip_no_phone := v_skip_no_phone + 1;
        CONTINUE;
      END IF;

      -- skip blacklist (fuzzy match right 8 digits)
      IF EXISTS (
        SELECT 1 FROM public.wa_phone_blacklist bl
         WHERE right(regexp_replace(bl.phone, '\D', '', 'g'), 8) =
               right(regexp_replace(v_lead.phone, '\D', '', 'g'), 8)
      ) THEN
        v_skip_blacklist := v_skip_blacklist + 1;
        CONTINUE;
      END IF;

      -- filtro D+1/D+7: pula quem ja abriu
      IF v_filter_opened AND EXISTS (
        SELECT 1 FROM public.magazine_reads r
         WHERE r.edition_id = v_disp.edition_id
           AND r.lead_id = v_lead.id
           AND r.opened_at IS NOT NULL
      ) THEN
        v_skip_already_opened := v_skip_already_opened + 1;
        CONTINUE;
      END IF;

      -- Renderiza link + mensagem
      BEGIN
        v_hash := public.magazine_sign_lead_link(v_lead.id, v_disp.edition_id);
      EXCEPTION WHEN OTHERS THEN
        v_hash := NULL;
      END;
      v_link := 'https://clinicai-dashboard.px1hdq.easypanel.host/revista-live.html?e=' || v_edition.slug ||
                '&lead=' || v_lead.id::text ||
                COALESCE('&h=' || v_hash, '');

      v_content := public._magazine_render_dispatch_msg(
        v_disp.message_template,
        v_lead.name,
        v_link,
        v_edition.title,
        v_edition.subtitle
      );

      -- Enfileira
      BEGIN
        SELECT public.wa_outbox_schedule_automation(
          v_lead.phone,
          v_content,
          v_lead.id::text,
          COALESCE(v_lead.name,''),
          v_disp.scheduled_at,
          NULL,
          NULL,
          NULL,
          jsonb_build_object(
            'lead_id', v_lead.id,
            'edition_id', v_disp.edition_id,
            'dispatch_id', v_disp.id,
            'tipo', v_disp.tipo,
            'link', v_link
          )
        ) INTO v_wa_id;
        IF v_wa_id IS NOT NULL THEN
          v_sent := v_sent + 1;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_failed := v_failed + 1;
      END;
    END LOOP;
  EXCEPTION WHEN OTHERS THEN
    UPDATE public.magazine_dispatches
       SET status = 'failed',
           error_message = SQLERRM,
           stats = jsonb_build_object(
             'total_leads', v_total, 'sent', v_sent,
             'skipped_blacklist', v_skip_blacklist,
             'skipped_no_phone', v_skip_no_phone,
             'skipped_already_opened', v_skip_already_opened,
             'failed', v_failed
           )
     WHERE id = p_dispatch_id;
    RAISE;
  END;

  -- Fim ok
  UPDATE public.magazine_dispatches
     SET status = 'completed',
         executed_at = now(),
         stats = jsonb_build_object(
           'total_leads', v_total, 'sent', v_sent,
           'skipped_blacklist', v_skip_blacklist,
           'skipped_no_phone', v_skip_no_phone,
           'skipped_already_opened', v_skip_already_opened,
           'failed', v_failed
         )
   WHERE id = p_dispatch_id;

  INSERT INTO public.magazine_audit_log (clinic_id, actor, action, subject, meta)
  VALUES (v_disp.clinic_id, 'system', 'dispatch_run', p_dispatch_id::text,
          jsonb_build_object('sent', v_sent, 'total', v_total));

  RETURN jsonb_build_object(
    'ok', true,
    'dispatch_id', p_dispatch_id,
    'total', v_total,
    'sent', v_sent,
    'skipped_blacklist', v_skip_blacklist,
    'skipped_no_phone', v_skip_no_phone,
    'skipped_already_opened', v_skip_already_opened,
    'failed', v_failed
  );
END $$;

REVOKE ALL ON FUNCTION public.magazine_dispatch_run(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_dispatch_run(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 10) pg_cron runner a cada 10min
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._magazine_dispatch_cron_runner()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_done int := 0;
BEGIN
  FOR v_id IN
    SELECT id FROM public.magazine_dispatches
     WHERE status = 'scheduled'
       AND scheduled_at <= now()
     ORDER BY scheduled_at ASC
     LIMIT 20
  LOOP
    BEGIN
      PERFORM public.magazine_dispatch_run(v_id);
      v_done := v_done + 1;
    EXCEPTION WHEN OTHERS THEN
      UPDATE public.magazine_dispatches
         SET status = 'failed',
             error_message = SQLERRM
       WHERE id = v_id AND status = 'running';
    END;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public._magazine_dispatch_cron_runner() FROM public, anon, authenticated;

-- Agenda pg_cron a cada 10 min (idempotente)
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('magazine_dispatch_runner');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    PERFORM cron.schedule(
      'magazine_dispatch_runner',
      '*/10 * * * *',
      $cron$ SELECT public._magazine_dispatch_cron_runner(); $cron$
    );
  END IF;
END $$;

-- ============================================================================
-- Validacao:
--   SELECT public.magazine_dispatch_estimate('{"rfm":"all"}'::jsonb);
--   SELECT public.magazine_dispatch_list('<edition_id>'::uuid);
-- ============================================================================
