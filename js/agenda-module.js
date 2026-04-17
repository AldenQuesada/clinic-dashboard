;(function () {
'use strict'

// ══════════════════════════════════════════════════════════════
//  ClinicAI — Agenda Module
//  Páginas: Relatórios · Eventos · Tags e Fluxos
// ══════════════════════════════════════════════════════════════

let _relTab    = 'semana'   // semana | mes | trimestre
let _eventoTab = 'bloqueios' // bloqueios | feriados | campanhas | cursos
// Tab ativa da pagina Tags/Fluxos — segue modulos do funil:
// 'all' | 'pre_agendamento' | 'agendamento' | 'paciente' | 'orcamento' | 'paciente_orcamento' | 'perdido'
let _autoCatTab = 'all'
// Regra selecionada no drawer lateral (id ou null)
let _autoSelectedId = null
// Cache local de regras de wa_agenda_automations nesta pagina
let _autoRules = []
let _autoLoaded = false

// ── Helpers ───────────────────────────────────────────────────
function _fmtDate(d) { try { return new Date(d).toLocaleDateString('pt-BR') } catch { return '' } }
function _fmtTime(d) { try { return new Date(d).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'}) } catch { return '' } }

// ══════════════════════════════════════════════════════════════
//  RELATÓRIOS
// ══════════════════════════════════════════════════════════════
function renderAgendaRelatorios() {
  const root = document.getElementById('agenda-reports-root')
  if (!root) return

  // Dados reais via getAgendaReportData (agenda-smart.js), com fallback simulado
  const _simStats = {
    semana:    { total:0, confirmados:0, realizados:0, noshow:0, cancelados:0, remarcados:0, txComparecimento:0, txConfirmacao:0, txNoshow:0, txCancelamento:0, faturamento:0, ticketMedio:0, porDia:[] },
    mes:       { total:0, confirmados:0, realizados:0, noshow:0, cancelados:0, remarcados:0, txComparecimento:0, txConfirmacao:0, txNoshow:0, txCancelamento:0, faturamento:0, ticketMedio:0, porDia:[] },
    trimestre: { total:0, confirmados:0, realizados:0, noshow:0, cancelados:0, remarcados:0, txComparecimento:0, txConfirmacao:0, txNoshow:0, txCancelamento:0, faturamento:0, ticketMedio:0, porDia:[] },
  }
  const s = (window.getAgendaReportData ? getAgendaReportData(_relTab) : _simStats[_relTab]) || _simStats.semana

  const tabs = [
    {id:'semana',    label:'Esta semana'},
    {id:'mes',       label:'Este mês'},
    {id:'trimestre', label:'Trimestre'},
  ]

  const _fmtBRLr = v => 'R$ '+Number(v||0).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g,'.')
  const metricCards = [
    {label:'Total agendados',    value:s.total,                  icon:'calendar',     cor:'#3B82F6'},
    {label:'Realizados',         value:s.realizados,             icon:'check-circle', cor:'#10B981'},
    {label:'No-show',            value:s.noshow,                 icon:'x-circle',     cor:'#EF4444'},
    {label:'Cancelamentos',      value:s.cancelados,             icon:'slash',        cor:'#9CA3AF'},
    {label:'Remarcados',         value:s.remarcados||0,          icon:'refresh-cw',   cor:'#F59E0B'},
    {label:'Tx. comparecimento', value:s.txComparecimento+'%',   icon:'trending-up',  cor:'#059669', highlight:true},
    {label:'Faturamento',        value:_fmtBRLr(s.faturamento),  icon:'dollar-sign',  cor:'#7C3AED'},
    {label:'Ticket médio',       value:_fmtBRLr(s.ticketMedio),  icon:'bar-chart-2',  cor:'#0EA5E9'},
  ]

  const barMax = Math.max(...(s.porDia.map(d=>d.agendados||0).concat([1])))

  root.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:28px 24px">

      <!-- Cabeçalho -->
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px">
        <div>
          <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0">Relatórios da Agenda</h1>
          <p style="font-size:13px;color:#6B7280;margin:4px 0 0">Métricas de desempenho e tendências de agendamento</p>
        </div>
        <button onclick="tagsOpenCheckoutModal&&tagsOpenCheckoutModal(null,null,[])"
          style="display:flex;align-items:center;gap:6px;padding:9px 15px;background:#10B981;color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer">
          <i data-feather="log-out" style="width:13px;height:13px"></i> Registrar Saída
        </button>
      </div>

      <!-- Período -->
      <div style="display:flex;gap:4px;margin-bottom:22px">
        ${tabs.map(t=>{
          const active = _relTab === t.id
          return `<button onclick="agendaSetRelTab('${t.id}')"
            style="padding:8px 16px;border:none;border-radius:8px;font-size:12px;font-weight:${active?'700':'600'};
            background:${active?'#3B82F6':'#F3F4F6'};color:${active?'#fff':'#6B7280'};cursor:pointer;transition:.15s">
            ${t.label}
          </button>`}).join('')}
      </div>

      <!-- Métricas -->
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(170px,1fr));gap:12px;margin-bottom:24px">
        ${metricCards.map(m=>`
          <div style="background:${m.highlight?m.cor:m.cor+'0D'};border:1px solid ${m.highlight?'transparent':'#F3F4F6'};border-radius:12px;padding:16px;${m.highlight?'box-shadow:0 4px 14px '+m.cor+'44':''}">
            <div style="width:34px;height:34px;border-radius:9px;background:${m.highlight?'rgba(255,255,255,.2)':m.cor+'18'};display:flex;align-items:center;justify-content:center;margin-bottom:10px">
              <i data-feather="${m.icon}" style="width:15px;height:15px;color:${m.highlight?'#fff':m.cor}"></i>
            </div>
            <div style="font-size:28px;font-weight:800;color:${m.highlight?'#fff':'#111827'}">${m.value}</div>
            <div style="font-size:11px;color:${m.highlight?'rgba(255,255,255,.85)':'#9CA3AF'};font-weight:500;margin-top:2px">${m.label}</div>
          </div>`).join('')}
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">

        <!-- Gráfico de barras por dia -->
        ${s.porDia.length ? `
        <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:20px">
          <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:16px;display:flex;align-items:center;gap:6px">
            <i data-feather="bar-chart-2" style="width:14px;height:14px;color:#3B82F6"></i> Agendamentos por dia
          </div>
          <div style="display:flex;gap:10px;align-items:flex-end;height:140px">
            ${s.porDia.map(d=>{
              const h  = Math.round((d.agendados/barMax)*120)
              const hr = Math.round((d.realizados/barMax)*120)
              const hn = Math.round((d.noshow/barMax)*120)
              return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
                <div style="font-size:10px;font-weight:700;color:#374151">${d.agendados}</div>
                <div style="width:100%;display:flex;gap:2px;align-items:flex-end;height:120px">
                  <div style="flex:1;background:#3B82F6;border-radius:4px 4px 0 0;height:${hr}px" title="Realizados: ${d.realizados}"></div>
                  <div style="flex:1;background:#EF4444;border-radius:4px 4px 0 0;height:${hn}px" title="No-show: ${d.noshow}"></div>
                </div>
                <div style="font-size:10px;color:#9CA3AF">${d.dia}</div>
              </div>`}).join('')}
          </div>
          <div style="display:flex;gap:12px;margin-top:12px;justify-content:center">
            <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#6B7280">
              <div style="width:10px;height:10px;border-radius:2px;background:#3B82F6"></div> Realizados
            </div>
            <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:#6B7280">
              <div style="width:10px;height:10px;border-radius:2px;background:#EF4444"></div> No-show
            </div>
          </div>
        </div>` : `
        <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:20px;display:flex;align-items:center;justify-content:center">
          <div style="text-align:center;color:#D1D5DB">
            <i data-feather="bar-chart-2" style="width:40px;height:40px;display:block;margin:0 auto 10px"></i>
            <div style="font-size:12px">Gráfico diário disponível para visualização semanal</div>
          </div>
        </div>`}

        <!-- Taxas -->
        <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:20px">
          <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:16px;display:flex;align-items:center;gap:6px">
            <i data-feather="activity" style="width:14px;height:14px;color:#7C3AED"></i> Taxas de desempenho
          </div>
          <div style="display:grid;gap:14px">
            ${[
              {label:'Comparecimento',  value:s.txComparecimento, cor:'#10B981', meta:85},
              {label:'Confirmação',     value:s.txConfirmacao,    cor:'#3B82F6', meta:80},
              {label:'No-show',         value:s.txNoshow,         cor:'#EF4444', meta:10, inverted:true},
              {label:'Cancelamentos',   value:s.txCancelamento,   cor:'#F59E0B', meta:15, inverted:true},
            ].map(r=>{
              const ok = r.inverted ? r.value <= r.meta : r.value >= r.meta
              return `<div>
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:5px">
                  <span style="font-size:12px;font-weight:600;color:#374151">${r.label}</span>
                  <div style="display:flex;align-items:center;gap:6px">
                    <span style="font-size:13px;font-weight:800;color:${r.cor}">${r.value}%</span>
                    <span style="font-size:10px;padding:1px 6px;border-radius:5px;background:${ok?'#DCFCE7':'#FEF2F2'};color:${ok?'#166534':'#991B1B'};font-weight:600">${ok?'Meta OK':'Abaixo'}</span>
                  </div>
                </div>
                <div style="height:6px;background:#F3F4F6;border-radius:3px;overflow:hidden">
                  <div style="height:100%;width:${Math.min(r.value,100)}%;background:${r.cor};border-radius:3px;transition:.4s"></div>
                </div>
                <div style="font-size:10px;color:#9CA3AF;margin-top:3px">Meta: ${r.inverted?'até':'mín.'} ${r.meta}%</div>
              </div>`}).join('')}
          </div>
        </div>

      </div>

      <!-- Insights automáticos -->
      <div style="margin-top:16px;background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:18px 20px">
        <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:12px;display:flex;align-items:center;gap:6px">
          <i data-feather="zap" style="width:13px;height:13px;color:#F59E0B"></i> Insights automáticos
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:10px">
          ${[
            s.txNoshow > 15 ? {icon:'alert-triangle',cor:'#EF4444',msg:`Taxa de no-show em ${s.txNoshow}% — acima do ideal de 10%. Ative o fluxo de confirmação 48h antes.`} : null,
            s.txComparecimento >= 85 ? {icon:'trending-up',cor:'#10B981',msg:`Ótima taxa de comparecimento: ${s.txComparecimento}%. Continue com os lembretes automáticos.`} : null,
            s.reagendados > 5 ? {icon:'refresh-cw',cor:'#F59E0B',msg:`${s.reagendados} reagendamentos no período. Verifique padrões de cancelamento.`} : null,
            {icon:'info',cor:'#3B82F6',msg:'Dados simulados. Serão atualizados automaticamente quando a integração com leads e pacientes estiver ativa.'},
          ].filter(Boolean).map(i=>`
            <div style="padding:10px 13px;background:${i.cor}0A;border:1px solid ${i.cor}22;border-radius:9px;display:flex;gap:8px;align-items:flex-start">
              <i data-feather="${i.icon}" style="width:13px;height:13px;color:${i.cor};flex-shrink:0;margin-top:1px"></i>
              <span style="font-size:11.5px;color:#374151;line-height:1.5">${i.msg}</span>
            </div>`).join('')}
        </div>
      </div>

    </div>`
  featherIn(root)
}

// ══════════════════════════════════════════════════════════════
//  EVENTOS
// ══════════════════════════════════════════════════════════════
function renderAgendaEventos() {
  const root = document.getElementById('agenda-eventos-root')
  if (!root) return

  const tabs = [
    { id:'bloqueios',  label:'Bloqueios',       icon:'lock'        },
    { id:'feriados',   label:'Feriados e Datas', icon:'calendar'    },
    { id:'campanhas',  label:'Campanhas',        icon:'zap'         },
    { id:'cursos',     label:'Cursos e Eventos', icon:'users'       },
  ]

  const EVENTS_KEY = 'clinicai_agenda_events'
  const events = JSON.parse(localStorage.getItem(EVENTS_KEY) || '[]')

  root.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:28px 24px">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:22px">
        <div>
          <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0">Eventos da Agenda</h1>
          <p style="font-size:13px;color:#6B7280;margin:4px 0 0">Bloqueios, feriados, campanhas e eventos que afetam a disponibilidade</p>
        </div>
        <button onclick="agendaEventoNovo()" style="display:flex;align-items:center;gap:6px;padding:9px 15px;background:#7C3AED;color:#fff;border:none;border-radius:9px;font-size:12px;font-weight:700;cursor:pointer">
          <i data-feather="plus" style="width:13px;height:13px"></i> Novo Evento
        </button>
      </div>

      <div style="display:flex;gap:4px;margin-bottom:22px;border-bottom:1px solid #F3F4F6">
        ${tabs.map(t=>{
          const active = _eventoTab === t.id
          return `<button onclick="agendaSetEventoTab('${t.id}')"
            style="display:flex;align-items:center;gap:6px;padding:9px 16px;border:none;border-bottom:2.5px solid ${active?'#7C3AED':'transparent'};background:transparent;font-size:12px;font-weight:${active?'700':'600'};color:${active?'#7C3AED':'#6B7280'};cursor:pointer;white-space:nowrap;flex-shrink:0;transition:.15s">
            <i data-feather="${t.icon}" style="width:12px;height:12px"></i>${t.label}
          </button>`}).join('')}
      </div>

      <div id="evento-tab-content">
        ${_eventoTabAtivo(events)}
      </div>
    </div>`
  featherIn(root)
}

function _eventoTabAtivo(events) {
  const tipo = { bloqueios:'bloqueio', feriados:'feriado', campanhas:'campanha', cursos:'curso' }[_eventoTab] || 'bloqueio'
  const filtered = events.filter(e => e.tipo === tipo)
  const colors = { bloqueio:'#EF4444', feriado:'#3B82F6', campanha:'#10B981', curso:'#8B5CF6' }
  const color = colors[tipo] || '#7C3AED'

  if (_eventoTab === 'bloqueios') {
    return `
      <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:14px">
        ${!filtered.length ? `<div style="grid-column:1/-1;text-align:center;padding:40px;color:#9CA3AF;font-size:13px">
          <i data-feather="lock" style="width:32px;height:32px;display:block;margin:0 auto 12px;color:#E5E7EB"></i>
          Nenhum bloqueio ativo. Clique em <strong>Novo Evento</strong> para bloquear sala ou profissional.
        </div>` : filtered.map(e => _eventoCard(e, color)).join('')}

        <!-- Cards de ação rápida -->
        <div onclick="agendaEventoNovo('bloqueio_sala')" style="border:2px dashed #E5E7EB;border-radius:12px;padding:20px;cursor:pointer;display:flex;align-items:center;gap:12px;transition:border-color .15s" onmouseover="this.style.borderColor='#EF4444'" onmouseout="this.style.borderColor='#E5E7EB'">
          <div style="width:38px;height:38px;border-radius:9px;background:#FEF2F2;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i data-feather="home" style="width:16px;height:16px;color:#EF4444"></i>
          </div>
          <div><div style="font-size:13px;font-weight:700;color:#374151">Bloquear Sala</div><div style="font-size:11px;color:#9CA3AF">Sala indisponível por período</div></div>
        </div>
        <div onclick="agendaEventoNovo('bloqueio_prof')" style="border:2px dashed #E5E7EB;border-radius:12px;padding:20px;cursor:pointer;display:flex;align-items:center;gap:12px;transition:border-color .15s" onmouseover="this.style.borderColor='#F59E0B'" onmouseout="this.style.borderColor='#E5E7EB'">
          <div style="width:38px;height:38px;border-radius:9px;background:#FFFBEB;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i data-feather="user-x" style="width:16px;height:16px;color:#F59E0B"></i>
          </div>
          <div><div style="font-size:13px;font-weight:700;color:#374151">Bloquear Profissional</div><div style="font-size:11px;color:#9CA3AF">Férias, folga ou ausência</div></div>
        </div>
      </div>`
  }

  if (_eventoTab === 'feriados') {
    const feriados = [
      {nome:'Ano Novo',             data:'2025-01-01', tipo:'nacional'},
      {nome:'Carnaval',             data:'2025-03-03', tipo:'nacional'},
      {nome:'Sexta-feira Santa',    data:'2025-04-18', tipo:'nacional'},
      {nome:'Tiradentes',           data:'2025-04-21', tipo:'nacional'},
      {nome:'Dia do Trabalho',      data:'2025-05-01', tipo:'nacional'},
      {nome:'Corpus Christi',       data:'2025-06-19', tipo:'nacional'},
      {nome:'Independência',        data:'2025-09-07', tipo:'nacional'},
      {nome:'Nossa Sra. Aparecida', data:'2025-10-12', tipo:'nacional'},
      {nome:'Finados',              data:'2025-11-02', tipo:'nacional'},
      {nome:'Proclamação República',data:'2025-11-15', tipo:'nacional'},
      {nome:'Natal',                data:'2025-12-25', tipo:'nacional'},
    ]
    return `
      <div>
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:12px">Feriados Nacionais 2025</div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;margin-bottom:20px">
          ${feriados.map(f=>`<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:#EFF6FF;border-radius:9px">
            <div style="width:7px;height:7px;border-radius:50%;background:#3B82F6;flex-shrink:0"></div>
            <div style="flex:1;font-size:12px;color:#374151;font-weight:600">${f.nome}</div>
            <div style="font-size:11px;color:#9CA3AF">${f.data.split('-').reverse().join('/')}</div>
          </div>`).join('')}
        </div>
        <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:10px">Datas da Clínica</div>
        ${!filtered.length ? `<div style="text-align:center;padding:24px;color:#9CA3AF;font-size:12px;border:2px dashed #E5E7EB;border-radius:10px">Nenhuma data especial cadastrada. <button onclick="agendaEventoNovo('feriado')" style="color:#3B82F6;background:none;border:none;cursor:pointer;font-weight:700">+ Adicionar</button></div>` : filtered.map(e=>_eventoCard(e,color)).join('')}
      </div>`
  }

  const labelMap = { campanhas:'campanha', cursos:'curso' }
  const iconMap  = { campanhas:'zap', cursos:'users' }
  const colorMap = { campanhas:'#10B981', cursos:'#8B5CF6' }
  const tipoCur  = labelMap[_eventoTab] || 'evento'
  const corCur   = colorMap[_eventoTab] || '#7C3AED'

  return `
    <div>
      ${!filtered.length ? `<div style="text-align:center;padding:48px;color:#9CA3AF;font-size:13px;border:2px dashed #E5E7EB;border-radius:12px">
        <i data-feather="${iconMap[_eventoTab]||'calendar'}" style="width:32px;height:32px;display:block;margin:0 auto 12px;color:#E5E7EB"></i>
        Nenhum ${tipoCur} cadastrado.
        <button onclick="agendaEventoNovo('${tipoCur}')" style="color:${corCur};background:none;border:none;cursor:pointer;font-weight:700">+ Adicionar ${tipoCur}</button>
      </div>` : `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">${filtered.map(e=>_eventoCard(e,corCur)).join('')}</div>`}
    </div>`
}

function _eventoCard(e, color) {
  return `<div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:14px;border-left:4px solid ${color}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
      <div style="font-size:13px;font-weight:700;color:#111">${e.nome||'Evento'}</div>
      <button onclick="agendaEventoRemover('${e.id}')" style="background:none;border:none;cursor:pointer;color:#EF4444;font-size:16px;line-height:1;flex-shrink:0">×</button>
    </div>
    ${e.dataInicio?`<div style="font-size:11px;color:#9CA3AF;margin-top:4px">${e.dataInicio} ${e.dataFim&&e.dataFim!==e.dataInicio?'→ '+e.dataFim:''}</div>`:''}
    ${e.descricao?`<div style="font-size:11px;color:#6B7280;margin-top:6px">${e.descricao}</div>`:''}
    ${e.afetaSalas?`<div style="font-size:10px;font-weight:600;color:${color};margin-top:6px">Bloqueia: ${e.afetaSalas}</div>`:''}
  </div>`
}

function agendaEventoNovo(tipo) {
  const m = document.createElement('div')
  m.id = 'agendaEventoModal'
  m.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.4);z-index:9700;display:flex;align-items:center;justify-content:center;padding:16px'
  m.innerHTML = `
    <div onclick="event.stopPropagation()" style="background:#fff;border-radius:16px;width:100%;max-width:420px;box-shadow:0 16px 48px rgba(0,0,0,.2)">
      <div style="display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid #E5E7EB">
        <div style="font-size:14px;font-weight:800;color:#111">Novo Evento / Bloqueio</div>
        <button onclick="document.getElementById('agendaEventoModal').remove()" style="background:none;border:none;cursor:pointer;font-size:20px;color:#9CA3AF">✕</button>
      </div>
      <div style="padding:18px;display:flex;flex-direction:column;gap:12px">
        <div>
          <label style="font-size:10px;font-weight:700;color:#9CA3AF;display:block;margin-bottom:3px">Tipo</label>
          <select id="evTipo" style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px">
            <option value="bloqueio" ${tipo==='bloqueio_sala'||tipo==='bloqueio'?'selected':''}>Bloqueio de Sala</option>
            <option value="bloqueio_prof" ${tipo==='bloqueio_prof'?'selected':''}>Bloqueio de Profissional</option>
            <option value="feriado" ${tipo==='feriado'?'selected':''}>Feriado / Data Especial</option>
            <option value="campanha" ${tipo==='campanha'?'selected':''}>Campanha</option>
            <option value="curso" ${tipo==='curso'?'selected':''}>Curso / Evento</option>
          </select>
        </div>
        <div>
          <label style="font-size:10px;font-weight:700;color:#9CA3AF;display:block;margin-bottom:3px">Nome</label>
          <input id="evNome" placeholder="Ex: Férias Dr. João, Feriado Municipal..." style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px">
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          <div>
            <label style="font-size:10px;font-weight:700;color:#9CA3AF;display:block;margin-bottom:3px">Data início</label>
            <input id="evInicio" type="date" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px">
          </div>
          <div>
            <label style="font-size:10px;font-weight:700;color:#9CA3AF;display:block;margin-bottom:3px">Data fim</label>
            <input id="evFim" type="date" style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px">
          </div>
        </div>
        <div>
          <label style="font-size:10px;font-weight:700;color:#9CA3AF;display:block;margin-bottom:3px">Descrição</label>
          <textarea id="evDesc" rows="2" placeholder="Motivo ou observação..." style="width:100%;box-sizing:border-box;padding:8px;border:1px solid #E5E7EB;border-radius:8px;font-size:12px;resize:none;font-family:inherit"></textarea>
        </div>
        <div style="display:flex;gap:8px">
          <button onclick="document.getElementById('agendaEventoModal').remove()" style="flex:1;padding:10px;border:1.5px solid #E5E7EB;background:#fff;color:#374151;border-radius:8px;cursor:pointer;font-size:13px;font-weight:700">Cancelar</button>
          <button onclick="agendaEventoSalvar()" style="flex:2;padding:10px;background:#7C3AED;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:13px;font-weight:800">Salvar Evento</button>
        </div>
      </div>
    </div>`
  m.addEventListener('click', e => { if(e.target===m) m.remove() })
  document.body.appendChild(m)
}

function agendaEventoSalvar() {
  const nome  = document.getElementById('evNome')?.value?.trim()
  const tipo  = document.getElementById('evTipo')?.value
  if (!nome) { if (window._showToast) _showToast('Atenção', 'Informe o nome do evento.', 'warn'); return }
  const events = JSON.parse(localStorage.getItem('clinicai_agenda_events') || '[]')
  events.push({
    id:         'ev_'+Date.now(),
    tipo,
    nome,
    dataInicio: document.getElementById('evInicio')?.value || '',
    dataFim:    document.getElementById('evFim')?.value    || '',
    descricao:  document.getElementById('evDesc')?.value?.trim() || '',
    criadoEm:   new Date().toISOString(),
  })
  if (window.sbSave) sbSave('clinicai_agenda_events', events)
  else store.set('clinicai_agenda_events', events)
  document.getElementById('agendaEventoModal')?.remove()
  renderAgendaEventos()
}

function agendaEventoRemover(id) {
  const events = JSON.parse(localStorage.getItem('clinicai_agenda_events') || '[]').filter(e=>e.id!==id)
  if (window.sbSave) sbSave('clinicai_agenda_events', events)
  else store.set('clinicai_agenda_events', events)
  renderAgendaEventos()
}

// ══════════════════════════════════════════════════════════════
//  TAGS E FLUXOS (agenda) — views as 6 modulos do Funil de Automacoes
//  Fonte: wa_agenda_automations (via AgendaAutomationsRepository)
//  Tabs replicadas de js/ui/funnel-automations/shell.ui.js MODULE_ORDER
// ══════════════════════════════════════════════════════════════
const _FA_MODULE_ORDER = ['pre_agendamento','agendamento','paciente','orcamento','paciente_orcamento','perdido']

// Labels para triggers (derivados dos statuses dos modulos, fallback generico)
function _autoTriggerLabel(rule) {
  if (!rule || !rule.trigger_type) return 'Sem gatilho'
  const cfg = rule.trigger_config || {}
  const mods = window.FAModules || {}
  if (rule.trigger_type === 'on_status') {
    const id = cfg.status || ''
    for (const mid of _FA_MODULE_ORDER) {
      const m = mods[mid]; if (!m || !m.statuses) continue
      const s = m.statuses.find(x => x.id === id)
      if (s) return s.label
    }
    return id || 'Status'
  }
  if (rule.trigger_type === 'on_tag') {
    const id = cfg.tag || ''
    for (const mid of _FA_MODULE_ORDER) {
      const m = mods[mid]; if (!m || !m.statuses) continue
      const s = m.statuses.find(x => x.id === id)
      if (s) return s.label
    }
    return id ? 'Tag: ' + id : 'Tag'
  }
  if (rule.trigger_type === 'd_before')      return 'D-' + (cfg.days || '?') + ' (antes da consulta)'
  if (rule.trigger_type === 'd_zero')        return 'Dia da consulta'
  if (rule.trigger_type === 'min_before')    return (cfg.minutes || '?') + ' min antes'
  if (rule.trigger_type === 'daily_summary') return 'Resumo diario'
  return rule.trigger_type
}

function _autoActiveChannels(rule) {
  const ch = String(rule && rule.channel || '')
  if (ch === 'all' || ch === 'both') return ['whatsapp','alexa','task','alert']
  const out = []
  if (ch.indexOf('whatsapp') >= 0) out.push('whatsapp')
  if (ch.indexOf('alexa') >= 0)    out.push('alexa')
  if (ch.indexOf('task') >= 0)     out.push('task')
  if (ch.indexOf('alert') >= 0)    out.push('alert')
  return out.length ? out : [ch || 'whatsapp']
}

function _autoChannelMeta(id) {
  return ({
    whatsapp: { icon: 'message-circle', color: '#10B981', label: 'WhatsApp' },
    alert:    { icon: 'bell',           color: '#F59E0B', label: 'Alerta' },
    task:     { icon: 'check-square',   color: '#3B82F6', label: 'Tarefa' },
    alexa:    { icon: 'volume-2',       color: '#8B5CF6', label: 'Alexa' },
  })[id] || { icon: 'circle', color: '#9CA3AF', label: id || '—' }
}

function _autoRulesForActiveTab() {
  if (_autoCatTab === 'all') return _autoRules
  const m = (window.FAModules || {})[_autoCatTab]
  if (!m || typeof m.matchesRule !== 'function') return []
  return _autoRules.filter(r => m.matchesRule(r))
}

function _autoGroupByTrigger(rules) {
  const groups = {}
  for (const r of rules) {
    const cfg = r.trigger_config || {}
    let key
    if (r.trigger_type === 'on_status')   key = 'status:' + (cfg.status || '?')
    else if (r.trigger_type === 'on_tag') key = 'tag:' + (cfg.tag || '?')
    else                                   key = 'time:' + (r.trigger_type || '?')
    if (!groups[key]) groups[key] = { key, label: _autoTriggerLabel(r), rules: [] }
    groups[key].rules.push(r)
  }
  return Object.values(groups).sort((a,b) => String(a.label).localeCompare(String(b.label)))
}

function _autoEsc(s) {
  return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
}

// Converte nomes camelCase (usados nos modulos FA) para kebab-case do feather-icons (standalone)
function _featherKebab(name) {
  if (!name) return 'circle'
  return String(name).replace(/([a-z])([A-Z0-9])/g, '$1-$2').toLowerCase()
}

function _agendaSetAutoTab(tabId) {
  _autoCatTab = tabId
  _autoSelectedId = null
  renderAgendaTagsFluxos()
}

function _agendaSelectAuto(ruleId) {
  _autoSelectedId = _autoSelectedId === ruleId ? null : ruleId
  renderAgendaTagsFluxos()
}

async function _agendaReloadAuto(keepSelectedId) {
  try {
    const repo = window.AgendaAutomationsRepository
    if (repo) {
      const res = await repo.list()
      _autoRules = (res && res.ok && Array.isArray(res.data)) ? res.data : []
    }
  } catch (e) {}
  _autoLoaded = true
  if (keepSelectedId && !_autoRules.some(r => r.id === keepSelectedId)) _autoSelectedId = null
  else if (keepSelectedId) _autoSelectedId = keepSelectedId
  renderAgendaTagsFluxos()
}

// Traduz a chave do grupo (status:na_clinica | tag:encaixe | time:d_before) em prefill do editor
function _autoPrefillFromGroupKey(key) {
  const mods = window.FAModules || {}
  if (!key) return { category: _autoCatTab !== 'all' ? _autoCatTab : 'agendamento' }
  if (key.indexOf('status:') === 0) {
    const status = key.slice(7)
    let category = _autoCatTab !== 'all' ? _autoCatTab : null
    if (!category) {
      for (const mid of _FA_MODULE_ORDER) {
        const m = mods[mid]
        if (m && m.statuses && m.statuses.some(s => s.id === status)) { category = mid; break }
      }
    }
    return { category: category || 'agendamento', trigger_type: 'on_status', trigger_config: { status } }
  }
  if (key.indexOf('tag:') === 0) {
    const tag = key.slice(4)
    return { category: _autoCatTab !== 'all' ? _autoCatTab : 'agendamento', trigger_type: 'on_tag', trigger_config: { tag } }
  }
  if (key.indexOf('time:') === 0) {
    const t = key.slice(5)
    return { category: _autoCatTab !== 'all' ? _autoCatTab : 'agendamento', trigger_type: t, trigger_config: {} }
  }
  return { category: _autoCatTab !== 'all' ? _autoCatTab : 'agendamento' }
}

function _agendaEditRule(ruleId) {
  if (!window.FAEditor) { if (window._showToast) _showToast('Editor', 'Editor nao carregado', 'warn'); return }
  window.FAEditor.open(ruleId, { onSave: () => _agendaReloadAuto(ruleId) })
}

function _agendaNewRuleInGroup(groupKey) {
  if (!window.FAEditor) { if (window._showToast) _showToast('Editor', 'Editor nao carregado', 'warn'); return }
  const prefill = _autoPrefillFromGroupKey(groupKey)
  window.FAEditor.open(null, { prefill, onSave: (saved) => _agendaReloadAuto(saved && saved.id) })
}

function _autoGroupKeyOf(rule) {
  if (!rule) return null
  const cfg = rule.trigger_config || {}
  if (rule.trigger_type === 'on_status') return 'status:' + (cfg.status || '?')
  if (rule.trigger_type === 'on_tag')    return 'tag:' + (cfg.tag || '?')
  return 'time:' + (rule.trigger_type || '?')
}

function _autoRuleContentSummary(r) {
  const activeCh = _autoActiveChannels(r)
  const sections = []
  if (activeCh.includes('whatsapp') && r.content_template) {
    const txt = String(r.content_template).slice(0, 120) + (r.content_template.length > 120 ? '…' : '')
    sections.push(`<div style="font-size:11px;color:#374151;background:#F0FDF4;border-left:3px solid #25D366;padding:8px 10px;border-radius:5px;white-space:pre-wrap;line-height:1.5">${_autoEsc(txt)}</div>`)
  }
  if (activeCh.includes('alexa') && r.alexa_message) {
    const txt = String(r.alexa_message).slice(0, 120) + (r.alexa_message.length > 120 ? '…' : '')
    sections.push(`<div style="font-size:11px;color:#374151;background:#ECFEFF;border-left:3px solid #1FCCB2;padding:8px 10px;border-radius:5px">${_autoEsc(txt)}</div>`)
  }
  if (activeCh.includes('task') && r.task_title) {
    sections.push(`<div style="font-size:11px;color:#374151;background:#F0FDF4;border-left:3px solid #10B981;padding:8px 10px;border-radius:5px"><b>${_autoEsc(r.task_title)}</b> · ${_autoEsc(r.task_assignee || 'sdr')} · ${r.task_deadline_hours || 24}h</div>`)
  }
  if (activeCh.includes('alert') && r.alert_title) {
    sections.push(`<div style="font-size:11px;color:#374151;background:#FFFBEB;border-left:3px solid #F59E0B;padding:8px 10px;border-radius:5px"><b>${_autoEsc(r.alert_title)}</b> · ${_autoEsc(r.alert_type || 'info')}</div>`)
  }
  return sections
}

function _autoRenderDrawer() {
  const selected = _autoRules.find(x => x.id === _autoSelectedId)
  if (!selected) return ''
  const groupKey = _autoGroupKeyOf(selected)
  const siblings = _autoRules.filter(r => _autoGroupKeyOf(r) === groupKey)
  const triggerLabel = _autoTriggerLabel(selected)
  const activeN = siblings.filter(r => r.is_active).length

  return `
    <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;overflow:hidden;align-self:start;position:sticky;top:80px;max-height:calc(100vh - 110px);overflow-y:auto">
      <div style="padding:14px 16px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;gap:8px">
        <i data-feather="zap" style="width:14px;height:14px;color:#7C3AED"></i>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:800;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_autoEsc(triggerLabel)}</div>
          <div style="font-size:11px;color:#9CA3AF;margin-top:2px">${siblings.length} regra${siblings.length===1?'':'s'} · ${activeN} ativa${activeN===1?'':'s'}</div>
        </div>
        <button onclick="window._agendaSelectAuto(null)" title="Fechar" style="background:none;border:none;cursor:pointer;color:#9CA3AF;padding:4px">
          <i data-feather="x" style="width:16px;height:16px"></i>
        </button>
      </div>

      <div style="padding:12px 16px;border-bottom:1px solid #F3F4F6">
        <button onclick="window._agendaNewRuleInGroup('${_autoEsc(groupKey)}')" style="width:100%;padding:10px 12px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px">
          <i data-feather="plus" style="width:12px;height:12px"></i> Nova regra neste grupo
        </button>
      </div>

      <div style="display:flex;flex-direction:column">
        ${siblings.map(r => {
          const isSel = r.id === _autoSelectedId
          const activeCh = _autoActiveChannels(r)
          const chBadges = activeCh.map(c => {
            const m = _autoChannelMeta(c)
            return `<div title="${m.label}" style="width:20px;height:20px;border-radius:5px;background:${m.color}18;display:flex;align-items:center;justify-content:center">
              <i data-feather="${m.icon}" style="width:10px;height:10px;color:${m.color}"></i>
            </div>`
          }).join('')
          const sections = _autoRuleContentSummary(r)
          return `
            <div style="border-bottom:1px solid #F9FAFB;${isSel?'background:#F5F3FF':''}">
              <div style="padding:11px 16px 8px;display:flex;align-items:flex-start;gap:8px">
                <div style="width:8px;height:8px;border-radius:50%;background:${r.is_active?'#10B981':'#D1D5DB'};flex-shrink:0;margin-top:5px"></div>
                <div onclick="window._agendaSelectAuto('${r.id}')" style="flex:1;min-width:0;cursor:pointer">
                  <div style="font-size:12.5px;font-weight:700;color:#111827">${_autoEsc(r.name || 'Sem nome')}</div>
                  ${r.description ? `<div style="font-size:11px;color:#6B7280;margin-top:2px">${_autoEsc(r.description)}</div>` : ''}
                </div>
                <div style="display:flex;gap:3px;flex-shrink:0">${chBadges}</div>
                <button onclick="window._agendaEditRule('${r.id}')" title="Editar regra" style="background:#EEF2FF;border:1px solid #E0E7FF;cursor:pointer;color:#4338CA;padding:5px 7px;border-radius:6px;display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700">
                  <i data-feather="edit-2" style="width:11px;height:11px"></i>
                </button>
              </div>
              ${sections.length ? `<div style="padding:0 16px 10px;display:flex;flex-direction:column;gap:6px">${sections.join('')}</div>` : ''}
            </div>`
        }).join('')}
      </div>

      <div style="padding:10px 16px;border-top:1px solid #F3F4F6;background:#FAFAFA">
        <button onclick="if(window.navigateTo){window.navigateTo('funnel-automations')}else{location.hash='funnel-automations'}" style="width:100%;padding:8px 12px;background:#fff;color:#4338CA;border:1px solid #E0E7FF;border-radius:8px;font-size:11.5px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;justify-content:center;gap:6px">
          <i data-feather="external-link" style="width:11px;height:11px"></i> Abrir no Funil
        </button>
      </div>
    </div>`
}

async function renderAgendaTagsFluxos() {
  const root = document.getElementById('agenda-tags-root')
  if (!root) return

  // 1a renderizacao: carrega regras de wa_agenda_automations
  if (!_autoLoaded) {
    root.innerHTML = `<div style="padding:48px;text-align:center;color:#9CA3AF;font-size:13px">Carregando automações…</div>`
    try {
      const repo = window.AgendaAutomationsRepository
      if (repo) {
        const res = await repo.list()
        _autoRules = (res && res.ok && Array.isArray(res.data)) ? res.data : []
      } else {
        _autoRules = []
      }
    } catch (e) {
      _autoRules = []
    }
    _autoLoaded = true
  }

  // Mantido apenas para o bloco informativo "Tags do grupo Agendamento"
  const hasTagEngine = !!window.TagEngine
  const agTags = hasTagEngine ? TagEngine.getTags().filter(t => t.group_id === 'agendamento') : []

  const mods = window.FAModules || {}
  // Tabs dinamicas: Todas + modulos carregados na ordem MODULE_ORDER
  const tabs = [{ id: 'all', label: 'Todas', color: '#6B7280', icon: 'grid', count: _autoRules.length }]
  _FA_MODULE_ORDER.forEach(id => {
    const m = mods[id]; if (!m) return
    const count = _autoRules.filter(r => m.matchesRule(r)).length
    tabs.push({ id, label: m.label, color: m.color, icon: _featherKebab(m.icon), count })
  })

  const visible = _autoRulesForActiveTab()
  const groups  = _autoGroupByTrigger(visible).filter(g => g.rules.some(r => r.is_active))
  const activeMod = _autoCatTab !== 'all' ? mods[_autoCatTab] : null
  const headerColor = activeMod ? activeMod.color : '#6B7280'
  const headerLabel = activeMod ? activeMod.label : 'Todas as fases'

  root.innerHTML = `
    <div style="max-width:1180px;margin:0 auto;padding:28px 24px">

      <!-- Header -->
      <div style="margin-bottom:18px;display:flex;align-items:flex-end;justify-content:space-between;gap:16px">
        <div>
          <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0">Tags e Fluxos da Agenda</h1>
          <p style="font-size:13px;color:#6B7280;margin:4px 0 0">Visao consolidada das automacoes da agenda, agrupadas pelos gatilhos do funil.</p>
        </div>
        <button onclick="if(window.navigateTo){window.navigateTo('funnel-automations')}else{location.hash='funnel-automations'}" style="display:inline-flex;align-items:center;gap:6px;padding:8px 14px;background:#111827;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer">
          <i data-feather="settings" style="width:13px;height:13px"></i> Configurar funil
        </button>
      </div>

      <!-- Tabs dos modulos do funil + Todas -->
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:18px;border-bottom:1px solid #E5E7EB;padding-bottom:0">
        ${tabs.map(t => {
          const active = _autoCatTab === t.id
          return `
            <button onclick="window._agendaSetAutoTab('${t.id}')" style="
              display:inline-flex;align-items:center;gap:6px;padding:9px 14px;
              background:${active?'#fff':'transparent'};
              border:1px solid ${active?'#E5E7EB':'transparent'};
              border-bottom:2px solid ${active?t.color:'transparent'};
              border-radius:8px 8px 0 0;
              font-size:12.5px;font-weight:${active?'700':'600'};
              color:${active?t.color:'#6B7280'};
              cursor:pointer;margin-bottom:-1px">
              <i data-feather="${t.icon}" style="width:12px;height:12px"></i>
              ${t.label}
              <span style="background:${active?t.color+'18':'#F3F4F6'};color:${active?t.color:'#9CA3AF'};padding:1px 7px;border-radius:10px;font-size:10px;font-weight:700">${t.count}</span>
            </button>`
        }).join('')}
      </div>

      <!-- Corpo: lista + drawer lateral -->
      <div style="display:grid;grid-template-columns:1fr ${_autoSelectedId?'380px':'0px'};gap:${_autoSelectedId?'16px':'0'};transition:grid-template-columns .2s">

        <!-- Coluna 1: grupos por trigger -->
        <div>
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:14px">
            <div style="width:4px;height:18px;border-radius:2px;background:${headerColor}"></div>
            <div style="font-size:14px;font-weight:700;color:#111827">${_autoEsc(headerLabel)}</div>
            <div style="font-size:11px;color:#9CA3AF">· ${visible.length} regra${visible.length===1?'':'s'} · ${groups.length} gatilho${groups.length===1?'':'s'}</div>
          </div>

          ${groups.length === 0 ? `
            <div style="padding:60px 24px;text-align:center;background:#fff;border:1px dashed #E5E7EB;border-radius:12px">
              <i data-feather="inbox" style="width:28px;height:28px;color:#D1D5DB"></i>
              <div style="font-size:13px;color:#6B7280;margin-top:10px;font-weight:600">Nenhuma regra nesta fase</div>
              <div style="font-size:11.5px;color:#9CA3AF;margin-top:4px">Crie automacoes em <b style="color:#7C3AED">Configurar funil</b>.</div>
            </div>
          ` : groups.map(g => {
            const activeN = g.rules.filter(r => r.is_active).length
            const pausedN = g.rules.length - activeN
            const chCountG = { whatsapp:0, alexa:0, task:0, alert:0 }
            for (const r of g.rules) {
              if (!r.is_active) continue
              for (const c of _autoActiveChannels(r)) chCountG[c] = (chCountG[c]||0) + 1
            }
            const chBadgesG = Object.keys(chCountG).filter(c => chCountG[c] > 0).map(c => {
              const m = _autoChannelMeta(c)
              return `<div title="${m.label}: ${chCountG[c]}" style="display:flex;align-items:center;gap:3px;padding:3px 7px;border-radius:6px;background:${m.color}18">
                <i data-feather="${_featherKebab(m.icon)}" style="width:11px;height:11px;color:${m.color}"></i>
                <span style="font-size:10px;font-weight:700;color:${m.color}">${chCountG[c]}</span>
              </div>`
            }).join('')
            return `
            <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;margin-bottom:12px;overflow:hidden">
              <div style="padding:11px 16px;background:#FAFAFA;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;gap:8px">
                <i data-feather="zap" style="width:12px;height:12px;color:${headerColor}"></i>
                <div style="font-size:12px;font-weight:700;color:#374151">${_autoEsc(g.label)}</div>
                <span style="font-size:10px;color:#166534;background:#DCFCE7;padding:2px 7px;border-radius:10px;font-weight:700">${activeN} ativa${activeN===1?'':'s'}</span>
                ${pausedN ? `<span style="font-size:10px;color:#9CA3AF;background:#F3F4F6;padding:2px 7px;border-radius:10px;font-weight:700">${pausedN} pausada${pausedN===1?'':'s'}</span>` : ''}
                <div style="flex:1"></div>
                <div style="display:flex;gap:4px;flex-shrink:0">${chBadgesG}</div>
                <button onclick="event.stopPropagation();window._agendaNewRuleInGroup('${_autoEsc(g.key)}')" title="Nova regra neste grupo" style="background:#fff;border:1px solid #E0E7FF;color:#4338CA;padding:4px 8px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700">
                  <i data-feather="plus" style="width:11px;height:11px"></i> Nova
                </button>
              </div>
              <div>
                ${g.rules.map(r => {
                  const selected = _autoSelectedId === r.id
                  const activeCh = _autoActiveChannels(r)
                  return `
                    <div style="
                      padding:11px 16px;border-bottom:1px solid #F9FAFB;display:flex;align-items:center;gap:10px;
                      background:${selected?'#F5F3FF':'transparent'};
                      border-left:3px solid ${selected?'#7C3AED':'transparent'}">
                      <div style="width:8px;height:8px;border-radius:50%;background:${r.is_active?'#10B981':'#D1D5DB'};flex-shrink:0"></div>
                      <div onclick="window._agendaSelectAuto('${r.id}')" style="flex:1;min-width:0;cursor:pointer">
                        <div style="font-size:12.5px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_autoEsc(r.name || 'Sem nome')}</div>
                        <div style="font-size:10.5px;color:#9CA3AF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_autoEsc(r.description || '—')}</div>
                      </div>
                      <div style="display:flex;gap:3px;flex-shrink:0">
                        ${activeCh.map(c => {
                          const meta = _autoChannelMeta(c)
                          return `<div title="${meta.label}" style="width:22px;height:22px;border-radius:6px;background:${meta.color}18;display:flex;align-items:center;justify-content:center">
                            <i data-feather="${meta.icon}" style="width:11px;height:11px;color:${meta.color}"></i>
                          </div>`
                        }).join('')}
                      </div>
                      <span style="font-size:9.5px;padding:2px 7px;border-radius:5px;background:${r.is_active?'#DCFCE7':'#F3F4F6'};color:${r.is_active?'#166534':'#9CA3AF'};font-weight:700;flex-shrink:0">${r.is_active?'ON':'OFF'}</span>
                      <button onclick="event.stopPropagation();window._agendaEditRule('${r.id}')" title="Editar regra" style="background:#EEF2FF;border:1px solid #E0E7FF;color:#4338CA;padding:5px 7px;border-radius:6px;cursor:pointer;display:inline-flex;align-items:center;flex-shrink:0">
                        <i data-feather="edit-2" style="width:11px;height:11px"></i>
                      </button>
                    </div>`
                }).join('')}
              </div>
            </div>`
          }).join('')}
        </div>

        <!-- Coluna 2: drawer de detalhe -->
        ${_autoSelectedId ? _autoRenderDrawer() : ''}
      </div>

      <!-- Tags do grupo Agendamento (informativo) -->
      ${agTags.length ? `
        <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;overflow:hidden;margin-top:24px">
          <div style="padding:13px 18px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:13px;font-weight:700;color:#374151;display:flex;align-items:center;gap:6px">
              <i data-feather="tag" style="width:13px;height:13px;color:#3B82F6"></i> Tags — Grupo Agendamento
            </div>
            <button onclick="if(window.renderSettingsTags){location.hash='settings-tags';renderSettingsTags()}" style="font-size:11px;color:#7C3AED;background:none;border:none;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:4px">
              <i data-feather="settings" style="width:11px;height:11px"></i> Configurar
            </button>
          </div>
          <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:0">
            ${agTags.map(tag => {
              const rulesForStatus = _autoRules.filter(r => r.is_active && r.trigger_type === 'on_status' && (r.trigger_config||{}).status === tag.id)
              const chCount = { whatsapp:0, alexa:0, task:0, alert:0 }
              for (const r of rulesForStatus) {
                for (const c of _autoActiveChannels(r)) chCount[c] = (chCount[c]||0) + 1
              }
              const badges = Object.keys(chCount).filter(c => chCount[c] > 0).map(c => {
                const m = _autoChannelMeta(c)
                return `<div title="${m.label}: ${chCount[c]}" style="width:22px;height:22px;border-radius:5px;background:${m.color}18;display:flex;align-items:center;justify-content:center">
                  <i data-feather="${_featherKebab(m.icon)}" style="width:11px;height:11px;color:${m.color}"></i>
                </div>`
              }).join('')
              return `
                <div style="padding:11px 16px;border-bottom:1px solid #F9FAFB;border-right:1px solid #F9FAFB;display:flex;align-items:center;gap:10px">
                  <div style="width:8px;height:8px;border-radius:50%;background:${tag.cor||'#9CA3AF'};flex-shrink:0"></div>
                  <div style="flex:1;min-width:0">
                    <div style="font-size:12px;font-weight:700;color:#111827">${_autoEsc(tag.nome)}</div>
                    <div style="font-size:10.5px;color:#9CA3AF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${_autoEsc(tag.regras||'')}</div>
                  </div>
                  <div style="display:flex;gap:3px;flex-shrink:0">${badges || '<span style="font-size:10px;color:#D1D5DB">sem regra</span>'}</div>
                </div>`
            }).join('')}
          </div>
        </div>
      ` : ''}

    </div>`
  if (typeof featherIn === 'function') featherIn(root)
}

// ══════════════════════════════════════════════════════════════
//  CONTROLES DE ESTADO
// ══════════════════════════════════════════════════════════════
function agendaSetRelTab(tab) {
  _relTab = tab
  renderAgendaRelatorios()
}

function agendaSetEventoTab(tab) {
  _eventoTab = tab
  renderAgendaEventos()
}

// ══════════════════════════════════════════════════════════════
//  EXPOSE
// ══════════════════════════════════════════════════════════════
window.renderAgendaRelatorios  = renderAgendaRelatorios
window.renderAgendaEventos     = renderAgendaEventos
window.renderAgendaTagsFluxos  = renderAgendaTagsFluxos
window.agendaSetRelTab         = agendaSetRelTab
window.agendaSetEventoTab      = agendaSetEventoTab
window.agendaEventoNovo        = agendaEventoNovo
window.agendaEventoSalvar      = agendaEventoSalvar
window.agendaEventoRemover     = agendaEventoRemover
window._agendaSetAutoTab       = _agendaSetAutoTab
window._agendaSelectAuto       = _agendaSelectAuto
window._agendaEditRule         = _agendaEditRule
window._agendaNewRuleInGroup   = _agendaNewRuleInGroup
window._agendaReloadAuto       = _agendaReloadAuto

})()
