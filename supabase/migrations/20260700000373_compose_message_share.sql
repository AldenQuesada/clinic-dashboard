-- ============================================================
-- Hotfix: b2b_voucher_compose_message aponta pro /b2b-voucher-share
-- (edge function com meta OG server-side → preview rico no WhatsApp)
-- ============================================================

CREATE OR REPLACE FUNCTION public.b2b_voucher_compose_message(
  p_voucher_id uuid,
  p_link_base  text DEFAULT 'https://oqboitkpcvuaudouwvkl.supabase.co'
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_voucher     public.b2b_vouchers%ROWTYPE;
  v_partnership public.b2b_partnerships%ROWTYPE;
  v_template    text;
  v_composed    text;
  v_first_name  text;
  v_validity    int;
  v_combo_pretty text;
  v_link        text;
BEGIN
  SELECT * INTO v_voucher FROM public.b2b_vouchers WHERE id = p_voucher_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'voucher_not_found'); END IF;

  SELECT * INTO v_partnership FROM public.b2b_partnerships WHERE id = v_voucher.partnership_id;

  IF v_voucher.wa_message_custom IS NOT NULL AND length(trim(v_voucher.wa_message_custom)) > 0 THEN
    v_template := v_voucher.wa_message_custom;
  ELSE
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

  v_first_name := COALESCE(NULLIF(split_part(trim(v_voucher.recipient_name), ' ', 1), ''), 'você');
  v_validity   := GREATEST(0, EXTRACT(DAY FROM (v_voucher.valid_until - now()))::int);
  v_combo_pretty := initcap(replace(replace(COALESCE(v_voucher.combo, ''), '_', ' '), '+', ' e '));

  -- Link usa /functions/v1/b2b-voucher-share pra preview OG rico
  v_link := rtrim(p_link_base, '/') || '/functions/v1/b2b-voucher-share?t=' || v_voucher.token;

  v_composed := v_template;
  v_composed := replace(v_composed, '{nome}',          v_first_name);
  v_composed := replace(v_composed, '{parceiro}',      COALESCE(v_partnership.name, 'nossa parceira'));
  v_composed := replace(v_composed, '{combo}',         v_combo_pretty);
  v_composed := replace(v_composed, '{validade_dias}', v_validity::text);
  v_composed := replace(v_composed, '{link}',          v_link);
  v_composed := replace(v_composed, '{mirian}',        'Mirian de Paula');

  RETURN jsonb_build_object(
    'ok',              true,
    'voucher_id',      p_voucher_id,
    'voucher_token',   v_voucher.token,
    'recipient_phone', v_voucher.recipient_phone,
    'recipient_name',  v_voucher.recipient_name,
    'message',         v_composed,
    'link',            v_link
  );
END $$;

GRANT EXECUTE ON FUNCTION public.b2b_voucher_compose_message(uuid, text) TO anon, authenticated, service_role;
