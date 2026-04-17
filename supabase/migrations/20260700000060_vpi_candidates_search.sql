-- ============================================================
-- Migration: VPI Candidates Search (Fase 6 - Entrega 1)
--
-- RPC vpi_search_candidates(p_query, p_limit) — busca em leads
-- e patients por nome/phone, retornando candidatos unificados pra
-- pre-preencher o modal "Novo Parceiro" sem redigitacao. Previne
-- duplicidade ao ja indicar se a pessoa ja e partner e se fez
-- injetavel nos ultimos 12m (criterio de entrada no programa).
--
-- Regras:
--   - match por right(phone, 8) (padrao clinica) OU ilike nome
--   - ordem: tel exato primeiro, depois nome comeca com, depois contem
--   - is_already_partner: existe em vpi_partners por telefone
--   - has_injetavel_12m: appointment ou appt.procedimentos jsonb
--     com nome LIKE '%botox%' | '%hialuron%' | '%toxina%' | '%ah%'
--     nos ultimos 365 dias e status in ('completed','concluido','finalizado','presente')
--
-- Idempotente: CREATE OR REPLACE, GRANT seguro.
-- ============================================================

CREATE OR REPLACE FUNCTION public.vpi_search_candidates(
  p_query text,
  p_limit int DEFAULT 15
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_q_norm    text;
  v_q_like    text;
  v_q_digits  text;
  v_q_tail    text;
  v_lim       int := GREATEST(1, LEAST(COALESCE(p_limit, 15), 50));
  v_out       jsonb;
BEGIN
  v_q_norm   := TRIM(COALESCE(p_query, ''));
  IF length(v_q_norm) < 2 THEN
    RETURN '[]'::jsonb;
  END IF;

  v_q_like   := '%' || v_q_norm || '%';
  v_q_digits := regexp_replace(v_q_norm, '\D', '', 'g');
  v_q_tail   := CASE WHEN length(v_q_digits) >= 4 THEN right(v_q_digits, 8) ELSE NULL END;

  WITH
  -- ── Leads ──────────────────────────────────────────────
  from_leads AS (
    SELECT
      'lead'::text  AS source,
      l.id::text    AS id,
      l.name        AS nome,
      l.phone       AS phone,
      NULL::text    AS cidade,
      NULL::text    AS estado,
      l.profissao   AS profissao,
      -- priority score
      CASE
        WHEN v_q_tail IS NOT NULL AND right(regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g'), 8) = v_q_tail THEN 100
        WHEN lower(COALESCE(l.name, '')) LIKE lower(v_q_norm || '%') THEN 80
        WHEN lower(COALESCE(l.name, '')) LIKE lower(v_q_like)        THEN 60
        ELSE 40
      END AS _score
      FROM public.leads l
     WHERE l.clinic_id = v_clinic_id
       AND COALESCE(l.deleted_at, NULL) IS NULL
       AND (
         (v_q_tail IS NOT NULL AND right(regexp_replace(COALESCE(l.phone, ''), '\D', '', 'g'), 8) = v_q_tail)
         OR lower(COALESCE(l.name, '')) LIKE lower(v_q_like)
       )
     LIMIT 40
  ),
  -- ── Patients ───────────────────────────────────────────
  from_patients AS (
    SELECT
      'patient'::text AS source,
      p.id::text      AS id,
      p.name          AS nome,
      p.phone         AS phone,
      COALESCE(p.address_json->>'cidade', NULL) AS cidade,
      COALESCE(p.address_json->>'estado', NULL) AS estado,
      NULL::text      AS profissao,
      CASE
        WHEN v_q_tail IS NOT NULL AND right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 8) = v_q_tail THEN 110
        WHEN lower(COALESCE(p.name, '')) LIKE lower(v_q_norm || '%') THEN 90
        WHEN lower(COALESCE(p.name, '')) LIKE lower(v_q_like)        THEN 70
        ELSE 50
      END AS _score
      FROM public.patients p
     WHERE p.clinic_id = v_clinic_id
       AND p.deleted_at IS NULL
       AND (
         (v_q_tail IS NOT NULL AND right(regexp_replace(COALESCE(p.phone, ''), '\D', '', 'g'), 8) = v_q_tail)
         OR lower(COALESCE(p.name, '')) LIKE lower(v_q_like)
       )
     LIMIT 40
  ),
  unified AS (
    SELECT * FROM from_leads
    UNION ALL
    SELECT * FROM from_patients
  ),
  -- Remove duplicatas (mesmo telefone em lead+patient): prefere patient
  dedup AS (
    SELECT DISTINCT ON (right(regexp_replace(COALESCE(phone, id), '\D', '', 'g'), 8))
           source, id, nome, phone, cidade, estado, profissao, _score
      FROM unified
     ORDER BY right(regexp_replace(COALESCE(phone, id), '\D', '', 'g'), 8),
              CASE source WHEN 'patient' THEN 0 ELSE 1 END,
              _score DESC
  ),
  enriched AS (
    SELECT
      d.*,
      EXISTS (
        SELECT 1 FROM public.vpi_partners vp
         WHERE vp.clinic_id = v_clinic_id
           AND right(regexp_replace(COALESCE(vp.phone, ''), '\D', '', 'g'), 8)
               = right(regexp_replace(COALESCE(d.phone, ''), '\D', '', 'g'), 8)
           AND length(regexp_replace(COALESCE(d.phone, ''), '\D', '', 'g')) >= 8
      ) AS is_already_partner,
      EXISTS (
        SELECT 1 FROM public.appointments a
         WHERE a.clinic_id = v_clinic_id
           AND a.deleted_at IS NULL
           AND a.scheduled_date >= (CURRENT_DATE - interval '365 days')
           AND COALESCE(a.status, '') IN ('completed', 'concluido', 'finalizado', 'presente', 'atendido')
           AND (
             -- match por patient_id se tiver
             (d.source = 'patient' AND a.patient_id::text = d.id)
             OR
             -- match por telefone (fallback)
             right(regexp_replace(COALESCE(a.patient_phone, ''), '\D', '', 'g'), 8)
               = right(regexp_replace(COALESCE(d.phone, ''), '\D', '', 'g'), 8)
           )
           AND (
             lower(COALESCE(a.procedure_name, '')) LIKE '%botox%'
             OR lower(COALESCE(a.procedure_name, '')) LIKE '%toxina%'
             OR lower(COALESCE(a.procedure_name, '')) LIKE '%hialuron%'
             OR lower(COALESCE(a.procedure_name, '')) LIKE '%ac hial%'
             OR lower(COALESCE(a.procedure_name, '')) LIKE '%ah %'
             OR lower(COALESCE(a.procedure_name, ''))  = 'ah'
             OR EXISTS (
               SELECT 1 FROM jsonb_array_elements(COALESCE(a.procedimentos, '[]'::jsonb)) x
                WHERE lower(COALESCE(x->>'nome', '')) LIKE '%botox%'
                   OR lower(COALESCE(x->>'nome', '')) LIKE '%toxina%'
                   OR lower(COALESCE(x->>'nome', '')) LIKE '%hialuron%'
                   OR lower(COALESCE(x->>'nome', '')) LIKE '%ac hial%'
                   OR lower(COALESCE(x->>'nome', '')) LIKE '%ah %'
             )
           )
      ) AS has_injetavel_12m
    FROM dedup d
  )
  SELECT COALESCE(jsonb_agg(row_to_json(r.*)), '[]'::jsonb) INTO v_out
    FROM (
      SELECT source, id, nome, phone, cidade, estado, profissao,
             is_already_partner, has_injetavel_12m
        FROM enriched
       ORDER BY _score DESC, length(COALESCE(nome, '')) ASC
       LIMIT v_lim
    ) r;

  RETURN COALESCE(v_out, '[]'::jsonb);
END $$;

GRANT EXECUTE ON FUNCTION public.vpi_search_candidates(text, int) TO anon;
GRANT EXECUTE ON FUNCTION public.vpi_search_candidates(text, int) TO authenticated;

-- ── Sanity ──────────────────────────────────────────────────
DO $$
DECLARE v_cnt int;
BEGIN
  SELECT COUNT(*) INTO v_cnt
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
   WHERE n.nspname='public' AND p.proname='vpi_search_candidates';
  RAISE NOTICE '[vpi_search_candidates] registered=%', v_cnt;
END $$;
