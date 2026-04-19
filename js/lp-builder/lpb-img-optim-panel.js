/**
 * LP Builder · Image Optimization Panel (Onda 26)
 *
 * Modal admin: lista todas as imagens da LP atual com tamanho real (HEAD)
 * e veredito (great/ok/large/huge). Sugere conversão WebP/AVIF e
 * redimensionamento via Supabase Storage transform.
 *
 * API: LPBImgOptimPanel.open()
 */
;(function () {
  'use strict'
  if (window.LPBImgOptimPanel) return

  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }
  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }

  function _fmtBytes(n) {
    if (n == null) return '—'
    if (n < 1024) return n + ' B'
    if (n < 1024 * 1024) return (n / 1024).toFixed(0) + ' KB'
    return (n / 1024 / 1024).toFixed(2) + ' MB'
  }

  var VERDICT_STYLE = {
    great: { color: 'var(--lpb-success)', label: 'ótima' },
    ok:    { color: 'var(--lpb-text-2)',  label: 'ok' },
    large: { color: 'var(--lpb-warn)',    label: 'pesada' },
    huge:  { color: 'var(--lpb-danger)',  label: 'muito pesada' },
    unknown:{ color: 'var(--lpb-text-2)', label: '—' },
  }

  async function open() {
    if (!window.LPBuilder)         return
    if (!window.LPBImgOptimEngine) { LPBToast && LPBToast('Engine não carregada', 'error'); return }

    var page = LPBuilder.getCurrentPage()
    if (!page) { LPBToast && LPBToast('Abra uma página primeiro', 'error'); return }

    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return

    var imgs = LPBImgOptimEngine.extractImagesFromBlocks(page.blocks || [])
    // dedupe por URL
    var seen = {}
    var unique = []
    imgs.forEach(function (i) { if (!seen[i.url]) { seen[i.url] = true; unique.push(i) } })

    _renderShell(modalRoot, unique)
    _measureAll(unique)
  }

  function _renderShell(modalRoot, imgs) {
    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbIoBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:880px;width:96vw;max-height:92vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Imagens · auditoria de peso</h3>' +
            '<button class="lpb-btn-icon" id="lpbIoClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          '<div class="lpb-modal-body" style="padding:0;overflow:auto;flex:1">' +
            (imgs.length
              ? '<table id="lpbIoTbl" style="width:100%;border-collapse:collapse;font-size:11px">' +
                  '<thead><tr style="background:var(--lpb-bg);text-align:left">' +
                    _th('Preview') + _th('Bloco') + _th('Formato') + _th('Peso') + _th('Veredito') +
                  '</tr></thead><tbody>' +
                  imgs.map(_renderRowSkeleton).join('') +
                '</tbody></table>'
              : '<div style="padding:32px;text-align:center;color:var(--lpb-text-2);font-size:12px">' +
                  _ico('image', 22) + '<div style="margin-top:10px">Nenhuma imagem nesta LP.</div></div>') +
          '</div>' +
          '<div class="lpb-modal-footer">' +
            '<div id="lpbIoSummary" style="font-size:10px;color:var(--lpb-text-2);line-height:1.4">Pesando imagens…</div>' +
            '<div style="flex:1"></div>' +
            '<button class="lpb-btn ghost" id="lpbIoDone">Fechar</button>' +
          '</div>' +
        '</div></div>'
    document.getElementById('lpbIoBg').addEventListener('click', _dismiss)
    document.getElementById('lpbIoClose').onclick = _dismiss
    document.getElementById('lpbIoDone').onclick  = _dismiss
  }

  function _th(t) {
    return '<th style="padding:10px 14px;border-bottom:1px solid var(--lpb-border);font-size:9px;letter-spacing:.12em;text-transform:uppercase;color:var(--lpb-text-2);font-weight:500">' + _esc(t) + '</th>'
  }

  function _renderRowSkeleton(i) {
    var ext = LPBImgOptimEngine.classifyByExt(i.url)
    var formatBadge = '<span style="font-size:9px;letter-spacing:.06em;text-transform:uppercase;background:var(--lpb-bg);border:1px solid var(--lpb-border);color:' +
      (LPBImgOptimEngine.isOptimizedFormat(i.url) ? 'var(--lpb-success)' : 'var(--lpb-warn)') + ';padding:2px 6px">' + _esc(ext) + '</span>'
    var safe = _esc(i.url)
    return '<tr data-img-row="' + safe + '">' +
      '<td style="padding:8px 14px;border-bottom:1px solid var(--lpb-border)">' +
        '<img src="' + safe + '" loading="lazy" decoding="async" style="width:54px;height:40px;object-fit:cover;border:1px solid var(--lpb-border);background:var(--lpb-bg)">' +
      '</td>' +
      '<td style="padding:8px 14px;border-bottom:1px solid var(--lpb-border)">' +
        '<div style="font-size:11px;color:var(--lpb-text)">#' + i.blockIdx + ' · ' + _esc(i.blockType) + '</div>' +
        '<div style="font-size:9px;color:var(--lpb-text-2);margin-top:2px">' + _esc(i.fieldKey) + '</div>' +
      '</td>' +
      '<td style="padding:8px 14px;border-bottom:1px solid var(--lpb-border)">' + formatBadge + '</td>' +
      '<td style="padding:8px 14px;border-bottom:1px solid var(--lpb-border)" data-cell="size"><small style="color:var(--lpb-text-2)">…</small></td>' +
      '<td style="padding:8px 14px;border-bottom:1px solid var(--lpb-border)" data-cell="verdict"><small style="color:var(--lpb-text-2)">…</small></td>' +
    '</tr>'
  }

  async function _measureAll(imgs) {
    var sizes = []
    var totalBytes = 0
    var concurrency = 4
    var queue = imgs.slice()

    async function worker() {
      while (queue.length) {
        var i = queue.shift()
        var bytes = await _measure(i.url)
        if (bytes != null) totalBytes += bytes
        sizes.push({ img: i, bytes: bytes })
        _updateRow(i.url, bytes)
      }
    }
    var workers = []
    for (var w = 0; w < concurrency; w++) workers.push(worker())
    await Promise.all(workers)
    _renderSummary(sizes, totalBytes)
  }

  function _measure(url) {
    return new Promise(function (resolve) {
      try {
        var ctrl = new AbortController()
        var t = setTimeout(function () { ctrl.abort(); resolve(null) }, 5000)
        fetch(url, { method: 'HEAD', signal: ctrl.signal })
          .then(function (r) {
            clearTimeout(t)
            var len = r.headers.get('content-length')
            resolve(len ? parseInt(len, 10) : null)
          })
          .catch(function () { resolve(null) })
      } catch (_) { resolve(null) }
    })
  }

  function _updateRow(url, bytes) {
    var safe = _esc(url)
    var row = document.querySelector('[data-img-row="' + safe.replace(/"/g, '\\"') + '"]')
    if (!row) return
    var verdict = LPBImgOptimEngine.sizeVerdict(bytes)
    var st = VERDICT_STYLE[verdict] || VERDICT_STYLE.unknown
    row.querySelector('[data-cell="size"]').innerHTML = '<span style="font-size:11px;color:var(--lpb-text)">' + _fmtBytes(bytes) + '</span>'
    row.querySelector('[data-cell="verdict"]').innerHTML = '<span style="font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:' + st.color + ';font-weight:500">● ' + st.label + '</span>'
  }

  function _renderSummary(sizes, totalBytes) {
    var huge = sizes.filter(function (s) { return s.bytes && s.bytes > 500 * 1024 }).length
    var large = sizes.filter(function (s) { return s.bytes && s.bytes > 200 * 1024 && s.bytes <= 500 * 1024 }).length
    var unopt = sizes.filter(function (s) { return s.img && !LPBImgOptimEngine.isOptimizedFormat(s.img.url) }).length
    var sum = document.getElementById('lpbIoSummary')
    if (!sum) return
    sum.innerHTML = '' +
      _ico('hard-drive', 11) + ' ' + sizes.length + ' imagens · ' + _fmtBytes(totalBytes) + ' total · ' +
      '<strong style="color:var(--lpb-danger)">' + huge + '</strong> muito pesadas, ' +
      '<strong style="color:var(--lpb-warn)">' + large + '</strong> pesadas, ' +
      '<strong style="color:var(--lpb-warn)">' + unopt + '</strong> sem WebP/AVIF/SVG.'
  }

  function _dismiss() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (modalRoot) modalRoot.innerHTML = ''
  }

  window.LPBImgOptimPanel = Object.freeze({ open: open })
})()
