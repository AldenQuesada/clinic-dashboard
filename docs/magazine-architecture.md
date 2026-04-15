# Beauty & Health Magazine — Arquitetura Técnica

Documentação completa do sistema de revista digital. Para o contrato editorial de cada seção veja `magazine-editor-playbook.md`.

---

## Visão geral

Sistema de revista mensal segmentada com gamificação (cashback) e dispatch automático via WhatsApp. Multi-tenant via `clinic_id`. Produção editorial 100% orientada por IA: usuário envia brief + matéria-prima, Claude gera páginas polidas.

```
┌──────────────────┐          ┌──────────────────┐          ┌──────────────────┐
│ magazine-intake  │  brief   │  magazine_briefs │  consume │ Claude (off-UI)  │
│ (form user)      │ ───────> │  (tabela Supabase)│ <──────  │ gera paginas     │
└──────────────────┘          └──────────────────┘          └────────┬─────────┘
                                                                     │ validate + insert
                                                                     v
                                                             ┌──────────────────┐
                                                             │ magazine_pages   │
                                                             │ (renderizadas    │
                                                             │ por slug+slots)  │
                                                             └────────┬─────────┘
                                                                      │
                        ┌─────────────────────────────────────────────┤
                        v                                             v
                ┌──────────────────┐                         ┌──────────────────┐
                │ magazine-gallery │                         │ revista-live     │
                │ (preview dev)    │                         │ (leitor publico) │
                └──────────────────┘                         │ + HMAC + rewards │
                                                             └──────────────────┘
```

---

## Componentes

### Banco (Supabase · PostgreSQL)

**Tabelas:**

| Tabela | Propósito | Key | Relacionamento |
|--------|-----------|-----|----------------|
| `magazine_templates` | Registry global dos 20 formatos | `slug` unique | — |
| `magazine_editions` | Uma por edição mensal | `id uuid` | `clinic_id`, `hero_asset_id` |
| `magazine_pages` | Páginas de cada edição | `id uuid` | `edition_id` CASCADE, `template_slug` |
| `magazine_assets` | Imagens uploadadas | `id uuid` | `clinic_id`, `edition_id` (nullable) |
| `magazine_reads` | Rastreamento de leitura | `id uuid` | UNIQUE `(edition_id, lead_id)` |
| `magazine_rewards` | Cashbacks creditados | `id uuid` | UNIQUE `(edition_id, lead_id, reward_type)` |
| `magazine_briefs` | Entrada bruta do usuário | `id uuid` | `clinic_id`, `edition_id` (nullable) |
| `magazine_config` | Config global (HMAC secret) | `key` PK | Sem tenant |

**RLS:** todas as tabelas multi-tenant filtradas por `_mag_current_clinic_id()` — função com fallback single-tenant (JWT claim `clinic_id` ou UUID da clínica única).

**Migrations aplicadas:**
- `20260690000001_magazine_schema.sql` — 6 tabelas + índices
- `20260690000002_magazine_templates_seed.sql` — 20 templates
- `20260690000003_magazine_rls.sql` — RLS + helper `_mag_current_clinic_id`
- `20260690000004_magazine_rpc_admin.sql` — create_edition, add_page, reorder, publish, archive
- `20260690000005_magazine_rpc_reader.sql` — start_reading, update_progress, claim_reward, get_edition_public
- `20260690000006_magazine_config_hmac.sql` — HMAC em tabela (sem ALTER DATABASE), get_lead_rfm fallback
- `20260690000007_magazine_storage_bucket.sql` — bucket `magazine-assets` + RPC `magazine_register_asset`
- `20260690000008_magazine_clinic_id_fallback.sql` — `_mag_current_clinic_id` retorna clínica única se JWT sem claim
- `20260690000009_magazine_briefs_and_validator.sql` — tabela `magazine_briefs` + validator

**RPCs disponíveis:**

| RPC | Role | Propósito |
|-----|------|-----------|
| `magazine_create_edition(title, slug, theme?, subtitle?)` | authenticated | Cria edição draft |
| `magazine_add_page(edition_id, template_slug, slots?, segment_scope?)` | authenticated | Adiciona página |
| `magazine_reorder_pages(edition_id, page_ids[])` | authenticated | Reordena |
| `magazine_publish(edition_id)` | authenticated | Publica (draft → published) |
| `magazine_archive_edition(edition_id)` | authenticated | Arquiva |
| `magazine_register_asset(edition_id, url, type, ...)` | authenticated | Registra asset uploadado |
| `magazine_sign_lead_link(lead_id, edition_id)` | authenticated | Gera HMAC hash para link público |
| `magazine_validate_section(template_slug, slots)` | anon+auth | Valida slots conforme playbook → `{ok, errors, warnings}` |
| `magazine_upsert_brief(...)` | authenticated | Cria/atualiza rascunho de brief |
| `magazine_submit_brief(brief_id)` | authenticated | Marca brief como `submitted` |
| `magazine_start_reading(edition_id, lead_id, hash, ...)` | anon+auth | Inicia sessão de leitura, credita reward 'open' |
| `magazine_update_progress(edition_id, lead_id, hash, page_index, pages_completed[], time_spent)` | anon+auth | Atualiza progresso; credita 'read_80' ao atingir 80% |
| `magazine_claim_reward(edition_id, lead_id, hash, reward_type, amount?)` | anon+auth | Credita quiz/hidden_icon/shared/invite |
| `magazine_get_edition_public(slug, lead_id, hash)` | anon+auth | Retorna edição filtrada por segmento RFM |

### Storage

**Bucket:** `magazine-assets` (public read, authenticated insert)
- Path convention: `intake/{brief_id}/{uuid}.{ext}` ou `editions/{edition_id}/{uuid}.{ext}`
- Limite: 10 MB por arquivo
- Mimetypes aceitos: jpeg, png, webp, avif, gif, svg

### Segurança HMAC

Links públicos da revista assinam `(lead_id, edition_id)` com HMAC-SHA256 usando segredo em `magazine_config.hmac_secret`. Validado server-side em todas as RPCs do leitor via `_mag_verify_lead_hash`.

URL pattern: `revista-live.html?edition={slug}&lead={uuid}&h={hash}`

### Segmentação

Por padrão cada página tem `segment_scope = ['all']`. Valores possíveis:
- `all` — todos os leads
- `vip`, `active`, `at_risk`, `dormant`, `distante`, `lead` — conforme RFM

`magazine_get_edition_public` aplica o filtro: retorna apenas páginas onde `segment_scope` contém o segmento do lead ou `'all'`.

Segmento do lead vem de `get_lead_rfm(lead_id)` (com fallback por `appointments` se função canônica não existe).

---

## Frontend

### Páginas

| Arquivo | Propósito | Acesso |
|---------|-----------|--------|
| `magazine-intake.html` | Entrada bruta de conteúdo (brief + fotos + seções + validação live) | OWNER/ADMIN |
| `magazine-gallery.html` | Galeria dos 20 templates renderizados com exemplo fixo | OWNER/ADMIN |
| `magazine-admin.html` | Editor visual legado (mantido para referência, não recomendado) | OWNER/ADMIN |
| `revista.html` | Protótipo estático (6 páginas mockadas) | Público |
| `revista-live.html` | Leitor dinâmico (consome DB via RPC, tracking + rewards) | Público |

### Módulos JS

| Arquivo | API | Uso |
|---------|-----|-----|
| `js/magazine/magazine-renderer.js` | `MagazineRenderer.render(slug, slots) → HTML`<br>`MagazineRenderer.listSlugs() → string[]`<br>`MagazineRenderer.normalizeUrl(url) → url` (converte drive/dropbox) | admin, gallery, revista-live |

### CSS

- `css/magazine-pages.css` — classes `.mp-t01` a `.mp-t20`, uma por template. Variantes mobile via `@media (max-width: 500px)`.

### Integração ClinicAI

Section `revista` em `js/nav-config.js` com 4 pages externas (`externalUrl`):
- `revista-intake`
- `revista-gallery`
- `revista-playbook`
- `revista-preview`

Mecanismo `externalUrl` no `sidebar.js` abre em nova aba sem alterar SPA state. Roles: OWNER + ADMIN.

---

## Fluxo de produção de uma edição

### 1. Usuário → Intake
1. Abre `magazine-intake.html` via sidebar "Revista Digital > Montar Edição"
2. Preenche brief (mês, tema, tom, objetivo)
3. Arrasta fotos → upload pro Storage → registrado em `magazine_assets`
4. Escolhe seções do menu (20 cards categorizados)
5. Para cada seção preenche formulário específico (tamanhos validados em tempo real via `magazine_validate_section`)
6. Clica "Enviar pro Claude" → RPC `magazine_submit_brief` muda status para `submitted`

### 2. Claude → Produção
1. Lê `docs/magazine-editor-playbook.md` integralmente (regra de memória)
2. Lê brief via `SELECT * FROM magazine_briefs WHERE id = ?`
3. Lê fotos: `SELECT * FROM magazine_assets WHERE id = ANY(asset_ids)`
4. Para cada seção do brief:
   - Extrai conteúdo cru
   - Editorializa respeitando contrato do playbook (limites, tom, checks)
   - Monta objeto `slots` conforme schema
   - Chama `magazine_validate_section(slug, slots)` — se `errors.length > 0`, ajusta
   - Chama `magazine_add_page(edition_id, slug, slots, segment_scope)`
5. Cria edição via `magazine_create_edition` (antes de adicionar páginas)
6. Atualiza `magazine_briefs.status = 'done'`, `processed_at = now()`, `edition_id = ?`

### 3. Preview e aprovação
1. Usuário abre `revista-live.html?edition={slug}&preview=1`
2. Em modo preview (sem `lead`), HMAC permissivo — renderiza sem rewards
3. Usuário pede ajustes ("mexe na p3, troca a lede"), Claude reescreve página específica via UPDATE em `magazine_pages.slots`

### 4. Publicação
1. `magazine_publish(edition_id)` — status draft → published, `published_at = now()`
2. Edição torna-se acessível via RPC pública `magazine_get_edition_public`
3. n8n workflow `magazine_dispatch` (a implementar) dispara WhatsApp D+0, D+3, D+7 segmentado

### 5. Leitura + gamificação
Usuário final recebe link personalizado (WhatsApp):
`https://clinicai-dashboard.px1hdq.easypanel.host/revista-live.html?edition=abril-2026&lead={uuid}&h={hmac}`

Fluxo:
1. Abre → `magazine_start_reading` credita R$ 10 cashback 'open'
2. Scroll horizontal (scroll-snap) — cada página fica `current`
3. Ao atingir 80% de páginas vistas → `magazine_update_progress` credita +R$ 20 'read_80'
4. Quiz, hidden_icon, share, invite — cada um via `magazine_claim_reward`
5. `magazine_rewards` tem UNIQUE `(edition_id, lead_id, reward_type)` — não duplica

---

## Como criar um 21º template

Sequência obrigatória:

1. **Playbook** (`docs/magazine-editor-playbook.md`): adicionar seção com contrato completo (slug, quando usar, slots, regras, exemplo).
2. **Seed no banco**:
   ```sql
   INSERT INTO public.magazine_templates (slug, name, category, slots_schema, html_template)
   VALUES ('t21_xxx', 'Nome', 'categoria', '{"required":[...],"optional":[...]}'::jsonb, '<!-- server-side -->');
   ```
3. **CSS** em `css/magazine-pages.css`: adicionar `.mp-t21 { ... }` seguindo padrão dos existentes (px fixos, media query mobile).
4. **Renderer** em `js/magazine/magazine-renderer.js`: adicionar `R.t21_xxx = (s) => \`...\``.
5. **Validator** em `magazine_validate_section`: adicionar case no CASE WHEN com checks de required/limites.
6. **Gallery** (`magazine-gallery.html`): adicionar entry em `EXAMPLES` com exemplo preenchido.
7. **Intake** (`magazine-intake.html`): adicionar entry em `SECTIONS` com `fields[]` descrevendo os inputs.

**Regra de compat:** slugs novos só. Nunca renomear existentes. Incrementar `version` em `magazine_templates` se mudar comportamento.

---

## Gotchas e armadilhas conhecidas

- **UNIQUE DEFERRABLE** em `magazine_pages(edition_id, order_index)` — necessário para swap de ordem em `magazine_reorder_pages`.
- **Supabase pooler região:** projeto está em `us-west-2`. Conexão via `aws-0-us-west-2.pooler.supabase.com:5432` com user `postgres.oqboitkpcvuaudouwvkl`.
- **IPv6 direto (db.xxx)** às vezes dá timeout no Windows — usar pooler IPv4 como padrão.
- **JWT sem `clinic_id` claim:** `_mag_current_clinic_id()` tem fallback para clínica única (`00000000-0000-0000-0000-000000000001`).
- **Google Drive URLs:** `drive.google.com/file/d/ID/view` não é exibível — `normalizeUrl` converte para `drive.google.com/uc?export=view&id=ID` automaticamente.
- **Iframe srcdoc + `</script>`:** se escrever srcdoc HTML com `<script>` dentro de string JS, precisa escapar fechamento como `<\/script>` senão o parser HTML do browser termina o script externo prematuramente.
- **Escalonamento do preview:** templates são renderizados em viewport "natural" (1440×900 desktop, 390×720 mobile) e escalados via `transform: scale()` pra caber no container. Evita overflow e preserva proporções.

---

## Roadmap

| Item | Status | Prioridade |
|------|--------|------------|
| Schema base + 20 templates seed | ✓ done | — |
| RLS multi-tenant | ✓ done | — |
| RPCs admin + reader | ✓ done | — |
| HMAC secret (sem superuser) | ✓ done | — |
| Storage bucket + upload | ✓ done | — |
| Render engine (CSS + JS) | ✓ done | — |
| Leitor público dinâmico (revista-live) | ✓ done | — |
| Playbook editorial (20 seções) | ✓ done | — |
| Validator server-side | ✓ done | — |
| Intake UI (magazine-intake) | ✓ done | — |
| Galeria com exemplos (magazine-gallery) | ✓ done | — |
| Integração sidebar ClinicAI | ✓ done | — |
| n8n workflow `magazine_dispatch` (D+0/D+3/D+7) | pendente | alta |
| Admin panel para Claude consumir briefs em fila | pendente | alta |
| Quiz integration real (t16 → quiz-render.html) | parcial | média |
| Template 21+ (extensibilidade testada) | pendente | baixa |
| CDN de fotos com srcset responsivo | pendente | baixa |
