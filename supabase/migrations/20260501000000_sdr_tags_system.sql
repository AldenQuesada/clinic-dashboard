-- ============================================================
-- Migration: 002 — SDR: Sistema de Tags
-- Sprint 8 — SDR Module Foundation
--
-- Tabelas criadas:
--   tags             → catálogo de tags disponíveis
--   tag_assignments  → atribuições de tags a entidades
--   tag_conflicts    → regras de exclusividade entre tags
--
-- Princípio: tag é gatilho/contexto — não guarda estado,
-- apenas sinaliza intenção para o motor de regras.
--
-- entity_type suportados: lead | appointment | patient | budget
-- ============================================================

-- ── Tabela: tags ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tags (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,

  slug         text NOT NULL,          -- ex: lead.quente, appointment.confirmado
  label        text NOT NULL,          -- ex: "Lead Quente", "Confirmado"
  description  text,                   -- opcional: quando usar essa tag
  color        text NOT NULL DEFAULT '#6366f1', -- hex para badge UI

  entity_type  text NOT NULL,          -- lead | appointment | patient | budget
  category     text NOT NULL,          -- temperatura | prioridade | status_contato | etc
  is_exclusive boolean NOT NULL DEFAULT false, -- só 1 tag desta category por vez
  is_system    boolean NOT NULL DEFAULT false, -- tags do sistema (não deletáveis)
  is_active    boolean NOT NULL DEFAULT true,

  sort_order   int NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  UNIQUE (clinic_id, slug)
);

ALTER TABLE public.tags
  ADD CONSTRAINT chk_tags_entity_type
    CHECK (entity_type IN ('lead', 'appointment', 'patient', 'budget')),
  ADD CONSTRAINT chk_tags_color
    CHECK (color ~ '^#[0-9A-Fa-f]{6}$');

-- ── Tabela: tag_assignments ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tag_assignments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_id       uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,

  entity_type  text NOT NULL,          -- lead | appointment | patient | budget
  entity_id    text NOT NULL,          -- leads.id é text — usar text aqui

  assigned_by  uuid REFERENCES auth.users(id),
  assigned_at  timestamptz NOT NULL DEFAULT now(),
  expires_at   timestamptz,            -- para tags temporais (lembrete_24h, etc)
  removed_at   timestamptz,            -- soft delete para histórico
  removed_by   uuid REFERENCES auth.users(id),
  origin       text NOT NULL DEFAULT 'manual', -- manual | rule | import | system

  UNIQUE (tag_id, entity_type, entity_id)  -- sem duplicatas ativas
);

ALTER TABLE public.tag_assignments
  ADD CONSTRAINT chk_tag_assignments_entity_type
    CHECK (entity_type IN ('lead', 'appointment', 'patient', 'budget')),
  ADD CONSTRAINT chk_tag_assignments_origin
    CHECK (origin IN ('manual', 'rule', 'import', 'system'));

-- ── Tabela: tag_conflicts ─────────────────────────────────────
-- Define que quando tag A é atribuída, tag B deve ser removida
-- Usado para exclusividade semântica (ex: frio ↔ quente)
CREATE TABLE IF NOT EXISTS public.tag_conflicts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  tag_a_id     uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  tag_b_id     uuid NOT NULL REFERENCES public.tags(id) ON DELETE CASCADE,
  -- quando tag_a é adicionada, tag_b é removida (e vice-versa se bidirectional=true)
  bidirectional boolean NOT NULL DEFAULT true,

  UNIQUE (tag_a_id, tag_b_id)
);

-- ── Índices ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_tags_clinic_entity
  ON public.tags (clinic_id, entity_type) WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_tags_slug
  ON public.tags (clinic_id, slug);

CREATE INDEX IF NOT EXISTS idx_tag_assignments_entity
  ON public.tag_assignments (entity_type, entity_id) WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tag_assignments_tag
  ON public.tag_assignments (tag_id) WHERE removed_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_tag_assignments_expires
  ON public.tag_assignments (expires_at) WHERE expires_at IS NOT NULL AND removed_at IS NULL;

-- ── Trigger: updated_at ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_updated_at_sdr()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tags_updated_at
  BEFORE UPDATE ON public.tags
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_sdr();

-- ============================================================
-- VERIFICAÇÃO:
-- SELECT * FROM public.tags WHERE clinic_id = '<seu_clinic_id>' LIMIT 5;
-- SELECT COUNT(*) FROM public.tag_assignments;
-- ============================================================
