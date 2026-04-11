# Pluggy Setup — ClinicAI

Guia passo-a-passo pra ativar a integracao Pluggy (Open Finance / Sicredi).

---

## 1. Pre-requisitos

- Conta Pluggy criada com CNPJ da clinica (voce ja fez)
- **Client ID** e **Client Secret** do painel Pluggy (voce ja tem)
- Conector Sicredi Empresas funcionando (atualmente com problema — verificar com gerente de contas Pluggy)
- Migration `20260641000000_pluggy_connections.sql` aplicada (ja aplicada)

---

## 2. Configurar variaveis de ambiente no n8n

No painel do n8n (https://flows.aldenquesada.site), vai em:

**Settings → Variables** (ou Environment, dependendo da versao)

Adiciona:

```
PLUGGY_CLIENT_ID=<seu client id>
PLUGGY_CLIENT_SECRET=<seu client secret>
SUPABASE_SERVICE_KEY=<service role key do Supabase — NAO o anon>
```

> **IMPORTANTE:** `SUPABASE_SERVICE_KEY` e diferente do anon key. Pega em:
> Supabase Dashboard → Settings → API → `service_role` key (fica abaixo de anon).
> Esse key **bypass RLS** — so use em servidor (n8n), NUNCA no frontend.

---

## 3. Importar os workflows

No n8n, importa os 2 arquivos JSON:

### a) `pluggy-connect-token.workflow.json`
- Cria endpoint `POST /webhook/pluggy-connect-token`
- Frontend chama ele pra gerar connect token sem expor clientSecret
- **Ativa** o workflow apos importar

### b) `pluggy-sync-cron.workflow.json`
- Roda de hora em hora automatico
- Autentica no Pluggy
- Busca todas as conexoes ativas (`pluggy_list_connections`)
- Para cada conexao, pega transacoes dos ultimos 7 dias
- Mapeia pra formato cashflow (com classificacao automatica de metodo)
- Insere via `cashflow_create_entry` (idempotente por `external_id`)
- Dispara `cashflow_auto_reconcile` no final
- **Ativa** o workflow apos importar

---

## 4. Testar

1. Abre o **ClinicAI → Financeiro → Fluxo de Caixa**
2. Clica em **"Bancos"** (botao roxo no header)
3. Clica em **"Conectar novo banco"**
4. Seleciona **Sicredi** (ou Sicredi Empresas quando o conector voltar)
5. Faz o fluxo OAuth no app/site do Sicredi
6. Apos sucesso, a conexao aparece na lista com status **Ativo**
7. Aguarda ate 1 hora → as transacoes comecam a aparecer automaticas no Fluxo de Caixa

Se quiser testar antes, clica **"Sincronizar agora"** no card da conexao — dispara o sync na hora.

---

## 5. Troubleshooting

### "Erro: nao foi possivel gerar connect token"
- Verifica se `PLUGGY_CLIENT_ID` e `PLUGGY_CLIENT_SECRET` estao setados no n8n
- Verifica se o workflow `pluggy-connect-token` esta **ativo**
- Testa o endpoint direto: `curl -X POST https://flows.aldenquesada.site/webhook/pluggy-connect-token -d '{}'` — deve retornar `{ "accessToken": "..." }`

### Widget abre mas da 400 ao clicar Conectar
- Conector do banco especifico pode estar em manutencao (problema atual com Sicredi Empresas)
- Verifica status: https://status.pluggy.ai
- Abre DevTools → Network → olha response de `POST api.pluggy.ai/items`
- Contata suporte Pluggy: support@pluggy.ai

### Transacoes nao aparecem depois de conectar
- Aguarda ate 1 hora (cron roda de hora em hora)
- Verifica execucoes do workflow `pluggy-sync-cron` no n8n
- Se der erro, olha o log — geralmente e `SUPABASE_SERVICE_KEY` invalido

### Clicar "Sincronizar agora" nao faz nada
- Esse botao chama o endpoint `/webhook/pluggy-sync-now` que voce precisa criar adicionalmente
- Ou ignora e deixa o cron rodar de hora em hora
- Alternativa: executa o workflow `pluggy-sync-cron` manualmente no n8n

---

## 6. Seguranca

- **Client Secret** NUNCA sai do n8n
- **Service Role Key** NUNCA sai do n8n
- Frontend so recebe **connect token** (curto, expira em 30 min)
- Conexoes sao salvas em `pluggy_connections` com RLS ativa (so admin/owner veem)

---

## 7. Arquivos

| Arquivo | Descricao |
|---------|-----------|
| `supabase/migrations/20260641000000_pluggy_connections.sql` | Schema + RPCs |
| `js/repositories/pluggy.repository.js` | Wrapper RPCs |
| `js/services/pluggy.service.js` | Widget loader + API |
| `js/ui/pluggy-connect.ui.js` | Modal de conexoes |
| `n8n/pluggy-connect-token.workflow.json` | Endpoint proxy |
| `n8n/pluggy-sync-cron.workflow.json` | Cron hourly sync |
| `n8n/PLUGGY-SETUP.md` | Este arquivo |
