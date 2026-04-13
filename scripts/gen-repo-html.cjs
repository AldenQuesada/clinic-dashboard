const fs = require('fs');
const { execSync } = require('child_process');

const raw = execSync('git log --oneline --since="2026-04-12" --format="%h|%ai|%s"', { encoding: 'utf8' }).trim();
const lines = raw.split('\n');

const cats = { feat: [], fix: [], docs: [], chore: [], refactor: [], other: [] };
lines.forEach(l => {
  const i1 = l.indexOf('|'), i2 = l.indexOf('|', i1 + 1);
  const hash = l.substring(0, i1), date = l.substring(i1 + 1, i2).split(' ')[0], msg = l.substring(i2 + 1);
  const m = msg.match(/^(feat|fix|docs|chore|refactor)(\([^)]+\))?:\s*(.*)$/);
  let type = 'other', scope = '', desc = msg;
  if (m) { type = m[1]; scope = (m[2] || '').replace(/[()]/g, ''); desc = m[3]; }
  (cats[type] || cats.other).push({ hash, date, scope, desc });
});

function esc(s) { return s.replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function items(arr, type) {
  return arr.map(x =>
    `<div class="item item-${type}"><div class="desc"><span class="badge badge-${type}">${type}</span> ${x.scope ? '<strong>[' + esc(x.scope) + ']</strong> ' : ''}${esc(x.desc)}</div><div class="meta"><code>${x.hash}</code> ${x.date}</div></div>`
  ).join('\n');
}

const fmAll = [...cats.fix, ...cats.feat].filter(x => x.scope === 'face-mapping');
const authAll = cats.fix.filter(x => x.scope === 'auth' || x.scope === 'health');
const miraAll = [...cats.feat, ...cats.fix, ...cats.docs].filter(x => x.scope === 'mira');
const dashAll = cats.fix.filter(x => x.scope === 'dashboard');
const tplAll = [...cats.feat, ...cats.fix].filter(x => x.scope === 'templates');
const dbAll = cats.fix.filter(x => x.scope === 'db');

const css = `*{margin:0;padding:0;box-sizing:border-box}body{font-family:Montserrat,sans-serif;background:#0A0A0A;color:#F5F0E8;min-height:100vh;display:flex}.sidebar{position:fixed;top:0;left:0;width:220px;height:100vh;background:#111;border-right:1px solid rgba(200,169,126,.12);overflow-y:auto;padding:20px 0;z-index:10}.sidebar h2{font-family:Cormorant Garamond,serif;font-size:16px;font-weight:300;font-style:italic;color:#C8A97E;padding:0 16px 16px;border-bottom:1px solid rgba(200,169,126,.1)}.sidebar a{display:block;padding:8px 16px;font-size:11px;color:rgba(245,240,232,.5);text-decoration:none;transition:.2s}.sidebar a:hover{color:#C8A97E;background:rgba(200,169,126,.06)}.sidebar .cat{font-size:8px;letter-spacing:.15em;text-transform:uppercase;color:rgba(200,169,126,.35);padding:16px 16px 4px;font-weight:600}.main{margin-left:220px;max-width:900px;padding:40px 32px}.header{text-align:center;padding-bottom:24px;border-bottom:1px solid rgba(200,169,126,.2);margin-bottom:32px}.header h1{font-family:Cormorant Garamond,serif;font-weight:300;font-style:italic;font-size:28px;color:#C8A97E}.header .subtitle{font-size:10px;color:rgba(245,240,232,.4);letter-spacing:.15em;text-transform:uppercase;margin-top:8px}.stats{display:flex;justify-content:center;gap:24px;margin-top:16px}.stat{text-align:center}.stat .val{font-size:24px;font-weight:700;color:#C8A97E}.stat .lbl{font-size:8px;text-transform:uppercase;letter-spacing:.1em;color:rgba(245,240,232,.3)}.sep{height:1px;background:linear-gradient(90deg,transparent,#C8A97E,transparent);margin:28px 0}.section{margin-bottom:32px}.section-title{font-size:9px;letter-spacing:.18em;text-transform:uppercase;color:rgba(200,169,126,.5);font-weight:600;margin-bottom:14px;display:flex;align-items:center;gap:8px}.section-title::after{content:"";flex:1;height:1px;background:rgba(200,169,126,.1)}h3{font-family:Cormorant Garamond,serif;font-size:18px;font-weight:300;font-style:italic;color:#C8A97E;margin-bottom:10px}.item{padding:8px 12px;border-left:3px solid rgba(200,169,126,.15);margin-bottom:6px;background:rgba(255,255,255,.02);border-radius:0 6px 6px 0}.item .desc{font-size:11px;color:rgba(245,240,232,.7);line-height:1.5}.item .meta{font-size:9px;color:rgba(245,240,232,.25);margin-top:3px}.item .meta code{background:rgba(200,169,126,.1);padding:1px 5px;border-radius:3px;font-size:8px;color:#C8A97E}.item-feat{border-left-color:#10B981}.item-fix{border-left-color:#F59E0B}.item-docs{border-left-color:#3B82F6}.badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:8px;font-weight:600;letter-spacing:.1em;text-transform:uppercase;margin-right:4px}.badge-feat{background:rgba(16,185,129,.15);color:#10B981}.badge-fix{background:rgba(245,158,11,.15);color:#F59E0B}.badge-docs{background:rgba(59,130,246,.15);color:#3B82F6}.footer{text-align:center;padding-top:20px;border-top:1px solid rgba(200,169,126,.12);margin-top:32px}.footer p{font-size:9px;color:rgba(245,240,232,.2)}@media(max-width:768px){.sidebar{display:none}.main{margin-left:0}}`;

const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>ClinicAI — Repositorio de Mudancas</title>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,300;0,400;0,600;1,300;1,400&family=Montserrat:wght@300;400;500;600;700;800&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<nav class="sidebar">
  <h2>Repositorio</h2>
  <a href="#resumo">Resumo</a>
  <div class="cat">Modulos</div>
  <a href="#face-mapping">Analise Facial (${fmAll.length})</a>
  <a href="#auth">Autenticacao (${authAll.length})</a>
  <a href="#mira">Mira (${miraAll.length})</a>
  <a href="#dashboard">Dashboard (${dashAll.length})</a>
  <a href="#templates">Templates (${tplAll.length})</a>
  <a href="#database">Banco de Dados (${dbAll.length})</a>
  <a href="#infra">Infraestrutura</a>
  <div class="cat">Referencia</div>
  <a href="#features">Features (${cats.feat.length})</a>
  <a href="#bugs">Bugs (${cats.fix.length})</a>
  <a href="#docs-section">Docs (${cats.docs.length})</a>
</nav>
<div class="main">
  <div class="header">
    <h1>Repositorio de Mudancas</h1>
    <div class="subtitle">ClinicAI Dashboard — Sprint 12-13 Abril 2026</div>
    <div class="stats">
      <div class="stat"><div class="val">${lines.length}</div><div class="lbl">Commits</div></div>
      <div class="stat"><div class="val">${cats.feat.length}</div><div class="lbl">Features</div></div>
      <div class="stat"><div class="val">${cats.fix.length}</div><div class="lbl">Bug Fixes</div></div>
      <div class="stat"><div class="val">${cats.docs.length}</div><div class="lbl">Docs</div></div>
    </div>
  </div>

  <div class="sep"></div>
  <div class="section" id="face-mapping">
    <div class="section-title">Analise Facial (Face Mapping)</div>
    <h3>Auditoria Completa — 4 Fases, ${fmAll.length} commits</h3>
    ${items(fmAll.filter(x => cats.fix.includes(x)), 'fix')}
    ${items(fmAll.filter(x => cats.feat.includes(x)), 'feat')}
  </div>

  <div class="sep"></div>
  <div class="section" id="auth">
    <div class="section-title">Autenticacao e Health Check</div>
    ${items(authAll, 'fix')}
  </div>

  <div class="sep"></div>
  <div class="section" id="mira">
    <div class="section-title">Mira (Assistente WhatsApp)</div>
    ${items(miraAll.filter(x => cats.feat.includes(x)), 'feat')}
    ${items(miraAll.filter(x => cats.fix.includes(x)), 'fix')}
    ${items(miraAll.filter(x => cats.docs.includes(x)), 'docs')}
  </div>

  <div class="sep"></div>
  <div class="section" id="dashboard">
    <div class="section-title">Dashboard</div>
    ${items(dashAll, 'fix')}
  </div>

  <div class="sep"></div>
  <div class="section" id="templates">
    <div class="section-title">Templates de Mensagem</div>
    ${items(tplAll.filter(x => cats.feat.includes(x)), 'feat')}
    ${items(tplAll.filter(x => cats.fix.includes(x)), 'fix')}
  </div>

  <div class="sep"></div>
  <div class="section" id="database">
    <div class="section-title">Banco de Dados</div>
    ${items(dbAll, 'fix')}
  </div>

  <div class="sep"></div>
  <div class="section" id="infra">
    <div class="section-title">Infraestrutura</div>
    <div class="item item-feat"><div class="desc"><span class="badge badge-feat">deploy</span> API Facial Python no Easypanel VPS — clinicai-facial-api.px1hdq.easypanel.host</div></div>
    <div class="item item-fix"><div class="desc"><span class="badge badge-fix">fix</span> Health monitor: /auth/v1/health em vez de /rest/v1/</div></div>
    <div class="item item-fix"><div class="desc"><span class="badge badge-fix">fix</span> 6 modulos migrados para _sbShared.rpc()</div></div>
    <div class="item item-fix"><div class="desc"><span class="badge badge-fix">fix</span> cashflow_segments + cashflow_patients_ltv aplicados no banco</div></div>
    <div class="item item-feat"><div class="desc"><span class="badge badge-feat">feat</span> Migration facial: 2 tabelas + 4 RPCs</div></div>
  </div>

  <div class="sep"></div>
  <div class="section" id="features">
    <div class="section-title">Todas as Features (${cats.feat.length})</div>
    ${items(cats.feat, 'feat')}
  </div>

  <div class="sep"></div>
  <div class="section" id="bugs">
    <div class="section-title">Todos os Bugs Corrigidos (${cats.fix.length})</div>
    ${items(cats.fix, 'fix')}
  </div>

  <div class="sep"></div>
  <div class="section" id="docs-section">
    <div class="section-title">Documentacao (${cats.docs.length})</div>
    ${items(cats.docs, 'docs')}
  </div>

  <div class="footer">
    <p>Gerado em ${new Date().toISOString().split('T')[0]} — ClinicAI Dashboard</p>
    <p style="margin-top:4px;font-family:Cormorant Garamond,serif;font-style:italic;color:rgba(200,169,126,.3)">Harmonia que revela. Precisao que dura.</p>
  </div>
</div>
</body>
</html>`;

fs.writeFileSync('docs/repositorio.html', html);
console.log('OK — ' + lines.length + ' commits, ' + Math.round(html.length / 1024) + 'KB');
