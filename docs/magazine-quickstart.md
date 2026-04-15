# Beauty & Health Magazine — Quickstart

Guia prático para produzir uma edição do zero. Tempo esperado da sua parte: **15-30 minutos** para montar o brief. Depois disso a edição é produzida pelo Claude.

---

## Antes de começar

Você vai precisar de:

- **Tema da edição** definido (1 frase). Ex: "Smooth Eyes como alternativa não-cirúrgica para olhar cansado".
- **Fotos** no computador (retratos, produto, antes/depois com TCLE).
- **Matéria-prima de texto** solto: anotações, transcrição de conversas, cases da agenda, dados da clínica.
- Acesso ao ClinicAI logado como `OWNER` ou `ADMIN`.

---

## Passo a passo

### 1. Escolher formatos — Galeria

1. Abra `ClinicAI → Revista Digital → Galeria de Formatos` (nova aba)
2. Use os filtros (Capas / Matérias / Visuais / Interativos / Extras) para ver os 20 formatos com exemplo preenchido
3. Decida quais entram na edição. Sumário mínimo recomendado:

   ```
   1. Capa (t01 ou t02)
   2. Sumário (t04)
   3. Carta editorial (t05)
   4. Matéria principal (t07 ou t08)
   5. Antes/Depois (t12) — se tiver caso com TCLE
   6. Entrevista (t10) ou Destaque de tratamento (t11)
   7. Quiz (t16) ou Dado em destaque (t18)
   8. Contracapa (t06)
   ```
   Pode chegar em 12-14 páginas sem problema.

### 2. Montar Edição — Intake

1. Abra `ClinicAI → Revista Digital → Montar Edição`
2. Faça login se pedir
3. Preencha **Brief da edição**:
   - Mês · Ano: `abril-2026`
   - Tema: 1-2 linhas sobre o gancho editorial
   - Tom: ex: "editorial, cuidadoso, pessoal"
   - Objetivo: o que você quer que aconteça depois da edição

4. **Biblioteca de fotos**:
   - Arraste fotos na área pontilhada (ou clique)
   - Para cada foto, digite no campo "o que é esta foto?" algo curto e útil:
     - Bom: "retrato da Ana 58a pós Smooth Eyes, fundo neutro"
     - Ruim: "foto1.jpg"
   - Cada foto ganha uma ref (`foto1`, `foto2`, ...) que você pode usar nos campos de imagem das seções
   - Suportado: JPG, PNG, WEBP, AVIF, SVG (até 10 MB cada)

5. **Menu de seções**: clique para adicionar. Cada clique insere na ordem do sumário.

6. **Sumário desta edição** (área abaixo): cada seção adicionada vira um card expansível.
   - Os campos são marcados com **\*** (obrigatório)
   - Contadores de caracteres/palavras aparecem abaixo
   - Bolinha de status:
     - 🟢 verde: pronto
     - 🟡 amarelo: warnings (passáveis)
     - 🔴 vermelho: errors (obrigatório corrigir)

7. **Campos de imagem**: aceita:
   - Ref da foto (`foto1`, `foto2`) — resolve automaticamente para a URL enviada
   - URL direta (https://…)
   - Vazio (Claude escolhe da biblioteca pelo contexto)

8. **Campos de lista** (itens do sumário, Q&A, benefícios, contatos, etc.): siga o formato indicado no label. Exemplos:

   **Itens do sumário** (um por linha, separados por `|`):
   ```
   01 | O olhar que *renasce* | MATÉRIA DE CAPA
   02 | Ana, 58 anos | RELATO REAL
   03 | Conversa com Dra. Fernanda | ENTREVISTA
   ```

   **Q&A de entrevista** (pares separados por `---`):
   ```
   Q: Por que o olhar é tão específico?
   A: A pele ao redor dos olhos é até cinco vezes mais fina…
   ---
   Q: E qual o grande erro que você vê no mercado?
   A: Tratar o olhar com o mesmo arsenal do rosto inteiro…
   ```

   **Mitos vs Fatos** (mesma lógica de pares):
   ```
   Mito: Laser afina a pele.
   Fato: Não. Lasers não-ablativos estimulam colágeno…
   ---
   Mito: Preciso ficar vermelha dias.
   Fato: Depende do protocolo. Smooth Eyes geralmente tem rubor…
   ```

   **Contatos** (um por linha, `label | valor`):
   ```
   WhatsApp | (31) 9xxxx-xxxx
   Endereço | Rua da Clínica, 123 · BH
   Instagram | @clinicamiriandepaula
   ```

   **Stats** (antes/depois, `valor | label`):
   ```
   3× | SESSÕES
   60d | DURAÇÃO
   -42% | APARÊNCIA CANSADA
   ```

9. **Referências & notas**: URLs, estudos, fontes. Livre.

10. **Botão "Salvar rascunho"**: salva sem enviar. Pode voltar depois pelo "Carregar rascunho".

11. **Botão "Enviar pro Claude"**:
    - Valida todas as seções
    - Se houver errors, pede confirmação
    - Muda status para `submitted`
    - Me avise aqui no chat: "rodou a edição de abril" — eu produzo as páginas editadas

### 3. Revisão e ajustes

1. Quando Claude terminar (tipicamente em 10-15 min), ele te dá o link:
   `https://clinicai-dashboard.px1hdq.easypanel.host/revista-live.html?edition=abril-2026-xxxx&preview=1`
2. Abre e passa pelas páginas (seta → ou swipe horizontal)
3. Pede ajustes pontuais:
   - "Mexe na p3, o lede está muito genérico"
   - "Troca a foto da capa por foto5"
   - "Corta 2 parágrafos do corpo da p4"
4. Claude reescreve só o que foi pedido

### 4. Publicação

Quando você aprovar, Claude publica (`magazine_publish`) e:
- Status vira `published`
- Link público fica ativo com HMAC por lead
- n8n workflow `magazine_dispatch` (quando implementado) dispara WhatsApp segmentado D+0, D+3, D+7

---

## Dicas de conteúdo

### Tom
- Sempre 2ª pessoa ("você"), nunca "a paciente deve…"
- Nunca jargão médico sem tradução. Se usar, explica.
- Nada de emojis em texto editorial. Só CTAs finais.
- Público 45+, feminino — a voz é de confidente, não de influencer.

### Fotos
- **Antes/Depois:** mesma luz, mesmo ângulo, mesmo fundo. Se não for idêntico, não usa — fica amador.
- **Retratos de entrevista:** sem fundo poluído, contato visual com câmera.
- **Matéria de capa:** alta resolução (mínimo 1600px no lado maior). Se não tiver, Claude avisa.

### Comprimentos
- **Título de matéria:** máx 70 chars, 1-2 linhas impactantes. Uma palavra em `*itálico*` vira destaque bordô.
- **Lede:** 140-200 chars, uma frase que puxa pra dentro.
- **Corpo de matéria:** 400-700 palavras, 4-7 parágrafos separados por linha em branco.
- **Carta editorial:** 180-280 palavras, 3-4 parágrafos.

Tudo acima tem validação automática no intake — não deixa passar.

---

## Armadilhas comuns

| Sintoma | Causa | Solução |
|---------|-------|---------|
| Preview em branco no leitor | edição não publicada | publicar via `magazine_publish` |
| Foto quebrada | URL Google Drive share | já convertemos automático, mas o ideal é upload via intake |
| Validação rejeita | corpo muito curto/longo | contador abaixo mostra palavras — ajuste |
| Subir várias fotos falha | arquivo > 10 MB | reduzir antes de subir |
| Não aparece a seção Revista na sidebar | sessão não é OWNER/ADMIN | pedir elevação |

---

## Onde ver documentação adicional

- **Arquitetura técnica:** `docs/magazine-architecture.md`
- **Contrato editorial das 20 seções:** `docs/magazine-editor-playbook.md`
- **Galeria live:** `magazine-gallery.html`
