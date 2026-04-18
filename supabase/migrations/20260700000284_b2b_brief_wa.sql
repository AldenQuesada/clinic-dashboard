-- ============================================================
-- Migration: B2B Brief WhatsApp — Fase 2 parte 4
--
-- Cria template WA b2b_brief_monthly em wa_agenda_automations e
-- RPC b2b_brief_send(partnership_id) que renderiza e enfileira
-- via wa_outbox_schedule_automation.
--
-- Padrão alinhado com vpi_saudade (migration 75): template
-- persistido + render com _wa_render_template (fallback replace).
--
-- Idempotente.
-- ============================================================

-- ── Template WA ─────────────────────────────────────────────
DO $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_content text;
  v_id uuid;
BEGIN
  v_content :=
    E'Oi {{contact_first}}! Tudo bem?\n\n' ||
    E'Nosso brief do mês com a *{{partner_name}}* chegou. Só pra alinhar:\n\n' ||
    E'Contrapartida do mês: {{contrapartida}}\n' ||
    E'Cadência: {{cadence}}\n\n' ||
    E'Me manda até o dia 10 o que já produziu ou qualquer ideia nova. Qualquer coisa que precisar da nossa parte, é só chamar.\n\n' ||
    E'Obrigada pela parceria — cada mês junto é mais um passo de valor pras duas marcas.\n\n' ||
    E'— *Clínica Mirian de Paula*';

  SELECT id INTO v_id FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic AND slug = 'b2b_brief_monthly' LIMIT 1;

  IF v_id IS NULL THEN
    INSERT INTO public.wa_agenda_automations (
      clinic_id, slug, name, description,
      category, sort_order, trigger_type, trigger_config,
      recipient_type, channel, content_template, is_active
    ) VALUES (
      v_clinic, 'b2b_brief_monthly',
      'B2B · Brief mensal da parceria',
      'Mensagem disparada no dia 01 de cada mês para cada parceria B2B ativa. Alinha contrapartida do mês.',
      'pos', 40, 'on_demand', '{}'::jsonb,
      'partner', 'whatsapp', v_content, true
    );
  ELSE
    UPDATE public.wa_agenda_automations
       SET content_template = v_content
     WHERE id = v_id;
  END IF;
EXCEPTION
  WHEN undefined_column THEN RAISE NOTICE '[b2b_brief_monthly] wa_agenda_automations schema ausente';
  WHEN undefined_table  THEN RAISE NOTICE '[b2b_brief_monthly] wa_agenda_automations nao existe';
END $$;


-- ── RPC: disparar brief pra UMA parceria ───────────────────
CREATE OR REPLACE FUNCTION public.b2b_brief_send(p_partnership_id uuid, p_task_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_p         public.b2b_partnerships%ROWTYPE;
  v_tpl_id    uuid;
  v_tpl_body  text;
  v_content   text;
  v_vars      jsonb;
  v_contact_first text;
  v_contrapartida text;
  v_phone     text;
  v_outbox    jsonb;
BEGIN
  SELECT * INTO v_p FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id AND id = p_partnership_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'partnership_not_found'); END IF;

  v_phone := COALESCE(v_p.contact_phone, '');
  v_phone := regexp_replace(v_phone, '\D', '', 'g');
  IF length(v_phone) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_phone', 'phone', v_p.contact_phone);
  END IF;

  SELECT id, content_template INTO v_tpl_id, v_tpl_body
    FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic_id AND slug = 'b2b_brief_monthly' AND is_active = true
   LIMIT 1;

  IF v_tpl_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'template_missing');
  END IF;

  v_contact_first := split_part(COALESCE(v_p.contact_name, ''), ' ', 1);
  IF v_contact_first = '' THEN v_contact_first := 'tudo bem'; END IF;

  v_contrapartida := CASE
    WHEN v_p.contrapartida IS NULL OR array_length(v_p.contrapartida, 1) IS NULL THEN 'conforme combinado'
    ELSE array_to_string(v_p.contrapartida, ', ')
  END;

  v_vars := jsonb_build_object(
    'contact_first', v_contact_first,
    'partner_name',  COALESCE(v_p.name, ''),
    'contrapartida', v_contrapartida,
    'cadence',       COALESCE(v_p.contrapartida_cadence, 'mensal')
  );

  BEGIN
    v_content := public._wa_render_template(v_tpl_body, v_vars);
  EXCEPTION WHEN undefined_function THEN
    v_content := v_tpl_body;
    v_content := replace(v_content, '{{contact_first}}', v_contact_first);
    v_content := replace(v_content, '{{partner_name}}',  COALESCE(v_p.name, ''));
    v_content := replace(v_content, '{{contrapartida}}', v_contrapartida);
    v_content := replace(v_content, '{{cadence}}',       COALESCE(v_p.contrapartida_cadence, 'mensal'));
  END;

  BEGIN
    v_outbox := public.wa_outbox_schedule_automation(
      p_phone         => v_phone,
      p_content       => v_content,
      p_lead_id       => v_p.id::text,
      p_lead_name     => COALESCE(v_p.contact_name, v_p.name),
      p_scheduled_at  => now(),
      p_appt_ref      => NULL,
      p_rule_id       => v_tpl_id,
      p_ab_variant    => NULL,
      p_vars_snapshot => v_vars
    );
  EXCEPTION WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', false, 'error', 'enqueue_failed', 'detail', SQLERRM);
  END;

  -- Se uma task foi passada, resolve ela
  IF p_task_id IS NOT NULL THEN
    UPDATE public.b2b_tasks
       SET status = 'auto_resolved', resolved_at = now(), updated_at = now()
     WHERE clinic_id = v_clinic_id AND id = p_task_id AND status = 'open';
  END IF;

  RETURN jsonb_build_object('ok', true, 'outbox', v_outbox, 'phone', v_phone);
END $$;


-- ── RPC: dispara brief pra TODAS as parcerias ativas ───────
-- Usa no dia 01 depois do cron. Ou chamada manualmente do banner
-- 'Enviar todos'.
CREATE OR REPLACE FUNCTION public.b2b_brief_send_all_active()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_row       record;
  v_result    jsonb;
  v_ok        int := 0;
  v_fail      int := 0;
  v_failures  jsonb := '[]'::jsonb;
BEGIN
  FOR v_row IN
    SELECT p.id, p.name, t.id AS task_id
      FROM public.b2b_partnerships p
      LEFT JOIN public.b2b_tasks t ON t.partnership_id = p.id
           AND t.kind = 'brief_monthly' AND t.status = 'open'
           AND t.created_at >= date_trunc('month', now())
     WHERE p.clinic_id = v_clinic_id AND p.status IN ('active','contract','review')
  LOOP
    v_result := public.b2b_brief_send(v_row.id, v_row.task_id);
    IF COALESCE((v_result->>'ok')::boolean, false) THEN
      v_ok := v_ok + 1;
    ELSE
      v_fail := v_fail + 1;
      v_failures := v_failures || jsonb_build_object(
        'id', v_row.id, 'name', v_row.name, 'error', v_result->>'error'
      );
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'sent', v_ok, 'failed', v_fail, 'failures', v_failures);
END $$;


GRANT EXECUTE ON FUNCTION public.b2b_brief_send(uuid, uuid)            TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_brief_send_all_active()           TO anon, authenticated, service_role;
