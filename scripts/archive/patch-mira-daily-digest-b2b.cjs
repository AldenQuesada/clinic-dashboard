/**
 * Patch: injeta a secao B2B no workflow "ClinicAI - Mira Daily Digest".
 *
 * Estrutura atual:
 *   Cron -> List Recipients -> Split -> Build Digest -> Merge -> Send WhatsApp
 *
 * Nova estrutura:
 *   Cron -> List Recipients -> Split -> Build Digest ->
 *           B2B Digest RPC -> B2B Append -> Merge -> Send WhatsApp
 *
 * Regras:
 *   - Idempotente: se ja existe node "B2B Digest RPC", aborta sem duplicar.
 *   - Zero modifica cron/recipients/send.
 *   - Fallback gracioso: se a RPC B2B falhar ou o codigo der erro, repassa
 *     o texto original do digest sem secao B2B.
 *   - Secao B2B so e anexada quando o recipient e a Mirian (phone configuravel)
 *     e has_content=true.
 *   - Backup em C:/Users/alden/n8n-backup/mira-daily-digest-pre-b2b.json.
 *
 * ENV:
 *   N8N_API_KEY          (obrigatorio)
 *   SUPABASE_PROJECT_URL (default https://oqboitkpcvuaudouwvkl.supabase.co)
 *   MIRIAN_PHONE         (default 5544988782003 — E.164 sem +)
 *
 * Uso:
 *   N8N_API_KEY=... node scripts/archive/patch-mira-daily-digest-b2b.cjs
 */
const https = require('https')
const fs = require('fs')
const path = require('path')

const N8N_HOST = 'flows.aldenquesada.site'
const WF_ID = '6jEtFqw40Rh4dhSI'
const BACKUP_PATH = 'C:/Users/alden/n8n-backup/mira-daily-digest-pre-b2b.json'

const API_KEY = process.env.N8N_API_KEY
const SUPABASE_URL = process.env.SUPABASE_PROJECT_URL || 'https://oqboitkpcvuaudouwvkl.supabase.co'
const MIRIAN_PHONE = (process.env.MIRIAN_PHONE || '5544988782003').replace(/\D/g, '')

if (!API_KEY) {
  console.error('FAIL — defina N8N_API_KEY antes de rodar.')
  console.error('Ver C:/Users/alden/.claude/projects/C--Users-alden/memory/reference_clinicai_api_keys.md')
  process.exit(1)
}

function req(method, urlPath, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null
    const opts = {
      hostname: N8N_HOST,
      path: urlPath,
      method,
      headers: { 'X-N8N-API-KEY': API_KEY, 'Accept': 'application/json' },
    }
    if (data) {
      opts.headers['Content-Type'] = 'application/json'
      opts.headers['Content-Length'] = Buffer.byteLength(data)
    }
    const r = https.request(opts, (res) => {
      let d = ''
      res.on('data', c => d += c)
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(d) }) }
        catch { resolve({ status: res.statusCode, data: d }) }
      })
    })
    r.on('error', reject)
    if (data) r.write(data)
    r.end()
  })
}

// ═══════════════════════════════════════════════════════════════
// Novos nodes
// ═══════════════════════════════════════════════════════════════

// Reusa a credencial "Mira � Supabase Service" (ID X79lxjrmGuRpBo7r) do
// node Build Digest existente — a chave efetiva fica no n8n, fora deste repo.
const SUPABASE_CRED_ID = 'X79lxjrmGuRpBo7r'
const SUPABASE_CRED_NAME = 'Mira \u2014 Supabase Service'

const NODE_B2B_RPC = {
  parameters: {
    method: 'POST',
    url: `${SUPABASE_URL}/rest/v1/rpc/b2b_daily_digest`,
    authentication: 'genericCredentialType',
    genericAuthType: 'httpCustomAuth',
    sendHeaders: true,
    headerParameters: {
      parameters: [{ name: 'Content-Type', value: 'application/json' }],
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={}',
    options: {},
  },
  id: 'b2b-digest-rpc',
  name: 'B2B Digest RPC',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: [1000, 460],
  // Fallback gracioso: se a RPC falhar, o workflow continua e o digest original vai.
  onError: 'continueRegularOutput',
  credentials: {
    httpCustomAuth: { id: SUPABASE_CRED_ID, name: SUPABASE_CRED_NAME },
  },
}

const NODE_B2B_APPEND = {
  parameters: {
    jsCode: [
      "// Anexa secao B2B ao texto do digest original, se aplicavel.",
      "// - So para a Mirian (phone configuravel via MIRIAN_PHONE)",
      "// - So se a RPC B2B retornou has_content=true",
      "// - Fallback gracioso: qualquer erro -> passa digest original sem alteracao",
      "const MIRIAN = '" + MIRIAN_PHONE + "';",
      "const digest = $('Build Digest').item.json || {};",
      "const recipient = $('Split Recipients').item.json || {};",
      "const recipientPhone = String(recipient.phone || '').replace(/\\D/g, '');",
      "let b2b = null;",
      "try { b2b = $input.first().json || null; } catch (e) { b2b = null; }",
      "let message = digest.message || '';",
      "try {",
      "  if (recipientPhone === MIRIAN && b2b && b2b.ok === true && b2b.has_content === true && b2b.text) {",
      "    message = (message ? message + '\\n\\n' : '') + b2b.text;",
      "  }",
      "} catch (e) {",
      "  // Mantem digest original em caso de erro",
      "}",
      "return [{ json: { ...digest, message } }];",
    ].join('\n'),
  },
  id: 'b2b-digest-append',
  name: 'B2B Append',
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position: [1160, 460],
}

const NEW_NODES = [NODE_B2B_RPC, NODE_B2B_APPEND]

// ═══════════════════════════════════════════════════════════════
// Patch
// ═══════════════════════════════════════════════════════════════

;(async () => {
  console.log('1. Baixando workflow atual...')
  const cur = await req('GET', `/api/v1/workflows/${WF_ID}`)
  if (cur.status !== 200) {
    console.error('FAIL download:', cur.status, cur.data)
    process.exit(1)
  }
  const wf = cur.data
  console.log(`   name=${wf.name}  active=${wf.active}  nodes=${(wf.nodes||[]).length}`)

  console.log('2. Backup...')
  fs.mkdirSync(path.dirname(BACKUP_PATH), { recursive: true })
  if (!fs.existsSync(BACKUP_PATH)) {
    fs.writeFileSync(BACKUP_PATH, JSON.stringify(wf, null, 2))
    console.log(`   OK -> ${BACKUP_PATH}`)
  } else {
    console.log(`   (ja existia, mantendo backup: ${BACKUP_PATH})`)
  }

  // Idempotencia
  if ((wf.nodes || []).some(n => n.name === 'B2B Digest RPC' || n.name === 'B2B Append')) {
    console.log('\nWorkflow ja contem nodes B2B — abortando (idempotente).')
    return
  }

  console.log('3. Injetando nodes B2B...')
  wf.nodes = [...(wf.nodes || []), ...NEW_NODES]

  console.log('4. Reescrevendo connections (Build Digest -> B2B RPC -> B2B Append -> Merge)...')
  const conns = wf.connections || {}

  // Conexao original: Build Digest -> Merge. Quebramos para intercalar.
  conns['Build Digest']    = { main: [[{ node: 'B2B Digest RPC', type: 'main', index: 0 }]] }
  conns['B2B Digest RPC']  = { main: [[{ node: 'B2B Append',      type: 'main', index: 0 }]] }
  conns['B2B Append']      = { main: [[{ node: 'Merge',           type: 'main', index: 0 }]] }
  // Merge -> Send WhatsApp e cron permanecem iguais
  wf.connections = conns

  console.log('5. PUT workflow atualizado...')
  const putBody = {
    name: wf.name,
    nodes: wf.nodes,
    connections: wf.connections,
    settings: wf.settings || {},
  }
  const upd = await req('PUT', `/api/v1/workflows/${WF_ID}`, putBody)
  if (upd.status !== 200) {
    console.error('FAIL update:', upd.status, upd.data)
    process.exit(1)
  }
  console.log('   OK — workflow patched')
  console.log(`   active: ${upd.data.active}`)
  console.log(`   nodes adicionados: ${NEW_NODES.length}`)

  console.log('\nDone.')
  console.log('Proximo passo: aguardar proxima execucao do cron (7h BRT, seg-sab).')
  console.log(`Mirian recebe a secao B2B no numero ${MIRIAN_PHONE} quando has_content=true.`)
})().catch(e => {
  console.error('FAIL:', e.message)
  process.exit(1)
})
