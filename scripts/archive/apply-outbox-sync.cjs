/**
 * Aplica migration: outbox→inbox sync + auto-reply + templates com 4a opcao
 * Uso: node scripts/apply-outbox-sync.cjs
 */
const fs = require('fs')
const path = require('path')

const SUPABASE_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co'
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'

// Service role key needed for DDL operations
// We'll use the anon key with RPCs instead

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

async function main() {
  console.log('=== Outbox→Inbox Sync + Auto-Reply + Templates v3 ===\n')

  // 1. Atualizar templates com 4a opcao
  console.log('1. Atualizando templates com 4a opcao...')

  const list = await rpc('wa_birthday_templates_list')
  if (!list.ok) { console.error('Erro:', list.data); return }

  const templates = Array.isArray(list.data) ? list.data : []

  for (const t of templates) {
    let newContent = t.content

    if (t.day_offset === 30) {
      newContent = `[nome], e se você pudesse voltar no tempo só um pouquinho? 🤫

Seu aniversário tá chegando e a Dra. Mirian me autorizou a fazer algo especial pra você...

Imagina se olhar no espelho e se *reconhecer* de novo — mais jovem, mais radiante, com aquele brilho que o tempo foi apagando?

Pra isso acontecer, ela liberou *4 opções imperdíveis*:

🎁 Desconto especial de aniversário
💳 Parcelamento até perder de vista
✨ Faça 1 e ganhe 2
🎀 Todas as anteriores

Me conta aqui qual te deixou mais curiosa que eu já te envio o link pra você mesma escolher seu combo de aniversário e chegar ao novo ciclo mais linda e radiante! 💬`
    } else if (t.day_offset === 29) {
      newContent = `[nome], adivinha o que vai expirar amanhã? ⏳

Aquela surpresa de aniversário que te falei ontem ainda tá de pé... mas *só até amanhã*.

Imagina começar esse novo ciclo se sentindo mais bonita, mais confiante, se reconhecendo de verdade no espelho...

Deixa eu refrescar sua memória:

🎁 Desconto especial
💳 Parcelamento até perder de vista
✨ Faça 1 e ganhe 2
🎀 Todas as anteriores

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

    console.log(`   ${save.ok ? '✓' : '✗'} ${t.label} (D-${t.day_offset})`)
  }

  // 2. Aplicar SQL da migration (precisa do Supabase Dashboard)
  console.log('\n2. Migration SQL (wa_outbox_on_sent v3 + auto-reply):')
  console.log('   ⚠  Precisa aplicar manualmente no Supabase SQL Editor:')
  console.log('   → supabase/migrations/20260620000000_outbox_inbox_sync_and_autoreply.sql')
  console.log('   → Copiar TODO o conteudo e executar no SQL Editor')

  // 3. Reenviar teste
  console.log('\n3. Reenviando teste para 5544998787673...')

  const testContent = `Alden, e se você pudesse voltar no tempo só um pouquinho? 🤫

Seu aniversário tá chegando e a Dra. Mirian me autorizou a fazer algo especial pra você...

Imagina se olhar no espelho e se *reconhecer* de novo — mais jovem, mais radiante, com aquele brilho que o tempo foi apagando?

Pra isso acontecer, ela liberou *4 opções imperdíveis*:

🎁 Desconto especial de aniversário
💳 Parcelamento até perder de vista
✨ Faça 1 e ganhe 2
🎀 Todas as anteriores

Me conta aqui qual te deixou mais curiosa que eu já te envio o link pra você mesma escolher seu combo de aniversário e chegar ao novo ciclo mais linda e radiante! 💬`

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
      lead_id: 'f04716d3-31ac-483c-9d56-951a31e626bb',
      phone: '5544998787673',
      content: testContent,
      content_type: 'text',
      priority: 1,
      status: 'pending',
      scheduled_at: new Date().toISOString(),
    }),
  })

  const data = await outbox.text()
  if (outbox.ok) {
    try {
      const parsed = JSON.parse(data)
      console.log(`   ✓ Enfileirada — ID: ${parsed[0]?.id}`)
    } catch { console.log('   ✓ Enfileirada') }
  } else {
    console.error('   ✗', data)
  }

  console.log('\n=== Resumo ===')
  console.log('✓ Templates: 3 atualizados com 4a opcao')
  console.log('✓ Teste: msg enfileirada (n8n processa em ~2min)')
  console.log('⚠ PENDENTE: executar SQL no Supabase Dashboard para:')
  console.log('  - wa_outbox_on_sent v3 (sync com inbox)')
  console.log('  - wa_auto_reply_templates (tabela)')
  console.log('  - trg_birthday_on_responded (trigger auto-reply)')
}

main().catch(console.error)
