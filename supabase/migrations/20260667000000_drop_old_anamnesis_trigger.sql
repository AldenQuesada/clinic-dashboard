-- ============================================================
-- Migration: drop trigger duplicado fn_anamnesis_to_medical_record
-- ============================================================
-- Dois triggers fazem a mesma coisa (criar medical_record a partir
-- de uma anamnese completada):
--
--   1. trg_anamnesis_to_medical_record → fn_anamnesis_to_medical_record
--      (antigo, com bug de tipo: WHERE patient_id = NEW.patient_id::text
--       em medical_records.patient_id que é UUID → erro 42883)
--
--   2. trg_anamnesis_to_prontuario → _create_prontuario_from_anamnesis
--      (novo, id determinístico, protection com EXCEPTION handler,
--       conteúdo formatado com respostas)
--
-- O antigo é redundante e quebra o complete_anamnesis_form RPC.
-- Removemos só o trigger, mantemos a função por compat (pode ser
-- chamada manualmente por alguém em algum lugar).
-- ============================================================

DROP TRIGGER IF EXISTS trg_anamnesis_to_medical_record ON public.anamnesis_responses;

-- Opcional: deixar a função com comentário indicando que foi depreciada
COMMENT ON FUNCTION public.fn_anamnesis_to_medical_record() IS
  'DEPRECIADO 2026-04-12: trigger removido. Substituído por _create_prontuario_from_anamnesis (trg_anamnesis_to_prontuario). A função ainda existe para compat retroativa mas não deve ser chamada.';
