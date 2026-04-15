#!/usr/bin/env bash
# Deploy da Edge Function magazine-ai-generate + set do secret ANTHROPIC_API_KEY
#
# Pre-requisito: rodar `npx supabase login` uma vez (abre browser p/ auth).
#
# Uso:
#   ./scripts/deploy-magazine-ai.sh sk-ant-api03-XXXXX
# OU:
#   export ANTHROPIC_API_KEY=sk-ant-api03-XXXXX
#   ./scripts/deploy-magazine-ai.sh

set -euo pipefail

PROJECT_REF="oqboitkpcvuaudouwvkl"
FN_NAME="magazine-ai-generate"

KEY="${1:-${ANTHROPIC_API_KEY:-}}"
if [[ -z "$KEY" ]]; then
  echo "ERRO: passe a chave Anthropic como argumento ou via ANTHROPIC_API_KEY env"
  echo "Uso: $0 sk-ant-api03-XXXXX"
  exit 1
fi

echo "==> link ao projeto Supabase (${PROJECT_REF})..."
npx supabase link --project-ref "$PROJECT_REF" || true

echo "==> set secret ANTHROPIC_API_KEY no projeto..."
npx supabase secrets set ANTHROPIC_API_KEY="$KEY" --project-ref "$PROJECT_REF"

echo "==> deploy da função ${FN_NAME}..."
npx supabase functions deploy "$FN_NAME" --project-ref "$PROJECT_REF" --no-verify-jwt=false

echo ""
echo "✓ Deploy completo."
echo "  Endpoint: https://${PROJECT_REF}.supabase.co/functions/v1/${FN_NAME}"
echo ""
echo "Testando com payload dummy..."
curl -s -X POST \
  "https://${PROJECT_REF}.supabase.co/functions/v1/${FN_NAME}" \
  -H "Content-Type: application/json" \
  -H "apikey: $(grep SUPABASE_KEY js/config/env.js | head -1 | sed "s/.*'\\([^']*\\)'.*/\\1/")" \
  -d '{
    "template_slug": "t05_editorial_letter",
    "field_key": "assinatura",
    "field_meta": {"k": "assinatura", "label": "Assinatura", "type": "text", "max": 60},
    "page_slots": {},
    "edition_context": {"title": "Beauty & Health · Abril 2026"}
  }' | head -200
echo ""
