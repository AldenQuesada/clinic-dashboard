-- ============================================================
-- Migration: Auto-resync de wa_outbox ao editar regra
-- Data: 2026-04-16
-- Opcao A: editar/desativar/deletar regra em wa_agenda_automations
-- propaga automaticamente para wa_outbox (cancela pendentes +
-- re-enfileira com template novo).
-- ============================================================

BEGIN;

-- ─── 1.1 Colunas em wa_outbox ───────────────────────────────
-- rule_id ja pode existir (migration 20260700000009_ab_testing),
-- garantimos idempotencia.
ALTER TABLE public.wa_outbox
  ADD COLUMN IF NOT EXISTS rule_id uuid;

-- Garante FK com ON DELETE SET NULL (se ainda nao existir ou for diferente)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema = 'public'
      AND table_name = 'wa_outbox'
      AND constraint_name = 'wa_outbox_rule_id_fkey'
  ) THEN
    ALTER TABLE public.wa_outbox
      ADD CONSTRAINT wa_outbox_rule_id_fkey
      FOREIGN KEY (rule_id) REFERENCES public.wa_agenda_automations(id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.wa_outbox
  ADD COLUMN IF NOT EXISTS vars_snapshot jsonb;

CREATE INDEX IF NOT EXISTS idx_wa_outbox_rule_pending
  ON public.wa_outbox(rule_id)
  WHERE status IN ('pending','scheduled');

COMMENT ON COLUMN public.wa_outbox.rule_id IS
  'Regra em wa_agenda_automations que gerou essa msg. NULL para one-shots manuais.';
COMMENT ON COLUMN public.wa_outbox.vars_snapshot IS
  'Variaveis capturadas no momento do enqueue, para re-renderizar em auto-resync.';

-- ─── 1.2 Helper: renderiza template {{var}} com jsonb ───────
CREATE OR REPLACE FUNCTION public._wa_render_template(p_tpl text, p_vars jsonb)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_out text := COALESCE(p_tpl, '');
  v_key text;
  v_val text;
BEGIN
  IF p_vars IS NULL OR jsonb_typeof(p_vars) <> 'object' THEN
    RETURN v_out;
  END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_vars) LOOP
    v_val := COALESCE(p_vars->>v_key, '');
    v_out := replace(v_out, '{{' || v_key || '}}', v_val);
  END LOOP;
  RETURN v_out;
END;
$$;

-- ─── 1.3 RPC wa_outbox_schedule_automation: aceita vars_snapshot ──
-- rule_id + ab_variant ja existem da migration anterior. Adicionamos
-- p_vars_snapshot mantendo backward compat (DEFAULT NULL).
-- Drop overloads antigos para evitar ambiguidade (PostgREST nao
-- consegue escolher entre 7/8/9-arg se coexistirem).
DROP FUNCTION IF EXISTS public.wa_outbox_schedule_automation(
  text, text, text, text, timestamptz, text
);
DROP FUNCTION IF EXISTS public.wa_outbox_schedule_automation(
  text, text, text, text, timestamptz, text, uuid
);
DROP FUNCTION IF EXISTS public.wa_outbox_schedule_automation(
  text, text, text, text, timestamptz, text, uuid, char
);

CREATE OR REPLACE FUNCTION public.wa_outbox_schedule_automation(
  p_phone        text,
  p_content      text,
  p_lead_id      text DEFAULT ''::text,
  p_lead_name    text DEFAULT ''::text,
  p_scheduled_at timestamptz DEFAULT now(),
  p_appt_ref     text DEFAULT NULL,
  p_rule_id      uuid DEFAULT NULL,
  p_ab_variant   char(1) DEFAULT NULL,
  p_vars_snapshot jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_id uuid;
BEGIN
  BEGIN
    INSERT INTO public.wa_outbox (
      clinic_id, lead_id, phone, content,
      scheduled_at, status, priority, appt_ref,
      rule_id, ab_variant, vars_snapshot
    ) VALUES (
      v_clinic_id, COALESCE(NULLIF(p_lead_id,''), ''), p_phone, p_content,
      p_scheduled_at, 'pending', 3, p_appt_ref,
      p_rule_id, p_ab_variant, p_vars_snapshot
    )
    RETURNING id INTO v_id;
  EXCEPTION WHEN unique_violation THEN
    v_id := NULL;
  END;
  RETURN v_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.wa_outbox_schedule_automation(
  text, text, text, text, timestamptz, text, uuid, char, jsonb
) TO anon, authenticated;

-- ─── 1.4 RPC wa_outbox_resync_rule ──────────────────────────
-- Cancela pending/scheduled da regra e (se p_cancel_only=false e
-- regra ativa) re-enfileira com content_template atual, usando
-- vars_snapshot salvo.
CREATE OR REPLACE FUNCTION public.wa_outbox_resync_rule(
  p_rule_id uuid,
  p_cancel_only boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_rule public.wa_agenda_automations%ROWTYPE;
  v_row public.wa_outbox%ROWTYPE;
  v_cancelled int := 0;
  v_reenqueued int := 0;
  v_skipped_past int := 0;
  v_new_content text;
  v_now timestamptz := now();
  v_tpl text;
  v_should_reenqueue boolean;
  v_new_id uuid;
BEGIN
  IF p_rule_id IS NULL THEN
    RETURN jsonb_build_object('cancelled', 0, 'reenqueued', 0, 'skipped_past', 0, 'error', 'rule_id_null');
  END IF;

  SELECT * INTO v_rule FROM public.wa_agenda_automations WHERE id = p_rule_id;

  v_tpl := COALESCE(v_rule.content_template, '');
  v_should_reenqueue := (NOT p_cancel_only)
    AND v_rule.id IS NOT NULL
    AND v_rule.is_active IS TRUE
    AND length(btrim(v_tpl)) > 0;

  FOR v_row IN
    SELECT * FROM public.wa_outbox
    WHERE rule_id = p_rule_id
      AND status IN ('pending', 'scheduled')
  LOOP
    UPDATE public.wa_outbox
      SET status = 'cancelled'
      WHERE id = v_row.id;
    v_cancelled := v_cancelled + 1;

    IF NOT v_should_reenqueue THEN
      CONTINUE;
    END IF;

    IF v_row.scheduled_at <= v_now THEN
      v_skipped_past := v_skipped_past + 1;
      CONTINUE;
    END IF;

    v_new_content := public._wa_render_template(v_tpl, v_row.vars_snapshot);

    BEGIN
      INSERT INTO public.wa_outbox (
        clinic_id, lead_id, phone, content,
        scheduled_at, status, priority, appt_ref,
        rule_id, ab_variant, vars_snapshot
      ) VALUES (
        v_row.clinic_id, v_row.lead_id, v_row.phone, v_new_content,
        v_row.scheduled_at, 'pending', COALESCE(v_row.priority, 3), v_row.appt_ref,
        v_row.rule_id, v_row.ab_variant, v_row.vars_snapshot
      )
      RETURNING id INTO v_new_id;
      v_reenqueued := v_reenqueued + 1;
    EXCEPTION WHEN unique_violation THEN
      -- dedup index absorveu; nao conta como re-enqueued
      NULL;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'cancelled', v_cancelled,
    'reenqueued', v_reenqueued,
    'skipped_past', v_skipped_past,
    'cancel_only', p_cancel_only,
    'rule_active', COALESCE(v_rule.is_active, false)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.wa_outbox_resync_rule(uuid, boolean) TO anon, authenticated;

COMMENT ON FUNCTION public.wa_outbox_resync_rule(uuid, boolean) IS
  'Cancela wa_outbox pending/scheduled da regra e re-enfileira com template atual. Retorna {cancelled,reenqueued,skipped_past}.';

-- ─── 1.5 Trigger: cancela wa_outbox ao deletar regra ─────────
-- Roda BEFORE DELETE, antes do ON DELETE SET NULL zerar rule_id.
CREATE OR REPLACE FUNCTION public._wa_outbox_cancel_on_rule_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.wa_outbox
    SET status = 'cancelled'
    WHERE rule_id = OLD.id
      AND status IN ('pending', 'scheduled');
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_wa_outbox_cancel_on_rule_delete ON public.wa_agenda_automations;
CREATE TRIGGER trg_wa_outbox_cancel_on_rule_delete
  BEFORE DELETE ON public.wa_agenda_automations
  FOR EACH ROW EXECUTE FUNCTION public._wa_outbox_cancel_on_rule_delete();

NOTIFY pgrst, 'reload schema';

COMMIT;
