-- ============================================================
-- Migration: VPI Celebrations (Fase 9 - Entrega 7)
--
-- Parceira reage com emoji em msg de recompensa -> clinica pode
-- postar no story oficial (consent-based).
--
-- Fluxo:
--   1) Adiciona coluna reaction em wa_messages (caso nao exista)
--   2) Tabela vpi_celebrations (pending consent + posted)
--   3) Trigger em wa_messages AFTER INSERT:
--      - se inbound + content e um dos 4 emojis de carinho -> cria
--        celebration pending. Match a msg outbound VPI mais recente
--        (ultimas 24h) pra vincular contexto.
--      - responde automatico "Posso compartilhar no story?"
--   4) Outro trigger detecta SIM em resposta ao pedido -> seta
--      consent_story=true.
--   5) RPCs admin: list_pending / mark_posted
--
-- Idempotente.
-- ============================================================

-- ── 1. Coluna reaction em wa_messages (defensivo) ───────────
ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS reaction text;

CREATE INDEX IF NOT EXISTS idx_wa_messages_reaction
  ON public.wa_messages(conversation_id, reaction)
  WHERE reaction IS NOT NULL;

-- ── 2. Tabela vpi_celebrations ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.vpi_celebrations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id       uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  partner_id      uuid REFERENCES public.vpi_partners(id) ON DELETE SET NULL,
  outbox_id       uuid,
  message_id      uuid,          -- wa_messages.id da reaction
  conversation_id uuid,
  reaction        text NOT NULL,
  context_text    text,          -- primeiros caracteres da msg original
  reacted_at      timestamptz NOT NULL DEFAULT now(),
  consent_story   boolean NOT NULL DEFAULT false,
  consent_asked_at timestamptz,  -- quando foi enviado o pedido de consent
  consent_granted_at timestamptz,
  posted_at       timestamptz,
  posted_by       uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_vpi_celeb_partner
  ON public.vpi_celebrations(partner_id, reacted_at DESC);
CREATE INDEX IF NOT EXISTS idx_vpi_celeb_pending_posted
  ON public.vpi_celebrations(clinic_id, consent_story, posted_at)
  WHERE consent_story = true AND posted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vpi_celeb_conv
  ON public.vpi_celebrations(conversation_id, reacted_at DESC);

ALTER TABLE public.vpi_celebrations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='vpi_celebrations' AND policyname='vpi_celeb_all_read'
  ) THEN
    CREATE POLICY vpi_celeb_all_read ON public.vpi_celebrations FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='public'
      AND tablename='vpi_celebrations' AND policyname='vpi_celeb_all_write'
  ) THEN
    CREATE POLICY vpi_celeb_all_write ON public.vpi_celebrations FOR ALL USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ── 3. Trigger: detectar reacao em mensagem VPI recente ─────
-- Criterio: msg inbound, content e um dos 4 emojis (❤️🎉🙏✨),
-- e existe uma msg outbound nas ultimas 24h naquela mesma conversa.
-- Grava reaction na wa_messages tb pra facilitar query futura.
CREATE OR REPLACE FUNCTION public._vpi_detect_reaction()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_emoji       text;
  v_trimmed     text;
  v_phone       text;
  v_partner_id  uuid;
  v_partner_nome text;
  v_last_msg    text;
  v_last_out    record;
  v_is_vpi_msg  boolean := false;
  v_exists      uuid;
BEGIN
  IF NEW.direction <> 'inbound' THEN RETURN NEW; END IF;
  IF NEW.content IS NULL THEN RETURN NEW; END IF;

  v_trimmed := trim(NEW.content);
  -- Detecta primeiros caracteres como um dos 4 emojis de carinho
  -- (Unicode literal; tambem aceita "❤" sem variacao emoji)
  IF v_trimmed IN (E'\u2764\uFE0F', E'\u2764', E'\U0001F389', E'\U0001F64F', E'\u2728') THEN
    v_emoji := v_trimmed;
  ELSE
    RETURN NEW;
  END IF;

  -- Grava reaction na propria msg pra futura analise
  BEGIN
    UPDATE public.wa_messages
       SET reaction = v_emoji
     WHERE id = NEW.id;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  -- Busca phone da conversation
  BEGIN
    SELECT phone INTO v_phone
      FROM public.wa_conversations
     WHERE id = NEW.conversation_id
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_phone := NULL; END;
  IF v_phone IS NULL OR length(v_phone) < 8 THEN RETURN NEW; END IF;

  -- Busca partner VPI por phone (right 8)
  BEGIN
    SELECT p.id, p.nome INTO v_partner_id, v_partner_nome
      FROM public.vpi_partners p
     WHERE right(regexp_replace(COALESCE(p.phone,''), '\D','','g'), 8)
         = right(regexp_replace(v_phone, '\D','','g'), 8)
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_partner_id := NULL; END;

  IF v_partner_id IS NULL THEN RETURN NEW; END IF;

  -- Busca ultima msg outbound na conversa (ultimas 24h) pra contexto
  BEGIN
    SELECT id, content, created_at INTO v_last_out
      FROM public.wa_messages
     WHERE conversation_id = NEW.conversation_id
       AND direction = 'outbound'
       AND created_at > now() - INTERVAL '24 hours'
     ORDER BY created_at DESC
     LIMIT 1;
  EXCEPTION WHEN OTHERS THEN v_last_out := NULL; END;

  IF v_last_out.id IS NULL THEN RETURN NEW; END IF;

  -- Heuristica: so considera "VPI msg" se content bate com padrao
  -- (parabens + recompensa + *) — mas na duvida, aceita toda
  -- reacao com partner VPI. Deixamos a admin escolher o que postar.

  -- Dedup: se ja existe celebration com mesma (conv, emoji, ultimas 30min), skip
  SELECT id INTO v_exists
    FROM public.vpi_celebrations
   WHERE conversation_id = NEW.conversation_id
     AND reaction = v_emoji
     AND reacted_at > now() - INTERVAL '30 minutes'
   LIMIT 1;
  IF v_exists IS NOT NULL THEN RETURN NEW; END IF;

  INSERT INTO public.vpi_celebrations (
    clinic_id, partner_id, message_id, conversation_id,
    reaction, context_text, reacted_at
  ) VALUES (
    COALESCE(NEW.clinic_id, '00000000-0000-0000-0000-000000000001'::uuid),
    v_partner_id, NEW.id, NEW.conversation_id,
    v_emoji,
    left(COALESCE(v_last_out.content, ''), 220),
    NEW.created_at
  );

  -- Pedir consent via WA: mensagem amigavel
  BEGIN
    PERFORM public.wa_outbox_schedule_automation(
      v_phone,
      'Seu momento esta lindo, *' || split_part(COALESCE(v_partner_nome,''), ' ', 1) || '*! ' || v_emoji ||
      E'\n\nPosso compartilhar com as outras embaixadoras no nosso story? So o seu primeiro nome aparece.' ||
      E'\n\nResponda *SIM* pra liberar ou *NAO* pra manter privado.',
      NULL,
      v_partner_nome,
      now(),
      NULL, NULL, NULL,
      jsonb_build_object('vpi_celebration_consent_request', true)
    );

    UPDATE public.vpi_celebrations
       SET consent_asked_at = now()
     WHERE conversation_id = NEW.conversation_id
       AND partner_id = v_partner_id
       AND consent_asked_at IS NULL
       AND reacted_at = NEW.created_at;
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN NEW;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='wa_messages') THEN
    DROP TRIGGER IF EXISTS trg_vpi_detect_reaction ON public.wa_messages;
    CREATE TRIGGER trg_vpi_detect_reaction
      AFTER INSERT ON public.wa_messages
      FOR EACH ROW EXECUTE FUNCTION public._vpi_detect_reaction();
  END IF;
END $$;

-- ── 4. Trigger: detectar SIM consent ────────────────────────
CREATE OR REPLACE FUNCTION public._vpi_detect_celebration_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_txt text;
  v_rows int;
BEGIN
  IF NEW.direction <> 'inbound' THEN RETURN NEW; END IF;
  IF NEW.content IS NULL THEN RETURN NEW; END IF;
  v_txt := lower(trim(NEW.content));
  -- Limita a respostas curtas
  IF length(v_txt) > 20 THEN RETURN NEW; END IF;

  IF v_txt NOT IN ('sim','sim!','sim.','pode','claro','libero','autorizo') THEN
    RETURN NEW;
  END IF;

  -- So marca consent se houve pedido nesta conversa nas ultimas 24h
  UPDATE public.vpi_celebrations
     SET consent_story       = true,
         consent_granted_at  = now()
   WHERE conversation_id = NEW.conversation_id
     AND consent_asked_at IS NOT NULL
     AND consent_asked_at > now() - INTERVAL '24 hours'
     AND consent_story = false;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows > 0 THEN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (COALESCE(NEW.clinic_id, '00000000-0000-0000-0000-000000000001'::uuid),
            'celebration_consent', 'conversation', NEW.conversation_id::text,
            jsonb_build_object('rows', v_rows));
  END IF;

  RETURN NEW;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables
              WHERE table_schema='public' AND table_name='wa_messages') THEN
    DROP TRIGGER IF EXISTS trg_vpi_detect_celebration_consent ON public.wa_messages;
    CREATE TRIGGER trg_vpi_detect_celebration_consent
      AFTER INSERT ON public.wa_messages
      FOR EACH ROW EXECUTE FUNCTION public._vpi_detect_celebration_consent();
  END IF;
END $$;

-- ── 5. RPCs admin ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_list_pending_celebrations(p_limit int DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',            c.id,
      'partner_id',    c.partner_id,
      'partner_nome',  p.nome,
      'primeiro_nome', split_part(COALESCE(p.nome,''), ' ', 1),
      'reaction',      c.reaction,
      'context_text',  c.context_text,
      'reacted_at',    c.reacted_at,
      'consent_story', c.consent_story,
      'consent_granted_at', c.consent_granted_at
    ) ORDER BY c.reacted_at DESC
  ), '[]'::jsonb) INTO v_rows
  FROM public.vpi_celebrations c
  LEFT JOIN public.vpi_partners p ON p.id = c.partner_id
  WHERE c.consent_story = true
    AND c.posted_at IS NULL
  LIMIT GREATEST(10, LEAST(500, COALESCE(p_limit, 50)));

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_list_pending_celebrations(int)
  TO authenticated;

CREATE OR REPLACE FUNCTION public.vpi_mark_celebration_posted(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_rows int;
BEGIN
  UPDATE public.vpi_celebrations
     SET posted_at = now()
   WHERE id = p_id
     AND posted_at IS NULL;
  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found_or_posted');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_mark_celebration_posted(uuid)
  TO authenticated;

-- RPC bonus: list all (incluindo postadas) pra admin historico
CREATE OR REPLACE FUNCTION public.vpi_list_all_celebrations(p_limit int DEFAULT 100)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE v_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',            c.id,
      'partner_id',    c.partner_id,
      'partner_nome',  p.nome,
      'primeiro_nome', split_part(COALESCE(p.nome,''), ' ', 1),
      'reaction',      c.reaction,
      'context_text',  c.context_text,
      'reacted_at',    c.reacted_at,
      'consent_story', c.consent_story,
      'posted_at',     c.posted_at
    ) ORDER BY c.reacted_at DESC
  ), '[]'::jsonb) INTO v_rows
  FROM public.vpi_celebrations c
  LEFT JOIN public.vpi_partners p ON p.id = c.partner_id
  LIMIT GREATEST(10, LEAST(500, COALESCE(p_limit, 100)));
  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_list_all_celebrations(int)
  TO authenticated;

COMMENT ON TABLE public.vpi_celebrations IS
  'Reacoes emoji em msgs VPI + pedido de consent + marcacao de story postado. Fase 9 Entrega 7.';
