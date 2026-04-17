#!/usr/bin/env node
/**
 * Mini-dashboard que mostra commits em tempo real + progresso do sprint.
 * Uso: `node tools/agents-monitor.cjs` e abre http://localhost:8787
 */
const http = require('http')
const { execSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const PORT = 8787
const REPO = path.resolve(__dirname, '..')

// 10 deliverables esperados do sprint atual (Magazine A+B)
const SPRINT = {
  titulo: 'Magazine · Distribuicao + IA full loop',
  deliverables: [
    { id: 'A1', frente: 'A', titulo: 'RPC batch dispatch + RFM + pg_cron',  match: /magazine.*(dispatch|RPC batch)/i },
    { id: 'A2', frente: 'A', titulo: 'UI agendamento no admin',              match: /magazine.*(agendamento|aba.*distribu)/i },
    { id: 'A3', frente: 'A', titulo: 'Reminders D+1 e D+7 encadeados',       match: /magazine.*reminder/i },
    { id: 'A4', frente: 'A', titulo: 'Dashboard performance por edicao',     match: /magazine.*(analytics|performance|dashboard)/i },
    { id: 'A5', frente: 'A', titulo: 'Polish leitor mobile',                 match: /magazine.*(polish|leitor|mobile)/i },
    { id: 'B1', frente: 'B', titulo: 'Edge Function magazine-ai-generate',   match: /magazine.*(edge function|ai-generate)/i },
    { id: 'B2', frente: 'B', titulo: 'Intake -> auto-edicao (Claude)',       match: /magazine.*(intake|auto.?edi|brief)/i },
    { id: 'B3', frente: 'B', titulo: 'Regenerar pagina com IA',              match: /magazine.*(regen|refinamento)/i },
    { id: 'B4', frente: 'B', titulo: 'Biblioteca de prompts',                match: /magazine.*(prompt|biblioteca)/i },
    { id: 'B5', frente: 'B', titulo: 'Smart autofix de validacao',           match: /magazine.*(autofix|smart.*valid)/i },
  ],
}

function getCommits(limit = 30) {
  const out = execSync(`git log --pretty=format:"%h|%an|%ar|%s" -n ${limit}`, { cwd: REPO, encoding: 'utf8' })
  return out.split('\n').filter(Boolean).map((l) => {
    const [hash, autor, quando, mensagem] = l.split('|')
    return { hash, autor, quando, mensagem }
  })
}

function computeProgress(commits) {
  // Marca cada deliverable como done se algum commit bater o regex
  return SPRINT.deliverables.map((d) => {
    const hit = commits.find((c) => d.match.test(c.mensagem))
    return { ...d, done: !!hit, hash: hit?.hash || null, mensagem: hit?.mensagem || null }
  })
}

function html() {
  return `<!doctype html>
<html lang="pt-br">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Agentes · ${SPRINT.titulo}</title>
<style>
  :root {
    --bg:#0a0a0f; --panel:#141420; --ink:#e9e6ff; --muted:#6c6a85;
    --gold:#c9a96e; --purple:#7c3aed; --green:#10b981; --amber:#f59e0b;
    --border:rgba(255,255,255,.06);
  }
  *{box-sizing:border-box;margin:0;padding:0}
  body{background:var(--bg);color:var(--ink);font-family:'Inter',system-ui,sans-serif;min-height:100vh;padding:28px;overflow-x:hidden}
  .hero{max-width:1400px;margin:0 auto 32px;text-align:center}
  .hero h1{font-size:28px;font-weight:800;background:linear-gradient(135deg,var(--gold),var(--purple));-webkit-background-clip:text;background-clip:text;color:transparent;margin-bottom:8px;letter-spacing:-.02em}
  .hero .sub{color:var(--muted);font-size:13px}
  .pulse{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--green);margin-right:6px;animation:pulse 1.4s infinite ease-in-out;vertical-align:middle}
  @keyframes pulse{0%,100%{transform:scale(1);opacity:1}50%{transform:scale(1.5);opacity:.5}}

  .grid{max-width:1400px;margin:0 auto;display:grid;grid-template-columns:1fr 1fr;gap:20px}
  @media (max-width:900px){.grid{grid-template-columns:1fr}}

  .col{background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px}
  .col h2{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:14px;font-weight:700}
  .col h2 .count{color:var(--gold);margin-left:8px}

  .tile{display:flex;align-items:center;gap:12px;padding:12px 14px;border-radius:10px;background:rgba(255,255,255,.02);border:1px solid transparent;margin-bottom:8px;transition:all .3s}
  .tile.done{background:linear-gradient(90deg,rgba(16,185,129,.08),transparent);border-color:rgba(16,185,129,.2)}
  .tile.done .dot{background:var(--green);box-shadow:0 0 12px rgba(16,185,129,.4)}
  .tile .dot{width:10px;height:10px;border-radius:50%;background:var(--muted);flex-shrink:0;transition:all .3s}
  .tile .dot.pending{background:var(--amber);animation:blink 1.8s infinite}
  @keyframes blink{0%,100%{opacity:.35}50%{opacity:1}}
  .tile .titulo{flex:1;min-width:0}
  .tile .nome{font-size:13px;font-weight:600;color:var(--ink)}
  .tile .msg{font-size:11px;color:var(--muted);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .tile .hash{font-family:ui-monospace,monospace;font-size:11px;color:var(--gold);background:rgba(201,169,110,.1);padding:2px 8px;border-radius:6px;letter-spacing:.02em}

  .stream{max-width:1400px;margin:20px auto 0;background:var(--panel);border:1px solid var(--border);border-radius:16px;padding:20px;font-family:ui-monospace,'JetBrains Mono',monospace}
  .stream h2{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--muted);margin-bottom:12px;font-weight:700}
  .log{max-height:320px;overflow-y:auto}
  .log-line{padding:6px 0;border-bottom:1px solid var(--border);display:flex;gap:12px;align-items:center;font-size:12px}
  .log-line.novo{animation:slideIn .5s ease;background:linear-gradient(90deg,rgba(124,58,237,.08),transparent)}
  @keyframes slideIn{from{transform:translateX(-10px);opacity:0;background:rgba(124,58,237,.2)}to{transform:translateX(0);opacity:1}}
  .log-line .lh{color:var(--gold);min-width:70px}
  .log-line .ln{color:var(--muted);min-width:80px;font-size:11px}
  .log-line .lm{color:var(--ink);flex:1;font-family:system-ui}

  .bar{height:4px;background:rgba(255,255,255,.05);border-radius:2px;margin:14px 0 20px;overflow:hidden;max-width:1400px;margin-left:auto;margin-right:auto}
  .bar .fill{height:100%;background:linear-gradient(90deg,var(--gold),var(--purple));border-radius:2px;transition:width .6s ease}
</style>
</head>
<body>
  <div class="hero">
    <h1>${SPRINT.titulo}</h1>
    <div class="sub"><span class="pulse"></span><span id="summary">carregando...</span> · <span id="updated">-</span></div>
  </div>

  <div class="bar"><div class="fill" id="progressFill" style="width:0"></div></div>

  <div class="grid">
    <div class="col">
      <h2>Frente A · Distribuicao <span class="count" id="countA"></span></h2>
      <div id="frenteA"></div>
    </div>
    <div class="col">
      <h2>Frente B · IA full loop <span class="count" id="countB"></span></h2>
      <div id="frenteB"></div>
    </div>
  </div>

  <div class="stream">
    <h2>Stream de commits</h2>
    <div class="log" id="log"></div>
  </div>

<script>
let known = new Set()
async function tick() {
  try {
    const r = await fetch('/api/state')
    const d = await r.json()
    render(d)
  } catch(e) { console.error(e) }
}

function render(d) {
  const doneA = d.progress.filter(x => x.frente==='A' && x.done).length
  const doneB = d.progress.filter(x => x.frente==='B' && x.done).length
  const total = d.progress.length
  const doneTotal = doneA + doneB

  document.getElementById('countA').textContent = doneA + '/5'
  document.getElementById('countB').textContent = doneB + '/5'
  document.getElementById('summary').textContent = doneTotal + '/' + total + ' entregas'
  document.getElementById('updated').textContent = 'atualizado ' + new Date().toLocaleTimeString('pt-BR')
  document.getElementById('progressFill').style.width = (doneTotal/total*100) + '%'

  ;['A','B'].forEach(fr => {
    const host = document.getElementById('frente'+fr)
    host.innerHTML = d.progress.filter(x=>x.frente===fr).map(x => {
      const cls = x.done ? 'done' : ''
      const dot = x.done ? 'dot' : 'dot pending'
      return '<div class="tile '+cls+'"><div class="'+dot+'"></div>' +
        '<div class="titulo"><div class="nome">' + x.id + ' · ' + x.titulo + '</div>' +
        (x.mensagem ? '<div class="msg">' + x.mensagem + '</div>' : '<div class="msg">aguardando agente...</div>') +
        '</div>' +
        (x.hash ? '<span class="hash">' + x.hash + '</span>' : '') +
      '</div>'
    }).join('')
  })

  const logEl = document.getElementById('log')
  const currentHashes = d.commits.map(c => c.hash)
  logEl.innerHTML = d.commits.map(c => {
    const cls = known.has(c.hash) ? '' : 'log-line novo'
    return '<div class="log-line ' + cls + '">' +
      '<span class="lh">' + c.hash + '</span>' +
      '<span class="ln">' + c.quando + '</span>' +
      '<span class="lm">' + c.mensagem.replace(/</g,'&lt;') + '</span>' +
    '</div>'
  }).join('')
  currentHashes.forEach(h => known.add(h))
}

tick()
setInterval(tick, 8000)
</script>
</body>
</html>`
}

const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/api/state')) {
    try {
      const commits = getCommits(30)
      const progress = computeProgress(commits)
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ commits, progress }))
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ error: e.message }))
    }
  } else {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(html())
  }
})

srv.listen(PORT, () => {
  console.log(`\n  Dashboard: http://localhost:${PORT}\n  Ctrl+C pra encerrar.\n`)
})
