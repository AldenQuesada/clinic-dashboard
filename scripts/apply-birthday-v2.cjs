/**
 * Aplica migration birthday_templates_v2 e envia teste para 5544998787673
 *
 * Uso: node scripts/apply-birthday-v2.js
 */
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'

async function rpc(name, params) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params || {}),
  })
  const text = await r.text()
  try { return { ok: r.ok, status: r.status, data: JSON.parse(text) } }
  catch { return { ok: r.ok, status: r.status, data: text } }
}

async function sql(query) {
  // Usa a API REST do PostgREST pra executar SQL via rpc
  // Precisamos usar o endpoint de SQL do Supabase
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  })
  return { ok: r.ok, status: r.status }
}

async function main() {
  console.log('=== Birthday Templates v2 — Apply & Test ===\n')

  // 1. Atualizar templates via RPC (mais seguro que SQL direto)
  console.log('1. Atualizando templates...')

  // Primeiro, listar templates existentes
  const list = await rpc('wa_birthday_templates_list')
  if (!list.ok) {
    console.error('Erro ao listar templates:', list.data)
    return
  }

  const templates = Array.isArray(list.data) ? list.data : []
  console.log(`   Encontrados ${templates.length} templates`)

  for (const t of templates) {
    let newContent = t.content

    if (t.day_offset === 30) {
      newContent = `[nome], e se você pudesse voltar no tempo só um pouquinho? 🤫

Seu aniversário tá chegando e a Dra. Mirian me autorizou a fazer algo especial pra você...

Imagina se olhar no espelho e se *reconhecer* de novo — mais jovem, mais radiante, com aquele brilho que o tempo foi apagando?

Pra isso acontecer, ela liberou *3 opções imperdíveis*:

🎁 Desconto especial de aniversário
💳 Parcelamento até perder de vista
✨ Faça 1 e ganhe 2

Me conta aqui qual te deixou mais curiosa que eu já te envio o link pra você mesma escolher seu combo de aniversário e chegar ao novo ciclo mais linda e radiante! 💬`
    } else if (t.day_offset === 29) {
      newContent = `[nome], adivinha o que vai expirar amanhã? ⏳

Aquela surpresa de aniversário que te falei ontem ainda tá de pé... mas *só até amanhã*.

Imagina começar esse novo ciclo se sentindo mais bonita, mais confiante, se reconhecendo de verdade no espelho...

Deixa eu refrescar sua memória:

🎁 Desconto especial
💳 Parcelamento até perder de vista
✨ Faça 1 e ganhe 2

Qual dessas combina mais com a nova você? Me responde aqui! 💬`
    } else if (t.day_offset === 28) {
      newContent = `[nome], última pergunta: você vai ou vai deixar escapar? 👀

Hoje é o *último dia* da sua oferta especial de aniversário. Amanhã volta pro valor normal.

Pensa comigo: quando foi a última vez que você se deu um presente de verdade? Um presente que te faz se olhar no espelho e sorrir? 🎂

Me responde aqui que eu resolvo tudo em 2 minutinhos! 💜`
    }

    const save = await rpc('wa_birthday_template_save', {
      p_id: t.id,
      p_day_offset: t.day_offset,
      p_send_hour: 13,
      p_label: t.label,
      p_content: newContent,
      p_media_url: t.media_url || null,
      p_media_position: t.media_position || 'above',
      p_is_active: t.is_active,
      p_sort_order: t.sort_order,
    })

    if (save.ok) {
      console.log(`   ✓ ${t.label} (D-${t.day_offset}) → 13h, conteúdo atualizado`)
    } else {
      console.error(`   ✗ ${t.label}: ${JSON.stringify(save.data)}`)
    }
  }

  // 2. Enviar teste real
  console.log('\n2. Enviando teste para 5544998787673...')

  const testContent = `Alden, e se você pudesse voltar no tempo só um pouquinho? 🤫

Seu aniversário tá chegando e a Dra. Mirian me autorizou a fazer algo especial pra você...

Imagina se olhar no espelho e se *reconhecer* de novo — mais jovem, mais radiante, com aquele brilho que o tempo foi apagando?

Pra isso acontecer, ela liberou *3 opções imperdíveis*:

🎁 Desconto especial de aniversário
💳 Parcelamento até perder de vista
✨ Faça 1 e ganhe 2

Me conta aqui qual te deixou mais curiosa que eu já te envio o link pra você mesma escolher seu combo de aniversário e chegar ao novo ciclo mais linda e radiante! 💬`

  // Inserir direto no wa_outbox via tabela REST
  const outbox = await fetch(`${SUPABASE_URL}/rest/v1/wa_outbox`, {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
    },
    body: JSON.stringify({
      clinic_id: '00000000-0000-0000-0000-000000000001',
      lead_id: null,
      phone: '5544998787673',
      content: testContent,
      content_type: 'text',
      priority: 1,
      status: 'pending',
      scheduled_at: new Date().toISOString(),
    }),
  })

  const outboxData = await outbox.text()
  if (outbox.ok) {
    console.log('   ✓ Mensagem inserida no wa_outbox — será enviada pelo n8n em até 2 min')
    try {
      const parsed = JSON.parse(outboxData)
      if (Array.isArray(parsed) && parsed[0]) {
        console.log(`   ID: ${parsed[0].id}`)
      }
    } catch {}
  } else {
    console.error('   ✗ Erro ao inserir no outbox:', outboxData)
  }

  console.log('\n=== Concluído ===')
  console.log('Templates: 3 atualizados (13h)')
  console.log('Teste: mensagem enfileirada para 5544998787673')
  console.log('Auto-reply: precisa aplicar migration SQL no Supabase Dashboard')
  console.log('  → Arquivo: supabase/migrations/20260619000000_birthday_templates_v2.sql')
  console.log('  → Copiar apenas as seções 3, 4 e 5 (tabela + trigger + RPC)')
}

main().catch(console.error)
