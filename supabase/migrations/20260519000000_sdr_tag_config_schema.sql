-- ============================================================
-- Migration: 20260519000000 — SDR: Tag Config Schema (Sprint 9)
--
-- Propósito: Migrar configuração de Tags do localStorage para
-- Supabase, tornando Settings > Tags a fonte única de verdade
-- para todos os módulos (Leads, Agendamento, Paciente, Orçamento).
--
-- Tabelas criadas:
--   tag_groups          → grupos de tags por fase do funil
--   tag_msg_templates   → templates de mensagem WhatsApp
--   tag_alert_templates → templates de alerta interno
--   tag_task_templates  → templates de tarefas operacionais
--   internal_alerts     → alertas internos criados por regras/tags
--
-- Colunas adicionadas à tabela tags:
--   group_slug, icon, kanban_coluna, cor_calendario,
--   msg_template_id, alert_template_id, task_template_id,
--   proxima_acao, regras_aplicacao, incompativeis
--
-- RPCs criadas:
--   sdr_get_tag_groups, sdr_get_tags_by_group,
--   sdr_upsert_tag_group, sdr_upsert_tag_metadata,
--   sdr_get_templates_config, sdr_upsert_template,
--   sdr_delete_template, sdr_get_internal_alerts,
--   sdr_mark_alert_read, sdr_mark_all_alerts_read,
--   sdr_create_internal_alert
-- ============================================================

-- ── Tabela: tag_groups ────────────────────────────────────────
-- Agrupa tags por fase do funil: pré-agendamento, agendamento,
-- paciente, orçamento, paciente + orçamento.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tag_groups (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  slug        text        NOT NULL,   -- 'pre_agendamento', 'agendamento', etc.
  nome        text        NOT NULL,
  cor         text        NOT NULL DEFAULT '#6366f1',
  icone       text,                   -- nome de ícone Feather (ex: 'user-plus')
  descricao   text,
  ordem       int         NOT NULL DEFAULT 0,
  ativo       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, slug)
);

ALTER TABLE public.tag_groups
  ADD CONSTRAINT chk_tg_cor CHECK (cor ~ '^#[0-9A-Fa-f]{6}$');

-- ── Tabela: tag_msg_templates ─────────────────────────────────
-- Templates de mensagem WhatsApp/email por tag.
-- Variáveis: {{nome}}, {{data}}, {{hora}}, etc.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tag_msg_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  slug        text        NOT NULL,
  nome        text        NOT NULL,
  canal       text        NOT NULL DEFAULT 'whatsapp',
  conteudo    text        NOT NULL,
  variaveis   text[]      NOT NULL DEFAULT '{}',
  ativo       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, slug)
);

ALTER TABLE public.tag_msg_templates
  ADD CONSTRAINT chk_tmt_canal CHECK (canal IN ('whatsapp', 'email', 'sms'));

-- ── Tabela: tag_alert_templates ───────────────────────────────
-- Templates de alertas internos (notificações para SDR,
-- secretaria, gestão, etc.) disparados quando uma tag é aplicada.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tag_alert_templates (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  slug        text        NOT NULL,
  nome        text        NOT NULL,
  titulo      text        NOT NULL,
  corpo       text        NOT NULL,
  tipo        text        NOT NULL DEFAULT 'info',
  para        text        NOT NULL DEFAULT 'sdr',
  ativo       boolean     NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, slug)
);

ALTER TABLE public.tag_alert_templates
  ADD CONSTRAINT chk_tat_tipo CHECK (tipo IN ('info', 'warning', 'error', 'success')),
  ADD CONSTRAINT chk_tat_para CHECK (para IN ('sdr', 'secretaria', 'cs', 'gestao', 'clinica'));

-- ── Tabela: tag_task_templates ────────────────────────────────
-- Templates de tarefas operacionais criadas automaticamente
-- quando uma tag é aplicada (ex: "Qualificar lead em 24h").
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tag_task_templates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  slug          text        NOT NULL,
  nome          text        NOT NULL,
  titulo        text        NOT NULL,
  descricao     text,
  prazo_horas   int         NOT NULL DEFAULT 24,
  prioridade    text        NOT NULL DEFAULT 'normal',
  responsavel   text        NOT NULL DEFAULT 'sdr',
  ativo         boolean     NOT NULL DEFAULT true,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (clinic_id, slug)
);

ALTER TABLE public.tag_task_templates
  ADD CONSTRAINT chk_ttt_prioridade CHECK (prioridade IN ('normal', 'alta', 'urgente')),
  ADD CONSTRAINT chk_ttt_responsavel CHECK (responsavel IN ('sdr', 'secretaria', 'cs', 'gestao', 'clinica'));

-- ── Tabela: internal_alerts ───────────────────────────────────
-- Alertas internos criados por regras de automação ou
-- atribuição de tags. Lidos pela equipe no painel de alertas.
-- ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.internal_alerts (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id     uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  entity_type   text        NOT NULL,
  entity_id     text        NOT NULL,
  template_slug text,
  titulo        text        NOT NULL,
  corpo         text,
  tipo          text        NOT NULL DEFAULT 'info',
  para          text        NOT NULL DEFAULT 'sdr',
  lido          boolean     NOT NULL DEFAULT false,
  lido_at       timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.internal_alerts
  ADD CONSTRAINT chk_ia_entity_type CHECK (entity_type IN ('lead', 'appointment', 'patient', 'budget')),
  ADD CONSTRAINT chk_ia_tipo        CHECK (tipo IN ('info', 'warning', 'error', 'success')),
  ADD CONSTRAINT chk_ia_para        CHECK (para IN ('sdr', 'secretaria', 'cs', 'gestao', 'clinica'));

CREATE INDEX IF NOT EXISTS idx_internal_alerts_clinic_lido
  ON public.internal_alerts (clinic_id, lido, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_internal_alerts_entity
  ON public.internal_alerts (clinic_id, entity_type, entity_id);

-- ── ALTER TABLE tags: adicionar colunas de metadados ─────────
ALTER TABLE public.tags
  ADD COLUMN IF NOT EXISTS group_slug        text,
  ADD COLUMN IF NOT EXISTS icon              text,
  ADD COLUMN IF NOT EXISTS kanban_coluna     text,
  ADD COLUMN IF NOT EXISTS cor_calendario    text,
  ADD COLUMN IF NOT EXISTS msg_template_id   text,
  ADD COLUMN IF NOT EXISTS alert_template_id text,
  ADD COLUMN IF NOT EXISTS task_template_id  text,
  ADD COLUMN IF NOT EXISTS proxima_acao      text,
  ADD COLUMN IF NOT EXISTS regras_aplicacao  text,
  ADD COLUMN IF NOT EXISTS incompativeis     text[] NOT NULL DEFAULT '{}';

-- ── RLS ──────────────────────────────────────────────────────

ALTER TABLE public.tag_groups          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_msg_templates   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_alert_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tag_task_templates  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.internal_alerts     ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tg_clinic_all"  ON public.tag_groups;
DROP POLICY IF EXISTS "tmt_clinic_all" ON public.tag_msg_templates;
DROP POLICY IF EXISTS "tat_clinic_all" ON public.tag_alert_templates;
DROP POLICY IF EXISTS "ttt_clinic_all" ON public.tag_task_templates;
DROP POLICY IF EXISTS "ia_clinic_all"  ON public.internal_alerts;

CREATE POLICY "tg_clinic_all"  ON public.tag_groups
  FOR ALL USING (clinic_id = _sdr_clinic_id());

CREATE POLICY "tmt_clinic_all" ON public.tag_msg_templates
  FOR ALL USING (clinic_id = _sdr_clinic_id());

CREATE POLICY "tat_clinic_all" ON public.tag_alert_templates
  FOR ALL USING (clinic_id = _sdr_clinic_id());

CREATE POLICY "ttt_clinic_all" ON public.tag_task_templates
  FOR ALL USING (clinic_id = _sdr_clinic_id());

CREATE POLICY "ia_clinic_all"  ON public.internal_alerts
  FOR ALL USING (clinic_id = _sdr_clinic_id());

-- ═══════════════════════════════════════════════════════════════
-- RPCs
-- ═══════════════════════════════════════════════════════════════

-- ── sdr_get_tag_groups ────────────────────────────────────────
-- Retorna todos os grupos de tags da clínica, ordenados por ordem.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdr_get_tag_groups()
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_clinic_id uuid := _sdr_clinic_id();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',        g.id,
        'slug',      g.slug,
        'nome',      g.nome,
        'cor',       g.cor,
        'icone',     g.icone,
        'descricao', g.descricao,
        'ordem',     g.ordem,
        'ativo',     g.ativo
      ) ORDER BY g.ordem
    )
    FROM tag_groups g
    WHERE g.clinic_id = v_clinic_id
  ), '[]'::jsonb);
END;
$$;

-- ── sdr_get_tags_by_group ─────────────────────────────────────
-- Retorna todas as tags de um grupo com todos os metadados.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdr_get_tags_by_group(p_group_slug text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_clinic_id uuid := _sdr_clinic_id();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',                t.id,
        'slug',              t.slug,
        'label',             t.label,
        'color',             t.color,
        'group_slug',        t.group_slug,
        'icon',              t.icon,
        'kanban_coluna',     t.kanban_coluna,
        'cor_calendario',    t.cor_calendario,
        'msg_template_id',   t.msg_template_id,
        'alert_template_id', t.alert_template_id,
        'task_template_id',  t.task_template_id,
        'proxima_acao',      t.proxima_acao,
        'regras_aplicacao',  t.regras_aplicacao,
        'incompativeis',     t.incompativeis,
        'is_active',         t.is_active,
        'sort_order',        t.sort_order
      ) ORDER BY t.sort_order
    )
    FROM tags t
    WHERE t.clinic_id = v_clinic_id
      AND t.group_slug = p_group_slug
  ), '[]'::jsonb);
END;
$$;

-- ── sdr_upsert_tag_group ──────────────────────────────────────
-- Cria ou atualiza um grupo de tags.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdr_upsert_tag_group(p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := _sdr_clinic_id();
  v_row       tag_groups;
BEGIN
  INSERT INTO tag_groups (clinic_id, slug, nome, cor, icone, descricao, ordem, ativo)
  VALUES (
    v_clinic_id,
    p_data->>'slug',
    p_data->>'nome',
    COALESCE(p_data->>'cor', '#6366f1'),
    p_data->>'icone',
    p_data->>'descricao',
    COALESCE((p_data->>'ordem')::int, 0),
    COALESCE((p_data->>'ativo')::boolean, true)
  )
  ON CONFLICT (clinic_id, slug) DO UPDATE SET
    nome       = EXCLUDED.nome,
    cor        = EXCLUDED.cor,
    icone      = EXCLUDED.icone,
    descricao  = EXCLUDED.descricao,
    ordem      = EXCLUDED.ordem,
    ativo      = EXCLUDED.ativo,
    updated_at = now()
  RETURNING * INTO v_row;

  RETURN jsonb_build_object('ok', true, 'data', row_to_json(v_row));
END;
$$;

-- ── sdr_upsert_tag_metadata ───────────────────────────────────
-- Atualiza os metadados de uma tag existente (colunas adicionadas
-- nesta migration). Identifica a tag por slug.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdr_upsert_tag_metadata(p_tag_slug text, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := _sdr_clinic_id();
  v_row       tags;
BEGIN
  UPDATE tags SET
    group_slug        = COALESCE(p_data->>'group_slug',       group_slug),
    icon              = COALESCE(p_data->>'icon',             icon),
    kanban_coluna     = COALESCE(p_data->>'kanban_coluna',    kanban_coluna),
    cor_calendario    = p_data->>'cor_calendario',
    msg_template_id   = p_data->>'msg_template_id',
    alert_template_id = p_data->>'alert_template_id',
    task_template_id  = p_data->>'task_template_id',
    proxima_acao      = COALESCE(p_data->>'proxima_acao',     proxima_acao),
    regras_aplicacao  = COALESCE(p_data->>'regras_aplicacao', regras_aplicacao),
    incompativeis     = CASE
                          WHEN p_data ? 'incompativeis'
                          THEN ARRAY(SELECT jsonb_array_elements_text(p_data->'incompativeis'))
                          ELSE incompativeis
                        END,
    updated_at        = now()
  WHERE clinic_id = v_clinic_id AND slug = p_tag_slug
  RETURNING * INTO v_row;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'tag não encontrada: ' || p_tag_slug);
  END IF;

  RETURN jsonb_build_object('ok', true, 'data', row_to_json(v_row));
END;
$$;

-- ── sdr_get_templates_config ──────────────────────────────────
-- Retorna templates de um tipo: 'msg', 'alert' ou 'task'.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdr_get_templates_config(p_type text)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_clinic_id uuid := _sdr_clinic_id();
BEGIN
  IF p_type = 'msg' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row_to_json(t.*) ORDER BY t.nome)
      FROM tag_msg_templates t
      WHERE t.clinic_id = v_clinic_id
    ), '[]'::jsonb);

  ELSIF p_type = 'alert' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row_to_json(t.*) ORDER BY t.nome)
      FROM tag_alert_templates t
      WHERE t.clinic_id = v_clinic_id
    ), '[]'::jsonb);

  ELSIF p_type = 'task' THEN
    RETURN COALESCE((
      SELECT jsonb_agg(row_to_json(t.*) ORDER BY t.nome)
      FROM tag_task_templates t
      WHERE t.clinic_id = v_clinic_id
    ), '[]'::jsonb);

  ELSE
    RETURN '[]'::jsonb;
  END IF;
END;
$$;

-- ── sdr_upsert_template ───────────────────────────────────────
-- Cria ou atualiza um template de mensagem, alerta ou tarefa.
-- p_type: 'msg' | 'alert' | 'task'
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdr_upsert_template(p_type text, p_data jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := _sdr_clinic_id();
  v_slug      text := p_data->>'slug';
BEGIN
  IF p_type = 'msg' THEN
    INSERT INTO tag_msg_templates (clinic_id, slug, nome, canal, conteudo, variaveis, ativo)
    VALUES (
      v_clinic_id, v_slug,
      p_data->>'nome',
      COALESCE(p_data->>'canal', 'whatsapp'),
      p_data->>'conteudo',
      ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_data->'variaveis', '[]'))),
      COALESCE((p_data->>'ativo')::boolean, true)
    )
    ON CONFLICT (clinic_id, slug) DO UPDATE SET
      nome       = EXCLUDED.nome,
      canal      = EXCLUDED.canal,
      conteudo   = EXCLUDED.conteudo,
      variaveis  = EXCLUDED.variaveis,
      ativo      = EXCLUDED.ativo,
      updated_at = now();

  ELSIF p_type = 'alert' THEN
    INSERT INTO tag_alert_templates (clinic_id, slug, nome, titulo, corpo, tipo, para, ativo)
    VALUES (
      v_clinic_id, v_slug,
      p_data->>'nome',
      p_data->>'titulo',
      p_data->>'corpo',
      COALESCE(p_data->>'tipo', 'info'),
      COALESCE(p_data->>'para', 'sdr'),
      COALESCE((p_data->>'ativo')::boolean, true)
    )
    ON CONFLICT (clinic_id, slug) DO UPDATE SET
      nome   = EXCLUDED.nome,
      titulo = EXCLUDED.titulo,
      corpo  = EXCLUDED.corpo,
      tipo   = EXCLUDED.tipo,
      para   = EXCLUDED.para,
      ativo  = EXCLUDED.ativo;

  ELSIF p_type = 'task' THEN
    INSERT INTO tag_task_templates (clinic_id, slug, nome, titulo, descricao, prazo_horas, prioridade, responsavel, ativo)
    VALUES (
      v_clinic_id, v_slug,
      p_data->>'nome',
      p_data->>'titulo',
      p_data->>'descricao',
      COALESCE((p_data->>'prazo_horas')::int, 24),
      COALESCE(p_data->>'prioridade', 'normal'),
      COALESCE(p_data->>'responsavel', 'sdr'),
      COALESCE((p_data->>'ativo')::boolean, true)
    )
    ON CONFLICT (clinic_id, slug) DO UPDATE SET
      nome        = EXCLUDED.nome,
      titulo      = EXCLUDED.titulo,
      descricao   = EXCLUDED.descricao,
      prazo_horas = EXCLUDED.prazo_horas,
      prioridade  = EXCLUDED.prioridade,
      responsavel = EXCLUDED.responsavel,
      ativo       = EXCLUDED.ativo;

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'tipo inválido: ' || p_type);
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── sdr_delete_template ───────────────────────────────────────
-- Remove um template pelo slug. Retorna quantas linhas foram deletadas.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdr_delete_template(p_type text, p_slug text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := _sdr_clinic_id();
  v_count     int;
BEGIN
  IF p_type = 'msg' THEN
    DELETE FROM tag_msg_templates   WHERE clinic_id = v_clinic_id AND slug = p_slug;
  ELSIF p_type = 'alert' THEN
    DELETE FROM tag_alert_templates WHERE clinic_id = v_clinic_id AND slug = p_slug;
  ELSIF p_type = 'task' THEN
    DELETE FROM tag_task_templates  WHERE clinic_id = v_clinic_id AND slug = p_slug;
  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'tipo inválido: ' || p_type);
  END IF;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'deleted', v_count);
END;
$$;

-- ── sdr_get_internal_alerts ───────────────────────────────────
-- Retorna alertas internos da clínica.
-- p_unread_only: se true, retorna apenas não lidos.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdr_get_internal_alerts(
  p_unread_only boolean DEFAULT false,
  p_limit       int     DEFAULT 50
)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_clinic_id uuid := _sdr_clinic_id();
BEGIN
  RETURN COALESCE((
    SELECT jsonb_agg(
      jsonb_build_object(
        'id',            a.id,
        'entity_type',   a.entity_type,
        'entity_id',     a.entity_id,
        'template_slug', a.template_slug,
        'titulo',        a.titulo,
        'corpo',         a.corpo,
        'tipo',          a.tipo,
        'para',          a.para,
        'lido',          a.lido,
        'created_at',    a.created_at
      ) ORDER BY a.created_at DESC
    )
    FROM (
      SELECT * FROM internal_alerts
      WHERE clinic_id = v_clinic_id
        AND (NOT p_unread_only OR lido = false)
      ORDER BY created_at DESC
      LIMIT p_limit
    ) a
  ), '[]'::jsonb);
END;
$$;

-- ── sdr_mark_alert_read ───────────────────────────────────────
-- Marca um alerta como lido.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdr_mark_alert_read(p_alert_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_clinic_id uuid := _sdr_clinic_id();
BEGIN
  UPDATE internal_alerts
  SET lido = true, lido_at = now()
  WHERE id = p_alert_id AND clinic_id = v_clinic_id;

  RETURN jsonb_build_object('ok', true);
END;
$$;

-- ── sdr_mark_all_alerts_read ──────────────────────────────────
-- Marca todos os alertas não lidos da clínica como lidos.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdr_mark_all_alerts_read()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := _sdr_clinic_id();
  v_count     int;
BEGIN
  UPDATE internal_alerts
  SET lido = true, lido_at = now()
  WHERE clinic_id = v_clinic_id AND lido = false;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'updated', v_count);
END;
$$;

-- ── sdr_create_internal_alert ─────────────────────────────────
-- Cria um alerta interno a partir de um template (slug) ou com
-- título/corpo/tipo/para explícitos.
-- Quando template_slug é fornecido, lê o template como fallback.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sdr_create_internal_alert(
  p_entity_type   text,
  p_entity_id     text,
  p_template_slug text    DEFAULT NULL,
  p_titulo        text    DEFAULT NULL,
  p_corpo         text    DEFAULT NULL,
  p_tipo          text    DEFAULT NULL,
  p_para          text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := _sdr_clinic_id();
  v_tmpl      tag_alert_templates;
  v_titulo    text;
  v_corpo     text;
  v_tipo      text;
  v_para      text;
  v_id        uuid;
BEGIN
  -- Carrega template se slug fornecido
  IF p_template_slug IS NOT NULL THEN
    SELECT * INTO v_tmpl
    FROM tag_alert_templates
    WHERE clinic_id = v_clinic_id AND slug = p_template_slug AND ativo = true;
  END IF;

  -- Override > template > fallback
  v_titulo := COALESCE(p_titulo, v_tmpl.titulo, 'Alerta interno');
  v_corpo  := COALESCE(p_corpo,  v_tmpl.corpo,  '');
  v_tipo   := COALESCE(p_tipo,   v_tmpl.tipo,   'info');
  v_para   := COALESCE(p_para,   v_tmpl.para,   'sdr');

  INSERT INTO internal_alerts
    (clinic_id, entity_type, entity_id, template_slug, titulo, corpo, tipo, para)
  VALUES
    (v_clinic_id, p_entity_type, p_entity_id, p_template_slug, v_titulo, v_corpo, v_tipo, v_para)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;
