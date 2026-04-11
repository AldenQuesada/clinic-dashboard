/**
 * ClinicAI — Money toolkit
 *
 * Trabalha em CENTAVOS (int) internamente para eliminar drift de
 * arredondamento de float. APIs externas continuam aceitando float.
 *
 * Funciona tanto no browser (window.Money) quanto em node (require)
 * e ESM (import via createRequire).
 */
(function (root, factory) {
  var Money = factory()
  if (typeof module !== 'undefined' && module.exports) module.exports = Money
  if (typeof root !== 'undefined') {
    root.Money = Money
    if (typeof root.window !== 'undefined') root.window.Money = Money
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict'

  function toCents(v) {
    if (v === null || v === undefined || v === '') return 0
    var n = typeof v === 'number' ? v : parseFloat(v)
    if (!isFinite(n)) return 0
    return Math.round(n * 100)
  }

  function fromCents(c) { return (c | 0) / 100 }

  function eq(a, b) { return toCents(a) === toCents(b) }

  function add() {
    var sum = 0
    for (var i = 0; i < arguments.length; i++) sum += toCents(arguments[i])
    return fromCents(sum)
  }

  function sub(a, b) { return fromCents(toCents(a) - toCents(b)) }

  function sum(arr) {
    if (!Array.isArray(arr)) return 0
    var s = 0
    for (var i = 0; i < arr.length; i++) s += toCents(arr[i])
    return fromCents(s)
  }

  function sumEq(arr, expected) { return toCents(sum(arr)) === toCents(expected) }

  function div(value, parts) {
    var p = parseInt(parts) || 1
    if (p < 1) p = 1
    return fromCents(Math.round(toCents(value) / p))
  }

  function parse(s) {
    if (typeof s === 'number') return s
    if (s === null || s === undefined) return 0
    var str = String(s).trim()
    if (!str) return 0
    str = str.replace(/R\$|\s/g, '')
    if (str.indexOf(',') !== -1 && str.indexOf('.') !== -1) {
      str = str.replace(/\./g, '').replace(',', '.')
    } else if (str.indexOf(',') !== -1) {
      str = str.replace(',', '.')
    }
    var n = parseFloat(str)
    return isFinite(n) ? n : 0
  }

  function format(v, withSymbol) {
    var n = parse(v)
    var s = n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    return withSymbol === false ? s : ('R$ ' + s)
  }

  function isZero(v) { return toCents(v) === 0 }

  function clamp(v, min, max) {
    var c = toCents(v)
    if (c < toCents(min)) c = toCents(min)
    if (c > toCents(max)) c = toCents(max)
    return fromCents(c)
  }

  return {
    toCents: toCents,
    fromCents: fromCents,
    eq: eq,
    add: add,
    sub: sub,
    sum: sum,
    sumEq: sumEq,
    div: div,
    parse: parse,
    format: format,
    isZero: isZero,
    clamp: clamp,
  }
})
