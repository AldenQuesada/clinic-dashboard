-- ============================================================
-- Migration: VPI Modelo de Ponteiras Fotona 4D
--
-- Muda o modelo de recompensa:
-- ANTES: 1 ind = 1 credito + tiers acumulativos (Kit skincare R$50,
-- 1 Fotona@5, 2 Fotonas@10, 3 Fotonas@15)
-- DEPOIS: 1 ind = 1 ponteira Fotona 4D. 5 ponteiras = 1 Fotona 4D
-- completa. Resgate minimo: 2 ponteiras. Limite: 15 ponteiras/ano
-- (= 3 Fotonas completas). Full Face = 5 ponteiras direto.
--
-- Ponteiras: SmoothLiftin, FRAC3, PIANO, SupErficial, NX Runner.
--
-- Kit skincare e tiers cumulativos de Fotona REMOVIDOS — eram seed
-- legado inventado. So high_performance (11m consec = iPhone+Pix)
-- sobrevive como milestone aspiracional.
--
-- Idempotente: CREATE OR REPLACE, DELETE WHERE slug IN (...).
-- ============================================================

-- ── 1. Limpa tiers antigos (Kit skincare + Fotonas acumulativas) ──
-- Mantem apenas tiers high_performance (50/100/150 com iPhones)
DELETE FROM public.vpi_reward_tiers
 WHERE tipo IN ('per_indication', 'milestone')
   AND recompensa IN (
     'Kit skincare R$ 50',
     'Desconto 20% no proximo injetavel',
     '1 Sessao Fotona 4D',
     '2 Sessoes Fotona 4D',
     '3 Sessoes Fotona 4D (limite anual)'
   );

-- ── 2. Nova coluna: ponteiras_resgatadas_ano ──
-- Controla o limite de 15 ponteiras/ano (= 3 Fotonas 4D completas).
-- Acumula independente de creditos_total — parceira pode ter 20
-- ponteiras acumuladas mas so resgata 15 no ano, sobra rola.
ALTER TABLE public.vpi_partners
  ADD COLUMN IF NOT EXISTS ponteiras_resgatadas_ano int NOT NULL DEFAULT 0;

ALTER TABLE public.vpi_partners
  ADD COLUMN IF NOT EXISTS ponteiras_resgatadas_ano_ref int NOT NULL
    DEFAULT extract(year FROM now())::int;

-- ── 3. Nova tabela: resgates de ponteiras ──
CREATE TABLE IF NOT EXISTS public.vpi_ponteira_resgates (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  partner_id    uuid NOT NULL REFERENCES public.vpi_partners(id) ON DELETE CASCADE,
  quantidade    int  NOT NULL CHECK (quantidade BETWEEN 2 AND 5),
  protocolos    jsonb NOT NULL DEFAULT '[]'::jsonb,
  status        text NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending','scheduled','done','cancelled')),
  appt_id       uuid,
  observacoes   text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  scheduled_at  timestamptz,
  done_at       timestamptz,
  cancelled_at  timestamptz,
  cancel_reason text
);

CREATE INDEX IF NOT EXISTS idx_vpi_ponteira_resgates_partner
  ON public.vpi_ponteira_resgates (partner_id, status);
CREATE INDEX IF NOT EXISTS idx_vpi_ponteira_resgates_clinic_status
  ON public.vpi_ponteira_resgates (clinic_id, status, created_at DESC);

ALTER TABLE public.vpi_ponteira_resgates ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vpi_ponteira_resgates_clinic ON public.vpi_ponteira_resgates;
CREATE POLICY vpi_ponteira_resgates_clinic ON public.vpi_ponteira_resgates
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.vpi_ponteira_resgates IS
  'Resgates de ponteiras Fotona 4D pedidos pelas parceiras. Min 2 ponteiras por resgate. Protocolos: SmoothLiftin/FRAC3/PIANO/SupErficial/NX Runner.';

-- ── 4. RPC publica: resgatar ponteiras ──
CREATE OR REPLACE FUNCTION public.vpi_pub_ponteira_resgatar(
  p_token       text,
  p_quantidade  int,
  p_protocolos  jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner   public.vpi_partners%ROWTYPE;
  v_resgate_id uuid;
  v_current_year int := extract(year FROM now())::int;
  v_used_year   int;
  v_protocolos_validos text[] := ARRAY['SmoothLiftin','FRAC3','PIANO','SupErficial','NX Runner'];
  v_proto      text;
  v_count_prot int;
  v_staff_phone text;
BEGIN
  IF COALESCE(p_token,'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_token');
  END IF;

  IF p_quantidade IS NULL OR p_quantidade < 2 OR p_quantidade > 5 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_quantity',
      'detail', 'Quantidade deve ser entre 2 e 5 ponteiras.');
  END IF;

  -- Busca partner
  SELECT * INTO v_partner FROM public.vpi_partners
   WHERE card_token = p_token AND status <> 'inativo'
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'partner_not_found');
  END IF;

  -- Saldo disponivel
  IF COALESCE(v_partner.creditos_disponiveis, 0) < p_quantidade THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'insufficient_credits',
      'detail', 'Voce tem ' || v_partner.creditos_disponiveis || ' ponteiras disponiveis.',
      'disponiveis', v_partner.creditos_disponiveis);
  END IF;

  -- Reset do contador anual se virou o ano
  IF COALESCE(v_partner.ponteiras_resgatadas_ano_ref, 0) <> v_current_year THEN
    UPDATE public.vpi_partners
       SET ponteiras_resgatadas_ano = 0,
           ponteiras_resgatadas_ano_ref = v_current_year
     WHERE id = v_partner.id;
    v_used_year := 0;
  ELSE
    v_used_year := COALESCE(v_partner.ponteiras_resgatadas_ano, 0);
  END IF;

  -- Limite anual (15 = 3 Fotonas completas)
  IF v_used_year + p_quantidade > 15 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'annual_limit',
      'detail', 'Limite anual e 15 ponteiras. Voce ja resgatou ' || v_used_year ||
                ' este ano. Resta ' || (15 - v_used_year) || '.',
      'limite_anual', 15,
      'resgatadas_ano', v_used_year);
  END IF;

  -- Valida protocolos (cada item tem que estar na lista valida)
  IF jsonb_typeof(p_protocolos) <> 'array' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_protocolos',
      'detail', 'Envie array JSON com nomes das ponteiras.');
  END IF;

  SELECT count(*) INTO v_count_prot FROM jsonb_array_elements_text(p_protocolos);
  IF v_count_prot <> p_quantidade THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'protocolos_count_mismatch',
      'detail', 'Quantidade de protocolos deve bater com quantidade (' || p_quantidade || ').');
  END IF;

  FOR v_proto IN SELECT jsonb_array_elements_text(p_protocolos)
  LOOP
    IF NOT (v_proto = ANY (v_protocolos_validos)) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'invalid_protocol',
        'detail', 'Protocolo desconhecido: ' || v_proto,
        'validos', v_protocolos_validos);
    END IF;
  END LOOP;

  -- INSERT resgate
  INSERT INTO public.vpi_ponteira_resgates (
    clinic_id, partner_id, quantidade, protocolos, status
  ) VALUES (
    v_partner.clinic_id, v_partner.id, p_quantidade, p_protocolos, 'pending'
  ) RETURNING id INTO v_resgate_id;

  -- Decrementa saldo + incrementa contador anual
  UPDATE public.vpi_partners
     SET creditos_disponiveis = creditos_disponiveis - p_quantidade,
         ponteiras_resgatadas_ano = COALESCE(ponteiras_resgatadas_ano, 0) + p_quantidade,
         ponteiras_resgatadas_ano_ref = v_current_year
   WHERE id = v_partner.id;

  -- Audit
  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_partner.clinic_id, 'ponteira_resgatada', 'resgate', v_resgate_id::text,
    jsonb_build_object(
      'partner_id',  v_partner.id,
      'partner_nome', v_partner.nome,
      'quantidade',  p_quantidade,
      'protocolos',  p_protocolos
    )
  );

  -- WA pro staff (inline, sem depender de wa_agenda_automations)
  SELECT (settings->'vpi'->>'staff_alert_phone')
    INTO v_staff_phone
    FROM public.clinics
   WHERE id = v_partner.clinic_id
   LIMIT 1;

  IF v_staff_phone IS NOT NULL AND length(v_staff_phone) >= 8 THEN
    BEGIN
      PERFORM public.wa_outbox_schedule_automation(
        p_phone        => v_staff_phone,
        p_content      => E'✨ Nova solicitacao de ponteiras Fotona 4D!\n\n' ||
                          'Parceira: *' || v_partner.nome || '*\n' ||
                          'Quantidade: ' || p_quantidade || ' ponteira(s)\n' ||
                          'Protocolos: ' || (SELECT string_agg(e, ', ')
                                              FROM jsonb_array_elements_text(p_protocolos) e) || E'\n\n' ||
                          'Entre em contato com a parceira pra agendar a sessao.\n' ||
                          'WhatsApp: ' || COALESCE(v_partner.phone, '(sem telefone)') || E'\n\n' ||
                          '_Clinica Mirian de Paula — Programa de Indicacao_',
        p_lead_id      => '',
        p_lead_name    => 'STAFF',
        p_scheduled_at => now()
      );
    EXCEPTION WHEN others THEN NULL; END;
  END IF;

  -- Broadcast pros admins (best-effort)
  BEGIN
    PERFORM public.broadcast_notification(
      'vpi_ponteira_resgate',
      'Nova solicitacao de ponteira Fotona 4D',
      v_partner.nome || ' solicitou ' || p_quantidade || ' ponteira(s): ' ||
      (SELECT string_agg(e, ', ') FROM jsonb_array_elements_text(p_protocolos) e) || '.',
      jsonb_build_object(
        'resgate_id',  v_resgate_id,
        'partner_id',  v_partner.id,
        'quantidade',  p_quantidade,
        'protocolos',  p_protocolos,
        'action',      'open_resgates_list'
      ),
      ARRAY['admin', 'owner']
    );
  EXCEPTION WHEN others THEN NULL; END;

  RETURN jsonb_build_object(
    'ok',         true,
    'resgate_id', v_resgate_id,
    'novo_saldo', v_partner.creditos_disponiveis - p_quantidade,
    'ano_usadas', v_used_year + p_quantidade,
    'ano_restante', 15 - (v_used_year + p_quantidade)
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_pub_ponteira_resgatar(text, int, jsonb) TO anon, authenticated;

-- ── 5. RPC admin: listar resgates ──
CREATE OR REPLACE FUNCTION public.vpi_ponteira_resgate_list(
  p_status text DEFAULT NULL  -- NULL = todos
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_rows jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',           r.id,
    'partner_id',   r.partner_id,
    'partner_nome', p.nome,
    'partner_phone', p.phone,
    'quantidade',   r.quantidade,
    'protocolos',   r.protocolos,
    'status',       r.status,
    'appt_id',      r.appt_id,
    'observacoes',  r.observacoes,
    'created_at',   r.created_at,
    'scheduled_at', r.scheduled_at,
    'done_at',      r.done_at
  ) ORDER BY r.created_at DESC), '[]'::jsonb)
    INTO v_rows
    FROM public.vpi_ponteira_resgates r
    JOIN public.vpi_partners p ON p.id = r.partner_id
   WHERE (p_status IS NULL OR r.status = p_status);

  RETURN jsonb_build_object('ok', true, 'rows', v_rows);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_ponteira_resgate_list(text) TO authenticated;

-- ── 6. RPC admin: atualizar status do resgate ──
CREATE OR REPLACE FUNCTION public.vpi_ponteira_resgate_update(
  p_id     uuid,
  p_status text,
  p_appt_id uuid DEFAULT NULL,
  p_observacoes text DEFAULT NULL,
  p_cancel_reason text DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_resgate public.vpi_ponteira_resgates%ROWTYPE;
BEGIN
  IF p_status NOT IN ('pending','scheduled','done','cancelled') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_status');
  END IF;

  SELECT * INTO v_resgate FROM public.vpi_ponteira_resgates WHERE id = p_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  UPDATE public.vpi_ponteira_resgates
     SET status        = p_status,
         appt_id       = COALESCE(p_appt_id, appt_id),
         observacoes   = COALESCE(p_observacoes, observacoes),
         scheduled_at  = CASE WHEN p_status = 'scheduled' AND scheduled_at IS NULL THEN now() ELSE scheduled_at END,
         done_at       = CASE WHEN p_status = 'done' AND done_at IS NULL THEN now() ELSE done_at END,
         cancelled_at  = CASE WHEN p_status = 'cancelled' AND cancelled_at IS NULL THEN now() ELSE cancelled_at END,
         cancel_reason = CASE WHEN p_status = 'cancelled' THEN COALESCE(p_cancel_reason, cancel_reason) ELSE cancel_reason END
   WHERE id = p_id;

  -- Se cancelou, devolve ponteiras pro saldo da parceira
  IF p_status = 'cancelled' AND v_resgate.status <> 'cancelled' THEN
    UPDATE public.vpi_partners
       SET creditos_disponiveis = creditos_disponiveis + v_resgate.quantidade,
           ponteiras_resgatadas_ano = GREATEST(0, COALESCE(ponteiras_resgatadas_ano, 0) - v_resgate.quantidade)
     WHERE id = v_resgate.partner_id;
  END IF;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_resgate.clinic_id, 'ponteira_resgate_' || p_status, 'resgate', p_id::text,
    jsonb_build_object(
      'old_status', v_resgate.status,
      'new_status', p_status,
      'appt_id',    p_appt_id,
      'cancel_reason', p_cancel_reason
    )
  );

  RETURN jsonb_build_object('ok', true, 'status', p_status);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_ponteira_resgate_update(uuid, text, uuid, text, text) TO authenticated;

-- ── 7. RPC: saldo + resumo pra parceira (usado no cartao publico) ──
CREATE OR REPLACE FUNCTION public.vpi_pub_ponteiras_resumo(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner public.vpi_partners%ROWTYPE;
  v_current_year int := extract(year FROM now())::int;
  v_used int;
  v_resgates jsonb;
BEGIN
  SELECT * INTO v_partner FROM public.vpi_partners
   WHERE card_token = p_token AND status <> 'inativo'
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'not_found');
  END IF;

  IF COALESCE(v_partner.ponteiras_resgatadas_ano_ref, 0) <> v_current_year THEN
    v_used := 0;
  ELSE
    v_used := COALESCE(v_partner.ponteiras_resgatadas_ano, 0);
  END IF;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',           r.id,
    'quantidade',   r.quantidade,
    'protocolos',   r.protocolos,
    'status',       r.status,
    'created_at',   r.created_at,
    'scheduled_at', r.scheduled_at
  ) ORDER BY r.created_at DESC), '[]'::jsonb)
    INTO v_resgates
    FROM public.vpi_ponteira_resgates r
   WHERE r.partner_id = v_partner.id
     AND r.status IN ('pending', 'scheduled')
   LIMIT 10;

  RETURN jsonb_build_object(
    'ok',               true,
    'disponiveis',      COALESCE(v_partner.creditos_disponiveis, 0),
    'total_acumuladas', COALESCE(v_partner.creditos_total, 0),
    'resgatadas_ano',   v_used,
    'limite_anual',     15,
    'restante_ano',     GREATEST(0, 15 - v_used),
    'fotona_completa_em', GREATEST(0, 5 - LEAST(5, COALESCE(v_partner.creditos_disponiveis, 0))),
    'resgate_minimo',   2,
    'protocolos_disponiveis', jsonb_build_array(
      jsonb_build_object('id','SmoothLiftin','label','SmoothLiftin','desc','Lifting intraoral (lifting de dentro pra fora)'),
      jsonb_build_object('id','FRAC3',       'label','FRAC3',       'desc','Ilhas de calor profundas, manchas e rugas'),
      jsonb_build_object('id','PIANO',       'label','PIANO',       'desc','Aquecimento controlado, firmeza e contorno'),
      jsonb_build_object('id','SupErficial', 'label','SupErficial', 'desc','Peeling delicado, textura e glow'),
      jsonb_build_object('id','NX Runner',   'label','NX Runner',   'desc','Peeling laser de rejuvenescimento')
    ),
    'resgates_recentes', v_resgates
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_pub_ponteiras_resumo(text) TO anon, authenticated;

-- ── 8. Reset dados de teste ──
-- Maria Teste Embaixadora: zera creditos pra comecar limpo no novo modelo
UPDATE public.vpi_partners
   SET creditos_total = 0,
       creditos_disponiveis = 0,
       ponteiras_resgatadas_ano = 0,
       ponteiras_resgatadas_ano_ref = extract(year FROM now())::int
 WHERE lower(nome) LIKE '%maria%teste%';

-- Limpa recompensas_emitidas (tiers velhos backfilled)
UPDATE public.vpi_indications i
   SET recompensas_emitidas = '[]'::jsonb
  FROM public.vpi_partners p
 WHERE i.partner_id = p.id
   AND lower(p.nome) LIKE '%maria%teste%';

COMMENT ON COLUMN public.vpi_partners.ponteiras_resgatadas_ano IS
  'Ponteiras Fotona 4D resgatadas este ano. Limite: 15 (= 3 Fotonas 4D completas). Reset anual automatico via ano_ref.';
COMMENT ON COLUMN public.vpi_partners.ponteiras_resgatadas_ano_ref IS
  'Ano de referencia do contador ponteiras_resgatadas_ano. Quando vira o ano, RPC resgatar zera automaticamente.';
