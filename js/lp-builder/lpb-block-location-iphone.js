;(function(){
  'use strict';
  if (window.LPBBlockLocationIphone) return;

  var CSS_ID = 'lpb-block-location-iphone-css';

  function _esc(s){
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
  }

  // CSS inline · iframe-safe
  var _LPB_CSS_IPHONE = null
  function _buildCSS(){
    if (_LPB_CSS_IPHONE) return _LPB_CSS_IPHONE
    _LPB_CSS_IPHONE = [
      '.lpb-loci-wrap{width:100%;padding:72px 20px;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden;}',
      '.lpb-loci-wrap.bg-graphite{background:#1c1c1e;color:#f5f2ec;}',
      '.lpb-loci-wrap.bg-ivory{background:#f7f3ec;color:#1c1c1e;}',
      '.lpb-loci-wrap.bg-white{background:#ffffff;color:#1c1c1e;}',
      '.lpb-loci-eyebrow{font-family:"Inter",system-ui,sans-serif;font-size:11px;font-weight:600;letter-spacing:3px;text-transform:uppercase;color:#C8A97E;margin:0 0 12px 0;text-align:center;}',
      '.lpb-loci-title{font-family:"Cormorant Garamond","Playfair Display",Georgia,serif;font-weight:400;font-size:34px;line-height:1.15;color:#C8A97E;margin:0 0 40px 0;text-align:center;max-width:520px;letter-spacing:0.3px;}',
      '.lpb-loci-wrap.bg-ivory .lpb-loci-title,.lpb-loci-wrap.bg-white .lpb-loci-title{color:#8E7449;}',
      '.lpb-loci-phone-stage{perspective:1200px;margin-bottom:32px;}',
      '.lpb-loci-phone{width:280px;max-width:100%;background:#1a1a1a;border:8px solid #1a1a1a;border-radius:36px;padding:8px;box-shadow:0 30px 60px -20px rgba(0,0,0,0.55),0 15px 25px -15px rgba(0,0,0,0.4);transform-style:preserve-3d;transform:translateZ(0);transition:transform 0.4s cubic-bezier(0.2,0.8,0.2,1);will-change:transform;}',
      '.lpb-loci-screen{position:relative;background:#f5f5f7;border-radius:28px;overflow:hidden;aspect-ratio:9/19.5;display:flex;flex-direction:column;}',
      '.lpb-loci-notch{position:absolute;top:6px;left:50%;transform:translateX(-50%);width:90px;height:22px;background:#0a0a0a;border-radius:14px;z-index:5;}',
      '.lpb-loci-statusbar{display:flex;justify-content:space-between;align-items:center;padding:10px 22px 4px 22px;font-family:-apple-system,"SF Pro Text","Inter",sans-serif;font-size:13px;font-weight:600;color:#0a0a0a;height:30px;position:relative;z-index:3;}',
      '.lpb-loci-statusbar .lpb-loci-time{margin-right:auto;}',
      '.lpb-loci-statusbar .lpb-loci-icons{display:flex;gap:4px;align-items:center;}',
      '.lpb-loci-statusbar svg{display:block;}',
      '.lpb-loci-search{margin:4px 10px 6px 10px;background:#F2F2F7;border-radius:10px;padding:8px 10px;display:flex;align-items:center;gap:6px;font-family:-apple-system,"SF Pro Text","Inter",sans-serif;font-size:12px;color:#6E6E76;}',
      '.lpb-loci-search svg{flex-shrink:0;}',
      '.lpb-loci-search span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}',
      '.lpb-loci-map{position:relative;flex:1;background:#F5F0E8;overflow:hidden;}',
      '.lpb-loci-map svg.lpb-loci-mapbg{position:absolute;inset:0;width:100%;height:100%;display:block;}',
      '.lpb-loci-pin{position:absolute;top:46%;left:50%;transform:translate(-50%,-100%);z-index:4;}',
      '.lpb-loci-pin-dot{width:18px;height:18px;background:#C8A97E;border-radius:50%;border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.35);position:relative;z-index:3;}',
      '.lpb-loci-ripple{position:absolute;left:50%;top:50%;width:18px;height:18px;margin-left:-9px;margin-top:-9px;border-radius:50%;background:rgba(200,169,126,0.45);z-index:1;animation:lpb-loci-ripple 2.2s ease-out infinite;}',
      '.lpb-loci-ripple.r2{animation-delay:1.1s;}',
      '@keyframes lpb-loci-ripple{0%{transform:scale(1);opacity:0.7;}100%{transform:scale(4);opacity:0;}}',
      '.lpb-loci-pin-label{position:absolute;top:-28px;left:50%;transform:translateX(-50%);background:#fff;padding:4px 8px;border-radius:6px;font-family:-apple-system,"SF Pro Text","Inter",sans-serif;font-size:10px;font-weight:600;color:#1c1c1e;white-space:nowrap;box-shadow:0 2px 6px rgba(0,0,0,0.18);}',
      '.lpb-loci-pin-label::after{content:"";position:absolute;bottom:-4px;left:50%;transform:translateX(-50%) rotate(45deg);width:6px;height:6px;background:#fff;}',
      '.lpb-loci-sheet{background:#fff;border-top-left-radius:16px;border-top-right-radius:16px;padding:12px 14px 14px 14px;box-shadow:0 -4px 12px rgba(0,0,0,0.08);position:relative;z-index:2;}',
      '.lpb-loci-sheet-handle{width:36px;height:4px;background:#d1d1d6;border-radius:2px;margin:0 auto 8px auto;}',
      '.lpb-loci-sheet-name{font-family:-apple-system,"SF Pro Display","Inter",sans-serif;font-size:14px;font-weight:700;color:#1c1c1e;line-height:1.2;margin:0 0 4px 0;}',
      '.lpb-loci-sheet-rating{display:flex;align-items:center;gap:4px;margin:0 0 4px 0;font-family:-apple-system,"SF Pro Text","Inter",sans-serif;font-size:10px;color:#6E6E76;}',
      '.lpb-loci-stars{display:inline-flex;gap:1px;}',
      '.lpb-loci-stars svg{display:block;}',
      '.lpb-loci-sheet-addr{font-family:-apple-system,"SF Pro Text","Inter",sans-serif;font-size:10px;color:#6E6E76;margin:0 0 8px 0;}',
      '.lpb-loci-chip{display:inline-block;background:rgba(52,199,89,0.12);color:#248A3D;font-family:-apple-system,"SF Pro Text","Inter",sans-serif;font-size:10px;font-weight:600;padding:3px 8px;border-radius:10px;margin-bottom:10px;}',
      '.lpb-loci-sheet-btns{display:flex;gap:6px;}',
      '.lpb-loci-sheet-btn{flex:1;text-align:center;padding:7px 6px;border-radius:8px;font-family:-apple-system,"SF Pro Text","Inter",sans-serif;font-size:11px;font-weight:600;}',
      '.lpb-loci-sheet-btn.primary{background:#007AFF;color:#fff;}',
      '.lpb-loci-sheet-btn.secondary{background:#F2F2F7;color:#1c1c1e;}',
      '.lpb-loci-cta{display:inline-flex;align-items:center;justify-content:center;gap:8px;width:280px;max-width:100%;padding:14px 20px;background:#C8A97E;color:#1c1c1e;border:0;border-radius:999px;font-family:"Inter",system-ui,sans-serif;font-weight:600;font-size:14px;letter-spacing:0.4px;text-decoration:none;cursor:pointer;transition:transform 0.2s ease,box-shadow 0.2s ease,background 0.2s ease;box-shadow:0 8px 20px -8px rgba(200,169,126,0.55);}',
      '.lpb-loci-cta:hover{transform:translateY(-1px);background:#d4b78c;box-shadow:0 12px 24px -8px rgba(200,169,126,0.7);}',
      '.lpb-loci-cta:active{transform:translateY(0);}',
      '@media (max-width: 420px){.lpb-loci-title{font-size:28px;}.lpb-loci-phone{width:240px;}}',
      '@media (prefers-reduced-motion: reduce){.lpb-loci-phone{transition:none!important;transform:none!important;}.lpb-loci-ripple{animation:none!important;display:none!important;}.lpb-loci-cta{transition:none!important;}}'
    ].join('')
    return _LPB_CSS_IPHONE
  }

  function _statusBarSVG(){
    return [
      '<div class="lpb-loci-statusbar">',
        '<span class="lpb-loci-time">9:41</span>',
        '<span class="lpb-loci-icons">',
          // signal
          '<svg width="16" height="10" viewBox="0 0 16 10" aria-hidden="true"><rect x="0" y="6" width="3" height="4" rx="0.5" fill="#0a0a0a"/><rect x="4" y="4" width="3" height="6" rx="0.5" fill="#0a0a0a"/><rect x="8" y="2" width="3" height="8" rx="0.5" fill="#0a0a0a"/><rect x="12" y="0" width="3" height="10" rx="0.5" fill="#0a0a0a"/></svg>',
          // wifi
          '<svg width="15" height="11" viewBox="0 0 15 11" aria-hidden="true"><path d="M7.5 0C4.6 0 2 1 0 2.8l1.3 1.5C2.9 2.9 5.1 2 7.5 2s4.6.9 6.2 2.3L15 2.8C13 1 10.4 0 7.5 0zm0 3.6c-2 0-3.9.7-5.3 1.9L3.5 7c1.1-.9 2.5-1.5 4-1.5s2.9.6 4 1.5l1.3-1.5c-1.4-1.2-3.3-1.9-5.3-1.9zM7.5 7.2c-1.1 0-2.1.4-2.9 1.1L7.5 11l2.9-2.7c-.8-.7-1.8-1.1-2.9-1.1z" fill="#0a0a0a"/></svg>',
          // battery
          '<svg width="24" height="11" viewBox="0 0 24 11" aria-hidden="true"><rect x="0.5" y="0.5" width="21" height="10" rx="2.5" fill="none" stroke="#0a0a0a" stroke-opacity="0.5"/><rect x="22" y="3.5" width="1.5" height="4" rx="0.5" fill="#0a0a0a" fill-opacity="0.5"/><rect x="2" y="2" width="18" height="7" rx="1.5" fill="#0a0a0a"/></svg>',
        '</span>',
      '</div>'
    ].join('');
  }

  function _searchBarSVG(clinicName){
    return [
      '<div class="lpb-loci-search">',
        '<svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><circle cx="5" cy="5" r="3.5" fill="none" stroke="#6E6E76" stroke-width="1.3"/><line x1="7.5" y1="7.5" x2="11" y2="11" stroke="#6E6E76" stroke-width="1.3" stroke-linecap="round"/></svg>',
        '<span>', _esc(clinicName), '</span>',
      '</div>'
    ].join('');
  }

  function _mapSVG(){
    // Apple Maps style simplified
    return [
      '<svg class="lpb-loci-mapbg" viewBox="0 0 200 260" preserveAspectRatio="xMidYMid slice" aria-hidden="true">',
        '<rect width="200" height="260" fill="#F5F0E8"/>',
        // park (green area)
        '<path d="M 20 180 Q 40 160 70 170 Q 85 185 75 210 Q 55 230 30 220 Q 15 205 20 180 Z" fill="#C5E0B4" opacity="0.85"/>',
        // secondary street
        '<path d="M -10 60 Q 50 80 100 70 Q 150 60 210 90" stroke="#FFFFFF" stroke-width="10" fill="none" stroke-linecap="round"/>',
        // main street (horizontal curve)
        '<path d="M -10 140 Q 60 120 120 135 Q 170 148 210 130" stroke="#FFFFFF" stroke-width="14" fill="none" stroke-linecap="round"/>',
        // vertical street
        '<path d="M 130 -10 Q 120 80 128 140 Q 134 200 125 270" stroke="#FFFFFF" stroke-width="11" fill="none" stroke-linecap="round"/>',
        // small diagonal
        '<path d="M 40 260 Q 80 220 95 180 Q 105 155 100 130" stroke="#FFFFFF" stroke-width="7" fill="none" stroke-linecap="round"/>',
        // building blocks subtle
        '<rect x="145" y="170" width="40" height="30" rx="2" fill="#EBE3D3"/>',
        '<rect x="155" y="205" width="35" height="28" rx="2" fill="#EBE3D3"/>',
        '<rect x="15" y="85" width="32" height="24" rx="2" fill="#EBE3D3"/>',
      '</svg>'
    ].join('');
  }

  function _starsSVG(){
    var s = '';
    for (var i=0;i<5;i++){
      s += '<svg width="9" height="9" viewBox="0 0 10 10" aria-hidden="true"><polygon points="5,0.5 6.3,3.8 9.8,3.9 7,6.1 8,9.5 5,7.5 2,9.5 3,6.1 0.2,3.9 3.7,3.8" fill="#C8A97E"/></svg>';
    }
    return s;
  }

  function _bottomSheet(p){
    return [
      '<div class="lpb-loci-sheet">',
        '<div class="lpb-loci-sheet-handle"></div>',
        '<div class="lpb-loci-sheet-name">', _esc(p.clinic_name), '</div>',
        '<div class="lpb-loci-sheet-rating">',
          '<span class="lpb-loci-stars">', _starsSVG(), '</span>',
          '<span>', _esc(p.rating), ' (', _esc(p.reviews_count), ' avaliações)</span>',
        '</div>',
        '<div class="lpb-loci-sheet-addr">', _esc(p.address), '</div>',
        '<div class="lpb-loci-chip">', _esc(p.open_status), '</div>',
        '<div class="lpb-loci-sheet-btns">',
          '<div class="lpb-loci-sheet-btn primary">Como chegar</div>',
          '<div class="lpb-loci-sheet-btn secondary">Salvar</div>',
        '</div>',
      '</div>'
    ].join('');
  }

  function _mergeProps(block){
    var p = (block && block.props) ? block.props : {};
    return {
      bg: p.bg || 'graphite',
      eyebrow: p.eyebrow || 'LOCALIZAÇÃO',
      titulo: p.titulo || 'Veja onde estamos',
      clinic_name: p.clinic_name || 'Clínica Mirian de Paula',
      address: p.address || 'Av. Brasil, 4242 · Maringá/PR',
      rating: p.rating || '5,0',
      reviews_count: p.reviews_count || '127',
      open_status: p.open_status || 'Aberto · Fecha às 19h',
      maps_url: p.maps_url || 'https://maps.google.com/?q=Clinica+Mirian+Paula',
      ios_maps_url: p.ios_maps_url || 'maps://?q=Clinica+Mirian+Paula',
      android_geo_url: p.android_geo_url || 'geo:0,0?q=Clinica+Mirian+Paula',
      cta_label: p.cta_label || 'Abrir no meu Maps'
    };
  }

  function render(block){
    var p = _mergeProps(block);
    var bgClass = 'bg-' + (['graphite','ivory','white'].indexOf(p.bg) >= 0 ? p.bg : 'graphite');

    return [
      '<style data-lpb-style="location-iphone">' + _buildCSS() + '</style>',
      '<section class="lpb-loci-wrap ', bgClass, '" data-lpb-block="location-iphone">',
        '<div class="lpb-loci-phone-stage">',
          '<div class="lpb-loci-phone" data-lpb-loci-phone>',
            '<div class="lpb-loci-screen">',
              '<div class="lpb-loci-notch"></div>',
              _statusBarSVG(),
              _searchBarSVG(p.clinic_name),
              '<div class="lpb-loci-map">',
                _mapSVG(),
                '<div class="lpb-loci-pin">',
                  '<div class="lpb-loci-pin-label">', _esc(p.clinic_name.split(' ').slice(0,2).join(' ')), '</div>',
                  '<div class="lpb-loci-ripple"></div>',
                  '<div class="lpb-loci-ripple r2"></div>',
                  '<div class="lpb-loci-pin-dot"></div>',
                '</div>',
              '</div>',
              _bottomSheet(p),
            '</div>',
          '</div>',
        '</div>',
        '<p class="lpb-loci-eyebrow">', _esc(p.eyebrow), '</p>',
        '<h2 class="lpb-loci-title">', _esc(p.titulo), '</h2>',
        '<a class="lpb-loci-cta" data-lpb-loci-cta ',
          'data-url-default="', _esc(p.maps_url), '" ',
          'data-url-ios="', _esc(p.ios_maps_url), '" ',
          'data-url-android="', _esc(p.android_geo_url), '" ',
          'href="', _esc(p.maps_url), '" target="_blank" rel="noopener">',
          '<svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1C5.24 1 3 3.24 3 6c0 3.75 5 9 5 9s5-5.25 5-9c0-2.76-2.24-5-5-5zm0 7a2 2 0 110-4 2 2 0 010 4z" fill="currentColor"/></svg>',
          _esc(p.cta_label),
        '</a>',
      '</section>'
    ].join('');
  }

  function _detectPlatform(){
    var ua = (navigator.userAgent || navigator.vendor || '').toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    // iPadOS 13+ desktop mode
    if (/mac/.test(ua) && typeof document !== 'undefined' && 'ontouchend' in document) return 'ios';
    if (/android/.test(ua)) return 'android';
    return 'desktop';
  }

  function _prefersReducedMotion(){
    try { return window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches; }
    catch(e){ return false; }
  }

  function bind(rootEl){
    if (!rootEl) return;
    var phone = rootEl.querySelector ? rootEl.querySelector('[data-lpb-loci-phone]') : null;
    var cta = rootEl.querySelector ? rootEl.querySelector('[data-lpb-loci-cta]') : null;

    // CTA platform detection
    if (cta){
      var plat = _detectPlatform();
      var href = cta.getAttribute('data-url-default') || '#';
      if (plat === 'ios'){
        href = cta.getAttribute('data-url-ios') || href;
      } else if (plat === 'android'){
        href = cta.getAttribute('data-url-android') || href;
      }
      cta.setAttribute('href', href);
    }

    if (!phone) return;
    if (_prefersReducedMotion()) return;

    var targetX = 0, targetY = 0;
    var curX = 0, curY = 0;
    var rafId = null;
    var isHovering = false;
    var MAX = 8;

    function loop(){
      curX += (targetX - curX) * 0.12;
      curY += (targetY - curY) * 0.12;
      phone.style.transform = 'translateZ(0) perspective(1200px) rotateX(' + curY.toFixed(2) + 'deg) rotateY(' + curX.toFixed(2) + 'deg)';
      if (isHovering || Math.abs(targetX - curX) > 0.05 || Math.abs(targetY - curY) > 0.05){
        rafId = requestAnimationFrame(loop);
      } else {
        rafId = null;
        phone.style.transform = 'translateZ(0)';
      }
    }

    function onMove(e){
      var rect = phone.getBoundingClientRect();
      var cx = e.clientX - rect.left;
      var cy = e.clientY - rect.top;
      var px = (cx / rect.width) - 0.5;
      var py = (cy / rect.height) - 0.5;
      targetX = px * (MAX * 2);
      targetY = -py * (MAX * 2);
      isHovering = true;
      if (!rafId) rafId = requestAnimationFrame(loop);
    }

    function onLeave(){
      isHovering = false;
      targetX = 0;
      targetY = 0;
      if (!rafId) rafId = requestAnimationFrame(loop);
    }

    function onTouchStart(){
      targetX = 0;
      targetY = -5;
      isHovering = true;
      if (!rafId) rafId = requestAnimationFrame(loop);
    }

    function onTouchEnd(){
      isHovering = false;
      targetX = 0;
      targetY = 0;
      if (!rafId) rafId = requestAnimationFrame(loop);
    }

    phone.addEventListener('mousemove', onMove);
    phone.addEventListener('mouseleave', onLeave);
    phone.addEventListener('touchstart', onTouchStart, { passive: true });
    phone.addEventListener('touchend', onTouchEnd, { passive: true });
    phone.addEventListener('touchcancel', onTouchEnd, { passive: true });
  }

  window.LPBBlockLocationIphone = Object.freeze({ render: render, bind: bind });
})();
