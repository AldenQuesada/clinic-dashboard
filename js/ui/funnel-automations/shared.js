/**
 * ClinicAI — Funil Automations Shared (AAShared)
 *
 * Componentes compartilhados usados pelo shell e por todos os modulos.
 * Nao contem logica de negocio de nenhuma fase especifica.
 *
 * Namespace global: window.AAShared
 */
;(function () {
  'use strict'
  if (window.AAShared) return

  function _esc(s) { return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;') }
  function _feather(n, s) { return window._clinicaiHelpers ? window._clinicaiHelpers.feather(n, s) : '' }

  // ── Sample vars para preview (dados ficticios) ──────────────
  var SAMPLE_VARS = {
    nome:          'Maria Silva',
    data:          '16/04/2026',
    hora:          '14:30',
    profissional:  'Dra. Mirian',
    procedimento:  'Bioestimulador',
    clinica:       'Clinica Mirian de Paula',
    link_anamnese: 'https://clinica.app/anamnese/abc',
    endereco:      'Av. Carneiro Leao, 296 - Sala 806',
    link_maps:     'https://maps.app.goo.gl/xyz',
    menu_clinica:  'https://clinica.app/menu',
    status:        'agendado',
    obs:           '',
  }

  var TEMPLATE_VARS = [
    { id: 'nome',          label: 'Nome paciente',        example: 'Maria Silva' },
    { id: 'data',          label: 'Data da consulta',     example: '16/04/2026' },
    { id: 'hora',          label: 'Horario da consulta',  example: '14:30' },
    { id: 'profissional',  label: 'Profissional',         example: 'Dra. Mirian' },
    { id: 'procedimento',  label: 'Procedimento',         example: 'Bioestimulador' },
    { id: 'clinica',       label: 'Nome da clinica',      example: 'Clinica' },
    { id: 'link_anamnese', label: 'Link da anamnese',     example: 'https://...' },
    { id: 'endereco',      label: 'Endereco',             example: 'Rua X, 123' },
    { id: 'link_maps',     label: 'Google Maps',          example: 'https://maps...' },
    { id: 'menu_clinica',  label: 'Menu clinica',         example: 'https://...' },
  ]

  function _renderTemplate(template, vars) {
    if (!template) return ''
    var result = template
    var keys = Object.keys(vars || {})
    for (var i = 0; i < keys.length; i++) {
      var re = new RegExp('\\{\\{' + keys[i] + '\\}\\}', 'g')
      result = result.replace(re, vars[keys[i]] || '')
    }
    return result.replace(/\{\{[^}]+\}\}/g, '')
  }

  function _waFormat(text) {
    if (!text) return ''
    var s = _esc(text)
    s = s.replace(/\n/g, '<br>')
    s = s.replace(/\*([^*]+)\*/g, '<b>$1</b>')
    s = s.replace(/_([^_]+)_/g, '<i>$1</i>')
    s = s.replace(/~([^~]+)~/g, '<s>$1</s>')
    return s
  }

  // ── Phone preview (WhatsApp — classes .bc-* do Templates) ───
  function renderPhonePreview(text, imageUrl, imageAbove) {
    var rendered = _renderTemplate(text, SAMPLE_VARS)
    var formatted = _waFormat(rendered).replace(/\{\{([^}]+)\}\}/g, '<span class="bc-wa-tag">{{$1}}</span>')
    var now = new Date()
    var hhmm = (now.getHours()<10?'0':'')+now.getHours()+':'+(now.getMinutes()<10?'0':'')+now.getMinutes()
    var tick = '<svg width="14" height="8" viewBox="0 0 16 8" fill="none" stroke="#53bdeb" stroke-width="1.5"><polyline points="1 4 4 7 9 2"/><polyline points="5 4 8 7 13 2"/></svg>'
    var imgBubble = imageUrl ? '<div class="bc-wa-bubble bc-wa-img-bubble"><img class="bc-wa-preview-img" src="'+_esc(imageUrl)+'" alt="media"></div>' : ''
    var textBubble = formatted ? '<div class="bc-wa-bubble"><div class="bc-wa-bubble-text">'+formatted+'</div><div class="bc-wa-bubble-time">'+hhmm+' '+tick+'</div></div>' : ''
    var above = imageAbove !== false
    var chat = above ? (imgBubble + textBubble) : (textBubble + imgBubble)
    if (!chat) chat = '<div class="bc-wa-empty">Escreva a mensagem ao lado</div>'
    return '<div class="bc-phone fa-preview-phone">'
      + '<div class="bc-phone-notch"><span class="bc-phone-notch-time">'+hhmm+'</span></div>'
      + '<div class="bc-wa-header"><div class="bc-wa-avatar"><svg width="18" height="18" fill="none" stroke="#fff" stroke-width="2" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg></div>'
      + '<div><div class="bc-wa-name">Clinica Mirian de Paula</div><div class="bc-wa-status">online</div></div></div>'
      + '<div class="bc-wa-chat">'+chat+'</div>'
      + '<div class="bc-wa-bottom"><div class="bc-wa-input-mock">Mensagem</div><div class="bc-wa-send-mock"><svg width="16" height="16" fill="#fff" viewBox="0 0 24 24"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg></div></div>'
      + '<div class="bc-phone-home"></div>'
      + '</div>'
  }

  function renderAlexaPreview(message, target) {
    var msg = _renderTemplate(message || '', SAMPLE_VARS)
    var t = target || 'sala'
    var tLabel = t === 'recepcao' ? 'Recepcao' : t === 'todos' ? 'Todos' : t === 'profissional' ? 'Profissional' : 'Sala'
    return '<div class="fa-alexa-preview">'
      + '<div class="fa-alexa-header">'+_feather('speaker',14)+' Alexa · '+_esc(tLabel)+'</div>'
      + '<div class="fa-alexa-device"><svg viewBox="0 0 100 100" width="100" height="100">'
      +   '<defs><radialGradient id="faDotGrad" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#0EA5E9"/><stop offset="100%" stop-color="#0369A1"/></radialGradient></defs>'
      +   '<circle cx="50" cy="50" r="46" fill="#1E293B"/>'
      +   '<circle cx="50" cy="50" r="40" fill="none" stroke="url(#faDotGrad)" stroke-width="4" class="fa-alexa-ring"/>'
      +   '<circle cx="50" cy="50" r="6" fill="#0EA5E9"/>'
      + '</svg></div>'
      + '<div class="fa-alexa-msg">"'+_esc(msg || '(sem mensagem)')+'"</div>'
      + '<button type="button" class="fa-alexa-play-btn" data-action="speak-alexa">'+_feather('play',12)+' Reproduzir voz</button>'
      + '</div>'
  }

  function renderTaskPreview(title, assignee, priority, deadline) {
    var pri = priority || 'normal'
    var pColor = { urgente:'#DC2626', alta:'#F59E0B', normal:'#3B82F6', baixa:'#6B7280' }[pri] || '#3B82F6'
    var pLabel = { urgente:'URGENTE', alta:'ALTA', normal:'NORMAL', baixa:'BAIXA' }[pri] || 'NORMAL'
    var aLabel = { sdr:'SDR / Comercial', secretaria:'Secretaria', cs:'CS / Pos-venda', clinica:'Equipe Clinica', gestao:'Gestao' }[assignee] || assignee || 'SDR'
    var d = deadline || 24
    var prazoLabel = d < 24 ? d+'h' : d===24?'1 dia' : d<168?Math.round(d/24)+' dias' : Math.round(d/168)+' sem'
    var tRendered = _renderTemplate(title || '', SAMPLE_VARS)
    return '<div class="fa-task-preview" style="border-left-color:'+pColor+'">'
      + '<div class="fa-task-header">'+_feather('clipboard',14)+'<span class="fa-task-pri" style="background:'+pColor+'20;color:'+pColor+'">'+pLabel+'</span></div>'
      + '<div class="fa-task-title">'+_esc(tRendered || '(sem titulo)')+'</div>'
      + '<div class="fa-task-meta"><span>'+_feather('user',11)+' '+_esc(aLabel)+'</span><span>'+_feather('clock',11)+' Prazo '+prazoLabel+'</span></div>'
      + '</div>'
  }

  function renderAlertPreview(title, type) {
    var map = {
      info:    { color:'#3B82F6', bg:'#EFF6FF', icon:'info',          label:'Info' },
      warning: { color:'#F59E0B', bg:'#FEF3C7', icon:'alertTriangle', label:'Aviso' },
      success: { color:'#10B981', bg:'#D1FAE5', icon:'checkCircle',   label:'Sucesso' },
      error:   { color:'#DC2626', bg:'#FEE2E2', icon:'alertCircle',   label:'Erro' },
    }
    var t = map[type] || map.info
    var tRendered = _renderTemplate(title || '', SAMPLE_VARS)
    return '<div class="fa-alert-preview" style="--ac:'+t.color+';background:'+t.bg+';border-left-color:'+t.color+'">'
      + '<div class="fa-alert-header">'+_feather(t.icon,14)+' Alerta '+t.label+'</div>'
      + '<div class="fa-alert-body">'+_esc(tRendered || '(sem titulo)')+'</div>'
      + '<button type="button" class="fa-alert-sim-btn" data-action="simulate-alert">'+_feather('zap',12)+' Simular</button>'
      + '</div>'
  }

  // ── Channel helpers ─────────────────────────────────────────
  var MULTI_CHANNELS = {
    whatsapp_alert: 1, whatsapp_task: 1, whatsapp_alexa: 1,
    alert_task: 1, alert_alexa: 1, all: 1, both: 1,
  }

  function channelIncludes(channel, type) {
    if (!channel) return false
    if (channel === type) return true
    if (channel === 'all') return true
    if (channel === 'both') return type === 'whatsapp' || type === 'alert'
    if (channel === 'whatsapp_alert') return type === 'whatsapp' || type === 'alert'
    if (channel === 'whatsapp_task') return type === 'whatsapp' || type === 'task'
    if (channel === 'whatsapp_alexa') return type === 'whatsapp' || type === 'alexa'
    if (channel === 'alert_task') return type === 'alert' || type === 'task'
    if (channel === 'alert_alexa') return type === 'alert' || type === 'alexa'
    return false
  }

  function combineChannels(arr) {
    if (!arr || !arr.length) return ''
    if (arr.length === 1) return arr[0]
    if (arr.length >= 3) return 'all'
    var s = arr.slice().sort().join('_')
    var map = {
      'alert_whatsapp': 'whatsapp_alert',
      'alexa_whatsapp': 'whatsapp_alexa',
      'task_whatsapp':  'whatsapp_task',
      'alert_task':     'alert_task',
      'alert_alexa':    'alert_alexa',
      'alexa_task':     'all',
    }
    return map[s] || 'all'
  }

  function renderChannelChecks(currentChannel) {
    var channels = [
      { id:'whatsapp', label:'WhatsApp', icon:'messageCircle' },
      { id:'alexa',    label:'Alexa',    icon:'speaker' },
      { id:'task',     label:'Tarefa',   icon:'clipboard' },
      { id:'alert',    label:'Alerta',   icon:'bell' },
    ]
    return '<div class="fa-channel-checks">' + channels.map(function(ch) {
      var checked = channelIncludes(currentChannel, ch.id) ? ' checked' : ''
      return '<label class="fa-channel-check"><input type="checkbox" name="faChannel" value="'+ch.id+'"'+checked+'>'
        + _feather(ch.icon, 14) + ' <span>'+ch.label+'</span></label>'
    }).join('') + '</div>'
  }

  function renderChipsBar(dataAttr) {
    return '<div class="fa-chips-bar">' + TEMPLATE_VARS.map(function(v) {
      var tip = v.label + (v.example ? ' — ex.: "'+v.example+'"' : '')
      return '<button type="button" class="fa-chip" data-'+dataAttr+'="'+v.id+'" title="'+_esc(tip)+'">{{'+v.id+'}}</button>'
    }).join('') + '</div>'
  }

  function renderFormatToolbar() {
    return '<div class="fa-fmt-bar">'
      + '<button type="button" class="fa-fmt-btn" data-fmt="*" title="Negrito"><b>B</b></button>'
      + '<button type="button" class="fa-fmt-btn" data-fmt="_" title="Italico"><i>I</i></button>'
      + '<button type="button" class="fa-fmt-btn" data-fmt="~" title="Tachado"><s>S</s></button>'
      + '</div>'
  }

  function renderAttachArea(url, above) {
    var pos = above === false ? 'below' : 'above'
    var html = '<div class="fa-attach">'
      +   '<div class="fa-attach-row">'
      +     '<button type="button" class="fa-btn-attach" data-action="pick-image">'+_feather('image',14)+' Enviar imagem</button>'
      +     '<input type="text" id="faAttachUrl" class="fa-attach-url" placeholder="https://... (URL da imagem)" value="'+_esc(url || '')+'">'
      +   '</div>'

    if (url) {
      html += '<div class="fa-attach-preview">'
        +   '<img src="'+_esc(url)+'" alt="anexo">'
        +   '<button type="button" class="fa-attach-remove" data-action="remove-image" title="Remover">'+_feather('x',14)+'</button>'
        + '</div>'
      html += '<div class="fa-attach-pos">'
        +   '<label><input type="radio" name="faAttachPos" value="above"' + (pos==='above'?' checked':'') + '> Acima do texto</label>'
        +   '<label style="margin-left:16px"><input type="radio" name="faAttachPos" value="below"' + (pos==='below'?' checked':'') + '> Abaixo do texto</label>'
        + '</div>'
    } else {
      html += '<div class="fa-attach-hint">JPG, PNG, WEBP ou GIF — max 10 MB. Ou cole URL direto.</div>'
    }

    html += '<input type="file" id="faAttachInput" accept="image/jpeg,image/png,image/webp,image/gif" style="display:none"></div>'
    return html
  }

  // ── Alexa TTS ───────────────────────────────────────────────
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try { window.speechSynthesis.getVoices() } catch (e) {}
    window.speechSynthesis.onvoiceschanged = function () {}
  }

  function speakAlexa(text) {
    if (!('speechSynthesis' in window)) { showToast('Navegador', 'Sem suporte a voz', 'warning'); return }
    window.speechSynthesis.cancel()
    var u = new SpeechSynthesisUtterance(text || 'Mensagem vazia')
    u.lang = 'pt-BR'; u.rate = 0.95; u.pitch = 1.0
    var voices = window.speechSynthesis.getVoices() || []
    var pt = voices.find(function(v){ return v.lang && v.lang.indexOf('pt') === 0 && /female|mulher|feminin/i.test(v.name) })
      || voices.find(function(v){ return v.lang && v.lang.indexOf('pt') === 0 })
    if (pt) u.voice = pt
    u.onstart = function(){ var r = document.querySelector('.fa-alexa-ring'); if (r) r.classList.add('fa-alexa-speaking') }
    u.onend = u.onerror = function(){ var r = document.querySelector('.fa-alexa-ring'); if (r) r.classList.remove('fa-alexa-speaking') }
    window.speechSynthesis.speak(u)
  }

  // ── Upload imagem ───────────────────────────────────────────
  async function uploadAttachment(file) {
    if (!window._sbShared) throw new Error('Supabase nao disponivel')
    var MAX = 10 * 1024 * 1024
    if (file.size > MAX) throw new Error('Imagem > 10 MB')
    var ext = (file.name.split('.').pop() || 'jpg').toLowerCase()
    var key = 'fa_' + Date.now() + '_' + Math.random().toString(36).slice(2,8) + '.' + ext
    var up = await window._sbShared.storage.from('wa-automations').upload(key, file, {
      contentType: file.type || 'image/jpeg', cacheControl: '3600', upsert: false,
    })
    if (up.error) throw new Error(up.error.message)
    return window._sbShared.storage.from('wa-automations').getPublicUrl(key).data.publicUrl
  }

  // ── Toast ───────────────────────────────────────────────────
  function showToast(title, msg, type) {
    if (window._showToast) window._showToast(title, msg, type || 'info')
  }

  // ── Public API ──────────────────────────────────────────────
  window.AAShared = Object.freeze({
    TEMPLATE_VARS: TEMPLATE_VARS,
    SAMPLE_VARS: SAMPLE_VARS,
    renderPhonePreview: renderPhonePreview,
    renderAlexaPreview: renderAlexaPreview,
    renderTaskPreview:  renderTaskPreview,
    renderAlertPreview: renderAlertPreview,
    renderChannelChecks: renderChannelChecks,
    renderChipsBar:     renderChipsBar,
    renderFormatToolbar: renderFormatToolbar,
    renderAttachArea:   renderAttachArea,
    combineChannels:    combineChannels,
    channelIncludes:    channelIncludes,
    speakAlexa:         speakAlexa,
    uploadAttachment:   uploadAttachment,
    showToast:          showToast,
    renderTemplate:     _renderTemplate,
    esc:                _esc,
    feather:            _feather,
  })
})()
