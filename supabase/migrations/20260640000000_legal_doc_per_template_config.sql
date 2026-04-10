-- ============================================================
-- Migration: 20260640000000 — Per-Template Config
--
-- Cada template tem seu profissional, pixels e redirect.
-- Permite contas de anuncio separadas por especialista.
-- ============================================================

ALTER TABLE public.legal_doc_templates ADD COLUMN IF NOT EXISTS professional_id uuid REFERENCES public.professional_profiles(id);
ALTER TABLE public.legal_doc_templates ADD COLUMN IF NOT EXISTS tracking_scripts text;
ALTER TABLE public.legal_doc_templates ADD COLUMN IF NOT EXISTS redirect_url text;

COMMENT ON COLUMN public.legal_doc_templates.professional_id IS 'Profissional responsavel padrao (null = usar do agendamento)';
COMMENT ON COLUMN public.legal_doc_templates.tracking_scripts IS 'Scripts de rastreamento exclusivos deste template (HTML com <script>)';
COMMENT ON COLUMN public.legal_doc_templates.redirect_url IS 'URL de redirect apos assinatura (null = config global da clinica)';

-- Atualizar RPCs para aceitar e retornar os novos campos
-- (ver legal_doc_upsert_template e legal_doc_list_templates atualizados no banco)
