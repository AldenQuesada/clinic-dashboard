-- ============================================================================
-- Beauty & Health Magazine — Brief Auto-Edition (B2)
-- ============================================================================
-- RPC magazine_brief_process: dado um brief_id, orquestra chamada a Edge
-- Function magazine-brief-to-edition (via http extension ou netcall),
-- recebe o plano de paginas, valida cada uma com magazine_validate_section,
-- e cria edicao + paginas na ordem retornada.
--
-- Observacao: a chamada HTTP pro edge function eh feita client-side pelo
-- intake (magazine-intake.html) e o plano retornado eh enviado pra esta RPC
-- via magazine_brief_apply_plan(brief_id, plan_jsonb). Assim evitamos
-- dependencia de http extension no Supabase (nem sempre disponivel).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1) RPC magazine_brief_apply_plan — aplica plano gerado pelo AI
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_brief_apply_plan(
  p_brief_id uuid,
  p_plan     jsonb  -- {pages: [{template_slug, slots}]}
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_brief public.magazine_briefs%ROWTYPE;
  v_edition_id uuid;
  v_page jsonb;
  v_validation jsonb;
  v_pages_created int := 0;
  v_warnings jsonb := '[]'::jsonb;
  v_errors jsonb := '[]'::jsonb;
  v_title text;
  v_slug text;
  v_month text;
BEGIN
  -- Carrega brief
  SELECT * INTO v_brief FROM public.magazine_briefs
   WHERE id = p_brief_id AND clinic_id = v_clinic_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Brief nao encontrado ou sem permissao';
  END IF;

  IF jsonb_typeof(p_plan->'pages') <> 'array' THEN
    RAISE EXCEPTION 'plan.pages deve ser array';
  END IF;

  IF jsonb_array_length(p_plan->'pages') < 3 THEN
    RAISE EXCEPTION 'plan deve ter >= 3 paginas (recebido: %)', jsonb_array_length(p_plan->'pages');
  END IF;

  -- Marca processing
  UPDATE public.magazine_briefs
     SET status = 'processing'
   WHERE id = p_brief_id;

  -- Prepara titulo/slug da edicao
  v_month := COALESCE(v_brief.month_year, to_char(now(), 'YYYY-MM'));
  v_title := 'Beauty & Health — ' || COALESCE(v_brief.theme, 'Edicao ' || v_month);
  v_slug := lower(regexp_replace(
    COALESCE(v_month, to_char(now(), 'YYYY-MM')) || '-' || COALESCE(v_brief.theme, 'edicao'),
    '[^a-z0-9]+', '-', 'g'
  ));
  v_slug := trim(both '-' from v_slug);

  -- Cria edicao se ainda nao existe
  IF v_brief.edition_id IS NULL THEN
    SELECT public.magazine_create_edition(v_title, v_slug, v_brief.theme, NULL) INTO v_edition_id;
  ELSE
    v_edition_id := v_brief.edition_id;
  END IF;

  -- Itera paginas
  FOR v_page IN SELECT * FROM jsonb_array_elements(p_plan->'pages')
  LOOP
    -- Valida
    v_validation := public.magazine_validate_section(
      v_page->>'template_slug',
      COALESCE(v_page->'slots', '{}'::jsonb)
    );

    IF (v_validation->>'ok')::boolean THEN
      BEGIN
        PERFORM public.magazine_add_page(
          v_edition_id,
          v_page->>'template_slug',
          COALESCE(v_page->'slots', '{}'::jsonb),
          ARRAY['all']::text[]
        );
        v_pages_created := v_pages_created + 1;

        IF jsonb_array_length(COALESCE(v_validation->'warnings','[]'::jsonb)) > 0 THEN
          v_warnings := v_warnings || jsonb_build_object(
            'template_slug', v_page->>'template_slug',
            'warnings', v_validation->'warnings'
          );
        END IF;
      EXCEPTION WHEN OTHERS THEN
        v_errors := v_errors || jsonb_build_object(
          'template_slug', v_page->>'template_slug',
          'error', SQLERRM
        );
      END;
    ELSE
      v_errors := v_errors || jsonb_build_object(
        'template_slug', v_page->>'template_slug',
        'errors', v_validation->'errors'
      );
    END IF;
  END LOOP;

  -- Marca brief done
  UPDATE public.magazine_briefs
     SET status = CASE WHEN v_pages_created > 0 THEN 'done' ELSE 'error' END,
         processed_at = now(),
         edition_id = v_edition_id,
         error_message = CASE WHEN v_pages_created = 0 THEN 'nenhuma pagina valida criada' ELSE NULL END
   WHERE id = p_brief_id;

  INSERT INTO public.magazine_audit_log (clinic_id, actor, action, subject, meta)
  VALUES (v_clinic_id, COALESCE(auth.uid()::text,'system'), 'brief_apply_plan', p_brief_id::text,
          jsonb_build_object(
            'edition_id', v_edition_id,
            'pages_created', v_pages_created,
            'warnings', v_warnings,
            'errors', v_errors
          ));

  RETURN jsonb_build_object(
    'ok', v_pages_created > 0,
    'edition_id', v_edition_id,
    'pages_created', v_pages_created,
    'warnings', v_warnings,
    'errors', v_errors
  );
END $$;

REVOKE ALL ON FUNCTION public.magazine_brief_apply_plan(uuid,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_brief_apply_plan(uuid,jsonb) TO authenticated;

-- ----------------------------------------------------------------------------
-- 2) RPC magazine_brief_photos — lista urls de fotos associadas ao brief
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_brief_photos(p_brief_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := public._mag_current_clinic_id();
  v_asset_ids uuid[];
  v_result jsonb;
BEGIN
  SELECT asset_ids INTO v_asset_ids
    FROM public.magazine_briefs
   WHERE id = p_brief_id AND clinic_id = v_clinic_id;
  IF v_asset_ids IS NULL THEN v_asset_ids := ARRAY[]::uuid[]; END IF;

  SELECT COALESCE(jsonb_agg(row_to_jsonb(a)), '[]'::jsonb)
    INTO v_result
    FROM (
      SELECT a.id, a.url, a.alt, a.width, a.height,
             CASE WHEN a.width > 0 AND a.height > 0
                  THEN round(a.width::numeric / NULLIF(a.height,0), 2)::text
                  ELSE NULL
             END AS aspect
        FROM public.magazine_assets a
       WHERE a.id = ANY(v_asset_ids)
    ) a;

  RETURN v_result;
END $$;

REVOKE ALL ON FUNCTION public.magazine_brief_photos(uuid) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_brief_photos(uuid) TO authenticated;

-- ============================================================================
-- Validacao:
--   SELECT public.magazine_brief_photos('<brief_id>'::uuid);
--   SELECT public.magazine_brief_apply_plan('<brief_id>'::uuid, '{"pages":[...]}'::jsonb);
-- ============================================================================
