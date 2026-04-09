/**
 * ClinicAI — Legal Document Public Page
 *
 * Pagina publica para assinatura digital de documentos legais.
 * Acesso via token: legal-document.html#slug=X&token=Y
 *
 * 4 etapas:
 *   1. Identificacao — confirma nome e CPF
 *   2. Documento — texto completo, scroll obrigatorio
 *   3. Assinatura — canvas touch para desenhar
 *   4. Confirmacao — checkbox + submit
 *
 * Lei 14.063/2020 — assinatura eletronica simples
 */
;(function () {
  'use strict'

  // ── State ──────────────────────────────────────────────────
  var _sb = null
  var _slug = ''
  var _token = ''
  var _doc = null
  var _step = 0 // 0=loading, 1=identify, 2=document, 3=signature, 4=confirm, 5=success, -1=error
  var _signerName = ''
  var _signerCpf = ''
  var _scrolledToBottom = false
  var _signatureData = ''
  var _accepted = false
  var _submitting = false
  var _geoloc = null
  var _errorMsg = ''

  // ── Init ───────────────────────────────────────────────────
  function init() {
    // Parse hash params
    var hash = window.location.hash.substring(1)
    var params = {}
    hash.split('&').forEach(function (p) {
      var parts = p.split('=')
      if (parts.length === 2) params[parts[0]] = decodeURIComponent(parts[1])
    })

    _slug = params.slug || ''
    _token = params.token || ''

    if (!_slug || !_token) {
      _errorMsg = 'Link invalido. Solicite um novo link ao consultorio.'
      _step = -1
      _render()
      return
    }

    // Init Supabase
    if (!window.ClinicEnv) {
      _errorMsg = 'Configuracao nao encontrada.'
      _step = -1
      _render()
      return
    }

    _sb = window.supabase.createClient(ClinicEnv.SUPABASE_URL, ClinicEnv.SUPABASE_KEY)

    // Try get geolocation
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        function (pos) { _geoloc = { lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy } },
        function () { _geoloc = null },
        { timeout: 5000 }
      )
    }

    _step = 0
    _render()
    _validateToken()
  }

  // ── Validate token ─────────────────────────────────────────
  async function _validateToken() {
    try {
      var res = await _sb.rpc('legal_doc_validate_token', {
        p_slug: _slug,
        p_token: _token,
        p_ip: null
      })

      if (res.error) {
        _errorMsg = res.error.message || 'Erro ao validar documento.'
        _step = -1
        _render()
        return
      }

      var data = res.data
      if (!data || !data.ok) {
        _errorMsg = data ? data.error : 'Documento nao encontrado.'
        _step = -1
        _render()
        return
      }

      _doc = data.data
      _signerName = _doc.patient_name || ''
      _signerCpf = _doc.patient_cpf || ''

      document.getElementById('ldHeaderTitle').textContent = 'Termo de Consentimento'
      document.getElementById('ldHeaderSub').textContent = _doc.professional_name || 'Clinica'

      _step = 1
      _render()
    } catch (e) {
      _errorMsg = 'Erro de conexao. Verifique sua internet.'
      _step = -1
      _render()
    }
  }

  // ── Render ─────────────────────────────────────────────────
  function _render() {
    var root = document.getElementById('ldRoot')
    if (!root) return

    var progress = { 0: 0, 1: 25, 2: 50, 3: 75, 4: 90, 5: 100, '-1': 0 }
    var pEl = document.getElementById('ldProgress')
    if (pEl) pEl.style.width = (progress[_step] || 0) + '%'

    if (_step === 0) { root.innerHTML = _renderLoading(); return }
    if (_step === -1) { root.innerHTML = _renderError(); return }
    if (_step === 5) { root.innerHTML = _renderSuccess(); return }

    var html = '<div class="ld-card">'
    if (_step === 1) html += _renderStep1()
    if (_step === 2) html += _renderStep2()
    if (_step === 3) html += _renderStep3()
    if (_step === 4) html += _renderStep4()
    html += '</div>'

    root.innerHTML = html

    if (_step === 2) _bindScrollDetection()
    if (_step === 3) _initCanvas()
  }

  // ── Step 1: Identificacao ──────────────────────────────────
  function _renderStep1() {
    return '<div class="ld-card-header">'
      + '<div class="ld-step-label">Etapa 1 de 4</div>'
      + '<div class="ld-step-title">Identificacao</div>'
      + '<div class="ld-step-desc">Confirme seus dados antes de visualizar o documento.</div>'
      + '</div>'
      + '<div class="ld-card-body">'
      + '<div class="ld-field"><label class="ld-label">Nome completo</label>'
      + '<input class="ld-input" id="ldName" value="' + _esc(_signerName) + '" placeholder="Seu nome completo" /></div>'
      + '<div class="ld-field"><label class="ld-label">CPF</label>'
      + '<input class="ld-input" id="ldCpf" value="' + _esc(_signerCpf) + '" placeholder="000.000.000-00" inputmode="numeric" /></div>'
      + '<button class="ld-btn ld-btn-primary" onclick="window._ldNext(1)">Continuar</button>'
      + '</div>'
  }

  // ── Step 2: Documento ──────────────────────────────────────
  function _renderStep2() {
    return '<div class="ld-card-header">'
      + '<div class="ld-step-label">Etapa 2 de 4</div>'
      + '<div class="ld-step-title">Leia o Documento</div>'
      + '<div class="ld-step-desc">Leia atentamente todo o conteudo. Voce precisara rolar ate o final.</div>'
      + '</div>'
      + '<div class="ld-card-body">'
      + '<div class="ld-doc-text" id="ldDocText">' + _sanitize(_doc.content || '') + '</div>'
      + '<div class="ld-scroll-hint" id="ldScrollHint">Role ate o final para continuar</div>'
      + '<button class="ld-btn ld-btn-primary" id="ldDocNext" onclick="window._ldNext(2)"'
      + (_scrolledToBottom ? '' : ' disabled') + '>'
      + (_scrolledToBottom ? 'Li e desejo continuar' : 'Role ate o final para continuar')
      + '</button>'
      + '<button class="ld-btn ld-btn-secondary" onclick="window._ldBack(2)">Voltar</button>'
      + '</div>'
  }

  // ── Step 3: Assinatura ─────────────────────────────────────
  function _renderStep3() {
    return '<div class="ld-card-header">'
      + '<div class="ld-step-label">Etapa 3 de 4</div>'
      + '<div class="ld-step-title">Sua Assinatura</div>'
      + '<div class="ld-step-desc">Desenhe sua assinatura no campo abaixo usando o dedo ou o mouse.</div>'
      + '</div>'
      + '<div class="ld-card-body">'
      + '<div class="ld-sig-container" id="ldSigContainer">'
      + '<canvas class="ld-sig-canvas" id="ldSigCanvas" width="500" height="200"></canvas>'
      + '<div class="ld-sig-placeholder" id="ldSigPlaceholder">Assine aqui</div>'
      + '</div>'
      + '<div class="ld-sig-actions"><button class="ld-sig-clear" onclick="window._ldClearSig()">Limpar</button></div>'
      + '<button class="ld-btn ld-btn-primary" onclick="window._ldNext(3)" style="margin-top:16px">Continuar</button>'
      + '<button class="ld-btn ld-btn-secondary" onclick="window._ldBack(3)">Voltar</button>'
      + '</div>'
  }

  // ── Step 4: Confirmacao ────────────────────────────────────
  function _renderStep4() {
    return '<div class="ld-card-header">'
      + '<div class="ld-step-label">Etapa 4 de 4</div>'
      + '<div class="ld-step-title">Confirmacao</div>'
      + '<div class="ld-step-desc">Revise os dados e confirme a assinatura do documento.</div>'
      + '</div>'
      + '<div class="ld-card-body">'
      + '<div style="padding:12px;background:#F9FAFB;border-radius:10px;margin-bottom:12px;font-size:13px">'
      + '<div><strong>Nome:</strong> ' + _esc(_signerName) + '</div>'
      + (_signerCpf ? '<div><strong>CPF:</strong> ' + _esc(_signerCpf) + '</div>' : '')
      + '<div><strong>Profissional:</strong> ' + _esc(_doc.professional_name || '-') + '</div>'
      + (_doc.professional_reg ? '<div><strong>Registro:</strong> ' + _esc(_doc.professional_reg) + '</div>' : '')
      + '<div><strong>Data:</strong> ' + new Date().toLocaleDateString('pt-BR') + '</div>'
      + '</div>'
      + '<div style="text-align:center;padding:12px;border:1px solid #E5E7EB;border-radius:10px;margin-bottom:12px">'
      + '<div style="font-size:11px;color:#9CA3AF;margin-bottom:4px">Sua assinatura</div>'
      + '<img src="' + _signatureData + '" style="max-width:200px;height:auto" />'
      + '</div>'
      + '<label class="ld-check" onclick="window._ldToggleAccept()">'
      + '<input type="checkbox" id="ldAccept" ' + (_accepted ? 'checked' : '') + ' />'
      + '<span class="ld-check-text">Li, compreendi e concordo com todos os termos deste documento. Declaro que as informacoes prestadas sao verdadeiras.</span>'
      + '</label>'
      + '<div style="font-size:10px;color:#9CA3AF;margin-bottom:12px;text-align:center">Hash do documento: ' + (_doc.document_hash || '').substring(0, 16) + '...</div>'
      + '<button class="ld-btn ld-btn-primary" onclick="window._ldSubmit()"'
      + (_accepted && !_submitting ? '' : ' disabled') + '>'
      + (_submitting ? 'Enviando...' : 'Assinar Documento') + '</button>'
      + '<button class="ld-btn ld-btn-secondary" onclick="window._ldBack(4)">Voltar</button>'
      + '</div>'
  }

  // ── States ─────────────────────────────────────────────────
  function _renderLoading() {
    return '<div class="ld-card"><div class="ld-loading"><div class="ld-loading-spinner"></div><div style="font-size:13px;color:#6B7280">Carregando documento...</div></div></div>'
  }

  function _renderError() {
    return '<div class="ld-card"><div class="ld-error">'
      + '<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
      + '<div style="font-size:16px;font-weight:700;margin-bottom:6px">Documento indisponivel</div>'
      + '<div style="font-size:13px;color:#6B7280">' + _esc(_errorMsg) + '</div>'
      + '</div></div>'
  }

  function _renderSuccess() {
    return '<div class="ld-card"><div class="ld-success">'
      + '<svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><polyline points="16 9 10.5 14.5 8 12"/></svg>'
      + '<div class="ld-success-title">Documento Assinado</div>'
      + '<div class="ld-success-text">Obrigado, ' + _esc(_signerName) + '.<br>Sua assinatura foi registrada com sucesso.<br>Voce pode fechar esta pagina.</div>'
      + '<div class="ld-hash">Hash: ' + _esc(_doc.document_hash || '') + '</div>'
      + '</div></div>'
  }

  // ── Navigation ─────────────────────────────────────────────
  window._ldNext = function (fromStep) {
    if (fromStep === 1) {
      _signerName = (document.getElementById('ldName') || {}).value || ''
      _signerCpf = (document.getElementById('ldCpf') || {}).value || ''
      if (!_signerName.trim()) { alert('Informe seu nome completo.'); return }
      _step = 2
    } else if (fromStep === 2) {
      if (!_scrolledToBottom) return
      _step = 3
    } else if (fromStep === 3) {
      var canvas = document.getElementById('ldSigCanvas')
      if (canvas) _signatureData = canvas.toDataURL('image/png')
      if (!_signatureData || _signatureData === 'data:,') { alert('Desenhe sua assinatura.'); return }
      // Check if canvas has content (not blank)
      if (_isCanvasBlank(canvas)) { alert('Desenhe sua assinatura no campo.'); return }
      _step = 4
    }
    _render()
  }

  window._ldBack = function (fromStep) {
    if (fromStep === 2) _step = 1
    else if (fromStep === 3) _step = 2
    else if (fromStep === 4) _step = 3
    _render()
  }

  window._ldToggleAccept = function () {
    _accepted = !_accepted
    var el = document.getElementById('ldAccept')
    if (el) el.checked = _accepted
    _render()
  }

  // ── Scroll detection ───────────────────────────────────────
  function _bindScrollDetection() {
    var docText = document.getElementById('ldDocText')
    if (!docText) return

    // If content fits without scrolling, enable immediately
    if (docText.scrollHeight <= docText.clientHeight + 10) {
      _scrolledToBottom = true
      var btn = document.getElementById('ldDocNext')
      if (btn) { btn.disabled = false; btn.textContent = 'Li e desejo continuar' }
      return
    }

    var hint = document.getElementById('ldScrollHint')
    if (hint) hint.style.display = 'block'

    docText.addEventListener('scroll', function () {
      if (docText.scrollTop + docText.clientHeight >= docText.scrollHeight - 20) {
        _scrolledToBottom = true
        var btn = document.getElementById('ldDocNext')
        if (btn) { btn.disabled = false; btn.textContent = 'Li e desejo continuar' }
        if (hint) hint.style.display = 'none'
      }
    })
  }

  // ── Canvas signature ───────────────────────────────────────
  var _drawing = false
  var _lastX = 0, _lastY = 0

  function _initCanvas() {
    var canvas = document.getElementById('ldSigCanvas')
    if (!canvas) return

    // Responsive sizing
    var container = document.getElementById('ldSigContainer')
    var w = container.clientWidth
    canvas.width = w
    canvas.height = Math.round(w * 0.4)

    var ctx = canvas.getContext('2d')
    ctx.strokeStyle = '#111827'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    function getPos(e) {
      var rect = canvas.getBoundingClientRect()
      var touch = e.touches ? e.touches[0] : e
      return { x: touch.clientX - rect.left, y: touch.clientY - rect.top }
    }

    function startDraw(e) {
      e.preventDefault()
      _drawing = true
      var pos = getPos(e)
      _lastX = pos.x; _lastY = pos.y
      container.classList.add('active')
      var ph = document.getElementById('ldSigPlaceholder')
      if (ph) ph.style.opacity = '0'
    }

    function draw(e) {
      if (!_drawing) return
      e.preventDefault()
      var pos = getPos(e)
      ctx.beginPath()
      ctx.moveTo(_lastX, _lastY)
      ctx.lineTo(pos.x, pos.y)
      ctx.stroke()
      _lastX = pos.x; _lastY = pos.y
    }

    function stopDraw() { _drawing = false }

    canvas.addEventListener('mousedown', startDraw)
    canvas.addEventListener('mousemove', draw)
    canvas.addEventListener('mouseup', stopDraw)
    canvas.addEventListener('mouseleave', stopDraw)
    canvas.addEventListener('touchstart', startDraw, { passive: false })
    canvas.addEventListener('touchmove', draw, { passive: false })
    canvas.addEventListener('touchend', stopDraw)
  }

  window._ldClearSig = function () {
    var canvas = document.getElementById('ldSigCanvas')
    if (!canvas) return
    var ctx = canvas.getContext('2d')
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    var ph = document.getElementById('ldSigPlaceholder')
    if (ph) ph.style.opacity = '1'
    var container = document.getElementById('ldSigContainer')
    if (container) container.classList.remove('active')
    _signatureData = ''
  }

  function _isCanvasBlank(canvas) {
    if (!canvas) return true
    var ctx = canvas.getContext('2d')
    var data = ctx.getImageData(0, 0, canvas.width, canvas.height).data
    for (var i = 3; i < data.length; i += 4) {
      if (data[i] > 0) return false
    }
    return true
  }

  // ── Submit ─────────────────────────────────────────────────
  window._ldSubmit = async function () {
    if (!_accepted || _submitting) return
    _submitting = true
    _render()

    try {
      var res = await _sb.rpc('legal_doc_submit_signature', {
        p_slug: _slug,
        p_token: _token,
        p_signer_name: _signerName.trim(),
        p_signer_cpf: _signerCpf.trim() || null,
        p_signature_data: _signatureData,
        p_ip_address: null,
        p_user_agent: navigator.userAgent,
        p_geolocation: _geoloc ? JSON.stringify(_geoloc) : null,
        p_acceptance_text: 'Li, compreendi e concordo com todos os termos deste documento.'
      })

      if (res.error) {
        alert('Erro: ' + res.error.message)
        _submitting = false
        _render()
        return
      }

      var data = res.data
      if (!data || !data.ok) {
        alert('Erro: ' + (data ? data.error : 'Falha ao salvar'))
        _submitting = false
        _render()
        return
      }

      _step = 5
      _submitting = false
      _render()
    } catch (e) {
      alert('Erro de conexao: ' + e.message)
      _submitting = false
      _render()
    }
  }

  // ── Utils ──────────────────────────────────────────────────
  function _esc(s) {
    if (!s) return ''
    var div = document.createElement('div')
    div.textContent = s
    return div.innerHTML
  }

  // Sanitize HTML — permite formatacao basica, bloqueia scripts
  function _sanitize(html) {
    if (!html) return ''
    var tmp = document.createElement('div')
    tmp.innerHTML = html
    // Remover scripts, iframes, on* attributes
    tmp.querySelectorAll('script,iframe,object,embed').forEach(function (el) { el.remove() })
    tmp.querySelectorAll('*').forEach(function (el) {
      for (var i = el.attributes.length - 1; i >= 0; i--) {
        var name = el.attributes[i].name.toLowerCase()
        if (name.startsWith('on') || name === 'srcdoc') el.removeAttribute(name)
      }
    })
    return tmp.innerHTML
  }

  // ── Start ──────────────────────────────────────────────────
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init)
  } else {
    init()
  }
})()
