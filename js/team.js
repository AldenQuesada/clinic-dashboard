// ── ClinicAI — Team Module ──
// ═══════════════════════════════════════════════════════════
// EQUIPE E PERMISSÕES
// ═══════════════════════════════════════════════════════════
let _teamUsers    = []
let _teamRoleFilter = ''

const ROLE_LABELS = {
  admin:        { label: 'Admin',       bg: '#FEF2F2', color: '#DC2626' },
  gestor:       { label: 'Gestor',      bg: '#F5F3FF', color: '#7C3AED' },
  comercial:    { label: 'Comercial',   bg: '#EFF6FF', color: '#2563EB' },
  atendimento:  { label: 'Atendimento', bg: '#F0FDF4', color: '#16A34A' },
}

const CONTRACT_LABELS = {
  clt:        'CLT',
  pj:         'PJ / Nota Fiscal',
  freelancer: 'Freelancer',
  socio:      'Sócio',
  estagio:    'Estágio',
}

const DEFAULT_FUNCTIONS = ['Médico(a)','Enfermeiro(a)','Recepcionista','Consultor(a) Comercial','Gestor(a)','Administrativo(a)','SDR','CS / Pós-venda']

// ── Carregar equipe ───────────────────────────────────────────
async function loadTeam() {
  try {
    const users = await apiFetch('/users')
    _teamUsers = (Array.isArray(users) ? users : []).map(u => ({
      ...u,
      profile: _getProfile(u.id),  // injeta perfil do localStorage
    }))
    renderTeamStats()
    renderTeamGrid()
  } catch (e) {
    const grid = document.getElementById('teamGrid')
    if (grid) grid.innerHTML = `<div style="color:#EF4444;padding:16px">${e.message}</div>`
  }
}

function renderTeamStats() {
  const el = document.getElementById('teamStats')
  if (!el) return
  const total    = _teamUsers.length
  const active   = _teamUsers.filter(u => u.active).length
  const admins   = _teamUsers.filter(u => u.role === 'admin').length
  const clt      = _teamUsers.filter(u => (u.profile?.contractType) === 'clt').length
  const free     = _teamUsers.filter(u => ['pj','freelancer'].includes(u.profile?.contractType)).length

  const stat = (label, value, color) => `
    <div style="background:#fff;border:1px solid #F3F4F6;border-radius:12px;padding:16px;text-align:center">
      <div style="font-size:22px;font-weight:800;color:${color}">${value}</div>
      <div style="font-size:11px;color:#9CA3AF;font-weight:600;margin-top:3px;text-transform:uppercase;letter-spacing:.05em">${label}</div>
    </div>`

  el.innerHTML =
    stat('Total',      total,  '#374151') +
    stat('Ativos',     active, '#10B981') +
    stat('Admin',      admins, '#7C3AED') +
    stat('CLT',        clt,    '#2563EB') +
    stat('PJ / Free',  free,   '#EA580C')
}

function filterTeam(role) {
  _teamRoleFilter = role
  document.querySelectorAll('.team-filter-btn').forEach(b => {
    b.classList.toggle('team-filter-active', b.dataset.role === role)
  })
  renderTeamGrid()
}
window.filterTeam = filterTeam

function renderTeamGrid() {
  const grid = document.getElementById('teamGrid')
  if (!grid) return

  const list = _teamRoleFilter
    ? _teamUsers.filter(u => u.role === _teamRoleFilter)
    : _teamUsers

  if (!list.length) {
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:48px;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:14px">Nenhum membro encontrado</div>`
    return
  }

  grid.innerHTML = list.map(u => {
    const p     = u.profile || {}
    const rl    = ROLE_LABELS[u.role] || { label: u.role, bg: '#F3F4F6', color: '#374151' }
    const initials = u.name.split(' ').slice(0,2).map(w => w[0]).join('').toUpperCase()
    const avatarColors = ['#7C3AED','#2563EB','#16A34A','#EA580C','#DC2626','#0891B2']
    const avatarColor  = avatarColors[u.name.charCodeAt(0) % avatarColors.length]
    const commCount    = (p.commissions || []).length
    const hasGoal      = (p.goals || []).length > 0

    return `
      <div style="
        background:#fff;border:1px solid #F3F4F6;border-radius:14px;padding:20px;
        cursor:pointer;transition:box-shadow .2s;
        ${u.active ? '' : 'opacity:.55;'}
      " onclick="openUserModal('${u.id}')"
         onmouseenter="this.style.boxShadow='0 4px 20px rgba(0,0,0,0.08)'"
         onmouseleave="this.style.boxShadow='none'">

        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px">
          <div style="display:flex;gap:12px;align-items:center">
            <div style="
              width:44px;height:44px;border-radius:50%;flex-shrink:0;
              background:linear-gradient(135deg,${avatarColor},${avatarColor}99);
              display:flex;align-items:center;justify-content:center;
              font-size:16px;font-weight:700;color:#fff;
            ">${initials}</div>
            <div>
              <div style="font-size:14px;font-weight:700;color:#111">${u.name}</div>
              <div style="font-size:12px;color:#9CA3AF;margin-top:1px">${p.funcao || u.email}</div>
            </div>
          </div>
          <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">
            <span style="background:${rl.bg};color:${rl.color};padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700">${rl.label}</span>
            ${u.active
              ? '<span style="background:#F0FDF4;color:#16A34A;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600">● Ativo</span>'
              : '<span style="background:#FEF2F2;color:#DC2626;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:600">○ Inativo</span>'}
          </div>
        </div>

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:14px">
          <div style="background:#F9FAFB;border-radius:8px;padding:8px 10px">
            <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px">Contrato</div>
            <div style="font-size:12px;font-weight:600;color:#374151">${CONTRACT_LABELS[p.contractType] || '—'}</div>
          </div>
          <div style="background:#F9FAFB;border-radius:8px;padding:8px 10px">
            <div style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase;margin-bottom:2px">Salário Base</div>
            <div style="font-size:12px;font-weight:600;color:#374151">${p.salary ? formatCurrency(p.salary) : '—'}</div>
          </div>
        </div>

        <div style="display:flex;gap:6px;flex-wrap:wrap">
          ${p.workDays?.length ? `<span style="background:#EFF6FF;color:#2563EB;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:600">📅 ${p.workDays.length}d/sem</span>` : ''}
          ${commCount ? `<span style="background:#FFF7ED;color:#EA580C;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:600">💰 ${commCount} comissão${commCount>1?'ões':''}</span>` : ''}
          ${hasGoal   ? `<span style="background:#F0FDF4;color:#16A34A;padding:3px 9px;border-radius:6px;font-size:11px;font-weight:600">🎯 Meta cadastrada</span>` : ''}
        </div>
      </div>`
  }).join('')
}

// ── Modal de edição de membro ─────────────────────────────────
async function openUserModal(userId) {
  const user = _teamUsers.find(u => u.id === userId)
  if (!user) return
  showUserModal(user)
}
window.openUserModal = openUserModal

function showUserModal(user) {
  document.getElementById('userModal')?.remove()
  const p = user.profile || {}
  const initials = user.name.split(' ').slice(0,2).map(w=>w[0]).join('').toUpperCase()

  // Funções disponíveis
  const customFunctions = JSON.parse(localStorage.getItem('clinicai_team_functions') || '[]')
  const allFunctions = [...new Set([...DEFAULT_FUNCTIONS, ...customFunctions])]

  // Dias da semana
  const DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  const workDays = p.workDays || ['Seg','Ter','Qua','Qui','Sex']

  // Comissões
  const commissions = p.commissions || []
  const goals = p.goals || []

  const m = document.createElement('div')
  m.id = 'userModal'
  m.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px" onclick="if(event.target===this)this.remove()">
      <div style="background:#fff;border-radius:18px;width:100%;max-width:820px;height:92vh;display:flex;flex-direction:column;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.25)">

        <!-- Header -->
        <div style="padding:20px 28px;border-bottom:1px solid #F3F4F6;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">
          <div style="display:flex;gap:14px;align-items:center">
            <div style="width:46px;height:46px;border-radius:50%;background:linear-gradient(135deg,#7C3AED,#5B21B6);display:flex;align-items:center;justify-content:center;font-size:17px;font-weight:700;color:#fff">${initials}</div>
            <div>
              <div style="font-size:17px;font-weight:700;color:#111">${user.name}</div>
              <div style="font-size:12px;color:#9CA3AF">${user.email}</div>
            </div>
          </div>
          <div style="display:flex;gap:8px;align-items:center">
            <button onclick="toggleUserActive('${user.id}',${!user.active})" style="
              padding:7px 14px;background:${user.active?'#FEF2F2':'#F0FDF4'};
              color:${user.active?'#DC2626':'#16A34A'};border:none;border-radius:8px;
              font-size:12px;font-weight:600;cursor:pointer;
            ">${user.active ? '🔴 Desativar' : '🟢 Ativar'}</button>
            <button onclick="showResetPasswordModal('${user.id}')" style="padding:7px 14px;background:#F3F4F6;color:#374151;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">🔑 Senha</button>
            <button onclick="document.getElementById('userModal').remove()" style="width:34px;height:34px;border-radius:50%;background:#F3F4F6;border:none;cursor:pointer;font-size:18px;color:#6B7280;display:flex;align-items:center;justify-content:center">✕</button>
          </div>
        </div>

        <!-- Abas -->
        <div style="display:flex;gap:0;padding:0 28px;border-bottom:2px solid #F3F4F6;flex-shrink:0">
          <button onclick="userTab('personal')"     id="utab_personal"     class="stab stab-active">👤 Dados Pessoais</button>
          <button onclick="userTab('contract')"     id="utab_contract"     class="stab">📋 Cargo e Contrato</button>
          <button onclick="userTab('schedule')"     id="utab_schedule"     class="stab">🕐 Horário</button>
          <button onclick="userTab('commission')"   id="utab_commission"   class="stab">💰 Comissionamento</button>
        </div>

        <!-- Corpo scrollável -->
        <div style="overflow-y:auto;flex:1;padding:24px 28px">

          <!-- ── Tab Dados Pessoais ── -->
          <div id="utpage_personal">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
              ${uField('u_name','text','Nome completo *',user.name)}
              ${uField('u_email','email','E-mail *',user.email)}
              ${uField('u_phone','text','Telefone / WhatsApp',p.phone||'')}
              ${uField('u_cpf','text','CPF',p.cpf||'')}
              ${uField('u_rg','text','RG',p.rg||'')}
              ${uField('u_dob','date','Data de nascimento',p.dob||'')}
              <div style="grid-column:1/span 2">
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Endereço</label>
                <input id="u_address" type="text" value="${p.address||''}" placeholder="Rua, número, bairro, cidade" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box"/>
              </div>
              <div style="grid-column:1/span 2">
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Observações</label>
                <textarea id="u_notes" rows="2" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;resize:vertical;box-sizing:border-box;font-family:inherit">${p.notes||''}</textarea>
              </div>
            </div>
          </div>

          <!-- ── Tab Cargo e Contrato ── -->
          <div id="utpage_contract" style="display:none">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">

              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Perfil de Acesso (Sistema)</label>
                <select id="u_role" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;background:#fff;box-sizing:border-box">
                  <option value="admin"       ${user.role==='admin'       ?'selected':''}>Admin</option>
                  <option value="gestor"      ${user.role==='gestor'      ?'selected':''}>Gestor</option>
                  <option value="comercial"   ${user.role==='comercial'   ?'selected':''}>Comercial</option>
                  <option value="atendimento" ${user.role==='atendimento' ?'selected':''}>Atendimento</option>
                </select>
              </div>

              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Função / Cargo</label>
                <div style="display:flex;gap:6px">
                  <select id="u_funcao" style="flex:1;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;background:#fff;box-sizing:border-box">
                    <option value="">Selecionar...</option>
                    ${allFunctions.map(f => `<option value="${f}" ${p.funcao===f?'selected':''}>${f}</option>`).join('')}
                    <option value="__nova__">+ Nova função...</option>
                  </select>
                </div>
                <div id="novaFuncaoWrap" style="display:none;margin-top:8px;display:${p.funcao&&!allFunctions.includes(p.funcao)?'flex':'none'};gap:6px">
                  <input id="u_funcao_txt" type="text" placeholder="Digite a nova função" value="${(!allFunctions.includes(p.funcao)&&p.funcao)?p.funcao:''}" style="flex:1;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>
                  <button onclick="saveNewFunction()" style="padding:8px 12px;background:#7C3AED;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Salvar</button>
                </div>
              </div>

              <div>
                <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Modalidade de Contratação</label>
                <select id="u_contractType" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;background:#fff;box-sizing:border-box">
                  <option value="">Selecionar</option>
                  <option value="clt"        ${p.contractType==='clt'?'selected':''}>CLT</option>
                  <option value="pj"         ${p.contractType==='pj'?'selected':''}>PJ / Nota Fiscal</option>
                  <option value="freelancer" ${p.contractType==='freelancer'?'selected':''}>Freelancer</option>
                  <option value="socio"      ${p.contractType==='socio'?'selected':''}>Sócio</option>
                  <option value="estagio"    ${p.contractType==='estagio'?'selected':''}>Estágio</option>
                </select>
              </div>

              ${uField('u_startDate','date','Data de Entrada',p.startDate||'')}
              ${uField('u_salary','number','Salário Mensal Base (R$)',p.salary||'')}
              ${uField('u_advanceSalary','number','Adiantamento (R$)',p.advanceSalary||'')}
              ${uField('u_vacationDays','number','Dias de Férias / Ano',p.vacationDays||'30')}
              ${uField('u_bankName','text','Banco',p.bankName||'')}
              ${uField('u_bankAccount','text','Agência / Conta',p.bankAccount||'')}
            </div>
          </div>

          <!-- ── Tab Horário ── -->
          <div id="utpage_schedule" style="display:none">
            <div style="margin-bottom:20px">
              <div style="font-size:13px;font-weight:700;color:#374151;margin-bottom:12px">Dias de trabalho</div>
              <div style="display:flex;gap:8px;flex-wrap:wrap">
                ${DAYS.map(d => `
                  <label style="cursor:pointer">
                    <input type="checkbox" id="wd_${d}" ${workDays.includes(d)?'checked':''} style="display:none"/>
                    <div id="wd_lbl_${d}" onclick="toggleWorkDay('${d}')" style="
                      width:44px;height:44px;border-radius:50%;display:flex;align-items:center;justify-content:center;
                      font-size:12px;font-weight:700;cursor:pointer;user-select:none;
                      background:${workDays.includes(d)?'#7C3AED':'#F3F4F6'};
                      color:${workDays.includes(d)?'#fff':'#9CA3AF'};
                    ">${d}</div>
                  </label>`).join('')}
              </div>
            </div>

            <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:20px">
              ${uField('u_timeIn','time','Entrada',p.timeIn||'08:00')}
              ${uField('u_lunchStart','time','Início almoço',p.lunchStart||'12:00')}
              ${uField('u_lunchEnd','time','Fim almoço',p.lunchEnd||'13:00')}
              ${uField('u_timeOut','time','Saída',p.timeOut||'18:00')}
              ${uField('u_weeklyHours','number','Horas semanais',p.weeklyHours||'40')}
              ${uField('u_overtimeRate','number','Hora extra (R$)',p.overtimeRate||'')}
            </div>

            <div style="background:#F9FAFB;border-radius:12px;padding:16px">
              <div style="font-size:12px;font-weight:700;color:#374151;margin-bottom:8px">Observações de horário</div>
              <textarea id="u_scheduleNotes" rows="2" placeholder="Ex: Plantão sábado intercalado, expediente reduzido às sextas..." style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;resize:vertical;box-sizing:border-box;font-family:inherit">${p.scheduleNotes||''}</textarea>
            </div>
          </div>

          <!-- ── Tab Comissionamento ── -->
          <div id="utpage_commission" style="display:none">

            <!-- Comissão por procedimento -->
            <div style="margin-bottom:28px">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                <div>
                  <div style="font-size:14px;font-weight:700;color:#111">Comissão por Procedimento</div>
                  <div style="font-size:12px;color:#9CA3AF;margin-top:2px">% automático aplicado em cada procedimento realizado</div>
                </div>
                <button onclick="showAddCommissionRow()" style="padding:7px 14px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">+ Adicionar</button>
              </div>

              <div id="commissionRows">
                ${commissions.length ? commissions.map((c,i) => renderCommissionRow(c,i)).join('') : `
                  <div style="text-align:center;padding:20px;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:10px">
                    Nenhuma comissão configurada
                  </div>`}
              </div>

              <!-- Form adicionar comissão -->
              <div id="addCommissionForm" style="display:none;background:#F9FAFB;border:1.5px solid #E5E7EB;border-radius:12px;padding:16px;margin-top:12px">
                <div style="font-size:13px;font-weight:600;color:#374151;margin-bottom:12px">Nova Regra de Comissão</div>
                <div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px;margin-bottom:10px">
                  <div>
                    <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Procedimento</label>
                    <select id="comm_proc" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;background:#fff;box-sizing:border-box">
                      <option value="__todos__">Todos os procedimentos</option>
                      ${_cachedProcedures.map(p2 => `<option value="${p2.name}">${p2.name}</option>`).join('')}
                      <option value="__outro__">Outro (escrever)</option>
                    </select>
                  </div>
                  <div>
                    <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">% Comissão</label>
                    <input id="comm_pct" type="number" min="0" max="100" step="0.5" placeholder="Ex: 10" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>
                  </div>
                  <div>
                    <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Tipo</label>
                    <select id="comm_type" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;background:#fff;box-sizing:border-box">
                      <option value="percent">% do valor</option>
                      <option value="fixed">Valor fixo R$</option>
                    </select>
                  </div>
                </div>
                <div id="comm_proc_txt_wrap" style="display:none;margin-bottom:10px">
                  <input id="comm_proc_txt" type="text" placeholder="Nome do procedimento" style="width:100%;padding:8px 10px;border:1.5px solid #E5E7EB;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>
                </div>
                <div style="display:flex;gap:8px">
                  <button onclick="document.getElementById('addCommissionForm').style.display='none'" style="padding:7px 14px;background:#F3F4F6;color:#374151;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Cancelar</button>
                  <button onclick="saveCommissionRow('${user.id}')" style="padding:7px 14px;background:#7C3AED;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Adicionar Regra</button>
                </div>
              </div>
            </div>

            <!-- Metas e bônus -->
            <div>
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">
                <div>
                  <div style="font-size:14px;font-weight:700;color:#111">Metas e Bônus</div>
                  <div style="font-size:12px;color:#9CA3AF;margin-top:2px">Bônus automático ao atingir metas mensais</div>
                </div>
                <button onclick="showAddGoalRow()" style="padding:7px 14px;background:#10B981;color:#fff;border:none;border-radius:8px;font-size:12px;font-weight:600;cursor:pointer">+ Adicionar Meta</button>
              </div>

              <div id="goalRows">
                ${goals.length ? goals.map((g,i) => renderGoalRow(g,i)).join('') : `
                  <div style="text-align:center;padding:20px;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:10px">
                    Nenhuma meta configurada
                  </div>`}
              </div>

              <!-- Form meta -->
              <div id="addGoalForm" style="display:none;background:#F0FDF4;border:1.5px solid #BBF7D0;border-radius:12px;padding:16px;margin-top:12px">
                <div style="font-size:13px;font-weight:600;color:#15803D;margin-bottom:12px">Nova Meta / Bônus</div>
                <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:10px">
                  <div>
                    <label style="font-size:11px;font-weight:700;color:#15803D;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Meta Mensal (R$)</label>
                    <input id="goal_target" type="number" placeholder="Ex: 10000" style="width:100%;padding:8px 10px;border:1.5px solid #BBF7D0;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>
                  </div>
                  <div>
                    <label style="font-size:11px;font-weight:700;color:#15803D;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Bônus (%)</label>
                    <input id="goal_bonus_pct" type="number" min="0" max="100" step="0.5" placeholder="Ex: 5" style="width:100%;padding:8px 10px;border:1.5px solid #BBF7D0;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>
                  </div>
                  <div>
                    <label style="font-size:11px;font-weight:700;color:#15803D;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">OU Bônus fixo (R$)</label>
                    <input id="goal_bonus_fixed" type="number" placeholder="Ex: 500" style="width:100%;padding:8px 10px;border:1.5px solid #BBF7D0;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>
                  </div>
                </div>
                <div style="margin-bottom:10px">
                  <label style="font-size:11px;font-weight:700;color:#15803D;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:4px">Descrição</label>
                  <input id="goal_desc" type="text" placeholder="Ex: Meta de vendas — Full Face" style="width:100%;padding:8px 10px;border:1.5px solid #BBF7D0;border-radius:7px;font-size:13px;outline:none;box-sizing:border-box"/>
                </div>
                <div style="display:flex;gap:8px">
                  <button onclick="document.getElementById('addGoalForm').style.display='none'" style="padding:7px 14px;background:#F3F4F6;color:#374151;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Cancelar</button>
                  <button onclick="saveGoalRow('${user.id}')" style="padding:7px 14px;background:#10B981;color:#fff;border:none;border-radius:7px;font-size:12px;font-weight:600;cursor:pointer">Adicionar Meta</button>
                </div>
              </div>
            </div>

          </div>
        </div><!-- fim body -->

        <!-- Footer -->
        <div style="padding:16px 28px 22px;border-top:1px solid #F3F4F6;flex-shrink:0;display:flex;justify-content:flex-end;gap:10px">
          <button onclick="document.getElementById('userModal').remove()" style="padding:10px 20px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">Fechar</button>
          <button onclick="saveUserModal('${user.id}')" style="padding:10px 24px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer;box-shadow:0 4px 12px rgba(124,58,237,0.3)">💾 Salvar Alterações</button>
        </div>
      </div>
    </div>`

  document.body.appendChild(m)

  // Watcher: "nova função"
  document.getElementById('u_funcao')?.addEventListener('change', function() {
    const wrap = document.getElementById('novaFuncaoWrap')
    if (wrap) wrap.style.display = this.value === '__nova__' ? 'flex' : 'none'
  })

  // Watcher: procedimento "outro"
  document.getElementById('comm_proc')?.addEventListener('change', function() {
    const wrap = document.getElementById('comm_proc_txt_wrap')
    if (wrap) wrap.style.display = this.value === '__outro__' ? 'block' : 'none'
  })
}

function uField(id, type, label, value='') {
  return `
    <div>
      <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">${label}</label>
      <input id="${id}" type="${type}" value="${value}" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box"/>
    </div>`
}

function userTab(tab) {
  ;['personal','contract','schedule','commission'].forEach(t => {
    const page = document.getElementById(`utpage_${t}`)
    const btn  = document.getElementById(`utab_${t}`)
    if (!page || !btn) return
    const active = t === tab
    page.style.display = active ? 'block' : 'none'
    btn.classList.toggle('stab-active', active)
  })
}
window.userTab = userTab

// Dias de trabalho toggle
let _workDaysSelected = []
function toggleWorkDay(day) {
  // Re-lê do DOM
  const allDays = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  _workDaysSelected = allDays.filter(d => document.getElementById(`wd_${d}`)?.checked)
  const idx = _workDaysSelected.indexOf(day)
  if (idx >= 0) _workDaysSelected.splice(idx, 1)
  else _workDaysSelected.push(day)

  const cb  = document.getElementById(`wd_${day}`)
  const lbl = document.getElementById(`wd_lbl_${day}`)
  const active = _workDaysSelected.includes(day)
  if (cb) cb.checked = active
  if (lbl) { lbl.style.background = active ? '#7C3AED' : '#F3F4F6'; lbl.style.color = active ? '#fff' : '#9CA3AF' }
}
window.toggleWorkDay = toggleWorkDay

// Renderizar linha de comissão
function renderCommissionRow(c, i) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:#fff;border:1px solid #F3F4F6;border-radius:9px;margin-bottom:6px">
      <div style="display:flex;align-items:center;gap:10px">
        <div style="width:8px;height:8px;border-radius:50%;background:#EA580C;flex-shrink:0"></div>
        <div>
          <div style="font-size:13px;font-weight:600;color:#111">${c.procedure === '__todos__' ? 'Todos os procedimentos' : c.procedure}</div>
          <div style="font-size:11px;color:#9CA3AF">${c.type === 'fixed' ? 'R$ '+c.value+' fixo' : c.value+'% do valor'}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px">
        <div style="font-size:15px;font-weight:800;color:#EA580C">${c.type==='fixed' ? formatCurrency(c.value) : c.value+'%'}</div>
        <button onclick="removeCommissionRow(${i})" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:14px">✕</button>
      </div>
    </div>`
}

function renderGoalRow(g, i) {
  return `
    <div style="display:flex;justify-content:space-between;align-items:center;padding:12px 14px;background:#F0FDF4;border:1px solid #BBF7D0;border-radius:9px;margin-bottom:6px">
      <div>
        <div style="font-size:13px;font-weight:600;color:#15803D">${g.description || 'Meta Mensal'}</div>
        <div style="font-size:12px;color:#16A34A;margin-top:2px">Meta: ${formatCurrency(g.target)}</div>
      </div>
      <div style="display:flex;align-items:center;gap:10px">
        <div style="text-align:right">
          ${g.bonusPercent ? `<div style="font-size:14px;font-weight:800;color:#16A34A">${g.bonusPercent}%</div>` : ''}
          ${g.bonusFixed   ? `<div style="font-size:13px;font-weight:700;color:#16A34A">+ ${formatCurrency(g.bonusFixed)}</div>` : ''}
        </div>
        <button onclick="removeGoalRow(${i})" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:14px">✕</button>
      </div>
    </div>`
}

// Funções de comissão
function showAddCommissionRow() { document.getElementById('addCommissionForm').style.display = 'block' }
function showAddGoalRow()       { document.getElementById('addGoalForm').style.display = 'block' }
window.showAddCommissionRow = showAddCommissionRow
window.showAddGoalRow       = showAddGoalRow

// ── Perfis de RH — consolidados em uma única chave para Supabase ──
//
// Antes: clinicai_profile_${userId} (dinâmico, nunca sincronizado)
// Agora: clinicai_team_profiles = { userId: { ...campos } }
//        → chave única, está no SYNC_KEYS, replica para Supabase
//
const TEAM_PROFILES_KEY = 'clinicai_team_profiles'

// Migração one-shot: move chaves legadas clinicai_profile_* → objeto consolidado
function _migrateProfileKeys() {
  try {
    const migrated = JSON.parse(localStorage.getItem(TEAM_PROFILES_KEY) || '{}')
    let changed = false
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i)
      if (!k || !k.startsWith('clinicai_profile_')) continue
      const uid = k.replace('clinicai_profile_', '')
      if (uid && !migrated[uid]) {
        try { migrated[uid] = JSON.parse(localStorage.getItem(k) || '{}'); changed = true } catch {}
      }
    }
    if (changed) {
      store.set(TEAM_PROFILES_KEY, migrated)
      // Remove chaves legadas
      Object.keys(migrated).forEach(uid => {
        try { localStorage.removeItem(`clinicai_profile_${uid}`) } catch {}
      })
    }
  } catch {}
}

function _getAllProfiles() {
  try { return JSON.parse(localStorage.getItem(TEAM_PROFILES_KEY) || '{}') } catch { return {} }
}
function _getProfile(userId) {
  return _getAllProfiles()[userId] || {}
}
function _saveProfile(userId, profile) {
  const all = _getAllProfiles()
  all[userId] = profile
  store.set(TEAM_PROFILES_KEY, all)
  const u = _teamUsers.find(x => x.id === userId)
  if (u) u.profile = profile
}
function _getCurrentProfile(userId) {
  return _getProfile(userId)
}

// Executa migração imediatamente
_migrateProfileKeys()

function saveCommissionRow(userId) {
  const procSel = document.getElementById('comm_proc')?.value
  const procTxt = document.getElementById('comm_proc_txt')?.value?.trim()
  const procedure = procSel === '__outro__' ? procTxt : procSel
  const value   = parseFloat(document.getElementById('comm_pct')?.value || '0')
  const type    = document.getElementById('comm_type')?.value || 'percent'
  if (!procedure || !value) { alert('Preencha procedimento e valor'); return }

  const profile = _getCurrentProfile(userId)
  profile.commissions = [...(profile.commissions || []), { procedure, value, type }]
  _saveProfile(userId, profile)
  document.getElementById('commissionRows').innerHTML = profile.commissions.map(renderCommissionRow).join('')
  document.getElementById('addCommissionForm').style.display = 'none'
}

function removeCommissionRow(index) {
  const modal = document.getElementById('userModal')
  if (!modal) return
  const saveBtn = modal.querySelector('button[onclick*="saveUserModal"]')
  const userId  = saveBtn?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1]
  if (!userId) return

  const profile = _getCurrentProfile(userId)
  profile.commissions = [...(profile.commissions || [])]
  profile.commissions.splice(index, 1)
  _saveProfile(userId, profile)
  document.getElementById('commissionRows').innerHTML =
    profile.commissions.length
      ? profile.commissions.map(renderCommissionRow).join('')
      : '<div style="text-align:center;padding:20px;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:10px">Nenhuma comissão configurada</div>'
}

function saveGoalRow(userId) {
  const target     = parseFloat(document.getElementById('goal_target')?.value || '0')
  const bonusPct   = parseFloat(document.getElementById('goal_bonus_pct')?.value || '0')
  const bonusFixed = parseFloat(document.getElementById('goal_bonus_fixed')?.value || '0')
  const description = document.getElementById('goal_desc')?.value?.trim()
  if (!target) { alert('Informe a meta mensal'); return }

  const profile = _getCurrentProfile(userId)
  profile.goals = [...(profile.goals || []), { target, bonusPercent: bonusPct||null, bonusFixed: bonusFixed||null, description: description||'' }]
  _saveProfile(userId, profile)
  document.getElementById('goalRows').innerHTML = profile.goals.map(renderGoalRow).join('')
  document.getElementById('addGoalForm').style.display = 'none'
}

function removeGoalRow(index) {
  const modal = document.getElementById('userModal')
  if (!modal) return
  const saveBtn = modal.querySelector('button[onclick*="saveUserModal"]')
  const userId  = saveBtn?.getAttribute('onclick')?.match(/'([^']+)'/)?.[1]
  if (!userId) return

  const profile = _getCurrentProfile(userId)
  profile.goals = [...(profile.goals || [])]
  profile.goals.splice(index, 1)
  _saveProfile(userId, profile)
  document.getElementById('goalRows').innerHTML =
    profile.goals.length
      ? profile.goals.map(renderGoalRow).join('')
      : '<div style="text-align:center;padding:20px;color:#9CA3AF;font-size:13px;background:#F9FAFB;border-radius:10px">Nenhuma meta configurada</div>'
}

window.saveCommissionRow = saveCommissionRow
window.removeCommissionRow = removeCommissionRow
window.saveGoalRow       = saveGoalRow
window.removeGoalRow     = removeGoalRow

// ── Salvar modal completo ─────────────────────────────────────
async function saveUserModal(userId) {
  const btn = document.querySelector('#userModal button[onclick*="saveUserModal"]')
  if (btn) { btn.textContent = 'Salvando...'; btn.disabled = true }

  const g = id => document.getElementById(id)?.value?.trim() || ''

  // Dias de trabalho do DOM
  const DAYS = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb']
  const workDays = DAYS.filter(d => document.getElementById(`wd_${d}`)?.checked)

  const profile = _getCurrentProfile(userId)
  Object.assign(profile, {
    phone:         g('u_phone')         || profile.phone,
    cpf:           g('u_cpf')           || profile.cpf,
    rg:            g('u_rg')            || profile.rg,
    dob:           g('u_dob')           || profile.dob,
    address:       g('u_address')       || profile.address,
    notes:         g('u_notes')         || profile.notes,
    funcao:        g('u_funcao') === '__nova__' ? g('u_funcao_txt') : (g('u_funcao') || profile.funcao),
    contractType:  g('u_contractType')  || profile.contractType,
    startDate:     g('u_startDate')     || profile.startDate,
    salary:        parseFloat(g('u_salary')) || profile.salary,
    advanceSalary: parseFloat(g('u_advanceSalary')) || profile.advanceSalary,
    vacationDays:  parseInt(g('u_vacationDays')) || profile.vacationDays,
    bankName:      g('u_bankName')      || profile.bankName,
    bankAccount:   g('u_bankAccount')   || profile.bankAccount,
    workDays:      workDays.length ? workDays : profile.workDays,
    timeIn:        g('u_timeIn')        || profile.timeIn,
    lunchStart:    g('u_lunchStart')    || profile.lunchStart,
    lunchEnd:      g('u_lunchEnd')      || profile.lunchEnd,
    timeOut:       g('u_timeOut')       || profile.timeOut,
    weeklyHours:   parseInt(g('u_weeklyHours')) || profile.weeklyHours,
    overtimeRate:  parseFloat(g('u_overtimeRate')) || profile.overtimeRate,
    scheduleNotes: g('u_scheduleNotes') || profile.scheduleNotes,
  })

  try {
    // Salvar dados de acesso na API
    const apiUpdates = {}
    const newName = g('u_name'); if (newName) apiUpdates.name = newName
    const newRole = g('u_role'); if (newRole) apiUpdates.role = newRole

    let updated = _teamUsers.find(u => u.id === userId)
    if (Object.keys(apiUpdates).length) {
      updated = await apiFetch(`/users/${userId}`, { method: 'PUT', body: apiUpdates })
    }

    // Salvar perfil de RH no localStorage
    _saveProfile(userId, profile)

    const idx = _teamUsers.findIndex(u => u.id === userId)
    if (idx >= 0) _teamUsers[idx] = { ..._teamUsers[idx], ...(updated||{}), profile }

    document.getElementById('userModal')?.remove()
    renderTeamGrid()
    renderTeamStats()
  } catch (e) {
    if (btn) { btn.textContent = '💾 Salvar Alterações'; btn.disabled = false }
    alert('Erro ao salvar: ' + e.message)
  }
}
window.saveUserModal = saveUserModal

// Salvar nova função personalizada
function saveNewFunction() {
  const nova = document.getElementById('u_funcao_txt')?.value?.trim()
  if (!nova) return
  const funcs = JSON.parse(localStorage.getItem('clinicai_team_functions') || '[]')
  if (!funcs.includes(nova)) funcs.push(nova)
  store.set('clinicai_team_functions', funcs)
  const sel = document.getElementById('u_funcao')
  if (sel) {
    const opt = document.createElement('option')
    opt.value = nova; opt.textContent = nova; opt.selected = true
    sel.insertBefore(opt, sel.querySelector('option[value="__nova__"]'))
    sel.value = nova
  }
  document.getElementById('novaFuncaoWrap').style.display = 'none'
}
window.saveNewFunction = saveNewFunction

// ── Toggle ativo/inativo ──────────────────────────────────────
async function toggleUserActive(userId, newState) {
  await apiFetch(`/users/${userId}`, { method: 'PUT', body: { active: newState } })
  const u = _teamUsers.find(x => x.id === userId)
  if (u) u.active = newState
  document.getElementById('userModal')?.remove()
  renderTeamGrid()
  renderTeamStats()
}
window.toggleUserActive = toggleUserActive

// ── Reset de senha ────────────────────────────────────────────
function showResetPasswordModal(userId) {
  document.getElementById('resetPwModal')?.remove()
  const m = document.createElement('div')
  m.id = 'resetPwModal'
  m.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;z-index:10001">
      <div style="background:#fff;border-radius:14px;padding:28px;width:360px;box-shadow:0 20px 60px rgba(0,0,0,0.25)">
        <h3 style="margin:0 0 16px;font-size:16px;font-weight:700;color:#111">Redefinir Senha</h3>
        <label style="font-size:12px;font-weight:600;color:#6B7280;display:block;margin-bottom:6px">NOVA SENHA</label>
        <div style="position:relative;margin-bottom:16px">
          <input id="newPwInput" type="password" placeholder="Mínimo 6 caracteres" style="width:100%;padding:10px 40px 10px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box"/>
          <button type="button" onclick="togglePassVis('newPwInput','newPwEye')" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9CA3AF;padding:0;display:flex;align-items:center">
            <svg id="newPwEye" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button onclick="document.getElementById('resetPwModal').remove()" style="padding:9px 16px;background:#F3F4F6;color:#374151;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
          <button onclick="confirmResetPassword('${userId}')" style="padding:9px 16px;background:#7C3AED;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:600;cursor:pointer">Confirmar</button>
        </div>
      </div>
    </div>`
  document.body.appendChild(m)
}

async function confirmResetPassword(userId) {
  const pw = document.getElementById('newPwInput')?.value?.trim()
  if (!pw || pw.length < 6) { alert('Senha deve ter mínimo 6 caracteres'); return }
  await apiFetch(`/users/${userId}/reset-password`, { method: 'PUT', body: { newPassword: pw } })
  document.getElementById('resetPwModal')?.remove()
  alert('Senha redefinida com sucesso!')
}
window.showResetPasswordModal  = showResetPasswordModal
window.confirmResetPassword    = confirmResetPassword
window.renderTeamGrid          = renderTeamGrid
window.renderTeamStats         = renderTeamStats

// ── Adicionar novo usuário ────────────────────────────────────
function showAddUserModal() {
  document.getElementById('addUserModal')?.remove()
  const m = document.createElement('div')
  m.id = 'addUserModal'
  m.innerHTML = `
    <div style="position:fixed;inset:0;background:rgba(0,0,0,0.6);display:flex;align-items:center;justify-content:center;z-index:9999;padding:16px">
      <div style="background:#fff;border-radius:18px;width:100%;max-width:500px;overflow:hidden;box-shadow:0 24px 80px rgba(0,0,0,0.25)">
        <div style="padding:24px 28px;border-bottom:1px solid #F3F4F6;display:flex;justify-content:space-between;align-items:center">
          <div>
            <h2 style="margin:0;font-size:17px;font-weight:700;color:#111">Novo Membro</h2>
            <p style="margin:4px 0 0;font-size:12px;color:#9CA3AF">Acesso ao sistema ClinicAI</p>
          </div>
          <button onclick="document.getElementById('addUserModal').remove()" style="width:32px;height:32px;border-radius:50%;background:#F3F4F6;border:none;cursor:pointer;font-size:16px;color:#6B7280">✕</button>
        </div>
        <div style="padding:24px 28px">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:14px">
            <div style="grid-column:1/span 2">
              <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Nome completo *</label>
              <input id="nu_name" type="text" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box"/>
            </div>
            <div style="grid-column:1/span 2">
              <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">E-mail *</label>
              <input id="nu_email" type="email" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box"/>
            </div>
            <div style="grid-column:1/span 2">
              <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Senha *</label>
              <div style="position:relative">
                <input id="nu_password" type="password" placeholder="Mínimo 6 caracteres" style="width:100%;padding:9px 40px 9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box"/>
                <button type="button" onclick="togglePassVis('nu_password','nu_pw_eye')" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9CA3AF;padding:0;display:flex;align-items:center">
                  <svg id="nu_pw_eye" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </div>
            <div style="grid-column:1/span 2">
              <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Confirmar Senha *</label>
              <div style="position:relative">
                <input id="nu_password2" type="password" placeholder="Repita a senha" style="width:100%;padding:9px 40px 9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;box-sizing:border-box"/>
                <button type="button" onclick="togglePassVis('nu_password2','nu_pw2_eye')" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);background:none;border:none;cursor:pointer;color:#9CA3AF;padding:0;display:flex;align-items:center">
                  <svg id="nu_pw2_eye" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                </button>
              </div>
            </div>
            <div>
              <label style="font-size:11px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.05em;display:block;margin-bottom:5px">Perfil de Acesso</label>
              <select id="nu_role" style="width:100%;padding:9px 12px;border:1.5px solid #E5E7EB;border-radius:8px;font-size:13px;outline:none;background:#fff;box-sizing:border-box">
                <option value="comercial">Comercial</option>
                <option value="atendimento">Atendimento</option>
                <option value="gestor">Gestor</option>
                <option value="admin">Admin</option>
              </select>
            </div>
          </div>
          <div id="addUserError" style="display:none;margin-top:12px;background:#FEF2F2;color:#DC2626;padding:10px 14px;border-radius:8px;font-size:13px"></div>
        </div>
        <div style="padding:0 28px 24px;display:flex;justify-content:flex-end;gap:10px">
          <button onclick="document.getElementById('addUserModal').remove()" style="padding:10px 20px;background:#F3F4F6;color:#374151;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">Cancelar</button>
          <button onclick="createUser()" style="padding:10px 24px;background:linear-gradient(135deg,#7C3AED,#5B21B6);color:#fff;border:none;border-radius:9px;font-size:13px;font-weight:600;cursor:pointer">Criar Membro</button>
        </div>
      </div>
    </div>`
  document.body.appendChild(m)
}

