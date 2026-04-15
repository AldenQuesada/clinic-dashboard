-- ============================================================================
-- Beauty & Health Magazine — Schema base
-- ============================================================================
-- Modulo: revista digital mensal segmentada + gamificacao + dispatch automatico
-- Design: 5 tabelas + 1 registry de templates, todas com UUID, multi-tenant via clinic_id
-- Ver documento mestre: proposta-revista.html
-- ============================================================================

-- Garante extensao para gen_random_uuid() (PG13+)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. magazine_templates (registry global — compartilhado entre clinicas)
-- ----------------------------------------------------------------------------
-- Biblioteca de layouts pre-prontos. Admin escolhe template, preenche slots.
-- Nao tem clinic_id: templates sao recursos do produto, nao da clinica.
CREATE TABLE IF NOT EXISTS public.magazine_templates (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text        NOT NULL UNIQUE,                -- 't07_feature_double'
  name            text        NOT NULL,                       -- 'Materia Dupla'
  category        text        NOT NULL,                       -- cover | editorial | feature | visual | interactive | extra | back
  preview_svg     text,                                       -- inline SVG do thumbnail no picker
  slots_schema    jsonb       NOT NULL DEFAULT '{}'::jsonb,   -- {required:[], optional:[], types:{...}}
  html_template   text        NOT NULL,                       -- HTML com {{slot_name}} markers
  css_scoped      text,                                       -- CSS adicional (opcional)
  active          boolean     NOT NULL DEFAULT true,
  version         int         NOT NULL DEFAULT 1,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT magazine_templates_category_chk
    CHECK (category IN ('cover','editorial','feature','visual','interactive','extra','back','toc'))
);

CREATE INDEX IF NOT EXISTS magazine_templates_active_idx
  ON public.magazine_templates (active, category)
  WHERE active = true;

COMMENT ON TABLE public.magazine_templates IS
  'Biblioteca global de layouts da revista. Slug estavel (ex: t07_feature_double) usado em magazine_pages.template_slug.';

-- ----------------------------------------------------------------------------
-- 2. magazine_editions (cada edicao mensal)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.magazine_editions (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id              uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  slug                   text        NOT NULL,                     -- 'abril-2026'
  title                  text        NOT NULL,                     -- 'Smooth Eyes: o olhar que renasce'
  subtitle               text,
  edition_number         int,                                      -- 01, 02, 03... por clinica
  theme                  text,                                     -- tag editorial ('smooth-eyes', 'lifting-5d')
  status                 text        NOT NULL DEFAULT 'draft',     -- draft | published | archived
  hero_asset_id          uuid,                                     -- FK soft para magazine_assets.id
  cover_template_slug    text        REFERENCES public.magazine_templates(slug),
  personalization_config jsonb       NOT NULL DEFAULT '{}'::jsonb, -- {capa_com_nome:true, aniversariante_insert:true, ...}
  segment_versions       jsonb       NOT NULL DEFAULT '{}'::jsonb, -- overrides por segmento {vip:{extra_pages:[uuid]}, dormant:{short:true}}
  published_at           timestamptz,
  archived_at            timestamptz,
  created_by             uuid,                                     -- user id (auth.uid())
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT magazine_editions_status_chk
    CHECK (status IN ('draft','published','archived')),
  CONSTRAINT magazine_editions_slug_clinic_uk
    UNIQUE (clinic_id, slug)
);

CREATE INDEX IF NOT EXISTS magazine_editions_clinic_status_idx
  ON public.magazine_editions (clinic_id, status, published_at DESC);

CREATE INDEX IF NOT EXISTS magazine_editions_slug_idx
  ON public.magazine_editions (slug);

COMMENT ON TABLE public.magazine_editions IS
  'Edicoes da revista Beauty & Health. Uma linha por edicao publicada (mensal tipicamente). Slug unico por clinica usado em URLs publicas.';

-- ----------------------------------------------------------------------------
-- 3. magazine_pages (paginas de cada edicao)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.magazine_pages (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  edition_id        uuid        NOT NULL REFERENCES public.magazine_editions(id) ON DELETE CASCADE,
  order_index       int         NOT NULL,                           -- ordem visual (0-based)
  template_slug     text        NOT NULL REFERENCES public.magazine_templates(slug),
  slots             jsonb       NOT NULL DEFAULT '{}'::jsonb,       -- {titulo:"...", foto_hero:"uuid", corpo:"..."}
  segment_scope     text[]      NOT NULL DEFAULT ARRAY['all']::text[], -- ['all'] | ['vip'] | ['active','at_risk']
  is_hidden_icon_page boolean   NOT NULL DEFAULT false,             -- pagina contem o icone escondido
  hidden_icon_pos   jsonb,                                          -- {x_pct:0.3, y_pct:0.7}
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT magazine_pages_order_uk
    UNIQUE (edition_id, order_index) DEFERRABLE INITIALLY DEFERRED
);

CREATE INDEX IF NOT EXISTS magazine_pages_edition_order_idx
  ON public.magazine_pages (edition_id, order_index);

COMMENT ON TABLE public.magazine_pages IS
  'Paginas da edicao, ordenadas por order_index. segment_scope permite paginas exclusivas de segmento (ex: pagina bonus so VIPs veem).';

COMMENT ON COLUMN public.magazine_pages.segment_scope IS
  'Array de segmentos que veem esta pagina. [all] = todos. [vip,active] = apenas VIP e ativas. Leitor filtra no runtime.';

-- ----------------------------------------------------------------------------
-- 4. magazine_assets (imagens/audio/video por edicao)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.magazine_assets (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id   uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  edition_id  uuid        REFERENCES public.magazine_editions(id) ON DELETE CASCADE, -- null = asset reutilizavel
  url         text        NOT NULL,
  type        text        NOT NULL,                   -- image | audio | video
  alt         text,
  width       int,
  height      int,
  size_kb     int,
  srcset      jsonb,                                  -- {480w: url, 1600w: url, webp:{...}}
  meta        jsonb       NOT NULL DEFAULT '{}'::jsonb, -- exif, duration, etc
  uploaded_by uuid,
  created_at  timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT magazine_assets_type_chk
    CHECK (type IN ('image','audio','video'))
);

CREATE INDEX IF NOT EXISTS magazine_assets_edition_idx
  ON public.magazine_assets (edition_id);

CREATE INDEX IF NOT EXISTS magazine_assets_clinic_type_idx
  ON public.magazine_assets (clinic_id, type);

-- FK soft de editions.hero_asset_id apos assets existir
ALTER TABLE public.magazine_editions
  DROP CONSTRAINT IF EXISTS magazine_editions_hero_asset_fk;
ALTER TABLE public.magazine_editions
  ADD CONSTRAINT magazine_editions_hero_asset_fk
  FOREIGN KEY (hero_asset_id) REFERENCES public.magazine_assets(id) ON DELETE SET NULL;

COMMENT ON TABLE public.magazine_assets IS
  'Midias da revista. edition_id null = biblioteca global da clinica (reutilizavel). srcset armazena variantes responsivas geradas no upload.';

-- ----------------------------------------------------------------------------
-- 5. magazine_reads (tracking de leitura por lead)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.magazine_reads (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id           uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  edition_id          uuid        NOT NULL REFERENCES public.magazine_editions(id) ON DELETE CASCADE,
  lead_id             uuid        NOT NULL,                          -- soft ref (leads podem estar em varias origens)
  segment             text,                                          -- vip|active|at_risk|dormant|lead
  opened_at           timestamptz,
  last_page_index     int         NOT NULL DEFAULT 0,
  pages_completed     int[]       NOT NULL DEFAULT ARRAY[]::int[],   -- ordinais das paginas concluidas (>= 80% scroll)
  quiz_started        boolean     NOT NULL DEFAULT false,
  quiz_completed      boolean     NOT NULL DEFAULT false,
  hidden_icon_found   boolean     NOT NULL DEFAULT false,
  shared              boolean     NOT NULL DEFAULT false,
  time_spent_sec      int         NOT NULL DEFAULT 0,
  completed           boolean     NOT NULL DEFAULT false,            -- leu >= 80% das paginas
  personalizations    jsonb       NOT NULL DEFAULT '{}'::jsonb,      -- {name:'Fernanda', last_proc:'smooth-eyes'}
  user_agent          text,
  first_open_ip_hash  text,                                          -- hash (nao IP cru) p/ antifraude
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT magazine_reads_lead_edition_uk
    UNIQUE (edition_id, lead_id)
);

CREATE INDEX IF NOT EXISTS magazine_reads_clinic_edition_idx
  ON public.magazine_reads (clinic_id, edition_id);

CREATE INDEX IF NOT EXISTS magazine_reads_lead_idx
  ON public.magazine_reads (lead_id);

CREATE INDEX IF NOT EXISTS magazine_reads_completed_idx
  ON public.magazine_reads (edition_id, completed)
  WHERE completed = true;

COMMENT ON TABLE public.magazine_reads IS
  'Uma linha por (edicao, lead). Atualizada no tempo real conforme leitora navega. lead_id eh soft ref (sem FK) para manter flexibilidade entre origens de lead.';

-- ----------------------------------------------------------------------------
-- 6. magazine_rewards (recompensas distribuidas — cashback, VIP, etc)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.magazine_rewards (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id    uuid        NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  edition_id   uuid        NOT NULL REFERENCES public.magazine_editions(id) ON DELETE CASCADE,
  lead_id      uuid        NOT NULL,
  reward_type  text        NOT NULL,                   -- open | read_80 | quiz | hidden_icon | shared | invite
  amount       numeric(10,2) NOT NULL DEFAULT 0,
  cashback_tx_id uuid,                                 -- soft ref para transacao do cashback ja existente
  meta         jsonb       NOT NULL DEFAULT '{}'::jsonb,
  claimed_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT magazine_rewards_type_chk
    CHECK (reward_type IN ('open','read_80','quiz','hidden_icon','shared','invite','vip_access')),
  CONSTRAINT magazine_rewards_uk
    UNIQUE (edition_id, lead_id, reward_type)
);

CREATE INDEX IF NOT EXISTS magazine_rewards_lead_idx
  ON public.magazine_rewards (clinic_id, lead_id);

CREATE INDEX IF NOT EXISTS magazine_rewards_edition_idx
  ON public.magazine_rewards (edition_id);

COMMENT ON TABLE public.magazine_rewards IS
  'Recompensas creditadas pela revista. UNIQUE (edition, lead, type) previne credito duplicado. cashback_tx_id conecta ao sistema de cashback existente.';

-- ----------------------------------------------------------------------------
-- Triggers de updated_at
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._magazine_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS _magazine_editions_touch ON public.magazine_editions;
CREATE TRIGGER _magazine_editions_touch
  BEFORE UPDATE ON public.magazine_editions
  FOR EACH ROW EXECUTE FUNCTION public._magazine_touch_updated_at();

DROP TRIGGER IF EXISTS _magazine_pages_touch ON public.magazine_pages;
CREATE TRIGGER _magazine_pages_touch
  BEFORE UPDATE ON public.magazine_pages
  FOR EACH ROW EXECUTE FUNCTION public._magazine_touch_updated_at();

DROP TRIGGER IF EXISTS _magazine_reads_touch ON public.magazine_reads;
CREATE TRIGGER _magazine_reads_touch
  BEFORE UPDATE ON public.magazine_reads
  FOR EACH ROW EXECUTE FUNCTION public._magazine_touch_updated_at();

DROP TRIGGER IF EXISTS _magazine_templates_touch ON public.magazine_templates;
CREATE TRIGGER _magazine_templates_touch
  BEFORE UPDATE ON public.magazine_templates
  FOR EACH ROW EXECUTE FUNCTION public._magazine_touch_updated_at();
