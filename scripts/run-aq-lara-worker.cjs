/**
 * Worker Node.js · processa dispatches pendentes do anatomy_quiz_lara_dispatch
 *
 * Vantagem sobre pg_net+pg_cron: fetch() async nativo no Node, sem locks no Postgres.
 * Pode rodar como OS cron OU manual on-demand.
 *
 * Env vars necessárias:
 *   SUPABASE_DB_PASSWORD
 *   ANTHROPIC_API_KEY
 *   EVOLUTION_API_KEY
 *   EVOLUTION_BASE_URL
 *   EVOLUTION_INSTANCE
 */
const { Client } = require('pg')

;(async () => {
  const required = ['SUPABASE_DB_PASSWORD','ANTHROPIC_API_KEY','EVOLUTION_API_KEY','EVOLUTION_BASE_URL','EVOLUTION_INSTANCE']
  const missing = required.filter(k => !process.env[k])
  if (missing.length) { console.error('Falta env:', missing.join(',')); process.exit(1) }

  const c = new Client({
    host:'db.oqboitkpcvuaudouwvkl.supabase.co', port:5432,
    user:'postgres', database:'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl:{ rejectUnauthorized:false },
  })
  await c.connect()
  try {
    // Reset rows que ficaram em 'processing' mais de 5 min (zumbis)
    await c.query("UPDATE public.anatomy_quiz_lara_dispatch SET status='pending' WHERE status='processing' AND attempts < max_attempts_or_3()").catch(_=>{})
    await c.query("UPDATE public.anatomy_quiz_lara_dispatch SET status='pending', attempts=0 WHERE status='processing'")

    // SELECT pending
    const { rows: pending } = await c.query(`
      SELECT id, phone, name, template_key, lifecycle, queixas, context
      FROM public.anatomy_quiz_lara_dispatch
      WHERE status='pending' AND (next_send_at IS NULL OR next_send_at <= now())
      ORDER BY created_at ASC
      LIMIT 5
    `)
    console.log(`${pending.length} dispatches pendentes`)

    for (const d of pending) {
      console.log(`\n→ ${d.id} · template=${d.template_key} · phone=${d.phone}`)

      // Marca processing
      await c.query("UPDATE public.anatomy_quiz_lara_dispatch SET status='processing', attempts=attempts+1 WHERE id=$1", [d.id])

      try {
        // Monta prompt
        const firstName = String(d.name || '').split(' ')[0] || 'Olá'
        const q1 = d.queixas[0]?.label
        const q2 = d.queixas[1]?.label
        const p1 = d.queixas[0]?.protocol
        const p2 = d.queixas[1]?.protocol
        const queixas_str = q1 + (q2 ? ' e ' + q2 : '')
        const protos_str = p1 + (p2 ? ' / ' + p2 : '')

        const system = `Voce eh a Lara, assistente da Dra. Mirian de Paula (Clinica Mirian de Paula em Maringa/PR · medicina estetica facial). Voce conversa via WhatsApp · sempre se apresenta como Lara · usa portugues brasileiro coloquial profissional. NUNCA usa "se quiser" ou "sem compromisso" (Never Split the Difference). Sempre tem CTA claro. Tom acolhedor + autoridade da Dra. Mirian + foco em conversao SDR. Maximo 6 linhas. Pode usar 1 emoji 💛. Sem hashtags. Mencione SEMPRE as queixas: ${queixas_str}. Mencione o protocolo da Dra. quando fizer sentido: ${protos_str}.`

        const templates = {
          aq_novo_lead: 'NOVO LEAD (msg 1 de 5 · Onboarding+Rapport+Permissao): Apresente-se como Lara · agradeca a confianca · cite as 2 queixas · peca permissao pra fazer 2 perguntinhas (que vai ajudar a separar o protocolo certo). Nao agende nada nesta msg.',
          aq_lead_frio: 'LEAD FRIO retornando (msg 1 de 4 · Reconexao+Permissao): Apresente-se como Lara · "que bom te ver de novo" · cite que dessa vez marcou as queixas X+Y · peca uma pergunta sem julgamento.',
          aq_orcamento_aberto: 'ORCAMENTO ABERTO (msg unica): Apresente-se como Lara · "olha que coincidencia" · queixas atuais ja entram no orcamento que separamos · com 1 plano resolve tudo · se fechar essa semana, encaixa no mes atual · pergunta se pode mandar detalhes.',
          aq_agendado_futuro: `JA AGENDADA (msg unica): Apresente-se como Lara · "que otimo" · cite queixas + ja esta agendada com a Dra. dia ${d.context?.lifecycle?.scheduled_for || '(sem data)'} · vai ser o espaco pra tirar duvidas · 30 dias depois vai ver rosto se transformar em camera lenta · pergunta se tem duvida pra adiantar antes do dia.`,
          aq_paciente_ativo: 'PACIENTE ATIVA (msg unica): Apresente-se como Lara · "que alegria te ver de volta" · ela ja viveu o processo · agora as queixas X+Y entraram no radar · Dra. gosta de reavaliacao a cada 6 meses · oferece reservar horario · PS curto mencionando os protocolos.',
          aq_requiz_recente: 'RE-QUIZ <24H (msg unica · com humor leve): Apresente-se como Lara · "voltou? ta pensando carinhosamente na sua pele" 😊 · anotou as novas queixas · ja mandou mensagem ontem · oferece reservar horario · pergunta "topa?".',
        }
        const userPrompt = `Contexto: NOME=${firstName} · TEMPLATE=${d.template_key} · LIFECYCLE=${d.lifecycle} · QUEIXAS=${queixas_str}\n\nGere a mensagem da Lara seguindo:\n\n${templates[d.template_key] || templates.aq_novo_lead}`

        // 1. Anthropic
        const anthRes = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'x-api-key': process.env.ANTHROPIC_API_KEY,
            'anthropic-version': '2023-06-01',
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 600,
            system,
            messages: [{ role: 'user', content: userPrompt }],
          }),
        })
        const anthData = await anthRes.json()
        if (!anthRes.ok) {
          throw new Error(`Anthropic ${anthRes.status}: ${JSON.stringify(anthData).slice(0,500)}`)
        }
        const msgText = anthData.content?.[0]?.text
        if (!msgText) throw new Error('Anthropic msg vazia')
        console.log('  msg:', msgText.slice(0,150))

        // 2. Evolution
        const evoRes = await fetch(`${process.env.EVOLUTION_BASE_URL}/message/sendText/${process.env.EVOLUTION_INSTANCE}`, {
          method: 'POST',
          headers: {
            'apikey': process.env.EVOLUTION_API_KEY,
            'content-type': 'application/json',
          },
          body: JSON.stringify({ number: d.phone, text: msgText }),
        })
        const evoData = await evoRes.json()
        if (!evoRes.ok) {
          throw new Error(`Evolution ${evoRes.status}: ${JSON.stringify(evoData).slice(0,500)}`)
        }
        console.log('  evolution OK · message_id:', evoData?.key?.id || evoData?.id || '?')

        await c.query(`
          UPDATE public.anatomy_quiz_lara_dispatch
          SET status='dispatched', dispatched_at=now(), message_text=$1, evolution_response=$2
          WHERE id=$3
        `, [msgText, evoData, d.id])
        console.log('  ✓ dispatched')
      } catch (err) {
        await c.query(`
          UPDATE public.anatomy_quiz_lara_dispatch
          SET status='failed', error_message=$1
          WHERE id=$2
        `, [String(err.message).slice(0,500), d.id])
        console.log('  ✗ failed:', err.message)
      }
    }
  } finally {
    await c.end()
  }
})()
