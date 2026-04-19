-- ============================================================
-- Migration: RPCs de Governança Mira
--
-- Endpoints que a Mira chama para:
--   - Cadastrar candidatura (b2b_application_create)
--   - Aprovar/rejeitar (Alden pelo WA)
--   - Listar pendentes (Alden pelo WA)
--   - Checar whitelist (antes de emitir voucher)
--   - Compor mensagem (puxa template + substitui placeholders)
--   - Ler tema sazonal corrente
-- ============================================================

-- ════════════════════════════════════════════════════════════
-- APPLICATIONS
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.b2b_application_create(p_payload jsonb)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_phone text;
  v_id uuid;
BEGIN
  v_phone := p_payload->>'requested_by_phone';
  IF v_phone IS NULL OR length(trim(v_phone)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'requested_by_phone_required');
  END IF;
  IF p_payload->>'name' IS NULL OR length(trim(p_payload->>'name')) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'name_required');
  END IF;

  INSERT INTO public.b2b_partnership_applications (
    clinic_id, name, category, instagram,
    contact_name, contact_phone, address, notes,
    requested_by_phone, status
  ) VALUES (
    v_clinic_id,
    trim(p_payload->>'name'),
    p_payload->>'category',
    p_payload->>'instagram',
    p_payload->>'contact_name',
    COALESCE(p_payload->>'contact_phone', v_phone),
    p_payload->>'address',
    p_payload->>'notes',
    v_phone,
    'pending'
  ) RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END $$;


-- Approve: cria b2b_partnership + whitelist + retorna pacote pra Mira notificar
CREATE OR REPLACE FUNCTION public.b2b_application_approve(
  p_application_id uuid, p_note text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_app public.b2b_partnership_applications%ROWTYPE;
  v_partnership_id uuid;
  v_slug text;
BEGIN
  SELECT * INTO v_app FROM public.b2b_partnership_applications
   WHERE clinic_id = v_clinic_id AND id = p_application_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'application_not_found_or_resolved');
  END IF;

  -- Slug normalizado
  v_slug := lower(regexp_replace(
    translate(v_app.name, 'àáâãäèéêëìíîïòóôõöùúûüÀÁÂÃÄÈÉÊËÌÍÎÏÒÓÔÕÖÙÚÛÜçÇ',
                          'aaaaaeeeeiiiiooooouuuuAAAAAEEEEIIIIOOOOOUUUUcC'),
    '[^a-z0-9]+', '-', 'g'));
  v_slug := trim(both '-' from v_slug);

  -- Cria parceria
  INSERT INTO public.b2b_partnerships (
    clinic_id, name, slug, pillar, category, type, status,
    contact_name, contact_phone, contact_instagram,
    created_by
  ) VALUES (
    v_clinic_id, v_app.name, v_slug,
    'outros', v_app.category, 'transactional', 'prospect',
    v_app.contact_name, v_app.contact_phone, v_app.instagram,
    'mira_application_' || v_app.requested_by_phone
  )
  ON CONFLICT (clinic_id, slug) DO UPDATE SET name = EXCLUDED.name
  RETURNING id INTO v_partnership_id;

  -- Whitelist (telefone de quem solicitou + contact_phone se diferente)
  INSERT INTO public.b2b_partnership_wa_senders (clinic_id, partnership_id, phone, role, active)
  VALUES (v_clinic_id, v_partnership_id, v_app.requested_by_phone, 'owner', true)
  ON CONFLICT DO NOTHING;

  IF v_app.contact_phone IS NOT NULL
     AND right(regexp_replace(v_app.contact_phone, '\D', '', 'g'), 8)
         <> right(regexp_replace(v_app.requested_by_phone, '\D', '', 'g'), 8) THEN
    INSERT INTO public.b2b_partnership_wa_senders (clinic_id, partnership_id, phone, role, active)
    VALUES (v_clinic_id, v_partnership_id, v_app.contact_phone, 'operator', true)
    ON CONFLICT DO NOTHING;
  END IF;

  -- Marca resolvida
  UPDATE public.b2b_partnership_applications SET
    status = 'approved',
    approval_note = p_note,
    partnership_id = v_partnership_id,
    resolved_at = now()
  WHERE id = p_application_id;

  RETURN jsonb_build_object(
    'ok', true,
    'partnership_id', v_partnership_id,
    'partnership_name', v_app.name,
    'notify_applicant_phone', v_app.requested_by_phone,
    'notify_mirian', true
  );
END $$;


CREATE OR REPLACE FUNCTION public.b2b_application_reject(
  p_application_id uuid, p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_app public.b2b_partnership_applications%ROWTYPE;
BEGIN
  SELECT * INTO v_app FROM public.b2b_partnership_applications
   WHERE clinic_id = v_clinic_id AND id = p_application_id AND status = 'pending';
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'application_not_found_or_resolved');
  END IF;

  UPDATE public.b2b_partnership_applications SET
    status = 'rejected',
    rejection_reason = p_reason,
    resolved_at = now()
  WHERE id = p_application_id;

  RETURN jsonb_build_object(
    'ok', true,
    'partnership_name', v_app.name,
    'notify_applicant_phone', v_app.requested_by_phone,
    'rejection_reason', p_reason
  );
END $$;


CREATE OR REPLACE FUNCTION public.b2b_applications_list(
  p_status text DEFAULT 'pending', p_limit int DEFAULT 50
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT * FROM public.b2b_partnership_applications
       WHERE clinic_id = v_clinic_id
         AND (p_status IS NULL OR p_status = '' OR status = p_status)
       ORDER BY created_at DESC
       LIMIT p_limit
    ) a;
  RETURN v_out;
END $$;


-- ════════════════════════════════════════════════════════════
-- WHITELIST
-- ════════════════════════════════════════════════════════════

-- Retorna partnership_id se o phone está autorizado, null caso contrário
CREATE OR REPLACE FUNCTION public.b2b_wa_sender_lookup(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_last8 text := right(regexp_replace(p_phone, '\D', '', 'g'), 8);
  v_row record;
BEGIN
  SELECT s.partnership_id, p.name, p.slug, p.voucher_combo, p.voucher_monthly_cap,
         p.pillar, s.role
    INTO v_row
    FROM public.b2b_partnership_wa_senders s
    JOIN public.b2b_partnerships p ON p.id = s.partnership_id
   WHERE s.clinic_id = v_clinic_id
     AND s.phone_last8 = v_last8
     AND s.active = true
     AND p.status IN ('active','review','prospect','contract')
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authorized');
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'partnership_id',      v_row.partnership_id,
    'partnership_name',    v_row.name,
    'partnership_slug',    v_row.slug,
    'default_combo',       v_row.voucher_combo,
    'monthly_cap',         v_row.voucher_monthly_cap,
    'pillar',              v_row.pillar,
    'sender_role',         v_row.role
  );
END $$;


-- ════════════════════════════════════════════════════════════
-- SAZONALIDADE
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.b2b_seasonal_current()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_out jsonb;
BEGIN
  SELECT to_jsonb(c.*) INTO v_out
    FROM public.b2b_seasonal_calendar c
   WHERE c.month = EXTRACT(MONTH FROM now())::int;
  RETURN COALESCE(v_out, '{}'::jsonb);
END $$;

CREATE OR REPLACE FUNCTION public.b2b_seasonal_get(p_month int)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_out jsonb;
BEGIN
  SELECT to_jsonb(c.*) INTO v_out
    FROM public.b2b_seasonal_calendar c
   WHERE c.month = p_month;
  RETURN COALESCE(v_out, '{}'::jsonb);
END $$;


-- ════════════════════════════════════════════════════════════
-- COMPOSE MESSAGE (template + placeholders)
-- ════════════════════════════════════════════════════════════

-- Substitui {nome} {parceiro} {combo} {validade_dias} {link} {mirian}
-- Pega template específico da parceria; se não tem, pega global default
CREATE OR REPLACE FUNCTION public.b2b_voucher_compose_message(
  p_voucher_id uuid, p_link_base text DEFAULT 'https://clinicai-dashboard.px1hdq.easypanel.host'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_voucher public.b2b_vouchers%ROWTYPE;
  v_partnership public.b2b_partnerships%ROWTYPE;
  v_template text;
  v_composed text;
  v_first_name text;
  v_validity int;
  v_combo_pretty text;
BEGIN
  SELECT * INTO v_voucher FROM public.b2b_vouchers WHERE id = p_voucher_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'voucher_not_found'); END IF;

  SELECT * INTO v_partnership FROM public.b2b_partnerships WHERE id = v_voucher.partnership_id;

  -- Mensagem customizada do próprio voucher sobrescreve tudo
  IF v_voucher.wa_message_custom IS NOT NULL AND length(trim(v_voucher.wa_message_custom)) > 0 THEN
    v_template := v_voucher.wa_message_custom;
  ELSE
    -- Busca template: prioriza o vinculado → específico da parceria → global default
    SELECT body INTO v_template
      FROM public.b2b_voucher_wa_templates
     WHERE (id = v_voucher.wa_template_id)
        OR (scope = 'partnership' AND partnership_id = v_partnership.id AND active)
        OR (scope = 'global' AND is_default AND active)
     ORDER BY
       CASE WHEN id = v_voucher.wa_template_id THEN 1
            WHEN scope = 'partnership' THEN 2
            ELSE 3 END
     LIMIT 1;
  END IF;

  IF v_template IS NULL THEN
    v_template := E'Oi {nome}! Você ganhou um Voucher Presente da {parceiro} & Mirian de Paula.\n\n{link}';
  END IF;

  -- Placeholders
  v_first_name := COALESCE(split_part(trim(v_voucher.recipient_name), ' ', 1), 'você');
  v_validity := GREATEST(0, EXTRACT(DAY FROM (v_voucher.valid_until - now()))::int);
  v_combo_pretty := initcap(replace(replace(COALESCE(v_voucher.combo, ''), '_', ' '), '+', ' e '));

  v_composed := v_template;
  v_composed := replace(v_composed, '{nome}', v_first_name);
  v_composed := replace(v_composed, '{parceiro}', COALESCE(v_partnership.name, 'nossa parceira'));
  v_composed := replace(v_composed, '{combo}', v_combo_pretty);
  v_composed := replace(v_composed, '{validade_dias}', v_validity::text);
  v_composed := replace(v_composed, '{link}', p_link_base || '/voucher.html?t=' || v_voucher.token);
  v_composed := replace(v_composed, '{mirian}', 'Mirian de Paula');

  RETURN jsonb_build_object(
    'ok', true,
    'voucher_id', p_voucher_id,
    'voucher_token', v_voucher.token,
    'recipient_phone', v_voucher.recipient_phone,
    'recipient_name', v_voucher.recipient_name,
    'message', v_composed,
    'link', p_link_base || '/voucher.html?t=' || v_voucher.token
  );
END $$;


-- ════════════════════════════════════════════════════════════
-- FOLLOW-UP 24h (chamada pelo cron)
-- ════════════════════════════════════════════════════════════
-- Retorna lista de applications que merecem 1 toque educado
-- Mira que manda a mensagem (esse SQL só identifica candidatos)
CREATE OR REPLACE FUNCTION public.b2b_applications_follow_up_queue()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  -- Pending há 24h+ sem follow-up ainda
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', id, 'name', name,
    'requested_by_phone', requested_by_phone,
    'created_at', created_at
  )), '[]'::jsonb) INTO v_out
    FROM public.b2b_partnership_applications
   WHERE clinic_id = v_clinic_id
     AND status = 'pending'
     AND follow_up_count = 0
     AND created_at < now() - INTERVAL '24 hours';

  -- Marca que vai fazer follow-up (só é chamado quando a Mira enviar)
  -- Deixamos essa marcação pra RPC separada pra não marcar e falhar no envio
  RETURN v_out;
END $$;

CREATE OR REPLACE FUNCTION public.b2b_application_mark_followed_up(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.b2b_partnership_applications
     SET last_follow_up_at = now(),
         follow_up_count = follow_up_count + 1,
         updated_at = now()
   WHERE id = p_id;
  RETURN jsonb_build_object('ok', true);
END $$;


-- Archive silent (48h+ pending após follow-up)
CREATE OR REPLACE FUNCTION public.b2b_applications_archive_stale()
RETURNS jsonb
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_count int;
BEGIN
  WITH upd AS (
    UPDATE public.b2b_partnership_applications
       SET status = 'archived', resolved_at = now(), updated_at = now()
     WHERE status = 'pending'
       AND follow_up_count >= 1
       AND last_follow_up_at < now() - INTERVAL '24 hours'
     RETURNING 1
  )
  SELECT COUNT(*) INTO v_count FROM upd;
  RETURN jsonb_build_object('ok', true, 'archived', v_count);
END $$;


-- ════════════════════════════════════════════════════════════
-- Grants
-- ════════════════════════════════════════════════════════════
GRANT EXECUTE ON FUNCTION public.b2b_application_create(jsonb)                              TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_application_approve(uuid, text)                        TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_application_reject(uuid, text)                         TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_applications_list(text, int)                           TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_wa_sender_lookup(text)                                 TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_seasonal_current()                                     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_seasonal_get(int)                                      TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_voucher_compose_message(uuid, text)                    TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_applications_follow_up_queue()                         TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_application_mark_followed_up(uuid)                     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_applications_archive_stale()                           TO anon, authenticated, service_role;
