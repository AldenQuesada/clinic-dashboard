#!/bin/bash
# Deploy Alexa Bridge no VPS
# Executar no VPS via SSH: bash deploy.sh

set -e

REPO_DIR="/tmp/alexa-bridge-deploy"
INSTALL_DIR="/opt/alexa-bridge"

echo "=== Alexa Bridge Deploy ==="

# 1. Clonar/atualizar repo
if [ -d "$REPO_DIR" ]; then
  cd "$REPO_DIR" && git pull
else
  git clone --depth 1 --sparse https://github.com/AldenQuesada/clinic-dashboard.git "$REPO_DIR"
  cd "$REPO_DIR"
  git sparse-checkout set n8n/alexa-bridge
fi

# 2. Copiar para diretorio de instalacao
mkdir -p "$INSTALL_DIR"
cp -r "$REPO_DIR/n8n/alexa-bridge/"* "$INSTALL_DIR/"

cd "$INSTALL_DIR"

# 3. Detectar network do n8n
N8N_NETWORK=$(docker network ls --format '{{.Name}}' | grep -i n8n | head -1)
if [ -z "$N8N_NETWORK" ]; then
  echo "[WARN] Network n8n nao encontrada. Usando bridge default."
  N8N_NETWORK="bridge"
fi
echo "[INFO] Usando network: $N8N_NETWORK"

# Atualizar network no docker-compose
sed -i "s/n8n_default/$N8N_NETWORK/g" docker-compose.yml

# 4. Build e start
docker compose down 2>/dev/null || true
docker compose up -d --build

echo ""
echo "=== Deploy concluido ==="
echo "Health check: curl http://localhost:3456/health"
echo "Login status: curl http://localhost:3456/api/login-status -H 'Authorization: Bearer clinicai-alexa-2026'"
echo "Proxy login:  Abra http://$(hostname -I | awk '{print $1}'):3457 no browser para autenticar na Amazon"
echo ""
echo "Apos autenticar, feche a porta 3457:"
echo "  docker compose exec alexa-bridge kill -USR1 1  # ou remova a porta do compose e restart"
