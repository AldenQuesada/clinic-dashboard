/**
 * ClinicAI — Agenda Finalize
 *
 * Extraído de api.js. Gerencia os modais de finalização de atendimento
 * e o modal de Finalizar Consulta completo (com produtos/lucro).
 *
 * Funções públicas (window.*):
 *   quickFinish(id)
 *   openFinalizarModal(id)
 *   _confirmFinalizar(id)
 *   _skipFinalizar(id)
 *   openFinishModal(id)
 *   closeFinishModal()
 *   confirmFinishAppt()
 *   addFinishProduct()
 *   removeFinishProduct(i)
 *   renderFinishProducts()
 *   recalcProfit()
 *   simWhatsappConfirm()
 *   _toggleAnamnese(id)
 *   _setConsent(id, type, val)
 *
 * Depende de (globals de api.js):
 *   window._apptGetAll, _apptSaveAll, _apptFmtDate, _apptFmtBRL,
 *   window._apptRefresh, _apptSetLeadStatus, _apptDeductStock,
 *   window._renderNotificationBell, _showToast,
 *   window.AppointmentsService, getTechnologies, vpiAutoEnroll, setText
 *
 * NOTA: Este arquivo é carregado APÓS api.js.
 */

;(function () {
  'use strict'

  // ── Helpers locais ────────────────────────────────────────────
  function _getAppts()      { return window._apptGetAll ? window._apptGetAll() : JSON.parse(localStorage.getItem('clinicai_appointments') || '[]') }
  function _saveAppts(arr)  { if (window._apptSaveAll) window._apptSaveAll(arr) }
  function _fmtDate(iso)    { return window._apptFmtDate ? window._apptFmtDate(iso) : iso }
  function _fmtBRL(v)       { return window._apptFmtBRL ? window._apptFmtBRL(v) : ('R$ ' + Number(v || 0).toFixed(2).replace('.', ',')) }
  function _refresh()       { if (window._apptRefresh) window._apptRefresh() }
  function _setLeadStatus(id, s) { if (window._apptSetLeadStatus) window._apptSetLeadStatus(id, s) }
  function _deductStock(p)  { if (window._apptDeductStock) window._apptDeductStock(p) }
  function _notifBell()     { if (typeof _renderNotificationBell === 'function') _renderNotificationBell() }
  function _toast(t, s, tp) { if (typeof _showToast === 'function') _showToast(t, s, tp) }

  // Estado local de produtos do modal de finalização
  var _finishProducts = []

  // ── quickFinish ───────────────────────────────────────────────
  function quickFinish(id) {
    openFinalizarModal(id)
  }

  // ── openFinalizarModal ────────────────────────────────────────
  function openFinalizarModal(id) {
    const a = _getAppts().find(function (x) { return x.id === id })
    if (!a) return

    const existing = document.getElementById('finalizarModalDlg')
    if (existing) existing.remove()

    const dlg = document.createElement('div')
    dlg.id = 'finalizarModalDlg'
    dlg.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;z-index:10000'
    dlg.innerHTML = `
      <div style="background:#fff;border-radius:16px;width:92%;max-width:480px;max-height:92vh;overflow-y:auto;box-shadow:0 20px 60px rgba(0,0,0,.28)">
        <div style="display:flex;align-items:center;justify-content:space-between;padding:18px 20px;border-bottom:1px solid #E5E7EB">
          <div style="font-size:16px;font-weight:800;color:#111827">Finalizar Atendimento</div>
          <button onclick="_skipFinalizar('${id}');document.getElementById('finalizarModalDlg').remove()"
            style="width:30px;height:30px;border-radius:50%;border:none;background:#F3F4F6;cursor:pointer;font-size:18px;display:flex;align-items:center;justify-content:center;color:#6B7280">&times;</button>
        </div>

        <div style="padding:18px 20px;display:flex;flex-direction:column;gap:14px">

          <!-- Resumo do paciente -->
          <div style="background:#F5F3FF;border-radius:10px;padding:12px 14px">
            <div style="font-size:14px;font-weight:700;color:#7C3AED">${a.pacienteNome || 'Paciente'}</div>
            <div style="font-size:11px;color:#6B7280;margin-top:2px">${_fmtDate(a.data)} ${a.horaInicio} &mdash; ${a.procedimento || '—'}</div>
          </div>

          <!-- Banner VPI -->
          <div style="background:linear-gradient(135deg,#ECFDF5,#D1FAE5);border:1.5px solid #6EE7B7;border-radius:10px;padding:12px 14px;display:flex;align-items:flex-start;gap:10px">
            <svg width="18" height="18" fill="none" stroke="#059669" stroke-width="2" viewBox="0 0 24 24" style="flex-shrink:0;margin-top:1px"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            <div>
              <div style="font-size:12px;font-weight:700;color:#065F46">Programa de Parceiros VPI</div>
              <div style="font-size:11px;color:#047857;margin-top:2px">Ao finalizar, <strong>${a.pacienteNome || 'este paciente'}</strong> será automaticamente inscrito e receberá um convite via WhatsApp em 7 dias.</div>
            </div>
          </div>

          <!-- Procedimentos realizados -->
          <div>
            <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:6px">
              Procedimentos Realizados <span style="color:#DC2626">*</span>
            </label>
            <textarea id="finalizar_proc" rows="3" placeholder="Descreva os procedimentos realizados..."
              style="width:100%;padding:10px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;font-family:inherit;resize:vertical;box-sizing:border-box">${a.procedimentosRealizados || a.procedimento || ''}</textarea>
          </div>

          <!-- Valor cobrado -->
          <div>
            <label style="font-size:12px;font-weight:700;color:#374151;display:block;margin-bottom:6px">
              Valor Cobrado (R$) <span style="color:#DC2626">*</span>
            </label>
            <input id="finalizar_valor" type="number" min="0" step="0.01" placeholder="0,00"
              value="${a.valorCobrado || ''}"
              style="width:100%;padding:10px;border:1px solid #E5E7EB;border-radius:8px;font-size:13px;box-sizing:border-box"/>
          </div>

          <!-- Orçamento / Indicação -->
          <div style="background:#F9FAFB;border-radius:10px;padding:14px">
            <div style="font-size:10px;font-weight:700;color:#6B7280;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px">Orçamento Realizado (Indicação)</div>
            <div style="display:grid;grid-template-columns:2fr 1fr;gap:8px">
              <div>
                <label style="font-size:11px;color:#6B7280;display:block;margin-bottom:4px">Indicação para</label>
                <input id="finalizar_indicacao" type="text" placeholder="Ex: Botox, Harmonização..."
                  value="${a.orcamentoIndicacao || ''}"
                  style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px;box-sizing:border-box"/>
              </div>
              <div>
                <label style="font-size:11px;color:#6B7280;display:block;margin-bottom:4px">Valor</label>
                <input id="finalizar_ind_valor" type="number" min="0" step="0.01" placeholder="R$ 0,00"
                  value="${a.orcamentoValor || ''}"
                  style="width:100%;padding:8px;border:1px solid #E5E7EB;border-radius:7px;font-size:12px;box-sizing:border-box"/>
              </div>
            </div>
          </div>

          <!-- Mensagem de erro -->
          <div id="finalizar_erro" style="display:none;background:#FEF2F2;border:1px solid #FCA5A5;border-radius:8px;padding:10px 12px;font-size:12px;color:#DC2626;font-weight:600"></div>

          <!-- Ações -->
          <div style="display:flex;gap:8px;padding-top:2px">
            <button onclick="_skipFinalizar('${id}');document.getElementById('finalizarModalDlg').remove()"
              style="flex:1;padding:11px;background:#F3F4F6;color:#6B7280;border:none;border-radius:9px;cursor:pointer;font-size:13px;font-weight:600">Pular (criar alerta)</button>
            <button onclick="_confirmFinalizar('${id}')"
              style="flex:2;padding:11px;background:#7C3AED;color:#fff;border:none;border-radius:9px;cursor:pointer;font-weight:700;font-size:13px">Confirmar e Finalizar</button>
          </div>

        </div>
      </div>`

    dlg.addEventListener('click', function (e) {
      if (e.target === dlg) { _skipFinalizar(id); dlg.remove() }
    })
    document.body.appendChild(dlg)
  }

  // ── _confirmFinalizar ─────────────────────────────────────────
  function _confirmFinalizar(id) {
    const proc  = document.getElementById('finalizar_proc') && document.getElementById('finalizar_proc').value.trim()
    const valor = parseFloat((document.getElementById('finalizar_valor') && document.getElementById('finalizar_valor').value) || '')
    const errEl = document.getElementById('finalizar_erro')

    if (!proc) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Informe os procedimentos realizados.' }
      return
    }
    if (!valor || valor <= 0) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Informe o valor total do atendimento.' }
      return
    }

    const appts = _getAppts()
    const a = appts.find(function (x) { return x.id === id })
    if (!a) return

    a.status = 'finalizado'
    a.procedimentosRealizados = proc
    a.valorCobrado = valor
    a.orcamentoIndicacao = (document.getElementById('finalizar_indicacao') && document.getElementById('finalizar_indicacao').value.trim()) || ''
    a.orcamentoValor = parseFloat((document.getElementById('finalizar_ind_valor') && document.getElementById('finalizar_ind_valor').value) || '') || 0
    a.pendente_finalizar = false
    _saveAppts(appts)

    // Promover lead para 'patient'
    if (a.pacienteId) _setLeadStatus(a.pacienteId, 'patient')

    const dlg = document.getElementById('finalizarModalDlg')
    if (dlg) dlg.remove()
    _refresh()
    _notifBell()

    // VPI: auto-inscrição no Programa de Parceiros
    if (typeof vpiAutoEnroll === 'function') {
      vpiAutoEnroll(a)
    }
  }

  // ── _skipFinalizar ────────────────────────────────────────────
  function _skipFinalizar(id) {
    const appts = _getAppts()
    const a = appts.find(function (x) { return x.id === id })
    if (!a) return
    a.pendente_finalizar = true
    _saveAppts(appts)
    _notifBell()
    _toast(
      'Alerta criado',
      'Finalização de "' + (a.pacienteNome || 'Paciente') + '" pendente',
      'warning'
    )
  }

  // ── _toggleAnamnese ───────────────────────────────────────────
  function _toggleAnamnese(id) {
    const appts = _getAppts()
    const a = appts.find(function (x) { return x.id === id })
    if (!a) return
    a.anamneseRespondida = !a.anamneseRespondida
    _saveAppts(appts)
    if (typeof openApptDetail === 'function') openApptDetail(id)
  }

  // ── _setConsent ───────────────────────────────────────────────
  function _setConsent(id, type, val) {
    const appts = _getAppts()
    const a = appts.find(function (x) { return x.id === id })
    if (!a) return
    if (type === 'imagem') a.consentimentoImagem = val
    if (type === 'procedimento') a.consentimentoProcedimento = val
    _saveAppts(appts)
  }

  // ── openFinishModal ───────────────────────────────────────────
  function openFinishModal(id) {
    const a = _getAppts().find(function (x) { return x.id === id })
    if (!a) return

    document.getElementById('finish_appt_id').value = id
    _finishProducts = JSON.parse(JSON.stringify(a.produtos || []))

    // Resumo
    const sum = document.getElementById('finishSummary')
    if (sum) sum.innerHTML = `
      <div style="display:flex;flex-wrap:wrap;gap:12px">
        <div><span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase">Paciente</span><br/><strong>${a.pacienteNome}</strong></div>
        <div><span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase">Procedimento</span><br/><strong>${a.procedimento || '—'}</strong></div>
        <div><span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase">Data</span><br/><strong>${_fmtDate(a.data)} ${a.horaInicio}–${a.horaFim}</strong></div>
        <div><span style="font-size:10px;font-weight:700;color:#9CA3AF;text-transform:uppercase">Profissional</span><br/><strong>${a.profissionalNome || '—'}</strong></div>
      </div>
    `

    // Valor pago anterior
    const valInput = document.getElementById('finish_valor')
    if (valInput) valInput.value = a.valorCobrado || ''

    // WhatsApp badge
    const badge = document.getElementById('whatsappConfirmBadge')
    if (badge) badge.style.display = a.whatsappFinanceiroEnviado ? 'block' : 'none'

    // Produtos datalist
    const techs = typeof getTechnologies === 'function' ? getTechnologies() : []
    const prodList = document.getElementById('finishProdList')
    if (prodList) prodList.innerHTML = techs.map(function (t) { return '<option value="' + t.nome + '"/>' }).join('')

    renderFinishProducts()
    recalcProfit()

    document.getElementById('apptFinishModal').style.display = 'block'
    document.body.style.overflow = 'hidden'
  }

  // ── closeFinishModal ──────────────────────────────────────────
  function closeFinishModal() {
    const m = document.getElementById('apptFinishModal')
    if (m) m.style.display = 'none'
    document.body.style.overflow = ''
  }

  // ── simWhatsappConfirm ────────────────────────────────────────
  function simWhatsappConfirm() {
    const btn = document.querySelector('#apptFinishModal button[onclick="simWhatsappConfirm()"]')
    if (btn) { btn.textContent = 'Enviando...'; btn.disabled = true }
    setTimeout(function () {
      if (btn) { btn.textContent = 'Enviado!'; btn.style.background = '#059669' }
      const badge = document.getElementById('whatsappConfirmBadge')
      if (badge) badge.style.display = 'block'
    }, 1200)
  }

  // ── addFinishProduct ──────────────────────────────────────────
  function addFinishProduct() {
    const nome  = document.getElementById('finish_prod_nome') && document.getElementById('finish_prod_nome').value.trim()
    const custo = parseFloat((document.getElementById('finish_prod_custo') && document.getElementById('finish_prod_custo').value) || '0')
    if (!nome) return
    _finishProducts.push({ nome: nome, custo: isNaN(custo) ? 0 : custo })
    document.getElementById('finish_prod_nome').value  = ''
    document.getElementById('finish_prod_custo').value = ''
    renderFinishProducts()
    recalcProfit()
  }

  // ── removeFinishProduct ───────────────────────────────────────
  function removeFinishProduct(i) {
    _finishProducts.splice(i, 1)
    renderFinishProducts()
    recalcProfit()
  }

  // ── renderFinishProducts ──────────────────────────────────────
  function renderFinishProducts() {
    const list = document.getElementById('finishProductsList')
    if (!list) return
    if (!_finishProducts.length) {
      list.innerHTML = '<div style="font-size:12px;color:#9CA3AF;padding:6px 0">Nenhum produto adicionado</div>'
      return
    }
    list.innerHTML = _finishProducts.map(function (p, i) {
      return `
      <div style="display:flex;align-items:center;justify-content:space-between;background:#F9FAFB;border-radius:7px;padding:7px 10px">
        <span style="font-size:13px;color:#374151">${p.nome}</span>
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:13px;font-weight:600;color:#EF4444">${_fmtBRL(p.custo)}</span>
          <button onclick="removeFinishProduct(${i})" style="background:none;border:none;cursor:pointer;color:#9CA3AF;font-size:13px;padding:0">&#10005;</button>
        </div>
      </div>`
    }).join('')
  }

  // ── recalcProfit ──────────────────────────────────────────────
  function recalcProfit() {
    const receita = parseFloat((document.getElementById('finish_valor') && document.getElementById('finish_valor').value) || '0') || 0
    const custos  = _finishProducts.reduce(function (s, p) { return s + (p.custo || 0) }, 0)
    const lucro   = receita - custos

    if (typeof setText === 'function') {
      setText('res_receita', _fmtBRL(receita))
      setText('res_custos',  _fmtBRL(custos))
    }
    const lucroEl = document.getElementById('res_lucro')
    if (lucroEl) {
      lucroEl.textContent = _fmtBRL(lucro)
      lucroEl.style.color = lucro >= 0 ? '#10B981' : '#EF4444'
    }
  }

  // ── confirmFinishAppt ─────────────────────────────────────────
  function confirmFinishAppt() {
    const id = document.getElementById('finish_appt_id') && document.getElementById('finish_appt_id').value
    if (!id) return

    const receita = parseFloat((document.getElementById('finish_valor') && document.getElementById('finish_valor').value) || '0') || 0
    const custos  = _finishProducts.reduce(function (s, p) { return s + (p.custo || 0) }, 0)

    const appts = _getAppts()
    const a = appts.find(function (x) { return x.id === id })
    if (!a) return

    a.status      = 'finalizado'
    a.valorCobrado = receita
    a.produtos     = JSON.parse(JSON.stringify(_finishProducts))
    a.custoTotal   = custos
    a.lucro        = receita - custos
    a.whatsappFinanceiroEnviado = document.getElementById('whatsappConfirmBadge') &&
                                  document.getElementById('whatsappConfirmBadge').style.display !== 'none'

    _saveAppts(appts)
    // Sync Supabase (fire-and-forget)
    if (window.AppointmentsService && window.AppointmentsService.syncOne) {
      window.AppointmentsService.syncOne(a)
    }

    // Deduz estoque dos injetáveis
    _deductStock(_finishProducts)

    closeFinishModal()
    _refresh()

    // Toast de sucesso
    const toast = document.createElement('div')
    toast.style.cssText = 'position:fixed;bottom:28px;right:28px;background:#10B981;color:#fff;padding:12px 20px;border-radius:12px;font-size:13px;font-weight:600;z-index:99999;box-shadow:0 8px 24px rgba(0,0,0,.15)'
    toast.textContent = 'Consulta finalizada \u00b7 Lucro: ' + _fmtBRL(a.lucro)
    document.body.appendChild(toast)
    setTimeout(function () { toast.remove() }, 3500)
  }

  // ── Exposição global ──────────────────────────────────────────
  window.quickFinish          = quickFinish
  window.openFinalizarModal   = openFinalizarModal
  window._confirmFinalizar    = _confirmFinalizar
  window._skipFinalizar       = _skipFinalizar
  window._toggleAnamnese      = _toggleAnamnese
  window._setConsent          = _setConsent
  window.openFinishModal      = openFinishModal
  window.closeFinishModal     = closeFinishModal
  window.simWhatsappConfirm   = simWhatsappConfirm
  window.addFinishProduct     = addFinishProduct
  window.removeFinishProduct  = removeFinishProduct
  window.renderFinishProducts = renderFinishProducts
  window.recalcProfit         = recalcProfit
  window.confirmFinishAppt    = confirmFinishAppt

})()
