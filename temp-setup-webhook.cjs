const fetch = require('node-fetch') || globalThis.fetch

const EVOLUTION_URL = 'https://evolution.px1hdq.easypanel.host'
const API_KEY = '429683C4C977415CAAFCCE10F7D57E11'
const INSTANCE = 'Mih'

const SUPABASE_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'

;(async () => {
  // 1. Ver webhook atual da instancia
  try {
    var r = await fetch(EVOLUTION_URL + '/webhook/find/' + INSTANCE, {
      headers: { 'apikey': API_KEY }
    })
    var data = await r.json()
    console.log('Webhook atual:', JSON.stringify(data, null, 2))
  } catch(e) { console.log('Erro ao buscar webhook:', e.message) }

  // 2. Ver config da instancia
  try {
    var r2 = await fetch(EVOLUTION_URL + '/instance/fetchInstances?instanceName=' + INSTANCE, {
      headers: { 'apikey': API_KEY }
    })
    var data2 = await r2.json()
    if (Array.isArray(data2) && data2[0]) {
      console.log('\nInstancia:', data2[0].instance?.instanceName, '| Status:', data2[0].instance?.status)
    }
  } catch(e) { console.log('Erro:', e.message) }
})()
