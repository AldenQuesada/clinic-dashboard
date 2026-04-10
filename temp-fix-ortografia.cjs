// Fix ortografia nos templates do banco
// Rodar: node temp-fix-ortografia.cjs
const { Client } = require('pg');
const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});

async function run() {
  await c.connect();
  var v = '00000000-0000-0000-0000-000000000001';

  // 1. Fix "botulinca" -> "botulínica" em todos os templates e blocks
  var templates = await c.query("SELECT id, name, content FROM legal_doc_templates WHERE clinic_id=$1 AND deleted_at IS NULL", [v]);

  var fixed = 0;
  for (var t of templates.rows) {
    var content = t.content;
    var changed = false;

    // Fix typos comuns
    var replacements = [
      ['botulinca', 'botulínica'],
      ['Botulinca', 'Botulínica'],
      ['botulinica', 'botulínica'],
      ['Botulinica', 'Botulínica'],
      ['Aplicacao de Toxina', 'Aplicação de Toxina'],
      ['procedimento estetico', 'procedimento estético'],
      ['contraindicacoes', 'contraindicações'],
      ['Contraindicacoes', 'Contraindicações'],
      ['complicacoes', 'complicações'],
      ['Complicacoes', 'Complicações'],
      ['descricao', 'descrição'],
      ['Descricao', 'Descrição'],
      ['informacoes', 'informações'],
      ['Informacoes', 'Informações'],
      ['reaplicacoes', 'reaplicações'],
      ['indicacao', 'indicação'],
      ['Indicacao', 'Indicação'],
      ['aplicacao', 'aplicação'],
      ['Aplicacao', 'Aplicação'],
      ['producao', 'produção'],
      ['reducao', 'redução'],
      ['Reducao', 'Redução'],
      ['cicatrizacao', 'cicatrização'],
      ['pigmentacao', 'pigmentação'],
      ['sensacao', 'sensação'],
      ['recuperacao', 'recuperação'],
      ['circulacao', 'circulação'],
      ['estimulacao', 'estimulação'],
      ['oxigenacao', 'oxigenação'],
      ['regeneracao', 'regeneração'],
      ['prevencao', 'prevenção'],
      ['inflamacao', 'inflamação'],
      ['Gestacao', 'Gestação'],
      ['gestacao', 'gestação'],
      ['lactacao', 'lactação'],
      ['Infeccao', 'Infecção'],
      ['infeccao', 'infecção'],
      ['Infeccoes', 'Infecções'],
      ['infeccoes', 'infecções'],
      ['Reacoes', 'Reações'],
      ['reacoes', 'reações'],
      ['Reacao', 'Reação'],
      ['reacao', 'reação'],
      ['Doencas', 'Doenças'],
      ['doencas', 'doenças'],
      ['Doenca', 'Doença'],
      ['doenca', 'doença'],
      ['excecao', 'exceção'],
      ['protecao', 'proteção'],
      ['Protecao', 'Proteção'],
      ['declaracao', 'declaração'],
      ['Declaracao', 'Declaração'],
      ['obrigacoes', 'obrigações'],
      ['autorizacao', 'autorização'],
      ['Autorizacao', 'Autorização'],
      ['orientacao', 'orientação'],
      ['alteracao', 'alteração'],
      ['legislacao', 'legislação'],
      ['compensacao', 'compensação'],
      ['remuneracao', 'remuneração'],
      ['utilizacao', 'utilização'],
      ['edema efemero', 'edema efêmero'],
      ['minimo', 'mínimo'],
      ['clinico', 'clínico'],
      ['clinica', 'clínica'],
      ['medico', 'médico'],
      ['estetico', 'estético'],
      ['estetica', 'estética'],
      ['Estetica', 'Estética'],
      ['topico', 'tópico'],
      ['topica', 'tópica'],
      ['transitoria', 'transitória'],
      ['temporario', 'temporário'],
      ['temporaria', 'temporária'],
      ['necessario', 'necessário'],
      ['obrigatorio', 'obrigatório'],
      ['definitivo', 'definitivo'],
      ['vicio', 'vício'],
      ['rejuvenescimeno', 'rejuvenescimento'],
    ];

    for (var [from, to] of replacements) {
      if (content.includes(from)) {
        content = content.split(from).join(to);
        changed = true;
      }
    }

    if (changed) {
      await c.query('UPDATE legal_doc_templates SET content=$1, version=version+1 WHERE id=$2', [content, t.id]);
      console.log('OK:', t.name);
      fixed++;
    }
  }

  // 2. Fix procedure_blocks tambem
  var blocks = await c.query("SELECT id, procedure_name, finalidade, descricao, riscos, contraindicacoes, resultados, cuidados_pre, cuidados_pos FROM legal_doc_procedure_blocks WHERE clinic_id=$1", [v]);

  var bFixed = 0;
  for (var b of blocks.rows) {
    var cols = ['finalidade', 'descricao', 'riscos', 'contraindicacoes', 'resultados', 'cuidados_pre', 'cuidados_pos'];
    var updates = {};

    for (var col of cols) {
      if (!b[col]) continue;
      var val = b[col];
      var orig = val;
      for (var [from, to] of replacements) {
        if (val.includes(from)) val = val.split(from).join(to);
      }
      if (val !== orig) updates[col] = val;
    }

    if (Object.keys(updates).length) {
      var sets = Object.keys(updates).map((k, i) => k + '=$' + (i + 2));
      var vals = [b.id, ...Object.values(updates)];
      await c.query('UPDATE legal_doc_procedure_blocks SET ' + sets.join(',') + ' WHERE id=$1', vals);
      console.log('BLOCK OK:', b.procedure_name);
      bFixed++;
    }
  }

  console.log('\nTemplates corrigidos:', fixed);
  console.log('Blocks corrigidos:', bFixed);
  await c.end();
}
run().catch(e => { console.log('Error:', e.message); c.end(); });
