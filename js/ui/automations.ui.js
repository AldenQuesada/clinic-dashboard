/**
 * ClinicAI — Automations UI (Sprint 9)
 *
 * Tela Settings > Automação para gerenciar regras de automação.
 * Renderiza na div #automations-root da page-settings-automation.
 *
 * Funcionalidades:
 *   - Listar regras com toggle ativo/inativo (otimista)
 *   - Criar nova regra via modal com builder visual
 *   - Editar regra existente
 *   - Excluir regra (dupla confirmação)
 *   - Builder de condições e ações declarativo
 *
 * Depende de:
 *   window.RulesService  (rules.service.js)
 */

;(function () {
  'use strict'

  if (window._clinicaiAutomationsUILoaded) return
  window._clinicaiAutomationsUILoaded = true

  // ── Constantes / lookup tables ──────────────────────────────

  const TRIGGER_EVENTS = [
    { value: 'phase_changed',        label: 'Mudança de Fase' },
    { value: 'tag_added',            label: 'Tag Adicionada' },
    { value: 'tag_removed',          label: 'Tag Removida' },
    { value: 'appointment_created',  label: 'Agendamento Criado' },
    { value: 'appointment_attended', label: 'Consulta Realizada' },
    { value: 'budget_created',       label: 'Orçamento Criado' },
    { value: 'manual',               label: 'Manual' },
  ]

  const COND_FIELDS = [
    { value: 'event.to_phase',  label: 'Fase destino (evento)' },
    { value: 'event.tag_slug',  label: 'Slug da tag (evento)' },
    { value: 'phase',           label: 'Fase atual do lead' },
    { value: 'temperature',     label: 'Temperatura do lead' },
    { value: 'tag',             label: 'Lead possui tag (slug)' },
  ]

  const COND_OPS_DEFAULT = [
    { value: 'eq',  label: 'igual a' },
    { value: 'neq', label: 'diferente de' },
    { value: 'in',  label: 'um de (vírgulas)' },
  ]
  const COND_OPS_TAG = [
    { value: 'exists',     label: 'existe' },
    { value: 'not_exists', label: 'não existe' },
  ]

  const PHASE_VALUES   = ['lead', 'agendado', 'reagendado', 'compareceu', 'paciente', 'orcamento', 'perdido']
  const TEMP_VALUES    = [
    { value: 'cold', label: 'Frio' },
    { value: 'warm', label: 'Morno' },
    { value: 'hot',  label: 'Quente' },
  ]

  const ACTION_TYPES = [
    { value: 'add_tag',         label: 'Adicionar Tag' },
    { value: 'remove_tag',      label: 'Remover Tag' },
    { value: 'change_phase',    label: 'Mudar Fase' },
    { value: 'create_task',     label: 'Criar Tarefa' },
    { value: 'set_temperature', label: 'Definir Temperatura' },
    { value: 'add_interaction', label: 'Registrar Interação' },
  ]

  const TASK_TYPES = [
    { value: 'follow_up', label: 'Follow-up' },
    { value: 'reminder',  label: 'Lembrete' },
    { value: 'call',      label: 'Ligação' },
    { value: 'alert',     label: 'Alerta' },
  ]

  // ── Tab ativa ───────────────────────────────────────────────
  let _activeTab = 'rules' // 'rules' | 'whatsapp' | 'inbox' | 'flows' | 'broadcasts'

  // ── Estado ──────────────────────────────────────────────────

  let _rules      = []
  let _loading    = false
  let _initialized = false

  // Broadcast state
  let _broadcasts        = []
  let _broadcastLoading  = false
  let _broadcastSaving   = false
  let _broadcastSelected = null  // id do broadcast selecionado para ver detalhes
  let _broadcastMode     = 'new' // 'new' | 'detail'
  let _broadcastForm     = _emptyBroadcastForm()

  function _emptyBroadcastForm() {
    return {
      name: '',
      content: '',
      media_url: '',
      media_caption: '',
      media_position: 'above',
      filter_phase: '',
      filter_temperature: '',
      filter_funnel: '',
      filter_source: '',
      batch_size: 10,
      batch_interval_min: 10,
      selected_leads: [],  // {id, nome, phone}
    }
  }

  // Modal state
  let _modalOpen  = false
  let _editId     = null
  let _saving     = false
  let _deleting   = null  // id em processo de exclusão
  let _form = _emptyForm()

  function _emptyForm() {
    return {
      name:           '',
      description:    '',
      trigger_event:  'phase_changed',
      is_active:      false,
      priority:       50,
      cooldown_hours: '',
      max_executions: '',
      conditions:     [],
      actions:        [],
    }
  }

  // ── Root ─────────────────────────────────────────────────────

  function _root() { return document.getElementById('automations-root') }

  // ── Init (chamado pelo sidebar ao navegar para a página) ─────

  async function init() {
    if (_loading) return
    _loading = true
    _render()
    await _fetchRules()
    _loading = false
    _render()
    _initialized = true
  }

  // ── Fetch ────────────────────────────────────────────────────

  async function _fetchRules() {
    if (!window.RulesService) return
    const result = await window.RulesService.getRules()
    if (result.ok) {
      _rules = result.data || []
    } else {
      console.warn('[AutomationsUI] getRules:', result.error)
    }
  }

  // ── Helpers ──────────────────────────────────────────────────

  function _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  }

  function _eventLabel(ev) {
    return TRIGGER_EVENTS.find(e => e.value === ev)?.label || ev || '—'
  }

  function _eventColor(ev) {
    const colors = {
      phase_changed:        '#7C3AED',
      tag_added:            '#2563EB',
      tag_removed:          '#DC2626',
      appointment_created:  '#059669',
      appointment_attended: '#0891B2',
      budget_created:       '#D97706',
      manual:               '#6B7280',
    }
    return colors[ev] || '#6B7280'
  }

  function _timeAgo(iso) {
    if (!iso) return 'nunca'
    const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000)
    if (m < 1)  return 'agora'
    if (m < 60) return `há ${m}min`
    const h = Math.floor(m / 60)
    if (h < 24) return `há ${h}h`
    return `há ${Math.floor(h / 24)}d`
  }

  function _feather(name, size = 14) {
    return `<svg width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24">${_featherPath(name)}</svg>`
  }

  function _featherPath(name) {
    const paths = {
      plus:           '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
      edit2:          '<path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z"/>',
      trash2:         '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/>',
      zap:            '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>',
      alertCircle:    '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
      refreshCw:      '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
      x:              '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
      chevronDown:    '<polyline points="6 9 12 15 18 9"/>',
      check:          '<polyline points="20 6 9 17 4 12"/>',
      messageCircle:  '<path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/>',
      clock:          '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
      dollarSign:     '<line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/>',
      shield:         '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
      lock:           '<rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>',
      image:          '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>',
      userCheck:      '<path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><polyline points="17 11 19 13 23 9"/>',
      tag:            '<path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/>',
      settings:       '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
      inbox:          '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
      layout:         '<rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/>',
    }
    return paths[name] || ''
  }

  // ── Render tab Central de Atendimento ────────────────────────

  function _renderInboxTab() {
    const sections = [
      {
        title: 'Visao Geral — Layout',
        icon: 'layout',
        color: '#2563EB',
        description: 'Estrutura visual da Central de Atendimento da secretaria',
        rules: [
          { name: 'Cartoes de resumo (topo)', desc: '4 cards: Urgentes, Aguardando, Lara Ativa, Resolvidos + botao Atualizar', status: 'active', type: 'flow' },
          { name: 'Lista de conversas (esquerda)', desc: 'Conversas ativas ordenadas por prioridade. Bolinha colorida + nome + preview + timer', status: 'active', type: 'flow' },
          { name: 'Conversa aberta (direita)', desc: 'Historico estilo WhatsApp com baloes. Msgs da Lara identificadas. Campo para digitar', status: 'active', type: 'flow' },
          { name: 'Botoes grandes e claros', desc: 'ASSUMIR (amarelo), DEVOLVER PARA LARA (verde), RESOLVER, ARQUIVAR', status: 'active', type: 'flow' },
        ]
      },
      {
        title: 'Alertas e Notificacoes',
        icon: 'alertCircle',
        color: '#DC2626',
        description: 'Sistema de alertas visuais e sonoros para a secretaria',
        rules: [
          { name: 'Card URGENTE pisca vermelho', desc: 'Emergencias, reclamacoes e pedidos de humano — pisca ate resolver', status: 'active', type: 'shield' },
          { name: 'Som de alerta para msgs urgentes', desc: 'Web Audio API: bipe duplo (800Hz+1000Hz) quando urgentes aumentam', status: 'active', type: 'shield' },
          { name: 'Badge de tags automaticas', desc: 'QUER AGENDAR, PERGUNTOU PRECO, URGENTE, LARA/VOCE — visiveis na lista', status: 'active', type: 'flow' },
          { name: 'Notificacao no titulo da aba', desc: '(N) Central de Atendimento — conta urgentes + aguardando', status: 'active', type: 'flow' },
        ]
      },
      {
        title: 'Acoes da Secretaria',
        icon: 'userCheck',
        color: '#059669',
        description: 'O que a secretaria pode fazer na Central de Atendimento',
        rules: [
          { name: 'Assumir conversa', desc: 'Botao no inbox + resposta pelo celular/iMac pausa a Lara automaticamente', status: 'active', type: 'flow' },
          { name: 'Devolver para Lara', desc: 'Botao reativa a IA. Reativacao automatica em 2min se secretaria nao responde', status: 'active', type: 'flow' },
          { name: 'Enviar mensagem manual', desc: 'Campo de texto envia via WhatsApp. Msgs identificadas como "Voce"', status: 'active', type: 'flow' },
          { name: 'Resolver conversa', desc: 'Status closed, sai da lista. Reabre auto se paciente mandar nova msg', status: 'active', type: 'flow' },
          { name: 'Arquivar conversa', desc: 'Status archived, sai da lista. Reabre auto se paciente mandar nova msg', status: 'active', type: 'flow' },
          { name: 'Reabrir automatico', desc: 'Conversa closed/archived reabre quando paciente manda nova mensagem', status: 'active', type: 'flow' },
          { name: 'Transferir para Dra. Mirian', desc: 'Botao azul no chat. Pausa IA + envia msg ao paciente informando transferencia', status: 'active', type: 'flow' },
        ]
      },
      {
        title: 'Filtros e Ordenacao',
        icon: 'settings',
        color: '#6B7280',
        description: 'Como as conversas sao organizadas para facilitar o trabalho',
        rules: [
          { name: 'Urgentes sempre primeiro', desc: 'RPC ordena por is_urgent DESC, last_message_at DESC', status: 'active', type: 'flow' },
          { name: 'Depois por tempo', desc: 'Quem mandou msg ha mais tempo aparece antes', status: 'active', type: 'flow' },
          { name: 'Filtro por status', desc: 'Botoes: Todas, Urgentes, Aguardando, Lara Ativa', status: 'active', type: 'flow' },
          { name: 'Busca por nome/telefone', desc: 'Campo de busca com debounce no topo da lista', status: 'active', type: 'flow' },
        ]
      },
      {
        title: 'Arquitetura Tecnica',
        icon: 'lock',
        color: '#7C3AED',
        description: 'Estrutura de arquivos e modulos do sistema',
        rules: [
          { name: 'inbox.ui.js', desc: 'Renderizacao completa — cards, lista, chat, eventos, auto-refresh 10s', status: 'active', type: 'rule' },
          { name: 'inbox.service.js', desc: 'Logica de negocio + envio via Evolution API', status: 'active', type: 'rule' },
          { name: 'inbox.repository.js', desc: 'Chamadas Supabase — 8 RPCs (list, conversation, assume, release, send, resolve, archive, reopen)', status: 'active', type: 'rule' },
          { name: 'inbox.css', desc: 'Estilos dedicados — cards, chat bubbles, alertas, botoes grandes, responsivo', status: 'active', type: 'rule' },
          { name: 'RPCs Supabase', desc: 'wa_inbox_list, wa_inbox_conversation, wa_inbox_assume, wa_inbox_release, wa_inbox_send, wa_inbox_resolve, wa_inbox_archive, wa_inbox_reopen', status: 'active', type: 'rule' },
          { name: 'Realtime (Supabase)', desc: 'Subscription postgres_changes em wa_messages — inbox atualiza instantaneamente', status: 'active', type: 'rule' },
          { name: 'Outbox Processor', desc: 'Workflow n8n separado, cron 2min, processa fila de envio para cadencias', status: 'active', type: 'rule' },
        ]
      },
    ]

    // reuse the same rendering pattern from _renderWhatsAppTab
    const statusIcon = function(s) {
      if (s === 'active') return '<span class="am-status am-status-active" title="Ativo">&#10003;</span>'
      return '<span class="am-status am-status-pending" title="Pendente">&#9675;</span>'
    }

    const typeIcon = function(t) {
      const map = { shield: 'shield', flow: 'refreshCw', rule: 'lock', tag: 'zap' }
      return _feather(map[t] || 'zap', 12)
    }

    let html = '<div class="am-wa-sections">'

    for (const section of sections) {
      const activeCount = section.rules.filter(function(r) { return r.status === 'active' }).length
      const totalCount = section.rules.length

      html += `
      <div class="am-wa-section">
        <div class="am-wa-section-header">
          <div class="am-wa-section-icon" style="background:${section.color}15;color:${section.color}">
            ${_feather(section.icon, 18)}
          </div>
          <div class="am-wa-section-info">
            <div class="am-wa-section-title">${section.title}</div>
            <div class="am-wa-section-desc">${section.description}</div>
          </div>
          <div class="am-wa-section-count">
            <span class="am-wa-count-badge" style="background:${activeCount === totalCount ? '#05966915' : '#D9770615'};color:${activeCount === totalCount ? '#059669' : '#D97706'}">
              ${activeCount}/${totalCount}
            </span>
          </div>
        </div>
        <div class="am-wa-rules">
          ${section.rules.map(function(r) {
            return `
            <div class="am-wa-rule ${r.status === 'active' ? 'am-wa-rule-active' : 'am-wa-rule-pending'}">
              <div class="am-wa-rule-status">${statusIcon(r.status)}</div>
              <div class="am-wa-rule-type">${typeIcon(r.type)}</div>
              <div class="am-wa-rule-info">
                <div class="am-wa-rule-name">${r.name}</div>
                <div class="am-wa-rule-desc">${r.desc}</div>
              </div>
            </div>`
          }).join('')}
        </div>
      </div>`
    }

    html += '</div>'

    const legend = `
      <div class="am-wa-legend">
        <span class="am-wa-legend-item">
          <span class="am-status am-status-active">&#10003;</span> Implementado e ativo
        </span>
        <span class="am-wa-legend-item">
          <span class="am-status am-status-pending">&#9675;</span> Planejado
        </span>
      </div>`

    return `<div class="am-tab-content">${legend}${html}</div>`
  }

  // ── Render tab Regras CRM ────────────────────────────────────

  function _renderRulesTab() {
    return `
      <div class="am-tab-content">
        <div class="am-header-right" style="margin-bottom:16px;text-align:right">
          <button class="am-btn-primary" id="amNewRuleBtn">
            ${_feather('plus', 15)} Nova Regra
          </button>
        </div>
        ${_rules.length === 0 ? _renderEmpty() : _renderList()}
      </div>`
  }

  // ── Render tab WhatsApp & Lara ──────────────────────────────

  function _renderWhatsAppTab() {
    const sections = [
      {
        title: 'Horario Comercial e Transicao Secretaria',
        icon: 'clock',
        color: '#2563EB',
        description: 'Controle inteligente de quando a IA responde vs secretaria',
        rules: [
          { name: 'IA ativa 24h — resposta imediata', desc: 'Lara responde na hora a qualquer mensagem. Guards verificam antes de chamar Claude', status: 'active', type: 'flow' },
          { name: 'Horario comercial: secretaria tem prioridade', desc: 'Secretaria pode assumir via inbox ou celular. Reativacao automatica em 2min', status: 'active', type: 'flow' },
          { name: 'Reativacao automatica em 2 minutos', desc: 'pg_cron verifica a cada 1 min: se paciente mandou msg e secretaria nao respondeu em 2 min, Lara reativa e responde', status: 'active', type: 'flow' },
          { name: 'Resposta imediata sem espera', desc: 'Lara responde imediatamente. Guard system verifica ai_enabled antes de chamar Claude', status: 'active', type: 'flow' },
          { name: 'Secretaria assume conversa', desc: 'Botao "Assumir" no inbox ou resposta pelo celular pausa a IA automaticamente', status: 'active', type: 'flow' },
          { name: 'Devolver para Lara', desc: 'Botao "Devolver" reativa a IA na conversa', status: 'active', type: 'flow' },
          { name: 'Fora do horario: Lara 100%', desc: 'Lara responde 24h. Cadencia so dispara 8h-20h (horario Brasilia)', status: 'active', type: 'flow' },
        ]
      },
      {
        title: 'Economia de Creditos',
        icon: 'dollarSign',
        color: '#059669',
        description: 'Regras para minimizar chamadas desnecessarias a API Claude',
        rules: [
          { name: 'Verificar ai_enabled antes de chamar Claude', desc: 'Guard Check RPC verifica ai_enabled. Se false, so loga inbound sem gastar credito', status: 'active', type: 'shield' },
          { name: 'Debounce 5 segundos', desc: 'Guard verifica se outra msg inbound chegou nos ultimos 5s — se sim, bloqueia (a ultima processa)', status: 'active', type: 'shield' },
          { name: 'Outbox Processor', desc: 'Workflow n8n separado, cron 2min, envia msgs de cadencia via Evolution API', status: 'active', type: 'shield' },
          { name: 'Limite 30 msgs/dia por conversa', desc: 'Guard Check conta msgs AI do dia. Apos 15, pausa IA automaticamente', status: 'active', type: 'shield' },
          { name: 'Ignorar msgs de grupo', desc: 'Parse Message filtra @g.us e @broadcast — zero processamento', status: 'active', type: 'shield' },
          { name: 'Ignorar status/broadcast', desc: 'Eventos != messages.upsert/send.message sao ignorados', status: 'active', type: 'shield' },
          { name: 'Truncar mensagens longas', desc: 'Msgs > 2000 chars truncadas no Parse Message — economia de tokens', status: 'active', type: 'shield' },
        ]
      },
      {
        title: 'Protecoes de Seguranca',
        icon: 'shield',
        color: '#DC2626',
        description: 'Blindagens contra cenarios criticos',
        rules: [
          { name: 'Emergencia medica', desc: 'Guard detecta regex (urgente, sangramento, dor forte, alergia, infeccao) → tag emergencia + Lara responde com orientacao', status: 'active', type: 'shield' },
          { name: 'Reclamacao/insatisfacao', desc: 'Guard detecta (reclamar, procon, processo, advogado) → tag precisa_humano + pausa IA', status: 'active', type: 'shield' },
          { name: 'Pedido explicito de humano', desc: 'Guard detecta (falar com alguem, me passa pra doutora, voce e robo) → pausa IA + tag precisa_humano', status: 'active', type: 'shield' },
          { name: 'Conteudo inapropriado', desc: 'Guard detecta palavroes/ofensas → pausa IA silenciosamente', status: 'active', type: 'shield' },
          { name: 'Concorrente pescando info', desc: 'No prompt: perguntas tecnicas detalhadas → "a Dra. explica na avaliacao"', status: 'active', type: 'shield' },
          { name: 'Spam/mensagem repetida', desc: 'Guard verifica 2 ultimas msgs inbound — se 3x iguais, bloqueia', status: 'active', type: 'shield' },
          { name: 'Mensagens muito longas', desc: 'Parse Message trunca em 2000 chars antes de enviar ao Claude', status: 'active', type: 'shield' },
        ]
      },
      {
        title: 'Limites da Lara (Regras Duras)',
        icon: 'lock',
        color: '#7C3AED',
        description: 'Comportamentos que a IA NUNCA pode ter',
        rules: [
          { name: 'Nunca confirmar agendamento real', desc: '"Vou verificar com a equipe" → tag pronto_agendar', status: 'active', type: 'rule' },
          { name: 'Nunca cancelar procedimento', desc: 'Encaminha para secretaria automaticamente', status: 'active', type: 'rule' },
          { name: 'Nunca dar diagnostico', desc: '"A Dra. Mirian vai avaliar pessoalmente"', status: 'active', type: 'rule' },
          { name: 'Nunca falar preco exato', desc: 'So faixas de preco, somente apos qualificacao', status: 'active', type: 'rule' },
          { name: 'LGPD — nunca compartilhar dados', desc: 'Dados de outros pacientes nunca sao mencionados', status: 'active', type: 'rule' },
          { name: 'Nunca responder sobre outras clinicas', desc: '"Nao tenho essa informacao"', status: 'active', type: 'rule' },
          { name: 'PIX automatico contextual', desc: 'Envia CNPJ copiavel. Sem contexto: pergunta sobre o que e o pagamento. Com contexto: confirma procedimento. Sempre pede comprovante', status: 'active', type: 'rule' },
        ]
      },
      {
        title: 'Processamento de Midia',
        icon: 'image',
        color: '#0891B2',
        description: 'Como a Lara trata diferentes tipos de mensagem',
        rules: [
          { name: 'Imagem → Claude Vision', desc: 'Analisa a foto, descreve o que ve, sugere avaliacao', status: 'active', type: 'flow' },
          { name: 'Audio → Pedir texto', desc: 'Responde educadamente pedindo para enviar como texto', status: 'active', type: 'flow' },
          { name: 'Video/Documento/Sticker → Descricao', desc: 'Trata como texto descritivo e responde adequadamente', status: 'active', type: 'flow' },
        ]
      },
      {
        title: 'Reconhecimento de Paciente',
        icon: 'userCheck',
        color: '#D97706',
        description: 'Como a Lara identifica e diferencia pacientes',
        rules: [
          { name: 'Lead cadastrado (quiz)', desc: 'Busca por telefone → carrega nome, queixas, fase, historico', status: 'active', type: 'flow' },
          { name: 'Paciente retornando', desc: 'Detecta is_returning → nao repete boas-vindas, retoma contexto', status: 'active', type: 'flow' },
          { name: 'Numero desconhecido', desc: 'Pergunta nome gentilmente, cria lead automaticamente', status: 'active', type: 'flow' },
          { name: 'Deteccao automatica de nome', desc: '"Meu nome e X", "sou a X" → salva no lead', status: 'active', type: 'flow' },
          { name: 'Auto-deteccao de persona', desc: 'Fase do lead define persona: onboarder, sdr, closer, etc.', status: 'active', type: 'flow' },
          { name: 'Deteccao de funil', desc: 'Primeira msg detecta Full Face (protocolo, Lifting 5D) ou Procedimentos (olheiras, botox). Lara adapta abordagem', status: 'active', type: 'flow' },
        ]
      },
      {
        title: 'Deteccao de Tags',
        icon: 'tag',
        color: '#6B7280',
        description: 'Tags aplicadas automaticamente pela IA durante a conversa',
        rules: [
          { name: 'pronto_agendar', desc: 'Quando lead pede horario ou quer agendar', status: 'active', type: 'tag' },
          { name: 'precisa_humano', desc: 'Quando IA nao consegue resolver ou detecta reclamacao', status: 'active', type: 'tag' },
          { name: 'perguntou_preco', desc: 'Quando lead pergunta "quanto custa", "valor", "preco"', status: 'active', type: 'tag' },
          { name: 'objecao_preco', desc: 'Quando lead diz "caro", "nao tenho"', status: 'active', type: 'tag' },
          { name: 'emergencia', desc: 'Guard detecta urgencia medica via regex', status: 'active', type: 'tag' },
          { name: 'qualificado', desc: 'Lead demonstrou interesse real no procedimento', status: 'active', type: 'tag' },
          { name: 'fullface', desc: 'Lead do funil Full Face (Lifting 5D)', status: 'active', type: 'tag' },
          { name: 'procedimentos', desc: 'Lead do funil Procedimentos Isolados', status: 'active', type: 'tag' },
        ]
      },
      {
        title: 'Playbook Full Face (SPIN)',
        icon: 'zap',
        color: '#7C3AED',
        description: 'Fluxo SPIN completo para funil Full Face - Protocolo Lifting 5D + Fotona 4D',
        rules: [
          { name: 'Fase 0 — Entrada', desc: 'Boas-vindas, pedir nome. Gatilho: msg com "protocolo", "Lifting 5D", "formulario"', status: 'active', type: 'flow' },
          { name: 'Fase 1 — Situation + Foto', desc: 'Enviar foto antes/depois geral + perguntar queixa principal + listar dores comuns', status: 'active', type: 'flow' },
          { name: 'Fase 2 — Problem + Foto', desc: 'Aprofundar dores + enviar foto especifica da queixa + "um resultado assim e o que procura?"', status: 'active', type: 'flow' },
          { name: 'Fase 3 — Implication + Foto', desc: 'Perda colageno 1-2%/ano, quanto antes melhor + enviar mais foto + reconciliar espelho', status: 'active', type: 'flow' },
          { name: 'Fase 4 — Need-Payoff + Cashback', desc: 'Protocolo Lifting 5D + Fotona 4D + cashback integral + converter para consulta', status: 'active', type: 'flow' },
          { name: 'Fase 5 — Agendamento', desc: 'Pedir nome completo + disponibilidade. Consulta paga, descontada se fechar', status: 'active', type: 'flow' },
          { name: 'Fase 6 — Objecao preco', desc: '5 tecnicas: isolar, ROI, bifurcacao, filtro elegante, corte estrategico', status: 'active', type: 'flow' },
          { name: 'Fase 7 — Objecao experiencia', desc: 'Validar dor, metafora relacionamento, quebrar generalizacao, diagnostico real', status: 'active', type: 'flow' },
        ]
      },
      {
        title: 'Cadencia Automatica',
        icon: 'clock',
        color: '#0891B2',
        description: 'Follow-ups automaticos para leads que nao responderam (pg_cron cada 30min)',
        rules: [
          { name: 'Nudge 30 min', desc: 'Toque suave apos 30min sem resposta: "Ficou alguma duvida?"', status: 'active', type: 'flow' },
          { name: 'Dia 1 — Historia Sandra + Foto', desc: 'Abre: "o que acontece quando decide parar de adiar?" Sandra 51 anos, marido surtou de alegria. Fecha: "quantos anos rejuvenesceu?"', status: 'active', type: 'flow' },
          { name: 'Dia 2 — Historia Cinthia + Foto', desc: 'Abre: "gasto ou investimento?" Cinthia 55 anos, orcamento apertado. Fecha: "se fosse mais acessivel, mudaria?"', status: 'active', type: 'flow' },
          { name: 'Dia 3 — Historia Gedina + Foto', desc: 'Abre: "medo de artificial?" Gedina 57 anos, inimiga dos exageros. Fecha: "e esse resultado natural?"', status: 'active', type: 'flow' },
          { name: 'Dia 4 — Empilhamento valor consulta', desc: '"Ainda e prioridade?" + Anovator A5, 50+ relatorios, creme exossomos gratis. Fecha: "e prioridade pra voce?"', status: 'active', type: 'flow' },
          { name: 'Dia 5 — Escassez + Cashback', desc: 'Agenda concorrida + cashback Fotona. Fecha: "posso procurar horario?"', status: 'active', type: 'flow' },
          { name: 'Dia 7 — Puxao amigavel', desc: '"Desistiu ou correria te engoliu?" Fecha: "damos o proximo passo juntas?"', status: 'active', type: 'flow' },
          { name: 'Dia 9 — Porta aberta', desc: '"Retomo depois ou encerramos?" + espelho reconhecer + pele ainda responde', status: 'active', type: 'flow' },
          { name: 'Dia 12 — Encerramento', desc: '"Vou pausar. Voce nos procurou porque algo pediu atencao." Porta aberta', status: 'active', type: 'flow' },
          { name: 'Proc Dia 1-5 — Isolados', desc: '4 steps focados na queixa especifica (olheiras: balde furado + Smooth Eyes)', status: 'active', type: 'flow' },
          { name: 'Playbook Olheiras SPIN', desc: 'Smooth Eyes + AH, metafora balde furado, anti-cirurgia, persona Fernanda 45+', status: 'active', type: 'flow' },
          { name: 'Horario 8h-20h apenas', desc: 'Cadencia so dispara em horario comercial (fuso Brasilia)', status: 'active', type: 'flow' },
          { name: 'Para se lead responder', desc: 'Cadencia reseta quando lead manda msg — Lara retoma conversa normal', status: 'active', type: 'flow' },
        ]
      },
      {
        title: 'Banco de Imagens',
        icon: 'image',
        color: '#D97706',
        description: '9 fotos antes/depois no Supabase Storage, categorizadas por queixa e fase',
        rules: [
          { name: 'Fotos armazenadas no Supabase', desc: '9 imagens antes/depois em alta resolucao, URLs publicas', status: 'active', type: 'flow' },
          { name: 'Categorizadas por queixa', desc: 'olheiras, sulcos, flacidez, contorno, papada, textura, rugas, rejuvenescimento', status: 'active', type: 'flow' },
          { name: 'Envio via Evolution API', desc: 'Lara envia imagem direto no WhatsApp (sendMedia), nao link', status: 'active', type: 'flow' },
          { name: 'Tag [FOTO:queixa] no prompt', desc: 'Claude indica quando enviar foto, sistema busca e envia automaticamente', status: 'active', type: 'flow' },
        ]
      },
    ]

    const statusIcon = function(s) {
      if (s === 'active') return '<span class="am-status am-status-active" title="Ativo">&#10003;</span>'
      return '<span class="am-status am-status-pending" title="Pendente">&#9675;</span>'
    }

    const typeIcon = function(t) {
      const map = { shield: 'shield', flow: 'refreshCw', rule: 'lock', tag: 'zap' }
      return _feather(map[t] || 'zap', 12)
    }

    let html = '<div class="am-wa-sections">'

    for (const section of sections) {
      const activeCount = section.rules.filter(function(r) { return r.status === 'active' }).length
      const totalCount = section.rules.length

      html += `
      <div class="am-wa-section">
        <div class="am-wa-section-header">
          <div class="am-wa-section-icon" style="background:${section.color}15;color:${section.color}">
            ${_feather(section.icon, 18)}
          </div>
          <div class="am-wa-section-info">
            <div class="am-wa-section-title">${section.title}</div>
            <div class="am-wa-section-desc">${section.description}</div>
          </div>
          <div class="am-wa-section-count">
            <span class="am-wa-count-badge" style="background:${activeCount === totalCount ? '#05966915' : '#D9770615'};color:${activeCount === totalCount ? '#059669' : '#D97706'}">
              ${activeCount}/${totalCount}
            </span>
          </div>
        </div>
        <div class="am-wa-rules">
          ${section.rules.map(function(r) {
            return `
            <div class="am-wa-rule ${r.status === 'active' ? 'am-wa-rule-active' : 'am-wa-rule-pending'}">
              <div class="am-wa-rule-status">${statusIcon(r.status)}</div>
              <div class="am-wa-rule-type">${typeIcon(r.type)}</div>
              <div class="am-wa-rule-info">
                <div class="am-wa-rule-name">${r.name}</div>
                <div class="am-wa-rule-desc">${r.desc}</div>
              </div>
            </div>`
          }).join('')}
        </div>
      </div>`
    }

    html += '</div>'

    const legend = `
      <div class="am-wa-legend">
        <span class="am-wa-legend-item">
          <span class="am-status am-status-active">&#10003;</span> Implementado e ativo no sistema
        </span>
        <span class="am-wa-legend-item">
          <span class="am-status am-status-pending">&#9675;</span> Planejado — sera implementado
        </span>
      </div>`

    return `<div class="am-tab-content">${legend}${html}</div>`
  }

  // ── Render tab Fluxos ────────────────────────────────────────

  function _renderFlowsTab() {
    const flows = [
      {
        title: 'Mensagem Recebida (Pipeline Principal)',
        color: '#2563EB',
        steps: [
          { label: 'WhatsApp', icon: 'messageCircle', desc: 'Paciente envia mensagem' },
          { label: 'Evolution API', icon: 'zap', desc: 'Recebe e envia ao webhook' },
          { label: 'Parse Message', icon: 'settings', desc: 'Detecta tipo: texto, imagem, audio, secretary_reply' },
          { label: 'Route Message', icon: 'refreshCw', desc: 'Skip / Secretary / Normal' },
          { label: 'Guard Check', icon: 'shield', desc: 'ai_enabled, limite 15/dia, spam, emergencia, debounce' },
          { label: 'Claude API', icon: 'zap', desc: 'Lara gera resposta com contexto + historico' },
          { label: 'Send WhatsApp', icon: 'send', desc: 'Envia texto + fotos antes/depois' },
          { label: 'Log Supabase', icon: 'check', desc: 'Registra inbound + outbound + tags' },
        ]
      },
      {
        title: 'Secretaria Responde pelo Celular/iMac',
        color: '#059669',
        steps: [
          { label: 'WhatsApp', icon: 'messageCircle', desc: 'Secretaria envia msg do celular/iMac' },
          { label: 'Evolution API', icon: 'zap', desc: 'Evento send.message (source: android/web)' },
          { label: 'Parse Message', icon: 'settings', desc: 'Detecta fromMe + source != API' },
          { label: 'Route Message', icon: 'refreshCw', desc: 'Rota para Secretary' },
          { label: 'Log Secretary', icon: 'check', desc: 'Registra msg + pausa Lara (ai_enabled=false)' },
          { label: 'Auto-reativacao', icon: 'clock', desc: 'Se lead responde e secretaria nao em 2min → Lara volta' },
        ]
      },
      {
        title: 'Playbook Full Face (SPIN)',
        color: '#7C3AED',
        steps: [
          { label: 'Entrada', icon: 'messageCircle', desc: 'Lead manda msg com "protocolo", "Lifting 5D"' },
          { label: 'Situation', icon: 'user', desc: 'Pedir nome + enviar 2 fotos antes/depois' },
          { label: 'Problem', icon: 'alertCircle', desc: 'Aprofundar dores + foto especifica da queixa' },
          { label: 'Implication', icon: 'clock', desc: 'Colageno -1-2%/ano + urgencia suave + foto' },
          { label: 'Need-Payoff', icon: 'zap', desc: 'Lifting 5D + Fotona 4D + cashback integral' },
          { label: 'Agendamento', icon: 'check', desc: 'Consulta paga (descontada se fechar)' },
        ]
      },
      {
        title: 'Nudge + Cadencia (Lead parou de responder)',
        color: '#D97706',
        steps: [
          { label: 'Lead para', icon: 'clock', desc: 'Ultima msg foi da Lara, lead nao respondeu' },
          { label: '30 min', icon: 'alertCircle', desc: 'Toque suave: "Ficou alguma duvida?"' },
          { label: 'Dia 1 (10h)', icon: 'messageCircle', desc: 'Implicacao + foto antes/depois' },
          { label: 'Dia 2 (14h)', icon: 'messageCircle', desc: 'Reforco de valor + cashback' },
          { label: 'Dia 3 (10h)', icon: 'messageCircle', desc: 'Escassez elegante + agenda' },
          { label: 'Dia 5 (10h)', icon: 'messageCircle', desc: 'Puxao amigavel: "correria te engoliu?"' },
          { label: 'Dia 7 (10h)', icon: 'messageCircle', desc: 'Porta aberta: "retomo ou encerramos?"' },
          { label: 'Dia 10 (10h)', icon: 'messageCircle', desc: 'Encerramento: "vou pausar meu contato"' },
        ]
      },
      {
        title: 'Objecao de Preco',
        color: '#DC2626',
        steps: [
          { label: 'Lead: "ta caro"', icon: 'alertCircle', desc: 'Detecta objecao de preco' },
          { label: '1. Isolar', icon: 'settings', desc: '"Se investimento nao fosse impeditivo, teria algo mais?"' },
          { label: '2. ROI', icon: 'zap', desc: 'Redirecionar para resultado + cashback Fotona' },
          { label: '3. Bifurcacao', icon: 'refreshCw', desc: '"Solucao mais acessivel ou definitiva?"' },
          { label: '4. Filtro', icon: 'shield', desc: '"Se preco for criterio, talvez nao sejamos a melhor escolha"' },
          { label: '5. Corte', icon: 'lock', desc: '"Posso ajustar, mas teria que remover parte do protocolo"' },
        ]
      },
      {
        title: 'Guard System (7 Camadas)',
        color: '#6B7280',
        steps: [
          { label: 'G1: ai_enabled', icon: 'shield', desc: 'Secretaria assumiu? Bloqueia Claude' },
          { label: 'G1.5: Debounce', icon: 'clock', desc: 'Outra msg nos ultimos 5s? Espera' },
          { label: 'G2: Limite 15/dia', icon: 'lock', desc: 'Mais de 15 msgs IA hoje? Pausa' },
          { label: 'G3: Spam', icon: 'x', desc: 'Mesma msg 3x? Ignora' },
          { label: 'G4: Emergencia', icon: 'alertCircle', desc: 'Urgencia medica? Tag + orientacao' },
          { label: 'G5: Humano', icon: 'user', desc: '"Falar com alguem"? Pausa IA' },
          { label: 'G6: Inapropriado', icon: 'shield', desc: 'Ofensas? Pausa silenciosa' },
          { label: 'G7: Reclamacao', icon: 'alertCircle', desc: '"Procon", "processo"? Encaminha humano' },
        ]
      },
      {
        title: 'Envio de Fotos Antes/Depois',
        color: '#0891B2',
        steps: [
          { label: 'Lara inclui [FOTO:queixa]', icon: 'messageCircle', desc: 'Claude indica que deve enviar foto' },
          { label: 'Process Response', icon: 'settings', desc: 'Extrai tag, limpa do texto' },
          { label: 'Send Text', icon: 'send', desc: 'Envia texto limpo primeiro' },
          { label: 'Send Photo', icon: 'image', desc: 'Busca 2 fotos no banco (nao repete)' },
          { label: 'Pergunta final', icon: 'messageCircle', desc: '"Voce se imagina com esse resultado?"' },
        ]
      },
      {
        title: 'Playbook Olheiras (SPIN + Smooth Eyes)',
        color: '#DC2626',
        steps: [
          { label: 'Entrada', icon: 'messageCircle', desc: 'Lead: "quero corrigir olheiras/palpebras"' },
          { label: 'Situation + Foto', icon: 'image', desc: 'Nome + foto antes/depois + o que incomoda?' },
          { label: 'Problem + Balde Furado', icon: 'alertCircle', desc: '"De que adianta preencher se a palpebra esta flacida? E agua em balde furado"' },
          { label: 'Implication', icon: 'clock', desc: 'Pele mais fina do rosto, colageno cai rapido, sem Smooth Eyes = cirurgia' },
          { label: 'Need-Payoff', icon: 'zap', desc: 'Smooth Eyes (Fotona) + AH. Incluido no protocolo. Evita blefaroplastia' },
          { label: 'Agendamento', icon: 'check', desc: 'Consulta paga (descontada se fechar)' },
          { label: 'Objecao cirurgia', icon: 'shield', desc: '"Smooth Eyes existe pra voce NAO precisar de cirurgia"' },
        ]
      },
      {
        title: 'Modo Hibrido Secretaria/Lara',
        color: '#059669',
        steps: [
          { label: 'Secretaria responde', icon: 'user', desc: 'Pelo celular, iMac ou inbox' },
          { label: 'Lara pausa', icon: 'lock', desc: 'ai_enabled = false (zero resposta dupla)' },
          { label: 'Paciente responde', icon: 'messageCircle', desc: 'Nova msg inbound na conversa' },
          { label: '2 min sem resposta', icon: 'clock', desc: 'Secretaria nao respondeu' },
          { label: 'Lara reativa', icon: 'zap', desc: 'pg_cron detecta e reativa automaticamente' },
        ]
      },
    ]

    let html = '<div class="am-flows-grid">'

    for (const flow of flows) {
      html += '<div class="am-flow-card">'
      html += '<div class="am-flow-header" style="border-left:3px solid ' + flow.color + '">'
      html += '<div class="am-flow-title" style="color:' + flow.color + '">' + flow.title + '</div>'
      html += '</div>'
      html += '<div class="am-flow-steps">'

      for (let i = 0; i < flow.steps.length; i++) {
        const s = flow.steps[i]
        html += '<div class="am-flow-step">'
        html += '<div class="am-flow-step-icon" style="background:' + flow.color + '15;color:' + flow.color + '">' + _feather(s.icon, 14) + '</div>'
        html += '<div class="am-flow-step-info">'
        html += '<div class="am-flow-step-label">' + s.label + '</div>'
        html += '<div class="am-flow-step-desc">' + s.desc + '</div>'
        html += '</div>'
        html += '</div>'
        if (i < flow.steps.length - 1) {
          html += '<div class="am-flow-arrow" style="color:' + flow.color + '">&#8595;</div>'
        }
      }

      html += '</div></div>'
    }

    html += '</div>'
    return '<div class="am-tab-content">' + html + '</div>'
  }

  // ── Render principal ──────────────────────────────────────────

  function _render() {
    const root = _root()
    if (!root) return

    if (_loading) {
      root.innerHTML = `
        <div class="am-page">
          <div class="am-header">
            <div class="am-header-left">
              <h1 class="am-title">Automações</h1>
              <p class="am-subtitle">Regras que disparam ações automaticamente com base em eventos do CRM</p>
            </div>
          </div>
          <div class="am-loading">
            <div class="am-spinner"></div>
            <span>Carregando regras...</span>
          </div>
        </div>`
      return
    }

    root.innerHTML = `
      <div class="am-page">

        <div class="am-header">
          <div class="am-header-left">
            <h1 class="am-title">Automacoes</h1>
            <p class="am-subtitle">Regras, fluxos e blindagens do sistema</p>
          </div>
        </div>

        <div class="am-tabs">
          <button class="am-tab${_activeTab === 'rules' ? ' am-tab-active' : ''}" data-tab="rules">
            ${_feather('zap', 14)} Regras CRM
          </button>
          <button class="am-tab${_activeTab === 'whatsapp' ? ' am-tab-active' : ''}" data-tab="whatsapp">
            ${_feather('messageCircle', 14)} WhatsApp & Lara
          </button>
          <button class="am-tab${_activeTab === 'inbox' ? ' am-tab-active' : ''}" data-tab="inbox">
            ${_feather('inbox', 14)} Central de Atendimento
          </button>
          <button class="am-tab${_activeTab === 'flows' ? ' am-tab-active' : ''}" data-tab="flows">
            ${_feather('refreshCw', 14)} Fluxos
          </button>
          <button class="am-tab${_activeTab === 'broadcasts' ? ' am-tab-active' : ''}" data-tab="broadcasts">
            ${_feather('radio', 14)} Disparos
          </button>
        </div>

        ${_activeTab === 'rules' ? _renderRulesTab() : _activeTab === 'whatsapp' ? _renderWhatsAppTab() : _activeTab === 'inbox' ? _renderInboxTab() : _activeTab === 'broadcasts' ? _renderBroadcastTab() : _renderFlowsTab()}

      </div>

      ${_modalOpen ? _renderModal() : ''}
    `

    // Bind tab clicks
    root.querySelectorAll('.am-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _activeTab = btn.dataset.tab
        if (_activeTab === 'broadcasts' && _broadcasts.length === 0 && !_broadcastLoading) {
          _loadBroadcasts()
          return
        }
        _render()
      })
    })

    _bindListEvents(root)
    if (_modalOpen) _bindModalEvents(root)
    if (_activeTab === 'broadcasts') _bindBroadcastEvents(root)
  }

  // ── Empty state ───────────────────────────────────────────────

  function _renderEmpty() {
    return `
      <div class="am-empty">
        <div class="am-empty-icon">${_feather('zap', 36)}</div>
        <div class="am-empty-title">Nenhuma regra de automação</div>
        <div class="am-empty-sub">Crie regras para automatizar tarefas, alertas e mudanças de fase com base em eventos do CRM.</div>
        <button class="am-btn-primary" id="amEmptyNewBtn">
          ${_feather('plus', 15)} Criar primeira regra
        </button>
      </div>`
  }

  // ── Lista de regras ───────────────────────────────────────────

  function _renderList() {
    return `
      <div class="am-list">
        ${_rules.map(_renderRuleCard).join('')}
      </div>`
  }

  function _renderRuleCard(rule) {
    const isDeleting = _deleting === rule.id
    const color      = _eventColor(rule.trigger_event)
    const condCount  = Array.isArray(rule.conditions) ? rule.conditions.length : 0
    const actCount   = Array.isArray(rule.actions)    ? rule.actions.length    : 0

    return `
<div class="am-card${rule.is_active ? ' am-card-active' : ''}" data-rule-id="${_esc(rule.id)}">

  <div class="am-card-left">
    <label class="am-toggle" title="${rule.is_active ? 'Desativar' : 'Ativar'} regra">
      <input type="checkbox" class="am-toggle-input" data-action="toggle" data-id="${_esc(rule.id)}"
        ${rule.is_active ? 'checked' : ''}>
      <span class="am-toggle-track"></span>
    </label>
  </div>

  <div class="am-card-body">
    <div class="am-card-top">
      <span class="am-card-name">${_esc(rule.name)}</span>
      <span class="am-event-badge" style="background:${color}18;color:${color};border-color:${color}30">
        ${_feather('zap', 10)}
        ${_esc(_eventLabel(rule.trigger_event))}
      </span>
    </div>
    ${rule.description
      ? `<p class="am-card-desc">${_esc(rule.description)}</p>`
      : ''
    }
    <div class="am-card-meta">
      <span class="am-meta-item" title="Condições">
        ${_feather('settings', 12)}
        ${condCount} condição${condCount !== 1 ? 'ões' : ''}
      </span>
      <span class="am-meta-sep">·</span>
      <span class="am-meta-item" title="Ações">
        ${_feather('zap', 12)}
        ${actCount} ação${actCount !== 1 ? 'ões' : ''}
      </span>
      <span class="am-meta-sep">·</span>
      <span class="am-meta-item" title="Total de execuções">
        ${rule.run_count || 0} disparo${(rule.run_count || 0) !== 1 ? 's' : ''}
      </span>
      ${rule.last_run_at
        ? `<span class="am-meta-sep">·</span>
           <span class="am-meta-item am-meta-muted" title="Último disparo">
             ${_timeAgo(rule.last_run_at)}
           </span>`
        : ''
      }
      ${rule.cooldown_hours
        ? `<span class="am-meta-sep">·</span>
           <span class="am-meta-item am-meta-muted">Cooldown ${rule.cooldown_hours}h</span>`
        : ''
      }
    </div>
  </div>

  <div class="am-card-actions">
    ${isDeleting
      ? `<div class="am-delete-confirm">
           <span>Excluir?</span>
           <button class="am-btn-danger-sm" data-action="confirm-delete" data-id="${_esc(rule.id)}">Sim</button>
           <button class="am-btn-ghost-sm" data-action="cancel-delete">Não</button>
         </div>`
      : `<button class="am-icon-btn" data-action="edit" data-id="${_esc(rule.id)}" title="Editar">
           ${_feather('edit2', 14)}
         </button>
         <button class="am-icon-btn am-icon-btn-danger" data-action="delete" data-id="${_esc(rule.id)}" title="Excluir">
           ${_feather('trash2', 14)}
         </button>`
    }
  </div>

</div>`
  }

  // ── Modal ─────────────────────────────────────────────────────

  function _renderModal() {
    const isEdit = _editId !== null
    return `
<div class="am-modal-overlay" id="amModalOverlay">
  <div class="am-modal" id="amModal">

    <div class="am-modal-header">
      <div class="am-modal-title">
        ${_feather('zap', 16)}
        ${isEdit ? 'Editar Regra' : 'Nova Regra'}
      </div>
      <button class="am-modal-close" id="amModalClose">${_feather('x', 14)}</button>
    </div>

    <div class="am-modal-body" id="amModalBody">

      <!-- Nome e descrição -->
      <div class="am-field-row">
        <div class="am-field am-field-grow">
          <label class="am-label">Nome da Regra <span class="am-required">*</span></label>
          <input class="am-input" id="amFieldName" type="text" maxlength="120"
            placeholder="Ex: Lead quente → tarefa urgente"
            value="${_esc(_form.name)}">
        </div>
        <div class="am-field am-field-80">
          <label class="am-label">Prioridade</label>
          <input class="am-input" id="amFieldPriority" type="number" min="0" max="999"
            placeholder="50" value="${_esc(String(_form.priority ?? 50))}">
        </div>
      </div>

      <div class="am-field">
        <label class="am-label">Descrição</label>
        <input class="am-input" id="amFieldDesc" type="text" maxlength="280"
          placeholder="Opcional — o que essa regra faz?"
          value="${_esc(_form.description || '')}">
      </div>

      <!-- Evento gatilho -->
      <div class="am-field-row">
        <div class="am-field am-field-grow">
          <label class="am-label">Evento gatilho <span class="am-required">*</span></label>
          <select class="am-select" id="amFieldEvent">
            ${TRIGGER_EVENTS.map(e =>
              `<option value="${e.value}" ${_form.trigger_event === e.value ? 'selected' : ''}>${e.label}</option>`
            ).join('')}
          </select>
        </div>
        <div class="am-field am-field-80">
          <label class="am-label">Cooldown (h)</label>
          <input class="am-input" id="amFieldCooldown" type="number" min="0"
            placeholder="—" value="${_esc(String(_form.cooldown_hours ?? ''))}">
        </div>
        <div class="am-field am-field-80">
          <label class="am-label">Máx. disparos</label>
          <input class="am-input" id="amFieldMaxExec" type="number" min="0"
            placeholder="∞" value="${_esc(String(_form.max_executions ?? ''))}">
        </div>
      </div>

      <!-- Toggle ativo -->
      <div class="am-field-inline">
        <label class="am-toggle am-toggle-sm">
          <input type="checkbox" id="amFieldActive" ${_form.is_active ? 'checked' : ''}>
          <span class="am-toggle-track"></span>
        </label>
        <span class="am-label-inline">Regra ativa ao salvar</span>
      </div>

      <!-- Condições -->
      <div class="am-section">
        <div class="am-section-header">
          <span class="am-section-title">Condições</span>
          <span class="am-section-hint">Todas devem ser verdadeiras (AND) para a regra disparar</span>
        </div>
        <div id="amConditions">
          ${_renderConditions()}
        </div>
        <button class="am-add-row-btn" id="amAddCondBtn">
          ${_feather('plus', 12)} Adicionar condição
        </button>
      </div>

      <!-- Ações -->
      <div class="am-section">
        <div class="am-section-header">
          <span class="am-section-title">Ações <span class="am-required">*</span></span>
          <span class="am-section-hint">Executadas em sequência quando a regra dispara</span>
        </div>
        <div id="amActions">
          ${_renderActions()}
        </div>
        <button class="am-add-row-btn" id="amAddActionBtn">
          ${_feather('plus', 12)} Adicionar ação
        </button>
      </div>

    </div>

    <div class="am-modal-footer">
      <button class="am-btn-ghost" id="amModalCancel">Cancelar</button>
      <button class="am-btn-primary${_saving ? ' am-btn-loading' : ''}" id="amModalSave" ${_saving ? 'disabled' : ''}>
        ${_saving ? `<div class="am-spin-sm"></div> Salvando...` : `${_feather('check', 14)} Salvar Regra`}
      </button>
    </div>

  </div>
</div>`
  }

  // ── Builder de condições ──────────────────────────────────────

  function _renderConditions() {
    if (_form.conditions.length === 0) {
      return `<div class="am-row-empty">Nenhuma condição — a regra dispara para todos os eventos do tipo selecionado.</div>`
    }
    return _form.conditions.map((c, i) => _renderCondRow(c, i)).join('')
  }

  function _renderCondRow(c, i) {
    const field   = c.field || ''
    const op      = c.op    || 'eq'
    const isTag   = field === 'tag'
    const ops     = isTag ? COND_OPS_TAG : COND_OPS_DEFAULT

    // Value: dropdown para campos com valores conhecidos, input genérico para o resto
    let valueHtml = ''
    if (!isTag) {
      if (field === 'phase' || field === 'event.to_phase') {
        valueHtml = `<select class="am-select am-row-val" data-cond-idx="${i}" data-cond-key="value">
          <option value="">— escolha —</option>
          ${PHASE_VALUES.map(v => `<option value="${v}" ${c.value === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>`
      } else if (field === 'temperature') {
        valueHtml = `<select class="am-select am-row-val" data-cond-idx="${i}" data-cond-key="value">
          <option value="">— escolha —</option>
          ${TEMP_VALUES.map(v => `<option value="${v.value}" ${c.value === v.value ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>`
      } else {
        valueHtml = `<input class="am-input am-row-val" type="text" placeholder="valor"
          data-cond-idx="${i}" data-cond-key="value" value="${_esc(c.value || '')}">`
      }
    }

    return `
<div class="am-builder-row" data-cond-row="${i}">
  <select class="am-select am-row-field" data-cond-idx="${i}" data-cond-key="field">
    <option value="">— campo —</option>
    ${COND_FIELDS.map(f => `<option value="${f.value}" ${field === f.value ? 'selected' : ''}>${f.label}</option>`).join('')}
  </select>
  <select class="am-select am-row-op" data-cond-idx="${i}" data-cond-key="op">
    ${ops.map(o => `<option value="${o.value}" ${op === o.value ? 'selected' : ''}>${o.label}</option>`).join('')}
  </select>
  ${valueHtml}
  <button class="am-row-remove" data-remove-cond="${i}" title="Remover">${_feather('x', 12)}</button>
</div>`
  }

  // ── Builder de ações ──────────────────────────────────────────

  function _renderActions() {
    if (_form.actions.length === 0) {
      return `<div class="am-row-empty am-row-empty-warn">Adicione pelo menos uma ação.</div>`
    }
    return _form.actions.map((a, i) => _renderActionRow(a, i)).join('')
  }

  function _renderActionRow(a, i) {
    const type = a.type || ''

    let paramsHtml = ''

    if (type === 'add_tag' || type === 'remove_tag') {
      paramsHtml = `
        <input class="am-input am-row-val" type="text" placeholder="slug da tag (ex: lead.quente)"
          data-action-idx="${i}" data-action-key="tag_slug" value="${_esc(a.tag_slug || '')}">`
    } else if (type === 'change_phase') {
      paramsHtml = `
        <select class="am-select am-row-val" data-action-idx="${i}" data-action-key="phase">
          <option value="">— fase —</option>
          ${PHASE_VALUES.map(v => `<option value="${v}" ${a.phase === v ? 'selected' : ''}>${v}</option>`).join('')}
        </select>`
    } else if (type === 'set_temperature') {
      paramsHtml = `
        <select class="am-select am-row-val" data-action-idx="${i}" data-action-key="temperature">
          <option value="">— temperatura —</option>
          ${TEMP_VALUES.map(v => `<option value="${v.value}" ${a.temperature === v.value ? 'selected' : ''}>${v.label}</option>`).join('')}
        </select>`
    } else if (type === 'create_task') {
      paramsHtml = `
        <input class="am-input am-row-val-wide" type="text" placeholder="Título da tarefa"
          data-action-idx="${i}" data-action-key="title" value="${_esc(a.title || '')}">
        <select class="am-select am-row-val-sm" data-action-idx="${i}" data-action-key="task_type">
          ${TASK_TYPES.map(t => `<option value="${t.value}" ${(a.task_type||'follow_up') === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
        </select>
        <input class="am-input am-row-val-xs" type="number" min="0" placeholder="+0h"
          title="Prazo: horas após o evento"
          data-action-idx="${i}" data-action-key="offset_hours" value="${_esc(String(a.offset_hours ?? '0'))}">`
    } else if (type === 'add_interaction') {
      paramsHtml = `
        <input class="am-input am-row-val-wide" type="text" placeholder="Texto da interação"
          data-action-idx="${i}" data-action-key="content" value="${_esc(a.content || '')}">`
    }

    return `
<div class="am-builder-row am-builder-row-action" data-action-row="${i}">
  <div class="am-row-num">${i + 1}</div>
  <select class="am-select am-row-type" data-action-idx="${i}" data-action-key="type">
    <option value="">— ação —</option>
    ${ACTION_TYPES.map(t => `<option value="${t.value}" ${type === t.value ? 'selected' : ''}>${t.label}</option>`).join('')}
  </select>
  ${paramsHtml}
  <button class="am-row-remove" data-remove-action="${i}" title="Remover">${_feather('x', 12)}</button>
</div>`
  }

  // ── Bind eventos — lista ──────────────────────────────────────

  function _q(id) { return document.getElementById(id) }

  function _bindListEvents(root) {
    _q('amNewRuleBtn')?.addEventListener('click', _openCreateModal)
    _q('amEmptyNewBtn')?.addEventListener('click', _openCreateModal)

    // Delegação para cards
    const list = root.querySelector('.am-list')
    if (!list) return

    list.addEventListener('change', function(e) {
      if (e.target.dataset.action === 'toggle') {
        _onToggle(e.target.dataset.id, e.target.checked)
      }
    })

    list.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-action]')
      if (!btn) return
      const action = btn.dataset.action
      const id     = btn.dataset.id
      if (action === 'edit')          _openEditModal(id)
      if (action === 'delete')        _startDelete(id)
      if (action === 'confirm-delete') _confirmDelete(id)
      if (action === 'cancel-delete') { _deleting = null; _render() }
    })
  }

  // ── Bind eventos — modal ──────────────────────────────────────

  function _bindModalEvents(root) {
    const overlay = _q('amModalOverlay')

    // Fecha ao clicar fora
    overlay?.addEventListener('click', function(e) {
      if (e.target === overlay) _closeModal()
    })

    _q('amModalClose')?.addEventListener('click',  _closeModal)
    _q('amModalCancel')?.addEventListener('click', _closeModal)
    _q('amModalSave')?.addEventListener('click',   _saveRule)

    // Campos do header do modal
    _q('amFieldName')?.addEventListener('input',   e => { _form.name = e.target.value })
    _q('amFieldDesc')?.addEventListener('input',   e => { _form.description = e.target.value })
    _q('amFieldPriority')?.addEventListener('input', e => { _form.priority = parseInt(e.target.value) || 50 })
    _q('amFieldCooldown')?.addEventListener('input', e => { _form.cooldown_hours = parseInt(e.target.value) || null })
    _q('amFieldMaxExec')?.addEventListener('input',  e => { _form.max_executions = parseInt(e.target.value) || null })
    _q('amFieldActive')?.addEventListener('change',  e => { _form.is_active = e.target.checked })
    _q('amFieldEvent')?.addEventListener('change',   e => { _form.trigger_event = e.target.value })

    // Botões de adicionar
    _q('amAddCondBtn')?.addEventListener('click', function() {
      _form.conditions.push({ field: '', op: 'eq', value: '' })
      _rerenderBuilders()
    })
    _q('amAddActionBtn')?.addEventListener('click', function() {
      _form.actions.push({ type: '' })
      _rerenderBuilders()
    })

    // Builder de condições — delegação
    const condsEl = _q('amConditions')
    condsEl?.addEventListener('change', function(e) {
      const idx = parseInt(e.target.dataset.condIdx)
      const key = e.target.dataset.condKey
      if (isNaN(idx) || !key) return

      _form.conditions[idx] = Object.assign({}, _form.conditions[idx], { [key]: e.target.value })

      // Se campo mudou, reset op e value
      if (key === 'field') {
        const isTag = e.target.value === 'tag'
        _form.conditions[idx].op    = isTag ? 'exists' : 'eq'
        _form.conditions[idx].value = ''
      }
      _rerenderBuilders()
    })
    condsEl?.addEventListener('input', function(e) {
      const idx = parseInt(e.target.dataset.condIdx)
      const key = e.target.dataset.condKey
      if (isNaN(idx) || !key || e.target.tagName !== 'INPUT') return
      _form.conditions[idx] = Object.assign({}, _form.conditions[idx], { [key]: e.target.value })
    })
    condsEl?.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-remove-cond]')
      if (!btn) return
      _form.conditions.splice(parseInt(btn.dataset.removeCond), 1)
      _rerenderBuilders()
    })

    // Builder de ações — delegação
    const actionsEl = _q('amActions')
    actionsEl?.addEventListener('change', function(e) {
      const idx = parseInt(e.target.dataset.actionIdx)
      const key = e.target.dataset.actionKey
      if (isNaN(idx) || !key) return

      if (key === 'type') {
        // Reset ao trocar tipo
        _form.actions[idx] = { type: e.target.value }
      } else {
        _form.actions[idx] = Object.assign({}, _form.actions[idx], { [key]: e.target.value })
      }
      _rerenderBuilders()
    })
    actionsEl?.addEventListener('input', function(e) {
      const idx = parseInt(e.target.dataset.actionIdx)
      const key = e.target.dataset.actionKey
      if (isNaN(idx) || !key || e.target.tagName !== 'INPUT') return
      _form.actions[idx] = Object.assign({}, _form.actions[idx], {
        [key]: e.target.type === 'number' ? (parseInt(e.target.value) || 0) : e.target.value
      })
    })
    actionsEl?.addEventListener('click', function(e) {
      const btn = e.target.closest('[data-remove-action]')
      if (!btn) return
      _form.actions.splice(parseInt(btn.dataset.removeAction), 1)
      _rerenderBuilders()
    })

    // Fecha com Esc
    document.addEventListener('keydown', _onEsc)
  }

  function _onEsc(e) {
    if (e.key === 'Escape' && _modalOpen) _closeModal()
  }

  // Re-render apenas os builders sem re-renderizar o modal inteiro
  function _rerenderBuilders() {
    const condsEl   = document.getElementById('amConditions')
    const actionsEl = document.getElementById('amActions')
    if (condsEl)   condsEl.innerHTML   = _renderConditions()
    if (actionsEl) actionsEl.innerHTML = _renderActions()
  }

  // ── Ações da lista ────────────────────────────────────────────

  async function _onToggle(id, active) {
    // Atualização otimista
    const rule = _rules.find(r => r.id === id)
    if (!rule) return
    rule.is_active = active

    const result = await window.RulesService?.toggleRule(id, active)
    if (!result?.ok) {
      // Reverte em caso de erro
      rule.is_active = !active
      _render()
      _showToast('Erro ao alterar regra: ' + (result?.error || 'erro desconhecido'), 'error')
    }
  }

  function _startDelete(id) {
    _deleting = id
    _render()
  }

  async function _confirmDelete(id) {
    _deleting = null
    const result = await window.RulesService?.deleteRule(id)
    if (result?.ok) {
      _rules = _rules.filter(r => r.id !== id)
      _showToast('Regra excluída.', 'success')
    } else {
      _showToast('Erro ao excluir: ' + (result?.error || 'erro'), 'error')
    }
    _render()
  }

  // ── Abrir / fechar modal ──────────────────────────────────────

  function _openCreateModal() {
    _editId    = null
    _form      = _emptyForm()
    _modalOpen = true
    _saving    = false
    _render()
    setTimeout(function() { document.getElementById('amFieldName')?.focus() }, 80)
  }

  function _openEditModal(id) {
    const rule = _rules.find(r => r.id === id)
    if (!rule) return
    _editId    = id
    _form = {
      name:           rule.name            || '',
      description:    rule.description     || '',
      trigger_event:  rule.trigger_event   || 'phase_changed',
      is_active:      rule.is_active       ?? false,
      priority:       rule.priority        ?? 50,
      cooldown_hours: rule.cooldown_hours  || '',
      max_executions: rule.max_executions  || '',
      conditions:     JSON.parse(JSON.stringify(rule.conditions || [])),
      actions:        JSON.parse(JSON.stringify(rule.actions    || [])),
    }
    _modalOpen = true
    _saving    = false
    _render()
    setTimeout(function() { document.getElementById('amFieldName')?.focus() }, 80)
  }

  function _closeModal() {
    _modalOpen = false
    _editId    = null
    _saving    = false
    document.removeEventListener('keydown', _onEsc)
    _render()
  }

  // ── Salvar regra ──────────────────────────────────────────────

  async function _saveRule() {
    if (_saving) return

    // Coleta valores dos campos controlados (input direto)
    const nameEl     = document.getElementById('amFieldName')
    const descEl     = document.getElementById('amFieldDesc')
    const eventEl    = document.getElementById('amFieldEvent')
    const prioEl     = document.getElementById('amFieldPriority')
    const coolEl     = document.getElementById('amFieldCooldown')
    const maxEl      = document.getElementById('amFieldMaxExec')
    const activeEl   = document.getElementById('amFieldActive')

    if (nameEl)   _form.name           = nameEl.value.trim()
    if (descEl)   _form.description    = descEl.value.trim()
    if (eventEl)  _form.trigger_event  = eventEl.value
    if (prioEl)   _form.priority       = parseInt(prioEl.value) || 50
    if (coolEl)   _form.cooldown_hours = parseInt(coolEl.value) || null
    if (maxEl)    _form.max_executions = parseInt(maxEl.value)  || null
    if (activeEl) _form.is_active      = activeEl.checked

    // Validação client-side
    if (!_form.name) {
      nameEl?.classList.add('am-input-error')
      nameEl?.focus()
      return
    }
    nameEl?.classList.remove('am-input-error')

    if (!_form.trigger_event) {
      _showToast('Selecione o evento gatilho.', 'error')
      return
    }

    const validActions = _form.actions.filter(a => a.type)
    if (validActions.length === 0) {
      _showToast('Adicione pelo menos uma ação.', 'error')
      return
    }
    _form.actions = validActions

    const validConds = _form.conditions.filter(c => c.field && (c.op === 'exists' || c.op === 'not_exists' || c.value))
    _form.conditions = validConds

    _saving = true
    _rerenderSaveBtn()

    const payload = {
      id:             _editId,
      name:           _form.name,
      description:    _form.description || null,
      trigger_event:  _form.trigger_event,
      conditions:     _form.conditions,
      actions:        _form.actions,
      is_active:      _form.is_active,
      priority:       _form.priority,
      cooldown_hours: _form.cooldown_hours  || null,
      max_executions: _form.max_executions  || null,
    }

    const result = await window.RulesService?.upsertRule(payload)
    _saving = false

    if (!result?.ok) {
      _rerenderSaveBtn()
      _showToast('Erro ao salvar: ' + (result?.error || 'erro desconhecido'), 'error')
      return
    }

    // Recarrega lista completa para pegar a regra nova/atualizada
    await _fetchRules()
    _closeModal()
    _showToast(_editId ? 'Regra atualizada com sucesso.' : 'Regra criada com sucesso.', 'success')
  }

  function _rerenderSaveBtn() {
    const btn = document.getElementById('amModalSave')
    if (!btn) return
    if (_saving) {
      btn.disabled = true
      btn.innerHTML = `<div class="am-spin-sm"></div> Salvando...`
    } else {
      btn.disabled = false
      btn.innerHTML = `${_feather('check', 14)} Salvar Regra`
    }
  }

  // ── Broadcast Tab ─────────────────────────────────────────────

  var _bcRefreshTimer = null
  var _bcPanelOpen = true
  var _bcPanelTab = 'history' // 'editor' | 'history' | 'rules'
  var _bcStats = null
  var _bcSegment = 'all'
  var _bcSegmentLeads = []
  var _bcUploading = false

  async function _loadBroadcasts() {
    if (!window.BroadcastService) return
    _broadcastLoading = true
    _render()
    var result = await window.BroadcastService.loadBroadcasts()
    _broadcasts = (result && result.ok && Array.isArray(result.data)) ? result.data : []
    _broadcastLoading = false
    _render()
    _scheduleBroadcastRefresh()
  }

  function _scheduleBroadcastRefresh() {
    if (_bcRefreshTimer) { clearTimeout(_bcRefreshTimer); _bcRefreshTimer = null }
    var hasSending = _broadcasts.some(function(b) { return b.status === 'sending' })
    if (hasSending && _activeTab === 'broadcasts') {
      _bcRefreshTimer = setTimeout(async function() {
        var result = await window.BroadcastService.loadBroadcasts()
        _broadcasts = (result && result.ok && Array.isArray(result.data)) ? result.data : []
        _render()
        _scheduleBroadcastRefresh()
      }, 5000)
    }
  }

  function _bcStatusLabel(st) {
    return { draft: 'Rascunho', sending: 'Enviando', completed: 'Concluido', cancelled: 'Cancelado' }[st] || st
  }
  function _bcStatusColor(st) {
    return { draft: '#6B7280', sending: '#F59E0B', completed: '#10B981', cancelled: '#EF4444' }[st] || '#6B7280'
  }

  function _bcSaveFormFields() {
    var n = document.getElementById('bcName')
    var u = document.getElementById('bcMediaUrl')
    var t = document.getElementById('bcContent')
    if (n) _broadcastForm.name = n.value
    // Only overwrite media_url from input if it has a value (upload sets it directly)
    if (u && u.value) _broadcastForm.media_url = u.value
    if (t) _broadcastForm.content = t.value
    var posRadio = document.querySelector('input[name="bcMediaPos"]:checked')
    if (posRadio) _broadcastForm.media_position = posRadio.value
  }

  function _renderBroadcastTab() {
    if (_broadcastLoading) {
      return '<div class="am-tab-content"><div class="am-loading"><div class="am-spinner"></div><span>Carregando disparos...</span></div></div>'
    }

    // ── LEFT: Stats sidebar ──────────────────────────────────
    var statsHtml = _renderBroadcastStats()

    // ── CENTER: Main area ────────────────────────────────────
    var centerHtml = '<div class="bc-center">'
    if (_bcPanelOpen && _bcPanelTab === 'editor') {
      // Show phone preview centered when creating
      centerHtml += _renderPhonePreviewInline(_broadcastForm.content)
    } else if (_broadcastMode === 'detail' && _broadcastSelected) {
      centerHtml += '<div class="bc-center-detail">' + _renderBroadcastDetail() + '</div>'
    } else {
      // Empty state
      centerHtml += '<div class="bc-center-empty">'
      centerHtml += _feather('messageCircle', 40)
      centerHtml += '<h3>Disparos em massa</h3>'
      centerHtml += '<p>Selecione um disparo no historico ou crie um novo</p>'
      centerHtml += '<button class="am-btn-primary" id="bcNewBtn2">' + _feather('plus', 14) + ' Novo Disparo</button>'
      centerHtml += '</div>'
    }
    centerHtml += '</div>'

    // ── RIGHT: Slide panel ───────────────────────────────────
    var panelHtml = _renderBroadcastSlidePanel()

    return '<div class="am-tab-content"><div class="bc-v2">' + statsHtml + centerHtml + '</div>' + panelHtml + '</div>'
  }

  function _renderBroadcastStats() {
    var totalSent = 0, totalFailed = 0, totalTargets = 0
    var countCompleted = 0, countSending = 0, countFailed = 0, countDraft = 0
    var todayCount = 0, weekCount = 0, monthCount = 0
    var now = new Date()
    var todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    var weekStart = todayStart - (now.getDay() * 86400000)
    var monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime()

    for (var i = 0; i < _broadcasts.length; i++) {
      var b = _broadcasts[i]
      var st = b.status || 'draft'
      if (st === 'completed') { totalSent += (b.sent_count || 0); countCompleted++ }
      if (st === 'sending') countSending++
      if (st === 'cancelled') countFailed++
      if (st === 'draft') countDraft++
      totalFailed += (b.failed_count || 0)
      totalTargets += (b.total_targets || 0)

      var ts = b.created_at ? new Date(b.created_at).getTime() : 0
      if (ts >= todayStart) todayCount++
      if (ts >= weekStart) weekCount++
      if (ts >= monthStart) monthCount++
    }

    var successRate = (totalSent + totalFailed) > 0 ? Math.round((totalSent / (totalSent + totalFailed)) * 100) : 0

    var html = '<div class="bc-stats">'
    html += '<div class="bc-stats-title">Resumo</div>'
    html += '<div class="bc-stat-card"><div class="bc-stat-big">' + totalSent + '</div><div class="bc-stat-sub">Total enviados</div></div>'
    html += '<div class="bc-stat-card"><div class="bc-stat-big">' + successRate + '%</div><div class="bc-stat-sub">Taxa de sucesso</div></div>'

    html += '<div class="bc-stat-divider"></div>'
    html += '<div class="bc-stats-title">Disparos</div>'
    html += '<div class="bc-stat-row"><span class="bc-stat-label">Hoje</span><span class="bc-stat-num">' + todayCount + '</span></div>'
    html += '<div class="bc-stat-row"><span class="bc-stat-label">Semana</span><span class="bc-stat-num">' + weekCount + '</span></div>'
    html += '<div class="bc-stat-row"><span class="bc-stat-label">Mes</span><span class="bc-stat-num">' + monthCount + '</span></div>'

    html += '<div class="bc-stat-divider"></div>'
    html += '<div class="bc-stats-title">Por status</div>'
    html += '<div class="bc-stat-row"><span class="bc-stat-label"><span class="bc-stat-dot" style="background:#10B981"></span>Concluidos</span><span class="bc-stat-num">' + countCompleted + '</span></div>'
    html += '<div class="bc-stat-row"><span class="bc-stat-label"><span class="bc-stat-dot" style="background:#F59E0B"></span>Enviando</span><span class="bc-stat-num">' + countSending + '</span></div>'
    html += '<div class="bc-stat-row"><span class="bc-stat-label"><span class="bc-stat-dot" style="background:#EF4444"></span>Cancelados</span><span class="bc-stat-num">' + countFailed + '</span></div>'
    html += '<div class="bc-stat-row"><span class="bc-stat-label"><span class="bc-stat-dot" style="background:#6B7280"></span>Rascunhos</span><span class="bc-stat-num">' + countDraft + '</span></div>'

    html += '<div class="bc-stat-divider"></div>'
    html += '<div class="bc-stats-title">Alcance</div>'
    html += '<div class="bc-stat-card"><div class="bc-stat-big">' + totalTargets + '</div><div class="bc-stat-sub">Leads alcancados</div></div>'

    html += '</div>'
    return html
  }

  function _renderPhonePreviewInline(content) {
    var now = new Date()
    var timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0')

    var bubbleContent = ''
    if (content && content.trim()) {
      var escaped = _esc(content)
      escaped = escaped.replace(/\[(nome|queixa|queixa_principal)\]/gi, '<span class="bc-wa-tag">[$1]</span>')
      bubbleContent = '<div class="bc-wa-bubble"><div class="bc-wa-bubble-text">' + escaped + '</div>'
        + '<div class="bc-wa-bubble-time">' + timeStr + ' <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="1 12 5 16 12 6"/><polyline points="7 12 11 16 18 6"/></svg></div></div>'
    } else {
      bubbleContent = '<div class="bc-wa-empty">Digite a mensagem no painel ao lado</div>'
    }

    return '<div class="bc-phone">'
      + '<div class="bc-phone-notch"><span class="bc-phone-notch-time">' + timeStr + '</span></div>'
      + '<div class="bc-wa-header">'
      + '<div class="bc-wa-avatar"><svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>'
      + '<div><div class="bc-wa-name">Clinica</div><div class="bc-wa-status">online</div></div>'
      + '</div>'
      + '<div class="bc-wa-chat" id="bcPhoneChat">' + bubbleContent + '</div>'
      + '<div class="bc-wa-bottom">'
      + '<div class="bc-wa-input-mock">Mensagem</div>'
      + '<div class="bc-wa-send-mock"><svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg></div>'
      + '</div>'
      + '<div class="bc-phone-home"></div>'
      + '</div>'
  }

  function _renderBroadcastSlidePanel() {
    var openClass = ' open'
    var html = '<div class="bc-slide-panel' + openClass + '" id="bcSlidePanel">'

    // Header
    html += '<div class="bc-slide-header">'
    html += '<span class="bc-slide-title">' + _feather('messageCircle', 16) + ' Disparos</span>'
    html += '<div style="display:flex;align-items:center;gap:6px">'
    html += '<button class="bc-new-dispatch-sm" id="bcNewBtn">' + _feather('plus', 14) + ' Novo</button>'
    html += '<button class="bc-slide-close" id="bcSlideClose">' + _feather('x', 16) + '</button>'
    html += '</div>'
    html += '</div>'

    // Tabs
    html += '<div class="bc-slide-tabs">'
    html += '<button class="bc-slide-tab' + (_bcPanelTab === 'editor' ? ' active' : '') + '" data-panel-tab="editor">Editor</button>'
    html += '<button class="bc-slide-tab' + (_bcPanelTab === 'history' ? ' active' : '') + '" data-panel-tab="history">Historico</button>'
    html += '<button class="bc-slide-tab' + (_bcPanelTab === 'rules' ? ' active' : '') + '" data-panel-tab="rules">Regras</button>'
    html += '</div>'

    // Body
    html += '<div class="bc-slide-body">'
    if (_bcPanelTab === 'editor') {
      html += _renderBroadcastFormBody()
    } else if (_bcPanelTab === 'rules') {
      html += _renderBroadcastRulesTab()
    } else {
      html += _renderBroadcastHistoryTab()
    }
    html += '</div>'

    // Footer (only in editor tab)
    if (_bcPanelTab === 'editor') {
      html += '<div class="bc-slide-footer">'
      html += '<button class="am-btn-secondary" id="bcCancelForm">Cancelar</button>'
      html += '<button class="am-btn-primary" id="bcSaveBtn"' + (_broadcastSaving ? ' disabled' : '') + '>'
      html += (_broadcastSaving ? 'Criando...' : _feather('plus', 14) + ' Criar Disparo')
      html += '</button>'
      html += '</div>'
    }

    html += '</div>'
    return html
  }

  var _bcDeleteConfirm = null // id do broadcast em confirmacao de delete

  function _renderBroadcastHistoryTab() {
    if (_broadcasts.length === 0) {
      return '<div style="text-align:center;padding:40px 0;color:var(--text-muted);font-size:13px">Nenhum disparo ainda</div>'
    }

    var html = ''
    for (var i = 0; i < _broadcasts.length; i++) {
      var b = _broadcasts[i]
      var st = b.status || 'draft'
      var d = b.created_at ? new Date(b.created_at) : null
      var date = d ? d.toLocaleDateString('pt-BR') : '--'
      var time = d ? d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : ''

      var filterTags = []
      if (b.target_filter) {
        if (b.target_filter.phase) filterTags.push(b.target_filter.phase)
        if (b.target_filter.temperature) filterTags.push(b.target_filter.temperature)
        if (b.target_filter.funnel) filterTags.push(b.target_filter.funnel)
        if (b.target_filter.source_type) filterTags.push(b.target_filter.source_type)
      }

      var isDeleting = _bcDeleteConfirm === b.id

      html += '<div class="bc-hist-item' + (_broadcastSelected === b.id ? ' bc-hist-active' : '') + '" data-id="' + b.id + '">'
      html += '<span class="bc-hist-dot" style="background:' + _bcStatusColor(st) + '"></span>'
      html += '<div class="bc-hist-info">'
      html += '<div class="bc-hist-top">'
      html += '<span class="bc-hist-name">' + _esc(b.name) + '</span>'
      if (filterTags.length > 0) {
        html += filterTags.map(function(t) { return '<span class="bc-filter-tag">' + _esc(t) + '</span>' }).join('')
      }
      html += '</div>'
      html += '<div class="bc-hist-meta">' + date + ' ' + time + ' &middot; ' + (b.sent_count || 0) + '/' + (b.total_targets || 0) + ' env.</div>'

      if (isDeleting) {
        html += '<div class="bc-hist-delete-confirm">'
        html += '<span>Deletar?</span>'
        html += '<button class="bc-hist-del-yes" data-id="' + b.id + '">Sim</button>'
        html += '<button class="bc-hist-del-no" data-id="' + b.id + '">Nao</button>'
        html += '</div>'
      }

      html += '</div>'
      if (!isDeleting) {
        html += '<button class="bc-hist-del-btn" data-id="' + b.id + '" title="Deletar">' + _feather('trash2', 13) + '</button>'
      }
      html += '</div>'
    }
    return html
  }



  function _renderBroadcastFormBody() {
    var f = _broadcastForm
    return `
        <div class="am-field">
          <label class="am-label">Nome do disparo *</label>
          <input class="am-input" id="bcName" placeholder="Ex: Promo Lifting 5D Abril" value="${_esc(f.name)}">
        </div>
        <div class="am-field">
          <label class="am-label">Mensagem *</label>
          <textarea class="am-input" id="bcContent" rows="8" placeholder="Digite a mensagem aqui...&#10;&#10;Use [nome] para personalizar.&#10;Quebras de linha serao mantidas.">${_esc(f.content)}</textarea>
          <div class="bc-tags-bar">
            <span class="bc-tag-hint">Inserir:</span>
            <button type="button" class="bc-tag-btn" data-tag="[nome]">[nome]</button>
            <span class="bc-fmt-sep"></span>
            <button type="button" class="bc-fmt-btn" data-wrap="*" title="Negrito"><b>N</b></button>
            <button type="button" class="bc-fmt-btn" data-wrap="_" title="Italico"><i>I</i></button>
            <button type="button" class="bc-fmt-btn" data-wrap="~" title="Riscado"><s>R</s></button>
            <button type="button" class="bc-fmt-btn bc-fmt-mono" data-wrap="\`\`\`" title="Monoespaco">{ }</button>
            <span class="bc-fmt-sep"></span>
            <div class="bc-emoji-wrap">
              <button type="button" class="bc-fmt-btn bc-emoji-toggle" id="bcEmojiToggle" title="Emojis">&#128578;</button>
              <div class="bc-emoji-picker" id="bcEmojiPicker">
                ${['😊','😍','🔥','✨','💜','🌟','❤️','👏','🎉','💪','👋','🙏','💋','😉','🥰','💎','🌸','⭐','📍','📅','⏰','📞','💰','🎁','✅','❌','⚡','🏆','💡','🤝','👨‍⚕️','💆','🪞','💄','🌺','💫'].map(function(e) {
                  return '<button type="button" class="bc-emoji-btn" data-emoji="' + e + '">' + e + '</button>'
                }).join('')}
              </div>
            </div>
          </div>
        </div>
        <div class="am-field">
          <label class="am-label">Imagem ou Link</label>
          <div class="bc-media-options">
            <button type="button" class="bc-media-upload-btn" id="bcMediaUploadBtn">${_feather('image', 14)} Enviar imagem</button>
            <span style="font-size:11px;color:var(--text-muted)">ou</span>
            <input class="am-input" id="bcMediaUrl" placeholder="https://... (URL da imagem ou link)" value="${_esc(f.media_url)}" style="flex:1">
          </div>
          <input type="file" id="bcMediaFile" accept="image/*" style="display:none">
          ${f.media_url ? '<div class="bc-media-preview"><img src="' + _esc(f.media_url) + '" alt="preview"><button type="button" class="bc-media-remove" id="bcMediaRemove">' + _feather('x', 10) + '</button></div>' : ''}
          <div class="bc-media-pos">
            <label class="bc-pos-label"><input type="radio" name="bcMediaPos" value="above" ${f.media_position !== 'below' ? 'checked' : ''}> Acima do texto</label>
            <label class="bc-pos-label"><input type="radio" name="bcMediaPos" value="below" ${f.media_position === 'below' ? 'checked' : ''}> Abaixo do texto</label>
          </div>
        </div>
        <div class="bc-filters-section">
          <label class="am-label">Segmentacao <span style="font-weight:400;text-transform:none;font-size:10px;color:var(--text-muted)">(opcional se selecionar leads)</span></label>
          <div class="bc-filters-grid">
            <div class="am-field">
              <label class="am-label-sm">Fase</label>
              <select class="am-input" id="bcFilterPhase">
                <option value="">-</option>
                <option value="lead"${f.filter_phase === 'lead' ? ' selected' : ''}>Lead</option>
                <option value="agendado"${f.filter_phase === 'agendado' ? ' selected' : ''}>Agendado</option>
                <option value="compareceu"${f.filter_phase === 'compareceu' ? ' selected' : ''}>Compareceu</option>
                <option value="orcamento"${f.filter_phase === 'orcamento' ? ' selected' : ''}>Orcamento</option>
                <option value="paciente"${f.filter_phase === 'paciente' ? ' selected' : ''}>Paciente</option>
                <option value="perdido"${f.filter_phase === 'perdido' ? ' selected' : ''}>Perdido</option>
              </select>
            </div>
            <div class="am-field">
              <label class="am-label-sm">Temperatura</label>
              <select class="am-input" id="bcFilterTemp">
                <option value="">-</option>
                <option value="hot"${f.filter_temperature === 'hot' ? ' selected' : ''}>Quente</option>
                <option value="warm"${f.filter_temperature === 'warm' ? ' selected' : ''}>Morno</option>
                <option value="cold"${f.filter_temperature === 'cold' ? ' selected' : ''}>Frio</option>
              </select>
            </div>
            <div class="am-field">
              <label class="am-label-sm">Funil</label>
              <select class="am-input" id="bcFilterFunnel">
                <option value="">-</option>
                <option value="fullface"${f.filter_funnel === 'fullface' ? ' selected' : ''}>Full Face</option>
                <option value="procedimentos"${f.filter_funnel === 'procedimentos' ? ' selected' : ''}>Procedimentos</option>
              </select>
            </div>
            <div class="am-field">
              <label class="am-label-sm">Origem</label>
              <select class="am-input" id="bcFilterSource">
                <option value="">-</option>
                <option value="quiz"${f.filter_source === 'quiz' ? ' selected' : ''}>Quiz</option>
                <option value="manual"${f.filter_source === 'manual' ? ' selected' : ''}>Manual</option>
                <option value="import"${f.filter_source === 'import' ? ' selected' : ''}>Importacao</option>
              </select>
            </div>
          </div>
        </div>
        <div class="bc-leads-section">
          <label class="am-label">${_feather('userCheck', 13)} Selecionar leads manualmente</label>
          <div class="bc-leads-search-wrap">
            <input class="am-input bc-leads-search" id="bcLeadSearch" placeholder="Buscar por nome..." autocomplete="off">
            <div class="bc-leads-dropdown" id="bcLeadDropdown"></div>
          </div>
          ${f.selected_leads.length > 0 ? '<div class="bc-leads-chips" id="bcLeadChips">' + f.selected_leads.map(function(l) {
            return '<span class="bc-lead-chip" data-id="' + _esc(l.id) + '">'
              + _esc(l.nome) + '<button type="button" class="bc-chip-remove" data-id="' + _esc(l.id) + '">&times;</button></span>'
          }).join('') + '</div>' : ''}
          <small class="am-hint">${f.selected_leads.length > 0 ? f.selected_leads.length + ' selecionado(s) — ' : ''}Leads selecionados recebem o disparo independente dos filtros</small>
        </div>
        <div class="bc-throttle-section">
          <label class="am-label">${_feather('shield', 13)} Controle de envio</label>
          <div class="bc-throttle-row">
            <div class="am-field">
              <label class="am-label-sm">Enviar por lote</label>
              <select class="am-input" id="bcBatchSize">
                <option value="5"${f.batch_size === 5 ? ' selected' : ''}>5 pessoas</option>
                <option value="10"${f.batch_size === 10 || !f.batch_size ? ' selected' : ''}>10 pessoas</option>
                <option value="15"${f.batch_size === 15 ? ' selected' : ''}>15 pessoas</option>
                <option value="20"${f.batch_size === 20 ? ' selected' : ''}>20 pessoas</option>
              </select>
            </div>
            <div class="bc-throttle-separator">a cada</div>
            <div class="am-field">
              <label class="am-label-sm">Intervalo</label>
              <select class="am-input" id="bcBatchInterval">
                <option value="5"${f.batch_interval_min === 5 ? ' selected' : ''}>5 min</option>
                <option value="10"${f.batch_interval_min === 10 || !f.batch_interval_min ? ' selected' : ''}>10 min</option>
                <option value="15"${f.batch_interval_min === 15 ? ' selected' : ''}>15 min</option>
                <option value="20"${f.batch_interval_min === 20 ? ' selected' : ''}>20 min</option>
                <option value="30"${f.batch_interval_min === 30 ? ' selected' : ''}>30 min</option>
                <option value="60"${f.batch_interval_min === 60 ? ' selected' : ''}>1 hora</option>
              </select>
            </div>
          </div>
          <small class="am-hint">${_feather('shield', 11)} Protecao contra bloqueio do WhatsApp</small>
        </div>`
  }

  function _updatePhonePreview(content) {
    var chatEl = document.getElementById('bcPhoneChat')
    if (!chatEl) return
    var now = new Date()
    var timeStr = now.getHours().toString().padStart(2, '0') + ':' + now.getMinutes().toString().padStart(2, '0')

    if (!content || !content.trim()) {
      chatEl.innerHTML = '<div class="bc-wa-empty">Digite a mensagem ao lado para ver o preview</div>'
      return
    }

    var escaped = _esc(content)
    escaped = escaped.replace(/\[(nome|queixa|queixa_principal)\]/gi, '<span class="bc-wa-tag">[$1]</span>')
    chatEl.innerHTML = '<div class="bc-wa-bubble"><div class="bc-wa-bubble-text">' + escaped + '</div>'
      + '<div class="bc-wa-bubble-time">' + timeStr + ' <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><polyline points="1 12 5 16 12 6"/><polyline points="7 12 11 16 18 6"/></svg></div></div>'
  }

  function _renderBroadcastDetail() {
    var b = _broadcasts.find(function(x) { return x.id === _broadcastSelected })
    if (!b) return '<div class="bc-panel-empty"><p>Disparo nao encontrado</p></div>'

    var st = b.status || 'draft'
    var date = b.created_at ? new Date(b.created_at).toLocaleString('pt-BR') : '--'
    var startDate = b.started_at ? new Date(b.started_at).toLocaleString('pt-BR') : '--'
    var endDate = b.completed_at ? new Date(b.completed_at).toLocaleString('pt-BR') : '--'
    var progress = b.total_targets > 0 ? Math.round((b.sent_count / b.total_targets) * 100) : 0

    var filterTags = []
    if (b.target_filter) {
      if (b.target_filter.phase) filterTags.push('Fase: ' + b.target_filter.phase)
      if (b.target_filter.temperature) filterTags.push('Temp: ' + b.target_filter.temperature)
      if (b.target_filter.funnel) filterTags.push('Funil: ' + b.target_filter.funnel)
      if (b.target_filter.source_type) filterTags.push('Origem: ' + b.target_filter.source_type)
    }

    var s = _bcStats && _bcStats.ok ? _bcStats : null
    var noResponse = s ? ((s.sent || 0) - (s.responded || 0)) : 0

    return `
      <div class="bc-detail-topbar">
        <div class="bc-detail-topbar-left">
          <h3 class="bc-detail-title">${_esc(b.name)}</h3>
          <span class="bc-status" style="background:${_bcStatusColor(st)}20;color:${_bcStatusColor(st)}">${_bcStatusLabel(st)}</span>
          ${filterTags.length > 0 ? filterTags.map(function(t) { return '<span class="bc-filter-tag">' + _esc(t) + '</span>' }).join('') : ''}
        </div>
        <div class="bc-detail-topbar-right">
          ${st === 'draft' ? '<button class="am-btn-primary bc-start-btn" data-id="' + b.id + '" data-targets="' + (b.total_targets || 0) + '">' + _feather('play', 13) + ' Iniciar</button>' : ''}
          ${st === 'draft' || st === 'sending' ? '<button class="am-btn-danger bc-cancel-btn" data-id="' + b.id + '">' + _feather('xCircle', 13) + ' Cancelar</button>' : ''}
        </div>
      </div>
      ${st === 'sending' ? '<div class="bc-progress" style="margin-bottom:16px"><div class="bc-progress-bar" style="width:' + progress + '%"></div><span class="bc-progress-text">' + progress + '%</span></div>' : ''}
      <div class="bc-detail-msg">${_esc(b.content)}</div>
      ${b.media_url ? (function() {
        var u = b.media_url.toLowerCase()
        var isImg = u.indexOf('.jpg') >= 0 || u.indexOf('.jpeg') >= 0 || u.indexOf('.png') >= 0 || u.indexOf('.gif') >= 0 || u.indexOf('.webp') >= 0 || u.indexOf('supabase.co/storage') >= 0
        if (isImg) return '<div class="bc-detail-media" style="margin:12px 0"><img src="' + _esc(b.media_url) + '" alt="media"></div>'
        return '<div class="bc-detail-link" style="margin:12px 0"><a href="' + _esc(b.media_url) + '" target="_blank" rel="noopener">' + _feather('link', 13) + ' ' + _esc(b.media_caption || b.media_url) + '</a></div>'
      })() : ''}
      ${s ? '<div class="bc-metrics-col" style="margin-bottom:14px">'
        + '<div class="bc-metric-row"><div class="bc-metric-bar-h"><div style="width:' + (s.send_rate || 0) + '%;background:#10B981"></div></div><span class="bc-metric-pct">' + (s.send_rate || 0) + '%</span><span class="bc-metric-lbl">Envio</span></div>'
        + '<div class="bc-metric-row"><div class="bc-metric-bar-h"><div style="width:' + (s.response_rate || 0) + '%;background:#2563EB"></div></div><span class="bc-metric-pct">' + (s.response_rate || 0) + '%</span><span class="bc-metric-lbl">Resposta</span></div>'
        + '<div class="bc-metric-row"><div class="bc-metric-bar-h"><div style="width:' + (s.delivery_rate || 0) + '%;background:#8B5CF6"></div></div><span class="bc-metric-pct">' + (s.delivery_rate || 0) + '%</span><span class="bc-metric-lbl">Entrega</span></div>'
        + '<div class="bc-metric-row"><div class="bc-metric-bar-h"><div style="width:' + (s.read_rate || 0) + '%;background:#F59E0B"></div></div><span class="bc-metric-pct">' + (s.read_rate || 0) + '%</span><span class="bc-metric-lbl">Leitura</span></div>'
        + '</div>' : ''}
      <div class="bc-detail-split">
        <div class="bc-detail-left">
          <div class="bc-leads-seg">
            <div class="bc-seg-item${_bcSegment === 'all' ? ' bc-seg-active' : ''}" data-seg="all"><span class="bc-seg-icon" style="background:#6B728020;color:#6B7280">${_feather('userCheck', 13)}</span><span class="bc-seg-num">${b.total_targets || 0}</span><span class="bc-seg-lbl">Todos</span></div>
            <div class="bc-seg-item${_bcSegment === 'sent' ? ' bc-seg-active' : ''}" data-seg="sent"><span class="bc-seg-icon" style="background:#10B98120;color:#10B981">${_feather('check', 13)}</span><span class="bc-seg-num">${b.sent_count || 0}</span><span class="bc-seg-lbl">Enviados</span></div>
            ${s ? '<div class="bc-seg-item' + (_bcSegment === 'responded' ? ' bc-seg-active' : '') + '" data-seg="responded"><span class="bc-seg-icon" style="background:#2563EB20;color:#2563EB">' + _feather('messageCircle', 13) + '</span><span class="bc-seg-num">' + (s.responded || 0) + '</span><span class="bc-seg-lbl">Responderam</span></div>' : ''}
            ${s ? '<div class="bc-seg-item' + (_bcSegment === 'no_response' ? ' bc-seg-active' : '') + '" data-seg="no_response"><span class="bc-seg-icon" style="background:#F59E0B20;color:#F59E0B">' + _feather('clock', 13) + '</span><span class="bc-seg-num">' + noResponse + '</span><span class="bc-seg-lbl">Sem resposta</span></div>' : ''}
            <div class="bc-seg-item${_bcSegment === 'failed' ? ' bc-seg-active' : ''}" data-seg="failed"><span class="bc-seg-icon" style="background:#EF444420;color:#EF4444">${_feather('alertCircle', 13)}</span><span class="bc-seg-num">${b.failed_count || 0}</span><span class="bc-seg-lbl">Falhas</span></div>
          </div>
          <div class="bc-detail-dates">
            <span>${_feather('calendar', 12)} ${date}</span>
            ${b.started_at ? '<span>' + _feather('play', 12) + ' ' + startDate + '</span>' : ''}
            ${b.completed_at ? '<span>' + _feather('checkCircle', 12) + ' ' + endDate + '</span>' : ''}
          </div>
        </div>
        <div class="bc-detail-right">
          <div class="bc-seg-leads-list" id="bcSegLeadsList">
            ${_bcSegmentLeads.length > 0 ? _bcSegmentLeads.map(function(l) {
              return '<div class="bc-seg-lead">' + _feather('userCheck', 12) + ' <span>' + _esc(l.name || 'Sem nome') + '</span><small>' + _esc(l.phone || '') + '</small></div>'
            }).join('') : '<div class="bc-seg-leads-empty">Selecione um segmento para ver os leads</div>'}
          </div>
        </div>
      </div>
      `
  }

  function _renderBroadcastRulesTab() {
    var sections = [
      {
        title: 'Segmentacao e Filtros',
        icon: 'tag',
        color: '#7C3AED',
        rules: [
          'Filtros por fase, temperatura, funil e origem sao cumulativos (AND)',
          'Leads selecionados manualmente recebem o disparo independente dos filtros',
          'Pelo menos um filtro ou um lead manual e obrigatorio para criar um disparo',
          'Leads sem telefone valido sao automaticamente excluidos'
        ]
      },
      {
        title: 'Selecao Manual de Leads',
        icon: 'userCheck',
        color: '#2563EB',
        rules: [
          'Busque por nome para encontrar leads no sistema',
          'Leads manuais sao adicionados alem dos filtros (OR)',
          'Maximo recomendado: 200 leads por disparo',
          'Leads duplicados (por filtro + manual) sao automaticamente deduplicados'
        ]
      },
      {
        title: 'Controle de Envio (Throttle)',
        icon: 'shield',
        color: '#10B981',
        rules: [
          'Lotes de 5 a 20 pessoas com intervalo de 5 a 60 minutos',
          'Configuracao padrao (10/10min) envia ~60 msgs/hora — seguro para WhatsApp',
          'Nunca exceda 200 mensagens/hora para evitar bloqueio temporario',
          'O sistema respeita automaticamente os limites configurados'
        ]
      },
      {
        title: 'Personalizacao da Mensagem',
        icon: 'edit2',
        color: '#F59E0B',
        rules: [
          'Use [nome] para inserir o nome do lead automaticamente',
          'Use [queixa] para inserir a queixa principal do lead',
          'Formatacao WhatsApp: *negrito*, _italico_, ~riscado~, ```mono```',
          'Imagens podem ser posicionadas acima ou abaixo do texto'
        ]
      },
      {
        title: 'Ciclo de Vida do Disparo',
        icon: 'refreshCw',
        color: '#6366F1',
        rules: [
          'Rascunho: disparo criado, aguardando inicio',
          'Enviando: mensagens sendo entregues em lotes',
          'Concluido: todos os lotes foram processados',
          'Cancelado: envio interrompido, msgs pendentes removidas'
        ]
      },
      {
        title: 'Arquitetura Tecnica',
        icon: 'settings',
        color: '#64748B',
        rules: [
          'wa_broadcasts armazena metadados do disparo',
          'wa_outbox recebe uma fila de mensagens por destinatario',
          'O worker n8n processa a fila respeitando batch_size e batch_interval',
          'Estatisticas (entrega, leitura, resposta) sao calculadas em tempo real via RPC'
        ]
      }
    ]

    var html = ''
    for (var i = 0; i < sections.length; i++) {
      var s = sections[i]
      html += '<div class="bc-rules-section">'
      html += '<div class="bc-rules-header" style="color:' + s.color + '">'
      html += '<span class="bc-rules-icon" style="background:' + s.color + '15;color:' + s.color + '">' + _feather(s.icon, 15) + '</span>'
      html += '<span class="bc-rules-title">' + s.title + '</span>'
      html += '</div>'
      html += '<ul class="bc-rules-list">'
      for (var j = 0; j < s.rules.length; j++) {
        html += '<li>' + _feather('check', 11) + ' ' + s.rules[j] + '</li>'
      }
      html += '</ul>'
      html += '</div>'
    }
    return html
  }

  function _bindBroadcastEvents(root) {
    // New broadcast buttons (stats sidebar + center empty state)
    var newBtns = root.querySelectorAll('#bcNewBtn, #bcNewBtn2')
    newBtns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        _broadcastForm = _emptyBroadcastForm()
        _broadcastMode = 'new'
        _broadcastSelected = null
        _bcPanelOpen = true
        _bcPanelTab = 'editor'
        _render()
      })
    })

    // Slide panel close button — goes back to history (never fully closes)
    var closeBtn = document.getElementById('bcSlideClose')
    if (closeBtn) {
      closeBtn.addEventListener('click', function() {
        if (_bcPanelTab === 'editor') {
          _bcPanelTab = 'history'
          _broadcastMode = 'detail'
          if (!_broadcastSelected && _broadcasts.length > 0) _broadcastSelected = _broadcasts[0].id
        }
        _render()
      })
    }

    // Slide panel overlay — no action (panel stays open)
    var overlay = document.getElementById('bcSlideOverlay')
    if (overlay) {
      overlay.addEventListener('click', function() {
        // panel stays open — do nothing
      })
    }

    // Delete broadcast — step 1: show confirm
    document.querySelectorAll('.bc-hist-del-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault()
        e.stopPropagation()
        _bcDeleteConfirm = btn.dataset.id
        _render()
      })
    })

    // Delete broadcast — step 2: confirm yes
    document.querySelectorAll('.bc-hist-del-yes').forEach(function(btn) {
      btn.addEventListener('click', async function(e) {
        e.preventDefault()
        e.stopPropagation()
        var id = btn.dataset.id
        _bcDeleteConfirm = null
        var result = await window.BroadcastService.deleteBroadcast(id)
        if (result && result.ok) {
          _showToast('Disparo removido')
          if (_broadcastSelected === id) { _broadcastSelected = null; _broadcastMode = 'detail' }
          await _loadBroadcasts()
        } else {
          _showToast(result?.error || 'Erro ao remover', 'error')
          _render()
        }
      })
    })

    // Delete broadcast — step 2: confirm no
    document.querySelectorAll('.bc-hist-del-no').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.preventDefault()
        e.stopPropagation()
        _bcDeleteConfirm = null
        _render()
      })
    })

    // Panel tab switching
    root.querySelectorAll('.bc-slide-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var tab = btn.dataset.panelTab
        if (tab && tab !== _bcPanelTab) {
          _bcPanelTab = tab
          _render()
        }
      })
    })

    // History tab item click — show detail in center, panel stays open
    root.querySelectorAll('.bc-hist-item').forEach(function(item) {
      item.addEventListener('click', async function() {
        _broadcastSelected = item.dataset.id
        _broadcastMode = 'detail'
        _bcPanelTab = 'history'
        _bcStats = null
        _bcSegment = 'all'
        _bcSegmentLeads = []
        _render()
        // Load stats async
        if (window.BroadcastService && window.BroadcastService.getBroadcastStats) {
          var result = await window.BroadcastService.getBroadcastStats(item.dataset.id)
          if (result && result.ok && result.data) {
            _bcStats = result.data
            _render()
          }
        }
      })
    })

    // Media upload button → trigger file input
    var uploadBtn = document.getElementById('bcMediaUploadBtn')
    var fileInput = document.getElementById('bcMediaFile')
    if (uploadBtn && fileInput) {
      uploadBtn.addEventListener('click', function() { fileInput.click() })
      fileInput.addEventListener('change', async function() {
        if (!fileInput.files || !fileInput.files[0]) return
        var file = fileInput.files[0]
        if (!file.type.startsWith('image/')) {
          _showToast('Selecione um arquivo de imagem', 'error')
          return
        }
        _bcUploading = true
        uploadBtn.textContent = 'Enviando...'
        uploadBtn.disabled = true
        try {
          var ts = Date.now()
          var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
          var path = 'broadcasts/' + ts + '-' + safeName
          var sbUrl = 'https://oqboitkpcvuaudouwvkl.supabase.co'
          var sbKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9xYm9pdGtwY3Z1YXVkb3V3dmtsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQ0NTgyMzQsImV4cCI6MjA5MDAzNDIzNH0.8d1HT8GTxIVsaTtl9eOiijDkWUVDLaTv2W4qahmI8w0'
          var uploadUrl = sbUrl + '/storage/v1/object/media/' + path
          var resp = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
              'apikey': sbKey,
              'Authorization': 'Bearer ' + sbKey,
              'Content-Type': file.type,
              'x-upsert': 'true'
            },
            body: file
          })
          if (!resp.ok) throw new Error('Upload falhou: ' + resp.status)
          var publicUrl = sbUrl + '/storage/v1/object/public/media/' + path
          _bcSaveFormFields()
          _broadcastForm.media_url = publicUrl
          _bcUploading = false
          _render()
          _showToast('Imagem enviada com sucesso')
        } catch (err) {
          _bcUploading = false
          _showToast('Erro no upload: ' + err.message, 'error')
          uploadBtn.textContent = 'Enviar imagem'
          uploadBtn.disabled = false
        }
      })
    }

    // Media remove
    var removeMedia = document.getElementById('bcMediaRemove')
    if (removeMedia) {
      removeMedia.addEventListener('click', function() {
        _bcSaveFormFields()
        _broadcastForm.media_url = ''
        _render()
      })
    }

    // Media position radios
    document.querySelectorAll('input[name="bcMediaPos"]').forEach(function(radio) {
      radio.addEventListener('change', function() {
        _broadcastForm.media_position = radio.value
      })
    })

    // Real-time phone preview binding
    var contentEl = root.querySelector('#bcContent')
    if (contentEl) {
      contentEl.addEventListener('input', function() {
        _broadcastForm.content = contentEl.value
        _updatePhonePreview(contentEl.value)
      })
    }

    // Tag insert buttons
    root.querySelectorAll('.bc-tag-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var textarea = document.getElementById('bcContent')
        if (!textarea) return
        var tag = btn.dataset.tag
        var start = textarea.selectionStart
        var end = textarea.selectionEnd
        var text = textarea.value
        textarea.value = text.substring(0, start) + tag + text.substring(end)
        textarea.selectionStart = textarea.selectionEnd = start + tag.length
        textarea.focus()
        _broadcastForm.content = textarea.value
        _updatePhonePreview(textarea.value)
      })
    })

    // Emoji picker toggle + insert
    var emojiToggle = document.getElementById('bcEmojiToggle')
    var emojiPicker = document.getElementById('bcEmojiPicker')
    if (emojiToggle && emojiPicker) {
      emojiToggle.addEventListener('click', function(e) {
        e.stopPropagation()
        emojiPicker.classList.toggle('open')
      })
      document.addEventListener('click', function() { emojiPicker.classList.remove('open') }, { once: true })
    }
    document.querySelectorAll('.bc-emoji-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation()
        var textarea = document.getElementById('bcContent')
        if (!textarea) return
        var emoji = btn.dataset.emoji
        var text = textarea.value
        var start = textarea === document.activeElement ? textarea.selectionStart : text.length
        textarea.value = text.substring(0, start) + emoji + text.substring(start)
        textarea.selectionStart = textarea.selectionEnd = start + emoji.length
        textarea.focus()
        _broadcastForm.content = textarea.value
        _updatePhonePreview(textarea.value)
        if (emojiPicker) emojiPicker.classList.remove('open')
      })
    })

    // Format buttons (bold, italic, strikethrough, mono) — exclude emoji toggle
    document.querySelectorAll('.bc-fmt-btn[data-wrap]').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var textarea = document.getElementById('bcContent')
        if (!textarea) return
        var wrap = btn.dataset.wrap
        var start = textarea.selectionStart
        var end = textarea.selectionEnd
        var text = textarea.value
        var selected = text.substring(start, end)
        if (selected) {
          textarea.value = text.substring(0, start) + wrap + selected + wrap + text.substring(end)
          textarea.selectionStart = start
          textarea.selectionEnd = end + (wrap.length * 2)
        } else {
          textarea.value = text.substring(0, start) + wrap + wrap + text.substring(end)
          textarea.selectionStart = textarea.selectionEnd = start + wrap.length
        }
        textarea.focus()
        _broadcastForm.content = textarea.value
        _updatePhonePreview(textarea.value)
      })
    })

    // Lead search + select
    var searchInput = document.getElementById('bcLeadSearch')
    var dropdown = document.getElementById('bcLeadDropdown')
    var _searchTimeout = null

    if (searchInput && dropdown) {
      searchInput.addEventListener('input', function() {
        clearTimeout(_searchTimeout)
        var q = searchInput.value.trim().toLowerCase()
        if (q.length < 2) { dropdown.innerHTML = ''; dropdown.style.display = 'none'; return }
        _searchTimeout = setTimeout(async function() {
          var allLeads = []
          if (window.LeadsService) allLeads = await window.LeadsService.loadAll()
          var selectedIds = _broadcastForm.selected_leads.map(function(l) { return l.id })
          var matches = allLeads.filter(function(l) {
            var lName = l.name || l.nome || ''
            if (!lName || selectedIds.indexOf(l.id) !== -1) return false
            return lName.toLowerCase().indexOf(q) !== -1
          }).slice(0, 8)

          if (matches.length === 0) {
            dropdown.innerHTML = '<div class="bc-lead-option bc-lead-empty">Nenhum lead encontrado</div>'
          } else {
            dropdown.innerHTML = matches.map(function(l) {
              var lName = l.name || l.nome || ''
              var phone = l.phone || l.whatsapp || l.telefone || ''
              return '<div class="bc-lead-option" data-id="' + _esc(l.id) + '" data-nome="' + _esc(lName) + '" data-phone="' + _esc(phone) + '">'
                + '<span class="bc-lead-opt-name">' + _esc(lName) + '</span>'
                + (phone ? '<span class="bc-lead-opt-phone">' + _esc(phone) + '</span>' : '')
                + '</div>'
            }).join('')
          }
          dropdown.style.display = 'block'
        }, 200)
      })

      searchInput.addEventListener('blur', function() {
        setTimeout(function() { dropdown.style.display = 'none' }, 200)
      })

      dropdown.addEventListener('mousedown', function(e) {
        var opt = e.target.closest('.bc-lead-option')
        if (!opt || opt.classList.contains('bc-lead-empty')) return
        e.preventDefault()
        _bcSaveFormFields()
        _broadcastForm.selected_leads.push({
          id: opt.dataset.id,
          nome: opt.dataset.nome,
          phone: opt.dataset.phone
        })
        searchInput.value = ''
        dropdown.style.display = 'none'
        _render()
      })
    }

    // Remove lead chip
    document.querySelectorAll('.bc-chip-remove').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var id = btn.dataset.id
        _bcSaveFormFields()
        _broadcastForm.selected_leads = _broadcastForm.selected_leads.filter(function(l) { return l.id !== id })
        _render()
      })
    })

    // Cancel form
    var cancelForm = document.getElementById('bcCancelForm')
    if (cancelForm) {
      cancelForm.addEventListener('click', function() {
        _bcPanelTab = 'history'
        _broadcastMode = 'detail'
        if (!_broadcastSelected && _broadcasts.length > 0) _broadcastSelected = _broadcasts[0].id
        _render()
      })
    }

    // Save
    var saveBtn = document.getElementById('bcSaveBtn')
    if (saveBtn) {
      saveBtn.addEventListener('click', async function() {
        _bcSaveFormFields()
        var name = _broadcastForm.name || ''
        var content = _broadcastForm.content || ''
        var mediaUrl = _broadcastForm.media_url || ''
        var mediaPosition = _broadcastForm.media_position || 'above'
        var filterPhase = (document.getElementById('bcFilterPhase') || {}).value || ''
        var filterTemp = (document.getElementById('bcFilterTemp') || {}).value || ''
        var filterFunnel = (document.getElementById('bcFilterFunnel') || {}).value || ''
        var filterSource = (document.getElementById('bcFilterSource') || {}).value || ''
        var batchSize = parseInt((document.getElementById('bcBatchSize') || {}).value) || 10
        var batchInterval = parseInt((document.getElementById('bcBatchInterval') || {}).value) || 10

        if (!name.trim() || !content.trim()) {
          _showToast('Nome e mensagem sao obrigatorios', 'error')
          return
        }

        var filter = {}
        if (filterPhase) filter.phase = filterPhase
        if (filterTemp) filter.temperature = filterTemp
        if (filterFunnel) filter.funnel = filterFunnel
        if (filterSource) filter.source_type = filterSource

        _broadcastSaving = true
        _render()

        var result = await window.BroadcastService.createBroadcast({
          name: name.trim(),
          content: content.trim(),
          media_url: mediaUrl.trim() || null,
          media_caption: null,
          media_position: mediaPosition,
          target_filter: filter,
          batch_size: batchSize,
          batch_interval_min: batchInterval,
          selected_lead_ids: _broadcastForm.selected_leads.map(function(l) { return l.id }),
        })

        _broadcastSaving = false

        if (result && result.ok) {
          _showToast('Disparo criado! ' + (result.data?.total_targets || 0) + ' destinatarios encontrados')
          _broadcastSelected = result.data?.id || null
          _broadcastMode = _broadcastSelected ? 'detail' : 'new'
          _bcPanelTab = 'history'
          await _loadBroadcasts()
        } else {
          _showToast(result?.error || 'Erro ao criar disparo', 'error')
          _render()
        }
      })
    }

    // Segment click — load leads for that segment
    document.querySelectorAll('.bc-seg-item[data-seg]').forEach(function(item) {
      item.addEventListener('click', async function() {
        var seg = item.dataset.seg
        _bcSegment = seg
        _bcSegmentLeads = []
        _render()
        if (window.BroadcastService && window.BroadcastService.getBroadcastLeads && _broadcastSelected) {
          var result = await window.BroadcastService.getBroadcastLeads(_broadcastSelected, seg)
          if (result && result.ok && Array.isArray(result.data)) {
            _bcSegmentLeads = result.data
          }
          _render()
        }
      })
    })

    // Start buttons
    root.querySelectorAll('.bc-start-btn').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.dataset.id
        var targets = parseInt(btn.dataset.targets) || 0
        if (targets === 0) {
          _showToast('Nenhum destinatario encontrado para este filtro', 'error')
          return
        }
        if (!confirm('Iniciar disparo para ' + targets + ' destinatarios?')) return
        btn.disabled = true
        btn.textContent = 'Iniciando...'
        var result = await window.BroadcastService.startBroadcast(id)
        if (result && result.ok) {
          var est = result.data?.estimated_minutes || 0
          var msg = 'Disparo iniciado! ' + (result.data?.enqueued || 0) + ' msgs'
          if (est > 0) msg += ' (~' + est + 'min para concluir)'
          _showToast(msg)
          await _loadBroadcasts()
        } else {
          _showToast(result?.error || 'Erro ao iniciar', 'error')
          _render()
        }
      })
    })

    // Cancel buttons
    root.querySelectorAll('.bc-cancel-btn').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var id = btn.dataset.id
        if (!confirm('Cancelar este disparo? Mensagens pendentes serao removidas.')) return
        btn.disabled = true
        btn.textContent = 'Cancelando...'
        var result = await window.BroadcastService.cancelBroadcast(id)
        if (result && result.ok) {
          _showToast('Disparo cancelado. ' + (result.data?.removed_from_outbox || 0) + ' mensagens removidas')
          await _loadBroadcasts()
        } else {
          _showToast(result?.error || 'Erro ao cancelar', 'error')
          _render()
        }
      })
    })
  }

  // ── Toast ─────────────────────────────────────────────────────

  function _showToast(msg, type = 'success') {
    const existing = document.getElementById('amToast')
    if (existing) existing.remove()

    const el = document.createElement('div')
    el.id = 'amToast'
    el.className = `am-toast am-toast-${type}`
    el.innerHTML = `
      ${type === 'success' ? _feather('check', 14) : _feather('alertCircle', 14)}
      <span>${_esc(msg)}</span>`
    document.body.appendChild(el)

    setTimeout(function() { el.classList.add('am-toast-visible') }, 10)
    setTimeout(function() {
      el.classList.remove('am-toast-visible')
      setTimeout(function() { el.remove() }, 300)
    }, 3500)
  }

  // ── Exposição global ──────────────────────────────────────────
  window.AutomationsUI = Object.freeze({ init })

})()
