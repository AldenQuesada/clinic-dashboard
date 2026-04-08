# Deploy Alexa Bridge — Easypanel

## 1. Criar servico no Easypanel

No painel Easypanel do projeto `clinicai-dashboard`:

1. **Add Service > App** (nao Docker)
2. Nome: `alexa-bridge`
3. Source: **GitHub** (mesmo repo clinic-dashboard)
4. Build:
   - **Dockerfile path:** `n8n/alexa-bridge/Dockerfile`
   - **Context:** `n8n/alexa-bridge`
5. Portas:
   - `3456` (API principal)
   - `3457` (proxy login Amazon — temporario, desabilitar apos autenticar)
6. Volumes:
   - Mount path: `/app/data`
   - (persistir cookie entre deploys)
7. Environment variables:
   ```
   PORT=3456
   AUTH_TOKEN=clinicai-alexa-2026
   AMAZON_PAGE=amazon.com.br
   ALEXA_COOKIE_FILE=/app/data/.alexa-cookie
   PROXY_HOST=0.0.0.0
   PROXY_PORT=3457
   ```

## 2. Primeiro login Amazon

Apenas na primeira vez (cookie persiste no volume):

1. Acessar `http://<easypanel-host>:3457` no browser
2. Fazer login com a conta Amazon vinculada aos Echo devices
3. Apos sucesso, o cookie sera salvo em `/app/data/.alexa-cookie`
4. Verificar: `GET http://<easypanel-host>:3456/health`
   - Deve retornar `{ "status": "ok", "alexa_connected": true }`
5. **Fechar porta 3457** apos autenticacao (seguranca)

## 3. Workflow n8n

1. No n8n (`flows.aldenquesada.site`), importar `alexa-announce-workflow.json`
2. Configurar env vars do n8n:
   - `ALEXA_API_URL` = `http://alexa-bridge:3456` (se no mesmo network)
   - ou `http://<easypanel-host>:3456` (se externo)
   - `ALEXA_API_TOKEN` = `clinicai-alexa-2026`
3. Ativar o workflow

## 4. Configurar no Dashboard

1. Settings > Dados da Clinica > Alexa
2. Webhook URL: `https://flows.aldenquesada.site/webhook/alexa-announce`
3. Dispositivo recepcao: nome exato do Echo (ex: "Echo da Recepcao")
4. Templates de mensagem: ajustar se necessario
5. Toggle: Ativar
6. Testar: botao "Testar Notificacao"

## 5. Teste end-to-end

1. Abrir Agenda no dashboard
2. Marcar um agendamento como "Na Clinica"
3. Verificar:
   - Toast aparece no dashboard
   - Echo da recepcao faz announce de boas-vindas
   - Echo da sala da profissional faz announce de aviso

## Troubleshooting

- **Alexa nao conecta:** verificar `GET /health` e `GET /api/login-status`
- **Cookie expirou:** refazer login via proxy porta 3457
- **Webhook nao chega:** verificar URL no dashboard e logs do n8n
- **Announce falha:** verificar nome exato do device em `GET /api/devices`
