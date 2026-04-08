# Deploy Alexa Bridge — Docker Compose no VPS

## 1. Deploy via SSH

```bash
ssh root@181.215.69.124

# Opcao A: Script automatico
curl -sL https://raw.githubusercontent.com/AldenQuesada/clinic-dashboard/master/n8n/alexa-bridge/deploy.sh | bash

# Opcao B: Manual
mkdir -p /opt/alexa-bridge
cd /opt/alexa-bridge
# copiar: Dockerfile, server.js, package.json, docker-compose.yml
docker compose up -d --build
```

## 2. Verificar

```bash
curl http://localhost:3456/health
# {"status":"ok","alexa_connected":false}  (normal antes do login)

curl http://localhost:3456/api/login-status \
  -H "Authorization: Bearer clinicai-alexa-2026"
# Mostra se cookie existe e se Alexa esta conectada
```

## 3. Primeiro login Amazon

1. Abrir `http://181.215.69.124:3457` no browser
2. Fazer login com a conta Amazon vinculada aos Echo devices
3. Apos sucesso, verificar health novamente — deve retornar `alexa_connected: true`
4. Remover porta 3457 do docker-compose e `docker compose up -d`

## 4. Configurar env vars no n8n

No painel n8n (flows.aldenquesada.site) > Settings > Variables:

| Variavel | Valor |
|----------|-------|
| `ALEXA_API_URL` | `http://clinicai-alexa-bridge:3456` |
| `ALEXA_API_TOKEN` | `clinicai-alexa-2026` |

Se nao estao na mesma Docker network, usar:
- `ALEXA_API_URL` = `http://181.215.69.124:3456`

## 5. Teste end-to-end

```bash
# Testar webhook direto
curl -X POST https://flows.aldenquesada.site/webhook/alexa-announce \
  -H "Content-Type: application/json" \
  -d '{"device":"Recepcao","message":"Teste de deploy","type":"announce"}'

# Ou no dashboard: Agenda > marcar paciente "Na Clinica"
```

## 6. Pos-deploy

- Remover porta 3457 do docker-compose (seguranca)
- Se cookie expirar: reabrir porta 3457, refazer login
- Logs: `docker logs clinicai-alexa-bridge -f`
