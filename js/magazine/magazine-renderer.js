/* ============================================================================
 * Beauty & Health Magazine — Render Engine
 * ----------------------------------------------------------------------------
 * Dado (templateSlug, slots), devolve HTML renderizado usando as classes de
 * /css/magazine-pages.css. Usado pelo admin (preview) e pelo leitor publico.
 *
 * Uso:
 *   MagazineRenderer.render('t07_feature_double', { titulo: '...', ... })
 *
 * Fallback: se slug desconhecido, renderiza preview generico com titulo/lede.
 * ============================================================================ */
;(function () {
  'use strict'

  function esc(s) {
    if (s == null) return ''
    return String(s).replace(/[&<>"']/g, c => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[c]))
  }

  function asArray(v) {
    if (Array.isArray(v)) return v
    if (v == null) return []
    if (typeof v === 'string') {
      const t = v.trim()
      if (!t) return []
      try { const p = JSON.parse(t); return Array.isArray(p) ? p : [] } catch (e) { return [] }
    }
    return []
  }

  function normalizeUrl(url) {
    if (!url) return ''
    // Google Drive share -> direct view URL
    // https://drive.google.com/file/d/<ID>/view?... -> https://drive.google.com/uc?export=view&id=<ID>
    const m = String(url).match(/drive\.google\.com\/file\/d\/([A-Za-z0-9_-]+)/)
    if (m) return 'https://drive.google.com/uc?export=view&id=' + m[1]
    // Dropbox share -> direct
    if (/dropbox\.com\//.test(url) && !/\?raw=1|&raw=1/.test(url)) {
      return url.replace(/(\?.*)?$/, (q) => (q ? q + '&raw=1' : '?raw=1'))
    }
    return url
  }

  function photo(url, cls, label) {
    cls = cls || ''
    const src = normalizeUrl(url)
    if (src) {
      return `<div class="mp-photo-slot ${cls}"><img class="mp-img" src="${esc(src)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.classList.add('empty');this.remove();" data-label="${esc(label || '')}"/></div>`
    }
    return `<div class="mp-photo-slot empty ${cls}" data-label="${esc(label || 'FOTO')}"></div>`
  }

  function emify(text) {
    // substitui *palavra* por <em>palavra</em>
    if (!text) return ''
    return esc(text).replace(/\*([^*]+)\*/g, '<em>$1</em>')
  }

  const R = {}

  // ---------------------------------------------------------- t01 cover dark
  R.t01_cover_hero_dark = (s) => `
    <div class="mp mp-t01">
      <div class="head">
        <div class="spacer-left"></div>
        <div class="brand-stack">
          ${s.dedicatoria ? `<div class="dedicatoria">${esc(s.dedicatoria)}</div>` : ''}
          <h1 class="brand">Beauty &amp; Health</h1>
        </div>
        <div class="edition-label">${esc(s.edicao_label || 'Edição')}</div>
      </div>
      <div class="body">
        <div class="visual">${photo(s.foto_hero, '', 'FOTO HERO')}</div>
        <div class="txt">
          ${s.tag ? `<div class="tag">${esc(s.tag)}</div>` : ''}
          <h2>${emify(s.titulo || 'Título da capa')}</h2>
          ${s.subtitulo ? `<p>${esc(s.subtitulo)}</p>` : ''}
        </div>
      </div>
    </div>
  `

  // ---------------------------------------------------------- t02 cover light
  R.t02_cover_hero_light = (s) => `
    <div class="mp mp-t02">
      <div class="head">Beauty &amp; Health</div>
      ${s.dedicatoria ? `<div class="dedicatoria">${esc(s.dedicatoria)}</div>` : ''}
      <div class="body">
        <div class="visual">${photo(s.foto_hero, '', 'FOTO HERO')}</div>
        <div class="txt">
          <h2>${emify(s.titulo || 'Título da capa')}</h2>
          ${s.subtitulo ? `<p>${esc(s.subtitulo)}</p>` : ''}
        </div>
      </div>
    </div>
  `

  // ---------------------------------------------------------- t03 triptych
  R.t03_cover_triptych = (s) => {
    const cols = [1, 2, 3].map(i => `
      <div class="col">
        ${photo(s['foto_' + i], '', 'FOTO ' + i)}
        <h3>${emify(s['titulo_' + i] || 'Título ' + i)}</h3>
      </div>`).join('')
    return `<div class="mp mp-t03">${cols}</div>`
  }

  // ---------------------------------------------------------- t04 toc
  R.t04_toc_editorial = (s) => {
    const items = asArray(s.items).map((it, i) => `
      <div class="item" data-page-id="${esc(it.page_id || '')}">
        <div class="num">${esc(it.num || String(i + 1).padStart(2, '0'))}</div>
        <div class="title">${emify(it.titulo || '')}${it.kicker ? `<span>${esc(it.kicker)}</span>` : ''}</div>
        <div class="page-no">pg ${String(i + 2).padStart(2, '0')}</div>
      </div>`).join('')
    return `
      <div class="mp mp-t04">
        <div class="side">
          ${s.kicker ? `<div class="kicker">${esc(s.kicker)}</div>` : ''}
          <h1>${emify(s.titulo || 'Nesta edição')}</h1>
          ${s.lede ? `<p>${esc(s.lede)}</p>` : ''}
        </div>
        <div class="list">${items || '<div style="color:var(--mp-muted);font-style:italic;padding:20px 0;">Adicione itens em JSON: [{num,titulo,kicker}]</div>'}</div>
      </div>`
  }

  // ---------------------------------------------------------- t05 editorial
  R.t05_editorial_letter = (s) => {
    const body = (s.corpo || '').split(/\n\n+/).map(p => `<p>${esc(p.trim())}</p>`).join('')
    return `
      <div class="mp mp-t05">
        <div class="portrait">${photo(s.foto_autora, '', 'DRA. FERNANDA')}</div>
        <div class="content">
          <div class="mp-kicker">Carta editorial</div>
          <h1>${emify(s.titulo || 'Uma palavra da diretora')}</h1>
          <div class="corpo">${body || '<p>Corpo do texto…</p>'}</div>
          ${s.assinatura ? `<div class="signature">${esc(s.assinatura)}</div>` : ''}
        </div>
      </div>`
  }

  // ---------------------------------------------------------- t06 back
  R.t06_back_cta = (s) => {
    const contatos = asArray(s.contatos)
    const blocks = contatos.length
      ? contatos.map(c => `<div class="block"><div class="k">${esc(c.label || c.tipo || '')}</div><div class="v">${esc(c.valor || c.value || '')}</div></div>`).join('')
      : `<div class="block"><div class="k">WhatsApp</div><div class="v">—</div></div>`
    return `
      <div class="mp mp-t06">
        <div class="head">
          <div class="logo">Beauty &amp; Health</div>
          ${s.proxima_edicao ? `<div class="next">Próxima: ${esc(s.proxima_edicao)}</div>` : ''}
        </div>
        <div class="main">
          <div>
            <h1>${emify(s.titulo || 'Até a próxima edição')}</h1>
            ${s.cta_texto ? `<a class="cta-btn" href="${esc(s.cta_link || '#')}">${esc(s.cta_texto)}</a>` : ''}
          </div>
          <div class="info">${blocks}</div>
        </div>
        <div class="foot"><span>Beauty &amp; Health</span><span>beleza que é cuidado</span></div>
      </div>`
  }

  // ---------------------------------------------------------- t07 feature double
  R.t07_feature_double = (s) => {
    const corpoHtml = (s.corpo || '').split(/\n\n+/).filter(Boolean).map(p => `<p>${esc(p.trim())}</p>`).join('')
    return `
      <div class="mp mp-t07">
        <div class="visual">${photo(s.foto_hero, '', 'FOTO MATÉRIA')}</div>
        <div class="content">
          ${s.kicker ? `<div class="mp-kicker">${esc(s.kicker)}</div>` : ''}
          <h1>${emify(s.titulo || 'Título da matéria')}</h1>
          ${s.lede ? `<div class="lede">${esc(s.lede)}</div>` : ''}
          <div class="columns">${corpoHtml || '<p>Corpo do texto…</p>'}</div>
          ${s.byline ? `<div class="byline">${/^por\s/i.test(s.byline.trim()) ? esc(s.byline) : 'Por ' + esc(s.byline)}</div>` : ''}
        </div>
      </div>`
  }

  // ---------------------------------------------------------- t08 fullbleed
  R.t08_feature_fullbleed = (s) => `
    <div class="mp mp-t08">
      <div class="bg">${photo(s.foto_full, '', 'FOTO FULL')}</div>
      <div class="overlay" style="${s.overlay_color ? 'background:linear-gradient(180deg,transparent 30%,' + esc(s.overlay_color) + ' 100%);' : ''}"></div>
      <div class="txt">
        <h1>${emify(s.titulo || 'Título full bleed')}</h1>
        ${s.lede ? `<p>${esc(s.lede)}</p>` : ''}
      </div>
    </div>`

  // ---------------------------------------------------------- t09 triptych feature
  R.t09_feature_triptych = (s) => `
    <div class="mp mp-t09">
      <div class="side">${photo(s.foto_1, '', 'FOTO 1')}${s.legenda_1 ? `<div class="legenda">${esc(s.legenda_1)}</div>` : ''}</div>
      <div class="middle"><p>${emify(s.texto_central || 'Texto central…')}</p></div>
      <div class="side">${photo(s.foto_2, '', 'FOTO 2')}${s.legenda_2 ? `<div class="legenda">${esc(s.legenda_2)}</div>` : ''}</div>
    </div>`

  // ---------------------------------------------------------- t10 interview
  R.t10_interview = (s) => {
    const qas = asArray(s.qas).map(x => `
      <div class="qa">
        <div class="q">${esc(x.q || '')}</div>
        <div class="a">${esc(x.a || '')}</div>
      </div>`).join('')
    return `
      <div class="mp mp-t10">
        <div class="portrait">
          ${photo(s.foto_entrevistado, '', 'FOTO ENTREVISTA')}
          <div class="name">${esc(s.nome || '—')}${s.titulo_prof ? `<span>${esc(s.titulo_prof)}</span>` : ''}</div>
        </div>
        <div class="content">
          <div class="mp-kicker">Entrevista</div>
          <h1>${emify(s.titulo || 'Conversa com quem entende')}</h1>
          <div class="qa-list">${qas || '<div style="color:var(--mp-muted);font-style:italic;">Adicione perguntas: [{q:"…",a:"…"}]</div>'}</div>
        </div>
      </div>`
  }

  // ---------------------------------------------------------- t11 product
  R.t11_product_highlight = (s) => {
    const benef = asArray(s.beneficios).map(b => `<li>${esc(typeof b === 'string' ? b : (b.texto || b.label || ''))}</li>`).join('')
    return `
      <div class="mp mp-t11">
        <div class="visual">${photo(s.foto, '', 'PRODUTO')}</div>
        <div class="content">
          <div class="mp-kicker">Tratamento em destaque</div>
          <h1>${emify(s.titulo || 'Nome do tratamento')}</h1>
          ${s.subtitulo ? `<div class="sub">${esc(s.subtitulo)}</div>` : ''}
          <ul>${benef || '<li>Adicione benefícios (JSON array)</li>'}</ul>
          ${s.preco_sugerido ? `<div class="price">${esc(s.preco_sugerido)}</div>` : ''}
          ${s.cta ? `<a class="cta" href="#">${esc(s.cta)}</a>` : ''}
        </div>
      </div>`
  }

  // ---------------------------------------------------------- t12 before/after
  R.t12_before_after_pair = (s) => {
    const stats = asArray(s.stats).map(st => `<div class="stat"><div class="k">${esc(st.valor || st.k || '')}</div><div class="l">${esc(st.label || st.l || '')}</div></div>`).join('')
    return `
      <div class="mp mp-t12">
        <div class="head">
          <h1>${emify(s.titulo || 'Antes &amp; Depois')}</h1>
          <div class="meta">${esc(s.meta || '')}</div>
        </div>
        <div class="pair">
          <div class="photo antes"><div class="label">Antes</div>${photo(s.foto_antes, '', 'ANTES')}</div>
          <div class="photo after"><div class="label">Depois</div>${photo(s.foto_depois, '', 'DEPOIS')}</div>
        </div>
        <div class="stats">${stats}</div>
      </div>`
  }

  // ---------------------------------------------------------- t13 quad
  R.t13_before_after_quad = (s) => {
    const caseBox = (c, label) => c ? `
      <div class="case">
        <div class="label">${esc(label)} · ${esc(c.label || '')}</div>
        <div class="photo antes"><div class="tag">Antes</div>${photo(c.antes, '', 'ANTES')}</div>
        <div class="photo depois"><div class="tag">Depois</div>${photo(c.depois, '', 'DEPOIS')}</div>
      </div>` : `<div class="case"><div class="label">${esc(label)}</div></div>`
    return `<div class="mp mp-t13">${caseBox(s.caso_1, 'Caso 1')}${caseBox(s.caso_2, 'Caso 2')}</div>`
  }

  // ---------------------------------------------------------- t14 mosaic
  R.t14_mosaic_gallery = (s) => {
    const fotos = asArray(s.fotos)
    const tiles = fotos.slice(0, 5).map(f => `<div class="tile">${photo(typeof f === 'string' ? f : (f.url || ''), '', '')}</div>`).join('')
    return `
      <div class="mp mp-t14">
        <h1>${emify(s.titulo || 'Galeria')}</h1>
        <div class="grid">${tiles || '<div class="tile"></div><div class="tile"></div><div class="tile"></div>'}</div>
        ${s.legenda ? `<div class="legenda">${esc(s.legenda)}</div>` : ''}
      </div>`
  }

  // ---------------------------------------------------------- t15 timeline
  R.t15_evolution_timeline = (s) => {
    const marks = asArray(s.marcos).map(m => `
      <div class="marker">
        <div class="photo">${photo(m.foto, '', '')}</div>
        <div class="data">${esc(m.data || '')}</div>
        <div class="legenda">${esc(m.legenda || '')}</div>
      </div>`).join('')
    return `
      <div class="mp mp-t15">
        <h1>${emify(s.titulo || 'Evolução')}</h1>
        <div class="timeline">${marks || '<div style="color:var(--mp-muted);font-style:italic;">Adicione marcos: [{data,foto,legenda}]</div>'}</div>
      </div>`
  }

  // ---------------------------------------------------------- t16 quiz CTA
  R.t16_quiz_cta = (s) => {
    const rewards = asArray(s.recompensas).map((r, i) => `
      <div class="reward">
        <div class="icon">${esc(String.fromCharCode(9733))}</div>
        <div class="txt"><h3>${esc(r.titulo || r.nome || 'Recompensa ' + (i + 1))}</h3><p>${esc(r.descricao || r.desc || '')}</p></div>
      </div>`).join('')
    const quizLink = s.quiz_slug ? `quiz-render.html?q=${esc(s.quiz_slug)}` : '#'
    return `
      <div class="mp mp-t16">
        <div class="side left">
          <div class="mp-kicker">Quiz interativo</div>
          <h1>${emify(s.titulo || 'Descubra seu perfil')}</h1>
          ${s.lede ? `<p>${esc(s.lede)}</p>` : ''}
          <a class="cta-btn" href="${quizLink}" target="_blank">Começar →</a>
        </div>
        <div class="side right">
          <div class="rewards">${rewards || '<div style="opacity:0.7;font-size:13px;">Defina recompensas (JSON array)</div>'}</div>
        </div>
      </div>`
  }

  // ---------------------------------------------------------- t17 poll
  R.t17_poll = (s) => {
    const opts = asArray(s.opcoes).map(o => {
      const label = typeof o === 'string' ? o : (o.texto || o.label || '')
      const pct = typeof o === 'object' && o.pct != null ? o.pct + '%' : ''
      const barW = typeof o === 'object' && o.pct != null ? o.pct + '%' : '0%'
      return `<button class="option">
        <div class="bar" style="width:${esc(barW)}"></div>
        <span>${esc(label)}</span>
        ${pct ? `<span class="pct">${esc(pct)}</span>` : ''}
      </button>`
    }).join('')
    return `
      <div class="mp mp-t17">
        <h1>${emify(s.pergunta || 'Sua opinião conta')}</h1>
        <div class="options">${opts || '<div style="color:var(--mp-muted);font-style:italic;">Adicione opções (JSON array)</div>'}</div>
      </div>`
  }

  // ---------------------------------------------------------- t18 stat
  R.t18_stat_feature = (s) => `
    <div class="mp mp-t18">
      <div class="big">
        <div class="numero">${esc(s.numero || s.stat || '93%')}</div>
        <h1>${emify(s.titulo || 'dado importante sobre o tratamento')}</h1>
      </div>
      <div class="foot">${esc(s.fonte || s.footnote || 'Fonte: estudo interno')}</div>
    </div>`

  // ---------------------------------------------------------- t19 ritual
  R.t19_ritual_steps = (s) => {
    const steps = asArray(s.passos).map((p, i) => `
      <div class="step">
        <div class="num">${String(i + 1).padStart(2, '0')}</div>
        <h3>${esc(p.titulo || p.nome || 'Passo ' + (i + 1))}</h3>
        <p>${esc(p.descricao || p.desc || '')}</p>
      </div>`).join('')
    return `
      <div class="mp mp-t19">
        <h1>${emify(s.titulo || 'Ritual diário')}</h1>
        <div class="steps">${steps || '<div style="color:var(--mp-muted);font-style:italic;">Defina passos (JSON array)</div>'}</div>
      </div>`
  }

  // ---------------------------------------------------------- t20 myth/fact
  R.t20_myth_vs_fact = (s) => {
    const pairs = asArray(s.pares).map(p => `
      <div class="pair">
        <div class="myth"><div class="tag">Mito</div><p>${esc(p.mito || p.myth || '')}</p></div>
        <div class="fact"><div class="tag">Fato</div><p>${esc(p.fato || p.fact || '')}</p></div>
      </div>`).join('')
    return `
      <div class="mp mp-t20">
        <h1>${emify(s.titulo || 'Mitos &amp; fatos')}</h1>
        <div class="pairs">${pairs || '<div style="color:var(--mp-muted);font-style:italic;">Adicione pares (JSON array)</div>'}</div>
      </div>`
  }

  // ---------------------------------------------------------- t21 product photo split
  R.t21_product_photo_split = (s) => `
    <div class="mp mp-t21">
      <div class="head">
        <div class="kicker">${esc(s.kicker || 'EM DESTAQUE')}</div>
      </div>
      <div class="photos">
        <div class="photo-block">
          <div class="frame">${photo(s.foto_principal, '', 'FOTO PRINCIPAL').replace('mp-photo-slot ', 'mp-photo-slot frame ')}</div>
          ${s.legenda_principal ? `<div class="legenda">${esc(s.legenda_principal)}</div>` : ''}
        </div>
        <div class="photo-block">
          <div class="frame">${photo(s.foto_detalhe, '', 'FOTO DETALHE').replace('mp-photo-slot ', 'mp-photo-slot frame ')}</div>
          ${s.legenda_detalhe ? `<div class="legenda">${esc(s.legenda_detalhe)}</div>` : ''}
        </div>
      </div>
      <div class="product-name">
        <h1>${emify(s.nome_produto || 'Nome do Produto')}</h1>
        ${s.tagline ? `<div class="tagline">${esc(s.tagline)}</div>` : ''}
      </div>
    </div>
  `

  // ---------------------------------------------------------- t22 product feature text
  R.t22_product_feature_text = (s) => {
    const corpo = (s.corpo || '').split(/\n\n+/).filter(Boolean)
    let corpoHtml = ''
    if (corpo.length === 0) {
      corpoHtml = '<p>Corpo do texto…</p>'
    } else if (s.destaque && corpo.length >= 2) {
      // pull quote depois do 2º paragrafo
      corpoHtml = corpo.slice(0, 2).map(p => `<p>${esc(p.trim())}</p>`).join('')
        + `<div class="destaque">${esc(s.destaque)}</div>`
        + corpo.slice(2).map(p => `<p>${esc(p.trim())}</p>`).join('')
    } else {
      corpoHtml = corpo.map(p => `<p>${esc(p.trim())}</p>`).join('')
      if (s.destaque) corpoHtml += `<div class="destaque">${esc(s.destaque)}</div>`
    }
    return `
      <div class="mp mp-t22">
        <div class="kicker">${esc(s.kicker || 'EM DESTAQUE')}</div>
        <h1>${emify(s.titulo || 'Título da matéria')}</h1>
        ${s.lede ? `<div class="lede">${esc(s.lede)}</div>` : ''}
        <div class="corpo">${corpoHtml}</div>
        ${s.byline ? `<div class="byline">${esc(s.byline)}</div>` : ''}
      </div>`
  }

  // ---------------------------------------------------------- t25 antes/depois com slider arrastavel
  R.t25_before_after_slider = (s) => {
    const id = 'sl' + Math.random().toString(36).slice(2, 8)
    return `
      <div class="mp mp-t25">
        <div class="head">
          <h1>${emify(s.titulo || 'Antes &amp; *Depois*')}</h1>
          ${s.subtitulo ? `<p class="sub">${esc(s.subtitulo)}</p>` : ''}
        </div>
        <div class="slider-wrap" id="${id}">
          <div class="slider-img depois">${photo(s.foto_depois, '', 'DEPOIS')}</div>
          <div class="slider-img antes" data-side="antes">${photo(s.foto_antes, '', 'ANTES')}</div>
          <div class="slider-handle" data-handle></div>
          <div class="label-antes">ANTES</div>
          <div class="label-depois">DEPOIS</div>
        </div>
        ${s.meta ? `<div class="meta">${esc(s.meta)}</div>` : ''}
        <script>
        (function(){
          var w=document.getElementById('${id}');if(!w)return;
          var antes=w.querySelector('.antes');var handle=w.querySelector('[data-handle]');
          var dragging=false;
          function set(x){var r=w.getBoundingClientRect();var p=Math.max(0,Math.min(1,(x-r.left)/r.width));antes.style.clipPath='inset(0 '+((1-p)*100)+'% 0 0)';handle.style.left=(p*100)+'%';}
          set(w.getBoundingClientRect().width*0.5);
          function down(e){dragging=true;move(e);e.preventDefault();}
          function move(e){if(!dragging)return;var x=e.touches?e.touches[0].clientX:e.clientX;set(x);}
          function up(){dragging=false;}
          w.addEventListener('mousedown',down);w.addEventListener('touchstart',down,{passive:false});
          window.addEventListener('mousemove',move);window.addEventListener('touchmove',move,{passive:true});
          window.addEventListener('mouseup',up);window.addEventListener('touchend',up);
        })();
        <\/script>
      </div>`
  }

  // ---------------------------------------------------------- Fallback
  function fallback(slug, s) {
    return `
      <div class="mp" style="padding:32px;display:flex;flex-direction:column;gap:14px;">
        <div class="mp-kicker">${esc(slug || 'template')}</div>
        <h1 style="font-size:32px;line-height:1;">${emify(s.titulo || 'Preview')}</h1>
        ${s.lede ? `<p style="font-size:15px;line-height:1.6;color:var(--mp-ink-soft)">${esc(s.lede)}</p>` : ''}
        ${s.corpo ? `<p style="font-size:13px;line-height:1.7;">${esc(s.corpo)}</p>` : ''}
      </div>`
  }

  // ---------------------------------------------------------- Public API
  function render(slug, slots) {
    const fn = R[slug]
    const s = slots || {}
    if (typeof fn !== 'function') return fallback(slug, s)
    try { return fn(s) } catch (e) { console.error('Render error', slug, e); return fallback(slug, s) }
  }

  function listSlugs() { return Object.keys(R) }

  window.MagazineRenderer = { render, listSlugs, normalizeUrl }
})()
