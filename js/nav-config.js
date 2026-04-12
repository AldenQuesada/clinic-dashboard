/* v20260406a */
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
        { page: 'facial-analysis',             label: 'Análise Facial IA',       breadcrumb: 'Full Face > Análise Facial IA' },
        { page: 'facial-simulations',          label: 'Simulações',              breadcrumb: 'Full Face > Simulações' },
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

    // ── Agenda ───────────────────────────────────────────────────
    {
      section: 'agenda',
      icon:    'calendar',
      label:   'Agenda',
      roles:   [ROLES.OWNER, ROLES.ADMIN, ROLES.THERAPIST, ROLES.RECEPTIONIST],
      plans:   [],
      pages: [
        { page: 'agenda',           label: 'Agenda',        breadcrumb: 'Agenda > Agenda' },
        { page: 'agenda-overview',  label: 'Visao Geral',   breadcrumb: 'Agenda > Visao Geral' },
        { page: 'agenda-agendados', label: 'Agendados',     breadcrumb: 'Agenda > Agendados' },
        { page: 'agenda-cancelados',label: 'Cancelados',    breadcrumb: 'Agenda > Cancelados' },
        { page: 'agenda-reports',   label: 'Relatorios',    breadcrumb: 'Agenda > Relatorios' },
        { page: 'agenda-eventos',   label: 'Eventos',       breadcrumb: 'Agenda > Eventos' },
        { page: 'agenda-tags',      label: 'Tags e Fluxos', breadcrumb: 'Agenda > Tags e Fluxos' },
        { page: 'agenda-automations', label: 'Automacoes',  breadcrumb: 'Agenda > Automacoes' },
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
        { page: 'orcamentos',                  label: 'Orçamentos',                   breadcrumb: 'Pacientes > Orçamentos' },
        { page: 'patients-procedures-history', label: 'Historico de Procedimentos',   breadcrumb: 'Pacientes > Historico de Procedimentos' },
        { page: 'patients-prontuario',         label: 'Prontuario Comercial',         breadcrumb: 'Pacientes > Prontuario Comercial',       roles: [ROLES.OWNER, ROLES.ADMIN, ROLES.THERAPIST] },
        { page: 'patients-docs',               label: 'Documentos do Paciente',       breadcrumb: 'Pacientes > Documentos do Paciente' },
      ],
    },

    // ── WhatsApp ──────────────────────────────────────────────────
    {
      section: 'whatsapp',
      icon:    'message-circle',
      label:   'WhatsApp',
      roles:   [],
      plans:   [],
      pages: [
        { page: 'analytics-wa',         label: 'AI Analytics WhatsApp',  breadcrumb: 'WhatsApp > AI Analytics' },
        { page: 'inbox',                label: 'Central de WhatsApp',    breadcrumb: 'WhatsApp > Central',           highlight: true },
        { page: 'wa-disparos',          label: 'Disparos',              breadcrumb: 'WhatsApp > Disparos' },
        { page: 'settings-automation',  label: 'Fluxos e Regras',       breadcrumb: 'WhatsApp > Fluxos e Regras' },
        { page: 'birthday-campaigns',  label: 'Aniversarios',          breadcrumb: 'WhatsApp > Aniversarios',       highlight: true },
        { page: 'growth-wa-links',     label: 'Links WhatsApp',        breadcrumb: 'WhatsApp > Links WhatsApp' },
        { page: 'short-links',         label: 'Encurtador de Links',   breadcrumb: 'WhatsApp > Encurtador de Links' },
        { page: 'page-builder',        label: 'Construtor de P\u00e1ginas', breadcrumb: 'WhatsApp > Construtor de P\u00e1ginas', highlight: true },
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

    // ── Ferramentas ─────────────────────────────────────────────
    {
      section: 'ferramentas',
      icon:    'tool',
      label:   'Ferramentas',
      roles:   [ROLES.OWNER, ROLES.ADMIN],
      plans:   [],
      pages: [
        { page: 'facial-analysis',    label: 'Análise Facial',  breadcrumb: 'Ferramentas > Análise Facial',  highlight: true },
        { page: 'facial-simulations', label: 'Simulações',      breadcrumb: 'Ferramentas > Simulações' },
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
        { page: 'settings-templates',    label: 'Templates de Mensagem',  breadcrumb: 'Configurações > Templates de Mensagem' },
        { page: 'clinic-menu',           label: 'Menu da Clinica',         breadcrumb: 'Configurações > Menu da Clinica' },
        { page: 'settings-security',     label: 'Segurança',              breadcrumb: 'Configurações > Segurança' },
        { page: 'settings-backups',      label: 'Backups',                breadcrumb: 'Configurações > Backups' },
        { page: 'settings-logs',         label: 'Logs do Sistema',        breadcrumb: 'Configurações > Logs do Sistema' },
        { page: 'settings-anamnese',     label: 'Fichas de Anamnese',     breadcrumb: 'Configurações > Fichas de Anamnese' },
        { page: 'settings-documentos',   label: 'Documentos Legais',      breadcrumb: 'Configurações > Documentos Legais' },
      ],
    },

  ]

  // ── Exposição global ───────────────────────────────────────────
  Object.assign(window, { ROLES, PLANS, NAV_CONFIG })

})()
