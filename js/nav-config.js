/**
 * ClinicAI — Navigation Configuration
 *
 * ╔══════════════════════════════════════════════════════════════════════╗
 * ║  FONTE ÚNICA DA VERDADE PARA O MENU LATERAL                         ║
 * ║                                                                      ║
 * ║  Para adicionar uma nova seção: adicione um objeto em NAV_CONFIG.    ║
 * ║  Para adicionar uma página:    adicione em section.pages[].          ║
 * ║  Para restringir acesso:       defina roles[] e/ou plans[].          ║
 * ║                                                                      ║
 * ║  REGRAS DE PERMISSÃO:                                                ║
 * ║    roles: []  → todos os papéis veem                                 ║
 * ║    roles: ['admin', 'sdr']  → só admin e sdr veem                   ║
 * ║    plans: []  → todos os planos veem                                 ║
 * ║    plans: ['premium']  → só plano premium vê                         ║
 * ║    Um item de página pode sobrescrever a restrição da seção-pai.     ║
 * ║                                                                      ║
 * ║  NUNCA gerencie o HTML do menu manualmente — use apenas este config. ║
 * ╚══════════════════════════════════════════════════════════════════════╝
 *
 * Carregado por: sidebar.js (que depende deste arquivo)
 * Carrega antes de: sidebar.js
 */

;(function () {
  'use strict'

  if (window._clinicaiNavConfigLoaded) {
    console.error('[ClinicAI/nav-config] nav-config.js carregado mais de uma vez. Verifique o index.html.')
    return
  }
  window._clinicaiNavConfigLoaded = true

  // ── Papéis de usuário ──────────────────────────────────────────
  /**
   * Enum de todos os papéis disponíveis no sistema.
   * Use estas constantes em roles[] — nunca strings literais avulsas.
   *
   * Para adicionar um novo papel:
   *   1. Adicione aqui (ex: FARMACEUTICO: 'farmaceutico')
   *   2. Defina o acesso em cada seção de NAV_CONFIG
   *   3. Preencha user.role no backend ao criar o usuário
   */
  const ROLES = Object.freeze({
    OWNER:        'owner',        // Proprietário — acesso irrestrito
    ADMIN:        'admin',        // Administrador — acesso total ao sistema
    THERAPIST:    'therapist',    // Terapeuta/Médico — foco clínico
    RECEPTIONIST: 'receptionist', // Recepcionista — foco operacional
    VIEWER:       'viewer',       // Visualizador — acesso somente leitura
  })

  // ── Planos do produto ──────────────────────────────────────────
  /**
   * Enum de todos os planos disponíveis.
   * Use estas constantes em plans[] — nunca strings literais avulsas.
   *
   * Para adicionar um novo plano:
   *   1. Adicione aqui (ex: ENTERPRISE: 'enterprise')
   *   2. Marque as features exclusivas com plans: [PLANS.ENTERPRISE]
   */
  const PLANS = Object.freeze({
    PREMIUM: 'premium', // Acesso completo a todas as features
    BASIC:   'basic',   // Funcionalidades essenciais
    TRIAL:   'trial',   // Período de teste com acesso limitado
  })

  // ── Configuração central da navegação ─────────────────────────
  /**
   * Array de seções do sidebar. Cada seção:
   *
   *   section  {string}   — Identificador único (data-section no HTML)
   *   icon     {string}   — Nome do ícone Feather Icons
   *   label    {string}   — Texto exibido no menu
   *   roles    {string[]} — Papéis que veem a seção ([] = todos)
   *   plans    {string[]} — Planos que veem a seção ([] = todos)
   *   pages    {object[]} — Sub-itens da seção:
   *
   *     page          {string}  — Identificador da página (data-page no HTML)
   *     label         {string}  — Texto do sub-item
   *     breadcrumb    {string}  — Texto do breadcrumb separado por " > "
   *     highlight     {boolean} — Aplica destaque visual (ex: features premium/novas)
   *     defaultActive {boolean} — Página aberta ao carregar (apenas 1 por config)
   *     roles         {string[]} — Sobrescreve roles da seção (omitir = herda)
   *     plans         {string[]} — Sobrescreve plans da seção (omitir = herda)
   */
  const NAV_CONFIG = [

    // ── Dashboard ────────────────────────────────────────────────
    {
      section: 'dashboard',
      icon:    'grid',
      label:   'Dashboard',
      roles:   [],
      plans:   [],
      pages: [
        {
          page:          'dashboard-overview',
          label:         'Visão Geral',
          breadcrumb:    'Dashboard > Visão Geral',
          defaultActive: true,
        },
        {
          page:          'inbox',
          label:         'Central de Atendimento',
          breadcrumb:    'Dashboard > Central de Atendimento',
          highlight:     true,
        },
      ],
    },

    // ── Captação Full Face ────────────────────────────────────────
    {
      section: 'captacao-fullface',
      icon:    'star',
      label:   'Full Face',
      roles:   [ROLES.OWNER, ROLES.ADMIN, ROLES.RECEPTIONIST],
      plans:   [],
      pages: [
        { page: 'leads-fullface',              label: 'Leads',                   breadcrumb: 'Full Face > Leads' },
        { page: 'sdh-fullface',                label: 'SDR',                     breadcrumb: 'Full Face > SDR',                     highlight: true, roles: [ROLES.OWNER, ROLES.ADMIN] },
        { page: 'quiz-fullface',               label: 'Quiz',                    breadcrumb: 'Full Face > Quiz',                    roles: [ROLES.OWNER, ROLES.ADMIN] },
        { page: 'msg-bank-fullface',           label: 'Banco de Mensagens',      breadcrumb: 'Full Face > Banco de Mensagens' },
        { page: 'auto-flows-fullface',         label: 'Fluxos de Mensagens',     breadcrumb: 'Full Face > Fluxos de Mensagens' },
        { page: 'leads-tags-fullface',         label: 'Tags',                    breadcrumb: 'Full Face > Tags' },
        { page: 'captacao-alertas-fullface',   label: 'Alertas e Oportunidades', breadcrumb: 'Full Face > Alertas e Oportunidades' },
        { page: 'facial-analysis',             label: 'Análise Facial IA',       breadcrumb: 'Full Face > Análise Facial IA',       plans: [PLANS.PREMIUM] },
        { page: 'facial-simulations',          label: 'Simulações',              breadcrumb: 'Full Face > Simulações',              plans: [PLANS.PREMIUM] },
      ],
    },

    // ── Captação Procedimentos Isolados ───────────────────────────
    {
      section: 'captacao-protocolos',
      icon:    'activity',
      label:   'Procedimentos',
      roles:   [ROLES.OWNER, ROLES.ADMIN, ROLES.RECEPTIONIST],
      plans:   [],
      pages: [
        { page: 'leads-protocolos',            label: 'Leads',                   breadcrumb: 'Procedimentos > Leads' },
        { page: 'sdh-protocolos',              label: 'SDR',                     breadcrumb: 'Procedimentos > SDR',                 highlight: true, roles: [ROLES.OWNER, ROLES.ADMIN] },
        { page: 'quiz-protocolos',             label: 'Quiz',                    breadcrumb: 'Procedimentos > Quiz',                roles: [ROLES.OWNER, ROLES.ADMIN] },
        { page: 'msg-bank-protocolos',         label: 'Banco de Mensagens',      breadcrumb: 'Procedimentos > Banco de Mensagens' },
        { page: 'auto-flows-protocolos',       label: 'Fluxos de Mensagens',     breadcrumb: 'Procedimentos > Fluxos de Mensagens' },
        { page: 'leads-tags-protocolos',       label: 'Tags',                    breadcrumb: 'Procedimentos > Tags' },
        { page: 'captacao-alertas-protocolos', label: 'Alertas e Oportunidades', breadcrumb: 'Procedimentos > Alertas e Oportunidades' },
      ],
    },

    // ── Captação — Geral (pendente de uso) ────────────────────────
    {
      section: 'captacao-geral',
      icon:    'inbox',
      label:   'Captação — Geral',
      roles:   [ROLES.OWNER, ROLES.ADMIN],
      plans:   [],
      pages: [
        { page: 'captacao-overview',  label: 'Visão Geral',           breadcrumb: 'Captação > Visão Geral' },
        { page: 'leads-reactivation', label: 'Reativação de Leads',   breadcrumb: 'Captação > Reativação de Leads' },
        { page: 'sdh-history',        label: 'SDR Histórico',         breadcrumb: 'Captação > SDR Histórico' },
        { page: 'captacao-automacao', label: 'Automação de Captação', breadcrumb: 'Captação > Automação',            plans: [PLANS.PREMIUM] },
      ],
    },

    // ── Agenda ───────────────────────────────────────────────────
    {
      section: 'agenda',
      icon:    'calendar',
      label:   'Agenda',
      roles:   [ROLES.OWNER, ROLES.ADMIN, ROLES.THERAPIST, ROLES.RECEPTIONIST],
      plans:   [],
      pages: [
        { page: 'agenda',          label: 'Agenda',        breadcrumb: 'Agenda > Agenda' },
        { page: 'agenda-overview', label: 'Visão Geral',   breadcrumb: 'Agenda > Visão Geral' },
        { page: 'agenda-reports',  label: 'Relatórios',    breadcrumb: 'Agenda > Relatórios' },
        { page: 'agenda-eventos',  label: 'Eventos',       breadcrumb: 'Agenda > Eventos' },
        { page: 'agenda-tags',     label: 'Tags e Fluxos', breadcrumb: 'Agenda > Tags e Fluxos' },
        { page: 'agenda-messages', label: 'Mensagens',     breadcrumb: 'Agenda > Mensagens' },
      ],
    },

    // ── Pacientes ────────────────────────────────────────────────
    {
      section: 'patients',
      icon:    'heart',
      label:   'Pacientes',
      roles:   [ROLES.OWNER, ROLES.ADMIN, ROLES.THERAPIST, ROLES.RECEPTIONIST],
      plans:   [],
      pages: [
        { page: 'patients-all',                label: 'Pacientes',                    breadcrumb: 'Pacientes > Pacientes' },
        { page: 'orcamentos',                   label: 'Orçamento',                    breadcrumb: 'Pacientes > Orçamento' },
        { page: 'patients-budget',             label: 'Paciente + Orçamento',          breadcrumb: 'Pacientes > Paciente + Orçamento' },
        { page: 'patients-overview',           label: 'Visão Geral dos Pacientes',     breadcrumb: 'Pacientes > Visão Geral' },
        { page: 'patients-active',             label: 'Pacientes Ativos',             breadcrumb: 'Pacientes > Pacientes Ativos' },
        { page: 'patients-treatment',          label: 'Pacientes em Tratamento',       breadcrumb: 'Pacientes > Em Tratamento' },
        { page: 'patients-post-consult',       label: 'Pós-consulta',                 breadcrumb: 'Pacientes > Pós-consulta' },
        { page: 'patients-post-proc',          label: 'Pós-procedimento',             breadcrumb: 'Pacientes > Pós-procedimento' },
        { page: 'patients-returns',            label: 'Retornos',                     breadcrumb: 'Pacientes > Retornos' },
        { page: 'patients-maintenance',        label: 'Manutenção',                   breadcrumb: 'Pacientes > Manutenção' },
        { page: 'patients-repurchase',         label: 'Recompra',                     breadcrumb: 'Pacientes > Recompra' },
        { page: 'patients-referral',           label: 'Indicação',                    breadcrumb: 'Pacientes > Indicação' },
        { page: 'patients-reviews',            label: 'Avaliações',                   breadcrumb: 'Pacientes > Avaliações' },
        { page: 'patients-reactivation',       label: 'Reativação de Pacientes',      breadcrumb: 'Pacientes > Reativação' },
        { page: 'patients-journey',            label: 'Jornada do Paciente',          breadcrumb: 'Pacientes > Jornada do Paciente' },
        { page: 'patients-procedures-history', label: 'Histórico de Procedimentos',   breadcrumb: 'Pacientes > Histórico de Procedimentos' },
        { page: 'patients-prontuario',         label: 'Prontuário Comercial',         breadcrumb: 'Pacientes > Prontuário Comercial',       roles: [ROLES.OWNER, ROLES.ADMIN, ROLES.THERAPIST] },
        { page: 'patients-docs',               label: 'Documentos do Paciente',       breadcrumb: 'Pacientes > Documentos do Paciente' },
      ],
    },

    // ── Orçamentos ───────────────────────────────────────────────
    {
      section: 'orcamentos',
      icon:    'file-text',
      label:   'Orçamentos',
      roles:   [ROLES.OWNER, ROLES.ADMIN, ROLES.THERAPIST, ROLES.RECEPTIONIST, ROLES.VIEWER],
      plans:   [],
      pages: [
        { page: 'orcamentos-overview',  label: 'Visão Geral de Orçamentos', breadcrumb: 'Orçamentos > Visão Geral' },
        { page: 'orcamentos-abertos',   label: 'Em Aberto',                 breadcrumb: 'Orçamentos > Em Aberto' },
        { page: 'orcamentos-aprovados', label: 'Aprovados',                 breadcrumb: 'Orçamentos > Aprovados' },
        { page: 'orcamentos-recusados', label: 'Recusados',                 breadcrumb: 'Orçamentos > Recusados' },
        { page: 'orcamentos-historico', label: 'Histórico de Orçamentos',   breadcrumb: 'Orçamentos > Histórico' },
      ],
    },

    // ── Growth e Mkt ─────────────────────────────────────────────
    {
      section: 'growth',
      icon:    'trending-up',
      label:   'Growth e Mkt',
      roles:   [ROLES.OWNER, ROLES.ADMIN],
      plans:   [PLANS.PREMIUM],  // módulo exclusivo do plano Premium
      pages: [
        { page: 'growth-overview',       label: 'Visão Geral de Growth',      breadcrumb: 'Growth > Visão Geral' },
        { page: 'growth-campaigns',      label: 'Campanhas',                  breadcrumb: 'Growth > Campanhas' },
        { page: 'growth-origins',        label: 'Origens de Leads',           breadcrumb: 'Growth > Origens de Leads' },
        { page: 'growth-channels',       label: 'Performance de Canais',      breadcrumb: 'Growth > Performance de Canais' },
        { page: 'growth-conv-campaign',  label: 'Conversão por Campanha',     breadcrumb: 'Growth > Conversão por Campanha' },
        { page: 'growth-conv-procedure', label: 'Conversão por Procedimento', breadcrumb: 'Growth > Conversão por Procedimento' },
        { page: 'growth-conv-sdh',       label: 'Conversão por SDR',          breadcrumb: 'Growth > Conversão por SDR' },
        { page: 'growth-offers',         label: 'Ofertas e Combos',           breadcrumb: 'Growth > Ofertas e Combos' },
        { page: 'growth-scripts',        label: 'Scripts Comerciais',         breadcrumb: 'Growth > Scripts Comerciais' },
        { page: 'growth-creatives',      label: 'Banco de Criativos',         breadcrumb: 'Growth > Banco de Criativos' },
        { page: 'growth-reports',        label: 'Relatórios de Growth',       breadcrumb: 'Growth > Relatórios' },
        { page: 'growth-upsell',         label: 'Upsell e Downsell',          breadcrumb: 'Growth > Upsell e Downsell' },
        { page: 'growth-scale',          label: 'Oportunidades de Escala',    breadcrumb: 'Growth > Oportunidades de Escala' },
        { page: 'growth-wa-links',       label: 'Gerador de Links WA',        breadcrumb: 'Growth > Gerador de Links WhatsApp' },
        { page: 'growth-partners',       label: 'Parceiros',                  breadcrumb: 'Growth > Parceiros' },
        { page: 'growth-referral',       label: 'Programa de Indicação',      breadcrumb: 'Growth > Programa de Indicação' },
      ],
    },

    // ── App Rejuvenescimento ─────────────────────────────────────
    {
      section: 'app-rejuvenescimento',
      icon:    'zap',
      label:   'App Rejuvenescimento',
      roles:   [ROLES.OWNER, ROLES.ADMIN, ROLES.THERAPIST],
      plans:   [PLANS.PREMIUM],  // app exclusivo do plano Premium
      pages: [
        { page: 'rejuv-dashboard', label: 'Dashboard',          breadcrumb: 'App Rejuvenescimento > Dashboard' },
        { page: 'rejuv-leads',     label: 'Leads',              breadcrumb: 'App Rejuvenescimento > Leads' },
        { page: 'rejuv-msg-bank',  label: 'Banco de Mensagens', breadcrumb: 'App Rejuvenescimento > Banco de Mensagens' },
      ],
    },

    // ── Financeiro ───────────────────────────────────────────────
    {
      section: 'financeiro',
      icon:    'dollar-sign',
      label:   'Financeiro',
      roles:   [ROLES.OWNER, ROLES.ADMIN, ROLES.VIEWER],
      plans:   [],
      pages: [
        { page: 'fin-goals',    label: 'Metas Financeiras',      breadcrumb: 'Financeiro > Metas Financeiras' },
        { page: 'fin-reports',  label: 'Relatórios Financeiros', breadcrumb: 'Financeiro > Relatórios Financeiros' },
      ],
    },

    // ── Configurações ────────────────────────────────────────────
    {
      section: 'settings',
      icon:    'settings',
      label:   'Configurações',
      roles:   [ROLES.OWNER, ROLES.ADMIN],
      plans:   [],
      pages: [
        { page: 'settings-clinic',       label: 'Dados da Clínica',       breadcrumb: 'Configurações > Dados da Clínica' },
        { page: 'settings-integrations', label: 'Integrações',            breadcrumb: 'Configurações > Integrações' },
        { page: 'settings-whatsapp',     label: 'WhatsApp e Mensageria',   breadcrumb: 'Configurações > WhatsApp e Mensageria' },
        { page: 'settings-ai',           label: 'IA e Prompts',           breadcrumb: 'Configurações > IA e Prompts' },
        { page: 'settings-tags',         label: 'Tags e Fluxos',          breadcrumb: 'Configurações > Tags e Fluxos' },
        { page: 'settings-automation',   label: 'Automação',              breadcrumb: 'Configurações > Automação' },
        { page: 'settings-security',     label: 'Segurança',              breadcrumb: 'Configurações > Segurança' },
        { page: 'settings-backups',      label: 'Backups',                breadcrumb: 'Configurações > Backups' },
        { page: 'settings-logs',         label: 'Logs do Sistema',        breadcrumb: 'Configurações > Logs do Sistema' },
        { page: 'settings-anamnese',     label: 'Fichas de Anamnese',     breadcrumb: 'Configurações > Fichas de Anamnese' },
      ],
    },

  ]

  // ── Exposição global ───────────────────────────────────────────
  Object.assign(window, { ROLES, PLANS, NAV_CONFIG })

})()
