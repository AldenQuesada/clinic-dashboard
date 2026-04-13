const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0';
const URL = 'https://oqboitkpcvuaudouwvkl.supabase.co';

const OLD_FOOTER = '<div style="display:flex;justify-content:space-around;flex-wrap:wrap;gap:24px;margin:24px 0">'
  + '<div style="text-align:center;min-width:200px">'
  + '<div style="border-bottom:1px solid #374151;width:220px;margin:0 auto 8px"></div>'
  + '<div style="font-weight:700;font-size:13px">{{nome}}</div>'
  + '<div style="font-size:11px;color:#6B7280">CPF: {{cpf}}</div>'
  + '<div style="font-size:11px;color:#6B7280">Paciente</div>'
  + '</div>'
  + '<div style="text-align:center;min-width:200px">'
  + '<div style="border-bottom:1px solid #374151;width:220px;margin:0 auto 8px"></div>'
  + '<div style="font-weight:700;font-size:13px">{{profissional}}</div>'
  + '<div style="font-size:11px;color:#6B7280">{{registro_profissional}}</div>'
  + '<div style="font-size:11px;color:#6B7280">{{especialidade}}</div>'
  + '</div>'
  + '</div>';

const NEW_FOOTER = '<div style="margin:32px 0 24px;text-align:center">'
  + '<div style="margin-bottom:32px">'
  + '<div style="border-bottom:1px solid #374151;width:240px;margin:0 auto 8px"></div>'
  + '<div style="font-weight:700;font-size:13px">{{nome}}</div>'
  + '<div style="font-size:11px;color:#6B7280">CPF: {{cpf}}</div>'
  + '<div style="font-size:11px;color:#6B7280">Paciente</div>'
  + '</div>'
  + '<div>'
  + '<div style="border-bottom:1px solid #374151;width:240px;margin:0 auto 8px"></div>'
  + '<div style="font-weight:700;font-size:13px">{{profissional}}</div>'
  + '<div style="font-size:11px;color:#6B7280">{{registro_profissional}}</div>'
  + '<div style="font-size:11px;color:#6B7280">{{especialidade}}</div>'
  + '</div>'
  + '</div>';

const OLD_CLINIC = '<div style="font-weight:700;font-size:12px;color:#1a1a2e;margin-bottom:4px">{{clinica}}</div>';
const NEW_CLINIC = '<div style="font-weight:700;font-size:12px;color:#1a1a2e;margin-bottom:4px">Cl\u00ednica Mirian de Paula Beauty & Health</div>';

async function run() {
  const login = await fetch(URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'apikey': ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'contato@aldenquesada.org', password: 'rosangela*121776' })
  });
  const auth = await login.json();
  if (!auth.access_token) { console.log('Login failed'); return; }
  const H = { apikey: ANON, Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json', Prefer: 'return=minimal' };

  const tRes = await fetch(URL + '/rest/v1/legal_doc_templates?deleted_at=is.null&select=id,name,content', { headers: H });
  const templates = await tRes.json();
  console.log('Templates:', templates.length);

  let fixed = 0;
  for (const t of templates) {
    let content = t.content;
    let changed = false;

    // Fix footer layout (flex-row -> stacked vertical)
    if (content.includes(OLD_FOOTER)) {
      content = content.replace(OLD_FOOTER, NEW_FOOTER);
      changed = true;
    }

    // Fix clinic name (hardcode instead of variable that returns "nossa clinica")
    if (content.includes(OLD_CLINIC)) {
      content = content.replace(OLD_CLINIC, NEW_CLINIC);
      changed = true;
    }

    // Also fix {{clinica}} standalone references
    if (content.includes('{{clinica}}')) {
      content = content.split('{{clinica}}').join('Cl\u00ednica Mirian de Paula Beauty & Health');
      changed = true;
    }

    if (changed) {
      const r = await fetch(URL + '/rest/v1/legal_doc_templates?id=eq.' + t.id, {
        method: 'PATCH', headers: H, body: JSON.stringify({ content })
      });
      if (r.ok) { console.log('  OK:', t.name); fixed++; }
      else console.log('  FAIL:', t.name, r.status);
    }
  }
  console.log('\nCorrigidos:', fixed);
}
run().catch(e => console.log('Error:', e.message));
