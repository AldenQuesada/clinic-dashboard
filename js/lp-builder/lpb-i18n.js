/**
 * LP Builder · i18n engine
 *
 * Modelo de dados: cada bloco tem `props` (default = idioma base, PT-BR)
 * e opcionalmente `props._i18n: { en: {...}, es: {...} }` com overrides.
 *
 * Renderer chama applyI18n(block, lang) antes de gerar HTML — os campos
 * que existirem em _i18n[lang] sobrescrevem os defaults.
 *
 * Independente — testável isolado:
 *   var b = { type: 'hero-split', props: { h1: 'Olá', _i18n: { en: { h1: 'Hello' } } } }
 *   var resolved = LPBI18n.applyI18n(b, 'en')
 *   // resolved.props.h1 === 'Hello'
 *
 * window.LPBI18n
 */
;(function () {
  'use strict'
  if (window.LPBI18n) return

  var DEFAULT_LANG = 'pt-BR'
  var SUPPORTED = [
    { code: 'pt-BR', label: 'Português',  flag: 'BR', short: 'PT' },
    { code: 'en',    label: 'English',    flag: 'US', short: 'EN' },
    { code: 'es',    label: 'Español',    flag: 'ES', short: 'ES' },
    { code: 'fr',    label: 'Français',   flag: 'FR', short: 'FR' },
  ]

  var STORAGE_KEY = 'lpb_user_lang'
  var EDITOR_LANG_KEY = 'lpb_editor_lang'

  // ────────────────────────────────────────────────────────────
  // Detect / persist user lang (público, lp.html)
  // ────────────────────────────────────────────────────────────
  function detectLang() {
    try {
      var qs = new URLSearchParams(window.location.search)
      var fromUrl = qs.get('lang')
      if (fromUrl && _isSupported(fromUrl)) return _normalize(fromUrl)
    } catch (_) {}
    try {
      var fromStorage = localStorage.getItem(STORAGE_KEY)
      if (fromStorage && _isSupported(fromStorage)) return _normalize(fromStorage)
    } catch (_) {}
    try {
      var nav = (navigator.language || navigator.userLanguage || '').toLowerCase()
      if (nav.indexOf('pt') === 0) return 'pt-BR'
      if (nav.indexOf('en') === 0) return 'en'
      if (nav.indexOf('es') === 0) return 'es'
      if (nav.indexOf('fr') === 0) return 'fr'
    } catch (_) {}
    return DEFAULT_LANG
  }

  function setUserLang(lang) {
    if (!_isSupported(lang)) return
    try { localStorage.setItem(STORAGE_KEY, _normalize(lang)) } catch (_) {}
    try {
      var u = new URL(window.location.href)
      u.searchParams.set('lang', _normalize(lang))
      window.location.href = u.toString()
    } catch (_) {
      window.location.reload()
    }
  }

  // ────────────────────────────────────────────────────────────
  // Editor active lang (qual idioma o user está editando)
  // ────────────────────────────────────────────────────────────
  function getEditingLang() {
    try {
      var v = localStorage.getItem(EDITOR_LANG_KEY)
      return _isSupported(v) ? _normalize(v) : DEFAULT_LANG
    } catch (_) { return DEFAULT_LANG }
  }
  function setEditingLang(lang) {
    if (!_isSupported(lang)) return
    try { localStorage.setItem(EDITOR_LANG_KEY, _normalize(lang)) } catch (_) {}
    document.body.dispatchEvent(new CustomEvent('lpb:editing-lang-changed', { detail: { lang: _normalize(lang) } }))
  }

  // ────────────────────────────────────────────────────────────
  // applyI18n(block, lang)
  // Retorna um BLOCO clonado com props mescladas com _i18n[lang]
  // ────────────────────────────────────────────────────────────
  function applyI18n(block, lang) {
    if (!block) return block
    if (!lang || lang === DEFAULT_LANG) return block

    var props = block.props || {}
    var i18n = props._i18n || {}
    var override = i18n[lang]
    if (!override || typeof override !== 'object') return block

    // shallow merge — NÃO mexemos em props original
    var merged = Object.assign({}, props)
    Object.keys(override).forEach(function (k) {
      if (override[k] !== undefined && override[k] !== '' && override[k] !== null) {
        merged[k] = override[k]
      }
    })
    // remove _i18n da copia (renderer não precisa)
    delete merged._i18n

    return Object.assign({}, block, { props: merged })
  }

  // Atalho: aplica i18n a uma lista de blocos
  function applyI18nAll(blocks, lang) {
    if (!Array.isArray(blocks)) return []
    return blocks.map(function (b) { return applyI18n(b, lang) })
  }

  // ────────────────────────────────────────────────────────────
  // Helpers pro inspector — getter/setter "via lang"
  // Se lang === default: lê/grava props[key]
  // Senão: lê props._i18n[lang][key], gravando se for diferente do default
  // ────────────────────────────────────────────────────────────
  function getValue(block, key, lang) {
    if (!block) return ''
    var props = block.props || {}
    if (!lang || lang === DEFAULT_LANG) return props[key]
    var i18n = props._i18n || {}
    var langProps = i18n[lang] || {}
    return langProps[key] != null ? langProps[key] : props[key]
  }

  function setValue(block, key, value, lang) {
    if (!block) return
    if (!block.props) block.props = {}
    if (!lang || lang === DEFAULT_LANG) {
      block.props[key] = value
      return
    }
    if (!block.props._i18n) block.props._i18n = {}
    if (!block.props._i18n[lang]) block.props._i18n[lang] = {}
    block.props._i18n[lang][key] = value
  }

  function deleteValue(block, key, lang) {
    if (!block || !block.props) return
    if (!lang || lang === DEFAULT_LANG) {
      delete block.props[key]
    } else if (block.props._i18n && block.props._i18n[lang]) {
      delete block.props._i18n[lang][key]
    }
  }

  // ────────────────────────────────────────────────────────────
  // Helpers internos
  // ────────────────────────────────────────────────────────────
  function _isSupported(lang) {
    if (!lang) return false
    var n = _normalize(lang)
    return SUPPORTED.some(function (l) { return l.code === n })
  }
  function _normalize(lang) {
    var s = String(lang || '').toLowerCase()
    if (s === 'pt' || s === 'pt-br' || s === 'pt-pt') return 'pt-BR'
    if (s === 'en-us' || s === 'en-gb') return 'en'
    return s
  }

  function getLangMeta(code) {
    return SUPPORTED.find(function (l) { return l.code === _normalize(code) }) || SUPPORTED[0]
  }

  window.LPBI18n = Object.freeze({
    DEFAULT_LANG:    DEFAULT_LANG,
    SUPPORTED:       SUPPORTED,
    detectLang:      detectLang,
    setUserLang:     setUserLang,
    getEditingLang:  getEditingLang,
    setEditingLang:  setEditingLang,
    applyI18n:       applyI18n,
    applyI18nAll:    applyI18nAll,
    getValue:        getValue,
    setValue:        setValue,
    deleteValue:     deleteValue,
    getLangMeta:     getLangMeta,
  })
})()
