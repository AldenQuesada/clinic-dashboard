;(function(){
  'use strict';
  if (window.LPBBlockLocationStory) return;

  var CSS_ID = 'lpb-block-location-story-css';

  var DEFAULTS = {
    bg: 'graphite',
    eyebrow: 'LOCALIZAÇÃO',
    titulo: 'Estamos perto de você',
    address: 'Av. Brasil, 4242\nMaringá/PR · CEP 87013-000',
    hours_weekday: 'Seg a Sex · 9h às 19h',
    hours_saturday: 'Sábado · 9h às 13h',
    hours_sunday: 'Domingo · Fechado',
    chip_1: 'Estacionamento próprio',
    chip_2: 'Acessibilidade total',
    chip_3: 'WiFi grátis',
    whatsapp_url: 'https://wa.me/5544999999999',
    whatsapp_label: 'Agendar pelo WhatsApp'
  };

  function _esc(s){
    if (s == null) return '';
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  function _nl2br(s){
    return _esc(s).replace(/\n/g,'<br>');
  }

  function _bg(p){
    var b = (p && p.bg) || DEFAULTS.bg;
    if (b !== 'graphite' && b !== 'ivory' && b !== 'white') b = 'graphite';
    return b;
  }

  function _props(block){
    var p = (block && block.props) || {};
    var out = {};
    for (var k in DEFAULTS){
      if (Object.prototype.hasOwnProperty.call(DEFAULTS, k)){
        var v = p[k];
        out[k] = (v == null || v === '') ? DEFAULTS[k] : v;
      }
    }
    out.bg = _bg(p);
    return out;
  }

  function injectCSS(){
    if (document.getElementById(CSS_ID)) return;
    var css = ''+
      '.lpb-locstory{position:relative;width:100%;padding:2rem 1rem;font-family:Montserrat,system-ui,sans-serif;}'+
      '.lpb-locstory--graphite{background:#2C2C2C;color:#FEFCF8;}'+
      '.lpb-locstory--ivory{background:#FEFCF8;color:#2C2C2C;}'+
      '.lpb-locstory--white{background:#FFFFFF;color:#2C2C2C;}'+
      '.lpb-locstory__inner{max-width:480px;margin:0 auto;}'+
      '.lpb-locstory__head{text-align:center;margin-bottom:1.5rem;}'+
      '.lpb-locstory__eyebrow{font-family:Montserrat,sans-serif;font-size:11px;letter-spacing:.18em;color:#C8A97E;text-transform:uppercase;margin:0 0 .5rem;font-weight:600;}'+
      '.lpb-locstory__title{font-family:"Cormorant Garamond",Georgia,serif;font-size:28px;line-height:1.2;font-weight:500;margin:0;}'+
      '.lpb-locstory__cards{display:flex;flex-direction:column;gap:12px;margin-top:1.25rem;}'+
      '.lpb-locstory__card{position:relative;padding:20px;border:1px solid rgba(200,169,126,.2);border-radius:4px;opacity:0;transform:translateY(20px);transition:opacity 600ms cubic-bezier(.4,0,.2,1),transform 600ms cubic-bezier(.4,0,.2,1);}'+
      '.lpb-locstory--graphite .lpb-locstory__card{background:rgba(245,240,232,.04);}'+
      '.lpb-locstory--ivory .lpb-locstory__card,.lpb-locstory--white .lpb-locstory__card{background:rgba(44,44,44,.04);}'+
      '.lpb-locstory__card.is-in{opacity:1;transform:translateY(0);}'+
      '.lpb-locstory__icon{display:block;width:28px;height:28px;color:#C8A97E;margin-bottom:.75rem;}'+
      '.lpb-locstory__cardtitle{font-family:"Cormorant Garamond",Georgia,serif;font-size:18px;color:#C8A97E;margin:0 0 .25rem;font-weight:500;line-height:1.3;}'+
      '.lpb-locstory__rule{display:block;width:100%;height:1px;background:#C8A97E;margin:.5rem 0 .75rem;transform:scaleX(0);transform-origin:left center;transition:transform 800ms cubic-bezier(.4,0,.2,1);}'+
      '.lpb-locstory__card.is-in .lpb-locstory__rule{transform:scaleX(1);}'+
      '.lpb-locstory__body{font-family:Montserrat,sans-serif;font-size:13px;line-height:1.55;margin:0;}'+
      '.lpb-locstory--graphite .lpb-locstory__body{color:#FEFCF8;}'+
      '.lpb-locstory--ivory .lpb-locstory__body,.lpb-locstory--white .lpb-locstory__body{color:#2C2C2C;}'+
      '.lpb-locstory__hours{list-style:none;margin:0;padding:0;font-family:Montserrat,sans-serif;font-size:13px;line-height:1.7;}'+
      '.lpb-locstory--graphite .lpb-locstory__hours{color:#FEFCF8;}'+
      '.lpb-locstory--ivory .lpb-locstory__hours,.lpb-locstory--white .lpb-locstory__hours{color:#2C2C2C;}'+
      '.lpb-locstory__chip{position:absolute;top:16px;right:16px;font-family:Montserrat,sans-serif;font-size:9px;letter-spacing:.12em;font-weight:700;text-transform:uppercase;padding:4px 8px;border-radius:2px;color:#FFFFFF;}'+
      '.lpb-locstory__chip--open{background:#16A34A;animation:lpbLocBreathe 2s ease-in-out infinite;}'+
      '.lpb-locstory__chip--closed{background:#6E6E76;}'+
      '@keyframes lpbLocBreathe{0%,100%{opacity:1;}50%{opacity:.7;}}'+
      '.lpb-locstory__chips{display:flex;flex-wrap:wrap;gap:6px;margin:.25rem 0 1rem;}'+
      '.lpb-locstory__pill{display:inline-block;font-family:Montserrat,sans-serif;font-size:11px;font-weight:500;padding:4px 10px;border:1px solid rgba(200,169,126,.4);color:#C8A97E;border-radius:999px;line-height:1.4;}'+
      '.lpb-locstory__cta{display:block;width:100%;text-align:center;background:#C8A97E;color:#2C2C2C;font-family:Montserrat,sans-serif;font-size:13px;font-weight:600;letter-spacing:.04em;text-decoration:none;padding:12px 16px;border-radius:3px;transition:opacity 200ms ease;}'+
      '.lpb-locstory__cta:hover{opacity:.92;}'+
      '@media(prefers-reduced-motion:reduce){'+
        '.lpb-locstory__card{opacity:1;transform:none;transition:none;}'+
        '.lpb-locstory__rule{transform:scaleX(1);transition:none;}'+
        '.lpb-locstory__chip--open{animation:none;}'+
      '}';
    var style = document.createElement('style');
    style.id = CSS_ID;
    style.type = 'text/css';
    style.appendChild(document.createTextNode(css));
    (document.head || document.documentElement).appendChild(style);
  }

  var ICON_PIN = '<svg class="lpb-locstory__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
  var ICON_CLOCK = '<svg class="lpb-locstory__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>';
  var ICON_NAV = '<svg class="lpb-locstory__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polygon points="3 11 22 2 13 21 11 13 3 11"/></svg>';

  function isOpenNow(d){
    var date = d || new Date();
    var day = date.getDay(); // 0=Sun, 6=Sat
    var minutes = date.getHours() * 60 + date.getMinutes();
    // Clinica Mirian de Paula · Seg-Sex 8h-20h · Sab 8h-14h · Dom fechado
    if (day >= 1 && day <= 5){
      return minutes >= 8*60 && minutes < 20*60;
    }
    if (day === 6){
      return minutes >= 8*60 && minutes < 14*60;
    }
    return false;
  }

  function chipHTML(open){
    if (open){
      return '<span class="lpb-locstory__chip lpb-locstory__chip--open" data-lpb-loc-chip>ABERTO AGORA</span>';
    }
    return '<span class="lpb-locstory__chip lpb-locstory__chip--closed" data-lpb-loc-chip>FECHADO</span>';
  }

  function render(block){
    injectCSS();
    var p = _props(block);
    var open = isOpenNow();
    var html = ''+
      '<section class="lpb-locstory lpb-locstory--'+_esc(p.bg)+'" data-lpb-block="location-story">'+
        '<div class="lpb-locstory__inner">'+
          '<header class="lpb-locstory__head">'+
            '<p class="lpb-locstory__eyebrow">'+_esc(p.eyebrow)+'</p>'+
            '<h2 class="lpb-locstory__title">'+_esc(p.titulo)+'</h2>'+
          '</header>'+
          '<div class="lpb-locstory__cards">'+
            '<article class="lpb-locstory__card" data-lpb-loc-card data-delay="0">'+
              ICON_PIN+
              '<h3 class="lpb-locstory__cardtitle">Endereço</h3>'+
              '<span class="lpb-locstory__rule" aria-hidden="true"></span>'+
              '<p class="lpb-locstory__body">'+_nl2br(p.address)+'</p>'+
            '</article>'+
            '<article class="lpb-locstory__card" data-lpb-loc-card data-delay="200" data-lpb-loc-hours-card>'+
              chipHTML(open)+
              ICON_CLOCK+
              '<h3 class="lpb-locstory__cardtitle">Horários de Atendimento</h3>'+
              '<span class="lpb-locstory__rule" aria-hidden="true"></span>'+
              '<ul class="lpb-locstory__hours">'+
                '<li>'+_esc(p.hours_weekday)+'</li>'+
                '<li>'+_esc(p.hours_saturday)+'</li>'+
                '<li>'+_esc(p.hours_sunday)+'</li>'+
              '</ul>'+
            '</article>'+
            '<article class="lpb-locstory__card" data-lpb-loc-card data-delay="400">'+
              ICON_NAV+
              '<h3 class="lpb-locstory__cardtitle">Como chegar</h3>'+
              '<span class="lpb-locstory__rule" aria-hidden="true"></span>'+
              '<div class="lpb-locstory__chips">'+
                '<span class="lpb-locstory__pill">'+_esc(p.chip_1)+'</span>'+
                '<span class="lpb-locstory__pill">'+_esc(p.chip_2)+'</span>'+
                '<span class="lpb-locstory__pill">'+_esc(p.chip_3)+'</span>'+
              '</div>'+
              '<a class="lpb-locstory__cta" href="'+_esc(p.whatsapp_url)+'" target="_blank" rel="noopener noreferrer">'+_esc(p.whatsapp_label)+'</a>'+
            '</article>'+
          '</div>'+
        '</div>'+
      '</section>';
    return html;
  }

  function bind(rootEl){
    if (!rootEl) return;
    injectCSS();

    var cards = rootEl.querySelectorAll('[data-lpb-loc-card]');
    if (!cards || !cards.length) return;

    var reduced = false;
    try {
      reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch(e){ reduced = false; }

    if (reduced || typeof IntersectionObserver === 'undefined'){
      for (var i = 0; i < cards.length; i++){
        cards[i].classList.add('is-in');
      }
    } else {
      var io = new IntersectionObserver(function(entries, obs){
        for (var j = 0; j < entries.length; j++){
          var entry = entries[j];
          if (entry.isIntersecting){
            (function(target){
              var delay = parseInt(target.getAttribute('data-delay') || '0', 10) || 0;
              setTimeout(function(){
                target.classList.add('is-in');
              }, delay);
            })(entry.target);
            obs.unobserve(entry.target);
          }
        }
      }, { threshold: 0.2, rootMargin: '0px 0px -50px 0px' });

      for (var k = 0; k < cards.length; k++){
        io.observe(cards[k]);
      }
    }

    var hoursCard = rootEl.querySelector('[data-lpb-loc-hours-card]');
    if (hoursCard){
      var refresh = function(){
        var stillThere = rootEl.querySelector('[data-lpb-loc-hours-card]');
        if (!stillThere || !document.body.contains(stillThere)){
          if (timer) { clearInterval(timer); timer = null; }
          return;
        }
        var open = isOpenNow();
        var existing = stillThere.querySelector('[data-lpb-loc-chip]');
        var nextHTML = chipHTML(open);
        if (existing){
          var wrap = document.createElement('div');
          wrap.innerHTML = nextHTML;
          var fresh = wrap.firstChild;
          existing.parentNode.replaceChild(fresh, existing);
        }
      };
      var timer = setInterval(refresh, 60000);
    }
  }

  window.LPBBlockLocationStory = Object.freeze({ render: render, bind: bind });
})();
