/**
 * Modulo Paciente — pos-consulta / pos-procedimento
 * Zero dependencia de outros modulos.
 */
;(function () {
  'use strict'
  window.FAModules = window.FAModules || {}

  var STATUSES = [
    { id: 'consulta_realizada',    label: 'Consulta Realizada' },
    { id: 'procedimento_realizado',label: 'Procedimento Realizado' },
    { id: 'pos_consulta',          label: 'Pos-consulta' },
    { id: 'pos_procedimento',      label: 'Pos-procedimento' },
    { id: 'aguardando_retorno',    label: 'Aguardando Retorno' },
    { id: 'avaliacao_pendente',    label: 'Avaliacao Pendente' },
    { id: 'avaliacao_realizada',   label: 'Avaliacao Realizada' },
  ]
  var TIME_OPTIONS = [
    { id: 'immediate', label: 'Imediata (ao finalizar/aplicar)' },
    { id: 'hours',     label: 'Horas depois' },
    { id: 'days',      label: 'Dias depois' },
  ]

  function matchesRule(rule) {
    if (!rule) return false
    var t = rule.trigger_type
    var cfg = rule.trigger_config || {}
    if (t === 'on_finalize') return true
    if (t === 'd_after') return true
    if (t === 'on_tag') {
      return STATUSES.some(function(s){ return s.id === cfg.tag })
    }
    return false
  }

  function toTrigger(form) {
    if (form.status === 'consulta_realizada' && form.when === 'immediate') {
      return { trigger_type: 'on_finalize', trigger_config: {} }
    }
    if (form.when === 'days' && (form.status === 'pos_procedimento' || form.status === 'pos_consulta')) {
      return { trigger_type: 'd_after', trigger_config: {
        days: parseInt(form.days)||1, hour: parseInt(form.hour)||10, minute: parseInt(form.minute)||0,
      } }
    }
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
    var t = rule.trigger_type
    var cfg = rule.trigger_config || {}
    if (t === 'on_finalize') return { status: 'consulta_realizada', when: 'immediate' }
    if (t === 'd_after') return {
      status: 'pos_procedimento', when: 'days',
      days: cfg.days||1, hour: cfg.hour||10, minute: cfg.minute||0,
    }
    if (t === 'on_tag') {
      var form = { status: cfg.tag, when: 'immediate' }
      if (cfg.delay_days) { form.when = 'days'; form.days = cfg.delay_days; form.hour = cfg.delay_hours||0; form.minute = cfg.delay_minutes||0 }
      else if (cfg.delay_hours || cfg.delay_minutes) { form.when = 'hours'; form.hours = cfg.delay_hours||0; form.minutes = cfg.delay_minutes||0 }
      return form
    }
    return { status: '', when: 'immediate' }
  }

  function validate(form) {
    if (!form.status) return { ok: false, error: 'Escolha um status de paciente' }
    if (form.when === 'days' && (!form.days || form.days < 1)) return { ok: false, error: 'Dias invalido' }
    return { ok: true }
  }

  function renderTriggerFields(form) {
    var statusOpts = STATUSES.map(function(s) {
      return '<option value="'+s.id+'"'+(form.status===s.id?' selected':'')+'>'+s.label+'</option>'
    }).join('')
    var timeOpts = TIME_OPTIONS.map(function(t) {
      return '<option value="'+t.id+'"'+(form.when===t.id?' selected':'')+'>'+t.label+'</option>'
    }).join('')

    var html = '<div class="fa-field"><label>Status (paciente)</label>'
      + '<select id="faStatus"><option value="">Selecione...</option>'+statusOpts+'</select></div>'
      + '<div class="fa-field"><label>Quando disparar</label><select id="faWhen">'+timeOpts+'</select></div>'

    if (form.when === 'hours') {
      html += '<div class="fa-field-row">'
        + '<div class="fa-field"><label>Horas</label><input type="number" id="faHours" min="0" max="23" value="'+(form.hours||0)+'"></div>'
        + '<div class="fa-field"><label>Min</label><input type="number" id="faMinutes" min="0" max="59" value="'+(form.minutes||0)+'"></div>'
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
    if (form.when === 'hours') { form.hours = parseInt(v('faHours'))||0; form.minutes = parseInt(v('faMinutes'))||0 }
    else if (form.when === 'days') { form.days = parseInt(v('faDays'))||1; form.hour = parseInt(v('faHour'))||0; form.minute = parseInt(v('faMinute'))||0 }
    return form
  }

  window.FAModules.paciente = {
    id: 'paciente', label: 'Paciente', color: '#0891B2', icon: 'heart',
    statuses: STATUSES, timeOptions: TIME_OPTIONS,
    matchesRule: matchesRule, toTrigger: toTrigger, fromRule: fromRule,
    validate: validate, renderTriggerFields: renderTriggerFields, readTriggerForm: readTriggerForm,
  }
})()
