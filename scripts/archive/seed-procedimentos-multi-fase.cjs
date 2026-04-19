/**
 * Aplica migration 390 (fases em clinic_procedimentos) + semeia 3 tratamentos:
 *
 *   Melasma          → 6 sessoes a cada 30 dias (cadencia unica)
 *   Tirzepatida      → multi-fase: Inducao 8x/7d + Desmame 2x/15d (= 10 sessoes)
 *   Terapia Capilar  → 8 sessoes a cada 15 dias (cadencia unica)
 *
 * Uso: SUPABASE_DB_PASSWORD=... node scripts/archive/seed-procedimentos-multi-fase.cjs
 */
const fs   = require('fs')
const path = require('path')
const { Client } = require('pg')

const dns = require('dns')
dns.setDefaultResultOrder('ipv6first')

const MIGRATION_PATH = path.join(
  __dirname, '..', '..', 'supabase', 'migrations',
  '20260700000390_procedimentos_fases.sql'
)

const CLINIC_ID = '00000000-0000-0000-0000-000000000001'

const PASSWORD = process.env.SUPABASE_DB_PASSWORD
if (!PASSWORD) {
  console.error('SUPABASE_DB_PASSWORD nao setado. Abortando.')
  process.exit(1)
}

const client = new Client({
  host:     'aws-0-us-west-2.pooler.supabase.com',
  port:     5432,
  user:     'postgres.oqboitkpcvuaudouwvkl',
  password: PASSWORD,
  database: 'postgres',
  ssl:      { rejectUnauthorized: false },
})

// 3 procedimentos a semear (upsert por nome)
const TREATMENTS = [
  {
    nome:      'Melasma',
    categoria: 'Tratamentos Faciais',
    descricao: 'Protocolo de clareamento para manchas melanicas. 1 sessao por mes.',
    duracao:   60,
    sessoes:   6,
    intervalo: 30,
    fases:     null,
  },
  {
    nome:      'Tirzepatida',
    categoria: 'Emagrecimento',
    descricao: 'Protocolo de emagrecimento com cadencia mista: 8 semanas de inducao + 2 doses de desmame quinzenal.',
    duracao:   30,
    sessoes:   10,  // derivado das fases (8 + 2)
    intervalo: 7,   // fase inicial
    fases: [
      { nome: 'Inducao', sessoes: 8, intervalo_dias: 7 },
      { nome: 'Desmame', sessoes: 2, intervalo_dias: 15 },
    ],
  },
  {
    nome:      'Terapia Capilar',
    categoria: 'Capilar',
    descricao: 'Protocolo capilar com 8 sessoes a cada 15 dias. Secretaria pode ajustar volume ou intervalo ao agendar.',
    duracao:   60,
    sessoes:   8,
    intervalo: 15,
    fases:     null,
  },
]

async function applyMigration() {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8')
  console.log('Aplicando migration:', path.basename(MIGRATION_PATH))
  console.log('Size:', sql.length, 'bytes')
  await client.query(sql)
  console.log('OK\n')
}

async function upsertProcedimento(t) {
  // clinic_procedimentos tem unique(clinic_id, nome) — DO UPDATE via SQL direto.
  // Usamos SQL direto pq a RPC upsert_procedimento precisa de app_clinic_id() (JWT)
  // que nao esta disponivel em conexao direta do Node.
  const res = await client.query(`
    INSERT INTO public.clinic_procedimentos
      (clinic_id, nome, categoria, descricao, duracao_min, sessoes,
       intervalo_sessoes_dias, fases, tipo, ativo)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'avulso', true)
    ON CONFLICT (clinic_id, nome) DO UPDATE SET
      categoria              = EXCLUDED.categoria,
      descricao              = EXCLUDED.descricao,
      duracao_min            = EXCLUDED.duracao_min,
      sessoes                = EXCLUDED.sessoes,
      intervalo_sessoes_dias = EXCLUDED.intervalo_sessoes_dias,
      fases                  = EXCLUDED.fases,
      ativo                  = true,
      updated_at             = now()
    RETURNING id, nome, sessoes, intervalo_sessoes_dias, fases
  `, [
    CLINIC_ID,
    t.nome,
    t.categoria,
    t.descricao,
    t.duracao,
    t.sessoes,
    t.intervalo,
    JSON.stringify(t.fases || []),
  ])
  return res.rows[0]
}

async function main() {
  console.log('=== Seed procedimentos multi-fase ===\n')
  await client.connect()
  console.log('Conectado.\n')

  await applyMigration()

  console.log('Semeando tratamentos:\n')
  for (const t of TREATMENTS) {
    const r = await upsertProcedimento(t)
    const fasesLbl = Array.isArray(r.fases) && r.fases.length
      ? r.fases.map(f => `${f.nome} ${f.sessoes}x/${f.intervalo_dias}d`).join(' -> ')
      : `${r.sessoes}x a cada ${r.intervalo_sessoes_dias}d`
    console.log(`  [${r.id.slice(0, 8)}] ${r.nome}: ${fasesLbl}`)
  }

  console.log('\nConferencia:')
  const check = await client.query(`
    SELECT nome, sessoes, intervalo_sessoes_dias, jsonb_array_length(COALESCE(fases, '[]'::jsonb)) AS qtd_fases
    FROM public.clinic_procedimentos
    WHERE clinic_id = $1
      AND nome IN ('Melasma', 'Tirzepatida', 'Terapia Capilar')
    ORDER BY nome
  `, [CLINIC_ID])
  check.rows.forEach(r => {
    console.log(`  ${r.nome.padEnd(18)} sessoes=${String(r.sessoes).padEnd(3)} intervalo=${String(r.intervalo_sessoes_dias || '-').padEnd(3)} fases=${r.qtd_fases}`)
  })

  await client.end()
  console.log('\nOK — 3 tratamentos cadastrados.')
}

main().catch(e => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
