-- ============================================================
-- Migration: VPI Card Opens Tracking (Fase 8 - Entrega 3)
--
-- Rastrear aberturas do cartao (quando visitante acessa URL direta
-- sem passar pelo short-link). Enriquece score de engajamento.
--
-- Itens:
--   1. Colunas em vpi_partners: aberturas_count, ultima_abertura_em,
--      aberturas_mes_cache
--   2. RPC publica vpi_pub_track_card_open(p_token) — anon
--      - incrementa contadores
--      - registra audit log (historico temporal para 30d sliding)
--   3. Funcao _vpi_refresh_aberturas_mes(partner_id) recalcula cache
--   4. Score engajamento: clicks*20 + aberturas_mes*10 (cap 100)
--
-- Idempotente: IF NOT EXISTS + CREATE OR REPLACE.
-- ============================================================

-- ── 1. Colunas em vpi_partners ──────────────────────────────
ALTER TABLE public.vpi_partners
  ADD COLUMN IF NOT EXISTS aberturas_count       int         NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ultima_abertura_em    timestamptz,
  ADD COLUMN IF NOT EXISTS aberturas_mes_cache   int         NOT NULL DEFAULT 0;

-- ── 2. RPC publica: registra abertura ────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_pub_track_card_open(
  p_token text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner record;
BEGIN
  IF p_token IS NULL OR length(p_token) < 6 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bad_token');
  END IF;

  SELECT id, clinic_id INTO v_partner
    FROM public.vpi_partners
   WHERE card_token = p_token
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;

  UPDATE public.vpi_partners
     SET aberturas_count    = COALESCE(aberturas_count, 0) + 1,
         ultima_abertura_em = now(),
         aberturas_mes_cache = CASE
           WHEN ultima_abertura_em IS NULL
                OR date_trunc('month', ultima_abertura_em) < date_trunc('month', now())
             THEN 1
           ELSE COALESCE(aberturas_mes_cache, 0) + 1
         END,
         updated_at         = now()
   WHERE id = v_partner.id;

  -- Audit log pra historico temporal (permite sliding 30d no futuro)
  BEGIN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (
      v_partner.clinic_id, 'card_opened', 'partner', v_partner.id::text,
      jsonb_build_object('token_suffix', right(p_token, 4))
    );
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object('ok', true);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_pub_track_card_open(text) TO anon, authenticated;

-- ── 3. Funcao auxiliar: recalcula cache mensal ──────────────
CREATE OR REPLACE FUNCTION public._vpi_refresh_aberturas_mes(
  p_partner_id uuid
) RETURNS int
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_count int := 0;
BEGIN
  SELECT COUNT(*)::int INTO v_count
    FROM public.vpi_audit_log
   WHERE entity_type = 'partner'
     AND entity_id   = p_partner_id::text
     AND action      = 'card_opened'
     AND created_at  >= date_trunc('month', now());

  UPDATE public.vpi_partners
     SET aberturas_mes_cache = v_count
   WHERE id = p_partner_id;

  RETURN v_count;
END $$;

GRANT EXECUTE ON FUNCTION public._vpi_refresh_aberturas_mes(uuid) TO authenticated;

-- ── 4. Atualizar score engajamento pra usar aberturas ───────
CREATE OR REPLACE FUNCTION public.vpi_partner_compute_score(
  p_partner_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id     uuid;
  v_p             record;
  v_sum_cred_90   int;
  v_clicks_30     int := 0;
  v_aberturas_mes int := 0;
  v_sc_prod       int;
  v_sc_eng        int;
  v_sc_rec        int;
  v_sc_cad        int;
  v_sc_cri        int;
  v_sc_total      int;
  v_classe        text;
  v_alertas       jsonb;
  v_campos_total  int := 6;
  v_campos        int := 0;
  v_missing       text[];
  v_campos_faltam text;
  v_criterio      int;
  v_last_closed   timestamptz;
  v_days_sem_ind  int;
BEGIN
  v_clinic_id := '00000000-0000-0000-0000-000000000001'::uuid;

  SELECT * INTO v_p FROM public.vpi_partners
   WHERE id = p_partner_id AND clinic_id = v_clinic_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'partner_not_found');
  END IF;

  -- Produtividade
  SELECT COALESCE(SUM(i.creditos), 0)::int INTO v_sum_cred_90
    FROM public.vpi_indications i
   WHERE i.partner_id = v_p.id
     AND i.clinic_id  = v_clinic_id
     AND i.status     = 'closed'
     AND i.fechada_em >= now() - interval '90 days';

  v_sc_prod := LEAST(100, GREATEST(0, v_sum_cred_90 * 5));

  -- Engajamento: clicks + aberturas_mes
  BEGIN
    IF COALESCE(v_p.short_link_slug, '') <> '' THEN
      SELECT COALESCE(SUM(sl.clicks), 0)::int INTO v_clicks_30
        FROM public.short_links sl
       WHERE sl.clinic_id = v_clinic_id
         AND sl.code      = v_p.short_link_slug
         AND sl.created_at >= now() - interval '90 days';
    END IF;
  EXCEPTION WHEN undefined_table OR undefined_column THEN
    v_clicks_30 := 0;
  END;

  v_aberturas_mes := COALESCE(v_p.aberturas_mes_cache, 0);
  -- Formula: clicks * 20 + aberturas_mes * 10, cap 100
  v_sc_eng := LEAST(100, GREATEST(0, v_clicks_30 * 20 + v_aberturas_mes * 10));

  -- Recorrencia
  v_sc_rec := LEAST(100, GREATEST(0, COALESCE(v_p.streak_meses, 0) * 10));

  -- Cadastro
  v_campos := 0;
  v_missing := ARRAY[]::text[];
  IF COALESCE(v_p.nome, '')      <> '' THEN v_campos := v_campos + 1; ELSE v_missing := array_append(v_missing, 'nome'); END IF;
  IF COALESCE(v_p.phone, '')     <> '' THEN v_campos := v_campos + 1; ELSE v_missing := array_append(v_missing, 'telefone'); END IF;
  IF COALESCE(v_p.cidade, '')    <> '' THEN v_campos := v_campos + 1; ELSE v_missing := array_append(v_missing, 'cidade'); END IF;
  IF COALESCE(v_p.estado, '')    <> '' THEN v_campos := v_campos + 1; ELSE v_missing := array_append(v_missing, 'estado'); END IF;
  IF COALESCE(v_p.profissao, '') <> '' THEN v_campos := v_campos + 1; ELSE v_missing := array_append(v_missing, 'profissao'); END IF;
  IF COALESCE(v_p.avatar_url, '')<> '' THEN v_campos := v_campos + 1; ELSE v_missing := array_append(v_missing, 'avatar'); END IF;
  v_sc_cad := (v_campos::numeric / v_campos_total::numeric * 100)::int;
  v_campos_faltam := array_to_string(v_missing, ', ');

  -- Criterio de entrada: injetavel 12m
  IF EXISTS (
    SELECT 1 FROM public.appointments a
     WHERE a.clinic_id = v_clinic_id
       AND a.deleted_at IS NULL
       AND a.scheduled_date >= (CURRENT_DATE - interval '365 days')
       AND COALESCE(a.status, '') IN ('completed', 'concluido', 'finalizado', 'presente', 'atendido')
       AND (
         right(regexp_replace(COALESCE(a.patient_phone, ''), '\D', '', 'g'), 8)
           = right(regexp_replace(COALESCE(v_p.phone, ''), '\D', '', 'g'), 8)
         AND length(regexp_replace(COALESCE(v_p.phone, ''), '\D', '', 'g')) >= 8
       )
       AND (
         lower(COALESCE(a.procedure_name, '')) LIKE '%botox%'
         OR lower(COALESCE(a.procedure_name, '')) LIKE '%toxina%'
         OR lower(COALESCE(a.procedure_name, '')) LIKE '%hialuron%'
         OR EXISTS (
           SELECT 1 FROM jsonb_array_elements(COALESCE(a.procedimentos, '[]'::jsonb)) x
            WHERE lower(COALESCE(x->>'nome', '')) LIKE '%botox%'
               OR lower(COALESCE(x->>'nome', '')) LIKE '%toxina%'
               OR lower(COALESCE(x->>'nome', '')) LIKE '%hialuron%'
         )
       )
  ) THEN
    v_sc_cri  := 100;
    v_criterio := 1;
  ELSE
    v_sc_cri  := 0;
    v_criterio := 0;
  END IF;

  SELECT MAX(i.fechada_em) INTO v_last_closed
    FROM public.vpi_indications i
   WHERE i.partner_id = v_p.id AND i.status = 'closed';
  IF v_last_closed IS NOT NULL THEN
    v_days_sem_ind := EXTRACT(DAY FROM (now() - v_last_closed))::int;
  END IF;

  v_sc_total := ROUND(
    v_sc_prod * 0.40 +
    v_sc_eng  * 0.25 +
    v_sc_rec  * 0.15 +
    v_sc_cad  * 0.10 +
    v_sc_cri  * 0.10
  )::int;

  v_classe := CASE
    WHEN v_sc_total >= 80 THEN 'diamante'
    WHEN v_sc_total >= 60 THEN 'quente'
    WHEN v_sc_total >= 40 THEN 'morna'
    WHEN v_sc_total >= 20 THEN 'fria'
    ELSE                       'dormente'
  END;

  v_alertas := '[]'::jsonb;

  IF v_sc_cad < 70 THEN
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object(
      'tipo',  'cadastro_incompleto',
      'texto', 'Faltam campos: ' || COALESCE(NULLIF(v_campos_faltam, ''), '—'),
      'cor',   'orange'
    ));
  END IF;

  IF v_sc_cri = 0 THEN
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object(
      'tipo',  'criterio_expirado',
      'texto', 'Nao fez injetavel ha 12m — reativar',
      'cor',   'red',
      'cta',   jsonb_build_object('label', 'Enviar WA reativacao', 'action', 'vpi_send_reativacao')
    ));
  END IF;

  IF v_days_sem_ind >= 30 AND v_last_closed IS NOT NULL THEN
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object(
      'tipo',  'dormente',
      'texto', v_days_sem_ind::text || ' dias sem indicar',
      'cor',   'yellow'
    ));
  END IF;

  IF COALESCE(v_p.streak_meses, 0) >= 3 THEN
    v_alertas := v_alertas || jsonb_build_array(jsonb_build_object(
      'tipo',  'em_crescimento',
      'texto', COALESCE(v_p.streak_meses, 0)::text || ' meses consecutivos',
      'cor',   'green'
    ));
  END IF;

  UPDATE public.vpi_partners
     SET score_total            = v_sc_total,
         score_produtividade    = v_sc_prod,
         score_engajamento      = v_sc_eng,
         score_recorrencia      = v_sc_rec,
         score_cadastro         = v_sc_cad,
         score_criterio_entrada = v_sc_cri,
         score_classe           = v_classe,
         alertas                = v_alertas,
         score_atualizado_em    = now()
   WHERE id = v_p.id;

  RETURN jsonb_build_object(
    'ok',                     true,
    'partner_id',             v_p.id,
    'score_total',            v_sc_total,
    'score_produtividade',    v_sc_prod,
    'score_engajamento',      v_sc_eng,
    'score_recorrencia',      v_sc_rec,
    'score_cadastro',         v_sc_cad,
    'score_criterio_entrada', v_sc_cri,
    'score_classe',           v_classe,
    'alertas',                v_alertas,
    'aberturas_mes',          v_aberturas_mes,
    'clicks_30',              v_clicks_30
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_partner_compute_score(uuid) TO authenticated;

-- ── 5. RPC mini stats pra UI admin ──────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_mini_stats()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id      uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_aberturas_mes  int  := 0;
  v_shares_mes     int  := 0;
  v_pending        int  := 0;
BEGIN
  -- Aberturas do mes: count no audit log
  BEGIN
    SELECT COUNT(*)::int INTO v_aberturas_mes
      FROM public.vpi_audit_log
     WHERE clinic_id = v_clinic_id
       AND action    = 'card_opened'
       AND created_at >= date_trunc('month', now());
  EXCEPTION WHEN OTHERS THEN v_aberturas_mes := 0; END;

  -- Compartilhamentos do mes
  BEGIN
    SELECT COUNT(*)::int INTO v_shares_mes
      FROM public.vpi_audit_log
     WHERE clinic_id = v_clinic_id
       AND action IN ('card_shared', 'share_story', 'public_share')
       AND created_at >= date_trunc('month', now());
  EXCEPTION WHEN OTHERS THEN v_shares_mes := 0; END;

  -- Indicacoes pending
  BEGIN
    SELECT COUNT(*)::int INTO v_pending
      FROM public.vpi_indications
     WHERE clinic_id = v_clinic_id
       AND status    = 'pending_close';
  EXCEPTION WHEN OTHERS THEN v_pending := 0; END;

  RETURN jsonb_build_object(
    'aberturas_mes',          v_aberturas_mes,
    'compartilhamentos_mes',  v_shares_mes,
    'ind_pending',            v_pending
  );
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_mini_stats() TO authenticated;

COMMENT ON FUNCTION public.vpi_pub_track_card_open(text) IS
  'Registra abertura do cartao publico. Throttle 1/sessao no client. Audit log cria historico temporal. Fase 8 Entrega 3.';
COMMENT ON FUNCTION public.vpi_mini_stats() IS
  'KPIs secundarios da pagina admin: aberturas mes, compartilhamentos mes, ind. pending. Fase 8 Entrega 3.';
