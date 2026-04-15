# Plano de Fatiamento — ClinicAI no Easypanel

**Objetivo:** migrar o deploy atual (1 container monolítico) para múltiplos services independentes no Easypanel, ganhando deploy isolado, logs separados, scaling seletivo e rollback granular.

**Estado atual (hoje):**
- `clinicai-dashboard.px1hdq.easypanel.host` — 1 container `nginx:alpine` servindo HTML/JS/CSS estáticos **+** aparentemente também servindo o FastAPI em `/api/*` (Dockerfile.api existe separado mas precisa confirmar se já está como service próprio).
- `clinic-ai-backend` — Node/Prisma (status de deploy a verificar).
- `alexa-bridge` e `n8n` — já rodam isolados.
- Supabase — externo, não muda.

---

## Arquitetura proposta

```
Easypanel Project: clinicai
├── frontend-dashboard     [nginx:alpine]          → dashboard.aldenquesada.site
├── facial-api             [python FastAPI]        → facial.aldenquesada.site (ou interno)
├── backend-api            [node/prisma]           → api.aldenquesada.site
├── outbox-worker          [node]                  → sem domínio (worker)
└── (externos existentes)  alexa-bridge, n8n, supabase
```

**Comunicação interna:** Dentro do mesmo project, services se enxergam pelo nome DNS interno:
- `http://frontend-dashboard:80`
- `http://facial-api:8000`
- `http://backend-api:3000`

Sem passar pela internet → latência baixa, sem custo de banda.

---

## Passo a passo

### Etapa 1 — Preparação (antes de mexer em nada no Easypanel)

| Passo | Ação | Onde |
|---|---|---|
| 1.1 | Fazer backup da config atual no Easypanel: exportar env vars, anotar domínios e certificados | Easypanel UI → Service → Settings |
| 1.2 | Garantir que cada repo/código tem Dockerfile próprio funcionando em build local | Sua máquina: `docker build` |
| 1.3 | Verificar se `nginx.conf` atual tem `proxy_pass` pra `/api` (precisa trocar pra apontar ao service novo) | `clinic-dashboard/nginx.conf` |
| 1.4 | Criar branch `infra/split-services` pra versionar Dockerfiles/configs | Git |

**Complexidade:** 🟢 baixa. **Risco:** 🟢 nenhum (ainda não tocou em prod).

---

### Etapa 2 — Criar `facial-api` como service novo (Python FastAPI)

Este é o mais fácil pra começar porque já tem `Dockerfile.api` pronto e é isolado do resto.

| Passo | Ação |
|---|---|
| 2.1 | No Easypanel, criar novo service "App" no project `clinicai`, nome `facial-api` |
| 2.2 | Source: GitHub repo do dashboard, subpath `/api`, Dockerfile `Dockerfile.api` (ou mover `api/` pra repo separado) |
| 2.3 | Definir env vars necessárias (chaves de modelo, paths) |
| 2.4 | Expor porta 8000 (sem domínio público se for chamado só pelo frontend — usa rede interna) |
| 2.5 | Deploy e testar chamada interna: `curl http://facial-api:8000/healthz` a partir do container do frontend |
| 2.6 | Atualizar `nginx.conf` do frontend pra `proxy_pass http://facial-api:8000/` no location `/api/` |
| 2.7 | Deploy do frontend → validar que /api/* continua respondendo via proxy |

**Complexidade:** 🟡 média (setup inicial, mas linear). **Risco:** 🟡 médio — se o proxy falhar, face-mapping quebra. Testar em staging primeiro ou fazer fora de horário.

**Rollback:** reverter `nginx.conf` pro Dockerfile antigo que já servia o /api internamente.

---

### Etapa 3 — Isolar `frontend-dashboard` (só estáticos)

| Passo | Ação |
|---|---|
| 3.1 | Limpar `Dockerfile` principal deixando só nginx + arquivos estáticos (HTML/JS/CSS/imgs) |
| 3.2 | Remover do container qualquer código Python ou Node (diminui imagem de ~500MB → ~30MB) |
| 3.3 | Manter `nginx.conf` com `proxy_pass` pros outros services |
| 3.4 | Deploy e validar: login, agenda, inbox, automations, chamadas /api |

**Complexidade:** 🟢 baixa. **Risco:** 🟡 médio — se esquecer algum asset, quebra navegação silenciosamente.

**Rollback:** re-deploy do commit anterior (Easypanel tem histórico).

---

### Etapa 4 — Subir `backend-api` (Node/Prisma do clinic-ai-backend)

Este é opcional e depende de quanto o backend Node está efetivamente em uso hoje. Se o dashboard fala direto com Supabase via REST/anon key, o backend pode ficar só pra endpoints específicos (ou até ser aposentado).

| Passo | Ação |
|---|---|
| 4.1 | Confirmar quais endpoints do backend Node ainda são chamados. Se nenhum: pular etapa. |
| 4.2 | Criar service `backend-api` com Dockerfile do `clinic-ai-backend` |
| 4.3 | Configurar `DATABASE_URL` apontando pro Supabase |
| 4.4 | Expor 3000 (sem domínio se uso interno; com domínio se precisar externo) |
| 4.5 | Frontend chama via `http://backend-api:3000` (interno) ou proxy do nginx |

**Complexidade:** 🟡 média. **Risco:** 🟡 médio — Prisma precisa `DATABASE_URL` correto e sslmode; testar com query simples antes.

---

### Etapa 5 — Extrair `outbox-worker` (opcional, recomendado)

Hoje o dispatcher do `wa_outbox` roda... onde, exatamente? (validar) — talvez esteja no n8n workflow ou no backend-api. Se vale isolar:

| Passo | Ação |
|---|---|
| 5.1 | Criar service `outbox-worker` (Node, sem porta exposta) |
| 5.2 | Script que dorme N segundos, consulta `wa_outbox` pending, dispara via Evolution API, marca sent |
| 5.3 | Restart policy `always`, logs estruturados |

**Complexidade:** 🟡 média. **Risco:** 🟠 alto SE hoje o n8n já faz isso e você acabar com **2 workers** processando a mesma fila → mensagens duplicadas. Antes de ligar, **desligar** o caminho antigo.

---

### Etapa 6 — DNS e TLS

| Passo | Ação |
|---|---|
| 6.1 | Apontar subdomínios (`api.`, `facial.`) pro Easypanel via Cloudflare/DNS |
| 6.2 | Easypanel emite cert Let's Encrypt automaticamente |
| 6.3 | Se quiser manter tudo atrás do mesmo domínio: só o frontend tem subdomínio público, o resto fica interno |

**Complexidade:** 🟢 baixa. **Risco:** 🟢 baixo.

---

## Matriz de riscos consolidada

| Risco | Probabilidade | Impacto | Mitigação |
|---|---|---|---|
| Quebra do proxy `/api` → face-mapping offline | média | alto | Manter rollback pronto, testar fora de horário |
| Duplicação de worker (n8n + outbox-worker) → msgs duplicadas | alta se não auditar | crítico | Auditar caminho atual ANTES de subir worker novo |
| Env vars esquecidas no service novo | alta | médio | Checklist escrita antes do deploy |
| Nginx.conf com typo derruba site | baixa | crítico | `nginx -t` local antes de commitar |
| DNS propagation delay | baixa | baixo | Fazer em horário de pouco tráfego |
| Supabase RLS bloqueando conexão de service novo | baixa | alto | Usar mesma `SUPABASE_URL` + key já testada |

---

## Ordem recomendada (de menor pra maior risco)

1. **Etapa 1** (prep) — hoje mesmo, sem downtime
2. **Etapa 2** (facial-api isolado) — em horário tranquilo, testa proxy
3. **Etapa 3** (frontend enxuto) — dia seguinte, após validar etapa 2
4. **Etapa 6** (DNS) — em paralelo com 3
5. **Etapa 4** (backend-api) — só se houver uso real
6. **Etapa 5** (outbox-worker) — último, depois de auditar fluxo atual do dispatcher

**Tempo total estimado:** 1 a 2 dias de trabalho efetivo, espalhados em 4-5 dias de calendário pra dar tempo de validar cada etapa em prod.

---

## O que NÃO fazer nesta migração

- **Não trocar de Postgres** — Supabase fica como está
- **Não mexer em n8n** — já está isolado, funciona
- **Não extrair micro-services por domínio** (ex: "agenda-api", "financeiro-api") — overhead não justifica, monolito Node é OK
- **Não usar docker-compose local pra replicar Easypanel** — divergência de config causa surpresa em prod

---

## Checklist pré-deploy (cada etapa)

- [ ] Backup de env vars do service atual
- [ ] `docker build` local bem-sucedido
- [ ] Smoke test em staging (se houver) ou em horário tranquilo
- [ ] Health check funcionando (`/healthz` ou equivalente)
- [ ] Logs do Easypanel ativos e acessíveis
- [ ] Rollback plan escrito (qual commit reverter, qual botão clicar)
- [ ] Avisar usuários se houver janela de manutenção

---

*Documento criado 2026-04-14 — revisar após etapa 2 concluída.*
