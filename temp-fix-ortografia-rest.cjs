// Fix ortografia via Supabase REST API (funciona sem IPv6)
const SB_URL = 'https://oqboitkpcvuaudouwvkl.supabase.co';
const SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0MTMwNDgyNSwiZXhwIjoyMDU2ODgwODI1fQ.g86FqPRpIByE76bM3v9phE01Yr8jD5JUfbQkkPY8MNI';
const HEADERS = { 'apikey': SB_KEY, 'Authorization': 'Bearer ' + SB_KEY, 'Content-Type': 'application/json', 'Prefer': 'return=minimal' };

const REPLACEMENTS = [
  ['botulinca', 'botulínica'], ['Botulinca', 'Botulínica'],
  ['botulinica', 'botulínica'], ['Botulinica', 'Botulínica'],
  ['contraindicacoes', 'contraindicações'], ['Contraindicacoes', 'Contraindicações'],
  ['complicacoes', 'complicações'], ['Complicacoes', 'Complicações'],
  ['descricao', 'descrição'], ['Descricao', 'Descrição'],
  ['informacoes', 'informações'], ['Informacoes', 'Informações'],
  ['reaplicacoes', 'reaplicações'],
  ['indicacao', 'indicação'], ['Indicacao', 'Indicação'],
  ['aplicacao', 'aplicação'], ['Aplicacao', 'Aplicação'],
  ['producao', 'produção'], ['Producao', 'Produção'],
  ['reducao', 'redução'], ['Reducao', 'Redução'],
  ['cicatrizacao', 'cicatrização'],
  ['pigmentacao', 'pigmentação'], ['hiperpigmentacao', 'hiperpigmentação'],
  ['sensacao', 'sensação'], ['recuperacao', 'recuperação'],
  ['circulacao', 'circulação'], ['estimulacao', 'estimulação'],
  ['oxigenacao', 'oxigenação'], ['regeneracao', 'regeneração'],
  ['prevencao', 'prevenção'], ['inflamacao', 'inflamação'],
  ['Gestacao', 'Gestação'], ['gestacao', 'gestação'],
  ['lactacao', 'lactação'], ['Lactacao', 'Lactação'],
  ['Infeccao', 'Infecção'], ['infeccao', 'infecção'],
  ['Infeccoes', 'Infecções'], ['infeccoes', 'infecções'],
  ['Reacoes', 'Reações'], ['reacoes', 'reações'],
  ['Reacao', 'Reação'], ['reacao', 'reação'],
  ['Doencas', 'Doenças'], ['doencas', 'doenças'],
  ['protecao', 'proteção'], ['Protecao', 'Proteção'],
  ['declaracao', 'declaração'], ['Declaracao', 'Declaração'],
  ['autorizacao', 'autorização'], ['Autorizacao', 'Autorização'],
  ['orientacao', 'orientação'], ['alteracao', 'alteração'],
  ['legislacao', 'legislação'], ['compensacao', 'compensação'],
  ['utilizacao', 'utilização'], ['Utilizacao', 'Utilização'],
  ['veiculacao', 'veiculação'],
  ['efemero', 'efêmero'],
  ['minimo', 'mínimo'], ['Minimo', 'Mínimo'],
  ['estetico', 'estético'], ['estetica', 'estética'], ['Estetica', 'Estética'],
  ['topico', 'tópico'], ['topica', 'tópica'],
  ['transitoria', 'transitória'], ['transitorias', 'transitórias'],
  ['temporario', 'temporário'], ['temporaria', 'temporária'],
  ['necessario', 'necessário'], ['obrigatorio', 'obrigatório'],
  ['rejuvenescimeno', 'rejuvenescimento'],
  ['Identificacao', 'Identificação'],
  ['Declaracao', 'Declaração'],
  ['Especialidade', 'Especialidade'],
  ['prontuario', 'prontuário'], ['Prontuario', 'Prontuário'],
  [' nao ', ' não '], ['Nao ', 'Não '],
  ['clinica,', 'clínica,'], ['clinica.', 'clínica.'],
  ['medica', 'médica'], ['medico', 'médico'],
  ['publicitarias', 'publicitárias'],
  ['unico', 'único'], ['valido', 'válido'],
  ['juridica', 'jurídica'], ['juridico', 'jurídico'],
];

function fixText(text) {
  if (!text) return text;
  let changed = false;
  for (const [from, to] of REPLACEMENTS) {
    if (text.includes(from)) { text = text.split(from).join(to); changed = true; }
  }
  return changed ? text : null;
}

async function run() {
  // 1. Fix templates
  const tRes = await fetch(SB_URL + '/rest/v1/legal_doc_templates?deleted_at=is.null&select=id,name,content', { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
  const templates = await tRes.json();
  console.log('Templates:', templates.length);

  let tFixed = 0;
  for (const t of templates) {
    const fixed = fixText(t.content);
    if (fixed) {
      const r = await fetch(SB_URL + '/rest/v1/legal_doc_templates?id=eq.' + t.id, {
        method: 'PATCH', headers: HEADERS,
        body: JSON.stringify({ content: fixed })
      });
      if (r.ok) { console.log('  OK:', t.name); tFixed++; }
      else console.log('  FAIL:', t.name, await r.text());
    }
  }

  // 2. Fix procedure blocks
  const bRes = await fetch(SB_URL + '/rest/v1/legal_doc_procedure_blocks?select=id,procedure_name,finalidade,descricao,riscos,contraindicacoes,resultados,cuidados_pre,cuidados_pos', { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } });
  const blocks = await bRes.json();
  console.log('\nBlocks:', blocks.length);

  let bFixed = 0;
  for (const b of blocks) {
    const updates = {};
    for (const col of ['finalidade', 'descricao', 'riscos', 'contraindicacoes', 'resultados', 'cuidados_pre', 'cuidados_pos']) {
      const fixed = fixText(b[col]);
      if (fixed) updates[col] = fixed;
    }
    if (Object.keys(updates).length) {
      const r = await fetch(SB_URL + '/rest/v1/legal_doc_procedure_blocks?id=eq.' + b.id, {
        method: 'PATCH', headers: HEADERS,
        body: JSON.stringify(updates)
      });
      if (r.ok) { console.log('  OK:', b.procedure_name); bFixed++; }
      else console.log('  FAIL:', b.procedure_name, await r.text());
    }
  }

  console.log('\nTotal: ' + tFixed + ' templates, ' + bFixed + ' blocks corrigidos');
}

run().catch(e => console.log('Error:', e.message));
