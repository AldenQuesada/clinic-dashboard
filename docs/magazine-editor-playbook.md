# Beauty & Health Magazine — Editor Playbook

**Fonte-da-verdade única para edição de revistas.** Antes de criar ou editar qualquer edição, ler este documento inteiro. Cada seção define um contrato inegociável.

---

## Princípios gerais

1. **Marca**: sempre "Beauty & Health" — nunca "ClinicAI Magazine" no conteúdo público.
2. **Tom de voz global**: editorial, cuidadoso, 2ª pessoa ("você"), nunca jargão médico sem tradução. Público 45+, feminino, não-cirúrgico.
3. **Sem emojis** nos textos editoriais (emojis só em CTA/whatsapp).
4. **Estrutura mínima de edição**: 6 páginas (capa + sumário + editorial + ≥1 matéria + CTA + contracapa). Ideal: 10-14.
5. **Ordem canônica**: capa → sumário → carta editorial → matérias/visuais intercalados → quiz/interação → contracapa.
6. **Cada foto precisa de**: descrição curta ("o que é"), aspect ratio preservado, resolução ≥ 1200px no lado maior.
7. **Itálico editorial**: em títulos, use `*palavra*` para marcar itálico em accent color.
8. **Segmentação**: por padrão toda página tem `segment_scope = ['all']`. Para VIP-only ou dormant-only, usar arrays específicos.

---

## Convenções de contrato de seção

Cada seção abaixo segue este formato:

- **slug**: identificador estável (NUNCA muda após publicado)
- **Quando usar**: caso de uso típico
- **Slots obrigatórios**: campos sem os quais não renderiza bem
- **Slots opcionais**: refinos
- **Regras de conteúdo**: limites de caracteres, tom, checagens
- **Regras de foto**: aspect, resolução, composição
- **Exemplo preenchido**: conteúdo real usável como referência

---

## CAPAS (categoria: cover)

### t01_cover_hero_dark — Capa Hero Dark
**Quando usar**: capa de edição com forte gancho editorial, foco em retrato ou produto sobre fundo escuro.

**Slots obrigatórios**:
- `titulo` — máx 40 chars, 1 linha. Pode ter `*palavra*` para itálico accent. Ex: "O olhar que *renasce*"
- `foto_hero` — retrato ou objeto, aspect 4/5 ou 3/4 (portrait), resolução ≥ 1600px no maior lado, fundo neutro ou escuro
- `edicao_label` — formato fixo: `MÊS · ANO · Nº XX` (ex: "ABRIL · 2026 · Nº 01"), máx 30 chars, all caps

**Slots opcionais**:
- `subtitulo` — máx 140 chars, 1-2 linhas explicativas
- `tag` — máx 18 chars, all caps (ex: "MATÉRIA DE CAPA")

**Regras**:
- NUNCA usar foto com pouca iluminação ou baixa resolução — cover é a primeira impressão.
- Título deve conter 1 palavra-chave em itálico (accent bordô) para contraste editorial.
- Subtítulo é prosa, não frase de efeito vazia.

**Exemplo**:
```json
{
  "titulo": "O olhar que *renasce*",
  "subtitulo": "Sem cirurgia, sem toxina, sem downtime: como a tecnologia Fotona devolve luz ao rosto em quem já passou dos 50.",
  "edicao_label": "ABRIL · 2026 · Nº 01",
  "tag": "MATÉRIA DE CAPA",
  "foto_hero": "https://<storage>/editions/<id>/capa.jpg"
}
```

---

### t02_cover_hero_light — Capa Hero Light
**Quando usar**: capa editorial clean, fundo creme, foco em tipografia; edições mais leves ou primaveris.

**Slots obrigatórios**:
- `titulo` — máx 40 chars
- `foto_hero` — aspect 3/4, fundo claro ou natural, resolução ≥ 1600px

**Slots opcionais**:
- `subtitulo` — máx 140 chars

**Regras**: mesmas do t01, exceto que foto deve ter luz natural.

---

### t03_cover_triptych — Capa Tripla
**Quando usar**: edição multi-tema, 3 pilares destacados simultaneamente (ex: "rosto, corpo, bem-estar").

**Slots obrigatórios**:
- `foto_1`, `foto_2`, `foto_3` — aspect quadrado ou portrait, mesma paleta tonal entre as três
- `titulo_1`, `titulo_2`, `titulo_3` — cada um máx 22 chars, estilo etiqueta editorial

**Regras**: as 3 fotos devem parecer uma série (mesma luz/tratamento), nunca misturar mood diferentes.

---

## ESTRUTURAIS

### t04_toc_editorial — Sumário
**Quando usar**: sempre como página 2 após a capa.

**Slots obrigatórios**:
- `titulo` — "Nesta edição", "Nesta revista", ou equivalente. Máx 24 chars
- `items` — array de objetos `{num, titulo, kicker, page_id}`. Mínimo 4 itens, máximo 8

**Slots opcionais**:
- `kicker` — antetítulo do lado esquerdo (ex: "SUMÁRIO"), máx 12 chars
- `lede` — parágrafo explicativo do lado esquerdo, máx 180 chars

**Regras de item**:
- `num` — 2 dígitos (ex: "01", "02")
- `titulo` — máx 50 chars, pode ter `*itálico*`
- `kicker` — categoria curta (ex: "MATÉRIA DE CAPA", "ANTES E DEPOIS"), máx 22 chars
- `page_id` — UUID da página referenciada (opcional; se fornecido, clicar navega)

**Exemplo**:
```json
{
  "titulo": "Nesta edição",
  "kicker": "SUMÁRIO",
  "lede": "Oito páginas para entender por que o olhar é o primeiro lugar onde o tempo aparece — e o primeiro onde podemos reverter.",
  "items": [
    {"num": "01", "titulo": "O olhar que *renasce*", "kicker": "MATÉRIA DE CAPA"},
    {"num": "02", "titulo": "Ana, 58: *antes* e *depois*", "kicker": "RELATO REAL"},
    {"num": "03", "titulo": "Entrevista com Dra. Fernanda", "kicker": "CONVERSA"},
    {"num": "04", "titulo": "Mitos do rejuvenescimento", "kicker": "VERDADE OU MITO"}
  ]
}
```

---

### t05_editorial_letter — Carta Editorial
**Quando usar**: página 3, voz da diretora/responsável.

**Slots obrigatórios**:
- `titulo` — máx 50 chars (ex: "Uma palavra da diretora")
- `foto_autora` — retrato, aspect 3/4, fundo neutro
- `corpo` — 180-280 palavras, 3-4 parágrafos separados por linha em branco
- `assinatura` — nome da autora (ex: "Mirian de Paula")

**Regras**:
- Primeira pessoa, tom pessoal mas profissional.
- Primeiro parágrafo abre com uma observação do cotidiano ou do consultório.
- Último parágrafo convida a continuar lendo a edição.
- Drop cap é automático no primeiro caractere.

---

### t06_back_cta — Contracapa com CTA
**Quando usar**: sempre como última página.

**Slots obrigatórios**:
- `titulo` — máx 50 chars, convida à ação (ex: "Até a próxima *edição*")
- `contatos` — array de `{label, valor}`. Mínimo 2 itens (WhatsApp e endereço). Máximo 4.
- `cta_texto` — máx 30 chars all caps (ex: "AGENDAR AVALIAÇÃO")
- `cta_link` — URL WhatsApp ou formulário

**Slots opcionais**:
- `proxima_edicao` — teaser da próxima (ex: "Maio: rosto que transmite descanso"), máx 60 chars

**Regras**:
- Contatos formato: `{label: "WhatsApp", valor: "(31) 9xxxx-xxxx"}`.
- Link WhatsApp: `https://wa.me/5531xxxxxxxxx?text=...` encoded.

---

## MATÉRIAS (categoria: feature)

### t07_feature_double — Matéria Dupla
**Quando usar**: matéria principal com texto longo + 1 foto editorial. Workhorse da revista.

**Slots obrigatórios**:
- `kicker` — categoria, máx 22 chars, all caps (ex: "MATÉRIA DE CAPA")
- `titulo` — máx 70 chars, 1-2 linhas, pode ter `*itálico*`
- `lede` — resumo, 140-200 chars, 1 frase
- `corpo` — 400-700 palavras, parágrafos separados por linha em branco. Mínimo 4 parágrafos, máximo 7
- `foto_hero` — aspect 3/4 ou 4/5 (portrait), resolução ≥ 1600px

**Slots opcionais**:
- `byline` — autor (ex: "Por Mirian de Paula")

**Regras**:
- 1º parágrafo abre concreto (caso, dado, cena) — nunca genérico.
- Citação ou dado numérico a cada 2 parágrafos.
- Evitar listas dentro do corpo; se houver, quebrar em parágrafos.
- Drop cap automático no 1º caractere.

---

### t08_feature_fullbleed — Full Bleed
**Quando usar**: abertura impactante de matéria visual, foto tomando a página inteira com título sobreposto.

**Slots obrigatórios**:
- `titulo` — máx 60 chars, tom poético/editorial
- `foto_full` — aspect 16/10 ou 3/2 (landscape), resolução ≥ 2000px no lado maior, cena rica (não retrato fechado)
- `lede` — máx 160 chars, 1 frase

**Slots opcionais**:
- `overlay_color` — cor hex/rgba do gradient inferior; default `rgba(0,0,0,0.85)`

**Regras**: foto precisa ter área "neutra" na parte inferior pra o texto ler bem.

---

### t09_feature_triptych — 3 Blocos
**Quando usar**: comparativo, trio de conceitos, ou quote entre 2 fotos.

**Slots obrigatórios**:
- `foto_1`, `foto_2` — fotos laterais, aspect portrait, mesma paleta
- `texto_central` — quote ou conceito, máx 180 chars, estilo Playfair

**Slots opcionais**:
- `legenda_1`, `legenda_2` — overlay nas fotos, máx 40 chars cada

---

### t10_interview — Entrevista Q&A
**Quando usar**: conversa com profissional, especialista, paciente.

**Slots obrigatórios**:
- `titulo` — máx 60 chars (ex: "Conversa com quem entende de *olhar*")
- `foto_entrevistado` — retrato, aspect 3/4, fundo neutro
- `nome` — máx 40 chars
- `qas` — array de `{q, a}`. Mínimo 3, máximo 6.

**Slots opcionais**:
- `titulo_prof` — cargo/credencial (ex: "Dermatologista · CRM 12345"), máx 50 chars

**Regras de Q&A**:
- Pergunta: máx 120 chars, direta.
- Resposta: 40-180 palavras, tom conversacional mas informado.
- Nunca iniciar resposta com "Bem,..." ou "Então...".
- Primeira Q&A deve pegar o leitor (pergunta inesperada ou provocativa).

---

### t11_product_highlight — Destaque de Tratamento
**Quando usar**: apresentar um procedimento específico com benefícios e preço/CTA.

**Slots obrigatórios**:
- `titulo` — nome do tratamento, máx 40 chars (ex: "Fotona 4D Smooth Eyes")
- `foto` — aspect 3/4, produto ou cena do tratamento
- `beneficios` — array de strings (ou objetos `{texto}`), mínimo 3, máximo 6 itens. Cada benefício máx 80 chars.
- `cta` — máx 30 chars (ex: "SAIBA MAIS")

**Slots opcionais**:
- `subtitulo` — máx 100 chars
- `preco_sugerido` — formato "R$ X.XXX" ou "a partir de R$ X.XXX"

**Regras**:
- Benefícios começam com verbo ativo ("Estimula", "Redefine", "Devolve").
- Sem promessas absolutas ("cura", "para sempre").

---

## VISUAIS (categoria: visual)

### t12_before_after_pair — Antes/Depois Par
**Quando usar**: 1 caso, foto antes + foto depois lado a lado.

**Slots obrigatórios**:
- `titulo` — máx 50 chars (ex: "Ana, 58 anos: o olhar *antes* e *depois*")
- `foto_antes`, `foto_depois` — aspect idêntico entre as duas, mesma luz/enquadramento/ângulo
- `meta` — ficha técnica em 1-3 linhas (ex: "Smooth Eyes + AH · 3 sessões · Resultado em 60 dias"), máx 140 chars
- `stats` — array de `{valor, label}`, mínimo 2, máximo 4 stats

**Regras de stats**:
- `valor` — curto (ex: "3×", "60d", "-42%"), máx 8 chars
- `label` — explica o valor (ex: "SESSÕES", "DURAÇÃO", "REDUÇÃO DE RUGAS"), máx 28 chars all caps

**Regras de fotos**:
- Mesmo ângulo, mesma luz, mesmo fundo. Se não for idêntico, NÃO USAR esse template.
- Autorização de uso de imagem (TCLE) obrigatória antes de publicar.

---

### t13_before_after_quad — Antes/Depois Quádruplo
**Quando usar**: 2 casos comparados simultaneamente.

**Slots obrigatórios**:
- `caso_1`, `caso_2` — cada um objeto `{antes, depois, label}`

**Regras de caso**:
- `antes`, `depois` — URLs das fotos, aspect quadrado
- `label` — descrição curta do caso (ex: "Ana · 58a · 3 sessões"), máx 40 chars

---

### t14_mosaic_gallery — Galeria Mosaico
**Quando usar**: galeria de 3-5 fotos editoriais complementares.

**Slots obrigatórios**:
- `titulo` — máx 40 chars
- `fotos` — array de URLs (ou objetos `{url}`). Mínimo 3, máximo 5. 1ª foto é a "hero" (fica maior no grid).

**Slots opcionais**:
- `legenda` — 1 linha sobre o conjunto, máx 120 chars

---

### t15_evolution_timeline — Timeline de Evolução
**Quando usar**: mostrar progressão de resultado em marcos temporais (ex: "dia 0, dia 30, dia 60, dia 90").

**Slots obrigatórios**:
- `titulo` — máx 50 chars
- `marcos` — array de `{data, foto, legenda}`. Mínimo 3, máximo 6 marcos.

**Regras de marco**:
- `data` — curto (ex: "Dia 0", "30 dias", "6 meses"), máx 14 chars
- `foto` — aspect 3/4, mesma luz entre marcos
- `legenda` — 1 frase descrevendo o estado, máx 100 chars

---

## INTERATIVOS (categoria: interactive)

### t16_quiz_cta — Quiz com CTA
**Quando usar**: chamar pra quiz externo (quiz-render.html), com recompensas.

**Slots obrigatórios**:
- `titulo` — máx 50 chars (ex: "Descubra seu perfil *Smooth Eyes*")
- `lede` — máx 180 chars
- `quiz_slug` — slug do quiz em quiz-render.html (ex: "smooth-eyes-perfil")
- `recompensas` — array de `{titulo, descricao}`. Mínimo 2, máximo 4 recompensas.

**Regras de recompensa**:
- `titulo` — nome curto (ex: "Cashback R$ 50"), máx 30 chars
- `descricao` — quando aplica, máx 100 chars

---

### t17_poll — Enquete
**Quando usar**: engajar leitor com opinião rápida.

**Slots obrigatórios**:
- `pergunta` — máx 140 chars, termina com "?"
- `opcoes` — array de strings (ou objetos `{texto, pct}`). Mínimo 2, máximo 4.

**Regras**:
- Opções máx 50 chars cada.
- Se `pct` presente (ex: após a edição ter rodado), mostra barra de resultado.

---

## EXTRAS

### t18_stat_feature — Dado em Destaque
**Quando usar**: página de "impacto" — um número grande com contexto curto.

**Slots obrigatórios**:
- `numero` — máx 10 chars (ex: "93%", "3×", "15min")
- `titulo` — contexto do dado, máx 120 chars (ex: "das pacientes relatam *olhar mais descansado* após 3 sessões")
- `fonte` — origem do dado, máx 100 chars (ex: "Estudo interno · Clínica Mirian de Paula · 2025 · n=48")

**Regras**:
- Dado real, não inflado. Se baseado em percepção, explicitar.

---

### t19_ritual_steps — Passos de Ritual
**Quando usar**: passo-a-passo de ritual diário, protocolo de cuidado, ou fases de tratamento.

**Slots obrigatórios**:
- `titulo` — máx 50 chars
- `passos` — array de `{titulo, descricao}`. Mínimo 3, máximo 6 passos.

**Regras de passo**:
- `titulo` do passo — verbo no imperativo ou substantivo curto (ex: "Limpe o rosto", "Hidratação profunda"), máx 40 chars
- `descricao` — 1-2 frases, máx 180 chars

---

### t20_myth_vs_fact — Mitos vs Fatos
**Quando usar**: desmentir crenças populares do setor (laser dói, botox paralisa, etc.).

**Slots obrigatórios**:
- `titulo` — máx 40 chars (ex: "Mitos &amp; fatos do *laser*")
- `pares` — array de `{mito, fato}`. Mínimo 3, máximo 5 pares.

**Regras de par**:
- `mito` — frase popular, 1ª pessoa ou senso comum (ex: "Laser afina a pele"), máx 120 chars
- `fato` — resposta técnica curta e clara, 1-2 frases, máx 200 chars

---

## SPREADS DE PRODUTO (categoria: feature)

### t21_product_photo_split — Display de Produto (2 fotos)
**Quando usar**: primeira página de um spread sobre aparelho/tratamento. Precede sempre uma página t22 com a matéria. Estrutura visual antes de aprofundamento textual.

**Slots obrigatórios**:
- `foto_principal` — aspect 3/4 portrait, lado esquerdo, resolução ≥ 1200px no maior lado
- `foto_detalhe` — aspect 3/4 portrait, lado direito (close, detalhe, aplicação), mesmo tratamento de luz da principal
- `kicker` — máx 22 chars all caps (ex: "TECNOLOGIA EXCLUSIVA"). Deve ser **idêntico** ao kicker do t22 que vem em seguida
- `nome_produto` — máx 40 chars (ex: "Anovator A5")

**Slots opcionais**:
- `legenda_principal` — máx 80 chars, abaixo da foto 1
- `legenda_detalhe` — máx 80 chars, abaixo da foto 2
- `tagline` — máx 60 chars, frase âncora abaixo do nome (ex: "luz fria de alta penetração")

**Regras**:
- Fotos devem parecer parte da mesma sessão fotográfica (luz, fundo, paleta).
- Fundo da página creme, nunca dark.
- Nome do produto em Playfair Display 56px no rodapé.
- Esta página é sempre **par** com uma `t22` imediatamente seguinte.

**Exemplo**:
```json
{
  "kicker": "TECNOLOGIA EM DESTAQUE",
  "nome_produto": "Anovator A5",
  "tagline": "Estímulo profundo de colágeno · sem downtime",
  "foto_principal": "https://<storage>/editions/<id>/anovator-completo.jpg",
  "foto_detalhe": "https://<storage>/editions/<id>/anovator-aplicacao.jpg",
  "legenda_principal": "Console e ponteira",
  "legenda_detalhe": "Aplicação na região periocular"
}
```

---

### t22_product_feature_text — Matéria Texto-Cheio (par com t21)
**Quando usar**: segunda página do spread t21+t22. Aprofunda em texto o produto/tratamento mostrado na página anterior. Sem foto hero — libera 100% da largura para o texto em duas colunas com drop cap. DNA editorial idêntico ao `t07_feature_double`.

**Slots obrigatórios**:
- `kicker` — máx 22 chars all caps. **Deve ser idêntico ao kicker do t21** anterior (continuidade visual)
- `titulo` — máx 70 chars, pode ter `*itálico*`
- `lede` — 140-200 chars, 1 frase
- `corpo` — 400-700 palavras, parágrafos separados por linha em branco. Mínimo 4 parágrafos, máximo 7

**Slots opcionais**:
- `byline` — máx 60 chars (ex: "Por Mirian de Paula")
- `destaque` — máx 140 chars, pull quote inserido após o 2º parágrafo

**Regras**:
- 1º parágrafo abre concreto (caso, dado, cena).
- Drop cap automático no 1º caractere.
- 2 colunas de texto sempre.
- Sem foto — qualquer slot de imagem aqui é ignorado.
- Tom: editorial, técnico mas acessível, 2ª pessoa.

**Exemplo**:
```json
{
  "kicker": "TECNOLOGIA EM DESTAQUE",
  "titulo": "Por dentro da *Anovator A5*",
  "lede": "O aparelho que combina dois comprimentos de onda em uma única sessão — e por que isso muda o jogo do rejuvenescimento periocular.",
  "corpo": "Era 2024 quando recebi um aparelho diferente na clínica…\n\n…",
  "byline": "Por Mirian de Paula",
  "destaque": "A grande virada não é a tecnologia — é como você protocoliza ela para o tipo de pele do seu paciente."
}
```

---

## ESTRUTURAS DE EDIÇÃO RECOMENDADAS

Modelos de sumário testados e prontos para reuso. Edições novas podem partir de uma destas estruturas e adaptar.

### Modelo A — "Programa Integrado" (15 páginas)
Usado na **Edição Inaugural · Abril 2026 · Lifting 5D**. Recomendado para apresentar um protocolo principal da clínica como programa contínuo (ex: Smooth Eyes, Lifting 5D, Full Body Renewal). Cobre todas as categorias do playbook.

| # | Página | Template | Função editorial |
|---|--------|----------|------------------|
| 01 | Capa | `t01_cover_hero_dark` | Gancho emocional + nome da edição |
| 02 | Sumário | `t04_toc_editorial` | 8 itens · convida à navegação |
| 03 | Carta editorial | `t05_editorial_letter` | Voz da Mirian abre a edição (180-280 palavras) |
| 04 | Avaliação inicial · 2 fotos | `t21_product_photo_split` | Apresenta o aparelho de diagnóstico (Anovator A5) |
| 05 | Avaliação inicial · matéria | `t22_product_feature_text` | Aprofundamento textual da avaliação (par com t21) |
| 06 | Matéria de capa | `t07_feature_double` | O protocolo principal por dentro (400-700 palavras) |
| 07 | Tratamento destaque | `t11_product_highlight` | Tecnologia/equipamento principal com benefícios e CTA |
| 08 | Editorial visual fullbleed | `t08_feature_fullbleed` | Página de respiro · ideal para esconder o hidden icon |
| 09 | Caso real Antes/Depois | `t12_before_after_pair` | Prova social com TCLE + 4 stats |
| 10 | Entrevista com a responsável | `t10_interview` | 4 Q&As que reforçam autoridade |
| 11 | Dado em destaque | `t18_stat_feature` | Número de impacto (ex: "100% cashback") |
| 12 | Mitos vs Fatos | `t20_myth_vs_fact` | 4 pares — desmente crenças comuns |
| 13 | Ritual / etapas do protocolo | `t19_ritual_steps` | 4 passos numerados |
| 14 | Quiz CTA | `t16_quiz_cta` | Conversão · 3 recompensas |
| 15 | Contracapa | `t06_back_cta` | CTA WhatsApp + teaser próxima edição |

**Fotos necessárias:** 9 (capa, retrato responsável reusado em t05+t10, 2 do aparelho de avaliação, 1 da matéria, 1 do tratamento destaque, 1 fullbleed landscape, antes+depois).

**Hidden icon:** marcar `magazine_editions.hidden_icon_page_id` apontando para a página t08 (fullbleed dá espaço visual sem competir com texto).

**Cashback total possível por leitora:** R$ 150 (R$ 10 abertura + R$ 20 leu 80% + R$ 30 quiz + R$ 25 hidden + R$ 15 share + R$ 50 indicação).

---

### Modelo B — "Mini Sazonal" (8 páginas) · futuro
Versão enxuta para edições especiais (Black Friday, Aniversário da clínica, Datas comemorativas). Estrutura sugerida: capa → editorial → matéria única → antes/depois → quiz → contracapa.

### Modelo C — "Especialista Convidada" (12 páginas) · futuro
Quando uma profissional externa assina conteúdo. Substituir t07 por t10 (entrevista longa) e adicionar t09 com quote da convidada.

---

## CHECKLIST PRÉ-PUBLICAÇÃO

Antes de publicar qualquer edição, verificar:

- [ ] Estrutura: capa + sumário + editorial + ≥1 matéria + CTA + contracapa (6 mínimo)
- [ ] Todas as fotos têm resolução ≥ 1200px
- [ ] Antes/depois têm TCLE validado
- [ ] Nenhum emoji em texto editorial
- [ ] Sumário reflete ordem real das páginas
- [ ] Contracapa tem CTA clicável (link WhatsApp funcional)
- [ ] Título da edição seguirá padrão: "Beauty & Health — Edição de {mês} {ano}"
- [ ] Slug seguirá padrão: `{mes-ano}-{tema-curto}` (ex: "abril-2026-smooth-eyes")
- [ ] Validator `magazine_validate_section` passou em todas as páginas

---

## EXTENSIBILIDADE — Criando novos templates

Para criar uma seção nova (t21+):

1. **Propor contrato** — seguir exatamente o formato acima (Quando usar, Slots, Regras, Exemplo).
2. **Aprovação do usuário** antes de qualquer código.
3. **Adicionar**:
   - Entrada em `magazine_templates` (INSERT com slug, name, category, slots_schema, html_template)
   - Classes `.mp-t21` em `css/magazine-pages.css` (seguindo padrão dos existentes)
   - Renderer `R.t21_xxx` em `js/magazine/magazine-renderer.js`
   - Seção neste playbook
   - Entrada no menu de seções do `magazine-intake.html`
4. **Sem quebrar compat**: slugs novos só, nunca renomear existentes.

---

## REGRA DE OURO DO CLAUDE

Toda sessão de trabalho em revista **começa com leitura integral deste arquivo**. Se algum contrato conflita com pedido do usuário, priorizar este documento e pedir ajuste explícito antes de violar.
