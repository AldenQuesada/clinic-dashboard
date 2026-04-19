-- ============================================================
-- Migration: VPI voucher flow + purge WA duplicates + galeria midia
-- ============================================================
-- 1. Galeria rotativa de imagens em automations (attachment_urls)
-- 2. Remove guard only_if_not_indicated das confirmacoes de agendamento
--    (a universal com link ficha + maps deve SEMPRE ir, inclusive pra
--    pacientes indicados por parceira VPI)
-- 3. Desativa regra "VPI Cortesia Indicado" antiga (trigger errado)
-- 4. Cria regras novas:
--      - VPI Voucher Recebido: dispara quando PARCEIRA envia indicacao
--        via Mira (via INSERT em vpi_indications)
--      - VPI Voucher Follow-up: dispara D+3 apos voucher se lead nao respondeu
-- 5. Consolida D+3 (desativa "Pedir Avaliacao", atualiza "Pos-procedimento D+3")
-- 6. Desativa duplicata D+1 (mantem "Apos Consulta D+1")
-- 7. Trigger em vpi_indications que enfileira voucher recebido imediatamente
-- 8. RPC vpi_voucher_followup_scan (chamar via cron n8n diario)
-- ============================================================

DO $$ BEGIN RAISE NOTICE '==> Migration 391: VPI voucher flow + purge WA'; END $$;

-- ── 1. Schema: galeria rotativa + unique (clinic_id, slug) pra upsert por slug ─
ALTER TABLE public.wa_agenda_automations
  ADD COLUMN IF NOT EXISTS attachment_urls jsonb DEFAULT '[]'::jsonb;

-- Cria unique se nao existir (necessario pra ON CONFLICT (clinic_id, slug))
DO $unique$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conrelid = 'public.wa_agenda_automations'::regclass
       AND contype = 'u'
       AND pg_get_constraintdef(oid) ILIKE '%(clinic_id, slug)%'
  ) THEN
    -- Limpar duplicatas (mantendo a mais recente por clinic_id+slug) ANTES do unique
    DELETE FROM public.wa_agenda_automations a
     USING public.wa_agenda_automations b
     WHERE a.clinic_id = b.clinic_id
       AND a.slug      = b.slug
       AND a.slug IS NOT NULL
       AND a.created_at < b.created_at;

    ALTER TABLE public.wa_agenda_automations
      ADD CONSTRAINT wa_agenda_automations_clinic_slug_key UNIQUE (clinic_id, slug);
  END IF;
END $unique$;

COMMENT ON COLUMN public.wa_agenda_automations.attachment_urls IS
  'Galeria de URLs de imagens. Se tem >= 1 item, o engine escolhe uma aleatoriamente por envio (rotacao). Fallback: attachment_url (legado).';

-- ── 2. Remover guard only_if_not_indicated das Confirmacoes ─
UPDATE public.wa_agenda_automations
   SET trigger_config = trigger_config - 'only_if_not_indicated',
       updated_at     = now()
 WHERE clinic_id = '00000000-0000-0000-0000-000000000001'
   AND trigger_type = 'on_status'
   AND trigger_config->>'status' = 'agendado'
   AND (trigger_config ? 'only_if_not_indicated');

-- ── 3. Desativar VPI Cortesia Indicado antiga (trigger errado) ──
UPDATE public.wa_agenda_automations
   SET is_active  = false,
       name       = CASE WHEN name NOT LIKE '%[DEPRECATED]%' THEN name || ' [DEPRECATED]' ELSE name END,
       updated_at = now()
 WHERE clinic_id = '00000000-0000-0000-0000-000000000001'
   AND slug = 'vpi_cortesia_indicado';

-- ── 4. Consolidar duplicatas D+1 e D+3 ────────────────────────
UPDATE public.wa_agenda_automations
   SET is_active = false,
       updated_at = now()
 WHERE clinic_id = '00000000-0000-0000-0000-000000000001'
   AND name IN ('Pos-procedimento D+1', 'Pedir Avaliacao')
   AND is_active = true;

-- Atualizar template D+3 consolidado
UPDATE public.wa_agenda_automations
   SET content_template = $tpl$Oi, *{{nome}}*! 💜

Ja sao 3 dias desde seu procedimento. Como voce esta se sentindo?

*Lembretes de cuidado:*
- Evitar sol direto na regiao tratada
- Manter a pele hidratada
- Qualquer vermelhidao incomum, nos avise!

Se tiver curtindo o resultado, deixaria uma avaliacao pra gente? Significa muito 💫

👉 https://g.page/r/clinica-mirian-de-paula/review

*Clinica Mirian de Paula*$tpl$,
       updated_at = now()
 WHERE clinic_id = '00000000-0000-0000-0000-000000000001'
   AND name = 'Pos-procedimento D+3';

-- ── 5. Inserir regra "VPI - Voucher Recebido" ──
INSERT INTO public.wa_agenda_automations (
  clinic_id, slug, name, trigger_type, trigger_config,
  channel, content_template, is_active
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'vpi_voucher_recebido',
  'VPI - Voucher Recebido (parceira indicou)',
  'on_vpi_indication_created',
  '{"source":"vpi"}'::jsonb,
  'whatsapp',
  $tpl$Oi, *{{nome}}*! 🎁

Passando rapidinho com uma boa noticia: *{{partner_nome}}* acabou de te indicar pra um *voucher-cortesia* aqui na *Clinica Mirian de Paula*. 💜

E um mimo de embaixadora — quem ja se cuida aqui podendo dividir o cuidado com alguem especial. E ela pensou em voce.

✨ *O seu presente*
{{beneficio}}

⏱ *Valido por 30 dias* — expira em *{{validade}}*.

Antes de te passar os detalhes, me conta uma coisa: voce ja fez algum procedimento estetico? E daquelas que curte cuidar da pele e do rosto? ☺️

Me responde por aqui — quero entender o seu momento antes de te mostrar o que vai encaixar melhor pra voce ✨

*Lara* — Clinica Mirian de Paula$tpl$,
  true
)
ON CONFLICT (clinic_id, slug) DO UPDATE SET
  name             = EXCLUDED.name,
  trigger_type     = EXCLUDED.trigger_type,
  trigger_config   = EXCLUDED.trigger_config,
  content_template = EXCLUDED.content_template,
  is_active        = true,
  updated_at       = now();

-- ── 6. Inserir regra "VPI - Voucher Follow-up D+3" ──
INSERT INTO public.wa_agenda_automations (
  clinic_id, slug, name, trigger_type, trigger_config,
  channel, content_template, is_active
) VALUES (
  '00000000-0000-0000-0000-000000000001',
  'vpi_voucher_followup',
  'VPI - Voucher Follow-up D+3 (sem resposta)',
  'on_vpi_voucher_followup',
  '{"days_after_indication":3,"only_if_no_reply":true}'::jsonb,
  'whatsapp',
  $tpl$Oi, *{{nome}}* ✨

Vi que voce nao respondeu sobre o voucher da *{{partner_nome}}* — imagino que tenha sido corrido.

Deixa eu te lembrar: faltam *{{dias_restantes}} dias* pra expirar. Depois disso ele e repassado pra outra pessoa.

Se quiser reservar um horario agora (mesmo que seja pra daqui 2, 3 semanas), me avisa que eu ja garanto 💜

*Lara*$tpl$,
  true
)
ON CONFLICT (clinic_id, slug) DO UPDATE SET
  name             = EXCLUDED.name,
  trigger_type     = EXCLUDED.trigger_type,
  trigger_config   = EXCLUDED.trigger_config,
  content_template = EXCLUDED.content_template,
  is_active        = true,
  updated_at       = now();

-- ── 7. Colunas pra rastrear voucher recebido em vpi_indications ──
ALTER TABLE public.vpi_indications
  ADD COLUMN IF NOT EXISTS voucher_msg_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS voucher_followup_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS voucher_first_reply_at timestamptz,
  ADD COLUMN IF NOT EXISTS beneficio text;

COMMENT ON COLUMN public.vpi_indications.beneficio IS
  'Descricao do beneficio concedido (ex: "1 Fotona 4D", "1 sessao de cortesia"). Renderizado em {{beneficio}} na msg WA.';

COMMENT ON COLUMN public.vpi_indications.voucher_msg_sent_at IS
  'Quando a msg "Voucher Recebido" foi enfileirada. Anti-duplicata.';
COMMENT ON COLUMN public.vpi_indications.voucher_followup_sent_at IS
  'Quando follow-up D+3 foi enfileirado.';
COMMENT ON COLUMN public.vpi_indications.voucher_first_reply_at IS
  'Primeira resposta do lead apos msg de voucher (guardada pelo wa_inbound).';

-- ── 8. Helper: pick random URL de galeria (ou fallback single) ──
CREATE OR REPLACE FUNCTION public._wa_pick_attachment_url(
  p_attachment_urls jsonb,
  p_attachment_url_single text
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  v_arr_len int;
  v_idx     int;
BEGIN
  IF p_attachment_urls IS NOT NULL AND jsonb_typeof(p_attachment_urls) = 'array' THEN
    v_arr_len := jsonb_array_length(p_attachment_urls);
    IF v_arr_len > 0 THEN
      v_idx := floor(random() * v_arr_len)::int;
      RETURN p_attachment_urls->>v_idx;
    END IF;
  END IF;
  RETURN NULLIF(p_attachment_url_single, '');
END;
$$;

-- ── 9. Funcao que enfileira voucher recebido ──
CREATE OR REPLACE FUNCTION public._vpi_enqueue_voucher_recebido(p_indication_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ind       RECORD;
  v_lead      RECORD;
  v_partner   RECORD;
  v_rule      RECORD;
  v_phone     text;
  v_nome      text;
  v_partner_first text;
  v_validade  text;
  v_beneficio text;
  v_content   text;
  v_media     text;
  v_clinic_id uuid;
BEGIN
  SELECT * INTO v_ind FROM public.vpi_indications WHERE id = p_indication_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_ind.voucher_msg_sent_at IS NOT NULL THEN RETURN; END IF; -- anti-duplicata

  v_clinic_id := v_ind.clinic_id;

  -- Lead
  SELECT id, name, phone INTO v_lead FROM public.leads WHERE id = v_ind.lead_id;
  IF NOT FOUND OR v_lead.phone IS NULL OR length(v_lead.phone) < 8 THEN RETURN; END IF;

  v_phone := regexp_replace(v_lead.phone, '\D', '', 'g');
  v_nome  := COALESCE(split_part(COALESCE(v_lead.name, ''), ' ', 1), '');
  IF v_nome = '' THEN v_nome := 'tudo bem'; END IF;

  -- Partner
  SELECT nome AS partner_nome INTO v_partner FROM public.vpi_partners WHERE id = v_ind.partner_id;
  IF NOT FOUND THEN RETURN; END IF;
  v_partner_first := split_part(COALESCE(v_partner.partner_nome, 'sua embaixadora'), ' ', 1);

  -- Validade = created_at + 30 dias
  v_validade := to_char(v_ind.created_at + interval '30 days', 'DD/MM/YYYY');

  -- Beneficio: fallback padrao
  v_beneficio := COALESCE(v_ind.beneficio, '1 sessao de cortesia a sua escolha');

  -- Regra
  SELECT * INTO v_rule
    FROM public.wa_agenda_automations
   WHERE clinic_id = v_clinic_id
     AND slug = 'vpi_voucher_recebido'
     AND is_active = true
   LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;

  -- Render template (substituicao simples)
  v_content := v_rule.content_template;
  v_content := replace(v_content, '{{nome}}',          v_nome);
  v_content := replace(v_content, '{{partner_nome}}',  v_partner_first);
  v_content := replace(v_content, '{{validade}}',      v_validade);
  v_content := replace(v_content, '{{beneficio}}',     v_beneficio);
  v_content := replace(v_content, '{{clinica}}',       'Clinica Mirian de Paula');

  -- Media rotativa
  v_media := public._wa_pick_attachment_url(v_rule.attachment_urls, v_rule.attachment_url);

  -- Enfileira
  INSERT INTO public.wa_outbox (
    clinic_id, lead_id, phone, content, media_url, rule_id, scheduled_at, status, created_at
  ) VALUES (
    v_clinic_id, v_lead.id, v_phone, v_content, v_media, v_rule.id, now(), 'pending', now()
  );

  -- Marca como enviado pra anti-duplicata
  UPDATE public.vpi_indications
     SET voucher_msg_sent_at = now()
   WHERE id = p_indication_id;
END;
$$;

-- ── 10. Trigger: after insert em vpi_indications ──
CREATE OR REPLACE FUNCTION public._trg_vpi_indication_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Dispara async via notify? Nao — chamada direta. Eh leve.
  BEGIN
    PERFORM public._vpi_enqueue_voucher_recebido(NEW.id);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING '[vpi voucher msg] erro ao enfileirar: %', SQLERRM;
  END;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vpi_indication_voucher_msg ON public.vpi_indications;
CREATE TRIGGER trg_vpi_indication_voucher_msg
  AFTER INSERT ON public.vpi_indications
  FOR EACH ROW
  EXECUTE FUNCTION public._trg_vpi_indication_after_insert();

-- ── 11. RPC: scan follow-up D+3 (chamar via cron n8n diario) ──
CREATE OR REPLACE FUNCTION public.vpi_voucher_followup_scan()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ind       RECORD;
  v_lead      RECORD;
  v_partner   RECORD;
  v_rule      RECORD;
  v_phone     text;
  v_nome      text;
  v_partner_first text;
  v_dias_rest int;
  v_content   text;
  v_media     text;
  v_count     int := 0;
BEGIN
  -- Regra unica (slug vpi_voucher_followup) — nao particiona por clinica pq pilot
  FOR v_ind IN
    SELECT *
      FROM public.vpi_indications
     WHERE voucher_msg_sent_at IS NOT NULL
       AND voucher_followup_sent_at IS NULL
       AND voucher_first_reply_at IS NULL
       AND voucher_msg_sent_at <= now() - interval '3 days'
       AND created_at + interval '30 days' > now()  -- voucher ainda valido
     LIMIT 50
  LOOP
    SELECT id, name, phone INTO v_lead FROM public.leads WHERE id = v_ind.lead_id;
    IF NOT FOUND OR v_lead.phone IS NULL THEN CONTINUE; END IF;

    v_phone := regexp_replace(v_lead.phone, '\D', '', 'g');
    v_nome  := split_part(COALESCE(v_lead.name, ''), ' ', 1);
    IF v_nome = '' THEN v_nome := 'tudo bem'; END IF;

    SELECT nome AS partner_nome INTO v_partner FROM public.vpi_partners WHERE id = v_ind.partner_id;
    v_partner_first := split_part(COALESCE(v_partner.partner_nome, v_partner.contact_name, 'sua embaixadora'), ' ', 1);

    v_dias_rest := GREATEST(1, extract(day from (v_ind.created_at + interval '30 days' - now()))::int);

    SELECT * INTO v_rule
      FROM public.wa_agenda_automations
     WHERE clinic_id = v_ind.clinic_id
       AND slug = 'vpi_voucher_followup'
       AND is_active = true
     LIMIT 1;
    IF NOT FOUND THEN CONTINUE; END IF;

    v_content := v_rule.content_template;
    v_content := replace(v_content, '{{nome}}',           v_nome);
    v_content := replace(v_content, '{{partner_nome}}',   v_partner_first);
    v_content := replace(v_content, '{{dias_restantes}}', v_dias_rest::text);

    v_media := public._wa_pick_attachment_url(v_rule.attachment_urls, v_rule.attachment_url);

    INSERT INTO public.wa_outbox (
      clinic_id, lead_id, phone, content, media_url, rule_id, scheduled_at, status, created_at
    ) VALUES (
      v_ind.clinic_id, v_ind.lead_id, v_phone, v_content, v_media, v_rule.id, now(), 'pending', now()
    );

    UPDATE public.vpi_indications
       SET voucher_followup_sent_at = now()
     WHERE id = v_ind.id;

    v_count := v_count + 1;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'enqueued', v_count);
END;
$$;

GRANT EXECUTE ON FUNCTION public.vpi_voucher_followup_scan() TO authenticated;

-- ── 12. Capturar primeira resposta do lead no wa_inbound ──
-- Cria funcao helper que o wa-inbound edge function pode chamar
-- pra marcar que lead respondeu (desabilita follow-up).
CREATE OR REPLACE FUNCTION public.vpi_mark_voucher_reply(p_lead_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE public.vpi_indications
     SET voucher_first_reply_at = now()
   WHERE lead_id = p_lead_id
     AND voucher_msg_sent_at IS NOT NULL
     AND voucher_first_reply_at IS NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.vpi_mark_voucher_reply(uuid) TO authenticated;

DO $$ BEGIN RAISE NOTICE '==> Migration 391 OK'; END $$;
