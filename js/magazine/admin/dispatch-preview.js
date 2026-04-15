/* ============================================================================
 * Beauty & Health Magazine — Dispatch Preview (WhatsApp + UTM)
 *
 * Modal que simula as mensagens WhatsApp do dispatch (D+0, D+1, D+7) com o
 * link assinado real (magazine_sign_lead_link) — usando o UUID do próprio
 * usuário autenticado como lead de preview, igual ao botão "Ver".
 *
 * Também injeta UTM automático na URL quando aplicável:
 *   ?utm_source=magazine&utm_medium=whatsapp&utm_campaign={edition_slug}
 *
 * Expõe: window.MagazineAdmin.DispatchPreview
 *   - mount(host, sb) → controller { open(edition) }
 *   - appendUTM(url, campaign) → url com UTM
 * ============================================================================ */
;(function () {
  'use strict'

  const TEMPLATES = [
    {
      key: 'd0',
      label: 'D+0 · Lançamento',
      body: (ed, link) =>
        `Oi [nome]! Saiu a edição de ${ed.monthLabel || 'abril'} da Beauty & Health 💎\n\n` +
        `${ed.title || 'Nova edição disponível'}\n${ed.subtitle ? ed.subtitle + '\n' : ''}\n` +
        `Leitura de ~3min · Veja aqui:\n${link}\n\n` +
        `Achou algo especial? Me conta 🤍`,
    },
    {
      key: 'd1',
      label: 'D+1 · Lembrete leitoras não abertas',
      body: (ed, link) =>
        `[nome], separei essa edição especialmente pra você 💭\n\n` +
        `${ed.title || 'Beauty & Health'} · 2min de leitura\n` +
        `${link}\n\n` +
        `Há uma surpresa escondida nas páginas 🎁`,
    },
    {
      key: 'd7',
      label: 'D+7 · Reengajamento',
      body: (ed, link) =>
        `[nome], a edição ${ed.monthLabel || ''} fica disponível até domingo 📖\n\n` +
        `${link}\n\n` +
        `Se leu e curtiu, me conta o que mais te chamou atenção — você ganha cashback ✨`,
    },
  ]

  const SEGMENTS = [
    { key: 'vip',     label: 'VIP' },
    { key: 'active',  label: 'Ativo' },
    { key: 'at_risk', label: 'Em risco' },
    { key: 'dormant', label: 'Dormente' },
    { key: 'lead',    label: 'Lead' },
  ]

  function appendUTM(url, campaign) {
    if (!url) return url
    if (!/^https?:\/\/|wa\.me/.test(url)) return url
    if (url.includes('utm_source=')) return url
    const sep = url.includes('?') ? '&' : '?'
    const params = [
      'utm_source=magazine',
      'utm_medium=whatsapp',
      campaign ? `utm_campaign=${encodeURIComponent(campaign)}` : null,
    ].filter(Boolean).join('&')
    return `${url}${sep}${params}`
  }

  function mount(host, sb) {
    host.innerHTML = `
      <div class="dp-overlay" data-open="0">
        <div class="dp-modal">
          <div class="dp-head">
            <div class="dp-title">Preview WhatsApp · Dispatch</div>
            <button class="dp-close" data-act="close">×</button>
          </div>
          <div class="dp-body">
            <div class="dp-controls">
              <label>Segmento:</label>
              <select data-role="segment">
                ${SEGMENTS.map(s => `<option value="${s.key}">${s.label}</option>`).join('')}
              </select>
              <label>Modelo:</label>
              <select data-role="template">
                ${TEMPLATES.map(t => `<option value="${t.key}">${t.label}</option>`).join('')}
              </select>
              <button class="dp-btn" data-act="refresh">↻ Atualizar</button>
            </div>
            <div class="dp-link-row">
              <span class="dp-link-label">Link gerado:</span>
              <code class="dp-link" data-role="link">—</code>
              <button class="dp-btn sm" data-act="copy-link">Copiar</button>
            </div>
            <div class="dp-chat-preview" data-role="chat"></div>
            <div class="dp-footer-note">
              O link é assinado com HMAC e inclui UTM automaticamente.
              Leitor valida via RPC <code>magazine_get_edition_public</code>.
            </div>
          </div>
        </div>
      </div>
    `

    const overlay = host.querySelector('.dp-overlay')
    const segEl = host.querySelector('[data-role="segment"]')
    const tplEl = host.querySelector('[data-role="template"]')
    const linkEl = host.querySelector('[data-role="link"]')
    const chatEl = host.querySelector('[data-role="chat"]')

    let ed = null

    host.querySelector('[data-act="close"]').addEventListener('click', close)
    host.querySelector('[data-act="refresh"]').addEventListener('click', render)
    host.querySelector('[data-act="copy-link"]').addEventListener('click', () => {
      try { navigator.clipboard?.writeText(linkEl.textContent || '') } catch (e) {}
    })
    segEl.addEventListener('change', render)
    tplEl.addEventListener('change', render)
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close() })
    document.addEventListener('keydown', (e) => {
      if (overlay.dataset.open === '1' && e.key === 'Escape') close()
    })

    async function buildLink(edition) {
      // Usa o próprio UUID do usuário como lead de preview (mesma lógica de viewLive)
      let base = `${location.origin}/revista-live.html?edition=${encodeURIComponent(edition.slug)}&preview=1`
      try {
        const { data: { user } } = await sb.auth.getUser()
        if (user && user.id) {
          try {
            const { data: sig } = await sb.rpc('magazine_sign_lead_link', {
              p_lead_id: user.id,
              p_edition_id: edition.id,
            })
            if (sig) base = `${location.origin}/revista-live.html?edition=${encodeURIComponent(edition.slug)}&lead=${user.id}&h=${sig}`
          } catch (e) { /* HMAC não configurado — segue sem assinar */ }
        }
      } catch (e) {}
      return appendUTM(base, edition.slug)
    }

    async function render() {
      if (!ed) return
      const link = await buildLink(ed)
      linkEl.textContent = link
      const tpl = TEMPLATES.find(t => t.key === tplEl.value) || TEMPLATES[0]
      const seg = SEGMENTS.find(s => s.key === segEl.value) || SEGMENTS[0]
      const body = tpl.body(
        { title: ed.title, subtitle: ed.subtitle, monthLabel: extractMonthLabel(ed) },
        link
      )
      chatEl.innerHTML = `
        <div class="dp-chat-header">Conversa com lead · segmento <strong>${seg.label}</strong></div>
        <div class="dp-bubble out">${escapeHtml(body).replace(/\n/g, '<br/>')}</div>
      `
    }

    function extractMonthLabel(edition) {
      // Tenta extrair "abril 2026" do título ou slug
      const m = (edition.title || edition.slug || '').match(/(janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)/i)
      return m ? m[0].toLowerCase() : null
    }

    function open(edition) {
      ed = edition
      overlay.dataset.open = '1'
      render()
    }

    function close() {
      overlay.dataset.open = '0'
      ed = null
    }

    function escapeHtml(s) {
      if (s == null) return ''
      return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
    }

    return { open, close }
  }

  window.MagazineAdmin = window.MagazineAdmin || {}
  window.MagazineAdmin.DispatchPreview = { mount, appendUTM }
})()
