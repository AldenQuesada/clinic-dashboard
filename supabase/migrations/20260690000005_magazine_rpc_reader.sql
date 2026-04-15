-- ============================================================================
-- Beauty & Health Magazine — RPCs do Leitor Publico
-- ============================================================================
-- Chamadas pela revista web publica. anon tem EXECUTE nestas funcoes.
-- Todas validam lead_hash (HMAC) para evitar enumeracao de IDs.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- _mag_verify_lead_hash: valida hash HMAC que veio no link
-- ----------------------------------------------------------------------------
-- hash = encode(hmac(lead_id::text || edition_id::text, secret, 'sha256'), 'hex')
-- Secret armazenado em config (app.magazine_hmac_secret). Se nao definido, fallback permissivo em dev.
CREATE OR REPLACE FUNCTION public._mag_verify_lead_hash(
  p_lead_id    uuid,
  p_edition_id uuid,
  p_hash       text
)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_secret text := current_setting('app.magazine_hmac_secret', true);
  v_expected text;
BEGIN
  IF v_secret IS NULL OR v_secret = '' THEN
    -- dev/staging: aceita se hash vazio
    RETURN p_hash IS NULL OR length(p_hash) = 0;
  END IF;

  v_expected := encode(
    hmac(p_lead_id::text || p_edition_id::text, v_secret, 'sha256'),
    'hex'
  );

  RETURN v_expected = p_hash;
END $$;

-- ----------------------------------------------------------------------------
-- magazine_start_reading: registra abertura + retorna progresso salvo
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_start_reading(
  p_edition_id uuid,
  p_lead_id    uuid,
  p_hash       text,
  p_user_agent text DEFAULT NULL,
  p_ip_hash    text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_segment text;
  v_read public.magazine_reads%ROWTYPE;
  v_is_new boolean := false;
BEGIN
  IF NOT public._mag_verify_lead_hash(p_lead_id, p_edition_id, p_hash) THEN
    RAISE EXCEPTION 'Link invalido ou expirado';
  END IF;

  SELECT clinic_id INTO v_clinic_id
  FROM public.magazine_editions
  WHERE id = p_edition_id AND status = 'published';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Edicao nao disponivel';
  END IF;

  -- busca segmento do lead (funcao que deve existir no sistema RFM)
  -- fallback: 'active' se nao encontrar
  BEGIN
    SELECT current_segment INTO v_segment FROM public.get_lead_rfm(p_lead_id);
  EXCEPTION WHEN undefined_function THEN
    v_segment := 'active';
  END;

  INSERT INTO public.magazine_reads (
    clinic_id, edition_id, lead_id, segment,
    opened_at, user_agent, first_open_ip_hash
  ) VALUES (
    v_clinic_id, p_edition_id, p_lead_id, COALESCE(v_segment, 'active'),
    now(), p_user_agent, p_ip_hash
  )
  ON CONFLICT (edition_id, lead_id) DO UPDATE
    SET opened_at = COALESCE(magazine_reads.opened_at, now()),
        user_agent = COALESCE(magazine_reads.user_agent, EXCLUDED.user_agent)
  RETURNING * INTO v_read;

  v_is_new := (v_read.opened_at >= now() - interval '10 seconds');

  -- credita reward 'open' apenas na primeira abertura
  IF v_is_new THEN
    INSERT INTO public.magazine_rewards (
      clinic_id, edition_id, lead_id, reward_type, amount
    ) VALUES (
      v_clinic_id, p_edition_id, p_lead_id, 'open', 10.00
    )
    ON CONFLICT (edition_id, lead_id, reward_type) DO NOTHING;
  END IF;

  RETURN jsonb_build_object(
    'read_id', v_read.id,
    'segment', v_read.segment,
    'last_page_index', v_read.last_page_index,
    'pages_completed', v_read.pages_completed,
    'quiz_completed', v_read.quiz_completed,
    'hidden_icon_found', v_read.hidden_icon_found,
    'completed', v_read.completed
  );
END $$;

-- ----------------------------------------------------------------------------
-- magazine_update_progress: batch update de progresso
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_update_progress(
  p_edition_id     uuid,
  p_lead_id        uuid,
  p_hash           text,
  p_page_index     int,
  p_pages_completed int[],
  p_time_spent_sec int DEFAULT 0
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_read public.magazine_reads%ROWTYPE;
  v_total_pages int;
  v_completed boolean;
  v_newly_completed boolean := false;
BEGIN
  IF NOT public._mag_verify_lead_hash(p_lead_id, p_edition_id, p_hash) THEN
    RAISE EXCEPTION 'Link invalido';
  END IF;

  SELECT COUNT(*) INTO v_total_pages
  FROM public.magazine_pages
  WHERE edition_id = p_edition_id;

  v_completed := array_length(p_pages_completed, 1) >= (v_total_pages * 0.8)::int;

  UPDATE public.magazine_reads
     SET last_page_index  = GREATEST(last_page_index, p_page_index),
         pages_completed  = p_pages_completed,
         time_spent_sec   = time_spent_sec + p_time_spent_sec,
         completed        = (completed OR v_completed)
   WHERE edition_id = p_edition_id AND lead_id = p_lead_id
   RETURNING * INTO v_read;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Sessao de leitura nao iniciada — chame magazine_start_reading primeiro';
  END IF;

  -- credita reward de leitura 80% se acabou de atingir
  IF v_completed AND NOT EXISTS (
    SELECT 1 FROM public.magazine_rewards
    WHERE edition_id = p_edition_id AND lead_id = p_lead_id AND reward_type = 'read_80'
  ) THEN
    INSERT INTO public.magazine_rewards (clinic_id, edition_id, lead_id, reward_type, amount)
    VALUES (v_read.clinic_id, p_edition_id, p_lead_id, 'read_80', 20.00);
    v_newly_completed := true;
  END IF;

  RETURN jsonb_build_object(
    'completed', v_read.completed,
    'newly_completed', v_newly_completed,
    'total_pages', v_total_pages
  );
END $$;

-- ----------------------------------------------------------------------------
-- magazine_claim_reward: credita recompensa de acao pontual
-- ----------------------------------------------------------------------------
-- Tipos aceitos: quiz, hidden_icon, shared, invite
CREATE OR REPLACE FUNCTION public.magazine_claim_reward(
  p_edition_id  uuid,
  p_lead_id     uuid,
  p_hash        text,
  p_reward_type text,
  p_amount      numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_amount numeric;
  v_reward_id uuid;
BEGIN
  IF NOT public._mag_verify_lead_hash(p_lead_id, p_edition_id, p_hash) THEN
    RAISE EXCEPTION 'Link invalido';
  END IF;

  IF p_reward_type NOT IN ('quiz','hidden_icon','shared','invite') THEN
    RAISE EXCEPTION 'Tipo de reward nao permitido via claim publico: %', p_reward_type;
  END IF;

  SELECT clinic_id INTO v_clinic_id
  FROM public.magazine_editions WHERE id = p_edition_id;

  -- valores default por tipo
  v_amount := COALESCE(p_amount, CASE p_reward_type
    WHEN 'quiz'        THEN 30.00
    WHEN 'hidden_icon' THEN 25.00
    WHEN 'shared'      THEN 15.00
    WHEN 'invite'      THEN 50.00
  END);

  INSERT INTO public.magazine_rewards (
    clinic_id, edition_id, lead_id, reward_type, amount
  ) VALUES (
    v_clinic_id, p_edition_id, p_lead_id, p_reward_type, v_amount
  )
  ON CONFLICT (edition_id, lead_id, reward_type) DO NOTHING
  RETURNING id INTO v_reward_id;

  -- atualiza flags em magazine_reads
  UPDATE public.magazine_reads SET
    quiz_completed     = quiz_completed     OR (p_reward_type = 'quiz'),
    hidden_icon_found  = hidden_icon_found  OR (p_reward_type = 'hidden_icon'),
    shared             = shared             OR (p_reward_type = 'shared')
  WHERE edition_id = p_edition_id AND lead_id = p_lead_id;

  RETURN jsonb_build_object(
    'reward_id', v_reward_id,
    'already_claimed', v_reward_id IS NULL,
    'amount', v_amount
  );
END $$;

-- ----------------------------------------------------------------------------
-- magazine_get_edition_public: retorna edicao personalizada para leitor
-- ----------------------------------------------------------------------------
-- Filtra paginas pelo segmento do lead e aplica personalizacoes.
CREATE OR REPLACE FUNCTION public.magazine_get_edition_public(
  p_edition_slug text,
  p_lead_id      uuid,
  p_hash         text
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_edition public.magazine_editions%ROWTYPE;
  v_segment text;
  v_pages jsonb;
BEGIN
  SELECT * INTO v_edition
  FROM public.magazine_editions
  WHERE slug = p_edition_slug AND status = 'published';

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF NOT public._mag_verify_lead_hash(p_lead_id, v_edition.id, p_hash) THEN
    RAISE EXCEPTION 'Link invalido';
  END IF;

  SELECT segment INTO v_segment
  FROM public.magazine_reads
  WHERE edition_id = v_edition.id AND lead_id = p_lead_id;

  v_segment := COALESCE(v_segment, 'active');

  SELECT jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'order_index', p.order_index,
      'template_slug', p.template_slug,
      'slots', p.slots,
      'is_hidden_icon_page', p.is_hidden_icon_page,
      'hidden_icon_pos', p.hidden_icon_pos
    ) ORDER BY p.order_index
  )
  INTO v_pages
  FROM public.magazine_pages p
  WHERE p.edition_id = v_edition.id
    AND ('all' = ANY(p.segment_scope) OR v_segment = ANY(p.segment_scope));

  RETURN jsonb_build_object(
    'id', v_edition.id,
    'slug', v_edition.slug,
    'title', v_edition.title,
    'subtitle', v_edition.subtitle,
    'edition_number', v_edition.edition_number,
    'theme', v_edition.theme,
    'published_at', v_edition.published_at,
    'segment', v_segment,
    'pages', COALESCE(v_pages, '[]'::jsonb)
  );
END $$;

-- ----------------------------------------------------------------------------
-- Permissoes anon + authenticated
-- ----------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.magazine_start_reading(uuid,uuid,text,text,text) FROM public;
REVOKE ALL ON FUNCTION public.magazine_update_progress(uuid,uuid,text,int,int[],int) FROM public;
REVOKE ALL ON FUNCTION public.magazine_claim_reward(uuid,uuid,text,text,numeric) FROM public;
REVOKE ALL ON FUNCTION public.magazine_get_edition_public(text,uuid,text) FROM public;

GRANT EXECUTE ON FUNCTION public.magazine_start_reading(uuid,uuid,text,text,text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.magazine_update_progress(uuid,uuid,text,int,int[],int) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.magazine_claim_reward(uuid,uuid,text,text,numeric) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.magazine_get_edition_public(text,uuid,text) TO anon, authenticated;
