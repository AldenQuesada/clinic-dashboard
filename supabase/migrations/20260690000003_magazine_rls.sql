-- ============================================================================
-- Beauty & Health Magazine — Row Level Security
-- ============================================================================
-- Admin: apenas usuarios autenticados da mesma clinica podem editar.
-- Leitor publico: RPCs SECURITY DEFINER gerenciam leitura sem expor tabelas.
-- Regra de ouro: tabelas NUNCA acessadas diretamente por cliente publico.
-- ============================================================================

-- Habilita RLS em todas as tabelas
ALTER TABLE public.magazine_editions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.magazine_pages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.magazine_assets    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.magazine_reads     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.magazine_rewards   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.magazine_templates ENABLE ROW LEVEL SECURITY;

-- Helper: clinic_id do usuario autenticado (usa funcao padrao do sistema se existir,
-- senao usa JWT claim 'clinic_id'). Ajustar conforme convencao local.
CREATE OR REPLACE FUNCTION public._mag_current_clinic_id()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT COALESCE(
    (auth.jwt() ->> 'clinic_id')::uuid,
    NULL
  )
$$;

-- ----------------------------------------------------------------------------
-- magazine_templates — leitura publica (anon ve os templates ativos)
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS magazine_templates_select ON public.magazine_templates;
CREATE POLICY magazine_templates_select ON public.magazine_templates
  FOR SELECT USING (active = true);

DROP POLICY IF EXISTS magazine_templates_admin ON public.magazine_templates;
CREATE POLICY magazine_templates_admin ON public.magazine_templates
  FOR ALL TO authenticated
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- ----------------------------------------------------------------------------
-- magazine_editions — CRUD para clinic_id do usuario
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS magazine_editions_clinic ON public.magazine_editions;
CREATE POLICY magazine_editions_clinic ON public.magazine_editions
  FOR ALL TO authenticated
  USING (clinic_id = public._mag_current_clinic_id())
  WITH CHECK (clinic_id = public._mag_current_clinic_id());

-- ----------------------------------------------------------------------------
-- magazine_pages — CRUD para paginas de edicoes da clinica
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS magazine_pages_clinic ON public.magazine_pages;
CREATE POLICY magazine_pages_clinic ON public.magazine_pages
  FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.magazine_editions e
      WHERE e.id = magazine_pages.edition_id
        AND e.clinic_id = public._mag_current_clinic_id()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.magazine_editions e
      WHERE e.id = magazine_pages.edition_id
        AND e.clinic_id = public._mag_current_clinic_id()
    )
  );

-- ----------------------------------------------------------------------------
-- magazine_assets — CRUD por clinic_id
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS magazine_assets_clinic ON public.magazine_assets;
CREATE POLICY magazine_assets_clinic ON public.magazine_assets
  FOR ALL TO authenticated
  USING (clinic_id = public._mag_current_clinic_id())
  WITH CHECK (clinic_id = public._mag_current_clinic_id());

-- ----------------------------------------------------------------------------
-- magazine_reads — admin da clinica pode ler, leitor publico usa RPC
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS magazine_reads_clinic_select ON public.magazine_reads;
CREATE POLICY magazine_reads_clinic_select ON public.magazine_reads
  FOR SELECT TO authenticated
  USING (clinic_id = public._mag_current_clinic_id());

-- Insert/update publicos passam por RPC SECURITY DEFINER — nao ha policy publica direta.

-- ----------------------------------------------------------------------------
-- magazine_rewards — mesmo padrao de reads
-- ----------------------------------------------------------------------------
DROP POLICY IF EXISTS magazine_rewards_clinic_select ON public.magazine_rewards;
CREATE POLICY magazine_rewards_clinic_select ON public.magazine_rewards
  FOR SELECT TO authenticated
  USING (clinic_id = public._mag_current_clinic_id());
