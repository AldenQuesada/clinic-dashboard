-- Ativar RLS segura: substitui allow_all por policy baseada em x-clinic-secret header
-- O header é enviado automaticamente pelo cliente JS via supabase.js

-- clinic_data: tabela legada de sync
DROP POLICY IF EXISTS "allow_all" ON public.clinic_data;
DROP POLICY IF EXISTS "clinic_secret_only" ON public.clinic_data;

CREATE POLICY "clinic_secret_only" ON public.clinic_data
  FOR ALL
  USING (
    current_setting('request.headers', true)::jsonb->>'x-clinic-secret'
    = '0b6e63c7c320a5211d9bea3145416b33b0cc070de170ebe05c07d0b8914ab5fa'
  )
  WITH CHECK (
    current_setting('request.headers', true)::jsonb->>'x-clinic-secret'
    = '0b6e63c7c320a5211d9bea3145416b33b0cc070de170ebe05c07d0b8914ab5fa'
  );
