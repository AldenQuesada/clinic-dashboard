/**
 * Modulo Pre-agendamento — Lara / Captacao
 * Zero dependencia de outros modulos. So depende de AAShared.
 */
;(function () {
  'use strict'
  window.FAModules = window.FAModules || {}

  var STATUSES = [
    { id: 'lead_novo',          label: 'Lead Novo' },
    { id: 'lead_novo_fullface', label: 'Lead Novo — Fullface' },
    { id: 'lead_novo_olheiras', label: 'Lead Novo — Olheiras' },
    { id: 'lead_quente',        label: 'Lead Quente' },
    { id: 'em_conversa',        label: 'Em Conversa' },
    { id: 'qualificado',        label: 'Qualificado' },
    { id: 'follow_up',          label: 'Follow-up' },
  ]

  var TIME_OPTIONS = [
    { id: 'immediate', label: 'Imediata (ao aplicar tag)' },
    { id: 'hours',     label: 'Horas depois' },
    { id: 'days',      label: 'Dias depois (linha do tempo)' },
  ]

  function matchesRule(rule) {
    if (!rule || rule.trigger_type !== 'on_tag') return false
    var tag = (rule.trigger_config || {}).tag
    return STATUSES.some(function(s) { return s.id === tag })
  }

  function toTrigger(form) {
    var cfg = { tag: form.status }
    if (form.when === 'hours') {
      cfg.delay_hours = parseInt(form.hours) || 0
      cfg.delay_minutes = parseInt(form.minutes) || 0
    } else if (form.when === 'days') {
      cfg.delay_days = parseInt(form.days) || 1
      cfg.delay_hours = parseInt(form.hour) || 0
      cfg.delay_minutes = parseInt(form.minute) || 0
    }
    return { trigger_type: 'on_tag', trigger_config: cfg }
  }

  function fromRule(rule) {
    var cfg = rule.trigger_config || {}
    var form = { status: cfg.tag || '', when: 'immediate' }
    if (cfg.delay_days) {
      form.when = 'days'
      form.days = cfg.delay_days
      form.hour = cfg.delay_hours || 0
      form.minute = cfg.delay_minutes || 0
    } else if (cfg.delay_hours || cfg.delay_minutes) {
      form.when = 'hours'
      form.hours = cfg.delay_hours || 0
      form.minutes = cfg.delay_minutes || 0
    }
    return form
  }

  function validate(form) {
    if (!form.status) return { ok: false, error: 'Escolha um status' }
    if (form.when === 'days' && (!form.days || form.days < 1)) return { ok: false, error: 'Dias invalidos' }
    return { ok: true }
  }

  function renderTriggerFields(form) {
    var statusOpts = STATUSES.map(function(s) {
      return '<option value="'+s.id+'"'+(form.status===s.id?' selected':'')+'>'+s.label+'</option>'
    }).join('')
    var timeOpts = TIME_OPTIONS.map(function(t) {
      return '<option value="'+t.id+'"'+(form.when===t.id?' selected':'')+'>'+t.label+'</option>'
    }).join('')

    var html = '<div class="fa-field"><label>Status (tag)</label>'
      + '<select id="faStatus"><option value="">Selecione...</option>'+statusOpts+'</select></div>'
      + '<div class="fa-field"><label>Quando disparar</label>'
      + '<select id="faWhen">'+timeOpts+'</select></div>'

    if (form.when === 'hours') {
      html += '<div class="fa-field-row">'
        + '<div class="fa-field"><label>Horas</label><input type="number" id="faHours" min="0" max="23" value="'+(form.hours||0)+'"></div>'
        + '<div class="fa-field"><label>Minutos</label><input type="number" id="faMinutes" min="0" max="59" value="'+(form.minutes||0)+'"></div>'
        + '</div>'
    } else if (form.when === 'days') {
      html += '<div class="fa-field-row">'
        + '<div class="fa-field"><label>Dias</label><input type="number" id="faDays" min="1" max="365" value="'+(form.days||1)+'"></div>'
        + '<div class="fa-field"><label>Hora</label><input type="number" id="faHour" min="0" max="23" value="'+(form.hour||10)+'"></div>'
        + '<div class="fa-field"><label>Min</label><input type="number" id="faMinute" min="0" max="59" value="'+(form.minute||0)+'"></div>'
        + '</div>'
    }
    return html
  }

  function readTriggerForm() {
    function v(id) { var e = document.getElementById(id); return e ? e.value : '' }
    var form = { status: v('faStatus'), when: v('faWhen') || 'immediate' }
    if (form.when === 'hours') {
      form.hours = parseInt(v('faHours')) || 0
      form.minutes = parseInt(v('faMinutes')) || 0
    } else if (form.when === 'days') {
      form.days = parseInt(v('faDays')) || 1
      form.hour = parseInt(v('faHour')) || 0
      form.minute = parseInt(v('faMinute')) || 0
    }
    return form
  }

  window.FAModules.pre_agendamento = {
    id: 'pre_agendamento',
    label: 'Pre-agendamento',
    color: '#7C3AED',
    icon: 'users',
    statuses: STATUSES,
    timeOptions: TIME_OPTIONS,
    matchesRule: matchesRule,
    toTrigger: toTrigger,
    fromRule: fromRule,
    validate: validate,
    renderTriggerFields: renderTriggerFields,
    readTriggerForm: readTriggerForm,
  }
})()
