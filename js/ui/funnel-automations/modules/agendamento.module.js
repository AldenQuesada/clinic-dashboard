/**
 * Modulo Agendamento — ciclo do agendamento (antes, durante, apos a consulta)
 * Especial: tem "dias antes da consulta", "no dia da consulta", "min antes"
 * Zero dependencia de outros modulos.
 */
;(function () {
  'use strict'
  window.FAModules = window.FAModules || {}

  // Statuses do agendamento = mudancas de estado do appointment
  var STATUSES = [
    { id: 'agendado',               label: 'Agendado',               kind: 'status' },
    { id: 'aguardando_confirmacao', label: 'Aguardando Confirmacao', kind: 'status' },
    { id: 'confirmado',             label: 'Confirmado',             kind: 'status' },
    { id: 'remarcado',              label: 'Remarcado',              kind: 'status' },
    { id: 'cancelado',              label: 'Cancelado',              kind: 'status' },
    { id: 'no_show',                label: 'Falta (No-show)',        kind: 'status' },
    { id: 'na_clinica',             label: 'Na Clinica',             kind: 'status' },
    { id: 'em_consulta',            label: 'Em Consulta',            kind: 'status' },
    { id: 'finalizado',             label: 'Finalizado',             kind: 'status' },
    { id: 'encaixe',                label: 'Encaixe',                kind: 'tag' },
  ]

  // Tempo: inclui opcoes relativas a data da consulta
  var TIME_OPTIONS = [
    { id: 'immediate',         label: 'Imediata (ao entrar nesse status)' },
    { id: 'hours',             label: 'Horas depois' },
    { id: 'days',              label: 'Dias depois' },
    { id: 'days_before',       label: 'Dias ANTES da consulta' },
    { id: 'same_day',          label: 'No dia da consulta' },
    { id: 'min_before',        label: 'Minutos ANTES da consulta' },
  ]

  function matchesRule(rule) {
    if (!rule) return false
    var t = rule.trigger_type
    var cfg = rule.trigger_config || {}
    // on_status com status do agendamento
    if (t === 'on_status') {
      return STATUSES.some(function(s){ return s.kind === 'status' && s.id === cfg.status })
    }
    // on_tag com tag=encaixe
    if (t === 'on_tag' && cfg.tag === 'encaixe') return true
    // tempos relativos a consulta
    if (t === 'd_before' || t === 'd_zero' || t === 'min_before' || t === 'daily_summary') return true
    return false
  }

  function toTrigger(form) {
    // encaixe sempre on_tag
    if (form.status === 'encaixe') {
      return { trigger_type: 'on_tag', trigger_config: { tag: 'encaixe' } }
    }
    if (form.when === 'immediate') {
      return { trigger_type: 'on_status', trigger_config: { status: form.status } }
    }
    if (form.when === 'days_before') {
      return { trigger_type: 'd_before', trigger_config: {
        days: parseInt(form.days) || 1,
        hour: parseInt(form.hour) || 10,
        minute: parseInt(form.minute) || 0,
      } }
    }
    if (form.when === 'same_day') {
      return { trigger_type: 'd_zero', trigger_config: {
        hour: parseInt(form.hour) || 8,
        minute: parseInt(form.minute) || 0,
      } }
    }
    if (form.when === 'min_before') {
      return { trigger_type: 'min_before', trigger_config: {
        minutes: parseInt(form.minutesBefore) || 30,
      } }
    }
    // hours/days linha do tempo desde aplicacao — on_tag com status como tag
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
    if (t === 'on_status') return { status: cfg.status, when: 'immediate' }
    if (t === 'on_tag' && cfg.tag === 'encaixe') return { status: 'encaixe', when: 'immediate' }
    if (t === 'd_before') return {
      status: 'agendado', when: 'days_before',
      days: cfg.days || 1, hour: cfg.hour || 10, minute: cfg.minute || 0,
    }
    if (t === 'd_zero') return {
      status: 'agendado', when: 'same_day',
      hour: cfg.hour || 8, minute: cfg.minute || 0,
    }
    if (t === 'min_before') return {
      status: 'agendado', when: 'min_before',
      minutesBefore: cfg.minutes || 30,
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
    if (!form.status) return { ok: false, error: 'Escolha um status do agendamento' }
    if (form.when === 'days_before' && (!form.days || form.days < 1)) return { ok: false, error: 'Dias antes da consulta invalido' }
    if (form.when === 'min_before' && (!form.minutesBefore || form.minutesBefore < 1)) return { ok: false, error: 'Minutos antes invalido' }
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

    var html = '<div class="fa-field"><label>Status do agendamento</label>'
      + '<select id="faStatus"><option value="">Selecione...</option>'+statusOpts+'</select></div>'
      + '<div class="fa-field"><label>Quando disparar</label>'
      + '<select id="faWhen">'+timeOpts+'</select></div>'

    if (form.when === 'hours') {
      html += '<div class="fa-field-row">'
        + '<div class="fa-field"><label>Horas</label><input type="number" id="faHours" min="0" max="23" value="'+(form.hours||0)+'"></div>'
        + '<div class="fa-field"><label>Min</label><input type="number" id="faMinutes" min="0" max="59" value="'+(form.minutes||0)+'"></div>'
        + '</div>'
    } else if (form.when === 'days' || form.when === 'days_before') {
      var dayLabel = form.when === 'days_before' ? 'Dias antes' : 'Dias'
      html += '<div class="fa-field-row">'
        + '<div class="fa-field"><label>'+dayLabel+'</label><input type="number" id="faDays" min="1" max="30" value="'+(form.days||1)+'"></div>'
        + '<div class="fa-field"><label>Hora</label><input type="number" id="faHour" min="0" max="23" value="'+(form.hour||10)+'"></div>'
        + '<div class="fa-field"><label>Min</label><input type="number" id="faMinute" min="0" max="59" value="'+(form.minute||0)+'"></div>'
        + '</div>'
    } else if (form.when === 'same_day') {
      html += '<div class="fa-field-row">'
        + '<div class="fa-field"><label>Hora</label><input type="number" id="faHour" min="0" max="23" value="'+(form.hour||8)+'"></div>'
        + '<div class="fa-field"><label>Min</label><input type="number" id="faMinute" min="0" max="59" value="'+(form.minute||0)+'"></div>'
        + '</div>'
    } else if (form.when === 'min_before') {
      html += '<div class="fa-field"><label>Minutos antes da consulta</label>'
        + '<input type="number" id="faMinutesBefore" min="5" max="720" value="'+(form.minutesBefore||30)+'"></div>'
    }
    return html
  }

  function readTriggerForm() {
    function v(id) { var e = document.getElementById(id); return e ? e.value : '' }
    var form = { status: v('faStatus'), when: v('faWhen') || 'immediate' }
    if (form.when === 'hours') { form.hours = parseInt(v('faHours'))||0; form.minutes = parseInt(v('faMinutes'))||0 }
    else if (form.when === 'days' || form.when === 'days_before') { form.days = parseInt(v('faDays'))||1; form.hour = parseInt(v('faHour'))||0; form.minute = parseInt(v('faMinute'))||0 }
    else if (form.when === 'same_day') { form.hour = parseInt(v('faHour'))||8; form.minute = parseInt(v('faMinute'))||0 }
    else if (form.when === 'min_before') { form.minutesBefore = parseInt(v('faMinutesBefore'))||30 }
    return form
  }

  window.FAModules.agendamento = {
    id: 'agendamento',
    label: 'Agendamento',
    color: '#059669',
    icon: 'calendar',
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
