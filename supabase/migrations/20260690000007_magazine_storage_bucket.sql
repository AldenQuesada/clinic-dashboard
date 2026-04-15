-- ============================================================================
-- Beauty & Health Magazine — Storage bucket para assets
-- ============================================================================
-- Cria bucket 'magazine-assets' publico (read) e policies de upload para
-- usuarios authenticated. Leitura publica permite servir nas revistas sem
-- signed URL (otimiza CDN). Upload restrito a authenticated da clinica.
-- ============================================================================

-- Bucket publico (leitura sem auth). Arquivos servidos via CDN.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'magazine-assets',
  'magazine-assets',
  true,
  10485760,  -- 10 MB
  ARRAY['image/jpeg','image/png','image/webp','image/avif','image/gif','image/svg+xml']
)
ON CONFLICT (id) DO UPDATE
  SET public = EXCLUDED.public,
      file_size_limit = EXCLUDED.file_size_limit,
      allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- Policies
-- ----------------------------------------------------------------------------
-- Leitura publica (qualquer um pode ler)
DROP POLICY IF EXISTS "magazine_assets_public_read" ON storage.objects;
CREATE POLICY "magazine_assets_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'magazine-assets');

-- Upload: qualquer authenticated. Path convention: {clinic_id}/{edition_id|global}/{uuid}.ext
DROP POLICY IF EXISTS "magazine_assets_auth_insert" ON storage.objects;
CREATE POLICY "magazine_assets_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'magazine-assets');

-- Update/delete: apenas o dono (owner = auth.uid())
DROP POLICY IF EXISTS "magazine_assets_owner_update" ON storage.objects;
CREATE POLICY "magazine_assets_owner_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'magazine-assets' AND owner = auth.uid());

DROP POLICY IF EXISTS "magazine_assets_owner_delete" ON storage.objects;
CREATE POLICY "magazine_assets_owner_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'magazine-assets' AND owner = auth.uid());

-- ----------------------------------------------------------------------------
-- RPC helper para registrar o asset na tabela magazine_assets apos upload
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.magazine_register_asset(
  p_edition_id uuid,        -- null = asset global reutilizavel
  p_url        text,
  p_type       text,        -- image | audio | video
  p_alt        text DEFAULT NULL,
  p_width      int  DEFAULT NULL,
  p_height     int  DEFAULT NULL,
  p_size_kb    int  DEFAULT NULL,
  p_meta       jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_clinic_id uuid;
  v_asset_id uuid;
BEGIN
  -- Determina clinic_id: se edition_id foi passado, usa a clinica da edicao;
  -- senao, usa JWT claim.
  IF p_edition_id IS NOT NULL THEN
    SELECT clinic_id INTO v_clinic_id
    FROM public.magazine_editions WHERE id = p_edition_id;
    IF v_clinic_id IS NULL THEN
      RAISE EXCEPTION 'Edicao % nao encontrada', p_edition_id;
    END IF;
  ELSE
    v_clinic_id := public._mag_current_clinic_id();
    IF v_clinic_id IS NULL THEN
      RAISE EXCEPTION 'clinic_id nao definido no JWT';
    END IF;
  END IF;

  INSERT INTO public.magazine_assets (
    clinic_id, edition_id, url, type, alt, width, height, size_kb, meta, uploaded_by
  ) VALUES (
    v_clinic_id, p_edition_id, p_url, p_type, p_alt, p_width, p_height, p_size_kb, p_meta, auth.uid()
  )
  RETURNING id INTO v_asset_id;

  RETURN v_asset_id;
END $$;

REVOKE ALL ON FUNCTION public.magazine_register_asset(uuid,text,text,text,int,int,int,jsonb) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.magazine_register_asset(uuid,text,text,text,int,int,int,jsonb) TO authenticated;
