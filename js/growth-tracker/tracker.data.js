/**
 * Growth Tracker — Data & Metadata
 * Source-of-truth dos 30+ items do plano de growth.
 * Items têm ID estável para persistência cross-sessão.
 */
(function (global) {
  'use strict';

  const OWNERS = [
    { id: 'alden',  label: 'Alden'  },
    { id: 'claude', label: 'Claude' },
    { id: 'mirian', label: 'Mirian' },
  ];

  const SPRINTS = [
    { id: 's1', title: 'Sprint 1 — Fechar torneiras abertas', range: 'Dias 1 – 15' },
    { id: 's2', title: 'Sprint 2 — Integrar os três loops',   range: 'Dias 16 – 45' },
    { id: 's3', title: 'Sprint 3 — Abrir novos canais',       range: 'Dias 46 – 90' },
  ];

  // RICE score numérico pra ordenação "Esta semana".
  // Items sem número exato usam escala qualitativa: 9999 = altíssimo, 3000+ = alto.
  const ITEMS = [
    // ── Sprint 1 ─────────────────────────────────────────────────
    { id: 's1-1', sprint: 's1', title: 'Plugar vpi_link_attribution_to_lead',
      where: 'js/patients.js createLead + modal agendamento', effort: '2h', rice: 9999,
      quickWin: true, dependencies: [] },
    { id: 's1-2', sprint: 's1', title: 'Ativar challenge sazonal (Mês da Mãe 1.5x)',
      where: 'Aba "Desafios" admin', effort: '10min', rice: 9998,
      quickWin: true, dependencies: [] },
    { id: 's1-3', sprint: 's1', title: 'Configurar vpi_staff_alert_phone',
      where: 'Aba Config VPI', effort: '5min', rice: 9997,
      quickWin: true, dependencies: [] },
    { id: 's1-4', sprint: 's1', title: 'Revisar 5 templates WA',
      where: 'saudade, alerta tier, dormente, reativação, cortesia', effort: '1h', rice: 8000,
      quickWin: true, dependencies: [] },
    { id: 's1-5', sprint: 's1', title: 'Publicar edição 1 da revista',
      where: 'Editor admin (destravar pendência)', effort: '1 dia', rice: 400,
      quickWin: false, dependencies: [] },
    { id: 's1-6', sprint: 's1', title: 'Definir NSM + metas com Mirian',
      where: 'Reunião 1:1', effort: '30min', rice: 7000,
      quickWin: false, dependencies: [] },
    { id: 's1-7', sprint: 's1', title: 'Expandir saudade para inativas não-parceiras',
      where: 'RPC + scan semelhante ao VPI', effort: '4h', rice: 600,
      quickWin: false, dependencies: [] },

    // ── Quick Win isolado (não é de sprint) ──────────────────────
    { id: 'qw-4', sprint: 's1', title: 'Disparar lembretes dormentes agora',
      where: 'Botão "Enviar lembretes" aba Ranking VPI', effort: '1min', rice: 8500,
      quickWin: true, dependencies: [] },

    // ── Sprint 2 ─────────────────────────────────────────────────
    { id: 's2-1', sprint: 's2', title: 'Quiz → VPI bridge',
      where: 'No close do quiz: se lead finalizar em ≤30d, autoEnroll VPI', effort: '1 dia', rice: 1200,
      quickWin: false, dependencies: ['s1-1'] },
    { id: 's2-2', sprint: 's2', title: 'Aniversário → VPI bridge',
      where: 'Aniversariante ativa (2+ appts, sem VPI) recebe convite', effort: '4h', rice: 800,
      quickWin: false, dependencies: ['s1-1'] },
    { id: 's2-3', sprint: 's2', title: 'NPS pós-procedimento D+7',
      where: 'WA automation: nota ≥9 dispara convite VPI + depoimento', effort: '2 dias', rice: 420,
      quickWin: false, dependencies: [] },
    { id: 's2-4', sprint: 's2', title: 'Depoimentos → Revista',
      where: 'Celebration feed consentido vira matéria automática', effort: '2 dias', rice: 300,
      quickWin: false, dependencies: ['s1-5', 's2-3'] },
    { id: 's2-5', sprint: 's2', title: 'Instagram auto-post',
      where: 'Meta Graph API ou staff manual com template', effort: '3 dias', rice: 250,
      quickWin: false, dependencies: [] },
    { id: 's2-6', sprint: 's2', title: 'Dashboard LTV/CAC por canal',
      where: 'RPC agrupa vpi_partner_attribution + cashflow, nova aba Growth', effort: '2 dias', rice: 700,
      quickWin: false, dependencies: ['s1-1'] },

    // ── Sprint 3 ─────────────────────────────────────────────────
    { id: 's3-1', sprint: 's3', title: 'SEO básico na revista',
      where: 'meta tags, sitemap, schema.org Article, links internos', effort: '1 dia', rice: 2000,
      quickWin: false, dependencies: ['s1-5'] },
    { id: 's3-2', sprint: 's3', title: 'Página Parceiros B2B2C ativada',
      where: 'dermato, spa, salão com deep-link + comissão VPI', effort: '2 dias', rice: 500,
      quickWin: false, dependencies: ['s1-1'] },
    { id: 's3-3', sprint: 's3', title: 'Paid ads track',
      where: 'campanhas com UTM padronizado; r.html já rastreia 302', effort: '1 dia + contínuo', rice: 600,
      quickWin: false, dependencies: ['s1-1', 's2-6'] },
    { id: 's3-4', sprint: 's3', title: 'Landing pages por queixa',
      where: 'Smooth Eyes, Full Face, Lifting 5D com quiz + CTA VPI', effort: '3 dias', rice: 700,
      quickWin: false, dependencies: ['s3-1'] },
    { id: 's3-5', sprint: 's3', title: 'Email/SMS como canal secundário',
      where: 'Backup para LGPD opt-out', effort: '2 dias', rice: 150,
      quickWin: false, dependencies: [] },
    { id: 's3-6', sprint: 's3', title: 'Eventos presenciais Diamante',
      where: '1 jantar trimestral com parceiras top', effort: 'operacional', rice: 200,
      quickWin: false, dependencies: [] },

    // ── Riscos a monitorar (tipo = monitor, não check-once) ──────
    { id: 'rk-1', sprint: 'rk', title: 'Monitorar saturação WA (opt-out ≥ 5%)',
      where: 'vpi_partners.opt_out_at', effort: 'weekly', rice: 0,
      quickWin: false, dependencies: [], monitor: true },
    { id: 'rk-2', sprint: 'rk', title: 'Monitorar canibalização preço parceira',
      where: 'Margem por procedimento', effort: 'monthly', rice: 0,
      quickWin: false, dependencies: [], monitor: true },
    { id: 'rk-3', sprint: 'rk', title: 'Monitorar alcance Instagram',
      where: 'Algoritmo pune spam', effort: 'weekly', rice: 0,
      quickWin: false, dependencies: [], monitor: true },
    { id: 'rk-4', sprint: 'rk', title: 'Auditar tier high_perf',
      where: 'Recompensa vs LTV', effort: 'monthly', rice: 0,
      quickWin: false, dependencies: [], monitor: true },
    { id: 'rk-5', sprint: 'rk', title: 'Alternar temas de challenge',
      where: 'Evitar vício no multiplier', effort: 'monthly', rice: 0,
      quickWin: false, dependencies: [], monitor: true },
  ];

  // Índice por ID para lookup O(1)
  const BY_ID = Object.freeze(
    ITEMS.reduce((acc, it) => { acc[it.id] = it; return acc; }, {})
  );

  // Helpers
  function itemsBySprint(sprintId) {
    return ITEMS.filter(it => it.sprint === sprintId);
  }

  function quickWins() {
    return ITEMS.filter(it => it.quickWin);
  }

  function byId(id) {
    return BY_ID[id] || null;
  }

  global.GrowthTrackerData = Object.freeze({
    OWNERS,
    SPRINTS,
    ITEMS: Object.freeze(ITEMS),
    BY_ID,
    itemsBySprint,
    quickWins,
    byId,
  });
})(window);
