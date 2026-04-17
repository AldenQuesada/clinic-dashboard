-- ============================================================
-- Migration: VPI Missao - Emissao automatica de recompensa
-- (Fase 4 - Entrega 2)
--
-- Quando uma parceira completa uma missao semanal, hoje
-- vpi_missao_progresso.completed_at e setado pelo trigger
-- _vpi_ind_after_close + _vpi_update_missao_progress (migration
-- 31), mas recompensa_emitida continua false e a parceira nunca
-- recebe a msg_template_sucesso.
--
-- Esta migration fecha o loop:
--   1. Coluna recompensa_emitida_at (timestamp).
--   2. RPC vpi_emit_missao_reward(p_progresso_id) — renderiza
--      msg_template_sucesso, enfileira em wa_outbox via
--      wa_outbox_schedule_automation, marca emitida + log.
--   3. RPC vpi_emit_missao_rewards_batch(p_missao_id) — emite
--      em lote (manual ou pg_cron).
--   4. Trigger AFTER UPDATE em vpi_missao_progresso: dispara
--      vpi_emit_missao_reward quando completed_at vira NOT NULL.
--
-- Reusa: wa_outbox_schedule_automation (dedup + auto-resync).
--
-- Idempotente: ADD COLUMN IF NOT EXISTS, CREATE OR REPLACE,
-- DROP TRIGGER IF EXISTS.
-- ============================================================

-- ── 1. Coluna de timestamp da emissao ───────────────────────
ALTER TABLE public.vpi_missao_progresso
  ADD COLUMN IF NOT EXISTS recompensa_emitida_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_vpi_mp_emit_pending
  ON public.vpi_missao_progresso(missao_id, recompensa_emitida, completed_at)
  WHERE completed_at IS NOT NULL AND recompensa_emitida = false;

-- ── 2. Render helper local (uso interno; espelha _wa_render_template) ──
-- Nao re-cria _wa_render_template pq a migration 10 ja a define.
-- Fallback defensivo: se nao existir, usamos replace direto.

-- ── 3. RPC: emite recompensa de uma missao especifica ───────
CREATE OR REPLACE FUNCTION public.vpi_emit_missao_reward(
  p_progresso_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_prog       public.vpi_missao_progresso%ROWTYPE;
  v_missao     public.vpi_missoes%ROWTYPE;
  v_partner    public.vpi_partners%ROWTYPE;
  v_tpl        text;
  v_content    text;
  v_outbox_id  uuid;
  v_vars       jsonb;
  v_first_name text;
  v_clinica    text := 'Clinica Mirian de Paula Beauty & Health';
BEGIN
  -- Carrega progresso com lock otimista (FOR UPDATE evita dupla emissao)
  SELECT * INTO v_prog
    FROM public.vpi_missao_progresso
   WHERE id = p_progresso_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'progresso_not_found');
  END IF;

  -- Ja emitido: no-op idempotente
  IF v_prog.recompensa_emitida THEN
    RETURN jsonb_build_object(
      'ok', true, 'skipped', true, 'reason', 'already_emitted',
      'recompensa_emitida_at', v_prog.recompensa_emitida_at
    );
  END IF;

  -- Nao completado: erro
  IF v_prog.completed_at IS NULL THEN
    RETURN jsonb_build_object(
      'ok', false, 'error', 'not_completed',
      'progresso_atual', v_prog.progresso_atual,
      'target', v_prog.target
    );
  END IF;

  SELECT * INTO v_missao FROM public.vpi_missoes WHERE id = v_prog.missao_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missao_not_found');
  END IF;

  SELECT * INTO v_partner FROM public.vpi_partners WHERE id = v_prog.partner_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partner_not_found');
  END IF;

  -- Sem phone = sem WA = marca emitida mas pula envio (nao trava o fluxo)
  IF COALESCE(v_partner.phone, '') = '' THEN
    UPDATE public.vpi_missao_progresso
       SET recompensa_emitida = true,
           recompensa_emitida_at = now()
     WHERE id = p_progresso_id;

    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (
      v_partner.clinic_id, 'missao_reward_skip_no_phone', 'vpi_missao_progresso',
      p_progresso_id::text,
      jsonb_build_object('partner_id', v_partner.id, 'missao_id', v_missao.id)
    );

    RETURN jsonb_build_object(
      'ok', true, 'skipped', true, 'reason', 'no_phone'
    );
  END IF;

  -- Template: preferencia pelo msg_template_sucesso; fallback generico
  v_tpl := COALESCE(
    NULLIF(trim(v_missao.msg_template_sucesso), ''),
    'Parabens {{nome}}! Voce completou a missao *{{missao_titulo}}* e ganhou {{recompensa_texto}}. Fale com a clinica para resgatar.'
  );

  v_first_name := split_part(COALESCE(v_partner.nome, 'Parceira'), ' ', 1);

  v_vars := jsonb_build_object(
    'nome',             v_first_name,
    'nome_completo',    COALESCE(v_partner.nome, ''),
    'missao_titulo',    COALESCE(v_missao.titulo, ''),
    'missao_descricao', COALESCE(v_missao.descricao, ''),
    'recompensa_texto', COALESCE(v_missao.recompensa_texto, ''),
    'recompensa_valor', CASE
      WHEN v_missao.recompensa_valor > 0 THEN 'R$ ' || v_missao.recompensa_valor::text
      ELSE ''
    END,
    'clinica',          v_clinica
  );

  -- Renderiza usando helper existente (ou fallback inline)
  BEGIN
    v_content := public._wa_render_template(v_tpl, v_vars);
  EXCEPTION WHEN undefined_function THEN
    -- Fallback: replace manual pras variaveis principais
    v_content := v_tpl;
    v_content := replace(v_content, '{{nome}}',              v_first_name);
    v_content := replace(v_content, '{{missao_titulo}}',     COALESCE(v_missao.titulo,''));
    v_content := replace(v_content, '{{recompensa_texto}}',  COALESCE(v_missao.recompensa_texto,''));
    v_content := replace(v_content, '{{recompensa_valor}}',
      CASE WHEN v_missao.recompensa_valor > 0 THEN 'R$ ' || v_missao.recompensa_valor::text ELSE '' END);
    v_content := replace(v_content, '{{clinica}}',           v_clinica);
  END;

  -- Enfileira em wa_outbox (one-shot, rule_id NULL)
  BEGIN
    v_outbox_id := public.wa_outbox_schedule_automation(
      p_phone         => v_partner.phone,
      p_content       => v_content,
      p_lead_id       => COALESCE(v_partner.lead_id, v_partner.id::text),
      p_lead_name     => COALESCE(v_partner.nome, ''),
      p_scheduled_at  => now(),
      p_appt_ref      => NULL,
      p_rule_id       => NULL,
      p_ab_variant    => NULL,
      p_vars_snapshot => v_vars
    );
  EXCEPTION WHEN OTHERS THEN
    -- Nao quebra: loga no audit e retorna erro controlado
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (
      v_partner.clinic_id, 'missao_reward_wa_failed', 'vpi_missao_progresso',
      p_progresso_id::text,
      jsonb_build_object('error', SQLERRM, 'partner_id', v_partner.id, 'missao_id', v_missao.id)
    );
    RETURN jsonb_build_object('ok', false, 'error', 'wa_enqueue_failed', 'detail', SQLERRM);
  END;

  -- Marca como emitida (ponto de nao-retorno)
  UPDATE public.vpi_missao_progresso
     SET recompensa_emitida = true,
         recompensa_emitida_at = now()
   WHERE id = p_progresso_id;

  -- Audit log positivo
  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (
    v_partner.clinic_id, 'missao_reward_emitted', 'vpi_missao_progresso',
    p_progresso_id::text,
    jsonb_build_object(
      'partner_id',    v_partner.id,
      'partner_nome',  v_partner.nome,
      'missao_id',     v_missao.id,
      'missao_titulo', v_missao.titulo,
      'outbox_id',     v_outbox_id,
      'recompensa',    v_missao.recompensa_texto
    )
  );

  RETURN jsonb_build_object(
    'ok',              true,
    'outbox_id',       v_outbox_id,
    'content_preview', left(v_content, 140),
    'partner_id',      v_partner.id,
    'missao_id',       v_missao.id
  );
END $$;

REVOKE ALL ON FUNCTION public.vpi_emit_missao_reward(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.vpi_emit_missao_reward(uuid) TO authenticated;

-- ── 4. RPC: emissao em lote pra todas as progresso pendentes ─
CREATE OR REPLACE FUNCTION public.vpi_emit_missao_rewards_batch(
  p_missao_id uuid
)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r record;
  v_emitted   int := 0;
  v_skipped_a int := 0;
  v_skipped_i int := 0;
  v_failed    int := 0;
  v_res       jsonb;
BEGIN
  IF p_missao_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'missao_id_required');
  END IF;

  FOR r IN
    SELECT id, recompensa_emitida, completed_at
      FROM public.vpi_missao_progresso
     WHERE missao_id = p_missao_id
  LOOP
    IF r.recompensa_emitida THEN
      v_skipped_a := v_skipped_a + 1;
      CONTINUE;
    END IF;
    IF r.completed_at IS NULL THEN
      v_skipped_i := v_skipped_i + 1;
      CONTINUE;
    END IF;

    BEGIN
      v_res := public.vpi_emit_missao_reward(r.id);
      IF (v_res->>'ok')::boolean AND NOT COALESCE((v_res->>'skipped')::boolean, false) THEN
        v_emitted := v_emitted + 1;
      ELSIF (v_res->>'ok')::boolean AND (v_res->>'skipped')::boolean THEN
        -- skipped dentro da RPC (no_phone etc) conta como emitted "logicamente"
        v_emitted := v_emitted + 1;
      ELSE
        v_failed := v_failed + 1;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_failed := v_failed + 1;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',                true,
    'missao_id',         p_missao_id,
    'emitted_count',     v_emitted,
    'skipped_already',   v_skipped_a,
    'skipped_incomplete',v_skipped_i,
    'failed',            v_failed
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_emit_missao_rewards_batch(uuid) TO authenticated;

-- ── 5. Trigger AFTER UPDATE: dispatcher automatico ─────────
CREATE OR REPLACE FUNCTION public._vpi_missao_progresso_after_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  -- Disparar quando completed_at vira NOT NULL (transicao de estado)
  -- E ainda nao foi emitido.
  IF NEW.completed_at IS NOT NULL
     AND OLD.completed_at IS NULL
     AND NEW.recompensa_emitida = false THEN
    BEGIN
      PERFORM public.vpi_emit_missao_reward(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      -- Isolado: nao quebra o UPDATE do progresso.
      RAISE WARNING '[vpi_missao_emit] falha ao emitir recompensa pro progresso %: %',
        NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_missao_progresso_after_update ON public.vpi_missao_progresso;
CREATE TRIGGER trg_vpi_missao_progresso_after_update
  AFTER UPDATE ON public.vpi_missao_progresso
  FOR EACH ROW EXECUTE FUNCTION public._vpi_missao_progresso_after_update();

-- ── 6. Trigger AFTER INSERT: completa-na-criacao tambem dispara ─
-- Quando _vpi_update_missao_progress cria um progresso ja com
-- progresso >= target, o INSERT ja seta completed_at. O trigger
-- AFTER UPDATE nao cobre esse caso — precisamos de AFTER INSERT.
CREATE OR REPLACE FUNCTION public._vpi_missao_progresso_after_insert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.completed_at IS NOT NULL
     AND NEW.recompensa_emitida = false THEN
    BEGIN
      PERFORM public.vpi_emit_missao_reward(NEW.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[vpi_missao_emit] falha ao emitir recompensa no INSERT %: %',
        NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_missao_progresso_after_insert ON public.vpi_missao_progresso;
CREATE TRIGGER trg_vpi_missao_progresso_after_insert
  AFTER INSERT ON public.vpi_missao_progresso
  FOR EACH ROW EXECUTE FUNCTION public._vpi_missao_progresso_after_insert();

-- ── 7. Backfill: emite retroativamente pros progressos pendentes ─
-- (completed_at NOT NULL mas recompensa_emitida=false)
DO $$
DECLARE
  r record;
  v_res jsonb;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT id FROM public.vpi_missao_progresso
     WHERE completed_at IS NOT NULL
       AND recompensa_emitida = false
  LOOP
    BEGIN
      v_res := public.vpi_emit_missao_reward(r.id);
      v_count := v_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[vpi_missao_emit backfill] progresso % falhou: %', r.id, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE '[vpi_missao_emit backfill] processados=%', v_count;
END $$;
