# Anatomy Quiz · Templates Lara

Estes templates são consumidos pelo workflow n8n `anatomy_quiz_lifecycle_welcome`.
A IA (Claude Haiku) recebe o `template_key` + `context` da tabela `anatomy_quiz_lara_dispatch`
e gera a mensagem final preenchendo as variáveis.

## Variáveis disponíveis

| Variável | Origem |
|---|---|
| `[nome]` | dispatch.name (primeiro nome) |
| `[queixa1]` `[queixa2]` | dispatch.queixas[0/1].label |
| `[protocolo1]` `[protocolo2]` | dispatch.queixas[0/1].protocol |
| `[data]` | dispatch.context.lifecycle.scheduled_for (formato "dia X") |
| `[procedure_orcamento]` | dispatch.context.orcamento.procedure (se houver) |
| `[horario1]` `[horario2]` | sugerido pelo n8n via slot disponível |

---

## 1. `aq_novo_lead` · Sequência 5 mensagens (SPIN)

### Msg 1 · IMEDIATO · Onboarding + Rapport + Permissão
```
Oi [nome], aqui é a Lara da Clínica Mirian de Paula 💛

Obrigada por confiar essas respostas com a gente. Vi que [queixa1] e [queixa2] te incomodam.

Antes da Dra. Mirian te chamar, posso te fazer 2 perguntinhas rápidas? (vai me ajudar a separar o protocolo certo pra você)
```

### Msg 2 · após resposta OU +5 min · Situação
```
Me conta: há quanto tempo [queixa1] tá te chamando mais atenção?
```

### Msg 3 · após resposta · Prova social específica + imagem
```
Olha esse caso de uma paciente que também tinha [queixa1] e fez o protocolo da Dra. há 30 dias 👇

[imagem antes/depois da área]

Natural, sem parecer "feita". É exatamente o jeito que a Mirian trabalha.
```

### Msg 4 · após visualizar OU +3 min · Problema + Implicação
```
Quando você se olha no espelho de manhã, isso afeta como você se sente pro resto do dia? (em fotos, no trabalho, em momentos pessoais?)
```

### Msg 5 · após resposta · Need-payoff + Agendamento
```
Faz sentido. Imagina daqui 30 dias se olhando no espelho e [queixa1] não chamando mais sua atenção primeiro. É o que a Dra. entrega.

Tenho [horario1] e [horario2] essa semana com ela. Qual fica melhor?
```

---

## 2. `aq_lead_frio` · Sequência 4 mensagens

### Msg 1 · IMEDIATO · Reconexão + permissão
```
[nome], que bom te ver de novo! Aqui é a Lara 💛

Dessa vez você marcou [queixa1] e [queixa2] — anotei tudo pra Dra.

Posso te fazer uma pergunta? (sem julgamento, só quero entender melhor)
```

### Msg 2 · após resposta OU +5 min · Pergunta de descoberta
```
Algo mudou desde a última vez que a gente conversou? O que te fez voltar agora?
```

### Msg 3 · após resposta · Prova específica + emoção
```
Olha essa paciente que tinha exatamente [queixa1] 👇

[imagem antes/depois]

Ela esperou 8 meses pra decidir. Depois falou que se arrependeu de não ter feito antes — porque vontade de cuidar de você, quando bate, bate forte.
```

### Msg 4 · após visualizar OU +3 min · Need + Agendamento
```
E se a gente desse esse passo agora? Tenho [horario1] e [horario2] essa semana com a Dra. Qual fica melhor?
```

---

## 3. `aq_orcamento_aberto` · Mensagem única

```
[nome], aqui é a Lara. Olha que coincidência boa:

as queixas que você marcou agora ([queixa1], [queixa2]) já entram no orçamento que a gente separou (você lembra do [procedure_orcamento]?).

Com 1 plano você resolve tudo. Fechando essa semana, encaixo você ainda em [mes_atual].

Posso te mandar os detalhes?
```

---

## 4. `aq_agendado_futuro` · Mensagem única

```
[nome], que ótimo! Aqui é a Lara 💛

Vi tuas queixas aqui — [queixa1] e [queixa2] — e o melhor: você já está agendada com a Dra. Mirian dia [data].

Vai ser exatamente o espaço pra você tirar suas dúvidas e a Dra. já chega com um plano personalizado pra essas áreas.

30 dias depois da consulta, você vai estar vendo seu rosto se transformar em câmera lenta.

Tem alguma dúvida que eu posso adiantar antes do dia [data]?
```

---

## 5. `aq_paciente_ativo` · Mensagem única

```
[nome], que alegria te ver de volta 💛 Aqui é a Lara.

Você já viveu o processo com a gente — agora vejo que [queixa1] e [queixa2] entraram no radar (faz sentido, a pele evolui).

A Dra. gosta de fazer reavaliação a cada 6 meses pra ajustar protocolo. Posso reservar um horário com ela essa semana?

P.S.: nessas áreas a gente costuma usar [protocolo1] e [protocolo2].
```

---

## 6. `aq_requiz_recente` · Mensagem única (humor)

```
[nome], voltou? Tá pensando carinhosamente na sua pele essa semana 😊

Aqui é a Lara. Anotei suas novas queixas ([queixa1], [queixa2]) — a Dra. já tá vendo. Te mandei mensagem ontem, lembra?

Se quiser, adianto: reservo um horário com a Dra. essa semana pra a gente resolver tudo de uma vez. Topa?
```

---

## Estrutura do n8n

```
[Webhook trigger] → [Cron poll anatomy_quiz_lara_dispatch WHERE status=pending]
   ↓
[Switch · template_key]
   ├─ aq_novo_lead    → Sequence Manager (5 msgs com listeners + timers)
   ├─ aq_lead_frio    → Sequence Manager (4 msgs)
   └─ aq_orcamento_aberto / aq_agendado_futuro / aq_paciente_ativo / aq_requiz_recente
         → Single message
   ↓
[Claude Haiku · preenche template com vars + fotos da anatomy_quiz_proof_photos]
   ↓
[Evolution API · send WhatsApp]
   ↓
[Update dispatch.status='dispatched']
```

## Sequence state machine (msg 1 → 2 → 3 → 4 → 5)

n8n `Wait` node configurado:
- entre msg → próxima: aguarda **resposta do paciente** (webhook Evolution `messages.upsert`)
- timeout fallback: msg2=5min · msg4=3min · demais=imediato após resposta
- se paciente para de responder no meio → marca `qualificacao_pausada` no dispatch + para sequência
- se já respondeu antes do tempo → adianta pra próxima imediatamente
