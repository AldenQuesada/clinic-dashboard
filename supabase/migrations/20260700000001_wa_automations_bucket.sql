-- ============================================================
-- Migration: Bucket Supabase para imagens de automacoes WA
-- Data: 2026-04-16
-- Objetivo: Armazenar imagens anexadas em regras de wa_agenda_automations
-- ============================================================

BEGIN;

-- 1. Cria bucket se nao existir (publico para read)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wa-automations',
  'wa-automations',
  true,
  10485760, -- 10 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 10485760,
  allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- 2. Policy de leitura publica
DROP POLICY IF EXISTS "wa_automations_public_read" ON storage.objects;
CREATE POLICY "wa_automations_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'wa-automations');

-- 3. Policy de upload autenticado
DROP POLICY IF EXISTS "wa_automations_auth_upload" ON storage.objects;
CREATE POLICY "wa_automations_auth_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'wa-automations');

-- 4. Policy de delete autenticado (so owner)
DROP POLICY IF EXISTS "wa_automations_auth_delete" ON storage.objects;
CREATE POLICY "wa_automations_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'wa-automations' AND auth.uid() = owner);

-- 5. Policy de update autenticado
DROP POLICY IF EXISTS "wa_automations_auth_update" ON storage.objects;
CREATE POLICY "wa_automations_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'wa-automations' AND auth.uid() = owner);

COMMIT;
