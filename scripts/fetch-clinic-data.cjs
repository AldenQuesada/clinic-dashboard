const { createClient } = require('@supabase/supabase-js')
const sb = createClient(
  'https://oqboitkpcvuaudouwvkl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'
)
;(async () => {
  const { data } = await sb.from('clinics').select('name,phone,whatsapp,email,website,address,social,operating_hours').limit(5)
  if (!data) { console.log('vazio'); return }
  data.forEach(c => {
    console.log('=== ' + c.name + ' ===')
    console.log('phone:', c.phone)
    console.log('whatsapp:', c.whatsapp)
    console.log('email:', c.email)
    console.log('website:', c.website)
    console.log('address:', JSON.stringify(c.address, null, 2))
    console.log('social:', JSON.stringify(c.social, null, 2))
    console.log('operating_hours:', JSON.stringify(c.operating_hours, null, 2))
    console.log('---')
  })
})()
