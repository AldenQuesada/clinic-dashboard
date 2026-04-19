-- ============================================================================
-- Anatomy Quiz · Lifecycle Bridge → Lara (SDR contextual)
-- Migration 20260420 · Onda 33
--
-- Quando user completa o quiz de anatomia e submete (via lp_lead_submit_v2):
-- 1. Lookup do telefone em patients/appointments/leads (right(8) match)
-- 2. Branch por lifecycle status (novo/lead/orçamento/agendado/paciente)
-- 3. Score-weighted das queixas (olheiras=100, rugas=90, contorno=65, volume=55)
-- 4. Insere row em anatomy_quiz_lara_dispatch com template_key + context completo
-- 5. n8n polla a tabela e orquestra mensagens (single OU sequência SPIN)
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────
-- 1. Banco de fotos antes/depois por queixa (proof social das msgs)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.anatomy_quiz_proof_photos (
  id          uuid primary key default gen_random_uuid(),
  area_key    text not null,
  photo_url   text not null,
  caption     text,
  patient_age int,
  days_after  int,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_aq_proof_area
  ON public.anatomy_quiz_proof_photos(area_key) WHERE active = true;
COMMENT ON TABLE public.anatomy_quiz_proof_photos IS
  'Fotos antes/depois por queixa · Lara usa nas sequências do anatomy-quiz';

-- ─────────────────────────────────────────────────────────────────
-- 2. Tabela de dispatch (queue · n8n consome)
-- ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.anatomy_quiz_lara_dispatch (
  id              uuid primary key default gen_random_uuid(),
  lp_lead_id      uuid,
  phone           text not null,           -- normalizado (digits only)
  phone_raw       text,
  name            text,
  template_key    text not null,           -- aq_novo_lead | aq_lead_frio | aq_orcamento_aberto | aq_agendado_futuro | aq_paciente_ativo | aq_requiz_recente
  lifecycle       text not null,           -- novo | lead_existente | orcamento | agendado_futuro | paciente_ativo | requiz_recente
  queixas         jsonb not null,          -- [{ key, label, protocol, weight }, ...] · ordenadas por weight desc
  context         jsonb not null,          -- patient_id/appointment_id/lead_id/scheduled_for/orcamento_id...
  status          text not null default 'pending',  -- pending | dispatched | failed
  dispatched_at   timestamptz,
  error_message   text,
  attempts        int not null default 0,
  created_at      timestamptz not null default now()
);
CREATE INDEX IF NOT EXISTS idx_aq_dispatch_pending
  ON public.anatomy_quiz_lara_dispatch(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_aq_dispatch_phone
  ON public.anatomy_quiz_lara_dispatch(phone, created_at DESC);
COMMENT ON TABLE public.anatomy_quiz_lara_dispatch IS
  'Queue Lara consome · 1 row por lead/quiz com template_key e context completo';

-- ─────────────────────────────────────────────────────────────────
-- 3. Score-weighting das queixas (top 2 ganham nas msgs)
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._aq_area_weight(p_key text)
RETURNS int LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_key
    WHEN 'olheiras'           THEN 100
    -- Rugas (anti-idade)
    WHEN 'testa'              THEN 90
    WHEN 'entre_sobrancelhas' THEN 90
    WHEN 'pe_de_galinha'      THEN 90
    WHEN 'linha_marionete'    THEN 90
    WHEN 'codigo_barras'      THEN 90
    WHEN 'bigode_chines'      THEN 90
    -- Contorno / estrutura
    WHEN 'papada'             THEN 65
    WHEN 'bulldog'            THEN 65
    WHEN 'mandibular'         THEN 65
    -- Volume / estético
    WHEN 'bochechas'          THEN 55
    WHEN 'labios'             THEN 55
    -- Nariz / mento
    WHEN 'dorso_nariz'        THEN 50
    WHEN 'ponta_nariz'        THEN 50
    WHEN 'mento'              THEN 50
    ELSE 40
  END;
$$;

CREATE OR REPLACE FUNCTION public._aq_area_label(p_key text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_key
    WHEN 'testa'              THEN 'testa'
    WHEN 'entre_sobrancelhas' THEN 'entre as sobrancelhas'
    WHEN 'pe_de_galinha'      THEN 'pés de galinha'
    WHEN 'olheiras'           THEN 'olheiras'
    WHEN 'bochechas'          THEN 'volume das bochechas'
    WHEN 'bigode_chines'      THEN 'bigode chinês'
    WHEN 'codigo_barras'      THEN 'código de barras'
    WHEN 'labios'             THEN 'lábios'
    WHEN 'linha_marionete'    THEN 'linhas de marionete'
    WHEN 'bulldog'            THEN 'flacidez no maxilar'
    WHEN 'mandibular'         THEN 'contorno da mandíbula'
    WHEN 'dorso_nariz'        THEN 'dorso nasal'
    WHEN 'ponta_nariz'        THEN 'ponta do nariz'
    WHEN 'mento'              THEN 'mento (queixo)'
    WHEN 'papada'             THEN 'papada'
    ELSE p_key
  END;
$$;

CREATE OR REPLACE FUNCTION public._aq_area_protocol(p_key text)
RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_key
    WHEN 'testa'              THEN 'Toxina botulínica nas linhas frontais'
    WHEN 'entre_sobrancelhas' THEN 'Toxina botulínica na linha do leão'
    WHEN 'pe_de_galinha'      THEN 'Toxina botulínica no canto dos olhos'
    WHEN 'olheiras'           THEN 'Smooth Eyes (laser fracionado + AH)'
    WHEN 'bochechas'          THEN 'Volumização com AH na zigomática'
    WHEN 'bigode_chines'      THEN 'Preenchimento do sulco nasogeniano com AH'
    WHEN 'codigo_barras'      THEN 'Toxina + AH nas linhas verticais do lábio'
    WHEN 'labios'             THEN 'Preenchimento dos lábios com AH'
    WHEN 'linha_marionete'    THEN 'Preenchimento das comissuras labiais com AH'
    WHEN 'bulldog'            THEN 'AH + Bioestimulador + Bioremodelador + Fotona 4D'
    WHEN 'mandibular'         THEN 'Contorno mandibular com AH'
    WHEN 'dorso_nariz'        THEN 'Rinomodelação · AH no dorso'
    WHEN 'ponta_nariz'        THEN 'Rinomodelação · projeção da ponta'
    WHEN 'mento'              THEN 'Mentoplastia injetável com AH'
    WHEN 'papada'             THEN 'Fotona 4D'
    ELSE 'Avaliação personalizada'
  END;
$$;

-- Top 2 queixas weighted · retorna array de objetos {key,label,protocol,weight}
CREATE OR REPLACE FUNCTION public._aq_top_complaints(p_areas text[])
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'key', area,
      'label', _aq_area_label(area),
      'protocol', _aq_area_protocol(area),
      'weight', _aq_area_weight(area)
    ) ORDER BY _aq_area_weight(area) DESC, area
  ), '[]'::jsonb)
  FROM (
    SELECT area FROM unnest(p_areas) AS t(area)
    ORDER BY _aq_area_weight(area) DESC, area
    LIMIT 2
  ) s;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 4. Lookup do lifecycle do telefone
-- Defensivo: try patients, then appointments futuros, then leads.
-- Usa right(8) match (memória do sistema).
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._aq_lookup_lifecycle(p_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_p8     text := right(regexp_replace(coalesce(p_phone,''), '\D', '', 'g'), 8);
  v_pat    record;
  v_appt   record;
  v_lead   record;
BEGIN
  IF v_p8 = '' OR length(v_p8) < 8 THEN
    RETURN jsonb_build_object('status','novo');
  END IF;

  -- 1) Paciente ativo (já tem prontuário/procedimento)
  BEGIN
    EXECUTE format($q$
      SELECT id, COALESCE(name,'') AS name
      FROM public.patients
      WHERE right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 8) = $1
      LIMIT 1
    $q$) INTO v_pat USING v_p8;
    IF v_pat.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status','paciente_ativo',
        'patient_id', v_pat.id,
        'name', v_pat.name
      );
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- 2) Agendamento futuro confirmado/agendado
  BEGIN
    EXECUTE format($q$
      SELECT id, scheduled_for, COALESCE(name,'') AS name
      FROM public.appointments
      WHERE right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 8) = $1
        AND scheduled_for > now()
        AND COALESCE(status,'') NOT IN ('cancelado','cancelled','no_show','removed')
      ORDER BY scheduled_for ASC
      LIMIT 1
    $q$) INTO v_appt USING v_p8;
    IF v_appt.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status','agendado_futuro',
        'appointment_id', v_appt.id,
        'scheduled_for', v_appt.scheduled_for,
        'name', v_appt.name
      );
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- 3) Lead existente (qualquer status · leads tem temperature/phase)
  BEGIN
    EXECUTE format($q$
      SELECT id, COALESCE(name,'') AS name, COALESCE(phase,'') AS phase, COALESCE(temperature,'') AS temperature
      FROM public.leads
      WHERE right(regexp_replace(coalesce(phone,''), '\D', '', 'g'), 8) = $1
        AND deleted_at IS NULL
      ORDER BY updated_at DESC NULLS LAST, created_at DESC
      LIMIT 1
    $q$) INTO v_lead USING v_p8;
    IF v_lead.id IS NOT NULL THEN
      -- Se phase = 'orcamento', categoriza separado
      IF v_lead.phase = 'orcamento' OR v_lead.temperature = 'orcamento' THEN
        RETURN jsonb_build_object(
          'status','orcamento_aberto',
          'lead_id', v_lead.id,
          'name', v_lead.name,
          'phase', v_lead.phase,
          'temperature', v_lead.temperature
        );
      END IF;
      RETURN jsonb_build_object(
        'status','lead_existente',
        'lead_id', v_lead.id,
        'name', v_lead.name,
        'phase', v_lead.phase,
        'temperature', v_lead.temperature
      );
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN NULL;
  END;

  -- 4) Não existe = novo
  RETURN jsonb_build_object('status','novo');
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 5. Orquestrador · chamado pelo trigger
-- Decide template_key + monta context + insere em dispatch
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.process_anatomy_quiz_lead(p_lp_lead_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_lead       record;
  v_phone      text;
  v_phone8     text;
  v_areas_arr  text[];
  v_complaints jsonb;
  v_lifecycle  jsonb;
  v_status     text;
  v_template   text;
  v_recent     int := 0;
  v_dispatch_id uuid;
BEGIN
  SELECT id, name, phone, meta INTO v_lead
  FROM public.lp_leads
  WHERE id = p_lp_lead_id;

  IF v_lead.id IS NULL THEN RETURN NULL; END IF;
  IF coalesce(v_lead.meta->>'source','') <> 'anatomy_quiz' THEN RETURN NULL; END IF;

  v_phone  := regexp_replace(coalesce(v_lead.phone,''), '\D', '', 'g');
  v_phone8 := right(v_phone, 8);
  IF length(v_phone8) < 8 THEN RETURN NULL; END IF;

  -- Areas do quiz
  SELECT array_agg(value::text) INTO v_areas_arr
  FROM jsonb_array_elements_text(coalesce(v_lead.meta->'anatomy'->'areas', '[]'::jsonb));
  IF v_areas_arr IS NULL OR array_length(v_areas_arr,1) IS NULL THEN
    v_areas_arr := ARRAY[]::text[];
  END IF;
  v_complaints := _aq_top_complaints(v_areas_arr);

  -- Lookup lifecycle
  v_lifecycle := _aq_lookup_lifecycle(v_phone);
  v_status := v_lifecycle->>'status';

  -- Anti-spam: requiz < 24h?
  SELECT count(*) INTO v_recent
  FROM public.anatomy_quiz_lara_dispatch
  WHERE phone = v_phone
    AND created_at > now() - interval '24 hours'
    AND status IN ('pending','dispatched');
  IF v_recent > 0 THEN
    v_template := 'aq_requiz_recente';
  ELSE
    v_template := CASE v_status
      WHEN 'paciente_ativo'    THEN 'aq_paciente_ativo'
      WHEN 'agendado_futuro'   THEN 'aq_agendado_futuro'
      WHEN 'orcamento_aberto'  THEN 'aq_orcamento_aberto'
      WHEN 'lead_existente'    THEN 'aq_lead_frio'
      ELSE                          'aq_novo_lead'
    END;
  END IF;

  -- Insere dispatch · n8n consome
  INSERT INTO public.anatomy_quiz_lara_dispatch (
    lp_lead_id, phone, phone_raw, name,
    template_key, lifecycle, queixas, context
  ) VALUES (
    v_lead.id, v_phone, v_lead.phone, coalesce(v_lead.name,''),
    v_template,
    v_status,
    v_complaints,
    jsonb_build_object(
      'lifecycle', v_lifecycle,
      'all_areas', to_jsonb(v_areas_arr),
      'requiz_count', v_recent
    )
  ) RETURNING id INTO v_dispatch_id;

  RETURN v_dispatch_id;
END;
$$;

-- ─────────────────────────────────────────────────────────────────
-- 6. Trigger AFTER INSERT em lp_leads
-- ─────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._tr_anatomy_quiz_dispatch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF coalesce(NEW.meta->>'source','') = 'anatomy_quiz' THEN
    PERFORM public.process_anatomy_quiz_lead(NEW.id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_anatomy_quiz_dispatch ON public.lp_leads;
CREATE TRIGGER trg_anatomy_quiz_dispatch
  AFTER INSERT ON public.lp_leads
  FOR EACH ROW
  EXECUTE FUNCTION public._tr_anatomy_quiz_dispatch();

-- ─────────────────────────────────────────────────────────────────
-- 7. RLS · permite anon ler dispatch via service role só
-- ─────────────────────────────────────────────────────────────────
ALTER TABLE public.anatomy_quiz_proof_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anatomy_quiz_lara_dispatch ENABLE ROW LEVEL SECURITY;

-- Policy: leitura proof_photos pública (são fotos pra LP)
DROP POLICY IF EXISTS aq_proof_select_anon ON public.anatomy_quiz_proof_photos;
CREATE POLICY aq_proof_select_anon ON public.anatomy_quiz_proof_photos
  FOR SELECT USING (active = true);

-- Policy: dispatch só service_role lê/escreve (n8n usa service_role)
-- (sem policy = bloqueado pra anon · service role bypass RLS)

-- ─────────────────────────────────────────────────────────────────
-- DONE
-- ─────────────────────────────────────────────────────────────────
COMMENT ON FUNCTION public.process_anatomy_quiz_lead IS
  'Orquestrador anatomy quiz → dispatch Lara. Chama _aq_lookup_lifecycle + _aq_top_complaints. Anti-spam 24h.';
