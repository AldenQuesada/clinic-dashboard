/**
 * Reseta TODOS os tracos do anatomy quiz pra um telefone (pra testes).
 * Limpa: anatomy_quiz_lara_dispatch + lp_leads com source=anatomy_quiz.
 *
 * Uso: PHONE=5544999999999 SUPABASE_DB_PASSWORD='...' node scripts/reset-aq-test-phone.cjs
 */
const { Client } = require('pg')

;(async () => {
  const phone = process.env.PHONE
  if (!phone) { console.error('Defina PHONE=...'); process.exit(1) }
  const phone8 = phone.replace(/\D/g,'').slice(-8)
  if (phone8.length < 8) { console.error('PHONE invalido'); process.exit(1) }

  const client = new Client({
    host:'db.oqboitkpcvuaudouwvkl.supabase.co', port:5432,
    user:'postgres', database:'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    ssl:{ rejectUnauthorized:false },
  })
  await client.connect()
  try {
    const r1 = await client.query(`
      DELETE FROM public.anatomy_quiz_lara_dispatch
      WHERE right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 8) = $1
      RETURNING id
    `, [phone8])
    console.log('dispatch removidos:', r1.rowCount)

    const r2 = await client.query(`
      DELETE FROM public.lp_leads
      WHERE meta->>'source' = 'anatomy_quiz'
        AND right(regexp_replace(coalesce(phone,''), '\\D', '', 'g'), 8) = $1
      RETURNING id
    `, [phone8])
    console.log('lp_leads removidos:', r2.rowCount)

    console.log(`\nOK · agora limpe localStorage no browser e refaça o quiz com ${phone}`)
  } finally {
    await client.end()
  }
})()
