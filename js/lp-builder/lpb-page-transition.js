/**
 * LP Builder · Page Transition (Onda 28 · final)
 *
 * Reproduz fielmente a sequência de abertura da revista (revista-live.html):
 *
 *   1. SPLASH editorial · brand Cormorant + sub Montserrat + 3 dots pulsando
 *      · brand fade + letterspacing 0 → -0.02em + translateY 8 → 0  (1.1s)
 *      · sub   fade + letterspacing 0 → .25em                       (1.4s · delay .25s)
 *      · dots  pulsam infinito até página estar pronta
 *
 *   2. SPLASH OUT · fade + translateY -6px (.55s)
 *
 *   3. CONTEÚDO IN · cada bloco fadeUp (opacity 0→1 + translateY 8→0) (.9s)
 *                  · h1/h2 titleReveal (opacity + letterspacing) (1.2s · delay .2s)
 *
 * Respeita @media (prefers-reduced-motion: reduce).
 *
 * API:
 *   LPBPageTransition.showSplash({ brand, sub })
 *   LPBPageTransition.hideSplash()
 *   LPBPageTransition.enterContent(rootEl)
 */
;(function () {
  'use strict'
  if (window.LPBPageTransition) return

  var SPLASH_ID = 'lpbSplash'
  var STYLE_ID  = 'lpbSplashStyle'
  var _splashEl = null

  function _injectStyle() {
    if (document.getElementById(STYLE_ID)) return
    var s = document.createElement('style')
    s.id = STYLE_ID
    s.textContent =
      '#' + SPLASH_ID + '{position:fixed;inset:0;background:var(--ivory,#FEFCF8);' +
        'display:flex;align-items:center;justify-content:center;flex-direction:column;' +
        'z-index:9999;transition:opacity .55s ease, transform .55s ease;text-align:center;padding:24px}' +
      '#' + SPLASH_ID + '.is-out{opacity:0;transform:translateY(-6px);pointer-events:none}' +
      '#' + SPLASH_ID + ' .lpb-splash-brand{font-family:Cormorant Garamond,serif;' +
        'font-size:38px;font-weight:300;font-style:italic;letter-spacing:-0.02em;' +
        'margin-bottom:6px;color:var(--graphite,#2C2C2C);' +
        'animation:lpbSplashBrandIn 1.1s ease-out both}' +
      '#' + SPLASH_ID + ' .lpb-splash-brand em{color:var(--champagne,#C8A97E);font-style:italic;font-weight:400}' +
      '#' + SPLASH_ID + ' .lpb-splash-sub{font-family:Montserrat,sans-serif;' +
        'font-size:11px;letter-spacing:.25em;text-transform:uppercase;color:var(--champagne,#C8A97E);' +
        'font-weight:500;margin-bottom:32px;animation:lpbSplashSubIn 1.4s ease-out .25s both}' +
      '#' + SPLASH_ID + ' .lpb-splash-dots{display:flex;gap:6px;justify-content:center;' +
        'opacity:0;animation:lpbSplashDotsIn .8s ease-out .7s forwards}' +
      '#' + SPLASH_ID + ' .lpb-splash-dots span{width:8px;height:8px;' +
        'background:var(--champagne,#C8A97E);transform:rotate(45deg);' +
        'animation:lpbSplashDot 1.2s ease-in-out infinite both}' +
      '#' + SPLASH_ID + ' .lpb-splash-dots span:nth-child(2){animation-delay:.15s}' +
      '#' + SPLASH_ID + ' .lpb-splash-dots span:nth-child(3){animation-delay:.3s}' +
      '@keyframes lpbSplashDot{0%,80%,100%{transform:rotate(45deg) scale(.6);opacity:.4}40%{transform:rotate(45deg) scale(1);opacity:1}}' +
      '@keyframes lpbSplashBrandIn{from{opacity:0;letter-spacing:0;transform:translateY(8px)}to{opacity:1;letter-spacing:-0.02em;transform:translateY(0)}}' +
      '@keyframes lpbSplashSubIn{from{opacity:0;letter-spacing:0}to{opacity:.92;letter-spacing:.25em}}' +
      '@keyframes lpbSplashDotsIn{to{opacity:1}}' +
      // entrada do conteúdo
      '.lpb-page-fadein{animation:lpbFadeUp .9s ease-out both}' +
      '.lpb-page-fadein h1,.lpb-page-fadein h2{animation:lpbTitleReveal 1.2s ease-out .2s both}' +
      '@keyframes lpbFadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}' +
      '@keyframes lpbTitleReveal{from{opacity:0;letter-spacing:0}to{opacity:1;letter-spacing:-0.01em}}' +
      // stagger sutil pra blocos sequenciais
      '.lpb-page-fadein > [data-block-idx]:nth-child(1){animation-delay:0s}' +
      '.lpb-page-fadein > [data-block-idx]:nth-child(2){animation-delay:.06s}' +
      '.lpb-page-fadein > [data-block-idx]:nth-child(3){animation-delay:.12s}' +
      '.lpb-page-fadein > [data-block-idx]:nth-child(4){animation-delay:.18s}' +
      '.lpb-page-fadein > [data-block-idx]:nth-child(5){animation-delay:.24s}' +
      '.lpb-page-fadein > [data-block-idx]{animation:lpbFadeUp .85s ease-out both}' +
      '@media (prefers-reduced-motion: reduce){' +
        '#' + SPLASH_ID + '{transition:none}' +
        '.lpb-page-fadein,.lpb-page-fadein h1,.lpb-page-fadein h2,' +
        '.lpb-page-fadein > [data-block-idx]{animation:none}' +
      '}'
    document.head.appendChild(s)
  }

  function showSplash(opts) {
    opts = opts || {}
    _injectStyle()

    var brandText = opts.brand || 'Clínica <em>Mirian de Paula</em>'
    var subText   = opts.sub   || 'Carregando'

    _splashEl = document.getElementById(SPLASH_ID)
    if (!_splashEl) {
      _splashEl = document.createElement('div')
      _splashEl.id = SPLASH_ID
      _splashEl.setAttribute('aria-live', 'polite')
      _splashEl.setAttribute('aria-busy', 'true')
      _splashEl.innerHTML =
        '<div class="lpb-splash-brand">' + brandText + '</div>' +
        '<div class="lpb-splash-sub">' + (subText || '').replace(/[<>"']/g, '') + '</div>' +
        '<div class="lpb-splash-dots"><span></span><span></span><span></span></div>'
      document.body.appendChild(_splashEl)
    }
  }

  function hideSplash() {
    if (!_splashEl) _splashEl = document.getElementById(SPLASH_ID)
    if (!_splashEl) return
    _splashEl.classList.add('is-out')
    var el = _splashEl
    setTimeout(function () {
      if (el && el.parentNode) el.parentNode.removeChild(el)
      _splashEl = null
    }, 600)
  }

  function enterContent(rootEl) {
    if (!rootEl) rootEl = document.getElementById('lpRoot') || document.body
    rootEl.classList.add('lpb-page-fadein')
    // Remove a classe após a animação (limpeza · evita re-trigger em renderizações futuras)
    setTimeout(function () {
      rootEl.classList.remove('lpb-page-fadein')
    }, 1500)
  }

  window.LPBPageTransition = Object.freeze({
    showSplash:   showSplash,
    hideSplash:   hideSplash,
    enterContent: enterContent,
  })
})()
