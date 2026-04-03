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
  let _activeTab = 'rules' // 'rules' | 'whatsapp' | 'inbox'

  // ── Estado ──────────────────────────────────────────────────

  let _rules      = []
  let _loading    = false
  let _initialized = false

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
          { name: 'Cartoes de resumo (topo)', desc: '4 cards: Urgentes (vermelho pulsante), Aguardando Voce (amarelo), Lara Ativa (verde), Resolvidos Hoje (cinza)', status: 'pending', type: 'flow' },
          { name: 'Lista de conversas (esquerda)', desc: 'Todas as conversas ativas ordenadas por prioridade. Bolinha colorida + nome + preview + timer', status: 'pending', type: 'flow' },
          { name: 'Conversa aberta (direita)', desc: 'Historico estilo WhatsApp com baloes. Msgs da Lara identificadas. Campo para digitar resposta', status: 'pending', type: 'flow' },
          { name: 'Botoes grandes e claros', desc: '"ASSUMIR CONVERSA" (amarelo) e "DEVOLVER PARA LARA" (verde) — sempre visiveis', status: 'pending', type: 'flow' },
        ]
      },
      {
        title: 'Alertas e Notificacoes',
        icon: 'alertCircle',
        color: '#DC2626',
        description: 'Sistema de alertas visuais e sonoros para a secretaria',
        rules: [
          { name: 'Card URGENTE pisca vermelho', desc: 'Emergencias, reclamacoes e pedidos de humano — pisca ate resolver', status: 'pending', type: 'shield' },
          { name: 'Som de alerta para msgs urgentes', desc: 'Bipe duplo quando chega mensagem que precisa atencao imediata', status: 'pending', type: 'shield' },
          { name: 'Timer ficando vermelho', desc: 'Apos 2 min sem resposta da secretaria, o timer muda de cor alertando', status: 'pending', type: 'shield' },
          { name: 'Badge de tags automaticas', desc: '"QUER AGENDAR", "PERGUNTOU PRECO", "URGENTE" — visiveis na lista de conversas', status: 'pending', type: 'flow' },
          { name: 'Notificacao no titulo da aba', desc: 'Titulo da aba do navegador mostra (3) quando tem msgs pendentes', status: 'pending', type: 'flow' },
        ]
      },
      {
        title: 'Acoes da Secretaria',
        icon: 'userCheck',
        color: '#059669',
        description: 'O que a secretaria pode fazer na Central de Atendimento',
        rules: [
          { name: 'Assumir conversa', desc: 'Pausa a Lara, secretaria responde diretamente pelo campo de texto', status: 'pending', type: 'flow' },
          { name: 'Devolver para Lara', desc: 'Reativa a IA na conversa, Lara retoma de onde parou', status: 'pending', type: 'flow' },
          { name: 'Enviar mensagem manual', desc: 'Campo de texto para digitar e enviar via WhatsApp — msgs ficam identificadas como "secretaria"', status: 'pending', type: 'flow' },
          { name: 'Resolver conversa', desc: 'Status closed, sai da lista. Reabre auto se paciente mandar nova msg', status: 'active', type: 'flow' },
          { name: 'Arquivar conversa', desc: 'Status archived, sai da lista. Reabre auto se paciente mandar nova msg', status: 'active', type: 'flow' },
          { name: 'Reabrir automatico', desc: 'Conversa closed/archived reabre quando paciente manda nova mensagem', status: 'active', type: 'flow' },
          { name: 'Transferir para Dra. Mirian', desc: 'Marca conversa como "aguardando doutora" — Lara informa o paciente', status: 'pending', type: 'flow' },
        ]
      },
      {
        title: 'Filtros e Ordenacao',
        icon: 'settings',
        color: '#6B7280',
        description: 'Como as conversas sao organizadas para facilitar o trabalho',
        rules: [
          { name: 'Urgentes sempre primeiro', desc: 'Conversas com tag emergencia/precisa_humano ficam no topo', status: 'pending', type: 'flow' },
          { name: 'Depois por tempo', desc: 'Quem mandou msg ha mais tempo aparece antes', status: 'pending', type: 'flow' },
          { name: 'Filtro por status', desc: 'Tabs: Todas, Urgentes, Aguardando, Lara Ativa, Resolvidas', status: 'pending', type: 'flow' },
          { name: 'Busca por nome/telefone', desc: 'Campo de busca rapida no topo da lista', status: 'pending', type: 'flow' },
        ]
      },
      {
        title: 'Arquitetura Tecnica',
        icon: 'lock',
        color: '#7C3AED',
        description: 'Estrutura de arquivos e modulos do sistema',
        rules: [
          { name: 'inbox.ui.js', desc: 'Renderizacao completa da pagina — cards, lista, chat, eventos', status: 'pending', type: 'rule' },
          { name: 'inbox.service.js', desc: 'Logica de negocio — assumir, devolver, enviar, filtrar', status: 'pending', type: 'rule' },
          { name: 'inbox.repository.js', desc: 'Chamadas Supabase — RPCs wa_inbox_list, wa_inbox_send, etc.', status: 'pending', type: 'rule' },
          { name: 'inbox.css', desc: 'Estilos dedicados — cards, chat bubbles, alertas, responsivo', status: 'pending', type: 'rule' },
          { name: 'RPCs Supabase', desc: 'wa_inbox_list, wa_inbox_conversation, wa_inbox_assume, wa_inbox_release, wa_inbox_send', status: 'pending', type: 'rule' },
          { name: 'Realtime (Supabase)', desc: 'Subscription em wa_messages para atualizar chat em tempo real', status: 'pending', type: 'rule' },
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
          { name: 'IA ativa 24h — resposta imediata para leads quentes', desc: 'Agendamento, urgencias, perguntas sobre procedimentos e leads quentes: Lara responde na hora, sem esperar secretaria', status: 'pending', type: 'flow' },
          { name: 'Horario comercial: secretaria tem prioridade', desc: '8h-18h seg-sex, 8h-12h sab — secretaria pode assumir via botao no inbox', status: 'pending', type: 'flow' },
          { name: 'Reativacao automatica em 2 minutos', desc: 'pg_cron verifica a cada 1 min: se paciente mandou msg e secretaria nao respondeu em 2 min, Lara reativa e responde', status: 'active', type: 'flow' },
          { name: 'Resposta imediata sem espera', desc: 'Pedido de agendamento, urgencia medica, pergunta sobre procedimento, lead demonstrando interesse → Lara responde na hora', status: 'pending', type: 'flow' },
          { name: 'Secretaria assume conversa', desc: 'Botao "Assumir" no inbox ou resposta pelo celular pausa a IA automaticamente', status: 'active', type: 'flow' },
          { name: 'Devolver para Lara', desc: 'Botao "Devolver" reativa a IA na conversa', status: 'active', type: 'flow' },
          { name: 'Fora do horario: Lara 100%', desc: '18h-8h, sabados apos 12h, domingos e feriados — Lara responde tudo automaticamente', status: 'pending', type: 'flow' },
        ]
      },
      {
        title: 'Economia de Creditos',
        icon: 'dollarSign',
        color: '#059669',
        description: 'Regras para minimizar chamadas desnecessarias a API Claude',
        rules: [
          { name: 'Verificar ai_enabled antes de chamar Claude', desc: 'Guard Check RPC verifica ai_enabled. Se false, so loga inbound sem gastar credito', status: 'active', type: 'shield' },
          { name: 'Debounce 5 segundos', desc: 'Msgs seguidas agrupadas em 1 chamada ao Claude', status: 'pending', type: 'shield' },
          { name: 'Limite 15 msgs/dia por conversa', desc: 'Guard Check conta msgs AI do dia. Apos 15, pausa IA automaticamente', status: 'active', type: 'shield' },
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
          { name: 'emergencia', desc: 'Quando detecta urgencia medica', status: 'pending', type: 'tag' },
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
        </div>

        ${_activeTab === 'rules' ? _renderRulesTab() : _activeTab === 'whatsapp' ? _renderWhatsAppTab() : _renderInboxTab()}

      </div>

      ${_modalOpen ? _renderModal() : ''}
    `

    // Bind tab clicks
    root.querySelectorAll('.am-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        _activeTab = btn.dataset.tab
        _render()
      })
    })

    _bindListEvents(root)
    if (_modalOpen) _bindModalEvents(root)
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
