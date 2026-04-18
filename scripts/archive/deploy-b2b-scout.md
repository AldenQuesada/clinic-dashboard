# Deploy da Edge Function b2b-scout-scan

## Pré-requisito: tokens

| Chave | Status | Valor |
|---|---|---|
| `ANTHROPIC_API_KEY` | ✓ já temos | guardada fora do git (ver memory `reference_clinicai_api_keys.md`) |
| `APIFY_TOKEN` | ✗ precisa criar | — |

## Passo 1 — Obter Apify token (5min, free)

1. Acessar https://console.apify.com/sign-up
2. Depois do login → **Settings** → **Integrations** → **API token**
3. Copiar (começa com `apify_api_`)

Free tier: $5/mês (≈12 varreduras).

## Passo 2 — Configurar secrets

```bash
cd C:/Users/alden/clinic-dashboard

# Link projeto (uma vez)
supabase link --project-ref oqboitkpcvuaudouwvkl

# Set secrets (NÃO comitar estas chaves no git!)
supabase secrets set ANTHROPIC_API_KEY=<colar a chave Claude — NÃO commitar>
# → chave disponível localmente em ~/.claude memory (reference_clinicai_api_keys.md)
supabase secrets set APIFY_TOKEN=apify_api_xxxxxxx  # COLAR o token copiado

# (opcional) modelo mais barato
supabase secrets set ANTHROPIC_MODEL=claude-haiku-4-5-20251001
```

## Passo 3 — Deploy

```bash
supabase functions deploy b2b-scout-scan --no-verify-jwt
```

## Passo 4 — Testar

1. Abrir `https://clinicai-dashboard.px1hdq.easypanel.host/b2b-partners.html`
2. Ativar toggle master do Scout
3. Aba "Candidatos" → escolher categoria (ex: "Perfumaria de nicho")
4. Clicar "Varrer" → confirma custo estimado → aguardar 30-90s
5. Lista popula com candidatos + DNA score do Claude + fit/riscos

## Troubleshooting

- **"Bloqueado: scout_disabled"** → liga o toggle na UI
- **"Bloqueado: budget_cap_reached"** → consumo do mês excedeu `budget_cap_monthly` (default R$ 100)
- **"Bloqueado: rate_limit_exceeded"** → já varreu essa categoria hoje (reset 00h UTC)
- **"APIFY_TOKEN ausente"** → rodar `supabase secrets set APIFY_TOKEN=...`
- **Apify 429** → free tier esgotado, upgrade ou esperar próximo mês

## Alternativa — Google Places API (se preferir não usar Apify)

Caso queira trocar Apify por Google Places:
1. Google Cloud Console → habilita "Places API (New)"
2. Gera API key
3. Me avisa pra eu adaptar `index.ts` (~30 linhas trocam a função `apifyRunSync` por chamada Google)
