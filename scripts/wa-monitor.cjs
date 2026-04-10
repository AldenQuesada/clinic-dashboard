/**
 * WhatsApp Monitor — ClinicAI
 * Consulta Supabase a cada 1 minuto e gera relatorio de mensagens
 * Uso: node scripts/wa-monitor.cjs
 */

const SUPABASE_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'

const INTERVAL_MS = 60_000 // 1 minuto
let lastCheck = new Date(Date.now() - INTERVAL_MS).toISOString()

async function query(table, params) {
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`)
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.set(k, v)
  }
  const res = await fetch(url.toString(), {
    headers: {
      apikey: SUPABASE_KEY,
      Authorization: `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'count=exact',
    },
  })
  const count = res.headers.get('content-range')
  const data = await res.json()
  return { data, count }
}

function truncate(str, len = 60) {
  if (!str) return '(vazio)'
  return str.length > len ? str.slice(0, len) + '...' : str
}

function fmtTime(iso) {
  if (!iso) return '--'
  const d = new Date(iso)
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

function fmtPhone(phone) {
  if (!phone) return '???'
  // mostrar so ultimos 4 digitos por privacidade
  return '...' + phone.slice(-4)
}

async function checkMessages(since) {
  // Inbound messages
  const inbound = await query('wa_messages', {
    select: 'id,conversation_id,content,content_type,sender,created_at,status,error_message',
    direction: 'eq.inbound',
    'created_at': `gte.${since}`,
    order: 'created_at.asc',
    limit: '100',
  })

  // Outbound messages
  const outbound = await query('wa_messages', {
    select: 'id,conversation_id,content,content_type,sender,created_at,status,error_message',
    direction: 'eq.outbound',
    'created_at': `gte.${since}`,
    order: 'created_at.asc',
    limit: '100',
  })

  // Failed messages (from wa_messages)
  const failed = await query('wa_messages', {
    select: 'id,conversation_id,content,content_type,sender,direction,created_at,error_message',
    status: 'eq.failed',
    'created_at': `gte.${since}`,
    order: 'created_at.asc',
    limit: '50',
  })

  // Outbox errors (pending/failed in outbox)
  const outboxErrors = await query('wa_outbox', {
    select: 'id,phone,content,status,error_message,attempts,max_attempts,created_at,processed_at',
    status: 'eq.failed',
    'created_at': `gte.${since}`,
    order: 'created_at.asc',
    limit: '50',
  })

  // Outbox pending (queue status)
  const outboxPending = await query('wa_outbox', {
    select: 'id,phone,content,status,created_at',
    status: 'eq.pending',
    order: 'created_at.asc',
    limit: '50',
  })

  return {
    inbound: inbound.data || [],
    outbound: outbound.data || [],
    failed: failed.data || [],
    outboxErrors: outboxErrors.data || [],
    outboxPending: outboxPending.data || [],
  }
}

async function getConversationPhones(convIds) {
  if (!convIds.length) return {}
  const filter = convIds.map(id => `"${id}"`).join(',')
  const res = await query('wa_conversations', {
    select: 'id,phone,display_name',
    id: `in.(${convIds.join(',')})`,
  })
  const map = {}
  for (const c of (res.data || [])) {
    map[c.id] = { phone: c.phone, name: c.display_name }
  }
  return map
}

function separator() {
  return '─'.repeat(70)
}

async function runReport() {
  const now = new Date()
  const since = lastCheck

  console.log('')
  console.log('='.repeat(70))
  console.log(`  WHATSAPP MONITOR — ${now.toLocaleString('pt-BR')}`)
  console.log(`  Periodo: ${fmtTime(since)} ate ${fmtTime(now.toISOString())}`)
  console.log('='.repeat(70))

  try {
    const data = await checkMessages(since)

    // Coletar conversation IDs para resolver nomes
    const allConvIds = new Set()
    for (const m of [...data.inbound, ...data.outbound, ...data.failed]) {
      if (m.conversation_id) allConvIds.add(m.conversation_id)
    }
    const convMap = await getConversationPhones([...allConvIds])

    // --- ENTRADAS (Inbound) ---
    console.log('')
    console.log(`  ENTRADAS (inbound): ${data.inbound.length} mensagens`)
    console.log(separator())
    if (data.inbound.length === 0) {
      console.log('  (nenhuma mensagem recebida)')
    } else {
      for (const m of data.inbound) {
        const conv = convMap[m.conversation_id] || {}
        const name = conv.name || fmtPhone(conv.phone)
        const type = m.content_type !== 'text' ? ` [${m.content_type}]` : ''
        console.log(`  ${fmtTime(m.created_at)} | ${name} | ${truncate(m.content)}${type}`)
      }
    }

    // --- SAIDAS (Outbound) ---
    console.log('')
    console.log(`  SAIDAS (outbound): ${data.outbound.length} mensagens`)
    console.log(separator())
    if (data.outbound.length === 0) {
      console.log('  (nenhuma mensagem enviada)')
    } else {
      for (const m of data.outbound) {
        const conv = convMap[m.conversation_id] || {}
        const name = conv.name || fmtPhone(conv.phone)
        const sender = m.sender === 'lara' ? '[Lara]' : m.sender === 'humano' ? '[Humano]' : `[${m.sender}]`
        const status = m.status !== 'sent' ? ` (${m.status})` : ''
        console.log(`  ${fmtTime(m.created_at)} | ${name} | ${sender} ${truncate(m.content)}${status}`)
      }
    }

    // --- ERROS ---
    const totalErrors = data.failed.length + data.outboxErrors.length
    console.log('')
    console.log(`  ERROS: ${totalErrors} falhas`)
    console.log(separator())
    if (totalErrors === 0) {
      console.log('  (nenhum erro)')
    } else {
      for (const m of data.failed) {
        const conv = convMap[m.conversation_id] || {}
        const name = conv.name || fmtPhone(conv.phone)
        console.log(`  ${fmtTime(m.created_at)} | ${name} | MSG FALHOU: ${m.error_message || 'sem detalhes'}`)
        console.log(`    Conteudo: ${truncate(m.content, 40)}`)
      }
      for (const m of data.outboxErrors) {
        console.log(`  ${fmtTime(m.created_at)} | ${fmtPhone(m.phone)} | OUTBOX FALHOU (${m.attempts}/${m.max_attempts}): ${m.error_message || 'sem detalhes'}`)
        console.log(`    Conteudo: ${truncate(m.content, 40)}`)
      }
    }

    // --- FILA (Outbox pending) ---
    console.log('')
    console.log(`  FILA PENDENTE: ${data.outboxPending.length} na fila`)
    console.log(separator())
    if (data.outboxPending.length === 0) {
      console.log('  (fila vazia)')
    } else {
      for (const m of data.outboxPending) {
        console.log(`  ${fmtTime(m.created_at)} | ${fmtPhone(m.phone)} | ${truncate(m.content, 50)}`)
      }
    }

    // --- RESUMO ---
    console.log('')
    console.log(separator())
    console.log(`  RESUMO: ${data.inbound.length} in | ${data.outbound.length} out | ${totalErrors} erros | ${data.outboxPending.length} fila`)
    console.log(separator())

  } catch (err) {
    console.error(`  ERRO no monitor: ${err.message}`)
  }

  lastCheck = now.toISOString()
}

// Primeira execucao imediata
console.log('WhatsApp Monitor iniciado — relatorio a cada 1 minuto')
console.log('Pressione Ctrl+C para parar')
runReport()

// Loop a cada 1 minuto
setInterval(runReport, INTERVAL_MS)
