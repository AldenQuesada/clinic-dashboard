-- ============================================================
-- Migration: VPI Badges + Missoes + Extensao vpi_pub_get_card (Fase 2)
--
-- Tabelas:
--   vpi_badge_catalog       - catalogo de badges (code PK, icone, criterio)
--   vpi_badges              - badges desbloqueados por partner
--   vpi_missoes             - missoes temporarias (com criterio jsonb)
--   vpi_missao_progresso    - progresso/unlock por partner
--
-- RPCs publicos (SECURITY DEFINER, GRANT anon):
--   vpi_pub_get_badges(token)         - catalogo + unlocked
--   vpi_pub_get_missao_atual(token)   - missao ativa + progresso
--   vpi_pub_create_indication(tok,p)  - cria lead + vpi_indications
--                                        com rate limit 10/h
--
-- RPC interno:
--   vpi_check_and_unlock_badges(partner_id) - avalia todos badges
--   _vpi_streak_meses(partner_id)           - calcula streak
--   _vpi_update_missao_progress(partner)    - avalia progresso missoes
--
-- Trigger AFTER UPDATE vpi_indications (status -> closed):
--   chama vpi_check_and_unlock_badges + _vpi_update_missao_progress
--
-- Extensao vpi_pub_get_card: inclui badges_unlocked, missao_atual,
-- streak_meses no retorno.
--
-- Seed: 9 badges + 1 missao ativa.
--
-- Idempotente: IF NOT EXISTS, ON CONFLICT, CREATE OR REPLACE.
-- ============================================================

-- ── 1. vpi_badge_catalog ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vpi_badge_catalog (
  code                text PRIMARY KEY,
  nome                text NOT NULL,
  descricao           text NOT NULL,
  icone               text NOT NULL DEFAULT 'award',
  sort_order          int  NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  criterio_descricao  text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── 2. vpi_badges (desbloqueados) ────────────────────────────
CREATE TABLE IF NOT EXISTS public.vpi_badges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  partner_id  uuid NOT NULL REFERENCES public.vpi_partners(id) ON DELETE CASCADE,
  badge_code  text NOT NULL REFERENCES public.vpi_badge_catalog(code) ON DELETE CASCADE,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, badge_code)
);
CREATE INDEX IF NOT EXISTS idx_vpi_badges_partner
  ON public.vpi_badges(partner_id, unlocked_at DESC);
CREATE INDEX IF NOT EXISTS idx_vpi_badges_clinic_recent
  ON public.vpi_badges(clinic_id, unlocked_at DESC);

-- ── 3. vpi_missoes ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vpi_missoes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id              uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  titulo                 text NOT NULL,
  descricao              text NOT NULL,
  criterio               jsonb NOT NULL,
  recompensa_texto       text NOT NULL,
  recompensa_valor       numeric NOT NULL DEFAULT 0,
  msg_template_sucesso   text,
  valid_from             timestamptz NOT NULL DEFAULT now(),
  valid_until            timestamptz,
  is_active              boolean NOT NULL DEFAULT true,
  sort_order             int  NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_vpi_missoes_active
  ON public.vpi_missoes(clinic_id, is_active, valid_until);

-- ── 4. vpi_missao_progresso ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.vpi_missao_progresso (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000001',
  partner_id          uuid NOT NULL REFERENCES public.vpi_partners(id) ON DELETE CASCADE,
  missao_id           uuid NOT NULL REFERENCES public.vpi_missoes(id) ON DELETE CASCADE,
  progresso_atual     int NOT NULL DEFAULT 0,
  target              int NOT NULL DEFAULT 1,
  completed_at        timestamptz,
  recompensa_emitida  boolean NOT NULL DEFAULT false,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (partner_id, missao_id)
);
CREATE INDEX IF NOT EXISTS idx_vpi_mp_partner
  ON public.vpi_missao_progresso(partner_id, completed_at);

-- ── 5. RLS ──────────────────────────────────────────────────
ALTER TABLE public.vpi_badge_catalog       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vpi_badges              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vpi_missoes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vpi_missao_progresso    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS vpi_badge_catalog_read     ON public.vpi_badge_catalog;
DROP POLICY IF EXISTS vpi_badges_clinic          ON public.vpi_badges;
DROP POLICY IF EXISTS vpi_missoes_clinic         ON public.vpi_missoes;
DROP POLICY IF EXISTS vpi_missao_progresso_clinic ON public.vpi_missao_progresso;

CREATE POLICY vpi_badge_catalog_read ON public.vpi_badge_catalog FOR ALL
  USING (true) WITH CHECK (true);
CREATE POLICY vpi_badges_clinic ON public.vpi_badges FOR ALL
  USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid)
  WITH CHECK (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);
CREATE POLICY vpi_missoes_clinic ON public.vpi_missoes FOR ALL
  USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid)
  WITH CHECK (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);
CREATE POLICY vpi_missao_progresso_clinic ON public.vpi_missao_progresso FOR ALL
  USING (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid)
  WITH CHECK (clinic_id = '00000000-0000-0000-0000-000000000001'::uuid);

-- Updated_at triggers
DROP TRIGGER IF EXISTS trg_vpi_missoes_updated_at ON public.vpi_missoes;
CREATE TRIGGER trg_vpi_missoes_updated_at
  BEFORE UPDATE ON public.vpi_missoes
  FOR EACH ROW EXECUTE FUNCTION public._vpi_touch_updated_at();

DROP TRIGGER IF EXISTS trg_vpi_mp_updated_at ON public.vpi_missao_progresso;
CREATE TRIGGER trg_vpi_mp_updated_at
  BEFORE UPDATE ON public.vpi_missao_progresso
  FOR EACH ROW EXECUTE FUNCTION public._vpi_touch_updated_at();

-- ── 6. Seed badge catalog ───────────────────────────────────
INSERT INTO public.vpi_badge_catalog (code, nome, descricao, icone, sort_order, criterio_descricao) VALUES
  ('primeira_vitoria',   'Primeira Vitoria',      '1a indicacao fechada',                 'star',         10, 'Feche sua primeira indicacao'),
  ('hat_trick',          'Hat-trick',             '3 indicacoes em 30 dias',              'zap',          20, '3 indicacoes fechadas em 30 dias'),
  ('full_face_hunter',   'Full Face Hunter',      'Indicacao fechou Full Face',           'target',       30, 'Uma indicacao sua fechou um Full Face'),
  ('mes_perfeito',       'Mes Perfeito',          '5 indicacoes em 1 mes',                'award',        40, '5 indicacoes fechadas no mes calendario'),
  ('streak_3',           'Chama',                 '3 meses consecutivos indicando',       'trending-up',  50, 'Indicar por 3 meses seguidos'),
  ('streak_6',           'Fogo',                  '6 meses consecutivos',                 'zap',          60, 'Indicar por 6 meses seguidos'),
  ('streak_11',          'Lenda',                 '11 meses consecutivos (ciclo)',        'award',        70, 'Ciclo completo de 11 meses indicando'),
  ('top_10_mensal',      'Top 10',                'Entrou no top 10 do mes',              'users',        80, 'Estar entre as 10 primeiras do mes'),
  ('embaixadora_mes',    'Embaixadora do Mes',    '#1 do mes',                            'award',        90, 'Posicao numero 1 no ranking mensal')
ON CONFLICT (code) DO UPDATE
  SET nome=EXCLUDED.nome,
      descricao=EXCLUDED.descricao,
      icone=EXCLUDED.icone,
      sort_order=EXCLUDED.sort_order,
      criterio_descricao=EXCLUDED.criterio_descricao,
      is_active=true;

-- ── 7. Seed missao inicial ──────────────────────────────────
INSERT INTO public.vpi_missoes (
  clinic_id, titulo, descricao, criterio, recompensa_texto,
  recompensa_valor, msg_template_sucesso, valid_from, valid_until, is_active, sort_order
)
SELECT
  '00000000-0000-0000-0000-000000000001'::uuid,
  'Indique 1 amiga esta semana',
  'Feche 1 indicacao nos proximos 7 dias e ganhe bonus extra.',
  '{"tipo":"indicacoes_fechadas","quantidade":1,"periodo":"7d"}'::jsonb,
  'Kit skincare R$50 extra',
  50,
  'Parabens {{nome}}! Voce completou a missao da semana e ganhou R$50 em kit skincare! Fale com a clinica para resgatar.',
  now(),
  now() + interval '7 days',
  true,
  10
WHERE NOT EXISTS (
  SELECT 1 FROM public.vpi_missoes
   WHERE titulo = 'Indique 1 amiga esta semana'
     AND valid_until > now()
);

-- ── 8. Helper: streak meses consecutivos ────────────────────
CREATE OR REPLACE FUNCTION public._vpi_streak_meses(p_partner_id uuid)
RETURNS int LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_streak int := 0;
  v_cursor date := date_trunc('month', now())::date;
  v_has_ind boolean;
BEGIN
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM public.vpi_indications
       WHERE partner_id = p_partner_id
         AND status = 'closed'
         AND fechada_em >= v_cursor
         AND fechada_em <  (v_cursor + interval '1 month')
    ) INTO v_has_ind;
    EXIT WHEN NOT v_has_ind;
    v_streak := v_streak + 1;
    v_cursor := (v_cursor - interval '1 month')::date;
    EXIT WHEN v_streak >= 12; -- safety
  END LOOP;
  RETURN v_streak;
END $$;

-- ── 9. vpi_check_and_unlock_badges ──────────────────────────
CREATE OR REPLACE FUNCTION public.vpi_check_and_unlock_badges(p_partner_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner      public.vpi_partners%ROWTYPE;
  v_new_badges   jsonb := '[]'::jsonb;
  v_count_total  int;
  v_count_30d    int;
  v_count_mes    int;
  v_has_fullface boolean;
  v_streak       int;
  v_rank_pos     int;
  v_ind_mes_cur  int;
  v_unlocked     boolean;
BEGIN
  SELECT * INTO v_partner FROM public.vpi_partners WHERE id = p_partner_id;
  IF NOT FOUND THEN RETURN v_new_badges; END IF;

  SELECT COUNT(*)::int INTO v_count_total
    FROM public.vpi_indications
   WHERE partner_id = p_partner_id AND status = 'closed';

  SELECT COUNT(*)::int INTO v_count_30d
    FROM public.vpi_indications
   WHERE partner_id = p_partner_id AND status = 'closed'
     AND fechada_em >= now() - interval '30 days';

  SELECT COUNT(*)::int INTO v_count_mes
    FROM public.vpi_indications
   WHERE partner_id = p_partner_id AND status = 'closed'
     AND fechada_em >= date_trunc('month', now());

  SELECT EXISTS(
    SELECT 1 FROM public.vpi_indications
     WHERE partner_id = p_partner_id AND status = 'closed'
       AND lower(COALESCE(procedimento,'')) LIKE '%full%face%'
  ) INTO v_has_fullface;

  v_streak := public._vpi_streak_meses(p_partner_id);

  -- Atualiza streak cached no partner (usado pelo UI e proximos gatilhos)
  UPDATE public.vpi_partners
     SET streak_meses = v_streak
   WHERE id = p_partner_id
     AND streak_meses IS DISTINCT FROM v_streak;

  -- primeira_vitoria
  IF v_count_total >= 1 THEN
    INSERT INTO public.vpi_badges (clinic_id, partner_id, badge_code)
      VALUES (v_partner.clinic_id, p_partner_id, 'primeira_vitoria')
      ON CONFLICT DO NOTHING
      RETURNING true INTO v_unlocked;
    IF v_unlocked THEN v_new_badges := v_new_badges || '"primeira_vitoria"'::jsonb; END IF;
    v_unlocked := false;
  END IF;

  -- hat_trick
  IF v_count_30d >= 3 THEN
    INSERT INTO public.vpi_badges (clinic_id, partner_id, badge_code)
      VALUES (v_partner.clinic_id, p_partner_id, 'hat_trick')
      ON CONFLICT DO NOTHING
      RETURNING true INTO v_unlocked;
    IF v_unlocked THEN v_new_badges := v_new_badges || '"hat_trick"'::jsonb; END IF;
    v_unlocked := false;
  END IF;

  -- full_face_hunter
  IF v_has_fullface THEN
    INSERT INTO public.vpi_badges (clinic_id, partner_id, badge_code)
      VALUES (v_partner.clinic_id, p_partner_id, 'full_face_hunter')
      ON CONFLICT DO NOTHING
      RETURNING true INTO v_unlocked;
    IF v_unlocked THEN v_new_badges := v_new_badges || '"full_face_hunter"'::jsonb; END IF;
    v_unlocked := false;
  END IF;

  -- mes_perfeito
  IF v_count_mes >= 5 THEN
    INSERT INTO public.vpi_badges (clinic_id, partner_id, badge_code)
      VALUES (v_partner.clinic_id, p_partner_id, 'mes_perfeito')
      ON CONFLICT DO NOTHING
      RETURNING true INTO v_unlocked;
    IF v_unlocked THEN v_new_badges := v_new_badges || '"mes_perfeito"'::jsonb; END IF;
    v_unlocked := false;
  END IF;

  -- streaks
  IF v_streak >= 3 THEN
    INSERT INTO public.vpi_badges (clinic_id, partner_id, badge_code)
      VALUES (v_partner.clinic_id, p_partner_id, 'streak_3')
      ON CONFLICT DO NOTHING
      RETURNING true INTO v_unlocked;
    IF v_unlocked THEN v_new_badges := v_new_badges || '"streak_3"'::jsonb; END IF;
    v_unlocked := false;
  END IF;
  IF v_streak >= 6 THEN
    INSERT INTO public.vpi_badges (clinic_id, partner_id, badge_code)
      VALUES (v_partner.clinic_id, p_partner_id, 'streak_6')
      ON CONFLICT DO NOTHING
      RETURNING true INTO v_unlocked;
    IF v_unlocked THEN v_new_badges := v_new_badges || '"streak_6"'::jsonb; END IF;
    v_unlocked := false;
  END IF;
  IF v_streak >= 11 THEN
    INSERT INTO public.vpi_badges (clinic_id, partner_id, badge_code)
      VALUES (v_partner.clinic_id, p_partner_id, 'streak_11')
      ON CONFLICT DO NOTHING
      RETURNING true INTO v_unlocked;
    IF v_unlocked THEN v_new_badges := v_new_badges || '"streak_11"'::jsonb; END IF;
    v_unlocked := false;
  END IF;

  -- Rank mensal (top_10 / embaixadora_mes)
  IF v_count_mes >= 1 THEN
    SELECT COUNT(*)+1 INTO v_rank_pos
      FROM (
        SELECT p2.id,
          (SELECT COUNT(*) FROM public.vpi_indications i2
            WHERE i2.partner_id=p2.id AND i2.status='closed'
              AND i2.fechada_em >= date_trunc('month', now())) AS cnt
          FROM public.vpi_partners p2
         WHERE p2.clinic_id=v_partner.clinic_id AND p2.status='ativo' AND p2.id<>p_partner_id
      ) q
     WHERE q.cnt > v_count_mes;

    IF v_rank_pos <= 10 THEN
      INSERT INTO public.vpi_badges (clinic_id, partner_id, badge_code)
        VALUES (v_partner.clinic_id, p_partner_id, 'top_10_mensal')
        ON CONFLICT DO NOTHING
        RETURNING true INTO v_unlocked;
      IF v_unlocked THEN v_new_badges := v_new_badges || '"top_10_mensal"'::jsonb; END IF;
      v_unlocked := false;
    END IF;

    IF v_rank_pos = 1 THEN
      INSERT INTO public.vpi_badges (clinic_id, partner_id, badge_code)
        VALUES (v_partner.clinic_id, p_partner_id, 'embaixadora_mes')
        ON CONFLICT DO NOTHING
        RETURNING true INTO v_unlocked;
      IF v_unlocked THEN v_new_badges := v_new_badges || '"embaixadora_mes"'::jsonb; END IF;
    END IF;
  END IF;

  RETURN v_new_badges;
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_check_and_unlock_badges(uuid) TO authenticated, anon;

-- ── 10. _vpi_update_missao_progress ─────────────────────────
CREATE OR REPLACE FUNCTION public._vpi_update_missao_progress(p_partner_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  r          record;
  v_qty      int;
  v_period   text;
  v_since    timestamptz;
  v_target   int;
  v_progress int;
BEGIN
  FOR r IN
    SELECT id, clinic_id, criterio
      FROM public.vpi_missoes
     WHERE is_active = true
       AND (valid_until IS NULL OR valid_until > now())
       AND valid_from <= now()
  LOOP
    IF (r.criterio->>'tipo') = 'indicacoes_fechadas' THEN
      v_qty    := COALESCE((r.criterio->>'quantidade')::int, 1);
      v_period := COALESCE(r.criterio->>'periodo', '7d');

      IF v_period = '30d' THEN       v_since := now() - interval '30 days';
      ELSIF v_period = '7d' THEN     v_since := now() - interval '7 days';
      ELSIF v_period = 'mes' THEN    v_since := date_trunc('month', now());
      ELSE                           v_since := now() - interval '7 days';
      END IF;

      SELECT COUNT(*)::int INTO v_progress
        FROM public.vpi_indications
       WHERE partner_id = p_partner_id
         AND status = 'closed'
         AND fechada_em >= v_since;

      v_target := v_qty;

      INSERT INTO public.vpi_missao_progresso (
        clinic_id, partner_id, missao_id, progresso_atual, target,
        completed_at, recompensa_emitida
      ) VALUES (
        r.clinic_id, p_partner_id, r.id, LEAST(v_progress, v_target), v_target,
        CASE WHEN v_progress >= v_target THEN now() ELSE NULL END,
        false
      )
      ON CONFLICT (partner_id, missao_id) DO UPDATE
        SET progresso_atual = LEAST(EXCLUDED.progresso_atual, public.vpi_missao_progresso.target),
            completed_at    = CASE
              WHEN public.vpi_missao_progresso.completed_at IS NOT NULL
                THEN public.vpi_missao_progresso.completed_at
              WHEN EXCLUDED.progresso_atual >= public.vpi_missao_progresso.target
                THEN now()
              ELSE NULL
            END;
    END IF;
  END LOOP;
END $$;

-- ── 11. Trigger AFTER UPDATE indicacao fechada ──────────────
CREATE OR REPLACE FUNCTION public._vpi_ind_after_close()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.status = 'closed' AND (OLD.status IS DISTINCT FROM 'closed') THEN
    PERFORM public.vpi_check_and_unlock_badges(NEW.partner_id);
    PERFORM public._vpi_update_missao_progress(NEW.partner_id);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_vpi_ind_after_close ON public.vpi_indications;
CREATE TRIGGER trg_vpi_ind_after_close
  AFTER UPDATE ON public.vpi_indications
  FOR EACH ROW EXECUTE FUNCTION public._vpi_ind_after_close();

-- ── 12. RPC publica: vpi_pub_get_badges ─────────────────────
CREATE OR REPLACE FUNCTION public.vpi_pub_get_badges(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner  public.vpi_partners%ROWTYPE;
  v_catalog  jsonb;
  v_unlocked jsonb;
BEGIN
  IF COALESCE(p_token,'') = '' THEN RETURN jsonb_build_object('error','invalid_token'); END IF;

  SELECT * INTO v_partner FROM public.vpi_partners
   WHERE card_token = p_token AND status <> 'inativo' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(c.*) ORDER BY c.sort_order), '[]'::jsonb)
    INTO v_catalog
    FROM (
      SELECT code, nome, descricao, icone, sort_order, criterio_descricao
        FROM public.vpi_badge_catalog
       WHERE is_active = true
       ORDER BY sort_order ASC
    ) c;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'code', b.badge_code,
           'unlocked_at', b.unlocked_at
         ) ORDER BY b.unlocked_at DESC), '[]'::jsonb)
    INTO v_unlocked
    FROM public.vpi_badges b
   WHERE b.partner_id = v_partner.id;

  RETURN jsonb_build_object(
    'catalog', v_catalog,
    'unlocked', v_unlocked,
    'fetched_at', now()
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_pub_get_badges(text) TO anon, authenticated;

-- ── 13. RPC publica: vpi_pub_get_missao_atual ───────────────
CREATE OR REPLACE FUNCTION public.vpi_pub_get_missao_atual(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner    public.vpi_partners%ROWTYPE;
  v_missao     public.vpi_missoes%ROWTYPE;
  v_prog       public.vpi_missao_progresso%ROWTYPE;
  v_target     int;
  v_progress   int;
  v_period     text;
  v_since      timestamptz;
  v_qty        int;
BEGIN
  IF COALESCE(p_token,'') = '' THEN RETURN jsonb_build_object('error','invalid_token'); END IF;

  SELECT * INTO v_partner FROM public.vpi_partners
   WHERE card_token = p_token AND status <> 'inativo' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  SELECT * INTO v_missao FROM public.vpi_missoes
   WHERE clinic_id = v_partner.clinic_id
     AND is_active = true
     AND (valid_until IS NULL OR valid_until > now())
     AND valid_from <= now()
   ORDER BY sort_order ASC, created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN RETURN jsonb_build_object('missao', null); END IF;

  -- Calcula progresso inline (no prog registrado ainda se partner novo)
  IF (v_missao.criterio->>'tipo') = 'indicacoes_fechadas' THEN
    v_qty    := COALESCE((v_missao.criterio->>'quantidade')::int, 1);
    v_period := COALESCE(v_missao.criterio->>'periodo', '7d');
    IF v_period = '30d' THEN       v_since := now() - interval '30 days';
    ELSIF v_period = '7d' THEN     v_since := now() - interval '7 days';
    ELSIF v_period = 'mes' THEN    v_since := date_trunc('month', now());
    ELSE                           v_since := now() - interval '7 days';
    END IF;

    SELECT COUNT(*)::int INTO v_progress
      FROM public.vpi_indications
     WHERE partner_id = v_partner.id AND status = 'closed'
       AND fechada_em >= v_since;

    v_target := v_qty;
  ELSE
    v_target := 1;
    v_progress := 0;
  END IF;

  SELECT * INTO v_prog FROM public.vpi_missao_progresso
   WHERE partner_id = v_partner.id AND missao_id = v_missao.id;

  RETURN jsonb_build_object(
    'missao', jsonb_build_object(
      'id',               v_missao.id,
      'titulo',           v_missao.titulo,
      'descricao',        v_missao.descricao,
      'recompensa_texto', v_missao.recompensa_texto,
      'recompensa_valor', v_missao.recompensa_valor,
      'valid_until',      v_missao.valid_until,
      'progresso',        LEAST(v_progress, v_target),
      'target',           v_target,
      'completed',        (v_progress >= v_target),
      'criterio',         v_missao.criterio
    ),
    'fetched_at', now()
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_pub_get_missao_atual(text) TO anon, authenticated;

-- ── 14. RPC publica: vpi_pub_create_indication ──────────────
-- Rate limit: max 10 tentativas/h por partner (via vpi_audit_log).
-- Cria lead novo (se phone nao existe) + vpi_indications pending_close.
CREATE OR REPLACE FUNCTION public.vpi_pub_create_indication(
  p_token text,
  p_lead  jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner    public.vpi_partners%ROWTYPE;
  v_nome       text;
  v_phone      text;
  v_phone_digits text;
  v_email      text;
  v_procedimento text;
  v_lead_id    uuid;
  v_existing   uuid;
  v_count_h    int;
  v_ind_id     uuid;
BEGIN
  IF COALESCE(p_token,'') = '' THEN RETURN jsonb_build_object('error','invalid_token'); END IF;

  SELECT * INTO v_partner FROM public.vpi_partners
   WHERE card_token = p_token AND status <> 'inativo' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  v_nome        := NULLIF(trim(COALESCE(p_lead->>'nome','')), '');
  v_phone       := NULLIF(trim(COALESCE(p_lead->>'phone','')), '');
  v_email       := NULLIF(trim(COALESCE(p_lead->>'email','')), '');
  v_procedimento:= NULLIF(trim(COALESCE(p_lead->>'procedimento','')), '');

  IF v_nome IS NULL OR v_phone IS NULL THEN
    RETURN jsonb_build_object('error','invalid_input','detail','nome e telefone sao obrigatorios');
  END IF;

  v_phone_digits := regexp_replace(v_phone, '[^0-9]', '', 'g');
  IF length(v_phone_digits) < 10 THEN
    RETURN jsonb_build_object('error','invalid_phone');
  END IF;

  -- Rate limit: max 10 indicacoes criadas/h por partner
  SELECT COUNT(*)::int INTO v_count_h
    FROM public.vpi_audit_log
   WHERE entity_type = 'vpi_indication'
     AND action = 'public_create'
     AND entity_id = v_partner.id::text
     AND created_at >= now() - interval '1 hour';
  IF v_count_h >= 10 THEN
    RETURN jsonb_build_object('error','rate_limit','retry_after_minutes', 60);
  END IF;

  -- Busca lead existente pelo telefone (right 8 digits = normalizado BR)
  SELECT id INTO v_existing
    FROM public.leads
   WHERE clinic_id = v_partner.clinic_id
     AND right(regexp_replace(COALESCE(phone,''), '[^0-9]', '', 'g'), 8) = right(v_phone_digits, 8)
   LIMIT 1;

  IF v_existing IS NOT NULL THEN
    v_lead_id := v_existing;
  ELSE
    INSERT INTO public.leads (
      clinic_id, name, phone, email, source_type, funnel, phase, data
    ) VALUES (
      v_partner.clinic_id, v_nome, v_phone_digits, v_email, 'vpi_indication',
      'procedimentos', 'nao_contatado',
      jsonb_build_object(
        'vpi_partner_id', v_partner.id,
        'vpi_partner_nome', v_partner.nome,
        'procedimento_interesse', v_procedimento
      )
    )
    RETURNING id INTO v_lead_id;
  END IF;

  -- Cria indicacao (idempotente via UNIQUE partner_id+lead_id)
  INSERT INTO public.vpi_indications (
    clinic_id, partner_id, lead_id, procedimento, status, creditos
  ) VALUES (
    v_partner.clinic_id, v_partner.id, v_lead_id::text,
    COALESCE(v_procedimento,'A definir'), 'pending_close', 1
  )
  ON CONFLICT (partner_id, lead_id) DO UPDATE
    SET procedimento = COALESCE(EXCLUDED.procedimento, public.vpi_indications.procedimento)
  RETURNING id INTO v_ind_id;

  -- Audit log (usado pelo rate limit + analytics)
  INSERT INTO public.vpi_audit_log (clinic_id, action, entity_type, entity_id, payload)
  VALUES (
    v_partner.clinic_id, 'public_create', 'vpi_indication', v_partner.id::text,
    jsonb_build_object(
      'indication_id', v_ind_id,
      'lead_id', v_lead_id,
      'nome', v_nome,
      'phone', v_phone_digits,
      'procedimento', v_procedimento,
      'via', 'public_card'
    )
  );

  RETURN jsonb_build_object(
    'ok', true,
    'indication_id', v_ind_id,
    'lead_id', v_lead_id,
    'existing_lead', (v_existing IS NOT NULL)
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_pub_create_indication(text, jsonb) TO anon, authenticated;

-- ── 15. Estende vpi_pub_get_card com badges + missao + streak ─
CREATE OR REPLACE FUNCTION public.vpi_pub_get_card(p_token text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_partner      public.vpi_partners%ROWTYPE;
  v_indications  jsonb;
  v_next_tier    jsonb;
  v_ranking_pos  int;
  v_total_partners int;
  v_ind_mes      int;
  v_badges       jsonb;
  v_missao       jsonb;
  v_streak       int;
BEGIN
  IF COALESCE(p_token,'') = '' THEN RETURN jsonb_build_object('error','invalid_token'); END IF;

  SELECT * INTO v_partner FROM public.vpi_partners
   WHERE card_token = p_token AND status <> 'inativo' LIMIT 1;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  -- Timeline
  SELECT COALESCE(jsonb_agg(row_to_json(i.*)), '[]'::jsonb)
    INTO v_indications
    FROM (
      SELECT id, procedimento, creditos, status, fechada_em, created_at
        FROM public.vpi_indications
       WHERE partner_id = v_partner.id
       ORDER BY COALESCE(fechada_em, created_at) DESC
       LIMIT 20
    ) i;

  SELECT jsonb_build_object(
           'threshold',   t.threshold,
           'recompensa',  t.recompensa,
           'faltam',      GREATEST(0, t.threshold - v_partner.creditos_total),
           'tipo',        t.tipo
         )
    INTO v_next_tier
    FROM public.vpi_reward_tiers t
   WHERE t.clinic_id = v_partner.clinic_id
     AND t.is_active = true
     AND t.tipo IN ('milestone','per_indication')
     AND t.threshold > v_partner.creditos_total
   ORDER BY t.threshold ASC
   LIMIT 1;

  SELECT COUNT(*)::int INTO v_ind_mes
    FROM public.vpi_indications
   WHERE partner_id = v_partner.id AND status = 'closed'
     AND fechada_em >= date_trunc('month', now());

  SELECT COUNT(*)+1 INTO v_ranking_pos
    FROM (
      SELECT p2.id,
        (SELECT COUNT(*) FROM public.vpi_indications i2
          WHERE i2.partner_id=p2.id AND i2.status='closed'
            AND i2.fechada_em >= date_trunc('month', now())) AS cnt
        FROM public.vpi_partners p2
       WHERE p2.clinic_id=v_partner.clinic_id AND p2.status='ativo'
    ) q
   WHERE q.cnt > v_ind_mes;

  SELECT COUNT(*)::int INTO v_total_partners
    FROM public.vpi_partners
   WHERE clinic_id = v_partner.clinic_id AND status='ativo';

  -- Badges unlocked
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
           'code', b.badge_code,
           'unlocked_at', b.unlocked_at
         ) ORDER BY b.unlocked_at DESC), '[]'::jsonb)
    INTO v_badges
    FROM public.vpi_badges b
   WHERE b.partner_id = v_partner.id;

  -- Missao atual (simplificada inline)
  SELECT jsonb_build_object(
           'id',               m.id,
           'titulo',           m.titulo,
           'descricao',        m.descricao,
           'recompensa_texto', m.recompensa_texto,
           'valid_until',      m.valid_until,
           'criterio',         m.criterio
         )
    INTO v_missao
    FROM public.vpi_missoes m
   WHERE m.clinic_id = v_partner.clinic_id
     AND m.is_active = true
     AND (m.valid_until IS NULL OR m.valid_until > now())
     AND m.valid_from <= now()
   ORDER BY m.sort_order ASC, m.created_at DESC
   LIMIT 1;

  v_streak := public._vpi_streak_meses(v_partner.id);
  IF v_partner.streak_meses IS DISTINCT FROM v_streak THEN
    UPDATE public.vpi_partners SET streak_meses = v_streak WHERE id = v_partner.id;
    v_partner.streak_meses := v_streak;
  END IF;

  RETURN jsonb_build_object(
    'partner', jsonb_build_object(
      'id',             v_partner.id,
      'nome',           v_partner.nome,
      'avatar_url',     v_partner.avatar_url,
      'tier_atual',     v_partner.tier_atual,
      'creditos_total', v_partner.creditos_total,
      'creditos_disponiveis', v_partner.creditos_disponiveis,
      'numero_membro',  v_partner.numero_membro,
      'streak_meses',   v_partner.streak_meses,
      'short_link_slug', v_partner.short_link_slug,
      'created_at',     v_partner.created_at
    ),
    'indications',       v_indications,
    'next_tier',         v_next_tier,
    'ranking_pos',       v_ranking_pos,
    'ind_mes',           v_ind_mes,
    'total_partners',    v_total_partners,
    'badges_unlocked',   v_badges,
    'missao_atual',      v_missao,
    'streak_meses',      v_streak,
    'fetched_at',        now()
  );
END $$;
GRANT EXECUTE ON FUNCTION public.vpi_pub_get_card(text) TO anon, authenticated;
