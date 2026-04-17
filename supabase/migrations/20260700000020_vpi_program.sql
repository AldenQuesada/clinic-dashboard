-- ============================================================
-- Migration: VPI — Programa de Indicacao (Vendas por Indicacao)
--
-- Cria tabelas persistentes para parceiros, indicacoes e
-- tiers de recompensa configuraveis. RPCs atomicas para
-- upsert, list, get, create indication, close indication
-- (que dispara WA automatico via wa_outbox_schedule_automation),
-- KPIs e verificador de alta performance 11 meses.
--
-- Arquivos JS consumidores:
--   js/vpi/vpi.repository.js
--   js/vpi/vpi.service.js
--   js/vpi/vpi.engine.js
--
-- Tudo idempotente: IF NOT EXISTS, ON CONFLICT, CREATE OR REPLACE.
-- ============================================================

-- ── 1. vpi_partners ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vpi_partners (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  lead_id               text,
  nome                  text NOT NULL,
  phone                 text,
  email                 text,
  cidade                text,
  estado                text,
  profissao             text,
  tipo                  text NOT NULL DEFAULT 'paciente',
  origem                text NOT NULL DEFAULT 'auto',
  status                text NOT NULL DEFAULT 'ativo',
  creditos_total        int  NOT NULL DEFAULT 0,
  creditos_disponiveis  int  NOT NULL DEFAULT 0,
  fotonas_usadas_ano    int  NOT NULL DEFAULT 0,
  fotonas_ano_ref       int,
  criterio_entrada      boolean NOT NULL DEFAULT false,
  convite_enviado_em    timestamptz,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (tipo   IN ('paciente','parceiro_estrategico')),
  CHECK (origem IN ('auto','manual')),
  CHECK (status IN ('ativo','inativo','convidado')),
  CHECK (fotonas_usadas_ano BETWEEN 0 AND 99)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vpi_partners_clinic_phone
  ON public.vpi_partners(clinic_id, phone) WHERE phone IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_vpi_partners_clinic_status
  ON public.vpi_partners(clinic_id, status);
CREATE INDEX IF NOT EXISTS idx_vpi_partners_lead
  ON public.vpi_partners(clinic_id, lead_id) WHERE lead_id IS NOT NULL;

-- ── 2. vpi_reward_tiers ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vpi_reward_tiers (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id                   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  tipo                        text NOT NULL,
  threshold                   int  NOT NULL,
  recompensa                  text NOT NULL,
  recompensa_valor            numeric NOT NULL DEFAULT 0,
  msg_template                text NOT NULL,
  required_consecutive_months int,
  is_active                   boolean NOT NULL DEFAULT true,
  sort_order                  int  NOT NULL DEFAULT 0,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  CHECK (tipo IN ('per_indication','milestone','high_performance')),
  CHECK (threshold > 0)
);

CREATE INDEX IF NOT EXISTS idx_vpi_tiers_clinic_active
  ON public.vpi_reward_tiers(clinic_id, is_active);

-- ── 3. vpi_indications ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vpi_indications (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id             uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  partner_id            uuid NOT NULL REFERENCES public.vpi_partners(id) ON DELETE CASCADE,
  lead_id               text NOT NULL,
  appt_id               text,
  procedimento          text,
  creditos              int  NOT NULL DEFAULT 1,
  status                text NOT NULL DEFAULT 'pending_close',
  fechada_em            timestamptz,
  recompensas_emitidas  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  CHECK (status IN ('pending_close','closed','invalid')),
  CHECK (creditos > 0)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_vpi_ind_partner_lead
  ON public.vpi_indications(partner_id, lead_id);
CREATE INDEX IF NOT EXISTS idx_vpi_ind_lead_status
  ON public.vpi_indications(clinic_id, lead_id, status);
CREATE INDEX IF NOT EXISTS idx_vpi_ind_partner_status
  ON public.vpi_indications(partner_id, status);

-- ── 4. vpi_audit_log ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vpi_audit_log (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  action      text NOT NULL,
  entity_type text NOT NULL,
  entity_id   text,
  payload     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vpi_audit_entity
  ON public.vpi_audit_log(clinic_id, entity_type, entity_id, created_at DESC);

-- ── 5. RLS ─────────────────────────────────────────────────
ALTER TABLE public.vpi_partners      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vpi_reward_tiers  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vpi_indications   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vpi_audit_log     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vpi_partners_clinic      ON public.vpi_partners;
DROP POLICY IF EXISTS vpi_reward_tiers_clinic  ON public.vpi_reward_tiers;
DROP POLICY IF EXISTS vpi_indications_clinic   ON public.vpi_indications;
DROP POLICY IF EXISTS vpi_audit_log_clinic     ON public.vpi_audit_log;

CREATE POLICY vpi_partners_clinic     ON public.vpi_partners     FOR ALL
  USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid)
  WITH CHECK (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);
CREATE POLICY vpi_reward_tiers_clinic ON public.vpi_reward_tiers FOR ALL
  USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid)
  WITH CHECK (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);
CREATE POLICY vpi_indications_clinic  ON public.vpi_indications  FOR ALL
  USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid)
  WITH CHECK (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);
CREATE POLICY vpi_audit_log_clinic    ON public.vpi_audit_log    FOR ALL
  USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid)
  WITH CHECK (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- ── 6. updated_at trigger (shared fn) ──────────────────────
CREATE OR REPLACE FUNCTION public._vpi_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_partners_updated_at ON public.vpi_partners;
CREATE TRIGGER trg_vpi_partners_updated_at
  BEFORE UPDATE ON public.vpi_partners
  FOR EACH ROW EXECUTE FUNCTION public._vpi_touch_updated_at();

DROP TRIGGER IF EXISTS trg_vpi_tiers_updated_at ON public.vpi_reward_tiers;
CREATE TRIGGER trg_vpi_tiers_updated_at
  BEFORE UPDATE ON public.vpi_reward_tiers
  FOR EACH ROW EXECUTE FUNCTION public._vpi_touch_updated_at();

DROP TRIGGER IF EXISTS trg_vpi_ind_updated_at ON public.vpi_indications;
CREATE TRIGGER trg_vpi_ind_updated_at
  BEFORE UPDATE ON public.vpi_indications
  FOR EACH ROW EXECUTE FUNCTION public._vpi_touch_updated_at();

-- ── 7. Render template helper (simples) ─────────────────────
CREATE OR REPLACE FUNCTION public._vpi_render(p_template text, p_vars jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_out text := COALESCE(p_template, '');
  v_key text;
  v_val text;
BEGIN
  IF p_vars IS NULL THEN RETURN v_out; END IF;
  FOR v_key IN SELECT jsonb_object_keys(p_vars) LOOP
    v_val := COALESCE(p_vars->>v_key, '');
    v_out := replace(v_out, '{{' || v_key || '}}', v_val);
  END LOOP;
  RETURN v_out;
END $$;

-- ── 8. RPC: vpi_partner_upsert ──────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_partner_upsert(p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_id     uuid;
  v_phone  text;
BEGIN
  v_id    := COALESCE(NULLIF(p_data->>'id','')::uuid, gen_random_uuid());
  v_phone := NULLIF(regexp_replace(COALESCE(p_data->>'phone',''), '\D', '', 'g'), '');

  IF v_phone IS NOT NULL THEN
    -- Dedup por telefone
    SELECT id INTO v_id
      FROM public.vpi_partners
     WHERE clinic_id = v_clinic AND phone = v_phone
     LIMIT 1;
    IF NOT FOUND THEN
      v_id := COALESCE(NULLIF(p_data->>'id','')::uuid, gen_random_uuid());
    END IF;
  END IF;

  INSERT INTO public.vpi_partners (
    id, clinic_id, lead_id, nome, phone, email, cidade, estado,
    profissao, tipo, origem, status
  ) VALUES (
    v_id, v_clinic,
    NULLIF(p_data->>'lead_id',''),
    COALESCE(NULLIF(p_data->>'nome',''), 'Parceiro'),
    v_phone,
    NULLIF(p_data->>'email',''),
    NULLIF(p_data->>'cidade',''),
    NULLIF(p_data->>'estado',''),
    NULLIF(p_data->>'profissao',''),
    COALESCE(NULLIF(p_data->>'tipo',''),   'paciente'),
    COALESCE(NULLIF(p_data->>'origem',''), 'manual'),
    COALESCE(NULLIF(p_data->>'status',''), 'ativo')
  )
  ON CONFLICT (id) DO UPDATE SET
    lead_id   = EXCLUDED.lead_id,
    nome      = EXCLUDED.nome,
    email     = COALESCE(EXCLUDED.email, public.vpi_partners.email),
    cidade    = COALESCE(EXCLUDED.cidade, public.vpi_partners.cidade),
    estado    = COALESCE(EXCLUDED.estado, public.vpi_partners.estado),
    profissao = COALESCE(EXCLUDED.profissao, public.vpi_partners.profissao),
    tipo      = EXCLUDED.tipo,
    status    = EXCLUDED.status;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic, 'upsert', 'partner', v_id::text, p_data);

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_partner_upsert(jsonb) TO anon, authenticated;

-- ── 9. RPC: vpi_partner_list ────────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_partner_list(
  p_search text DEFAULT NULL,
  p_sort   text DEFAULT 'ranking'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_rows jsonb;
BEGIN
  WITH base AS (
    SELECT p.*,
      (SELECT COUNT(*) FROM public.vpi_indications i
         WHERE i.partner_id = p.id
           AND i.status = 'closed'
           AND date_trunc('month', i.fechada_em) = date_trunc('month', now())
      ) AS indicacoes_mes,
      (SELECT COUNT(*) FROM public.vpi_indications i
         WHERE i.partner_id = p.id
           AND i.status = 'closed'
           AND date_trunc('year', i.fechada_em) = date_trunc('year', now())
      ) AS indicacoes_ano
    FROM public.vpi_partners p
    WHERE p.clinic_id = v_clinic
      AND (p_search IS NULL OR p_search = ''
           OR p.nome ILIKE '%' || p_search || '%'
           OR COALESCE(p.profissao,'') ILIKE '%' || p_search || '%'
           OR COALESCE(p.cidade,'')    ILIKE '%' || p_search || '%'
           OR COALESCE(p.phone,'')     ILIKE '%' || p_search || '%')
  )
  SELECT jsonb_agg(row_to_json(b.*) ORDER BY
    CASE WHEN p_sort = 'name'   THEN b.nome END ASC,
    CASE WHEN p_sort = 'recent' THEN b.created_at END DESC,
    CASE WHEN p_sort = 'oldest' THEN b.created_at END ASC,
    CASE WHEN p_sort NOT IN ('name','recent','oldest') THEN b.creditos_total END DESC
  )
  INTO v_rows FROM base b;

  RETURN COALESCE(v_rows, '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_partner_list(text, text) TO anon, authenticated;

-- ── 10. RPC: vpi_partner_get ────────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_partner_get(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_partner jsonb;
  v_indications jsonb;
BEGIN
  SELECT row_to_json(p.*)::jsonb INTO v_partner
    FROM public.vpi_partners p
   WHERE p.clinic_id = v_clinic AND p.id = p_id
   LIMIT 1;
  IF v_partner IS NULL THEN RETURN NULL; END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(i.*) ORDER BY i.created_at DESC), '[]'::jsonb)
    INTO v_indications
    FROM public.vpi_indications i
   WHERE i.partner_id = p_id;

  RETURN jsonb_build_object(
    'partner',     v_partner,
    'indications', v_indications
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_partner_get(uuid) TO anon, authenticated;

-- ── 11. RPC: vpi_indication_create ──────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_indication_create(
  p_partner_id uuid,
  p_lead_id    text,
  p_appt_id    text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_id uuid;
BEGIN
  IF p_partner_id IS NULL OR COALESCE(p_lead_id,'') = '' THEN
    RAISE EXCEPTION 'partner_id e lead_id sao obrigatorios';
  END IF;

  INSERT INTO public.vpi_indications (clinic_id, partner_id, lead_id, appt_id, status)
  VALUES (v_clinic, p_partner_id, p_lead_id, p_appt_id, 'pending_close')
  ON CONFLICT (partner_id, lead_id) DO UPDATE SET appt_id = COALESCE(EXCLUDED.appt_id, public.vpi_indications.appt_id)
  RETURNING id INTO v_id;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic, 'create', 'indication', v_id::text,
          jsonb_build_object('partner_id', p_partner_id, 'lead_id', p_lead_id, 'appt_id', p_appt_id));

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_indication_create(uuid, text, text) TO anon, authenticated;

-- ── 12. RPC: vpi_indication_close (atomic) ──────────────────
-- Fecha a indicacao, atualiza creditos do parceiro, calcula
-- tiers acionados e agenda mensagens WA via wa_outbox.
CREATE OR REPLACE FUNCTION public.vpi_indication_close(
  p_lead_id      text,
  p_appt_id      text DEFAULT NULL,
  p_procedimento text DEFAULT NULL,
  p_is_full_face boolean DEFAULT false
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic    uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_ind       public.vpi_indications%ROWTYPE;
  v_partner   public.vpi_partners%ROWTYPE;
  v_tier      public.vpi_reward_tiers%ROWTYPE;
  v_creditos  int;
  v_tiers_hit jsonb := '[]'::jsonb;
  v_emitted   jsonb;
  v_msg       text;
  v_vars      jsonb;
  v_faltam    int;
BEGIN
  IF COALESCE(p_lead_id,'') = '' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lead_id_required');
  END IF;

  SELECT * INTO v_ind
    FROM public.vpi_indications
   WHERE clinic_id = v_clinic
     AND lead_id   = p_lead_id
     AND status    = 'pending_close'
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_pending_indication');
  END IF;

  v_creditos := CASE WHEN p_is_full_face THEN 5 ELSE 1 END;

  UPDATE public.vpi_indications
     SET status = 'closed',
         fechada_em = now(),
         creditos   = v_creditos,
         procedimento = COALESCE(p_procedimento, procedimento),
         appt_id    = COALESCE(p_appt_id, appt_id)
   WHERE id = v_ind.id
   RETURNING * INTO v_ind;

  UPDATE public.vpi_partners
     SET creditos_total       = creditos_total + v_creditos,
         creditos_disponiveis = creditos_disponiveis + v_creditos,
         status               = CASE WHEN status = 'convidado' THEN 'ativo' ELSE status END
   WHERE id = v_ind.partner_id
   RETURNING * INTO v_partner;

  -- Identificar tiers recem-atingidos (threshold <= creditos_total acumulado
  -- e ainda nao emitidos em nenhuma indicacao do parceiro)
  FOR v_tier IN
    SELECT t.*
      FROM public.vpi_reward_tiers t
     WHERE t.clinic_id = v_clinic
       AND t.is_active = true
       AND t.tipo IN ('per_indication','milestone')
       AND t.threshold <= v_partner.creditos_total
       AND NOT EXISTS (
         SELECT 1 FROM public.vpi_indications i
          WHERE i.partner_id = v_partner.id
            AND i.recompensas_emitidas @> jsonb_build_array(jsonb_build_object('tier_id', t.id::text))
       )
     ORDER BY t.threshold ASC
  LOOP
    v_faltam := GREATEST(0, v_tier.threshold - v_partner.creditos_total);
    v_vars := jsonb_build_object(
      'nome',             split_part(v_partner.nome, ' ', 1),
      'nome_completo',    v_partner.nome,
      'threshold',        v_tier.threshold::text,
      'recompensa',       v_tier.recompensa,
      'creditos_atuais',  v_partner.creditos_total::text,
      'faltam',           v_faltam::text,
      'clinica',          'Clinica Mirian de Paula Beauty & Health'
    );
    v_msg := public._vpi_render(v_tier.msg_template, v_vars);

    v_emitted := jsonb_build_object(
      'tier_id',     v_tier.id::text,
      'threshold',   v_tier.threshold,
      'recompensa',  v_tier.recompensa,
      'emitted_at',  now()
    );

    UPDATE public.vpi_indications
       SET recompensas_emitidas = recompensas_emitidas || jsonb_build_array(v_emitted)
     WHERE id = v_ind.id;

    v_tiers_hit := v_tiers_hit || jsonb_build_array(v_emitted);

    -- Agenda mensagem WA (dedup+resync automaticos via wa_outbox)
    IF v_partner.phone IS NOT NULL AND length(v_partner.phone) >= 8 THEN
      BEGIN
        PERFORM public.wa_outbox_schedule_automation(
          v_partner.phone,
          v_msg,
          COALESCE(v_partner.lead_id, v_partner.id::text),
          v_partner.nome,
          now(),
          COALESCE(p_appt_id, v_ind.appt_id),
          NULL,
          NULL,
          v_vars
        );
      EXCEPTION WHEN OTHERS THEN
        -- nao bloqueia fechamento se outbox falhar
        INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
        VALUES (v_clinic, 'wa_enqueue_failed', 'indication', v_ind.id::text,
                jsonb_build_object('tier_id', v_tier.id, 'error', SQLERRM));
      END;
    END IF;
  END LOOP;

  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (v_clinic, 'close', 'indication', v_ind.id::text,
          jsonb_build_object(
            'partner_id',  v_partner.id,
            'creditos',    v_creditos,
            'full_face',   p_is_full_face,
            'tiers_hit',   v_tiers_hit
          ));

  RETURN jsonb_build_object(
    'ok',             true,
    'indication_id',  v_ind.id,
    'creditos_added', v_creditos,
    'tiers_liberados', v_tiers_hit,
    'partner',        row_to_json(v_partner)
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_indication_close(text, text, text, boolean)
  TO anon, authenticated;

-- ── 13. RPC: vpi_tier_upsert ────────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_tier_upsert(p_data jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_id uuid := COALESCE(NULLIF(p_data->>'id','')::uuid, gen_random_uuid());
BEGIN
  INSERT INTO public.vpi_reward_tiers (
    id, clinic_id, tipo, threshold, recompensa, recompensa_valor,
    msg_template, required_consecutive_months, is_active, sort_order
  ) VALUES (
    v_id, v_clinic,
    COALESCE(NULLIF(p_data->>'tipo',''), 'milestone'),
    COALESCE((p_data->>'threshold')::int, 1),
    COALESCE(NULLIF(p_data->>'recompensa',''), 'Recompensa'),
    COALESCE((p_data->>'recompensa_valor')::numeric, 0),
    COALESCE(NULLIF(p_data->>'msg_template',''), '{{nome}} atingiu {{threshold}}!'),
    NULLIF(p_data->>'required_consecutive_months','')::int,
    COALESCE((p_data->>'is_active')::boolean, true),
    COALESCE((p_data->>'sort_order')::int, 0)
  )
  ON CONFLICT (id) DO UPDATE SET
    tipo                        = EXCLUDED.tipo,
    threshold                   = EXCLUDED.threshold,
    recompensa                  = EXCLUDED.recompensa,
    recompensa_valor            = EXCLUDED.recompensa_valor,
    msg_template                = EXCLUDED.msg_template,
    required_consecutive_months = EXCLUDED.required_consecutive_months,
    is_active                   = EXCLUDED.is_active,
    sort_order                  = EXCLUDED.sort_order;

  RETURN v_id;
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_tier_upsert(jsonb) TO anon, authenticated;

-- ── 14. RPC: vpi_tier_list ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_tier_list()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t.*) ORDER BY t.tipo, t.threshold, t.sort_order)
      FROM public.vpi_reward_tiers t
     WHERE t.clinic_id = v_clinic
  ), '[]'::jsonb);
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_tier_list() TO anon, authenticated;

-- ── 15. RPC: vpi_tier_delete ────────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_tier_delete(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
BEGIN
  DELETE FROM public.vpi_reward_tiers WHERE clinic_id = v_clinic AND id = p_id;
  RETURN FOUND;
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_tier_delete(uuid) TO anon, authenticated;

-- ── 16. RPC: vpi_kpis ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_kpis()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_ativos        int;
  v_ind_mes       int;
  v_recomp_liberadas int;
  v_ind_total_validadas int;
  v_ind_total_closed int;
  v_conv numeric := 0;
BEGIN
  SELECT COUNT(*)::int INTO v_ativos
    FROM public.vpi_partners
   WHERE clinic_id = v_clinic AND status = 'ativo';

  SELECT COUNT(*)::int INTO v_ind_mes
    FROM public.vpi_indications
   WHERE clinic_id = v_clinic
     AND status = 'closed'
     AND date_trunc('month', fechada_em) = date_trunc('month', now());

  SELECT COALESCE(SUM(jsonb_array_length(recompensas_emitidas)), 0)::int
    INTO v_recomp_liberadas
    FROM public.vpi_indications
   WHERE clinic_id = v_clinic;

  SELECT COUNT(*)::int INTO v_ind_total_validadas
    FROM public.vpi_indications
   WHERE clinic_id = v_clinic AND status IN ('closed','pending_close');

  SELECT COUNT(*)::int INTO v_ind_total_closed
    FROM public.vpi_indications
   WHERE clinic_id = v_clinic AND status = 'closed';

  IF v_ind_total_validadas > 0 THEN
    v_conv := ROUND((v_ind_total_closed::numeric / v_ind_total_validadas::numeric) * 100, 1);
  END IF;

  RETURN jsonb_build_object(
    'parceiros_ativos',    v_ativos,
    'indicacoes_mes',      v_ind_mes,
    'recompensas_liberadas', v_recomp_liberadas,
    'taxa_conversao',      v_conv
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_kpis() TO anon, authenticated;

-- ── 17. RPC: vpi_high_performance_check ────────────────────
-- Verifica tiers high_performance para parceiros com constancia
-- de N meses consecutivos (de janeiro em diante).
CREATE OR REPLACE FUNCTION public.vpi_high_performance_check()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_tier    public.vpi_reward_tiers%ROWTYPE;
  v_partner public.vpi_partners%ROWTYPE;
  v_meses_ok int;
  v_min_por_mes int;
  v_hits jsonb := '[]'::jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext('vpi_high_perf'));

  FOR v_tier IN
    SELECT * FROM public.vpi_reward_tiers
     WHERE clinic_id = v_clinic AND tipo = 'high_performance' AND is_active = true
     ORDER BY threshold ASC
  LOOP
    v_min_por_mes := CASE
      WHEN v_tier.threshold = 50  THEN 5
      WHEN v_tier.threshold = 100 THEN 10
      WHEN v_tier.threshold = 150 THEN 15
      ELSE GREATEST(1, v_tier.threshold / COALESCE(v_tier.required_consecutive_months, 11))
    END;

    FOR v_partner IN
      SELECT * FROM public.vpi_partners
       WHERE clinic_id = v_clinic AND status = 'ativo' AND creditos_total >= v_tier.threshold
    LOOP
      SELECT COUNT(*)::int INTO v_meses_ok
        FROM (
          SELECT date_trunc('month', fechada_em) AS m, COUNT(*) AS qtd
            FROM public.vpi_indications
           WHERE clinic_id = v_clinic
             AND partner_id = v_partner.id
             AND status = 'closed'
             AND fechada_em >= date_trunc('year', now())
           GROUP BY 1
          HAVING COUNT(*) >= v_min_por_mes
        ) meses;

      IF v_meses_ok >= COALESCE(v_tier.required_consecutive_months, 11) THEN
        IF NOT EXISTS (
          SELECT 1 FROM public.vpi_indications i
           WHERE i.partner_id = v_partner.id
             AND i.recompensas_emitidas @> jsonb_build_array(jsonb_build_object('tier_id', v_tier.id::text))
        ) THEN
          v_hits := v_hits || jsonb_build_array(jsonb_build_object(
            'partner_id', v_partner.id,
            'tier_id',    v_tier.id,
            'threshold',  v_tier.threshold,
            'recompensa', v_tier.recompensa
          ));
          INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
          VALUES (v_clinic, 'high_perf_hit', 'partner', v_partner.id::text,
                  jsonb_build_object('tier_id', v_tier.id, 'threshold', v_tier.threshold));
        END IF;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('ok', true, 'hits', v_hits);
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_high_performance_check() TO anon, authenticated;

-- ── 18. Seed tiers padrao (idempotente) ────────────────────
DO $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_count  int;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.vpi_reward_tiers WHERE clinic_id = v_clinic;
  IF v_count = 0 THEN
    INSERT INTO public.vpi_reward_tiers (clinic_id, tipo, threshold, recompensa, recompensa_valor, msg_template, required_consecutive_months, sort_order) VALUES
    (v_clinic, 'per_indication',    1,  'Kit skincare R$ 50',            50,
     'Parabens {{nome}}! Sua 1a indicacao acabou de fechar. Voce ganhou: {{recompensa}}. Pode retirar na clinica.', NULL, 1),
    (v_clinic, 'milestone',          3,  'Desconto 20% no proximo injetavel', 0,
     '{{nome}}, ja sao 3 indicacoes! Desconto de 20% liberado para seu proximo procedimento injetavel. Agende com a gente.', NULL, 2),
    (v_clinic, 'milestone',          5,  '1 Sessao Fotona 4D',            1400,
     '{{nome}}! Voce atingiu {{threshold}} indicacoes. Sua {{recompensa}} esta liberada — o melhor protocolo regenerativo facial do mundo! Nossa equipe entra em contato para agendar.', NULL, 3),
    (v_clinic, 'milestone',         10,  '2 Sessoes Fotona 4D',           2800,
     '{{nome}}, MARCO! {{threshold}} indicacoes = {{recompensa}}. A clinica vai entrar em contato para agendar.', NULL, 4),
    (v_clinic, 'milestone',         15,  '3 Sessoes Fotona 4D (limite anual)', 4200,
     '{{nome}}! {{threshold}} indicacoes fechadas. {{recompensa}} liberadas (limite anual atingido). Proximas sessoes: voce pode transferir ou trocar por outros protocolos Fotona.', NULL, 5),
    (v_clinic, 'high_performance',  50,  'iPhone Pro Max 256GB + 10 Fotonas 4D acumuladas', 14000,
     'CAMPEA {{nome}}! 50 indicacoes em 11 meses consecutivos — iPhone Pro Max + 10 Fotonas liberados! Cerimonia de entrega em breve.', 11, 6),
    (v_clinic, 'high_performance', 100,  'iPhone Pro Max + R$ 10.000 via Pix + 10 Fotonas', 24000,
     'INCRIVEL {{nome}}! Nivel 2 alcancado: 100 indicacoes fechadas em 11 meses. iPhone + R$ 10.000 + 10 Fotonas liberados!', 11, 7),
    (v_clinic, 'high_performance', 150,  'iPhone Pro Max + R$ 20.000 via Pix + 15 Fotonas', 39000,
     'LENDA {{nome}}! 150 indicacoes em 11 meses consecutivos — Nivel 3 Premium: iPhone + R$ 20.000 + 15 Fotonas liberados!', 11, 8);
  END IF;
END $$;

-- ── 19. Seed template WA convite parceiro (editavel via Funil) ──
DO $$
DECLARE
  v_clinic uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_exists int;
BEGIN
  -- Se nao existir um registro com slug 'vpi_convite_parceiro', insere
  EXECUTE 'SELECT COUNT(*) FROM public.wa_agenda_automations WHERE clinic_id = $1 AND slug = $2'
    INTO v_exists USING v_clinic, 'vpi_convite_parceiro';

  IF v_exists = 0 THEN
    INSERT INTO public.wa_agenda_automations (
      clinic_id, name, description, category, trigger_type, trigger_config,
      recipient_type, channel, content_template, slug, is_active
    ) VALUES (
      v_clinic,
      'VPI Convite Parceiro',
      'Enviada 1 dia apos finalizacao para convidar a paciente ao Programa de Indicacao',
      'after',
      'on_demand',
      '{}'::jsonb,
      'patient',
      'whatsapp',
      E'Ola {{nome}}! \U0001F31F\n\nPassando para te dar uma otima noticia!\n\nVoce foi aprovada para o *Programa de Parceiros da Clinica Mirian de Paula Beauty & Health*! \U0001F389\n\nFunciona assim: a cada 5 amigas que voce indicar e realizarem um procedimento conosco, voce ganha *1 Sessao de Fotona 4D* — o melhor protocolo de rejuvenescimento facial do mundo.\n\nPosso te enviar seu Cartao Digital de Embaixadora para comecar?',
      'vpi_convite_parceiro',
      true
    );
  END IF;
EXCEPTION
  WHEN undefined_column THEN NULL;
  WHEN undefined_table  THEN NULL;
  WHEN others           THEN NULL;
END $$;
