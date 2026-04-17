-- ============================================================
-- Migration: Move "Consentimento Procedimento" de AFTER pra DURING
-- ============================================================
-- Regra atual dispara em on_finalize (pos-procedimento).
-- Mudanca: on_status='na_clinica' (quando paciente chega na clinica),
-- alinhado com a regra ja existente "Consentimento Imagem".
--
-- Fallback no modal de finalizacao (agenda-smart.js) cobre o caso de
-- paciente que pulou o status na_clinica direto pra finalizado.
-- ============================================================

UPDATE wa_agenda_automations
SET
  trigger_type     = 'on_status',
  trigger_config   = jsonb_build_object('status', 'na_clinica'),
  category         = 'during',
  content_template = $t$Ola, *{{nome}}*!

Antes de iniciarmos o procedimento de hoje, precisamos do seu consentimento.

Por favor, leia e confirme respondendo *ACEITO*:

Declaro que fui informada sobre o procedimento que sera realizado, seus beneficios, riscos e cuidados pos.

*{{clinica}}*$t$,
  updated_at       = now()
WHERE id = '61c3a415-f96e-460b-9f83-12aea5f8693c'
  AND name = 'Consentimento Procedimento';

-- Log de validacao: se a regra nao existir com esse ID, emite NOTICE
-- (pooler nao suporta RAISE em UPDATE sem returning — usar DO block).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM wa_agenda_automations
    WHERE id = '61c3a415-f96e-460b-9f83-12aea5f8693c'
      AND trigger_type = 'on_status'
      AND trigger_config->>'status' = 'na_clinica'
      AND category = 'during'
  ) THEN
    RAISE NOTICE 'AVISO: regra Consentimento Procedimento nao encontrada ou UPDATE nao aplicou como esperado';
  ELSE
    RAISE NOTICE 'OK: regra Consentimento Procedimento migrada para DURING (on_status=na_clinica)';
  END IF;
END $$;
