const { createClient } = require('@supabase/supabase-js')
const sb = createClient(
  'https://oqboitkpcvuaudouwvkl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'
)

const NEW_BLOCK = {
  type: 'photo-gallery',
  props: {
    eyebrow: 'Galeria',
    titulo: 'Por dentro da clínica',
    aspect: '4/5',
    autoplay_slides: true,
    slides_interval: 4,
    bg: 'graphite',
    photos: [
      { url: '', caption: 'Fachada · Centro Comercial Monumental' },
      { url: '', caption: 'Recepção · Sala 806' },
      { url: '', caption: 'Sala de procedimento' },
    ],
  },
}

;(async () => {
  const { data: page } = await sb.from('lp_pages').select('id, blocks').eq('slug', 'instagram-v2').single()
  if (!page) { console.error('LP nao encontrada'); process.exit(1) }

  const blocks = (page.blocks || []).slice()
  if (blocks.some(b => b.type === 'photo-gallery')) {
    console.log('photo-gallery ja existe · nada a fazer')
    process.exit(0)
  }
  const footerIdx = blocks.findIndex(b => b.type === 'footer')
  const insertAt = footerIdx >= 0 ? footerIdx : blocks.length
  blocks.splice(insertAt, 0, NEW_BLOCK)

  await sb.from('lp_pages').update({ blocks, updated_at: new Date().toISOString() }).eq('id', page.id)
  console.log(`OK · photo-gallery adicionado na posicao ${insertAt} (com 3 fotos placeholder · sobe pelo Inspector)`)
})()
