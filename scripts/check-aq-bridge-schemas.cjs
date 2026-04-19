const { createClient } = require('@supabase/supabase-js')
const sb = createClient(
  'https://oqboitkpcvuaudouwvkl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'
)
;(async () => {
  for (const tbl of ['leads','patients','appointments','lp_leads','wa_outbox']) {
    const { data, error } = await sb.from(tbl).select('*').limit(1)
    console.log(`\n=== ${tbl} ===`)
    if (error) { console.log('ERR:', error.message); continue }
    if (!data || !data.length) { console.log('(vazia)'); continue }
    console.log('cols:', Object.keys(data[0]).join(', '))
  }
})()
