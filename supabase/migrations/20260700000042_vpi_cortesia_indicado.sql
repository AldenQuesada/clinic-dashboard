-- ============================================================
-- Migration: VPI Cortesia Indicado (Fase 4 - Entrega 3)
--
-- Objetivo: quando um lead indicado por uma parceira agendar
-- consulta, enviar msg diferenciada citando o nome do parceiro
-- ("cortesia especial de Maria Silva") em vez da confirmacao
-- padrao. Aumenta conversao e reciprocidade.
--
-- Mudancas:
--   1. RPC vpi_get_partner_name_by_lead(p_lead_id) — busca o
--      partner_id ativo em vpi_indications pelo lead e retorna
--      nome/id. Usado pela engine JS pra enriquecer vars.
--   2. Template novo 'vpi_cortesia_indicado' em wa_agenda_auto-
--      mations com trigger on_status=agendado + guard
--      only_if_indicated=true.
--   3. UPDATE nas confirmacoes existentes ("Novo" e "Retorno")
--      adicionando trigger_config.only_if_not_indicated=true
--      pra nao duplicar msg.
--
-- A engine JS (js/agenda-automations.engine.js) suporta os 2
-- guards novos em processStatusChange e enriquece vars com
-- indicado_por_nome quando aplicavel.
--
-- Idempotente: CREATE OR REPLACE, INSERT com ON CONFLICT,
-- UPDATE con guards de idempotencia.
-- ============================================================

-- ── 1. RPC: nome do parceiro que indicou o lead ─────────────
CREATE OR REPLACE FUNCTION public.vpi_get_partner_name_by_lead(
  p_lead_id text
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner_id uuid;
  v_nome       text;
  v_phone      text;
  v_token      text;
  v_slug       text;
  v_ind_status text;
BEGIN
  IF COALESCE(p_lead_id, '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_lead_id');
  END IF;

  -- Busca a indication mais recente ativa (nao invalid) do lead
  SELECT i.partner_id, i.status
    INTO v_partner_id, v_ind_status
    FROM public.vpi_indications i
   WHERE i.lead_id = p_lead_id
     AND i.status <> 'invalid'
   ORDER BY COALESCE(i.fechada_em, i.created_at) DESC
   LIMIT 1;

  IF v_partner_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'indicated', false);
  END IF;

  SELECT p.nome, p.phone, p.card_token, p.short_link_slug
    INTO v_nome, v_phone, v_token, v_slug
    FROM public.vpi_partners p
   WHERE p.id = v_partner_id;

  IF v_nome IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'indicated', false);
  END IF;

  RETURN jsonb_build_object(
    'ok',                 true,
    'indicated',          true,
    'partner_id',         v_partner_id,
    'partner_nome',       v_nome,
    'partner_first_name', split_part(v_nome, ' ', 1),
    'partner_phone',      v_phone,
    'card_token',         v_token,
    'short_link_slug',    v_slug,
    'indication_status',  v_ind_status
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_get_partner_name_by_lead(text) TO anon, authenticated;

-- ── 2. Template novo: vpi_cortesia_indicado ─────────────────
-- Usa slug unico pra idempotencia em redeploy.
DO $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_exists_id uuid;
  v_content   text;
BEGIN
  -- Conteudo multilinha com cortesia e bonus
  v_content :=
E'Ola, *{{nome}}*! \u2728\n\n' ||
E'Sua consulta foi confirmada:\n' ||
E'\U0001F4C5 *{{data}}* as *{{hora}}*\n' ||
E'\U0001F468\u200D\u2695\uFE0F *{{profissional}}*\n\n' ||
E'Cortesia especial de *{{indicado_por_nome}}*:\n' ||
E'voce chegou ate nos atraves de uma embaixadora oficial da *{{clinica}}*,\n' ||
E'entao ao fechar seu procedimento voce ganha um bonus especial \U0001F381\n\n' ||
E'\U0001F4CD {{clinica}}\n\n' ||
E'Qualquer duvida estamos aqui!';

  SELECT id INTO v_exists_id
    FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic_id
     AND slug = 'vpi_cortesia_indicado'
   LIMIT 1;

  IF v_exists_id IS NULL THEN
    INSERT INTO public.wa_agenda_automations (
      clinic_id, slug, name, description,
      category, sort_order,
      trigger_type, trigger_config,
      recipient_type, channel,
      content_template,
      is_active
    ) VALUES (
      v_clinic_id,
      'vpi_cortesia_indicado',
      'VPI Cortesia Indicado',
      'Msg personalizada pro lead que chegou via embaixadora. Cita nome do parceiro e promete bonus ao fechar. Dispara on_status=agendado apenas quando lead tem indicacao ativa.',
      'before', 5,
      'on_status',
      '{"status":"agendado","only_if_indicated":true}'::jsonb,
      'patient', 'whatsapp',
      v_content,
      true
    );
    RAISE NOTICE '[vpi_cortesia_indicado] template criado';
  ELSE
    -- Mantem criacao idempotente mas atualiza trigger_config e content
    -- pra garantir guard correto em redeploys.
    UPDATE public.wa_agenda_automations
       SET trigger_config = '{"status":"agendado","only_if_indicated":true}'::jsonb,
           content_template = v_content,
           is_active = COALESCE(is_active, true),
           description = 'Msg personalizada pro lead que chegou via embaixadora. Cita nome do parceiro e promete bonus ao fechar. Dispara on_status=agendado apenas quando lead tem indicacao ativa.'
     WHERE id = v_exists_id;
    RAISE NOTICE '[vpi_cortesia_indicado] template atualizado';
  END IF;
END $$;

-- ── 3. Adiciona guard only_if_not_indicated nas confirmacoes ─
-- Existem 2 regras ativas pra on_status=agendado (patient_type
-- novo e retorno). Ambas ganham o guard pra nao duplicar msg
-- quando a cortesia dispara.
UPDATE public.wa_agenda_automations
   SET trigger_config = trigger_config || '{"only_if_not_indicated":true}'::jsonb
 WHERE name IN (
         'Confirmacao Agendamento',
         'Confirmacao Agendamento — Paciente Novo',
         'Confirmacao Agendamento — Paciente Retorno'
       )
   AND trigger_type = 'on_status'
   AND (trigger_config->>'status') = 'agendado'
   AND COALESCE((trigger_config->>'only_if_not_indicated')::boolean, false) = false;

-- ── 4. Sanity note ──────────────────────────────────────────
DO $$
DECLARE
  v_new int;
  v_guards int;
BEGIN
  SELECT COUNT(*) INTO v_new
    FROM public.wa_agenda_automations
   WHERE slug='vpi_cortesia_indicado' AND is_active=true;
  SELECT COUNT(*) INTO v_guards
    FROM public.wa_agenda_automations
   WHERE trigger_type='on_status'
     AND (trigger_config->>'status')='agendado'
     AND (trigger_config->>'only_if_not_indicated')::boolean = true;
  RAISE NOTICE '[vpi_cortesia_indicado] template ativo=% | regras com guard only_if_not_indicated=%',
    v_new, v_guards;
END $$;
