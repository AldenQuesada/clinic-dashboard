const { Client } = require('pg');
const c = new Client({
  host: 'db.oqboitkpcvuaudouwvkl.supabase.co',
  port: 5432, user: 'postgres', password: 'Rosangela*121776',
  database: 'postgres', ssl: { rejectUnauthorized: false }
});

async function run() {
  await c.connect();
  var v = '00000000-0000-0000-0000-000000000001';

  // Rodape antigo (gerado automaticamente) nos 26 templates
  var oldFooter = '<p style="text-align:center;margin-top:24px">{{clinica}}<br>{{endereco_clinica}}<br>{{data_extenso}}</p>';

  // Novo rodape premium com dados da clinica + profissional + paciente
  var newFooter = ''
    + '<hr style="margin:32px 0 24px;border:none;border-top:2px solid #1a1a2e">'

    + '<div style="display:flex;justify-content:space-around;flex-wrap:wrap;gap:24px;margin:24px 0">'

    // Bloco assinatura paciente
    + '<div style="text-align:center;min-width:200px">'
    + '<div style="border-bottom:1px solid #374151;width:220px;margin:0 auto 8px"></div>'
    + '<div style="font-weight:700;font-size:13px">{{nome}}</div>'
    + '<div style="font-size:11px;color:#6B7280">CPF: {{cpf}}</div>'
    + '<div style="font-size:11px;color:#6B7280">Paciente</div>'
    + '</div>'

    // Bloco assinatura profissional
    + '<div style="text-align:center;min-width:200px">'
    + '<div style="border-bottom:1px solid #374151;width:220px;margin:0 auto 8px"></div>'
    + '<div style="font-weight:700;font-size:13px">{{profissional}}</div>'
    + '<div style="font-size:11px;color:#6B7280">{{registro_profissional}}</div>'
    + '<div style="font-size:11px;color:#6B7280">{{especialidade}}</div>'
    + '</div>'

    + '</div>'

    // Dados da clinica
    + '<div style="margin-top:24px;padding:16px;background:#F9FAFB;border:1px solid #E5E7EB;border-radius:10px;text-align:center;font-size:11px;color:#6B7280;line-height:1.8">'
    + '<div style="font-weight:700;font-size:12px;color:#1a1a2e;margin-bottom:4px">{{clinica}}</div>'
    + '<div>CNPJ: {{cnpj}}</div>'
    + '<div>{{endereco_clinica}}</div>'
    + '<div>Tel: (44) 99162-2986 | clinicabeautyehealth@gmail.com</div>'
    + '<div style="margin-top:8px;font-size:10px;color:#9CA3AF">{{data_extenso}}</div>'
    + '<div style="margin-top:4px;font-size:9px;color:#9CA3AF">Este documento sera arquivado no prontuario por, no minimo, 20 anos, conforme legislacao vigente.</div>'
    + '</div>';

  // Atualizar todos os templates que terminam com o footer antigo
  var res = await c.query(
    "SELECT id, name, content FROM legal_doc_templates WHERE clinic_id=$1 AND deleted_at IS NULL AND content LIKE $2",
    [v, '%' + oldFooter.substring(0, 50) + '%']
  );

  console.log('Templates com footer antigo:', res.rows.length);

  var updated = 0;
  for (var row of res.rows) {
    var newContent = row.content.replace(oldFooter, newFooter);
    if (newContent !== row.content) {
      await c.query('UPDATE legal_doc_templates SET content=$1, version=version+1 WHERE id=$2', [newContent, row.id]);
      console.log('  OK:', row.name);
      updated++;
    }
  }

  // Tambem atualizar o TCLE original que tem footer diferente
  var tcle = await c.query(
    "SELECT id, name, content FROM legal_doc_templates WHERE clinic_id=$1 AND deleted_at IS NULL AND name LIKE 'TCLE - Termo de Consentimento%'",
    [v]
  );
  if (tcle.rows.length) {
    var t = tcle.rows[0];
    // Substituir o footer do TCLE original
    var oldTcleFooter = '<p style="text-align:center"><br>________________________________________<br><strong>{{nome}}</strong><br>PACIENTE</p>'
      + '\n\n<p style="text-align:center"><br>________________________________________<br><strong>{{profissional}}</strong><br>{{especialidade}}</p>'
      + '\n\n<p style="text-align:center;font-size:10px;color:#9CA3AF;margin-top:24px">Este documento sera arquivado no prontuario do paciente por, no minimo, 20 anos, conforme legislacao vigente.</p>';

    // Tentar match mais flexivel
    if (t.content.includes('________________________________________') && t.content.includes('PACIENTE')) {
      // Cortar a partir do primeiro bloco de assinatura e substituir
      var cutIdx = t.content.indexOf('<p style="text-align:center"><br>________________________________________<br><strong>{{nome}}</strong>');
      if (cutIdx > 0) {
        var newContent = t.content.substring(0, cutIdx) + newFooter;
        await c.query('UPDATE legal_doc_templates SET content=$1, version=version+1 WHERE id=$2', [newContent, t.id]);
        console.log('  OK (TCLE original):', t.name);
        updated++;
      }
    }
  }

  console.log('\nTotal atualizados:', updated);
  await c.end();
}
run().catch(e => { console.log('Error:', e.message); c.end(); });
