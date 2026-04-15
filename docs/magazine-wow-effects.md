# Beauty & Health — Efeitos Wow para nível Premium máximo

Catálogo estratégico de tudo que podemos adicionar à revista para elevá-la de "boa" para "obrigatória de receber". Cada item tem nome, descrição, esforço (S/M/L = pequeno/médio/grande), impacto (★★★/★★/★) e dependência técnica.

**Como usar este doc:** revisar, marcar prioridades em comum acordo, implementar em ondas. Não precisa fazer tudo — escolher o que mais reforça o DNA editorial da clínica.

---

## TIER 1 — Top 10 com mais retorno por esforço

São os que mais movem a percepção de "premium" sem virar overhead de produção.

| # | Efeito | Esforço | Impacto |
|---|--------|---------|---------|
| 1 | Capa personalizada com nome da paciente | S | ★★★ |
| 2 | Comparador antes/depois com slider arrastável | M | ★★★ |
| 3 | Áudio de boas-vindas da Mirian (15-20s) | M | ★★★ |
| 4 | Hidden icon clicável (cashback escondido na edição) | S | ★★★ |
| 5 | "Continue de onde parou" + barra de progresso persistente | S | ★★ |
| 6 | Stats que sobem de 0 ao número final (counting animation) | S | ★★ |
| 7 | Card de compartilhamento gerado com nome da paciente | M | ★★★ |
| 8 | Open Graph rico no link WhatsApp (preview com capa) | S | ★★ |
| 9 | Edição expira em 30 dias (urgência sutil + senso de exclusividade) | S | ★★ |
| 10 | Notificação 24h antes da próxima edição via WhatsApp | M | ★★★ |

---

## CATEGORIA A — Personalização (parecer feito sob medida)

### A1 · Capa personalizada com nome
Capa abre com "Para **Ana**, abril 2026" antes do título. Render server-side baseado no `lead_id`.
- **Esforço:** S (já temos lead_id no link)
- **Impacto:** ★★★
- **Como:** novo slot `nome_dedicatoria` no t01/t02, RPC retorna o nome do lead da edição

### A2 · Carta editorial assinada para a paciente
"Mirian, especialmente para você" no início da carta. Última frase volta no nome.
- **Esforço:** S
- **Impacto:** ★★

### A3 · Sumário com matérias recomendadas
Com base no histórico de tratamentos (`appointments`), reordenar matérias no sumário priorizando o que interessa à paciente.
- **Esforço:** L (precisa motor de recomendação)
- **Impacto:** ★★

### A4 · Antes/Depois sugerido por queixa
Se a paciente tem `queixas_faciais` no perfil, mostrar caso real com queixa similar.
- **Esforço:** M
- **Impacto:** ★★★

### A5 · Edição de aniversário
No mês do aniversário da paciente, edição traz página de presente especial (cashback maior, tratamento brinde, mensagem dedicada).
- **Esforço:** M
- **Impacto:** ★★★

### A6 · Versão VIP estendida
VIPs (RFM segment) recebem 4 páginas extras exclusivas: cases premium, agenda priorizada, preview do mês seguinte.
- **Esforço:** S (já temos `segment_scope` no schema)
- **Impacto:** ★★★

### A7 · Cor de acento por segmento
VIP vê paleta com gold (`#c9a961`) ao invés de bordô. Subliminal de "você é de outra liga".
- **Esforço:** S
- **Impacto:** ★

---

## CATEGORIA B — Visual & Animação (entregar luxo na primeira vista)

### B1 · Capa que "acende" ao abrir
Fade-in lento da imagem hero + título emergindo letra a letra (Playfair Display animado).
- **Esforço:** S
- **Impacto:** ★★★
- **Como:** CSS keyframes + JS após carregar foto

### B2 · Stats que sobem do zero
Os "93%", "3×", "60d" começam em 0 e sobem em 1.5s usando easing editorial. Atrai olhar.
- **Esforço:** S
- **Impacto:** ★★

### B3 · Comparador slider antes/depois
Foto antes + foto depois sobrepostas, slider arrastável horizontal pra revelar transição. Substitui ou complementa o t12/t23/t24.
- **Esforço:** M (novo template t25)
- **Impacto:** ★★★

### B4 · Cinemagraphs (foto + 1 elemento em loop)
Foto estática mas com 1 detalhe animado (cabelo balançando levemente, água caindo, vapor). Cria sensação de vida.
- **Esforço:** L (precisa criar conteúdo · não é programação)
- **Impacto:** ★★★

### B5 · Parallax sutil em capa full-bleed
Foto move levemente conforme scroll, dando profundidade.
- **Esforço:** S
- **Impacto:** ★★

### B6 · Page transition animada
Ao virar página, transição com fade + slide ao invés de scroll-snap brusco.
- **Esforço:** S
- **Impacto:** ★★

### B7 · Loading skeleton editorial
Enquanto carrega, mostra silhueta da página em creme sutil ao invés de spinner padrão.
- **Esforço:** S
- **Impacto:** ★

### B8 · Modo noite automático
Após 19h, paleta troca pra dark com bordô mais profundo. Pra leitura noturna.
- **Esforço:** M
- **Impacto:** ★★

### B9 · Pinch-zoom em fotos
Mobile: dois dedos pra dar zoom em antes/depois. Sense of "olhar de perto a transformação".
- **Esforço:** M
- **Impacto:** ★★

### B10 · Pull-to-refresh editorial
Puxar pra cima na 1ª página mostra um "renovando…" tipográfico ao invés do círculo nativo.
- **Esforço:** S
- **Impacto:** ★

---

## CATEGORIA C — Áudio & Vídeo (sentir presença real)

### C1 · Áudio de boas-vindas da Mirian
Na carta editorial, ícone de play discreto. 15-20s da Mirian falando "Oi Ana, seja bem-vinda…" Personalizado por nome se der.
- **Esforço:** M (gravação manual + TTS opcional)
- **Impacto:** ★★★
- **Tech:** botão custom, audio em Storage, autoplay desativado

### C2 · Vídeo de 5s no antes/depois
Um timelapse curto entre antes e depois. Em loop. Sem som.
- **Esforço:** L (produção de conteúdo)
- **Impacto:** ★★★

### C3 · Trilha sonora editorial (off por padrão)
Botão sutil: "🎵 música ambiente". Toca pianos suaves enquanto lê. Default off.
- **Esforço:** S
- **Impacto:** ★

### C4 · Pronúncia correta de termos técnicos
Em "Fotona", "Ulthera", "ácido hialurônico" — ícone 🔊 que toca a pronúncia. Educa a paciente sem ser didático.
- **Esforço:** M
- **Impacto:** ★

### C5 · Áudio narrado completo (TTS premium)
Botão "ouvir esta matéria" — TTS de qualidade (ElevenLabs, OpenAI Voice) lê o corpo. Premium pra acessibilidade e multitarefa.
- **Esforço:** M
- **Impacto:** ★★

---

## CATEGORIA D — Gamificação Premium (engajar sem parecer joguinho)

### D1 · Hidden icon (já no schema)
Ícone discreto escondido em uma das páginas (ex: borboleta na barra de uma matéria). Encontrar credita R$ 25.
- **Esforço:** S (schema pronto, falta UX)
- **Impacto:** ★★★

### D2 · Quiz com resultado personalizado
Quiz dentro da revista (não link externo) com 5 perguntas. Resultado mapeia perfil + recomenda tratamento + cashback dedicado.
- **Esforço:** M (integração com `quiz-render`)
- **Impacto:** ★★★

### D3 · Streak de leituras
Lendo 3 edições consecutivas → desbloqueia "selo Leitora Atenta" + bônus.
- **Esforço:** M
- **Impacto:** ★★

### D4 · Diário da paciente
Página final pessoal: "Você leu 8 edições, descobriu 3 hidden icons, acumulou R$ 280 de cashback". Sense of journey.
- **Esforço:** M
- **Impacto:** ★★★

### D5 · Reactions em páginas
3 ícones discretos (♥ ✨ !) ao final de cada matéria. Sem login. Gera dado precioso de qual conteúdo emociona.
- **Esforço:** S
- **Impacto:** ★★

### D6 · Bookmark de favoritos
Long-press na página → "Salvar nos favoritos". Acessível depois.
- **Esforço:** M
- **Impacto:** ★

---

## CATEGORIA E — Compartilhamento Elegante

### E1 · Card share com nome
"Ana achou esta matéria especial:" + capa estilizada gerada via canvas. Compartilhar no WhatsApp/Instagram.
- **Esforço:** M
- **Impacto:** ★★★

### E2 · Quote share (selecionar trecho)
Selecionar texto numa matéria → "Compartilhar este trecho". Gera imagem com fundo editorial + frase + assinatura Beauty & Health.
- **Esforço:** M
- **Impacto:** ★★

### E3 · Open Graph rico
Quando paciente compartilha o link, o preview no WhatsApp/Instagram mostra a capa real da edição com título e tagline.
- **Esforço:** S (meta tags dinâmicas)
- **Impacto:** ★★

### E4 · Convite pra leitora indicar amigas
"Indique 3 amigas → R$ 50 de cashback". Cada link gerado com tracking pra atribuição.
- **Esforço:** M (já há `claim_reward('invite')`)
- **Impacto:** ★★★

---

## CATEGORIA F — Continuidade & Retenção

### F1 · Continue de onde parou
Ao reabrir a edição, leitor lembra a última página vista e volta direto pra ela.
- **Esforço:** S (já gravamos `last_page_index`)
- **Impacto:** ★★

### F2 · Histórico de edições
Página "Minha biblioteca" lista todas as edições anteriores com status (lida/parcial/não-aberta). Pode reler.
- **Esforço:** M
- **Impacto:** ★★

### F3 · Notificação WhatsApp 24h antes
"Ana, sua próxima Beauty & Health chega amanhã. Tema: olhar que descansa."
- **Esforço:** M (n8n workflow)
- **Impacto:** ★★★

### F4 · Notificação se não abriu
D+3: "Ana, sua edição ainda está esperando. Cashback de abertura expira em 24h."
- **Esforço:** S (faz parte do dispatch n8n)
- **Impacto:** ★★

---

## CATEGORIA G — Exclusividade & Escassez (premium é raro)

### G1 · Edição expira em 30 dias
Após 30 dias da publicação, link mostra "esta edição saiu de circulação". Cria urgência genuína.
- **Esforço:** S
- **Impacto:** ★★

### G2 · "Apenas X leitoras" (FOMO sutil)
Mostra um contador discreto: "Esta edição foi enviada para 47 pacientes selecionadas". Reforça curadoria.
- **Esforço:** S
- **Impacto:** ★★

### G3 · Acesso priorizado pra base atual
Pacientes ativas recebem 48h antes do público externo (leads).
- **Esforço:** S (segmentação de dispatch)
- **Impacto:** ★★

### G4 · Edição beta privada
Grupo de 10 VIPs recebe versão prévia com opção de comentar. Reforça pertencimento.
- **Esforço:** L
- **Impacto:** ★★

### G5 · Confidencialidade tipográfica
Discreto rodapé: "Material editorial Beauty & Health · uso pessoal". Sense of insider.
- **Esforço:** S
- **Impacto:** ★

---

## CATEGORIA H — Brand & Authority (parecer publicação real)

### H1 · Edição numerada visível
"Edição Nº 03" em todas as páginas. Acumula valor de coleção.
- **Esforço:** S (já temos `edition_number`)
- **Impacto:** ★

### H2 · Edição comemorativa anual
12 meses depois, edição especial "1 ano" com retrospectiva + edição impressa premium em PDF.
- **Esforço:** L
- **Impacto:** ★★★

### H3 · Edição colaborativa
Convidar dermatologista famosa pra escrever 1 matéria. Aparece na capa: "Convidada: Dra. X". Eleva status.
- **Esforço:** L (operacional, não tech)
- **Impacto:** ★★★

### H4 · Versão impressa baixável
PDF de alta qualidade pronto pra impressão. Algumas pacientes vão imprimir e guardar — virou objeto.
- **Esforço:** M (gerar PDF do edition_id)
- **Impacto:** ★★

### H5 · Selo "edição inaugural"
Primeira edição ganha selo permanente "Edição Inaugural · 2026". Colecionismo.
- **Esforço:** S
- **Impacto:** ★

---

## CATEGORIA I — Inteligência & Analytics (saber o que funciona)

### I1 · Heatmap de leitura por página
Painel mostra quanto tempo cada página segurou a leitora em média + onde mais drop-offs aconteceram. Otimiza próxima edição.
- **Esforço:** M (schema já permite com pequena extensão)
- **Impacto:** ★★ (operacional)

### I2 · A/B testing de capas
Publicar 2 versões da capa, sortear 50/50 entre leads. Ver qual converte mais aberturas.
- **Esforço:** M
- **Impacto:** ★★

### I3 · Predição de performance
Antes de publicar, comparar conteúdo com edições anteriores e prever taxa de leitura. "Esta edição tem 73% chance de superar a anterior."
- **Esforço:** L (ML básico)
- **Impacto:** ★

### I4 · Dashboard de insights
Painel fixo pra Mirian: top 3 matérias mais lidas, maior conversão, queixas mais clicadas, leads novos por edição.
- **Esforço:** M
- **Impacto:** ★★★

### I5 · Atribuição de receita por edição
Conectar agendamento → edição que gerou. Quanto cada edição faturou.
- **Esforço:** L
- **Impacto:** ★★★

---

## CATEGORIA J — Acessibilidade Premium

### J1 · Modo leitura aumentada
Botão "A+" aumenta tipografia e contraste. Importante pro público 55+.
- **Esforço:** S
- **Impacto:** ★★

### J2 · Reduced motion respeitado
Animações desabilitam se o sistema operacional pedir.
- **Esforço:** S (já tem em revista-live)
- **Impacto:** ★

### J3 · Alt text em todas as fotos
Cada foto descrita pra screen readers. Opcionalmente usado por TTS.
- **Esforço:** S (validator pode forçar)
- **Impacto:** ★

---

## CATEGORIA K — Tecnologia avançada (futuro)

### K1 · Notificação push web
Pra quem instalou como PWA, push notification quando nova edição sai. Sem WhatsApp.
- **Esforço:** L
- **Impacto:** ★

### K2 · PWA instalável
"Adicionar Beauty & Health à tela inicial". Vira app real no celular da paciente.
- **Esforço:** M
- **Impacto:** ★★

### K3 · Editor com voz (Mirian dita conteúdo)
Mirian fala no microfone, transcrição automática vira draft de matéria. Reduz atrito de produção.
- **Esforço:** L (Whisper API)
- **Impacto:** ★★

### K4 · IA sugere foto ideal pro slot
Claude analisa todas fotos da biblioteca e sugere a melhor pra cada slot baseado no contexto da matéria.
- **Esforço:** M
- **Impacto:** ★★

---

## ROADMAP SUGERIDO (3 ondas)

### Onda 1 — "Premium na primeira impressão" (1 sprint)
Foco no que atinge a leitora antes mesmo de começar a ler.

- A1 Capa personalizada com nome
- B1 Capa que acende
- B2 Stats counting up
- E3 Open Graph rico
- F1 Continue de onde parou
- I4 Dashboard de insights pra Mirian

### Onda 2 — "Engajamento profundo" (1 sprint)
Coisas que prendem na leitura e geram retorno.

- B3 Comparador slider antes/depois (novo template)
- C1 Áudio de boas-vindas da Mirian
- D1 Hidden icon implementado
- D5 Reactions por matéria
- E1 Card share com nome
- F3 Notificação WhatsApp pré-edição

### Onda 3 — "Exclusividade & retenção" (1 sprint)
Características de produto premium real.

- A4 Antes/depois personalizado por queixa
- A5 Edição de aniversário
- A6 Versão VIP estendida
- G1 Edição expira em 30 dias
- G3 Acesso priorizado base atual
- H4 Versão impressa em PDF

---

## REGRA EDITORIAL DOS WOW EFFECTS

Cada efeito precisa passar em 3 testes antes de implementar:

1. **Reforça o DNA editorial?** — se atrapalha a leitura ou parece "joguinho", fora.
2. **Mensurável?** — todo efeito wow deve gerar dado (impressões, cliques, tempo).
3. **Operacionalmente sustentável?** — se exige produção manual a cada edição, considerar custo.

Premium não é fazer mais — é fazer o certo com cuidado obsessivo.
