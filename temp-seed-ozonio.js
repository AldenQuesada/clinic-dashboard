// Cola no console do dashboard (F12)
(async function() {
  var blocks = [
    {
      procedure_name: 'Ozonoterapia Facial',
      procedure_keys: ["ozonio facial","ozonoterapia facial","ozonio face"],
      finalidade: 'Melhorar a saude e aparencia da pele utilizando ozonio medicinal (O3) com propriedades antissepticas, cicatrizantes, regenerativas e antioxidantes. Indicada para acne, rosacea, dermatites, manchas, cicatrizes, envelhecimento e pele desvitalizada.',
      descricao: '<ul><li>Avaliacao da pele: tipo, sensibilidade, lesoes;</li><li>Limpeza previa (higienizacao e esfoliacao leve);</li><li>Aplicacao do ozonio via gas, agua ou oleo ozonizado, ou microagulhamento + ozonio;</li><li>Finalizacao com calmantes e protetor solar.</li></ul>',
      alternativas: '<ul><li>Limpeza de pele profunda;</li><li>Peelings quimicos;</li><li>Terapia fotodinamica com LED;</li><li>Microagulhamento sem ozonio;</li><li>Laser fracionado ou LIP.</li></ul>',
      beneficios: '<ul><li>Acao bactericida e fungicida;</li><li>Reducao da oleosidade;</li><li>Aceleracao da cicatrizacao;</li><li>Clareamento de manchas inflamatorias;</li><li>Revitalizacao e oxigenacao cutanea;</li><li>Estimulo de colageno e elastina;</li><li>Melhora da microcirculacao.</li></ul>',
      riscos: '<ul><li>Vermelhidao ou leve ardencia momentanea;</li><li>Ressecamento se uso excessivo;</li><li>Hipersensibilidade ao ozonio (muito raro).</li></ul>',
      contraindicacoes: '<ul><li>Gravidez (uso topico com cautela);</li><li>Hipertireoidismo nao controlado;</li><li>Doencas autoimunes ativas;</li><li>Hemofilia ou tendencia hemorragica;</li><li>Alergia a ozonio;</li><li>Pele sensibilizada por acidos, laser ou sol;</li><li>Infeccoes cutaneas agudas;</li><li>Herpes labial ativo.</li></ul>',
      resultados: 'Inicio: 1a-2a sessao. Maximo: 4-6 sessoes. Duracao: semanas a meses com bons cuidados.',
      cuidados_pre: '<ul><li>Evitar acidos topicos ou esfoliantes 48h antes;</li><li>Suspender isotretinoina ou antibioticos topicos;</li><li>Pele sem exposicao solar recente.</li></ul>',
      cuidados_pos: '<ul><li>Evitar sol nas 24-48h seguintes;</li><li>Hidratar a pele;</li><li>Nao usar produtos irritantes ou com alcool por 24h;</li><li>Seguir orientacao de intervalos entre sessoes.</li></ul>',
      conforto: '<ul><li>Ozonio a baixas concentracoes;</li><li>Canulas frias ou oleo/agua ozonizada;</li><li>Mascaras calmantes apos sessao;</li><li>Massagens faciais, aromaterapia (opcional).</li></ul>',
    },
    {
      procedure_name: 'Ozonoterapia Corporal',
      procedure_keys: ["ozonio corporal","ozonoterapia corporal","ozonio corpo"],
      finalidade: 'Melhorar saude e aparencia da pele utilizando ozonio medicinal (O3) para fins terapeuticos, esteticos e funcionais. Acoes: anti-inflamatoria, analgesica, bactericida, estimulante da circulacao e regeneracao tecidual. Indicada para celulite, gordura localizada, estrias, flacidez, fibroses pos-cirurgicas, dores musculares, feridas cronicas.',
      descricao: '<ul><li>Microinjecoes com seringa e agulhas finas com ozonio na gordura localizada, celulite, pontos dolorosos ou areas com fibrose.</li></ul>',
      alternativas: '<ul><li>Carboxiterapia;</li><li>Drenagem linfatica;</li><li>Mesoterapia corporal;</li><li>Laser lipolise ou criolipolise;</li><li>Peelings corporais e bioestimuladores;</li><li>Infravermelho ou ondas de choque.</li></ul>',
      beneficios: '<ul><li>Reducao de celulite e gordura localizada;</li><li>Aumento da oxigenacao e circulacao;</li><li>Melhora da textura e cicatrizacao;</li><li>Drenagem de liquidos e toxinas;</li><li>Acao antifungica, antibacteriana e antiviral;</li><li>Alivio de dores musculares e articulares;</li><li>Estimulacao de colageno.</li></ul>',
      riscos: '<ul><li>Dor leve ou ardencia no local;</li><li>Hematomas ou edema leve;</li><li>Reacoes alergicas ao oleo ozonizado (raro).</li></ul>',
      contraindicacoes: '<ul><li>Gestacao;</li><li>Tireotoxicose;</li><li>Deficiencia de G6PD;</li><li>Trombocitopenia severa;</li><li>Epilepsia nao controlada;</li><li>Doencas autoimunes ativas;</li><li>Infeccao ativa no local;</li><li>Anticoagulantes recentes;</li><li>Hipotensao descompensada.</li></ul>',
      resultados: 'Inicio: 2a-3a sessao. Maximo: 5-8 sessoes. Duracao: meses com manutencao trimestral/semestral.',
      cuidados_pre: '<ul><li>Evitar sol ou procedimentos invasivos na area;</li><li>Nao usar cremes ou acidos 24h antes;</li><li>Hidratar-se bem.</li></ul>',
      cuidados_pos: '<ul><li>Evitar sol 24-48h;</li><li>Manter hidratacao oral e da pele;</li><li>Evitar atividade fisica intensa 24h;</li><li>Comunicar reacoes persistentes.</li></ul>',
      conforto: '<ul><li>Ozonio a baixas concentracoes;</li><li>Canulas frias ou oleo/agua ozonizada;</li><li>Mascaras calmantes;</li><li>Aromaterapia e cromoterapia (opcional).</li></ul>',
    },
  ]

  var ok = 0, fail = 0
  for (var i = 0; i < blocks.length; i++) {
    var b = blocks[i]
    try {
      var r = await _sbShared.from('legal_doc_procedure_blocks').insert({
        clinic_id: '00000000-0000-0000-0000-000000000001',
        procedure_name: b.procedure_name,
        procedure_keys: b.procedure_keys,
        finalidade: b.finalidade,
        descricao: b.descricao,
        alternativas: b.alternativas,
        beneficios: b.beneficios,
        riscos: b.riscos,
        contraindicacoes: b.contraindicacoes,
        resultados: b.resultados,
        cuidados_pre: b.cuidados_pre,
        cuidados_pos: b.cuidados_pos,
        conforto: b.conforto,
      })
      if (r.error) { console.log('FALHOU:', b.procedure_name, r.error.message); fail++ }
      else { console.log('OK:', b.procedure_name); ok++ }
    } catch(e) { console.log('ERRO:', b.procedure_name, e.message); fail++ }
  }
  console.log('TOTAL: ' + ok + ' OK, ' + fail + ' falhou')
})()
