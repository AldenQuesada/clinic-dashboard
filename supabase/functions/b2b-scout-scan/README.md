# Edge Function: b2b-scout-scan

Orquestra a varredura de candidatos B2B (Apify Google Maps + Claude DNA scoring).

## Deploy

```bash
cd C:/Users/alden/clinic-dashboard

# 1. Configurar secrets (uma vez)
supabase secrets set APIFY_TOKEN=apify_api_xxx
supabase secrets set ANTHROPIC_API_KEY=sk-ant-xxx
# (opcional) supabase secrets set ANTHROPIC_MODEL=claude-haiku-4-5-20251001

# 2. Deploy
supabase functions deploy b2b-scout-scan --no-verify-jwt
```

## Invocação

A página `b2b-partners.html` dispara via fetch quando o admin:
1. Liga o toggle master do scout
2. Escolhe categoria na aba Candidatos
3. Clica "Varrer"

A função:
- Valida `b2b_scout_can_scan(category)` (toggle + budget cap + rate limit)
- Chama Apify `compass/crawler-google-places` com query em PT-BR + `Maringá, PR, Brazil`
- Para cada resultado (top 15), envia pro Claude que retorna JSON estruturado:
  `{ dna_score, dna_justification, fit_reasons[], risk_flags[], approach_message }`
- Registra candidato via `b2b_candidate_register` + custo via `b2b_scout_usage_log`
- Retorna `{ ok, results, created, failed, total_cost_brl }`

## Custos referência

| Evento | BRL/unid | Quando |
|---|---|---|
| google_maps_scan | 0,40 | 1× por varredura |
| claude_dna | 0,08 | 1× por candidato |

Varredura típica (15 candidatos): **R$ 0,40 + 15 × R$ 0,08 = R$ 1,60**

## Teste local

```bash
curl -X POST https://oqboitkpcvuaudouwvkl.supabase.co/functions/v1/b2b-scout-scan \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <anon_key>" \
  -d '{"category":"salao_premium","limit":5}'
```

## Troubleshooting

- **"APIFY_TOKEN ausente"** → rodar `supabase secrets set APIFY_TOKEN=...`
- **"Bloqueado: scout_disabled"** → liga o toggle na UI (`b2b_scout_config.scout_enabled=true`)
- **"Bloqueado: budget_cap_reached"** → consumo do mês atingiu `budget_cap_monthly`
- **"Bloqueado: rate_limit_exceeded"** → já rodou essa categoria hoje (default 1/dia)
