-- Add missing DELETE policy on appointments.
-- Sem esta policy, DELETE falha silenciosamente (0 linhas afetadas) sob RLS.
-- Mesmo padrão do appt_update: criador ou owner/admin/receptionist.

DROP POLICY IF EXISTS "appt_delete" ON public.appointments;
CREATE POLICY "appt_delete"
  ON public.appointments FOR DELETE
  USING (
    clinic_id = app_clinic_id()
    AND (
      professional_id = auth.uid()
      OR app_role() IN ('owner','admin','receptionist')
    )
  );
