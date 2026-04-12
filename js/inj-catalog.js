/**
 * ClinicAI — Injectable Catalog Module
 * Catálogo básico de injetáveis (lista simples, chave: clinicai_injectables).
 * Módulo distinto do sistema completo de injetáveis em injetaveis.js.
 *
 * Dependências externas:
 *   store.set()     → utils.js
 *   formatCurrency() → utils.js
 *
 * ⚠ GLOBALS OWNED BY THIS FILE:
 *   getInjectables, saveInjectable, removeInjectable
 *   renderInjectablesList, showAddInjForm, cancelInjForm
 */

// ── Injetáveis (localStorage) ─────────────────────────────────
const INJ_KEY = 'clinicai_injectables'

function getInjectables() {
  return JSON.parse(localStorage.getItem(INJ_KEY) || '[]')
}

function renderInjectablesList() {
  const list = document.getElementById('injectablesList')
  if (!list) return
  const items = getInjectables()
  if (!items.length) {
    list.innerHTML = `<div style="text-align:center;padding:32px;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:12px">Nenhum injetável cadastrado</div>`
    return
  }
  const catColors = {
    'Toxina Botulínica': '#7C3AED', 'Ácido Hialurônico': '#3B82F6',
    'Bioestimulador de Colágeno': '#10B981', 'Fios PDO': '#F59E0B',
    'Enzima': '#EF4444', 'Vitamina / Cocktail': '#EC4899', 'Outro': '#6B7280',
  }
  list.innerHTML = items.map((t, i) => {
    const cor = catColors[t.categoria] || '#6B7280'
    return `
    <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:16px 20px;margin-bottom:10px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start">
        <div style="flex:1">
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
            <div style="font-size:14px;font-weight:700;color:#111">${t.nome}</div>
            ${t.categoria ? `<span style="font-size:10px;font-weight:700;color:#fff;background:${cor};padding:2px 8px;border-radius:10px">${t.categoria}</span>` : ''}
          </div>
          <div style="font-size:12px;color:#6B7280">${[t.fabricante, t.marca, t.concentracao].filter(Boolean).join(' · ')}</div>
          <div style="display:flex;gap:10px;margin-top:6px;flex-wrap:wrap;align-items:center">
            ${t.precoFixo   ? `<span style="font-size:13px;font-weight:700;color:#10B981">${formatCurrency(t.precoFixo)}</span>` : ''}
            ${t.precoPromo  ? `<span style="font-size:12px;font-weight:600;color:#F59E0B;background:#FEF3C7;padding:2px 7px;border-radius:6px">Promo: ${formatCurrency(t.precoPromo)}</span>` : ''}
            ${t.downtime    ? `<span style="font-size:11px;color:#6B7280;background:#F3F4F6;padding:2px 7px;border-radius:6px">⏱ Downtime: ${t.downtime}</span>` : ''}
            ${t.duracaoEfeito ? `<span style="font-size:11px;color:#6B7280;background:#F3F4F6;padding:2px 7px;border-radius:6px">✨ Efeito: ${t.duracaoEfeito}</span>` : ''}
            ${t.duracao     ? `<span style="font-size:11px;color:#6B7280;background:#F3F4F6;padding:2px 7px;border-radius:6px">🕐 ${t.duracao} min</span>` : ''}
          </div>
          ${t.indicacoes  ? `<div style="font-size:12px;color:#9CA3AF;margin-top:4px">${t.indicacoes}</div>` : ''}
          ${t.cuidadosPre ? `<div style="margin-top:10px;padding:10px 12px;background:#F0FDF4;border-radius:8px;border-left:3px solid #10B981"><div style="font-size:10px;font-weight:700;color:#10B981;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Cuidados Pré</div><div style="font-size:12px;color:#374151">${t.cuidadosPre}</div></div>` : ''}
          ${t.cuidadosPos ? `<div style="margin-top:8px;padding:10px 12px;background:#FFF7ED;border-radius:8px;border-left:3px solid #F59E0B"><div style="font-size:10px;font-weight:700;color:#F59E0B;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px">Cuidados Pós</div><div style="font-size:12px;color:#374151">${t.cuidadosPos}</div></div>` : ''}
        </div>
        <div style="display:flex;flex-direction:column;gap:6px;margin-left:12px;flex-shrink:0">
          <button onclick="showAddInjForm(${i})" style="padding:5px 10px;background:#F3F4F6;color:#374151;border:none;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer">Editar</button>
          <button onclick="removeInjectable(${i})" style="padding:5px 10px;background:none;border:1px solid #FECACA;color:#EF4444;border-radius:7px;font-size:11px;font-weight:600;cursor:pointer">Remover</button>
        </div>
      </div>
    </div>`
  }).join('')
}

const INJ_FIELDS = ['si_nome','si_fabricante','si_marca','si_concentracao','si_duracao_efeito','si_preco_fixo','si_preco_promo','si_downtime','si_duracao','si_indicacoes','si_cuidados_pre','si_cuidados_pos']

function showAddInjForm(index = -1) {
  const form = document.getElementById('addInjForm')
  const title = document.getElementById('addInjFormTitle')
  const idxEl = document.getElementById('si_index')
  if (!form) return
  INJ_FIELDS.forEach(id => { const el = document.getElementById(id); if (el) el.value = '' })
  if (index >= 0) {
    const t = getInjectables()[index]
    if (!t) return
    document.getElementById('si_nome').value           = t.nome          || ''
    document.getElementById('si_fabricante').value     = t.fabricante    || ''
    document.getElementById('si_marca').value          = t.marca         || ''
    document.getElementById('si_concentracao').value   = t.concentracao  || ''
    document.getElementById('si_categoria').value      = t.categoria     || ''
    document.getElementById('si_duracao_efeito').value = t.duracaoEfeito || ''
    document.getElementById('si_preco_fixo').value     = t.precoFixo     || ''
    document.getElementById('si_preco_promo').value    = t.precoPromo    || ''
    document.getElementById('si_downtime').value       = t.downtime      || ''
    document.getElementById('si_duracao').value        = t.duracao       || ''
    document.getElementById('si_indicacoes').value     = t.indicacoes    || ''
    document.getElementById('si_cuidados_pre').value   = t.cuidadosPre   || ''
    document.getElementById('si_cuidados_pos').value   = t.cuidadosPos   || ''
    if (title) title.textContent = 'Editar Injetável'
    if (idxEl) idxEl.value = index
  } else {
    if (title) title.textContent = 'Novo Injetável'
    if (idxEl) idxEl.value = -1
  }
  form.style.display = 'block'
  form.scrollTop = 0
}

function cancelInjForm() {
  const form = document.getElementById('addInjForm')
  if (form) form.style.display = 'none'
}

function saveInjectable() {
  const nome = document.getElementById('si_nome')?.value?.trim()
  if (!nome) { _toastWarn('Informe o nome do produto'); return }
  const items = getInjectables()
  const idx = parseInt(document.getElementById('si_index')?.value ?? '-1')
  const item = {
    nome,
    fabricante:   document.getElementById('si_fabricante')?.value?.trim()     || '',
    marca:        document.getElementById('si_marca')?.value?.trim()           || '',
    concentracao: document.getElementById('si_concentracao')?.value?.trim()   || '',
    categoria:    document.getElementById('si_categoria')?.value              || '',
    duracaoEfeito:document.getElementById('si_duracao_efeito')?.value?.trim() || '',
    precoFixo:    parseFloat(document.getElementById('si_preco_fixo')?.value  || '0') || 0,
    precoPromo:   parseFloat(document.getElementById('si_preco_promo')?.value || '0') || 0,
    downtime:     document.getElementById('si_downtime')?.value?.trim()       || '',
    duracao:      parseInt(document.getElementById('si_duracao')?.value || '0') || 0,
    indicacoes:   document.getElementById('si_indicacoes')?.value?.trim()     || '',
    cuidadosPre:  document.getElementById('si_cuidados_pre')?.value?.trim()   || '',
    cuidadosPos:  document.getElementById('si_cuidados_pos')?.value?.trim()   || '',
  }
  if (idx >= 0) { items[idx] = item } else { items.push(item) }
  store.set(INJ_KEY, items)
  document.getElementById('addInjForm').style.display = 'none'
  renderInjectablesList()
}

function removeInjectable(index) {
  if (!confirm('Remover este injetável?')) return
  const items = getInjectables()
  items.splice(index, 1)
  store.set(INJ_KEY, items)
  renderInjectablesList()
}

window.showAddInjForm    = showAddInjForm
window.cancelInjForm     = cancelInjForm
window.saveInjectable    = saveInjectable
window.removeInjectable  = removeInjectable
