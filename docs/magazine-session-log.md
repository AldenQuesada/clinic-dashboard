# Magazine Session Log — 2026-04-15

Registro técnico da sessão que construiu o sistema intake-based da revista Beauty & Health.

---

## Contexto inicial

Na abertura da sessão, a revista digital tinha:
- Schema + 20 templates + 9 RPCs (admin + reader) já aplicados em 14/04
- Protótipo estático `revista.html` com 6 páginas mockadas
- Faltava: editor, upload de fotos, render engine, HMAC seguro, fluxo end-to-end

Primeira tentativa: `magazine-admin.html` estilo page-builder visual (preview WYSIWYG, drag-drop, template picker modal). Funcional, mas:
- Preview de template em iframe quebrava visualmente (templates desenhados para viewport 100vh comprimidos em 16:10 desktop)
- UX exigia o usuário lutar com layout (foto cortando, texto pequeno, títulos desalinhados)
- Sem controle editorial (podia digitar qualquer comprimento, gerar edições inconsistentes)

Insight do usuário: **"a melhor opção é você mesmo ser o editor e não ter uma interface"**.

## Pivô: modelo intake-based

Usuário define intenção + matéria-prima em formulário cru. Claude editorializa respeitando contrato fixo de cada seção. Separação radical:
- **Usuário**: brief, fotos, copy cru, ordem das seções
- **Claude**: escolha de formato certo, enxugar texto pros limites, tom editorial, validação

## Entregas desta sessão

### Documentação
- `docs/magazine-editor-playbook.md` — contrato das 20 seções (slots, limites de chars/palavras, tom, exemplos preenchidos, checklist pré-publicação, extensibilidade)
- `docs/magazine-architecture.md` — arquitetura técnica completa
- `docs/magazine-quickstart.md` — guia do usuário (passo a passo)
- `docs/magazine-session-log.md` — este arquivo

### Banco
- Migration `06` — `magazine_config` (HMAC sem ALTER DATABASE/superuser) + `get_lead_rfm` fallback + reescrita de `_mag_verify_lead_hash`
- Migration `07` — bucket `magazine-assets` + RPC `magazine_register_asset`
- Migration `08` — `_mag_current_clinic_id()` com fallback single-tenant (clínica única)
- Migration `09` — tabela `magazine_briefs` + RPCs `magazine_upsert_brief`/`magazine_submit_brief` + **validator** `magazine_validate_section` (checa required, limites de chars/palavras, tamanho de arrays, warn de emoji)

Todas aplicadas via pooler `us-west-2` (descoberto nesta sessão após varredura de regiões).

### Frontend
- `js/magazine/magazine-renderer.js` — API `MagazineRenderer.render(slug, slots)` cobrindo os 20 templates, com `normalizeUrl` para Google Drive/Dropbox
- `css/magazine-pages.css` — classes `.mp-t01` a `.mp-t20` com variantes desktop/mobile
- `magazine-intake.html` — 5 blocos: brief, biblioteca de fotos (drag-drop → Storage), menu de seções (20 cards categorizados), sumário montado (reordenável, validação live), referências
- `magazine-gallery.html` — grid dos 20 templates renderizados com exemplo fixo, filtro por categoria
- `revista-live.html` — leitor público dinâmico (consome `magazine_get_edition_public`, registra `start_reading`/`update_progress`, toasts de cashback)
- `magazine-admin.html` — editor visual legado mantido para referência/debug

### Integração ClinicAI
- `js/nav-config.js` — nova section `revista` (ícone book-open, roles OWNER+ADMIN) com 4 pages externas
- `js/sidebar.js` — mecanismo `externalUrl` (pages com essa propriedade abrem em nova aba sem alterar SPA)
- `index.html` — cache-bust de nav-config e sidebar para `v=20260415a`

## Descobertas técnicas

### Conexão Supabase
- Direct IPv6 (`db.oqboitkpcvuaudouwvkl.supabase.co`) dá timeout no Windows
- Pooler funciona: `aws-0-us-west-2.pooler.supabase.com:5432`
- User format: `postgres.{project_ref}` (não apenas `postgres`)
- Região encontrada via varredura de todas as regiões AWS conhecidas

### Armadilhas resolvidas
- **`</script>` em srcdoc**: browser parser fecha o script externo prematuramente; escapar como `<\/script>` dentro de template literal JS
- **Aspect-ratio em grid**: `.visual` com `aspect-ratio: 3/4` em grid 1fr causa overflow vertical se container não for alto suficiente; usar `height: 100%` + grid min-height: 0
- **HMAC via ALTER DATABASE**: não funciona em Supabase (exige superuser); migrar para tabela `magazine_config` com função SECURITY DEFINER
- **`_mag_current_clinic_id()` retornando NULL**: JWT padrão do Supabase não tem claim `clinic_id`; solução fallback para clínica única (match com padrão `app_clinic_id` do resto do sistema)
- **RPC `permission denied`**: usuário anon não tinha grant nas RPCs admin; resolvido adicionando gate de login no admin
- **Google Drive URLs**: share URL não é exibível como img; `normalizeUrl` converte para `/uc?export=view&id=` automaticamente

### Decisões de arquitetura
- **Templates renderizam em viewport "natural"** (1440×900 desktop, 390×720 mobile) e são escalados via `transform: scale()` pra caber em containers de preview. Evita clamp() hell e permite usar px fixos.
- **Validator no banco** (não apenas no front) — garante que mesmo inserts via pg direto passam pela mesma régua que o intake.
- **Briefs separados de pages** — permite regerar uma edição a partir do mesmo brief ou arquivar briefs sem páginas.
- **Assets com `edition_id` nullable** — mesma foto pode ser reutilizada entre edições (biblioteca global da clínica).

## Pendências

1. **n8n workflow `magazine_dispatch`** — disparo WhatsApp D+0/D+3/D+7 segmentado por RFM usando `magazine_sign_lead_link` para gerar hash por lead
2. **Painel de briefs em fila** — lista de `magazine_briefs` submitted para Claude consumir sistematicamente
3. **Quiz integration** — quando página usa `t16_quiz_cta`, criar automaticamente um registro em `quizzes` apontando pra `quiz_slug`
4. **Template 21+** — testar extensibilidade completa criando um formato novo não-previsto
5. **CDN srcset** — otimização de imagem responsiva (atualmente servindo full size)

## Regra permanente gravada em memória

```
feedback_magazine_editor_playbook.md
→ Toda sessão de trabalho em revista Beauty & Health começa
  com leitura integral de docs/magazine-editor-playbook.md
  antes de qualquer ação.
```
