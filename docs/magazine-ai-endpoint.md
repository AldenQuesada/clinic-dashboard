# Magazine AI Edge Function — Reference

## Endpoint

```
POST https://oqboitkpcvuaudouwvkl.supabase.co/functions/v1/magazine-ai-generate
```

## Status

Deployed and responding. Model: `claude-haiku-4-5-20251001` (fast/cheap for per-field generation).
Override via `ANTHROPIC_MODEL` env var on the function (ex: Sonnet for richer content).

## Auth headers

Edge Functions require the Supabase anon key in both `Authorization` and `apikey`:

```
Authorization: Bearer <SUPABASE_ANON_KEY>
apikey: <SUPABASE_ANON_KEY>
Content-Type: application/json
```

## Request: per-field generation (used by ai-generator.js)

```json
{
  "template_slug": "t05_editorial_letter",
  "field_key": "corpo",
  "field_meta": {
    "k": "corpo",
    "label": "Corpo",
    "type": "textarea",
    "wordsMin": 180,
    "wordsMax": 280,
    "hint": "Tom pessoal mas profissional, 1a pessoa"
  },
  "page_slots": {
    "titulo": "Uma palavra da diretora",
    "assinatura": "Mirian de Paula"
  },
  "edition_context": {
    "title": "Beauty & Health — Abril 2026",
    "subtitle": "Lifting 5D",
    "theme": "smooth-eyes",
    "slug": "abril-2026-smooth-eyes"
  },
  "extra_instruction": "tom mais intimista"
}
```

### Response

```json
{ "text": "Na semana em que comecei a preparar esta edicao..." }
```

For `type: "list"` fields:
```json
{ "items": ["Estimula colageno", "Redefine o contorno", "Devolve luminosidade"] }
```

## Request: brief-to-edition (used by B2 auto-editor)

Sends the full brief plus available photos, the playbook, and asks for a JSON plan
with 10-14 pages respecting canonical order. See B2 migration
`magazine_brief_process` and edge function `magazine-brief-to-edition`.

## Testing from CLI

```bash
# Uses anon key from js/config/env.js
curl -X POST "https://oqboitkpcvuaudouwvkl.supabase.co/functions/v1/magazine-ai-generate" \
  -H "Authorization: Bearer $SUPABASE_ANON" \
  -H "apikey: $SUPABASE_ANON" \
  -H "Content-Type: application/json" \
  -d '{
    "template_slug":"t07_feature_double",
    "field_key":"titulo",
    "field_meta":{"k":"titulo","label":"Titulo","type":"text","max":70},
    "page_slots":{},
    "edition_context":{"title":"Beauty & Health — Abril 2026"}
  }'
```

Expected: `{"text":"..."}` 200 OK. If you get:
- 401 — missing auth headers
- 400 `missing required fields` — payload malformed (needs `template_slug`, `field_key`, `field_meta`)
- 500 — Anthropic API error (check `ANTHROPIC_API_KEY` secret)

## Deploying

Script: `scripts/deploy-magazine-ai.sh <ANTHROPIC_KEY>`

Or manually:

```bash
npx supabase secrets set ANTHROPIC_API_KEY=sk-ant-... --project-ref oqboitkpcvuaudouwvkl
npx supabase functions deploy magazine-ai-generate --project-ref oqboitkpcvuaudouwvkl
```

## Known issues / TODOs

- If `ANTHROPIC_API_KEY` is not set, the function returns 500 with message from Anthropic.
  **Mitigation:** `ai-generator.js` shows the error in the modal and user knows to contact admin.
- Model override `ANTHROPIC_MODEL` takes effect on next invocation (Deno Deploy cold start).
