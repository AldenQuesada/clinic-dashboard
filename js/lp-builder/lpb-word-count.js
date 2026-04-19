/**
 * LP Builder · Word Count + Reading Time
 *
 * Modal: estatisticas globais da pagina + breakdown por bloco.
 * Total: palavras, caracteres, frases, paragrafos.
 * Tempo de leitura (200 wpm padrao).
 *
 * window.LPBWordCount.open()
 */
;(function () {
  'use strict'
  if (window.LPBWordCount) return

  var WPM = 200  // velocidade media de leitura

  function _ico(n, sz) { return (window.LPBIcon && window.LPBIcon(n, sz)) || '' }
  function _esc(s) { var d = document.createElement('div'); d.textContent = s == null ? '' : s; return d.innerHTML }

  function _stripMd(s) {
    return String(s || '')
      .replace(/\*([^*]+)\*/g, '$1')
      .replace(/_([^_]+)_/g, '$1')
  }

  function _stats(text) {
    var clean = _stripMd(text || '').trim()
    if (!clean) return { chars: 0, words: 0, sentences: 0, paragraphs: 0 }
    var words = clean.split(/\s+/).filter(Boolean)
    var sentences = clean.split(/[.!?]+/).filter(function (s) { return s.trim().length > 0 })
    var paragraphs = clean.split(/\n{2,}/).filter(function (p) { return p.trim().length > 0 })
    return {
      chars: clean.length,
      words: words.length,
      sentences: sentences.length || (words.length > 0 ? 1 : 0),
      paragraphs: paragraphs.length || 1,
    }
  }

  function _walkText(value, out) {
    if (typeof value === 'string') {
      out.text += (out.text ? '\n\n' : '') + value
    } else if (Array.isArray(value)) {
      value.forEach(function (v) { _walkText(v, out) })
    } else if (value && typeof value === 'object') {
      Object.keys(value).forEach(function (k) {
        if (k === 'icon_svg' || k === 'foto' || k === 'visual_image' ||
            k === 'og_image_url' || k === 'foto_initial' ||
            k === 'visual_placeholder' || k === 'cta_enabled' ||
            k === 'bg' || k === 'bg_section' || k === 'url') return
        _walkText(value[k], out)
      })
    }
  }

  function _blockText(block) {
    var acc = { text: '' }
    _walkText(block.props, acc)
    return acc.text
  }

  function _readingTime(words) {
    var min = words / WPM
    if (min < 0.5) return '<30s'
    if (min < 1) return Math.round(min * 60) + 's'
    return Math.round(min) + ' min'
  }

  // ────────────────────────────────────────────────────────────
  // Modal
  // ────────────────────────────────────────────────────────────
  function open() {
    var modalRoot = document.getElementById('lpbModalRoot')
    if (!modalRoot) return
    var page = LPBuilder.getCurrentPage()
    if (!page) return

    var blockStats = []
    var totalText = ''
    ;(page.blocks || []).forEach(function (b, i) {
      var t = _blockText(b)
      totalText += '\n\n' + t
      var schema = window.LPBSchema
      var meta = schema ? schema.getBlockMeta(b.type) : null
      blockStats.push({
        idx: i, type: b.type,
        name: meta ? meta.name : b.type,
        s: _stats(t),
      })
    })
    var total = _stats(totalText)
    var readTime = _readingTime(total.words)

    var heroBig = ''  // longest sentence flag
    var allSentences = _stripMd(totalText).split(/[.!?]+/).map(function (s) { return s.trim() }).filter(Boolean)
    var longSentences = allSentences.filter(function (s) { return s.split(/\s+/).length > 30 })

    modalRoot.innerHTML = '' +
      '<div class="lpb-modal-bg" id="lpbWcBg">' +
        '<div class="lpb-modal" onclick="event.stopPropagation()" style="max-width:560px;max-height:88vh;display:flex;flex-direction:column">' +
          '<div class="lpb-modal-h">' +
            '<h3>Contagem · Leitura</h3>' +
            '<button class="lpb-btn-icon" id="lpbWcClose">' + _ico('x', 16) + '</button>' +
          '</div>' +
          // Stats principais
          '<div style="padding:24px 20px;background:var(--lpb-bg);border-bottom:1px solid var(--lpb-border);display:grid;grid-template-columns:1fr 1fr;gap:18px">' +
            _bigStat(total.words,      'palavras',   'var(--lpb-accent)') +
            _bigStat(readTime,          'leitura',    'var(--lpb-success)') +
            _bigStat(total.chars,       'caracteres', 'var(--lpb-text)') +
            _bigStat(total.sentences,   'frases',     'var(--lpb-text)') +
          '</div>' +
          // Avisos
          (longSentences.length
            ? '<div style="background:rgba(251,191,36,.08);border-left:3px solid var(--lpb-warn);padding:10px 14px;margin:10px 14px;font-size:11px;color:var(--lpb-warn)">' +
                _ico('alert-triangle', 12) + ' ' + longSentences.length + ' frase(s) com mais de 30 palavras — considere quebrar para leitura mais leve.' +
              '</div>'
            : '') +
          // Breakdown
          '<div style="padding:14px 20px;font-size:10px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3);border-bottom:1px solid var(--lpb-border)">' +
            'Por bloco' +
          '</div>' +
          '<div class="lpb-modal-body" style="flex:1;overflow:auto;padding:0">' +
            (blockStats.length
              ? blockStats.map(function (b) {
                  return '<div style="padding:12px 20px;border-bottom:1px solid var(--lpb-border);display:flex;align-items:center;justify-content:space-between;cursor:pointer" data-jump-idx="' + b.idx + '">' +
                    '<div>' +
                      '<div style="font-size:12px;color:var(--lpb-text)">' + _esc(b.name) + '</div>' +
                      '<small style="font-size:9px;letter-spacing:.15em;text-transform:uppercase;color:var(--lpb-text-3)">#' + b.idx + ' · ' + _esc(b.type) + '</small>' +
                    '</div>' +
                    '<div style="display:flex;gap:14px;font-size:11px;color:var(--lpb-text-2);font-family:monospace">' +
                      '<span>' + b.s.words + ' p</span>' +
                      '<span>' + b.s.chars + ' c</span>' +
                      '<span>' + b.s.sentences + ' fr</span>' +
                    '</div>' +
                  '</div>'
                }).join('')
              : '<div style="padding:30px;text-align:center;color:var(--lpb-text-3);font-style:italic">Sem blocos.</div>'
            ) +
          '</div>' +
        '</div>' +
      '</div>'

    var bg    = document.getElementById('lpbWcBg')
    var close = document.getElementById('lpbWcClose')
    function dismiss() { modalRoot.innerHTML = '' }
    bg.addEventListener('click', dismiss)
    close.onclick = dismiss

    document.querySelectorAll('[data-jump-idx]').forEach(function (el) {
      el.onclick = function () {
        var idx = parseInt(el.dataset.jumpIdx, 10)
        LPBuilder.selectBlock(idx)
        dismiss()
      }
    })
  }

  function _bigStat(value, label, color) {
    return '<div style="text-align:center">' +
      '<div style="font-family:Cormorant Garamond,serif;font-size:36px;font-weight:300;font-style:italic;color:' + color + ';line-height:1">' +
        _esc(String(value)) +
      '</div>' +
      '<div style="font-size:9px;letter-spacing:.2em;text-transform:uppercase;color:var(--lpb-text-3);margin-top:6px">' +
        _esc(label) +
      '</div>' +
    '</div>'
  }

  window.LPBWordCount = { open: open }
})()
