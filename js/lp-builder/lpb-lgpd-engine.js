/**
 * LP Builder · LGPD Engine (Onda 21)
 *
 * Núcleo PURO. Sem DOM, sem fetch, sem efeitos colaterais.
 * Único responsável por:
 *   · estrutura de config padrão (defaultConfig)
 *   · validação de config (validateConfig)
 *   · geração do HTML do banner (buildBannerHTML)
 *   · normalização de registro de consentimento (buildConsentRecord)
 *   · merge de config com defaults (resolveConfig)
 *
 * Independente — testável isolado:
 *   var html = LPBLgpdEngine.buildBannerHTML(LPBLgpdEngine.defaultConfig())
 */
;(function () {
  'use strict'
  if (window.LPBLgpdEngine) return

  // ──────────────────────────────────────────────────────────
  // Config padrão (Brasil · LGPD compliant)
  // ──────────────────────────────────────────────────────────
  function defaultConfig() {
    return {
      enabled:    false,
      mode:       'banner',     // 'banner' (rodapé) | 'modal' (centro bloqueante)
      categories: ['necessary', 'analytics', 'marketing'],
      texts: {
        title:       'Privacidade · Cookies',
        message:     'Usamos cookies para melhorar sua experiência. Você pode aceitar todos ou ajustar suas preferências. Consulte nossa Política de Privacidade.',
        accept_all:  'Aceitar todos',
        reject_all:  'Recusar opcionais',
        customize:   'Personalizar',
        save:        'Salvar preferências',
        policy_link: 'Política de Privacidade',
      },
      cat_labels: {
        necessary:  'Essenciais (sempre ativos)',
        analytics:  'Análise · GA4, métricas',
        marketing:  'Marketing · Pixel, remarketing',
      },
      cat_descriptions: {
        necessary:  'Cookies essenciais ao funcionamento da página (autenticação, segurança).',
        analytics:  'Estatísticas anônimas pra entender como a página é usada.',
        marketing:  'Pra anúncios personalizados em redes sociais e Google.',
      },
      theme: {
        bg:          '#FEFCF8',
        text:        '#2C2C2C',
        accent:      '#C8A97E',
        accent_text: '#FFFFFF',
        border:      '#E8DFD0',
      },
      policy_url:    '',
      contact_email: '',
      version:       '1.0',
    }
  }

  // ──────────────────────────────────────────────────────────
  // Merge profundo de config user-provided com defaults
  // ──────────────────────────────────────────────────────────
  function resolveConfig(userConfig) {
    var def = defaultConfig()
    if (!userConfig || typeof userConfig !== 'object') return def
    var out = JSON.parse(JSON.stringify(def))
    Object.keys(userConfig).forEach(function (k) {
      var v = userConfig[k]
      if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
        Object.keys(v).forEach(function (kk) { out[k][kk] = v[kk] })
      } else {
        out[k] = v
      }
    })
    return out
  }

  // ──────────────────────────────────────────────────────────
  // Validação básica
  // ──────────────────────────────────────────────────────────
  function validateConfig(c) {
    if (!c || typeof c !== 'object') return { ok: false, reason: 'config_invalid' }
    if (!Array.isArray(c.categories) || !c.categories.length) {
      return { ok: false, reason: 'no_categories' }
    }
    if (c.categories.indexOf('necessary') === -1) {
      return { ok: false, reason: 'necessary_required' }
    }
    if (c.policy_url && !/^(https?:\/\/|\/)/.test(c.policy_url)) {
      return { ok: false, reason: 'policy_url_invalid' }
    }
    return { ok: true }
  }

  // ──────────────────────────────────────────────────────────
  // Registro de consentimento (formato salvo no DB)
  // ──────────────────────────────────────────────────────────
  function buildConsentRecord(choices, configVersion) {
    var rec = { necessary: true, version: String(configVersion || '1.0'), timestamp: new Date().toISOString() }
    ;(['analytics', 'marketing']).forEach(function (k) {
      rec[k] = !!(choices && choices[k])
    })
    return rec
  }

  // ──────────────────────────────────────────────────────────
  // HTML do banner
  // ──────────────────────────────────────────────────────────
  function _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;')
  }

  function buildBannerHTML(config) {
    var c = resolveConfig(config)
    var t = c.theme
    var x = c.texts
    var policy = c.policy_url
      ? '<a href="' + _esc(c.policy_url) + '" target="_blank" rel="noopener" style="color:' + _esc(t.accent) + ';text-decoration:underline">' + _esc(x.policy_link) + '</a>'
      : ''

    var catRows = c.categories.map(function (cat) {
      var isNecessary = (cat === 'necessary')
      var label = c.cat_labels[cat] || cat
      var desc  = c.cat_descriptions[cat] || ''
      return '<label class="lpb-lgpd-cat" style="display:flex;gap:10px;padding:10px 0;border-bottom:1px solid ' + _esc(t.border) + ';align-items:flex-start;cursor:' + (isNecessary ? 'not-allowed' : 'pointer') + '">' +
        '<input type="checkbox" data-cat="' + _esc(cat) + '" ' + (isNecessary ? 'checked disabled' : '') + ' style="margin-top:3px;flex-shrink:0">' +
        '<div style="flex:1">' +
          '<div style="font-size:12px;font-weight:500;color:' + _esc(t.text) + '">' + _esc(label) + '</div>' +
          (desc ? '<div style="font-size:11px;color:' + _esc(t.text) + ';opacity:.7;margin-top:2px;line-height:1.5">' + _esc(desc) + '</div>' : '') +
        '</div>' +
      '</label>'
    }).join('')

    var isModal = (c.mode === 'modal')

    var wrapStyle = isModal
      ? 'position:fixed;inset:0;background:rgba(0,0,0,.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Montserrat,sans-serif'
      : 'position:fixed;left:0;right:0;bottom:0;z-index:9998;background:' + _esc(t.bg) + ';border-top:1px solid ' + _esc(t.border) + ';box-shadow:0 -4px 24px rgba(0,0,0,.08);padding:18px 20px;font-family:Montserrat,sans-serif'

    var inner = '' +
      '<div class="lpb-lgpd-pane" style="' +
        (isModal
          ? 'background:' + _esc(t.bg) + ';border:1px solid ' + _esc(t.border) + ';max-width:520px;width:100%;padding:24px;color:' + _esc(t.text)
          : 'max-width:1200px;margin:0 auto;color:' + _esc(t.text) + ';display:flex;gap:16px;align-items:center;flex-wrap:wrap') +
      '">' +

        // Texto principal
        '<div style="flex:1;min-width:240px">' +
          (isModal ? '<h3 style="margin:0 0 10px;font-family:Cormorant Garamond,serif;font-weight:400;font-size:22px">' + _esc(x.title) + '</h3>' : '') +
          '<p style="margin:0;font-size:12px;line-height:1.6">' + _esc(x.message) + (policy ? ' ' + policy : '') + '</p>' +
        '</div>' +

        // Detalhes (oculto por padrão, abre ao clicar Personalizar)
        '<div class="lpb-lgpd-details" data-state="closed" style="display:none;width:100%;margin-top:10px">' +
          '<div style="background:rgba(0,0,0,.02);padding:12px 14px;border:1px solid ' + _esc(t.border) + '">' +
            catRows +
          '</div>' +
        '</div>' +

        // Botões
        '<div class="lpb-lgpd-actions" style="display:flex;gap:8px;flex-wrap:wrap">' +
          '<button type="button" class="lpb-lgpd-customize" style="padding:9px 16px;font-size:11px;letter-spacing:.05em;background:transparent;border:1px solid ' + _esc(t.border) + ';color:' + _esc(t.text) + ';cursor:pointer;font-family:inherit">' + _esc(x.customize) + '</button>' +
          '<button type="button" class="lpb-lgpd-reject"   style="padding:9px 16px;font-size:11px;letter-spacing:.05em;background:transparent;border:1px solid ' + _esc(t.border) + ';color:' + _esc(t.text) + ';cursor:pointer;font-family:inherit">' + _esc(x.reject_all) + '</button>' +
          '<button type="button" class="lpb-lgpd-accept"   style="padding:9px 18px;font-size:11px;letter-spacing:.05em;background:' + _esc(t.accent) + ';border:1px solid ' + _esc(t.accent) + ';color:' + _esc(t.accent_text) + ';cursor:pointer;font-family:inherit;font-weight:500">' + _esc(x.accept_all) + '</button>' +
          '<button type="button" class="lpb-lgpd-save" style="display:none;padding:9px 18px;font-size:11px;letter-spacing:.05em;background:' + _esc(t.accent) + ';border:1px solid ' + _esc(t.accent) + ';color:' + _esc(t.accent_text) + ';cursor:pointer;font-family:inherit;font-weight:500">' + _esc(x.save) + '</button>' +
        '</div>' +
      '</div>'

    return '<div class="lpb-lgpd-banner" data-mode="' + _esc(c.mode) + '" style="' + wrapStyle + '">' + inner + '</div>'
  }

  window.LPBLgpdEngine = Object.freeze({
    defaultConfig:      defaultConfig,
    resolveConfig:      resolveConfig,
    validateConfig:     validateConfig,
    buildConsentRecord: buildConsentRecord,
    buildBannerHTML:    buildBannerHTML,
  })
})()
