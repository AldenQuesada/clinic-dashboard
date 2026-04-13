const ANON = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0';
const URL = 'https://oqboitkpcvuaudouwvkl.supabase.co';

const REPLACEMENTS = [
  ['botulinca', 'botulínica'], ['Botulinca', 'Botulínica'],
  ['botulinica', 'botulínica'], ['Botulinica', 'Botulínica'],
  ['contraindicacoes', 'contraindicações'], ['Contraindicacoes', 'Contraindicações'],
  ['complicacoes', 'complicações'], ['Complicacoes', 'Complicações'],
  ['descricao', 'descrição'], ['Descricao', 'Descrição'],
  ['informacoes', 'informações'], ['Informacoes', 'Informações'],
  ['reaplicacoes', 'reaplicações'], ['indicacao', 'indicação'],
  ['aplicacao', 'aplicação'], ['Aplicacao', 'Aplicação'],
  ['producao', 'produção'], ['reducao', 'redução'], ['Reducao', 'Redução'],
  ['cicatrizacao', 'cicatrização'], ['pigmentacao', 'pigmentação'],
  ['hiperpigmentacao', 'hiperpigmentação'], ['Hiperpigmentacao', 'Hiperpigmentação'],
  ['sensacao', 'sensação'], ['recuperacao', 'recuperação'],
  ['circulacao', 'circulação'], ['estimulacao', 'estimulação'],
  ['oxigenacao', 'oxigenação'], ['regeneracao', 'regeneração'],
  ['prevencao', 'prevenção'], ['inflamacao', 'inflamação'],
  ['Gestacao', 'Gestação'], ['gestacao', 'gestação'],
  ['lactacao', 'lactação'], ['Infeccao', 'Infecção'], ['infeccao', 'infecção'],
  ['Infeccoes', 'Infecções'], ['infeccoes', 'infecções'],
  ['Reacoes', 'Reações'], ['reacoes', 'reações'],
  ['Doencas', 'Doenças'], ['doencas', 'doenças'],
  ['protecao', 'proteção'], ['Protecao', 'Proteção'],
  ['declaracao', 'declaração'], ['Declaracao', 'Declaração'],
  ['autorizacao', 'autorização'], ['Autorizacao', 'Autorização'],
  ['orientacao', 'orientação'], ['alteracao', 'alteração'],
  ['legislacao', 'legislação'], ['compensacao', 'compensação'],
  ['utilizacao', 'utilização'], ['veiculacao', 'veiculação'],
  ['efemero', 'efêmero'], ['minimo', 'mínimo'],
  ['estetico', 'estético'], ['estetica', 'estética'], ['Estetica', 'Estética'],
  ['topico', 'tópico'], ['topica', 'tópica'],
  ['transitoria', 'transitória'], ['transitorias', 'transitórias'],
  ['temporario', 'temporário'], ['temporaria', 'temporária'],
  ['necessario', 'necessário'], ['obrigatorio', 'obrigatório'],
  ['rejuvenescimeno', 'rejuvenescimento'],
  ['prontuario', 'prontuário'],
  ['clinica,', 'clínica,'], ['clinica.', 'clínica.'],
  ['medica', 'médica'], ['publicitarias', 'publicitárias'],
  ['unico', 'único'], ['juridica', 'jurídica'],
  ['Locoes', 'Loções'], ['locoes', 'loções'],
  ['Solucao', 'Solução'], ['solucao', 'solução'],
  ['funcao', 'função'], ['Funcao', 'Função'],
  ['regiao', 'região'], ['Regiao', 'Região'],
  ['Avaliacao', 'Avaliação'], ['avaliacao', 'avaliação'],
  ['Higienizacao', 'Higienização'], ['higienizacao', 'higienização'],
  ['Posicao', 'Posição'], ['posicao', 'posição'],
  ['Duracao', 'Duração'], ['duracao', 'duração'],
  ['Reducao', 'Redução'],
];

function fix(text) {
  if (!text) return null;
  let t = text, changed = false;
  for (const [f, r] of REPLACEMENTS) {
    if (t.includes(f)) { t = t.split(f).join(r); changed = true; }
  }
  return changed ? t : null;
}

async function run() {
  // Login
  const login = await fetch(URL + '/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'apikey': ANON, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'contato@aldenquesada.org', password: 'rosangela*121776' })
  });
  const auth = await login.json();
  if (!auth.access_token) { console.log('Login failed'); return; }
  const H = { apikey: ANON, Authorization: 'Bearer ' + auth.access_token, 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  console.log('Logged in');

  // Templates
  const tRes = await fetch(URL + '/rest/v1/legal_doc_templates?deleted_at=is.null&select=id,name,content', { headers: H });
  const templates = await tRes.json();
  console.log('Templates:', templates.length);
  let tF = 0;
  for (const t of templates) {
    const f = fix(t.content);
    if (f) {
      const r = await fetch(URL + '/rest/v1/legal_doc_templates?id=eq.' + t.id, { method: 'PATCH', headers: H, body: JSON.stringify({ content: f }) });
      if (r.ok) { console.log('  OK:', t.name); tF++; } else console.log('  FAIL:', t.name, r.status);
    }
  }

  // Blocks
  const bRes = await fetch(URL + '/rest/v1/legal_doc_procedure_blocks?select=id,procedure_name,finalidade,descricao,riscos,contraindicacoes,resultados,cuidados_pre,cuidados_pos', { headers: H });
  const blocks = await bRes.json();
  console.log('\nBlocks:', blocks.length);
  let bF = 0;
  for (const b of blocks) {
    const u = {};
    for (const c of ['finalidade','descricao','riscos','contraindicacoes','resultados','cuidados_pre','cuidados_pos']) {
      const f = fix(b[c]);
      if (f) u[c] = f;
    }
    if (Object.keys(u).length) {
      const r = await fetch(URL + '/rest/v1/legal_doc_procedure_blocks?id=eq.' + b.id, { method: 'PATCH', headers: H, body: JSON.stringify(u) });
      if (r.ok) { console.log('  OK:', b.procedure_name); bF++; } else console.log('  FAIL:', b.procedure_name, r.status);
    }
  }
  console.log('\nCorrigidos:', tF, 'templates,', bF, 'blocks');
}
run().catch(e => console.log('Error:', e.message));
