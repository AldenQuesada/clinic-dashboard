-- ============================================================
-- Migration: NPS Testimonial → Magazine Bridge
--
-- Story: s2-4 do Plano de Growth (2026-04-18)
--
-- Reutiliza `_vpi_revista_ensure_edition` (da migration 120) pra
-- garantir edicao draft e insere 1 pagina t08_feature_fullbleed com
-- depoimento do paciente. Admin aprova depois no editor da revista.
--
-- Componentes:
--   1) Coluna nps_responses.magazine_page_id (tracking anti-duplicata)
--   2) RPC nps_testimonial_to_magazine(p_nps_id) — insere pagina
--
-- Regras:
--   - testimonial_consent deve ser true
--   - testimonial_text nao pode ser null/vazio
--   - se ja inserido antes (magazine_page_id != null), retorna existente
--
-- Idempotente. SECURITY DEFINER (bypass RLS pra admin).
-- ============================================================

-- Tracking: qual pagina da revista esse depoimento virou
ALTER TABLE public.nps_responses
  ADD COLUMN IF NOT EXISTS magazine_page_id uuid NULL
  REFERENCES public.magazine_pages(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_nps_magazine_page
  ON public.nps_responses (magazine_page_id)
  WHERE magazine_page_id IS NOT NULL;

-- ============================================================
-- RPC: nps_testimonial_to_magazine
-- ============================================================
CREATE OR REPLACE FUNCTION public.nps_testimonial_to_magazine(
  p_nps_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id    uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_nps          public.nps_responses%ROWTYPE;
  v_patient_name text;
  v_first_name   text;
  v_edition_id   uuid;
  v_page_id      uuid;
  v_next_order   int;
  v_slots        jsonb;
  v_titulo       text;
  v_lede         text;
  v_overlay      text := 'rgba(0,0,0,0.75)';
BEGIN
  SELECT * INTO v_nps FROM public.nps_responses WHERE id = p_nps_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'nps_not_found');
  END IF;

  IF COALESCE(v_nps.testimonial_consent, false) = false THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_consent');
  END IF;

  IF v_nps.testimonial_text IS NULL OR length(trim(v_nps.testimonial_text)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'empty_testimonial');
  END IF;

  -- Idempotencia: se ja foi adicionada, retorna existente
  IF v_nps.magazine_page_id IS NOT NULL THEN
    SELECT edition_id INTO v_edition_id
      FROM public.magazine_pages WHERE id = v_nps.magazine_page_id;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true,
        'already_existed', true,
        'page_id', v_nps.magazine_page_id,
        'edition_id', v_edition_id
      );
    END IF;
    -- page foi deletada, limpa tracking e prossegue criando nova
    UPDATE public.nps_responses SET magazine_page_id = NULL WHERE id = p_nps_id;
  END IF;

  -- Busca nome do paciente via appointments (preferencial)
  SELECT COALESCE(NULLIF(trim(pacienteNome), ''), 'Paciente')
    INTO v_patient_name
    FROM public.appointments
   WHERE id = v_nps.appt_id
   LIMIT 1;
  v_patient_name := COALESCE(v_patient_name, 'Paciente');
  v_first_name   := split_part(v_patient_name, ' ', 1);

  -- Garante edicao draft (helper ja existe da migration 120)
  v_edition_id := public._vpi_revista_ensure_edition(v_clinic_id);

  -- Preenche slots do t08_feature_fullbleed
  v_titulo := initcap(v_first_name);
  -- Se testimonial > 160, trunca com reticencias (respeitando limite do template)
  v_lede := v_nps.testimonial_text;
  IF length(v_lede) > 157 THEN
    v_lede := substr(v_lede, 1, 154) || '...';
  END IF;

  v_slots := jsonb_build_object(
    'titulo',        v_titulo,
    'foto_full',     COALESCE(v_nps.testimonial_photo_url, ''),
    'lede',          v_lede,
    'overlay_color', v_overlay
  );

  -- Proximo order_index da edicao
  SELECT COALESCE(MAX(order_index), -1) + 1 INTO v_next_order
    FROM public.magazine_pages
   WHERE edition_id = v_edition_id;

  -- Insere pagina draft
  INSERT INTO public.magazine_pages (edition_id, order_index, template_slug, slots, segment_scope)
  VALUES (v_edition_id, v_next_order, 't08_feature_fullbleed', v_slots, ARRAY['vip','active','general']::text[])
  RETURNING id INTO v_page_id;

  -- Persiste tracking
  UPDATE public.nps_responses
     SET magazine_page_id = v_page_id
   WHERE id = p_nps_id;

  -- Audit (best-effort)
  BEGIN
    INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
    VALUES (v_clinic_id, 'nps_testimonial_to_magazine', 'nps_response', p_nps_id::text,
            jsonb_build_object(
              'page_id', v_page_id,
              'edition_id', v_edition_id,
              'score', v_nps.score,
              'has_photo', v_nps.testimonial_photo_url IS NOT NULL
            ));
  EXCEPTION WHEN OTHERS THEN NULL; END;

  RETURN jsonb_build_object(
    'ok', true,
    'already_existed', false,
    'page_id', v_page_id,
    'edition_id', v_edition_id,
    'order_index', v_next_order,
    'template_slug', 't08_feature_fullbleed'
  );
END $$;

GRANT EXECUTE ON FUNCTION public.nps_testimonial_to_magazine(uuid)
  TO anon, authenticated, service_role;

-- ============================================================
-- Extensao: nps_testimonials_consented agora retorna magazine_page_id
-- (pra UI mostrar badge "ja na revista")
-- ============================================================
CREATE OR REPLACE FUNCTION public.nps_testimonials_consented(
  p_limit int DEFAULT 20
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_clinic_id uuid := '00000000-0000-0000-0000-000000000001'::uuid;
  v_out jsonb;
BEGIN
  SELECT COALESCE(jsonb_agg(row_to_json(q.*) ORDER BY q.created_at DESC), '[]'::jsonb)
    INTO v_out
    FROM (
      SELECT r.id, r.appt_id, r.lead_id, r.phone_suffix, r.score,
             r.testimonial_text, r.testimonial_photo_url,
             r.testimonial_consent_at, r.created_at,
             r.magazine_page_id,
             l.name AS lead_name
        FROM public.nps_responses r
        LEFT JOIN public.clinic_leads l ON l.id = r.lead_id
       WHERE r.clinic_id = v_clinic_id
         AND r.testimonial_consent = true
       ORDER BY r.testimonial_consent_at DESC NULLS LAST, r.created_at DESC
       LIMIT GREATEST(1, p_limit)
    ) q;

  RETURN COALESCE(v_out, '[]'::jsonb);
EXCEPTION
  WHEN undefined_table THEN
    RETURN '[]'::jsonb;
END $$;

GRANT EXECUTE ON FUNCTION public.nps_testimonials_consented(int)
  TO anon, authenticated, service_role;
