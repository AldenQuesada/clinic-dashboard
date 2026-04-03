;(function () {
'use strict'

// ══════════════════════════════════════════════════════════════
//  ClinicAI — Agenda Module
//  Páginas: Relatórios · Eventos · Tags e Fluxos
// ══════════════════════════════════════════════════════════════

let _relTab    = 'semana'   // semana | mes | trimestre
let _eventoTab = 'bloqueios' // bloqueios | feriados | campanhas | cursos

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
  if (!nome) { alert('Informe o nome do evento.'); return }
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
  store.set('clinicai_agenda_events', events)
  document.getElementById('agendaEventoModal')?.remove()
  renderAgendaEventos()
}

function agendaEventoRemover(id) {
  const events = JSON.parse(localStorage.getItem('clinicai_agenda_events') || '[]').filter(e=>e.id!==id)
  store.set('clinicai_agenda_events', events)
  renderAgendaEventos()
}

// ══════════════════════════════════════════════════════════════
//  TAGS E FLUXOS (agenda)
// ══════════════════════════════════════════════════════════════
function renderAgendaTagsFluxos() {
  const root = document.getElementById('agenda-tags-root')
  if (!root) return

  const hasTags   = !!window.TagEngine
  const agTags    = hasTags ? TagEngine.getTags().filter(t=>t.group_id==='agendamento') : []
  const agFlows   = hasTags ? TagEngine.getFlows().filter(f=>f.group_id==='agendamento') : []
  const cfg       = hasTags ? TagEngine.getCfg() : {}
  const tipoCor   = c => ({error:'#EF4444',warning:'#F59E0B',success:'#10B981',info:'#3B82F6'})[c]||'#6B7280'
  const prCor     = p => ({urgente:'#DC2626',alta:'#EF4444',normal:'#F59E0B',baixa:'#9CA3AF'})[p]||'#9CA3AF'

  const pendingAlerts = hasTags ? TagEngine.getAlerts().filter(a=>!a.lido&&['alert_novo_agendamento','alert_reagendamento','alert_cancelamento','alert_noshow'].includes(a.template_id)) : []
  const pendingTasks  = hasTags ? TagEngine.getOpTasks().filter(t=>t.status==='aberta'&&['task_confirmar_presenca','task_preparar_prontuario','task_recuperar_cancelamento','task_recuperar_noshow'].includes(t.template_id)) : []

  root.innerHTML = `
    <div style="max-width:1100px;margin:0 auto;padding:28px 24px">

      <div style="margin-bottom:22px">
        <h1 style="font-size:22px;font-weight:800;color:#111827;margin:0">Tags e Fluxos da Agenda</h1>
        <p style="font-size:13px;color:#6B7280;margin:4px 0 0">Automações ativas para o ciclo de agendamento · confirmações · lembretes · no-show</p>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:18px">

        <!-- Alertas da agenda -->
        <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;overflow:hidden">
          <div style="padding:13px 16px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">
            <div style="font-size:13px;font-weight:700;color:#374151;display:flex;align-items:center;gap:6px">
              <i data-feather="bell" style="width:13px;height:13px;color:#F59E0B"></i> Alertas da Agenda
              ${pendingAlerts.length?`<span style="background:#EF4444;color:#fff;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700">${pendingAlerts.length}</span>`:''}
            </div>
            ${pendingAlerts.length?`<button onclick="TagEngine.markAllAlertsRead();renderAgendaTagsFluxos()" style="font-size:11px;color:#7C3AED;background:none;border:none;cursor:pointer;font-weight:600">Marcar lidos</button>`:''}
          </div>
          ${pendingAlerts.slice(0,6).map(a=>`
            <div style="padding:9px 16px;border-bottom:1px solid #F9FAFB;display:flex;gap:8px;align-items:flex-start;background:#FEFCE8">
              <div style="width:8px;height:8px;border-radius:50%;background:${tipoCor(a.tipo)};flex-shrink:0;margin-top:4px"></div>
              <div style="flex:1">
                <div style="font-size:12px;font-weight:700;color:#111827">${a.titulo}</div>
                <div style="font-size:10.5px;color:#9CA3AF">${a.para}</div>
              </div>
            </div>`).join('')||`<div style="padding:28px;text-align:center;font-size:12px;color:#D1D5DB">Nenhum alerta pendente</div>`}
        </div>

        <!-- Tarefas da agenda -->
        <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;overflow:hidden">
          <div style="padding:13px 16px;border-bottom:1px solid #F3F4F6;font-size:13px;font-weight:700;color:#374151;display:flex;align-items:center;gap:6px">
            <i data-feather="check-square" style="width:13px;height:13px;color:#10B981"></i> Tarefas da Agenda
            ${pendingTasks.length?`<span style="background:#F59E0B;color:#fff;border-radius:10px;padding:1px 7px;font-size:10px;font-weight:700">${pendingTasks.length}</span>`:''}
          </div>
          ${pendingTasks.slice(0,6).map(t=>`
            <div style="padding:9px 16px;border-bottom:1px solid #F9FAFB;display:flex;align-items:center;gap:9px">
              <input type="checkbox" onclick="TagEngine.updateTaskStatus('${t.id}','concluida');renderAgendaTagsFluxos()"
                style="width:14px;height:14px;cursor:pointer;accent-color:#7C3AED;flex-shrink:0">
              <div style="flex:1;min-width:0">
                <div style="font-size:12px;font-weight:600;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${t.titulo}</div>
                <div style="font-size:10.5px;color:#9CA3AF">${(window.TAREFA_PARA_OPTS||[]).find(o=>o.id===t.para)?.nome||t.para}</div>
              </div>
              <span style="font-size:10px;padding:2px 7px;border-radius:5px;background:${prCor(t.prioridade)}18;color:${prCor(t.prioridade)};font-weight:700;flex-shrink:0">${t.prioridade||'normal'}</span>
            </div>`).join('')||`<div style="padding:28px;text-align:center;font-size:12px;color:#D1D5DB">Nenhuma tarefa pendente</div>`}
        </div>

      </div>

      <!-- Tags do grupo Agendamento -->
      <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;overflow:hidden;margin-bottom:16px">
        <div style="padding:13px 18px;border-bottom:1px solid #F3F4F6;display:flex;align-items:center;justify-content:space-between">
          <div style="font-size:13px;font-weight:700;color:#374151;display:flex;align-items:center;gap:6px">
            <i data-feather="tag" style="width:13px;height:13px;color:#3B82F6"></i> Tags — Grupo Agendamento
          </div>
          <button onclick="if(window.renderSettingsTags){location.hash='settings-tags';renderSettingsTags()}" style="font-size:11px;color:#7C3AED;background:none;border:none;cursor:pointer;font-weight:600;display:flex;align-items:center;gap:4px">
            <i data-feather="settings" style="width:11px;height:11px"></i> Configurar
          </button>
        </div>
        <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:0">
          ${agTags.map(tag=>{
            const automations = [
              tag.msg_template_id   && cfg.auto_mensagens  ? {icon:'message-circle',cor:'#3B82F6'} : null,
              tag.task_template_id  && cfg.auto_tarefas    ? {icon:'check-square',  cor:'#10B981'} : null,
              tag.kanban_coluna     && cfg.auto_kanban      ? {icon:'trello',        cor:'#8B5CF6'} : null,
              tag.alert_template_id && cfg.auto_alertas    ? {icon:'bell',          cor:'#F59E0B'} : null,
              tag.cor_calendario                           ? {icon:'calendar',      cor:tag.cor_calendario} : null,
            ].filter(Boolean)
            return `
              <div style="padding:11px 16px;border-bottom:1px solid #F9FAFB;border-right:1px solid #F9FAFB;display:flex;align-items:center;gap:10px">
                <div style="width:8px;height:8px;border-radius:50%;background:${tag.cor};flex-shrink:0"></div>
                <div style="flex:1;min-width:0">
                  <div style="font-size:12px;font-weight:700;color:#111827">${tag.nome}</div>
                  <div style="font-size:10.5px;color:#9CA3AF;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${tag.regras||''}</div>
                </div>
                <div style="display:flex;gap:3px;flex-shrink:0">
                  ${automations.map(b=>`<div style="width:20px;height:20px;border-radius:5px;background:${b.cor}15;display:flex;align-items:center;justify-content:center">
                    <i data-feather="${b.icon}" style="width:10px;height:10px;color:${b.cor}"></i>
                  </div>`).join('')}
                </div>
              </div>`}).join('')}
        </div>
      </div>

      <!-- Fluxos de agendamento -->
      <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;overflow:hidden">
        <div style="padding:13px 18px;border-bottom:1px solid #F3F4F6;font-size:13px;font-weight:700;color:#374151;display:flex;align-items:center;gap:6px">
          <i data-feather="git-branch" style="width:13px;height:13px;color:#7C3AED"></i> Fluxos de Automação — Agenda
        </div>
        <div style="padding:14px 16px;display:grid;gap:10px">
          ${agFlows.length ? agFlows.map(f=>`
            <div style="display:flex;align-items:center;gap:12px;padding:11px 14px;background:#FAFAFA;border-radius:9px">
              <div style="width:34px;height:34px;border-radius:9px;background:#3B82F615;display:flex;align-items:center;justify-content:center;flex-shrink:0">
                <i data-feather="git-branch" style="width:14px;height:14px;color:#3B82F6"></i>
              </div>
              <div style="flex:1">
                <div style="font-size:12.5px;font-weight:700;color:#111827;margin-bottom:2px">${f.nome}</div>
                <div style="font-size:11px;color:#9CA3AF">${f.descricao||''} · Delay: ${f.delay_entre_steps||0}h</div>
              </div>
              <span style="font-size:10px;padding:2px 9px;border-radius:6px;font-weight:700;background:${f.ativo?'#DCFCE7':'#F3F4F6'};color:${f.ativo?'#166534':'#9CA3AF'}">${f.ativo?'Ativo':'Pausado'}</span>
              <button onclick="TagEngine.saveFlow({...TagEngine.getFlows().find(x=>x.id==='${f.id}'),ativo:${!f.ativo}});renderAgendaTagsFluxos()"
                style="font-size:11px;padding:5px 11px;border:1px solid #E5E7EB;background:#fff;border-radius:7px;cursor:pointer;color:${f.ativo?'#EF4444':'#10B981'};font-weight:600">
                ${f.ativo?'Pausar':'Ativar'}
              </button>
            </div>`).join('')
          : `<div style="padding:24px;text-align:center;font-size:12px;color:#9CA3AF">Nenhum fluxo de agendamento configurado ainda.</div>`}
        </div>
      </div>

    </div>`
  featherIn(root)
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

})()
