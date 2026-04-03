# Relatório de Refatoração — Camada de Repositório

**Data:** 2026-03-31
**Escopo:** Introdução/expansão da camada de repositório e extração modular de api.js

---

## O que foi feito

### TAREFA 1 — `js/repositories/anamnesis.repository.js` (CRIADO)

Repositório puro para o domínio de anamnese. Métodos implementados:

- `getTemplates(clinicId)` — lista templates via `.from('anamnesis_templates')`
- `getRequests(clinicId)` — lista requests com join de template
- `createRequest(clinicId, patientId, templateId, expiresAt)` — RPC `create_anamnesis_request`
- `getResponses(clinicId)` — lista responses via `.from('anamnesis_responses')`
- `revokeRequest(requestId)` — tenta RPC `revoke_anamnesis_request`; fallback via update de status
- `getWaTemplates()` — RPC `sdr_get_wa_templates` (usado por agenda-mensagens.js)
- `upsertWaTemplate(msg)` — RPC `sdr_upsert_wa_template`
- `deleteWaTemplate(msgId)` — RPC `sdr_delete_wa_template`

**Observação:** Os métodos `getWaTemplates`, `upsertWaTemplate` e `deleteWaTemplate` foram incluídos aqui porque as chamadas originais em `agenda-mensagens.js` eram para RPCs de WhatsApp templates, que fazem parte do fluxo de anamnese/comunicação da clínica.

---

### TAREFA 2 — `js/repositories/tasks.repository.js` (CRIADO)

Repositório para o módulo de tarefas (`tasks.js`). Métodos:

- `listTasks({ status, limit, offset })` — RPC `sdr_get_tasks`
- `updateStatus(taskId, status)` — RPC `sdr_update_task_status`
- `getProfessionals()` — RPC `sdr_get_professionals`

**Pendente:** `tasks.js` ainda chama `window._sbShared` diretamente. A refatoração de `tasks.js` para usar `TasksRepository` não foi realizada nesta iteração (não constava como tarefa explícita de refatoração). Ver seção "Próximos Passos".

---

### TAREFA 3 — `js/repositories/users.repository.js` (CRIADO)

Repositório para o módulo de administração de usuários (`users-admin.js`). Métodos:

- `getStaff()` — RPC `list_staff`
- `inviteStaff(email, role)` — RPC `invite_staff`
- `updateRole(userId, newRole)` — RPC `update_staff_role`
- `deactivateStaff(userId)` — RPC `deactivate_staff`
- `activateStaff(userId)` — RPC `activate_staff`
- `getPendingInvites()` — RPC `list_pending_invites`
- `revokeInvite(inviteId)` — RPC `revoke_invite`
- `getProfiles(clinicId)` — `.from('profiles').select('*').eq('clinic_id', clinicId)`
- `updateProfile(userId, fields)` — `.from('profiles').update(fields).eq('id', userId)`

**Pendente:** `users-admin.js` ainda usa `_sb()` interno. A refatoração de `users-admin.js` para usar `UsersRepository` não foi realizada nesta iteração. Ver seção "Próximos Passos".

---

### TAREFA EXTRA — `js/repositories/tags.repository.js` (CRIADO)

Repositório criado para suportar a refatoração de `leads.js` (necessário para Tarefa 4). Métodos:

- `getTagBySlug(slug)` — `.from('tags').select('id').eq('slug', slug).single()`
- `getEntityIdsByTag(tagId, entityType)` — `.from('tag_assignments').select('entity_id')`
- `listLeadTags()` — lista tags de leads excluindo categoria temperatura

---

### TAREFA 4 — `js/leads.js` (REFATORADO)

Substituídas as duas chamadas diretas a `window._sbShared.from(...)`:

1. **Filtro por tag em `loadLeads()`:** A busca de `tag_id` pelo slug e de `entity_ids` pela tag agora passa por `window.TagsRepository.getTagBySlug()` e `window.TagsRepository.getEntityIdsByTag()`. Mantido fallback legado para quando `TagsRepository` não estiver disponível.

2. **Fallback de `_leadsLoadTagsFilter()`:** A fonte primária continua sendo `TagEngine`. O fallback Supabase agora usa `window.TagsRepository.listLeadTags()` antes de recorrer ao `window._sbShared` legado.

**Interface preservada:** Todas as funções globais existentes mantidas com assinatura idêntica.

---

### TAREFA 5 — `js/patients.js` (PARCIALMENTE CONFORME)

Análise do código revelou que a função principal `loadPatients()` **não faz chamadas diretas ao Supabase**. O módulo já está em conformidade para o fluxo principal:

- Fonte primária: `window.PatientsService.getLocal()` (cache gerenciado pelo service)
- Fallback: `localStorage` (clinicai_leads + clinicai_appointments)

**Exceção encontrada:** A função `npCheckDuplicateDoc()` (linha 494) ainda chama `window._sbShared.rpc('leads_check_duplicate_doc', ...)` diretamente como fonte primária, com fallback para localStorage. Esta função é de validação de CPF/RG duplicados, não coberta por `PatientsRepository` ou `LeadsRepository`.

**Decisão:** Não refatorado nesta iteração porque nenhum repositório existente possui método para esta RPC específica. Ver "Próximos Passos" para criar `LeadsRepository.checkDuplicateDoc()`.

---

### TAREFA 6 — `js/agenda-mensagens.js` (REFATORADO)

Substituídas as três chamadas diretas em `_loadFromSupabase()`, `_syncToSupabase()` e `_deleteFromSupabase()`:

- `window._sbShared.rpc('sdr_get_wa_templates')` → `window.AnamnesisRepository.getWaTemplates()`
- `window._sbShared.rpc('sdr_upsert_wa_template', ...)` → `window.AnamnesisRepository.upsertWaTemplate(msg)`
- `window._sbShared.rpc('sdr_delete_wa_template', ...)` → `window.AnamnesisRepository.deleteWaTemplate(msgId)`

A lógica de atualização de ID temporário (msg_TIMESTAMP → UUID real) foi preservada. O guard de disponibilidade (`if (!window.AnamnesisRepository)`) substitui o anterior (`if (!window._sbShared)`).

---

### TAREFA 7 — `js/agenda-modal.js` (CRIADO)

Arquivo criado com as funções extraídas de `api.js`:

- `openApptModal(id, date, time, profIdx)`
- `closeApptModal()`
- `saveAppt()`
- `deleteAppt()`
- `openApptDetail(id)`
- `apptSearchPatient(q)`
- `selectApptPatient(id, nome)`
- `apptProcAutofill(procNome)`
- `apptTipoChange()`

**Estratégia de extração:** As funções foram copiadas para o novo arquivo usando `window.*` para referenciar todos os helpers que permanecem em `api.js` (`_apptGetAll`, `_apptSaveAll`, `_apptGenId`, etc.). Os helpers internos de `api.js` foram expostos como `window._appt*` para viabilizar a extração sem quebrar encapsulamento global.

**Risco identificado:** Atualmente, `api.js` ainda contém as implementações originais **E** as expõe via `window.*`. O `agenda-modal.js` carregado após `api.js` irá sobrescrever os globals com suas próprias versões (comportamento correto). Para completar a extração, as implementações em `api.js` devem ser removidas em iteração futura.

---

### TAREFA 8 — `js/agenda-finalize.js` (CRIADO)

Arquivo criado com as funções de finalização de atendimento:

- `quickFinish(id)`
- `openFinalizarModal(id)` — modal simplificado (proc + valor + indicação)
- `_confirmFinalizar(id)`
- `_skipFinalizar(id)`
- `_toggleAnamnese(id)`
- `_setConsent(id, type, val)`
- `openFinishModal(id)` — modal completo com produtos e cálculo de lucro
- `closeFinishModal()`
- `simWhatsappConfirm()`
- `addFinishProduct()` / `removeFinishProduct(i)`
- `renderFinishProducts()`
- `recalcProfit()`
- `confirmFinishAppt()`

**Estado do `_finishProducts`:** O array de produtos foi mantido como variável local ao IIFE do novo arquivo (não mais dependente do escopo de `api.js`). A bridge `window._apptFinishProducts` exposta em `api.js` não é usada por `agenda-finalize.js` (ele tem sua própria variável).

---

### TAREFA 9 — `js/agenda-notifications.js` (CRIADO)

Arquivo criado com:

- `_showToast(title, subtitle, type)` — sistema de toast com auto-dismiss e close manual
- `_dismissToast(el)` — helper de dismiss com animação
- `_renderNotificationBell()` — atualiza badge do sino, injeta itens no menu dropdown

---

### Alterações em `js/api.js`

Adicionado bloco de exports de helpers internos (`window._appt*`) necessários para as extrações:

```javascript
window._apptGetAll         = getAppointments
window._apptSaveAll        = saveAppointments
window._apptGenId          = genApptId
window._apptAddMinutes     = addMinutes
window._apptFmtDate        = fmtDate
window._apptFmtBRL         = fmtBRL
window._apptRefresh        = refreshCurrentAgenda
window._apptStatusCfg      = APPT_STATUS_CFG
window._apptCheckConflict  = checkConflict
window._apptSetLeadStatus  = _setLeadStatus
window._apptEnviarMsg      = _enviarMsgAgendamento
window._apptFinishProducts = function(v) { ... }
window._apptDeductStock    = _deductStock
```

---

## O que ficou pendente

### 1. Remover implementações duplicadas de `api.js`

Os arquivos `agenda-modal.js`, `agenda-finalize.js` e `agenda-notifications.js` contêm as implementações extraídas, mas `api.js` ainda mantém as versões originais. O comportamento atual é correto (os novos arquivos sobrescrevem os globals ao carregar depois), mas `api.js` deve ser limpo em iteração futura para remover as implementações duplicadas e manter apenas delegações:

```javascript
// Delegação — implementação em agenda-modal.js
window.openApptModal = function() { return window.openApptModal.apply(this, arguments) }
```

**Risco de não fazer:** Código duplicado aumenta superfície de manutenção. Alteração em uma versão não reflete na outra se a ordem de carregamento mudar.

### 2. Refatorar `tasks.js` para usar `TasksRepository`

`tasks.js` ainda chama `window._sbShared` diretamente em:
- `_loadProfessionals()` — linha 84
- `_loadFromSupabase()` — linha 137
- `_sbUpdateStatus()` — linha 612

### 3. Refatorar `users-admin.js` para usar `UsersRepository`

`users-admin.js` mantém um cliente Supabase próprio (`_sb()` interno) e chama diretamente:
- `list_staff`, `invite_staff`, `update_staff_role`, `deactivate_staff`, `activate_staff`
- `list_pending_invites`, `revoke_invite`
- `.from('profiles').update(...)` (linha 474)

### 4. Registrar os novos arquivos no HTML

Os arquivos novos precisam ser adicionados às tags `<script>` do `index.html` (ou equivalente) na ordem correta:

```html
<!-- Repositórios — carregam antes dos módulos -->
<script src="js/repositories/tags.repository.js"></script>
<script src="js/repositories/anamnesis.repository.js"></script>
<script src="js/repositories/tasks.repository.js"></script>
<script src="js/repositories/users.repository.js"></script>

<!-- Módulos de agenda — carregam depois de api.js -->
<script src="js/agenda-notifications.js"></script>
<script src="js/agenda-modal.js"></script>
<script src="js/agenda-finalize.js"></script>
```

**Este passo é obrigatório para que os novos arquivos tenham efeito.** Sem ele, somente `api.js` estará ativo (que ainda contém as implementações originais, então nada quebra).

### 5. Tags com acesso direto em `leads.js` — fallback ainda presente

O fallback legado `else if (window._sbShared)` foi mantido em dois pontos de `leads.js` para garantir funcionamento caso `TagsRepository` não seja carregado. Uma vez que o HTML for atualizado e `tags.repository.js` confirmado em produção, os fallbacks podem ser removidos.

---

## Riscos identificados

### Alto
- **Duplicação de implementação (api.js + novos arquivos):** Se a ordem de carregamento no HTML não for correta, os globals podem ficar com a versão de `api.js` em vez da extraída. Mitigação: registrar os scripts APÓS api.js.

### Médio
- **`_apptFinishProducts` em api.js vs `_finishProducts` em agenda-finalize.js:** São variáveis separadas. Se código externo usar `window._apptFinishProducts()` para ler/setar o estado, não refletirá no estado de `agenda-finalize.js`. Mitigação: nenhum código externo usa esse getter atualmente; é exclusivo para bridge.
- **`AnamnesisRepository` em agenda-mensagens.js:** Se o arquivo de repositório não for carregado antes de agenda-mensagens.js, as operações de sync silenciosamente não executam (guard `if (!window.AnamnesisRepository)`). Comportamento idêntico ao anterior com `window._sbShared`, portanto não regride.

### Baixo
- **TagsRepository sem RPC:** Os métodos usam `.from()` direto (queries Supabase). Se a clínica tiver RLS habilitada nessas tabelas sem políticas para o role anon, as queries podem retornar vazio. O comportamento original já tinha o mesmo risco, portanto não é regressão.

---

## Próximos passos recomendados

1. **Imediato:** Adicionar os novos `<script>` ao HTML na ordem correta (repositórios antes dos módulos, módulos após api.js).

2. **Curto prazo:** Remover implementações duplicadas de `api.js` para as funções já extraídas. Manter apenas os exports `window.X = X` como delegações.

3. **Médio prazo:** Refatorar `tasks.js` e `users-admin.js` para usar `TasksRepository` e `UsersRepository`.

4. **Médio prazo:** Remover os fallbacks `else if (window._sbShared)` de `leads.js` após confirmar que `TagsRepository` está sempre disponível em produção.

5. **Longo prazo:** Avaliar se `api.js` pode ser dividido em módulos menores (`agenda-core.js`, `agenda-drag.js`, `procedures.js`) seguindo o mesmo padrão de extração aplicado nesta iteração.
