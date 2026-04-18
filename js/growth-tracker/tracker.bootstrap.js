/**
 * Growth Tracker — Bootstrap
 * Point de entrada. Renderiza rows nos containers dos sprints,
 * injeta progress bars, "Esta semana", stall warnings, e wire-a eventos.
 */
(function (global) {
  'use strict';

  const Data = global.GrowthTrackerData;
  const Repo = global.GrowthTrackerRepository;
  const Svc  = global.GrowthTrackerService;
  const UI   = global.GrowthTrackerUI;

  function renderSprintRows() {
    Data.SPRINTS.forEach(sprint => {
      const container = document.querySelector(`[data-sprint-rows="${sprint.id}"]`);
      if (!container) return;
      const items = Data.itemsBySprint(sprint.id);
      container.innerHTML = items.map(it => UI.renderRow(it)).join('');
    });

    // Render monitors (riscos)
    const monitorContainer = document.querySelector('[data-sprint-rows="rk"]');
    if (monitorContainer) {
      const items = Data.itemsBySprint('rk');
      monitorContainer.innerHTML = items.map(it => UI.renderRow(it)).join('');
    }
  }

  function wireGlobalEvents() {
    const host = document.body;
    UI.wireEvents(host);

    // Rerender derived views quando state muda
    window.addEventListener('growth-tracker:change', () => {
      UI.rerenderDerived();
    });

    // Botão export CSV
    const exportBtn = document.querySelector('[data-action="export-csv"]');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => Svc.downloadCSV());
    }

    // Botão reset
    const resetBtn = document.querySelector('[data-action="reset-tracker"]');
    if (resetBtn) {
      resetBtn.addEventListener('click', () => {
        const ok = confirm('Apagar todo o progresso gravado no tracker? Isso não pode ser desfeito.');
        if (!ok) return;
        Repo.resetAll();
        renderSprintRows();
        UI.rerenderDerived();
      });
    }

    // Jump-to links (stall warnings)
    document.addEventListener('click', (e) => {
      const link = e.target.closest('[data-jump-to]');
      if (!link) return;
      e.preventDefault();
      const id = link.dataset.jumpTo;
      const row = document.querySelector(`.tracker-row[data-item-id="${id}"]`);
      if (row) {
        row.scrollIntoView({ behavior: 'smooth', block: 'center' });
        row.classList.add('tracker-row--highlight');
        setTimeout(() => row.classList.remove('tracker-row--highlight'), 1600);
      }
    });
  }

  function init() {
    if (!Data || !Repo || !Svc || !UI) {
      console.error('[growth-tracker] dependências não carregadas');
      return;
    }
    renderSprintRows();
    UI.rerenderDerived();
    wireGlobalEvents();
    console.info('[growth-tracker] pronto · items:', Data.ITEMS.length);

    // Re-render depois que o hydrate do Supabase concluir
    document.addEventListener(Repo.EVT_HYDRATED, function (e) {
      var detail = (e && e.detail) || {};
      console.info('[growth-tracker] hydrated ·', detail.source, '· itens:', detail.itemCount || 0);
      renderSprintRows();
      UI.rerenderDerived();
    });

    // Hidrata do Supabase (async). Se _sbShared não carregou ainda,
    // espera até 5s tentando a cada 250ms.
    var tries = 0;
    var timer = setInterval(function () {
      tries++;
      if (global._sbShared && global._sbShared.rpc) {
        clearInterval(timer);
        Repo.hydrate();
      } else if (tries > 20) {
        clearInterval(timer);
        console.info('[growth-tracker] _sbShared nao disponivel — cache-only');
      }
    }, 250);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  global.GrowthTracker = Object.freeze({
    init,
    renderSprintRows,
  });
})(window);
