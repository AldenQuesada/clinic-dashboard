// Cola no console do dashboard (F12)
(async function() {
  var r = await _sbShared.from('legal_doc_procedure_blocks').insert({
    clinic_id: '00000000-0000-0000-0000-000000000001',
    procedure_name: 'Limpeza de Pele',
    procedure_keys: ["limpeza de pele","limpeza facial","limpeza"],
    finalidade: 'Desobstruir poros, remover impurezas, oleosidade excessiva, celulas mortas e comedoes, melhorar textura, vico e aparencia da pele, prevenir espinhas e inflamacoes e tornar a pele mais receptiva a outros tratamentos.',
    descricao: '<ul><li>Higienizacao com sabonetes especificos;</li><li>Esfoliacao com microgranulos ou acidos leves;</li><li>Locoees emolientes + vapor de ozonio para abrir poros;</li><li>Extracao manual de cravos abertos e fechados;</li><li>Corrente eletrica leve bactericida;</li><li>Mascara calmante ou reequilibrante;</li><li>Tonificacao, hidratacao e protetor solar.</li></ul>',
    alternativas: '<ul><li>Peeling Ultrassonico;</li><li>HydraFacial;</li><li>Peeling de Diamante ou Cristal;</li><li>Mascaras Detox ou Argila;</li><li>Peeling Quimico Superficial;</li><li>Terapia com LED Azul;</li><li>Limpeza de pele enzimatica.</li></ul>',
    beneficios: '<ul><li>Poros desobstruidos e limpos;</li><li>Melhor respiracao cutanea;</li><li>Reducao de espinhas e inflamacoes;</li><li>Controle da oleosidade;</li><li>Melhora na textura;</li><li>Aparencia mais jovem e revitalizada;</li><li>Melhor absorcao de dermocosmeticos;</li><li>Sensacao de frescor e bem-estar.</li></ul>',
    riscos: '<ul><li>Vermelhidao (eritema);</li><li>Sensacao de ardencia ou repuxamento;</li><li>Manchas pos-inflamatorias;</li><li>Hematomas leves;</li><li>Acne rebote (raro);</li><li>Descamacao leve.</li></ul>',
    contraindicacoes: '<ul><li>Acne inflamatoria grave (graus III e IV);</li><li>Infeccoes cutaneas (herpes, impetigo, foliculite);</li><li>Pele com queimadura solar;</li><li>Pos-procedimento agressivo recente;</li><li>Dermatites em fase aguda;</li><li>Rosacea em crise.</li></ul>',
    resultados: 'Inicio: imediato. Maximo: 2-3 dias. Duracao: 15-30 dias.',
    cuidados_pre: '<ul><li>Informar sobre doencas, medicamentos, gestacao, alergias;</li><li>Evitar exposicao solar intensa;</li><li>Nao usar esfoliantes, acidos ou retinoides;</li><li>Evitar depilacao facial;</li><li>Higienizar o rosto no dia.</li></ul>',
    cuidados_pos: '<ul><li>Evitar sol 48-72h;</li><li>Sem maquiagem nas primeiras 24h;</li><li>Nao tocar ou espremer a pele;</li><li>Evitar sauna, piscina, academia 24h;</li><li>Hidratar com produtos adequados;</li><li>Evitar acidos e esfoliantes por 3-5 dias.</li></ul>',
    conforto: '<ul><li>Vapor morno;</li><li>Movimentos suaves e ritmo controlado;</li><li>Produtos calmantes;</li><li>Mascara anestesica topica (opcional).</li></ul>',
  })
  if (r.error) console.log('FALHOU:', r.error.message)
  else console.log('OK: Limpeza de Pele inserida')
})()
