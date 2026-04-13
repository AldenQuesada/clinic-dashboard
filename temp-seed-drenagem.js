// Cola no console do dashboard (F12)
(async function() {
  var r = await _sbShared.from('legal_doc_procedure_blocks').insert({
    clinic_id: '00000000-0000-0000-0000-000000000001',
    procedure_name: 'Drenagem Linfatica',
    procedure_keys: ["drenagem","drenagem linfatica","linfatica"],
    finalidade: 'Acelerar recuperacao pos-cirurgica ou pos-estetica, melhorar circulacao linfatica e venosa, reduzir inchacos, eliminar toxinas, auxiliar na melhora da celulite e promover relaxamento e bem-estar.',
    descricao: '<ul><li>Paciente deitado confortavelmente;</li><li>Abertura dos linfonodos (cervical, axilar, inguinal);</li><li>Movimentos lentos com leve pressao: circulares, em bomba ou deslizamento;</li><li>Ritmo constante e repetitivo nas areas especificas.</li></ul>',
    alternativas: '<ul><li>Pressoterapia (drenagem mecanica);</li><li>Massagem relaxante ou circulatoria;</li><li>Exercicios fisicos leves;</li><li>Liberacao miofascial;</li><li>Radiofrequencia estetica;</li><li>Hidroterapia;</li><li>Alimentacao diuretica e detox.</li></ul>',
    beneficios: '<ul><li>Reducao de inchaco (edema);</li><li>Melhora da circulacao linfatica e venosa;</li><li>Eliminacao de toxinas;</li><li>Prevencao e combate a celulite;</li><li>Melhora do aspecto da pele;</li><li>Auxilio na recuperacao pos-operatoria;</li><li>Sensacao de leveza e relaxamento;</li><li>Estimulo do sistema imunologico.</li></ul>',
    riscos: '<ul><li>Hematomas leves;</li><li>Tontura ou queda de pressao;</li><li>Reacoes alergicas a cremes ou oleos;</li><li>Desconforto em regioes sensiveis;</li><li>Exacerbacao de sintomas.</li></ul>',
    contraindicacoes: '<ul><li>Trombose venosa profunda (TVP);</li><li>Insuficiencia cardiaca descompensada;</li><li>Infeccoes agudas;</li><li>Cancer ativo sem liberacao medica;</li><li>Erisipela ou linfangite;</li><li>Problemas graves na pele (dermatites, feridas abertas).</li></ul>',
    resultados: 'Inicio: imediato. Maximo: 3-5 sessoes. Duracao: 3-7 dias.',
    cuidados_pre: '<ul><li>Informar sobre doencas, medicamentos, gestacao, alergias;</li><li>Hidratar-se bem 24h antes;</li><li>Alimentacao leve;</li><li>Evitar cafeina ou alcool;</li><li>Roupas confortaveis.</li></ul>',
    cuidados_pos: '<ul><li>Manter hidratacao;</li><li>Evitar alimentos ricos em sodio;</li><li>Repouso relativo;</li><li>Evitar roupas apertadas;</li><li>Atividade fisica leve (se liberado);</li><li>Evitar alcool por 24h.</li></ul>',
    conforto: '<ul><li>Iluminacao suave;</li><li>Musica ambiente tranquila;</li><li>Aromaterapia leve;</li><li>Temperatura agradavel.</li></ul>',
  })
  if (r.error) console.log('FALHOU:', r.error.message)
  else console.log('OK: Drenagem Linfatica inserida')
})()
