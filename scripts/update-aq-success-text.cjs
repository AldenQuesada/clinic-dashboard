const { createClient } = require('@supabase/supabase-js')
const sb = createClient(
  'https://oqboitkpcvuaudouwvkl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'
)
;(async () => {
  const { data: page } = await sb.from('lp_pages').select('id, blocks').eq('slug', 'instagram-v2').single()
  const blocks = (page.blocks || []).map(b => {
    if (b.type !== 'anatomy-quiz') return b
    return Object.assign({}, b, {
      props: Object.assign({}, b.props || {}, {
        success_text: 'Obrigada [nome] · já recebi suas respostas aqui e alguém da minha equipe vai te chamar na sequência. Beijos, Mirian.'
      })
    })
  })
  await sb.from('lp_pages').update({ blocks, updated_at: new Date().toISOString() }).eq('id', page.id)
  console.log('OK · success_text atualizado no anatomy-quiz da /instagram-v2')
})()
