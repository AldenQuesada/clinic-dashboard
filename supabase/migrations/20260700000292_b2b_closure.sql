-- ============================================================
-- Migration: B2B Encerramento automatico — Fase 3.4
--
-- Detecta parcerias inativas e gera SUGESTOES de encerramento.
-- Admin aprova ou rejeita. Nunca fecha sem revisao humana.
--
-- Criterios de sugestao (qualquer um flagra):
--   - updated_at > 90 dias atras + status IN (active, review, contract)
--   - health_color = 'red' persistente
--   - DNA < 5 (DNA gate quebrado)
--
-- Estrutura:
--   b2b_partnerships.closure_suggested_at (timestamptz) — quando foi flagrada
--   b2b_partnerships.closure_reason (text)              — por que
--   + RPC detect_inactive (cron mensal)
--   + RPC closure_approve (encerra de verdade + carta)
--   + RPC closure_dismiss (limpa flag, mantem ativa)
--   + RPC closure_list (lista flagradas abertas)
-- ============================================================

ALTER TABLE public.b2b_partnerships
  ADD COLUMN IF NOT EXISTS closure_suggested_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS closure_reason       text NULL,
  ADD COLUMN IF NOT EXISTS closure_letter       text NULL;

CREATE INDEX IF NOT EXISTS idx_b2b_partnerships_closure_pending
  ON public.b2b_partnerships (clinic_id)
  WHERE closure_suggested_at IS NOT NULL AND status != 'closed';


-- ═══════════════ RPCs ═══════════════

-- ── Detectar inativas (cron mensal) ────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_closure_detect_inactive()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_row       record;
  v_flagged   int := 0;
  v_reason    text;
BEGIN
  FOR v_row IN
    SELECT id, name, updated_at, status, health_color,
           dna_excelencia, dna_estetica, dna_proposito, dna_score
      FROM public.b2b_partnerships
     WHERE clinic_id = v_clinic_id
       AND status IN ('active','review','contract')
       AND closure_suggested_at IS NULL    -- ainda nao flagrada
  LOOP
    v_reason := NULL;

    IF v_row.updated_at < (now() - interval '90 days') THEN
      v_reason := '90+ dias sem atividade';
    ELSIF v_row.health_color = 'red' THEN
      v_reason := 'Saude vermelha persistente';
    ELSIF v_row.dna_score IS NOT NULL AND v_row.dna_score < 5 THEN
      v_reason := 'DNA abaixo de 5 (gate quebrado)';
    END IF;

    IF v_reason IS NOT NULL THEN
      UPDATE public.b2b_partnerships
         SET closure_suggested_at = now(),
             closure_reason = v_reason
       WHERE id = v_row.id;

      -- Cria task
      INSERT INTO public.b2b_tasks (clinic_id, partnership_id, kind, title, description, due_date)
      VALUES (v_clinic_id, v_row.id, 'closure_suggestion',
        'Revisar encerramento: ' || v_row.name,
        'Sistema sugeriu encerramento — motivo: ' || v_reason ||
        '. Avalie e aprove ou mantenha ativa.',
        (now() + interval '15 days')::date)
      ON CONFLICT DO NOTHING;

      v_flagged := v_flagged + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'flagged', v_flagged);
END $$;


-- ── Listar sugestoes pendentes ─────────────────────────────
CREATE OR REPLACE FUNCTION public.b2b_closure_list_pending()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                    id,
      'name',                   name,
      'pillar',                 pillar,
      'tier',                   tier,
      'status',                 status,
      'health_color',           health_color,
      'dna_score',              dna_score,
      'updated_at',             updated_at,
      'closure_suggested_at',   closure_suggested_at,
      'closure_reason',          closure_reason,
      'days_idle',              EXTRACT(EPOCH FROM (now() - updated_at))::int / 86400
    )
    ORDER BY closure_suggested_at DESC
  ), '[]'::jsonb)
  INTO v_out
  FROM public.b2b_partnerships
  WHERE clinic_id = v_clinic_id
    AND closure_suggested_at IS NOT NULL
    AND status != 'closed';
  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;


-- ── Aprovar encerramento (encerra + gera carta) ────────────
CREATE OR REPLACE FUNCTION public.b2b_closure_approve(
  p_id     uuid,
  p_reason text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_p         public.b2b_partnerships%ROWTYPE;
  v_letter    text;
  v_final_reason text;
BEGIN
  SELECT * INTO v_p FROM public.b2b_partnerships
   WHERE clinic_id = v_clinic_id AND id = p_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', false, 'error', 'not_found'); END IF;

  v_final_reason := COALESCE(p_reason, v_p.closure_reason, 'Encerramento acordado');

  -- Carta formal (copy da Mirian)
  v_letter :=
    E'Prezados ' || COALESCE(v_p.contact_name, v_p.name) || E',\n\n' ||
    E'Agradecemos por compartilhar essa jornada com a Clínica Mirian de Paula.\n' ||
    E'Seguindo nossa revisão periódica, acordamos por encerrar este ciclo da nossa parceria neste momento.\n\n' ||
    E'Motivo: ' || v_final_reason || E'\n\n' ||
    E'Os vouchers emitidos dentro do prazo de validade permanecem honrados.\n' ||
    E'Sempre que fizer sentido reativar, nossa porta fica aberta.\n\n' ||
    E'Com carinho,\n' ||
    E'Mirian de Paula\nClínica Mirian de Paula · Beauty & Health';

  UPDATE public.b2b_partnerships
     SET status = 'closed',
         status_reason = v_final_reason,
         closure_letter = v_letter,
         updated_at = now()
   WHERE id = p_id;

  -- Cancela vouchers abertos automaticamente
  UPDATE public.b2b_vouchers
     SET status = 'cancelled',
         notes = COALESCE(notes, '') || ' [auto: parceria encerrada]',
         updated_at = now()
   WHERE clinic_id = v_clinic_id AND partnership_id = p_id
     AND status IN ('issued','delivered','opened');

  -- Resolve tasks abertas
  UPDATE public.b2b_tasks
     SET status = 'auto_resolved', resolved_at = now(), updated_at = now()
   WHERE clinic_id = v_clinic_id AND partnership_id = p_id AND status = 'open';

  RETURN jsonb_build_object(
    'ok', true,
    'id', p_id,
    'letter', v_letter
  );
END $$;


-- ── Rejeitar sugestao (mantem ativa, limpa flag) ──────────
CREATE OR REPLACE FUNCTION public.b2b_closure_dismiss(p_id uuid, p_note text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  UPDATE public.b2b_partnerships
     SET closure_suggested_at = NULL,
         closure_reason = NULL,
         updated_at = now()
   WHERE clinic_id = v_clinic_id AND id = p_id;

  -- Resolve a task de sugestao (nao fica pendente)
  UPDATE public.b2b_tasks
     SET status = 'dismissed',
         notes  = COALESCE(p_note, 'Sugestao rejeitada pelo admin'),
         resolved_at = now(), updated_at = now()
   WHERE clinic_id = v_clinic_id AND partnership_id = p_id
     AND kind = 'closure_suggestion' AND status = 'open';

  RETURN jsonb_build_object('ok', true);
END $$;


-- ── Agendar cron mensal (dia 20, 10h BRT = 13h UTC) ───────
DO $$
BEGIN
  BEGIN
    PERFORM cron.unschedule('b2b_cron_closure_detect');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  PERFORM cron.schedule('b2b_cron_closure_detect', '0 13 20 * *',
    'SELECT public.b2b_closure_detect_inactive()');
EXCEPTION WHEN undefined_function THEN
  RAISE NOTICE '[b2b_closure] pg_cron nao disponivel';
END $$;


GRANT EXECUTE ON FUNCTION public.b2b_closure_detect_inactive()  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_closure_list_pending()     TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_closure_approve(uuid, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.b2b_closure_dismiss(uuid, text) TO anon, authenticated, service_role;
