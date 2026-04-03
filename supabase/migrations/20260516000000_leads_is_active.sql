-- Adiciona campo is_active na tabela leads
-- true = lead ativo (padrão), false = lead desativado

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_leads_is_active
  ON public.leads (is_active) WHERE is_active = false;

-- Todos os leads existentes ficam ativos
UPDATE public.leads SET is_active = true WHERE is_active IS NULL;
