const { Client } = require('pg')
const client = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
})

async function main() {
  await client.connect()
  console.log('=== Atualizando templates D-7, D-3, D-1 ===\n')

  // Template 1: D-7 (Oportunidade) — planta a semente
  await client.query(`
    UPDATE wa_birthday_templates
    SET day_offset = 7,
        send_hour = 13,
        label = 'Oportunidade',
        content = '[nome], e se você pudesse voltar no tempo só um pouquinho? 🤫

Seu aniversário tá chegando e a Dra. Mirian me autorizou a fazer algo especial pra você...

Imagina se olhar no espelho e se *reconhecer* de novo — mais jovem, mais radiante, com aquele brilho que o tempo foi apagando?

Pra isso acontecer, ela liberou *4 opções imperdíveis*:

🎁 Desconto especial de aniversário
💳 Parcelamento até perder de vista
✨ Faça 1 e ganhe 2
🎀 Todas as anteriores

Me conta aqui qual te deixou mais curiosa que eu já te envio o link pra você mesma escolher seu combo de aniversário e chegar ao novo ciclo mais linda e radiante! 💬'
    WHERE id = 'cbda9e9b-1fac-462d-b6e0-ce346f5da5ca'
  `)
  console.log('✓ D-7 Oportunidade — planta a semente')

  // Template 2: D-3 (Lembrete) — urgencia suave
  await client.query(`
    UPDATE wa_birthday_templates
    SET day_offset = 3,
        send_hour = 13,
        label = 'Lembrete',
        content = '[nome], adivinha o que vai expirar em poucos dias? ⏳

Aquela surpresa de aniversário que te falei ainda tá de pé... mas *faltam só 3 dias*.

Imagina começar esse novo ciclo se sentindo mais bonita, mais confiante, se reconhecendo de verdade no espelho...

Deixa eu refrescar sua memória:

🎁 Desconto especial
💳 Parcelamento até perder de vista
✨ Faça 1 e ganhe 2
🎀 Todas as anteriores

Qual dessas combina mais com a nova você? Me responde aqui! 💬'
    WHERE id = '26602ad1-d9bc-4ded-8873-29305be8b566'
  `)
  console.log('✓ D-3 Lembrete — urgência suave')

  // Template 3: D-1 (Última chance) — vespera emocional
  await client.query(`
    UPDATE wa_birthday_templates
    SET day_offset = 1,
        send_hour = 13,
        label = 'Última chance',
        content = '[nome], amanhã você faz anos. Posso te fazer uma última pergunta? 👀

Você vai entrar nesse novo ciclo *igual* ou vai se dar a chance de se olhar no espelho e sorrir de verdade?

Hoje é o *último dia* da sua oferta especial de aniversário. Amanhã volta pro valor normal.

Pensa comigo: quando foi a última vez que você se deu um presente de verdade? 🎂

Me responde aqui que eu resolvo tudo em 2 minutinhos! 💜'
    WHERE id = 'b2a5660f-0e18-4e9a-8397-4e4292650dc7'
  `)
  console.log('✓ D-1 Última chance — véspera emocional')

  // Verificar
  const check = await client.query(`
    SELECT day_offset, send_hour, label, substring(content from 1 for 60) as preview
    FROM wa_birthday_templates ORDER BY sort_order
  `)
  console.log('\nTemplates atualizados:')
  check.rows.forEach(r => console.log('  D-' + r.day_offset, '| ' + r.send_hour + 'h |', r.label, '|', r.preview))

  // Testar: pra quem faz aniversario 12 de abril, quais datas seriam?
  console.log('\n=== Simulacao: aniversario 12 de abril ===')
  console.log('  D-7: 5 de abril 13h BR → HOJE!')
  console.log('  D-3: 9 de abril 13h BR')
  console.log('  D-1: 11 de abril 13h BR')

  await client.end()
  console.log('\n✓ Templates prontos — D-7, D-3, D-1 as 13h BR')
}
main().catch(console.error)
