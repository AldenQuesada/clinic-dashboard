-- ============================================================
-- Migration: appointments — schema canônico (procedimentos + pagamentos)
-- ============================================================
-- Adiciona 2 colunas jsonb pra persistir os arrays canônicos do
-- schema frontend: procedimentos[] e pagamentos[].
--
-- O appt_upsert agora também lê esses arrays do p_data e grava
-- nas colunas novas. Mantém compat com pagamentoDetalhes antigo
-- (lê, não escreve).
-- ============================================================

ALTER TABLE public.appointments
  ADD COLUMN IF NOT EXISTS procedimentos jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS pagamentos    jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.appointments.procedimentos IS 'Array canônico [{nome, valor, cortesia, cortesiaMotivo, retornoTipo, retornoIntervalo, realizado, realizadoEm}]';
COMMENT ON COLUMN public.appointments.pagamentos IS 'Array canônico [{forma, valor, status, parcelas, valorParcela, comentario, ...}]';

CREATE INDEX IF NOT EXISTS idx_appts_procedimentos_gin
  ON public.appointments USING gin (procedimentos)
  WHERE jsonb_array_length(procedimentos) > 0;

CREATE INDEX IF NOT EXISTS idx_appts_pagamentos_gin
  ON public.appointments USING gin (pagamentos)
  WHERE jsonb_array_length(pagamentos) > 0;

-- ── appt_upsert: patch pra ler e gravar os arrays canônicos ──
-- NÃO re-criamos o RPC inteiro (muito risco). Usamos uma função
-- complementar appt_set_canonical que é chamada pelo repo após
-- o upsert principal, igual fizemos com appt_set_cortesia.

DROP FUNCTION IF EXISTS public.appt_set_canonical(text, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.appt_set_canonical(
  p_id            text,
  p_procedimentos jsonb DEFAULT '[]',
  p_pagamentos    jsonb DEFAULT '[]'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid := app_clinic_id();
  v_role      text := app_role();
BEGIN
  IF v_clinic_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;
  IF v_role NOT IN ('owner','admin','receptionist','therapist') THEN
    RAISE EXCEPTION 'Permissão insuficiente';
  END IF;

  UPDATE public.appointments
     SET procedimentos = COALESCE(p_procedimentos, '[]'::jsonb),
         pagamentos    = COALESCE(p_pagamentos,    '[]'::jsonb),
         updated_at    = now()
   WHERE id = p_id
     AND clinic_id = v_clinic_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Appointment não encontrado');
  END IF;

  RETURN jsonb_build_object('ok', true);
END;
$$;

REVOKE ALL ON FUNCTION public.appt_set_canonical(text, jsonb, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.appt_set_canonical(text, jsonb, jsonb) TO authenticated;
