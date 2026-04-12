import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SUPABASE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST', 'Access-Control-Allow-Headers': 'Content-Type' } })
  }

  try {
    const body = await req.json()

    // Evolution API v2 envia no formato:
    // { event: "messages.upsert", data: { key: { remoteJid, fromMe }, message: { conversation }, pushName } }
    const event = body.event || ''
    if (event !== 'messages.upsert' && event !== 'MESSAGES_UPSERT') {
      return Response.json({ ok: true, skip: 'not a message event' })
    }

    const data = body.data || body
    const key = data.key || {}
    const fromMe = key.fromMe || false

    // Ignorar mensagens enviadas pela clinica (outbound)
    if (fromMe) {
      return Response.json({ ok: true, skip: 'outbound' })
    }

    // Extrair telefone do remoteJid (formato: 5544998787673@s.whatsapp.net)
    const remoteJid = key.remoteJid || ''
    const phone = remoteJid.replace('@s.whatsapp.net', '').replace('@g.us', '')
    if (!phone || phone.includes('-')) {
      return Response.json({ ok: true, skip: 'group or invalid' })
    }

    // Extrair conteudo
    const msg = data.message || {}
    const content = msg.conversation || msg.extendedTextMessage?.text || msg.imageMessage?.caption || ''
    const pushName = data.pushName || ''
    const waMessageId = key.id || ''
    const mediaUrl = msg.imageMessage?.url || msg.videoMessage?.url || null

    if (!content && !mediaUrl) {
      return Response.json({ ok: true, skip: 'empty message' })
    }

    // Chamar RPC wa_receive_inbound
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY)
    const { data: result, error } = await sb.rpc('wa_receive_inbound', {
      p_phone: phone,
      p_content: content || '[midia]',
      p_wa_message_id: waMessageId,
      p_media_url: mediaUrl,
      p_sender_name: pushName,
    })

    if (error) {
      console.error('RPC error:', error)
      return Response.json({ ok: false, error: error.message }, { status: 500 })
    }

    return Response.json(result)
  } catch (e) {
    console.error('Webhook error:', e)
    return Response.json({ ok: false, error: e.message }, { status: 500 })
  }
})
