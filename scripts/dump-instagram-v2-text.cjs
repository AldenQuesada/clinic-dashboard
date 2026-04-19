const { createClient } = require('@supabase/supabase-js')
const sb = createClient(
  'https://oqboitkpcvuaudouwvkl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'
)

const TEXT_KEYS = ['eyebrow','titulo','title','h2','headline','subtitle','subheadline','address','city','procedure','detail','label_before','label_after','chip_1','chip_2','chip_3','chip_4','clinic_name','open_status','cta_label','whatsapp_label','maps_label','waze_label','hours_summary','hours_weekday','hours_saturday','hours_sunday','success_text','message','intro','description','copyright','tagline']

;(async () => {
  const { data: page } = await sb.from('lp_pages').select('blocks').eq('slug', 'instagram-v2').single()
  const blocks = page?.blocks || []
  blocks.forEach((b, i) => {
    console.log(`\n[${i}] ${b.type}`)
    const p = b.props || {}
    TEXT_KEYS.forEach(k => {
      if (p[k] != null && String(p[k]).trim()) {
        console.log(`  ${k}: ${JSON.stringify(p[k])}`)
      }
    })
    // slides arrays
    if (Array.isArray(p.slides)) {
      p.slides.forEach((s, j) => {
        if (!s) return
        var hasText = ['procedure','detail','label_before','label_after'].some(k => s[k])
        if (hasText) {
          console.log(`  slides[${j}]:`)
          ;['procedure','detail','label_before','label_after'].forEach(k => {
            if (s[k]) console.log(`    ${k}: ${JSON.stringify(s[k])}`)
          })
        }
      })
    }
    if (Array.isArray(p.items)) {
      p.items.forEach((it, j) => {
        if (!it) return
        var keys = Object.keys(it).filter(k => typeof it[k] === 'string' && it[k].trim())
        if (keys.length) console.log(`  items[${j}]:`, JSON.stringify(it))
      })
    }
  })
})()
