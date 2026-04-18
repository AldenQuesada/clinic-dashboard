// Cria bucket privado facial-shares no Supabase Storage.
// Privado = arquivos nao sao acessiveis sem signed URL.
const { createClient } = require('@supabase/supabase-js')
const url = 'https://oqboitkpcvuaudouwvkl.supabase.co'
const serviceKey = process.env.SUPABASE_SERVICE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTczMzMyOTI4NSwiZXhwIjoyMDQ4OTA1Mjg1fQ.TRb1ICf4n3l0GfXZN7Q-0Fr8d1dEILPNMP4vOg83Tno'
;(async () => {
  const sb = createClient(url, serviceKey)
  const { data: existing } = await sb.storage.listBuckets()
  if (existing && existing.find(b => b.name === 'facial-shares')) {
    console.log('Bucket facial-shares ja existe.')
    return
  }
  const { data, error } = await sb.storage.createBucket('facial-shares', {
    public: false,                    // privado — apenas signed URL acessa
    allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'],
    fileSizeLimit: 5 * 1024 * 1024,   // 5 MB por imagem
  })
  if (error) { console.error('Erro:', error.message); process.exit(1) }
  console.log('Bucket criado:', data)
})()
