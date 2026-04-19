-- ============================================================
-- Migration: VPI Funnel Stage Triggers — popula stages intermediários
--
-- Hoje só `created` (default) e `closed`/`lost` (trg_vpi_ind_stage_on_close)
-- são populados automaticamente. Os estágios intermediários (contacted,
-- responded, scheduled, showed) ficam sempre null → o funil de drop-off
-- fica cego.
--
-- Este migration adiciona 4 triggers que marcam cada transição:
--
--   contacted → Lara enfileirou msg pro lead (wa_outbox INSERT com lead_id)
--   responded → Lead respondeu (wa_messages INSERT com direction='inbound')
--   scheduled → Appointment criado com phone batendo com lead.phone_last8
--   showed    → appointment.chegada_em mudou de null → not null
--
-- Princípios:
--   - Todos AFTER INSERT / AFTER UPDATE OF
--   - SECURITY DEFINER + SET search_path=public
--   - EXCEPTION WHEN OTHERS silencioso (não quebra INSERT original)
--   - Não sobrescreve stage já avançado (respeita ordem do funil)
--   - Helper _vpi_update_funnel_stage evita duplicar lógica
--
-- Referências de schema:
--   - vpi_indications (20260700000020, +funnel_stage em 20260700000386)
--   - wa_outbox      (20260582000000) → tem lead_id + phone
--   - wa_messages    (20260582000000) → direction/sender/conversation_id
--                     phone vem via JOIN wa_conversations
--   - appointments   (20260413000000) → id text, patient_phone text,
--                     chegada_em timestamptz
--   - leads          → tem phone
-- ============================================================

-- ── Helper: avança stage respeitando ordem ──────────────────
-- Ordem canônica: created < contacted < responded < scheduled < showed < closed
-- 'lost' é terminal (trg_vpi_ind_stage_on_close trata)
--
-- p_new_stage só é aplicado se rank(new) > rank(current); timestamp só é setado
-- se ainda null.
CREATE OR REPLACE FUNCTION public._vpi_funnel_stage_rank(p_stage text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_stage
    WHEN 'created'   THEN 0
    WHEN 'contacted' THEN 1
    WHEN 'responded' THEN 2
    WHEN 'scheduled' THEN 3
    WHEN 'showed'    THEN 4
    WHEN 'closed'    THEN 5
    WHEN 'lost'      THEN 5   -- terminal, mesmo "nível" de closed
    ELSE -1
  END
$$;

-- Helper genérico: atualiza stage + timestamp se faz sentido.
-- p_ts_column: nome literal da coluna timestamp (contacted_at / responded_at / etc)
-- Usa UPDATE ... WHERE rank(stage) < rank(new_stage) pra idempotência.
CREATE OR REPLACE FUNCTION public._vpi_update_funnel_stage(
  p_lead_id    text,
  p_new_stage  text,
  p_ts_column  text
) RETURNS int LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_sql text;
  v_new_rank int;
  v_affected int := 0;
BEGIN
  IF p_lead_id IS NULL OR length(p_lead_id) = 0 THEN RETURN 0; END IF;
  v_new_rank := public._vpi_funnel_stage_rank(p_new_stage);
  IF v_new_rank < 0 THEN RETURN 0; END IF;

  -- Nota: p_ts_column vem de constantes do código chamador (never user input),
  --        mas validamos mesmo assim pra evitar SQL injection defensivo.
  IF p_ts_column NOT IN ('contacted_at','responded_at','scheduled_at','showed_at') THEN
    RAISE NOTICE '[_vpi_update_funnel_stage] ts_column invalida: %', p_ts_column;
    RETURN 0;
  END IF;

  v_sql := format($f$
    UPDATE public.vpi_indications
       SET funnel_stage = $1,
           %I           = COALESCE(%I, now()),
           updated_at   = now()
     WHERE lead_id = $2
       AND public._vpi_funnel_stage_rank(funnel_stage) < $3
       AND funnel_stage NOT IN ('closed','lost')
  $f$, p_ts_column, p_ts_column);

  EXECUTE v_sql USING p_new_stage, p_lead_id, v_new_rank;
  GET DIAGNOSTICS v_affected = ROW_COUNT;
  RETURN v_affected;
END $$;

GRANT EXECUTE ON FUNCTION public._vpi_funnel_stage_rank(text)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._vpi_update_funnel_stage(text, text, text)
  TO anon, authenticated, service_role;


-- ════════════════════════════════════════════════════════════
-- Trigger 1: CONTACTED — Lara enfileirou primeira msg pro lead
-- ════════════════════════════════════════════════════════════
-- Gatilho: AFTER INSERT ON wa_outbox WHERE lead_id IS NOT NULL
-- Ação:    vpi_indications com mesmo lead_id → stage='contacted'
--          (só se ainda em 'created')
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._vpi_ind_stage_on_outbox()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.lead_id IS NULL OR length(NEW.lead_id) = 0 THEN
    RETURN NEW;
  END IF;

  BEGIN
    PERFORM public._vpi_update_funnel_stage(NEW.lead_id, 'contacted', 'contacted_at');
  EXCEPTION WHEN OTHERS THEN
    -- Silencioso: não pode quebrar INSERT em wa_outbox se VPI falhar
    RAISE NOTICE '[vpi_ind_stage_on_outbox] lead_id=% err=%', NEW.lead_id, SQLERRM;
  END;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_ind_stage_on_outbox ON public.wa_outbox;
CREATE TRIGGER trg_vpi_ind_stage_on_outbox
  AFTER INSERT ON public.wa_outbox
  FOR EACH ROW EXECUTE FUNCTION public._vpi_ind_stage_on_outbox();


-- ════════════════════════════════════════════════════════════
-- Trigger 2: RESPONDED — lead respondeu no inbox
-- ════════════════════════════════════════════════════════════
-- Gatilho: AFTER INSERT ON wa_messages WHERE direction='inbound'
--
-- wa_messages não tem `phone` direto — pega via JOIN wa_conversations.
-- Match por phone_last8 contra leads.phone → procura vpi_indications pelo
-- lead.id.
--
-- IMPORTANTE: wa_messages tem MUITOS INSERTs por segundo em produção.
-- Mantemos a lógica barata: uma única query UPDATE idempotente.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._vpi_ind_stage_on_inbound()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_phone      text;
  v_phone_last8 text;
  v_lead_id    text;
BEGIN
  -- Só inbound importa
  IF NEW.direction IS NULL OR NEW.direction != 'inbound' THEN
    RETURN NEW;
  END IF;

  BEGIN
    -- Phone do lead vem da conversation
    SELECT phone INTO v_phone
      FROM public.wa_conversations
     WHERE id = NEW.conversation_id;

    IF v_phone IS NULL OR length(trim(v_phone)) = 0 THEN
      RETURN NEW;
    END IF;

    v_phone_last8 := right(regexp_replace(v_phone, '\D', '', 'g'), 8);
    IF length(v_phone_last8) < 8 THEN RETURN NEW; END IF;

    -- Match direto lead pelo phone (usa índices existentes em leads.phone)
    SELECT id INTO v_lead_id
      FROM public.leads
     WHERE right(regexp_replace(COALESCE(phone,''), '\D', '', 'g'), 8) = v_phone_last8
       AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_lead_id IS NULL THEN RETURN NEW; END IF;

    PERFORM public._vpi_update_funnel_stage(v_lead_id, 'responded', 'responded_at');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[vpi_ind_stage_on_inbound] msg_id=% err=%', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_ind_stage_on_inbound ON public.wa_messages;
CREATE TRIGGER trg_vpi_ind_stage_on_inbound
  AFTER INSERT ON public.wa_messages
  FOR EACH ROW EXECUTE FUNCTION public._vpi_ind_stage_on_inbound();


-- ════════════════════════════════════════════════════════════
-- Trigger 3: SCHEDULED — appointment criado
-- ════════════════════════════════════════════════════════════
-- Gatilho: AFTER INSERT ON appointments WHERE patient_phone IS NOT NULL
-- Match: appointments.patient_phone → leads.phone (phone_last8) → vpi_indications
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._vpi_ind_stage_on_appointment()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_phone_last8 text;
  v_lead_id text;
BEGIN
  IF NEW.patient_phone IS NULL OR length(trim(NEW.patient_phone)) = 0 THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_phone_last8 := right(regexp_replace(NEW.patient_phone, '\D', '', 'g'), 8);
    IF length(v_phone_last8) < 8 THEN RETURN NEW; END IF;

    -- Procura lead com esse phone
    SELECT id INTO v_lead_id
      FROM public.leads
     WHERE right(regexp_replace(COALESCE(phone,''), '\D', '', 'g'), 8) = v_phone_last8
       AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_lead_id IS NULL THEN RETURN NEW; END IF;

    PERFORM public._vpi_update_funnel_stage(v_lead_id, 'scheduled', 'scheduled_at');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[vpi_ind_stage_on_appointment] appt=% err=%', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_ind_stage_on_appointment ON public.appointments;
CREATE TRIGGER trg_vpi_ind_stage_on_appointment
  AFTER INSERT ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public._vpi_ind_stage_on_appointment();


-- ════════════════════════════════════════════════════════════
-- Trigger 4: SHOWED — paciente chegou (chegada_em null → not null)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._vpi_ind_stage_on_arrival()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_phone_last8 text;
  v_lead_id text;
BEGIN
  -- Só disparar quando chegada_em mudou de null → valor
  IF NEW.chegada_em IS NULL THEN RETURN NEW; END IF;
  IF OLD.chegada_em IS NOT NULL THEN RETURN NEW; END IF;

  IF NEW.patient_phone IS NULL OR length(trim(NEW.patient_phone)) = 0 THEN
    RETURN NEW;
  END IF;

  BEGIN
    v_phone_last8 := right(regexp_replace(NEW.patient_phone, '\D', '', 'g'), 8);
    IF length(v_phone_last8) < 8 THEN RETURN NEW; END IF;

    SELECT id INTO v_lead_id
      FROM public.leads
     WHERE right(regexp_replace(COALESCE(phone,''), '\D', '', 'g'), 8) = v_phone_last8
       AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT 1;

    IF v_lead_id IS NULL THEN RETURN NEW; END IF;

    PERFORM public._vpi_update_funnel_stage(v_lead_id, 'showed', 'showed_at');
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '[vpi_ind_stage_on_arrival] appt=% err=%', NEW.id, SQLERRM;
  END;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_ind_stage_on_arrival ON public.appointments;
CREATE TRIGGER trg_vpi_ind_stage_on_arrival
  AFTER UPDATE OF chegada_em ON public.appointments
  FOR EACH ROW EXECUTE FUNCTION public._vpi_ind_stage_on_arrival();


-- ════════════════════════════════════════════════════════════
-- Backfill leve: atualiza indicações existentes onde possível
-- ════════════════════════════════════════════════════════════
-- contacted_at: se existe wa_outbox com lead_id antes do created_at
UPDATE public.vpi_indications i
   SET funnel_stage = 'contacted',
       contacted_at = COALESCE(i.contacted_at, sub.first_sent),
       updated_at   = now()
  FROM (
    SELECT o.lead_id, MIN(o.created_at) AS first_sent
      FROM public.wa_outbox o
     WHERE o.lead_id IS NOT NULL
     GROUP BY o.lead_id
  ) sub
 WHERE i.lead_id = sub.lead_id
   AND i.funnel_stage = 'created';

-- responded_at: se existe inbound no wa_messages via conv.phone → lead.phone
UPDATE public.vpi_indications i
   SET funnel_stage = 'responded',
       responded_at = COALESCE(i.responded_at, sub.first_reply),
       updated_at   = now()
  FROM (
    SELECT l.id AS lead_id, MIN(m.sent_at) AS first_reply
      FROM public.wa_messages m
      JOIN public.wa_conversations c ON c.id = m.conversation_id
      JOIN public.leads l ON right(regexp_replace(COALESCE(l.phone,''),'\D','','g'), 8)
                          = right(regexp_replace(COALESCE(c.phone,''),'\D','','g'), 8)
     WHERE m.direction = 'inbound'
       AND l.deleted_at IS NULL
     GROUP BY l.id
  ) sub
 WHERE i.lead_id = sub.lead_id
   AND public._vpi_funnel_stage_rank(i.funnel_stage) < 2
   AND i.funnel_stage NOT IN ('closed','lost');

-- scheduled_at: se existe appointment com phone batendo
UPDATE public.vpi_indications i
   SET funnel_stage = 'scheduled',
       scheduled_at = COALESCE(i.scheduled_at, sub.first_appt),
       updated_at   = now()
  FROM (
    SELECT l.id AS lead_id, MIN(a.created_at) AS first_appt
      FROM public.appointments a
      JOIN public.leads l ON right(regexp_replace(COALESCE(l.phone,''),'\D','','g'), 8)
                          = right(regexp_replace(COALESCE(a.patient_phone,''),'\D','','g'), 8)
     WHERE a.patient_phone IS NOT NULL
       AND l.deleted_at IS NULL
       AND a.deleted_at IS NULL
     GROUP BY l.id
  ) sub
 WHERE i.lead_id = sub.lead_id
   AND public._vpi_funnel_stage_rank(i.funnel_stage) < 3
   AND i.funnel_stage NOT IN ('closed','lost');

-- showed_at: appointments que têm chegada_em
UPDATE public.vpi_indications i
   SET funnel_stage = 'showed',
       showed_at    = COALESCE(i.showed_at, sub.first_arrival),
       updated_at   = now()
  FROM (
    SELECT l.id AS lead_id, MIN(a.chegada_em) AS first_arrival
      FROM public.appointments a
      JOIN public.leads l ON right(regexp_replace(COALESCE(l.phone,''),'\D','','g'), 8)
                          = right(regexp_replace(COALESCE(a.patient_phone,''),'\D','','g'), 8)
     WHERE a.chegada_em IS NOT NULL
       AND a.patient_phone IS NOT NULL
       AND l.deleted_at IS NULL
       AND a.deleted_at IS NULL
     GROUP BY l.id
  ) sub
 WHERE i.lead_id = sub.lead_id
   AND public._vpi_funnel_stage_rank(i.funnel_stage) < 4
   AND i.funnel_stage NOT IN ('closed','lost');

-- ── Fim ─────────────────────────────────────────────────────
COMMENT ON FUNCTION public._vpi_update_funnel_stage(text, text, text) IS
  'Helper: avança funnel_stage de vpi_indications respeitando ordem (created<contacted<responded<scheduled<showed<closed/lost). Idempotente.';
COMMENT ON FUNCTION public._vpi_ind_stage_on_outbox() IS
  'Trigger: wa_outbox INSERT com lead_id → vpi.funnel_stage=contacted';
COMMENT ON FUNCTION public._vpi_ind_stage_on_inbound() IS
  'Trigger: wa_messages INSERT direction=inbound → vpi.funnel_stage=responded (match via conversation.phone → leads.phone_last8)';
COMMENT ON FUNCTION public._vpi_ind_stage_on_appointment() IS
  'Trigger: appointments INSERT com patient_phone → vpi.funnel_stage=scheduled';
COMMENT ON FUNCTION public._vpi_ind_stage_on_arrival() IS
  'Trigger: appointments UPDATE chegada_em null→notnull → vpi.funnel_stage=showed';
