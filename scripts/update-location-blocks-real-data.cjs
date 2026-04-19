/**
 * Atualiza os 4 blocos location-* da LP /instagram-v2
 * com dados REAIS da Clínica Mirian de Paula puxados do banco.
 */
const { createClient } = require('@supabase/supabase-js')
const sb = createClient(
  'https://oqboitkpcvuaudouwvkl.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'
)

const REAL_DATA = {
  whatsapp_url: 'https://wa.me/5544991622986',
  whatsapp_label_short: 'WhatsApp',
  whatsapp_label_long:  'Falar no WhatsApp',
  whatsapp_label_agendar: 'Agendar pelo WhatsApp',
  maps_url: 'https://maps.app.goo.gl/VCxLkAL6m15JLnaV7',
  waze_url: 'https://waze.com/ul?q=Av+Carneiro+Leao+296+Maringa',
  ios_maps_url: 'maps://?q=Av+Carneiro+Leao+296+Maringa',
  android_geo_url: 'geo:0,0?q=Av+Carneiro+Leao+296+Maringa',
  clinic_name: 'Clínica Mirian de Paula',
  city: 'Maringá / PR · CEP 87014-010',
}

const BLOCK_UPDATES = {
  'location-map': {
    address: 'Av. Carneiro Leão, 296 · Sala 806',
    city:    REAL_DATA.city,
    hours_summary: 'Seg a Sex 8h-20h · Sáb 8h-14h',
    show_open_status: true,
    whatsapp_url:   REAL_DATA.whatsapp_url,
    whatsapp_label: REAL_DATA.whatsapp_label_short,
    maps_url:       REAL_DATA.maps_url,
    maps_label:     'Maps',
    show_waze:      true,
    waze_url:       REAL_DATA.waze_url,
    waze_label:     'Waze',
  },
  'location-facade': {
    address: 'Av. Carneiro Leão, 296 · Sala 806 · Maringá/PR',
    chip_1: 'Centro Comercial Monumental',
    chip_2: 'Sala 806',
    chip_3: 'Zona Armazém · Maringá',
    chip_4: 'CEP 87014-010',
    whatsapp_url:   REAL_DATA.whatsapp_url,
    whatsapp_label: REAL_DATA.whatsapp_label_long,
    maps_url:       REAL_DATA.maps_url,
    maps_label:     'Como chegar',
  },
  'location-story': {
    address: 'Av. Carneiro Leão, 296\nSala 806 · Centro Comercial Monumental\nMaringá/PR · CEP 87014-010',
    hours_weekday:  'Seg a Sex · 08h às 12h e 13h30 às 20h',
    hours_saturday: 'Sábado · 08h às 14h',
    hours_sunday:   'Domingo · Fechado',
    chip_1: 'Centro Comercial Monumental',
    chip_2: 'Zona Armazém · Maringá',
    chip_3: 'Atendimento personalizado',
    whatsapp_url:   REAL_DATA.whatsapp_url,
    whatsapp_label: REAL_DATA.whatsapp_label_agendar,
  },
  'location-iphone': {
    clinic_name:     REAL_DATA.clinic_name,
    address:         'Av. Carneiro Leão, 296 · Sala 806 · Maringá/PR',
    rating:          '5,0',          // user atualiza manual quando informar
    reviews_count:   '0',            // user atualiza manual quando informar
    open_status:     'Aberto · Fecha às 20h',
    maps_url:        REAL_DATA.maps_url,
    ios_maps_url:    REAL_DATA.ios_maps_url,
    android_geo_url: REAL_DATA.android_geo_url,
    cta_label:       'Abrir no meu Maps',
  },
}

;(async () => {
  const { data: page, error } = await sb
    .from('lp_pages').select('id, blocks').eq('slug', 'instagram-v2').single()
  if (error || !page) { console.error(error); process.exit(1) }

  let updates = 0
  const blocks = (page.blocks || []).map(b => {
    if (!BLOCK_UPDATES[b.type]) return b
    updates++
    return Object.assign({}, b, {
      props: Object.assign({}, b.props || {}, BLOCK_UPDATES[b.type]),
    })
  })

  if (!updates) { console.log('Nenhum bloco location-* na LP'); process.exit(0) }

  const { error: upErr } = await sb
    .from('lp_pages')
    .update({ blocks, updated_at: new Date().toISOString() })
    .eq('id', page.id)
  if (upErr) { console.error(upErr); process.exit(1) }

  console.log(`OK · ${updates} bloco(s) location-* atualizados com dados REAIS da Clinica Mirian de Paula`)
  Object.keys(BLOCK_UPDATES).forEach(t => console.log(`  · ${t}`))
})()
